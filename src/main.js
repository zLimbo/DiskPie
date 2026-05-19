const palette = ["#3178c6", "#2f9e74", "#d9480f", "#7048e8", "#c2255c", "#0b7285", "#5c940d", "#868e96"];
const nativeApi = window.diskPie;

const chart = document.querySelector("#usage-chart");
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
const breadcrumbList = document.querySelector("#breadcrumb-list");

let currentRoot = "";
let activeScanController = null;
let activeNativeScanId = null;
let scanSequence = 0;

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
  const items = scan.items.map((item, index) => ({
    ...item,
    color: palette[index % palette.length],
  }));

  currentRoot = scan.root;
  scanPath.value = scan.root;
  totalSize.textContent = formatBytes(scan.totalBytes);
  centerTotal.textContent = formatBytes(scan.totalBytes);
  itemCount.textContent = `${items.length} ${items.length === 1 ? "item" : "items"}`;
  scanLabel.textContent = scan.root;
  renderBreadcrumbs(scan.root);

  if (items.length === 0) {
    statusMessage.textContent = "This folder is empty.";
    chart.replaceChildren();
    list.replaceChildren();
  } else if (scan.totalBytes === 0) {
    statusMessage.textContent = "No readable file data was found in this folder.";
    chart.replaceChildren();
    renderUsageList(items, 1);
  } else {
    statusMessage.textContent = "";
    renderPieChart(items, scan.totalBytes);
    renderUsageList(items, scan.totalBytes);
  }

  renderWarnings(scan.warnings);
}

function renderCanceled() {
  statusMessage.textContent = "Scan canceled.";
  totalSize.textContent = "0 B";
  centerTotal.textContent = "0 B";
  itemCount.textContent = "0 items";
  chart.replaceChildren();
  list.replaceChildren();
  warningList.replaceChildren();
}

function renderError(message) {
  scanLabel.textContent = "Scan failed";
  statusMessage.textContent = message;
  totalSize.textContent = "0 B";
  centerTotal.textContent = "0 B";
  itemCount.textContent = "0 items";
  chart.replaceChildren();
  list.replaceChildren();
  warningList.replaceChildren();
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
          path.addEventListener("click", () => loadScan(item.path));
          path.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              loadScan(item.path);
            }
          });
        }

        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = `${item.name} - ${formatBytes(item.sizeBytes)}`;
        path.appendChild(title);

        startAngle = endAngle;
        return path;
      }),
  );
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
        row.addEventListener("click", () => loadScan(item.path));
        row.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            loadScan(item.path);
          }
        });
      }

      return row;
    }),
  );
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
