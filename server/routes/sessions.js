const express = require('express');
const fs = require('fs');
const path = require('path');

module.exports = function(db) {
  const router = express.Router();

  // Get all active sessions
  // Only show sessions that have at least 2 photos (exclude single-file and empty sessions)
  router.get('/active', (req, res) => {
    try {
      const MIN_PHOTOS = 2; // Minimum photos required for valid session
      
      const sessions = db.prepare(`
        SELECT 
          s.session_uuid,
          s.folder_name,
          s.layout_used,
          s.created_at,
          s.status,
          s.is_public,
          COUNT(p.id) as photo_count
        FROM sessions s
        LEFT JOIN photos p ON s.session_uuid = p.session_uuid
        WHERE s.status IN ('active', 'completed')
        GROUP BY s.session_uuid
        HAVING COUNT(p.id) >= ?
        ORDER BY s.created_at DESC
        LIMIT 100
      `).all(MIN_PHOTOS);

      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get session details
  router.get('/:sessionId', (req, res) => {
    try {
      const { sessionId } = req.params;

      const session = db.prepare(`
        SELECT * FROM sessions WHERE session_uuid = ?
      `).get(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const photos = db.prepare(`
        SELECT * FROM photos WHERE session_uuid = ? ORDER BY photo_number ASC
      `).all(sessionId);

      // Add mediaType and fileExtension from original_path if not present
      const photosWithMedia = photos.map(photo => {
        if (!photo.mediaType && photo.original_path) {
          const ext = path.extname(photo.original_path).toLowerCase();
          const isVideo = ['.mp4', '.mov', '.avi', '.webm'].includes(ext);
          const isGif = ext === '.gif';
          photo.mediaType = isVideo ? 'video' : (isGif ? 'gif' : 'image');
          photo.fileExtension = ext;
        }
        return photo;
      });

      res.json({ session, photos: photosWithMedia });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // NEW: Trigger media scan for a session
  router.post('/:sessionId/scan-media', async (req, res) => {
    try {
      const { sessionId } = req.params;

      const session = db.prepare('SELECT * FROM sessions WHERE session_uuid = ?').get(sessionId);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Get folder path
      const { getWatchFolder } = require('../watchFolderHelper');
      const WATCH_FOLDER = getWatchFolder(db);
      const folderPath = path.join(WATCH_FOLDER, session.folder_name);

      if (!fs.existsSync(folderPath)) {
        return res.status(404).json({ error: 'Session folder not found on disk' });
      }

      // Scan media files
      const SUPPORTED_MEDIA_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.avi', '.webm'];
      const photoFiles = fs.readdirSync(folderPath)
        .filter(f => {
          const ext = path.extname(f).toLowerCase();
          return SUPPORTED_MEDIA_TYPES.includes(ext) && !f.startsWith('_');
        })
        .sort();

      console.log(`🔍 Manual media scan requested for: ${session.folder_name} (${photoFiles.length} files)`);

      // Import and execute scan function
      const { scanAndProcessSession } = require('../watcher');
      await scanAndProcessSession(session.folder_name, folderPath, photoFiles, db);
      
      // Get updated photo count
      const updatedPhotos = db.prepare(
        'SELECT COUNT(*) as count FROM photos WHERE session_uuid = ?'
      ).get(sessionId);

      res.json({
        success: true,
        session_id: sessionId,
        folder_name: session.folder_name,
        files_found: photoFiles.length,
        photos_in_db: updatedPhotos.count,
        message: 'Media scan completed successfully. Thumbnails regenerated.'
      });

    } catch (error) {
      console.error('❌ Error scanning media:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update layout (DISABLED - layout engine inactive)
  router.put('/:sessionId/layout', async (req, res) => {
    try {
      const { sessionId } = req.params;

      console.log(`⚠️  Layout update requested for ${sessionId} but layout engine is disabled`);

      res.json({ 
        success: true, 
        message: 'Layout engine is disabled. Only individual photos are displayed.',
        sessionId 
      });
    } catch (error) {
      console.error('❌ Error in layout endpoint:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Toggle session visibility (public/private)
  router.patch('/:sessionId/visibility', (req, res) => {
    try {
      const { sessionId } = req.params;
      const { is_public } = req.body;

      if (is_public !== 0 && is_public !== 1) {
        return res.status(400).json({ error: 'is_public must be 0 or 1' });
      }

      const result = db.prepare(`
        UPDATE sessions SET is_public = ? WHERE session_uuid = ?
      `).run(is_public, sessionId);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Session not found' });
      }

      console.log(`🔒 Session ${sessionId.substring(0, 8)}... visibility: ${is_public ? 'PUBLIC' : 'PRIVATE'}`);

      res.json({ 
        success: true, 
        is_public,
        message: `Session is now ${is_public ? 'public' : 'private'}`
      });
    } catch (error) {
      console.error('❌ Error updating visibility:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Regenerate gallery HTML
  router.post('/:sessionId/regenerate', async (req, res) => {
    try {
      const { sessionId } = req.params;

      const session = db.prepare(`
        SELECT * FROM sessions WHERE session_uuid = ?
      `).get(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const galleryPath = path.join(__dirname, '../../public/gallery', sessionId);
      
      if (!fs.existsSync(galleryPath)) {
        return res.status(404).json({ error: 'Gallery folder not found' });
      }

      // Regenerate HTML
      const { generateGalleryHTML } = require('../watcher');
      await generateGalleryHTML(sessionId, galleryPath, db);

      console.log(`🔄 Gallery HTML regenerated for: ${sessionId.substring(0, 8)}...`);

      res.json({ 
        success: true, 
        message: 'Gallery HTML regenerated successfully'
      });
    } catch (error) {
      console.error('❌ Error regenerating gallery:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete session
  router.delete('/:sessionId', (req, res) => {
    try {
      const { sessionId } = req.params;

      // Get session info to find original folder
      const session = db.prepare(`
        SELECT folder_name FROM sessions WHERE session_uuid = ?
      `).get(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Delete gallery folder
      const galleryPath = path.join(__dirname, '../../public/gallery', sessionId);
      if (fs.existsSync(galleryPath)) {
        fs.rmSync(galleryPath, { recursive: true, force: true });
        console.log(`🗑️  Deleted gallery: ${galleryPath}`);
      }

      // Get watch folder from database settings or env
      const { getWatchFolder } = require('../watchFolderHelper');
      const WATCH_FOLDER = getWatchFolder(db);
      // Delete original photos folder (DSLRBooth folder)
      const originalFolderPath = path.join(WATCH_FOLDER, session.folder_name);
      
      console.log(`🔍 Checking original folder: ${originalFolderPath}`);
      
      if (fs.existsSync(originalFolderPath)) {
        try {
          fs.rmSync(originalFolderPath, { recursive: true, force: true });
          console.log(`🗑️  Deleted original photos folder: ${originalFolderPath}`);
        } catch (deleteError) {
          console.error(`❌ Failed to delete original folder: ${deleteError.message}`);
        }
      } else {
        console.log(`⚠️  Original folder not found: ${originalFolderPath}`);
      }

      // Update database
      db.prepare(`
        UPDATE sessions SET status = 'deleted', deleted_at = ? WHERE session_uuid = ?
      `).run(new Date().toISOString(), sessionId);

      console.log(`✅ Session deleted: ${sessionId.substring(0, 8)}...`);

      res.json({ 
        success: true, 
        message: 'Session and all photos deleted successfully',
        galleryDeleted: !fs.existsSync(galleryPath),
        originalDeleted: !fs.existsSync(originalFolderPath),
        originalPath: originalFolderPath
      });
    } catch (error) {
      console.error('❌ Error deleting session:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
