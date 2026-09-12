const fs = require('fs');

// The one fs-extra helper all three build scripts carried a copy of, at fourteen call sites. The others it started with went back where they came from: removeSync and ensureDirSync are used twice each in extract.js alone and readJSONSync once in buildutil.js, so hoisting them removed no duplication and turned a local into a cross-file dependency.
const copySync = (src, dest) => fs.cpSync(src, dest, { recursive: true });

module.exports = { copySync };
