#!/bin/bash

# Test Script for Session ID Refactoring
# Verifies that session_uuid = folder_name

echo "🧪 Testing Session ID Refactoring (v2.4.1)"
echo "==========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get watch folder
WATCH_FOLDER="${LUMA_PHOTOS_FOLDER:-./test-photos}"
echo "📁 Watch Folder: $WATCH_FOLDER"
echo ""

# Test 1: Create unique test session
echo "1️⃣  Creating test session..."
TEST_SESSION="test-refactor-$(date +%s)"
TEST_PATH="$WATCH_FOLDER/$TEST_SESSION"
mkdir -p "$TEST_PATH"
echo -e "   ${GREEN}✅ Created:${NC} $TEST_SESSION"
echo ""

# Test 2: Add test photo
echo "2️⃣  Adding test photo..."
cat > "$TEST_PATH/test.jpg" << EOF
Test photo file
EOF
echo -e "   ${GREEN}✅ Created:${NC} test.jpg"
echo ""

# Test 3: Wait for processing
echo "3️⃣  Waiting for watchdog to process..."
sleep 8
echo ""

# Test 4: Check database
echo "4️⃣  Checking database..."
DB_PATH="./database/photobooth.db"

if [ -f "$DB_PATH" ]; then
  echo "   📊 Querying session..."
  
  # Query session details
  RESULT=$(sqlite3 "$DB_PATH" "SELECT session_uuid, folder_name, session_uuid = folder_name AS is_equal FROM sessions WHERE folder_name = '$TEST_SESSION' LIMIT 1;")
  
  if [ -n "$RESULT" ]; then
    echo "   Result: $RESULT"
    
    # Parse result
    SESSION_UUID=$(echo "$RESULT" | cut -d'|' -f1)
    FOLDER_NAME=$(echo "$RESULT" | cut -d'|' -f2)
    IS_EQUAL=$(echo "$RESULT" | cut -d'|' -f3)
    
    echo ""
    echo "   session_uuid: $SESSION_UUID"
    echo "   folder_name:  $FOLDER_NAME"
    echo "   are_equal:    $IS_EQUAL"
    echo ""
    
    if [ "$IS_EQUAL" = "1" ]; then
      echo -e "   ${GREEN}✅ PASS: session_uuid equals folder_name${NC}"
    else
      echo -e "   ${RED}❌ FAIL: session_uuid does NOT equal folder_name${NC}"
    fi
    
    # Additional check: UUID should not be in UUID format
    if [[ "$SESSION_UUID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
      echo -e "   ${RED}❌ FAIL: session_uuid is still in UUID format${NC}"
    else
      echo -e "   ${GREEN}✅ PASS: session_uuid is NOT a UUID${NC}"
    fi
  else
    echo -e "   ${YELLOW}⚠️  Session not found in database yet${NC}"
    echo "   Try running script again or check server logs"
  fi
else
  echo -e "   ${RED}❌ Database not found: $DB_PATH${NC}"
fi

echo ""

# Test 5: Check QR code
echo "5️⃣  Checking QR code..."
QR_PATH="$TEST_PATH/_qrcode.png"
if [ -f "$QR_PATH" ]; then
  echo -e "   ${GREEN}✅ QR code exists${NC}"
  
  # Try to decode QR code (requires zbarimg)
  if command -v zbarimg &> /dev/null; then
    QR_CONTENT=$(zbarimg --quiet --raw "$QR_PATH" 2>/dev/null)
    if [ -n "$QR_CONTENT" ]; then
      echo "   QR Content: $QR_CONTENT"
      
      # Check if QR contains folder name (not UUID)
      if [[ "$QR_CONTENT" == *"$TEST_SESSION"* ]]; then
        echo -e "   ${GREEN}✅ PASS: QR code contains folder name${NC}"
      else
        echo -e "   ${RED}❌ FAIL: QR code does NOT contain folder name${NC}"
      fi
    else
      echo -e "   ${YELLOW}⚠️  Could not decode QR code${NC}"
    fi
  else
    echo -e "   ${YELLOW}⚠️  zbarimg not installed (skipping QR decode)${NC}"
    echo "   Install: brew install zbar (macOS)"
  fi
else
  echo -e "   ${YELLOW}⚠️  QR code not generated yet${NC}"
fi

echo ""

# Test 6: Check URL structure
echo "6️⃣  Testing URL structure..."
if [ -n "$SESSION_UUID" ]; then
  EXPECTED_URL="http://localhost:3000/gallery/$SESSION_UUID"
  echo "   Expected URL: $EXPECTED_URL"
  
  # URL should be human-readable
  if [[ "$EXPECTED_URL" == *"$TEST_SESSION"* ]]; then
    echo -e "   ${GREEN}✅ PASS: URL is human-readable${NC}"
  else
    echo -e "   ${RED}❌ FAIL: URL is NOT human-readable${NC}"
  fi
fi

echo ""
echo "==========================================="
echo "📋 Summary"
echo ""
echo "Test Session: $TEST_SESSION"
echo "Database Path: $DB_PATH"
echo "Test Folder: $TEST_PATH"
echo ""
echo "Expected Behavior:"
echo "  ✅ session_uuid = folder_name"
echo "  ✅ No UUID format in session_uuid"
echo "  ✅ QR code contains folder name"
echo "  ✅ URL is human-readable"
echo ""
echo "==========================================="
echo ""

# Cleanup option
echo "🧹 Cleanup"
echo ""
read -p "Delete test session? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  rm -rf "$TEST_PATH"
  echo -e "${GREEN}✅ Test session deleted${NC}"
  
  # Optionally delete from DB
  if [ -f "$DB_PATH" ]; then
    sqlite3 "$DB_PATH" "DELETE FROM sessions WHERE folder_name = '$TEST_SESSION';"
    echo -e "${GREEN}✅ Session removed from database${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  Test session preserved for inspection${NC}"
  echo "   Folder: $TEST_PATH"
  echo "   To delete manually:"
  echo "   rm -rf $TEST_PATH"
  echo "   sqlite3 $DB_PATH \"DELETE FROM sessions WHERE folder_name = '$TEST_SESSION';\""
fi

echo ""
echo "✅ Test complete!"
