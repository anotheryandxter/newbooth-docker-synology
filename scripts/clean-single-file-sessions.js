#!/usr/bin/env node

/**
 * Clean Single File Sessions Script
 * 
 * Specifically removes sessions that only have 1 photo.
 * These are likely bugs from race conditions during file scanning.
 */

const { getDatabase } = require('../server/database');
const fs = require('fs');
const path = require('path');

console.log('🧹 Cleaning Single File Sessions...');
console.log('====================================\n');

const db = getDatabase();
const WATCH_FOLDER = process.env.LUMA_PHOTOS_FOLDER || path.join(__dirname, '..', 'test-photos');

// Find all single-file sessions
const singleFileSessions = db.prepare(`
  SELECT 
    s.session_uuid,
    s.folder_name,
    s.created_at,
    COUNT(p.id) as photo_count
  FROM sessions s
  LEFT JOIN photos p ON s.session_uuid = p.session_uuid
  WHERE s.status IN ('active', 'completed')
  GROUP BY s.session_uuid
  HAVING COUNT(p.id) = 1
  ORDER BY s.created_at DESC
`).all();

console.log(`Found ${singleFileSessions.length} single-file sessions\n`);

if (singleFileSessions.length === 0) {
  console.log('✅ No single-file sessions found. Database is clean!\n');
  process.exit(0);
}

// Display single-file sessions
console.log('Single File Sessions (likely bugs):');
console.log('─────────────────────────────────────────────────');
singleFileSessions.forEach((session, index) => {
  const folderPath = path.join(WATCH_FOLDER, session.folder_name);
  const exists = fs.existsSync(folderPath);
  const isFile = exists && fs.statSync(folderPath).isFile();
  const actualFiles = exists && !isFile ? fs.readdirSync(folderPath).filter(f => !f.startsWith('_')).length : 0;
  
  console.log(`${index + 1}. ${session.folder_name}`);
  console.log(`   Session ID: ${session.session_uuid}`);
  console.log(`   Photos in DB: ${session.photo_count}`);
  console.log(`   Folder exists: ${exists ? '✅' : '❌'}`);
  if (exists) {
    console.log(`   Is file (not folder): ${isFile ? '⚠️  YES (BUG!)' : '✅ No'}`);
    if (!isFile) {
      console.log(`   Actual files in folder: ${actualFiles}`);
    }
  }
  console.log(`   Created: ${session.created_at}`);
  console.log('');
});
console.log('─────────────────────────────────────────────────\n');

// Ask for confirmation
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Delete all single-file sessions? (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
    console.log('\n🗑️  Deleting single-file sessions...\n');
    
    const now = new Date().toISOString();
    let deletedCount = 0;
    
    singleFileSessions.forEach(session => {
      try {
        // Check if folder actually has more files now
        const folderPath = path.join(WATCH_FOLDER, session.folder_name);
        let shouldDelete = true;
        
        if (fs.existsSync(folderPath) && !fs.statSync(folderPath).isFile()) {
          const files = fs.readdirSync(folderPath)
            .filter(f => !f.startsWith('_') && /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|webm)$/i.test(f));
          
          if (files.length > 1) {
            console.log(`   ⏭️  Skipping ${session.folder_name} - now has ${files.length} files (will be rescanned)`);
            shouldDelete = false;
          }
        }
        
        if (shouldDelete) {
          // Mark as deleted in database
          db.prepare(`
            UPDATE sessions 
            SET status = 'deleted', deleted_at = ?
            WHERE session_uuid = ?
          `).run(now, session.session_uuid);
          
          console.log(`   ✅ Deleted: ${session.folder_name}`);
          deletedCount++;
        }
      } catch (error) {
        console.error(`   ❌ Failed to delete ${session.folder_name}: ${error.message}`);
      }
    });
    
    console.log(`\n✅ Successfully deleted ${deletedCount} single-file sessions`);
    console.log('─────────────────────────────────────────────────\n');
    
    // Show remaining sessions
    const remainingSessions = db.prepare(`
      SELECT 
        s.session_uuid,
        s.folder_name,
        COUNT(p.id) as photo_count
      FROM sessions s
      LEFT JOIN photos p ON s.session_uuid = p.session_uuid
      WHERE s.status IN ('active', 'completed')
      GROUP BY s.session_uuid
      HAVING COUNT(p.id) > 0
      ORDER BY s.created_at DESC
      LIMIT 10
    `).all();
    
    console.log(`📊 Remaining Active Sessions: ${remainingSessions.length}`);
    if (remainingSessions.length > 0) {
      console.log('─────────────────────────────────────────────────');
      remainingSessions.forEach((session, index) => {
        console.log(`${index + 1}. ${session.folder_name} (${session.photo_count} photos)`);
      });
      console.log('─────────────────────────────────────────────────');
    }
    
    console.log('\n💡 Tip: Restart server to ensure clean state:');
    console.log('   pm2 restart photobooth');
    console.log('   # or');
    console.log('   docker restart photobooth\n');
    
  } else {
    console.log('\n❌ Operation cancelled. No sessions were deleted.\n');
  }
  
  rl.close();
  process.exit(0);
});
