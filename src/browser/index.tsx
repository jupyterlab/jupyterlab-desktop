
import 'font-awesome/css/font-awesome.min.css';
import '@jupyterlab/theming/style/index.css';
import './css/main.css';

import {
    Application
} from './app';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

function main() : void {
    ReactDOM.render(
        <Application />,
        document.getElementById('root')
    );
}

window.onload = main;
