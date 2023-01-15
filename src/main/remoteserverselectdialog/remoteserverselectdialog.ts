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
        jp-menu-item {
          width: 100%;
        }
        jp-menu-item::part(content) {
          width: 100%;
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
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
              <jp-menu-item onclick="onRecentServerClicked(this, <%- index %>);"><%- remote.url %></jp-menu-item>
            <% }); %>
            <jp-menu-item class="category" disabled>Local JupyterLab Servers</jp-menu-item>
            <jp-menu-item class="running-server">Loading...</jp-menu-item>
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
        const serverUrlInput = document.getElementById('server-url');
        const persistSessionDataCheckbox = document.getElementById('persist-session-data');
        const serverList = document.getElementById('server-list');
        
        function onRecentServerClicked(el, index) {
          const server = recentServers[index];
          window.electronAPI.setRemoteServerOptions(server.url, persistSessionDataCheckbox.checked);
        }

        function updateRunningServerList(runningServers) {
          // clear list
          serverList.querySelectorAll(".running-server").forEach((item) => {
            item.remove();
          });

          if (runningServers.length === 0) {
            return;
          }

          const fragment = new DocumentFragment();
          runningServers.forEach((server, index) => {
            const menuItem = document.createElement('jp-menu-item');
            menuItem.classList.add("running-server");
            menuItem.addEventListener('click', () => {
              window.electronAPI.setRemoteServerOptions(server.url, persistSessionDataCheckbox.checked);
            });
            menuItem.innerText = server.url;
            fragment.append(menuItem);
          });

          serverList.append(fragment);
        }

        window.electronAPI.onRunningServerListSet((runningServers) => {
          const list = runningServers.map(server => {
            return { url: server };
          });
          updateRunningServerList(list);
        });

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
      persistSessionData
    });
  }

  get window(): BrowserWindow {
    return this._window.window;
  }

  load() {
    this._window.loadDialogContent(this._pageBody);
  }

  setRunningServerList(runningServers: string[]) {
    this._window.window.webContents.send(
      'set-running-server-list',
      runningServers
    );
  }

  private _window: ThemedWindow;
  private _pageBody: string;
}

export namespace RemoteServerSelectDialog {
  export interface IOptions {
    isDarkTheme: boolean;
    parent?: BrowserWindow;
    modal?: boolean;
    runningServers?: string[];
    persistSessionData: boolean;
  }
}
