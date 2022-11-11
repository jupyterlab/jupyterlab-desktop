// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export class JupyterLabWindow {
  constructor(options: JupyterLabWindow.IWindowOptions) {
    this._window = new BrowserWindow({
      title: options.title,
      width: options.width,
      height: options.height,
      show: false,
      resizable: options.resizable !== false,
      titleBarStyle: 'hidden',
      frame: process.platform === 'darwin',
      webPreferences: {
        preload: options.preload || path.join(__dirname, './preload.js')
      }
    });

    // hide the traffic lights
    if (process.platform === 'darwin') {
      this._window.setWindowButtonVisibility(false);
    }
    this._window.setMenuBarVisibility(false);

    this._window.webContents.on('did-finish-load', () => {
      // wait for CSS to apply
      setTimeout(() => {
        this._window.show();
      }, 200);
    });
  }

  get window(): BrowserWindow {
    return this._window;
  }

  loadDialogContent(bodyHtml: string) {
    let toolkitJsSrc = fs
      .readFileSync(
        path.join(__dirname, '../../../jupyter-ui-toolkit/toolkit.js')
      )
      .toString();
    toolkitJsSrc = `
      ${toolkitJsSrc};
      (async () => {
        baseLayerLuminance.setValueFor(
          document.body,
          await window.electronAPI.isDarkTheme() ? StandardLuminance.DarkMode : StandardLuminance.LightMode);
      })();
    `;
    const titlebarJsSrc = fs.readFileSync(
      path.join(__dirname, './dialogtitlebar.js')
    );

    const pageSource = `
      <html>
        <head>
          <script type="module">${toolkitJsSrc}</script>
          <script type="module">${titlebarJsSrc}</script>
          <script>
            document.addEventListener("DOMContentLoaded", async () => {
              const appConfig = window.electronAPI.getAppConfig();
              const platform = appConfig.platform;
              document.body.dataset.appPlatform = platform;
              document.body.classList.add('app-ui-' + platform);
              if (await window.electronAPI.isDarkTheme()) {
                document.body.classList.add('app-ui-dark');
              }
            });
          </script>
          <style>
          body {
            margin: 0;
            background: #ffffff;
            color: #000000;
            font-size: var(--type-ramp-base-font-size);
            font-family: var(--body-font);
            -webkit-user-select: none;
            user-select: none;
          }
          body.app-ui-dark {
            background: #212121;
            color: #ffffff;
          }
          .page-container {
            display: flex;
            flex-direction: column;
            height: 100%;
          }
          .jlab-dialog-body {
            flex-grow: 1;
            padding: 10px;
            overflow-y: auto;
          }
          </style>
        </head>
        <body>
          <div class="page-container">
            <jlab-dialog-titlebar id="title-bar" data-title="${this._window.title}"></jlab-dialog-titlebar>
            <div class="jlab-dialog-body">
            ${bodyHtml}
            </div>
          </div>
        </body>
      </html>
      `;
    this._window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(pageSource)}`
    );
  }

  focus(): void {
    this._window.focus();
  }

  private _window: BrowserWindow;
}

export namespace JupyterLabWindow {
  export interface IWindowOptions {
    title: string;
    width: number;
    height: number;
    resizable?: boolean;
    preload?: string;
  }
}
