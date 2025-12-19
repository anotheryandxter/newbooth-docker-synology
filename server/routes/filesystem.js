const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = function() {
  const router = express.Router();

  // Get directory listing
  router.post('/browse', async (req, res) => {
    try {
      const { dirPath } = req.body;
      const targetPath = dirPath || '/';

      // Security: Prevent access to sensitive system directories
      const blacklist = ['/etc', '/root', '/boot', '/sys', '/proc', '/dev'];
      if (blacklist.some(blocked => targetPath.startsWith(blocked))) {
        return res.status(403).json({ error: 'Access to this directory is restricted' });
      }

      // Check if path exists and is directory
      if (!fs.existsSync(targetPath)) {
        return res.status(404).json({ error: 'Directory not found' });
      }

      const stats = fs.statSync(targetPath);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'Path is not a directory' });
      }

      // Read directory contents
      const entries = fs.readdirSync(targetPath);
      const directories = [];

      for (const entry of entries) {
        try {
          const fullPath = path.join(targetPath, entry);
          const entryStat = fs.statSync(fullPath);
          
          if (entryStat.isDirectory()) {
            // Check if directory is readable
            try {
              fs.accessSync(fullPath, fs.constants.R_OK);
              directories.push({
                name: entry,
                path: fullPath,
                isHidden: entry.startsWith('.')
              });
            } catch (e) {
              // Skip unreadable directories
            }
          }
        } catch (e) {
          // Skip entries that can't be accessed
        }
      }

      // Sort: non-hidden first, then alphabetically
      directories.sort((a, b) => {
        if (a.isHidden !== b.isHidden) {
          return a.isHidden ? 1 : -1;
        }
        return a.name.localeCompare(b.name);
      });

      res.json({
        currentPath: targetPath,
        parentPath: path.dirname(targetPath),
        directories: directories,
        canGoUp: targetPath !== '/'
      });
    } catch (error) {
      console.error('❌ Error browsing directory:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get common root paths (shortcuts)
  router.get('/roots', async (req, res) => {
    try {
      const roots = [];
      const platform = os.platform();

      if (platform === 'darwin') {
        // macOS
        roots.push(
          { name: 'Home', path: os.homedir(), icon: 'fa-house' },
          { name: 'Desktop', path: path.join(os.homedir(), 'Desktop'), icon: 'fa-desktop' },
          { name: 'Documents', path: path.join(os.homedir(), 'Documents'), icon: 'fa-file-lines' },
          { name: 'Downloads', path: path.join(os.homedir(), 'Downloads'), icon: 'fa-download' },
          { name: 'Pictures', path: path.join(os.homedir(), 'Pictures'), icon: 'fa-images' },
          { name: 'Root', path: '/', icon: 'fa-hard-drive' }
        );
      } else if (platform === 'linux') {
        // Linux / Synology
        roots.push(
          { name: 'Home', path: os.homedir(), icon: 'fa-house' },
          { name: 'Root', path: '/', icon: 'fa-hard-drive' }
        );
        
        // Check for common Synology volume paths
        if (fs.existsSync('/volume1')) {
          roots.push({ name: 'Volume 1', path: '/volume1', icon: 'fa-database' });
        }
        if (fs.existsSync('/volume2')) {
          roots.push({ name: 'Volume 2', path: '/volume2', icon: 'fa-database' });
        }
        
        // Check for common mount points
        if (fs.existsSync('/mnt')) {
          roots.push({ name: 'Mounts', path: '/mnt', icon: 'fa-folder' });
        }
        if (fs.existsSync('/app')) {
          roots.push({ name: 'App', path: '/app', icon: 'fa-box' });
        }
      } else if (platform === 'win32') {
        // Windows (for WSL or native Windows)
        roots.push(
          { name: 'Home', path: os.homedir(), icon: 'fa-house' },
          { name: 'C:\\', path: 'C:\\', icon: 'fa-hard-drive' }
        );
      }

      // Filter roots that actually exist
      const validRoots = roots.filter(root => {
        try {
          return fs.existsSync(root.path);
        } catch {
          return false;
        }
      });

      res.json({ roots: validRoots });
    } catch (error) {
      console.error('❌ Error getting root paths:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create new directory
  router.post('/mkdir', async (req, res) => {
    try {
      const { parentPath, folderName } = req.body;

      if (!parentPath || !folderName) {
        return res.status(400).json({ error: 'Parent path and folder name required' });
      }

      // Validate folder name (no special chars, no path traversal)
      if (!/^[a-zA-Z0-9_\-\s]+$/.test(folderName)) {
        return res.status(400).json({ error: 'Invalid folder name. Use only letters, numbers, spaces, hyphens, and underscores.' });
      }

      const newPath = path.join(parentPath, folderName);

      if (fs.existsSync(newPath)) {
        return res.status(409).json({ error: 'Folder already exists' });
      }

      fs.mkdirSync(newPath, { recursive: true });
      console.log('📁 Created directory:', newPath);

      res.json({ 
        success: true, 
        message: 'Directory created successfully',
        path: newPath 
      });
    } catch (error) {
      console.error('❌ Error creating directory:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
