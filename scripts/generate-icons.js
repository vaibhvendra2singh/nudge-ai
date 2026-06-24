import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const outDir = path.join(process.cwd(), 'public', 'icons');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function generate() {
  for (const size of sizes) {
    const rounded = size * 0.22;
    const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${rounded}" ry="${rounded}" fill="#000000" />
      <text x="50%" y="54%" font-family="Times New Roman, Times, serif" font-weight="900" font-size="${size * 0.65}px" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">N</text>
    </svg>
    `;
    
    await sharp(Buffer.from(svg))
      .png()
      .toFile(path.join(outDir, `icon-${size}x${size}.png`));
    console.log(`Generated ${size}x${size}`);
  }
}

generate().catch(console.error);
