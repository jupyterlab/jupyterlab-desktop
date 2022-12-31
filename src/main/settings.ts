// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';
import * as fs from 'fs';
import { getUserDataDir, getUserHomeDir, isDevMode } from './utils';

export const DEFAULT_WORKING_DIR = '$HOME';
export const DEFAULT_WIN_WIDTH = 1024;
export const DEFAULT_WIN_HEIGHT = 768;

export function resolveWorkingDirectory(
  workingDirectory: string,
  resetIfInvalid: boolean = true
): string {
  const home = getUserHomeDir();
  let resolved = workingDirectory.replace('$HOME', home);

  if (resetIfInvalid) {
    const stat = fs.lstatSync(resolved);

    if (!stat.isDirectory()) {
      resolved = home;
    }
  }

  return resolved;
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

export enum ThemeType {
  System = 'system',
  Light = 'light',
  Dark = 'dark'
}

export enum FrontEndMode {
  WebApp = 'web-app',
  ClientApp = 'client-app'
}

export enum StartupMode {
  WelcomePage = 'welcome-page',
  NewLocalSession = 'new-local-session',
  LastSessions = 'restore-sessions'
}

export interface IWindowData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ISessionData {
  remoteURL: string;
  workingDirectory: string;
  filesToOpen: string[];
  pythonPath: string;
  persistSessionData: boolean;
  clearSessionDataOnNextLaunch: boolean;
}

export enum SettingType {
  checkForUpdatesAutomatically = 'checkForUpdatesAutomatically',
  installUpdatesAutomatically = 'installUpdatesAutomatically',

  theme = 'theme',
  syncJupyterLabTheme = 'syncJupyterLabTheme',
  showNewsFeed = 'showNewsFeed',
  frontEndMode = 'frontEndMode',

  defaultWorkingDirectory = 'defaultWorkingDirectory',
  pythonPath = 'pythonPath',

  startupMode = 'startupMode'
}

export class UserSettings {
  constructor(readSettings: boolean = true) {
    this._settings = {
      checkForUpdatesAutomatically: new Setting<boolean>(true),
      installUpdatesAutomatically: new Setting<boolean>(true),
      showNewsFeed: new Setting<boolean>(true),

      theme: new Setting<ThemeType>(ThemeType.System, { wsOverridable: true }),
      syncJupyterLabTheme: new Setting<boolean>(true, { wsOverridable: true }),
      frontEndMode: new Setting<FrontEndMode>(FrontEndMode.WebApp),

      defaultWorkingDirectory: new Setting<string>(DEFAULT_WORKING_DIR),
      pythonPath: new Setting<string>('', { wsOverridable: true }),

      startupMode: new Setting<StartupMode>(StartupMode.WelcomePage)
    };

    if (readSettings) {
      this.read();
    }
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
    const jsonData = JSON.parse(data.toString());

    for (let key in SettingType) {
      if (key in jsonData) {
        const setting = this._settings[key];
        setting.value = jsonData[key];
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

    fs.writeFileSync(userSettingsPath, JSON.stringify(userSettings, null, 2));
  }

  get resolvedWorkingDirectory(): string {
    return resolveWorkingDirectory(
      this._settings[SettingType.defaultWorkingDirectory].value
    );
  }

  private _getUserSettingsPath(): string {
    const userDataDir = getUserDataDir();
    return path.join(userDataDir, 'settings.json');
  }

  protected _settings: { [key: string]: Setting<any> };
}

export class WorkspaceSettings extends UserSettings {
  constructor(workingDirectory: string) {
    super(false);

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
      fs.writeFileSync(wsSettingsPath, JSON.stringify(wsSettings, null, 2));
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

export interface IRecentSession {
  workingDirectory?: string;
  filesToOpen?: string[];
  remoteURL?: string;
  date?: Date;
}

export interface IRecentRemoteURL {
  url: string;
  date: Date;
}

export interface IRecentPythonPath {
  path: string;
  date: Date;
}

let _appDataSingleton: ApplicationData;

export class ApplicationData {
  constructor() {
    if (_appDataSingleton) {
      throw 'This is a singleton class. Use ApplicationData.getSingleton()';
    }

    this.read();

    const createNewSession =
      this.sessions.length === 0 || (process.argv.length > 1 && !isDevMode());

    if (createNewSession) {
      const sessionConfig = SessionConfig.createLocal();

      // handle opening file or directory with command-line arguments
      if (process.argv.length > 1) {
        const openPath = path.resolve(process.argv[1]);

        if (fs.existsSync(openPath)) {
          if (fs.lstatSync(openPath).isDirectory()) {
            sessionConfig.workingDirectory = openPath;
          } else {
            sessionConfig.workingDirectory = path.dirname(openPath);
          }
        }
      }

      this.sessions.push(sessionConfig);
    }
  }

  static getSingleton() {
    if (!_appDataSingleton) {
      _appDataSingleton = new ApplicationData();
    }

    return _appDataSingleton;
  }

  read() {
    const appDataPath = this._getAppDataPath();
    if (!fs.existsSync(appDataPath)) {
      return;
    }
    const data = fs.readFileSync(appDataPath);
    const jsonData = JSON.parse(data.toString());

    if ('condaRootPath' in jsonData) {
      this.condaRootPath = jsonData.condaRootPath;
    }

    this.sessions = [];

    if ('sessions' in jsonData && Array.isArray(jsonData.sessions)) {
      for (const session of jsonData.sessions) {
        const sessionConfig = new SessionConfig();
        sessionConfig.deserialize(session);
        this.sessions.push(sessionConfig);
      }
    }

    this.recentSessions = [];

    if (
      'recentSessions' in jsonData &&
      Array.isArray(jsonData.recentSessions)
    ) {
      for (const recentSession of jsonData.recentSessions) {
        this.recentSessions.push({
          workingDirectory: recentSession.workingDirectory,
          filesToOpen: [...recentSession.filesToOpen],
          remoteURL: recentSession.remoteURL,
          date: new Date(recentSession.date)
        });
      }
    }

    this._sortRecentItems(this.recentSessions);

    this.recentRemoteURLs = [];

    if (
      'recentRemoteURLs' in jsonData &&
      Array.isArray(jsonData.recentRemoteURLs)
    ) {
      for (const remoteURL of jsonData.recentRemoteURLs) {
        this.recentRemoteURLs.push({
          url: remoteURL.url,
          date: new Date(remoteURL.date)
        });
      }
    }

    this._sortRecentItems(this.recentRemoteURLs);
  }

  save() {
    const appDataPath = this._getAppDataPath();
    const appDataJSON: { [key: string]: any } = {};

    if (this.condaRootPath !== '') {
      appDataJSON.condaRootPath = this.condaRootPath;
    }

    appDataJSON.sessions = [];

    for (const sessionConfig of this.sessions) {
      appDataJSON.sessions.push(sessionConfig.serialize());
    }

    appDataJSON.recentSessions = [];

    for (const recentSession of this.recentSessions) {
      appDataJSON.recentSessions.push({
        workingDirectory: recentSession.workingDirectory,
        filesToOpen: [...recentSession.filesToOpen],
        remoteURL: recentSession.remoteURL,
        date: recentSession.date.toISOString()
      });
    }

    appDataJSON.recentRemoteURLs = [];

    for (const remoteUrl of this.recentRemoteURLs) {
      appDataJSON.recentRemoteURLs.push({
        url: remoteUrl.url,
        date: remoteUrl.date.toISOString()
      });
    }

    fs.writeFileSync(appDataPath, JSON.stringify(appDataJSON, null, 2));
  }

  getSessionConfig(): SessionConfig {
    return this.sessions[0];
  }

  setSessionConfig(config: SessionConfig) {
    this.sessions[0] = config;
  }

  addRemoteURLToRecents(url: string) {
    const existing = this.recentRemoteURLs.find(value => {
      return value.url === url;
    });

    const now = new Date();

    if (existing) {
      existing.date = now;
    } else {
      this.recentRemoteURLs.push({
        url,
        date: now
      });
    }
  }

  addSessionToRecents(session: IRecentSession) {
    const filesToOpenCompare = (lhs: string[], rhs: string[]): boolean => {
      return (
        Array.isArray(lhs) &&
        Array.isArray(rhs) &&
        lhs.length === rhs.length &&
        lhs.every((element, index) => {
          return element === rhs[index];
        })
      );
    };

    const isRemote = session.remoteURL !== undefined;
    const existing = this.recentSessions.find(item => {
      return isRemote
        ? session.remoteURL === item.remoteURL
        : session.workingDirectory === item.workingDirectory &&
            filesToOpenCompare(session.filesToOpen, item.filesToOpen);
    });

    const now = new Date();

    if (existing) {
      existing.date = now;
    } else {
      let filesToOpen = [...(session.filesToOpen || [])];
      filesToOpen = filesToOpen.map(filePath =>
        path.join(session.workingDirectory, filePath)
      );
      this.recentSessions.push({
        workingDirectory: session.workingDirectory,
        filesToOpen: filesToOpen,
        remoteURL: session.remoteURL,
        date: now
      });
    }

    this._sortRecentItems(this.recentSessions);
  }

  private _getAppDataPath(): string {
    const userDataDir = getUserDataDir();
    return path.join(userDataDir, 'app-data.json');
  }

  private _sortRecentItems(items: { date?: Date }[]) {
    items.sort((lhs, rhs) => {
      return rhs.date.valueOf() - lhs.date.valueOf();
    });
  }

  condaRootPath: string = '';
  sessions: SessionConfig[] = [];
  recentRemoteURLs: IRecentRemoteURL[] = [];
  recentSessions: IRecentSession[] = [];
  recentPythonPaths: IRecentPythonPath[] = [];

  recentWorkingDirs: string[];
}

export class SessionConfig implements ISessionData, IWindowData {
  x: number = 0;
  y: number = 0;
  width: number = DEFAULT_WIN_WIDTH;
  height: number = DEFAULT_WIN_HEIGHT;
  remoteURL: string = '';
  persistSessionData: boolean = true;
  workingDirectory: string = DEFAULT_WORKING_DIR;
  filesToOpen: string[] = [];
  pythonPath: string = '';
  clearSessionDataOnNextLaunch: boolean = false;
  lastOpened: Date = new Date();

  url: URL;
  token: string;
  pageConfig: any;
  cookies?: Electron.Cookie[];

  static createLocal(
    workingDirectory?: string,
    fileToOpen?: string,
    pythonPath?: string
  ): SessionConfig {
    const sessionConfig = new SessionConfig();
    sessionConfig.workingDirectory =
      workingDirectory ||
      userSettings.getValue(SettingType.defaultWorkingDirectory);
    if (fileToOpen) {
      sessionConfig.setFileToOpen(fileToOpen);
    }
    sessionConfig.pythonPath =
      pythonPath || userSettings.getValue(SettingType.pythonPath);

    return sessionConfig;
  }

  static createRemote(
    remoteURL: string,
    persistSessionData?: boolean
  ): SessionConfig {
    const sessionConfig = new SessionConfig();
    sessionConfig.remoteURL = remoteURL;
    sessionConfig.persistSessionData = persistSessionData !== false;

    return sessionConfig;
  }

  get isRemote(): boolean {
    return this.remoteURL !== '';
  }

  get resolvedWorkingDirectory(): string {
    return resolveWorkingDirectory(this.workingDirectory);
  }

  setFileToOpen(filePath: string) {
    const stats = fs.lstatSync(filePath);
    if (stats.isFile()) {
      const workingDir = this.resolvedWorkingDirectory;
      if (filePath.startsWith(workingDir)) {
        let relPath = filePath.substring(workingDir.length);
        const winConvert = relPath.split('\\').join('/');
        relPath = winConvert.replace('/', '');
        this.filesToOpen = [relPath];
      }
    }
  }

  deserialize(jsonData: any) {
    if ('x' in jsonData) {
      this.x = jsonData.x;
    }
    if ('y' in jsonData) {
      this.y = jsonData.y;
    }
    if ('width' in jsonData) {
      this.width = jsonData.width;
    }
    if ('height' in jsonData) {
      this.height = jsonData.height;
    }
    if ('lastOpened' in jsonData) {
      this.lastOpened = new Date(jsonData.lastOpened);
    }
    if ('remoteURL' in jsonData) {
      this.remoteURL = jsonData.remoteURL;
    }
    if ('persistSessionData' in jsonData) {
      this.persistSessionData = jsonData.persistSessionData;
    }
    if ('workingDirectory' in jsonData) {
      this.workingDirectory = jsonData.workingDirectory;
    }
    if ('filesToOpen' in jsonData) {
      this.filesToOpen = [...jsonData.filesToOpen];
    }
    if ('pythonPath' in jsonData) {
      this.pythonPath = jsonData.pythonPath;
    }
    if ('clearSessionDataOnNextLaunch' in jsonData) {
      this.clearSessionDataOnNextLaunch = jsonData.clearSessionDataOnNextLaunch;
    }
    if ('pageConfig' in jsonData) {
      this.pageConfig = JSON.parse(JSON.stringify(jsonData.pageConfig));
    }
  }

  serialize(): any {
    const jsonData: any = {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      lastOpened: this.lastOpened.toISOString()
    };

    if (this.remoteURL !== '') {
      jsonData.remoteURL = this.remoteURL;
    }

    if (this.persistSessionData === false) {
      jsonData.persistSessionData = this.persistSessionData;
    }

    if (this.workingDirectory !== DEFAULT_WORKING_DIR) {
      jsonData.workingDirectory = this.workingDirectory;
    }

    if (this.filesToOpen.length > 0) {
      jsonData.filesToOpen = [...this.filesToOpen];
    }

    if (this.pythonPath !== '') {
      jsonData.pythonPath = this.pythonPath;
    }

    if (this.clearSessionDataOnNextLaunch === true) {
      jsonData.clearSessionDataOnNextLaunch = this.clearSessionDataOnNextLaunch;
    }

    // if local server and JupyterLab UI is in client-app mode
    if (
      this.pageConfig &&
      this.remoteURL === '' &&
      userSettings.getValue(SettingType.frontEndMode) === FrontEndMode.ClientApp
    ) {
      const pageConfig = JSON.parse(JSON.stringify(this.pageConfig));
      delete pageConfig['token'];
      jsonData.pageConfig = pageConfig;
    }

    return jsonData;
  }
}

export const userSettings = new UserSettings();
export const appData = ApplicationData.getSingleton();
