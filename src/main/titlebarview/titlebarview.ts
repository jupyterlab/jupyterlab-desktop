// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { BrowserView } from 'electron';
import * as path from 'path';

export class TitleBarView {
  constructor() {
    this._view = new BrowserView({
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
  }

  get view(): BrowserView {
    return this._view;
  }

  load() {
    this._view.webContents.loadFile(
      path.join(__dirname, '../../../app-assets/titlebarview/titlebar.html')
    );
  }

  private _view: BrowserView;
}
