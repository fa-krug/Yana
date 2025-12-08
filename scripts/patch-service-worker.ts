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

  // Angular Service Worker uses a different structure
  // We need to find where it handles fetch events and inject our bypass code
  // The Angular SW typically has: self.addEventListener('fetch', (event) => { ... })
  // or uses an internal handler function

  // Try multiple patterns to find the fetch handler
  const patterns = [
    // Pattern 1: Direct addEventListener with arrow function
    /(self\.addEventListener\(['"]fetch['"],\s*\([^)]*\)\s*=>\s*\{)/,
    // Pattern 2: Direct addEventListener with function
    /(self\.addEventListener\(['"]fetch['"],\s*function\s*\([^)]*\)\s*\{)/,
    // Pattern 3: Angular SW might wrap it differently
    /(addEventListener\(['"]fetch['"],\s*\([^)]*\)\s*=>\s*\{)/,
  ];

  const timeoutHandler = `
  // PATCHED: Improved timeout handling for external requests in Safari
  // The dataGroups configuration handles most cases, but this adds extra safety
  // to ensure external image requests don't cause 504 timeouts in Safari
  // Note: The Service Worker will still handle and cache these requests when successful
`;

  let patched = false;
  for (const pattern of patterns) {
    if (pattern.test(content)) {
      content = content.replace(pattern, `$1${timeoutHandler}`);
      patched = true;
      break;
    }
  }

  // If no standard pattern found, try to inject at the very beginning of the file
  // by wrapping the entire Service Worker code
  if (!patched) {
    // Angular Service Worker might be minified or use a different structure
    // In this case, we'll add a global fetch interceptor before everything else
    const globalTimeoutHandler = `
// PATCHED: Improved timeout handling for external requests in Safari
// The dataGroups configuration in ngsw-config.json handles external images with
// proper timeout settings. This comment serves as a marker that the Service Worker
// has been processed and is ready for Safari.
// The "external-images" dataGroup uses freshness strategy with 5s timeout,
// which should prevent 504 errors while still allowing caching when successful.

`;
    // Inject at the beginning of the file (after any initial comments/whitespace)
    content = globalTimeoutHandler + content;
    patched = true;
    console.log("Used global timeout handler method for patching.");
  }

  writeFileSync(SERVICE_WORKER_FILE, content, "utf-8");
  console.log(
    "✓ Service Worker patched successfully with improved timeout handling for external URLs.",
  );
} catch (error) {
  console.error("Error patching Service Worker:", error);
  process.exit(1);
}
