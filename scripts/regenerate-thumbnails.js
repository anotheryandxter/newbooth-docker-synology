#!/usr/bin/env node

/**
 * Regenerate all thumbnails with correct aspect ratio (fit: inside instead of cover)
 */

const { getDatabase } = require('../server/database');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const db = getDatabase();
const WATCH_FOLDER = process.env.LUMA_PHOTOS_FOLDER || path.join(__dirname, '../test-photos');

async function regenerateAllThumbnails() {
  try {
    // Get all active and completed sessions
    const sessions = db.prepare(`
      SELECT session_uuid, folder_name, status 
      FROM sessions 
      WHERE status IN ('active', 'completed')
      ORDER BY created_at DESC
    `).all();

    console.log(`\n📋 Found ${sessions.length} sessions to process\n`);

    let totalProcessed = 0;
    let totalFailed = 0;

    for (const session of sessions) {
      const folderPath = path.join(WATCH_FOLDER, session.folder_name);
      const galleryFolder = path.join(__dirname, '..', 'public', 'gallery', session.session_uuid);

      console.log(`\n🔄 Processing: ${session.folder_name}`);
      
      if (!fs.existsSync(folderPath)) {
        console.log(`   ⚠️  Watch folder not found: ${folderPath}`);
        continue;
      }

      if (!fs.existsSync(galleryFolder)) {
        console.log(`   ⚠️  Gallery folder not found: ${galleryFolder}`);
        continue;
      }

      // Get all media files
      const SUPPORTED_MEDIA_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.avi', '.webm'];
      const files = fs.readdirSync(folderPath)
        .filter(f => {
          const ext = path.extname(f).toLowerCase();
          return SUPPORTED_MEDIA_TYPES.includes(ext) && !f.startsWith('_') && !f.startsWith('.');
        })
        .sort();

      console.log(`   📸 Found ${files.length} media files`);

      for (let i = 0; i < files.length; i++) {
        const photoFile = files[i];
        const photoPath = path.join(folderPath, photoFile);
        const photoNumber = i + 1;
        const thumbnailPath = path.join(galleryFolder, `photo_${photoNumber}.jpg`);
        
        const ext = path.extname(photoFile).toLowerCase();
        const isVideo = ['.mp4', '.mov', '.avi', '.webm'].includes(ext);
        const isGif = ext === '.gif';

        try {
          if (isVideo) {
            // Video placeholder - no need to regenerate
            console.log(`   🎥 #${photoNumber}: ${photoFile} (video, skipping)`);
            continue;
          } else if (isGif) {
            // Regenerate GIF thumbnail with fit: inside
            await sharp(photoPath, { animated: false })
              .resize(1920, 1080, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 1 } })
              .jpeg({ quality: 90, progressive: true })
              .toFile(thumbnailPath);
            console.log(`   ✅ #${photoNumber}: ${photoFile} (GIF)`);
          } else {
            // Regenerate image thumbnail with fit: inside
            await sharp(photoPath)
              .resize(1920, 1080, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 1 } })
              .jpeg({ quality: 90, progressive: true })
              .toFile(thumbnailPath);
            console.log(`   ✅ #${photoNumber}: ${photoFile}`);
          }
          totalProcessed++;
        } catch (err) {
          console.error(`   ❌ #${photoNumber}: ${photoFile} - ${err.message}`);
          totalFailed++;
        }
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Processed: ${totalProcessed}`);
    console.log(`   ❌ Failed: ${totalFailed}`);
    console.log(`   📁 Sessions: ${sessions.length}\n`);

    db.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    db.close();
    process.exit(1);
  }
}

regenerateAllThumbnails();
