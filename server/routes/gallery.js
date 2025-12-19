const express = require('express');

module.exports = function(db) {
  const router = express.Router();

  // Get all galleries (only public ones)
  router.get('/', (req, res) => {
    try {
      const sessions = db.prepare(`
        SELECT 
          s.session_uuid,
          s.folder_name,
          s.layout_used,
          s.final_image_path,
          s.created_at,
          s.status,
          s.is_public,
          COUNT(p.id) as photo_count
        FROM sessions s
        LEFT JOIN photos p ON s.session_uuid = p.session_uuid
        WHERE s.status IN ('active', 'completed') AND s.is_public = 1
        GROUP BY s.session_uuid
        ORDER BY s.created_at DESC
        LIMIT 100
      `).all();

      res.json(sessions);
    } catch (error) {
      console.error('Error in /:sessionId/photos handler:', error && error.stack ? error.stack : error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // Get session info for gallery (authoritative from filesystem)
  router.get('/:sessionId/info', async (req, res) => {
    try {
      const { sessionId } = req.params;

      const session = db.prepare(`
        SELECT session_uuid, folder_name, layout_used, final_image_path, created_at, status, is_public
        FROM sessions WHERE session_uuid = ?
      `).get(sessionId);

      if (!session) return res.status(404).json({ error: 'Session not found' });

      // Determine watch folder path
      const path = require('path');
      const fs = require('fs');
      const { getWatchFolder } = require('../watchFolderHelper');
      const WATCH_FOLDER = getWatchFolder(db);
      const folderPath = path.join(WATCH_FOLDER, session.folder_name);

      let photoCount = 0;
      if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath)
          .filter(f => /\.(jpg|jpeg|png)$/i.test(f) && !f.startsWith('_'))
          .sort();

        console.log('[gallery] building photosFromFs for', sessionId, 'folderPath=', folderPath, 'filesCount=', files.length);
        photoCount = files.length;
      } else {
        // Fallback to DB count
        const row = db.prepare('SELECT COUNT(*) as count FROM photos WHERE session_uuid = ?').get(sessionId);
        photoCount = row ? row.count : 0;
      }

      res.json({
        session_uuid: session.session_uuid,
        folder_name: session.folder_name,
        layout_used: session.layout_used,
        final_image_path: session.final_image_path,
        created_at: session.created_at,
        status: session.status,
        is_public: session.is_public,
        photo_count: photoCount
      });
    } catch (error) {
      console.error('Gallery /photos error:', error && error.stack ? error.stack : error);
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  });

  // Get photos list for gallery
  router.get('/:sessionId/photos', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { token } = req.query;

      // Check session exists and access (include folder_name for filesystem lookup)
      const session = db.prepare('SELECT is_public, access_token, folder_name FROM sessions WHERE session_uuid = ?').get(sessionId);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Make photos list public: no auth required to view thumbnails

      // Try to build authoritative photos list from filesystem
      const path = require('path');
      const fs = require('fs');
      const sharp = require('sharp');
      
      // Get watch folder from database settings (same as watcher.js)
      const { getWatchFolder } = require('../watchFolderHelper');
      const WATCH_FOLDER = getWatchFolder(db);
      
      const folderName = (session.folder_name || '').toString().trim();

      console.log('[gallery.debug] session object:', session);
      console.log('[gallery.debug] vars:', { sessionId, folder_name: session && session.folder_name, folderName, WATCH_FOLDER });

      if (folderName) {
        const folderPath = path.join(WATCH_FOLDER, folderName);
        console.log('[gallery.debug] folderPath computed:', folderPath);

        if (fs.existsSync(folderPath)) {
          console.log('[gallery.debug] folder exists:', folderPath);
        const files = fs.readdirSync(folderPath)
          .filter(f => /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|webm)$/i.test(f) && !f.startsWith('_'))
          .sort();

        // Ensure gallery thumbnails folder exists
        const galleryFolder = path.join(__dirname, '..', 'public', 'gallery', sessionId);
        if (!fs.existsSync(galleryFolder)) fs.mkdirSync(galleryFolder, { recursive: true });

        const photosFromFs = [];
        for (let i = 0; i < files.length; i++) {
          const photoFile = files[i];
          if (!photoFile) {
            console.warn('[gallery] skipping undefined filename at index', i, 'for session', sessionId);
            continue;
          }
          const photoPath = path.join(folderPath, photoFile);
          const photoNumber = i + 1;

          // Generate thumbnail if missing or outdated
          const thumbnailPath = path.join(galleryFolder, `photo_${photoNumber}.jpg`);
          const ext = path.extname(photoFile).toLowerCase();
          const isVideo = ['.mp4', '.mov', '.avi', '.webm'].includes(ext);
          const isGif = ext === '.gif';
          
          try {
            let regenerate = false;
            if (!fs.existsSync(thumbnailPath)) regenerate = true;
            else {
              const thumbStat = fs.statSync(thumbnailPath);
              const origStat = fs.statSync(photoPath);
              if (origStat.mtimeMs > thumbStat.mtimeMs) regenerate = true;
            }

            if (regenerate) {
              if (isVideo) {
                // Create video placeholder thumbnail
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
              } else if (isGif) {
                // For GIF, create thumbnail from first frame (preserve aspect ratio)
                await sharp(photoPath, { animated: false })
                  .resize(1920, 1080, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 1 } })
                  .jpeg({ quality: 90, progressive: true })
                  .toFile(thumbnailPath);
              } else {
                // Regular image processing (preserve aspect ratio)
                await sharp(photoPath)
                  .resize(1920, 1080, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 1 } })
                  .jpeg({ quality: 90, progressive: true })
                  .toFile(thumbnailPath);
              }
            }
          } catch (err) {
            console.error('Error generating thumbnail for', photoPath, err.message);
          }

          let createdAt = null;
          try {
            const st = fs.statSync(photoPath);
            createdAt = st && st.mtime ? st.mtime.toISOString() : null;
          } catch (stErr) {
            console.warn('Could not stat file for createdAt, skipping timestamp:', photoPath, stErr.message);
          }
          
          photosFromFs.push({
            id: null,
            photoNumber,
            sourceFile: photoFile,
            thumbnailUrl: `/gallery/${sessionId}/photo_${photoNumber}.jpg`,
            originalUrl: `/api/photo/original/${sessionId}/${photoNumber}`,
            createdAt,
            mediaType: isVideo ? 'video' : (isGif ? 'gif' : 'image'),
            fileExtension: ext
          });
        }

        // Optionally update DB asynchronously to mirror filesystem
        setImmediate(() => {
          try {
            const insert = db.prepare('INSERT OR REPLACE INTO photos (session_uuid, photo_number, original_path, processed_path, upload_timestamp) VALUES (?, ?, ?, ?, ?)');
            const del = db.prepare('DELETE FROM photos WHERE session_uuid = ?');
            db.transaction((list) => {
              del.run(sessionId);
              for (let i = 0; i < list.length; i++) {
                const p = list[i];
                const src = p.sourceFile || p.original_path || null;
                const origPath = src ? path.join(WATCH_FOLDER, folderName, src) : '';
                insert.run(sessionId, p.photoNumber, origPath, path.join(galleryFolder, `photo_${p.photoNumber}.jpg`), new Date().toISOString());
              }
            })(photosFromFs);
          } catch (e) {
            console.error('Failed to sync photos to DB for', sessionId, e.message);
          }
        });

        return res.json(photosFromFs);
      }
    }

      // Fallback: serve from DB
      console.log('[gallery.debug] Using database fallback for photos');
      const photos = db.prepare(`
        SELECT id, photo_number, processed_path, original_path, upload_timestamp FROM photos WHERE session_uuid = ? ORDER BY photo_number ASC
      `).all(sessionId);

      const photosWithUrls = photos.map(photo => {
        // Detect media type from original_path
        const ext = photo.original_path ? path.extname(photo.original_path).toLowerCase() : '.jpg';
        const isVideo = ['.mp4', '.mov', '.avi', '.webm'].includes(ext);
        const isGif = ext === '.gif';
        
        return {
          id: photo.id,
          photoNumber: photo.photo_number,
          thumbnailUrl: `/gallery/${sessionId}/photo_${photo.photo_number}.jpg`,
          originalUrl: `/api/photo/original/${sessionId}/${photo.photo_number}`,
          createdAt: photo.upload_timestamp,
          mediaType: isVideo ? 'video' : (isGif ? 'gif' : 'image'),
          fileExtension: ext
        };
      });

      res.json(photosWithUrls);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};

