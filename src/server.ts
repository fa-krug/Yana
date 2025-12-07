/**
 * Express server entry point.
 *
 * This server serves the Angular SSR app and provides API endpoints.
 */

// Import Angular compiler first to enable JIT compilation when needed
import "@angular/compiler";

import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";
import express from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import cors from "cors";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requestLogger } from "./server/middleware/requestLogger";
import {
  errorHandler,
  notFoundHandler,
} from "./server/middleware/errorHandler";
import { logger } from "./server/utils/logger";
import { checkDbHealth } from "./server/db/transactions";
import { setupSecurity } from "./server/middleware/security";
import { getWorkerPool } from "./server/workers/pool";
import { startScheduler } from "./server/services/scheduler.service";
import { getDatabase } from "./server/db";
import { SQLiteStore } from "./server/middleware/sessionStore";

const app = express();

// Resolve paths relative to the compiled server location
const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, "../browser");

// Initialize Angular SSR app
const angularApp = new AngularNodeAppEngine();

const PORT = process.env["PORT"] || 3000;
const NODE_ENV = process.env["NODE_ENV"] || "development";
const isDevelopment = NODE_ENV === "development";

// Trust proxy (for production behind reverse proxy)
app.set("trust proxy", 1);

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session configuration with persistent SQLite store
// Initialize lazily to avoid database connection during build-time route extraction
const sessionSecret =
  process.env["SESSION_SECRET"] || "change-this-in-production";

// Check if we're in a build context (Angular route extraction)
// During build, we don't need a real database connection
const isBuildContext = process.env["NG_BUILD"] === "true" || 
  process.argv.some(arg => arg.includes("ng") && arg.includes("build"));

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
      secure: !isDevelopment, // Only use secure cookies in production
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

// tRPC API routes - must be synchronous to ensure it's registered before SSR middleware
import { createTRPCMiddleware } from "./server/trpc/express";
app.use("/trpc", createTRPCMiddleware());

// API routes - load synchronously to ensure they're registered before requests
// Import routes synchronously (they're already compiled)
import { youtubeRoutes } from "./server/routes/youtube";
import { greaderRoutes } from "./server/routes/greader";
import { adminTasksSSERoutes } from "./server/routes/admin-tasks-sse";

app.use("/api", youtubeRoutes());
app.use("/api/greader", greaderRoutes()); // Google Reader API
app.use("/api/admin/tasks", adminTasksSSERoutes()); // Admin tasks SSE

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

  // Start scheduler
  if (process.env["SCHEDULER_ENABLED"] !== "false") {
    try {
      startScheduler();
      logger.info("Scheduler initialized");
    } catch (error) {
      logger.error({ error }, "Failed to start scheduler");
    }
  } else {
    logger.info("Scheduler disabled (SCHEDULER_ENABLED=false)");
  }
}

/**
 * Start the server if this module is the main entry point.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 3000.
 */
if (isMainModule(import.meta.url)) {
  const port = process.env["PORT"] || 3000;
  app.listen(port, () => {
    logger.info({ port }, "Node Express server listening");

    // Initialize background services when server starts listening
    initializeBackgroundServices();
  });
} else {
  // Even if not the main module, initialize background services
  // This ensures they start when the server is imported/used
  initializeBackgroundServices();
}

export default app;
