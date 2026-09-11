// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';
import * as fs from 'fs';
import { safeStorage } from 'electron';
import {
  DEFAULT_WIN_HEIGHT,
  DEFAULT_WIN_WIDTH,
  resolveWorkingDirectory,
  SettingType,
  userSettings
} from './settings';
import { ICLIArguments } from '../tokens';
import { appData } from './appdata';

export class SessionConfig {
  x: number = 0;
  y: number = 0;
  width: number = DEFAULT_WIN_WIDTH;
  height: number = DEFAULT_WIN_HEIGHT;
  remoteURL: string = '';
  persistSessionData: boolean = true;
  partition: string = '';
  workingDirectory: string = '';
  filesToOpen: string[] = [];
  pythonPath: string = '';
  defaultKernel: string = '';
  lastOpened: Date = new Date();

  url: URL;
  token: string;
  pageConfig: any;
  cookies?: Electron.Cookie[];
  encryptedRemoteURL?: string;
  legacyRemoteURL?: string;

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
    persistSessionData: boolean,
    partition: string
  ): SessionConfig {
    const sessionConfig = new SessionConfig();
    const url = new URL(remoteURL);
    sessionConfig.remoteURL = SessionConfig.remoteURLForStorage(remoteURL);
    const token = url.searchParams.get('token');
    sessionConfig.url = url;
    sessionConfig.token = token;

    sessionConfig.persistSessionData = persistSessionData !== false;
    if (partition) {
      sessionConfig.partition = partition;
    } else {
      if (sessionConfig.persistSessionData) {
        sessionConfig.partition = `persist:${Date.now()}`;
      } else {
        sessionConfig.partition = `partition:${Date.now()}`;
      }
    }

    return sessionConfig;
  }

  static createFromArgs(cliArgs: ICLIArguments) {
    let workingDir = cliArgs.workingDir;
    let fileOrFolders: string[] = [];
    let pythonPath = '';

    try {
      for (const arg of cliArgs._) {
        const strArg = arg.toString();
        if (/^https?:\/\//.test(strArg)) {
          const remoteURL = strArg;
          const storedRemoteURL = SessionConfig.remoteURLForStorage(remoteURL);
          const persistSessionData = cliArgs.persistSessionData === true;
          let partition: string = undefined;
          let encryptedRemoteURL: string = undefined;

          if (persistSessionData) {
            const existing = appData.recentSessions.find(recentSession => {
              return recentSession.remoteURL === storedRemoteURL;
            });
            if (
              existing &&
              existing.persistSessionData &&
              existing?.partition?.startsWith('persist:')
            ) {
              partition = existing.partition;
              encryptedRemoteURL = existing.encryptedRemoteURL;
            }
          }

          const sessionConfig = SessionConfig.createRemote(
            remoteURL,
            persistSessionData,
            partition
          );
          if (encryptedRemoteURL) {
            sessionConfig.encryptedRemoteURL = encryptedRemoteURL;
          }
          return sessionConfig;
        }
      }

      let skipFilePaths = false;
      if (workingDir) {
        workingDir = path.resolve(workingDir as string);
        if (!fs.existsSync(workingDir as string)) {
          workingDir = null;
          skipFilePaths = true;
        }
      }

      if (!skipFilePaths) {
        for (let filePath of cliArgs._) {
          if (workingDir) {
            filePath = path.resolve(workingDir as string, filePath.toString());
            if (fs.existsSync(filePath)) {
              const relPath = path.relative(workingDir as string, filePath);
              fileOrFolders.push(relPath);
            }
          } else {
            filePath = path.resolve(cliArgs.cwd, filePath.toString());
            fileOrFolders.push(filePath);
          }
        }
      }

      if (cliArgs.pythonPath) {
        pythonPath = path.resolve(cliArgs.cwd, cliArgs.pythonPath as string);
        if (!fs.existsSync(pythonPath)) {
          pythonPath = '';
        }
      }
    } catch (error) {
      return;
    }

    if (!(workingDir || fileOrFolders.length > 0 || pythonPath)) {
      return;
    }

    if (workingDir) {
      const sessionConfig = SessionConfig.createLocal(
        workingDir as string,
        fileOrFolders
      );
      if (pythonPath) {
        sessionConfig.pythonPath = pythonPath;
      }

      return sessionConfig;
    } else {
      const sessionConfig =
        fileOrFolders.length > 0
          ? SessionConfig.createLocalForFilesOrFolders(fileOrFolders)
          : SessionConfig.createLocal();
      if (pythonPath) {
        sessionConfig.pythonPath = pythonPath;
      }

      return sessionConfig;
    }
  }

  get isRemote(): boolean {
    return this.remoteURL !== '';
  }

  static remoteURLForStorage(remoteURL: string): string {
    try {
      const url = new URL(remoteURL);
      if (
        url.username === '' &&
        url.password === '' &&
        url.search === '' &&
        url.hash === ''
      ) {
        return remoteURL;
      }
      url.username = '';
      url.password = '';
      url.search = '';
      url.hash = '';
      return url.href;
    } catch {
      return remoteURL.split(/[?#]/)[0];
    }
  }

  /**
   * The credential stored for a server, for a URL that carries none of its own.
   * Both the recents list and the remote server dialog hand back the canonical
   * URL, so without this lookup a reconnect from either would connect with no
   * token and then overwrite the stored credential with a token-free one. A URL
   * that does carry credentials wins over the stored one, so this returns
   * nothing for it.
   */
  static storedRemoteCredential(remoteURL: string): string | undefined {
    if (SessionConfig.remoteURLForStorage(remoteURL) !== remoteURL) {
      return undefined;
    }
    return appData.recentSessions.find(
      recentSession => recentSession.remoteURL === remoteURL
    )?.encryptedRemoteURL;
  }

  static async canPersistRemoteURL(): Promise<boolean> {
    try {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) {
        return false;
      }
      return (
        process.platform !== 'linux' ||
        safeStorage.getSelectedStorageBackend() !== 'basic_text'
      );
    } catch (error) {
      console.warn('Remote credential storage is unavailable', error);
      return false;
    }
  }

  async protectRemoteURL(remoteURL: string): Promise<boolean> {
    if (
      !this.persistSessionData ||
      !(await SessionConfig.canPersistRemoteURL())
    ) {
      return false;
    }
    try {
      this.encryptedRemoteURL = (
        await safeStorage.encryptStringAsync(remoteURL)
      ).toString('base64');
      return true;
    } catch (error) {
      console.warn('Failed to encrypt remote connection URL', error);
      return false;
    }
  }

  async remoteURLForConnection(): Promise<string> {
    if (!this.encryptedRemoteURL) {
      return this.remoteURL;
    }
    try {
      const decrypted = await safeStorage.decryptStringAsync(
        Buffer.from(this.encryptedRemoteURL, 'base64')
      );
      if (decrypted.shouldReEncrypt) {
        this.encryptedRemoteURL = (
          await safeStorage.encryptStringAsync(decrypted.result)
        ).toString('base64');
      }
      return decrypted.result;
    } catch (error) {
      console.warn('Failed to decrypt remote connection URL', error);
      return this.remoteURL;
    }
  }

  get resolvedWorkingDirectory(): string {
    return resolveWorkingDirectory(this.workingDirectory);
  }

  setFilesToOpen(filePaths: string[]) {
    this.filesToOpen = [];

    const workingDir = this.resolvedWorkingDirectory;

    for (const filePath of filePaths) {
      const fullPath = path.join(workingDir, filePath);
      try {
        const stats = fs.lstatSync(fullPath);
        if (stats.isFile()) {
          this.filesToOpen.push(filePath);
        }
      } catch (error) {
        console.log('Failed to get file info', error);
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
      this.remoteURL = SessionConfig.remoteURLForStorage(jsonData.remoteURL);
      if (this.remoteURL !== jsonData.remoteURL) {
        this.legacyRemoteURL = jsonData.remoteURL;
      }
    }
    if (typeof jsonData.encryptedRemoteURL === 'string') {
      this.encryptedRemoteURL = jsonData.encryptedRemoteURL;
    }
    if ('persistSessionData' in jsonData) {
      this.persistSessionData = jsonData.persistSessionData;
    }
    if (this.persistSessionData && 'partition' in jsonData) {
      this.partition = jsonData.partition;
    }
    if ('workingDirectory' in jsonData) {
      this.workingDirectory = jsonData.workingDirectory;
    }
    if ('filesToOpen' in jsonData) {
      this.filesToOpen = [...jsonData.filesToOpen];
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
      jsonData.remoteURL = SessionConfig.remoteURLForStorage(this.remoteURL);
    }

    if (this.persistSessionData && this.encryptedRemoteURL) {
      jsonData.encryptedRemoteURL = this.encryptedRemoteURL;
    }

    if (this.persistSessionData === false) {
      jsonData.persistSessionData = this.persistSessionData;
    }

    if (this.persistSessionData) {
      jsonData.partition = this.partition;
    }

    if (this.workingDirectory !== '') {
      jsonData.workingDirectory = this.workingDirectory;
    }

    if (this.filesToOpen.length > 0) {
      jsonData.filesToOpen = [...this.filesToOpen];
    }

    return jsonData;
  }
}
