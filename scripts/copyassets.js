const path = require('path');
const fs = require('fs');

// fs-extra's copySync replaced with the native recursive cp (Node 16.7+).
const copySync = (src, dest) => fs.cpSync(src, dest, { recursive: true });

const platform = process.platform;
const buildDir = path.resolve('./build');
const srcDir = path.resolve('./src');

function walkSync(currentDirPath, callback) {
  fs.readdirSync(currentDirPath).forEach(name => {
    const filePath = path.join(currentDirPath, name);
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      callback(filePath, stat);
    } else if (stat.isDirectory()) {
      walkSync(filePath, callback);
    }
  });
}

/**
 * Copy assets into build dir so they can be resolved.
 */
function copyAssests() {
  process.stdout.write('Copying assets into build directory...');
  if (!fs.existsSync(srcDir)) {
    console.error('jupyterlab-desktop build: could not find source directory.');
    process.exit();
  }

  const dest = path.resolve(path.join(buildDir, 'out'));
  if (!fs.existsSync(dest)) {
    console.error('jupyterlab-desktop build: could not find target directory.');
    process.exit();
  }

  // Copy style and img directories into build directory
  walkSync(srcDir, srcPath => {
    const destPath = srcPath.replace(srcDir, dest);

    if (srcPath.includes('style') || srcPath.includes('img')) {
      copySync(srcPath, destPath);
    }
  });

  const titlebarPath = path.join('main', 'titlebarview', 'titlebar.html');
  copySync(
    path.join(srcDir, titlebarPath),
    path.join(dest, '../app-assets', 'titlebarview', 'titlebar.html')
  );

  copySync(path.join(srcDir, 'assets'), path.join(dest, '../app-assets'));

  const toolkitPath = path.join(
    '../node_modules',
    '@jupyter-notebook/web-components',
    'dist'
  );
  copySync(
    path.join(srcDir, toolkitPath, 'toolkit.min.js'),
    path.join(dest, '../jupyter-ui-toolkit/toolkit.min.js')
  );
  copySync(
    path.join(srcDir, toolkitPath, 'toolkit.js'),
    path.join(dest, '../jupyter-ui-toolkit/toolkit.js')
  );

  const envInfoPath = path.join('main', 'env_info.py');
  copySync(path.join(srcDir, envInfoPath), path.join(dest, envInfoPath));

  // Copy install scripts
  if (platform === 'darwin') {
    copySync(
      path.join(
        path.resolve('./'),
        'dist-resources',
        'darwin',
        'entitlements.plist'
      ),
      path.join(buildDir, 'entitlements.plist')
    );
  } else if (platform === 'win32') {
    copySync(
      path.join(
        path.resolve('./'),
        'electron-builder-scripts',
        'wininstall.nsh'
      ),
      path.join(buildDir, 'wininstall.nsh')
    );
  } else {
    copySync(
      path.join(
        path.resolve('./'),
        'electron-builder-scripts',
        'linux_after_install.sh'
      ),
      path.join(buildDir, 'linux_after_install.sh')
    );
    copySync(
      path.join(path.resolve('./'), 'electron-builder-scripts', 'snap-hooks'),
      path.join(buildDir, 'snap-hooks')
    );
  }

  console.log('done');
}
copyAssests();

if (process.argv.length > 2 && process.argv[2] == 'watch') {
  // native fs.watch replaces node-watch; recursive watch works on macOS,
  // Windows, and Linux (Node 20+ walks the tree itself). srcDir is small so
  // the per-directory inotify watches on Linux are not a concern.
  let watchTimer;
  fs.watch(srcDir, { recursive: true }, function (evt, name) {
    if (name && /(\.css$)|(\.html$)/.test(name)) {
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => {
        console.log('Asset change detected.');
        copyAssests();
      }, 100);
    }
  });
}
