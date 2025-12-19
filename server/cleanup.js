const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const GALLERY_FOLDER = path.join(__dirname, '../public/gallery');
const CLEANUP_DAYS = parseInt(process.env.CLEANUP_DAYS || '7');

function initializeCleanup(db) {
  console.log(`⏰ Cleanup scheduler - deletes sessions older than ${CLEANUP_DAYS} days`);

  // Run cleanup daily at 3 AM
  cron.schedule('0 3 * * *', () => {
    console.log('🧹 Running daily cleanup...');
    runCleanup(db);
  });

  // Also run on startup (delayed)
  setTimeout(() => {
    console.log('🧹 Running startup cleanup...');
    runCleanup(db);
  }, 10000);
}

function runCleanup(db) {
  try {
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - CLEANUP_DAYS * 24 * 60 * 60 * 1000);
    const MIN_PHOTOS = 2; // Minimum photos required for valid session

    // First: Clean up orphan sessions (sessions without any photos)
    const orphanSessions = db.prepare(`
      SELECT s.* FROM sessions s
      LEFT JOIN photos p ON s.session_uuid = p.session_uuid
      WHERE s.status IN ('active', 'completed')
      GROUP BY s.session_uuid
      HAVING COUNT(p.id) = 0
    `).all();

    if (orphanSessions.length > 0) {
      console.log(`   🧹 Found ${orphanSessions.length} orphan sessions (no photos)`);
      for (const orphan of orphanSessions) {
        db.prepare(`UPDATE sessions SET status = 'deleted', deleted_at = ? WHERE session_uuid = ?`)
          .run(now.toISOString(), orphan.session_uuid);
        console.log(`   🗑️  Deleted orphan session: ${orphan.folder_name}`);
      }
    }

    // Second: Clean up single-file sessions (sessions with < MIN_PHOTOS)
    const singleFileSessions = db.prepare(`
      SELECT s.*, COUNT(p.id) as photo_count FROM sessions s
      LEFT JOIN photos p ON s.session_uuid = p.session_uuid
      WHERE s.status IN ('active', 'completed')
      GROUP BY s.session_uuid
      HAVING COUNT(p.id) > 0 AND COUNT(p.id) < ?
    `).all(MIN_PHOTOS);

    if (singleFileSessions.length > 0) {
      console.log(`   🧹 Found ${singleFileSessions.length} single-file sessions (< ${MIN_PHOTOS} photos)`);
      for (const single of singleFileSessions) {
        db.prepare(`UPDATE sessions SET status = 'deleted', deleted_at = ? WHERE session_uuid = ?`)
          .run(now.toISOString(), single.session_uuid);
        console.log(`   🗑️  Deleted single-file session: ${single.folder_name} (${single.photo_count} photo)`);
      }
    }

    // Second: Clean up old sessions based on date
    const sessions = db.prepare(`
      SELECT * FROM sessions 
      WHERE status IN ('active', 'completed')
      ORDER BY created_at ASC
    `).all();

    let deletedCount = 0;
    let keptCount = 0;

    // Get watch folder for original photos
    const { getWatchFolder } = require('./watchFolderHelper');
    const WATCH_FOLDER = getWatchFolder(db);

    for (const session of sessions) {
      const createdDate = new Date(session.created_at);
      const galleryPath = path.join(GALLERY_FOLDER, session.session_uuid);
      const originalPath = path.join(WATCH_FOLDER, session.folder_name);

      if (createdDate < cutoffDate) {
        // Delete gallery folder
        if (fs.existsSync(galleryPath)) {
          fs.rmSync(galleryPath, { recursive: true, force: true });
          console.log(`   🗑️  Gallery deleted: ${session.folder_name}`);
        }

        // Delete original photos folder
        if (fs.existsSync(originalPath)) {
          fs.rmSync(originalPath, { recursive: true, force: true });
          console.log(`   🗑️  Original photos deleted: ${session.folder_name}`);
        }

        // Update database
        db.prepare(`
          UPDATE sessions 
          SET status = 'deleted', deleted_at = ?
          WHERE session_uuid = ?
        `).run(now.toISOString(), session.session_uuid);

        deletedCount++;
      } else {
        keptCount++;
      }
    }

    console.log(`✅ Cleanup: Deleted ${deletedCount}, Kept ${keptCount}\n`);
  } catch (error) {
    console.error('❌ Cleanup error:', error.message);
  }
}

module.exports = { initializeCleanup };
