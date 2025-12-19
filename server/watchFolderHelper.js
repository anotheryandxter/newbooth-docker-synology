/**
 * Helper module to get watch folder path from database settings
 * Ensures consistency across all parts of the application
 */

const path = require('path');

/**
 * Get watch folder path from database settings or environment variable
 * Priority: 1. Database settings, 2. Environment variable, 3. Default path
 * 
 * @param {object} db - Database instance
 * @returns {string} Watch folder path
 */
function getWatchFolder(db) {
  try {
    // Try to get from database settings first
    const settings = db.prepare('SELECT watch_folder_path FROM global_settings WHERE id = 1').get();
    if (settings && settings.watch_folder_path) {
      return settings.watch_folder_path;
    }
  } catch (e) {
    // Table might not exist yet, or database not initialized
    // Fall through to environment variable or default
  }

  // Fall back to environment variable or default
  return process.env.LUMA_PHOTOS_FOLDER || path.join(__dirname, '../test-photos');
}

module.exports = { getWatchFolder };
