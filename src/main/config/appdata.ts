// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';
import * as fs from 'fs';
import { clearSession, getUserDataDir } from '../utils';
import { IPythonEnvironment } from '../tokens';
import { SessionConfig } from './sessionconfig';
import { session as electronSession } from 'electron';
import { ISignal, Signal } from '@lumino/signaling';

const MAX_RECENT_SESSIONS = 20;

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
    if (!fs.existsSync(appDataPath)) {
      return;
    }
    const data = fs.readFileSync(appDataPath);
    const jsonData = JSON.parse(data.toString());

    if ('pythonPath' in jsonData) {
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
      this.condaPath = condaExePathForEnvPath(jsonData.condaRootPath);
    }
    if ('condaPath' in jsonData) {
      this.condaPath = jsonData.condaPath;
    }

    if ('systemPythonPath' in jsonData) {
      this.systemPythonPath = jsonData.systemPythonPath;
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
          filesToOpen: recentSession.filesToOpen
            ? [...recentSession.filesToOpen]
            : [],
          remoteURL: recentSession.remoteURL,
          persistSessionData: recentSession.persistSessionData,
          partition: recentSession.partition,
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

    if ('updateBundledEnvOnRestart' in jsonData) {
      this.updateBundledEnvOnRestart = jsonData.updateBundledEnvOnRestart;
    }
  }

  save() {
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
