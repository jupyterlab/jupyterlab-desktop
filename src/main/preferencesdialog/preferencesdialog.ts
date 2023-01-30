// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as ejs from 'ejs';
import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
const semver = require('semver');
import { ThemedWindow } from '../dialog/themedwindow';
import { FrontEndMode, StartupMode, ThemeType } from '../config/settings';
import { getBundledPythonPath } from '../utils';
import { IRegistry } from '../registry';

export class PreferencesDialog {
  constructor(options: PreferencesDialog.IOptions, registry: IRegistry) {
    this._window = new ThemedWindow({
      isDarkTheme: options.isDarkTheme,
      title: 'Preferences',
      width: 700,
      height: 400,
      preload: path.join(__dirname, './preload.js')
    });

    const {
      startupMode,
      theme,
      syncJupyterLabTheme,
      showNewsFeed,
      frontEndMode,
      checkForUpdatesAutomatically,
      defaultWorkingDirectory
    } = options;
    const installUpdatesAutomaticallyEnabled = process.platform === 'darwin';
    const installUpdatesAutomatically =
      installUpdatesAutomaticallyEnabled && options.installUpdatesAutomatically;
    let defaultPythonPath = options.defaultPythonPath;
    const bundledPythonPath = getBundledPythonPath();

    if (defaultPythonPath === '') {
      defaultPythonPath = bundledPythonPath;
    }
    let bundledEnvInstallationExists = false;
    try {
      bundledEnvInstallationExists = fs.existsSync(bundledPythonPath);
    } catch (error) {
      console.error('Failed to check for bundled Python path', error);
    }

    const selectBundledPythonPath =
      (defaultPythonPath === '' || defaultPythonPath === bundledPythonPath) &&
      bundledEnvInstallationExists;

    let bundledEnvInstallationLatest = true;

    if (bundledEnvInstallationExists) {
      try {
        const bundledEnv = registry.getEnvironmentByPath(bundledPythonPath);
        const jlabVersion = bundledEnv.versions['jupyterlab'];
        const appVersion = app.getVersion();
        const diff = semver.diff(appVersion, jlabVersion);
        if (diff !== 'prerelease') {
          bundledEnvInstallationLatest = false;
        }
      } catch (error) {
        console.error('Failed to check bundled environment update', error);
      }
    }

    const template = `
      <style>
      #container {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      #content-area {
        display: flex;
        flex-direction: row;
        column-gap: 20px;
        flex-grow: 1;
        overflow-y: auto;
      }
      #categories {
        width: 200px;
      }
      #category-content-container {
        flex-grow: 1;
      }
      .category-content {
        display: flex;
        flex-direction: column;
      }
      #footer {
        text-align: right;
      }
      #category-jupyterlab jp-divider {
        margin: 15px 0;
      }
      #server-config-section {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
      }
      jp-tab-panel #tab-updates {
        display: flex;
        align-items: flex-start;
      }
      #category-tabs {
        width: 100%;
      }
      #bundled-env-warning {
        display: none;
        align-items: center;
      }
      #bundled-env-warning.warning {
        color: orange;
      }
      #install-bundled-env {
        display: none;
      }
      #update-bundled-env {
        display: none;
      }
      .row {
        display: flex;
        align-items: center;
      }
      .footer-row {
        height: 50px;
        overflow-y: hidden;
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        align-items: center;
      }
      .progress-message {
        margin-right: 5px; line-height: 24px; visibility: hidden;
      }
      .progress-animation {
        margin-right: 5px; visibility: hidden;
      }
      #news-feed-settings {
        display: flex;
        flex-direction: column;
        margin: 10px 0;
      }
      #clear-history {
        display: flex;
        flex-direction: column;
      }
      #clear-history-progress {
        visibility: hidden;
      }
      </style>
      <div id="container">
        <div id="content-area">
          <jp-tabs id="category-tabs" false="" orientation="vertical">
            <jp-tab id="tab-general">
              General
            </jp-tab>
            <jp-tab id="tab-server">
              Server
            </jp-tab>
            <jp-tab id="tab-updates">
              Updates
            </jp-tab>
            <jp-tab id="tab-privacy">
              Privacy
            </jp-tab>

            <jp-tab-panel id="tab-panel-general">
              <jp-radio-group orientation="horizontal">
                <label slot="label">On startup</label>
                <jp-radio name="startup-mode" value="welcome-page" <%= startupMode === 'welcome-page' ? 'checked' : '' %>>Show welcome page</jp-radio>
                <jp-radio name="startup-mode" value="new-local-session" <%= startupMode === 'new-local-session' ? 'checked' : '' %>>Start new session</jp-radio>
                <jp-radio name="startup-mode" value="restore-sessions" <%= startupMode === 'restore-sessions' ? 'checked' : '' %>>Restore last sessions</jp-radio>
              </jp-radio-group>
              
              <jp-radio-group orientation="horizontal">
                <label slot="label">Theme</label>
                <jp-radio name="theme" value="light" <%= theme === 'light' ? 'checked' : '' %>>Light</jp-radio>
                <jp-radio name="theme" value="dark" <%= theme === 'dark' ? 'checked' : '' %>>Dark</jp-radio>
                <jp-radio name="theme" value="system" <%= theme === 'system' ? 'checked' : '' %>>System</jp-radio>
              </jp-radio-group>
              <jp-checkbox id='checkbox-sync-jupyterlab-theme' type='checkbox' <%= syncJupyterLabTheme ? 'checked' : '' %>>Sync JupyterLab theme</jp-checkbox>

              <div id="news-feed-settings">
                <label slot="label">News Feed</label>
                <jp-checkbox id='checkbox-show-news-feed' type='checkbox' <%= showNewsFeed ? 'checked' : '' %> onchange='handleAutoCheckForUpdates(this);'>Show news feed on welcome page</jp-checkbox>
              </div>

              <jp-radio-group orientation="horizontal">
                <label slot="label">JupyterLab UI mode</label>
                <jp-radio name="frontend-mode" value="web-app" <%= frontEndMode === 'web-app' ? 'checked' : '' %> title="Use the server supplied web application as JupyterLab UI">Web app</jp-radio>
                <jp-radio name="frontend-mode" value="client-app" <%= frontEndMode === 'client-app' ? 'checked' : '' %> title="Use the bundled client application as JupyterLab UI">Client app</jp-radio>
              </jp-radio-group>

              <script>
              const syncJupyterLabThemeCheckbox = document.getElementById('checkbox-sync-jupyterlab-theme');
              </script>
            </jp-tab-panel>

            <jp-tab-panel id="tab-panel-server">
              <div class="row" style="line-height: 30px;">
                <label>Default working directory</label>
              </div>
              <div class="row">
                <div style="flex-grow: 1;">
                  <jp-text-field type="text" id="working-directory" value="<%= defaultWorkingDirectory %>" style="width: 100%;" spellcheck="false" placeholder="/working/directory (leave empty for user home)"></jp-text-field>
                </div>
                <div>
                  <jp-button id='select-working-directory' onclick='handleSelectWorkingDirectory(this);'>Change</jp-button>
                </div>
              </div>

              <div id="content-local-server" class="server-type-content">
                <div class="row" style="line-height: 30px;">
                  <label>Default Python environment</label>
                </div>
                <div style="display: flex; flex-direction: column; row-gap: 5px;">
                  <div id="bundled-env-warning"><span id="bundled-env-warning-message"></span><jp-button id='install-bundled-env' onclick='handleInstallBundledEv(this);'>Install</jp-button><jp-button id='update-bundled-env' onclick='handleUpdateBundledEv(this);'>Update</jp-button></div>
                  <jp-radio-group orientation="vertical">
                    <jp-radio type="radio" id="bundled-env" name="env_type" value="bundled-env" <%= selectBundledPythonPath ? 'checked' : '' %> <%= !bundledEnvInstallationExists ? 'disabled' : '' %> onchange="handleEnvTypeChange(this);">Bundled Python environment</jp-radio>
                    <jp-radio type="radio" id="custom-env" name="env_type" value="custom-env" <%= !selectBundledPythonPath ? 'checked' : '' %> onchange="handleEnvTypeChange(this);">Custom Python environment</jp-radio>
                  </jp-radio-group>

                  <div class="row">
                    <div style="flex-grow: 1;">
                      <jp-text-field type="text" id="python-path" value="<%= defaultPythonPath %>" style="width: 100%;" spellcheck="false"></jp-text-field>
                    </div>
                    <div>
                      <jp-button id='select-python-path' onclick='handleSelectPythonPath(this);'>Select Python path</jp-button>
                    </div>
                  </div>
                </div>
              </div>

              <script>
              const workingDirectoryInput = document.getElementById('working-directory');
              const bundledEnvRadio = document.getElementById('bundled-env');
              const customEnvRadio = document.getElementById('custom-env');
              const pythonPathInput = document.getElementById('python-path');
              const selectPythonPathButton = document.getElementById('select-python-path');
              const bundledEnvWarningContainer = document.getElementById('bundled-env-warning');
              const bundledEnvWarningMessage = document.getElementById('bundled-env-warning-message');
              const installBundledEnvButton = document.getElementById('install-bundled-env');
              const updateBundledEnvButton = document.getElementById('update-bundled-env');

              function handleSelectWorkingDirectory(el) {
                window.electronAPI.selectWorkingDirectory();
              }

              function handleEnvTypeChange() {
                defaultPythonEnvChanged = true;
                const useBundledEnv = bundledEnvRadio.checked;
                if (useBundledEnv) {
                  pythonPathInput.setAttribute('disabled', 'disabled');
                  selectPythonPathButton.setAttribute('disabled', 'disabled');
                } else {
                  pythonPathInput.removeAttribute('disabled');
                  selectPythonPathButton.removeAttribute('disabled');
                }
              }

              function handleSelectPythonPath(el) {
                window.electronAPI.selectPythonPath();
              }

              function showBundledEnvWarning(type) {
                if (type === 'does-not-exist') {
                  bundledEnvWarningMessage.innerText = 'Bundled environment not found';
                  installBundledEnvButton.style.display = 'block';
                  bundledEnvWarningContainer.classList.add('warning');
                } else {
                  bundledEnvWarningMessage.innerText = 'Updates available for the bundled environment';
                  updateBundledEnvButton.style.display = 'block';
                  bundledEnvWarningContainer.classList.add('warning');
                }
                bundledEnvWarningContainer.style.display = 'flex';
              }

              function hideBundledEnvWarning() {
                bundledEnvWarningContainer.style.display = 'none';
              }

              function handleInstallBundledEv() {
                applyButton.setAttribute('disabled', 'disabled');
                installBundledEnvButton.setAttribute('disabled', 'disabled');
                window.electronAPI.installBundledPythonEnv();
              }

              function handleUpdateBundledEv() {
                showProgress('Updating environment', true);
                applyButton.setAttribute('disabled', 'disabled');
                window.electronAPI.updateBundledPythonEnv();
              }

              window.electronAPI.onInstallBundledPythonEnvStatus((status) => {
                const message = status === 'STARTED' ?
                  'Installing Python environment' :
                  status === 'CANCELLED' ?
                  'Installation cancelled!' :
                  status === 'FAILURE' ?
                    'Failed to install the environment!' :
                  status === 'SUCCESS' ? 'Installation succeeded' : '';
                
                const animate = status === 'STARTED';

                showProgress(message, animate);

                if (status === 'SUCCESS') {
                  bundledEnvRadio.removeAttribute('disabled');
                  hideBundledEnvWarning();
                }

                installBundledEnvButton.removeAttribute('disabled');
                applyButton.removeAttribute('disabled');
              });

              window.electronAPI.onWorkingDirectorySelected((path) => {
                workingDirectoryInput.value = path;
              });

              window.electronAPI.onCustomPythonPathSelected((path) => {
                pythonPathInput.value = path;
              });

              handleEnvTypeChange();
              <%- !bundledEnvInstallationExists ? 'showBundledEnvWarning("does-not-exist");' : '' %> 
              <%- (bundledEnvInstallationExists && !bundledEnvInstallationLatest) ? 'showBundledEnvWarning("not-latest");' : '' %> 
              </script>
            </jp-tab-panel>

            <jp-tab-panel id="tab-panel-updates">
              <jp-checkbox id='checkbox-update-check' type='checkbox' <%= checkForUpdatesAutomatically ? 'checked' : '' %> onchange='handleAutoCheckForUpdates(this);'>Check for updates automatically</jp-checkbox>
              <jp-checkbox id='checkbox-update-install' type='checkbox' <%= installUpdatesAutomatically ? 'checked' : '' %> <%= installUpdatesAutomaticallyEnabled ? '' : 'disabled' %>>Download and install updates automatically</jp-checkbox>

              <jp-button onclick='handleCheckForUpdates(this);'>Check now</jp-button>
              <script>
                const autoUpdateCheckCheckbox = document.getElementById('checkbox-update-check');
                const autoInstallCheckbox = document.getElementById('checkbox-update-install');

                function handleAutoCheckForUpdates(el) {
                  updateAutoInstallCheckboxState();
                }

                function updateAutoInstallCheckboxState() {
                  if (<%= installUpdatesAutomaticallyEnabled ? 'true' : 'false' %> /* installUpdatesAutomaticallyEnabled */ &&
                    autoUpdateCheckCheckbox.checked) {
                    autoInstallCheckbox.removeAttribute('disabled');
                  } else {
                    autoInstallCheckbox.setAttribute('disabled', 'disabled');
                  }
                }

                function handleCheckForUpdates(el) {
                  window.electronAPI.checkForUpdates();
                }

                document.addEventListener("DOMContentLoaded", () => {
                  updateAutoInstallCheckboxState();
                });
              </script>
            </jp-tab-panel>

            <jp-tab-panel id="tab-panel-privacy">
              <div id="clear-history">
                <div class="row" style="line-height: 30px;">
                  <label>Clear History</label>
                </div>
                <jp-checkbox id='checkbox-clear-session-data' type='checkbox' checked="true">Browser session cache & data</jp-checkbox>
                <jp-checkbox id='checkbox-clear-recent-remote-urls' type='checkbox'>Recent remote URLs</jp-checkbox>
                <jp-checkbox id='checkbox-clear-recent-sessions' type='checkbox'>Recent sessions</jp-checkbox>
                <jp-checkbox id='checkbox-clear-user-set-python-envs' type='checkbox'>User set Python environments</jp-checkbox>

                <div class="row" style="height: 60px">
                <jp-button onclick='handleClearHistory(this);'>Clear selected</jp-button><jp-progress-ring id="clear-history-progress"></jp-progress-ring>
                </div>
              </div>
              <script>
                const clearSessionDataCheckbox = document.getElementById('checkbox-clear-session-data');
                const clearRecentRemoteURLs = document.getElementById('checkbox-clear-recent-remote-urls');
                const clearRecentSessions = document.getElementById('checkbox-clear-recent-sessions');
                const clearUserSetPythonEnvs = document.getElementById('checkbox-clear-user-set-python-envs');
                const clearHistoryProgress = document.getElementById('clear-history-progress');

                function handleClearHistory(el) {
                  clearHistoryProgress.style.visibility = 'visible';
                  window.electronAPI.clearHistory({
                    sessionData: clearSessionDataCheckbox.checked,
                    recentRemoteURLs: clearRecentRemoteURLs.checked,
                    recentSessions: clearRecentSessions.checked,
                    userSetPythonEnvs: clearUserSetPythonEnvs.checked,
                  }).then(() => {
                    clearHistoryProgress.style.visibility = 'hidden';
                  });
                }
              </script>
            </jp-tab-panel>
          </jp-tabs>
        </div>
        <div id="footer" class="footer-row">
          <div id="progress-message" class="progress-message"></div>
          <div id="progress-animation" class="progress-animation"><jp-progress-ring></jp-progress-ring></div>
          <jp-button id="apply" appearance="accent" onclick='handleApply(this);'>Apply & restart</jp-button>
        </div>
      </div>
      <script>
        const applyButton = document.getElementById('apply');
        const progressMessage = document.getElementById('progress-message');
        const progressAnimation = document.getElementById('progress-animation');
        let defaultPythonEnvChanged = false;

        function showProgress(message, animate) {
          progressMessage.innerText = message;
          progressMessage.style.visibility = message !== '' ? 'visible' : 'hidden';
          progressAnimation.style.visibility = animate ? 'visible' : 'hidden';
        }

        function handleApply() {
          const startupMode = document.querySelector('jp-radio[name="startup-mode"].checked').value;
          window.electronAPI.setStartupMode(startupMode);
          const theme = document.querySelector('jp-radio[name="theme"].checked').value;
          window.electronAPI.setTheme(theme);
          window.electronAPI.setSyncJupyterLabTheme(syncJupyterLabThemeCheckbox.checked);
          const showNewsFeedCheckbox = document.getElementById('checkbox-show-news-feed');
          window.electronAPI.setShowNewsFeed(showNewsFeedCheckbox.checked);
          const frontEndMode = document.querySelector('jp-radio[name="frontend-mode"].checked').value;
          window.electronAPI.setFrontEndMode(frontEndMode);
          window.electronAPI.setCheckForUpdatesAutomatically(autoUpdateCheckCheckbox.checked);
          window.electronAPI.setInstallUpdatesAutomatically(autoInstallCheckbox.checked);

          window.electronAPI.setDefaultWorkingDirectory(workingDirectoryInput.value);

          if (defaultPythonEnvChanged) {
            if (bundledEnvRadio.checked) {
              window.electronAPI.setDefaultPythonPath('');
            } else {
              window.electronAPI.validatePythonPath(pythonPathInput.value).then((valid) => {
                if (valid) {
                  window.electronAPI.setDefaultPythonPath(pythonPathInput.value);
                } else {
                  window.electronAPI.showInvalidPythonPathMessage(pythonPathInput.value);
                }
              });
            }
          }

          window.electronAPI.restartApp();
        }

        ${
          options.activateTab
            ? `
          document.addEventListener("DOMContentLoaded", () => {
            document.getElementById('tab-${options.activateTab}').click();
          });
        `
            : ''
        }
        
      </script>
    `;
    this._pageBody = ejs.render(template, {
      startupMode,
      theme,
      syncJupyterLabTheme,
      showNewsFeed,
      checkForUpdatesAutomatically,
      installUpdatesAutomaticallyEnabled,
      installUpdatesAutomatically,
      frontEndMode,
      defaultWorkingDirectory,
      defaultPythonPath,
      selectBundledPythonPath,
      bundledEnvInstallationExists,
      bundledEnvInstallationLatest
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

export namespace PreferencesDialog {
  export enum Tab {
    General = 'general',
    Server = 'server',
    Updates = 'updates'
  }

  export interface IOptions {
    isDarkTheme: boolean;
    startupMode: StartupMode;
    theme: ThemeType;
    syncJupyterLabTheme: boolean;
    showNewsFeed: boolean;
    frontEndMode: FrontEndMode;
    checkForUpdatesAutomatically: boolean;
    installUpdatesAutomatically: boolean;
    defaultWorkingDirectory: string;
    defaultPythonPath: string;
    activateTab?: Tab;
  }
}
