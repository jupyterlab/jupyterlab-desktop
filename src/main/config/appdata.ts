// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';
import {
  clearSession,
  dateFromConfig,
  getUserDataDir,
  isPlainObject,
  readJsonConfigFile,
  stringFromConfig,
  stringsFromConfig,
  writeJsonConfigFile
} from '../utils';
import { IEnvironmentType, IPythonEnvironment } from '../tokens';
import { SessionConfig } from './sessionconfig';
import { session as electronSession } from 'electron';
import { ISignal, Signal } from '@lumino/signaling';

const MAX_RECENT_SESSIONS = 20;

/**
 * A file can parse into a perfectly good object and still hold junk inside its arrays. Every loop below walks properties off these entries, and one null among them used to throw during module import, which is #824 again by another route.
 */
function objectsIn(value: unknown): any[] {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

function pythonEnvFromConfig(entry: any): IPythonEnvironment {
  return {
    name: stringFromConfig(entry.name),
    path: stringFromConfig(entry.path),
    // a number here silently takes the wrong branch of every enum compare, and spreading a string gives { '0': '3', '1': '.' }
    type: stringFromConfig(entry.type) as IEnvironmentType,
    versions: isPlainObject(entry.versions) ? { ...entry.versions } : {},
    defaultKernel: 'python3'
  };
}

// all three are written on every save, so one missing means the file was edited: the path reaches path.dirname and the registry, the name is rendered straight into the environment list, and the type is compared against IEnvironmentType, where undefined takes the else branch of every check
function pythonEnvsIn(value: unknown): IPythonEnvironment[] {
  return objectsIn(value)
    .map(pythonEnvFromConfig)
    .filter(
      env =>
        env.path !== undefined &&
        env.name !== undefined &&
        env.type !== undefined
    );
}

export interface INewsItem {
  title: string;
  link: string;
}

export interface IRecentSession {
  workingDirectory?: string;
  filesToOpen?: string[];
  remoteURL?: string;
  persistSessionData?: boolean;
  partition?: string;
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

  setActiveSessions(sessionConfigs: SessionConfig[]) {
    this.sessions = sessionConfigs;
  }

  read() {
    const appDataPath = ApplicationData.getAppDataPath();
    const jsonData = readJsonConfigFile(appDataPath);
    if (!jsonData) {
      return;
    }

    // a non-string here is handed to path.dirname and to the env registry
    if (typeof jsonData.pythonPath === 'string') {
      this.pythonPath = jsonData.pythonPath;
    }

    // TODO: remove after 1/1/2025
    if ('condaRootPath' in jsonData) {
      // copied to prevent circular import
      const condaExePathForEnvPath = (envPath: string) => {
        if (process.platform === 'win32') {
          return path.join(envPath, 'Scripts', 'conda.exe');
        } else {
          return path.join(envPath, 'bin', 'conda');
        }
      };
      if (typeof jsonData.condaRootPath === 'string') {
        this.condaPath = condaExePathForEnvPath(jsonData.condaRootPath);
      }
    }
    if (typeof jsonData.condaPath === 'string') {
      this.condaPath = jsonData.condaPath;
    }

    if (typeof jsonData.systemPythonPath === 'string') {
      this.systemPythonPath = jsonData.systemPythonPath;
    }

    this.sessions = [];
    for (const session of objectsIn(jsonData.sessions)) {
      const sessionConfig = new SessionConfig();
      sessionConfig.deserialize(session);
      this.sessions.push(sessionConfig);
    }

    this.recentSessions = [];
    for (const recentSession of objectsIn(jsonData.recentSessions)) {
      const workingDirectory = stringFromConfig(recentSession.workingDirectory);
      const remoteURL = stringFromConfig(recentSession.remoteURL);
      // an entry naming neither has nothing to reopen, and the welcome view would draw a row for it anyway
      if (workingDirectory === undefined && remoteURL === undefined) {
        continue;
      }
      this.recentSessions.push({
        workingDirectory,
        filesToOpen: stringsFromConfig(recentSession.filesToOpen),
        remoteURL,
        persistSessionData: recentSession.persistSessionData === true,
        // startsWith is called on this without a guard in two places
        partition: stringFromConfig(recentSession.partition),
        date: dateFromConfig(recentSession.date)
      });
    }
    this._sortRecentItems(this.recentSessions);

    this.recentRemoteURLs = [];
    for (const remoteURL of objectsIn(jsonData.recentRemoteURLs)) {
      const url = stringFromConfig(remoteURL.url);
      if (url === undefined) {
        continue;
      }
      this.recentRemoteURLs.push({ url, date: dateFromConfig(remoteURL.date) });
    }
    this._sortRecentItems(this.recentRemoteURLs);

    this.discoveredPythonEnvs = pythonEnvsIn(jsonData.discoveredPythonEnvs);

    this.userSetPythonEnvs = pythonEnvsIn(jsonData.userSetPythonEnvs);

    this.newsList = [];
    for (const newsItem of objectsIn(jsonData.newsList)) {
      const title = stringFromConfig(newsItem.title);
      const link = stringFromConfig(newsItem.link);
      // both are rendered, one as the anchor's text and the other as its href
      if (title === undefined || link === undefined) {
        continue;
      }
      this.newsList.push({ title, link });
    }

    if (typeof jsonData.updateBundledEnvOnRestart === 'boolean') {
      this.updateBundledEnvOnRestart = jsonData.updateBundledEnvOnRestart;
    }
  }

  save(): boolean {
    const appDataPath = ApplicationData.getAppDataPath();
    const appDataJSON: { [key: string]: any } = {};

    if (this.pythonPath !== '') {
      appDataJSON.pythonPath = this.pythonPath;
    }

    if (this.condaPath !== '') {
      appDataJSON.condaPath = this.condaPath;
    }

    if (this.systemPythonPath !== '') {
      appDataJSON.systemPythonPath = this.systemPythonPath;
    }

    appDataJSON.sessions = [];
    for (const sessionConfig of this.sessions) {
      appDataJSON.sessions.push(sessionConfig.serialize());
    }

    appDataJSON.recentSessions = [];
    for (const recentSession of this.recentSessions) {
      appDataJSON.recentSessions.push({
        workingDirectory: recentSession.workingDirectory,
        filesToOpen:
          recentSession.filesToOpen.length > 0
            ? [...recentSession.filesToOpen]
            : undefined,
        remoteURL: recentSession.remoteURL,
        persistSessionData: recentSession.persistSessionData,
        partition: recentSession.persistSessionData
          ? recentSession.partition
          : undefined,
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

    if (this.updateBundledEnvOnRestart) {
      appDataJSON.updateBundledEnvOnRestart = true;
    }

    return writeJsonConfigFile(appDataPath, appDataJSON);
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

  removeRemoteURLFromRecents(url: string) {
    const index = this.recentRemoteURLs.findIndex(value => {
      return value.url === url;
    });

    if (index !== -1) {
      this.recentRemoteURLs.splice(index, 1);
    }
  }

  async addSessionToRecents(session: IRecentSession) {
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
      // update persist info for remote
      if (isRemote) {
        existing.persistSessionData = session.persistSessionData;
        if (
          existing.partition &&
          existing.partition !== session.partition &&
          existing.partition.startsWith('persist:')
        ) {
          try {
            await clearSession(
              electronSession.fromPartition(existing.partition)
            );
          } catch (error) {
            //
          }
        }
        existing.partition = session.partition;
      }
    } else {
      let filesToOpen = [...(session.filesToOpen || [])];
      this.recentSessions.push({
        workingDirectory: session.workingDirectory,
        filesToOpen: filesToOpen,
        remoteURL: session.remoteURL,
        persistSessionData: session.persistSessionData,
        partition: session.partition,
        date: now
      });
    }

    this._sortRecentItems(this.recentSessions);

    if (this.recentSessions.length > MAX_RECENT_SESSIONS) {
      for (
        let i = this.recentSessions.length - 1;
        i >= MAX_RECENT_SESSIONS;
        --i
      ) {
        // make sure persisted sessions are cleared
        await this.removeSessionFromRecents(i);
      }
    }

    this._recentSessionsChanged.emit();
  }

  async removeSessionFromRecents(sessionIndex: number) {
    if (sessionIndex >= 0 && sessionIndex < this.recentSessions.length) {
      const session = this.recentSessions[sessionIndex];
      if (session.partition && session.partition.startsWith('persist:')) {
        try {
          await clearSession(electronSession.fromPartition(session.partition));
        } catch (error) {
          //
        }
      }
      this.recentSessions.splice(sessionIndex, 1);
    }

    this._recentSessionsChanged.emit();
  }

  get recentSessionsChanged(): ISignal<this, void> {
    return this._recentSessionsChanged;
  }

  static getAppDataPath(): string {
    const userDataDir = getUserDataDir();
    return path.join(userDataDir, 'app-data.json');
  }

  private _sortRecentItems(items: { date?: Date }[]) {
    items.sort((lhs, rhs) => {
      return rhs.date.valueOf() - lhs.date.valueOf();
    });
  }

  newsList: INewsItem[] = [];
  /**
   * discovered pythonPath (for JupyterLab server)
   */
  pythonPath: string = '';
  /**
   * discovered condaPath
   */
  condaPath: string = '';
  /**
   * discovered Python path
   */
  systemPythonPath: string = '';
  sessions: SessionConfig[] = [];
  recentRemoteURLs: IRecentRemoteURL[] = [];
  recentSessions: IRecentSession[] = [];

  discoveredPythonEnvs: IPythonEnvironment[] = [];
  userSetPythonEnvs: IPythonEnvironment[] = [];

  updateBundledEnvOnRestart: boolean = false;

  private _recentSessionsChanged = new Signal<this, void>(this);
}

export const appData = ApplicationData.getSingleton();
