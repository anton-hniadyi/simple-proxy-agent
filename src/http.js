const http = require('http');
const url = require('url');
const tls = require('tls');
const net = require('net');

class HTTP {
  constructor(proxy, options) {
    this.proxy = proxy;
    this.options = options;
    this.init();
  }

  init() {
    const proxy = url.parse(this.proxy);
    proxy.host = proxy.hostname || proxy.host;
    proxy.port = +proxy.port || (proxy.protocol.toLowerCase() === 'https:' ? 443 : 80);
    this.proxy = proxy;
  }
}

HTTP.prototype.addRequest = function(req, options) {
  if(!options.protocol) options = options.uri;
  const absolute = url.format({
    protocol: options.protocol || 'http:',
    hostname: options.hostname || options.host,
    port: options.port,
    pathname: req.path
  });
  req.path = decodeURIComponent(absolute);
  req.shouldKeepAlive = false;

  this.createConnection(options)
    .then(socket => {
      req.onSocket(socket);
    })
    .catch(err => {
      req.emit('error', err);
    })
};

HTTP.prototype.createConnection = function(options) {
  let self = options.agent;
  return new Promise((resolve, reject) => {
    const ssl = options.protocol ? options.protocol.toLowerCase() === 'https:' : false;
    if(ssl && self.options.tunnel === true) {
      if(options.port === 80) options.port = 443;
      // CONNECT Method
      function buildAuthHeader(user, pass) {
        return 'Basic ' + new Buffer(user + ':' + pass).toString('base64');
      }
      let resOfSplit = self.proxy.auth.split(':');
      let user = resOfSplit[0];
      let pass = resOfSplit[1];

      const req = http.request({
        host: self.proxy.hostname,
        port: self.proxy.port,
        auth: self.proxy.auth,
        method: 'CONNECT',
        path: (options.hostname || options.host) + ":" + options.port,
        headers: {
          host: options.host,
          'Proxy-Authorization': buildAuthHeader(user, pass),
        },
        timeout: self.options.timeout
      });

      req.once('connect', (res, socket, head) => {
        const tunnel = tls.connect({
          socket: socket,
          host: options.hostname || options.host,
          port: +options.port,
          servername: options.servername || options.host
        }, function () {
          let stop = true;
        });
        resolve(tunnel);
      });

      req.once('timeout', () => {
        req.abort();
        reject(new Error('HTTP CONNECT request timed out'))
      })

      req.once('error', (err) => {
        reject(err);
      });

      req.once('close', (err) => {
        if (err) {
          console.error(err);
        }
        reject(new Error('Tunnel failed. Socket closed prematurely'));
      });

      req.end();
    } else {
      const socket = net.connect({
        host: self.proxy.host,
        port: self.proxy.port,
        auth: self.proxy.auth,
      });
      resolve(socket);
    }
  })
};

module.exports = HTTP;