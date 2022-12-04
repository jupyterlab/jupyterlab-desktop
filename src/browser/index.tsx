// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import './style/style.js';

import { Application } from './app';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { JupyterLabSession } from '../main/sessions';

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface Window {
    isElectron?: boolean;
  }
}

function main(): void {
  const optionsStr = decodeURIComponent(window.location.search);
  const options: JupyterLabSession.IInfo = JSON.parse(optionsStr.slice(1));
  ReactDOM.render(
    <Application options={options} />,
    document.getElementById('root')
  );
}

// Flag to test for Electron integration
window.isElectron = true;

window.onload = main;
