const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const sharp = require('sharp');
const { createDynamicGridLayout, createLegacyLayout } = require('./layoutEngine');

// Supported media file types
const SUPPORTED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const SUPPORTED_VIDEO_TYPES = ['.mp4', '.mov', '.avi', '.webm'];
const SUPPORTED_MEDIA_TYPES = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_VIDEO_TYPES];

// Helper: Check if file is video
function isVideoFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_VIDEO_TYPES.includes(ext);
}

// Helper: Check if file is image
function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_IMAGE_TYPES.includes(ext);
}

// Session ID Logic:
// session_uuid = folder_name (no more random UUIDs)
// This makes URLs predictable and debugging easier

let WATCH_FOLDER = process.env.LUMA_PHOTOS_FOLDER || path.join(__dirname, '../test-photos');
const GALLERY_FOLDER = path.join(__dirname, '../public/gallery');
const TEMP_FOLDER = path.join(__dirname, '../temp');

let currentWatcher = null;
let currentDb = null;

// Ensure folders exist
[GALLERY_FOLDER, TEMP_FOLDER].forEach(folder => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
});

const processingQueue = new Set();
const sessionFolderMap = new Map();
const folderProcessingTimers = new Map(); // Debounce timers per folder
const FOLDER_DEBOUNCE_DELAY = 5000; // Wait 5 seconds for more files
const MIN_FILES_PER_SESSION = 2; // Minimum files required for a valid session

// Helper: Scan folder tree and count media files recursively
function scanFolderTree(folderPath) {
  const result = {
    path: folderPath,
    files: [],
    totalFiles: 0,
    isValid: false
  };

  try {
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      return result;
    }

    // Get all items in folder
    const items = fs.readdirSync(folderPath);
    
    for (const item of items) {
      // Skip hidden/system files (dot files, dot folders, underscore prefixed)
      if (item.startsWith('_') || item.startsWith('.')) {
        continue;
      }

      // Additional check: skip common system folders
      const systemFolders = ['.DS_Store', '.Spotlight-V100', '.Trashes', '.TemporaryItems', 'Thumbs.db'];
      if (systemFolders.includes(item)) {
        continue;
      }

      const itemPath = path.join(folderPath, item);
      const stat = fs.statSync(itemPath);

      // Only process files, not subdirectories
      if (stat.isFile()) {
        const ext = path.extname(item).toLowerCase();
        if (SUPPORTED_MEDIA_TYPES.includes(ext)) {
          result.files.push(item);
        }
      }
    }

    result.totalFiles = result.files.length;
    result.isValid = result.totalFiles >= MIN_FILES_PER_SESSION;
    
    return result;
  } catch (error) {
    console.error(`   ❌ Error scanning folder tree ${folderPath}:`, error.message);
    return result;
  }
}

// Helper: Validate folder consistency (check if file count is stable)
function validateFolderConsistency(folderPath, expectedCount) {
  try {
    const currentScan = scanFolderTree(folderPath);
    
    // Check if file count matches expectation
    if (currentScan.totalFiles !== expectedCount) {
      console.log(`   ⚠️  File count mismatch: expected ${expectedCount}, found ${currentScan.totalFiles}`);
      return false;
    }
    
    // Check if still meets minimum requirement
    if (currentScan.totalFiles < MIN_FILES_PER_SESSION) {
      console.log(`   ⚠️  Insufficient files: ${currentScan.totalFiles} < ${MIN_FILES_PER_SESSION}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`   ❌ Error validating consistency:`, error.message);
    return false;
  }
}

function initializeWatcher(db) {
  currentDb = db;
  
  // Get watch folder from database settings
  try {
    const settings = db.prepare('SELECT watch_folder_path FROM global_settings WHERE id = 1').get();
    if (settings && settings.watch_folder_path) {
      WATCH_FOLDER = settings.watch_folder_path;
      console.log('📁 Using watch folder from settings:', WATCH_FOLDER);
    } else {
      console.log('📁 Using default watch folder:', WATCH_FOLDER);
    }
  } catch (e) {
    // Table might not exist yet on first run
    console.log('📁 Using default watch folder:', WATCH_FOLDER);
  }
  
  startWatcher(db);
}

function startWatcher(db) {
  // Stop existing watcher if any
  if (currentWatcher) {
    console.log('🛑 Stopping existing watcher...');
    try {
      currentWatcher.close();
    } catch (e) {
      console.error('Error closing watcher:', e.message);
    }
    currentWatcher = null;
  }
  
  console.log(`📸 File Watcher - monitoring: ${WATCH_FOLDER}`);

  if (!fs.existsSync(WATCH_FOLDER)) {
    console.warn(`⚠️  Watch folder not found: ${WATCH_FOLDER}`);
    console.log(`   Creating folder for development...`);
    try {
      fs.mkdirSync(WATCH_FOLDER, { recursive: true });
      console.log(`✅ Created watch folder: ${WATCH_FOLDER}`);
    } catch (e) {
      console.error(`❌ Failed to create watch folder: ${e.message}`);
      console.log(`   Using fallback path...`);
      WATCH_FOLDER = path.join(__dirname, '../test-photos');
      fs.mkdirSync(WATCH_FOLDER, { recursive: true });
    }
  }

  // Scan existing folders on startup
  console.log('🔄 Scanning existing folders...');
  scanExistingFolders(db);

  // Watch for new photos
  currentWatcher = fs.watch(WATCH_FOLDER, { recursive: true }, async (eventType, filename) => {
    if (!filename) return;

    const filePath = path.join(WATCH_FOLDER, filename);

    // Only process files in subfolders, not in root
    const relativePath = path.relative(WATCH_FOLDER, filePath);
    const pathParts = relativePath.split(path.sep);
    if (pathParts.length < 2) {
      // File is in root folder, skip it
      return;
    }

    // Debounce file events
    setTimeout(async () => {
      if (!fs.existsSync(filePath)) return;

      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return;

      const ext = path.extname(filename).toLowerCase();
      const isMedia = SUPPORTED_MEDIA_TYPES.includes(ext);

      if (isMedia && !processingQueue.has(filePath)) {
        processingQueue.add(filePath);

        try {
          await processPhotoSession(filePath, db);
        } catch (error) {
          console.error(`Error processing ${filename}:`, error.message);
        } finally {
          processingQueue.delete(filePath);
        }
      }
    }, 500);
  });
}

async function scanExistingFolders(db) {
  console.log('🔄 Scanning existing folders with tree structure validation...');
  console.log(`   📊 Minimum files per session: ${MIN_FILES_PER_SESSION}`);

  try {
    const folders = fs.readdirSync(WATCH_FOLDER)
      .filter(f => {
        try {
          // IGNORE: Dot files, dot folders, and hidden files
          if (f.startsWith('.') || f.startsWith('_')) {
            console.log(`   ⏭️  Skipping hidden/system: ${f}`);
            return false;
          }

          const fullPath = path.join(WATCH_FOLDER, f);
          const stat = fs.statSync(fullPath);
          // STRICT: Must be directory, not a file
          if (!stat.isDirectory()) {
            console.log(`   ⏭️  Skipping file (not a folder): ${f}`);
            return false;
          }
          return true;
        } catch (e) {
          console.log(`   ⚠️  Error checking ${f}: ${e.message}`);
          return false;
        }
      })
      .sort((a, b) => {
        const aTime = fs.statSync(path.join(WATCH_FOLDER, a)).birthtimeMs;
        const bTime = fs.statSync(path.join(WATCH_FOLDER, b)).birthtimeMs;
        return bTime - aTime;
      });

    let processedCount = 0;
    let skippedCount = 0;

    for (const folder of folders) {
      const folderPath = path.join(WATCH_FOLDER, folder);
      
      // STEP 1: Scan folder tree structure
      console.log(`   🔍 Scanning tree: ${folder}`);
      const treeResult = scanFolderTree(folderPath);
      
      // STEP 2: Validate minimum file requirement
      if (!treeResult.isValid) {
        console.log(`   ⏭️  Skipping folder: ${folder} (${treeResult.totalFiles} files < ${MIN_FILES_PER_SESSION} minimum)`);
        skippedCount++;
        continue;
      }

      console.log(`   📂 Valid session: ${folder} (${treeResult.totalFiles} media files)`);
      
      // STEP 3: Double-check consistency before processing
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
      const recheckResult = scanFolderTree(folderPath);
      
      if (recheckResult.totalFiles !== treeResult.totalFiles) {
        console.log(`   ⚠️  File count changed during scan (${treeResult.totalFiles} → ${recheckResult.totalFiles}), skipping`);
        skippedCount++;
        continue;
      }

      // STEP 4: Process entire session with isolated error handling
      try {
        await scanAndProcessSession(folder, folderPath, recheckResult.files, db);
        processedCount++;
      } catch (sessionError) {
        console.error(`   ❌ Failed to process session ${folder}:`, sessionError.message);
        console.error(`   Stack:`, sessionError.stack);
        skippedCount++;
        // Continue with next session instead of stopping entire scan
      }
    }

    console.log(`✅ Scan completed: ${processedCount} processed, ${skippedCount} skipped\n`);
  } catch (error) {
    console.error('❌ Critical error scanning folders:', error);
    console.error('Stack:', error.stack);
  }
}

// NEW: Scan and process entire session with accurate media mapping
// Session UUID = Folder Name (no more random UUIDs)
async function scanAndProcessSession(sessionFolderName, folderPath, photoFiles, db) {
  try {
    // STRICT VALIDATION: Must meet minimum file requirement
    if (!photoFiles || photoFiles.length < MIN_FILES_PER_SESSION) {
      console.log(`   ⚠️  Insufficient files: ${sessionFolderName} has ${photoFiles?.length || 0} files (minimum: ${MIN_FILES_PER_SESSION})`);
      return;
    }

    // Validate: Must be a directory
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      console.log(`   ⚠️  Invalid folder path: ${folderPath}`);
      return;
    }

    // CONSISTENCY CHECK: Re-scan to ensure file count is stable
    const finalScan = scanFolderTree(folderPath);
    if (finalScan.totalFiles < MIN_FILES_PER_SESSION) {
      console.log(`   ⚠️  Final scan failed: ${sessionFolderName} has ${finalScan.totalFiles} files (minimum: ${MIN_FILES_PER_SESSION})`);
      return;
    }

    if (finalScan.totalFiles !== photoFiles.length) {
      console.log(`   ⚠️  File count changed: expected ${photoFiles.length}, found ${finalScan.totalFiles}`);
      // Use the most recent scan result
      photoFiles = finalScan.files;
    }

    // Use folder name as session_uuid for consistency
    const sessionId = sessionFolderName;
    
    // Check if session exists
    let session = db.prepare('SELECT * FROM sessions WHERE session_uuid = ?').get(sessionId);

    if (!session) {
      // Create new session with folder name as session_uuid
      const timestamp = new Date().toISOString();
      const accessToken = require('crypto').randomBytes(16).toString('hex');

      db.prepare(`
        INSERT INTO sessions (
          session_uuid, folder_name, layout_used, created_at, status, is_public, access_token
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(sessionId, sessionFolderName, 'none', timestamp, 'active', 0, accessToken);

      sessionFolderMap.set(sessionFolderName, sessionId);

      // Generate QR code with folder name as ID
      const localIp = process.env.LOCAL_IP || 'localhost';
      const port = process.env.PORT || 3000;
      const qrUrl = `http://${localIp}:${port}/gallery/${encodeURIComponent(sessionId)}?token=${accessToken}`;
      const qrPath = path.join(folderPath, '_qrcode.png');

      try {
        await QRCode.toFile(qrPath, qrUrl, { width: 400, margin: 2 });
        console.log(`   ✅ Session created: ${sessionId}`);
      } catch (error) {
        console.warn(`   ⚠️  QR generation failed:`, error.message);
      }

      session = {
        session_uuid: sessionId,
        folder_name: sessionFolderName,
        access_token: accessToken
      };
    } else {
      // Session exists - update status to active to ensure it can be reprocessed
      console.log(`   ♻️  Re-processing existing session: ${sessionId}`);
      try {
        db.prepare(`
          UPDATE sessions 
          SET status = 'active', updated_at = CURRENT_TIMESTAMP
          WHERE session_uuid = ?
        `).run(sessionId);
        sessionFolderMap.set(sessionFolderName, sessionId);
      } catch (updateError) {
        console.warn(`   ⚠️  Could not update session status:`, updateError.message);
      }
    }

    // Create gallery folder
    const galleryPath = path.join(GALLERY_FOLDER, session.session_uuid);
    if (!fs.existsSync(galleryPath)) {
      fs.mkdirSync(galleryPath, { recursive: true });
    }

    // MEDIA SCAN: Sync database with filesystem in a single transaction
    console.log(`   🔍 Media scan: Processing ${photoFiles.length} files...`);

    const insertPhotosTxn = db.transaction((files) => {
      try {
        // Remove any existing photo rows for this session to avoid duplicates
        db.prepare('DELETE FROM photos WHERE session_uuid = ?').run(session.session_uuid);

        let processedCount = 0;
        const insertStmt = db.prepare(`
          INSERT INTO photos (session_uuid, photo_number, original_path, processed_path, upload_timestamp)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (let i = 0; i < files.length; i++) {
          const photoFile = files[i];
          const photoPath = path.join(folderPath, photoFile);
          const photoNumber = i + 1;

          try {
            // Validate image synchronously via sharp metadata (await outside txn)
          } catch (e) {
            // noop
          }

          // Generate thumbnail path
          const thumbnailPath = path.join(galleryPath, `photo_${photoNumber}.jpg`);

          // Insert a placeholder row now; processed_path will be updated after thumbnail is written
          insertStmt.run(session.session_uuid, photoNumber, photoPath, thumbnailPath, new Date().toISOString());
          processedCount++;
        }

        return processedCount;
      } catch (txnError) {
        console.error(`   ❌ Transaction error for session ${session.session_uuid}:`, txnError.message);
        throw txnError; // Re-throw to rollback transaction
      }
    });

    // Validate and process media files (images and videos)
    let validatedFiles = [];
    for (let i = 0; i < photoFiles.length; i++) {
      const photoFile = photoFiles[i];
      const photoPath = path.join(folderPath, photoFile);
      const photoNumber = validatedFiles.length + 1;
      const thumbnailPath = path.join(galleryPath, `photo_${photoNumber}.jpg`);

      try {
        // Increase timeout to 30 seconds for large video files
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Processing timeout (30s exceeded)')), 30000)
        );

        if (isVideoFile(photoFile)) {
          // VIDEO FILES: Copy original video file to gallery
          console.log(`   🎥 Processing video: ${photoFile}`);
          const videoDestPath = path.join(galleryPath, `photo_${photoNumber}${path.extname(photoFile)}`);
          
          // Copy video file
          fs.copyFileSync(photoPath, videoDestPath);
          
          // Create a placeholder thumbnail for videos
          // For now, we'll create a simple colored placeholder
          // TODO: In future, extract first frame using ffmpeg
          await sharp({
            create: {
              width: 1920,
              height: 1080,
              channels: 3,
              background: { r: 45, g: 45, b: 45 }
            }
          })
          .composite([{
            input: Buffer.from(
              '<svg width="1920" height="1080"><text x="50%" y="50%" font-size="120" fill="white" text-anchor="middle" dominant-baseline="middle">🎥 VIDEO</text></svg>'
            ),
            gravity: 'center'
          }])
          .jpeg({ quality: 80 })
          .toFile(thumbnailPath);
          
          validatedFiles.push(photoFile);
          console.log(`   ✅ Video processed: ${photoFile}`);
          
        } else if (isImageFile(photoFile)) {
          // IMAGE FILES: Use sharp to process
          const metadataPromise = sharp(photoPath).metadata();
          const metadata = await Promise.race([metadataPromise, timeoutPromise]);
          
          if (metadata.width < 100 || metadata.height < 100) {
            console.log(`   ⚠️  Skipping small image: ${photoFile} (${metadata.width}x${metadata.height})`);
            continue;
          }

          // Special handling for GIF to preserve animation
          if (path.extname(photoFile).toLowerCase() === '.gif') {
            console.log(`   🎞️  Processing GIF (animated): ${photoFile}`);
            // Copy original GIF to preserve animation
            const gifDestPath = path.join(galleryPath, `photo_${photoNumber}.gif`);
            fs.copyFileSync(photoPath, gifDestPath);
            
            // Also create a static thumbnail from first frame
            const thumbnailPromise = sharp(photoPath, { animated: false })
              .resize(1920, 1080, { fit: 'cover', position: 'center' })
              .jpeg({ quality: 90, progressive: true })
              .toFile(thumbnailPath);
            
            await Promise.race([thumbnailPromise, timeoutPromise]);
          } else {
            // Regular image processing
            const thumbnailPromise = sharp(photoPath)
              .resize(1920, 1080, { fit: 'cover', position: 'center' })
              .jpeg({ quality: 90, progressive: true })
              .toFile(thumbnailPath);
            
            await Promise.race([thumbnailPromise, timeoutPromise]);
          }
          
          validatedFiles.push(photoFile);
        } else {
          console.log(`   ⚠️  Unsupported media type: ${photoFile}`);
          continue;
        }
      } catch (error) {
        if (error.message.includes('timeout')) {
          console.error(`   ⏱️  Timeout processing ${photoFile} (30s exceeded) - skipping this file`);
        } else {
          console.error(`   ❌ Error processing ${photoFile}:`, error.message);
        }
        // Continue with next file instead of stopping entire session
      }
    }

    // Run DB transaction to align rows to validatedFiles (uses final ordering)
    const finalCount = insertPhotosTxn(validatedFiles);
    console.log(`   ✅ Processed ${finalCount}/${photoFiles.length} files (validated ${validatedFiles.length})`);

    // Generate gallery HTML
    await generateGalleryHTML(session.session_uuid, galleryPath, db);

  } catch (error) {
    console.error(`   ❌ Error scanning session ${sessionFolderName}:`, error.message);
  }
}

async function processPhotoSession(photoPath, db) {
  const fileName = path.basename(photoPath);
  const folderPath = path.dirname(photoPath);
  const sessionFolderName = path.basename(folderPath);

  console.log(`📸 New file detected: ${fileName} in ${sessionFolderName}`);

  // Clear existing timer for this folder
  if (folderProcessingTimers.has(sessionFolderName)) {
    const oldTimer = folderProcessingTimers.get(sessionFolderName);
    clearTimeout(oldTimer.timer);
    console.log(`   ⏱️  Timer reset (was at ${oldTimer.fileCount} files)`);
  }

  // Quick scan to check current file count
  const quickScan = scanFolderTree(folderPath);
  console.log(`   📊 Current files in folder: ${quickScan.totalFiles}`);

  // Set new timer - wait for more files before processing
  const timer = setTimeout(async () => {
    try {
      console.log(`   🔍 Debounce complete, processing folder: ${sessionFolderName}`);
      
      // STEP 1: Scan folder tree structure
      const initialScan = scanFolderTree(folderPath);
      console.log(`   📂 Initial scan: ${initialScan.totalFiles} media files`);

      // STEP 2: Validate minimum requirement
      if (initialScan.totalFiles < MIN_FILES_PER_SESSION) {
        console.log(`   ⏭️  Insufficient files: ${initialScan.totalFiles} < ${MIN_FILES_PER_SESSION} minimum`);
        return;
      }

      // STEP 3: Wait and re-scan to ensure consistency
      await new Promise(resolve => setTimeout(resolve, 500));
      const finalScan = scanFolderTree(folderPath);
      
      // STEP 4: Validate consistency
      if (!validateFolderConsistency(folderPath, initialScan.totalFiles)) {
        console.log(`   ⚠️  Folder consistency check failed, skipping processing`);
        return;
      }

      console.log(`   ✅ Consistency validated: ${finalScan.totalFiles} files`);

      // STEP 5: Process session
      await scanAndProcessSession(sessionFolderName, folderPath, finalScan.files, db);
      
    } catch (error) {
      console.error(`   ❌ Error processing folder ${sessionFolderName}:`, error.message);
    } finally {
      folderProcessingTimers.delete(sessionFolderName);
    }
  }, FOLDER_DEBOUNCE_DELAY);

  folderProcessingTimers.set(sessionFolderName, { 
    timer, 
    fileCount: quickScan.totalFiles,
    startTime: Date.now()
  });
  console.log(`   ⏱️  Debouncing... waiting ${FOLDER_DEBOUNCE_DELAY}ms for more files`);
}

// LAYOUT ENGINE DISABLED - Function kept for backward compatibility but does nothing
async function applyLayout(sessionId, photos, layout, gridConfig, overlayId, db, galleryPath) {
  console.log(`⚠️  Layout engine disabled - skipping composite generation for session ${sessionId}`);
  
  // Mark session as completed without generating composite
  try {
    db.prepare(`
      UPDATE sessions 
      SET status = 'completed', final_image_path = NULL
      WHERE session_uuid = ?
    `).run(sessionId);
  } catch (error) {
    console.error(`Error updating session status:`, error.message);
  }
}

async function createGrid2x2Layout(photos) {
  const baseImage = sharp({
    create: {
      width: 1920,
      height: 1080,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  });

  let composite = [];
  const photosToUse = photos.slice(0, 4);

  const positions = [
    { x: 0, y: 0 },
    { x: 960, y: 0 },
    { x: 0, y: 540 },
    { x: 960, y: 540 }
  ];

  for (let i = 0; i < photosToUse.length; i++) {
    const resized = await sharp(photosToUse[i].processed_path)
      .resize(960, 540, { fit: 'cover' })
      .toBuffer();

    composite.push({
      input: resized,
      left: positions[i].x,
      top: positions[i].y
    });
  }

  return baseImage.composite(composite);
}

async function createOverlayLayout(photos) {
  const basePhotoPath = photos[0].processed_path;
  const templateFolder = path.join(__dirname, '../public/templates/layouts');
  const logoPng = path.join(templateFolder, 'studio_logo.png');

  let composite = [];

  // Base photo
  const baseBuffer = await sharp(basePhotoPath)
    .resize(1920, 1080, { fit: 'cover' })
    .toBuffer();

  // Add logo if exists
  if (fs.existsSync(logoPng)) {
    composite.push({
      input: logoPng,
      top: 900,
      left: 1600
    });
  }

  return sharp(baseBuffer).composite(composite);
}

async function createSingleLayout(photos) {
  const basePhotoPath = photos[0].processed_path;
  const templateFolder = path.join(__dirname, '../public/templates/layouts');
  const framePng = path.join(templateFolder, 'frame.png');

  let composite = [];

  // Base photo
  const baseBuffer = await sharp(basePhotoPath)
    .resize(1200, 800, { fit: 'cover' })
    .toBuffer();

  // Add frame if exists
  if (fs.existsSync(framePng)) {
    composite.push({
      input: framePng,
      top: 0,
      left: 0
    });
  }

  return sharp(baseBuffer).composite(composite);
}

async function generateGalleryHTML(sessionId, galleryPath, db) {
  const session = db.prepare(
    'SELECT * FROM sessions WHERE session_uuid = ?'
  ).get(sessionId);

  if (!session) {
    console.error(`Session ${sessionId} not found in database`);
    return;
  }


  const html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Photo Gallery</title>
    <link rel="icon" href="/favicon.png">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            max-width: 1000px;
            width: 100%;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 30px;
        }

        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 40px 30px;
            border-radius: 16px;
            overflow: hidden;
            position: relative;
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
        }

        .header h1 {
            font-size: 2em;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            position: relative;
            z-index: 1;
        }

        .header p {
            color: #666;
            font-size: 0.9em;
            position: relative;
            z-index: 1;
        }

        .loading {
            text-align: center;
            padding: 60px 20px;
            color: #999;
        }

        .loading i {
            font-size: 3em;
            margin-bottom: 20px;
            color: #2d2d2d;
            animation: spin 2s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .error {
            text-align: center;
            padding: 60px 20px;
            color: #d32f2f;
        }

        .error i {
            font-size: 3em;
            margin-bottom: 20px;
        }

        .actions {
            display: flex;
            gap: 10px;
            justify-content: center;
            margin-bottom: 30px;
            flex-wrap: wrap;
        }

        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 0.95em;
            font-weight: 600;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }

        .btn i {
            font-size: 1.1em;
        }

        .btn-primary {
            background: linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%);
            color: white;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.4);
        }

        .btn-secondary {
            background: #f1f3f4;
            color: #333;
        }

        .btn-secondary:hover {
            background: #e8eaed;
        }

        .thumbnails {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }

        .thumbnail {
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
            cursor: pointer;
            position: relative;
        }

        .thumbnail:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }

        .thumbnail img {
            width: 100%;
            height: auto;
            display: block;
        }

        .thumbnail-actions {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
            padding: 10px;
            display: flex;
            gap: 5px;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .thumbnail:hover .thumbnail-actions {
            opacity: 1;
        }

        .thumbnail-btn {
            background: rgba(255,255,255,0.9);
            border: none;
            border-radius: 5px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 0.8em;
            color: #333;
            transition: all 0.2s ease;
        }

        .thumbnail-btn:hover {
            background: white;
            transform: scale(1.05);
        }

        /* Modal */
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            z-index: 1000;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .modal.active {
            display: flex;
        }

        .modal-content {
            position: relative;
            max-width: 90vw;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .modal-close {
            position: absolute;
            top: -40px;
            right: 0;
            background: none;
            border: none;
            color: white;
            font-size: 2.5em;
            cursor: pointer;
            line-height: 1;
            padding: 0;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .modal-image {
            max-width: 100%;
            max-height: 80vh;
            object-fit: contain;
            border-radius: 10px;
        }

        .modal-actions {
            margin-top: 20px;
            display: flex;
            gap: 10px;
        }

        @media (max-width: 768px) {
            .container {
                padding: 20px;
            }
            
            .header h1 {
                font-size: 1.5em;
            }
            
            .thumbnails {
                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                gap: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="gallery-title">📸 Photo Gallery</h1>
            <p id="sessionName">Loading...</p>
        </div>

        <div id="loading" class="loading">
            <i class="fas fa-circle-notch"></i>
            <p>Loading photos...</p>
        </div>

        <div id="error" class="error" style="display: none;">
            <i class="fas fa-exclamation-circle"></i>
            <p id="errorMessage">Failed to load gallery</p>
        </div>

        <div id="content" style="display: none;">
            <div class="actions">
                <button class="btn btn-primary" onclick="downloadAll()">
                    <i class="fas fa-download"></i> Download All
                </button>
                <button class="btn btn-secondary" onclick="share()">
                    <i class="fas fa-share-alt"></i> Share
                </button>
            </div>

            <div id="photoCount" style="text-align: center; margin-bottom: 20px; color: #666;"></div>

            <div class="thumbnails" id="thumbnails">
                <!-- Photos will be loaded here -->
            </div>
        </div>
    </div>

    <!-- Media Modal -->
    <div class="modal" id="photoModal" onclick="closeModal(event)">
        <div class="modal-content">
            <button class="modal-close" onclick="closeModal()">&times;</button>
            <img id="modalImage" class="modal-image" src="" alt="Media" style="display:none;">
            <video id="modalVideo" class="modal-image" controls style="display:none;">
                <source id="modalVideoSource" src="" type="video/mp4">
                Your browser does not support video playback.
            </video>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="downloadCurrentPhoto()">
                    <i class="fas fa-download"></i> Download
                </button>
                <button class="btn btn-secondary" onclick="closeModal()">
                    Close
                </button>
            </div>
        </div>
    </div>

    <script>
        const sessionId = '${sessionId}';
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token') || '';
        
        let photos = [];
        let currentPhotoIndex = 0;

        // Load gallery data
        async function loadGallery() {
            try {
                console.log('🔄 Loading gallery for session:', sessionId);
                
                // Fetch session info
                const infoUrl = '/api/gallery/' + sessionId + '/info' + (token ? '?token=' + token : '');
                const infoResponse = await fetch(infoUrl);
                
                if (!infoResponse.ok) {
                    throw new Error('Failed to load session info: ' + infoResponse.status);
                }
                
                const sessionInfo = await infoResponse.json();
                console.log('✅ Session info loaded:', sessionInfo);
                
                document.getElementById('sessionName').textContent = sessionInfo.folder_name || 'Photobooth Session';
                
                // Fetch photos
                const photosUrl = '/api/gallery/' + sessionId + '/photos' + (token ? '?token=' + token : '');
                const photosResponse = await fetch(photosUrl);
                
                if (!photosResponse.ok) {
                    throw new Error('Failed to load photos: ' + photosResponse.status);
                }
                
                photos = await photosResponse.json();
                console.log('✅ Photos loaded:', photos.length, 'photos');
                
                // Display photos
                displayPhotos();
                
                // Hide loading, show content
                document.getElementById('loading').style.display = 'none';
                document.getElementById('content').style.display = 'block';
                
            } catch (error) {
                console.error('❌ Error loading gallery:', error);
                document.getElementById('loading').style.display = 'none';
                document.getElementById('error').style.display = 'block';
                document.getElementById('errorMessage').textContent = error.message;
            }
        }

        function displayPhotos() {
            const thumbnailsContainer = document.getElementById('thumbnails');
            const photoCountEl = document.getElementById('photoCount');
            
            const imageCount = photos.filter(p => p.mediaType === 'image' || !p.mediaType).length;
            const videoCount = photos.filter(p => p.mediaType === 'video').length;
            const gifCount = photos.filter(p => p.mediaType === 'gif').length;
            
            let countText = photos.length + ' media';
            if (videoCount > 0 || gifCount > 0) {
                countText += ' (' + imageCount + ' foto';
                if (gifCount > 0) countText += ', ' + gifCount + ' GIF';
                if (videoCount > 0) countText += ', ' + videoCount + ' video';
                countText += ')';
            } else {
                countText = photos.length + ' foto';
            }
            photoCountEl.textContent = countText;
            
            thumbnailsContainer.innerHTML = photos.map((photo, index) => {
                const mediaIcon = photo.mediaType === 'video' ? '🎥' : (photo.mediaType === 'gif' ? '🎞️' : '📷');
                return '<div class="thumbnail" onclick="viewPhoto(' + index + ')">' +
                    '<img src="' + photo.thumbnailUrl + '" alt="Media ' + photo.photoNumber + '" loading="lazy">' +
                    '<div class="thumbnail-actions">' +
                        '<button class="thumbnail-btn" onclick="event.stopPropagation(); viewPhoto(' + index + ')">' +
                            '<i class="fas fa-eye"></i> View' +
                        '</button>' +
                        '<button class="thumbnail-btn" onclick="event.stopPropagation(); downloadPhoto(' + index + ')">' +
                            '<i class="fas fa-download"></i> DL' +
                        '</button>' +
                    '</div>' +
                    '<p style="text-align: center; margin-top: 8px; font-size: 0.85em; color: #666;">' + mediaIcon + ' #' + photo.photoNumber + '</p>' +
                '</div>';
            }).join('');
        }

        function viewPhoto(index) {
            currentPhotoIndex = index;
            const photo = photos[index];
            
            console.log('🔍 View media:', photo.photoNumber, 'Type:', photo.mediaType, 'URL:', photo.originalUrl);
            
            const modalImage = document.getElementById('modalImage');
            const modalVideo = document.getElementById('modalVideo');
            const modalVideoSource = document.getElementById('modalVideoSource');
            
            if (photo.mediaType === 'video') {
                // Display video
                modalImage.style.display = 'none';
                modalVideo.style.display = 'block';
                modalVideoSource.src = photo.originalUrl;
                const videoType = photo.fileExtension === '.webm' ? 'video/webm' : 
                                 photo.fileExtension === '.mov' ? 'video/quicktime' :
                                 photo.fileExtension === '.avi' ? 'video/x-msvideo' : 'video/mp4';
                modalVideoSource.type = videoType;
                modalVideo.load();
                console.log('✅ Video loaded:', videoType);
            } else {
                // Display image or GIF
                modalVideo.style.display = 'none';
                modalImage.style.display = 'block';
                
                modalImage.onerror = function() {
                    console.error('❌ Failed to load image:', photo.originalUrl);
                    alert('Gagal memuat media #' + photo.photoNumber);
                };
                
                modalImage.onload = function() {
                    console.log('✅ Image loaded successfully');
                };
                
                modalImage.src = photo.originalUrl;
            }
            
            document.getElementById('photoModal').classList.add('active');
        }

        function closeModal(event) {
            if (event && event.target !== event.currentTarget) return;
            const modalVideo = document.getElementById('modalVideo');
            if (modalVideo) {
                modalVideo.pause();
                modalVideo.currentTime = 0;
            }
            document.getElementById('photoModal').classList.remove('active');
        }

        function downloadPhoto(index) {
            const photo = photos[index];
            console.log('💾 Download photo:', photo.photoNumber, 'URL:', photo.originalUrl);
            
            fetch(photo.originalUrl)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                    }
                    return response.blob();
                })
                .then(blob => {
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'photo_' + sessionId + '_' + photo.photoNumber + '.jpg';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                    console.log('✅ Download started');
                })
                .catch(error => {
                    console.error('❌ Download failed:', error);
                    alert('Gagal mendownload foto: ' + error.message);
                });
        }

        function downloadCurrentPhoto() {
            downloadPhoto(currentPhotoIndex);
        }

        function downloadAll() {
            if (photos.length === 0) {
                alert('Tidak ada foto untuk didownload');
                return;
            }
            
            console.log('💾 Downloading all photos:', photos.length);
            
            photos.forEach((photo, index) => {
                setTimeout(() => {
                    downloadPhoto(index);
                }, index * 500); // Stagger downloads by 500ms
            });
        }

        function share() {
            const shareUrl = window.location.href;
            if (navigator.share) {
                navigator.share({
                    title: 'Photobooth - Reflection Photography',
                    text: 'Lihat ' + photos.length + ' foto saya!',
                    url: shareUrl
                }).catch(err => console.log('Share cancelled'));
            } else {
                navigator.clipboard.writeText(shareUrl).then(() => {
                    alert('✅ Link telah disalin ke clipboard!\\n\\n' + shareUrl);
                }).catch(() => {
                    prompt('Copy link ini:', shareUrl);
                });
            }
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeModal();
            } else if (e.key === 'ArrowLeft' && document.getElementById('photoModal').classList.contains('active')) {
                const prevIndex = (currentPhotoIndex - 1 + photos.length) % photos.length;
                viewPhoto(prevIndex);
            } else if (e.key === 'ArrowRight' && document.getElementById('photoModal').classList.contains('active')) {
                const nextIndex = (currentPhotoIndex + 1) % photos.length;
                viewPhoto(nextIndex);
            }
        });

        // Load gallery on page load
        loadGallery();
    </script>

    <!-- Branding Loader -->
    <script src="/src/branding-loader.js"></script>
</body>
</html>`;

  const htmlPath = path.join(galleryPath, 'index.html');
  fs.writeFileSync(htmlPath, html);
}

// Reload watcher with new path
function reloadWatcher(newPath) {
  if (!currentDb) {
    console.error('❌ Cannot reload watcher: database not initialized');
    return false;
  }
  
  WATCH_FOLDER = newPath;
  console.log('🔄 Reloading watcher with new path:', newPath);
  
  startWatcher(currentDb);
  return true;
}

module.exports = { initializeWatcher, generateGalleryHTML, applyLayout, scanAndProcessSession, reloadWatcher };
