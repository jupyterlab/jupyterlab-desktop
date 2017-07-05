import {app} from 'electron'
import {JupyterApplication} from './app';

/**
 * Require debugging tools. Only
 * runs when in development.
 */
require('electron-debug')({showDevTools: false});

app.on('ready', () => {
  let jupyterApp = new JupyterApplication();
  jupyterApp.start();
});

