/*

 ----------------------------------------------------------------------------
 | node-runner: Dockerised Node.js Script Runner                            |
 |                                                                          |
 | Copyright (c) 2019 M/Gateway Developments Ltd,                           |
 | Redhill, Surrey UK.                                                      |
 | All rights reserved.                                                     |
 |                                                                          |
 | http://www.mgateway.com                                                  |
 | Email: rtweed@mgateway.com                                               |
 |                                                                          |
 |                                                                          |
 | Licensed under the Apache License, Version 2.0 (the "License");          |
 | you may not use this file except in compliance with the License.         |
 | You may obtain a copy of the License at                                  |
 |                                                                          |
 |     http://www.apache.org/licenses/LICENSE-2.0                           |
 |                                                                          |
 | Unless required by applicable law or agreed to in writing, software      |
 | distributed under the License is distributed on an "AS IS" BASIS,        |
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. |
 | See the License for the specific language governing permissions and      |
 |  limitations under the License.                                          |
 ----------------------------------------------------------------------------

  6 November 2019

*/

var ask = require('readline-sync');
var fs = require('fs-extra');
var transform = require('qewd-transform-json').transform;
var uuid = require('uuid/v4');
var module_exists = require('module-exists');
var child_process = require('child_process');

var verbose = process.env.VERBOSE || true;
if (process.env.SILENT) verbose = !process.env.SILENT;
if (verbose === 'true') verbose = true;
if (verbose === 'false') verbose = false;

function display(text) {
  if (verbose) {
    console.log(text);
  }
}

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

fs.getDirectories = function(path) {
  return fs.readdirSync(path).filter(function (file) {
    return fs.statSync(path+'/'+file).isDirectory();
  });
}

fs.createJSONFile = function(obj, filePath) {
  fs.outputJsonSync(filePath, obj, {spaces: 2});
}

fs.createFile = function(contentArray, filePath) {
  fs.outputFileSync(filePath, contentArray.join('\n'));
}

function shell(command) {
  child_process.execSync(command, {stdio:[0,1,2]});
}

function installModule(moduleName, modulePath) {

  var module_path = '/node';
  if (typeof modulePath !== 'undefined') {
    if (modulePath[0] !== '/') {
      modulePath = '/' + modulePath;
    }
    module_path = module_path + modulePath;
  }
  var node_modules_path = module_path + '/node_modules';
  if (!fs.existsSync(node_modules_path)) {
    fs.ensureDirSync(node_modules_path);
  }
  if (process.env.NODE_PATH.indexOf(module_path + ':') === -1) {
    process.env.NODE_PATH = module_path + ':' + process.env.NODE_PATH;
    require('module').Module._initPaths();
    display('** NODE_PATH updated to: ' + process.env.NODE_PATH);
  }

  var pieces = moduleName.split('@');
  var rootName;
  if (moduleName.startsWith('@')) {
    rootName = '@' + pieces[1];
  }
  else {
    rootName = pieces[0];
  }
  if (!module_exists(rootName) && !fs.existsSync(node_modules_path + '/' + rootName)) {
    var prefix = ' --prefix ' + module_path;
    display('Installing ' + moduleName + ' at ' + prefix);
    child_process.execSync('npm install --unsafe-perm ' + moduleName + prefix, {stdio:[0,1,2]});
    display('\n' + moduleName + ' installed');
  }
  else {
    display(moduleName + ' already installed');
  }
}


display('*************** Welcome to Node Runner ***************');


if (!fs.existsSync('/node')) {
  display(' ');
  display('**** Unable to find the /node folder');
  display(' ');
  display('When you start the Node Runner Docker Container, you MUST map');
  display('your target folder to the container\'s /node folder');
  display('For example: -v ~/qewd-hit-platform:/node');
  display(' ');
  display('**** Unable to continue, so the Node Runner will abort ****');
  return;
}

var script_name = process.env.node_script || 'node-script';
var script_path = '/node/' + script_name + '.js';

if (!fs.existsSync(script_path)) {
  display(' ');
  display('**** Unable to find your script in: ' + script_path);
  display(' ');
  display('When you start the Node Runner Docker Container, you MUST map');
  display('a folder that contains your script to the container\'s /node folder');
  display(' ');
  display('Remember that if you don\'t specify the script name as an environment');
  display('variable named "node_script" when starting the container, the node-runner container will');
  display('look for a script file named "node-script.js"');
  display(' ');
  display('**** Unable to continue, so the Node Runner will abort ****');
  return;
}

var node_script;

try {
  node_script = require(script_path);
}
catch(err) {
  display('Error! Unable to load ' + script_path);
  display('It probably contains one or more JavaScript syntax errors:');
  display(err);
  display(' ');
  display('**** Unable to continue, so the Node Runner will abort ****');
  return;
}

var nr = {
  ask: ask,
  fs: fs,
  install_module: installModule,
  isNumeric: isNumeric,
  uuid: uuid,
  transform: transform,
  shell: shell,
  display: display
};

// try loading any modules required by the script

var npmModules;
var installModulesPath = '/node/npm_install.json';

if (fs.existsSync(installModulesPath)) {
  try {
    npmModules = require(installModulesPath);
  }
  catch(err) {
    display('Error! Unable to load your installModules array at ' + installModulesPath);
    display('It probably contains one or more JavaScript syntax errors');
    display(err);
    display(' ');
    display('**** Unable to continue, so the Node Runner will abort ****');
    return;
  }
  if (Array.isArray(npmModules)) {
    npmModules.forEach(function(moduleName) {
      display('\nInstalling module: ' + moduleName);
      installModule(moduleName);
    });
  }
}

display('*************** Node Runner will now invoke your script ***************');
display(' ');

node_script.call(nr);

display(' ');
display('*************** Node Runner will now terminate ***************');

return;

