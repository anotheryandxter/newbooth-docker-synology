const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

module.exports = function(db) {
  const router = express.Router();

  // Setup multer for file uploads
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadDir = path.join(__dirname, '../../public/assets/overlays');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
      const allowedTypes = /jpeg|jpg|png|gif|svg/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);
      
      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error('Only image files are allowed!'));
      }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
  });

  // Get all overlay assets
  router.get('/', (req, res) => {
    try {
      const overlays = db.prepare(`
        SELECT * FROM overlay_assets 
        ORDER BY type, created_at DESC
      `).all();

      res.json(overlays);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get overlay by ID
  router.get('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const overlay = db.prepare('SELECT * FROM overlay_assets WHERE id = ?').get(id);

      if (!overlay) {
        return res.status(404).json({ error: 'Overlay not found' });
      }

      res.json(overlay);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Upload new overlay asset
  router.post('/', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { name, type, position, opacity, scale, offset_x, offset_y } = req.body;

      if (!name || !type) {
        // Delete uploaded file if validation fails
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Name and type are required' });
      }

      const validTypes = ['logo', 'watermark', 'frame'];
      if (!validTypes.includes(type)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Invalid type. Must be logo, watermark, or frame' });
      }

      const relativePath = `/assets/overlays/${req.file.filename}`;

      const result = db.prepare(`
        INSERT INTO overlay_assets (name, type, file_path, position, opacity, scale, offset_x, offset_y)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        name,
        type,
        relativePath,
        position || 'bottom-right',
        parseFloat(opacity) || 1.0,
        parseFloat(scale) || 1.0,
        parseInt(offset_x) || 0,
        parseInt(offset_y) || 0
      );

      const overlay = db.prepare('SELECT * FROM overlay_assets WHERE id = ?').get(result.lastInsertRowid);

      console.log(`✅ Overlay uploaded: ${name} (${type})`);

      res.json({ success: true, overlay });
    } catch (error) {
      // Clean up file on error
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {}
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Update overlay asset
  router.put('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { name, position, opacity, scale, offset_x, offset_y, is_active } = req.body;

      const overlay = db.prepare('SELECT * FROM overlay_assets WHERE id = ?').get(id);

      if (!overlay) {
        return res.status(404).json({ error: 'Overlay not found' });
      }

      db.prepare(`
        UPDATE overlay_assets 
        SET name = ?, position = ?, opacity = ?, scale = ?, offset_x = ?, offset_y = ?, is_active = ?
        WHERE id = ?
      `).run(
        name || overlay.name,
        position || overlay.position,
        opacity !== undefined ? parseFloat(opacity) : overlay.opacity,
        scale !== undefined ? parseFloat(scale) : overlay.scale,
        offset_x !== undefined ? parseInt(offset_x) : overlay.offset_x,
        offset_y !== undefined ? parseInt(offset_y) : overlay.offset_y,
        is_active !== undefined ? parseInt(is_active) : overlay.is_active,
        id
      );

      const updated = db.prepare('SELECT * FROM overlay_assets WHERE id = ?').get(id);

      console.log(`🔄 Overlay updated: ${updated.name}`);

      res.json({ success: true, overlay: updated });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete overlay asset
  router.delete('/:id', (req, res) => {
    try {
      const { id } = req.params;

      const overlay = db.prepare('SELECT * FROM overlay_assets WHERE id = ?').get(id);

      if (!overlay) {
        return res.status(404).json({ error: 'Overlay not found' });
      }

      // Delete file
      const filePath = path.join(__dirname, '../../public', overlay.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Delete from database
      db.prepare('DELETE FROM overlay_assets WHERE id = ?').run(id);

      console.log(`🗑️  Overlay deleted: ${overlay.name}`);

      res.json({ success: true, message: 'Overlay deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
