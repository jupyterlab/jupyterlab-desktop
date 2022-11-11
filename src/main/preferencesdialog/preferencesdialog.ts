// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as ejs from 'ejs';
import * as path from 'path';
import { JupyterLabWindow } from '../dialog/jupyterlabwindow';

export class PreferencesDialog {
  constructor(options: PreferencesDialog.IOptions) {
    this._window = new JupyterLabWindow({
      title: 'Preferences',
      width: 500,
      height: 300,
      preload: path.join(__dirname, './preload.js')
    });

    const checkForUpdatesAutomatically = options.checkForUpdatesAutomatically;
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
              <jp-radio-group orientation="vertical">
                <label slot="label">Theme</label>
                <jp-radio value="light">Light</jp-radio>
                <jp-radio value="dark">Dark</jp-radio>
                <jp-radio value="system">System</jp-radio>
              </jp-radio-group>
            </jp-tab-panel>

            <jp-tab-panel id="tab-updates">
              <jp-checkbox id='checkbox-update-check' type='checkbox' <%= checkForUpdatesAutomatically ? 'checked' : '' %> onchange='handleAutoCheckForUpdates(this);'>Check for updates automatically</jp-checkbox>
              <jp-checkbox id='checkbox-update-install' type='checkbox' <%= installUpdatesAutomatically ? 'checked' : '' %> <%= installUpdatesAutomaticallyEnabled ? '' : 'disabled' %> onchange='handleAutoInstallUpdates(this);'>Download and install updates automatically</jp-checkbox>
              <script>
                const autoUpdateCheckCheckbox = document.getElementById('checkbox-update-check');
                const autoInstallCheckbox = document.getElementById('checkbox-update-install');

                function handleAutoCheckForUpdates(el) {
                  window.electronAPI.setCheckForUpdatesAutomatically(el.checked);
                  updateAutoInstallCheckboxState();
                }

                function handleAutoInstallUpdates(el) {
                  window.electronAPI.setInstallUpdatesAutomatically(el.checked);
                }

                function updateAutoInstallCheckboxState() {
                  if (<%= installUpdatesAutomaticallyEnabled ? 'true' : 'false' %> /* installUpdatesAutomaticallyEnabled */ &&
                    autoUpdateCheckCheckbox.checked) {
                    autoInstallCheckbox.removeAttribute('disabled');
                  } else {
                    autoInstallCheckbox.disabled = 'disabled';
                  }
                }

                document.addEventListener("DOMContentLoaded", () => {
                  updateAutoInstallCheckboxState();
                });
              </script>
            </jp-tab-panel>
          </jp-tabs>
        </div>
        <div id="footer">
          <jp-button appearance="accent">Apply & restart</jp-button>
        </div>
      </div>
    `;
    this._pageBody = ejs.render(template, {
      checkForUpdatesAutomatically,
      installUpdatesAutomaticallyEnabled,
      installUpdatesAutomatically
    });
  }

  get window(): JupyterLabWindow {
    return this._window;
  }

  load() {
    this._window.loadDialogContent(this._pageBody);
  }

  private _window: JupyterLabWindow;
  private _pageBody: string;
}

export namespace PreferencesDialog {
  export interface IOptions {
    checkForUpdatesAutomatically: boolean;
    installUpdatesAutomatically: boolean;
  }
}
