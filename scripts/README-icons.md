# Icon Generation

The app uses the new Yana logo in multiple formats:

- **SVG logos**: `public/logo.svg`, `public/logo-wordmark.svg`, `public/logo-icon-only.svg`
- **Favicon**: `public/favicon.svg` (used in `src/index.html`)
- **PWA Icons**: PNG files in `public/icons/` (for web manifest)

## Generating PNG Icons

To generate PNG icons from the SVG logo for the PWA manifest, run:

```bash
npm run icons:generate
```

This script uses Playwright to render the SVG and generate PNG files at the following sizes:
- 72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512

The generated icons will be saved to `public/icons/` and are referenced in `public/manifest.webmanifest`.

## Manual Generation (Alternative)

If the script doesn't work, you can generate icons manually:

1. Open `public/logo-icon-only.svg` in a browser or image editor
2. Export as PNG at the required sizes
3. Save to `public/icons/icon-{size}x{size}.png`

## Favicon

The app uses `favicon.svg` for modern browsers. For older browsers, you may want to create a `favicon.ico` file. You can generate this using online tools or image conversion software.
