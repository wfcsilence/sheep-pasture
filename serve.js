const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  fs.readFile(f, (err,data)=>{
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(data);
  });
}).listen(8123, '127.0.0.1', ()=>console.log('serving http://127.0.0.1:8123'));
