#!/usr/bin/env node

/**
 * Regenerate all gallery HTML files with updated styling
 */

const { getDatabase } = require('../server/database');
const { generateGalleryHTML } = require('../server/watcher');
const path = require('path');
const fs = require('fs');

const db = getDatabase();

async function regenerateAllGalleries() {
  try {
    // Get all active and completed sessions
    const sessions = db.prepare(`
      SELECT session_uuid, folder_name, status 
      FROM sessions 
      WHERE status IN ('active', 'completed')
      ORDER BY created_at DESC
    `).all();

    console.log(`\n📋 Found ${sessions.length} sessions to regenerate\n`);

    let successCount = 0;
    let failCount = 0;

    for (const session of sessions) {
      const galleryDir = path.join(__dirname, '..', 'public', 'gallery', session.session_uuid);

      try {
        // Ensure gallery directory exists
        if (!fs.existsSync(galleryDir)) {
          console.log(`⚠️  Skipping ${session.session_uuid.substring(0, 8)}... - Gallery directory not found`);
          failCount++;
          continue;
        }

        // Regenerate gallery HTML (galleryPath expects directory, not file path)
        await generateGalleryHTML(session.session_uuid, galleryDir, db);
        console.log(`✅ ${session.session_uuid.substring(0, 8)}... - ${session.folder_name}`);
        successCount++;
      } catch (err) {
        console.error(`❌ ${session.session_uuid.substring(0, 8)}... - ${err.message}`);
        failCount++;
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   📁 Total: ${sessions.length}\n`);

    db.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    db.close();
    process.exit(1);
  }
}

regenerateAllGalleries();
