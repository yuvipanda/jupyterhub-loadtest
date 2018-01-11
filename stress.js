/*
  Script that simulates a single user on a JupyterHub
  */
const os = require('os');
const request = require('request-promise').defaults({simple: false});
const services = require('@jupyterlab/services');
const ws = require('ws');
const xhr = require('./xhr');
const url = require('url');
const winston = require('winston');
const winstonTcp = require('winston-tcp');
var program = require('commander');


class User {

    constructor(hubUrl, username, password, eventEmitter) {
        this.hubUrl = hubUrl;
        this.username = username;
        this.password = password;
        this.cookieJar = request.jar();
        this.notebookUrl = this.hubUrl + '/user/' + this.username;
        this.eventEmitter = eventEmitter;
    }

    emitEvent(type, duration=0, event={}) {
        event['type'] = type;
        event['timestamp'] = Date.now();
        event['user'] = this.username;
        event['duration'] = duration[0] * 1000 + duration[1] / 1000000;
        this.eventEmitter.info(event);
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
            this.emitEvent('login.success', timeTaken);
        } catch(c) {
            let timeTaken = process.hrtime(startTime);
            this.emitEvent('login.failure', timeTaken);
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
                    this.emitEvent('server-start.toomanyredirects', timeTaken);
                } else {
                    console.log(e.stack);
                }
                return false;
            }
            if (resp.request.uri.href == expectedUrl) {
                let timeTaken = process.hrtime(startTime);
                this.emitEvent('server-start.success', timeTaken);
                return true;
            } else {
                nextUrl = resp.request.uri.href;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        let timeTaken = process.hrtime(startTime);
        this.emitEvent('server-start.failed', timeTaken);
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
            this.emitEvent('server-stop.success', timeTaken);
        } catch(e) {
            let timeTaken = process.hrtime(startTime);
            this.emitEvent('server-stop.failure', timeTaken);
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
                this.emitEvent('kernel-start.failure', timeTaken);
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
            this.emitEvent('kernel-start.success', timeTaken);
        });
    }

    async stopKernel() {
        let startTime = process.hrtime();
        if (this.kernel) {
            await this.kernel.shutdown();
            let timeTaken = process.hrtime(startTime);
            this.emitEvent('kernel-stop.success', timeTaken);
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
                    this.emitEvent('code-execute.complete');
                    resolve();
                    return;
                }
                let future = this.kernel.requestExecute({ code: 'fib = lambda n: n if n < 2 else fib(n-1) + fib(n-2); print(fib(20))'} );
                // This will fire if we don't have an answer back from the kernel within 1s
                let startTime = process.hrtime();
                let failureTimer = setTimeout(() => {
                    let timeTaken = process.hrtime(startTime);
                    this.emitEvent('code-execute.timeout', timeTaken);
                    reject();
                }, 1000);
                future.onIOPub = (msg) => {
                    clearTimeout(failureTimer);
                    let timeTaken = process.hrtime(startTime);
                    if (msg.content.text == '6765\n') {
                        setTimeout(executeFib, 1000);
                        this.emitEvent('code-execute.success', timeTaken);
                    }
                };
            };
            executeFib();
        });
    }

}

function main(hubUrl, userCount) {
    function justMetaFormatter(k, v) {
        // Remove the message and level keys, which are automatically added by winston
        if (k == 'message' || k == 'level') { return undefined; };
        return v;
    }
    const eventEmitter = new winston.Logger({
        level: 'info',
        transports: [
            new winston.transports.Console({
                showLevel: false,
                formatter: (opts) => {
                    return JSON.stringify(opts.meta, justMetaFormatter);
                },
            }),

        ]
    });

    if (program.eventsTcpServer) {
        const [host, port] = program.eventsTcpServer.split(':');
        eventEmitter.transports.push(
            new winstonTcp({
                host: host,
                port: parseInt(port),
                json: true,
                timestamp: false,
                formatter: (opts) => {
                    return JSON.stringify(opts.meta, justMetaFormatter);
                },
            })
        );
    }

    async function launch(i) {

        // Wait for a random amount of time before actually launching
        await new Promise(r => setTimeout(r, Math.random() * program.usersStartTime * 1000));

        const u = new User(hubUrl, program.userPrefix + String(i), 'wat', eventEmitter);

        const userActiveDurationSeconds = parseFloat(program.minUserActiveTime) + (Math.random() * (parseFloat(program.maxUserActiveTime) - parseFloat(program.minUserActiveTime)));
        await u.login();
        await u.startServer();
        await u.startKernel();
        await u.executeCode(userActiveDurationSeconds * 1000);
        await u.stopKernel();
        await u.stopServer();

    }

    for(let i=0; i < userCount; i++) {
        launch(i);
    }
}

program
    .version('0.1')
    .option('--min-user-active-time [min-user-active-time]', 'Minimum amount of seconds users should be active', 60)
    .option('--max-user-active-time [max-user-active-time]', 'Maximum amount of seconds users should be active', 600)
    .option('--users-start-time [users-start-time]', 'Period of time (seconds) to distribute starting the users in', 300)
    .option('--user-prefix [user-prefix]', 'Prefix to use for generating usernames', os.hostname())
    .option('--events-tcp-server [events-tcp-server]', 'Address of TCP server that will receive JSON events')
    .arguments('<hub-url> <user-count>')
    .action(main)
    .parse(process.argv);
