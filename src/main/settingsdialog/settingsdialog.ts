// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as ejs from 'ejs';
import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ThemedWindow } from '../dialog/themedwindow';
import {
  CtrlWBehavior,
  KeyValueMap,
  LogLevel,
  serverLaunchArgsDefault,
  serverLaunchArgsFixed,
  StartupMode,
  ThemeType
} from '../config/settings';
import { IRegistry } from '../registry';
import { jlabCLICommandIsSetup } from '../utils';

export class SettingsDialog {
  constructor(options: SettingsDialog.IOptions, registry: IRegistry) {
    this._window = new ThemedWindow({
      isDarkTheme: options.isDarkTheme,
      title: 'Settings',
      width: 700,
      height: 500,
      preload: path.join(__dirname, './preload.js')
    });

    const {
      startupMode,
      theme,
      syncJupyterLabTheme,
      showNewsFeed,
      checkForUpdatesAutomatically,
      notifyOnBundledEnvUpdates,
      updateBundledEnvAutomatically,
      defaultWorkingDirectory,
      logLevel,
      serverArgs,
      overrideDefaultServerArgs,
      serverEnvVars,
      ctrlWBehavior
    } = options;
    const installUpdatesAutomaticallyEnabled = process.platform === 'darwin';
    const installUpdatesAutomatically =
      installUpdatesAutomaticallyEnabled && options.installUpdatesAutomatically;
    const cliCommandIsSetup = jlabCLICommandIsSetup();

    let strServerEnvVars = '';
    if (Object.keys(serverEnvVars).length > 0) {
      for (const key in serverEnvVars) {
        strServerEnvVars += `${key}= "${serverEnvVars[key]}"\n`;
      }
    }

    const ctrlWLabel = process.platform === 'darwin' ? 'Cmd + W' : 'Ctrl + W';

    const infoIconSrc = fs.readFileSync(
      path.join(__dirname, '../../../app-assets/info-icon.svg')
    );

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
      #footer {
        text-align: right;
      }
      #category-tabs {
        width: 100%;
      }
      .row {
        display: flex;
        align-items: center;
      }
      .footer-row {
        height: 50px;
        min-height: 50px;
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
      .setting-section {
        margin: 10px 0;
        display: flex;
        flex-direction: column;
        align-items: baseline;
      }
      #additional-server-args,
      #server-launch-command-preview,
      #additional-server-env-vars {
        width: 100%;
      }
      #additional-server-args::part(control) {
        height: 40px;
      }
      #tab-panel-server {
        padding-bottom: 20px;
      }
      #additional-server-env-vars.invalid::part(control) {
        border-color: red;
      }
      .info-icon {
        display: inline-block;
        margin-top: -10px;
      }
      .info-icon svg path {
        fill: var(--neutral-stroke-hover);
      }
      </style>
      <div id="container">
        <div id="content-area">
          <jp-tabs id="category-tabs" false="" orientation="vertical">
            <jp-tab id="tab-general">General</jp-tab>
            <jp-tab id="tab-server">Server</jp-tab>
            <jp-tab id="tab-privacy">Privacy</jp-tab>
            <jp-tab id="tab-advanced">Advanced</jp-tab>

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

              <div class="row">
                <jp-text-area id='additional-server-args' appearance="outline" resize="vertical" rows="2" value="<%= serverArgs %>" oninput='handleAdditionalServerArgsInput(this);' spellcheck="false" placeholder="Enter additional server launch args separated by space">
                Additional JupyterLab Server launch args
                </jp-text-area>
              </div>
              <div class="row">
                <jp-checkbox id='override-default-server-args' type='checkbox' <%= overrideDefaultServerArgs ? 'checked' : '' %> onchange='handleOverrideDefaultServerArgsChange(this);'>Override default server launch args</jp-checkbox>
              </div>
              <div class="row">
                <jp-text-area id='server-launch-command-preview' appearance="outline" resize="vertical" rows="2" readonly="" spellcheck="false">
                Server launch command preview
                </jp-text-area>
              </div>
              <div class="row">
                <jp-text-area id='additional-server-env-vars' appearance="outline" resize="vertical" rows="2" value="<%= serverEnvVars %>" oninput='handleAdditionalServerEnvsInput(this);' spellcheck="false" placeholder='Enter additional environment variables in NAME="Value" format in separate lines'>
                Additional JupyterLab Server environment variables
                </jp-text-area>
              </div>

              <script>
              const workingDirectoryInput = document.getElementById('working-directory');
              const additionalServerArgs = document.getElementById('additional-server-args');
              const overrideDefaultServerArgs = document.getElementById('override-default-server-args');
              const serverLaunchCommandPreview  = document.getElementById('server-launch-command-preview');
              const additionalServerEnvVars = document.getElementById('additional-server-env-vars');

              function handleSelectWorkingDirectory(el) {
                window.electronAPI.selectWorkingDirectory();
              }

              function handleAdditionalServerArgsInput(el) {
                updateServerLaunchCommandPreview();
              }

              function handleAdditionalServerEnvsInput(el) {
                updateServerEnvVarsValidity();
              }

              function handleOverrideDefaultServerArgsChange(el) {
                updateServerLaunchCommandPreview();
              }

              function updateServerLaunchCommandPreview() {
                let launchCommand = 'python -m jupyterlab ${serverLaunchArgsFixed.join(
                  ' '
                )}';
                if (!overrideDefaultServerArgs.checked) {
                  launchCommand += ' ${serverLaunchArgsDefault.join(' ')}';
                }

                if (additionalServerArgs.value) {
                  launchCommand += ' ' + additionalServerArgs.value;
                }

                serverLaunchCommandPreview.value = launchCommand;
              }

              function parseServerEnvVars() {
                const serverEnvVars = additionalServerEnvVars.value;
                try {
                  const envVars = {};
                  const lines = serverEnvVars.trim().split('\\n');
      
                  for (const line of lines) {
                    const equalPos = line.indexOf('=');
                    if (equalPos > 0) {
                      const name = line.substring(0, equalPos).trim();
                      const value = line.substring(equalPos + 1).trim();
                      if (name && value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
                        envVars[name] = value.substring(1, value.length - 1);
                      }
                    }
                  }

                  let valid = true;

                  if (serverEnvVars !== '' && Object.keys(envVars).length < lines.length) {
                    valid = false;
                  }

                  return { valid, envVars };
                } catch (error) {
                  return { valid: false, envVars: {} };
                }
              }

              function updateServerEnvVarsValidity() {
                if (parseServerEnvVars().valid) {
                  additionalServerEnvVars.classList.remove('invalid');
                } else {
                  additionalServerEnvVars.classList.add('invalid');
                }
              }

              document.addEventListener("DOMContentLoaded", () => {
                updateServerLaunchCommandPreview();
                updateServerEnvVarsValidity();
              });

              window.electronAPI.onWorkingDirectorySelected((path) => {
                workingDirectoryInput.value = path;
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

            <jp-tab-panel id="tab-panel-advanced">
              <div class="row setting-section">
                <jp-radio-group orientation="horizontal">
                  <label slot="label">${ctrlWLabel} behavior</label>
                  <jp-radio name="ctrl-w-behavior" value="close-tab" <%= ctrlWBehavior === 'close-tab' ? 'checked' : '' %>>Close tab</jp-radio>
                  <jp-radio name="ctrl-w-behavior" value="close" <%= ctrlWBehavior === 'close' ? 'checked' : '' %>>Close session</jp-radio>
                  <jp-radio name="ctrl-w-behavior" value="warn" <%= ctrlWBehavior === 'warn' ? 'checked' : '' %>>Warn and close session</jp-radio>
                  <jp-radio name="ctrl-w-behavior" value="do-not-close" <%= ctrlWBehavior === 'do-not-close' ? 'checked' : '' %>>Do not close</jp-radio>
                </jp-radio-group>
              </div>

              <div class="row setting-section">
                <div class="row">
                  <label>jlab CLI</label>
                </div>

                <div class="row">
                  <div id="setup-cli-command-button">
                    <jp-button onclick='handleSetupCLICommand(this);'>Setup CLI</jp-button>
                  </div>
                  <div id="setup-cli-command-label" style="flex-grow: 1"></div>
                </div>
              </div>

              <div class="row setting-section">
                <div class="row">
                  <label for="log-level">Log level</label>
                </div>

                <div class="row">
                  <jp-select id="log-level" name="log-level" value="<%= logLevel %>" position="below" onchange="onLogLevelChanged(this)">
                    <jp-option value="error">Error</jp-option>
                    <jp-option value="warn">Warn</jp-option>
                    <jp-option value="info">Info</jp-option>
                    <jp-option value="verbose">Verbose</jp-option>
                    <jp-option value="debug">Debug</jp-option>
                  </jp-select>
                  <jp-button onclick='handleShowLogs(this);'>Show logs</jp-button>
                </div>
              </div>

              <div class="row setting-section">
                <div class="row">
                  <jp-checkbox id='checkbox-update-check' type='checkbox' <%= checkForUpdatesAutomatically ? 'checked' : '' %> onchange='handleAutoCheckForUpdates(this);'>Check for updates automatically</jp-checkbox>
                </div>
                <div class="row">
                  <jp-checkbox id='checkbox-update-install' type='checkbox' <%= installUpdatesAutomatically ? 'checked' : '' %> <%= installUpdatesAutomaticallyEnabled ? '' : 'disabled' %>>Download and install updates automatically</jp-checkbox>
                </div>
                <div class="row">
                  <jp-checkbox id='notify-on-bundled-env-updates' type='checkbox' <%= notifyOnBundledEnvUpdates ? 'checked' : '' %> onchange='handleAutoCheckForUpdates(this);'>Show bundled environment update notifications</jp-checkbox><div class="info-icon" title="Show notification badge on session title bar and update action button on session environment selection popup.">${infoIconSrc}</div>
                </div>
                <div class="row">
                  <jp-checkbox id='update-bundled-env-automatically' type='checkbox' <%= updateBundledEnvAutomatically ? 'checked' : '' %>>Update bundled environment automatically when app is updated</jp-checkbox><div class="info-icon" title="This will delete the existing bundled environment installation and install the newer version whenever app is updated.">${infoIconSrc}</div>
                </div>
                <div class="row">
                  <jp-button onclick='handleCheckForUpdates(this);'>Check for updates now</jp-button>
                </div>
              </div>

              <script>
                const autoUpdateCheckCheckbox = document.getElementById('checkbox-update-check');
                const autoInstallCheckbox = document.getElementById('checkbox-update-install');
                const notifyOnBundledEnvUpdatesCheckbox = document.getElementById('notify-on-bundled-env-updates');
                const updateBundledEnvAutomaticallyCheckbox = document.getElementById('update-bundled-env-automatically');
                const setupCLICommandButton = document.getElementById('setup-cli-command-button');
                const setupCLICommandLabel = document.getElementById('setup-cli-command-label');
                let cliCommandIsSetup = <%= cliCommandIsSetup %>;

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

                function handleShowLogs(el) {
                  window.electronAPI.showLogs();
                }

                function handleSetupCLICommand(el) {
                  window.electronAPI.setupCLICommand().then(result => {
                    cliCommandIsSetup = result;
                    updateCLICommandSetupStatus();
                  });
                }

                function updateCLICommandSetupStatus() {
                  if (cliCommandIsSetup) {
                    setupCLICommandButton.style.display = 'none';
                    setupCLICommandLabel.innerHTML = '<b>jlab</b> CLI command is ready to use in your system terminal!';
                  } else {
                    setupCLICommandButton.style.display = 'block';
                    setupCLICommandLabel.innerHTML = 'CLI command is not set up yet. Click to set up now. This requires elevated permissions.';
                  }
                }

                function onLogLevelChanged(el) {
                  window.electronAPI.setLogLevel(el.value);
                }

                document.addEventListener("DOMContentLoaded", () => {
                  updateCLICommandSetupStatus();
                  updateAutoInstallCheckboxState();
                });
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
          window.electronAPI.setCheckForUpdatesAutomatically(autoUpdateCheckCheckbox.checked);
          window.electronAPI.setInstallUpdatesAutomatically(autoInstallCheckbox.checked);
          window.electronAPI.setSettings({
            notifyOnBundledEnvUpdates: notifyOnBundledEnvUpdatesCheckbox.checked,
            updateBundledEnvAutomatically: updateBundledEnvAutomaticallyCheckbox.checked,
          });

          window.electronAPI.setDefaultWorkingDirectory(workingDirectoryInput.value);

          window.electronAPI.setServerLaunchArgs(additionalServerArgs.value, overrideDefaultServerArgs.checked);
          window.electronAPI.setServerEnvVars(parseServerEnvVars().envVars);

          const ctrlWBehavior = document.querySelector('jp-radio[name="ctrl-w-behavior"].checked').value;
          window.electronAPI.setCtrlWBehavior(ctrlWBehavior);

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
      notifyOnBundledEnvUpdates,
      updateBundledEnvAutomatically,
      defaultWorkingDirectory,
      logLevel,
      serverArgs,
      overrideDefaultServerArgs,
      serverEnvVars: strServerEnvVars,
      ctrlWBehavior,
      cliCommandIsSetup
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

export namespace SettingsDialog {
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
    checkForUpdatesAutomatically: boolean;
    installUpdatesAutomatically: boolean;
    notifyOnBundledEnvUpdates: boolean;
    updateBundledEnvAutomatically: boolean;
    defaultWorkingDirectory: string;
    activateTab?: Tab;
    logLevel: LogLevel;
    serverArgs: string;
    overrideDefaultServerArgs: boolean;
    serverEnvVars: KeyValueMap;
    ctrlWBehavior: CtrlWBehavior;
  }
}
