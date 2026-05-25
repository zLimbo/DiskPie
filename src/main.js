const palette = ["#3178c6", "#2f9e74", "#d9480f", "#7048e8", "#c2255c", "#0b7285", "#5c940d", "#868e96"];
const dirPalette = ["#3178c6", "#4a8fd4", "#1f5f9e", "#6ba3e0", "#1a4d7a", "#5c94c8", "#2e6fa8", "#87b8e8"];
const filePalette = ["#2f9e74", "#4ab88a", "#1f7a56", "#6bcf9e", "#166342", "#52b888", "#2a8f66", "#87dbae"];
const nativeApi = window.diskPie;

const chart = document.querySelector("#usage-chart");
const treemapChart = document.querySelector("#treemap-chart");
const list = document.querySelector("#usage-list");
const warningList = document.querySelector("#warning-list");
const totalSize = document.querySelector("#total-size");
const centerTotal = document.querySelector("#center-total");
const itemCount = document.querySelector("#item-count");
const scanLabel = document.querySelector("#scan-label");
const statusMessage = document.querySelector("#status-message");
const scanForm = document.querySelector("#scan-form");
const scanPath = document.querySelector("#scan-path");
const scanButton = document.querySelector("#scan-button");
const chooseButton = document.querySelector("#choose-button");
const cancelButton = document.querySelector("#cancel-button");
const parentButton = document.querySelector("#parent-button");
const exportBtn = document.querySelector("#export-button");
const tooltipEl = document.querySelector("#tooltip");
const viewPieBtn = document.querySelector("#view-pie");
const viewTreemapBtn = document.querySelector("#view-treemap");
const filterInput = document.querySelector("#filter-input");
const colorModeCheckbox = document.querySelector("#color-mode-checkbox");

let currentRoot = "";
let activeScanController = null;
let activeNativeScanId = null;
let scanSequence = 0;

let activeView = "pie";
let lastScan = null;
let lastScanItems = null;

if (nativeApi?.isNative) {
  chooseButton.hidden = false;
  nativeApi.onScanEvent((message) => handleScanEvent(message, message.scanId));
}

scanForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadScan(scanPath.value.trim());
});

chooseButton.addEventListener("click", async () => {
  const directory = await nativeApi?.chooseDirectory();

  if (directory) {
    scanPath.value = directory;
    loadScan(directory);
  }
});

cancelButton.addEventListener("click", () => {
  if (activeNativeScanId) {
    nativeApi.cancelScan(activeNativeScanId);
    renderCanceled();
    setScanControlsIdle();
    activeNativeScanId = null;
    scanSequence += 1;
    return;
  }

  activeScanController?.abort();
});

parentButton.addEventListener("click", () => {
  const parentPath = getParentPath(currentRoot);

  if (parentPath && parentPath !== currentRoot) {
    loadScan(parentPath);
  }
});

exportBtn.addEventListener("click", exportScan);

viewPieBtn.addEventListener("click", () => switchView("pie"));
viewTreemapBtn.addEventListener("click", () => switchView("treemap"));

filterInput.addEventListener("input", () => applyFilter());

colorModeCheckbox.addEventListener("change", () => {
  if (lastScan) renderCurrentView();
});

if (nativeApi?.isNative) {
  statusMessage.textContent = "Choose a folder to scan.";
  setScanControlsIdle();
} else {
  loadScan(scanPath.value.trim());
}

async function loadScan(path) {
  if (nativeApi?.isNative) {
    await loadNativeScan(path);
    return;
  }

  await loadWebScan(path);
}

async function loadNativeScan(path) {
  activeScanController?.abort();

  const scanId = `scan-${Date.now()}-${++scanSequence}`;
  activeNativeScanId = scanId;
  setLoading(path);

  try {
    const result = await nativeApi.scanDirectory(scanId, path);

    if (activeNativeScanId === scanId && result && !result.ok) {
      renderError(result.error || "Scan failed");
    }
  } catch (error) {
    if (activeNativeScanId === scanId) {
      renderError(error.message || "Scan failed");
    }
  } finally {
    if (activeNativeScanId === scanId) {
      activeNativeScanId = null;
      setScanControlsIdle();
    }
  }
}

async function loadWebScan(path) {
  activeScanController?.abort();

  const scanId = ++scanSequence;
  const controller = new AbortController();
  activeScanController = controller;
  activeNativeScanId = null;
  setLoading(path);

  try {
    const query = path ? `?path=${encodeURIComponent(path)}` : "";
    const response = await fetch(`/api/scan-stream${query}`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("Scan failed");
    }

    await readScanStream(response, scanId);
  } catch (error) {
    if (scanId !== scanSequence) {
      return;
    }

    if (error.name === "AbortError") {
      renderCanceled();
      return;
    }

    renderError(error.message);
  } finally {
    if (scanId === scanSequence) {
      activeScanController = null;
      setScanControlsIdle();
    }
  }
}

async function readScanStream(response, scanId) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      handleScanEvent(parseScanEvent(chunk), scanId);
    }
  }

  if (buffer.trim()) {
    handleScanEvent(parseScanEvent(buffer), scanId);
  }
}

function parseScanEvent(chunk) {
  const eventLine = chunk.split("\n").find((line) => line.startsWith("event: "));
  const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));

  return {
    event: eventLine?.slice(7) || "message",
    data: dataLine ? JSON.parse(dataLine.slice(6)) : null,
  };
}

function handleScanEvent(message, scanId) {
  if (scanId !== scanSequence && scanId !== activeNativeScanId) {
    return;
  }

  if (!message.data) {
    return;
  }

  if (message.event === "progress") {
    renderProgress(message.data);
    return;
  }

  if (message.event === "complete") {
    renderScan(message.data);
    return;
  }

  if (message.event === "error") {
    renderError(message.data.error || "Scan failed");
  }
}

function setLoading(path) {
  scanButton.disabled = true;
  chooseButton.disabled = true;
  cancelButton.hidden = false;
  cancelButton.disabled = false;
  parentButton.disabled = true;
  scanLabel.textContent = path || "Home folder";
  statusMessage.textContent = "Scanning...";
  totalSize.textContent = "0 B";
  centerTotal.textContent = "0 B";
  itemCount.textContent = "0 items";
  chart.replaceChildren();
  treemapChart.replaceChildren();
  treemapChart.hidden = true;
  chart.hidden = false;
  list.replaceChildren();
  warningList.replaceChildren();
}

function setScanControlsIdle() {
  scanButton.disabled = false;
  chooseButton.disabled = false;
  cancelButton.hidden = true;
  cancelButton.disabled = true;
  parentButton.disabled = !getParentPath(currentRoot) || getParentPath(currentRoot) === currentRoot;
}

function renderProgress(progress) {
  const currentName = progress.currentPath.split(/[\\/]/).filter(Boolean).at(-1) || progress.currentPath;
  const percent = progress.totalItems > 0 ? Math.round((progress.completedItems / progress.totalItems) * 100) : 100;

  statusMessage.textContent = `Scanning ${currentName} (${progress.completedItems}/${progress.totalItems}, ${percent}%). Visited ${progress.visitedEntries} entries.`;

  if (progress.warnings > 0) {
    statusMessage.textContent += ` ${progress.warnings} warnings.`;
  }
}

function renderScan(scan) {
  lastScan = scan;
  lastScanItems = scan.items;

  currentRoot = scan.root;
  scanPath.value = scan.root;
  totalSize.textContent = formatBytes(scan.totalBytes);
  centerTotal.textContent = formatBytes(scan.totalBytes);
  scanLabel.textContent = scan.root;
  renderBreadcrumbs(scan.root);

  filterInput.value = "";
  renderCurrentView();
  renderWarnings(scan.warnings);

  exportBtn.hidden = false;
  exportBtn.disabled = false;
}

function switchView(view) {
  if (view === activeView) return;
  activeView = view;

  viewPieBtn.classList.toggle("is-active", view === "pie");
  viewPieBtn.setAttribute("aria-selected", view === "pie");
  viewTreemapBtn.classList.toggle("is-active", view === "treemap");
  viewTreemapBtn.setAttribute("aria-selected", view === "treemap");

  if (lastScan) renderCurrentView();
}

function getCurrentPalette() {
  if (!colorModeCheckbox.checked) return palette;
  return { directory: dirPalette, file: filePalette };
}

function pickColor(index, itemType) {
  const p = getCurrentPalette();
  if (colorModeCheckbox.checked && (itemType === "directory" || itemType === "file")) {
    const arr = itemType === "directory" ? p.directory : p.file;
    return arr[index % arr.length];
  }
  return p[index % p.length];
}

function renderCurrentView() {
  if (!lastScan) return;

  const filterText = filterInput.value.trim().toLowerCase();
  const rawItems = filterText
    ? lastScanItems.filter((item) => item.name.toLowerCase().includes(filterText) || item.path.toLowerCase().includes(filterText))
    : lastScanItems;
  const total = rawItems.reduce((sum, item) => sum + item.sizeBytes, 0);
  const items = rawItems.map((item, index) => ({
    ...item,
    color: pickColor(index, item.type),
  }));

  itemCount.textContent = `${items.length} ${items.length === 1 ? "item" : "items"}`;

  chart.hidden = activeView !== "pie";
  treemapChart.hidden = activeView !== "treemap";

  if (items.length === 0) {
    statusMessage.textContent = filterText ? "No items match the filter." : "This folder is empty.";
    chart.replaceChildren();
    treemapChart.replaceChildren();
    list.replaceChildren();
  } else if (total === 0) {
    statusMessage.textContent = filterText ? "No readable file data matches the filter." : "No readable file data was found in this folder.";
    chart.replaceChildren();
    treemapChart.replaceChildren();
    renderUsageList(items, 1);
  } else {
    statusMessage.textContent = "";
    if (activeView === "pie") {
      renderPieChart(items, total);
    } else {
      renderTreemap(items, total);
    }
    renderUsageList(items, total);
  }
}

function renderCanceled() {
  lastScan = null;
  lastScanItems = null;
  statusMessage.textContent = "Scan canceled.";
  totalSize.textContent = "0 B";
  centerTotal.textContent = "0 B";
  itemCount.textContent = "0 items";
  chart.replaceChildren();
  treemapChart.replaceChildren();
  list.replaceChildren();
  warningList.replaceChildren();
  exportBtn.hidden = true;
}

function renderError(message) {
  lastScan = null;
  lastScanItems = null;
  scanLabel.textContent = "Scan failed";
  statusMessage.textContent = message;
  totalSize.textContent = "0 B";
  centerTotal.textContent = "0 B";
  itemCount.textContent = "0 items";
  chart.replaceChildren();
  treemapChart.replaceChildren();
  list.replaceChildren();
  warningList.replaceChildren();
  exportBtn.hidden = true;
}

function renderPieChart(items, total) {
  let startAngle = -90;

  chart.replaceChildren(
    ...items
      .filter((item) => item.sizeBytes > 0)
      .map((item) => {
        const angle = (item.sizeBytes / total) * 360;
        const endAngle = startAngle + angle;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const canDrillDown = item.type === "directory";

        path.setAttribute("d", describeArc(120, 120, 94, startAngle, endAngle));
        path.setAttribute("fill", item.color);
        path.setAttribute("stroke", "#ffffff");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("tabindex", canDrillDown ? "0" : "-1");
        path.classList.toggle("is-drillable", canDrillDown);
        path.setAttribute(
          "aria-label",
          `${item.name}: ${formatBytes(item.sizeBytes)}, ${formatPercent(item.sizeBytes, total)}`,
        );

        if (canDrillDown) {
          path.setAttribute("role", "button");
          path.addEventListener("click", () => drillTo(item.path));
          path.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              drillTo(item.path);
            }
          });
        }

        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = `${item.name} - ${formatBytes(item.sizeBytes)}`;
        path.appendChild(title);

        attachTooltip(path, item, total);

        startAngle = endAngle;
        return path;
      }),
  );
}

function renderTreemap(items, total) {
  const viewWidth = 240;
  const viewHeight = 240;
  const rects = squarify(items.filter((item) => item.sizeBytes > 0), viewWidth, viewHeight);

  treemapChart.replaceChildren(
    ...rects.map((rect) => {
      const svgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const item = rect.item;
      const canDrillDown = item.type === "directory";

      svgRect.setAttribute("x", rect.x);
      svgRect.setAttribute("y", rect.y);
      svgRect.setAttribute("width", rect.width);
      svgRect.setAttribute("height", rect.height);
      svgRect.setAttribute("fill", item.color);
      svgRect.setAttribute("stroke", "#ffffff");
      svgRect.setAttribute("stroke-width", "2");
      svgRect.setAttribute("tabindex", canDrillDown ? "0" : "-1");
      svgRect.classList.toggle("is-drillable", canDrillDown);
      svgRect.setAttribute(
        "aria-label",
        `${item.name}: ${formatBytes(item.sizeBytes)}, ${formatPercent(item.sizeBytes, total)}`,
      );

      if (canDrillDown) {
        svgRect.setAttribute("role", "button");
        svgRect.addEventListener("click", () => drillTo(item.path));
        svgRect.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            drillTo(item.path);
          }
        });
      }

      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${item.name} - ${formatBytes(item.sizeBytes)}`;
      svgRect.appendChild(title);

      attachTooltip(svgRect, item, total);

      return svgRect;
    }),
  );
}

// Squarified treemap layout (Bruls, Huizing, van Wijk algorithm)
// Returns [{ item, x, y, width, height }] for the given viewport size.
function squarify(items, width, height) {
  const sorted = [...items].sort((a, b) => b.sizeBytes - a.sizeBytes);
  const totalSize = sorted.reduce((sum, i) => sum + i.sizeBytes, 0);
  const result = [];
  if (totalSize === 0 || sorted.length === 0) return result;

  // Normalise to area * width * height
  const nodes = sorted.map((item) => ({
    item,
    area: Math.max(0, (item.sizeBytes / totalSize) * width * height),
  }));

  const rows = squarifyLayout(nodes, [], width, height);
  let xOff = 0, yOff = 0;

  for (const row of rows) {
    const rowArea = row.reduce((s, n) => s + n.area, 0);
    let rowW, rowH;

    if (width <= height) {
      rowW = rowArea / height;
      rowH = height;
      let curY = 0;
      for (const n of row) {
        const h = n.area / rowW;
        result.push({ item: n.item, x: xOff, y: yOff + curY, width: rowW, height: h });
        curY += h;
      }
      xOff += rowW;
      width -= rowW;
    } else {
      rowH = rowArea / width;
      rowW = width;
      let curX = 0;
      for (const n of row) {
        const w = n.area / rowH;
        result.push({ item: n.item, x: xOff + curX, y: yOff, width: w, height: rowH });
        curX += w;
      }
      yOff += rowH;
      height -= rowH;
    }
  }

  return result;
}

function squarifyLayout(nodes, row, w, h) {
  if (nodes.length === 0) return row.length ? [row] : [];

  const shortSide = Math.min(w, h);
  const candidate = nodes[0];
  const testRow = [...row, candidate];
  const rowArea = testRow.reduce((s, n) => s + n.area, 0);
  const rowLen = rowArea / shortSide;

  if (row.length === 0 || worstAspect(testRow, rowLen) <= worstAspect(row, rowArea / shortSide)) {
    return squarifyLayout(nodes.slice(1), testRow, w, h);
  }

  return [row, ...squarifyLayout(nodes, [], w, h)];
}

function worstAspect(row, rowLen) {
  let worst = 0;
  for (const n of row) {
    const d = n.area / rowLen;
    const r = Math.max(rowLen / d, d / rowLen);
    if (r > worst) worst = r;
  }
  return worst;
}

function renderUsageList(items, total) {
  list.replaceChildren(
    ...items.map((item) => {
      const row = document.createElement("li");
      const canDrillDown = item.type === "directory";

      row.className = "usage-row";
      row.classList.toggle("is-drillable", canDrillDown);
      row.innerHTML = `
        <span class="color-swatch" style="background: ${item.color}"></span>
        <span class="item-main">
          <strong>${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(item.path)}</small>
        </span>
        <span class="item-size">
          <strong>${formatBytes(item.sizeBytes)}</strong>
          <small>${formatPercent(item.sizeBytes, total)}</small>
        </span>
      `;

      if (canDrillDown) {
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.setAttribute("aria-label", `Open ${item.path}`);
        row.addEventListener("click", () => drillTo(item.path));
        row.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            drillTo(item.path);
          }
        });
      }

      return row;
    }),
  );
}

function exportScan() {
  if (!lastScan) return;

  const data = JSON.stringify({
    root: lastScan.root,
    totalBytes: lastScan.totalBytes,
    items: lastScanItems,
    warnings: lastScan.warnings,
  }, null, 2);

  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `diskpie-${lastScan.root.replace(/[\\/:\s]+/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function applyFilter() {
  if (!lastScan) return;
  renderCurrentView();
}

function attachTooltip(element, item, total) {
  element.addEventListener("mouseenter", (event) => {
    showTooltip(event, item, total);
  });
  element.addEventListener("mousemove", (event) => {
    positionTooltip(event);
  });
  element.addEventListener("mouseleave", hideTooltip);
  element.addEventListener("focus", (event) => {
    showTooltip(event, item, total, true);
  });
  element.addEventListener("blur", hideTooltip);
}

function showTooltip(event, item, total, isFocus) {
  tooltipEl.innerHTML = `
    <div class="tooltip-name">${escapeHtml(item.name)}</div>
    <div class="tooltip-path">${escapeHtml(item.path)}</div>
    <div class="tooltip-size">${formatBytes(item.sizeBytes)} (${formatPercent(item.sizeBytes, total)})</div>
    <div class="tooltip-type">${item.type === "directory" ? "Directory" : "File"}</div>
  `;
  tooltipEl.hidden = false;

  if (!isFocus) {
    positionTooltip(event);
  } else {
    // For focus events, position below the focused element
    const rect = event.target.getBoundingClientRect();
    const parentRect = tooltipEl.parentElement.getBoundingClientRect();
    tooltipEl.style.left = `${Math.min(rect.left - parentRect.left, parentRect.width - 300)}px`;
    tooltipEl.style.top = `${rect.bottom - parentRect.top + 8}px`;
  }
}

function positionTooltip(event) {
  const parentRect = tooltipEl.parentElement.getBoundingClientRect();
  let left = event.clientX - parentRect.left + 12;
  let top = event.clientY - parentRect.top - 10;

  // Keep tooltip within the chart panel
  const tooltipWidth = 280;
  const tooltipHeight = tooltipEl.offsetHeight || 80;
  if (left + tooltipWidth > parentRect.width - 8) {
    left = event.clientX - parentRect.left - tooltipWidth - 12;
  }
  if (top + tooltipHeight > parentRect.height - 8) {
    top = event.clientY - parentRect.top - tooltipHeight - 10;
  }
  if (top < 0) top = 8;

  tooltipEl.style.left = `${Math.max(4, left)}px`;
  tooltipEl.style.top = `${Math.max(4, top)}px`;
}

function hideTooltip() {
  tooltipEl.hidden = true;
}

function drillTo(path) {
  loadScan(path);
}

function renderBreadcrumbs(path) {
  const crumbs = getBreadcrumbs(path);

  breadcrumbList.replaceChildren(
    ...crumbs.map((crumb, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const isCurrent = index === crumbs.length - 1;

      button.type = "button";
      button.textContent = crumb.label;
      button.disabled = isCurrent;
      button.setAttribute("aria-current", isCurrent ? "page" : "false");

      if (!isCurrent) {
        button.addEventListener("click", () => loadScan(crumb.path));
      }

      item.append(button);
      return item;
    }),
  );
}

function renderWarnings(warnings) {
  warningList.replaceChildren();

  if (warnings.length === 0) {
    return;
  }

  const warningSummary = summarizeWarnings(warnings);
  const item = document.createElement("li");
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const detailList = document.createElement("ul");

  summary.textContent = `Skipped ${warnings.length} system or locked ${warnings.length === 1 ? "item" : "items"}. ${warningSummary}`;

  warnings.slice(0, 8).forEach((warning) => {
    const detail = document.createElement("li");
    detail.textContent = `${warning.path}: ${warning.message}`;
    detailList.append(detail);
  });

  if (warnings.length > 8) {
    const detail = document.createElement("li");
    detail.textContent = `${warnings.length - 8} more warnings hidden.`;
    detailList.append(detail);
  }

  details.append(summary, detailList);
  item.append(details);
  warningList.append(item);
}

function summarizeWarnings(warnings) {
  const counts = new Map();

  warnings.forEach((warning) => {
    const code = warning.message.match(/\b[A-Z][A-Z0-9_]+\b/)?.[0] || "WARN";
    counts.set(code, (counts.get(code) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code, count]) => `${code}: ${count}`)
    .join(", ");
}

function getBreadcrumbs(path) {
  const normalizedPath = path.replace(/\\+/g, "/");
  const hasRoot = normalizedPath.startsWith("/");
  const parts = normalizedPath.split("/").filter(Boolean);
  const crumbs = [];

  if (hasRoot) {
    crumbs.push({ label: "/", path: "/" });
  }

  parts.forEach((part, index) => {
    const crumbPath = `${hasRoot ? "/" : ""}${parts.slice(0, index + 1).join("/")}`;
    crumbs.push({ label: part, path: crumbPath });
  });

  return crumbs.length > 0 ? crumbs : [{ label: path, path }];
}

function getParentPath(path) {
  if (!path || path === "/") {
    return path;
  }

  const trimmedPath = path.replace(/\/+$/g, "");
  const separatorIndex = trimmedPath.lastIndexOf("/");

  if (separatorIndex <= 0) {
    return "/";
  }

  return trimmedPath.slice(0, separatorIndex);
}

function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatPercent(value, total) {
  return `${((value / total) * 100).toFixed(1)}%`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
