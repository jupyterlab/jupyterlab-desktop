// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { dialog, app, BrowserWindow, ipcMain } from 'electron'
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url'

class JupyterServer {
    /**
     * The child process object for the Jupyter server
     */
    private nbServer: ChildProcess;

    /**
     * The Jupyter server authentication token
     */
    public token: string;

    /**
     * The Jupyter server hostname
     */
    public hostname: string;

    /**
     * The Jupyter server port number
     */
    public port: number;

    /**
     * The Jupyter server url
     */
    public url: string;

    /**
     * The jupyter server notebook directory
     */
    public notebookDir: string;
    
    /**
     * Start a local Jupyer server on the specified port. Returns
     * a promise that is fulfilled when the Jupyter server has
     * started and all the required data (url, token, etc.) is
     * collected. This data is collected using `jupyter notebook list`
     */
    public start(port: number): Promise<any> {
        return new Promise((resolve, reject) => {
            this.nbServer = spawn('jupyter', ['notebook', '--no-browser', '--port', String(port)]);

            this.nbServer.on('error', (err: Error) => {
                this.nbServer.stderr.removeAllListeners();
                reject(err);
            });

            this.nbServer.stderr.on('data', (serverData: string) => {
                if (serverData.indexOf("The Jupyter Notebook is running at") == -1)
                    return;
                this.nbServer.removeAllListeners();
                this.nbServer.stderr.removeAllListeners();
                
                /* Get server data */
                let list = spawn('jupyter', ['notebook', 'list', '--json']);

                list.on('error', (err: Error) => {
                    list.stdout.removeAllListeners();
                    reject(err);
                });

                list.stdout.on('data', (data: string) => {
                    let serverData = JSON.parse(data);
                    serverData.port = Number(serverData.port);
                    this.token = serverData.token;
                    this.hostname = serverData.hostname;
                    this.port = serverData.port;
                    this.url = serverData.url;
                    this.notebookDir = serverData.notebook_dir;
                    resolve(serverData);
                });
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
   // private mainWindow: Electron.BrowserWindow;
    private mainWindow: any;

    /**
     * The file that stores index.html after it has been
     * run through the templater. This is a hack that should
     * be replaced when the JupyterLab application api is 
     * updated.
     */
    private indexFile: string;

    /**
     * Construct the Jupyter application
     */
    constructor() {
        this.registerListeners();
        this.server = new JupyterServer();
        this.indexFile = path.join(__dirname, 'temp.index.html');
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
            fs.unlinkSync(this.indexFile);
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
        this.mainWindow.openDevTools();
        this.mainWindow.loadURL(url.format({
            pathname: this.indexFile,
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
     * When the Jupyter Sevrer start promise is fulfilled, the Handlebars
     * templater is run on index.html and the output is saved to a file.
     * The electron render process is then started on that file by
     * calling createWindow
     */
    public start(): void {
        let token: Promise<string>;
        let source = fs.readFileSync(path.join(__dirname, '../../../src/browser/index.html')).toString();
        fs.writeFileSync(path.resolve(__dirname, this.indexFile), source);
        
        ipcMain.on("ready-for-token", (event: any, arg: any) => {
            token.then((data) => {
                event.sender.send("token", data);
            });
        });
        this.createWindow();
        
        token = new Promise((resolve, reject) => {
            this.server.start(8888)
            .then((serverData) => {
                console.log("Jupyter Server started at: " + serverData.url + "?token=" + serverData.token);
                resolve(serverData.token);

            })
            .catch((err) => {
                console.error("Failed to start Jupyter Server");
                console.error(err);
                reject(err);
            });
        });
    }
}
