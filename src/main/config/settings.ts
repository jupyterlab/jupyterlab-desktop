// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';
import * as fs from 'fs';
import { getUserDataDir, getUserHomeDir } from '../utils';

export const DEFAULT_WIN_WIDTH = 1024;
export const DEFAULT_WIN_HEIGHT = 768;

export enum ThemeType {
  System = 'system',
  Light = 'light',
  Dark = 'dark'
}

export enum StartupMode {
  WelcomePage = 'welcome-page',
  NewLocalSession = 'new-local-session',
  LastSessions = 'restore-sessions'
}

export enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Verbose = 'verbose',
  Debug = 'debug'
}

export enum CtrlWBehavior {
  CloseWindow = 'close',
  Warn = 'warn',
  CloseTab = 'close-tab',
  DoNotClose = 'do-not-close'
}

export type KeyValueMap = { [key: string]: string };

export enum SettingType {
  checkForUpdatesAutomatically = 'checkForUpdatesAutomatically',
  installUpdatesAutomatically = 'installUpdatesAutomatically',
  notifyOnBundledEnvUpdates = 'notifyOnBundledEnvUpdates',
  updateBundledEnvAutomatically = 'updateBundledEnvAutomatically',

  theme = 'theme',
  syncJupyterLabTheme = 'syncJupyterLabTheme',
  showNewsFeed = 'showNewsFeed',

  defaultWorkingDirectory = 'defaultWorkingDirectory',
  pythonPath = 'pythonPath',
  serverArgs = 'serverArgs',
  overrideDefaultServerArgs = 'overrideDefaultServerArgs',
  serverEnvVars = 'serverEnvVars',

  startupMode = 'startupMode',

  ctrlWBehavior = 'ctrlWBehavior',

  logLevel = 'logLevel',

  condaPath = 'condaPath',
  systemPythonPath = 'systemPythonPath',
  pythonEnvsPath = 'pythonEnvsPath',
  condaChannels = 'condaChannels'
}

export const serverLaunchArgsFixed = [
  '--no-browser',
  '--expose-app-in-browser',
  `--ServerApp.port={port}`,
  // use our token rather than any pre-configured password
  '--ServerApp.password=""',
  `--ServerApp.token="{token}"`,
  '--LabApp.quit_button=False'
];

export const serverLaunchArgsDefault = [
  // do not use any config file
  '--JupyterApp.config_file_name=""',
  // enable hidden files (let user decide whether to display them)
  '--ContentsManager.allow_hidden=True'
];

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
    return JSON.stringify(this.value) !== JSON.stringify(this._defaultValue);
  }

  get wsOverridable(): boolean {
    return this?._options?.wsOverridable;
  }

  setToDefault() {
    this._value = this._defaultValue;
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

export class UserSettings {
  constructor(readSettings: boolean = true) {
    this._settings = {
      checkForUpdatesAutomatically: new Setting<boolean>(true),
      installUpdatesAutomatically: new Setting<boolean>(true),
      notifyOnBundledEnvUpdates: new Setting<boolean>(true),
      updateBundledEnvAutomatically: new Setting<boolean>(false),
      showNewsFeed: new Setting<boolean>(true),

      /* making themes workspace overridable is not feasible.
      When app has multiple windows, different window titlebars shouldn't have different themes.
      Also, JupyterLab theme is stored as user settings in {USER_DATA}/jupyterlab-desktop/lab/.
      An individual working-dir cannot have a different theme with common lab settings.
      */
      theme: new Setting<ThemeType>(ThemeType.System),
      syncJupyterLabTheme: new Setting<boolean>(true),

      defaultWorkingDirectory: new Setting<string>(''),
      pythonPath: new Setting<string>('', { wsOverridable: true }),
      serverArgs: new Setting<string>('', { wsOverridable: true }),
      overrideDefaultServerArgs: new Setting<boolean>(false, {
        wsOverridable: true
      }),
      serverEnvVars: new Setting<KeyValueMap>({}, { wsOverridable: true }),

      startupMode: new Setting<StartupMode>(StartupMode.WelcomePage),

      ctrlWBehavior: new Setting<CtrlWBehavior>(CtrlWBehavior.CloseTab),

      logLevel: new Setting<string>(LogLevel.Warn),

      condaPath: new Setting<string>(''),
      systemPythonPath: new Setting<string>(''),
      pythonEnvsPath: new Setting<string>(''),
      condaChannels: new Setting<string[]>(['conda-forge'])
    };

    if (readSettings) {
      this.read();
    }
  }

  static getUserSettingsPath(): string {
    const userDataDir = getUserDataDir();
    return path.join(userDataDir, 'settings.json');
  }

  get settings() {
    return this._settings;
  }

  getValue(setting: SettingType) {
    return this._settings[setting].value;
  }

  setValue(setting: SettingType, value: any) {
    this._settings[setting].value = value;
  }

  unsetValue(setting: SettingType) {
    this._settings[setting].setToDefault();
  }

  read() {
    const userSettingsPath = UserSettings.getUserSettingsPath();
    if (!fs.existsSync(userSettingsPath)) {
      return;
    }
    const data = fs.readFileSync(userSettingsPath);
    const jsonData = JSON.parse(data.toString());

    for (let key in SettingType) {
      if (key in jsonData) {
        const setting = this._settings[key];
        setting.value = jsonData[key];
      }
    }
  }

  save() {
    const userSettingsPath = UserSettings.getUserSettingsPath();
    const userSettings: { [key: string]: any } = {};

    for (let key in SettingType) {
      const setting = this._settings[key];
      if (setting.differentThanDefault) {
        userSettings[key] = setting.value;
      }
    }

    fs.writeFileSync(userSettingsPath, JSON.stringify(userSettings, null, 2));
  }

  get resolvedWorkingDirectory(): string {
    return resolveWorkingDirectory(
      this._settings[SettingType.defaultWorkingDirectory].value
    );
  }

  protected _settings: { [key: string]: Setting<any> };
}

export class WorkspaceSettings extends UserSettings {
  constructor(workingDirectory: string) {
    super(false);

    this._workingDirectory = resolveWorkingDirectory(workingDirectory);
    this.read();
  }

  get settings() {
    return this._wsSettings;
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

  unsetValue(setting: SettingType) {
    delete this._wsSettings[setting];
  }

  read() {
    super.read();

    const wsSettingsPath = WorkspaceSettings.getWorkspaceSettingsPath(
      this._workingDirectory
    );
    if (!fs.existsSync(wsSettingsPath)) {
      return;
    }
    const data = fs.readFileSync(wsSettingsPath);
    const jsonData = JSON.parse(data.toString());

    for (let key in SettingType) {
      if (key in jsonData) {
        const userSetting = this._settings[key];
        if (userSetting.wsOverridable) {
          this._wsSettings[key] = Object.assign({}, userSetting);
          this._wsSettings[key].value = jsonData[key];
        }
      }
    }
  }

  save() {
    const wsSettingsPath = WorkspaceSettings.getWorkspaceSettingsPath(
      this._workingDirectory
    );
    const wsSettings: { [key: string]: any } = {};

    for (let key in SettingType) {
      const setting = this._wsSettings[key];
      if (
        setting &&
        this._settings[key].wsOverridable &&
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
      fs.writeFileSync(wsSettingsPath, JSON.stringify(wsSettings, null, 2));
    }
  }

  private _isDifferentThanUserSetting(setting: SettingType): boolean {
    if (
      setting in this._settings &&
      setting in this._wsSettings &&
      this._settings[setting].value !== this._wsSettings[setting].value
    ) {
      return true;
    }

    return false;
  }

  static getWorkspaceSettingsPath(workingDirectory: string): string {
    return path.join(workingDirectory, '.jupyter', 'desktop-settings.json');
  }

  private _workingDirectory: string;
  private _wsSettings: { [key: string]: Setting<any> } = {};
}

export function resolveWorkingDirectory(
  workingDirectory: string,
  resetIfInvalid: boolean = true
): string {
  const home = getUserHomeDir();
  let resolved = workingDirectory || '';
  if (!resolved) {
    resolved = home;
    resetIfInvalid = false;
  }

  if (resetIfInvalid) {
    try {
      const stat = fs.lstatSync(resolved);

      if (!stat.isDirectory()) {
        resolved = home;
      }
    } catch (error) {
      resolved = home;
    }
  }

  return resolved;
}

export const userSettings = new UserSettings();
