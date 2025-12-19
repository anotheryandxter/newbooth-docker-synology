#!/usr/bin/env node

/**
 * Audit Sessions Script
 * 
 * Checks all sessions for:
 * 1. Sessions with 0 photos (orphans)
 * 2. Sessions with single photo only
 * 3. Sessions where folder doesn't exist
 * 4. Sessions where folder is actually a file
 */

const { getDatabase } = require('../server/database');
const fs = require('fs');
const path = require('path');

console.log('🔍 Session Database Audit');
console.log('================================\n');

const db = getDatabase();
const WATCH_FOLDER = process.env.LUMA_PHOTOS_FOLDER || path.join(__dirname, '..', 'test-photos');

console.log(`📁 Watch Folder: ${WATCH_FOLDER}\n`);

// Get all active sessions with photo counts
const sessions = db.prepare(`
  SELECT 
    s.session_uuid,
    s.folder_name,
    s.created_at,
    s.status,
    COUNT(p.id) as photo_count
  FROM sessions s
  LEFT JOIN photos p ON s.session_uuid = p.session_uuid
  WHERE s.status IN ('active', 'completed')
  GROUP BY s.session_uuid
  ORDER BY photo_count ASC, s.created_at DESC
`).all();

console.log(`📊 Total Active Sessions: ${sessions.length}\n`);

// Categorize issues
const issues = {
  orphans: [],           // 0 photos
  singles: [],          // 1 photo only
  missingFolders: [],   // folder doesn't exist
  invalidFolders: []    // folder is actually a file
};

// Audit each session
sessions.forEach(session => {
  const folderPath = path.join(WATCH_FOLDER, session.folder_name);
  
  // Check for orphans (0 photos)
  if (session.photo_count === 0) {
    issues.orphans.push(session);
  }
  
  // Check for singles (1 photo only)
  else if (session.photo_count === 1) {
    issues.singles.push(session);
  }
  
  // Check if folder exists
  if (!fs.existsSync(folderPath)) {
    issues.missingFolders.push(session);
  } 
  // Check if path is actually a file (not a folder)
  else if (fs.statSync(folderPath).isFile()) {
    issues.invalidFolders.push(session);
  }
});

// Report findings
console.log('═══════════════════════════════════════════════════\n');

// 1. Orphan Sessions
if (issues.orphans.length > 0) {
  console.log(`⚠️  ORPHAN SESSIONS (0 photos): ${issues.orphans.length}`);
  console.log('─────────────────────────────────────────────────');
  issues.orphans.forEach(session => {
    console.log(`  • ${session.folder_name}`);
    console.log(`    ID: ${session.session_uuid}`);
    console.log(`    Created: ${session.created_at}`);
  });
  console.log('');
} else {
  console.log('✅ No orphan sessions found\n');
}

// 2. Single Photo Sessions
if (issues.singles.length > 0) {
  console.log(`⚠️  SINGLE PHOTO SESSIONS: ${issues.singles.length}`);
  console.log('─────────────────────────────────────────────────');
  issues.singles.forEach(session => {
    const folderPath = path.join(WATCH_FOLDER, session.folder_name);
    const exists = fs.existsSync(folderPath);
    const isFile = exists && fs.statSync(folderPath).isFile();
    
    console.log(`  • ${session.folder_name}`);
    console.log(`    ID: ${session.session_uuid}`);
    console.log(`    Photos: ${session.photo_count}`);
    console.log(`    Folder Exists: ${exists ? '✅' : '❌'}`);
    console.log(`    Is File: ${isFile ? '⚠️  YES (BUG!)' : '✅ No'}`);
  });
  console.log('');
} else {
  console.log('✅ No single photo sessions found\n');
}

// 3. Missing Folders
if (issues.missingFolders.length > 0) {
  console.log(`⚠️  MISSING FOLDERS: ${issues.missingFolders.length}`);
  console.log('─────────────────────────────────────────────────');
  issues.missingFolders.forEach(session => {
    console.log(`  • ${session.folder_name}`);
    console.log(`    ID: ${session.session_uuid}`);
    console.log(`    Photos: ${session.photo_count}`);
  });
  console.log('');
} else {
  console.log('✅ All session folders exist\n');
}

// 4. Invalid Folders (files registered as folders)
if (issues.invalidFolders.length > 0) {
  console.log(`❌ INVALID FOLDERS (files not folders): ${issues.invalidFolders.length}`);
  console.log('─────────────────────────────────────────────────');
  issues.invalidFolders.forEach(session => {
    console.log(`  • ${session.folder_name}`);
    console.log(`    ID: ${session.session_uuid}`);
    console.log(`    Photos: ${session.photo_count}`);
    console.log(`    ⚠️  This is a FILE, not a FOLDER!`);
  });
  console.log('');
} else {
  console.log('✅ All session paths are valid folders\n');
}

console.log('═══════════════════════════════════════════════════\n');

// Summary
const totalIssues = issues.orphans.length + issues.singles.length + 
                   issues.missingFolders.length + issues.invalidFolders.length;

if (totalIssues === 0) {
  console.log('🎉 ALL CHECKS PASSED!');
  console.log('   Database is clean and consistent.\n');
} else {
  console.log(`⚠️  FOUND ${totalIssues} ISSUES`);
  console.log('');
  console.log('🔧 Recommended Actions:');
  console.log('─────────────────────────────────────────────────');
  
  if (issues.orphans.length > 0) {
    console.log(`  1. Clean orphan sessions:`);
    console.log(`     node scripts/clean-orphan-sessions.js`);
  }
  
  if (issues.singles.length > 0) {
    console.log(`  2. Review single photo sessions:`);
    console.log(`     Check if they are legitimate or bugs`);
  }
  
  if (issues.missingFolders.length > 0) {
    console.log(`  3. Delete sessions with missing folders`);
  }
  
  if (issues.invalidFolders.length > 0) {
    console.log(`  4. Delete invalid sessions (files not folders)`);
    console.log(`     These are likely bugs from watchdog`);
  }
  
  console.log('─────────────────────────────────────────────────\n');
}

// Healthy sessions
const healthySessions = sessions.filter(s => 
  s.photo_count > 1 && 
  !issues.missingFolders.includes(s) && 
  !issues.invalidFolders.includes(s)
);

console.log(`✅ Healthy Sessions: ${healthySessions.length}`);
if (healthySessions.length > 0 && healthySessions.length <= 10) {
  console.log('─────────────────────────────────────────────────');
  healthySessions.forEach((session, index) => {
    console.log(`  ${index + 1}. ${session.folder_name} (${session.photo_count} photos)`);
  });
  console.log('─────────────────────────────────────────────────');
}

console.log('');
process.exit(totalIssues > 0 ? 1 : 0);
