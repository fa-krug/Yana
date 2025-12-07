import { RenderMode, ServerRoute } from "@angular/ssr";

/**
 * Server-side routing configuration with render modes.
 *
 * This allows hybrid rendering:
 * - Client: Rendered in browser (SPA mode)
 * - Server: Rendered on server for each request (SSR)
 * - Prerender: Pre-rendered at build time (SSG)
 */
export const serverRoutes: ServerRoute[] = [
  // Login page can be client-rendered (fast, no SEO needed)
  { path: "login", renderMode: RenderMode.Client },

  // Main app routes benefit from SSR for SEO and initial load
  { path: "", renderMode: RenderMode.Server },
  { path: "feeds", renderMode: RenderMode.Server },
  { path: "feeds/**", renderMode: RenderMode.Server },
  { path: "articles", renderMode: RenderMode.Server },
  { path: "articles/**", renderMode: RenderMode.Server },
  { path: "settings", renderMode: RenderMode.Server },
  { path: "settings/**", renderMode: RenderMode.Server },

  // Fallback: server-render all other routes
  { path: "**", renderMode: RenderMode.Server },
];
