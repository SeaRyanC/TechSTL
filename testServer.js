/// <reference path="Scripts\typings\node.d.ts" />
/// <reference path="Scripts\typings\express.d.ts" />
/// <reference path="Scripts\typings\ws.d.ts" />
var express = require('express');
var http = require('http');
var ws = require('ws');
var fs = require('fs');

var app = express();
var server = http.createServer(app);
server.listen(8080);

app.use(express.static('.'));

var fileList = ['test.html', 'arrayRenderer.js', 'renderTests.js'];

var clientList = [];

fileList.forEach(function (file) {
    fs.watchFile(file, function () {
        console.log('Notifying clients to reload for ' + file);
        clientList.forEach(function (c) {
            c.send('please reload kthxbye');
        });
    });
});

ws.createServer({ port: 8081 }, function (client) {
    clientList.push(client);

    client.onclose = function () {
        return clientList.splice(clientList.indexOf(client), 1);
    };
    client.onmessage = function () {
        // nom
    };
});
//# sourceMappingURL=testServer.js.map
