
import 'font-awesome/css/font-awesome.min.css';
import '@jupyterlab/theming/style/index.css';
import './css/main.css';

import {
    Application
} from './app';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

function main() : void {
    let serverIdStr = decodeURIComponent((global as any).location.search);
    let serverId = JSON.parse(serverIdStr.slice(1));
    ReactDOM.render(
        <Application serverId={serverId.serverId} />,
        document.getElementById('root')
    );
}

window.onload = main;
