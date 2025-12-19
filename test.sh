#!/bin/bash

# Test Script - Create test photo session
# Jalankan: chmod +x test.sh && ./test.sh

echo "🧪 PHOTOBOOTH TEST - Creating Test Session"
echo "==========================================="
echo ""

# Check if LUMA_PHOTOS_FOLDER is set in .env
if [ -f .env ]; then
    source .env
else
    echo "❌ .env file not found! Run setup.sh first"
    exit 1
fi

# Use LUMA_PHOTOS_FOLDER or default
PHOTOS_FOLDER="${LUMA_PHOTOS_FOLDER:-${HOME}/LumaBooth/Photos}"

# Create test session folder
SESSION_NAME="TestSession_$(date +%Y%m%d_%H%M%S)"
SESSION_PATH="$PHOTOS_FOLDER/$SESSION_NAME"

echo "📁 Creating test session: $SESSION_NAME"
mkdir -p "$SESSION_PATH"

# Create dummy images (colored rectangles)
echo "🎨 Generating test photos..."

for i in {1..4}; do
    # Create test image using ImageMagick (if available) or just create empty file
    if command -v convert &> /dev/null; then
        # Generate colored test image
        convert -size 1920x1080 xc:"hsl($((i*90)),100%,50%)" \
                -gravity center \
                -pointsize 100 \
                -fill white \
                -annotate +0+0 "Test Photo $i" \
                "$SESSION_PATH/photo_$i.jpg"
        echo "   ✅ Created photo_$i.jpg"
    else
        # Just create placeholder file
        echo "Test Photo $i" > "$SESSION_PATH/photo_$i.jpg"
        echo "   ⚠️  Created placeholder photo_$i.jpg (install ImageMagick for real images)"
    fi
    
    # Small delay to simulate real photo capture
    sleep 0.5
done

echo ""
echo "✅ Test session created!"
echo ""
echo "📸 Session Details:"
echo "   Name: $SESSION_NAME"
echo "   Path: $SESSION_PATH"
echo "   Photos: 4"
echo ""
echo "🔍 What to check:"
echo "   1. Server console should show photo detection"
echo "   2. QR code should be generated: $SESSION_PATH/_qrcode.png"
echo "   3. Database should have new session"
echo "   4. Gallery should be accessible via QR URL"
echo ""
echo "💡 Tips:"
echo "   - Check http://localhost:3000/admin for session list"
echo "   - Look for console logs in server terminal"
echo "   - QR code will be saved in session folder"
echo ""

# If ImageMagick not available, show instructions
if ! command -v convert &> /dev/null; then
    echo "⚠️  ImageMagick not detected"
    echo "   Install for better test images:"
    echo "   macOS: brew install imagemagick"
    echo "   Linux: sudo apt-get install imagemagick"
    echo ""
    echo "   Or copy real photos to:"
    echo "   $SESSION_PATH/"
fi

echo "Test complete! 🎉"
