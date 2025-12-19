#!/bin/bash

# test-docker-local.sh - Test Docker container dengan konfigurasi yang benar

set -e

echo "=========================================="
echo "🧪 Testing Photobooth Docker Container"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Variables
CONTAINER_NAME="photobooth-test"
IMAGE_NAME="newbooth:latest"
HOST_PORT=3000
CONTAINER_PORT=3000

echo ""
echo "📋 Configuration:"
echo "   Container: $CONTAINER_NAME"
echo "   Image: $IMAGE_NAME"
echo "   Port: $HOST_PORT:$CONTAINER_PORT"
echo ""

# Check if image exists
if ! docker images "$IMAGE_NAME" --format "{{.Repository}}" | grep -q "newbooth"; then
    echo -e "${RED}❌ Error: Image '$IMAGE_NAME' not found${NC}"
    echo "Please build the image first:"
    echo "  ./build-and-export.sh"
    exit 1
fi

# Stop and remove existing container
echo "🧹 Cleaning up existing containers..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true
echo ""

# Create .env if not exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
LOCAL_IP=0.0.0.0
ADMIN_PASSWORD=admin123
SESSION_SECRET=test-secret-change-in-production-minimum-32-characters
QR_BASE_URL=http://localhost:3000
LUMA_PHOTOS_FOLDER=/app/watch
CLEANUP_AFTER_DAYS=7
CLEANUP_DAYS=7
MAX_FILE_SIZE=10485760
THUMBNAIL_WIDTH=400
LOG_LEVEL=info
EOF
    echo -e "${GREEN}✅ .env created${NC}"
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p database public/gallery public/qr logs watch

echo ""
echo "🚀 Starting container..."
echo ""

# Run container with proper config
docker run -d \
    --platform linux/amd64 \
    --name "$CONTAINER_NAME" \
    -p ${HOST_PORT}:${CONTAINER_PORT} \
    -e NODE_ENV=production \
    -e PORT=${CONTAINER_PORT} \
    -e LOCAL_IP=0.0.0.0 \
    -e ADMIN_PASSWORD=admin123 \
    -e SESSION_SECRET=test-secret-minimum-32-chars \
    -e LUMA_PHOTOS_FOLDER=/app/watch \
    -e CLEANUP_AFTER_DAYS=7 \
    -v "$(pwd)/database:/app/database" \
    -v "$(pwd)/public/gallery:/app/public/gallery" \
    -v "$(pwd)/public/qr:/app/public/qr" \
    -v "$(pwd)/logs:/app/logs" \
    -v "$(pwd)/watch:/app/watch/public/qr" \
    -v "$(pwd)/logs:/app/logs" \
    "$IMAGE_NAME"

echo ""
echo "⏳ Waiting for server to start..."
sleep 5

# Check if container is running
if docker ps | grep -q "$CONTAINER_NAME"; then
    echo -e "${GREEN}✅ Container is running!${NC}"
else
    echo -e "${RED}❌ Container failed to start${NC}"
    echo ""
    echo "Logs:"
    docker logs "$CONTAINER_NAME"
    exit 1
fi

echo ""
echo "📊 Container status:"
docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "📋 Container logs (last 20 lines):"
echo "=========================================="
docker logs "$CONTAINER_NAME" --tail 20
echo "=========================================="

echo ""
echo -e "${GREEN}✅ Container is ready!${NC}"
echo ""
echo "🌐 Access application:"
echo "   http://localhost:${HOST_PORT}"
echo "   http://localhost:${HOST_PORT}/admin"
echo ""
echo "📝 Login credentials:"
echo "   Username: admin"
echo "   Password: admin123"
echo ""
echo "🔍 View real-time logs:"
echo "   docker logs -f $CONTAINER_NAME"
echo ""
echo "🛑 Stop container:"
echo "   docker stop $CONTAINER_NAME"
echo ""
echo "🗑️  Remove container:"
echo "   docker rm $CONTAINER_NAME"
echo ""

# Test HTTP connection
echo "🧪 Testing HTTP connection..."
sleep 2

if curl -s -o /dev/null -w "%{http_code}" http://localhost:${HOST_PORT} | grep -q "200"; then
    echo -e "${GREEN}✅ HTTP connection successful!${NC}"
    echo ""
    echo "🎉 Opening browser..."
    
    # Open browser (macOS)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open http://localhost:${HOST_PORT}
    fi
else
    echo -e "${YELLOW}⚠️  HTTP connection check failed${NC}"
    echo "Server might still be starting, try again in a few seconds:"
    echo "  open http://localhost:${HOST_PORT}"
fi

echo ""
echo "=========================================="
echo "✅ Test complete!"
echo "=========================================="
