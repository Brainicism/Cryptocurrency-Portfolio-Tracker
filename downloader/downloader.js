const readline = require("readline");
const fs = require("fs-extra")
const hbjs = require("handbrake-js");
const spawn = require("child_process").spawn;
const colors = require("colors");
const config = require("./config");
const outputPath = config.outputPath;
const tempPath = config.tempPath;
const recursive = require('recursive-readdir');
const ariaPath = config.ariac2Path;
const path = require("path");
const commandExists = require('command-exists').sync;
var killSwitch = false;
var totalProgress = {
  fileName: "-",
  state: "Initializing",
  progress: "Beginning..."
};
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
fs.ensureDir(tempPath);
fs.ensureDir(outputPath);
if (!aria2cExists()) {
  console.log("Require aria2c, download or check config path".red);
  process.exit(1);
}

var WebTorrent = require("webtorrent")
function clearTemp() {
  fs.emptyDirSync(tempPath);
}
function encode(firstMkv) {
  return new Promise((resolve, reject) => {
    let inputFile = tempPath + firstMkv;
    let outputFile = outputPath + firstMkv.replace(".mkv", ".mp4");
    let options = {
      input: inputFile,
      output: outputFile,
      aencoder: "mp3",
      preset: "Normal",
      subtitle: "1",
      "subtitle-burned": true
    };
    var prevProgress = 0;
   var hbjsClient = hbjs.spawn(options)
      .on("cancelled", () => {
        return reject("Cancelled encode");
      })
      .on("end", () => {
        console.log(("TIME TO WATCH SOME " + firstMkv.replace(".mkv", "").toUpperCase() + " !").rainbow);
        fs.unlinkSync(inputFile);
        resolve();
      })
      .on("begin", () => {
        console.log("Begin conversion".yellow);
      })
      .on("error", (err) => {
        return reject(err.toString().red);
      })
      .on("progress", (progress) => {
        let percentComplete = Math.floor(progress.percentComplete);
        let eta = progress.eta;
        if (killSwitch) {
          hbjsClient.cancel();
          reject("killed from the encode");
        }
        if (prevProgress !== percentComplete) {
          prevProgress = percentComplete;
          totalProgress.state = "Encoding"
          totalProgress.progress = percentComplete + "%, ETA: " + eta;
          console.log(totalProgress.state + ". " + totalProgress.progress);
        }
      });
  })
}
function downloadTorrent(magnet) {
  return new Promise((resolve, reject) => {
    if (magnet) {
      var torrentCurrentProgressPercentage = 0;
      fs.emptyDirSync(tempPath);
      var client = new WebTorrent()
      console.log("begin?");
      client.add(magnet, { path: './temp' }, function (torrent) {
        totalProgress.state = "Downloading torrent"        
        torrent.on('download', function (bytes) {
          if (killSwitch) {
            torrent.destroy();
            client.destroy();
            reject("Killed from torrent download");
          }
          if (totalProgress.fileName == "-") {
            totalProgress.fileName = torrent.files[0].name;
          }

          if (Math.floor(100 * torrent.progress) != torrentCurrentProgressPercentage) {
            torrentCurrentProgressPercentage = Math.floor(100 * torrent.progress);
            totalProgress.progress = torrentCurrentProgressPercentage + "% | " + (torrent.downloadSpeed / 1024 / 1024).toFixed(2) + "MB/s";
            console.log(totalProgress.state + ". " + totalProgress.progress);
          }
        })
        torrent.on('done', function () {
          client.destroy();
          totalProgress.progress = "Torrent downloading finished. Preparing to encode..";
          resolve();
        })
      })
      client.on("error", (err) => {
        client.destroy();
        reject(err);
      })

      /* let execString = "aria2c \"" + magnet + "\" --seed-time=0 --dir=temp --max-upload-limit=1";
       try {
         console.log("Begin torrenting".yellow);
         var ls = spawn('aria2c', [magnet, "--seed-time=0", "--dir=temp", "--max-upload-limit=1"]);
         ls.stdout.on('data', function (data) {
           console.log(data.toString());
         });
         ls.stderr.on('data', function (data) {
           return reject('stderr: ' + data.toString());
         });
         ls.on('exit', function (code) {
           resolve();
         });
       }
       catch (e) {
         reject(e);
       }*/
    }
    else {
      resolve(console.log("No torrent specified, converting first video in temp".yellow));
    }
  })

}
function getFirstMkv() {
  let tempFiles = fs.readdirSync(tempPath);
  let tempMkvFiles = tempFiles.filter((file) => {
    return file.endsWith(".mkv");
  });
  return tempMkvFiles[0] ? tempMkvFiles[0] : null;
}

function aria2cExists() {
  return commandExists("aria2c");
}

function recursiveMkvSearch() {
  return new Promise((resolve, reject) => {
    recursive(tempPath, (err, files) => {
      if (err) {
        return reject(err);
      }
      let mkvFiles = files.filter((file) => {
        return file.endsWith(".mkv");
      })
      if (mkvFiles.length == 0) {
        return reject("No mkv files found");
      }
      let mkvFilesWithSize = mkvFiles.map((file) => {
        return {
          path: file,
          size: fs.statSync(file).size
        }
      });
      let largestMkvFile = mkvFilesWithSize.sort((a, b) => {
        return a.size < b.size;
      })[0];
      try {
        fs.renameSync(largestMkvFile.path, tempPath + path.basename(largestMkvFile.path));
        resolve(path.basename(largestMkvFile.path));
      }
      catch (e) {
        reject(e);
      }
    })
  })
}
function downloadAndEncode(uri) {
  return new Promise((resolve, reject) => {
    killSwitch = false;
    totalProgress.state = "Initializing"
    totalProgress.progress = "Preparing to download";
    downloadTorrent(uri).then(() => {
      let firstMkv = getFirstMkv();
      if (firstMkv) {
        console.log(("Found: ".concat(firstMkv)).green);
        encode(firstMkv).then(() => {
          resolve()
        }, (err) => {
          reject(err);
        })
      }
      else {
        recursiveMkvSearch().then((firstMkv) => {
          console.log(("Recursively found: ".concat(firstMkv)).green);
          encode(firstMkv).then(()=>{
            resolve();
          },(err)=>{
              reject(err);
          });
        }, (err) => {
          reject(err);
          console.log(err.toString().red);
        })
      }
    }, (err) => {
      reject(err);
    }, (err) => {
      reject(err);
    });
  })
};

function getProgress() {
  return totalProgress;
}

function kill() {
  killSwitch = true;
  initProgressStatus();
}

function initProgressStatus(){
  totalProgress = {
    fileName: "-",
    state: "Initializing",
    progress: "Beginning..."
  };
}
module.exports.downloadAndEncode = downloadAndEncode;
module.exports.clearTemp = clearTemp;
module.exports.getProgress = getProgress;
module.exports.kill = kill;
module.exports.initProgressStatus = initProgressStatus;