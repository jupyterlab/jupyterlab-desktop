// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { DarkThemeBGColor, LightThemeBGColor } from '../utils';

export class ThemedWindow {
  constructor(options: ThemedWindow.IOptions) {
    this._isDarkTheme = options.isDarkTheme;
    this._closable = options.closable !== false;
    this._window = new BrowserWindow({
      parent: options.parent,
      modal: options.modal,
      title: options.title,
      width: options.width,
      height: options.height,
      show: false,
      closable: this._closable,
      resizable: options.resizable !== false,
      titleBarStyle: 'hidden',
      frame: process.platform === 'darwin',
      backgroundColor: this._isDarkTheme ? DarkThemeBGColor : LightThemeBGColor,
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
      this._window.show();
    });
  }

  get window(): BrowserWindow {
    return this._window;
  }

  close() {
    this._window.closable = true;
    this._window.close();
  }

  loadDialogContent(bodyHtml: string) {
    let toolkitJsSrc = fs
      .readFileSync(
        path.join(__dirname, '../../../jupyter-ui-toolkit/toolkit.js')
      )
      .toString();
    toolkitJsSrc = `
      ${toolkitJsSrc};
      {
        const darkTheme = ${this._isDarkTheme.toString()};
        document.body.dataset.jpThemeLight = !darkTheme;
        document.body.dataset.jpThemeName = 'jlab-desktop-theme';
        provideJupyterDesignSystem().register(allComponents);
        addJupyterLabThemeChangeListener();
      }
    `;
    const titlebarJsSrc = fs.readFileSync(
      path.join(__dirname, './dialogtitlebar.js')
    );

    const pageSource = `
      <html>
        <head>
          <style>
          :root {
            --jp-brand-color1: var(--md-blue-700);
            --jp-border-width: 1px;
            --jp-border-color1: var(--md-grey-400);
            --jp-ui-font-size1: 13px;
            --md-grey-400: #78909C;
            --md-blue-700: #1976D2;
          }
          body {
            margin: 0;
            background: ${LightThemeBGColor};
            color: #000000;
            font-size: var(--type-ramp-base-font-size);
            font-family: var(--body-font);
            -webkit-user-select: none;
            user-select: none;
          }
          body.app-ui-dark {
            background: ${DarkThemeBGColor};
            color: #ffffff;
          }
          .page-container {
            display: flex;
            flex-direction: column;
            height: 100%;
          }
          .jlab-dialog-body {
            visibility: hidden;
            flex-grow: 1;
            padding: 10px;
            overflow-y: auto;
          }
          </style>
          <script type="module">${toolkitJsSrc}</script>
          <script type="module">${titlebarJsSrc}</script>
          <script>
            document.addEventListener("DOMContentLoaded", () => {
              const platform = "${process.platform}";
              document.body.dataset.appPlatform = platform;
              document.body.classList.add('app-ui-' + platform);
            });
            window.addEventListener('load', () => {
              document.getElementById('jlab-dialog-body').style.visibility = 'visible';
            });
          </script>
        </head>
        <body class="${this._isDarkTheme ? 'app-ui-dark' : ''}">
          <div class="page-container">
            <jlab-dialog-titlebar id="title-bar" data-title="${
              this._window.title
            }" data-closable="${this._closable ? 'true' : 'false'}" class="${
      this._isDarkTheme ? 'app-ui-dark' : ''
    }"></jlab-dialog-titlebar>
            <div id="jlab-dialog-body" class="jlab-dialog-body">
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

  private _isDarkTheme: boolean;
  private _closable: boolean;
  private _window: BrowserWindow;
}

export namespace ThemedWindow {
  export interface IOptions {
    isDarkTheme: boolean;
    parent?: BrowserWindow;
    modal?: boolean;
    title: string;
    width: number;
    height: number;
    closable?: boolean;
    resizable?: boolean;
    preload?: string;
  }
}
