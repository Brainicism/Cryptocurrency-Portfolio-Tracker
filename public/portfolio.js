var totalProfit;
var prevProfit;
var historicalGraph;
var firstBarUpdate = false;
var priceData;
var dateArray;
$(document).ready(function () {
    setUpGraph();
    updateGraph();
    updateData();
    setInterval(updateData, 60000);

    window.onkeyup = function (e) {
        var key = e.keyCode ? e.keyCode : e.which;
        if (key == 81) {
            // promptInfo();
        }
    }
});
function getConfigInfo() {
    var data = {};
    data.originalBalance = $("#originalBalance").val();
    data.cryptoBalances = $("#cryptoBalances").val();
    $.ajax({
        url: "/crypto/api/config/" + getAccountId(),
        type: "POST",
        data: data,
        success: function (data) {
            updateData();
        },
        error: function (jXHR, textStatus, errorThrown) {
            showError(jXHR.status + " " + jXHR.statusText + ". Try again later.")
        }
    });
    return false;
}
function promptInfo() {
    var data = {};
    data.orig = prompt("Original Amount?", "");

    if (isNaN(data.orig) || data.orig == null) {
        return showError("Values must be numbers");
    }
    $.ajax({
        url: "/crypto/api/config/" + getAccountId(),
        type: "POST",
        data: data,
        success: function (data) {
            updateData();
        },
        error: function (jXHR, textStatus, errorThrown) {
            showError(jXHR.status + " " + jXHR.statusText + ". Try again later.")
        }
    });
}

function formatResponseData(text) {
    var coin_info = text.coin_info;
    var string = "";
    var sum = 0;
    for (var i = 0; i < coin_info.length; i++) {
        var coin = coin_info[i];
        if (parseFloat(coin.cad_value) > 5) {
            sum += parseFloat(coin.cad_value);
            string += coin.balance + " " + coin.symbol + " @ " + coin.cost_per_coin + "/CAD = $" + coin.cad_value + "\n";
        }
    }
    string += "\nTotal Amount: $" + Math.round(sum);
    string += "\nOriginal Amount: $" + text.orig;
    return string;
}

function updateData() {
    $("#loading_spinner").show();
    $("#data").hide();
    $("#message").hide();
    $.ajax({
        url: "/crypto/api/" + getAccountId(),
        type: "GET",
        success: function (data) {
            $("#loading_spinner").hide();
            $("#data").show();
            var obj = $("#coins_data").text(formatResponseData(data));
            obj.html(obj.html().replace(/\n/g, '<br/>'));
            $("#last_update").text("Last Update: " + new Date());

            totalProfit = parseFloat((data.total - data.orig).toFixed(2));
            var raw_date = new Date();
            var date = moment(raw_date.getTime());
            var dateString = moment(raw_date.getTime()).format('MM/D h:mm a');
            if (date.minute() % 5 == 0 && historicalGraph.data.labels.indexOf(dateString) == -1) {
                addToGraph(dateString, totalProfit);
                prevProfit = totalProfit;
            }
            if (totalProfit) {
                $("#total").text("Total Profit: " + priceToString(totalProfit));
                document.title = priceToString(totalProfit);
                if (totalProfit > 0) {
                    changeFavicon("/crypto/static/jisoo_happy.png");
                }
                else {
                    changeFavicon("/crypto/static/jisoo_angry.png");
                }
            }
        },
        error: function (jXHR, textStatus, errorThrown) {
            $("#loading_spinner").hide();
            if (jXHR.status == 400) {
                $("#data").show();
                $("#coins_data").text("Enter your initial investment and crypto balances below");
            }
            else {
                showError(jXHR.responseText + ". Trying again in 60 seconds")
            }
        }
    });
}

const changeFavicon = link => {
    let $favicon = document.querySelector('link[rel="icon"]')
    if ($favicon !== null) {
        $favicon.href = link
    } else {
        $favicon = document.createElement("link")
        $favicon.rel = "icon"
        $favicon.href = link
        document.head.appendChild($favicon)
    }
}

function updateGraph() {
    $.ajax({
        url: "/crypto/api/graph/" + getAccountId(),
        type: "GET",
        success: function (data) {
            console.log(data);
            var historicalData = data.historicalData;
            historicalGraph.data.labels = historicalData.dateArray.reverse();
            priceData = historicalData.priceData;
            dateArray = historicalData.dateArray;
            console.log
            if (data.originalBalance) $("#originalBalance").val(data.originalBalance)
            if (data.cryptoBalances) $("#cryptoBalances").text(data.cryptoBalances.balance)
            
            var profitData = historicalData.priceData.map((d) => {
                return (d.total - d.orig).toFixed(2);
            });
            historicalGraph.data.datasets[0].data = profitData.reverse();
            historicalGraph.update();
        },
        error: function (jXHR, textStatus, errorThrown) {
            showError(jXHR.status + " " + jXHR.statusText + ". Try again later.")
        }
    });
}
function showError(message) {
    $("#data").hide();
    $("#message").show();
    $("#message").text(message);
}
function priceToString(price) {
    if (price < 0) {
        return "-$" + Math.abs(price);
    }
    else {
        return "$" + price;
    }
}
function getAccountId(index) {
    var str = window.location.href;
    var accountId = str.split("/")[4];
    console.log(accountId)
    return (accountId) ? accountId : 1;
}
function setUpGraph() {
    var ctx = document.getElementById("historicalGraph").getContext('2d');
    document.getElementById("historicalGraph").onclick = function (evt) {
        var activePoints = historicalGraph.getElementsAtEvent(evt)[0]["_index"];
        alert   (formatResponseData(priceData[activePoints]));
    };
    historicalGraph = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    'rgba(0,0, 0, 0.2)'
                ],
                borderColor: [
                    'rgba(0, 0, 0, 0.2)'
                ],
                hoverBackgroundColor: [
                    'rgba(0, 0, 0, 0.2)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            legend: {
                display: false
            },
            hover: {
                onHover: function (e, el) {
                    $("#historicalGraph").css("cursor", el[0] ? "pointer" : "default");
                }
            }
        }
    });
}

function addToGraph(label, num) {
    historicalGraph.data.labels.push(label);
    historicalGraph.data.datasets[0].data.push(num);
    if (prevProfit == null || (prevProfit != null && totalProfit == prevProfit)) {
        historicalGraph.data.datasets[0].backgroundColor[historicalGraph.data.datasets[0].data.length - 1] = "rgba(0,0,0, 0.2)";
        historicalGraph.data.datasets[0].borderColor[historicalGraph.data.datasets[0].data.length - 1] = "rgba(0,0,0, 1)";

    }
    else if (prevProfit > totalProfit) {
        historicalGraph.data.datasets[0].backgroundColor[historicalGraph.data.datasets[0].data.length - 1] = "rgba(255, 1, 1, 0.2)";
        historicalGraph.data.datasets[0].borderColor[historicalGraph.data.datasets[0].data.length - 1] = "rgba(255, 1, 1, 1)";
    }
    else if (prevProfit <= totalProfit) {
        historicalGraph.data.datasets[0].backgroundColor[historicalGraph.data.datasets[0].data.length - 1] = "rgba(0, 255, 1, 0.2)";
        historicalGraph.data.datasets[0].borderColor[historicalGraph.data.datasets[0].data.length - 1] = "rgba(0, 255, 1, 1)";
    }
    historicalGraph.update();
}