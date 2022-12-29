// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as ejs from 'ejs';
import { BrowserWindow } from 'electron';
import * as path from 'path';
import { ThemedWindow } from '../dialog/themedwindow';
import { appData } from '../settings';

export class RemoteServerSelectDialog {
  constructor(options: RemoteServerSelectDialog.IOptions) {
    this._window = new ThemedWindow({
      parent: options.parent,
      modal: options.modal,
      title: 'Remote Server Connection',
      width: 700,
      height: 400,
      preload: path.join(__dirname, './preload.js')
    });

    const remoteServerUrl = options.remoteURL;
    const persistSessionData = options.persistSessionData;

    const template = `
      <style>
        .row {display: flex; align-items: center;}
        .row.error {color: rgb(231, 92, 88);}
        .radio-row {align-items: center;}
        #server-url { outline: none; height: 40px; }
        #server-url:invalid { border-color: red; }
        input {
          color-scheme: light;
        }
        .app-ui-dark input {
          color-scheme: dark;
        }
        .footer-row {
          margin-bottom: 5px;
          height: 40px;
          overflow-y: hidden;
          justify-content: flex-end;
        }
      </style>
      <div style="height: 100%; display: flex; flex-direction: column; row-gap: 5px;">
        <div style="flex-grow: 1; overflow-y: auto;">
          <div>
            <div class="row" style="line-height: 30px;">
              <b>Server URL</b>
            </div>
            <div class="row">
              <div style="flex-grow: 1;">
                <input type="url" pattern="https?://.*/lab.*" id="server-url" value="<%= remoteServerUrl %>" list="recent-remote-servers" placeholder="https://example.org/lab?token=abcde" style="width: 100%;" spellcheck="false" required title="Enter the URL of the existing JupyterLab Server including path to JupyterLab application (/lab) and the token as a query parameter."></input>
              </div>
              <datalist id="recent-remote-servers">
                ${appData.recentRemoteURLs
                  .map(value => {
                    return `<option>${value.url}</option>`;
                  })
                  .join('')}
              </datalist>
            </div>
            <div class="row">
              <div>
                <jp-checkbox type="checkbox" id="persist-session-data" <%= persistSessionData ? 'checked' : '' %> title="Persist session data including cookies and cache for the next launch. If the connected JupyterLab Server requires additional authentication such as SSO then persisting the data would allow auto re-login.">Persist session data</jp-checkbox>
              </div>
            </div>
          </div>
        </div>

        <div class="row footer-row">
          <jp-button id="connect" onclick='handleConnect(this);' style='margin-right: 5px;' appearance="accent">Connect</jp-button>
        </div>
      </div>

      <script>
        const serverUrlInput = document.getElementById('server-url');
        const persistSessionDataCheckbox = document.getElementById('persist-session-data');

        function handleConnect(el) {
          window.electronAPI.setRemoteServerOptions(serverUrlInput.value, persistSessionDataCheckbox.checked);
        }
      </script>
        `;
    this._pageBody = ejs.render(template, {
      remoteServerUrl,
      persistSessionData
    });
  }

  get window(): BrowserWindow {
    return this._window.window;
  }

  load() {
    this._window.loadDialogContent(this._pageBody);
  }

  private _window: ThemedWindow;
  private _pageBody: string;
}

export namespace RemoteServerSelectDialog {
  export interface IOptions {
    parent?: BrowserWindow;
    modal?: boolean;
    remoteURL: string;
    persistSessionData: boolean;
  }
}
