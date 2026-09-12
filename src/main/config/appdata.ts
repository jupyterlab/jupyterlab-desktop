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
  encryptedRemoteURL?: string;
  legacyRemoteURL?: string;
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
    this.storedURLsRewritten = false;
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
        if (
          typeof session.remoteURL === 'string' &&
          sessionConfig.remoteURL !== session.remoteURL
        ) {
          this.storedURLsRewritten = true;
        }
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
          remoteURL: recentSession.remoteURL
            ? this._canonicalURL(recentSession.remoteURL)
            : recentSession.remoteURL,
          persistSessionData: recentSession.persistSessionData,
          partition: recentSession.partition,
          encryptedRemoteURL: recentSession.encryptedRemoteURL,
          legacyRemoteURL:
            recentSession.remoteURL &&
            SessionConfig.carriesCredentials(recentSession.remoteURL)
              ? recentSession.remoteURL
              : undefined,
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
          url: this._canonicalURL(remoteURL.url),
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
        remoteURL: recentSession.remoteURL
          ? SessionConfig.remoteURLForStorage(recentSession.remoteURL)
          : recentSession.remoteURL,
        persistSessionData: recentSession.persistSessionData,
        partition: recentSession.persistSessionData
          ? recentSession.partition
          : undefined,
        encryptedRemoteURL:
          recentSession.persistSessionData !== false
            ? recentSession.encryptedRemoteURL
            : undefined,
        date: recentSession.date.toISOString()
      });
    }

    appDataJSON.recentRemoteURLs = [];
    for (const remoteUrl of this.recentRemoteURLs) {
      appDataJSON.recentRemoteURLs.push({
        url: SessionConfig.remoteURLForStorage(remoteUrl.url),
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

    fs.writeFileSync(appDataPath, JSON.stringify(appDataJSON, null, 2), {
      mode: 0o600
    });
    // tightens a file an earlier release created at 0644: the mode above
    // applies only when the file is created. Best effort, because a mount that
    // refuses a mode change must not turn a completed save into a throw. Every
    // caller treats save() as done once the bytes are written, and the ready
    // handler would otherwise quit the app before it opens a window.
    try {
      fs.chmodSync(appDataPath, 0o600);
    } catch (error) {
      console.warn('Failed to restrict app-data.json permissions', error);
    }
  }

  addRemoteURLToRecents(url: string) {
    url = SessionConfig.remoteURLForStorage(url);
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
    url = SessionConfig.remoteURLForStorage(url);
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

    const remoteURL = session.remoteURL
      ? SessionConfig.remoteURLForStorage(session.remoteURL)
      : session.remoteURL;
    const isRemote = remoteURL !== undefined;
    const existing = this.recentSessions.find(item => {
      return isRemote
        ? remoteURL === item.remoteURL
        : session.workingDirectory === item.workingDirectory &&
            filesToOpenCompare(session.filesToOpen, item.filesToOpen);
    });

    const now = new Date();

    if (existing) {
      existing.date = now;
      // update persist info for remote
      if (isRemote) {
        // the row reads as the new session before the first await: the caller
        // does not wait for this, and a save that runs while the old partition
        // is being cleared must not write the old partition and credential
        const previousPartition = existing.partition;
        existing.persistSessionData = session.persistSessionData;
        existing.partition = session.partition;
        existing.encryptedRemoteURL = session.encryptedRemoteURL;
        if (
          previousPartition &&
          previousPartition !== session.partition &&
          previousPartition.startsWith('persist:')
        ) {
          try {
            await clearSession(
              electronSession.fromPartition(previousPartition)
            );
          } catch (error) {
            //
          }
        }
      }
    } else {
      let filesToOpen = [...(session.filesToOpen || [])];
      this.recentSessions.push({
        workingDirectory: session.workingDirectory,
        filesToOpen: filesToOpen,
        remoteURL,
        persistSessionData: session.persistSessionData,
        partition: session.partition,
        encryptedRemoteURL: session.encryptedRemoteURL,
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

  /**
   * Collapse recents rows that differ only by a query string that is no longer
   * stored, and release the session data of the rows that are dropped. An
   * install upgraded from a release that kept the token in the URL holds one
   * row per token for the same server, and reading maps them all onto the same
   * canonical URL. The newest row wins, so its partition and credential are the
   * ones kept. Returns whether anything changed, so the caller knows to save.
   *
   * Runs after Electron is ready, because clearing a partition needs a session.
   */
  async mergeDuplicateRecents(): Promise<boolean> {
    this._sortRecentItems(this.recentSessions);
    this._sortRecentItems(this.recentRemoteURLs);

    // a window restoring into a partition still needs its cookies, even when
    // the recents row that named it is the one being dropped
    const partitionsInUse = new Set(
      this.sessions.map(sessionConfig => sessionConfig.partition)
    );

    const supersededPartitions: string[] = [];
    const mergedSessions: IRecentSession[] = [];
    for (const recentSession of this.recentSessions) {
      const duplicate =
        recentSession.remoteURL &&
        mergedSessions.some(item => item.remoteURL === recentSession.remoteURL);
      if (!duplicate) {
        mergedSessions.push(recentSession);
      } else if (
        recentSession.partition?.startsWith('persist:') &&
        !partitionsInUse.has(recentSession.partition)
      ) {
        supersededPartitions.push(recentSession.partition);
      }
    }

    const mergedRemoteURLs: IRecentRemoteURL[] = [];
    for (const remoteURL of this.recentRemoteURLs) {
      if (!mergedRemoteURLs.some(item => item.url === remoteURL.url)) {
        mergedRemoteURLs.push(remoteURL);
      }
    }

    const changed =
      mergedSessions.length !== this.recentSessions.length ||
      mergedRemoteURLs.length !== this.recentRemoteURLs.length;
    this.recentSessions = mergedSessions;
    this.recentRemoteURLs = mergedRemoteURLs;

    for (const partition of supersededPartitions) {
      try {
        await clearSession(electronSession.fromPartition(partition));
      } catch (error) {
        //
      }
    }

    if (changed) {
      this._recentSessionsChanged.emit();
    }

    return changed;
  }

  async migrateRemoteCredentials(): Promise<boolean> {
    let changed = false;
    for (const session of this.sessions) {
      if (session.legacyRemoteURL) {
        const stored = await session.protectRemoteURL(session.legacyRemoteURL);
        if (!stored && session.persistSessionData) {
          this.removedLegacyRemoteTokens = true;
        }
        session.legacyRemoteURL = undefined;
        changed = true;
      }
    }
    for (const session of this.recentSessions) {
      if (session.legacyRemoteURL) {
        const config = new SessionConfig();
        config.persistSessionData = session.persistSessionData !== false;
        const stored = await config.protectRemoteURL(session.legacyRemoteURL);
        if (!stored && config.persistSessionData) {
          this.removedLegacyRemoteTokens = true;
        }
        session.encryptedRemoteURL = config.encryptedRemoteURL;
        session.legacyRemoteURL = undefined;
        changed = true;
      }
    }
    return changed;
  }

  get recentSessionsChanged(): ISignal<this, void> {
    return this._recentSessionsChanged;
  }

  static getAppDataPath(): string {
    const userDataDir = getUserDataDir();
    return path.join(userDataDir, 'app-data.json');
  }

  /**
   * The canonical form of a URL read from the file, noting when the two
   * differ so the ready handler knows to write the file back.
   */
  private _canonicalURL(stored: string): string {
    const canonical = SessionConfig.remoteURLForStorage(stored);
    if (canonical !== stored) {
      this.storedURLsRewritten = true;
    }
    return canonical;
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
  /**
   * Set when the migration had to drop a token a session wanted kept, because
   * no credential store was available to encrypt it. In memory only: the
   * welcome view reads it once to tell the user why those servers now ask for
   * a sign-in.
   */
  removedLegacyRemoteTokens: boolean = false;
  /**
   * Set by read() when a stored URL was not in its canonical form. The ready
   * handler then saves once, so what read() stripped leaves the file on the
   * first launch. Without it a token that only the dialog list held, because
   * its recents row was evicted or deleted, would stay in the file until the
   * next save that happens to run.
   */
  storedURLsRewritten: boolean = false;

  private _recentSessionsChanged = new Signal<this, void>(this);
}

export const appData = ApplicationData.getSingleton();
