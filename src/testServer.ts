/// <reference path="Scripts\typings\node.d.ts" />
/// <reference path="Scripts\typings\express.d.ts" />
/// <reference path="Scripts\typings\ws.d.ts" />

import express = require('express');
import http = require('http');
import ws = require('ws');
import fs = require('fs');

var app = express();
var server = http.createServer(app);
server.listen(8080);

app.use(express.static('.'));

var fileList = ['test.html', 'arrayRenderer.js', 'renderTests.js'];

var clientList: ws[] = [];

fileList.forEach(file => {
    fs.watchFile(file, function () {
        console.log('Notifying clients to reload for ' + file);
        clientList.forEach(c => {
            c.send('please reload kthxbye');
        });
    });
});

ws.createServer({ port: 8081 }, (client) => {
    clientList.push(client);

    client.onclose = () => clientList.splice(clientList.indexOf(client), 1);
    client.onmessage = function () {
        // nom
    };
});

