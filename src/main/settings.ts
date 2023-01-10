// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';
import * as fs from 'fs';
import { getUserDataDir, getUserHomeDir } from './utils';
import { IPythonEnvironment } from './tokens';

export const DEFAULT_WORKING_DIR = '$HOME';
export const DEFAULT_WIN_WIDTH = 1024;
export const DEFAULT_WIN_HEIGHT = 768;
const MAX_RECENT_SESSIONS = 20;

export interface INewsItem {
  title: string;
  link: string;
}

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
  persistSessionData?: boolean;
  date?: Date;
}

export interface IRecentRemoteURL {
  url: string;
  date: Date;
}

let _appDataSingleton: ApplicationData;

export class ApplicationData {
  constructor() {
    if (_appDataSingleton) {
      throw 'This is a singleton class. Use ApplicationData.getSingleton()';
    }

    this.read();
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
          persistSessionData: recentSession.persistSessionData,
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

    this.discoveredPythonEnvs = [];
    if (
      'discoveredPythonEnvs' in jsonData &&
      Array.isArray(jsonData.discoveredPythonEnvs)
    ) {
      for (const pythonEnv of jsonData.discoveredPythonEnvs) {
        this.discoveredPythonEnvs.push({
          name: pythonEnv.name,
          path: pythonEnv.path,
          type: pythonEnv.type,
          versions: { ...pythonEnv.versions },
          defaultKernel: 'python3'
        });
      }
    }

    this.userSetPythonEnvs = [];
    if (
      'userSetPythonEnvs' in jsonData &&
      Array.isArray(jsonData.userSetPythonEnvs)
    ) {
      for (const pythonEnv of jsonData.userSetPythonEnvs) {
        this.userSetPythonEnvs.push({
          name: pythonEnv.name,
          path: pythonEnv.path,
          type: pythonEnv.type,
          versions: { ...pythonEnv.versions },
          defaultKernel: 'python3'
        });
      }
    }

    this.newsList = [];
    if ('newsList' in jsonData && Array.isArray(jsonData.newsList)) {
      for (const newsItem of jsonData.newsList) {
        this.newsList.push({
          title: newsItem.title,
          link: newsItem.link
        });
      }
    }
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
        persistSessionData: recentSession.persistSessionData,
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

    appDataJSON.discoveredPythonEnvs = [];
    for (const pythonEnv of this.discoveredPythonEnvs) {
      appDataJSON.discoveredPythonEnvs.push({
        name: pythonEnv.name,
        path: pythonEnv.path,
        type: pythonEnv.type,
        versions: { ...pythonEnv.versions }
      });
    }

    appDataJSON.userSetPythonEnvs = [];
    for (const pythonEnv of this.userSetPythonEnvs) {
      appDataJSON.userSetPythonEnvs.push({
        name: pythonEnv.name,
        path: pythonEnv.path,
        type: pythonEnv.type,
        versions: { ...pythonEnv.versions }
      });
    }

    appDataJSON.newsList = [];
    for (const newsItem of this.newsList) {
      appDataJSON.newsList.push({
        title: newsItem.title,
        link: newsItem.link
      });
    }

    fs.writeFileSync(appDataPath, JSON.stringify(appDataJSON, null, 2));
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
        ? session.remoteURL === item.remoteURL &&
            session.persistSessionData === item.persistSessionData
        : session.workingDirectory === item.workingDirectory &&
            filesToOpenCompare(session.filesToOpen, item.filesToOpen);
    });

    const now = new Date();

    if (existing) {
      existing.date = now;
    } else {
      let filesToOpen = [...(session.filesToOpen || [])];
      this.recentSessions.push({
        workingDirectory: session.workingDirectory,
        filesToOpen: filesToOpen,
        remoteURL: session.remoteURL,
        persistSessionData: session.persistSessionData,
        date: now
      });
    }

    this._sortRecentItems(this.recentSessions);

    if (this.recentSessions.length > MAX_RECENT_SESSIONS) {
      this.recentSessions.length = MAX_RECENT_SESSIONS;
    }
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

  newsList: INewsItem[] = [];
  condaRootPath: string = '';
  sessions: SessionConfig[] = [];
  recentRemoteURLs: IRecentRemoteURL[] = [];
  recentSessions: IRecentSession[] = [];

  discoveredPythonEnvs: IPythonEnvironment[] = [];
  userSetPythonEnvs: IPythonEnvironment[] = [];

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
  defaultKernel: string = '';
  lastOpened: Date = new Date();

  url: URL;
  token: string;
  pageConfig: any;
  cookies?: Electron.Cookie[];

  static createLocal(
    workingDirectory?: string,
    filesToOpen?: string[],
    pythonPath?: string
  ): SessionConfig {
    const sessionConfig = new SessionConfig();
    sessionConfig.workingDirectory =
      workingDirectory ||
      userSettings.getValue(SettingType.defaultWorkingDirectory);
    if (filesToOpen) {
      sessionConfig.setFilesToOpen(filesToOpen);
    }
    sessionConfig.pythonPath =
      pythonPath || userSettings.getValue(SettingType.pythonPath);

    return sessionConfig;
  }

  static createLocalForFilesOrFolders(fileOrFolders?: string[]) {
    const folders: string[] = [];
    const files: string[] = [];

    fileOrFolders.forEach(filePath => {
      try {
        const stat = fs.lstatSync(filePath);

        if (stat.isFile()) {
          files.push(filePath);
        } else if (stat.isDirectory()) {
          folders.push(filePath);
        }
      } catch (error) {
        console.error('Failed to get info for selected files');
      }
    });

    if (files.length > 0) {
      const workingDir = path.dirname(files[0]);
      const sameWorkingDirFiles = files
        .filter(file => {
          return file.startsWith(workingDir);
        })
        .map(file => {
          return path.relative(workingDir, file);
        });
      return SessionConfig.createLocal(workingDir, sameWorkingDirFiles);
    } else if (folders.length > 0) {
      return SessionConfig.createLocal(folders[0]);
    }
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

  setFilesToOpen(filePaths: string[]) {
    this.filesToOpen = [];

    const workingDir = this.resolvedWorkingDirectory;

    for (const filePath of filePaths) {
      const fullPath = path.join(workingDir, filePath);
      const stats = fs.lstatSync(fullPath);
      if (stats.isFile()) {
        this.filesToOpen.push(filePath);
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
