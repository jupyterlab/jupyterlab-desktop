// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { 
    app, ipcMain
} from 'electron';

import {
    ChildProcess, spawn
} from 'child_process';

import {
    JupyterMainMenu
} from './menu';

import {
    JupyterLabWindow
} from './window';

import {
    JupyterAppChannels as Channels
} from '../ipc';


class JupyterServer {
    /**
     * The child process object for the Jupyter server
     */
    private nbServer: ChildProcess;
    
    /**
     * Start a local Jupyer server on the specified port. Returns
     * a promise that is fulfilled when the Jupyter server has
     * started and all the required data (url, token, etc.) is
     * collected. This data is collected from the data written to
     * std out upon sever creation
     */
    public start(port: number): Promise<any> {
        return new Promise((resolve, reject) => {
            let urlRegExp = /http:\/\/localhost:\d+\/\?token=\w+/g;
            let tokenRegExp = /token=\w+/g;
            let baseRegExp = /http:\/\/localhost:\d+\//g;

            this.nbServer = spawn('/bin/bash', ['-i']);

            this.nbServer.on('error', (err: Error) => {
                this.nbServer.stderr.removeAllListeners();
                reject(err);
            });

            this.nbServer.stderr.on('data', (serverBuff: string) => {
                let urlMatch = serverBuff.toString().match(urlRegExp);
                if (!urlMatch)
                    return; 

                let url = urlMatch[0].toString();
                this.nbServer.removeAllListeners();
                this.nbServer.stderr.removeAllListeners();

                let serverData = {
                    token: (url.match(tokenRegExp))[0].replace("token=", ""),
                    baseUrl: (url.match(baseRegExp))[0]
                }
                resolve(serverData);
            });

            this.nbServer.stdin.write('exec jupyter notebook --no-browser --port ' + port + '\n');
        });
    }

    /**
     * Stop the currently executing Jupyter server
     */
    public stop(): void {
        if (this.nbServer !== undefined)
            this.nbServer.kill();
    }
}

export class JupyterApplication {
    /**
     * The JupyterServer the application will use
     */
    private server: JupyterServer;

    /**
     * Controls the native menubar
     */
    private menu: JupyterMainMenu;

    /**
     * The JupyterLab window
     */
    private mainWindow: JupyterLabWindow;

    /**
     * Construct the Jupyter application
     */
    constructor() {
        this.registerListeners();
        this.server = new JupyterServer();
        this.mainWindow = new JupyterLabWindow();
        this.menu = new JupyterMainMenu();
    }

    /**
     * Register all application event listeners
     */
    private registerListeners(): void {
        // On OS X it is common for applications and their menu bar to stay 
        // active until the user quits explicitly with Cmd + Q.
        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        // On OS X it's common to re-create a window in the app when the dock icon is clicked and there are no other
        // windows open.
        // Need to double check this code to ensure it has expected behaviour
        app.on('activate', () => {
            this.createWindow();
        });

        app.on('quit', () => {
            this.server.stop();
        });
    }

    /**
     * Creates the primary application window
     */
    private createWindow(): void {
        if (!this.mainWindow.isWindowVisible)
            this.mainWindow.createWindow();
    }

    /**
     * Starts the Jupyter Server and launches the electron application.
     * When the Jupyter Sevrer start promise is fulfilled, the baseUrl
     * and the token is send to the browser window.
     */
    public start(): void {
        let token: Promise<string>;
        
        ipcMain.on(Channels.RENDER_PROCESS_READY, (event: any, arg: any) => {
            token.then((data) => {
                event.sender.send(Channels.SERVER_DATA, data);
            });
        });
        this.createWindow();
        
        token = new Promise((resolve, reject) => {
            this.server.start(8888)
            .then((serverData) => {
                console.log("Jupyter Server started at: " + serverData.baseUrl + "?token=" + serverData.token);
                resolve(serverData);

            })
            .catch((err) => {
                console.error("Failed to start Jupyter Server");
                console.error(err);
                reject(err);
            });
        });
    }
}
