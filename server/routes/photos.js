const express = require('express');

module.exports = function(db) {
  const router = express.Router();

  // Get photos for a session
  router.get('/session/:sessionId', (req, res) => {
    try {
      const { sessionId } = req.params;

      const photos = db.prepare(`
        SELECT * FROM photos WHERE session_uuid = ? ORDER BY photo_number ASC
      `).all(sessionId);

      res.json(photos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
