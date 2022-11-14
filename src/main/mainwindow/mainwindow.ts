// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { BrowserWindow } from 'electron';
import { LabView } from '../labview/labview';
import { TitleBarView } from '../titlebarview/titlebarview';

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
      frame: process.platform === 'darwin'
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
    titleBarView.load();

    this._window.addBrowserView(labView.view);
    labView.view.setBounds({ x: 0, y: 100, width: 1200, height: 700 });
    labView.load();

    const resizeViews = () => {
      const titleBarHeight = 28;
      const [width, height] = this._window.getSize();
      titleBarView.view.setBounds({
        x: 0,
        y: 0,
        width: width,
        height: titleBarHeight
      });
      labView.view.setBounds({
        x: 0,
        y: titleBarHeight,
        width: width,
        height: height - titleBarHeight
      });
    };

    this._window.on('resize', () => {
      resizeViews();
    });
    this._window.on('maximize', () => {
      resizeViews();
      // on linux a delayed resize is necessary
      setTimeout(() => {
        resizeViews();
      }, 500);
    });
    this._window.on('restore', () => {
      resizeViews();
    });

    resizeViews();
  }

  private _options: MainWindow.IOptions;
  private _window: BrowserWindow;
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
