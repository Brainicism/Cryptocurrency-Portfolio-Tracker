const express = require('express')
const app = express()
const bodyParser = require('body-parser');
const fs = require('fs');
const crypto = require("./crypto.js");
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
app.use('/crypto/static', express.static('public'))
app.get("/crypto/api/user/:accountId", function (req, res) {
    let accountId = req.params.accountId;
    crypto.getUserData(accountId).then((data) => {
        res.status(200).send(data);
    }).catch((err) => {
        res.status(400).send(err);
    })
})

app.post("/crypto/api/config/:accountId", function (req, res) {
    let data = req.body;
    let accountId = req.params.accountId;
    let config = {
        accountId: accountId,
        originalBalance: data.originalBalance,
        cryptoBalances: data.cryptoBalances
    }
    crypto.saveConfig(config)
    res.status(200).end();
})

app.get("/crypto/api/update/:accountId", function (req, res) {
    let accountId = req.params.accountId;
    crypto.update(accountId).then((value) => {
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
    res.sendFile(__dirname + "/public/portfolio.html")
});

app.get("/crypto/:accountId", function (req, res) {
    res.sendFile(__dirname + "/public/portfolio.html")
});

let server = app.listen(1235);
