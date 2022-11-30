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
