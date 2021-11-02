// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import './style/style.js';
import './style/main.css';

import {
    Application
} from './app';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import {
    JupyterLabSession
} from '../main/sessions';

import log from 'electron-log';

console.log = log.log;
console.error = log.error;
console.warn = log.warn;
console.info = log.info;
console.debug = log.debug;

/**
 * HACK
 *
 * The JupyterLab coreutils package uses the process.cwd
 * function with the expectation that it returns a '/', which
 * is the case when the code is bundled by webpack. Since this code
 * is not bundled, and electron gives the render process access node's
 * `process` variable, process.cwd actually evaluates to the current
 * working directory of the node application. Here we are overriding it
 * to maintain the behavior JupyterLab expects.
 */
process.cwd = () => {return '/'; };


function main() : void {
    let optionsStr = decodeURIComponent((global as any).location.search);
    let options: JupyterLabSession.IInfo = JSON.parse(optionsStr.slice(1));
    ReactDOM.render(
        <Application options={options} />,
        document.getElementById('root')
    );
}

window.onload = main;
