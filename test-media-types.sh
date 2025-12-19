#!/bin/bash

# Test Script untuk Multi Media Type Support & Subfolder Detection
# Usage: ./test-media-types.sh

echo "🧪 Testing Multi Media Type Support & Subfolder Detection"
echo "=========================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get watch folder from env or use default
WATCH_FOLDER="${LUMA_PHOTOS_FOLDER:-./test-photos}"

echo "📁 Watch Folder: $WATCH_FOLDER"
echo ""

# Create test structure
echo "1️⃣  Creating test folder structure..."
TEST_SESSION="test-session-$(date +%s)"
TEST_PATH="$WATCH_FOLDER/$TEST_SESSION"
mkdir -p "$TEST_PATH"
echo "   Created: $TEST_PATH"
echo ""

# Create test files
echo "2️⃣  Creating test media files..."

# Create dummy image files
cat > "$TEST_PATH/test.jpg" << EOF
Test JPG file
EOF
echo "   ✅ Created: test.jpg"

cat > "$TEST_PATH/photo.png" << EOF
Test PNG file
EOF
echo "   ✅ Created: photo.png"

cat > "$TEST_PATH/animation.gif" << EOF
Test GIF file
EOF
echo "   ✅ Created: animation.gif"

cat > "$TEST_PATH/modern.webp" << EOF
Test WEBP file
EOF
echo "   ✅ Created: modern.webp"

# Create dummy video files
cat > "$TEST_PATH/video.mp4" << EOF
Test MP4 file
EOF
echo "   ✅ Created: video.mp4"

cat > "$TEST_PATH/clip.mov" << EOF
Test MOV file
EOF
echo "   ✅ Created: clip.mov"

cat > "$TEST_PATH/legacy.avi" << EOF
Test AVI file
EOF
echo "   ✅ Created: legacy.avi"

cat > "$TEST_PATH/web-video.webm" << EOF
Test WEBM file
EOF
echo "   ✅ Created: web-video.webm"

echo ""

# Test root file (should be ignored)
echo "3️⃣  Testing root file detection (should be IGNORED)..."
cat > "$WATCH_FOLDER/root-test.jpg" << EOF
Root test file - should be ignored
EOF
echo "   ✅ Created root file: root-test.jpg"
echo ""

# Instructions
echo "=========================================================="
echo -e "${YELLOW}📋 Manual Verification Steps:${NC}"
echo ""
echo "1. Check server logs for file detection:"
echo -e "   ${GREEN}✅ Expected: 8 files detected in subfolder${NC}"
echo -e "   ${RED}❌ NOT Expected: root-test.jpg detection${NC}"
echo ""
echo "2. Check admin dashboard:"
echo "   http://localhost:3000/admin.html"
echo ""
echo "3. Verify session created:"
echo "   Session Name: $TEST_SESSION"
echo ""
echo "4. Check database:"
echo "   SELECT * FROM sessions WHERE folder_name = '$TEST_SESSION';"
echo "   SELECT * FROM photos WHERE session_uuid IN (SELECT session_uuid FROM sessions WHERE folder_name = '$TEST_SESSION');"
echo ""
echo "=========================================================="
echo ""

# Wait for processing
echo "⏳ Waiting 5 seconds for watchdog to process files..."
sleep 5
echo ""

# Check if session was created
echo "4️⃣  Checking results..."
if [ -d "$WATCH_FOLDER/$TEST_SESSION" ]; then
  FILE_COUNT=$(find "$TEST_PATH" -type f ! -name "_*" | wc -l | tr -d ' ')
  echo -e "   ${GREEN}✅ Test session exists${NC}"
  echo "   📊 Files in test session: $FILE_COUNT"
else
  echo -e "   ${RED}❌ Test session not found${NC}"
fi

if [ -f "$WATCH_FOLDER/root-test.jpg" ]; then
  echo -e "   ${YELLOW}⚠️  Root test file still exists (good - should be ignored)${NC}"
else
  echo -e "   ${RED}❌ Root test file was removed unexpectedly${NC}"
fi

echo ""
echo "=========================================================="
echo -e "${YELLOW}🧹 Cleanup${NC}"
echo ""
echo "To remove test files:"
echo "  rm -rf $TEST_PATH"
echo "  rm -f $WATCH_FOLDER/root-test.jpg"
echo ""
echo "To keep for inspection, leave files in place."
echo "=========================================================="
