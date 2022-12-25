// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';
import * as fs from 'fs';
import { getUserDataDir, getUserHomeDir } from './utils';

export function resolveWorkingDirectory(workingDirectory: string): string {
  const home = getUserHomeDir();
  let resolved = workingDirectory.replace('$HOME', home);
  const stat = fs.lstatSync(resolved);

  if (stat.isDirectory()) {
    return resolved;
  } else {
    return home;
  }
}

export class Setting<T> {
  constructor(defaultValue: T, options?: Setting.IOptions) {
    this._defaultValue = defaultValue;
    this._options = options;
  }

  set value(val: T) {
    this._value = val;
    this._valueSet = true;
  }

  get value(): T {
    return this._valueSet ? this._value : this._defaultValue;
  }

  get valueSet(): boolean {
    return this._valueSet;
  }

  get differentThanDefault(): boolean {
    return this.value !== this._defaultValue;
  }

  get wsOverridable(): boolean {
    return this?._options?.wsOverridable;
  }

  private _defaultValue: T;
  private _value: T;
  private _valueSet = false;
  private _options: Setting.IOptions;
}

export namespace Setting {
  export interface IOptions {
    wsOverridable?: boolean;
  }
}

export type ThemeType = 'system' | 'light' | 'dark';
export type FrontEndMode = 'web-app' | 'client-app';

export interface IWindowData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ISessionData {
  remoteURL: string;
  workingDirectory: string;
  fileToOpen: string;
  pythonPath: string;
  persistSessionData: boolean;
  clearSessionDataOnNextLaunch: boolean;
}

export enum SettingType {
  checkForUpdatesAutomatically = 'checkForUpdatesAutomatically',
  installUpdatesAutomatically = 'installUpdatesAutomatically',

  theme = 'theme',
  syncJupyterLabTheme = 'syncJupyterLabTheme',
  frontEndMode = 'frontEndMode',

  defaultWorkingDirectory = 'defaultWorkingDirectory',
  pythonPath = 'pythonPath'
}

export class UserSettings {
  constructor() {
    this._settings = {
      checkForUpdatesAutomatically: new Setting<boolean>(true),
      installUpdatesAutomatically: new Setting<boolean>(true),

      theme: new Setting<ThemeType>('system', { wsOverridable: true }),
      syncJupyterLabTheme: new Setting<boolean>(true, { wsOverridable: true }),
      frontEndMode: new Setting<FrontEndMode>('web-app', {
        wsOverridable: true
      }),

      defaultWorkingDirectory: new Setting<string>('$HOME'),
      pythonPath: new Setting<string>('', { wsOverridable: true })
    };

    this.read();
  }

  getValue(setting: SettingType) {
    return this._settings[setting].value;
  }

  setValue(setting: SettingType, value: any) {
    this._settings[setting].value = value;
  }

  read() {
    const userSettingsPath = this._getUserSettingsPath();
    if (!fs.existsSync(userSettingsPath)) {
      return;
    }
    const data = fs.readFileSync(userSettingsPath);
    const userSettingsData = JSON.parse(data.toString());

    for (let key in SettingType) {
      if (key in userSettingsData) {
        const setting = this._settings[key];
        setting.value = userSettingsData[key];
      }
    }
  }

  save() {
    const userSettingsPath = this._getUserSettingsPath();
    const userSettings: { [key: string]: any } = {};

    for (let key in SettingType) {
      const setting = this._settings[key];
      if (setting.differentThanDefault) {
        userSettings[key] = setting.value;
      }
    }

    fs.writeFileSync(userSettingsPath, JSON.stringify(userSettings));
  }

  private _getUserSettingsPath(): string {
    const userDataDir = getUserDataDir();
    return path.join(userDataDir, 'settings.json');
  }

  protected _settings: { [key: string]: Setting<any> };
}

export class WorkspaceSettings extends UserSettings {
  constructor(workingDirectory: string) {
    super();

    this._workingDirectory = resolveWorkingDirectory(workingDirectory);
    this.read();
  }

  getValue(setting: SettingType) {
    if (setting in this._wsSettings) {
      return this._wsSettings[setting].value;
    } else {
      return this._settings[setting].value;
    }
  }

  setValue(setting: SettingType, value: any) {
    if (!(setting in this._wsSettings)) {
      this._wsSettings[setting] = Object.assign({}, this._settings[setting]);
    }

    this._wsSettings[setting].value = value;
  }

  read() {
    super.read();

    const wsSettingsPath = this._getWorkspaceSettingsPath();
    if (!fs.existsSync(wsSettingsPath)) {
      return;
    }
    const data = fs.readFileSync(wsSettingsPath);
    const wsSettingsData = JSON.parse(data.toString());

    for (let key in SettingType) {
      if (key in wsSettingsData) {
        const userSetting = this._settings[key];
        if (userSetting.wsOverridable) {
          this._wsSettings[key] = Object.assign({}, userSetting);
          this._wsSettings[key].value = wsSettingsData[key];
        }
      }
    }
  }

  save() {
    const wsSettingsPath = this._getWorkspaceSettingsPath();
    const wsSettings: { [key: string]: any } = {};

    for (let key in SettingType) {
      const setting = this._settings[key];
      if (
        setting.wsOverridable &&
        this._isDifferentThanUserSetting(key as SettingType)
      ) {
        wsSettings[key] = setting.value;
      }
    }

    const exists = fs.existsSync(wsSettingsPath);
    if (Object.keys(wsSettings).length > 0 || exists) {
      if (!exists) {
        const dirPath = path.dirname(wsSettingsPath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
      }
      fs.writeFileSync(wsSettingsPath, JSON.stringify(wsSettings));
    }
  }

  private _isDifferentThanUserSetting(setting: SettingType): boolean {
    if (
      setting in this._settings &&
      setting in this._wsSettings &&
      this._settings[setting].value === this._wsSettings[setting].value
    ) {
      return true;
    }

    return false;
  }

  private _getWorkspaceSettingsPath(): string {
    return path.join(
      this._workingDirectory,
      '.jupyter',
      'desktop-settings.json'
    );
  }

  private _workingDirectory: string;
  private _wsSettings: { [key: string]: Setting<any> } = {};
}

export interface ISessionIdentifier {
  workingDirectory: string;
  fileToOpen: string;

  remoteURL: string;
}

export class ApplicationData {
  constructor() {
    this.read();

    const sessionConfig = new SessionConfig();

    this.sessions.push(sessionConfig);
  }

  read() {
    //
  }

  save() {
    //
  }

  getSessionConfig(): SessionConfig {
    return this.sessions[0];
  }

  sessions: SessionConfig[] = [];
  condaRootPath: string;

  recentSessions: ISessionIdentifier[];
  recentPythonPaths: string[];
  recentWorkingDirs: string[];
}

export class SessionConfig implements ISessionData, IWindowData {
  x: number = 0;
  y: number = 0;
  width: number = 800;
  height: number = 600;
  remoteURL: string = '';
  workingDirectory: string = '$HOME';
  fileToOpen: string = '';
  pythonPath: string = '';
  clearSessionDataOnNextLaunch: boolean = false;
  persistSessionData: boolean;
  lastOpened: Date;

  url: URL;
  token: string;
  pageConfig: any;
  cookies?: Electron.Cookie[];

  get isRemote(): boolean {
    return this.remoteURL !== '';
  }
}

export const appData = new ApplicationData();
export const userSettings = new UserSettings();
