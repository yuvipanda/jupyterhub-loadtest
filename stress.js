/*
  Script that simulates a single user on a JupyterHub
  */
var request = require('request-promise').defaults({simple: false});
var services = require('@jupyterlab/services');
var ws = require('ws');
var xhr = require('./xhr');

class User {

    constructor(hubUrl, username, password) {
        this.hubUrl = hubUrl;
        this.username = username;
        this.password = password;
        this.cookieJar = request.jar();
        this.notebookUrl = this.hubUrl + '/user/' + this.username;

    }

    async login() {
        var postUrl = this.hubUrl + '/hub/login';
        await request({
            method: 'POST',
            url: postUrl,
            form: {username: this.username, password: this.password},
            jar: this.cookieJar,
            resolveWithFullResponse: true
        });
    }

    async startServer() {
        var nextUrl = this.hubUrl + '/hub/spawn';
        for (var i = 0; i < 20; i++) {
            var expectedUrl = this.notebookUrl + '/tree';
            var resp = await request({
                method: 'GET',
                url: nextUrl,
                jar: this.cookieJar,
                followRedirect: function(req) {return true;},
                resolveWithFullResponse: true
            });
            if (resp.request.uri.href == expectedUrl) {
                break;
            } else {
                nextUrl = resp.request.uri.href;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    async getKernels() {
        let cookieHeader = this.cookieJar.getCookieString(this.notebookUrl);
        console.log('cookie is ' + cookieHeader);

        let serverSettings = services.ServerConnection.makeSettings({
            xhrFactory: function () { return new xhr.XMLHttpRequest(); },
            wsFactory: function (url, protocol) {
                return new ws(url, protocol, {'headers': {'Cookie': cookieHeader}});
            },
            requestHeaders: {'Cookie': cookieHeader},
            baseUrl: this.notebookUrl
        });

        services.Kernel.getSpecs(serverSettings).then(kernelSpecs => {
            console.log('Default spec:', kernelSpecs.default);
            console.log('Available specs', Object.keys(kernelSpecs.kernelspecs));
            // use the default name
            let options = {
                name: kernelSpecs.default,
                serverSettings: serverSettings
            };
            services.Kernel.startNew(options).then(kernel => {
                // Execute and handle replies.
                let future = kernel.requestExecute({ code: 'print("hello")'} );
                future.onDone = () => {
                    console.log('Future is fulfilled');
                };
                future.onIOPub = (msg) => {
                    console.log(msg.content);  // Print rich output data.
                };
            });
        });
    }
}

async function main() {
    var u = new User('http://localhost:8000', 'wat' + String(14), 'wat');

    try {
        await u.login();
        await u.startServer();
        await u.getKernels();
    } catch (e) {
        console.log(e);
    }
}

main();
