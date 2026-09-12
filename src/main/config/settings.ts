// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';
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

export enum UIMode {
  MultiDocument = 'multi-document',
  SingleDocument = 'single-document',
  Zen = 'zen',
  ManagedByWebApp = 'managed-by-web-app' // let JupyterLab web app manage the layout
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
  condaChannels = 'condaChannels',

  uiMode = 'uiMode',
  uiModeForSingleFileOpen = 'uiModeForSingleFileOpen',
  showTOCInZenMode = 'showTOCInZenMode'
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

// Reported once per path per run. Eighteen call sites reach save(), so a condition that persists, an antivirus pass holding the file, a permission that stayed wrong, would otherwise put the same line in the log on every settings change, which is the reason this repository already gives for leaving the directory flush at debug.
const reportedUnreadable = new Map<
  string,
  'unreadable' | 'malformed' | 'shape'
>();

/** Say once per path that the file was there and unusable, and give back the sentinel that tells the caller to leave the file alone rather than merge over it. */
function reportRejected(filePath: string): undefined {
  reportOnce(
    filePath,
    'shape',
    `${filePath} holds no JSON object, so the file is left alone until it is repaired`
  );
  return undefined;
}

/**
 * Say it once per path, and again when the file breaks a different way. Keyed by kind rather than by path alone: a file that fails to parse and then comes back as an array is two different things to repair, and remembering only that "this path was reported" left the second one silent with the first one's wording standing in a support log.
 */
function reportOnce(
  filePath: string,
  kind: 'unreadable' | 'malformed' | 'shape',
  message: string,
  error?: unknown
): void {
  if (reportedUnreadable.get(filePath) === kind) {
    return;
  }
  reportedUnreadable.set(filePath, kind);
  if (error === undefined) {
    log.error(message);
  } else {
    log.error(message, error);
  }
}

/** Only for tests: the set above outlives them otherwise, and the second one to run reads as silent because the first already reported. */
export function resetUnreadableReports(): void {
  reportedUnreadable.clear();
}

/**
 * What the file holds right now, or nothing when it is absent or unusable. save merges over this rather than rebuilding, so a read that fails here costs the keys this build does not know rather than corrupting the ones it does; #1115 replaces this with the shared reader.
 */
function readJsonFileOrEmpty(
  filePath: string
): { [key: string]: any } | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath).toString());
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return reportRejected(filePath);
    }
    // Only here, on a read that actually produced an object. Clearing it before the shape check undid the dedup for a file that parses and is not an object, which then logged on every save while a parse failure logged once. A later break in the same run still has to say so, or a support log collected that evening shows the first one rather than the current state.
    reportedUnreadable.delete(filePath);
    return parsed;
  } catch (error) {
    // Absent is the ordinary case and merging over nothing is right for it. Anything else means the file is there and we could not read it, and merging over {} would delete every key this build does not know, which is the loss this merge exists to prevent. The case that actually reaches the write is the parse failure: `userSettings` is constructed once at import, so a user who follows troubleshoot.md and hand-edits settings.json while the app runs, leaving a trailing comma, gets the SyntaxError caught here and will-quit rewrites the file without their edit. Measured on darwin: a settings.json at mode 0200 gives EACCES on the read and OK on the write, because writeFileSync opens O_WRONLY and never reads, so a read failure does not imply a write failure and the loss lands. The file is left alone instead, which is what #1115's shared reader will do through a different route.
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      // gone rather than broken, so whatever was reported about it no longer describes anything
      reportedUnreadable.delete(filePath);
      return {};
    }
    // A SyntaxError is the case this function's comment names as the one that reaches the write, and it is the one a reader can fix. Saying "could not read" about it sends them to look at permissions instead of at the trailing comma they just typed. Its own kind rather than reusing 'unreadable', or by the dedup's own rule a file that goes EACCES and then malformed would stay silent on the second break.
    if (error instanceof SyntaxError) {
      reportOnce(
        filePath,
        'malformed',
        `${filePath} is not valid JSON, so the file is left alone until it is repaired`,
        error
      );
      return undefined;
    }
    reportOnce(
      filePath,
      'unreadable',
      `Could not read ${filePath}, so the file is left alone until it is repaired`,
      error
    );
    return undefined;
  }
}

type SettingDecision =
  | { kind: 'write'; value: any }
  | { kind: 'delete' }
  | { kind: 'leave' };

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
      condaChannels: new Setting<string[]>(['conda-forge']),

      uiMode: new Setting<UIMode>(UIMode.ManagedByWebApp, {
        wsOverridable: true
      }),
      uiModeForSingleFileOpen: new Setting<UIMode>(UIMode.Zen),
      showTOCInZenMode: new Setting<boolean>(false)
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
    // Unguarded on purpose, and worth saying because the reader above makes it look otherwise: this branch protects the *write*, not the read. `userSettings` is constructed at module import, so a settings.json edited into invalid JSON while the app is closed throws here before app.whenReady and the app does not start at all. Only the mid-run edit reaches readJsonFileOrEmpty's catch and gets the file left alone. Guarding this one is #1115, which replaces both call sites with a shared reader.
    const jsonData = JSON.parse(data.toString());

    for (let key in SettingType) {
      if (key in jsonData) {
        this._settings[key].value = jsonData[key];
      }
    }
  }

  save(): boolean {
    const userSettingsPath = UserSettings.getUserSettingsPath();
    const onDisk = readJsonFileOrEmpty(userSettingsPath);
    // Absent is `{}` and merging over nothing is right for it. Undefined means the file is there and we could not read it, and writing anyway is the loss this merge exists to prevent: measured on darwin, a settings.json at mode 0200 gives EACCES on the read and OK on the write, because writeFileSync opens O_WRONLY and never reads. A read failure does not imply a write failure.
    if (onDisk === undefined) {
      return false;
    }
    const userSettings = this._merged(onDisk, key => {
      const setting = this._settings[key];
      // every key of SettingType is one this build owns, so one matching its default does not belong in the file, whatever the file holds
      return setting.differentThanDefault
        ? { kind: 'write', value: setting.value }
        : { kind: 'delete' };
    });

    fs.writeFileSync(userSettingsPath, JSON.stringify(userSettings, null, 2));
    return true;
  }

  /**
   * The file as it is on disk, with this object's settings written over it. Rebuilding from the settings alone deletes every key the build has no setting for. It does not preserve a value the read declined to take: a key this build owns is written or deleted by the decision below, and `UserSettings.save` deletes any that equals its default, which is what a declining read leaves behind. Keeping those is #1116's question, not this one's.
   */
  protected _merged(
    onDisk: { [key: string]: any },
    decide: (key: string) => SettingDecision
  ): { [key: string]: any } {
    // spread defines rather than assigns, so a __proto__ key out of the file stays an own property instead of reaching Object.prototype
    const merged = { ...onDisk };

    for (let key in SettingType) {
      const decision = decide(key);
      if (decision.kind === 'write') {
        merged[key] = decision.value;
      } else if (decision.kind === 'delete') {
        delete merged[key];
      }
    }

    return merged;
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

  hasValue(setting: SettingType) {
    return setting in this._wsSettings;
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

  save(): boolean {
    const wsSettingsPath = WorkspaceSettings.getWorkspaceSettingsPath(
      this._workingDirectory
    );
    const onDisk = readJsonFileOrEmpty(wsSettingsPath);
    // same as the user file above: there and unreadable means leave it alone
    if (onDisk === undefined) {
      return false;
    }
    const wsSettings = this._merged(onDisk, key => {
      // a key a project cannot override is not this file's to remove, even though it does nothing here
      if (!this._settings[key].wsOverridable) {
        return { kind: 'leave' };
      }
      const setting = this._wsSettings[key];
      if (
        setting &&
        // uiMode is saved even when it matches the global default, because opening a single file sets it to Zen automatically and a project that matched by coincidence would lose the override
        (key === SettingType.uiMode ||
          this._isDifferentThanUserSetting(key as SettingType))
      ) {
        return { kind: 'write', value: setting.value };
      }
      // unsetValue takes it out of _wsSettings, and an override matching the global value is not an override any more
      return { kind: 'delete' };
    });

    // Write when there is something to persist, or when a previous file needs
    // to be cleared. mkdir is unconditional: recursive mode is a no-op when the
    // directory already exists, and checking first only opens a race window.
    if (Object.keys(wsSettings).length > 0 || fs.existsSync(wsSettingsPath)) {
      fs.mkdirSync(path.dirname(wsSettingsPath), { recursive: true });
      fs.writeFileSync(wsSettingsPath, JSON.stringify(wsSettings, null, 2));
    }
    // true also when there was nothing to write and no file to clear, which is not a failure. #1114 carries the case where a caller reads that as a value having been persisted.
    return true;
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
