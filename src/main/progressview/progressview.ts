// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';
import * as ejs from 'ejs';
import * as fs from 'fs';
import { ThemedView } from '../dialog/themedview';
import { EventTypeMain, EventTypeRenderer } from '../eventtypes';

export class ProgressView {
  constructor(options: ProgressView.IOptions) {
    this._view = new ThemedView({
      isDarkTheme: options.isDarkTheme,
      preload: path.join(__dirname, './preload.js')
    });

    const progressLogo = fs.readFileSync(
      path.join(__dirname, '../../../app-assets/progress-logo.svg')
    );
    const copyableSpanSrc = fs.readFileSync(
      path.join(__dirname, '../../../app-assets/copyable-span.js')
    );

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
          width: 100%;
          height: 30%;
          flex-direction: column;
          align-items: center;
        }
        #progress-title, #progress-detail {
          width: 80%;
          text-align: center;
        }
        #progress-title {
          margin-bottom: 15px;
          font-weight: bold;
        }
        #progress-detail {
          font-size: 14px;
        }
        .message-row {
          padding-bottom: 10px;
        }
      </style>
  
      <div class="container" title="">
        <div class="row progress-logo-row">
          <div id="progress-logo" class="progress-logo animated">${progressLogo}</div>
        </div>
        <div class="row progress-message-row">
          <div id="progress-title"></div>
          <div id="progress-detail"></div>
        </div>
      </div>

      <script>${copyableSpanSrc}</script>
      <script>
      const progressSvg = document.querySelector('#progress-logo svg');
      const progressTitle = document.getElementById('progress-title');
      const progressDetail = document.getElementById('progress-detail');

      function sendMessageToMain(message, ...args) {
        window.electronAPI.sendMessageToMain(message, ...args);
      }

      function showProgress(title, detail, showAnimation) {
        progressTitle.innerHTML = title || '';
        progressDetail.innerHTML = detail || '';

        if (showAnimation) {
          progressSvg.unpauseAnimations();
        } else {
          progressSvg.pauseAnimations();
        }
      }

      window.electronAPI.onShowProgress((title, detail, showAnimation) => {
        showProgress(title, detail, showAnimation);
      });

      window.electronAPI.onInstallBundledPythonEnvStatus((status, detail) => {
        const message = status === 'STARTED' ?
          'Installing' :
          status === 'CANCELLED' ?
          'Installation cancelled!' :
          status === 'FAILURE' ?
            'Failed to install!' :
          status === 'SUCCESS' ? 'Installation succeeded. Restarting now...' : '';
        let html = \`<div class="message-row">\$\{message\}</div>\`;
        if (detail) {
          html += \`<div class="message-row">\$\{detail\}</div>\`;
        }
        const showAnimation = status === 'STARTED';
        
        showProgress('Python Environment Install', html, showAnimation);

        if (status === 'SUCCESS') {
          setTimeout(() => {
            sendMessageToMain('${EventTypeMain.RestartApp}');
          }, 2000);
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

  setProgress(title: string, detail: string, showAnimation: boolean) {
    this._viewReady.then(() => {
      this._view.view.webContents.send(
        EventTypeRenderer.ShowProgress,
        title,
        detail,
        showAnimation
      );
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
