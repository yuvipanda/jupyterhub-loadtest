/*
  Script that simulates a single user on a JupyterHub
  */
const request = require('request-promise').defaults({simple: false});
const services = require('@jupyterlab/services');
const ws = require('ws');
const xhr = require('./xhr');
const url = require('url');
var program = require('commander');

class User {

    constructor(hubUrl, username, password) {
        this.hubUrl = hubUrl;
        this.username = username;
        this.password = password;
        this.cookieJar = request.jar();
        this.notebookUrl = this.hubUrl + '/user/' + this.username;
    }

    emitEvent(type, event) {
        event['type'] = type;
        event['timestamp'] = Date.now();
        event['user'] = this.username;
        console.log(JSON.stringify(event));
    }

    async login() {
        let startTime = process.hrtime();
        var postUrl = this.hubUrl + '/hub/login';
        try {
            await request({
                method: 'POST',
                url: postUrl,
                form: {username: this.username, password: this.password},
                jar: this.cookieJar,
                resolveWithFullResponse: true
            });
            let timeTaken = process.hrtime(startTime);
            this.emitEvent('login.success', {duration: timeTaken[0] * 1000 + timeTaken[1] / 1000000});
        } catch(c) {
            let timeTaken = process.hrtime(startTime);
            this.emitEvent('login.failure', {duration: timeTaken[0] * 1000 + timeTaken[1] / 1000000});
        }
    }

    async startServer() {
        let startTime = process.hrtime();
        var nextUrl = this.hubUrl + '/hub/spawn';
        for (var i = 0; i < 300; i++) {
            var expectedUrl = this.notebookUrl + '/tree?';
            try {
                var resp = await request({
                    method: 'GET',
                    url: nextUrl,
                    jar: this.cookieJar,
                    followRedirect: function(req) {
                        return true;
                    },
                    resolveWithFullResponse: true
                });
            } catch(e) {
                // LOL @ STATE OF ERROR HANDLING IN JS?!@?
                let timeTaken = process.hrtime(startTime);
                if (e.message.startsWith('Error: Exceeded maxRedirects. Probably stuck in a redirect loop ')) {
                    console.log('Redirect loop for user ' + this.username);
                    this.emitEvent('server-start.toomanyredirects', {'duration': timeTaken[0] * 1000 + timeTaken[1] / 1000000});
                } else {
                    console.log(e.stack);
                }
                return false;
            }
            if (resp.request.uri.href == expectedUrl) {
                let timeTaken = process.hrtime(startTime);
                this.emitEvent('server-start.success', {'duration': timeTaken[0] * 1000 + timeTaken[1] / 1000000});
                return true;
            } else {
                nextUrl = resp.request.uri.href;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        let timeTaken = process.hrtime(startTime);
        this.emitEvent('server-start.failed', {'duration': timeTaken[0] * 1000 + timeTaken[1] / 1000000});
        return false;
    };

    async startKernel() {
        let startTime = process.hrtime();
        let headers = {
            'Cookie': this.cookieJar.getCookieString(this.notebookUrl + '/')
        };
        this.cookieJar.getCookies(this.notebookUrl).forEach((cookie) => {
            if (cookie.key == '_xsrf') { headers['X-XSRFToken'] = cookie.value; };
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
            this.emitEvent('kernel-start.success', {'duration': timeTaken[0] * 1000 + timeTaken[1] / 1000000});
        } catch(e) {
            let timeTaken = process.hrtime(startTime);
            this.emitEvent('kernel-start.failure', {'duration': timeTaken[0] * 1000 + timeTaken[1] / 1000000});
            throw(e);
        }
    }

    async executeCode() {
        let executeFib = ()=> {
            let future = this.kernel.requestExecute({ code: 'fib = lambda n: n if n < 2 else fib(n-1) + fib(n-2); print(fib(20))'} );
            // This will fire if we don't have an answer back from the kernel within 1s
            let startTime = process.hrtime();
            let failureTimer = setTimeout(() => {
                let timeTaken = process.hrtime(startTime);
                this.emitEvent('code-execute.timeout', {duration: timeTaken[0] * 1000 + timeTaken[1] / 1000000});
            }, 1000);
            future.onIOPub = (msg) => {
                clearTimeout(failureTimer);
                let timeTaken = process.hrtime(startTime);
                if (msg.content.text == '6765\n') {
                    setTimeout(executeFib, 1000);
                    this.emitEvent('code-execute.success', {duration: timeTaken[0] * 1000 + timeTaken[1] / 1000000});
                }
            };
        };
        executeFib();
    }

}

function main(hubUrl, userCount, userPrefix) {

    try {
        for(var i = 0; i < userCount; i++) {
            let u = new User(hubUrl, userPrefix + String(i), 'wat');
            u.login().then(() => u.startServer()).then(() => u.startKernel()).then(() => u.executeCode());
        }
    } catch (e) {
        console.log(e.stack);
    }
}

program
    .arguments('<hubUrl> <userCount> <userPrefix>')
    .action(main)
    .parse(process.argv);
