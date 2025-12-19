-- Photobooth System Database Schema
-- SQLite Database Migration
-- Version: 1.0.0
-- Date: 2025-12-09

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Enable WAL mode for better concurrent access
PRAGMA journal_mode = WAL;

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_uuid TEXT UNIQUE NOT NULL,
    folder_name TEXT NOT NULL,
    layout_type TEXT NOT NULL CHECK(layout_type IN ('grid', 'overlay', 'single')),
    qr_code_path TEXT,
    gallery_url TEXT,
    photo_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Photos table
CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    original_filename TEXT NOT NULL,
    processed_filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_uuid ON sessions(session_uuid);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_folder ON sessions(folder_name);
CREATE INDEX IF NOT EXISTS idx_photos_session ON photos(session_id);
CREATE INDEX IF NOT EXISTS idx_photos_created ON photos(created_at);

-- View for session statistics
CREATE VIEW IF NOT EXISTS session_stats AS
SELECT 
    s.session_uuid,
    s.folder_name,
    s.layout_type,
    s.created_at,
    COUNT(p.id) as photo_count,
    SUM(p.file_size) as total_size,
    MAX(p.created_at) as last_photo_time
FROM sessions s
LEFT JOIN photos p ON s.id = p.id
GROUP BY s.id;

-- Cleanup old sessions (older than 7 days)
-- This is a manual cleanup query, actual cleanup is handled by server/cleanup.js
-- DELETE FROM sessions WHERE created_at < datetime('now', '-7 days');

-- Sample data for testing (optional)
-- INSERT INTO sessions (session_uuid, folder_name, layout_type, qr_code_path, gallery_url) 
-- VALUES ('test-uuid-123', 'test-folder', 'grid', '/qr/test.png', '/gallery/test-uuid-123');
