import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const uploadedDir = 'C:/Users/phuga/.gemini/antigravity/brain/b4e359ce-5bf8-47b5-b9d8-0d8e4e905343/.user_uploaded';
const outputDir = 'd:/College/Practice/loopicafe-management-system/public/mascots';

async function removeGreen(inputPath, outputPath) {
  console.log(`Processing: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  let transparentPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const maxRB = Math.max(r, b);
    const greenDiff = g - maxRB;

    // Chroma key green background detection
    if (g > 90 && greenDiff > 20) {
      if (greenDiff > 50 || (g > 150 && r < 130 && b < 130)) {
        // Full transparency
        data[i + 3] = 0;
        transparentPixels++;
      } else {
        // Soft edge anti-aliasing / despill
        const alphaFraction = 1 - (greenDiff - 20) / 30;
        const alpha = Math.max(0, Math.min(255, Math.round(alphaFraction * 255)));
        data[i + 3] = alpha;

        // Remove green fringe on outline
        data[i + 1] = maxRB;
        if (alpha < 30) transparentPixels++;
      }
    }
  }

  console.log(`  Made ${transparentPixels}/${width * height} pixels transparent`);

  await sharp(data, {
    raw: { width, height, channels: 4 }
  })
    .png()
    .toFile(outputPath);

  console.log(`  Saved to ${outputPath}`);
}

async function run() {
  const files = fs.readdirSync(uploadedDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
  console.log('Found uploaded files:', files);

  // Map each file sorted by name or timestamp
  // media__1785512118784 = input_file_0 (panicked)
  // media__1785512124661 = input_file_1 (investigating)
  // media__1785512358705 = input_file_2 (sleeping)
  // media__1785512358724 = input_file_3 (thinking)
  // media__1785512358738 = input_file_4 (crying)

  const mapping = [
    { src: 'media__1785512118784.jpg', out: 'loopy-panicked.png' },
    { src: 'media__1785512124661.jpg', out: 'loopy-investigating.png' },
    { src: 'media__1785512358705.jpg', out: 'loopy-sleeping.png' },
    { src: 'media__1785512358724.jpg', out: 'loopy-thinking.png' },
    { src: 'media__1785512358738.jpg', out: 'loopy-crying.png' },
  ];

  for (const item of mapping) {
    const fullInput = path.join(uploadedDir, item.src);
    const fullOutput = path.join(outputDir, item.out);
    if (fs.existsSync(fullInput)) {
      await removeGreen(fullInput, fullOutput);
    } else {
      console.warn(`File missing: ${fullInput}`);
    }
  }
}

run().catch(console.error);
