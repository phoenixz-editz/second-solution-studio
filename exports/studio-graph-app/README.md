# Second Solution Studio

Production-ready export of the Second Solution Studio mathematics visualization app for Google Cloud Shell or any Node.js host.

## What is included

- `public/` — favicon, logo, robots file, and static asset entry points.
- `src/` — complete React/TypeScript UI, controls, graph canvas, Three.js integration, shaders, and Web Workers.
- `src/workers/` — implicit 3D surface extraction and math validation workers.
- `src/engines/` — engine documentation and extension location for 2D/3D renderers.
- `src/styles/` — style organization notes; the active stylesheet remains `src/index.css`.
- `backend/src/` — complete Express validation API source.
- `backend/dist/` — bundled API server used by the Cloud Shell launcher.
- `dist/` — built frontend used by `npm start`.
- `workspace/` — original pnpm workspace, shared API bindings, schemas, lockfile, and artifact configurations for rebuilding from source.
- `server.js` — dynamic-port static host with `/api/*` reverse proxy.

## Run immediately

Requires Node.js 20 or newer.

```bash
npm start
```

The server listens on `process.env.PORT || 8080`. Google Cloud Shell Web Preview can be opened on port `8080`, or use any available port:

```bash
PORT=8080 npm start
```

The launcher serves the built frontend and starts the bundled validation API on an internal port. Do not expose or commit secret values. Optional Clerk configuration can be provided through the host environment when authentication is enabled.

## Rebuild from source

The original workspace is preserved under `workspace/`:

```bash
cd workspace
corepack enable
pnpm install --frozen-lockfile
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/math-animation-engine run build
pnpm --filter @workspace/api-server run build
cd ..
npm start
```

Or use the export wrapper:

```bash
npm run build
npm start
```

## Cloud Shell deployment

1. Upload and extract `studio-graph-app.zip`.
2. Enter the extracted `studio-graph-app/` directory.
3. Run `npm start` or `PORT=8080 npm start`.
4. Use **Web Preview → Preview on port 8080**.

For a managed deployment, the included `Dockerfile` and `cloudbuild.yaml` build the frontend and API, then run the same dynamic-port launcher.

## Health checks

- `GET /api/healthz` — API health response.
- `POST /api/validate` — equation validation endpoint used by the studio.

## Notes

- The app uses WebGL as progressive enhancement. Browsers without a usable WebGL context receive a projected 2D surface fallback.
- The application source does not contain API keys, passwords, or other credentials.