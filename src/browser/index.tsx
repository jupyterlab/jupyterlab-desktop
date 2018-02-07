// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import './require';
import 'font-awesome/css/font-awesome.min.css';
import './style/main.css';

import {
    Application
} from './app';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import {
    JupyterLabSession
} from '../main/sessions';


/**
 * HACK
 *
 * The JupyterLab coreutils package uses the process.cwd
 * function with the expectation that it returns a '/', which
 * is the case when the code is bundled by webpack. Since this code
 * is not bundled, and electron gives the render process access node's
 * `process` variable, prcess.cwd actually evaluates to the current
 * working directory of the nodeapplication. Here we are overrding it
 * to maintain the bahavior JupyterLab expects.
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
