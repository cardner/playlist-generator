/**
 * Script to generate PNG icons from SVG for Next.js app icons
 * Requires: sharp (npm install sharp --save-dev)
 * 
 * Run: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

async function generateIcons() {
  try {
    // Check if sharp is available
    let sharp;
    try {
      sharp = require('sharp');
    } catch (e) {
      console.error('Error: sharp package not found. Install it with: npm install sharp --save-dev');
      console.log('\nAlternatively, you can manually convert the SVG files to PNG using an online tool or image editor.');
      console.log('Required sizes:');
      console.log('  - favicon.ico: 32x32 (or use icon.svg)');
      console.log('  - apple-icon.png: 180x180');
      process.exit(1);
    }

    const appDir = path.join(__dirname, '..', 'src', 'app');
    
    // Read SVG files
    const iconSvg = fs.readFileSync(path.join(appDir, 'icon.svg'));
    const appleIconSvg = fs.readFileSync(path.join(appDir, 'apple-icon.svg'));

    // Generate favicon.ico (32x32)
    await sharp(iconSvg)
      .resize(32, 32)
      .png()
      .toFile(path.join(appDir, 'favicon.ico'))
      .catch(() => {
        // If .ico fails, create favicon.png instead
        return sharp(iconSvg)
          .resize(32, 32)
          .png()
          .toFile(path.join(appDir, 'favicon.png'));
      });

    // Generate apple-icon.png (180x180)
    await sharp(appleIconSvg)
      .resize(180, 180)
      .png()
      .toFile(path.join(appDir, 'apple-icon.png'));

    console.log('✅ Icons generated successfully!');
    console.log('  - favicon.ico (or favicon.png)');
    console.log('  - apple-icon.png');
  } catch (error) {
    console.error('Error generating icons:', error.message);
    process.exit(1);
  }
}

generateIcons();

