/*
  Script that simulates a single user on a JupyterHub
  */
const request = require('request-promise').defaults({simple: false});
const services = require('@jupyterlab/services');
const ws = require('ws');
const xhr = require('./xhr');
const url = require('url');

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
        console.log(this.username + ' logged in');
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
                console.log(this.username + ' server started');
                return true;
            } else {
                nextUrl = resp.request.uri.href;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        console.log(this.username + ' server failed');
        return false;
    };

    async startKernel() {
        let cookieHeader = this.cookieJar.getCookieString(this.notebookUrl);

        let serverSettings = services.ServerConnection.makeSettings({
            xhrFactory: function () { return new xhr.XMLHttpRequest(); },
            wsFactory: function (url, protocol) {
                return new ws(url, protocol, {'headers': {'Cookie': cookieHeader}});
            },
            requestHeaders: {'Cookie': cookieHeader},
            baseUrl: this.notebookUrl
        });

        let kernelSpecs = await services.Kernel.getSpecs(serverSettings);
        // use the default name
        let options = {
            name: kernelSpecs.default,
            serverSettings: serverSettings
        };
        this.kernel = await services.Kernel.startNew(options);
        console.log(this.username + ' kernel started');
    }

    async executeCode() {
        let executeFib = ()=> {
            let future = this.kernel.requestExecute({ code: 'fib = lambda n: n if n < 2 else fib(n-1) + fib(n-2); print(fib(20))'} );
            let startTime = process.hrtime();
            future.onIOPub = (msg) => {
                if (msg.content.text == '6765\n') {
                    setTimeout(executeFib, 1000);
                    let timeTaken = process.hrtime(startTime);
                    console.log(this.username + ' has taken ', timeTaken[0] * 1000 + timeTaken[1] / 1000000);
                }
            };
        };
        executeFib();
    }

}

async function main() {
    var u = new User('http://localhost:8000', 'wat' + String(14), 'wat');

    try {
        for(var i = 0; i <10; i++) {
            let u = new User('http://localhost:8000', 'wat' + String(i), 'wat');
            u.login().then(() => u.startServer()).then(() => u.startKernel()).then(() => u.executeCode()).then(() => console.log("DONE!"));
        }
    } catch (e) {
        console.log(e);
    }
}

main();
