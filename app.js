var express = require('express')
var app = express()
var bodyParser = require('body-parser');
var fs = require('fs');
var crypto = require("./crypto.js");
var path = require("path");
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
app.use('/crypto/static', express.static('public'))
app.get("/crypto/api/graph/:accountId", function (req, res) {
    var accountId = req.params.accountId;
    crypto.getHistoricalData(accountId).then((data) => {
        res.status(200).send(data);
    }).catch((err) => {
        res.status(400).send(err);
    })
})

app.post("/crypto/api/config/:accountId", function (req, res) {
    var data = req.body;
    var accountId = req.params.accountId;
    var config = {
        accountId: accountId,
        originalBalance: data.originalBalance,
        cryptoBalances: data.cryptoBalances
    }
    crypto.saveConfig(config)
    res.status(200).end();
})

app.get("/crypto/api/:accountId", function (req, res) {
    var accountId = req.params.accountId;
    crypto.getValues(accountId).then((value) => {
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

app.get("/crypto", function (req, res) {
    res.sendFile(__dirname + "/public/coin.html")
});

app.get("/crypto/app/:accountId", function (req, res) {
    res.sendFile(__dirname + "/public/coin.html")
});


var server = app.listen(1235);
