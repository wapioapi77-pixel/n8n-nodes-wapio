const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyMatchingFiles(srcDir, destDir, pattern) {
  if (!fs.existsSync(srcDir)) return;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyMatchingFiles(srcPath, destPath, pattern);
    } else if (pattern.test(entry.name)) {
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

// Copy icons
copyDir(path.join(rootDir, 'icons'), path.join(distDir, 'icons'));

// Copy .node.json files
copyMatchingFiles(path.join(rootDir, 'nodes'), path.join(distDir, 'nodes'), /\.node\.json$/);

console.log('✅ Successfully copied icons and .node.json metadata to dist/');
