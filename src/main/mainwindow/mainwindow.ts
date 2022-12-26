// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { BrowserWindow } from 'electron';
import { LabView } from '../labview/labview';
import { SessionConfig, SettingType, WorkspaceSettings } from '../settings';
import { TitleBarView } from '../titlebarview/titlebarview';
import { DarkThemeBGColor, isDarkTheme, LightThemeBGColor } from '../utils';

export class MainWindow {
  constructor(config: SessionConfig) {
    this._sessionConfig = config;
    const wsSettings = new WorkspaceSettings(config.workingDirectory);

    this._window = new BrowserWindow({
      width: this._sessionConfig.width,
      height: this._sessionConfig.height,
      x: this._sessionConfig.x,
      y: this._sessionConfig.y,
      minWidth: 400,
      minHeight: 300,
      show: true,
      title: 'JupyterLab',
      titleBarStyle: 'hidden',
      frame: process.platform === 'darwin',
      backgroundColor: isDarkTheme(wsSettings.getValue(SettingType.theme))
        ? DarkThemeBGColor
        : LightThemeBGColor,
      webPreferences: {
        devTools: false
      }
    });

    this._window.setMenuBarVisibility(false);

    if (
      this._sessionConfig.x !== undefined &&
      this._sessionConfig.y !== undefined
    ) {
      this._window.setBounds({
        x: this._sessionConfig.x,
        y: this._sessionConfig.y,
        height: this._sessionConfig.height,
        width: this._sessionConfig.width
      });
    } else {
      this._window.center();
    }
  }

  get window(): BrowserWindow {
    return this._window;
  }

  load() {
    const labView = new LabView(this, this._sessionConfig);

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

    this._window.on('focus', () => {
      titleBarView.activate();
    });
    this._window.on('blur', () => {
      titleBarView.deactivate();
    });

    titleBarView.load();
    labView.load();

    this._titleBarView = titleBarView;
    this._labView = labView;

    this._window.on('resize', () => {
      this._updateSessionWindowInfo();
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
    this._window.on('moved', () => {
      this._updateSessionWindowInfo();
    });

    this._resizeViews();

    this.labView.view.webContents.on('page-title-updated', (event, title) => {
      this.titleBarView.setTitle(title);
      this._window.setTitle(title);
    });
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
    const titleBarHeight = 29;
    const { width, height } = this._window.getContentBounds();
    // add padding to allow resizing around title bar
    const padding = process.platform === 'darwin' ? 0 : 1;
    this._titleBarView.view.setBounds({
      x: padding,
      y: padding,
      width: width - 2 * padding,
      height: titleBarHeight - padding
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

  private _updateSessionWindowInfo() {
    const [x, y] = this._window.getPosition();
    const [width, height] = this._window.getSize();
    this._sessionConfig.width = width;
    this._sessionConfig.height = height;
    this._sessionConfig.x = x;
    this._sessionConfig.y = y;
  }

  private _sessionConfig: SessionConfig;
  private _window: BrowserWindow;
  private _titleBarView: TitleBarView;
  private _labView: LabView;
}
