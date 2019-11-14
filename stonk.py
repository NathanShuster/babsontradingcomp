import signal
import requests
from time import sleep
import sys

# for printing error messages and stopping program
class ApiException(Exception):
    pass

# kill program if CTRL+C is pressed
def signal_handler(signum, frame):
    global shutdown
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    shutdown = True


API_KEY = {'X-API-key': '083N5TRV'} 
shutdown = False

#SETTINGS

# how long to wait after submitting orders
SPEEDBUMP = 0.5
# max shares to purchase with each order
MAX_VOLUME = 5000
# max orders we can submit
MAX_ORDERS = 5
# allowed spread before we sell or buy shares
SPREAD = .04
# allowed exposure
MAX_EXPOSURE = 25000

def get_tick(session):
    resp = session.get('http://localhost:9999/v1/case')
    if resp.ok:
        case = resp.json()
        return case['tick']
    raise ApiException('AuthorizationError. Please check API key')

def ticker_bid_ask(session, ticker):
    payload = {'ticker': ticker}
    resp = session.get('http://localhost:9999/v1/securities/book', params=payload)
    if resp.ok:
        book = resp.json()
        return book['bids'][0]['price'], book['asks'][0]['price']
    raise ApiException('Authorization error. Please check API key')

def open_sells(session):
    resp = session.get('http://localhost:9999/v1/orders?status=OPEN')
    if resp.ok:
        open_sells_volume = 0
        ids = []
        prices = []
        order_volumes = []
        volume_filled = []

        open_orders = resp.json()

        for order in open_orders:
            if order['action'] == 'SELL':
                volume_filled.append(order['quantity_filled'])
                order_volumes.append(order['quantity'])
                open_sells_volume = open_sells_volume + order['quantity']
                prices.append(order['price'])
                ids.append(order['order_id'])
    return volume_filled, open_sells_volume, ids, prices, order_volumes

def open_buys(session):
    resp = session.get('http://localhost:9999/v1/orders?status=OPEN')
    if resp.ok:
        open_buys_volume = 0
        ids = []
        prices = []
        order_volumes = []
        volume_filled = []

        open_orders = resp.json()

        for order in open_orders:
            if order['action'] == 'BUY':
                volume_filled.append(order['quantity_filled'])
                order_volumes.append(order['quantity'])
                open_buys_volume = open_buys_volume + order['quantity']
                prices.append(order['price'])
                ids.append(order['order_id'])
    return volume_filled, open_buys_volume, ids, prices, order_volumes


def buy_sell(session, sell_price, buy_price, net_exposure):
    available_buy_exposure = MAX_EXPOSURE - net_exposure
    available_sell_exposure = MAX_EXPOSURE + net_exposure

    for i in range(MAX_ORDERS):
        if net_exposure < 25000:
            buy_order_size = min(MAX_VOLUME, available_buy_exposure)

            session.post('http://localhost:9999/v1/orders', params = {'ticker' : 'ALGO', 
        'type' : 'LIMIT', 'quantity' : buy_order_size, 'price' : buy_price, 'action' : 'BUY'})
            available_buy_exposure = max(available_buy_exposure - buy_order_size, 0) 
    
        if net_exposure > -25000:
            sell_order_size = min(MAX_VOLUME, available_sell_exposure)
            session.post('http://localhost:9999/v1/orders', params = {'ticker' : 'ALGO', 
            'type' : 'LIMIT', 'quantity' : MAX_VOLUME, 'price' : sell_price, 'action' : 'SELL'})
            available_sell_exposure = max(available_sell_exposure - sell_order_size, 0)

def re_order(session, number_of_orders, ids, volumes_filled, volumes, price, action):
    for i in range(number_of_orders):
        id = ids[i]
        volume = volumes[i]
        volume_filled = volumes_filled[i]

        #if the order is partially filled
        if (volume_filled != 0):
            volume = MAX_VOLUME - volume_filled
        
        deleted = session.delete('http://localhost:9999/v1/orders/{}'.format(id))
        if (deleted.ok):
            session.post('http://localhost:9999/v1/orders', params = {'ticker' : 'ALGO', 
            'type' : 'LIMIT', 'quantity' : volumes, 'price' : price, 'action' : action})

def get_net_exposure(session):
    ticker_info = session.get('http://localhost:9999/v1/securities', params = {'ticker' : 'ALGO'})

    if (ticker_info.ok):
        #print(ticker_info.json())
        
        net_exposure = ticker_info.json()[0]['position']
        
        return net_exposure

def main():
    # instantiate variables about all open buy orders
    buy_ids = []                    # order ids
    buy_prices = []                 # order prices
    buy_volumes = []                # order volumes
    volume_filled_buys = []         # amount of volume filled for each order
    open_buys_volume = 0            # combined volume from all open buy orders

    # instantiate variables about all open sell orders
    sell_ids = []
    sell_prices = []
    sell_volumes = []
    volume_filled_sells = []
    open_sells_volume = 0

    # instantiated varables when just one side of the book has been completely filled
    single_side_filled = False
    single_side_transaction_time = 0

    with requests.Session() as s:
        s.headers.update(API_KEY)
        tick = get_tick(s)


        # while time is between 5 and 295, execute strategy
        while tick > 5 and tick < 295 and not shutdown:
            # update case info


            volume_filled_sells, open_sells_volume, sell_ids, sell_prices, sell_volumes = open_sells(s)
            volume_filled_buys, open_buys_volume, buy_ids, buy_prices, buy_volumes = open_buys(s)
            bid_price, ask_price = ticker_bid_ask(s, 'ALGO')

            net_exposure = get_net_exposure(s)
            print(net_exposure)


            #check if you have 0 open orders
            if (open_sells_volume == 0 and open_buys_volume == 0):
                #both sides filled now
                single_side_filled = False


                bid_ask_spread = ask_price - bid_price

                sell_price = ask_price
                buy_price = bid_price

                # check if spread >= to our set spread
                if (bid_ask_spread >= SPREAD):
                    # buy and sell max shares
                    buy_sell(s, sell_price, buy_price, net_exposure)
                    sleep(SPEEDBUMP)
            
            #there are outstanding open orders
            else:
                # one side of book has no open orders
                if (not single_side_filled and (open_buys_volume == 0 or open_sells_volume == 0)):
                    single_side_filled = True
                    single_side_transaction_time = tick

                # ask side completely filled
                if (open_sells_volume == 0):
                    # current buy orders are at the top of the book
                    if (buy_price == bid_price):
                        continue
                        
                    elif (tick - single_side_transaction_time >= 3):
                        # calculate potential profits you can make
                        next_buy_price = bid_price + .01
                        potential_profit = sell_price - next_buy_price - .01

                        if (potential_profit >= .01 or tick - single_side_transaction_time >= 6):
                            action = 'BUY'
                            number_of_orders = len(buy_ids)
                            buy_price = bid_price + .01
                            price = buy_price
                            ids = buy_ids
                            volumes = buy_volumes
                            volumes_filled = volume_filled_buys

                            # delete buys and rebuy
                            re_order(s, number_of_orders, ids, volumes_filled, volumes, price, action)
                            sleep(SPEEDBUMP)

                elif (open_buys_volume == 0):
                    # current sell orders at the top of the book
                    if (sell_price == ask_price):
                        continue


                    # its been more than 3 seconds since a single side has been completely filled
                    elif (tick - single_side_transaction_time >= 3):
                        #calculate potential profit
                        next_sell_price = ask_price - .01
                        potential_profit = next_sell_price - buy_price - .01

                        if (potential_profit >= .01 or tick - single_side_transaction_time >= 6):
                            action = 'SELL'
                            number_of_orders = len(sell_ids)
                            sell_price = ask_price - .01
                            price = sell_price
                            ids = sell_ids
                            volumes = sell_volumes
                            volumes_filled = volume_filled_sells

                            # delete sells then re-sell
                            re_order(s, number_of_orders, ids, volumes_filled, volumes, price, action)
                            sleep(SPEEDBUMP)
                
            tick = get_tick(s)




if __name__ == '__main__':
    signal.signal(signal.SIGINT, signal_handler)
    main()