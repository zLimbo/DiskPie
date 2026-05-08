const sampleData = [
  { name: "Videos", path: "D:/Media/Videos", sizeBytes: 128_849_018_880, color: "#3178c6" },
  { name: "Projects", path: "D:/dev", sizeBytes: 64_424_509_440, color: "#2f9e74" },
  { name: "Games", path: "D:/Games", sizeBytes: 96_636_764_160, color: "#d9480f" },
  { name: "Downloads", path: "C:/Users/z/Downloads", sizeBytes: 42_949_672_960, color: "#7048e8" },
  { name: "Pictures", path: "D:/Photos", sizeBytes: 25_769_803_776, color: "#c2255c" },
  { name: "Other", path: "Multiple small folders", sizeBytes: 17_179_869_184, color: "#868e96" },
];

const chart = document.querySelector("#usage-chart");
const list = document.querySelector("#usage-list");
const totalSize = document.querySelector("#total-size");
const centerTotal = document.querySelector("#center-total");
const itemCount = document.querySelector("#item-count");

const totalBytes = sampleData.reduce((sum, item) => sum + item.sizeBytes, 0);

totalSize.textContent = formatBytes(totalBytes);
centerTotal.textContent = formatBytes(totalBytes);
itemCount.textContent = `${sampleData.length} items`;

renderPieChart(sampleData, totalBytes);
renderUsageList(sampleData, totalBytes);

function renderPieChart(items, total) {
  let startAngle = -90;

  chart.replaceChildren(
    ...items.map((item) => {
      const angle = (item.sizeBytes / total) * 360;
      const endAngle = startAngle + angle;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

      path.setAttribute("d", describeArc(120, 120, 94, startAngle, endAngle));
      path.setAttribute("fill", item.color);
      path.setAttribute("stroke", "#ffffff");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("tabindex", "0");
      path.setAttribute(
        "aria-label",
        `${item.name}: ${formatBytes(item.sizeBytes)}, ${formatPercent(item.sizeBytes, total)}`,
      );

      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${item.name} - ${formatBytes(item.sizeBytes)}`;
      path.appendChild(title);

      startAngle = endAngle;
      return path;
    }),
  );
}

function renderUsageList(items, total) {
  const sortedItems = [...items].sort((a, b) => b.sizeBytes - a.sizeBytes);

  list.replaceChildren(
    ...sortedItems.map((item) => {
      const row = document.createElement("li");
      row.className = "usage-row";

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

      return row;
    }),
  );
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

