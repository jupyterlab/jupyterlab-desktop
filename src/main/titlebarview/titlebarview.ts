// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { BrowserView } from 'electron';
import * as path from 'path';

export class TitleBarView {
  constructor() {
    this._view = new BrowserView({
      webPreferences: {
        preload: path.join(__dirname, './preload.js'),
        devTools: process.env.NODE_ENV === 'development'
      }
    });

    // prevent Ctrl +/- zoom
    this._view.webContents.on('before-input-event', (event, input) => {
      if (input.control && ['+', '-'].includes(input.key)) {
        event.preventDefault();
      }
    });
  }

  get view(): BrowserView {
    return this._view;
  }

  setTitle(title: string) {
    this._view.webContents.send('set-title', title);
  }

  activate() {
    this._view.webContents.send('set-active', true);
  }

  deactivate() {
    this._view.webContents.send('set-active', false);
  }

  load() {
    this._view.webContents.loadFile(
      path.join(__dirname, '../../../app-assets/titlebarview/titlebar.html')
    );
  }

  showServerStatus(show: boolean) {
    this._view.webContents.send('show-server-status', show);
  }

  private _view: BrowserView;
}
