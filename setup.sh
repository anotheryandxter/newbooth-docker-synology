#!/bin/bash

# Setup Script untuk Photobooth Server
# Jalankan: chmod +x setup.sh && ./setup.sh

echo "🎉 PHOTOBOOTH SERVER - SETUP WIZARD"
echo "===================================="
echo ""

# Check Node.js
echo "📦 Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js tidak terinstall!"
    echo "   Download dari: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js $NODE_VERSION detected"
echo ""

# Install dependencies
echo "📥 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Gagal install dependencies!"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Get Local IP
echo "🔍 Detecting local IP address..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n1)
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    LOCAL_IP=$(hostname -I | awk '{print $1}')
else
    # Windows (Git Bash)
    LOCAL_IP=$(ipconfig | grep "IPv4" | awk '{print $NF}' | head -n1)
fi

echo "✅ Local IP detected: $LOCAL_IP"
echo ""

# Setup .env
echo "⚙️  Configuring environment..."
if [ ! -f .env ]; then
    cp .env.example .env
    
    # Update LOCAL_IP in .env
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/LOCAL_IP=.*/LOCAL_IP=$LOCAL_IP/" .env
    else
        sed -i "s/LOCAL_IP=.*/LOCAL_IP=$LOCAL_IP/" .env
    fi
    
    echo "✅ .env file created and configured"
else
    echo "⚠️  .env already exists, skipping..."
fi
echo ""

# Create test folder
echo "📁 Creating test folders..."
PHOTOS_FOLDER="${HOME}/LumaBooth/Photos"

if [ ! -d "$PHOTOS_FOLDER" ]; then
    mkdir -p "$PHOTOS_FOLDER"
    echo "✅ Created: $PHOTOS_FOLDER"
    
    # Update .env with correct path
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|LUMA_PHOTOS_FOLDER=.*|LUMA_PHOTOS_FOLDER=$PHOTOS_FOLDER|" .env
    else
        sed -i "s|LUMA_PHOTOS_FOLDER=.*|LUMA_PHOTOS_FOLDER=$PHOTOS_FOLDER|" .env
    fi
else
    echo "✅ Folder already exists: $PHOTOS_FOLDER"
fi
echo ""

# Summary
echo "🎊 SETUP COMPLETE!"
echo "=================="
echo ""
echo "📍 Configuration:"
echo "   Local IP: $LOCAL_IP"
echo "   Port: 3000"
echo "   Photos Folder: $PHOTOS_FOLDER"
echo ""
echo "🚀 Next Steps:"
echo "   1. Start server: npm start"
echo "   2. Open browser: http://$LOCAL_IP:3000"
echo "   3. Admin panel: http://$LOCAL_IP:3000/admin"
echo "   4. Add test photos to: $PHOTOS_FOLDER"
echo ""
echo "💡 Tips:"
echo "   - Use 'npm run dev' for development with auto-reload"
echo "   - Check health: curl http://$LOCAL_IP:3000/api/health"
echo "   - View logs in terminal after starting server"
echo ""
echo "Happy shooting! 📸"
