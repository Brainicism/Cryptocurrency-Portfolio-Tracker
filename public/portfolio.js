let totalProfit;
let prevProfit;
let historicalGraph;
let firstBarUpdate = false;
let historicalPriceDataArray;
let historicalDateArray;
toastr.options.timeOut = 0;
toastr.options.extendedTimeOut = 0;
toastr.options.allowHtml = true;
toastr.options.positionClass = "toast-bottom-center";
$(document).ready(function () {
    setUpGraph();
    initUserData();
    updateData();
    setInterval(updateData, 60000);
});
function setConfigInfo() {
    let data = {};
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
function formatResponseData(data, showChange) {
    let coin_info = data.coin_info;
    let string = "";
    for (let i = 0; i < coin_info.length; i++) {
        let coin = coin_info[i];
        if (parseFloat(coin.cad_value) > 5) {
            let currentPriceString = `${coin.cost_per_coin.current ? coin.cost_per_coin.current : coin.cost_per_coin} CAD`
            if (showChange) {
                let increaseInPastDay = (((coin.cost_per_coin.current - coin.cost_per_coin.pastDay) / coin.cost_per_coin.current) * 100);
                currentPriceString += ` (${increaseInPastDay > 0 ? "+" + increaseInPastDay.toFixed(2) : increaseInPastDay.toFixed(2)}%)`;
            }
            string += `${coin.balance} ${coin.symbol} @ $${currentPriceString} = $${coin.cad_value}\n`;
        }
    }
    string += `\nCurrent Value: $${data.total.current.toFixed(2)}`;
    if (showChange) {
        string += ` (${(100 * (data.total.current - data.total.pastDay) / data.total.current).toFixed(2)}%)`;
    }
    string += "\nOriginal Value: $" + data.orig;
    return string;
}

function updateData() {
    $("#loading_spinner").show();
    $("#data").hide();
    $("#message").hide();
    $.ajax({
        url: "/crypto/api/update/" + getAccountId(),
        type: "GET",
        success: function (data) {
            console.log(data)
            $("#loading_spinner").hide();
            $("#data").show();
            $("#last_update").text("Last Update: " + new Date());
            updateCoinData(data);
            totalProfit = parseFloat((data.total.current - data.orig).toFixed(2));
            let date = moment(new Date().getTime());
            let dateString = moment(date.valueOf()).format('MM/D h:mm a');
            if (date.minute() % 5 == 0 && historicalGraph.data.labels.indexOf(dateString) == -1) {
                addToGraph(dateString, totalProfit);
                prevProfit = totalProfit;
            }
            if (totalProfit) {
                $("#total").text("Total Profit: " + priceToString(totalProfit));
                document.title = priceToString(totalProfit);
                if (totalProfit > 0) {
                    changeFavicon("/crypto/static/profit_pos.png");
                }
                else {
                    changeFavicon("/crypto/static/profit_neg.png");
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

function updateCoinData(data) {
    let coinDataText = $("#coins_data").text(formatResponseData(data, true));
    coinDataText.html(coinDataText.html().replace(/\n/g, '<br/>'));
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

function initUserData() {
    $.ajax({
        url: "/crypto/api/user/" + getAccountId(),
        type: "GET",
        success: function (data) {
            let historicalData = data.historicalData;
            historicalPriceDataArray = historicalData.priceData.reverse();
            historicalDateArray = historicalData.dateArray.reverse();
            updateGraph(historicalPriceDataArray, historicalDateArray);
            if (data.originalBalance) $("#originalBalance").val(data.originalBalance)
            if (data.cryptoBalances) $("#cryptoBalances").text(data.cryptoBalances.balance)
        },
        error: function (jXHR, textStatus, errorThrown) {
            showError(jXHR.status + " " + jXHR.statusText + ". Try again later.")
        }
    });
}

function updateGraph(priceArray, dateArray) {
    let profitData = priceArray.map((d) => {
        return (parseFloat(d.total.current) - parseFloat(d.orig)).toFixed(2);
    });
    historicalGraph.data.datasets[0].data = profitData;
    historicalGraph.data.labels = dateArray;
    historicalGraph.update();
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
    let str = window.location.href;
    let accountId = str.split("/")[4];
    return (accountId) ? accountId : 1;
}
function setUpGraph() {
    let ctx = document.getElementById("historicalGraph").getContext('2d');
    document.getElementById("historicalGraph").onclick = function (evt) {
        let clickedIndex;
        if (historicalGraph.getElementsAtEvent(evt)[0]){
            clickedIndex = historicalGraph.getElementsAtEvent(evt)[0]["_index"];
        }
        else{
            return;
        }
        toastr.remove()
        toastr.success(formatResponseData(historicalPriceDataArray[clickedIndex], false).replace(/\n/g, '<br/>'), historicalDateArray[clickedIndex]).css("width", "500px")
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