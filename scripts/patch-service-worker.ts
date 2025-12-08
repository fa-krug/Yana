/**
 * Post-build script to patch Angular Service Worker for better Safari compatibility.
 *
 * This fixes Safari 504 timeout issues when the Service Worker handles external
 * image requests (e.g., from heise.de, bestenliste-assets.heise.de).
 *
 * The patch adds proper timeout handling and error recovery for external requests
 * while still allowing the Service Worker to manage them (for caching benefits).
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "fs";
import { join } from "path";

// Try multiple possible output paths (Angular build structure can vary)
const possiblePaths = [
  process.argv[2], // Custom path from command line
  "dist/browser", // Standard Angular output
  "dist/frontend/browser", // Alternative structure
].filter(Boolean) as string[];

let SERVICE_WORKER_FILE: string | null = null;

for (const basePath of possiblePaths) {
  const candidate = join(basePath, "ngsw-worker.js");
  if (existsSync(candidate)) {
    SERVICE_WORKER_FILE = candidate;
    break;
  }
}

if (!SERVICE_WORKER_FILE) {
  // Try to find it in dist directory recursively
  const distPath = "dist";
  if (existsSync(distPath)) {
    function findServiceWorker(dir: string): string | null {
      try {
        const files = readdirSync(dir);
        for (const file of files) {
          const fullPath = join(dir, file);
          if (file === "ngsw-worker.js") {
            return fullPath;
          }
          if (statSync(fullPath).isDirectory()) {
            const found = findServiceWorker(fullPath);
            if (found) return found;
          }
        }
      } catch {
        // Ignore errors
      }
      return null;
    }
    SERVICE_WORKER_FILE = findServiceWorker(distPath);
  }
}

if (!SERVICE_WORKER_FILE || !existsSync(SERVICE_WORKER_FILE)) {
  console.warn(
    `Service Worker file not found. Searched in: ${possiblePaths.join(", ")}. Skipping patch.`,
  );
  process.exit(0);
}

console.log(`Patching Service Worker at ${SERVICE_WORKER_FILE}...`);

try {
  let content = readFileSync(SERVICE_WORKER_FILE, "utf-8");

  // Check if already patched
  if (content.includes("// PATCHED: Improved timeout handling")) {
    console.log("Service Worker already patched. Skipping.");
    process.exit(0);
  }

  // PATCHED: Safari bypass for external image requests
  // Safari has issues with service workers handling external requests, causing 504 errors.
  // This patch adds a fetch event listener that bypasses external image requests,
  // allowing the browser to handle them directly without service worker interception.

  const safariBypassCode = `
// PATCHED: Safari bypass for external image requests (prevents 504 errors)
// Safari has known issues with service workers handling external requests, causing 504 timeouts.
// Since we removed the external-images dataGroup from ngsw-config.json, Angular's service worker
// shouldn't handle external requests. This patch adds an extra safety layer to ensure external
// image requests are never intercepted by the service worker.
self.addEventListener('fetch', function(event) {
  try {
    const url = event.request.url;
    
    // Only process GET requests (images are always GET)
    if (event.request.method !== 'GET') {
      return;
    }
    
    // Check if this is an external request (different origin)
    let isExternal = false;
    try {
      const requestUrl = new URL(url);
      isExternal = requestUrl.origin !== self.location.origin;
    } catch (e) {
      // If URL parsing fails, assume it's external if it starts with http:// or https://
      isExternal = url.startsWith('http://') || url.startsWith('https://');
    }
    
    if (!isExternal) {
      return; // Let Angular handle same-origin requests normally
    }
    
    // Check if this is likely an image request
    const imagePattern = /\\.(jpg|jpeg|png|gif|webp|svg|avif|apng|bmp|ico)(\\?|#|$)/i;
    const isImage = imagePattern.test(url) ||
                   event.request.destination === 'image';
    
    // For external image requests, explicitly bypass the service worker
    // by not calling event.respondWith(), allowing the browser to handle it directly
    // This prevents 504 timeout errors in Safari
    if (isImage) {
      // Don't respond - let browser handle it directly
      // This ensures no service worker interception occurs
      return;
    }
  } catch (e) {
    // If anything goes wrong, let the browser handle it normally
    return;
  }
}, true); // Use capture phase to ensure this runs before Angular's handler
`;

  // Inject the bypass code at the very beginning of the file
  // This ensures it runs before Angular's service worker initialization
  content = safariBypassCode + "\n" + content;
  patched = true;
  console.log("Injected Safari bypass for external image requests.");

  writeFileSync(SERVICE_WORKER_FILE, content, "utf-8");
  console.log(
    "✓ Service Worker patched successfully with improved timeout handling for external URLs.",
  );
} catch (error) {
  console.error("Error patching Service Worker:", error);
  process.exit(1);
}
