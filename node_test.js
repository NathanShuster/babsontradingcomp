const request = require('request');
const chalk = require('chalk');
const async = require('async');
const axios = require('axios');
const _ = require('underscore');

const API_KEY = 'GWCM1YXH';

start_time = new Date();
let prev_tick = 0;
let shutdown = false;

let trader_id = null;
const url = `http://localhost:9999/v1/trader`;
request.get({
  url: url,
  headers: {'X-API-key': API_KEY},
}, function(error, response, body) {
  if (error) {
    console.log(error);
  }
  else if (response.statusCode == 200) {
    trader_id = JSON.parse(body).trader_id;
    console.log(chalk.green("Your trade ID is:", trader_id));
    //console.log("Successfully deleted BUY order:", order_to_cancel.order_id);
  }
  else {
    console.log(chalk.red("Failed to get trader ID."));
  }
});



console.log(chalk.green("Starting simulation..."));

process.on( 'SIGINT', function() {
  console.log(chalk.red("SIGINT signal -- shutdding down!"));
  shutdown = true;
  clearInterval(queries);
  clearInterval(orders);
});


function cancelOrder(order_to_cancel) {
  const url = `http://localhost:9999/v1/orders/${order_to_cancel.order_id}`;
  request.delete({
    url: url,
    headers: {'X-API-key': API_KEY},
  }, function(error, response, body) {
    if (error) {
      console.log(error);
    }
    else if (response.statusCode == 200) {
      //console.log("Successfully deleted BUY order:", order_to_cancel.order_id);
    }
    else {
      //console.log(chalk.yellow("Error cancelling order (" + order_to_cancel.action + "):", response.statusCode));
    }
  });
}

function cancelOpenBuyOrdersTooHigh(open_buy_orders, new_bid_max) {
  const open_buy_orders_to_cancel = open_buy_orders.filter(function(open_buy_order) {
    return open_buy_order.price > new_bid_max || open_buy_order.price < new_bid_max - 0.15;
  });

  open_buy_orders_to_cancel.forEach((order_to_cancel) => {
    cancelOrder(order_to_cancel);
  })
}


function cancelBulkBuyOrders(open_buy_orders, current_position) {
  open_buy_orders.sort((a, b) => {
    return a.price - b.price;
  });

  sum = 0;
  open_buy_orders.forEach((order) => {
    //if ()
    sum += order.quantity;
    //console.log(25000 - current_position);
    //console.log(chalk.cyan("Cumulative sum:", sum));
    if (sum > 13000 - current_position) {
      cancelOrder(order);
    }
  });
}

/*
function cancelBulkBuyOrdersSmartly(bids, current_position) {
  const filtered_bids = bids.filter((bid) => {
    return bid.trader_id === 'ANON' || bid.trader_id === trader_id;
  });

  // this gives us descending order
  filtered_bids.sort((a, b) => {
    return a.price - b.price;
  });


  for (i = filtered_bids.length - 1; i > 0; i--) {
    //console.log(filtered_bids[i]);
    if (filtered_bids[i].trader_id !== trader_id || filtered_bids[i].deleted) {
      continue;
    }
    const max_price = filtered_bids[i].price;
    //console.log("max price: ", max_price);
    for (j = i - 1; j >= 0; j--) {
      if (filtered_bids[j].trader_id !== trader_id) {
        j = 0;
        continue;
      }

      const prev_price = filtered_bids[j].price;
      //console.log('prev price:', prev_price);
      if (prev_price < max_price) {
        filtered_bids[j]['deleted'] = true;
        //console.log("Deleting: ", filtered_bids[j]);
        //console.log(filtered_bids[j]);
        cancelOrder(filtered_bids[j]);
      }
    }
  }

  //console.log(filtered_bids);

  const remaining_bids = filtered_bids.filter((bid) => {
    return bid.deleted ? false : true;
  });

  //console.log(remaining_bids);

  let sum = 0;
  remaining_bids.forEach((order) => {
    sum += order.quantity;
    if (sum > 20000 - current_position) {
      cancelOrder(order);
    }
  });
}*/

function cancelBulkSellOrders(open_sell_orders, current_position) {
  open_sell_orders.sort((a, b) => {
    return a.price - b.price;
  });

  sum = 0;

  open_sell_orders.forEach((order) => {
    sum += order.quantity;
    //console.log(10000 - current_position);
    if (sum > 13000 - current_position) {
      cancelOrder(order);
    }
  });
}

function cancelOpenSellOrdersTooLow(open_sell_orders, new_ask_min) {
  const open_sell_orders_to_cancel = open_sell_orders.filter(function(open_sell_order) {
    return open_sell_order.price < new_ask_min || open_sell_order.price > new_ask_min + 0.15;
  });

  open_sell_orders_to_cancel.forEach((order_to_cancel) => {
    cancelOrder(order_to_cancel);
  })
}


function getBidAskOrderQuantity(current_position) {
  // 10000 / (1+e^(-0.0002x)) from [-25000 to 25000]
  const ask_quantity = Math.round(15000 / (1 + Math.exp(-0.0002 * current_position)));
  const bid_quantity = Math.round(15000 - ask_quantity);
  return {
    max_bid_quantity: bid_quantity,
    max_ask_quantity: ask_quantity,
  }
}

function placeOrders(current_position, pending_bid_quantity, pending_ask_quantity, bids_max_price, asks_min_price) {
  if (asks_min_price - bids_max_price > 0.04) {
    //console.log(chalk.cyan("Placing order!"));
    const type = 'LIMIT';
    const { max_bid_quantity, max_ask_quantity } = getBidAskOrderQuantity(current_position);
    const bid_quantity = (max_bid_quantity - pending_bid_quantity) / 15;
    const ask_quantity = (max_ask_quantity - pending_ask_quantity) / 15;

    const bid_price = bids_max_price + 0.01;
    const ask_price = asks_min_price - 0.01;

    const bid_url = `http://localhost:9999/v1/orders?ticker=ALGO&type=${type}&quantity=${bid_quantity}&action=BUY&price=${bid_price}`;
    const ask_url = `http://localhost:9999/v1/orders?ticker=ALGO&type=${type}&quantity=${ask_quantity}&action=SELL&price=${ask_price}`;

    request.post({
      url: bid_url,
      headers: {'X-API-key': API_KEY},
    }, function(error, response, body) {
      if (error) {
        console.log(error);
      }
      else if (response.statusCode == 200) {
        //console.log("Successfully placed BID order!");
      }
      else {
        console.log("Error placing BID order:", response.statusCode);
      }
    });

    request.post({
      url: ask_url,
      headers: {'X-API-key': API_KEY},
    }, function(error, response, body) {
      if (error) {
        console.log(error);
      }
      else if (response.statusCode == 200) {
        //console.log("Successfully placed ASK order!");
      }
      else {
        console.log("Error placing ASK order:", response.statusCode);
      }
    });
  }
}

function processBidAsk(asks_bids) {
  const bids = asks_bids.bids;
  const asks = asks_bids.asks;

  const filtered_bids = bids.filter(function(bid) {
    return bid.trader_id === 'ANON';
  });

  const filtered_asks = asks.filter(function(ask) {
    return ask.trader_id === 'ANON';
  });

  return {
    bids: filtered_bids,
    asks: filtered_asks,
  }
}

function processOpenOrders(open_orders) {
  const open_bids = open_orders.filter(function(open_order) {
    return open_order.action === 'BUY';
  });

  const open_asks = open_orders.filter(function(open_order) {
    return open_order.action === 'SELL';
  });


  return {
    open_bids: open_bids,
    open_asks: open_asks,
  }
}

function getOpenOrderQuantity(open_orders) {
  if (!open_orders || open_orders.length == 0) {
    return 0;
  }
  const quantity = open_orders.reduce((accumulator, order) => {
    return accumulator + order.quantity;
  }, 0);
  return quantity;
}

function getBidsMaxPrice(bids) {
  const bid_prices = bids.map((bid) => {
    return bid.price;
  });
  return Math.max(...bid_prices);
}

function getAsksMinPrice(asks) {
  const ask_prices = asks.map((ask) => {
    return ask.price;
  });
  return Math.min(...ask_prices);
}


function getANONAverage(orders) {
  if (!orders || orders.length == 0) {
    return 0;
  }
  const total_cost = orders.reduce((accumulator, order) => {
    return accumulator + (order.price * order.quantity);
  }, 0);
  const total_quantity = orders.reduce((accumulator, order) => {
    return accumulator + order.quantity;
  }, 0);
  return total_cost / total_quantity;
}

let prev_avg_ANON_bid = 0;
let prev_avg_ANON_ask = 0;

let bids_max_price = 0;
let asks_min_price = 0;
let current_position = 0;
let pending_bid_quantity = 0;
let pending_ask_quantity = 0;

let actions_per_tick = 0;
let counter = 0;
let previous_tick = 0;

queries = setInterval(function() {
  const display = counter % 100 == 0;
  async.parallel([
    function (callback) {
      const url = "http://localhost:9999/v1/case";
      request.get({
        url: url,
        headers: {'X-API-key': API_KEY},
      }, function(error, response, body) {
        if (error) {
          callback(error);
        }
        else if (response.statusCode != 200) {
          callback(response.statusCode);
        }
        else {
          callback(null, JSON.parse(body));
        }
      });
    },
    function (callback) {
      const url = "http://localhost:9999/v1/limits";
      request.get({
        url: url,
        headers: {'X-API-key': API_KEY},
      }, function(error, response, body) {
        if (error) {
          callback(error);
        }
        else if (response.statusCode != 200) {
          callback(response.statusCode);
        }
        else {
          callback(null, JSON.parse(body));
        }
      });
    },
    function (callback) {
      const limit = 100;
      const url = "http://localhost:9999/v1/securities/book?ticker=ALGO&limit=" + limit;
      request.get({
        url: url,
        headers: {'X-API-key': API_KEY},
      }, function(error, response, body) {
        if (error) {
          callback(error);
        }
        else if (response.statusCode != 200) {
          callback(response.statusCode);
        }
        else {
          callback(null, JSON.parse(body));
        }
      });
    },
    function (callback) {
      const url = "http://localhost:9999/v1/orders";
      request.get({
        url: url,
        headers: {'X-API-key': API_KEY},
      }, function(error, response, body) {
        if (error) {
          callback(error);
        }
        else if (response.statusCode != 200) {
          callback(response.statusCode);
        }
        else {
          callback(null, JSON.parse(body));
        }
      });
    },
  ], function(error, results) {
    if (error) {
      if (display) {
        console.log("Error: ", error);
      }
    }
    else {
      const info = results[0];
      const limits = results[1][0];
      const asks_bids = results[2];
      const open_orders = results[3];

      const { bids, asks } = processBidAsk(asks_bids);
      const { open_bids, open_asks } = processOpenOrders(open_orders);

      bids_max_price = getBidsMaxPrice(bids);
      asks_min_price = getAsksMinPrice(asks);
      const avg_ANON_bid = getANONAverage(bids);
      const avg_ANON_ask = getANONAverage(asks);

      current_position = limits.net;

      // Cancel orders that are now too good due to a shift in the market
      if (avg_ANON_bid < prev_avg_ANON_bid) {
        //console.log(chalk.cyan("Cancel Asks that are too low."));
        cancelOpenBuyOrdersTooHigh(open_bids, bids_max_price + 0.01);
      }

      if (avg_ANON_ask > prev_avg_ANON_ask) {
        cancelOpenSellOrdersTooLow(open_asks, asks_min_price - 0.01);
        //console.log(chalk.cyan("Cancel Bids that are too high."));
      }
      cancelBulkBuyOrders(open_bids, current_position);
      cancelBulkSellOrders(open_asks, current_position);

      prev_avg_ANON_bid = avg_ANON_bid;
      prev_avg_ANON_ask = avg_ANON_ask;
      // ---------------------------------------------------------------

      // Place new orders

      pending_bid_quantity = getOpenOrderQuantity(open_bids); // TODO
      pending_ask_quantity = getOpenOrderQuantity(open_asks); // TODO


      if (display) {
        console.log("[" + bids_max_price, ",", asks_min_price + "]");
        console.log("ANON bid / ask average:", avg_ANON_bid, " / ", avg_ANON_ask);
        console.log(info.tick);
      }

      if (info.tick != previous_tick) {
        console.log(chalk.magenta(actions_per_tick, "actions per tick."));
        previous_tick = info.tick;
        actions_per_tick = 0;
      }
      actions_per_tick += 1;
      counter += 1;
    }
  });
}, 8);

orders = setInterval(function() {
  placeOrders(current_position, pending_bid_quantity, pending_ask_quantity, bids_max_price, asks_min_price);
}, 75);
