import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { scanDirectory } from "./scanner.mjs";

const scanPath = resolve(process.argv[2] ?? ".");
let latestProgress = null;
const startedAt = performance.now();

const scan = await scanDirectory(scanPath, {
  onProgress: (progress) => {
    latestProgress = progress;
  },
});

const elapsedMs = performance.now() - startedAt;

console.log(JSON.stringify({
  path: scan.root,
  elapsedMs: Math.round(elapsedMs),
  visibleItems: scan.items.length,
  totalBytes: scan.totalBytes,
  warnings: scan.warnings.length,
  visitedEntries: latestProgress?.visitedEntries ?? 0,
  concurrency: Number.parseInt(process.env.DISKPIE_SCAN_CONCURRENCY ?? "", 10) || "default",
}, null, 2));
