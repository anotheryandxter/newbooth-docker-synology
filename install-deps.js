// install-deps.js - Helper script untuk install dependencies via WebStation
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('='.repeat(60));
console.log('📦 Photobooth Dependencies Installer');
console.log('='.repeat(60));
console.log('Current directory:', __dirname);
console.log('Node version:', process.version);
console.log('Platform:', process.platform);
console.log('='.repeat(60));

try {
  // Check if package.json exists
  const packagePath = path.join(__dirname, 'package.json');
  if (!fs.existsSync(packagePath)) {
    throw new Error('❌ package.json not found! Make sure you are in the project root.');
  }
  
  console.log('\n✅ package.json found');
  
  // Check if node_modules already exists
  const nodeModulesPath = path.join(__dirname, 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    console.log('⚠️  node_modules folder already exists, will reinstall...\n');
  }
  
  // Install production dependencies
  console.log('🔄 Running npm install --production...\n');
  console.log('-'.repeat(60));
  
  execSync('npm install --production', { 
    stdio: 'inherit',
    cwd: __dirname 
  });
  
  console.log('-'.repeat(60));
  console.log('\n✅ Dependencies installed successfully!');
  
  // List installed packages
  console.log('\n📋 Installed packages:');
  const pkg = require('./package.json');
  const deps = pkg.dependencies || {};
  
  Object.keys(deps).forEach(dep => {
    try {
      const depPkg = require(path.join(__dirname, 'node_modules', dep, 'package.json'));
      console.log(`  ✓ ${dep}@${depPkg.version}`);
    } catch (e) {
      console.log(`  ✓ ${dep}@${deps[dep]}`);
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 Installation complete!');
  console.log('='.repeat(60));
  console.log('\nNext steps:');
  console.log('1. Create .env file (copy from .env.example)');
  console.log('2. Start server: node start-server.js');
  console.log('3. Or setup Web Station portal');
  console.log('='.repeat(60));
  
  process.exit(0);
  
} catch (error) {
  console.error('\n' + '='.repeat(60));
  console.error('❌ ERROR installing dependencies');
  console.error('='.repeat(60));
  console.error('Error message:', error.message);
  console.error('\nPossible solutions:');
  console.error('1. Make sure Node.js is installed');
  console.error('2. Check internet connection');
  console.error('3. Try running: npm cache clean --force');
  console.error('4. Check if npm registry is accessible');
  console.error('='.repeat(60));
  process.exit(1);
}
