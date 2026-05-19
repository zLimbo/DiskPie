# DiskPie

DiskPie is a small native disk usage visualizer for local folders. It scans a folder, totals each immediate child recursively, and renders the largest space consumers as a pie chart plus ranked list.

The app is currently a Phase 5 desktop demo built with Electron. It is read-only: it scans and reports disk usage, but it does not delete, move, or modify user files.

## Features

- Native desktop app powered by Electron
- Folder picker for local scans
- Recursive size aggregation for each immediate child
- Pie chart and ranked list views
- Click a directory row or chart segment to drill down
- Breadcrumb and Up navigation
- Streaming scan progress
- Cancel active scans
- Warnings for unreadable paths
- Small entries grouped into `Other`
- Web demo fallback using the same scanner module
- Windows portable `.exe` packaging

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- Windows is recommended for building the final Windows portable package

## Install

```bash
npm install
```

## Run Native App

```bash
npm run native
```

In the desktop app, click `Choose` to select a folder, or type a path and click `Scan`.

## Run Web Demo

```bash
npm start
```

Then open:

```text
http://127.0.0.1:4173
```

The web demo uses the same scanner through a local Node.js server and Server-Sent Events.

## Build Windows Portable Package

```bash
npm run dist:win
```

The portable executable is written to:

```text
release/DiskPie-0.1.0-windows-x64-portable.exe
```

For a debug-friendly unpacked Windows folder, run:

```bash
npm run dist:win:dir
```

That writes:

```text
release/win-unpacked/
```

`release/` is ignored by Git so binary build outputs are not committed.

## Test

```bash
npm test
```

The scanner tests cover empty folders, nested size aggregation, progress events, `Other` grouping, unreadable-path warnings, cancellation, and non-directory errors.

## Performance Tuning

DiskPie scans with bounded filesystem concurrency. The default is chosen from CPU parallelism and capped to avoid overwhelming slower disks. On Windows 11, NVMe drives may benefit from a higher value, while HDDs or network drives may need a lower one.

Run a quick benchmark:

```bash
npm run bench:scan -- "C:\\Users\\YourName"
```

Override concurrency for testing:

```bash
DISKPIE_SCAN_CONCURRENCY=128 npm run bench:scan -- "C:\\Users\\YourName"
```

For normal app runs, set `DISKPIE_SCAN_CONCURRENCY` before launching `npm run native` if you need to tune a specific machine.

## Project Structure

```text
.
├── index.html              # Shared renderer shell
├── native/
│   ├── main.mjs            # Electron main process
│   └── preload.cjs         # Safe IPC bridge exposed as window.diskPie
├── scripts/
│   ├── scanner.mjs         # Shared read-only scanner
│   ├── scanner.test.mjs    # Node test fixtures
│   └── serve.mjs           # Web demo server
└── src/
    ├── main.js             # Renderer logic for native and web modes
    └── styles.css          # App styles
```

## Safety Notes

DiskPie is intentionally read-only. It does not include cleanup actions yet. Unreadable folders are reported as warnings instead of being silently ignored.

## Roadmap

- Add richer visualization such as sunburst or treemap views
- Add search and filters
- Add recent scan locations
- Add app icon and signed Windows builds
- Evaluate worker threads for very large directory trees
