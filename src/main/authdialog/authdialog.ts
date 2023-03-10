// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as ejs from 'ejs';
import { BrowserWindow } from 'electron';
import * as path from 'path';
import { ThemedWindow } from '../dialog/themedwindow';

export class AuthDialog {
  constructor(options: AuthDialog.IOptions) {
    this._window = new ThemedWindow({
      isDarkTheme: options.isDarkTheme,
      modal: !!options.parent,
      parent: options.parent,
      title: 'Sign in',
      width: 400,
      height: 260,
      resizable: false,
      preload: path.join(__dirname, './preload.js')
    });

    const host = options.host;

    const template = `
      <style>
        .update-result-container {
          style="height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .row {
          display: flex;
          align-items: center;
          margin: 10px 0;
        }
        jp-text-field {
          width: 100%;
        }
      </style>
      <form onsubmit="handleSubmit()">
        <div class="update-result-container">
          <div class="row" title="<%= host %>"><%= host %></div>
          <div class="row" style="width: 100%">
            <jp-text-field type="text" id="username" placeholder="username" spellcheck="false" required></jp-text-field>
          </div>
          <div class="row" style="width: 100%">
            <jp-text-field type="password" id="password" placeholder="password" spellcheck="false" required></jp-text-field>
          </div>
          <div class="row">
            <jp-button type="submit" id="login-button" appearance="accent">Sign in</jp-button>
          </div>
        </div>
      </form>

      <script>
        function handleSubmit(el) {
          const username = document.getElementById('username').value;
          const password = document.getElementById('password').value;
          window.electronAPI.setAuthDialogResponse(username, password);
        }
      </script>
    `;
    this._pageBody = ejs.render(template, { host });
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

export namespace AuthDialog {
  export interface IOptions {
    host: string;
    isDarkTheme: boolean;
    parent?: BrowserWindow;
  }
}
