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
      isDarkTheme: options.isDarkTheme,
      parent: options.parent,
      modal: options.modal,
      title: 'Connect to existing JupyterLab Server',
      width: 700,
      height: 400,
      preload: path.join(__dirname, './preload.js')
    });

    const recentServers = appData.recentRemoteURLs;
    const localServers = options.runningServers.map(server => {
      return { url: server };
    });
    const persistSessionData = options.persistSessionData;

    const template = `
      <style>
        .row {display: flex; align-items: center;}
        .row.error {color: rgb(231, 92, 88);}
        .radio-row {align-items: center;}
        #server-url { outline: none; height: 40px; }
        input {
          color-scheme: light;
        }
        .app-ui-dark input {
          color-scheme: dark;
        }
        #server-list {
          max-width: 100%;
          width: 100%;
          box-shadow: none;
        }
        jp-menu {
          background: none;
        }
        jp-menu-item.category {
          color: #777777;
          cursor: default;
          opacity: 1;
          font-weight: bold;
        }
        .app-ui-dark jp-menu-item.category {
          color: #bbbbbb;
        }
        jp-menu-item.category:hover {
          background: none;
        }
        jp-menu-item:not(.category) {
          padding-left: 5px;
        }
        .footer-row {
          margin-bottom: 5px;
          height: 40px;
          overflow-y: hidden;
          justify-content: flex-end;
        }
      </style>
      <div style="height: 100%; display: flex; flex-direction: column; row-gap: 5px;">
        <div>
          <div style="display: flex; flex-direction: row; align-items: center; flex-grow: 1;">
            <jp-text-field type="url" pattern="https?://.*/lab.*" id="server-url" placeholder="https://example.org/lab?token=abcde" style="width: 100%;" spellcheck="false" required title="Enter the URL of the existing JupyterLab Server including path to JupyterLab application (/lab) and the token as a query parameter. Hit 'Return' key to create the remote session.">
            </jp-text-field>
          </div>
        </div>
        <div style="flex-grow: 1; overflow-x: hidden; overflow-y: auto;">
          <jp-menu id="server-list">
            <% if (recentServers.length > 0) { %>
            <jp-menu-item class="category" disabled>Recents</jp-menu-item>
            <% } %>
            <% recentServers.forEach((remote, index) => { %>
              <jp-menu-item onclick="onMenuItemClicked(this, 'recent', <%- index %>);"><%- remote.url %></jp-menu-item>
            <% }); %>
            <% if (localServers.length > 0) { %>
            <jp-menu-item class="category" disabled>Local JupyterLab Servers</jp-menu-item>
            <% } %>
            <% localServers.forEach((remote, index) => { %>
              <jp-menu-item onclick="onMenuItemClicked(this, 'local', <%- index %>);"><%- remote.url %></jp-menu-item>
            <% }); %>
          </jp-menu>
        </div>
        <div class="row">
          <div>
            <jp-checkbox type="checkbox" id="persist-session-data" <%= persistSessionData ? 'checked' : '' %> title="Persist session data including cookies and cache for the next launch. If the connected JupyterLab Server requires additional authentication such as SSO then persisting the data would allow auto re-login.">Persist session data</jp-checkbox>
          </div>
        </div>
      </div>

      <script>
        const recentServers = <%- JSON.stringify(recentServers) %>;
        const localServers = <%- JSON.stringify(localServers) %>;
        const serverUrlInput = document.getElementById('server-url');
        const persistSessionDataCheckbox = document.getElementById('persist-session-data');
        
        function onMenuItemClicked(el, type, index) {
          const server = type == 'recent' ? recentServers[index] : localServers[index];
          window.electronAPI.setRemoteServerOptions(server.url, persistSessionDataCheckbox.checked);
        }

        document.addEventListener("DOMContentLoaded", () => {
          serverUrlInput.control.onkeydown = (event) => {
            if (event.key === "Enter") {
              window.electronAPI.setRemoteServerOptions(serverUrlInput.value, persistSessionDataCheckbox.checked);
            }
          };
        });
      </script>
        `;
    this._pageBody = ejs.render(template, {
      recentServers,
      localServers,
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
    isDarkTheme: boolean;
    parent?: BrowserWindow;
    modal?: boolean;
    runningServers: string[];
    persistSessionData: boolean;
  }
}
