#!/bin/bash

# Docker Image Build & Export Script for Synology
# Version: 2.6.17 - Aspect Ratio Preservation Fix
# Date: 19 Dec 2025

set -e

echo "🚀 Building Docker Image for Synology (linux/amd64)..."
echo "=================================================="
echo ""

# Configuration
IMAGE_NAME="newbooth"
IMAGE_TAG="v2.6.17"
PLATFORM="linux/amd64"
OUTPUT_FILE="newbooth-image-v2.6.17.tar.gz"

# Build image
echo "📦 Step 1: Building Docker image..."
docker build --platform ${PLATFORM} -t ${IMAGE_NAME}:${IMAGE_TAG} .

if [ $? -ne 0 ]; then
    echo "❌ Docker build failed!"
    exit 1
fi

echo "✅ Build completed successfully!"
echo ""

# Show image info
echo "📊 Image Information:"
docker images ${IMAGE_NAME}:${IMAGE_TAG}
echo ""

# Export image
echo "📤 Step 2: Exporting and compressing image..."
docker save ${IMAGE_NAME}:${IMAGE_TAG} | gzip > ${OUTPUT_FILE}

if [ $? -ne 0 ]; then
    echo "❌ Export failed!"
    exit 1
fi

echo "✅ Export completed successfully!"
echo ""

# Show file size
echo "📁 Output File:"
ls -lh ${OUTPUT_FILE}
echo ""

# Calculate checksums
echo "🔐 Checksums:"
echo "MD5:    $(md5 -q ${OUTPUT_FILE})"
echo "SHA256: $(shasum -a 256 ${OUTPUT_FILE} | cut -d' ' -f1)"
echo ""

# Verify image architecture
echo "🔍 Verifying architecture..."
ARCH=$(docker inspect ${IMAGE_NAME}:${IMAGE_TAG} | grep -A 1 '"Architecture"' | grep -o '"amd64"' || echo "unknown")
if [[ "$ARCH" == *"amd64"* ]]; then
    echo "✅ Architecture: amd64 (Synology compatible)"
else
    echo "⚠️  Architecture verification failed"
fi
echo ""

echo "=================================================="
echo "🎉 All done!"
echo ""
echo "📦 File ready for upload: ${OUTPUT_FILE}"
echo ""
echo "📋 Next Steps:"
echo "1. Upload ${OUTPUT_FILE} to Synology via File Station"
echo "2. Extract if needed: gunzip ${OUTPUT_FILE}"
echo "3. Import in Container Manager: Image > Add > From File"
echo "4. Create container with proper config"
echo ""
echo "💡 Features included in this build:"
echo "   ✓ Watch folder configuration via frontend"
echo "   ✓ Folder browser GUI with shortcuts"
echo "   ✓ Dynamic path selection (no typing needed)"
echo "   ✓ Platform-aware shortcuts (macOS/Linux/Synology)"
echo "   ✓ Create folders on-the-fly"
echo "   ✓ Security blacklist for system directories"
echo "   ✓ Multi media type support (jpg, png, gif, webp, mp4, mov, avi, webm)"
echo "   ✓ Subfolder-only detection (ignores root folder files)"
echo "   ✓ Session ID = Folder name (predictable URLs)"
echo "   ✓ Session listing bug fix (only shows folders with media)"
echo "   ✓ FIXED: Image aspect ratio preservation (no crop in fullscreen)"
echo "   ✓ FIXED: Original photo endpoint serves uncropped files"
echo "   ✓ Thumbnail generation uses fit: inside (letterbox, no crop)"
echo ""
echo "📚 Documentation:"
echo "   - SESSION_LISTING_FIX.md"
echo "   - SESSION_ID_REFACTOR.md"
echo "   - MEDIA_TYPES_UPDATE.md"
echo "   - BUILD_v2.4.1.md"
echo ""
