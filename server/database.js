const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../database/photobooth.db');

// Ensure database folder exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

let db;

function getDatabase() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema();
  }
  return db;
}

function initializeSchema() {
  // Sessions table
  // Note: session_uuid = folder_name (no more random UUIDs)
  // This makes URLs predictable and debugging easier
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_uuid TEXT UNIQUE NOT NULL,
      folder_name TEXT NOT NULL,
      layout_used TEXT DEFAULT 'grid2x2',
      grid_config TEXT,
      overlay_id INTEGER,
      final_image_path TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'deleted')),
      is_public INTEGER DEFAULT 0 CHECK(is_public IN (0, 1)),
      access_token TEXT
    );
  `);
  
  // Add is_public column if it doesn't exist (migration)
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN is_public INTEGER DEFAULT 0 CHECK(is_public IN (0, 1));`);
  } catch (e) {
    // Column already exists, ignore error
  }
  
  // Add access_token column if it doesn't exist (migration)
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN access_token TEXT;`);
  } catch (e) {
    // Column already exists, ignore error
  }

  // Add updated_at column if it doesn't exist (migration)
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
  } catch (e) {
    // Column already exists, ignore error
  }
  
  // Update existing sessions with NULL access_token to have one
  try {
    const crypto = require('crypto');
    const sessionsWithoutToken = db.prepare('SELECT session_uuid FROM sessions WHERE access_token IS NULL').all();
    const updateStmt = db.prepare('UPDATE sessions SET access_token = ? WHERE session_uuid = ?');
    
    for (const session of sessionsWithoutToken) {
      const token = crypto.randomBytes(16).toString('hex');
      updateStmt.run(token, session.session_uuid);
    }
  } catch (e) {
    // Ignore errors
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  `);

  // Photos table
  db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_uuid TEXT NOT NULL,
      photo_number INTEGER NOT NULL,
      original_path TEXT NOT NULL,
      processed_path TEXT NOT NULL,
      upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_uuid) REFERENCES sessions(session_uuid) ON DELETE CASCADE,
      UNIQUE(session_uuid, photo_number)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_photos_session ON photos(session_uuid);
  `);

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'admin' CHECK(role IN ('admin', 'viewer')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP,
      is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1))
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `);

  // Create default admin user if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const bcrypt = require('bcrypt');
    const defaultUsername = process.env.ADMIN_USERNAME || 'admin';
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const passwordHash = bcrypt.hashSync(defaultPassword, 10);
    
    db.prepare(`
      INSERT INTO users (username, password_hash, email, role)
      VALUES (?, ?, ?, ?)
    `).run(defaultUsername, passwordHash, 'admin@photobooth.local', 'admin');
    
    console.log('👤 Default admin user created:');
    console.log('   Username: ' + defaultUsername);
    console.log('   Password: ' + defaultPassword);
  } else {
    // Update existing 'admin' user with credentials from .env if they differ
    const bcrypt = require('bcrypt');
    const envUsername = process.env.ADMIN_USERNAME;
    const envPassword = process.env.ADMIN_PASSWORD;
    
    if (envUsername && envPassword) {
      const existingAdmin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
      
      // If default 'admin' exists but .env has different username, update it
      if (existingAdmin && envUsername !== 'admin') {
        const usernameExists = db.prepare('SELECT id FROM users WHERE username = ?').get(envUsername);
        if (!usernameExists) {
          db.prepare('UPDATE users SET username = ? WHERE id = ?').run(envUsername, existingAdmin.id);
          console.log('👤 Updated admin username from "admin" to "' + envUsername + '"');
        }
      }
      
      // Update password for admin user with .env password
      const adminUser = db.prepare('SELECT * FROM users WHERE username = ? OR username = ?').get(envUsername || 'admin', 'admin');
      if (adminUser) {
        const passwordHash = bcrypt.hashSync(envPassword, 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, adminUser.id);
        console.log('👤 Updated admin password from .env');
      }
    }
  }

  // Grid Layouts table - Photobooth grid presets
  db.exec(`
    CREATE TABLE IF NOT EXISTS grid_layouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      grid_rows INTEGER NOT NULL,
      grid_cols INTEGER NOT NULL,
      canvas_width INTEGER DEFAULT 1800,
      canvas_height INTEGER DEFAULT 1200,
      photo_ratio TEXT DEFAULT '4:6',
      spacing INTEGER DEFAULT 20,
      padding INTEGER DEFAULT 40,
      background_color TEXT DEFAULT '#FFFFFF',
      is_preset INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Overlay Assets table - Logo, watermark, frame
  db.exec(`
    CREATE TABLE IF NOT EXISTS overlay_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('logo', 'watermark', 'frame')),
      file_path TEXT NOT NULL,
      position TEXT DEFAULT 'bottom-right',
      opacity REAL DEFAULT 1.0,
      scale REAL DEFAULT 1.0,
      offset_x INTEGER DEFAULT 0,
      offset_y INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Add grid_config column for sessions (migration)
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN grid_config TEXT;`);
  } catch (e) {
    // Column already exists
  }

  // Add overlay_id column for sessions (migration)
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN overlay_id INTEGER REFERENCES overlay_assets(id);`);
  } catch (e) {
    // Column already exists
  }

  // Global settings table for default grid layout and overlay
  db.exec(`
    CREATE TABLE IF NOT EXISTS global_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      default_grid_layout_id INTEGER REFERENCES grid_layouts(id),
      default_overlay_id INTEGER REFERENCES overlay_assets(id),
      auto_apply_to_existing INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Insert default global settings if not exists
  db.exec(`
    INSERT OR IGNORE INTO global_settings (id, default_grid_layout_id, default_overlay_id, auto_apply_to_existing)
    VALUES (1, 1, NULL, 1);
  `);
  
  // Add watch_folder_path column if not exists (migration for existing databases)
  try {
    db.exec(`ALTER TABLE global_settings ADD COLUMN watch_folder_path TEXT;`);
    console.log('✅ Added watch_folder_path column to global_settings');
  } catch (e) {
    // Column already exists, ignore
    if (e.message.includes('duplicate column')) {
      // OK, column exists
    } else {
      console.warn('⚠️  Could not add watch_folder_path column:', e.message);
    }
  }

  // Add branding columns if not exists (migration)
  try {
    db.exec(`ALTER TABLE global_settings ADD COLUMN website_name TEXT DEFAULT 'Photo Gallery';`);
    console.log('✅ Added website_name column to global_settings');
  } catch (e) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE global_settings ADD COLUMN logo_path TEXT;`);
    console.log('✅ Added logo_path column to global_settings');
  } catch (e) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE global_settings ADD COLUMN hero_image_path TEXT;`);
    console.log('✅ Added hero_image_path column to global_settings');
  } catch (e) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE global_settings ADD COLUMN hero_opacity REAL DEFAULT 0.5;`);
    console.log('✅ Added hero_opacity column to global_settings');
  } catch (e) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE global_settings ADD COLUMN hero_blur_intensity INTEGER DEFAULT 10;`);
    console.log('✅ Added hero_blur_intensity column to global_settings');
  } catch (e) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE global_settings ADD COLUMN footer_text TEXT DEFAULT 'Powered by PhotoBooth';`);
    console.log('✅ Added footer_text column to global_settings');
  } catch (e) {
    // Column already exists
  }

  // Add hero text appearance columns (migration)
  try {
    db.exec(`ALTER TABLE global_settings ADD COLUMN hero_title_color TEXT DEFAULT NULL;`);
    console.log('✅ Added hero_title_color column to global_settings');
  } catch (e) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE global_settings ADD COLUMN hero_subtitle_color TEXT DEFAULT NULL;`);
    console.log('✅ Added hero_subtitle_color column to global_settings');
  } catch (e) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE global_settings ADD COLUMN hero_text_align TEXT DEFAULT 'left';`);
    console.log('✅ Added hero_text_align column to global_settings');
  } catch (e) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE global_settings ADD COLUMN hero_text_shadow INTEGER DEFAULT 1;`);
    console.log('✅ Added hero_text_shadow column to global_settings');
  } catch (e) {
    // Column already exists
  }

  // Insert default grid layouts (photobooth standard presets)
  const insertLayout = db.prepare(`
    INSERT OR IGNORE INTO grid_layouts (name, description, grid_rows, grid_cols, canvas_width, canvas_height, photo_ratio, spacing, padding)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const defaultLayouts = [
    ['2x2 Classic', 'Classic 2x2 photobooth strip (4:6 ratio)', 2, 2, 1800, 1200, '4:6', 20, 40],
    ['1x4 Vertical Strip', 'Vertical strip 4 photos (2x6 ratio)', 4, 1, 800, 2400, '2:6', 15, 30],
    ['2x3 Portrait', 'Portrait style 6 photos (4:6 ratio)', 3, 2, 1800, 2400, '4:6', 20, 40],
    ['3x3 Grid', '3x3 grid 9 photos (4:4.5 ratio)', 3, 3, 1800, 1800, '1:1', 15, 35],
    ['1x3 Horizontal', 'Horizontal 3 photos strip (4:6 ratio)', 1, 3, 2400, 800, '4:6', 20, 30],
    ['2x4 Large Grid', 'Large 8 photos grid (4:6 ratio)', 4, 2, 1600, 2400, '4:6', 20, 40],
    ['1x2 Simple', 'Simple 2 photos side by side (4:6 ratio)', 1, 2, 1600, 800, '4:6', 30, 50],
    ['Single Portrait', 'Single large portrait photo (4:6 ratio)', 1, 1, 1200, 1800, '4:6', 0, 0]
  ];

  for (const layout of defaultLayouts) {
    insertLayout.run(...layout);
  }

  console.log('📊 Database schema initialized');
}

module.exports = {
  getDatabase,
  initializeSchema
};
