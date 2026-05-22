import { describe, expect, it } from 'vitest';
import {
  EnvironmentTypeName,
  IEnvironmentType,
  PythonEnvResolveErrorType
} from '../../src/main/tokens';

// These enum string values are IPC/persistence wire values; a change here
// silently breaks saved appData and renderer messages, so they are pinned.

describe('IEnvironmentType wire values', () => {
  it.each([
    [IEnvironmentType.Path, 'path'],
    [IEnvironmentType.CondaRoot, 'conda-root'],
    [IEnvironmentType.CondaEnv, 'conda-env'],
    [IEnvironmentType.WindowsReg, 'windows-reg'],
    [IEnvironmentType.VirtualEnv, 'venv']
  ])('%s stays "%s"', (value, expected) => {
    expect(value).toBe(expected);
  });
});

describe('EnvironmentTypeName display names', () => {
  it.each([
    [IEnvironmentType.Path, 'system'],
    [IEnvironmentType.CondaRoot, 'conda'],
    [IEnvironmentType.CondaEnv, 'conda'],
    [IEnvironmentType.WindowsReg, 'win'],
    [IEnvironmentType.VirtualEnv, 'venv']
  ])('maps %s to "%s"', (type, name) => {
    expect(EnvironmentTypeName[type]).toBe(name);
  });

  it('has a string display name for every environment type', () => {
    for (const type of Object.values(IEnvironmentType)) {
      expect(typeof EnvironmentTypeName[type]).toBe('string');
    }
  });
});

describe('PythonEnvResolveErrorType wire values', () => {
  it.each([
    [PythonEnvResolveErrorType.PathNotFound, 'path-not-found'],
    [PythonEnvResolveErrorType.InvalidPythonBinary, 'invalid-python-binary'],
    [PythonEnvResolveErrorType.ResolveError, 'resolve-error'],
    [
      PythonEnvResolveErrorType.RequirementsNotSatisfied,
      'requirements-not-satisfied'
    ]
  ])('%s stays "%s"', (value, expected) => {
    expect(value).toBe(expected);
  });
});
