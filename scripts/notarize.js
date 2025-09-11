/* Based on https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/ */

const { notarize } = require('electron-notarize');

exports.default = async function notarizing(context) {
  // Skip notarization for now since it is taking too long
  console.log('Skipping notarization...');
  return;

  const { electronPlatformName, appOutDir } = context;
  if (
    electronPlatformName !== 'darwin' ||
    process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false'
  ) {
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    appBundleId: 'org.jupyter.jupyterlab-desktop',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLEID,
    appleIdPassword: process.env.APPLEIDPASS,
    tool: 'notarytool',
    teamId: process.env.APPLE_TEAM_ID
  });
};
