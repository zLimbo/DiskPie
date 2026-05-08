# DiskPie

DiskPie is a small disk usage visualizer built step by step from a minimal demo
into a practical local tool.

The current version is Phase 1: a static data pie demo. It does not scan the
filesystem yet.

## Run The Demo

```powershell
node scripts/serve.mjs
```

Then open:

```text
http://localhost:4173
```

## Current Scope

The app renders sample disk usage data as a pie chart and ranked list. Real
directory scanning will be added in a later phase.

