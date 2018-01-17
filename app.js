var express = require('express')
var app = express()
var bodyParser = require('body-parser');
var fs = require('fs');
var cryptocoins = require("./crypto/binance");
var path = require("path");
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
app.use('/static', express.static('public'))
app.get("/api/coins/graph/:accountId", function (req, res) {
    var accountId = req.params.accountId;
    cryptocoins.getHistoricalData(accountId).then((data) => {
        res.status(200).send(data);
    }).catch((err) => {
        res.status(400).send(err);
    })
})

app.post("/api/coins/config/:accountId", function (req, res) {
    var data = req.body;
    var accountId = req.params.accountId;
    var config = {
        accountId: accountId,
        originalBalance: data.originalBalance,
        cryptoBalances: data.cryptoBalances
    }
    cryptocoins.saveConfig(config)
    res.status(200).end();
})

app.get("/api/coins/:accountId", function (req, res) {
    var accountId = req.params.accountId;
    cryptocoins.getValues(accountId).then((value) => {
        res.status(200).send(value);
    }).catch((err) => {
        if (err.startsWith("Values not set")) {
            res.status(400).send(err);
        }
        else {
            res.status(500).send(err);
        }
    });
});

app.get("/app/coins/", function (req, res) {
    res.sendFile(__dirname + "/public/coin.html")
});

app.get("/app/coins/:accountId", function (req, res) {
    res.sendFile(__dirname + "/public/coin.html")
});


var server = app.listen(1234, function () {
    console.log('Example app listening on port 1234!');
})
