// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { BrowserWindow, clipboard, Menu, MenuItemConstructorOptions } from 'electron';
import { LabView } from '../labview/labview';
import { TitleBarView } from '../titlebarview/titlebarview';

export interface IInfo {
  serverState: 'new' | 'local' | 'remote';
  platform: NodeJS.Platform;
  uiState: 'linux' | 'mac' | 'windows';
  x: number;
  y: number;
  width: number;
  height: number;
}

export class MainWindow {
  constructor(info: IInfo) {
    this._info = info;

    this._window = new BrowserWindow({
      width: this._info.width,
      height: this._info.height,
      x: this._info.x,
      y: this._info.y,
      minWidth: 400,
      minHeight: 300,
      show: true,
      title: 'JupyterLab',
      titleBarStyle: 'hidden',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    this._window.setMenuBarVisibility(false);

    this._addFallbackContextMenu();

    if (this._info.x && this._info.y) {
      this._window.setBounds({
        x: this._info.x,
        y: this._info.y,
        height: this._info.height,
        width: this._info.width
      });
    } else {
      this._window.center();
    }
  }

  get window(): BrowserWindow {
    return this._window;
  }

  load() {
    const labView = new LabView({
      serverState: this._info.serverState,
      platform: this._info.platform,
      uiState: this._info.uiState
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

    resizeViews();
  }

  /**
   * Simple fallback context menu shown on Shift + Right Click.
   * May be removed in future versions once (/if) JupyterLab builtin menu
   * supports cut/copy/paste, including "Copy link URL" and "Copy image".
   * @private
   */
  private _addFallbackContextMenu(): void {
    const selectionTemplate: MenuItemConstructorOptions[] = [{ role: 'copy' }];

    const inputMenu = Menu.buildFromTemplate([
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]);

    this._window.webContents.on('context-menu', (event, params) => {
      if (params.isEditable) {
        inputMenu.popup({ window: this._window });
      } else {
        const template: MenuItemConstructorOptions[] = [];
        if (params.selectionText) {
          template.push(...selectionTemplate);
        }
        if (params.linkURL) {
          template.push({
            label: 'Copy link URL',
            click: () => {
              clipboard.writeText(params.linkURL);
            }
          });
        }
        if (params.hasImageContents) {
          template.push({
            label: 'Copy image',
            click: () => {
              this._window.webContents.copyImageAt(params.x, params.y);
            }
          });
        }
        if (template.length) {
          Menu.buildFromTemplate(template).popup({ window: this._window });
        }
      }
    });
  }

  private _info: IInfo;
  private _window: BrowserWindow;
}
