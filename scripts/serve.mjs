import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createServer } from "node:http";

const root = resolve(".");
const port = Number.parseInt(process.env.PORT ?? "4173", 10);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
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

server.listen(port, () => {
  console.log(`DiskPie demo running at http://localhost:${port}`);
});

