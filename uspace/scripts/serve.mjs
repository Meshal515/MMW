import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname,'../dist');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const port=Number(process.env.PORT||4173);
http.createServer((req,res)=>{
 let pathname;
 try {pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{return res.writeHead(400).end('Invalid URL');}
 if(pathname.startsWith('/api/'))return res.writeHead(501,{'Content-Type':'application/json'}).end(JSON.stringify({error:'يتطلب الذكاء الاصطناعي نشر Cloudflare Worker.'}));
 const relative=path.posix.normalize(pathname).replace(/^\/+/, '');
 const file=path.resolve(root, relative||'index.html');
 if(!file.startsWith(root+path.sep) && file!==root)return res.writeHead(403).end('Forbidden');
 fs.stat(file,(err,stat)=>{
  const target=!err && stat.isFile()?file:path.join(root,'index.html');
  fs.readFile(target,(e,data)=>{
   if(e)return res.writeHead(404).end('Not found');
   res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});
   res.end(data);
  });
 });
}).listen(port,()=>console.log(`USPACE local preview: http://localhost:${port}`));
