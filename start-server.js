// start-server.js - Production startup script for Synology
const path = require('path');
const fs = require('fs');

console.log('='.repeat(60));
console.log('🚀 Photobooth Server - Starting...');
console.log('='.repeat(60));

// Check environment
console.log('📍 Working directory:', __dirname);
console.log('📍 Node version:', process.version);
console.log('📍 Platform:', process.platform);
console.log('📍 PID:', process.pid);

// Load environment variables
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log('✅ Environment variables loaded from .env');
} else {
  console.warn('⚠️  .env file not found! Using defaults...');
}

// Log configuration
console.log('\n⚙️  Configuration:');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('   PORT:', process.env.PORT || 3000);
console.log('   LOCAL_IP:', process.env.LOCAL_IP || 'localhost');

// Check required files
const requiredFiles = [
  'package.json',
  'server/index.js',
  'server/database.js'
];

console.log('\n🔍 Checking required files...');
let allFilesExist = true;

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`   ✓ ${file}`);
  } else {
    console.error(`   ✗ ${file} - NOT FOUND!`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  console.error('\n❌ Some required files are missing!');
  console.error('Please make sure all project files are uploaded.');
  process.exit(1);
}

// Check node_modules
const nodeModulesPath = path.join(__dirname, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  console.error('\n❌ node_modules not found!');
  console.error('Please run: node install-deps.js');
  process.exit(1);
}
console.log('   ✓ node_modules');

// Create necessary directories
const requiredDirs = [
  'public/gallery',
  'public/galleries',
  'public/qr',
  'database',
  'logs',
  'temp',
  'backups'
];

console.log('\n📁 Checking/creating directories...');
requiredDirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`   + Created: ${dir}`);
  } else {
    console.log(`   ✓ ${dir}`);
  }
});

console.log('\n' + '='.repeat(60));
console.log('🎯 Starting main application...');
console.log('='.repeat(60) + '\n');

// Start main server
try {
  require('./server/index.js');
} catch (error) {
  console.error('\n' + '='.repeat(60));
  console.error('❌ FATAL ERROR - Server failed to start');
  console.error('='.repeat(60));
  console.error('Error:', error.message);
  console.error('\nStack trace:');
  console.error(error.stack);
  console.error('='.repeat(60));
  process.exit(1);
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT received, shutting down gracefully...');
  process.exit(0);
});
