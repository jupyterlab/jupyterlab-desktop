// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { BrowserWindow } from 'electron';
import { LabView } from '../labview/labview';
import { TitleBarView } from '../titlebarview/titlebarview';
import { appConfig, isDarkTheme } from '../utils';

export class MainWindow {
  constructor(options: MainWindow.IOptions) {
    this._options = options;

    this._window = new BrowserWindow({
      width: this._options.width,
      height: this._options.height,
      x: this._options.x,
      y: this._options.y,
      minWidth: 400,
      minHeight: 300,
      show: true,
      title: 'JupyterLab',
      titleBarStyle: 'hidden',
      frame: process.platform === 'darwin',
      backgroundColor: isDarkTheme(appConfig.theme) ? '#212121' : '#ffffff'
    });

    this._window.setMenuBarVisibility(false);

    if (this._options.x && this._options.y) {
      this._window.setBounds({
        x: this._options.x,
        y: this._options.y,
        height: this._options.height,
        width: this._options.width
      });
    } else {
      this._window.center();
    }
  }

  get window(): BrowserWindow {
    return this._window;
  }

  load() {
    const labView = new LabView(this, {
      serverState: this._options.serverState,
      platform: this._options.platform,
      uiState: this._options.uiState
    });

    const titleBarView = new TitleBarView();
    this._window.addBrowserView(titleBarView.view);
    titleBarView.view.setBounds({ x: 0, y: 0, width: 1200, height: 100 });

    this._window.addBrowserView(labView.view);
    labView.view.setBounds({ x: 0, y: 100, width: 1200, height: 700 });

    // transfer focus to labView
    this._window.webContents.on('focus', () => {
      labView.view.webContents.focus();
    });
    titleBarView.view.webContents.on('focus', () => {
      labView.view.webContents.focus();
    });
    labView.view.webContents.on('did-finish-load', () => {
      labView.view.webContents.focus();
    });

    titleBarView.load();
    labView.load();

    this._titleBarView = titleBarView;
    this._labView = labView;

    this._window.on('resize', () => {
      this._resizeViews();
    });
    this._window.on('maximize', () => {
      this._resizeViewsDelayed();
    });
    this._window.on('unmaximize', () => {
      this._resizeViewsDelayed();
    });
    this._window.on('restore', () => {
      this._resizeViewsDelayed();
    });

    this._resizeViews();
  }

  get titleBarView(): TitleBarView {
    return this._titleBarView;
  }

  get labView(): LabView {
    return this._labView;
  }

  private _resizeViewsDelayed() {
    // on linux a delayed resize is necessary
    setTimeout(() => {
      this._resizeViews();
    }, 300);
  }

  private _resizeViews() {
    const titleBarHeight = 28;
    const { width, height } = this._window.getContentBounds();
    this._titleBarView.view.setBounds({
      x: 0,
      y: 0,
      width: width,
      height: titleBarHeight
    });
    this._labView.view.setBounds({
      x: 0,
      y: titleBarHeight,
      width: width,
      height: height - titleBarHeight
    });

    // invalidate to trigger repaint
    // TODO: on linux, electron 22 does not repaint properly after resize
    // check if fixed in newer versions
    setTimeout(() => {
      this._titleBarView.view.webContents.invalidate();
      this._labView.view.webContents.invalidate();
    }, 200);
  }

  private _options: MainWindow.IOptions;
  private _window: BrowserWindow;
  private _titleBarView: TitleBarView;
  private _labView: LabView;
}

export namespace MainWindow {
  export interface IOptions {
    serverState: 'new' | 'local' | 'remote';
    platform: NodeJS.Platform;
    uiState: 'linux' | 'mac' | 'windows';
    x: number;
    y: number;
    width: number;
    height: number;
  }
}
