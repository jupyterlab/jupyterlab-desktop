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
      resizable: options.resizable !== false,
      titleBarStyle: 'hidden',
      frame: process.platform === 'darwin',
      webPreferences: {
        preload: options.preload
      }
    });

    // hide the traffic lights
    this._window.setWindowButtonVisibility(false);
    this._window.setMenuBarVisibility(false);
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
          }
          body.app-ui-dark {
            background: #212121;
            color: #ffffff;
          }
          .jlab-dialog-body {
            margin: 10px;
          }
          </style>
        </head>
        <body>
        <jlab-dialog-titlebar data-title="${this._window.title}"></jlab-dialog-titlebar>
        <div class="jlab-dialog-body">
        ${bodyHtml}
        </div>
        </body>
      </html>
      `;
    this._window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(pageSource)}`
    );
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
