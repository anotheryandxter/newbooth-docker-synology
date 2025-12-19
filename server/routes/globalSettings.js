const express = require('express');
const fs = require('fs');
const path = require('path');

module.exports = function(db, reloadWatcher) {
  const router = express.Router();

  // Get global settings
  router.get('/', (req, res) => {
    try {
      const settings = db.prepare(`
        SELECT 
          gs.*,
          gl.name as grid_layout_name,
          gl.grid_rows,
          gl.grid_cols,
          gl.photo_ratio,
          oa.name as overlay_name,
          oa.type as overlay_type
        FROM global_settings gs
        LEFT JOIN grid_layouts gl ON gs.default_grid_layout_id = gl.id
        LEFT JOIN overlay_assets oa ON gs.default_overlay_id = oa.id
        WHERE gs.id = 1
      `).get();

      res.json({
        success: true,
        data: settings || {
          id: 1,
          default_grid_layout_id: 1,
          default_overlay_id: null,
          auto_apply_to_existing: 1,
          watch_folder_path: null
        }
      });
    } catch (error) {
      console.error('❌ Error getting global settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update global settings
  router.put('/', async (req, res) => {
    try {
      const { watch_folder_path } = req.body;
      
      // Validate path exists (optional - can be relaxed for container paths)
      let pathMessage = '';
      
      if (watch_folder_path !== undefined) {
        if (watch_folder_path && !path.isAbsolute(watch_folder_path)) {
          return res.status(400).json({ 
            error: 'Watch folder path must be absolute path' 
          });
        }
        
        // Check if path exists (warning only, not blocking)
        if (watch_folder_path && !fs.existsSync(watch_folder_path)) {
          pathMessage = 'Warning: Path does not exist yet. Will be created when watcher starts.';
          console.warn('⚠️  Watch folder path does not exist:', watch_folder_path);
        }
        
        // Update database
        db.prepare(`
          UPDATE global_settings 
          SET watch_folder_path = ?
          WHERE id = 1
        `).run(watch_folder_path || null);
        
        console.log('📁 Watch folder path updated:', watch_folder_path || '(cleared)');
        
        // Reload watcher with new path
        if (watch_folder_path && reloadWatcher) {
          try {
            const reloaded = reloadWatcher(watch_folder_path);
            if (!reloaded) {
              pathMessage += ' Failed to reload watcher.';
            } else {
              pathMessage = pathMessage || 'Watch folder updated and rescanning...';
            }
          } catch (e) {
            console.error('Error reloading watcher:', e);
            pathMessage += ' Error reloading watcher.';
          }
        }
      }

      // Get updated settings
      const settings = db.prepare(`
        SELECT * FROM global_settings WHERE id = 1
      `).get();

      res.json({ 
        success: true,
        message: pathMessage || 'Settings updated successfully',
        data: settings
      });
    } catch (error) {
      console.error('❌ Error updating global settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
