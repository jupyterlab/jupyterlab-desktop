import electron = require('electron');
let app = electron.app;
let BrowserWindow = electron.BrowserWindow;
let dialog = electron.dialog;

import path = require('path');
import url = require('url');
// Global reference to the main window, so the garbage collector doesn't close it.
let mainWindow : Electron.BrowserWindow;

// Opens the main window, with a native menu bar.
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 400,
    minHeight: 300
  });

  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, '../browser/index.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted before the `beforeunload` and `unload` event of the DOM.
  mainWindow.on('close', (event: Event) => {
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

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
}

// Call 'createWindow()' on startup.
app.on('ready', () => {
  createWindow();
});

// On OS X it is common for applications and their menu bar to stay active until the user quits explicitly
// with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On OS X it's common to re-create a window in the app when the dock icon is clicked and there are no other
// windows open.
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
