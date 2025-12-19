-- ============================================================================
-- Photobooth System - MySQL/MariaDB Schema
-- For phpMyAdmin Import
-- Version: 1.0.0
-- Date: 2025-12-09
-- ============================================================================

-- Create database (optional - uncomment if needed)
-- CREATE DATABASE IF NOT EXISTS photobooth CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE photobooth;

-- ============================================================================
-- DROP EXISTING TABLES (if exists)
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS photos;
DROP TABLE IF EXISTS sessions;
DROP VIEW IF EXISTS session_stats;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- TABLE: sessions
-- ============================================================================

CREATE TABLE sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_uuid VARCHAR(36) UNIQUE NOT NULL,
    folder_name VARCHAR(255) NOT NULL,
    layout_type ENUM('grid', 'overlay', 'single') NOT NULL,
    qr_code_path VARCHAR(255) NULL,
    gallery_url VARCHAR(255) NULL,
    photo_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sessions_uuid (session_uuid),
    INDEX idx_sessions_created (created_at),
    INDEX idx_sessions_folder (folder_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABLE: photos
-- ============================================================================

CREATE TABLE photos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    processed_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NULL,
    width INT NULL,
    height INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_photos_session (session_id),
    INDEX idx_photos_created (created_at),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- VIEW: session_stats
-- ============================================================================

CREATE OR REPLACE VIEW session_stats AS
SELECT 
    s.session_uuid,
    s.folder_name,
    s.layout_type,
    s.created_at,
    COUNT(p.id) as photo_count,
    SUM(p.file_size) as total_size,
    MAX(p.created_at) as last_photo_time
FROM sessions s
LEFT JOIN photos p ON s.id = p.session_id
GROUP BY s.id, s.session_uuid, s.folder_name, s.layout_type, s.created_at;

-- ============================================================================
-- SAMPLE DATA (Optional - uncomment to insert test data)
-- ============================================================================

-- INSERT INTO sessions (session_uuid, folder_name, layout_type, qr_code_path, gallery_url) 
-- VALUES 
--     ('test-uuid-001', 'Event-2025-12-09-001', 'grid', '/qr/test-001.png', '/gallery/test-uuid-001'),
--     ('test-uuid-002', 'Event-2025-12-09-002', 'overlay', '/qr/test-002.png', '/gallery/test-uuid-002'),
--     ('test-uuid-003', 'Event-2025-12-09-003', 'single', '/qr/test-003.png', '/gallery/test-uuid-003');

-- INSERT INTO photos (session_id, original_filename, processed_filename, file_path, file_size, width, height)
-- VALUES
--     (1, 'IMG_001.jpg', 'processed_001.jpg', '/galleries/test-uuid-001/photo_1.jpg', 2048576, 1920, 1080),
--     (1, 'IMG_002.jpg', 'processed_002.jpg', '/galleries/test-uuid-001/photo_2.jpg', 2148576, 1920, 1080),
--     (2, 'IMG_003.jpg', 'processed_003.jpg', '/galleries/test-uuid-002/photo_1.jpg', 1948576, 1920, 1080);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check tables created
-- SHOW TABLES;

-- Check sessions table structure
-- DESCRIBE sessions;

-- Check photos table structure
-- DESCRIBE photos;

-- Check view
-- SELECT * FROM session_stats;

-- Count records
-- SELECT 
--     (SELECT COUNT(*) FROM sessions) as total_sessions,
--     (SELECT COUNT(*) FROM photos) as total_photos;

-- ============================================================================
-- CLEANUP QUERY (for old sessions - run manually)
-- ============================================================================

-- Delete sessions older than 7 days
-- DELETE FROM sessions WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
-- Note: Photos will be automatically deleted due to CASCADE

-- ============================================================================
-- BACKUP QUERY
-- ============================================================================

-- Create backup table
-- CREATE TABLE sessions_backup AS SELECT * FROM sessions;
-- CREATE TABLE photos_backup AS SELECT * FROM photos;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
