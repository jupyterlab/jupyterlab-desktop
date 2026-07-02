/* Based on https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/ */

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (
    electronPlatformName !== 'darwin' ||
    process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false'
  ) {
    return;
  }

  // @electron/notarize v3 is ESM; import it dynamically from this CJS hook.
  // notarytool is the only tool now, so the v2 `tool` and `appBundleId` keys
  // are gone.
  const { notarize } = await import('@electron/notarize');

  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLEID,
    appleIdPassword: process.env.APPLEIDPASS,
    teamId: process.env.APPLE_TEAM_ID
  });
};
