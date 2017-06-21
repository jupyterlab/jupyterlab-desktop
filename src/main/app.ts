
import { dialog, app, ipcMain, BrowserWindow } from 'electron'
import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as url from 'url';

class JupyterServer {
    private nbServer: ChildProcess;
    public token: string;
    public hostname: string;
    public port: string;
    public url: string;
    public notebookDir: string;
    
    public start(callback: () => void): void {
        let listRun = false;
        this.nbServer = spawn('jupyter', ['notebook', '--no-browser', '--debug']);
        this.nbServer.stderr.on('data', (serverData: string) => {
            //if (serverData.search("The Jupyter Notebook is running at") == -1)
            //    return;
            console.log(String(serverData));
            if (listRun) {
                return;
            }

            listRun = true;
            // Get server data
            let list = spawn('jupyter', ['notebook', 'list', '--json']);
            list.stdout.on('data', (data: string) => {
                console.log(String(data));
                let serverData = JSON.parse(data);
                this.token = serverData.token;
                this.hostname = serverData.hostname;
                this.port = serverData.port;
                this.url = serverData.url;
                this.notebookDir = serverData.notebook_dir;
                callback();
            });
        });
    }

    public stop(): void {
        this.nbServer.kill();
    }
}

export class JupyterApplication {
    private server: JupyterServer;
    private mainWindow: any;

    constructor() {
        this.registerListeners();
        this.server = new JupyterServer();
    }

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

    private createWindow(): void {
        // Consider creating a custom window class
        this.mainWindow = new BrowserWindow({
            width: 800,
            height: 600,
            minWidth: 400,
            minHeight: 300
        });

        this.mainWindow.loadURL(url.format({
            pathname: path.join(__dirname, '../browser/index.html'),
            protocol: 'file:',
            slashes: true
        }));

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
        
        this.mainWindow.on('closed', function () {
            this.mainWindow = null;
        });
    }

    public start(): void {
        this.server.start(() => {
            // Jupyter server started, start render process
            ipcMain.on('server-data', (evt: any, arg: any) => {
                let serverData = {
                    token: this.server.token,
                    url: this.server.url
                };
                evt.sender.send('server-data', JSON.stringify(serverData));
            });

            this.createWindow();
        });
    }

}