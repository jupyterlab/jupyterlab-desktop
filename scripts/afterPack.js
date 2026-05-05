const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir } = context;
  const appName = context.packager.appInfo.productFilename;

  let electronPath;
  if (electronPlatformName === 'darwin') {
    electronPath = path.join(
      appOutDir,
      `${appName}.app`,
      'Contents',
      'MacOS',
      appName
    );
  } else if (electronPlatformName === 'win32') {
    electronPath = path.join(appOutDir, `${appName}.exe`);
  } else {
    // On Linux, the executable name is derived from package.json "name" (e.g.
    // "jupyterlab-desktop"), not productName ("JupyterLab").
    const executableName =
      context.packager.executableName ||
      context.packager.appInfo.name ||
      appName;
    electronPath = path.join(appOutDir, executableName);
  }

  if (!fs.existsSync(electronPath)) {
    throw new Error(
      `afterPack: Electron binary not found at expected path: ${electronPath}`
    );
  }

  await flipFuses(electronPath, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: electronPlatformName === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableCookieEncryption]: true
  });
};
