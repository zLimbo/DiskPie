# DiskPie Development Plan

DiskPie is a disk usage visualizer inspired by Ubuntu Disk Usage Analyzer
(Baobab). The long-term goal is to scan folders or disks, aggregate file sizes,
and show storage usage as an interactive pie/sunburst style chart so large
space consumers are easy to find.

This project starts from the simplest useful demo and grows in small, verifiable
steps.

## Product Scope

### Core User Goal

Help a user answer one question quickly:

> Which folders or files are taking the most storage space?

### First Demo Goal

Build a minimal local app that:

1. Scans a user-selected or configured directory.
2. Calculates immediate child sizes.
3. Displays the result as a simple pie chart.
4. Shows names and byte sizes for each segment.

The first demo does not need full disk scanning, native OS integration,
background workers, deletion tools, or polished packaging.

## Development Phases

### Phase 0: Project Foundation

Status: completed

Tasks:

1. Initialize git repository.
2. Add project documentation.
3. Choose the first implementation stack.
4. Add a minimal README.
5. Add basic project scripts.

Exit criteria:

1. Repository has a clean initial commit.
2. Documentation explains the product direction and engineering rules.
3. A new developer can understand how the project will grow.

### Phase 1: Static Data Pie Demo

Status: completed

Purpose:

Prove the UI and chart concept before touching filesystem complexity.

Tasks:

1. Create a minimal app shell.
2. Render a pie chart from hard-coded sample folder data.
3. Add a simple legend with folder name, size, and percentage.
4. Add responsive layout for desktop and narrow screens.

Exit criteria:

1. App runs locally.
2. Pie chart is visible and readable.
3. Sample data can be changed in one obvious place.

### Phase 2: Real Directory Scan

Status: planned

Purpose:

Replace static data with real filesystem data.

Tasks:

1. Implement a safe scanner for one configured directory path.
2. Compute total size recursively for each immediate child.
3. Handle unreadable files and permission errors without crashing.
4. Sort results by size descending.
5. Group tiny entries into an "Other" bucket when needed.

Exit criteria:

1. Scanning a small folder produces correct aggregate sizes.
2. Permission errors are reported as warnings.
3. UI can render real scan output.

### Phase 3: Navigation and Drilldown

Status: planned

Purpose:

Let users move from the overview into heavy folders.

Tasks:

1. Click a chart segment or list row to drill into a folder.
2. Add breadcrumbs for the current path.
3. Add a back/up action.
4. Keep scan state understandable while navigating.

Exit criteria:

1. User can start at a root folder and inspect nested folders.
2. Breadcrumbs always match the currently displayed folder.

### Phase 4: Performance and Large Folders

Status: planned

Purpose:

Make scanning usable on large directory trees.

Tasks:

1. Move scanning to a background process or worker.
2. Stream progress updates.
3. Add cancellation.
4. Avoid blocking the UI during large scans.
5. Add scanner tests with generated fixture folders.

Exit criteria:

1. Large scans do not freeze the UI.
2. User can cancel an active scan.
3. Tests cover basic scanner correctness.

### Phase 5: Native Desktop Experience

Status: planned

Purpose:

Turn the demo into a practical local tool.

Tasks:

1. Add directory picker.
2. Add platform-aware path handling.
3. Add app packaging.
4. Persist recent scan locations.
5. Add clearer error and empty states.

Exit criteria:

1. User can choose a folder without editing config.
2. App can be launched like a normal desktop app.

### Phase 6: Advanced Visualization

Status: planned

Purpose:

Improve insight density beyond a basic pie chart.

Tasks:

1. Evaluate sunburst chart, treemap, or ring chart views.
2. Add hover details.
3. Add file type coloring or folder/file distinction.
4. Add search/filter.
5. Add export of scan summary.

Exit criteria:

1. Visualization still answers the core user question quickly.
2. Advanced views are useful, not decorative.

## Initial Technical Direction

The first version should favor speed of learning and small commits.

Preferred target stack:

1. Frontend: Vite + React + TypeScript.
2. Charting: start with a lightweight chart library or simple SVG pie chart.
3. Scanner: Node.js filesystem APIs for the first local demo.
4. Desktop packaging later: Electron or Tauri, decided after the web demo works.

Current Phase 1 implementation:

1. Zero-dependency HTML, CSS, and JavaScript.
2. A small Node.js static file server.
3. No package manager requirement yet, because the current environment has
   `node` but not `npm`.
4. Migration to Vite + React + TypeScript remains the preferred next frontend
   structure once package management is available.

Reasons:

1. React makes iterative UI work fast.
2. TypeScript keeps scanner data structures explicit.
3. Vite keeps the first demo lightweight.
4. Electron/Tauri can be postponed until the product shape is clearer.

## Project Rules

### Git Rules

1. Work in small commits.
2. Keep `main` stable.
3. Use branch names like `feature/static-pie-demo` or `fix/scanner-errors`.
4. Commit messages should use this format:

   ```text
   type(scope): short summary
   ```

   Examples:

   ```text
   docs(plan): add staged development plan
   feat(chart): render sample disk usage pie
   test(scanner): cover nested directory sizes
   ```

5. Do not mix unrelated changes in one commit.
6. Before committing, run the relevant validation command.

### Engineering Rules

1. Keep each phase independently runnable.
2. Prefer simple data structures until complexity is proven.
3. Keep scanning logic separate from UI rendering.
4. Never delete or modify user files from the app in early phases.
5. Treat filesystem errors as expected data, not fatal surprises.
6. Use platform-safe path APIs instead of manual path string splitting.
7. Add tests when scanner behavior, aggregation, or navigation logic changes.

### UI Rules

1. The first screen should be the actual disk usage view, not a landing page.
2. Show size, percentage, and path/folder name clearly.
3. Large folders should be visually obvious.
4. Avoid decorative visuals that do not improve diagnosis.
5. Keep controls compact and tool-like.
6. Every loading, empty, and error state should tell the user what happened.

### Safety Rules

1. Initial versions are read-only.
2. Do not add delete, move, or cleanup actions until scanning is trustworthy.
3. Clearly mark inaccessible files or folders.
4. Do not require administrator privileges for normal scans.
5. Avoid silently skipping errors; collect and display warnings.

### Testing Rules

1. Use fixture directories for scanner tests.
2. Test empty folders, nested folders, unreadable paths, and large file mocks.
3. Keep chart rendering tests lightweight.
4. Use manual browser checks for early visual verification.
5. Add regression tests for every scanner bug found.

## Data Model Draft

```ts
type DiskNode = {
  name: string;
  path: string;
  kind: "file" | "directory";
  sizeBytes: number;
  children?: DiskNode[];
  warnings?: ScanWarning[];
};

type ScanWarning = {
  path: string;
  reason: string;
};
```

This model is intentionally small. It can support a simple pie chart now and a
tree, sunburst, or drilldown view later.

## Near-Term Checklist

1. Create initial commit with documentation. Done.
2. Build a zero-dependency static pie demo. Done.
3. Render hard-coded sample data as a pie chart. Done.
4. Add size formatting utility. Done.
5. Verify local server responds. Done.
6. Commit the static demo.
7. Start Phase 2 by designing the scanner boundary.
