// Minimal manifest/versions copy after build
const fs = require('fs');
const path = require('path');

const outdir = process.env.OUTDIR || 'dist';

// 读取根目录的 manifest.json
const manifestPath = path.resolve(__dirname, '..', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// （可选）如果 versions.json 逻辑也需要同步，可以一并修改
// const versionsPath = path.resolve(__dirname, '..', 'versions.json');
// const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));

fs.mkdirSync(outdir, { recursive: true });
fs.writeFileSync(path.join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2));

// 如果不再需要动态生成 versions.json，可以注释或删除下面这行
// fs.writeFileSync(path.join(outdir, 'versions.json'), JSON.stringify(versions, null, 2));

console.log(`✅ Copied manifest.json to ${outdir}`);
// css emitted by Vite is styles.css per config
