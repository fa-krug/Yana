/**
 * Generate PNG icons from PNG logo for PWA manifest.
 * Uses Sharp to resize the PNG logo to various sizes.
 */

import sharp from "sharp";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { join } from "path";

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const publicDir = join(process.cwd(), "public");
const iconsDir = join(publicDir, "icons");
const pngPath = join(publicDir, "logo-icon-only.png");

async function generateIcons() {
  if (!existsSync(pngPath)) {
    console.error(`PNG file not found: ${pngPath}`);
    process.exit(1);
  }

  // Ensure icons directory exists
  if (!existsSync(iconsDir)) {
    await mkdir(iconsDir, { recursive: true });
  }

  console.log("Generating icons...");

  for (const size of sizes) {
    // Resize PNG to the target size
    const iconPath = join(iconsDir, `icon-${size}x${size}.png`);
    await sharp(pngPath)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(iconPath);

    console.log(`✓ Generated ${iconPath}`);
  }

  console.log("\nAll icons generated successfully!");
}

generateIcons().catch((error) => {
  console.error("Error generating icons:", error);
  process.exit(1);
});
