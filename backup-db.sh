#!/bin/bash

# Synology Backup Script for Photobooth Database
# Run this script via Synology Task Scheduler (daily recommended)

# Configuration
BACKUP_DIR="/volume1/web/photobooth/backups"
DB_PATH="/volume1/web/photobooth/data/photobooth.db"
RETENTION_DAYS=30

# Create backup directory if not exists
mkdir -p "$BACKUP_DIR"

# Backup filename with timestamp
BACKUP_FILE="$BACKUP_DIR/photobooth-$(date +%Y%m%d-%H%M%S).db"

# Perform backup using SQLite backup command
echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting database backup..."

if [ -f "$DB_PATH" ]; then
    sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
    
    if [ $? -eq 0 ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Backup successful: $BACKUP_FILE"
        
        # Compress backup
        gzip "$BACKUP_FILE"
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Backup compressed: ${BACKUP_FILE}.gz"
        
        # Clean old backups (keep only last X days)
        find "$BACKUP_DIR" -name "photobooth-*.db.gz" -mtime +$RETENTION_DAYS -delete
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Old backups cleaned (retention: $RETENTION_DAYS days)"
        
        # Show backup stats
        BACKUP_SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
        BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/photobooth-*.db.gz | wc -l)
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Backup size: $BACKUP_SIZE"
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Total backups: $BACKUP_COUNT"
    else
        echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: Backup failed!"
        exit 1
    fi
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: Database not found at $DB_PATH"
    exit 1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') - Backup completed successfully"
