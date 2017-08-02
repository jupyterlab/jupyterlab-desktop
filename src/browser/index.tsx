
import 'font-awesome/css/font-awesome.min.css';
import '@jupyterlab/theming/style/index.css';
import 'jupyterlab_app/src/browser/style/main.css';

import {
    Application
} from 'jupyterlab_app/src/browser/app';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import {
    JupyterWindowIPC as WindowIPC
} from 'jupyterlab_app/src/ipc';

function main() : void {
    let optionsStr = decodeURIComponent((global as any).location.search);
    let options: WindowIPC.IWindowState = JSON.parse(optionsStr.slice(1));
    ReactDOM.render(
        <Application options={options as Application.IOptions} />,
        document.getElementById('root')
    );
}

window.onload = main;
