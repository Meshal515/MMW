import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist');
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(path.join(out,'assets'),{recursive:true});
fs.cpSync(path.join(root,'public'),out,{recursive:true});
// Derive fixed PWA PNG icons from the exact same static vector mark shown in the app.
const logo = path.join(root, 'public', 'icons', 'icon.svg');
for (const size of [192,512]) {
  await sharp(logo).resize(size, size).png({compressionLevel:9}).toFile(path.join(out,'icons',`icon-${size}.png`));
}
await build({
  entryPoints:[path.join(root,'src','main.js')],
  outdir:path.join(out,'assets'),
  entryNames:'app',
  bundle:true,
  platform:'browser',
  format:'esm',
  target:'es2022',
  minify:false,
  sourcemap:false,
  legalComments:'none',
  define:{'import.meta.env.PROD':'true'},
  logLevel:'info'
});
const html = fs.readFileSync(path.join(root,'index.html'),'utf8')
  .replace('<script type="module" src="/src/main.js"></script>',
    '<link rel="stylesheet" href="/assets/app.css" />\n    <script type="module" src="/assets/app.js"></script>');
fs.writeFileSync(path.join(out,'index.html'),html);
console.log('USPACE built in '+out);
