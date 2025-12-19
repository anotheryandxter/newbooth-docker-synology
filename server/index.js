// server/index.js - Main Server Entry Point
const express = require('express');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const cors = require('cors');
const compression = require('compression');

// Load environment variables
dotenv.config();

// Import modules
const { initializeWatcher, reloadWatcher } = require('./watcher');
const { initializeCleanup } = require('./cleanup');
const { getDatabase } = require('./database');
const { requireAdminAuth, handleLogin, handleLogout, handleVerify } = require('./auth');
const sessionRoutes = require('./routes/sessions');
const photoRoutes = require('./routes/photos');
const galleryRoutes = require('./routes/gallery');
const overlayRoutes = require('./routes/overlays');
const gridLayoutRoutes = require('./routes/gridLayouts');
const globalSettingsRoutes = require('./routes/globalSettings');
const userRoutes = require('./routes/users');
const filesystemRoutes = require('./routes/filesystem');
const brandingRoutes = require('./routes/branding');

// Constants
const PORT = process.env.PORT || 3000;
const LOCAL_IP = process.env.LOCAL_IP || 'localhost';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize Express app
const app = express();

// Trust proxy
app.set('trust proxy', 1);

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Initialize database
let db;
try {
  db = getDatabase();
  console.log('✅ Database initialized');
} catch (error) {
  console.error('❌ Database initialization failed:', error);
  process.exit(1);
}

// Auth Routes
app.post('/api/auth/login', handleLogin(db));
app.post('/api/auth/logout', handleLogout);
app.get('/api/auth/verify', handleVerify);

// API Routes (protected for admin)
app.use('/api/sessions', requireAdminAuth, sessionRoutes(db));
app.use('/api/photos', requireAdminAuth, photoRoutes(db));
app.use('/api/overlays', requireAdminAuth, overlayRoutes(db));
app.use('/api/grid-layouts', requireAdminAuth, gridLayoutRoutes(db));
app.use('/api/global-settings', requireAdminAuth, globalSettingsRoutes(db, reloadWatcher));
app.use('/api/users', requireAdminAuth, userRoutes(db));
app.use('/api/filesystem', requireAdminAuth, filesystemRoutes());
app.use('/api/gallery', galleryRoutes(db)); // Gallery is public

// Branding routes
// GET /settings is public, all other routes require admin auth
app.use('/api/branding', (req, res, next) => {
  if (req.method === 'GET' && req.path === '/settings') {
    // Public endpoint
    next();
  } else {
    // Requires admin auth
    requireAdminAuth(req, res, next);
  }
}, brandingRoutes(db));

// Health check endpoint
app.get('/api/health', (req, res) => {
  try {
    // Get all sessions count (not deleted)
    const sessionStats = db.prepare(`
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_sessions
      FROM sessions
      WHERE status != 'deleted'
    `).get();

    // Get photo count
    const photoStats = db.prepare(`
      SELECT 
        COUNT(*) as total_photos
      FROM photos p
      INNER JOIN sessions s ON p.session_id = s.id
      WHERE s.status != 'deleted'
    `).get();

    // Get storage usage
    const storageStats = db.prepare(`
      SELECT 
        SUM(COALESCE(file_size, 0)) as storage_used
      FROM photos p
      INNER JOIN sessions s ON p.session_id = s.id
      WHERE s.status != 'deleted' AND p.file_size IS NOT NULL
    `).get();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      stats: {
        total_sessions: sessionStats.total_sessions || 0,
        active_sessions: sessionStats.active_sessions || 0,
        total_photos: photoStats.total_photos || 0,
        storage_used: storageStats.storage_used || 0
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Gallery viewer route
app.get('/gallery/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const galleryPath = path.join(__dirname, '../public/gallery', sessionId, 'index.html');
  
  // Check if gallery exists
  if (!require('fs').existsSync(galleryPath)) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Gallery Not Found</title>
        <link rel="icon" href="/favicon.png">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            color: white;
            text-align: center;
            padding: 20px;
          }
          .container {
            max-width: 500px;
          }
          h1 { font-size: 3em; margin: 0; }
          p { font-size: 1.2em; opacity: 0.9; }
          a {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 24px;
            background: white;
            color: #1a1a1a;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📸</h1>
          <h2>Gallery Not Found</h2>
          <p>Gallery belum tersedia atau sedang diproses.</p>
          <a href="/">← Kembali ke Home</a>
        </div>
      </body>
      </html>
    `);
  }
  
  // Serve gallery page as-is. Viewing the gallery does not require auth.
  
  res.sendFile(galleryPath);
});

// Admin dashboard route
app.get('/admin', (req, res) => {
  const adminPath = path.join(__dirname, '../public/admin.html');
  try {
    res.sendFile(adminPath);
  } catch (error) {
    res.status(404).json({ error: 'Admin panel not found' });
  }
});

// Download original photo endpoint
app.get('/api/photo/original/:sessionId/:photoNumber', (req, res) => {
  const { sessionId, photoNumber } = req.params;
  
  try {
    // Check session visibility and access
    const session = db.prepare('SELECT is_public, access_token FROM sessions WHERE session_uuid = ?').get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Serving original photos does not require auth for gallery use
    
    // Get photo from database
    const photo = db.prepare('SELECT original_path FROM photos WHERE session_uuid = ? AND photo_number = ?').get(sessionId, photoNumber);
    
    if (!photo || !photo.original_path) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    // Check if file exists
    if (!fs.existsSync(photo.original_path)) {
      return res.status(404).json({ error: 'Photo file not found on disk' });
    }
    
    // Log the request
    console.log(`📸 Serving original photo: Session ${sessionId}, Photo ${photoNumber}`);
    console.log(`   Path: ${photo.original_path}`);

    // Set proper headers for image display and download
    const fileName = path.basename(photo.original_path);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    
    // Send the original file
    res.sendFile(photo.original_path);
  } catch (error) {
    console.error('Error serving original photo:', error);
    res.status(500).json({ error: 'Failed to serve photo' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

// Error handler middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize background services
async function initializeServices() {
  try {
    // Initialize file watcher
    initializeWatcher(db);
    console.log('✅ File watcher initialized');

    // Initialize cleanup scheduler
    initializeCleanup(db);
    console.log('✅ Cleanup scheduler initialized\n');
  } catch (error) {
    console.error('❌ Service initialization failed:', error);
    process.exit(1);
  }
}

// Start server
async function start() {
  try {
    await initializeServices();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║        🎉 PHOTOBOOTH SERVER - PRODUCTION READY            ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝

📍 SERVER INFORMATION:
   Environment: ${NODE_ENV.toUpperCase()}
   Local Access: http://${LOCAL_IP}:${PORT}
   Admin Panel:  http://${LOCAL_IP}:${PORT}/admin
   Gallery:      http://${LOCAL_IP}:${PORT}/gallery/{sessionId}
   Health:       http://${LOCAL_IP}:${PORT}/api/health

📸 DSLRBooth MONITORING:
   Watch Folder: ${process.env.LUMA_PHOTOS_FOLDER || 'Not configured'}
   Auto-Cleanup: After ${process.env.CLEANUP_DAYS || 7} days

🚀 Ready for photobooth sessions!
   Time: ${new Date().toLocaleString('id-ID')}

      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  if (db) {
    db.close();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down...');
  if (db) {
    db.close();
  }
  process.exit(0);
});

// Start the server
start();
