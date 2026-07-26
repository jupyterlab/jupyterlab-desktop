// Native replacement for the rimraf CLI used by the npm scripts. Removes each
// argument recursively and without erroring on missing paths. Arguments
// containing a glob are expanded with the native fs.globSync (Node 22+).
const fs = require('fs');

function rm(args) {
  for (const arg of args) {
    const targets = /[*?[]/.test(arg) ? fs.globSync(arg) : [arg];
    for (const target of targets) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
}

if (require.main === module) {
  rm(process.argv.slice(2));
}

module.exports = { rm };
