/**
 * Express server entry point.
 *
 * This server serves the Angular SSR app and provides API endpoints.
 */

// Import Angular compiler first to enable JIT compilation when needed
import "@angular/compiler";

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";
import cookieParser from "cookie-parser";
import cors from "cors";
import { config } from "dotenv";
import express from "express";
import session from "express-session";

// Load .env file after resolve is imported
config({ path: resolve(process.cwd(), ".env") });

import { getDatabase } from "./server/db";
import { checkDbHealth } from "./server/db/transactions";
import {
  errorHandler,
  notFoundHandler,
} from "./server/middleware/errorHandler";
import { requestLogger } from "./server/middleware/requestLogger";
import { setupSecurity } from "./server/middleware/security";
import { SQLiteStore } from "./server/middleware/sessionStore";
import { adminTasksSSERoutes } from "./server/routes/admin-tasks-sse";
import { greaderRoutes } from "./server/routes/greader";
import { imageProxyRoutes } from "./server/routes/images";
import { youtubeRoutes } from "./server/routes/youtube";
import { startScheduler } from "./server/services/scheduler.service";
import { createTRPCMiddleware } from "./server/trpc/express";
import { logger } from "./server/utils/logger";
import { getWorkerPool } from "./server/workers/pool";

const app = express();

// Resolve paths relative to the compiled server location
const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, "../browser");

// Initialize Angular SSR app
const angularApp = new AngularNodeAppEngine();

const NODE_ENV = process.env["NODE_ENV"] || "development";
const isDevelopment = NODE_ENV === "development";

app.set("trust proxy", 1);

// Middleware to fix HTTPS detection when Traefik forwards wrong X-Forwarded-Proto
// Cloudflare sends CF-Visitor header with correct scheme, but Traefik may forward X-Forwarded-Proto: http
// This ensures req.secure is set correctly so secure cookies can be set
app.use((req, res, next) => {
  // If Express didn't detect HTTPS but CF-Visitor says it's HTTPS, fix it
  if (!req.secure && !isDevelopment) {
    const cfVisitor = req.headers["cf-visitor"];
    if (cfVisitor) {
      try {
        const visitor = JSON.parse(
          Array.isArray(cfVisitor) ? cfVisitor[0] : cfVisitor,
        );
        if (visitor.scheme === "https") {
          // Override req.protocol and req.secure by modifying the connection
          // This is needed because express-session checks req.secure before setting secure cookies
          (req as { connection?: { encrypted?: boolean } }).connection = {
            ...req.connection,
            encrypted: true,
          };
          // Also set protocol directly
          Object.defineProperty(req, "protocol", {
            value: "https",
            writable: false,
            configurable: false,
          });
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
  }
  next();
});

// CORS configuration (for development)
if (isDevelopment) {
  app.use(
    cors({
      origin: process.env["CORS_ORIGIN"] || "http://localhost:4200",
      credentials: true,
    }),
  );
}

// Body parsing middleware
// Increase limit to 10MB to handle large article content (default is 100KB)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Session configuration with persistent SQLite store
// Initialize lazily to avoid database connection during build-time route extraction
const sessionSecret =
  process.env["SESSION_SECRET"] || "change-this-in-production";

// Check if we're in a build context (Angular route extraction)
// During build, we don't need a real database connection
const isBuildContext =
  process.env["NG_BUILD"] === "true" ||
  process.argv.some((arg) => arg.includes("ng") && arg.includes("build"));

let sessionStore: SQLiteStore | null = null;
function getSessionStore(): SQLiteStore {
  if (!sessionStore) {
    if (isBuildContext) {
      // During build, use a dummy store that won't actually be used
      // We'll create a minimal store that satisfies the interface
      sessionStore = {
        get: () => {},
        set: () => {},
        destroy: () => {},
        all: () => {},
        length: () => 0,
        clear: () => {},
        touch: () => {},
      } as unknown as SQLiteStore;
    } else {
      const db = getDatabase();
      sessionStore = new SQLiteStore({
        db,
        tableName: "sessions",
        skipTableCreation: true,
      });
    }
  }
  return sessionStore;
}

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: getSessionStore(),
    cookie: {
      httpOnly: true,
      secure: !isDevelopment, // Secure cookies in production (requires HTTPS)
      sameSite: "lax",
      maxAge: 14 * 24 * 60 * 60 * 1000, // 2 weeks
    },
    name: "yana.sid",
  }),
);

// Security middleware
setupSecurity(app);

// Request logging middleware
app.use(requestLogger);

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    const dbHealthy = await checkDbHealth();
    const { getWorkerHealth } = await import("./server/workers/health");
    const workerHealth = await getWorkerHealth();

    res.json({
      status: dbHealthy && workerHealth.healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      database: dbHealthy ? "connected" : "disconnected",
      workers: workerHealth,
    });
  } catch (error) {
    logger.error({ error }, "Health check failed");
    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      database: "error",
    });
  }
});

// Debug endpoint to check what headers the server receives
app.get("/api/debug/headers", (req, res) => {
  res.json({
    protocol: req.protocol,
    secure: req.secure,
    headers: {
      "x-forwarded-proto": req.headers["x-forwarded-proto"],
      "cf-visitor": req.headers["cf-visitor"],
      "x-forwarded-for": req.headers["x-forwarded-for"],
      "cf-connecting-ip": req.headers["cf-connecting-ip"],
    },
    sessionId: req.session?.id,
    sessionCookie: req.session?.cookie,
  });
});

// tRPC API routes - must be synchronous to ensure it's registered before SSR middleware
app.use("/trpc", createTRPCMiddleware());

// API routes - load synchronously to ensure they're registered before requests

app.use("/api", youtubeRoutes());
app.use("/api/greader", greaderRoutes()); // Google Reader API
app.use("/api/admin/tasks", adminTasksSSERoutes()); // Admin tasks SSE
app.use("/api", imageProxyRoutes()); // Image proxy for external images

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: "1y",
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 * Skip API routes and tRPC routes.
 */
app.use((req, res, next) => {
  // Skip API routes and tRPC routes - must be checked first before any processing
  const requestPath = req.path || req.originalUrl?.split("?")[0] || "";
  if (requestPath.startsWith("/api/") || requestPath.startsWith("/trpc")) {
    return next();
  }

  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch((error) => {
      logger.error({ error, path: req.path }, "SSR rendering failed");
      // Fallback to index.html if SSR fails
      const indexHtmlPath = resolve(browserDistFolder, "index.html");
      res.sendFile(indexHtmlPath);
    });
});

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

/**
 * Cleanup function to close Playwright browsers and other resources.
 */
async function cleanupResources(): Promise<void> {
  logger.info("Cleaning up resources...");

  // Close Playwright browsers
  // Note: Oglaf browser cleanup is handled by its own shutdown handlers
  try {
    const { closeBrowser } = await import("./server/aggregators/base/fetch");
    await closeBrowser();
  } catch (error) {
    logger.warn({ error }, "Error closing base fetch browser");
  }

  // Stop worker pool
  try {
    const workerPool = getWorkerPool();
    await workerPool.stop();
  } catch (error) {
    logger.warn({ error }, "Error stopping worker pool");
  }

  logger.info("Resource cleanup complete");
}

/**
 * Initialize worker pool and scheduler.
 * These should start regardless of how the server is started (directly or via SSR).
 */
function initializeBackgroundServices(): void {
  // Start worker pool
  if (process.env["WORKER_POOL_ENABLED"] !== "false") {
    try {
      const workerPool = getWorkerPool();
      workerPool.start();
      logger.info("Worker pool initialized");
    } catch (error) {
      logger.error({ error }, "Failed to start worker pool");
    }
  } else {
    logger.info("Worker pool disabled (WORKER_POOL_ENABLED=false)");
  }

  // Start scheduler (disabled in development mode)
  // In development, only manual syncs are allowed (via API endpoints)
  const schedulerEnabled =
    process.env["SCHEDULER_ENABLED"] !== "false" && !isDevelopment;
  if (schedulerEnabled) {
    try {
      startScheduler();
      logger.info("Scheduler initialized");
    } catch (error) {
      logger.error({ error }, "Failed to start scheduler");
    }
  } else {
    if (isDevelopment) {
      logger.info("Scheduler disabled (development mode - use manual syncs)");
    } else {
      logger.info("Scheduler disabled (SCHEDULER_ENABLED=false)");
    }
  }

  // Register shutdown handlers for graceful cleanup
  let shutdownHandlersRegistered = false;
  const registerShutdownHandlers = () => {
    if (shutdownHandlersRegistered) return;
    shutdownHandlersRegistered = true;

    const cleanup = async () => {
      await cleanupResources();
      process.exit(0);
    };

    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);

    // Handle uncaught exceptions
    process.on("uncaughtException", async (error) => {
      logger.error({ error }, "Uncaught exception, shutting down");
      await cleanupResources();
      process.exit(1);
    });

    process.on("unhandledRejection", async (reason) => {
      logger.error({ reason }, "Unhandled rejection, shutting down");
      await cleanupResources();
      process.exit(1);
    });
  };

  registerShutdownHandlers();
}

/**
 * Start the server if this module is the main entry point.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 3000.
 */
if (isMainModule(import.meta.url)) {
  const port = process.env["PORT"] ? Number(process.env["PORT"]) : 3000;
  const host = isDevelopment ? "0.0.0.0" : undefined;
  const callback = () => {
    logger.info(
      { port, host: host || "localhost" },
      "Node Express server listening",
    );

    // Initialize background services when server starts listening
    initializeBackgroundServices();
  };

  if (host) {
    app.listen(port, host, callback);
  } else {
    app.listen(port, callback);
  }
} else {
  // Even if not the main module, initialize background services
  // This ensures they start when the server is imported/used
  initializeBackgroundServices();
}

export default app;
