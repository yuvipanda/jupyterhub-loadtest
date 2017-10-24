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

    async stopServer() {
        let startTime = process.hrtime();
        let stopUrl = this.hubUrl + '/hub/api/users/' + this.username + '/server';
        let headers = {
            'Referer': this.hubUrl + '/hub'
        };
        try {
            let resp = await request({
                method: 'DELETE',
                url: stopUrl,
                jar: this.cookieJar,
                resolveWithFullResponse: true,
                headers: headers
            });
            let timeTaken = process.hrtime(startTime);
            this.emitEvent('server-stop.success', {'duration': timeTaken[0] * 1000 + timeTaken[1] / 1000000});
        } catch(e) {
            let timeTaken = process.hrtime(startTime);
            this.emitEvent('server-stop.failure', {'duration': timeTaken[0] * 1000 + timeTaken[1] / 1000000});
        }

    }

    startKernel() {
        return new Promise((resolve, reject) => {
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

            let failure = () => {
                let timeTaken = process.hrtime(startTime);
                this.emitEvent('kernel-start.failure', {'duration': timeTaken[0] * 1000 + timeTaken[1] / 1000000});
                reject();
            };
            services.Kernel.getSpecs(serverSettings).then((kernelSpecs) => {
                this.kernel = services.Kernel.startNew({
                    name: kernelSpecs.default,
                    serverSettings: serverSettings
                }).then((kernel) => {

                    this.kernel = kernel;
                    this.kernel.statusChanged.connect((status) => {
                        if (status.status == 'connected') {
                            resolve();
                        }
                    });
                });
            });
            let timeTaken = process.hrtime(startTime);
            this.emitEvent('kernel-start.success', {'duration': timeTaken[0] * 1000 + timeTaken[1] / 1000000});
        });
    }

    async stopKernel() {
        let startTime = process.hrtime();
        if (this.kernel) {
            await this.kernel.shutdown();
            let timeTaken = process.hrtime(startTime);
            this.emitEvent('kernel-stop.success', {'duration': timeTaken[0] * 1000 + timeTaken[1] / 1000000});
        }
    }

    executeCode(timeout) {
        // Explicitly *not* an async defined function, since we want to
        // explictly return a Promise.
        let cancelled = false;

        setTimeout(() => { cancelled = true; }, timeout);
        return new Promise((resolve, reject) => {

            let executeFib = () => {
                if (cancelled) {
                    this.emitEvent('code-execute.complete', {});
                    resolve();
                    return;
                }
                let future = this.kernel.requestExecute({ code: 'fib = lambda n: n if n < 2 else fib(n-1) + fib(n-2); print(fib(20))'} );
                // This will fire if we don't have an answer back from the kernel within 1s
                let startTime = process.hrtime();
                let failureTimer = setTimeout(() => {
                    let timeTaken = process.hrtime(startTime);
                    this.emitEvent('code-execute.timeout', {duration: timeTaken[0] * 1000 + timeTaken[1] / 1000000});
                    reject();
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
        });
    }

}

function main(hubUrl, userCount, userPrefix, jitter) {

    async function launch(i) {

        // Wait for a random amount of time before actually launching
        await new Promise(r => setTimeout(r, Math.random() * jitter));

        let u = new User(hubUrl, userPrefix + String(i), 'wat');
        await u.login();
        await u.startServer();
        await u.startKernel();
        await u.executeCode(5000);
        await u.stopKernel();
        await u.stopServer();

    }

    for(let i=0; i < userCount; i++) {
        launch(i);
    }
}

program
    .arguments('<hubUrl> <userCount> <userPrefix> <jitter>')
    .action(main)
    .parse(process.argv);
