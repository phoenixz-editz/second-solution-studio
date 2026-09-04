import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const publicDir = join(rootDir, "dist", "public");
const apiEntry = join(rootDir, "backend", "dist", "index.mjs");
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "0.0.0.0";
const apiPort = port >= 65534 ? port - 1 : port + 1;

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT || port}`);
}

let apiProcess;
if (existsSync(apiEntry)) {
  apiProcess = spawn(process.execPath, ["--enable-source-maps", apiEntry], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(apiPort),
    },
    stdio: "inherit",
  });
  apiProcess.on("error", (error) => {
    console.error(`[studio] API process failed to start: ${error.message}`);
  });
} else {
  console.warn("[studio] backend/dist/index.mjs is missing; /api requests will return 503.");
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function securityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

function proxyApi(request, response) {
  const upstream = httpRequest(
    {
      hostname: "127.0.0.1",
      port: apiPort,
      path: request.url,
      method: request.method,
      headers: {
        ...request.headers,
        host: `127.0.0.1:${apiPort}`,
        "x-forwarded-proto": "http",
      },
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );
  upstream.on("error", () => {
    if (!response.headersSent) {
      response.writeHead(503, { "content-type": "application/json; charset=utf-8" });
    }
    response.end(JSON.stringify({ error: "The validation API is not available." }));
  });
  request.pipe(upstream);
}

function safeStaticPath(requestPath) {
  const pathname = decodeURIComponent((requestPath || "/").split("?")[0]);
  const candidate = normalize(join(publicDir, pathname));
  return candidate === publicDir || candidate.startsWith(`${publicDir}${sep}`)
    ? candidate
    : null;
}

function serveFile(filePath, response) {
  const extension = extname(filePath).toLowerCase();
  response.setHeader("Content-Type", mimeTypes[extension] || "application/octet-stream");
  response.setHeader("Cache-Control", extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable");
  createReadStream(filePath).on("error", () => {
    if (!response.headersSent) response.writeHead(500);
    response.end("Unable to read the requested file.");
  }).pipe(response);
}

const server = createServer((request, response) => {
  securityHeaders(response);
  if (request.url?.startsWith("/api/")) {
    proxyApi(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed.");
    return;
  }

  const requestedPath = safeStaticPath(request.url);
  const indexPath = join(publicDir, "index.html");
  const filePath = requestedPath && existsSync(requestedPath) && statSync(requestedPath).isFile()
    ? requestedPath
    : indexPath;

  if (!existsSync(filePath)) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Built frontend not found. Run the build instructions in README.md.");
    return;
  }

  if (request.method === "HEAD") {
    response.setHeader("Content-Type", mimeTypes[extname(filePath).toLowerCase()] || "text/html; charset=utf-8");
    response.end();
    return;
  }
  serveFile(filePath, response);
});

server.listen(port, host, () => {
  console.log(`[studio] Web Preview listening on http://${host}:${port}`);
  console.log(`[studio] API validation proxy target: http://127.0.0.1:${apiPort}`);
});

function shutdown(signal) {
  console.log(`[studio] ${signal}; shutting down.`);
  server.close();
  apiProcess?.kill("SIGTERM");
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));