const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { getDatabase } = require('../server/database');

async function main() {
  const sessionUuid = process.argv[2];
  if (!sessionUuid) {
    console.error('Usage: node scripts/rescan-session-admin.js <session-uuid>');
    process.exit(2);
  }

  const db = getDatabase();

  // Ensure schema columns exist
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN last_scanned_by TEXT;`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN last_scanned_at TIMESTAMP;`);
  } catch (e) {}

  // Determine admin user (first admin in users table or env)
  let admin = db.prepare("SELECT id, username FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY id LIMIT 1").get();
  if (!admin) {
    const bcrypt = require('bcrypt');
    const defaultUsername = process.env.ADMIN_USERNAME || 'admin';
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const passwordHash = bcrypt.hashSync(defaultPassword, 10);
    const info = db.prepare('INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, ?)').run(defaultUsername, passwordHash, 'admin@photobooth.local', 'admin');
    admin = { id: info.lastInsertRowid, username: defaultUsername };
    console.log('Created default admin user:', admin.username);
  }

  const session = db.prepare('SELECT * FROM sessions WHERE session_uuid = ?').get(sessionUuid);
  if (!session) {
    console.error('Session not found:', sessionUuid);
    process.exit(1);
  }

  console.log('raw folder_name:', JSON.stringify(session.folder_name));

  const WATCH_FOLDER = process.env.LUMA_PHOTOS_FOLDER || '/Users/chiio/LumaBooth/Photos';
  console.log('WATCH_FOLDER raw:', JSON.stringify(WATCH_FOLDER));
  const folderName = (session.folder_name || '').toString().trim();
  const folderPath = path.join(WATCH_FOLDER, folderName);
  console.log('folderName raw:', JSON.stringify(folderName));
  console.log('manual join:', JSON.stringify(WATCH_FOLDER + '/' + folderName));

  // Debug: list watch folder children
  try {
    const existing = fs.readdirSync(WATCH_FOLDER).filter(f => fs.statSync(path.join(WATCH_FOLDER, f)).isDirectory());
    console.log('Watch folder contains subfolders:', existing.length ? existing.join(', ') : '(none)');
  } catch (e) {
    console.log('Could not list watch folder contents:', e.message);
  }

  if (!fs.existsSync(folderPath)) {
    console.error('Session folder not found on disk:', JSON.stringify(folderPath));
    process.exit(1);
  }

  // Supported media types
  const SUPPORTED_MEDIA_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.avi', '.webm'];
  
  const files = fs.readdirSync(folderPath)
    .filter(f => {
      const ext = path.extname(f).toLowerCase();
      return SUPPORTED_MEDIA_TYPES.includes(ext) && !f.startsWith('_');
    })
    .sort();

  console.log(`Found ${files.length} candidate files for session ${session.folder_name}`);

  // Validate and generate thumbnails
  const galleryFolder = path.join(__dirname, '..', 'public', 'gallery', sessionUuid);
  if (!fs.existsSync(galleryFolder)) fs.mkdirSync(galleryFolder, { recursive: true });

  const validated = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fullPath = path.join(folderPath, file);
    try {
      const meta = await sharp(fullPath).metadata();
      if (meta.width < 400 || meta.height < 400) {
        console.log('  Skipping small image:', file, `${meta.width}x${meta.height}`);
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
      console.error('  Error processing', file, err.message);
    }
  }

  // Sync DB atomically
  const transaction = db.transaction((items) => {
    db.prepare('DELETE FROM photos WHERE session_uuid = ?').run(sessionUuid);
    const insert = db.prepare('INSERT INTO photos (session_uuid, photo_number, original_path, processed_path, upload_timestamp) VALUES (?, ?, ?, ?, ?)');
    for (const it of items) {
      insert.run(sessionUuid, it.photoNumber, it.fullPath, it.thumbPath, new Date().toISOString());
    }
  });

  transaction(validated);

  // Update session with last_scanned_by and last_scanned_at
  db.prepare('UPDATE sessions SET last_scanned_by = ?, last_scanned_at = ? WHERE session_uuid = ?')
    .run(admin.username, new Date().toISOString(), sessionUuid);

  console.log(`Synced ${validated.length} photos for session ${sessionUuid} (triggered by ${admin.username})`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
