var rpt = require('read-package-tree');
var data = require('../package.json');
var path = require('path');
var fs = require('fs-extra');

var seen = {};

var schemaDest = path.resolve('./build/schemas');
fs.removeSync(schemaDest);
fs.ensureDirSync(schemaDest);

var themesDest = path.resolve('./build/themes');
fs.removeSync(themesDest);
fs.ensureDirSync(themesDest);


function extractNode(data) {
  data.children.forEach(function(child) {
    extractNode(child);
  });

  if (seen[data.package.name]) {
    return;
  }
  seen[data.package.name] = true;
  var jlab = data.package.jupyterlab
  if (!jlab) {
    return;
  }

  // Handle schemas.
  var schemas = jlab['schemas'];
  if (schemas) {
    schemas.forEach(schema => {
      schema = path.join(data.realpath, schema);
      var file = path.basename(schema);
      var to = path.join(schemaDest, file);
      fs.copySync(schema, to);
    });
  }

  // Handle themes.
  var themeDir = jlab['themeDir'];
  if (themeDir) {
    var name = data.package.name.replace('@', '');
    name = name.replace('/', '-');
    var from = path.join(data.realpath, themeDir);
    var to = path.join(themesDest, name);
    fs.copySync(from, to);
  }
}


rpt('.', function (er, data) {
  extractNode(data);
})
