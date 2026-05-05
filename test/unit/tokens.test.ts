import { describe, it, expect } from 'vitest';
import {
  IEnvironmentType,
  EnvironmentTypeName,
  PythonEnvResolveErrorType
} from '../../src/main/tokens';

describe('IEnvironmentType', () => {
  it('Path is "path"', () => expect(IEnvironmentType.Path).toBe('path'));
  it('CondaRoot is "conda-root"', () => expect(IEnvironmentType.CondaRoot).toBe('conda-root'));
  it('CondaEnv is "conda-env"', () => expect(IEnvironmentType.CondaEnv).toBe('conda-env'));
  it('WindowsReg is "windows-reg"', () => expect(IEnvironmentType.WindowsReg).toBe('windows-reg'));
  it('VirtualEnv is "venv"', () => expect(IEnvironmentType.VirtualEnv).toBe('venv'));
});

describe('EnvironmentTypeName', () => {
  it('Path maps to "system"', () => expect(EnvironmentTypeName[IEnvironmentType.Path]).toBe('system'));
  it('CondaRoot maps to "conda"', () => expect(EnvironmentTypeName[IEnvironmentType.CondaRoot]).toBe('conda'));
  it('CondaEnv maps to "conda"', () => expect(EnvironmentTypeName[IEnvironmentType.CondaEnv]).toBe('conda'));
  it('WindowsReg maps to "win"', () => expect(EnvironmentTypeName[IEnvironmentType.WindowsReg]).toBe('win'));
  it('VirtualEnv maps to "venv"', () => expect(EnvironmentTypeName[IEnvironmentType.VirtualEnv]).toBe('venv'));

  it('all IEnvironmentType values have a display name', () => {
    for (const key of Object.values(IEnvironmentType)) {
      expect(EnvironmentTypeName[key]).toBeDefined();
      expect(typeof EnvironmentTypeName[key]).toBe('string');
    }
  });
});

describe('PythonEnvResolveErrorType', () => {
  it('PathNotFound is "path-not-found"', () => {
    expect(PythonEnvResolveErrorType.PathNotFound).toBe('path-not-found');
  });
  it('InvalidPythonBinary is "invalid-python-binary"', () => {
    expect(PythonEnvResolveErrorType.InvalidPythonBinary).toBe('invalid-python-binary');
  });
  it('ResolveError is "resolve-error"', () => {
    expect(PythonEnvResolveErrorType.ResolveError).toBe('resolve-error');
  });
  it('RequirementsNotSatisfied is "requirements-not-satisfied"', () => {
    expect(PythonEnvResolveErrorType.RequirementsNotSatisfied).toBe('requirements-not-satisfied');
  });
});
