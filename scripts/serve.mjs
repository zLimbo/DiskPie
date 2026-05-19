import { createReadStream, existsSync } from "node:fs";
import { extname, normalize, resolve, sep } from "node:path";
import { createServer } from "node:http";
import { createCancelToken, scanDirectory } from "./scanner.mjs";

const root = resolve(".");
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const host = "127.0.0.1";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (url.pathname === "/api/scan") {
    await handleScanRequest(url, response);
    return;
  }

  if (url.pathname === "/api/scan-stream") {
    await handleScanStreamRequest(request, url, response);
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(root, normalize(requestedPath).replace(/^([/\\])+/, ""));

  if (!filePath.startsWith(root + sep) && filePath !== root) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`DiskPie demo running at http://${host}:${port}`);
});

async function handleScanRequest(url, response) {
  const scanPath = resolve(url.searchParams.get("path") || root);

  try {
    const scan = await scanDirectory(scanPath, {
      cancelToken: createCancelToken(),
      onProgress: null,
    });
    writeJson(response, 200, scan);
  } catch (error) {
    writeJson(response, error.statusCode ?? 500, {
      error: error.message || "Unable to scan directory",
    });
  }
}

async function handleScanStreamRequest(request, url, response) {
  const scanPath = resolve(url.searchParams.get("path") || root);
  const cancelToken = createCancelToken();

  request.on("close", () => {
    cancelToken.cancelled = true;
  });

  response.writeHead(200, {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
    "X-Accel-Buffering": "no",
  });

  writeEvent(response, "start", { path: scanPath });

  try {
    const scan = await scanDirectory(scanPath, {
      cancelToken,
      onProgress: (progress) => writeEvent(response, "progress", progress),
    });

    if (!cancelToken.cancelled) {
      writeEvent(response, "complete", scan);
      response.end();
    }
  } catch (error) {
    if (!cancelToken.cancelled) {
      writeEvent(response, "error", {
        error: error.message || "Unable to scan directory",
      });
      response.end();
    }
  }
}

function writeEvent(response, event, body) {
  if (response.destroyed || response.writableEnded) {
    return;
  }

  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(body)}\n\n`);
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}
