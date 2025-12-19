const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { getDatabase } = require('../server/database');

(async function() {
  try {
    const db = getDatabase();
    const WATCH_FOLDER = process.env.LUMA_PHOTOS_FOLDER || '/Users/chiio/LumaBooth/Photos' || path.join(__dirname, '..', 'test-photos');

    if (!fs.existsSync(WATCH_FOLDER)) {
      console.error('Watch folder not found:', WATCH_FOLDER);
      process.exit(1);
    }

    const folders = fs.readdirSync(WATCH_FOLDER)
      .filter(f => fs.statSync(path.join(WATCH_FOLDER, f)).isDirectory())
      .sort();

    console.log('Found folders:', folders.length);

    for (const folder of folders) {
      const folderPath = path.join(WATCH_FOLDER, folder);
      const files = fs.readdirSync(folderPath)
        .filter(f => /\.(jpg|jpeg|png)$/i.test(f) && !f.startsWith('_'))
        .sort();

      console.log(`\nProcessing session folder: ${folder} (${files.length} files)`);

      // Look up or create session
      // Use folder name as session_uuid for consistency
      let session = db.prepare('SELECT * FROM sessions WHERE session_uuid = ?').get(folder);
      if (!session) {
        const accessToken = require('crypto').randomBytes(16).toString('hex');
        db.prepare('INSERT INTO sessions (session_uuid, folder_name, layout_used, status, is_public, access_token) VALUES (?, ?, ?, ?, ?, ?)')
          .run(folder, folder, 'none', 'active', 0, accessToken);
        session = db.prepare('SELECT * FROM sessions WHERE session_uuid = ?').get(folder);
        console.log('  Created session', folder);
      }

      // Validate files and generate thumbnails
      const galleryFolder = path.join(__dirname, '..', 'public', 'gallery', session.session_uuid);
      if (!fs.existsSync(galleryFolder)) fs.mkdirSync(galleryFolder, { recursive: true });

      const validated = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fullPath = path.join(folderPath, file);
        try {
          const meta = await sharp(fullPath).metadata();
          if (meta.width < 400 || meta.height < 400) {
            console.log('   Skipping small image:', file, `${meta.width}x${meta.height}`);
            continue;
          }

          const photoNumber = validated.length + 1;
          const thumbPath = path.join(galleryFolder, `photo_${photoNumber}.jpg`);
          await sharp(fullPath)
            .resize(1920, 1080, { fit: 'cover', position: 'center' })
            .jpeg({ quality: 90, progressive: true })
            .toFile(thumbPath);

          validated.push({ file, fullPath, photoNumber, thumbPath });
        } catch (err) {
          console.error('   Error processing', file, err.message);
        }
      }

      // Sync DB: delete existing rows and insert validated
      const transaction = db.transaction((items) => {
        db.prepare('DELETE FROM photos WHERE session_uuid = ?').run(session.session_uuid);
        const insert = db.prepare('INSERT INTO photos (session_uuid, photo_number, original_path, processed_path, upload_timestamp) VALUES (?, ?, ?, ?, ?)');
        for (const it of items) {
          insert.run(session.session_uuid, it.photoNumber, it.fullPath, it.thumbPath, new Date().toISOString());
        }
      });

      transaction(validated);

      console.log(`  Synced ${validated.length} photos for session ${session.session_uuid}`);
    }

    console.log('\nAll folders processed');
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
