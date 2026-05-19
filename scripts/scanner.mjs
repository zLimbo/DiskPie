import { lstat, readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { setImmediate } from "node:timers/promises";

const defaultMaxWarnings = 50;
const defaultMaxVisibleItems = 12;
const defaultYieldEveryEntries = 100;

export async function scanDirectory(scanPath, options = {}) {
  const resolvedPath = resolve(scanPath);
  const warnings = [];
  const stats = await lstat(resolvedPath);
  const config = {
    cancelToken: options.cancelToken ?? createCancelToken(),
    maxVisibleItems: options.maxVisibleItems ?? defaultMaxVisibleItems,
    maxWarnings: options.maxWarnings ?? defaultMaxWarnings,
    onProgress: options.onProgress ?? null,
    yieldEveryEntries: options.yieldEveryEntries ?? defaultYieldEveryEntries,
  };

  if (!stats.isDirectory()) {
    const error = new Error("Scan path must be a directory");
    error.statusCode = 400;
    throw error;
  }

  const entries = await readdir(resolvedPath, { withFileTypes: true });
  const scannedItems = [];
  const counter = { visitedEntries: 0 };

  for (const [index, entry] of entries.entries()) {
    checkCancelled(config.cancelToken);

    const itemPath = resolve(resolvedPath, entry.name);
    const sizeBytes = await getEntrySize(itemPath, warnings, config, counter);

    scannedItems.push({
      name: entry.name,
      path: itemPath,
      type: entry.isDirectory() ? "directory" : "file",
      sizeBytes,
    });

    config.onProgress?.({
      root: resolvedPath,
      currentPath: itemPath,
      completedItems: index + 1,
      totalItems: entries.length,
      visitedEntries: counter.visitedEntries,
      warnings: warnings.length,
    });
  }

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

async function getEntrySize(entryPath, warnings, config, counter) {
  checkCancelled(config.cancelToken);
  counter.visitedEntries += 1;

  if (counter.visitedEntries % config.yieldEveryEntries === 0) {
    await setImmediate();
  }

  try {
    const stats = await lstat(entryPath);

    if (!stats.isDirectory()) {
      return stats.size;
    }

    const children = await readdir(entryPath);
    let sizeBytes = 0;

    for (const child of children) {
      sizeBytes += await getEntrySize(resolve(entryPath, child), warnings, config, counter);
    }

    return sizeBytes;
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

function checkCancelled(cancelToken) {
  if (cancelToken.cancelled) {
    const error = new Error("Scan cancelled");
    error.statusCode = 499;
    throw error;
  }
}
