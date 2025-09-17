// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { BrowserView } from 'electron';
import { DarkThemeBGColor, getUserHomeDir, LightThemeBGColor } from '../utils';
import * as path from 'path';
import * as fs from 'fs';
import { appData } from '../config/appdata';
import { IRegistry } from '../registry';
import { EventTypeMain, EventTypeRenderer } from '../eventtypes';

const maxRecentItems = 5;

interface IRecentSessionListItem {
  isRemote: boolean;
  linkLabel: string;
  linkTooltip: string;
  linkDetail?: string;
}

export class WelcomeView {
  constructor(options: WelcomeView.IOptions) {
    this._registry = options.registry;
    this._isDarkTheme = options.isDarkTheme;
    this._view = new BrowserView({
      webPreferences: {
        preload: path.join(__dirname, './preload.js'),
        devTools: process.env.NODE_ENV === 'development'
      }
    });

    this._view.setBackgroundColor(
      this._isDarkTheme ? DarkThemeBGColor : LightThemeBGColor
    );

    const mitoWordmarkSrc = fs.readFileSync(
      path.join(__dirname, '../../../app-assets/mito-wordmark.svg')
    );
    const notebookIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" viewBox="0 0 22 22">
      <g class="jp-icon-warn0 jp-icon-selectable" fill="#EF6C00">
        <path d="M18.7 3.3v15.4H3.3V3.3h15.4m1.5-1.5H1.8v18.3h18.3l.1-18.3z"/>
        <path d="M16.5 16.5l-5.4-4.3-5.6 4.3v-11h11z"/>
      </g>
      </svg>`;
    const openIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path d="M88.7 223.8L0 375.8V96C0 60.7 28.7 32 64 32H181.5c17 0 33.3 6.7 45.3 18.7l26.5 26.5c12 12 28.3 18.7 45.3 18.7H416c35.3 0 64 28.7 64 64v32H144c-22.8 0-43.8 12.1-55.3 31.8zm27.6 16.1C122.1 230 132.6 224 144 224H544c11.5 0 22 6.1 27.7 16.1s5.7 22.2-.1 32.1l-112 192C453.9 474 443.4 480 432 480H32c-11.5 0-22-6.1-27.7-16.1s-5.7-22.2 .1-32.1l112-192z"/></svg>`;

    this._pageSource = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0">
          <title>Welcome to Mito</title>
          <style>
            body {
              background: ${this._isDarkTheme ? '#1a1a1a' : '#ffffff'};
              color: ${this._isDarkTheme ? '#ffffff' : '#000000'};
              margin: 0;
              overflow: hidden;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica,
                Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji',
                'Segoe UI Symbol';
              font-size: 14px;
              -webkit-user-select: none;
              user-select: none;
            }
            
            .container {
              height: 100vh;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: flex-start;
              padding: 25vh 40px 40px 40px;
            }
            
            .header {
              text-align: center;
              margin-bottom: 40px;
            }
            
            .logo-container {
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 20px;
            }
            
            .logo svg {
              width: 180px;
            }
            
            .subtitle {
              font-size: 16px;
              color: ${this._isDarkTheme ? '#888888' : '#666666'};
              margin-top: 8px;
            }
            
            .actions-container {
              display: flex;
              gap: 16px;
              margin-bottom: 20px;
              flex-wrap: wrap;
              justify-content: center;
            }
            
            .action-button {
              display: flex;
              align-items: center;
              padding: 16px 24px;
              background: ${this._isDarkTheme ? '#2a2a2a' : '#f5f5f5'};
              border: 1px solid ${this._isDarkTheme ? '#404040' : '#e0e0e0'};
              border-radius: 8px;
              text-decoration: none;
              color: ${this._isDarkTheme ? '#ffffff' : '#000000'};
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.2s ease;
              min-width: 160px;
              justify-content: center;
            }
            
            .action-button:hover {
              background: ${this._isDarkTheme ? '#3a3a3a' : '#eeeeee'};
              border-color: ${this._isDarkTheme ? '#555555' : '#d0d0d0'};
              transform: translateY(-1px);
            }
            
            .action-button:active {
              transform: translateY(0);
            }
            
            .action-button.disabled {
              opacity: 0.5;
              pointer-events: none;
            }
            
            .action-icon {
              margin-right: 12px;
              display: flex;
              align-items: center;
            }
            
            .action-icon svg {
              width: 20px;
              height: 20px;
              fill: ${this._isDarkTheme ? '#ffffff' : '#000000'};
            }
            
            .content-section {
              display: flex;
              width: 100%;
              max-width: 800px;
              gap: 60px;
              justify-content: center;
            }
            
            .recent-section {
              max-width: 400px;
              width: 100%;
            }
            
            .section-title {
              font-size: 14px;
              font-weight: 500;
              margin-bottom: 16px;
              color: ${this._isDarkTheme ? '#ffffff' : '#000000'};
            }
            
            .recent-list {
              display: flex;
              flex-direction: column;
              gap: 6px;
            }
            
            .recent-item {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 8px 12px;
              background: ${this._isDarkTheme ? '#2a2a2a' : '#f8f8f8'};
              border: 1px solid ${this._isDarkTheme ? '#404040' : '#e0e0e0'};
              border-radius: 6px;
              cursor: pointer;
              transition: all 0.2s ease;
              position: relative;
            }
            
            .recent-item:hover {
              background: ${this._isDarkTheme ? '#3a3a3a' : '#f0f0f0'};
            }
            
            .recent-item.disabled {
              opacity: 0.5;
              pointer-events: none;
            }
            
            .recent-item-content {
              display: flex;
              align-items: center;
              justify-content: space-between;
              flex: 1;
              margin-right: 8px;
            }
            
            .recent-item-name {
              font-weight: 400;
              color: ${this._isDarkTheme ? '#ffffff' : '#000000'};
              font-size: 13px;
            }
            
            .recent-item-path {
              font-size: 11px;
              color: ${this._isDarkTheme ? '#888888' : '#666666'};
              margin-left: 12px;
            }
            
            .recent-item-delete {
              position: absolute;
              right: 12px;
              top: 50%;
              transform: translateY(-50%);
              width: 20px;
              height: 20px;
              opacity: 0;
              transition: opacity 0.2s ease;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            
            .recent-item:hover .recent-item-delete {
              opacity: 1;
            }
            
            .recent-item-delete svg {
              width: 14px;
              height: 14px;
              fill: ${this._isDarkTheme ? '#888888' : '#666666'};
            }
            
            .recent-item-delete:hover svg {
              fill: ${this._isDarkTheme ? '#ff6b6b' : '#e74c3c'};
            }
            
            .no-recent-message {
              color: ${this._isDarkTheme ? '#888888' : '#666666'};
              font-style: italic;
              text-align: center;
              padding: 40px 20px;
              background: ${this._isDarkTheme ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'};
              border: 1px dashed ${this._isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
              border-radius: 8px;
              margin: 20px 0;
            }
            
            .view-all-link {
              color: ${this._isDarkTheme ? '#4a9eff' : '#0066cc'};
              text-decoration: none;
              font-size: 12px;
              margin-top: 8px;
              display: inline-block;
            }
            
            .view-all-link:hover {
              text-decoration: underline;
            }
            
            #notification-panel {
              position: fixed;
              bottom: 20px;
              left: 50%;
              transform: translateX(-50%);
              display: none;
              background: ${this._isDarkTheme ? '#2a2a2a' : '#ffffff'};
              border: 1px solid ${this._isDarkTheme ? '#404040' : '#e0e0e0'};
              border-radius: 8px;
              padding: 16px 20px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
              align-items: center;
              gap: 12px;
              max-width: 500px;
              z-index: 1000;
            }
            
            #notification-panel-message {
              flex: 1;
              color: ${this._isDarkTheme ? '#ffffff' : '#000000'};
            }
            
            #notification-panel .close-button {
              width: 16px;
              height: 16px;
              fill: ${this._isDarkTheme ? '#888888' : '#666666'};
              cursor: pointer;
            }
            
            #notification-panel .close-button:hover {
              fill: ${this._isDarkTheme ? '#ffffff' : '#000000'};
            }
            
            .recent-expander {
              display: none;
              text-align: center;
              margin-top: 12px;
            }
            
            .recent-expander a {
              color: ${this._isDarkTheme ? '#4a9eff' : '#0066cc'};
              text-decoration: none;
              font-size: 12px;
            }
            
            .recent-expander a:hover {
              text-decoration: underline;
            }
            
            .install-python-button {
              display: inline-block;
              background: ${this._isDarkTheme ? '#4a9eff' : '#0066cc'};
              color: #fff;
              padding: 6px 12px;
              border-radius: 4px;
              text-decoration: none;
              font-size: 12px;
              font-weight: 500;
              margin-left: 8px;
              transition: all 0.2s ease;
              border: none;
              cursor: pointer;
            }
            
            .install-python-button:hover {
              background: ${this._isDarkTheme ? '#3a8bdf' : '#0052a3'};
              transform: translateY(-1px);
            }
            
            .install-python-button:active {
              transform: translateY(0);
            }
          </style>
          <script>
            document.addEventListener("DOMContentLoaded", () => {
              const platform = "${process.platform}";
              document.body.dataset.appPlatform = platform;
              document.body.classList.add('app-ui-' + platform);
            });
          </script>
        </head>
      
        <body class="${this._isDarkTheme ? 'app-ui-dark' : ''}" title="">
          <svg class="symbol" style="display: none;">
            <defs>
              <symbol id="circle-xmark" viewBox="0 0 512 512">
                <path d="M256 512c141.4 0 256-114.6 256-256S397.4 0 256 0S0 114.6 0 256S114.6 512 256 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/>
              </symbol>
              <symbol id="triangle-exclamation" viewBox="0 0 512 512">
                <path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480H40c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24V296c0 13.3 10.7 24 24 24s24-10.7 24-24V184c0-13.3-10.7-24-24-24zm32 224c0-17.7-14.3-32-32-32s-32 14.3-32 32s14.3 32 32 32s32-14.3 32-32z"/>
              </symbol>
            </defs>
          </svg>

          <div class="container">
            <div class="header">
              <div class="logo-container">
                <div class="logo">
                  ${mitoWordmarkSrc}
                </div>
              </div>
              <p class="subtitle">Data analysis made simple</p>
            </div>

            <div class="actions-container">
              <a class="action-button" id="new-notebook-link" href="javascript:void(0)" title="Create new notebook in the default working directory" onclick="handleNewSessionClick('notebook');">
                <div class="action-icon">${notebookIcon}</div>
                New notebook
              </a>
              ${
                process.platform === 'darwin'
                  ? `<a class="action-button" id="open-file-or-folder-link" href="javascript:void(0)" title="Open a notebook or folder in JupyterLab" onclick="handleNewSessionClick('open');">
                      <div class="action-icon">${openIcon}</div>
                      Open
                    </a>`
                  : `<a class="action-button" id="open-file-link" href="javascript:void(0)" title="Open a notebook or file in JupyterLab" onclick="handleNewSessionClick('open-file');">
                      <div class="action-icon">${openIcon}</div>
                      Open File
                    </a>
                    <a class="action-button" id="open-folder-link" href="javascript:void(0)" title="Open a folder in JupyterLab" onclick="handleNewSessionClick('open-folder');">
                      <div class="action-icon">${openIcon}</div>
                      Open Folder
                    </a>`
              }
            </div>

            <div class="content-section">
              <div class="recent-section">
                <h2 class="section-title">Recent sessions</h2>
                <div id="recent-sessions-list" class="recent-list">
                  <!-- Recent sessions will be populated here -->
                </div>
                <div id="recent-expander" class="recent-expander">
                  <a href="javascript:void(0)" onclick="handleExpandCollapseRecents();">
                    <span id="expand-collapse-text">More...</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div id="notification-panel">
            <div id="notification-panel-message"></div>
            <div id="notification-panel-close" title="Close" onclick="closeNotificationPanel(event)">
              <svg class="close-button" version="2.0">
                <use href="#circle-xmark" />
              </svg>
            </div>
          </div>

          <script>
          const notificationPanel = document.getElementById('notification-panel');
          const notificationPanelMessage = document.getElementById('notification-panel-message');
          const notificationPanelCloseButton = document.getElementById('notification-panel-close');
          const recentSessionsList = document.getElementById('recent-sessions-list');
          const recentExpander = document.getElementById('recent-expander');
          const expandCollapseText = document.getElementById('expand-collapse-text');

          function updateRecentSessionList(recentSessions, resetCollapseState) {
            const maxRecentItems = ${maxRecentItems};
            
            // Clear list
            recentSessionsList.innerHTML = '';

            let recentSessionCount = 0;

            for (const recentSession of recentSessions) {
              const {isRemote, linkLabel, linkTooltip, linkDetail} = recentSession;
              const recentItem = document.createElement('div');
              recentItem.classList.add('recent-item');
              if (!isRemote) {
                recentItem.classList.add('recent-item-local');
              }
              recentItem.dataset.sessionIndex = recentSessionCount;
              recentItem.innerHTML = \`
                <div class="recent-item-content">
                  <div class="recent-item-name">\${linkLabel}</div>
                  \${linkDetail ? \`<div class="recent-item-path">\${linkDetail}</div>\` : ''}
                </div>
                <div class="recent-item-delete" title="Remove" onclick="handleRecentSesssionDeleteClick(event)">
                  <svg version="2.0">
                    <use href="#circle-xmark" />
                  </svg>
                </div>
              \`;

              recentItem.addEventListener('click', (event) => {
                if (!event.target.closest('.recent-item-delete')) {
                  handleRecentSessionClick(event);
                }
              });

              recentSessionsList.appendChild(recentItem);
              recentSessionCount++;
            }

            if (recentSessionCount === 0) {
              const noHistoryMessage = document.createElement('div');
              noHistoryMessage.className = 'no-recent-message';
              noHistoryMessage.innerText = 'No recent sessions';
              recentSessionsList.appendChild(noHistoryMessage);
            }

            // Handle expand/collapse
            resetCollapseState = resetCollapseState || recentSessionCount <= maxRecentItems;

            if (resetCollapseState) {
              if (recentSessionCount > maxRecentItems) {
                recentSessionsList.classList.add('recents-collapsed');
                recentExpander.style.display = 'block';
                
                // Hide items beyond maxRecentItems
                const items = recentSessionsList.querySelectorAll('.recent-item');
                items.forEach((item, index) => {
                  if (index >= maxRecentItems) {
                    item.style.display = 'none';
                  }
                });
              } else {
                recentSessionsList.classList.remove('recents-collapsed');
                recentSessionsList.classList.remove('recents-expanded');
                recentExpander.style.display = 'none';
              }
            }
          }

          window.electronAPI.onSetRecentSessionList((recentSessions, resetCollapseState) => {
            updateRecentSessionList(recentSessions, resetCollapseState);
          });

          document.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.stopPropagation();
          });
          
          document.addEventListener('drop', (event) => {
            event.preventDefault();
            event.stopPropagation();
        
            const files = [];
            for (const file of event.dataTransfer.files) {
              files.push(file.path);
            }

            window.electronAPI.openDroppedFiles(files);
          });

          function handleNewSessionClick(type) {
            window.electronAPI.newSession(type);
          }

          function handleRecentSessionClick(event) {
            const item = event.currentTarget.closest('.recent-item');
            if (!item) {
              return;
            }
            const sessionIndex = parseInt(item.dataset.sessionIndex);
            window.electronAPI.openRecentSession(sessionIndex);
          }

          function handleRecentSesssionDeleteClick(event) {
            event.stopPropagation();
            const item = event.currentTarget.closest('.recent-item');
            if (!item) {
              return;
            }
            const sessionIndex = parseInt(item.dataset.sessionIndex);
            window.electronAPI.deleteRecentSession(sessionIndex);
          }

          function handleExpandCollapseRecents() {
            const isCollapsed = recentSessionsList.classList.contains("recents-collapsed");
            const items = recentSessionsList.querySelectorAll('.recent-item');
            
            if (isCollapsed) {
              recentSessionsList.classList.remove("recents-collapsed");
              recentSessionsList.classList.add("recents-expanded");
              expandCollapseText.innerText = "Less...";
              
              // Show all items
              items.forEach(item => {
                item.style.display = 'flex';
              });
            } else {
              recentSessionsList.classList.remove("recents-expanded");
              recentSessionsList.classList.add("recents-collapsed");
              expandCollapseText.innerText = "More...";
              
              // Hide items beyond maxRecentItems
              items.forEach((item, index) => {
                if (index >= ${maxRecentItems}) {
                  item.style.display = 'none';
                }
              });
            }
          }

          function sendMessageToMain(message, ...args) {
            window.electronAPI.sendMessageToMain(message, ...args);
          }

          function showNotificationPanel(message, closable) {
            notificationPanelMessage.innerHTML = message;
            notificationPanelCloseButton.style.display = closable ? 'block' : 'none'; 
            notificationPanel.style.display = message === "" ? "none" : "flex";
          }

          function closeNotificationPanel() {
            notificationPanel.style.display = "none";
          }

          function enableLocalServerActions(enable) {
            const serverActionIds = ["new-notebook-link", "new-session-link", "open-file-or-folder-link", "open-file-link", "open-folder-link"];
            serverActionIds.forEach(id => {
              const link = document.getElementById(id);
              if (link) {
                if (enable) {
                  link.classList.remove("disabled");
                } else {
                  link.classList.add("disabled");
                }
              }
            });

            document.querySelectorAll('.recent-item-local').forEach(link => {
              if (enable) {
                link.classList.remove("disabled");
              } else {
                link.classList.add("disabled");
              }
            });
          }

          window.electronAPI.onSetNotificationMessage((message, closable) => {
            showNotificationPanel(message, closable);
          });

          window.electronAPI.onEnableLocalServerActions((enable) => {
            enableLocalServerActions(enable);
          });

          window.electronAPI.onInstallBundledPythonEnvStatus((status, detail) => {
            let message = status === 'STARTED' ?
              'Installing Python environment...' :
              status === 'CANCELLED' ?
              'Installation cancelled!' :
              status === 'FAILURE' ?
                'Failed to install!' :
              status === 'SUCCESS' ? 'Installation succeeded.' : '';
            if (detail) {
              message += \`[\$\{detail\}]\`;
            }

            showNotificationPanel(message, status === 'CANCELLED' || status === 'FAILURE');
    
            if (status === 'SUCCESS') {
              setTimeout(() => {
                showNotificationPanel('', true);
              }, 2000);
            }
          });
          </script>
        </body>
      </html>
      `;
  }

  get view(): BrowserView {
    return this._view;
  }

  load() {
    this._view.webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(this._pageSource)}`
    );

    this._viewReady = new Promise<void>(resolve => {
      this._view.webContents.on('dom-ready', () => {
        resolve();
      });
    });

    this.updateRecentSessionList(true);

    this._registry.environmentListUpdated.connect(
      this._onEnvironmentListUpdated,
      this
    );

    this._view.webContents.on('destroyed', () => {
      this._registry.environmentListUpdated.disconnect(
        this._onEnvironmentListUpdated,
        this
      );
    });
    this._onEnvironmentListUpdated();
  }

  enableLocalServerActions(enable: boolean) {
    this._viewReady.then(() => {
      this._view.webContents.send(
        EventTypeRenderer.EnableLocalServerActions,
        enable
      );
    });
  }

  showNotification(message: string, closable: boolean) {
    this._viewReady.then(() => {
      this._view.webContents.send(
        EventTypeRenderer.SetNotificationMessage,
        message,
        closable
      );
    });
  }

  private async _onEnvironmentListUpdated() {
    this._registry
      .getDefaultEnvironment()
      .then(() => {
        this.enableLocalServerActions(true);
        this.showNotification('', false);
      })
      .catch(() => {
        this.enableLocalServerActions(false);
        this.showNotification(
          `
          <div class="warning-message">
            Before you start, we need to set up your workspace. <a class="install-python-button" href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.InstallBundledPythonEnv}')">Get Started</a>
          </div>
        `,
          false
        );
      });
  }

  updateRecentSessionList(resetCollapseState: boolean) {
    const recentSessionList: IRecentSessionListItem[] = [];
    const home = getUserHomeDir();

    for (const recentSession of appData.recentSessions) {
      let sessionItem = '';
      let sessionDetail = '';
      let tooltip = '';
      let parent = '';
      if (recentSession.remoteURL) {
        const url = new URL(recentSession.remoteURL);
        sessionItem = url.origin;
        tooltip = `${recentSession.remoteURL}\nSession data ${
          recentSession.persistSessionData ? '' : 'not '
        }persisted`;
        sessionDetail = '';
      } else {
        // local
        if (recentSession.filesToOpen.length > 0) {
          sessionItem = path.basename(recentSession.filesToOpen[0]);
          tooltip = recentSession.filesToOpen.join(', ');
          parent = recentSession.workingDirectory;
        } else {
          sessionItem = path.basename(recentSession.workingDirectory);
          parent = path.dirname(recentSession.workingDirectory);
          tooltip = recentSession.workingDirectory;
        }

        if (parent.startsWith(home)) {
          const relative = path.relative(home, parent);
          sessionDetail = `~${path.sep}${relative}`;
        } else {
          sessionDetail = parent;
        }
      }

      recentSessionList.push({
        isRemote: !!recentSession.remoteURL,
        linkLabel: sessionItem,
        linkTooltip: tooltip,
        linkDetail: sessionDetail
      });
    }

    this._viewReady.then(() => {
      this._view.webContents.send(
        EventTypeRenderer.SetRecentSessionList,
        recentSessionList,
        resetCollapseState
      );
    });
  }

  private _isDarkTheme: boolean;
  private _view: BrowserView;
  private _viewReady: Promise<void>;
  private _registry: IRegistry;
  private _pageSource: string;
}

export namespace WelcomeView {
  export interface IOptions {
    isDarkTheme: boolean;
    registry: IRegistry;
  }
}
