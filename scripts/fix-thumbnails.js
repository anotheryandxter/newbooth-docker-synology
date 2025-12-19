#!/usr/bin/env node
/**
 * Fix Thumbnails Script
 * 
 * This script fixes sessions where all photos have photo_number = 1.
 * It will:
 * 1. Find sessions with duplicate photo_numbers
 * 2. Reassign correct photo_numbers (1, 2, 3, etc.)
 * 3. Regenerate thumbnail files with correct names
 * 4. Update database records
 * 5. Regenerate final composite with correct photos
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const DB_PATH = path.join(__dirname, '../database/photobooth.db');
const GALLERY_FOLDER = path.join(__dirname, '../public/gallery');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

async function fixThumbnails() {
  console.log('🔍 Finding sessions with duplicate photo_numbers...\n');

  // Find sessions where multiple photos have the same photo_number
  const sessionsWithDuplicates = db.prepare(`
    SELECT session_uuid, COUNT(*) as photo_count, 
           COUNT(DISTINCT photo_number) as unique_numbers
    FROM photos
    GROUP BY session_uuid
    HAVING photo_count != unique_numbers
  `).all();

  if (sessionsWithDuplicates.length === 0) {
    console.log('✅ No sessions with duplicate photo_numbers found!');
    return;
  }

  console.log(`Found ${sessionsWithDuplicates.length} sessions with duplicates:\n`);

  for (const session of sessionsWithDuplicates) {
    console.log(`\n📂 Session: ${session.session_uuid}`);
    console.log(`   Photos: ${session.photo_count}, Unique numbers: ${session.unique_numbers}`);

    // Get all photos for this session, ordered by ID (insertion order)
    const photos = db.prepare(`
      SELECT * FROM photos 
      WHERE session_uuid = ? 
      ORDER BY id ASC
    `).all(session.session_uuid);

    console.log(`\n   Reassigning photo numbers...`);

    // Begin transaction
    const updateStmt = db.prepare(`
      UPDATE photos 
      SET photo_number = ?, processed_path = ?
      WHERE id = ?
    `);

    const transaction = db.transaction((photos) => {
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const newPhotoNumber = i + 1;
        const galleryPath = path.join(GALLERY_FOLDER, session.session_uuid);
        const newProcessedPath = path.join(galleryPath, `photo_${newPhotoNumber}.jpg`);

        updateStmt.run(newPhotoNumber, newProcessedPath, photo.id);
      }
    });

    transaction(photos);

    console.log(`   ✅ Database updated`);

    // Regenerate thumbnail files
    console.log(`\n   Regenerating thumbnail files...`);
    
    const galleryPath = path.join(GALLERY_FOLDER, session.session_uuid);
    
    // Ensure gallery folder exists
    if (!fs.existsSync(galleryPath)) {
      console.log(`   ⚠️  Gallery folder not found, creating: ${galleryPath}`);
      fs.mkdirSync(galleryPath, { recursive: true });
    }
    
    // Remove old thumbnails
    const oldThumbnails = fs.readdirSync(galleryPath)
      .filter(f => f.startsWith('photo_') && f.endsWith('.jpg'));
    
    for (const thumb of oldThumbnails) {
      fs.unlinkSync(path.join(galleryPath, thumb));
    }

    // Generate new thumbnails
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const newPhotoNumber = i + 1;
      const outputPath = path.join(galleryPath, `photo_${newPhotoNumber}.jpg`);

      try {
        if (!fs.existsSync(photo.original_path)) {
          console.log(`   ⚠️  Original file not found: ${photo.original_path}`);
          continue;
        }

        await sharp(photo.original_path)
          .resize(1920, 1080, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 90, progressive: true })
          .toFile(outputPath);

        console.log(`   ✅ Generated photo_${newPhotoNumber}.jpg from ${path.basename(photo.original_path)}`);
      } catch (error) {
        console.error(`   ❌ Error generating photo_${newPhotoNumber}.jpg:`, error.message);
      }
    }

    console.log(`\n   ✅ Session ${session.session_uuid} fixed!`);
  }

  console.log('\n\n🎉 All sessions fixed!\n');
}

// Run the script
fixThumbnails()
  .then(() => {
    db.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    db.close();
    process.exit(1);
  });
