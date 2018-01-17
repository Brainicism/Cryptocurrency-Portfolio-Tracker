var request = require('request');
var coin_prices = [];
var lastCoinMarketCapUpdate;
var fs = require("fs");
var moment = require("moment");
var schedule = require('node-schedule');
var redis = require("redis");
var redisClient = redis.createClient();
const sqlite3 = require('sqlite3').verbose();
var firstRun = true;

redisClient.on('error', function (err) {
    console.log("Error " + err);
});
let db = new sqlite3.Database('./db/main.db', (err) => {
    if (err) {
        console.error(err);
    }
    // db.run('CREATE TABLE prices(account_id text, date integer, price_data text)');
    // db.run('CREATE TABLE crypto_balances(account_id text, balance text, CONSTRAINT unique_id UNIQUE(account_id))');
    //  db.run('CREATE TABLE original_balance(account_id text, balance real, CONSTRAINT unique_id UNIQUE(account_id))');
    console.log('Connected to the sick database.');
});

function update(accountId) {
    return new Promise((resolve, reject) => {

        Promise.all([getCoinPrices(), getUserBalances(accountId), getHistoricalData(accountId)])
            .then((results) => {
                var historicalPriceData = results[2].priceData;
                var pastDayPrices;
                var originalBalance = results[1][0];
                var cryptoBalances = results[1][1];
                if (historicalPriceData.length > 288) {
                    pastDayPrices = historicalPriceData[288];
                }
                else if (historicalPriceData.length > 0) {
                    pastDayPrices = historicalPriceData[historicalPriceData.length - 1];
                }
                else {
                    pastDayPrices = null;
                }
                if (originalBalance == null || cryptoBalances == null) {
                    return reject("Values not set");
                }
                var output = [];
                var total = 0;

                for (var symbol in coin_prices) {
                    if (coin_prices.hasOwnProperty(symbol)) {
                        if (cryptoBalances[symbol] != null) {
                            var price = parseFloat(coin_prices[symbol]);
                            var cad_value = parseFloat((cryptoBalances[symbol] * price).toFixed(2))
                            var pastCostPerCoin = pastDayPrices ? pastDayPrices.coin_info.filter((info) => info.symbol == symbol)[0].cost_per_coin.current : null;
                            output.push({
                                symbol: symbol,
                                balance: cryptoBalances[symbol],
                                cost_per_coin: {
                                    current: price.toFixed(2),
                                    pastDay: pastCostPerCoin
                                },
                                cad_value: cad_value
                            });
                            total += cad_value;
                        }
                    }
                }
                output.sort((a, b) => { return a.cad_value < b.cad_value })
                resolve({
                    total: {
                        current: total,
                        pastDay: pastDayPrices ? pastDayPrices.total.current : null
                    },
                    coin_info: output,
                    orig: originalBalance
                })
            })
            .catch((err) => {
                reject(err);
            })
    })
}
function getUserBalances(accountId) {
    return new Promise((resolve, reject) => {
        Promise.all([getOriginalBalance(accountId), getCryptoBalances(accountId)])
            .then((results) => {
                resolve(results);
            })
            .catch(err => reject(err));
    })
}
function getRawCryptoBalances(accountId) {
    return new Promise((resolve, reject) => {
        var query = `SELECT balance from crypto_balances WHERE account_id = '${accountId}'`;
        db.all(query, (err, rows) => {
            if (err) {
                return reject(err)
            }
            if (rows.length == 1) {
                return resolve(rows[0]);
            }
            else {
                return resolve(null);
            }
        })
    })
}
function getCryptoBalances(accountId) {
    return new Promise((resolve, reject) => {
        var query = `SELECT balance from crypto_balances WHERE account_id = '${accountId}'`;
        db.all(query, (err, rows) => {
            if (err) {
                return reject(err)
            }
            if (rows.length == 1) {
                var result = rows[0].balance.split("\n");
                var cryptoBalances = {};
                for (var i = 0; i < result.length; i++) {
                    cryptoBalances[result[i].split(":")[0].trim()] = result[i].split(":")[1].trim();
                }
                return resolve(cryptoBalances);
            }
            else {
                return resolve(null);
            }
        })
    })
}

function getCoinPrices() {
    return new Promise((resolve, reject) => {
        redisClient.get("coin_prices", (err, result) => {
            if (!firstRun && result) {
                resolve(JSON.parse(result));
            }
            else {
                firstRun = false;
                request("https://api.coinmarketcap.com/v1/ticker/?convert=CAD&limit=0", (err, response, body) => {
                    if (err) {
                        reject(err);
                    }
                    lastCoinMarketCapUpdate = new Date();
                    var ticker_data = JSON.parse(body);
                    var prices = ticker_data.map((a) => {
                        //TODO: map exceptions in a better way
                        if (a.symbol == "MIOTA") {
                            a.symbol = "IOTA";
                        }
                        return a;
                    })
                    coin_prices = [];
                    for (var i = 0; i < prices.length; i++) {
                        coin_prices[prices[i].symbol] = prices[i].price_cad;
                    }
                    redisClient.setex("coin_prices", 30, JSON.stringify(coin_prices));
                    resolve(coin_prices);
                })
            }
        })
    })
}
function updateOriginalBalance(accountId, originalBalance) {
    var query = `REPLACE INTO original_balance VALUES('${accountId}', ${originalBalance})`
    db.run(query, (err) => {
        if (err) {
            console.log(err);
        }
    });
}
function updateCryptoBalances(accountId, cryptoBalances) {
    var query = `REPLACE INTO crypto_balances VALUES('${accountId}', '${cryptoBalances}')`
    db.run(query, (err) => {
        if (err) {
            console.log(err);
        }
    });
}

function getOriginalBalance(accountId) {
    return new Promise((resolve, reject) => {
        var query = `SELECT balance from original_balance WHERE account_id = '${accountId}'`;
        db.all(query, (err, rows) => {
            if (err) {
                return reject(err)
            }
            if (rows.length == 1) {
                return resolve(rows[0].balance);
            }
            else {
                return resolve(null);
            }
        })
    })
}

function addNewPriceData(accountId, date, priceData) {
    var query = `INSERT INTO prices VALUES('${accountId}', ${date}, '${priceData}')`
    db.run(query, (err) => {
        if (err) {
            console.log(err)
        }
    })
}
var j = schedule.scheduleJob('*/5 * * * *', function () {
    db.all(`SELECT account_id from crypto_balances`, (err, rows) => {
        if (err) {
            console.log(err);
        }
        for (var i = 0; i < rows.length; i++) {
            recurringDbUpdate(rows[i].account_id);
        }
    })
});

function recurringDbUpdate(accountId) {
    update(accountId).then((output) => {
        var date = new Date();
        console.log(accountId + " | Recurring update: Updating DB at " + moment(date.getTime()).format('MM/D h:mm a') + " | " + (output.total.current - output.orig))
        try {
            addNewPriceData(accountId, Math.floor(date.getTime() / 1000), JSON.stringify(output));
        }
        catch (e) {
            console.log(e);
        }
    }).catch((err) => {
        console.log(err);
    });

}

function getTimeDiff(date1, date2) {
    var diff = date2.getTime() - date1.getTime();
    return diff / 1000;
}

function getHistoricalData(accountId) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT date, price_data FROM prices WHERE account_id = '${accountId}' ORDER BY date DESC LIMIT 576`, (err, rows) => {
            if (err) {
                return reject(err);
            }
            var data = {};
            data.priceData = rows.map(function callback(currentValue, index, array) {
                return JSON.parse(currentValue.price_data);
                
            });
            data.dateArray = rows.map(function callback(currentValue, index, array) {
                return moment(new Date(currentValue.date * 1000)).format('MM/D h:mm a');
            });
            resolve(data);
        });
    })
}

function getUserData(accountId) {
    return new Promise((resolve, reject) => {
        Promise.all([getRawCryptoBalances(accountId), getOriginalBalance(accountId), getHistoricalData(accountId)])
            .then((results) => {
                var cryptoBalances = results[0];
                var originalBalance = results[1];
                var historicalData = results[2];
                resolve({
                    cryptoBalances: cryptoBalances,
                    originalBalance: originalBalance,
                    historicalData: historicalData
                })
            })
            .catch((err) => { console.log(err); reject(err) });
    });
}

function saveConfig(config) {
    updateOriginalBalance(config.accountId, config.originalBalance);
    updateCryptoBalances(config.accountId, config.cryptoBalances);
}
module.exports.update = update;
module.exports.getUserData = getUserData;
module.exports.saveConfig = saveConfig;
