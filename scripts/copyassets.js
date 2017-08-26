var path = require('path');
var fs = require('fs-extra');
var buildDir = path.resolve('./build');
var srcDir = path.resolve('./src');
var file = require('file');
var watch = require('node-watch');

/**
 * Copy assets into build dir so they can be resolved.
 */
function copyAssests() {
    process.stdout.write('Copying assets into build directory...');
    if (!fs.existsSync(srcDir)) {
        console.error('jupyterlab_app build: could not find source directory.');
        process.exit();
    }

    var dest = path.resolve(path.join(buildDir, 'out'));
    if (!fs.existsSync(dest)) {
        console.error('jupyterlab_app build: could not find target directory.');
        process.exit();
    }
    
    // Copy style and img directories into build directory
    file.walkSync(srcDir, (srcPath) => {
        var destPath = srcPath.replace(srcDir, dest);
        
        if (srcPath.slice(srcPath.length - 'style'.length) == 'style' ||
            srcPath.slice(srcPath.length - 'img'.length) == 'img') {
            fs.copySync(srcPath, destPath);
        }
    });

    // Copy html into build directory
    let htmlPath = path.join('browser', 'index.html');
    fs.copySync(path.join(srcDir, htmlPath), path.join(dest, htmlPath));
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