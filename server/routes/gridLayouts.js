const express = require('express');

module.exports = function(db) {
  const router = express.Router();

  // Get all grid layouts
  router.get('/', (req, res) => {
    try {
      const layouts = db.prepare(`
        SELECT * FROM grid_layouts 
        ORDER BY is_preset DESC, grid_rows, grid_cols
      `).all();

      res.json(layouts);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get layout by ID
  router.get('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const layout = db.prepare('SELECT * FROM grid_layouts WHERE id = ?').get(id);

      if (!layout) {
        return res.status(404).json({ error: 'Layout not found' });
      }

      res.json(layout);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create custom grid layout
  router.post('/', (req, res) => {
    try {
      const { 
        name, 
        description, 
        grid_rows, 
        grid_cols, 
        canvas_width, 
        canvas_height, 
        photo_ratio,
        spacing,
        padding,
        background_color
      } = req.body;

      if (!name || !grid_rows || !grid_cols) {
        return res.status(400).json({ error: 'Name, grid_rows, and grid_cols are required' });
      }

      const result = db.prepare(`
        INSERT INTO grid_layouts (
          name, description, grid_rows, grid_cols, 
          canvas_width, canvas_height, photo_ratio, 
          spacing, padding, background_color, is_preset
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        name,
        description || '',
        parseInt(grid_rows),
        parseInt(grid_cols),
        parseInt(canvas_width) || 1800,
        parseInt(canvas_height) || 1200,
        photo_ratio || '4:6',
        parseInt(spacing) || 20,
        parseInt(padding) || 40,
        background_color || '#FFFFFF'
      );

      const layout = db.prepare('SELECT * FROM grid_layouts WHERE id = ?').get(result.lastInsertRowid);

      console.log(`✅ Custom grid layout created: ${name} (${grid_rows}x${grid_cols})`);

      res.json({ success: true, layout });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update grid layout
  router.put('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { 
        name, 
        description, 
        canvas_width, 
        canvas_height, 
        spacing,
        padding,
        background_color
      } = req.body;

      const layout = db.prepare('SELECT * FROM grid_layouts WHERE id = ?').get(id);

      if (!layout) {
        return res.status(404).json({ error: 'Layout not found' });
      }

      if (layout.is_preset) {
        return res.status(400).json({ error: 'Cannot modify preset layouts' });
      }

      db.prepare(`
        UPDATE grid_layouts 
        SET name = ?, description = ?, canvas_width = ?, canvas_height = ?, 
            spacing = ?, padding = ?, background_color = ?
        WHERE id = ?
      `).run(
        name || layout.name,
        description !== undefined ? description : layout.description,
        canvas_width !== undefined ? parseInt(canvas_width) : layout.canvas_width,
        canvas_height !== undefined ? parseInt(canvas_height) : layout.canvas_height,
        spacing !== undefined ? parseInt(spacing) : layout.spacing,
        padding !== undefined ? parseInt(padding) : layout.padding,
        background_color || layout.background_color,
        id
      );

      const updated = db.prepare('SELECT * FROM grid_layouts WHERE id = ?').get(id);

      console.log(`🔄 Grid layout updated: ${updated.name}`);

      res.json({ success: true, layout: updated });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete custom grid layout
  router.delete('/:id', (req, res) => {
    try {
      const { id } = req.params;

      const layout = db.prepare('SELECT * FROM grid_layouts WHERE id = ?').get(id);

      if (!layout) {
        return res.status(404).json({ error: 'Layout not found' });
      }

      if (layout.is_preset) {
        return res.status(400).json({ error: 'Cannot delete preset layouts' });
      }

      db.prepare('DELETE FROM grid_layouts WHERE id = ?').run(id);

      console.log(`🗑️  Grid layout deleted: ${layout.name}`);

      res.json({ success: true, message: 'Layout deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
