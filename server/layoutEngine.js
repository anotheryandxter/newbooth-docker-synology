const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Calculate photo dimensions based on ratio and canvas size
 */
function calculatePhotoDimensions(ratio, gridRows, gridCols, canvasWidth, canvasHeight, spacing, padding) {
  const [ratioW, ratioH] = ratio.split(':').map(Number);
  
  const availableWidth = canvasWidth - (2 * padding) - ((gridCols - 1) * spacing);
  const availableHeight = canvasHeight - (2 * padding) - ((gridRows - 1) * spacing);
  
  const cellWidth = Math.floor(availableWidth / gridCols);
  const cellHeight = Math.floor(availableHeight / gridRows);
  
  // Calculate photo size maintaining aspect ratio
  let photoWidth, photoHeight;
  
  if (ratioW / ratioH > cellWidth / cellHeight) {
    photoWidth = cellWidth;
    photoHeight = Math.floor(cellWidth * ratioH / ratioW);
  } else {
    photoHeight = cellHeight;
    photoWidth = Math.floor(cellHeight * ratioW / ratioH);
  }
  
  return { photoWidth, photoHeight, cellWidth, cellHeight };
}

/**
 * Create dynamic grid layout
 */
async function createDynamicGridLayout(photos, gridConfig, db) {
  // Parse grid config if it's a string (from database)
  const config = typeof gridConfig === 'string' ? JSON.parse(gridConfig) : gridConfig;
  
  // Get grid layout from database
  const gridLayout = db.prepare('SELECT * FROM grid_layouts WHERE id = ?').get(config.grid_layout_id);
  
  if (!gridLayout) {
    throw new Error('Grid layout not found');
  }
  
  const {
    grid_rows,
    grid_cols,
    canvas_width,
    canvas_height,
    photo_ratio,
    spacing,
    padding,
    background_color
  } = gridLayout;
  
  // Parse background color
  const bgColor = hexToRgb(background_color);
  
  // Create base canvas
  const baseImage = sharp({
    create: {
      width: canvas_width,
      height: canvas_height,
      channels: 3,
      background: bgColor
    }
  });
  
  // Calculate photo dimensions
  const { photoWidth, photoHeight, cellWidth, cellHeight } = calculatePhotoDimensions(
    photo_ratio,
    grid_rows,
    grid_cols,
    canvas_width,
    canvas_height,
    spacing,
    padding
  );
  
  // Calculate total photos needed
  const totalPhotos = grid_rows * grid_cols;
  const photosToUse = photos.slice(0, totalPhotos);
  
  // Create composite array
  let composite = [];
  
  for (let row = 0; row < grid_rows; row++) {
    for (let col = 0; col < grid_cols; col++) {
      const index = row * grid_cols + col;
      
      if (index >= photosToUse.length) break;
      
      // Calculate position
      const x = padding + (col * (cellWidth + spacing)) + Math.floor((cellWidth - photoWidth) / 2);
      const y = padding + (row * (cellHeight + spacing)) + Math.floor((cellHeight - photoHeight) / 2);
      
      // Resize and add photo
      const resized = await sharp(photosToUse[index].processed_path)
        .resize(photoWidth, photoHeight, { fit: 'cover' })
        .toBuffer();
      
      composite.push({
        input: resized,
        left: x,
        top: y
      });
    }
  }
  
  // Apply overlay if configured
  if (config.overlay_id) {
    const overlay = db.prepare('SELECT * FROM overlay_assets WHERE id = ?').get(config.overlay_id);
    
    if (overlay && overlay.is_active && fs.existsSync(path.join(__dirname, '../public', overlay.file_path))) {
      const overlayBuffer = await applyOverlay(
        canvas_width,
        canvas_height,
        overlay,
        path.join(__dirname, '../public', overlay.file_path)
      );
      
      if (overlayBuffer) {
        composite.push(overlayBuffer);
      }
    }
  }
  
  return baseImage.composite(composite);
}

/**
 * Apply overlay/watermark to the composite
 */
async function applyOverlay(canvasWidth, canvasHeight, overlay, overlayPath) {
  try {
    const { position, opacity, scale, offset_x, offset_y } = overlay;
    
    // Load and process overlay image
    const overlayImage = sharp(overlayPath);
    const metadata = await overlayImage.metadata();
    
    // Calculate scaled dimensions
    const scaledWidth = Math.floor(metadata.width * scale);
    const scaledHeight = Math.floor(metadata.height * scale);
    
    // Resize and adjust opacity
    let processedOverlay = await overlayImage
      .resize(scaledWidth, scaledHeight)
      .toBuffer();
    
    // Calculate position
    let left, top;
    
    switch (position) {
      case 'top-left':
        left = 20 + offset_x;
        top = 20 + offset_y;
        break;
      case 'top-right':
        left = canvasWidth - scaledWidth - 20 + offset_x;
        top = 20 + offset_y;
        break;
      case 'bottom-left':
        left = 20 + offset_x;
        top = canvasHeight - scaledHeight - 20 + offset_y;
        break;
      case 'bottom-right':
        left = canvasWidth - scaledWidth - 20 + offset_x;
        top = canvasHeight - scaledHeight - 20 + offset_y;
        break;
      case 'center':
        left = Math.floor((canvasWidth - scaledWidth) / 2) + offset_x;
        top = Math.floor((canvasHeight - scaledHeight) / 2) + offset_y;
        break;
      default:
        left = canvasWidth - scaledWidth - 20 + offset_x;
        top = canvasHeight - scaledHeight - 20 + offset_y;
    }
    
    return {
      input: processedOverlay,
      left: Math.max(0, left),
      top: Math.max(0, top),
      blend: opacity < 1.0 ? 'over' : 'over'
    };
  } catch (error) {
    console.error('Error applying overlay:', error);
    return null;
  }
}

/**
 * Convert hex color to RGB object
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 };
}

/**
 * Legacy layout support for backward compatibility
 */
async function createLegacyLayout(photos, layoutName, db) {
  // For old layouts without grid config, use default presets
  const presets = {
    'grid2x2': 1, // 2x2 Classic
    'single_large': 8, // Single Portrait
    'overlay_branded': 8 // Single Portrait with overlay
  };
  
  const layoutId = presets[layoutName] || 1;
  const gridLayout = db.prepare('SELECT * FROM grid_layouts WHERE id = ?').get(layoutId);
  
  const config = {
    grid_layout_id: layoutId,
    overlay_id: layoutName === 'overlay_branded' ? getDefaultOverlay(db) : null
  };
  
  return createDynamicGridLayout(photos, config, db);
}

/**
 * Get default overlay if exists
 */
function getDefaultOverlay(db) {
  const overlay = db.prepare('SELECT id FROM overlay_assets WHERE is_active = 1 AND type = ? LIMIT 1')
    .get('logo');
  return overlay ? overlay.id : null;
}

module.exports = {
  createDynamicGridLayout,
  createLegacyLayout,
  applyOverlay,
  calculatePhotoDimensions
};
