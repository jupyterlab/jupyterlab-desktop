// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { BrowserView } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { DarkThemeBGColor, LightThemeBGColor } from '../utils';

export class ThemedView {
  constructor(options: ThemedView.IOptions) {
    this._isDarkTheme = options.isDarkTheme;
    this._view = new BrowserView({
      webPreferences: {
        preload: options.preload || path.join(__dirname, './preload.js')
      }
    });
    this._view.setBackgroundColor(
      this._isDarkTheme ? DarkThemeBGColor : LightThemeBGColor
    );
  }

  get view(): BrowserView {
    return this._view;
  }

  loadViewContent(bodyHtml: string) {
    const platform = process.platform;
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
      };
    `;

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
            visibility: hidden;
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
            flex-grow: 1;
            padding: 5px;
            overflow-y: auto;
          }
          a {
            color: #505050;
            outline: none;
            text-decoration: none;
          }
          a:hover {
            color: #111111;
          }
          .app-ui-dark a {
            color: #5d96ed;
          }
          .app-ui-dark a:hover {
            color: #85a1cb;
          }
          </style>
          <script type="module">${toolkitJsSrc}</script>
          <script>
            document.addEventListener("DOMContentLoaded", () => {
              document.body.dataset.appPlatform = '${platform}';
              document.body.classList.add('app-ui-' + '${platform}');
            });

            window.addEventListener('load', () => {
              document.body.style.visibility = 'visible';
            });
          </script>
        </head>
        <body class="${this._isDarkTheme ? 'app-ui-dark' : ''}">
          <div class="page-container">
            <div class="jlab-dialog-body">
            ${bodyHtml}
            </div>
          </div>
        </body>
      </html>
      `;
    this._view.webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(pageSource)}`
    );
  }

  private _isDarkTheme: boolean;
  private _view: BrowserView;
}

export namespace ThemedView {
  export interface IOptions {
    isDarkTheme: boolean;
    preload?: string;
  }
}
