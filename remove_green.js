import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const inputPath = 'C:/Users/phuga/.gemini/antigravity/brain/2bcc2874-cb27-479f-ba3e-05301bd5da85/.user_uploaded/media__1785432612097.jpg';
const outputPath = 'd:/College/Practice/loopicafe-management-system/public/loopy-hero-hd.png';

async function processImage() {
  console.log('Reading image with sharp:', inputPath);
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  console.log(`Image dimensions: ${width}x${height}`);

  let transparentPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const maxRB = Math.max(r, b);
    const greenDiff = g - maxRB;

    // Chroma key green background detection
    if (g > 95 && greenDiff > 25) {
      if (greenDiff > 55 || (g > 160 && r < 120 && b < 120)) {
        // Full transparency
        data[i + 3] = 0;
        transparentPixels++;
      } else {
        // Soft edge anti-aliasing / despill
        const alphaFraction = 1 - (greenDiff - 25) / 30;
        const alpha = Math.max(0, Math.min(255, Math.round(alphaFraction * 255)));
        data[i + 3] = alpha;

        // Remove green fringe on outline
        data[i + 1] = maxRB;
        if (alpha < 30) transparentPixels++;
      }
    }
  }

  console.log(`Made ${transparentPixels} pixels transparent out of ${width * height}`);

  await sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png()
    .toFile(outputPath);

  console.log('Saved transparent PNG to:', outputPath);
}

processImage().catch(console.error);
