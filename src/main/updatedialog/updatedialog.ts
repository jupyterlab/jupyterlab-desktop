// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as ejs from 'ejs';
import * as path from 'path';
import { JupyterLabWindow } from '../dialog/jupyterlabwindow';

export class UpdateDialog {
  constructor(options: {
    type: 'updates-available' | 'error' | 'no-updates';
    checkForUpdatesAutomatically: boolean;
    installUpdatesAutomatically: boolean;
  }) {
    this._window = new JupyterLabWindow({
      title: 'JupyterLab Update',
      width: 400,
      height: 180,
      resizable: false,
      preload: path.join(__dirname, './preload.js')
    });

    const checkForUpdatesAutomatically = options.checkForUpdatesAutomatically;
    const installUpdatesAutomaticallyEnabled = process.platform === 'darwin';
    const installUpdatesAutomatically =
      installUpdatesAutomaticallyEnabled && options.installUpdatesAutomatically;
    const message =
      options.type === 'error'
        ? 'Error occurred while checking for updates!'
        : options.type === 'no-updates'
        ? 'There are no updates available.'
        : `There is a new version available. Download the latest version from <a href="javascript:void(0)" onclick='handleReleasesLink(this);'>the Releases page</a>.`;

    const template = `
            <div style="height: calc(100% - 50px); display: flex;flex-direction: column; justify-content: space-between;">
              <div>
              <%- message %>
              </div>
              <div>
                <jp-checkbox id='checkbox-update-check' type='checkbox' <%= checkForUpdatesAutomatically ? 'checked' : '' %> onchange='handleAutoCheckForUpdates(this);'>Check for updates automatically</jp-checkbox>
                <br>
                <jp-checkbox id='checkbox-update-install' type='checkbox' <%= installUpdatesAutomatically ? 'checked' : '' %> <%= installUpdatesAutomaticallyEnabled ? '' : 'disabled' %> onchange='handleAutoInstallUpdates(this);'>Download and install updates automatically</jp-checkbox>
              </div>
            </div>

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

              function handleReleasesLink(el) {
                window.electronAPI.launchInstallerDownloadPage();
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
        `;
    this._pageBody = ejs.render(template, {
      message,
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
