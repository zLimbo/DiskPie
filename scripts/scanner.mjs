import { lstat, readdir } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { basename, resolve } from "node:path";
import { setImmediate } from "node:timers/promises";

const defaultMaxWarnings = 50;
const defaultMaxVisibleItems = 12;
const defaultYieldEveryEntries = 500;
const defaultMaxConcurrentFs = getDefaultMaxConcurrentFs();

export async function scanDirectory(scanPath, options = {}) {
  const resolvedPath = resolve(scanPath);
  const warnings = [];
  const config = {
    cancelToken: options.cancelToken ?? createCancelToken(),
    limitFs: createLimiter(options.maxConcurrentFs ?? defaultMaxConcurrentFs),
    maxVisibleItems: options.maxVisibleItems ?? defaultMaxVisibleItems,
    maxWarnings: options.maxWarnings ?? defaultMaxWarnings,
    onProgress: options.onProgress ?? null,
    yieldEveryEntries: options.yieldEveryEntries ?? defaultYieldEveryEntries,
  };
  const stats = await runFs(config, () => lstat(resolvedPath));

  if (!stats.isDirectory()) {
    const error = new Error("Scan path must be a directory");
    error.statusCode = 400;
    throw error;
  }

  const entries = await runFs(config, () => readdir(resolvedPath, { withFileTypes: true }));
  const counter = { completedItems: 0, visitedEntries: 0 };
  const scannedItems = await mapWithConcurrency(entries, config.limitFs.concurrency, async (entry) => {
    checkCancelled(config.cancelToken);

    const itemPath = resolve(resolvedPath, entry.name);
    const sizeBytes = await getEntrySize(itemPath, entry, warnings, config, counter);
    const item = {
      name: entry.name,
      path: itemPath,
      type: entry.isDirectory() ? "directory" : "file",
      sizeBytes,
    };

    counter.completedItems += 1;
    config.onProgress?.({
      root: resolvedPath,
      currentPath: itemPath,
      completedItems: counter.completedItems,
      totalItems: entries.length,
      visitedEntries: counter.visitedEntries,
      warnings: warnings.length,
    });

    return item;
  });

  const items = groupSmallItems(scannedItems, config.maxVisibleItems);

  return {
    root: resolvedPath,
    name: basename(resolvedPath) || resolvedPath,
    totalBytes: scannedItems.reduce((sum, item) => sum + item.sizeBytes, 0),
    items,
    warnings,
  };
}

export function groupSmallItems(items, maxVisibleItems = defaultMaxVisibleItems) {
  const sortedItems = [...items].sort((a, b) => b.sizeBytes - a.sizeBytes || a.name.localeCompare(b.name));

  if (sortedItems.length <= maxVisibleItems) {
    return sortedItems;
  }

  const visibleItems = sortedItems.slice(0, maxVisibleItems - 1);
  const otherItems = sortedItems.slice(maxVisibleItems - 1);

  return [
    ...visibleItems,
    {
      name: "Other",
      path: `${otherItems.length} smaller items`,
      type: "group",
      sizeBytes: otherItems.reduce((sum, item) => sum + item.sizeBytes, 0),
    },
  ];
}

export function createCancelToken() {
  return { cancelled: false };
}

async function getEntrySize(entryPath, dirent, warnings, config, counter) {
  checkCancelled(config.cancelToken);
  counter.visitedEntries += 1;

  if (counter.visitedEntries % config.yieldEveryEntries === 0) {
    await setImmediate();
  }

  try {
    if (dirent.isDirectory()) {
      const children = await runFs(config, () => readdir(entryPath, { withFileTypes: true }));
      const childSizes = await mapWithConcurrency(children, config.limitFs.concurrency, async (child) => {
        return getEntrySize(resolve(entryPath, child.name), child, warnings, config, counter);
      });

      return childSizes.reduce((sum, size) => sum + size, 0);
    }

    if (dirent.isSymbolicLink()) {
      return 0;
    }

    const stats = await runFs(config, () => lstat(entryPath));
    return stats.isFile() ? stats.size : 0;
  } catch (error) {
    if (warnings.length < config.maxWarnings) {
      warnings.push({
        path: entryPath,
        message: error.message,
      });
    }

    return 0;
  }
}

async function runFs(config, operation) {
  checkCancelled(config.cancelToken);

  return config.limitFs(async () => {
    checkCancelled(config.cancelToken);
    return operation();
  });
}

function createLimiter(concurrency) {
  const maxConcurrency = Math.max(1, Math.floor(concurrency));
  const queue = [];
  let activeCount = 0;

  const next = () => {
    activeCount -= 1;

    if (queue.length > 0) {
      const run = queue.shift();
      run();
    }
  };

  const limit = (task) => {
    return new Promise((resolveTask, rejectTask) => {
      const run = () => {
        activeCount += 1;
        Promise.resolve()
          .then(task)
          .then(resolveTask, rejectTask)
          .finally(next);
      };

      if (activeCount < maxConcurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };

  limit.concurrency = maxConcurrency;
  return limit;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length || 1);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    }),
  );

  return results;
}

function getDefaultMaxConcurrentFs() {
  const envValue = Number.parseInt(process.env.DISKPIE_SCAN_CONCURRENCY ?? "", 10);

  if (Number.isFinite(envValue) && envValue > 0) {
    return envValue;
  }

  const cpuCount = typeof availableParallelism === "function" ? availableParallelism() : 4;
  const ioConcurrency = cpuCount * 8;

  return Math.min(96, Math.max(32, ioConcurrency));
}

function checkCancelled(cancelToken) {
  if (cancelToken.cancelled) {
    const error = new Error("Scan cancelled");
    error.statusCode = 499;
    throw error;
  }
}
