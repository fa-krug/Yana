/**
 * Generate PNG icons from SVG logo for PWA manifest.
 * Uses Playwright to render SVG and capture screenshots.
 */

import { chromium } from 'playwright';
import { writeFile, mkdir, readFileSync } from 'fs';
import { existsSync } from 'fs';
import { join } from 'path';

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const publicDir = join(process.cwd(), 'public');
const iconsDir = join(publicDir, 'icons');
const svgPath = join(publicDir, 'logo-icon-only.svg');

async function generateIcons() {
  if (!existsSync(svgPath)) {
    console.error(`SVG file not found: ${svgPath}`);
    process.exit(1);
  }

  // Read SVG content
  const svgContent = readFileSync(svgPath, 'utf-8');

  // Ensure icons directory exists
  if (!existsSync(iconsDir)) {
    await mkdir(iconsDir, { recursive: true });
  }

  // Launch browser
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log('Generating icons...');

  for (const size of sizes) {
    // Set viewport to match icon size
    await page.setViewportSize({ width: size, height: size });

    // Create HTML with SVG
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 0;
              width: ${size}px;
              height: ${size}px;
              display: flex;
              align-items: center;
              justify-content: center;
              background: transparent;
            }
            svg {
              width: ${size}px;
              height: ${size}px;
            }
          </style>
        </head>
        <body>
          ${svgContent}
        </body>
      </html>
    `;

    await page.setContent(html);
    await page.waitForTimeout(100); // Wait for render

    // Take screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      omitBackground: true,
    });

    // Save icon
    const iconPath = join(iconsDir, `icon-${size}x${size}.png`);
    await writeFile(iconPath, screenshot);
    console.log(`✓ Generated ${iconPath}`);
  }

  await browser.close();
  console.log('\nAll icons generated successfully!');
}

generateIcons().catch((error) => {
  console.error('Error generating icons:', error);
  process.exit(1);
});
