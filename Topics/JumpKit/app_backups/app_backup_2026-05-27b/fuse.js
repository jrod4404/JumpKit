// Electron Fuses — applied at build time via afterPack hook
// Hardens the production binary against common attack vectors.
// See: https://www.electronjs.org/docs/latest/tutorial/fuses

const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const path = require('path');

module.exports = async ({ appOutDir, packager }) => {
  const platform = packager.platform.nodeName; // 'darwin' | 'win32' | 'linux'

  // Locate the app executable inside the output directory
  const exeName = {
    darwin: `${packager.appInfo.productName}.app`,
    win32:  `${packager.appInfo.productName}.exe`,
    linux:  packager.appInfo.productName,
  }[platform];

  if (!exeName) return;

  const appPath = path.join(appOutDir, exeName);

  await flipFuses(appPath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]:                      false, // disable NODE_OPTIONS env var abuse
    [FuseV1Options.EnableCookieEncryption]:          true,  // encrypt session cookies at rest
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // block --node-options attacks
    [FuseV1Options.EnableNodeCliInspectArguments]:   false, // disable --inspect / --inspect-brk
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true, // verify asar integrity at launch
    [FuseV1Options.OnlyLoadAppFromAsar]:             true,  // block loading app outside asar
  });

  console.log(`[fuse] Electron fuses applied for ${platform}`);
};
