// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as ejs from 'ejs';
import * as path from 'path';
import * as fs from 'fs';
import { ThemedWindow } from '../dialog/themedwindow';
import { app } from 'electron';

export class AboutDialog {
  constructor(options: AboutDialog.IOptions) {
    this._window = new ThemedWindow({
      isDarkTheme: options.isDarkTheme,
      title: 'About JupyterLab Desktop',
      width: 400,
      height: 275,
      preload: path.join(__dirname, './preload.js')
    });

    const logoSrc = fs.readFileSync(
      path.join(__dirname, '../../../app-assets/icon.svg')
    );

    const template = `
      <style>
        .dialog-container {
          display: flex;
          flex-direction: column;
          padding: 10px;
        }
        .dialog-container a {
          color: #222222;
          outline: none;
        }
        .app-ui-dark .dialog-container a {
          color: #5d96ed;
        }
        .row {
          display: flex;
          flex-direction: row;
        }
        .logo svg {
          width: 80px;
          height: 80px;
        }
        .logo-row {
          align-items: center;
        }
        .app-title-version {
          padding: 20px;
        }
        .app-title {
          font-size: 20px;
          margin-bottom: 10px;
        }
        .app-version {
          color: var(--neutral-foreground-hint);
        }
        .about-jupyter-row {
          margin: 20px 0;
        }
        .copyright-row {
          margin: 10px 0;
        }
      </style>
      <div class="dialog-container">
        <div class="row logo-row">
          <div class="logo">
            ${logoSrc}
          </div>
          <div class="app-title-version">
            <div class="app-title">
              JupyterLab Desktop
            </div>
            <div class="app-version">
              Version <%= version %>
            </div>
          </div>
        </div>
        <div class="row about-jupyter-row">
          <a href="javascript:void(0)" onclick='handleAboutProjectJupyterLink(this);'>About Project Jupyter</a>
        </div>

        <div class="row copyright-row">
          © 2015-<%= thisYear %>  Project Jupyter Contributors
        </div>

        <script>
          function handleAboutProjectJupyterLink(el) {
            window.electronAPI.launchAboutJupyterPage();
          }
        </script>
      </div>
    `;
    this._pageBody = ejs.render(template, {
      version: app.getVersion(),
      thisYear: new Date().getFullYear()
    });
  }

  get window(): ThemedWindow {
    return this._window;
  }

  load() {
    this._window.loadDialogContent(this._pageBody);
  }

  private _window: ThemedWindow;
  private _pageBody: string;
}

export namespace AboutDialog {
  export interface IOptions {
    isDarkTheme: boolean;
  }
}
