#!/usr/bin/env node

/**
 * Clean Orphan Sessions Script
 * 
 * Removes sessions that have no photos attached.
 * This can happen if:
 * - Single files were accidentally registered as sessions
 * - Session creation succeeded but photo processing failed
 * - Manual database modifications
 */

const { getDatabase } = require('../server/database');

console.log('🧹 Cleaning Orphan Sessions...');
console.log('================================\n');

const db = getDatabase();

// Find all orphan sessions
const orphanSessions = db.prepare(`
  SELECT 
    s.session_uuid,
    s.folder_name,
    s.created_at,
    COUNT(p.id) as photo_count
  FROM sessions s
  LEFT JOIN photos p ON s.session_uuid = p.session_uuid
  WHERE s.status IN ('active', 'completed')
  GROUP BY s.session_uuid
  HAVING COUNT(p.id) = 0
  ORDER BY s.created_at DESC
`).all();

console.log(`Found ${orphanSessions.length} orphan sessions (sessions without photos)\n`);

if (orphanSessions.length === 0) {
  console.log('✅ No orphan sessions found. Database is clean!\n');
  process.exit(0);
}

// Display orphan sessions
console.log('Orphan Sessions:');
console.log('─────────────────────────────────────────────────');
orphanSessions.forEach((session, index) => {
  console.log(`${index + 1}. ${session.folder_name}`);
  console.log(`   Session ID: ${session.session_uuid}`);
  console.log(`   Created: ${session.created_at}`);
  console.log(`   Photos: ${session.photo_count}`);
  console.log('');
});
console.log('─────────────────────────────────────────────────\n');

// Ask for confirmation
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Delete all orphan sessions? (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
    console.log('\n🗑️  Deleting orphan sessions...\n');
    
    const now = new Date().toISOString();
    let deletedCount = 0;
    
    orphanSessions.forEach(session => {
      try {
        // Mark as deleted in database
        db.prepare(`
          UPDATE sessions 
          SET status = 'deleted', deleted_at = ?
          WHERE session_uuid = ?
        `).run(now, session.session_uuid);
        
        console.log(`   ✅ Deleted: ${session.folder_name}`);
        deletedCount++;
      } catch (error) {
        console.error(`   ❌ Failed to delete ${session.folder_name}: ${error.message}`);
      }
    });
    
    console.log(`\n✅ Successfully deleted ${deletedCount} orphan sessions`);
    console.log('─────────────────────────────────────────────────\n');
    
    // Show remaining active sessions
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
    
  } else {
    console.log('\n❌ Operation cancelled. No sessions were deleted.\n');
  }
  
  rl.close();
  process.exit(0);
});
