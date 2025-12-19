const {scanAndProcessSession} = require('../server/watcher');
const {getDatabase} = require('../server/database');
const fs = require('fs');
const path = require('path');

// Supported media types
const SUPPORTED_MEDIA_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.avi', '.webm'];

const db = getDatabase();
const folderPath = '/Users/chiio/LumaBooth/Photos/SIGN';
const photoFiles = fs.readdirSync(folderPath)
  .filter(f => {
    const ext = path.extname(f).toLowerCase();
    return SUPPORTED_MEDIA_TYPES.includes(ext) && !f.includes('_qrcode');
  })
  .sort();

console.log(`📂 Scanning folder: SIGN`);
console.log(`📸 Found ${photoFiles.length} photo files`);

scanAndProcessSession('SIGN', folderPath, photoFiles, db)
  .then(() => {
    console.log('\n✅ Scan complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
