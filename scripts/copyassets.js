const path = require('path');
const fs = require('fs-extra');
const watch = require('node-watch');

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
      fs.copySync(srcPath, destPath);
    }
  });

  const titlebarPath = path.join('main', 'titlebarview', 'titlebar.html');
  fs.copySync(
    path.join(srcDir, titlebarPath),
    path.join(dest, '../app-assets', 'titlebarview', 'titlebar.html')
  );

  fs.copySync(path.join(srcDir, 'assets'), path.join(dest, '../app-assets'), {
    recursive: true
  });

  const toolkitPath = path.join(
    '../node_modules',
    '@jupyter-notebook/web-components',
    'dist'
  );
  fs.copySync(
    path.join(srcDir, toolkitPath, 'toolkit.min.js'),
    path.join(dest, '../jupyter-ui-toolkit/toolkit.min.js')
  );
  fs.copySync(
    path.join(srcDir, toolkitPath, 'toolkit.js'),
    path.join(dest, '../jupyter-ui-toolkit/toolkit.js')
  );

  const envInfoPath = path.join('main', 'env_info.py');
  fs.copySync(path.join(srcDir, envInfoPath), path.join(dest, envInfoPath));

  // Copy install scripts
  if (platform === 'darwin') {
    fs.copySync(
      path.join(
        path.resolve('./'),
        'dist-resources',
        'darwin',
        'entitlements.plist'
      ),
      path.join(buildDir, 'entitlements.plist')
    );
  } else if (platform === 'win32') {
    fs.copySync(
      path.join(
        path.resolve('./'),
        'electron-builder-scripts',
        'wininstall.nsh'
      ),
      path.join(buildDir, 'wininstall.nsh')
    );
  } else {
    fs.copySync(
      path.join(
        path.resolve('./'),
        'electron-builder-scripts',
        'linux_after_install.sh'
      ),
      path.join(buildDir, 'linux_after_install.sh')
    );
  }

  console.log('done');
}
copyAssests();

if (process.argv.length > 2 && process.argv[2] == 'watch') {
  watch(srcDir, { recursive: true }, function (evt, name) {
    if (/(\.css$)|(\.html$)/.test(name)) {
      console.log('Asset chage detected.');
      copyAssests();
    }
  });
}
