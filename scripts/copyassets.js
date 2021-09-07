const path = require('path');
const fs = require('fs-extra');
const watch = require('node-watch');

const buildDir = path.resolve('./build');
const srcDir = path.resolve('./src');

function walkSync(currentDirPath, callback) {
    fs.readdirSync(currentDirPath).forEach((name) => {
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
        console.error('jupyterlab_app build: could not find source directory.');
        process.exit();
    }

    const dest = path.resolve(path.join(buildDir, 'out'));
    if (!fs.existsSync(dest)) {
        console.error('jupyterlab_app build: could not find target directory.');
        process.exit();
    }
    
    // Copy style and img directories into build directory
    walkSync(srcDir, (srcPath) => {
        const destPath = srcPath.replace(srcDir, dest);

        if (srcPath.includes('style') || srcPath.includes('img')) {
            fs.copySync(srcPath, destPath);
        }
    });

    // Copy html into build directory
    const htmlPath = path.join('browser', 'index.html');
    fs.copySync(path.join(srcDir, htmlPath), path.join(dest, htmlPath));

    // Copy install scripts
    fs.copySync(path.join(path.resolve('./'), 'pkg-scripts', 'postinstall'), path.join(buildDir, 'pkg-scripts', 'postinstall'));

    console.log('done');
}
copyAssests();

if (process.argv.length > 2 && process.argv[2] == 'watch') {
    watch(srcDir, {recursive: true}, function(evt, name) {
        if (/(\.css$)|(\.html$)/.test(name)) {
            console.log('Asset chage detected.');
            copyAssests();
        }
    });
}