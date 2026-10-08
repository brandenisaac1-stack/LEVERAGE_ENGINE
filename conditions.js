
// SCENARIO CONDITIONS
// Standalone browser overlay for app.js.
// Smartsheet MODELED/ACTIVE values already include diminishing weights.

const DAY = 86400000;

const DEFS = [
  { key: 'capital', label: 'CAPITAL / REFINANCING PRESSURE', token: 'CAPITAL PRESSURE', x: -120, y: 12 },
  { key: 'rollover', label: 'BUILDING ROLLOVER EXPOSURE', token: 'ROLLOVER EXPOSURE', x: -90, y: 10 },
  { key: 'alternative', label: 'ALTERNATIVE EXECUTABILITY', token: 'ALTERNATIVE EXECUTABILITY', x: -75, y: 10 },
  { key: 'market', label: 'MARKET COMPETITIVE PRESSURE', token: 'MARKET PRESSURE', x: -60, y: 8 },
  { key: 'requirement', label: 'REQUIREMENT FLEXIBILITY', token: 'REQUIREMENT FLEXIBILITY', x: -45, y: 6 }
];

const levels = Object.fromEntries(DEFS.map(d => [d.key, 0]));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const bounded = v => clamp(v, 0, 100);

const numeric = (v, fallback = 0) =>
  v === null || v === undefined || v === ''
    ? fallback
    : Number.isFinite(Number(v)) ? Number(v) : fallback;

const has = (row, d) =>
  String(row.conditionAdjuster ?? '').toUpperCase().includes(d.token);

const active = () => DEFS.some(d => levels[d.key] !== 0);

const fmt = d =>
  `${String(d.getMonth() + 1).padStart(2, '0')}/` +
  `${String(d.getDate()).padStart(2, '0')}/` +
  `${String(d.getFullYear()).slice(-2)}`;

const days = (a, b) => Math.round((+b - +a) / DAY);

// Resolve workbook hierarchy:
// ACTIVE > VERIFIED > ADJUSTED > MODELED

function resolved(row, axis) {
  for (const suffix of ['Active', 'Verified', 'Adjusted', 'Modeled']) {
    const v = row[`condition${axis}${suffix}`];

    if (
      v !== null &&
      v !== undefined &&
      v !== '' &&
      Number.isFinite(Number(v))
    ) {
      return Number(v);
    }
  }

  return 0;
}

// Reconstruct each condition's share of the already-weighted
// workbook total. Do not apply diminishing weighting twice.

function impacts(row) {
  const matched = DEFS.filter(d => has(row, d));

  if (!matched.length) return { x: 0, y: 0 };

  const weights = matched.map((d, i) => ({
    d,
    weight: Math.pow(0.5, i)
  }));

  const rawX = weights.reduce(
    (s, p) => s + p.d.x * p.weight, 0
  );

  const rawY = weights.reduce(
    (s, p) => s + p.d.y * p.weight, 0
  );

  const activeX = resolved(row, 'X');
  const activeY = resolved(row, 'Y');

  const deltaX = weights.reduce(
    (s, p) =>
      s + p.d.x * p.weight * levels[p.d.key] / 100,
    0
  );

  const deltaY = weights.reduce(
    (s, p) =>
      s + p.d.y * p.weight * levels[p.d.key] / 100,
    0
  );

  return {
    x: rawX !== 0 ? deltaX * activeX / rawX : 0,
    y: rawY !== 0 ? deltaY * activeY / rawY : 0
  };
}

// Interpolate row-level condition effects across Chart_dates.

function sampled(data, at, axis) {
  const rows = data
    .filter(r => Number.isFinite(+r.date))
    .map(r => ({
      t: +r.date,
      v: impacts(r)[axis]
    }))
    .sort((a, b) => a.t - b.t);

  if (!rows.length) return 0;

  const t = +at;

  if (t < rows[0].t || t > rows[rows.length - 1].t) {
    return 0;
  }

  if (t === rows[0].t) return rows[0].v;

  let lo = 0;
  let hi = rows.length - 1;

  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;

    if (rows[m].t <= t) lo = m;
    else hi = m;
  }

  const a = rows[lo];
  const b = rows[hi];

  return a.v + (b.v - a.v) * (t - a.t) / ((b.t - a.t) || 1);
}

// Interpolate original, immutable curve.

function valueAt(series, t, key) {
  if (t <= +series[0].date) return series[0][key];

  if (t >= +series[series.length - 1].date) {
    return series[series.length - 1][key];
  }

  let lo = 0;
  let hi = series.length - 1;

  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;

    if (+series[m].date <= t) lo = m;
    else hi = m;
  }

  const a = series[lo];
  const b = series[hi];

  return a[key] +
    (b[key] - a[key]) *
    (t - +a.date) /
    ((+b.date - +a.date) || 1);
}

// Derive scenario opportunity window.
// Baseline window remains unchanged when no scenario is active.

function deriveWindow(series, baseWindow) {
  const minDate = +baseWindow.start;
  const maxDate = +baseWindow.end;

  const within = series.filter(
    p =>
      +p.date >= minDate - 180 * DAY &&
      +p.date <= maxDate + 180 * DAY
  );

  if (within.length < 3) {
    return {
      start: new Date(minDate),
      end: new Date(maxDate)
    };
  }

  const values = within.map(p => p.plotTenant);

  const hi = Math.max(...values);
  const lo = Math.min(...values);

  if (hi - lo < 0.01) {
    return {
      start: new Date(minDate),
      end: new Date(maxDate)
    };
  }

  const threshold = hi - 0.22 * (hi - lo);

  const peakIndex = within.findIndex(
    p => p.plotTenant === hi
  );

  let left = peakIndex;
  let right = peakIndex;

  while (
    left > 0 &&
    within[left - 1].plotTenant >= threshold
  ) {
    left--;
  }

  while (
    right < within.length - 1 &&
    within[right + 1].plotTenant >= threshold
  ) {
    right++;
  }

  if (right <= left) {
    return {
      start: new Date(minDate),
      end: new Date(maxDate)
    };
  }

  return {
    start: new Date(+within[left].date),
    end: new Date(+within[right].date)
  };
}

// Main scenario calculation.

function applyConditionScenario({
  baselineP,
  data,
  baseWindow
}) {
  if (!baselineP?.length) {
    throw new Error('Scenario requires a baseline curve.');
  }

  const original = baselineP.map(p => ({
    ...p,
    date: new Date(+p.date)
  }));

  const peakOf = s =>
    s.reduce((a, b) =>
      b.plotTenant > a.plotTenant ? b : a
    );

  // Exact baseline when controls are untouched.

  if (!active()) {
    const peak = peakOf(original);

    return {
      active: false,
      series: original,
      window: {
        start: new Date(+baseWindow.start),
        end: new Date(+baseWindow.end)
      },
      peak: bounded(peak.plotTenant),
      peakDate: new Date(+peak.date),
      shiftDays: 0,
      widthDeltaDays: 0
    };
  }

  const t0 = +original[0].date;
  const t1 = +original[original.length - 1].date;

  const series = original.map(p => {
    const dx = sampled(data, p.date, 'x');
    const dy = sampled(data, p.date, 'y');

    // X impact moves the influence in time.
    // Canonical Chart_dates never change.

    const source = clamp(
      +p.date - dx * DAY,
      t0,
      t1
    );

    // Both leverage curves remain within 0–100.

    return {
      ...p,
      plotTenant: bounded(
        valueAt(original, source, 'plotTenant') + dy
      ),
      plotLandlord: bounded(
        valueAt(original, source, 'plotLandlord') - dy
      )
    };
  });

  const window = deriveWindow(series, baseWindow);
  const peak = peakOf(series);

  return {
    active: true,
    series,
    window,
    peak: bounded(peak.plotTenant),
    peakDate: new Date(+peak.date),
    shiftDays: days(baseWindow.start, window.start),
    widthDeltaDays:
      days(window.start, window.end) -
      days(baseWindow.start, baseWindow.end)
  };
}

// Reset all controls.

function resetConditionScenario(rerender) {
  for (const d of DEFS) {
    levels[d.key] = 0;
  }

  for (const d of DEFS) {
    const input = document.getElementById(
      `condition_${d.key}`
    );

    const value = document.getElementById(
      `condition_${d.key}_value`
    );

    if (input) input.value = '0';
    if (value) value.textContent = 'MODELED';
  }

  if (typeof rerender === 'function') rerender();
}

// Create a visible panel with its own fallback styling.
// Does not require new styles.css rules.

function ensureConditionsPanel({
  mount,
  rerender,
  getSummary
} = {}) {
  const host =
    mount ||
    document.getElementById('conditionsMount') ||
    document.getElementById('wrap');

  if (!host) return null;

  const existing = document.getElementById(
    'conditionsPanel'
  );

  if (existing) return existing;

  if (getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
  }

  const panel = document.createElement('aside');

  panel.id = 'conditionsPanel';
  panel.className = 'conditions-panel';

  Object.assign(panel.style, {
    position: 'absolute',
    top: '12px',
    left: '12px',
    zIndex: '100',
    width: '310px',
    maxHeight: 'calc(100% - 24px)',
    overflowY: 'auto',
    padding: '12px',
    background: 'rgba(27,29,44,.98)',
    border: '1px solid #FFDF00',
    borderRadius: '7px',
    color: '#fff',
    fontFamily: 'Gotham,Arial,sans-serif',
    boxShadow: '0 10px 30px rgba(0,0,0,.35)'
  });

  const tab = document.createElement('button');

  tab.id = 'conditionsTab';
  tab.className = 'conditions-tab';
  tab.textContent = '▶ CONDITIONS';

  Object.assign(tab.style, {
    position: 'absolute',
    top: '12px',
    left: '0',
    zIndex: '101',
    display: 'none',
    background: '#1B1D2C',
    border: '1px solid #FFDF00',
    color: '#FFDF00',
    padding: '9px',
    cursor: 'pointer'
  });

  const head = document.createElement('div');

  Object.assign(head.style, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px'
  });

  const title = document.createElement('strong');
  title.textContent = 'SCENARIO CONDITIONS';
  title.style.color = '#FFDF00';

  const close = document.createElement('button');
  close.textContent = '◀';
  close.title = 'Collapse panel';

  head.append(title, close);
  panel.appendChild(head);

  // Five condition sliders.

  for (const d of DEFS) {
    const row = document.createElement('div');

    row.className = 'condition-row';
    row.style.marginBottom = '12px';

    const label = document.createElement('div');

    Object.assign(label.style, {
      display: 'flex',
      justifyContent: 'space-between',
      gap: '8px',
      fontSize: '11px'
    });

    const name = document.createElement('span');
    name.textContent = d.label;

    const value = document.createElement('strong');
    value.id = `condition_${d.key}_value`;
    value.textContent = 'MODELED';
    value.style.color = '#FFDF00';

    label.append(name, value);

    const slider = document.createElement('input');

    slider.type = 'range';
    slider.id = `condition_${d.key}`;
    slider.min = '-100';
    slider.max = '100';
    slider.step = '1';
    slider.value = '0';
    slider.style.width = '100%';
    slider.style.accentColor = '#238291';

    slider.addEventListener('input', () => {
      levels[d.key] = Number(slider.value);

      value.textContent =
        levels[d.key] === 0
          ? 'MODELED'
          : `${levels[d.key] > 0 ? '+' : ''}${levels[d.key]}%`;

      rerender?.();
    });

    row.append(label, slider);
    panel.appendChild(row);
  }

  // Scenario summary.

  const summary = document.createElement('div');

  summary.id = 'conditionImpact';

  summary.style.cssText =
    'font-size:11px;' +
    'line-height:1.6;' +
    'border-top:1px solid #79828C;' +
    'padding-top:8px;' +
    'margin-top:4px';

  panel.appendChild(summary);

  const reset = document.createElement('button');

  reset.textContent = 'RESET TO MODELED';

  reset.style.cssText =
    'width:100%;margin-top:10px;cursor:pointer';

  reset.addEventListener('click', () =>
    resetConditionScenario(rerender)
  );

  panel.appendChild(reset);

  panel.refreshSummary = () => {
    const s = getSummary?.();

    if (!s) {
      summary.textContent = 'BASE MODEL ACTIVE';
      return;
    }

    const delta = s.widthDeltaDays;

    summary.textContent =
      `${s.active ? 'SCENARIO ACTIVE' : 'BASE MODEL ACTIVE'}` +
      ` | PEAK ${s.peak.toFixed(1)}` +
      ` | WINDOW ${fmt(s.window.start)} – ${fmt(s.window.end)}` +
      ` | WIDTH ${delta > 0 ? '+' : ''}${delta} DAYS`;
  };

  // Collapse retains the active scenario.

  close.addEventListener('click', () => {
    panel.style.display = 'none';
    tab.style.display = 'block';
  });

  tab.addEventListener('click', () => {
    panel.style.display = 'block';
    tab.style.display = 'none';
  });

  host.append(tab, panel);

  panel.refreshSummary();

  return panel;
}

function getConditionScenarioState() {
  return { ...levels };
}

export {
  DEFS as CONDITION_DEFS,
  ensureConditionsPanel,
  applyConditionScenario,
  resetConditionScenario,
  getConditionScenarioState
};
