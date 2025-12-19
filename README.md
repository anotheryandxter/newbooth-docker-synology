# 📸 Newbooth - Docker Synology

**Photobooth Server v2.5.2** - Professional photobooth gallery system designed for Synology NAS with Docker deployment.

[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20--alpine-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Synology%20NAS-orange.svg)](https://www.synology.com/)

---

## 🌟 Features

### Core Functionality
- 🎯 **Real-time Gallery** - Auto-detect and display photo sessions from DSLRBooth
- 📱 **Offline QR Codes** - Embedded QR codes for easy sharing
- 🖼️ **Smart Thumbnails** - Automatic thumbnail generation with caching
- 🔄 **Auto Cleanup** - Configurable session retention (default: 7 days)
- 🎨 **Grid Layouts** - Multiple layout templates (2x3, 3x2, 2x2, strip)
- 🎭 **Overlay Support** - PNG overlay integration per session

### Branding System (v2.5.0+)
- 🏢 **Website Name** - Customize site name across all pages
- 🎨 **Logo Upload** - Add your brand logo (auto-displayed on all pages)
- 🖼️ **Hero Images** - Beautiful header backgrounds for homepage
- 🎚️ **Image Effects** - Adjustable brightness (0-100%) and blur (0-50px)
- 💼 **Professional UI** - Card-based design with rounded corners

### Technical Features
- 🐳 **Docker Optimized** - Built specifically for Synology NAS (linux/amd64)
- 🔒 **Secure Admin** - Password-protected admin panel
- 📊 **SQLite Database** - Lightweight and fast with WAL mode
- 🚀 **Production Ready** - Auto-restart, health checks, logging
- 📦 **Volume Persistent** - Data, uploads, and galleries survive container restarts

---

## 🚀 Quick Start

### Prerequisites
- Synology NAS with Container Manager (Docker)
- DSLRBooth or compatible photo booth software
- Port 80 available (or customize)

### 1. Build Docker Image

```bash
# Clone repository
git clone https://github.com/anotheryandxter/newbooth-docker-synology.git
cd newbooth-docker-synology

# Build for Synology (linux/amd64)
docker build --platform linux/amd64 -t newbooth:v2.5.2 .

# Export image
docker save newbooth:v2.5.2 | gzip > newbooth-image-v2.5.2.tar.gz
```

### 2. Upload to Synology NAS

**Option A: SCP Upload**
```bash
scp newbooth-image-v2.5.2.tar.gz admin@YOUR_NAS_IP:/volume1/docker/
```

**Option B: Container Manager GUI**
1. Open Container Manager
2. Go to **Registry** → **Image**
3. Click **Add** → **Add from file**
4. Upload the `.tar.gz` file

### 3. Load Image (SSH)

```bash
ssh admin@YOUR_NAS_IP
cd /volume1/docker/
docker load < newbooth-image-v2.5.2.tar.gz
```

### 4. Create Volume Directories

```bash
mkdir -p /volume1/docker/photobooth/data
mkdir -p /volume1/docker/photobooth/uploads
chmod -R 755 /volume1/docker/photobooth/
```

### 5. Run Container

```bash
docker run -d \
  --name photobooth-server \
  --restart unless-stopped \
  -p 80:80 \
  -v /volume1/docker/photobooth/data:/app/data \
  -v /volume1/docker/photobooth/uploads:/app/public/uploads \
  -v /volume1/Photo/Gallery/Photos:/photos \
  -e NODE_ENV=production \
  -e ADMIN_PASSWORD=your_secure_password_here \
  -e SESSION_MAX_AGE_DAYS=7 \
  newbooth:v2.5.2
```

**⚠️ Important:** Replace `/volume1/Photo/Gallery/Photos` with your actual photo booth output folder!

---

## 🎨 Branding Configuration

### 1. Access Admin Panel
```
http://YOUR_NAS_IP/admin
```

### 2. Upload Logo
1. Navigate to **Branding Settings**
2. Click **Upload Logo**
3. Select image (max 10MB)
4. Logo appears on all pages automatically

### 3. Set Hero Image
1. Scroll to **Hero Image (Home Page)**
2. Click **Upload Hero**
3. Upload landscape image (recommended: 1920x600px)
4. Adjust effects:
   - **Brightness**: 0-100% (lower = darker)
   - **Blur**: 0-50px (higher = more blur)
5. Click **Apply Effects**

### 4. Customize Website Name
1. Enter name in **Website Name** field
2. Click **Save Name**
3. Updates all page titles instantly

---

## 📂 Volume Structure

```
/volume1/docker/photobooth/
├── data/
│   └── photobooth.db              # SQLite database
├── uploads/
│   ├── logo-xxxxx.png             # Your brand logo
│   └── hero-xxxxx.jpg             # Hero image

/volume1/Photo/Gallery/Photos/     # Watch folder
├── Session_20251219_100000/       # Auto-detected
│   ├── photo_1.jpg
│   ├── photo_2.jpg
│   └── ...
└── Session_20251219_140000/
    └── ...
```

---

## 🔧 Environment Variables

### Required
| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_PASSWORD` | - | **Required** - Admin panel password |

### Optional
| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Set to `production` for deployment |
| `PORT` | `80` | Server port |
| `SESSION_MAX_AGE_DAYS` | `7` | Days before auto-cleanup |

---

## 📡 Endpoints

### Public
- `GET /` - Homepage with session listings
- `GET /gallery/:sessionId` - Individual gallery view
- `GET /api/health` - Health check endpoint
- `GET /api/branding/settings` - Branding settings (public)

### Admin (Authentication Required)
- `GET /admin` - Admin dashboard
- `POST /api/sessions/rescan/:sessionId` - Rescan session
- `POST /api/branding/upload/logo` - Upload logo
- `POST /api/branding/upload/hero` - Upload hero image
- `POST /api/branding/settings/hero-effects` - Update opacity/blur

---

## 🐳 Docker Commands

### View Logs
```bash
docker logs photobooth-server
docker logs -f photobooth-server  # Follow mode
```

### Check Status
```bash
docker ps | grep photobooth-server
docker inspect photobooth-server
```

### Restart Container
```bash
docker restart photobooth-server
```

### Stop & Remove
```bash
docker stop photobooth-server
docker rm photobooth-server
```

### Update to New Version
```bash
# Load new image
docker load < newbooth-image-vX.X.X.tar.gz

# Stop old container
docker stop photobooth-server
docker rm photobooth-server

# Run new version (use same volumes!)
docker run -d --name photobooth-server ... newbooth:vX.X.X
```

---

## 🛠️ Development

### Local Development
```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your settings
nano .env

# Run development server
npm run dev
```

### Build Scripts
- `npm start` - Start production server
- `npm run dev` - Development with nodemon
- `npm test` - Run tests
- `./build-docker-image.sh` - Build Docker image
- `./test-docker-local.sh` - Test container locally

---

## 📋 Version History

### v2.5.2 (Current)
- ✅ Improved gallery header styling
- ✅ Added padding (40px vertical, 30px horizontal)
- ✅ Rounded corners (16px border-radius)
- ✅ Hero images respect rounded design

### v2.5.1
- ✅ Fixed hero image display on homepage
- ✅ Added image brightness control (0-100%)
- ✅ Added blur intensity control (0-50px)
- ✅ Enhanced text readability on hero backgrounds

### v2.5.0
- ✅ Complete branding system
- ✅ Logo upload and management
- ✅ Website name customization
- ✅ Hero image backgrounds

### v2.4.3
- ✅ Fixed race condition with single-file sessions
- ✅ Tree-based folder scanning
- ✅ Consistency validation

---

## 📸 Screenshots

### Homepage with Branding
![Homepage](docs/images/homepage.png)

### Admin Branding Settings
![Admin Panel](docs/images/admin-branding.png)

### Gallery View
![Gallery](docs/images/gallery-view.png)

---

## 🔍 Troubleshooting

### Container Won't Start
```bash
# Check logs
docker logs photobooth-server

# Verify volumes exist
ls -l /volume1/docker/photobooth/

# Check port conflicts
netstat -tuln | grep :80
```

### Hero Image Not Showing
1. Check upload successful: `ls /volume1/docker/photobooth/uploads/`
2. Verify database: `docker exec photobooth-server cat data/photobooth.db`
3. Clear browser cache (Cmd+Shift+R / Ctrl+Shift+F5)
4. Check console for errors

### Photos Not Detected
1. Verify watch folder path: `-v YOUR_PATH:/photos`
2. Check folder permissions: `chmod -R 755 /volume1/Photo/`
3. Ensure session folders have 2+ files
4. View logs: `docker logs photobooth-server`

---

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file

---

## 🙏 Acknowledgments

- Built for Synology NAS enthusiasts
- Designed for DSLRBooth integration
- Inspired by modern photo booth requirements

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/anotheryandxter/newbooth-docker-synology/issues)
- **Documentation**: See `/docs` folder for detailed guides
- **Updates**: Watch this repository for latest releases

---

## 🎯 Roadmap

- [ ] Multi-language support
- [ ] Social media sharing integration
- [ ] Email gallery links
- [ ] Custom CSS themes
- [ ] Video support enhancement
- [ ] Cloud storage integration

---

**Made with ❤️ for Synology NAS users**

⭐ Star this repo if you find it helpful!
