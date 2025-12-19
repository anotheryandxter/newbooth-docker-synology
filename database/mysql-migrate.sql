-- ============================================================================
-- Photobooth System - MySQL Migration Script
-- For phpMyAdmin Import
-- Version: 1.0.0 to 1.0.1
-- Date: 2025-12-09
-- ============================================================================

-- This file contains migration scripts for future schema updates
-- Run this AFTER mysql-schema.sql has been imported

-- ============================================================================
-- MIGRATION EXAMPLE: Add customer_name column to sessions
-- ============================================================================

-- ALTER TABLE sessions ADD COLUMN customer_name VARCHAR(255) NULL AFTER folder_name;
-- ALTER TABLE sessions ADD INDEX idx_sessions_customer (customer_name);

-- ============================================================================
-- MIGRATION EXAMPLE: Add event_date column
-- ============================================================================

-- ALTER TABLE sessions ADD COLUMN event_date DATE NULL AFTER customer_name;
-- ALTER TABLE sessions ADD INDEX idx_sessions_event_date (event_date);

-- ============================================================================
-- MIGRATION EXAMPLE: Add status column
-- ============================================================================

-- ALTER TABLE sessions ADD COLUMN status ENUM('active', 'completed', 'archived') DEFAULT 'active' AFTER photo_count;
-- ALTER TABLE sessions ADD INDEX idx_sessions_status (status);

-- ============================================================================
-- MIGRATION EXAMPLE: Add processed flag to photos
-- ============================================================================

-- ALTER TABLE photos ADD COLUMN processed BOOLEAN DEFAULT TRUE AFTER file_path;
-- ALTER TABLE photos ADD INDEX idx_photos_processed (processed);

-- ============================================================================
-- MIGRATION EXAMPLE: Create events table
-- ============================================================================

-- CREATE TABLE events (
--     id INT AUTO_INCREMENT PRIMARY KEY,
--     event_name VARCHAR(255) NOT NULL,
--     event_date DATE NOT NULL,
--     venue VARCHAR(255) NULL,
--     description TEXT NULL,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--     INDEX idx_events_date (event_date),
--     INDEX idx_events_name (event_name)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Link sessions to events
-- ALTER TABLE sessions ADD COLUMN event_id INT NULL AFTER session_uuid;
-- ALTER TABLE sessions ADD FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
-- ALTER TABLE sessions ADD INDEX idx_sessions_event (event_id);

-- ============================================================================
-- MIGRATION EXAMPLE: Add metadata column (JSON)
-- ============================================================================

-- For MySQL 5.7+ with JSON support
-- ALTER TABLE sessions ADD COLUMN metadata JSON NULL AFTER gallery_url;

-- Example metadata structure:
-- {
--   "theme": "wedding",
--   "customer_email": "customer@email.com",
--   "notes": "Special instructions"
-- }

-- ============================================================================
-- DATA MIGRATION EXAMPLES
-- ============================================================================

-- Example: Migrate old data format
-- UPDATE sessions SET layout_type = 'grid' WHERE layout_type IS NULL;

-- Example: Populate photo_count from actual photos
-- UPDATE sessions s 
-- SET photo_count = (
--     SELECT COUNT(*) FROM photos p WHERE p.session_id = s.id
-- );

-- ============================================================================
-- VERIFICATION AFTER MIGRATION
-- ============================================================================

-- Check columns added
-- DESCRIBE sessions;
-- DESCRIBE photos;

-- Check data integrity
-- SELECT COUNT(*) FROM sessions;
-- SELECT COUNT(*) FROM photos;

-- ============================================================================
-- ROLLBACK EXAMPLES (if migration fails)
-- ============================================================================

-- Rollback: Remove added column
-- ALTER TABLE sessions DROP COLUMN customer_name;

-- Rollback: Remove index
-- ALTER TABLE sessions DROP INDEX idx_sessions_customer;

-- ============================================================================
-- OPTIMIZE TABLES AFTER MIGRATION
-- ============================================================================

-- OPTIMIZE TABLE sessions;
-- OPTIMIZE TABLE photos;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
