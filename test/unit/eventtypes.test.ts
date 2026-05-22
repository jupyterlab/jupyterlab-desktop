import { describe, expect, it } from 'vitest';
import { EventTypeMain, EventTypeRenderer } from '../../src/main/eventtypes';

// IPC channel strings; a typo silently breaks the channel, so they are pinned.

describe('EventTypeMain channel strings', () => {
  it.each([
    [EventTypeMain.MinimizeWindow, 'minimize-window'],
    [EventTypeMain.MaximizeWindow, 'maximize-window'],
    [EventTypeMain.RestoreWindow, 'restore-window'],
    [EventTypeMain.CloseWindow, 'close-window'],
    [EventTypeMain.CreateNewSession, 'create-new-session'],
    [EventTypeMain.CreateNewRemoteSession, 'create-new-remote-session'],
    [EventTypeMain.OpenRecentSession, 'open-recent-session'],
    [EventTypeMain.DeleteRecentSession, 'delete-recent-session'],
    [EventTypeMain.OpenDroppedFiles, 'open-dropped-files'],
    [EventTypeMain.RestartSession, 'restart-session'],
    [EventTypeMain.LabUIReady, 'lab-ui-ready'],
    [EventTypeMain.ValidatePythonPath, 'validate-python-path'],
    [EventTypeMain.SetDefaultPythonPath, 'set-default-python-path'],
    [EventTypeMain.InstallBundledPythonEnv, 'install-bundled-python-env'],
    [EventTypeMain.UpdateBundledPythonEnv, 'update-bundled-python-env'],
    [EventTypeMain.GetPythonEnvironmentList, 'get-python-environment-list'],
    [EventTypeMain.DeletePythonEnvironment, 'delete-python-environment'],
    [EventTypeMain.CreateNewPythonEnvironment, 'create-new-python-environment'],
    [EventTypeMain.ValidateNewPythonEnvironmentName, 'validate-new-env-name'],
    [EventTypeMain.ValidateCondaChannels, 'validate-conda-channels'],
    [EventTypeMain.SetTheme, 'set-theme'],
    [EventTypeMain.SetLogLevel, 'set-log-level'],
    [EventTypeMain.SetStartupMode, 'set-startup-mode'],
    [EventTypeMain.SetCtrlWBehavior, 'set-ctrl-w-behavior'],
    [EventTypeMain.SetSettings, 'set-settings'],
    [EventTypeMain.ClearHistory, 'clear-history'],
    [EventTypeMain.CheckForUpdates, 'check-for-updates']
  ])('"%s" stays stable', (value, expected) => {
    expect(value).toBe(expected);
  });
});

describe('EventTypeRenderer channel strings', () => {
  it.each([
    [EventTypeRenderer.WorkingDirectorySelected, 'working-directory-selected'],
    [EventTypeRenderer.InstallPythonEnvStatus, 'install-python-env-status'],
    [EventTypeRenderer.ShowProgress, 'show-progress'],
    [EventTypeRenderer.SetCurrentPythonPath, 'set-current-python-path'],
    [EventTypeRenderer.SetRunningServerList, 'set-running-server-list'],
    [EventTypeRenderer.SetTitle, 'set-title'],
    [EventTypeRenderer.SetRecentSessionList, 'set-recent-session-list'],
    [EventTypeRenderer.SetPythonEnvironmentList, 'set-python-environment-list']
  ])('"%s" stays stable', (value, expected) => {
    expect(value).toBe(expected);
  });
});

describe.each([
  ['EventTypeMain', EventTypeMain],
  ['EventTypeRenderer', EventTypeRenderer]
])('%s structural invariants', (name, registry) => {
  it('every value is a non-empty string', () => {
    for (const [key, val] of Object.entries(registry)) {
      expect(typeof val, `${name}.${key}`).toBe('string');
      expect((val as string).length, `${name}.${key} is empty`).toBeGreaterThan(
        0
      );
    }
  });

  it('has no duplicate channel values', () => {
    const values = Object.values(registry);
    expect(new Set(values).size).toBe(values.length);
  });
});
