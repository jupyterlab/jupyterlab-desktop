// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as ejs from 'ejs';
import { BrowserWindow } from 'electron';
import * as path from 'path';
import { ThemedWindow } from '../dialog/themedwindow';

export class PreferencesDialog {
  constructor(options: PreferencesDialog.IOptions) {
    this._window = new ThemedWindow({
      title: 'Preferences',
      width: 500,
      height: 300,
      preload: path.join(__dirname, './preload.js')
    });

    const {
      theme,
      syncJupyterLabTheme,
      frontEndMode,
      checkForUpdatesAutomatically
    } = options;
    const installUpdatesAutomaticallyEnabled = process.platform === 'darwin';
    const installUpdatesAutomatically =
      installUpdatesAutomaticallyEnabled && options.installUpdatesAutomatically;

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
      </style>
      <div id="container">
        <div id="content-area">
          <jp-tabs id="category-tabs" false="" orientation="vertical">
            <jp-tab id="tab-appearance">
              Appearance
            </jp-tab>
            <jp-tab id="tab-updates">
              Updates
            </jp-tab>
          
            <jp-tab-panel id="tab-appearance">
              <jp-radio-group orientation="horizontal">
                <label slot="label">Theme</label>
                <jp-radio name="theme" value="light" <%= theme === 'light' ? 'checked' : '' %>>Light</jp-radio>
                <jp-radio name="theme" value="dark" <%= theme === 'dark' ? 'checked' : '' %>>Dark</jp-radio>
                <jp-radio name="theme" value="system" <%= theme === 'system' ? 'checked' : '' %>>System</jp-radio>
              </jp-radio-group>
              <jp-checkbox id='checkbox-sync-jupyterlab-theme' type='checkbox' <%= syncJupyterLabTheme ? 'checked' : '' %>>Sync JupyterLab theme</jp-checkbox>

              <jp-radio-group orientation="horizontal">
                <label slot="label">JupyterLab UI mode</label>
                <jp-radio name="frontend-mode" value="web-app" <%= frontEndMode === 'web-app' ? 'checked' : '' %> title="Use the server supplied web application as JupyterLab UI">Web app</jp-radio>
                <jp-radio name="frontend-mode" value="client-app" <%= frontEndMode === 'client-app' ? 'checked' : '' %> title="Use the bundled client application as JupyterLab UI">Client app</jp-radio>
              </jp-radio-group>
            </jp-tab-panel>

            <jp-tab-panel id="tab-updates">
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
          </jp-tabs>
        </div>
        <div id="footer">
          <jp-button appearance="accent" onclick='handleApply(this);'>Apply & restart</jp-button>
        </div>
      </div>
      <script>
        function handleApply() {
          const theme = document.querySelector('jp-radio[name="theme"].checked').value;
          window.electronAPI.setTheme(theme);
          const frontEndMode = document.querySelector('jp-radio[name="frontend-mode"].checked').value;
          window.electronAPI.setFrontEndMode(frontEndMode);
          window.electronAPI.setCheckForUpdatesAutomatically(autoUpdateCheckCheckbox.checked);
          window.electronAPI.setInstallUpdatesAutomatically(autoInstallCheckbox.checked);

          window.electronAPI.restartApp();
        }
      </script>
    `;
    this._pageBody = ejs.render(template, {
      theme,
      syncJupyterLabTheme,
      checkForUpdatesAutomatically,
      installUpdatesAutomaticallyEnabled,
      installUpdatesAutomatically,
      frontEndMode
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
  export interface IOptions {
    theme: 'system' | 'light' | 'dark';
    syncJupyterLabTheme: boolean;
    frontEndMode: 'web-app' | 'client-app';
    checkForUpdatesAutomatically: boolean;
    installUpdatesAutomatically: boolean;
  }
}
