// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';
import * as ejs from 'ejs';
import * as fs from 'fs';
import { ThemedView } from '../dialog/themedview';

const progressLogo = fs.readFileSync(
  path.join(__dirname, '../../../app-assets/progress-logo.svg')
);

export class ProgressView {
  constructor(options: ProgressView.IOptions) {
    this._view = new ThemedView({
      isDarkTheme: options.isDarkTheme,
      preload: path.join(__dirname, './preload.js')
    });

    const template = `
      <style>
        .container {
          display: flex;
          height: 100%;
          flex-direction: column;
          font-size: 16px;
        }
        .row {
          display: flex;
          flex-direction: row;
          line-height: 18px;
        }
        .progress-logo-row {
          flex-direction: column;
          align-items: center;
          flex-grow: 1;
          padding-top: 100px;
        }
        .progress-logo {
          height: 100%;
          display: flex;
          flex-direction: row;
          align-items: center;
        }
        .progress-logo svg {
          width: 200px;
          height: 200px;
        }
        .progress-message-row {
          height: 30%;
        }
        #progress-message {
          width: 100%;
          text-align: center;
        }
      </style>
  
      <div class="container">
        <div class="row progress-logo-row">
          <div id="progress-logo" class="progress-logo animated">${progressLogo}</div>
        </div>
        <div class="row progress-message-row">
          <div id="progress-message"></div>
        </div>
      </div>

      <script>
      const progressSvg = document.querySelector('#progress-logo svg');
      const progressMessage = document.getElementById('progress-message');

      function sendMessageToMain(message, ...args) {
        window.electronAPI.sendMessageToMain(message, ...args);
      }

      window.electronAPI.onShowProgress((message, showAnimation) => {
        progressMessage.innerHTML = message;
        if (showAnimation) {
          progressSvg.unpauseAnimations();
        } else {
          progressSvg.pauseAnimations();
        }
      });
      </script>
    `;

    this._pageBody = ejs.render(template, {});
  }

  get view(): ThemedView {
    return this._view;
  }

  load() {
    this._viewReady = new Promise<void>(resolve => {
      this._view.view.webContents.on('dom-ready', () => {
        resolve();
      });
    });

    this._view.loadViewContent(this._pageBody);
  }

  setProgress(message: string, showAnimation: boolean) {
    this._viewReady.then(() => {
      this._view.view.webContents.send('show-progress', message, showAnimation);
    });
  }

  private _view: ThemedView;
  private _viewReady: Promise<void>;
  private _pageBody: string;
}

export namespace ProgressView {
  export interface IOptions {
    isDarkTheme: boolean;
  }
}
