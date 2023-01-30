// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as ejs from 'ejs';
import * as path from 'path';
import { ThemedWindow } from '../dialog/themedwindow';

export class UpdateDialog {
  constructor(options: UpdateDialog.IOptions) {
    this._window = new ThemedWindow({
      isDarkTheme: options.isDarkTheme,
      title: 'Update',
      width: 400,
      height: 180,
      resizable: false,
      preload: path.join(__dirname, './preload.js')
    });

    const message =
      options.type === 'error'
        ? 'Error occurred while checking for updates!'
        : options.type === 'no-updates'
        ? 'There are no updates available.'
        : `There is a new version available. Download the latest version from <a href="javascript:void(0)" onclick='handleReleasesLink(this);'>the Releases page</a>.`;

    const template = `
      <style>
        .update-result-container {
          style="height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .update-result-container a {
          color: #222222;
          outline: none;
        }
        .app-ui-dark .update-result-container a {
          color: #5d96ed;
        }
      </style>
      <div class="update-result-container">
        <div>
        <%- message %>
        </div>
      </div>

      <script>
        function handleReleasesLink(el) {
          window.electronAPI.launchInstallerDownloadPage();
        }
      </script>
    `;
    this._pageBody = ejs.render(template, { message });
  }

  get window(): ThemedWindow {
    return this._window;
  }

  load() {
    this._window.loadDialogContent(this._pageBody);
  }

  private _window: ThemedWindow;
  private _pageBody: string;
}

export namespace UpdateDialog {
  export interface IOptions {
    isDarkTheme: boolean;
    type: 'updates-available' | 'error' | 'no-updates';
  }
}
