// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as ejs from 'ejs';
import { BrowserWindow } from 'electron';
import * as path from 'path';
import { appData } from '../config/appdata';
import { ThemedWindow } from '../dialog/themedwindow';
import { EventManager } from '../eventmanager';
import { EventTypeMain, EventTypeRenderer } from '../eventtypes';

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
        jp-menu-item .delete-button {
          width: 20px;
          height: 20px;
          visibility: hidden;
        }
        jp-menu-item:hover .delete-button {
          visibility: visible;
        }
        jp-menu-item .delete-button:hover {
          fill: var(--neutral-fill-strong-hover);
        }
      </style>
      <div style="height: 100%; display: flex; flex-direction: column; row-gap: 5px;">
        <svg class="symbol" style="display: none;">
          <defs>
            <symbol id="circle-xmark" viewBox="0 0 512 512">
              <!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path d="M256 512c141.4 0 256-114.6 256-256S397.4 0 256 0S0 114.6 0 256S114.6 512 256 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/>
            </symbol>
          </defs>
        </svg>
        <div>
          <div style="display: flex; flex-direction: row; align-items: center; flex-grow: 1;">
            <jp-text-field type="url" pattern="https?://.*/lab.*" id="server-url" placeholder="https://example.org/lab?token=abcde" style="width: 100%;" spellcheck="false" required title="Enter the URL of the existing JupyterLab Server including path to JupyterLab application (/lab) and the token as a query parameter. Hit 'Return' key to create the remote session.">
            </jp-text-field>
          </div>
        </div>
        <div style="flex-grow: 1; overflow-x: hidden; overflow-y: auto;">
          <jp-menu id="server-list">
            <jp-menu-item class="category" disabled>Recents</jp-menu-item>
            <% if (recentServers.length === 0) { %>
              <jp-menu-item class="recent-server" disabled>No recent connection history yet</jp-menu-item>  
            <% } %>
            <% recentServers.forEach((remote, index) => { %>
              <jp-menu-item class="recent-server" onclick="onRecentServerClicked(event, <%- index %>);"><%- remote.url %>
                <svg class="delete-button" version="2.0" slot="end" onclick="onDeleteRecentRemoteURLClicked(event, <%- index %>)">
                  <use href="#circle-xmark" />
                </svg>
              </jp-menu-item>
            <% }); %>
            <jp-menu-item class="category" id="running-servers-header" disabled>Local JupyterLab Servers</jp-menu-item>
            <jp-menu-item class="running-server" disabled>Loading...</jp-menu-item>
          </jp-menu>
        </div>
        <div class="row">
          <div>
            <jp-checkbox type="checkbox" id="persist-session-data" <%= persistSessionData ? 'checked' : '' %> title="Persist session data including cookies and cache for the next launch. If the connected JupyterLab Server requires additional authentication such as SSO then persisting the data would allow auto re-login.">Persist session data</jp-checkbox>
          </div>
        </div>
      </div>

      <script>
        let recentServers = <%- JSON.stringify(recentServers) %>;
        const serverUrlInput = document.getElementById('server-url');
        const persistSessionDataCheckbox = document.getElementById('persist-session-data');
        const serverList = document.getElementById('server-list');
        const runningServersHeader = document.getElementById('running-servers-header');
        
        function onRecentServerClicked(el, index) {
          const server = recentServers[index];
          window.electronAPI.setRemoteServerOptions(server.url, persistSessionDataCheckbox.checked);
        }

        function onDeleteRecentRemoteURLClicked(event, index) {
          const server = recentServers[index];
          window.electronAPI.deleteRecentRemoteURL(server.url);
          event.stopPropagation();
        }

        function updateRecentRemoteURLs(recentRemoteURLs) {
          recentServers = recentRemoteURLs;
          // clear list
          serverList.querySelectorAll(".recent-server").forEach((item) => {
            item.remove();
          });

          if (recentServers.length === 0) {
            const menuItem = document.createElement('jp-menu-item');
            menuItem.classList.add("recent-server");
            menuItem.disabled = true;
            menuItem.innerText = 'No recent connection history yet';
            serverList.insertBefore(menuItem, runningServersHeader);
            return;
          }

          const fragment = new DocumentFragment();
          recentServers.forEach((server, index) => {
            const menuItem = document.createElement('jp-menu-item');
            menuItem.classList.add("recent-server");
            menuItem.addEventListener('click', () => {
              onRecentServerClicked(menuItem, index);
            });
            menuItem.innerHTML = server.url + \`<svg class="delete-button" version="2.0" slot="end" onclick="onDeleteRecentRemoteURLClicked(event, \$\{index\})">
                <use href="#circle-xmark" />
              </svg>\`;
            fragment.append(menuItem);
          });

          serverList.insertBefore(fragment, runningServersHeader);
        }

        function updateRunningServerList(runningServers) {
          // clear list
          serverList.querySelectorAll(".running-server").forEach((item) => {
            item.remove();
          });

          if (runningServers.length === 0) {
            const menuItem = document.createElement('jp-menu-item');
            menuItem.classList.add("running-server");
            menuItem.disabled = true;
            menuItem.innerText = 'No locally running JupyterLab server found';
            serverList.append(menuItem);
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

        window.electronAPI.onRecentRemoteURLsUpdated((recentServers) => {
          updateRecentRemoteURLs(recentServers);
        });

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

    this._deleteRecentRemoteUrlHandler = this._handleDeleteRecentRemoteUrl.bind(
      this
    );

    this._evm.registerEventHandler(
      EventTypeMain.DeleteRecentRemoteURL,
      this._deleteRecentRemoteUrlHandler
    );

    this._window.window.on('closed', () => {
      this._evm.unregisterEventHandler(
        EventTypeMain.DeleteRecentRemoteURL,
        this._deleteRecentRemoteUrlHandler
      );
    });
  }

  get window(): BrowserWindow {
    return this._window.window;
  }

  load() {
    this._window.loadDialogContent(this._pageBody);

    this._windowReady = new Promise<void>(resolve => {
      this._window.window.webContents.on('dom-ready', () => {
        resolve();
      });
    });
  }

  updateRecentRemoteURLs() {
    this._windowReady.then(() => {
      this._window.window.webContents.send(
        EventTypeRenderer.UpdateRecentRemoteURLs,
        appData.recentRemoteURLs
      );
    });
  }

  setRunningServerList(runningServers: string[]) {
    this._windowReady.then(() => {
      this._window.window.webContents.send(
        EventTypeRenderer.SetRunningServerList,
        runningServers
      );
    });
  }

  private _handleDeleteRecentRemoteUrl(
    event: Electron.IpcMainEvent,
    url: string
  ) {
    if (event.sender !== this._window.window.webContents) {
      return;
    }

    appData.removeRemoteURLFromRecents(url);
    this.updateRecentRemoteURLs();
  }

  private _window: ThemedWindow;
  private _pageBody: string;
  private _deleteRecentRemoteUrlHandler: (
    event: Electron.IpcMainEvent,
    url: string
  ) => void;
  private _windowReady: Promise<void>;
  private _evm = new EventManager();
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
