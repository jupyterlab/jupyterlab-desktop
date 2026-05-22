import { describe, expect, it } from 'vitest';
import { EventTypeMain, EventTypeRenderer } from '../../src/main/eventtypes';

// Spot-check critical IPC event strings — a typo here silently breaks the IPC channel

describe('EventTypeMain — window controls', () => {
  it('MinimizeWindow', () =>
    expect(EventTypeMain.MinimizeWindow).toBe('minimize-window'));
  it('MaximizeWindow', () =>
    expect(EventTypeMain.MaximizeWindow).toBe('maximize-window'));
  it('RestoreWindow', () =>
    expect(EventTypeMain.RestoreWindow).toBe('restore-window'));
  it('CloseWindow', () =>
    expect(EventTypeMain.CloseWindow).toBe('close-window'));
});

describe('EventTypeMain — session management', () => {
  it('CreateNewSession', () =>
    expect(EventTypeMain.CreateNewSession).toBe('create-new-session'));
  it('CreateNewRemoteSession', () =>
    expect(EventTypeMain.CreateNewRemoteSession).toBe(
      'create-new-remote-session'
    ));
  it('OpenRecentSession', () =>
    expect(EventTypeMain.OpenRecentSession).toBe('open-recent-session'));
  it('DeleteRecentSession', () =>
    expect(EventTypeMain.DeleteRecentSession).toBe('delete-recent-session'));
  it('OpenDroppedFiles', () =>
    expect(EventTypeMain.OpenDroppedFiles).toBe('open-dropped-files'));
  it('RestartSession', () =>
    expect(EventTypeMain.RestartSession).toBe('restart-session'));
  it('LabUIReady', () => expect(EventTypeMain.LabUIReady).toBe('lab-ui-ready'));
});

describe('EventTypeMain — python environment', () => {
  it('ValidatePythonPath', () =>
    expect(EventTypeMain.ValidatePythonPath).toBe('validate-python-path'));
  it('SetDefaultPythonPath', () =>
    expect(EventTypeMain.SetDefaultPythonPath).toBe('set-default-python-path'));
  it('InstallBundledPythonEnv', () =>
    expect(EventTypeMain.InstallBundledPythonEnv).toBe(
      'install-bundled-python-env'
    ));
  it('UpdateBundledPythonEnv', () =>
    expect(EventTypeMain.UpdateBundledPythonEnv).toBe(
      'update-bundled-python-env'
    ));
  it('GetPythonEnvironmentList', () =>
    expect(EventTypeMain.GetPythonEnvironmentList).toBe(
      'get-python-environment-list'
    ));
  it('DeletePythonEnvironment', () =>
    expect(EventTypeMain.DeletePythonEnvironment).toBe(
      'delete-python-environment'
    ));
  it('CreateNewPythonEnvironment', () =>
    expect(EventTypeMain.CreateNewPythonEnvironment).toBe(
      'create-new-python-environment'
    ));
  it('ValidateNewPythonEnvironmentName', () =>
    expect(EventTypeMain.ValidateNewPythonEnvironmentName).toBe(
      'validate-new-env-name'
    ));
  it('ValidateCondaChannels', () =>
    expect(EventTypeMain.ValidateCondaChannels).toBe(
      'validate-conda-channels'
    ));
});

describe('EventTypeMain — settings', () => {
  it('SetTheme', () => expect(EventTypeMain.SetTheme).toBe('set-theme'));
  it('SetLogLevel', () =>
    expect(EventTypeMain.SetLogLevel).toBe('set-log-level'));
  it('SetStartupMode', () =>
    expect(EventTypeMain.SetStartupMode).toBe('set-startup-mode'));
  it('SetCtrlWBehavior', () =>
    expect(EventTypeMain.SetCtrlWBehavior).toBe('set-ctrl-w-behavior'));
  it('SetSettings', () =>
    expect(EventTypeMain.SetSettings).toBe('set-settings'));
  it('ClearHistory', () =>
    expect(EventTypeMain.ClearHistory).toBe('clear-history'));
  it('CheckForUpdates', () =>
    expect(EventTypeMain.CheckForUpdates).toBe('check-for-updates'));
});

describe('EventTypeMain — all values are non-empty strings', () => {
  it('every event has a non-empty string value', () => {
    for (const [key, val] of Object.entries(EventTypeMain)) {
      expect(typeof val, `EventTypeMain.${key}`).toBe('string');
      expect(
        (val as string).length,
        `EventTypeMain.${key} is empty`
      ).toBeGreaterThan(0);
    }
  });

  it('no duplicate event values', () => {
    const values = Object.values(EventTypeMain);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

describe('EventTypeRenderer', () => {
  it('WorkingDirectorySelected', () =>
    expect(EventTypeRenderer.WorkingDirectorySelected).toBe(
      'working-directory-selected'
    ));
  it('InstallPythonEnvStatus', () =>
    expect(EventTypeRenderer.InstallPythonEnvStatus).toBe(
      'install-python-env-status'
    ));
  it('ShowProgress', () =>
    expect(EventTypeRenderer.ShowProgress).toBe('show-progress'));
  it('SetCurrentPythonPath', () =>
    expect(EventTypeRenderer.SetCurrentPythonPath).toBe(
      'set-current-python-path'
    ));
  it('SetRunningServerList', () =>
    expect(EventTypeRenderer.SetRunningServerList).toBe(
      'set-running-server-list'
    ));
  it('SetTitle', () => expect(EventTypeRenderer.SetTitle).toBe('set-title'));
  it('SetRecentSessionList', () =>
    expect(EventTypeRenderer.SetRecentSessionList).toBe(
      'set-recent-session-list'
    ));
  it('SetPythonEnvironmentList', () =>
    expect(EventTypeRenderer.SetPythonEnvironmentList).toBe(
      'set-python-environment-list'
    ));

  it('all values are non-empty strings', () => {
    for (const [key, val] of Object.entries(EventTypeRenderer)) {
      expect(typeof val, `EventTypeRenderer.${key}`).toBe('string');
      expect(
        (val as string).length,
        `EventTypeRenderer.${key} is empty`
      ).toBeGreaterThan(0);
    }
  });

  it('no duplicate event values', () => {
    const values = Object.values(EventTypeRenderer);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
