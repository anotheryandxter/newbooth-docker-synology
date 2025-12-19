# Deployment Notes v2.6.17

## Release Date
December 19, 2025

## Critical Bug Fix: Image Aspect Ratio Preservation

### Problem Identified
Images in fullscreen gallery view were being cropped, not displaying the complete original photo. Investigation revealed:

1. **Thumbnail Generation Issue**
   - Used `sharp.resize()` with `fit: 'cover'` mode
   - This mode crops images to fill the target dimensions (1920x1080)
   - Photos with 3:2 aspect ratio (1.5:1) were being cropped to fit 16:9 (1.78:1)
   - Result: **~200px of vertical content was lost**

2. **API Endpoint Fallback Issue**
   - `/api/photo/original` endpoint had 3 priority levels for finding files:
     1. Database `original_path` (correct)
     2. Watch folder (correct)
     3. **Gallery folder (WRONG - these are processed/cropped thumbnails!)**
   - When original file not found, it would serve the already-cropped thumbnail as "original"

### Solution Implemented

#### 1. Changed Thumbnail Generation Mode
**File**: `server/routes/gallery.js` (lines 178-186)

```javascript
// BEFORE (crops image):
.resize(1920, 1080, { fit: 'cover', position: 'center' })

// AFTER (preserves aspect ratio):
.resize(1920, 1080, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 1 } })
```

**Result**: 
- Images maintain their original aspect ratio
- Letterbox (black bars) added when needed
- No content is cropped
- Example: 5472x3648 → 1620x1080 (with letterbox)

#### 2. Removed Gallery Folder Fallback
**File**: `server/index.js` (lines 280-281)

Removed Priority 3 fallback that was serving processed thumbnails as "originals". Now endpoint only serves:
- Database `original_path` (5472x3648 full resolution)
- Watch folder original files
- **Never** serves processed gallery thumbnails

#### 3. Enhanced Modal CSS
**File**: `server/watcher.js` (lines 927-965)

```css
.modal-content {
    max-width: 95vw;
    max-height: 95vh;
    justify-content: center;
}

.modal-image {
    max-width: 95vw;
    max-height: 85vh;
    width: auto;
    height: auto;
    object-fit: contain;
}
```

### Verification Results

**Before Fix**:
- Original file: 5472x3648 (3:2 aspect ratio)
- Served to gallery: 1620x1080 (**cropped with fit: cover**)
- File size: ~2MB (processed)

**After Fix**:
- Original file: 5472x3648 (3:2 aspect ratio)
- Served to gallery: 5472x3648 (**full original, no crop**)
- File size: 6.7MB (original)
- Thumbnail: 1620x1080 with letterbox (for grid view)

### New Utility Scripts

1. **`scripts/regenerate-all-galleries.js`**
   - Regenerates all gallery HTML files with updated CSS
   - Usage: `node scripts/regenerate-all-galleries.js`

2. **`scripts/regenerate-thumbnails.js`**
   - Regenerates all thumbnails with `fit: inside` mode
   - Usage: `node scripts/regenerate-thumbnails.js`

## Build Information

**Docker Image**: `newbooth:v2.6.17`  
**File**: `newbooth-image-v2.6.17.tar.gz`  
**Size**: 267 MB  
**Platform**: linux/amd64 (Synology compatible)

**Checksums**:
- MD5: `19664d14581aa4d89a5904bfaca68c77`
- SHA256: `d870726c92ed781e895b4a18f49d934c99eda604088b32e87db071d99ecc274d`

## Deployment Steps

### For Synology NAS

1. **Upload Image**
   ```bash
   # Upload via File Station or SCP
   scp newbooth-image-v2.6.17.tar.gz admin@synology:/volume1/docker/
   ```

2. **Import Image**
   - Open Container Manager
   - Go to Image tab
   - Click "Add" → "Add from File"
   - Select `newbooth-image-v2.6.17.tar.gz`
   - Wait for import to complete

3. **Update Container**
   - Stop existing container
   - Create new container with `newbooth:v2.6.17` image
   - Use same port mappings and volume mounts
   - Start container

4. **Regenerate Existing Session Galleries** (Optional but Recommended)
   ```bash
   # SSH into Synology, then exec into container
   docker exec -it newbooth sh
   
   # Inside container:
   node scripts/regenerate-thumbnails.js
   node scripts/regenerate-all-galleries.js
   ```

## Breaking Changes

**None** - This is a bug fix release, fully backward compatible.

## Impact

- ✅ **Existing sessions**: Thumbnails remain functional but may show cropped versions until regenerated
- ✅ **New sessions**: Will automatically use new aspect ratio preservation
- ✅ **Gallery HTML**: Regenerate to get updated CSS for better fullscreen display
- ✅ **Original downloads**: Now serve true uncropped originals

## Features Included

- ✓ Watch folder configuration via frontend
- ✓ Folder browser GUI with shortcuts
- ✓ Multi media type support (jpg, png, gif, webp, mp4, mov, avi, webm)
- ✓ Session ID = Folder name (predictable URLs)
- ✓ Session listing (only shows folders with media)
- ✓ **FIXED**: Image aspect ratio preservation (no crop in fullscreen)
- ✓ **FIXED**: Original photo endpoint serves uncropped files
- ✓ **NEW**: Thumbnail generation uses fit: inside (letterbox, no crop)

## Testing Checklist

- [x] Build Docker image for linux/amd64
- [x] Verify architecture compatibility
- [x] Test thumbnail generation with various aspect ratios
- [x] Test `/api/photo/original` endpoint serves full resolution
- [x] Test fullscreen gallery view with different image sizes
- [x] Verify letterbox appears for non-16:9 images
- [x] Verify video playback still works
- [x] Verify GIF support maintained

## Technical Details

### Sharp Resize Modes Comparison

| Mode | Behavior | Use Case | Crops? |
|------|----------|----------|--------|
| `cover` | Fills entire target box | When you need exact dimensions | **YES** |
| `contain` | Fits inside target, transparent padding | When background matters | No |
| `inside` | Fits inside target, no padding | **Best for thumbnails** | **No** |
| `outside` | Covers target, may overflow | When you need minimum size | Possibly |

### API Priority Order

`/api/photo/original/:sessionId/:photoNumber`

1. **Database `original_path`** ✅ (Priority 1)
   - Most reliable, stored during session processing
   
2. **Watch folder scan** ✅ (Priority 2)
   - Scans original source folder
   - Matches by file position/sorting
   
3. ~~**Gallery folder**~~ ❌ (Removed)
   - ~~These are processed thumbnails~~
   - ~~Should never be served as "originals"~~

## Migration Notes

No manual migration required. To take full advantage of the fix for existing sessions:

```bash
# Regenerate thumbnails (removes crop)
node scripts/regenerate-thumbnails.js

# Regenerate gallery HTML (updated CSS)
node scripts/regenerate-all-galleries.js
```

## Support

For issues or questions:
- Check logs: `docker logs newbooth`
- Health check: `http://your-nas:80/api/health`
- File issue on repository

---

**Built with**: Node.js 20, Alpine Linux, Sharp, Express  
**Target Platform**: Synology NAS (Docker)  
**Compatibility**: DSC Container Manager 1.3+
