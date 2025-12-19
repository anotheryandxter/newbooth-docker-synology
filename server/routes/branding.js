const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

module.exports = function(db) {
  const router = express.Router();

  // Configure multer for file uploads
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadDir = path.join(__dirname, '../../public/assets/branding');
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
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
      const allowedTypes = /jpeg|jpg|png|gif|svg/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);
      
      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error('Only image files are allowed!'));
      }
    }
  });

  // Get branding settings
  router.get('/settings', (req, res) => {
    try {
      const settings = db.prepare(`
        SELECT website_name, logo_path, hero_image_path, hero_opacity, hero_blur_intensity, footer_text
        FROM global_settings
        WHERE id = 1
      `).get();

      res.json({
        website_name: settings?.website_name || 'Photo Gallery',
        logo_path: settings?.logo_path || null,
        hero_image_path: settings?.hero_image_path || null,
        hero_opacity: settings?.hero_opacity ?? 0.5,
        hero_blur_intensity: settings?.hero_blur_intensity ?? 10,
        footer_text: settings?.footer_text || 'Powered by PhotoBooth'
      });
    } catch (error) {
      console.error('Error fetching branding settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update website name
  router.post('/settings/website-name', (req, res) => {
    try {
      const { website_name } = req.body;

      if (!website_name || website_name.trim().length === 0) {
        return res.status(400).json({ error: 'Website name is required' });
      }

      if (website_name.length > 100) {
        return res.status(400).json({ error: 'Website name is too long (max 100 characters)' });
      }

      db.prepare(`
        UPDATE global_settings
        SET website_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(website_name.trim());

      res.json({ 
        success: true, 
        website_name: website_name.trim() 
      });
    } catch (error) {
      console.error('Error updating website name:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Upload logo
  router.post('/upload/logo', upload.single('logo'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Delete old logo if exists
      const oldSettings = db.prepare('SELECT logo_path FROM global_settings WHERE id = 1').get();
      if (oldSettings?.logo_path) {
        const oldLogoPath = path.join(__dirname, '../../public', oldSettings.logo_path);
        if (fs.existsSync(oldLogoPath)) {
          fs.unlinkSync(oldLogoPath);
        }
      }

      // Save new logo path
      const logoPath = `/assets/branding/${req.file.filename}`;
      db.prepare(`
        UPDATE global_settings
        SET logo_path = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(logoPath);

      res.json({ 
        success: true, 
        logo_path: logoPath 
      });
    } catch (error) {
      console.error('Error uploading logo:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Upload hero image
  router.post('/upload/hero', upload.single('hero'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Delete old hero image if exists
      const oldSettings = db.prepare('SELECT hero_image_path FROM global_settings WHERE id = 1').get();
      if (oldSettings?.hero_image_path) {
        const oldHeroPath = path.join(__dirname, '../../public', oldSettings.hero_image_path);
        if (fs.existsSync(oldHeroPath)) {
          fs.unlinkSync(oldHeroPath);
        }
      }

      // Save new hero image path
      const heroPath = `/assets/branding/${req.file.filename}`;
      db.prepare(`
        UPDATE global_settings
        SET hero_image_path = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(heroPath);

      res.json({ 
        success: true, 
        hero_image_path: heroPath 
      });
    } catch (error) {
      console.error('Error uploading hero image:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete logo
  router.delete('/logo', (req, res) => {
    try {
      const settings = db.prepare('SELECT logo_path FROM global_settings WHERE id = 1').get();
      
      if (settings?.logo_path) {
        const logoPath = path.join(__dirname, '../../public', settings.logo_path);
        if (fs.existsSync(logoPath)) {
          fs.unlinkSync(logoPath);
        }
      }

      db.prepare(`
        UPDATE global_settings
        SET logo_path = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run();

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting logo:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete hero image
  router.delete('/hero', (req, res) => {
    try {
      const settings = db.prepare('SELECT hero_image_path FROM global_settings WHERE id = 1').get();
      
      if (settings?.hero_image_path) {
        const heroPath = path.join(__dirname, '../../public', settings.hero_image_path);
        if (fs.existsSync(heroPath)) {
          fs.unlinkSync(heroPath);
        }
      }

      db.prepare(`
        UPDATE global_settings
        SET hero_image_path = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run();

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting hero image:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update hero opacity and blur
  router.post('/settings/hero-effects', (req, res) => {
    try {
      const { opacity, blur_intensity } = req.body;

      // Validate opacity (0.0 - 1.0)
      if (opacity !== undefined) {
        const opacityVal = parseFloat(opacity);
        if (isNaN(opacityVal) || opacityVal < 0 || opacityVal > 1) {
          return res.status(400).json({ error: 'Opacity must be between 0 and 1' });
        }
      }

      // Validate blur intensity (0 - 50)
      if (blur_intensity !== undefined) {
        const blurVal = parseInt(blur_intensity);
        if (isNaN(blurVal) || blurVal < 0 || blurVal > 50) {
          return res.status(400).json({ error: 'Blur intensity must be between 0 and 50' });
        }
      }

      // Build update query dynamically
      const updates = [];
      const params = [];

      if (opacity !== undefined) {
        updates.push('hero_opacity = ?');
        params.push(parseFloat(opacity));
      }

      if (blur_intensity !== undefined) {
        updates.push('hero_blur_intensity = ?');
        params.push(parseInt(blur_intensity));
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid parameters provided' });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(1); // WHERE id = 1

      db.prepare(`
        UPDATE global_settings
        SET ${updates.join(', ')}
        WHERE id = ?
      `).run(...params);

      res.json({ 
        success: true,
        opacity: opacity !== undefined ? parseFloat(opacity) : undefined,
        blur_intensity: blur_intensity !== undefined ? parseInt(blur_intensity) : undefined
      });
    } catch (error) {
      console.error('Error updating hero effects:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update footer text
  router.post('/settings/footer-text', (req, res) => {
    try {
      const { footer_text } = req.body;

      if (footer_text !== undefined && footer_text !== null && footer_text.length > 200) {
        return res.status(400).json({ error: 'Footer text is too long (max 200 characters)' });
      }

      db.prepare(`
        UPDATE global_settings
        SET footer_text = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(footer_text || 'Powered by PhotoBooth');

      res.json({ 
        success: true,
        footer_text: footer_text || 'Powered by PhotoBooth'
      });
    } catch (error) {
      console.error('Error updating footer text:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
