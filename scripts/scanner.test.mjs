import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createCancelToken, groupSmallItems, scanDirectory } from "./scanner.mjs";

const fixtureParent = process.env.DISKPIE_TEST_TMP ?? "/tmp";

async function withFixture(callback) {
  const root = await mkdtemp(join(fixtureParent, "diskpie-"));

  try {
    await callback(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

test("scanDirectory returns an empty scan for an empty folder", async () => {
  await withFixture(async (root) => {
    const scan = await scanDirectory(root);

    assert.equal(scan.root, root);
    assert.equal(scan.totalBytes, 0);
    assert.deepEqual(scan.items, []);
    assert.deepEqual(scan.warnings, []);
  });
});

test("scanDirectory totals immediate children recursively", async () => {
  await withFixture(async (root) => {
    await writeFile(join(root, "root.txt"), "12345");
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "a.txt"), "123");
    await writeFile(join(root, "nested", "b.txt"), "1234567");

    const scan = await scanDirectory(root);
    const itemsByName = new Map(scan.items.map((item) => [item.name, item]));

    assert.equal(scan.totalBytes, 15);
    assert.equal(itemsByName.get("root.txt").sizeBytes, 5);
    assert.equal(itemsByName.get("root.txt").type, "file");
    assert.equal(itemsByName.get("nested").sizeBytes, 10);
    assert.equal(itemsByName.get("nested").type, "directory");
  });
});

test("scanDirectory reports top-level progress", async () => {
  await withFixture(async (root) => {
    const progressEvents = [];

    await writeFile(join(root, "a.txt"), "a");
    await writeFile(join(root, "b.txt"), "bb");

    await scanDirectory(root, {
      onProgress: (progress) => progressEvents.push(progress),
    });

    assert.equal(progressEvents.length, 2);
    assert.equal(progressEvents.at(-1).completedItems, 2);
    assert.equal(progressEvents.at(-1).totalItems, 2);
    assert.ok(progressEvents.at(-1).visitedEntries >= 2);
  });
});

test("groupSmallItems keeps the largest entries and combines the rest", () => {
  const items = Array.from({ length: 6 }, (_, index) => ({
    name: `item-${index + 1}`,
    path: `/tmp/item-${index + 1}`,
    type: "file",
    sizeBytes: index + 1,
  }));

  const grouped = groupSmallItems(items, 4);

  assert.equal(grouped.length, 4);
  assert.deepEqual(
    grouped.slice(0, 3).map((item) => item.sizeBytes),
    [6, 5, 4],
  );
  assert.equal(grouped[3].name, "Other");
  assert.equal(grouped[3].sizeBytes, 1 + 2 + 3);
});

test("scanDirectory records unreadable folders as warnings", {
  skip: process.platform === "win32" ? "chmod-based unreadable fixtures are not reliable on Windows" : false,
}, async () => {
  await withFixture(async (root) => {
    const locked = join(root, "locked");

    await mkdir(locked);
    await writeFile(join(locked, "hidden.txt"), "secret");
    await chmod(locked, 0o000);

    try {
      const scan = await scanDirectory(root);
      const lockedItem = scan.items.find((item) => item.name === "locked");

      assert.equal(lockedItem.sizeBytes, 0);
      assert.equal(scan.warnings.length, 1);
      assert.match(scan.warnings[0].message, /permission|EACCES|acces/i);
    } finally {
      await chmod(locked, 0o700);
    }
  });
});

test("scanDirectory stops when cancellation is requested", async () => {
  await withFixture(async (root) => {
    await writeFile(join(root, "a.txt"), "a");

    const cancelToken = createCancelToken();
    cancelToken.cancelled = true;

    await assert.rejects(
      () => scanDirectory(root, { cancelToken }),
      (error) => error.message === "Scan cancelled" && error.statusCode === 499,
    );
  });
});

test("scanDirectory rejects a file path", async () => {
  await withFixture(async (root) => {
    const filePath = join(root, "file.txt");

    await writeFile(filePath, "content");

    await assert.rejects(
      () => scanDirectory(filePath),
      (error) => error.message === "Scan path must be a directory" && error.statusCode === 400,
    );
  });
});
