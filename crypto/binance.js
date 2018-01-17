var request = require('request');
var coin_prices = [];
var lastCoinMarketCapUpdate;
var fs = require("fs");
var moment = require("moment");
var schedule = require('node-schedule');

const sqlite3 = require('sqlite3').verbose();
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
        getCoinPrices()
            .then(() => { return getUserBalances(accountId) })
            .then((result) => {
                var originalBalance = result[0];
                var cryptoBalances = result[1];
                if (originalBalance == null || cryptoBalances == null) {
                    return reject("Values not set, press q to set values");
                }
                var output = [];
                var total = 0;
                for (var symbol in coin_prices) {
                    if (coin_prices.hasOwnProperty(symbol)) {
                        if (cryptoBalances[symbol] != null) {
                            var price = parseFloat(coin_prices[symbol]);
                            var cad_value = parseFloat((cryptoBalances[symbol] * price).toFixed(2))
                            output.push({
                                symbol: symbol,
                                balance: cryptoBalances[symbol],
                                cost_per_coin: price.toFixed(2),
                                cad_value: cad_value
                            });
                            total += cad_value;
                        }
                    }
                }
                output.sort((a, b) => { return a.cad_value < b.cad_value })
                resolve({
                    total: total,
                    coin_info: output,
                    orig: originalBalance
                })
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
        var query = `SELECT balance from crypto_balances WHERE account_id = '${accountId}'`;
        db.all(query, (err, rows) => {
            if (err) {
                return reject(err)
            }
            if (rows.length == 1) {
                var result = rows[0].balance.split("\n");
                var cryptoBalances = {};
                for (var i = 0; i < result.length; i++) {
                    cryptoBalances[result[i].split(":")[0]] = result[i].split(":")[1].trim();
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
        if (lastCoinMarketCapUpdate != null && getTimeDiff(lastCoinMarketCapUpdate, new Date()) < 30) {
            return resolve();
        }
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
            resolve(coin_prices);
        })
    })
}
recurringDbUpdate("1")

function updateOriginalBalance(accountId, originalBalance) {
    var query = `REPLACE INTO original_balance VALUES('${accountId}', ${originalBalance})`
    db.run(query, (err) => {
        if (err) {
            console.log(err);
        }
    });
}
function updateCryptoBalances(accountId, cryptoBalances) {
    console.log(cryptoBalances);
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
    recurringDbUpdate("1");
});

function recurringDbUpdate(accountId) {
    update(accountId).then((output) => {
        var date = new Date();
        console.log("Recurring update: Updating DB at " + moment(date.getTime()).format('MM/D h:mm a') + " | " + (output.total - output.orig))
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
        db.all('SELECT date, price_data FROM prices WHERE account_id = ' + accountId + ' ORDER BY date DESC LIMIT 576', (err, rows) => {
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

function saveConfig(config) {
    updateOriginalBalance(config.accountId, config.originalBalance);
    updateCryptoBalances(config.accountId, config.cryptoBalances);
}
module.exports.getValues = update;
module.exports.getHistoricalData = getHistoricalData;
module.exports.saveConfig = saveConfig;
