# Yana - Fullstack TypeScript RSS Aggregator

A modern, fullstack TypeScript/Node.js RSS aggregator with Angular SSR, featuring AI-powered content processing, multiple aggregator types, and a unified codebase.

## 🚀 Quick Start

### Prerequisites

- Node.js 22+ (Node.js 24+ requires C++20 compiler flags)
- npm 10+

### Installation

**Important:** If you're using Node.js v24+, you need to set C++20 compiler flags before installing dependencies:

```bash
export CXXFLAGS="-std=c++20"
npm install
```

For Node.js v22, you can use the standard install:

```bash
# Install dependencies
npm install
```

**Note:** The project uses `better-sqlite3` v12.4.1+ which supports Node.js v24 when compiled with C++20 flags.

### Setup

```bash
# Run database migrations
npm run db:migrate

# Create superuser
tsx src/server/scripts/createSuperuser.ts admin admin@example.com password

# Start development servers (run in separate terminals)
# Terminal 1: Express server
tsx src/server.ts

# Terminal 2: Angular dev server
npm run start
```

The application will be available at:
- Frontend: http://localhost:4200
- API: http://localhost:3000

## 📁 Project Structure

```
yana/
├── src/
│   ├── app/              # Angular frontend
│   │   ├── core/         # Core services, guards, interceptors
│   │   │   └── trpc/     # tRPC client service
│   │   ├── features/     # Feature modules (articles, feeds, auth, etc.)
│   │   └── shared/       # Shared components and types
│   └── server/           # Express backend
│       ├── aggregators/  # RSS aggregator implementations
│       ├── db/           # Database schema and migrations
│       ├── middleware/   # Express middleware
│       ├── routes/       # Non-tRPC API routes (RSS, GReader, etc.)
│       ├── trpc/         # tRPC routers and procedures
│       ├── services/     # Business logic
│       ├── workers/      # Background worker pool
│       └── scheduler/    # Periodic task scheduler
├── tests/                # Test files
└── public/               # Static assets
```

## 🏗️ Architecture

### Fullstack TypeScript

This is a **monorepo** with both frontend and backend in TypeScript, sharing the same codebase:

- **Frontend**: Angular 21 with SSR (Server-Side Rendering)
- **Backend**: Express.js with TypeScript
- **Database**: SQLite with Drizzle ORM
- **API**: tRPC for type-safe end-to-end communication

### Frontend-Backend Communication

The frontend and backend communicate through **tRPC**, which provides:

- **End-to-end type safety**: TypeScript types are shared between client and server
- **Automatic validation**: Input validation using Zod schemas
- **Type inference**: The frontend automatically gets types from the backend router

#### Type Sharing

The frontend imports the `AppRouter` type directly from the server:

```typescript
// src/app/core/trpc/trpc-client.ts
import type { AppRouter } from '../../../server/trpc/router';
```

This means:
- ✅ Full type safety for all API calls
- ✅ Autocomplete for all procedures
- ✅ Compile-time error checking
- ⚠️ **Requires server code to be built/available for TypeScript compilation**

#### Build Process

**IMPORTANT: Build Order Requirement**

Because the frontend imports types from the server, you may need to build the server first to resolve TypeScript type issues:

```bash
# Build server first (generates type definitions)
tsc -p tsconfig.server.json

# Then build frontend (can now resolve server types)
npm run build
```

In development, TypeScript can usually resolve types directly from source files, but if you encounter type errors, build the server first using the TypeScript compiler.

### Development Workflow

1. **Development Mode**: Run both servers separately
   ```bash
   # Terminal 1: Start Express server
   tsx src/server.ts
   
   # Terminal 2: Start Angular dev server
   npm run start
   ```
   The Express server runs on port 3000, and the Angular dev server runs on port 4200.

2. **Type Checking**: TypeScript checks both frontend and server code
   - Frontend uses `tsconfig.app.json`
   - Server uses `tsconfig.server.json`
   - Both extend `tsconfig.json` for shared configuration

3. **Proxy Configuration**: Angular dev server proxies API requests to Express
   - `/trpc/*` → `http://localhost:3000/trpc/*`
   - `/api/*` → `http://localhost:3000/api/*`

## 🛠️ Development

### Available Scripts

```bash
# Development
npm run start            # Start Angular dev server (uses proxy to backend)

# Building
npm run build            # Build Angular for production

# Code Quality
npm run lint             # Run ESLint to check for linting errors
npm run lint:fix          # Run ESLint and auto-fix issues
npm run format            # Format code with Prettier
npm run format:check      # Check code formatting with Prettier

# Database
npm run db:generate      # Generate Drizzle migrations
npm run db:migrate       # Run database migrations
npm run db:studio        # Open Drizzle Studio
```

**Note**: For development, you'll typically run the Express server separately (e.g., using `tsx src/server.ts` or `nodemon`) and the Angular dev server with `npm run start`. The Angular dev server proxies API requests to the Express server running on port 3000.

**Building the Server**: To build the TypeScript server for type resolution, use:
```bash
# Build server using TypeScript compiler
tsc -p tsconfig.server.json
```

This generates type definitions in `dist/server/` that the frontend can use for type checking.

### TypeScript Configuration

The project uses separate TypeScript configurations:

- **`tsconfig.json`**: Base configuration with shared compiler options
- **`tsconfig.app.json`**: Frontend-specific config (extends base)
- **`tsconfig.server.json`**: Server-specific config (extends base)

Path aliases are configured for easier imports:
- `@server/*` → `src/server/*`
- `@app/*` → `src/app/*`

## 🗄️ Database

The application uses SQLite with Drizzle ORM. The database schema is defined in `src/server/db/schema.ts`.

### Migrations

```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations
npm run db:migrate

# Open database studio
npm run db:studio
```

## 🔐 Authentication

The application uses cookie-based session authentication. Users are managed via the API or the `createSuperuser` script.

### Create Superuser

```bash
tsx src/server/scripts/createSuperuser.ts <username> <email> <password>
```

## 📡 API

The API uses **tRPC** for type-safe, end-to-end API calls. All API endpoints are accessible at `/trpc`.

### tRPC Architecture

tRPC provides type-safe communication between the Angular frontend and Express backend:

1. **Server**: Defines routers with procedures in `src/server/trpc/`
2. **Client**: Angular service imports `AppRouter` type for type inference
3. **Communication**: HTTP requests with automatic serialization (SuperJSON)

### tRPC Routers

The API is organized into routers:

- **auth** - Authentication (login, logout, status)
- **aggregator** - Aggregator metadata (public)
- **statistics** - Dashboard statistics
- **feed** - Feed CRUD and management
- **article** - Article operations
- **user** - User profile and settings
- **admin** - Admin user management (superuser only)

### Client Usage (Angular)

The Angular application uses the `TRPCService` to access tRPC procedures:

```typescript
import { TRPCService } from './core/trpc/trpc.service';

// In a service or component
constructor(private trpc: TRPCService) {}

// Query example (read operation)
const stats = await this.trpc.client.statistics.get.query();

// Mutation example (write operation)
const result = await this.trpc.client.auth.login.mutate({
  username: 'user',
  password: 'pass',
});
```

### Type Safety

All procedures are fully type-safe:

- ✅ Input types are inferred from Zod schemas
- ✅ Output types are inferred from return values
- ✅ Autocomplete works in IDE
- ✅ Compile-time error checking

### Documentation

- **tRPC API Reference**: See `docs/TRPC_API.md` for complete procedure documentation

## 🤖 Aggregators

The system supports multiple aggregator types:

- **full_website** - Generic RSS feed aggregator
- **heise** - Heise.de news aggregator
- **youtube** - YouTube channel aggregator
- **reddit** - Reddit subreddit aggregator
- **podcast** - Podcast feed aggregator

### Aggregator Testing Tools

Test all aggregators against a specific article URL for debugging:

```bash
npm run test:aggregator <url>
```

**Example:**
```bash
npm run test:aggregator https://example.com/article
```

This script:
- Tests all registered aggregators against the URL
- Shows fetch, extraction, and processing results for each
- Displays success/failure status, content length, and processing time
- Useful for debugging content extraction issues and comparing aggregator behavior

### Aggregator Flow Documentation

For detailed information about the aggregation flow, see:
- **[docs/AGGREGATOR_FLOW.md](docs/AGGREGATOR_FLOW.md)** - Comprehensive documentation covering:
  - Fixed aggregation flow (Template Method Pattern)
  - Step-by-step breakdown of each phase
  - Error handling strategy
  - Configuration options
  - Debugging tools usage
  - How to create custom aggregators

## 🧠 AI Features

The application includes AI-powered features:

- **Translation** - Translate article content to different languages
- **Summarization** - Generate concise summaries
- **Custom Prompts** - Process content with custom AI prompts

Configure AI settings in user settings (requires OpenAI-compatible API).

## 🐳 Docker

### Quick Start with Docker Compose

The easiest way to run Yana is with Docker Compose:

```bash
# Start the application
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down
```

The application will be available at `http://localhost:3000`.

### Docker Compose Files

- **`docker-compose.yml`** - Basic configuration for development/testing
- **`docker-compose.production.yml`** - Production-ready configuration with volumes
- **`docker-compose.example.yml`** - Comprehensive example with documentation

### Environment Variables

Create a `.env` file (see `.env.example` for template):

```env
SESSION_SECRET=your-secure-random-string-here
BASE_URL=http://localhost:3000
WORKER_COUNT=4
AGGREGATION_SCHEDULE=*/30 * * * *
```

### Manual Docker Build

```bash
# Build
docker build -t yana .

# Run
docker run -p 3000:3000 \
  -e DATABASE_URL=/app/data/db.sqlite3 \
  -e SESSION_SECRET=your-secret \
  -v $(pwd)/data:/app/data \
  yana
```

### Production Deployment

For production, use `docker-compose.production.yml`:

```bash
docker-compose -f docker-compose.production.yml up -d
```

**Important for production:**
- Set a strong `SESSION_SECRET` (generate with: `openssl rand -hex 32`)
- Update `BASE_URL` to match your domain
- Set up a reverse proxy (Nginx/Traefik) for SSL/TLS
- Configure automated backups for the `./data` directory

## 🧪 Testing

```bash
# Run server tests (using vitest)
npx vitest

# Run with coverage
npx vitest --coverage

# Watch mode
npx vitest --watch
```

## 📝 Environment Variables

Create a `.env` file (see `.env.example`):

```env
# Database
DATABASE_URL=./db.sqlite3

# Server
PORT=3000
NODE_ENV=development

# Session
SESSION_SECRET=change-this-in-production

# Scheduler
AGGREGATION_SCHEDULE=*/30 * * * *
WORKER_COUNT=4
```

## 🔧 Configuration

- `tsconfig.json` - Base TypeScript configuration
- `tsconfig.app.json` - Frontend-specific TypeScript config
- `tsconfig.server.json` - Server-specific TypeScript config
- `angular.json` - Angular configuration
- `drizzle.config.ts` - Drizzle ORM configuration
- `vitest.config.ts` - Test configuration

## 🐛 Troubleshooting

### TypeScript Type Errors

If you encounter type errors when building the frontend:

```bash
# Build server first to generate type definitions
tsc -p tsconfig.server.json

# Then build frontend
npm run build
```

This ensures the `AppRouter` type is available for the frontend TypeScript compiler.

### Database Issues

```bash
# Reset database (WARNING: Deletes all data)
rm db.sqlite3
npm run db:migrate
```

### Port Already in Use

Change the port in `.env`:
```env
PORT=3001
```

### Build Errors

```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
tsc -p tsconfig.server.json  # Build server first
npm run build                # Then build frontend
```

## 📚 Documentation

- `docs/TRPC_API.md` - Complete tRPC API reference documentation
- `docs/AGGREGATOR_FLOW.md` - Aggregator flow documentation (Template Method Pattern, step-by-step breakdown, debugging tools)
- `docs/BACKWARDS_COMPATIBILITY.md` - Backwards compatibility guide explaining how the new architecture maintains compatibility
- `docs/ESLINT.md` - ESLint configuration, usage, and troubleshooting guide

## 📄 License

See LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please follow the existing code style and add tests for new features.
