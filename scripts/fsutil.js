const fs = require('fs');

// Native replacements for the fs-extra helpers these build scripts used.
const copySync = (src, dest) => fs.cpSync(src, dest, { recursive: true });
const removeSync = p => fs.rmSync(p, { recursive: true, force: true });
const ensureDirSync = d => fs.mkdirSync(d, { recursive: true });
const readJSONSync = p => JSON.parse(fs.readFileSync(p, 'utf8'));

module.exports = { copySync, removeSync, ensureDirSync, readJSONSync };
