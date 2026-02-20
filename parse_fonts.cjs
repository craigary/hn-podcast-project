const fs = require('fs');
const path = require('path');

const cssContent = fs.readFileSync('apps/web/public/font/chill-jinshusong/result.css', 'utf8');

const regex = /@font-face\s*{([^}]+)}/g;
const variants = [];

let match;
while ((match = regex.exec(cssContent)) !== null) {
  const block = match[1];
  const srcMatch = block.match(/url\(['"]?(\.\/[^'"]+)['"]?\)/);
  const rangeMatch = block.match(/unicode-range:\s*([^;]+);/);

  if (srcMatch && rangeMatch) {
    const src = srcMatch[1].replace('./', './src/assets/fonts/chill-jinshusong/');
    const range = rangeMatch[1].replace(/\s+/g, ' ').trim();

    variants.push({
        weight: 400,
        style: "normal",
        display: "swap",
        src: [src],
        unicodeRange: range.split(', ')
    });
  }
}

console.log(JSON.stringify(variants, null, 2));
