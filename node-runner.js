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

  11 November 2019

*/

var ask = require('readline-sync');
var fs = require('fs-extra');
var transform = require('qewd-transform-json').transform;
var uuid = require('uuid/v4');
var module_exists = require('module-exists');
var child_process = require('child_process');
var tcp = require('tcp-netx');

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
    console.log('** NODE_PATH updated to: ' + process.env.NODE_PATH);
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
    console.log('Installing ' + moduleName + ' at ' + prefix);
    child_process.execSync('npm install --unsafe-perm ' + moduleName + prefix, {stdio:[0,1,2]});
    console.log('\n' + moduleName + ' installed');
  }
  else {
    console.log(moduleName + ' already installed');
  }
}

var requestSync = {
  parseUrl: function(url) {
    if (!url || url === '') {
      return {error: 'url missing or empty'};
    }
    if (!url.startsWith('http://') && !url.startsWith('http://')) {
      return {error: 'Invalid url'};
    }
    var pieces = url.split('://');
    var protocol = pieces[0] + '://'
    var url = pieces[1];
    var query;
    var queryString;
    if (url.includes('?')) {
      pieces = url.split('?');
      query = pieces[1];
      if (query) {
        queryString = query;
        var nvps = query.split('&');
        query = {};
        nvps.forEach(function(nvp) {
          var pieces = nvp.split('=');
          query[pieces[0]] = pieces[1];
        });
      }
      url = pieces[0]
    }
    var path = '/';
    if (url.includes('/')) {
      pieces = url.split('/');
      url = pieces[0];
      pieces.shift(); // remove 1st piece
      path = '/' + pieces.join('/');
    }
    var hostString = url;
    var port;
    var host = url;
    if (url.includes(':')) {
      pieces = url.split(':');
      port = pieces[1];
      host = pieces[0];
    }
    return {
      protocol: protocol,
      hostString: hostString,
      host: host,
      port: port,
      path: path,
      query: query,
      queryString: queryString
    }
  },
  connect: function(url) {
    var urlObj = this.parseUrl(url);
    if (urlObj.error) {
      return urlObj;
    }
    //console.log(urlObj);
    var db = new tcp.server(urlObj.host, urlObj.port);
    return {
      db: db,
      status: db.connect(),
      url: urlObj
    };
  },
  send: function(params) {
    if (!params) {
      return {error: 'No options defined'};
    }
    var db = params.db;
    if (!db) {
      var status = this.connect(params.url);
      if (!status.status.ok) {
        return status;
      }
      db = status.db;
    }

    if (!params.method || params.method === '') {
      return {error: 'No method defined'};
    }
    var allowed = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    params.method = params.method.toUpperCase();
    if (!allowed.includes(params.method)) {
      return {error: 'Invalid method'};
    }
    var url = status.url;

    var headers = params.method + ' ' + url.path + ' HTTP/1.1';
    headers = headers + '\r\n' + 'Host: ' + url.hostString;

    if (params.headers) {
      for (var name in params.headers) {
        headers = headers + '\r\n' + name + ': ' + params.headers[name];
      }
    }

    if (params.data) {
      headers = headers + '\r\n' + 'content-length: ' + params.data.length;
    }
    headers = headers + '\r\n' + 'Connection: close';
    headers = headers + '\r\n' + '\r\n';

    var payload = {
      headers: headers,
      content: params.data
    };

    if (params.log) {
      console.log('payload: ' + JSON.stringify(payload, null, 2));
    }

    var response = db.http(payload);
    if (!params.db) {
      db.disconnect();
    }
    return response;
  }
}


console.log('*************** Welcome to Node Runner ***************');


if (!fs.existsSync('/node')) {
  console.log(' ');
  console.log('**** Unable to find the /node folder');
  console.log(' ');
  console.log('When you start the Node Runner Docker Container, you MUST map');
  console.log('your target folder to the container\'s /node folder');
  console.log('For example: -v ~/qewd-hit-platform:/node');
  console.log(' ');
  console.log('**** Unable to continue, so the Node Runner will abort ****');
  return;
}

var script_name = process.env.node_script || 'node-script';
var script_path = '/node/' + script_name + '.js';

if (!fs.existsSync(script_path)) {
  console.log(' ');
  console.log('**** Unable to find your script in: ' + script_path);
  console.log(' ');
  console.log('When you start the Node Runner Docker Container, you MUST map');
  console.log('a folder that contains your script to the container\'s /node folder');
  console.log(' ');
  console.log('Remember that if you don\'t specify the script name as an environment');
  console.log('variable named "node_script" when starting the container, the node-runner container will');
  console.log('look for a script file named "node-script.js"');
  console.log(' ');
  console.log('**** Unable to continue, so the Node Runner will abort ****');
  return;
}

var node_script;

try {
  node_script = require(script_path);
}
catch(err) {
  console.log('Error! Unable to load ' + script_path);
  console.log('It probably contains one or more JavaScript syntax errors:');
  console.log(err);
  console.log(' ');
  console.log('**** Unable to continue, so the Node Runner will abort ****');
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
  tcp: tcp,
  requestSync: requestSync
};

// try loading any modules required by the script

var npmModules;
var installModulesPath = '/node/npm_install.json';

if (fs.existsSync(installModulesPath)) {
  try {
    npmModules = require(installModulesPath);
  }
  catch(err) {
    console.log('Error! Unable to load your installModules array at ' + installModulesPath);
    console.log('It probably contains one or more JavaScript syntax errors');
    console.log(err);
    console.log(' ');
    console.log('**** Unable to continue, so the Node Runner will abort ****');
    return;
  }
  if (Array.isArray(npmModules)) {
    npmModules.forEach(function(moduleName) {
      console.log('\nInstalling module: ' + moduleName);
      installModule(moduleName);
    });
  }
}

console.log('*************** Node Runner will now invoke your script ***************');
console.log(' ');

node_script.call(nr);

console.log(' ');
console.log('*************** Node Runner will now terminate ***************');

return;

