
// ============================================================
// SAVILLS LEASE LEVERAGE ENGINE
// SCENARIO CONDITIONS — V2
//
// Standalone module.
// No changes to curves.js, process.js, restructure.js,
// annotations.js, or the existing baseline calculations.
//
// Existing app.js imports:
//   ensureConditionsPanel
//   applyConditionScenario
//
// Also exports:
//   resetConditionScenario
//   getConditionScenarioState
//
// Slider zero = exact modeled baseline.
// All calculations restart from immutable baseline data.
//
// Workbook MODELED/ACTIVE values already incorporate
// diminishing condition weights.
// ============================================================

const DAY_MS = 86400000;

const CONDITION_DEFS = [
  {
    key: "capital",
    label: "CAPITAL / REFINANCING PRESSURE",
    token: "CAPITAL PRESSURE",
    x: -120,
    y: 12
  },
  {
    key: "rollover",
    label: "BUILDING ROLLOVER EXPOSURE",
    token: "ROLLOVER EXPOSURE",
    x: -90,
    y: 10
  },
  {
    key: "alternative",
    label: "ALTERNATIVE EXECUTABILITY",
    token: "ALTERNATIVE EXECUTABILITY",
    x: -75,
    y: 10
  },
  {
    key: "market",
    label: "MARKET COMPETITIVE PRESSURE",
    token: "MARKET PRESSURE",
    x: -60,
    y: 8
  },
  {
    key: "requirement",
    label: "REQUIREMENT FLEXIBILITY",
    token: "REQUIREMENT FLEXIBILITY",
    x: -45,
    y: 6
  }
];

const levels = Object.fromEntries(
  CONDITION_DEFS.map(def => [def.key, 0])
);

const PANEL_ID = "conditionsPanel";
const TAB_ID = "conditionsTab";

let panelCollapsed = false;
let latestScenario = null;

// ============================================================
// NUMERIC UTILITIES
// ============================================================

function clamp(value, minimum, maximum) {
  return Math.max(
    minimum,
    Math.min(maximum, value)
  );
}


function applyBoundedLeverage(base, adjustment, sensitivity = 25) {
  const b = clamp100(base);
  const a = Number.isFinite(adjustment) ? adjustment : 0;

  if (a === 0) return b;

  if (a > 0) {
    return clamp100(
      b + (100 - b) * a / (sensitivity + a)
    );
  }

  const magnitude = -a;

  return clamp100(
    b - b * magnitude / (sensitivity + magnitude)
  );
}


function finite(value, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function validDate(value) {
  const date = value instanceof Date
    ? new Date(+value)
    : new Date(value);

  return Number.isFinite(+date)
    ? date
    : null;
}

function fmtDate(value) {
  const date = validDate(value);

  if (!date) return "—";

  return (
    String(date.getMonth() + 1).padStart(2, "0") +
    "/" +
    String(date.getDate()).padStart(2, "0") +
    "/" +
    String(date.getFullYear()).slice(-2)
  );
}

function dayDifference(a, b) {
  return Math.round(
    (+b - +a) / DAY_MS
  );
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);

  return t * t * (3 - 2 * t);
}

function smootherstep(value) {
  const t = clamp(value, 0, 1);

  return t * t * t *
    (t * (t * 6 - 15) + 10);
}

function scenarioActive() {
  return CONDITION_DEFS.some(
    def => levels[def.key] !== 0
  );
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function hasCondition(row, definition) {
  return normalizeText(
    row.conditionAdjuster
  ).includes(definition.token);
}

// ============================================================
// WORKBOOK RESOLUTION
//
// Smartsheet resolves:
//
// VERIFIED > ADJUSTED > MODELED
//
// ACTIVE is authoritative when supplied.
//
// Never convert a blank override to zero.
// ============================================================

function resolvedValue(row, axis) {
  const keys = [
    `condition${axis}Active`,
    `condition${axis}Verified`,
    `condition${axis}Adjusted`,
    `condition${axis}Modeled`
  ];

  for (const key of keys) {
    const value = row[key];

    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }
  }

  return 0;
}

// ============================================================
// CONDITION CONTRIBUTION MODEL
//
// IMPORTANT:
//
// The workbook already contains diminishing-weighted
// X/Y aggregate impacts.
//
// The coefficients below are used ONLY to attribute
// the workbook total across applicable controls.
//
// The total is NOT weighted again.
//
// Rank:
// 1 = 100%
// 2 = 50%
// 3 = 25%
// 4 = 12.5%
// 5 = 6.25%
//
// This attribution is provisional when workbook totals
// are replaced with independently calibrated economics.
// ============================================================

function applicableConditions(row) {
  return CONDITION_DEFS.filter(
    def => hasCondition(row, def)
  );
}

function weightedContributions(row) {
  const applicable = applicableConditions(row);

  const result = [];

  for (let i = 0; i < applicable.length; i++) {
    const def = applicable[i];

    const weight = Math.pow(0.5, i);

    result.push({
      key: def.key,
      label: def.label,
      x: def.x * weight,
      y: def.y * weight,
      weight
    });
  }

  return result;
}

function rowScenarioImpact(row) {
  const contributions = weightedContributions(row);

  if (!contributions.length) {
    return {
      xDays: 0,
      yPoints: 0
    };
  }

  const workbookX = resolvedValue(row, "X");
  const workbookY = resolvedValue(row, "Y");

  const totalX = contributions.reduce(
    (sum, c) => sum + c.x,
    0
  );

  const totalY = contributions.reduce(
    (sum, c) => sum + c.y,
    0
  );

  let selectedX = 0;
  let selectedY = 0;

  for (const contribution of contributions) {
    const intensity = clamp(
      finite(levels[contribution.key], 0) / 100,
      -1,
      1
    );

    selectedX += contribution.x * intensity;
    selectedY += contribution.y * intensity;
  }

  return {
    xDays: Math.abs(totalX) > 1e-9
      ? workbookX * selectedX / totalX
      : 0,

    yPoints: Math.abs(totalY) > 1e-9
      ? workbookY * selectedY / totalY
      : 0
  };
}

// ============================================================
// PREPARE ROW-LEVEL IMPACTS
// ============================================================

function impactRows(data) {
  return data
    .filter(
      row =>
        row.date instanceof Date &&
        Number.isFinite(+row.date)
    )
    .map(row => {
      const impact = rowScenarioImpact(row);

      return {
        time: +row.date,
        x: impact.xDays,
        y: impact.yPoints
      };
    })
    .sort((a, b) => a.time - b.time);
}

function interpolateImpact(rows, timestamp, axis) {
  if (!rows.length) return 0;

  if (
    timestamp < rows[0].time ||
    timestamp > rows[rows.length - 1].time
  ) {
    return 0;
  }

  if (timestamp === rows[0].time) {
    return rows[0][axis];
  }

  let lo = 0;
  let hi = rows.length - 1;

  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;

    if (rows[mid].time <= timestamp) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = rows[lo];
  const b = rows[hi];

  const fraction =
    (timestamp - a.time) /
    ((b.time - a.time) || 1);

  return a[axis] +
    (b[axis] - a[axis]) * fraction;
}

// ============================================================
// SMOOTH IMPACT FIELD
//
// Interpolated row impacts are smoothed using a Gaussian
// kernel over calendar time.
//
// This prevents sudden jumps in condition influence.
//
// The smoothing bandwidth is derived from chart spacing.
// ============================================================

function median(values) {
  if (!values.length) return 0;

  const sorted = [...values].sort(
    (a, b) => a - b
  );

  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function impactBandwidth(rows) {
  const gaps = [];

  for (let i = 1; i < rows.length; i++) {
    const gap =
      (rows[i].time - rows[i - 1].time) /
      DAY_MS;

    if (gap > 0) gaps.push(gap);
  }

  const typicalGap = median(gaps) || 30;

  return clamp(
    typicalGap * 1.5,
    21,
    75
  );
}

function smoothImpact(rows, timestamp, axis, bandwidth) {
  if (!rows.length) return 0;

  const sigma = bandwidth * DAY_MS;

  let weighted = 0;
  let totalWeight = 0;

  for (const row of rows) {
    const distance =
      (timestamp - row.time) / sigma;

    if (Math.abs(distance) > 4) continue;

    const weight = Math.exp(
      -0.5 * distance * distance
    );

    weighted += row[axis] * weight;
    totalWeight += weight;
  }

  return totalWeight > 1e-12
    ? weighted / totalWeight
    : 0;
}

// ============================================================
// CURVE INTERPOLATION
// ============================================================

function curveValueAt(series, timestamp, key) {
  if (!series.length) return 0;

  if (timestamp <= +series[0].date) {
    return finite(series[0][key]);
  }

  if (timestamp >= +series[series.length - 1].date) {
    return finite(series[series.length - 1][key]);
  }

  let lo = 0;
  let hi = series.length - 1;

  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;

    if (+series[mid].date <= timestamp) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = series[lo];
  const b = series[hi];

  const fraction =
    (timestamp - +a.date) /
    ((+b.date - +a.date) || 1);

  return finite(a[key]) +
    (
      finite(b[key]) - finite(a[key])
    ) * fraction;
}

// ============================================================
// MONOTONIC TEMPORAL TRANSFORMATION
//
// Instead of independently moving every chart point:
//
// 1. Establish smooth X displacement.
// 2. Limit local displacement gradients.
// 3. Construct a strictly increasing source-time map.
// 4. Resample the original immutable baseline.
//
// This prevents reversed time and sharp kinks.
// ============================================================

function buildTimeMap(
  original,
  rows,
  bandwidth
) {
  const n = original.length;

  const times = original.map(
    p => +p.date
  );

  const rawDays = times.map(
    time => smoothImpact(
      rows,
      time,
      "x",
      bandwidth
    )
  );

  const rawSources = times.map(
    (time, i) =>
      time - rawDays[i] * DAY_MS
  );

  const mapped = new Array(n);

  mapped[0] = times[0];

  const minimumStep = Math.max(
    1,
    (times[n - 1] - times[0]) /
      Math.max(1, n - 1) * 0.08
  );

  for (let i = 1; i < n - 1; i++) {
    mapped[i] = Math.max(
      rawSources[i],
      mapped[i - 1] + minimumStep
    );
  }

  mapped[n - 1] = times[n - 1];

  // Backward enforcement preserves the terminal endpoint.

  for (let i = n - 2; i >= 1; i--) {
    mapped[i] = Math.min(
      mapped[i],
      mapped[i + 1] - minimumStep
    );
  }

  // Forward pass guarantees chronological order.

  for (let i = 1; i < n - 1; i++) {
    mapped[i] = Math.max(
      mapped[i],
      mapped[i - 1] + minimumStep
    );
  }

  for (let i = 0; i < n; i++) {
    mapped[i] = clamp(
      mapped[i],
      times[0],
      times[n - 1]
    );
  }

  return {
    times,
    sources: mapped,
    rawDays
  };
}

// ============================================================
// SCENARIO DATE TRANSFORMATION
//
// The curve uses sourceTime(t).
//
// To map an original modeled event date to its scenario
// occurrence, invert that strictly increasing time map.
//
// This allows the execution-window START and END to
// move by different amounts.
//
// Therefore window width may compress or expand.
// ============================================================

function mapModeledDateToScenario(
  modeledDate,
  timeMap
) {
  const target = +modeledDate;

  const source = timeMap.sources;
  const times = timeMap.times;

  if (target <= source[0]) {
    return new Date(times[0]);
  }

  if (target >= source[source.length - 1]) {
    return new Date(times[times.length - 1]);
  }

  let lo = 0;
  let hi = source.length - 1;

  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;

    if (source[mid] <= target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const fraction =
    (target - source[lo]) /
    ((source[hi] - source[lo]) || 1);

  return new Date(
    times[lo] +
    (times[hi] - times[lo]) * fraction
  );
}

// ============================================================
// SCENARIO WINDOW
//
// Anchored to original workbook START / END.
//
// No arbitrary 22% peak threshold.
//
// Different displacement at START and END can produce:
//
// - translation
// - compression
// - expansion
//
// Dates remain inside the chart domain.
// ============================================================

function deriveScenarioWindow(
  baseWindow,
  timeMap
) {
  let start = mapModeledDateToScenario(
    baseWindow.start,
    timeMap
  );

  let end = mapModeledDateToScenario(
    baseWindow.end,
    timeMap
  );

  if (+end <= +start) {
    return {
      start: new Date(+baseWindow.start),
      end: new Date(+baseWindow.end)
    };
  }

  return {
    start,
    end
  };
}

// ============================================================
// MAIN SCENARIO ENGINE
// ============================================================

function applyConditionScenario({
  baselineP,
  data,
  baseWindow
}) {
  if (
    !Array.isArray(baselineP) ||
    baselineP.length < 2
  ) {
    throw new Error(
      "Conditions engine requires a valid baseline curve."
    );
  }

  const original = baselineP.map(
    point => ({
      ...point,
      date: new Date(+point.date)
    })
  );

  const peakOf = series =>
    series.reduce(
      (a, b) =>
        b.plotTenant > a.plotTenant
          ? b
          : a
    );

  // --------------------------------------------------------
  // EXACT BASELINE
  // --------------------------------------------------------

  if (!scenarioActive()) {
    const peakPoint = peakOf(original);

    const result = {
      active: false,
      series: original,
      window: {
        start: new Date(+baseWindow.start),
        end: new Date(+baseWindow.end)
      },
      peak: clamp100(peakPoint.plotTenant),
      peakDate: new Date(+peakPoint.date),
      shiftDays: 0,
      widthDeltaDays: 0,
      xDays: 0,
      yPoints: 0
    };

    latestScenario = result;

    return result;
  }

  // --------------------------------------------------------
  // BUILD SMOOTH SCENARIO
  // --------------------------------------------------------

  const rows = impactRows(data);
  const bandwidth = impactBandwidth(rows);

  const timeMap = buildTimeMap(
    original,
    rows,
    bandwidth
  );

  const t0 = +original[0].date;
  const t1 = +original[original.length - 1].date;

  const series = original.map((point, i) => {
    const sourceTime = clamp(
      timeMap.sources[i],
      t0,
      t1
    );

    const yImpact = smoothImpact(
      rows,
      +point.date,
      "y",
      bandwidth
    );

    const tenantBase = curveValueAt(
      original,
      sourceTime,
      "plotTenant"
    );

    const landlordBase = curveValueAt(
      original,
      sourceTime,
      "plotLandlord"
    );

    
return {
  ...point,

  plotTenant: applyBoundedLeverage(
    tenantBase,
    yImpact
  ),

  plotLandlord: applyBoundedLeverage(
    landlordBase,
    -yImpact
  )
};

  });

  // --------------------------------------------------------
  // EXECUTION WINDOW
  // --------------------------------------------------------

  const window = deriveScenarioWindow(
    baseWindow,
    timeMap
  );

  const peakPoint = peakOf(series);

  const baseWidth = dayDifference(
    baseWindow.start,
    baseWindow.end
  );

  const scenarioWidth = dayDifference(
    window.start,
    window.end
  );

  const xDays = smoothImpact(
    rows,
    (+baseWindow.start + +baseWindow.end) / 2,
    "x",
    bandwidth
  );

  const yPoints = smoothImpact(
    rows,
    (+baseWindow.start + +baseWindow.end) / 2,
    "y",
    bandwidth
  );

  const result = {
    active: true,
    series,
    window,

    peak: clamp100(
      peakPoint.plotTenant
    ),

    peakDate: new Date(
      +peakPoint.date
    ),

    shiftDays: dayDifference(
      baseWindow.start,
      window.start
    ),

    widthDeltaDays:
      scenarioWidth - baseWidth,

    xDays,
    yPoints
  };

  latestScenario = result;

  return result;
}

// ============================================================
// PANEL STATE / RESET
// ============================================================

function getConditionScenarioState() {
  return {
    ...levels
  };
}

function resetConditionScenario(rerender) {
  for (const definition of CONDITION_DEFS) {
    levels[definition.key] = 0;
  }

  syncPanel();

  if (typeof rerender === "function") {
    rerender();
  }
}

function syncPanel() {
  for (const definition of CONDITION_DEFS) {
    const input = document.getElementById(
      `condition_${definition.key}`
    );

    const value = document.getElementById(
      `condition_${definition.key}_value`
    );

    if (input) {
      input.value = String(
        levels[definition.key]
      );
    }

    if (value) {
      const level = levels[definition.key];

      value.textContent = level === 0
        ? "MODELED"
        : (
            (level > 0 ? "+" : "") +
            level +
            "%"
          );
    }
  }
}

// ============================================================
// SIDE PANEL
//
// Mounts once when app.js finishes loading ArcGIS data.
//
// No iteration selection required.
//
// Built-in styling avoids dependence on unfinished CSS.
//
// Expanded panel: bottom-left.
// Collapsed tab: bottom-left.
//
// Collapse never resets scenario.
// ============================================================

function ensureConditionsPanel({
  mount,
  rerender,
  getSummary
} = {}) {
  const host =
    mount ||
    document.getElementById("conditionsMount") ||
    document.getElementById("wrap");

  if (!host) {
    return null;
  }

  const existing = document.getElementById(
    PANEL_ID
  );

  if (existing) {
    return existing;
  }

  if (
    getComputedStyle(host).position === "static"
  ) {
    host.style.position = "relative";
  }

  // --------------------------------------------------------
  // PANEL
  // --------------------------------------------------------

  const panel = document.createElement("aside");

  panel.id = PANEL_ID;
  panel.className = "conditions-panel";

  Object.assign(panel.style, {
    position: "absolute",
    top: "auto",
    bottom: "12px",
    left: "12px",
    right: "auto",
    zIndex: "100",
    width: "310px",
    maxHeight: "calc(100% - 24px)",
    overflowY: "auto",
    padding: "12px",
    background: "rgba(27,29,44,.98)",
    border: "1px solid #FFDF00",
    borderRadius: "7px",
    color: "#FFFFFF",
    fontFamily: "Gotham,Arial,sans-serif",
    boxShadow: "0 10px 30px rgba(0,0,0,.35)"
  });

  // --------------------------------------------------------
  // COLLAPSED TAB
  // --------------------------------------------------------

  const tab = document.createElement("button");

  tab.id = TAB_ID;
  tab.className = "conditions-tab";
  tab.textContent = "▶ CONDITIONS";

  Object.assign(tab.style, {
    position: "absolute",
    top: "auto",
    bottom: "12px",
    left: "0",
    right: "auto",
    zIndex: "101",
    display: "none",
    background: "#1B1D2C",
    border: "1px solid #FFDF00",
    borderRadius: "0 5px 5px 0",
    color: "#FFDF00",
    padding: "9px",
    fontSize: "11px",
    fontWeight: "700",
    cursor: "pointer"
  });

  // --------------------------------------------------------
  // HEADER
  // --------------------------------------------------------

  const header = document.createElement("div");

  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    marginBottom: "12px"
  });

  const title = document.createElement("strong");

  title.textContent = "SCENARIO CONDITIONS";

  Object.assign(title.style, {
    color: "#FFDF00",
    fontSize: "13px",
    fontWeight: "700"
  });

  const collapseButton = document.createElement(
    "button"
  );

  collapseButton.type = "button";
  collapseButton.textContent = "◀";
  collapseButton.title = "Collapse conditions";

  header.append(
    title,
    collapseButton
  );

  panel.appendChild(header);

  // --------------------------------------------------------
  // SLIDERS
  // --------------------------------------------------------

  for (const definition of CONDITION_DEFS) {
    const row = document.createElement("div");

    row.className = "condition-row";

    Object.assign(row.style, {
      marginBottom: "12px"
    });

    const heading = document.createElement("div");

    Object.assign(heading.style, {
      display: "flex",
      justifyContent: "space-between",
      gap: "8px",
      fontSize: "10px",
      fontWeight: "600",
      marginBottom: "4px"
    });

    const label = document.createElement("span");

    label.textContent = definition.label;

    const value = document.createElement("strong");

    value.id =
      `condition_${definition.key}_value`;

    value.textContent = "MODELED";

    value.style.color = "#FFDF00";

    heading.append(
      label,
      value
    );

    const slider = document.createElement("input");

    slider.type = "range";
    slider.className = "condition-slider";
    slider.id = `condition_${definition.key}`;

    slider.min = "-100";
    slider.max = "100";
    slider.step = "1";
    slider.value = "0";

    Object.assign(slider.style, {
      display: "block",
      width: "100%",
      accentColor: "#238291",
      cursor: "pointer"
    });

    slider.addEventListener(
      "input",
      () => {
        levels[definition.key] = clamp(
          finite(slider.value),
          -100,
          100
        );

        syncPanel();

        if (
          typeof rerender === "function"
        ) {
          rerender();
        }
      }
    );

    row.append(
      heading,
      slider
    );

    panel.appendChild(row);
  }

  // --------------------------------------------------------
  // SCENARIO SUMMARY
  // --------------------------------------------------------

  const summary = document.createElement("div");

  summary.id = "conditionImpact";

  Object.assign(summary.style, {
    fontSize: "10px",
    lineHeight: "1.6",
    borderTop: "1px solid #79828C",
    paddingTop: "9px",
    marginTop: "4px",
    color: "#FFFFFF"
  });

  panel.appendChild(summary);

  panel.refreshSummary = () => {
    const scenario =
      typeof getSummary === "function"
        ? getSummary()
        : latestScenario;

    if (!scenario) {
      summary.textContent = "BASE MODEL ACTIVE";
      return;
    }

    const status = scenario.active
      ? "SCENARIO ACTIVE"
      : "BASE MODEL ACTIVE";

    const peak = Number.isFinite(
      scenario.peak
    )
      ? scenario.peak.toFixed(1)
      : "—";

    const width = finite(
      scenario.widthDeltaDays
    );

    const shift = finite(
      scenario.shiftDays
    );

    const xDays = finite(
      scenario.xDays
    );

    const yPoints = finite(
      scenario.yPoints
    );

    summary.textContent =
      status +
      " | PEAK " + peak +
      " | WINDOW " +
      fmtDate(scenario.window.start) +
      " – " +
      fmtDate(scenario.window.end) +
      " | SHIFT " +
      (shift > 0 ? "+" : "") +
      shift +
      " DAYS" +
      " | WIDTH " +
      (width > 0 ? "+" : "") +
      width +
      " DAYS" +
      " | X " +
      (xDays > 0 ? "+" : "") +
      xDays.toFixed(1) +
      " DAYS" +
      " | Y " +
      (yPoints > 0 ? "+" : "") +
      yPoints.toFixed(1) +
      " PTS";
  };

  // --------------------------------------------------------
  // RESET
  // --------------------------------------------------------

  const reset = document.createElement("button");

  reset.type = "button";
  reset.textContent = "RESET TO MODELED";

  Object.assign(reset.style, {
    width: "100%",
    marginTop: "10px",
    fontSize: "11px",
    fontWeight: "700",
    cursor: "pointer"
  });

  reset.addEventListener(
    "click",
    () => {
      resetConditionScenario(rerender);
    }
  );

  panel.appendChild(reset);

  // --------------------------------------------------------
  // COLLAPSE / EXPAND
  // --------------------------------------------------------

  collapseButton.addEventListener(
    "click",
    () => {
      panelCollapsed = true;

      panel.style.display = "none";
      tab.style.display = "block";
    }
  );

  tab.addEventListener(
    "click",
    () => {
      panelCollapsed = false;

      panel.style.display = "block";
      tab.style.display = "none";
    }
  );

  host.append(
    tab,
    panel
  );

  syncPanel();
  panel.refreshSummary();

  return panel;
}

// ============================================================
// EXPORTS — EXISTING APP.JS CONTRACT
// ============================================================

export {
  CONDITION_DEFS,
  ensureConditionsPanel,
  applyConditionScenario,
  resetConditionScenario,
  getConditionScenarioState
};