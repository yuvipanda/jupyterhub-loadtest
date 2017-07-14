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
        } catch(c) {
            this.statsd.increment('login.failure');
            console.log(this.username + ' login failed!');
            console.log(c.stack);
        }
    }

    async startServer() {
        let startTime = process.hrtime();
        var nextUrl = this.hubUrl + '/hub/spawn';
        for (var i = 0; i < 20; i++) {
            var expectedUrl = this.notebookUrl + '/tree?';
            try {
                var resp = await request({
                    method: 'GET',
                    url: nextUrl,
                    jar: this.cookieJar,
                    followRedirect: function(req) {return true;},
                    resolveWithFullResponse: true
                });
            } catch(e) {
                // LOL @ STATE OF ERROR HANDLING IN JS?!@?
                let timeTaken = process.hrtime(startTime);
                if (e.message.startsWith('Error: Exceeded maxRedirects. Probably stuck in a redirect loop ')) {
                    console.log('Redirect loop for user ' + this.username);
                    this.statsd.increment('server-start.failure');
                    this.statsd.timing('server-start.failure', timeTaken[0] * 1000 + timeTaken[1] / 1000000);
                } else {
                    console.log(e.stack);
                }
                return false;
            }
            if (resp.request.uri.href == expectedUrl) {
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
            'Cookie': this.cookieJar.getCookieString(this.notebookUrl + '/')
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

        try {
            let kernelSpecs = await services.Kernel.getSpecs(serverSettings);
            this.kernel = await services.Kernel.startNew({
                name: kernelSpecs.default,
                serverSettings: serverSettings
            });
            let timeTaken = process.hrtime(startTime);
            this.statsd.increment('kernel-start.success');
            this.statsd.timing('server-start.success', timeTaken[0] * 1000 + timeTaken[1] / 1000000);
        } catch(e) {
            let timeTaken = process.hrtime(startTime);
            this.statsd.increment('kernel-start.failure');
            this.statsd.timing('kernel-start.failure', timeTaken[0] * 1000 + timeTaken[1] / 1000000);
            throw(e);
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

function main(hubUrl, userCount, userPrefix, statsdHost, statsdPrefix) {

    try {
        for(var i = 0; i < userCount; i++) {
            let u = new User(hubUrl, userPrefix + String(i), 'wat', new SDC({host: statsdHost, prefix: statsdPrefix}));
            u.login().then(() => u.startServer()).then(() => u.startKernel()).then(() => u.executeCode());
        }
    } catch (e) {
        console.log(e.stack);
    }
}

program
    .arguments('<hubUrl> <userCount> <userPrefix> <statsdHost> <statsdPrefix>')
    .action(main)
    .parse(process.argv);
