import {app} from 'electron'
import {JupyterApplication} from './app';

/**
 * Require debugging tools. Only
 * runs when in development.
 */
require('electron-debug')({showDevTools: false});

let jupyterApp;

app.on('ready', () => {
  jupyterApp = new JupyterApplication();
});

