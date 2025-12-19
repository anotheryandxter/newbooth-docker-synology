# Deployment Guide - NewBooth v2.6.15

**Release Date:** December 19, 2025  
**Docker Platform:** linux/amd64 (Synology NAS)

## 🎉 What's New in v2.6.15

### Critical Fixes
- **v2.6.15**: Fixed session list error (removed storage-used reference)
- **v2.6.14**: Responsive layout improvements for branding settings
- **v2.6.13**: Added customizable footer text feature
- **v2.6.12**: UI cleanup - removed storage and health info cards
- **v2.6.11**: Fixed health check storage calculation
- **v2.6.10**: Fixed health check SQL query
- **v2.6.9**: Fixed session photos modal video/GIF support
- **v2.6.8**: Fixed mediaType/fileExtension in database fallback

### New Features
✅ **Footer Text Customization** (v2.6.13)
- Customizable footer text di admin dashboard
- Tampil di semua halaman (home, admin, gallery)
- Max 200 karakter
- Default: "Powered by PhotoBooth"

✅ **Video & GIF Support** (v2.6.0-v2.6.9)
- Support format: MP4, MOV, AVI, WEBM, GIF
- Video player dengan controls di gallery modal
- Download dengan extension yang benar (.mp4, .gif, dll)
- Thumbnail preview untuk video files

✅ **Responsive Design** (v2.6.14)
- Branding settings layout optimized untuk semua ukuran layar
- Touch-friendly buttons (min-width 140px)
- Stack layout untuk mobile devices
- Grid system untuk preview images

### Bug Fixes
✅ Session list loading error (v2.6.15)
✅ Storage calculation error (v2.6.11)
✅ Health check SQL errors (v2.6.10)
✅ Video modal display issues (v2.6.9)
✅ Download file extensions (v2.6.7)

## 📦 File Information

**Image File:** `newbooth-image-v2.6.15.tar.gz`  
**Size:** 268 MB  
**Platform:** linux/amd64

### Checksums
```
SHA256: bca011bfcaf0a62a57b463550fd635c9ad14936db7b5055c9cc685063d07166d
MD5: 7a5fb0ecafb2d0de9714e8f37290662a
```

## 🚀 Deployment Steps for Synology NAS

### 1. Upload Image File
1. Transfer `newbooth-image-v2.6.15.tar.gz` ke Synology NAS
2. Simpan di folder yang mudah diakses (misal: `/volume1/docker/`)

### 2. Import Docker Image

#### Via Container Manager (GUI):
1. Buka **Container Manager**
2. Pilih **Image** tab
3. Klik **Add** → **Add from File**
4. Browse dan pilih `newbooth-image-v2.6.15.tar.gz`
5. Tunggu proses import selesai
6. Verify image muncul dengan tag `newbooth:v2.6.15`

#### Via SSH Terminal:
```bash
# Import image
gunzip -c /volume1/docker/newbooth-image-v2.6.15.tar.gz | docker load

# Verify image
docker images | grep newbooth
```

### 3. Stop & Remove Old Container
```bash
# Stop container
docker stop newbooth-container

# Remove old container
docker rm newbooth-container

# (Optional) Remove old image
docker rmi newbooth:v2.6.14
```

### 4. Create New Container

#### Environment Variables (.env):
```bash
NODE_ENV=production
PORT=80
ADMIN_PASSWORD=your_secure_password_here
LUMA_PHOTOS_FOLDER=/photos
SESSION_AUTO_DELETE_DAYS=7
```

#### Docker Run Command:
```bash
docker run -d \
  --name newbooth-container \
  --restart unless-stopped \
  -p 80:80 \
  -v /volume1/photos/photobooth:/photos \
  -v /volume1/docker/newbooth/database:/app/database \
  -v /volume1/docker/newbooth/public:/app/public \
  -e NODE_ENV=production \
  -e PORT=80 \
  -e ADMIN_PASSWORD=your_password \
  -e LUMA_PHOTOS_FOLDER=/photos \
  -e SESSION_AUTO_DELETE_DAYS=7 \
  newbooth:v2.6.15
```

#### Via Container Manager (Recommended):
1. Klik **Container** tab
2. Klik **Create** → **Create Container**
3. Select image: `newbooth:v2.6.15`
4. Configure:
   - **Container Name:** newbooth-container
   - **Port:** 80 → 80 (Local Port → Container Port)
   - **Restart Policy:** Always
5. Add volumes:
   - `/volume1/photos/photobooth` → `/photos`
   - `/volume1/docker/newbooth/database` → `/app/database`
   - `/volume1/docker/newbooth/public` → `/app/public`
6. Add environment variables (lihat di atas)
7. Click **Apply** → **Done**

### 5. Verify Deployment
```bash
# Check container status
docker ps | grep newbooth

# Check logs
docker logs -f newbooth-container

# Test endpoint
curl http://localhost/api/health
```

### 6. Access Application
- **Homepage:** http://YOUR_NAS_IP
- **Admin Panel:** http://YOUR_NAS_IP/admin
- **Gallery:** http://YOUR_NAS_IP/gallery/{sessionId}

## 🔧 Configuration

### Watch Folder Setup
1. Login ke Admin Panel
2. Navigate ke **Pengaturan Watch Folder**
3. Set path: `/photos` (sesuai dengan volume mount)
4. Klik **Update Path**

### Branding Customization
1. Login ke Admin Panel
2. Navigate ke **Pengaturan Branding**
3. Customize:
   - Website Name
   - Logo (PNG/SVG recommended)
   - Hero Image (1920x600px landscape)
   - Hero Effects (brightness & blur)
   - Footer Text (max 200 chars)

### Footer Text Example
Default: "Powered by PhotoBooth"
Custom: "Made with ❤️ by Reflection Photography"

## 📊 Database Migration

Database akan otomatis di-migrate saat container start. Changes:
- Added `footer_text` column to `global_settings`
- Added `mediaType` and `fileExtension` detection in photos table

## 🐛 Troubleshooting

### Container won't start
```bash
# Check logs
docker logs newbooth-container

# Check permissions
ls -la /volume1/docker/newbooth/database
```

### Photos not appearing
```bash
# Verify watch folder mount
docker exec newbooth-container ls -la /photos

# Check watcher logs
docker logs newbooth-container | grep "File Watcher"
```

### Video files not playing
1. Check browser console for errors
2. Verify video format (MP4, MOV, AVI, WEBM)
3. Check file permissions in gallery folder
4. Clear browser cache

### Session list error
- Fixed in v2.6.15
- Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+F5)

## 📝 Admin Login

**Default Credentials:**
- Username: `admin`
- Password: (set via ADMIN_PASSWORD environment variable)

⚠️ **Security:** Always change default password in production!

## 🔄 Rollback Plan

If issues occur:
```bash
# Stop new container
docker stop newbooth-container
docker rm newbooth-container

# Start old version (if still available)
docker run -d --name newbooth-container ... newbooth:v2.6.14
```

## 📞 Support

For issues or questions:
- GitHub: https://github.com/anotheryandxter/newbooth-docker-synology
- Check logs: `docker logs -f newbooth-container`
- Health check: `http://YOUR_NAS_IP/api/health`

## ✅ Post-Deployment Checklist

- [ ] Container running (`docker ps`)
- [ ] Health check passing (`/api/health`)
- [ ] Admin panel accessible
- [ ] Watch folder configured
- [ ] Video/GIF files display correctly
- [ ] Footer text visible on all pages
- [ ] Session list loading properly
- [ ] Photos can be downloaded
- [ ] Gallery modal working
- [ ] Responsive layout on mobile devices

---

**Version:** 2.6.15  
**Build Date:** December 19, 2025  
**Platform:** linux/amd64  
**Node.js:** 20-alpine
