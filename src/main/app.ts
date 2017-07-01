// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { dialog, app, BrowserWindow, ipcMain } from 'electron'
import { ChildProcess, spawn } from 'child_process'
import * as path from 'path'
import * as url from 'url'

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
            this.nbServer = spawn('jupyter', ['notebook', '--no-browser', '--port', String(port)]);

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
     * The JupyterLab window
     */
    private mainWindow: Electron.BrowserWindow;

    /**
     * Construct the Jupyter application
     */
    constructor() {
        this.registerListeners();
        this.server = new JupyterServer();
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
            if (this.mainWindow === null) {
                this.createWindow();
            }
        });

        app.on('quit', () => {
            this.server.stop();
        });
    }

    /**
     * Creates the primary application window and loads the
     * html
     */
    private createWindow(): void {
        
        this.mainWindow = new BrowserWindow({
            width: 800,
            height: 600,
            minWidth: 400,
            minHeight: 300,
            show: false
        });

        this.mainWindow.loadURL(url.format({
            pathname: path.resolve(__dirname, '../../../src/browser/index.html'),
            protocol: 'file:',
            slashes: true
        }));

        this.mainWindow.webContents.on('did-finish-load', () =>{
            this.mainWindow.show();
        });

        // Register dialog on window close
        this.mainWindow.on('close', (event: Event) => {
            let buttonClicked = dialog.showMessageBox({
            type: 'warning',
            message: 'Do you want to leave?',
            detail: 'Changes you made may not be saved.',
            buttons: ['Leave', 'Stay'],
            defaultId: 0,
            cancelId: 1
            });
            if (buttonClicked === 1) {
                event.preventDefault();
            }
        });
        
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });
    }



    /**
     * Starts the Jupyter Server and launches the electron application.
     * When the Jupyter Sevrer start promise is fulfilled, the baseUrl
     * and the token is send to the browser window.
     */
    public start(): void {
        let token: Promise<string>;
        
        ipcMain.on("server-data-ready", (event: any, arg: any) => {
            token.then((data) => {
                event.sender.send("server-data", data);
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
