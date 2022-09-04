/**
 * Denotes any error, including electron and node errors.
 */
export class JupyterLabDesktopError extends Error {
  /**
   * Only available since Node.js 16.9.
   */
  readonly causeShim: any;

  constructor(message: string, options?: { cause?: any }) {
    super(message);
    this.causeShim = options?.cause;
  }
}

/**
 * Denotes errors which came from jupyter-server.
 */
export class JupyterServerError extends JupyterLabDesktopError {
  // no-op
}

/**
 * Denotes errors which came from jupyterlab.
 */
export class JupyterLabError extends JupyterLabDesktopError {
  // no-op
}
