// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { JupyterLabDesktopError } from '../../errors';

import * as React from 'react';

export namespace ServerError {
  export interface IProps {
    changeEnvironment: () => void;
    error: Error | JupyterLabDesktopError;
  }
}

export function ServerError(props: ServerError.IProps): JSX.Element {
  return (
    <div className="jpe-ServerError-body">
      <div className="jpe-ServerError-content">
        <div className="jpe-ServerError-icon" />
        <h1 className="jpe-ServerError-header">
          Jupyter Server Initialization Failed
        </h1>
        <span className="jpe-ServerError-description">
          <p>
            Jupyter Server, which is a prerequisite for JupyterLab Desktop, did
            not initialize properly.
            <br />
            This might be because of an issue with the selected environment. You
            can change environment to try a different server using buttons
            below.
            <br />
          </p>
          <p>
            If this does not seem right, please report this issue in the
            JupyterLab Desktop repository, providing the error details presented
            below:
          </p>
        </span>
        <pre className="jpe-ServerError-error">
          {props.error.name}: {props.error.message}
          {JSON.stringify(
            props.error instanceof JupyterLabDesktopError
              ? props.error.causeShim
              : 'no more details available'
          )}
          {props.error.stack || 'stacktrace not available'}
        </pre>
        <div className="jpe-ServerError-btn-container">
          <button
            className="jpe-ServerError-btn"
            onClick={props.changeEnvironment}
          >
            CHANGE ENVIRONMENT
          </button>
          <button
            className="jpe-ServerError-btn"
            onClick={() => {
              window.open(
                'https://github.com/jupyterlab/jupyterlab-desktop/issues',
                '_blank',
                'nodeIntegration=no'
              );
            }}
          >
            REPORT ISSUE
          </button>
        </div>
      </div>
    </div>
  );
}
