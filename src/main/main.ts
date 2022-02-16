import {
    app, BrowserWindow, dialog, WebContents
} from 'electron';

const Bottle = require('bottlejs');
import log from 'electron-log';
import * as yargs from 'yargs';
import * as path from 'path';
import * as fs from 'fs';
import { randomBytes } from 'crypto';
import { AddressInfo, createServer } from 'net';

import { appConfig } from './utils';

async function getFreePort(): Promise<number> {
    return new Promise<number>((resolve) => {

        const getPort = () => {
            const server = createServer((socket) => {
                socket.write('Echo server\r\n');
                socket.pipe(socket);
            });
            
            server.on('error', function (e) {
                getPort();
            });
            server.on('listening', function (e: any) {
                const port = (server.address() as AddressInfo).port;
                server.close();
                
                resolve(port);
            });
        
            server.listen(0, '127.0.0.1');
        };

        getPort();
    });
};

async function setAppConfig(): Promise<void> {
    return new Promise<void>((resolve) => {
        getFreePort().then((port) => {
            appConfig.jlabPort = port;
            appConfig.token = randomBytes(24).toString('hex');
            resolve();
        });
    });
}

// handle opening file or directory with command-line arguments
if (process.argv.length > 1) {
    const openPath = path.resolve(process.argv[1]);

    if (fs.existsSync(openPath)) {
        if (fs.lstatSync(openPath).isDirectory()) {
            process.env.JLAB_DESKTOP_HOME = openPath;
        } else {
            process.env.JLAB_DESKTOP_HOME = path.dirname(openPath);
        }
    }
}

const isDevMode = process.mainModule.filename.indexOf( 'app.asar' ) === -1;

/**
 *  * On Mac OSX the PATH env variable a packaged app gets does not
 * contain all the information that is usually set in .bashrc, .bash_profile, etc.
 * This package fixes the PATH variable
 */
require('fix-path')();

let argv = yargs.option('v', {
    'alias': 'verbose',
    'count': true,
    'type': 'boolean',
    'describe': 'verbose output to terminal',
}).help().argv;

/**
 * Enabled separate logging for development and packaged environments.
 * Also override console methods so that future addition will route to
 * using this package.
 */
let adjustedVerbose = parseInt(argv.verbose as unknown as string) - 2;
if (isDevMode) {
    if (adjustedVerbose === 0) {
        log.transports.console.level = 'info';
    } else if (adjustedVerbose === 1) {
        log.transports.console.level = 'verbose';
    } else if (adjustedVerbose >= 2) {
        log.transports.console.level = 'debug';
    }

    log.transports.file.level = false;

    log.info('In development mode');
    log.info(`Logging to console at '${log.transports.console.level}' level`);
} else {
    if (adjustedVerbose === 0) {
        log.transports.file.level = 'info';
    } else if (adjustedVerbose === 1) {
        log.transports.file.level = 'verbose';
    } else if (adjustedVerbose >= 2) {
        log.transports.file.level = 'debug';
    }

    log.transports.console.level = false;

    log.info('In production mode');
    log.info(`Logging to file (${log.transports.file.findLogPath()}) at '${log.transports.console.level}' level`);
}

console.log = log.log;
console.error = log.error;
console.warn = log.warn;
console.info = log.info;
console.debug = log.debug;

/**
 * A user-defined service.
 *
 * Services make up the core functionality of the
 * application. Each service is instantiated
 * once and then becomes available to every other service.
 */
export
interface IService {

    /**
     * The required services.
     */
    requirements: String[];

    /**
     * The service name that is required by other services.
     */
    provides: string;

    /**
     * A function to create the service object.
     */
    activate: (...x: any[]) => any;

    /**
     * Whether the service should be instantiated immediately,
     * or lazy loaded.
     */
    autostart?: boolean;
}

/**
 * Services required by this application.
 */
const services = ['./app', './sessions', './server', './menu', './shortcuts', './utils', './registry']
.map((service: string) => {
    return require(service).default;
});

app.on('open-file', (event: Electron.Event, _path: string) => {
    process.env.JLAB_DESKTOP_HOME = path.dirname(_path);
});

/**
 * Load all services when the electron app is
 * ready.
 */
app.on('ready', () => {
    Promise.all([setAppConfig(), handOverArguments()])
    .then( () => {
        let serviceManager = new Bottle();
        let autostarts: string[] = [];
        services.forEach((s: IService) => {
            serviceManager.factory(s.provides, (container: any) => {
                let args = s.requirements.map((r: string) => {
                    return container[r];
                });
                return s.activate(...args);
            });
            if (s.autostart) {
                autostarts.push(s.provides);
            }
        });
        serviceManager.digest(autostarts);
    })
    .catch( (e) => {
        log.error(e);
        app.quit();
    });
});

app.on("web-contents-created", (_event: any, webContents: WebContents) => {
    // Prevent navigation to local links on the same page and external links
    webContents.on('will-navigate', (event: Event, navigationUrl) => {
        const jlabBaseUrl = `http://localhost:${appConfig.jlabPort}/`;
        if (!(navigationUrl.startsWith(jlabBaseUrl) && navigationUrl.indexOf('#') === -1)) {
            console.warn(`Navigation is not allowed; attempted navigation to: ${navigationUrl}`);
            event.preventDefault();
        }
    });

    // handle page's beforeunload prompt natively
    webContents.on("will-prevent-unload", (event: Event) => {
        const win = BrowserWindow.fromWebContents(webContents);
        const choice = dialog.showMessageBoxSync(win, {
            type: "warning",
            message: 'Do you want to leave?',
            detail: 'Changes you made may not be saved.',
            buttons: ["Leave", "Stay"],
            defaultId: 1,
            cancelId: 0,
        });

        if (choice === 0) {
            event.preventDefault();
        }
    });
});

/**
 * When a second instance of the application is executed, this passes the arguments
 * to first instance. Files that are opened with the application on Linux and Windows
 * will by default instantiate a new instance of the app with the file name as the args.
 * This instead opens the files in the first instance of the
 * application.
 */
function handOverArguments(): Promise<void> {
    let promise = new Promise<void>( (resolve, reject) => {
        app.requestSingleInstanceLock();
        // TODO; double check this logic
        app.on('second-instance', (event, argv, cwd) => {
            // Skip JupyterLab Executable
            for (let i = 1; i < argv.length; i ++) {
                app.emit('open-file', null, argv[i]);
            }
            reject();
        });
        resolve();
    });
    return promise;
}
