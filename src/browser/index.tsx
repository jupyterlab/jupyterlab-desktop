// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import './require';
import 'font-awesome/css/font-awesome.min.css';
import '@jupyterlab/theming/style/index.css';
import './style/main.css';

import {
    Application
} from './app';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import {
    JupyterWindowIPC as WindowIPC
} from '../ipc';


/**
 * HACK
 * 
 * A JupyterLab package uses process.cwd
 * with the expectation that it returns '/', which
 * it does in the browser. However, in the
 * electron environment, prcess.cwd evaluates
 * to the current working directory of the node
 * application. Here we are overrding it to maintain
 * the bahavior of JupyterLab
 */
process.cwd = () => {return '/'}


function main() : void {
    let optionsStr = decodeURIComponent((global as any).location.search);
    let options: WindowIPC.IWindowState = JSON.parse(optionsStr.slice(1));
    ReactDOM.render(
        <Application options={options as Application.IOptions} />,
        document.getElementById('root')
    );
}

window.onload = main;
