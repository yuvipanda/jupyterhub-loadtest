/*
  Script that simulates a single user on a JupyterHub
  */
const request = require('request-promise').defaults({simple: false});
const services = require('@jupyterlab/services');
const ws = require('ws');
const xhr = require('./xhr');
const url = require('url');
const SDC = require('statsd-client')
var program = require('commander');

class User {

    constructor(hubUrl, username, password, statsd) {
        this.hubUrl = hubUrl;
        this.username = username;
        this.password = password;
        this.cookieJar = request.jar();
        this.notebookUrl = this.hubUrl + '/user/' + this.username;
        this.statsd = statsd;
    }

    async login() {
        var postUrl = this.hubUrl + '/hub/login';
        try {
            await request({
                method: 'POST',
                url: postUrl,
                form: {username: this.username, password: this.password},
                jar: this.cookieJar,
                resolveWithFullResponse: true
            });
            this.statsd.increment('login.success');
            console.log(this.username + ' logged in');
        } catch(c) {
            this.statsd.increment('login.failure');
            console.log(this.username + ' login failed!');
            console.log(c);
        }
    }

    async startServer() {
        let startTime = process.hrtime();
        var nextUrl = this.hubUrl + '/hub/spawn';
        for (var i = 0; i < 20; i++) {
            var expectedUrl = this.notebookUrl + '/tree?';
            var resp = await request({
                method: 'GET',
                url: nextUrl,
                jar: this.cookieJar,
                followRedirect: function(req) {return true;},
                resolveWithFullResponse: true
            });
            if (resp.request.uri.href == expectedUrl) {
                console.log(this.username + ' server started');
                let timeTaken = process.hrtime(startTime);
                this.statsd.increment('server-start.success');
                this.statsd.timing('server-start.success', timeTaken[0] * 1000 + timeTaken[1] / 1000000);
                return true;
            } else {
                nextUrl = resp.request.uri.href;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        console.log(this.username + ' server failed');
        let timeTaken = process.hrtime(startTime);
        this.statsd.increment('server-start.failure');
        this.statsd.timing('server-start.failure', timeTaken[0] * 1000 + timeTaken[1] / 1000000);
        return false;
    };

    async startKernel() {
        let startTime = process.hrtime();
        let headers = {
            'Cookie': this.cookieJar.getCookieString(this.notebookUrl)
        };
        this.cookieJar.getCookies(this.notebookUrl).forEach((cookie) => {
            if (cookie.key == '_xsrf') { headers['X-XSRFToken'] = cookie.value };
        });

        let serverSettings = services.ServerConnection.makeSettings({
            xhrFactory: function () { return new xhr.XMLHttpRequest(); },
            wsFactory: function (url, protocol) {
                return new ws(url, protocol, {'headers': headers});
            },
            requestHeaders: headers,
            baseUrl: this.notebookUrl
        });

        let kernelSpecs = await services.Kernel.getSpecs(serverSettings);
        // use the default name
        let options = {
            name: kernelSpecs.default,
            serverSettings: serverSettings
        };
        try {
            this.kernel = await services.Kernel.startNew(options);
            let timeTaken = process.hrtime(startTime);
            this.statsd.increment('kernel-start.success');
            this.statsd.timing('server-start.success', timeTaken[0] * 1000 + timeTaken[1] / 1000000);
            console.log(this.username + ' kernel started');
        } catch(e) {
            let timeTaken = process.hrtime(startTime);
            this.statsd.increment('kernel-start.failure');
            this.statsd.timing('kernel-start.failure', timeTaken[0] * 1000 + timeTaken[1] / 1000000);
            console.log(e);
        }
    }

    async executeCode() {
        let executeFib = ()=> {
            let future = this.kernel.requestExecute({ code: 'fib = lambda n: n if n < 2 else fib(n-1) + fib(n-2); print(fib(20))'} );
            let startTime = process.hrtime();
            future.onIOPub = (msg) => {
                if (msg.content.text == '6765\n') {
                    setTimeout(executeFib, 1000);
                    let timeTaken = process.hrtime(startTime);
                    this.statsd.timing('code-execute.success', timeTaken[0] * 1000 + timeTaken[1] / 1000000);
                }
            };
        };
        executeFib();
    }

}

async function main(hubUrl, userCount, userPrefix, statsdHost) {

    console.log(statsdHost);
    try {
        for(var i = 0; i < userCount; i++) {
            let u = new User(hubUrl, userPrefix + String(i), 'wat', new SDC({host: statsdHost, prefix: 'jhload.' + userPrefix}));
            u.login().then(() => u.startServer()).then(() => u.startKernel()).then(() => u.executeCode()).then(() => console.log("DONE!"));
        }
    } catch (e) {
        console.log(e);
    }
}

program
    .arguments('<hubUrl> <userCount> <userPrefix> <statsdHost>')
    .action(main)
    .parse(process.argv);
