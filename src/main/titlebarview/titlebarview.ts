// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { BrowserView } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as ejs from 'ejs';
import { DarkThemeBGColor, LightThemeBGColor } from '../utils';
import { EventTypeRenderer } from '../eventtypes';

export class TitleBarView {
  constructor(options: TitleBarView.IOptions) {
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
    this._view.webContents.send(EventTypeRenderer.SetTitle, title);
  }

  activate() {
    this._view.webContents.send(EventTypeRenderer.SetActive, true);
  }

  deactivate() {
    this._view.webContents.send(EventTypeRenderer.SetActive, false);
  }

  load() {
    let pageSource = fs
      .readFileSync(
        path.join(__dirname, '../../../app-assets/titlebarview/titlebar.html')
      )
      .toString();
    pageSource = ejs.render(pageSource, {
      isDarkTheme: this._isDarkTheme,
      platform: process.platform
    });

    this._view.webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(pageSource)}`
    );
  }

  showServerStatus(show: boolean) {
    this._view.webContents.send(EventTypeRenderer.ShowServerStatus, show);
  }

  showServerNotificationBadge(show: boolean) {
    this._view.webContents.send(
      EventTypeRenderer.ShowServerNotificationBadge,
      show
    );
  }

  private _view: BrowserView;
  private _isDarkTheme: boolean;
}

export namespace TitleBarView {
  export interface IOptions {
    isDarkTheme: boolean;
  }
}
