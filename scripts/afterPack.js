const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const path = require('path');

exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir } = context;
  const appName = context.packager.appInfo.productFilename;

  let electronPath;
  if (electronPlatformName === 'darwin') {
    electronPath = path.join(appOutDir, `${appName}.app`, 'Contents', 'MacOS', appName);
  } else if (electronPlatformName === 'win32') {
    electronPath = path.join(appOutDir, `${appName}.exe`);
  } else {
    electronPath = path.join(appOutDir, appName);
  }

  await flipFuses(electronPath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
  });
};
