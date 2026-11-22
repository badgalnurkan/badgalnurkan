'use strict';
// Dependency-free, loopback-only static preview. Not for production.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const PORT=4173;
const ALLOWED=Object.freeze({
 '/':'index.html',
 '/index.html':'index.html',
 '/account-security.js':'account-security.js',
 '/account-security.css':'account-security.css',
 '/recovery-browser.js':'recovery-browser.js',
 '/account-close.html':'account-close.html',
 '/account-close.js':'account-close.js',
 '/privacy.html':'privacy.html',
 '/kvkk.html':'kvkk.html',
 '/terms.html':'terms.html',
 '/cookies.html':'cookies.html',
 '/google71b0ad28b2232354.html':'google71b0ad28b2232354.html'
});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};

function createPreviewServer({rootDir=ROOT}={}){
 const config=JSON.parse(fs.readFileSync(path.join(rootDir,'vercel.json'),'utf8'));
 const headers=(config.headers||[]).flatMap(rule=>rule.headers||[]);
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  for(const item of headers)res.setHeader(item.key,item.value);
  const port=server.address()?.port||PORT;
  const host=req.headers.host||'';
  if(host!=='127.0.0.1:'+port&&host!=='localhost:'+port){
   res.writeHead(403);res.end('Forbidden');return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){
   res.setHeader('Allow','GET, HEAD');
   res.writeHead(405);res.end('Method Not Allowed');return;
  }
  const rawPath=String(req.url||'').split('?')[0];
  // Only exact, known public runtime paths may be read.
  if(!Object.prototype.hasOwnProperty.call(ALLOWED,rawPath)){
   res.writeHead(404);res.end('Not Found');return;
  }
  const file=ALLOWED[rawPath];
  fs.readFile(path.join(rootDir,file),(err,bytes)=>{
   if(err){res.writeHead(err.code==='ENOENT'?404:500);res.end('Unavailable');return}
   res.setHeader('Content-Type',MIME[path.extname(file)]||'application/octet-stream');
   res.writeHead(200);res.end(req.method==='HEAD'?undefined:bytes);
  });
 });
 return server;
}
if(require.main===module){
 const server=createPreviewServer();
 server.on('error',err=>{
  console.error('Local preview failed:',err.code||err.message);
  if(err.code==='EADDRINUSE')console.error('Stop your previous http-server with Ctrl+C, then retry.');
  process.exitCode=1;
 });
 server.listen(PORT,'127.0.0.1',()=>{
  console.log('Local QA preview: http://127.0.0.1:'+PORT);
  console.log('Only approved public files are served. Press Ctrl+C to stop.');
  console.log('For real sign-in, use protected QA: localhost is not an allowed OTP origin.');
 });
}
module.exports={createPreviewServer};
