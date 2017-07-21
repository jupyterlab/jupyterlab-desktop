
import 'font-awesome/css/font-awesome.min.css';
import '@jupyterlab/theming/style/index.css';
import './css/main.css';

import {
    Application
} from './app';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import {
    JupyterWindowIPC as WindowIPC
} from '../ipc';

function main() : void {
    let optionsStr = decodeURIComponent((global as any).location.search);
    let options: WindowIPC.WindowOptions = JSON.parse(optionsStr.slice(1));
    ReactDOM.render(
        <Application options={options} />,
        document.getElementById('root')
    );
}

window.onload = main;
