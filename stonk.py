import requests # step 1
API_KEY = {'X-API-key': '083N5TRV'} # step 2

def main():
    with requests.Session() as s:

        s.headers.update(API_KEY) # step 4
        resp = s.get('http://localhost:9999/v1/case') # step 5
        if resp.ok: # step 6
            case = resp.json() # step 7
            tick = case['tick'] # accessing the 'tick' value that was returned
            print('The case is on tick', tick) # step 8
        s.headers.update(API_KEY)
        mkt_buy_params = {'ticker': 'TAME', 'type': 'MARKET', 'quantity': 1000, 'action': 'BUY'}
        resp = s.post('http://localhost:9999/v1/orders', params=mkt_buy_params)
        print(resp.json())
        if resp.ok:
            mkt_order = resp.json()
            id = mkt_order['order_id']
            print('The market buy order was submitted and has ID', id)
        else:
            print('The order was not successfully submitted!')

if __name__ == '__main__':
    main()