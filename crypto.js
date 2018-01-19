const request = require('request');
const fs = require("fs");
const moment = require("moment");
const schedule = require('node-schedule');
const redis = require("redis");
const redisClient = redis.createClient();
const sqlite3 = require('sqlite3').verbose();
let firstRun = true;
let coin_prices = [];

redisClient.on('error', function (err) {
    console.log("Error " + err);
});
const db = new sqlite3.Database('./db/main.db', (err) => {
    if (err) {
        console.error(err);
    }

    // db.run('CREATE TABLE prices(account_id text, date integer, price_data text)');
    //  db.run('CREATE TABLE crypto_balances(account_id text, ticker text, balance real)');
    //  db.run('CREATE TABLE original_balance(account_id text, balance real, CONSTRAINT unique_id UNIQUE(account_id))');
    console.log('Connected to the sick database.');
});

function update(accountId) {
    return new Promise((resolve, reject) => {
        Promise.all([getCoinPrices(), getUserBalances(accountId), getHistoricalData(accountId)])
            .then((results) => {
                let historicalPriceData = results[2].priceData;
                let pastDayPrices;
                let originalBalance = results[1][0];
                let cryptoBalances = results[1][1];
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
                let output = [];
                let total = 0;
                for (let symbol in coin_prices) {
                    if (coin_prices.hasOwnProperty(symbol)) {
                        if (cryptoBalances[symbol]) {
                            let price = parseFloat(coin_prices[symbol]);
                            let cad_value = parseFloat((cryptoBalances[symbol] * price).toFixed(2))
                            let pastCostPerCoin = pastDayPrices ? pastDayPrices.coin_info.filter((info) => info.symbol == symbol)[0].cost_per_coin.current : null;
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

function getCryptoBalances(accountId) {
    return new Promise((resolve, reject) => {
        let query = "SELECT ticker, balance from crypto_balances WHERE account_id = ?";
        db.all(query, [accountId], (err, rows) => {
            if (err) {
                return reject(err)
            }
            if (rows.length > 0) {
                let balances = {};
                for (let row of rows) {
                    balances[row.ticker] = row.balance;
                }
                return resolve(balances);
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
                    let ticker_data = JSON.parse(body);
                    let prices = ticker_data.map((a) => {
                        //TODO: map exceptions in a better way
                        if (a.symbol == "MIOTA") {
                            a.symbol = "IOTA";
                        }
                        return a;
                    })
                    coin_prices = [];
                    for (let i = 0; i < prices.length; i++) {
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
    let query = "REPLACE INTO original_balance VALUES(?, ?)";
    db.run(query, [accountId, originalBalance], dbErrorCallback);
}
function updateCryptoBalances(accountId, cryptoBalances) {
    let remove_query = "DELETE FROM crypto_balances WHERE account_id = ?";
    let insert_query = "INSERT INTO crypto_balances VALUES(?, ?, ?)";
    db.run(remove_query, [accountId], (err) => {
        if (err) {
            return console.log(err);
        }
        for (let cryptoBalance of cryptoBalances) {
            db.run(insert_query, [accountId, cryptoBalance.ticker, cryptoBalance.balance], dbErrorCallback);
        }
    });
}

function getOriginalBalance(accountId) {
    return new Promise((resolve, reject) => {
        let query = "SELECT balance from original_balance WHERE account_id = ?";
        db.all(query, [accountId], (err, rows) => {
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
    let query = "INSERT INTO prices VALUES(?, ?, ?)";
    db.run(query, [accountId, date, priceData], dbErrorCallback)
}
let j = schedule.scheduleJob('*/5 * * * *', function () {
    let query = "SELECT DISTINCT account_id from crypto_balances";
    db.all(query, (err, rows) => {
        if (err) {
            console.log(err);
        }
        for (let i = 0; i < rows.length; i++) {
            recurringDbUpdate(rows[i].account_id);
        }
    })
});

function recurringDbUpdate(accountId) {
    update(accountId).then((output) => {
        let date = new Date();
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
    let diff = date2.getTime() - date1.getTime();
    return diff / 1000;
}

function getHistoricalData(accountId) {
    return new Promise((resolve, reject) => {
        let query = "SELECT date, price_data FROM prices WHERE account_id = ? ORDER BY date DESC LIMIT 576";
        db.all(query, [accountId], (err, rows) => {
            if (err) {
                return reject(err);
            }
            let data = {};
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
        Promise.all([getCryptoBalances(accountId), getOriginalBalance(accountId), getHistoricalData(accountId)])
            .then((results) => {
                let cryptoBalances = results[0];
                let originalBalance = results[1];
                let historicalData = results[2];
                resolve({
                    cryptoBalances: cryptoBalances,
                    originalBalance: originalBalance,
                    historicalData: historicalData
                })
            })
            .catch((err) => { reject(err) });
    });
}

function saveConfig(config) {
    updateOriginalBalance(config.accountId, config.originalBalance);
    updateCryptoBalances(config.accountId, config.cryptoBalances);
}

function dbErrorCallback(err) {
    //TODO: do something other than log the error
    console.log(err);
}
module.exports.update = update;
module.exports.getUserData = getUserData;
module.exports.saveConfig = saveConfig;
