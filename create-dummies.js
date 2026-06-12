const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'test-photos');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// 1x1 PNG base64
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const buffer = Buffer.from(pngBase64, 'base64');

fs.writeFileSync(path.join(dir, 'photo1.png'), buffer);
fs.writeFileSync(path.join(dir, 'photo2.png'), buffer);

console.log('Dummy test photos created at:', dir);
