import {app} from 'electron'
import {JupyterApplication} from './app';

app.on('ready', () => {
  let jupyterApp = new JupyterApplication();
  jupyterApp.start();
});

