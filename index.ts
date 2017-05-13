import electron = require('electron');
let app = electron.app;
let BrowserWindow = electron.BrowserWindow;

import path = require('path');
import url = require('url');

// Global reference to the main window, so the garbage collector doesn't close it.
let mainWindow : Electron.BrowserWindow;

// Opens the main window, with a native menu bar.
function createWindow() {
  mainWindow = new BrowserWindow({width: 800, height: 600});

  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

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
