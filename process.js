
// ============================================================
// SAVILLS LEASE LEVERAGE ENGINE
// PROCESS OVERLAY — SCENARIO-AWARE
// ============================================================

const PALETTE = [
  '#238291',
  '#6CA7B1',
  '#79828C',
  '#A1A7AD',
  '#5DA5EE',
  '#8ABDF3',
  '#6CA7B1',
  '#BDC2C7',
  '#D7DADE'
];

const RESTRUCTURE_COLORS = [
  '#097CE8',
  '#5DA5EE',
  '#6CA7B1',
  '#238291',
  '#A1A7AD'
];

function cleanStage(v) {
  return String(v ?? '').trim().replace(/\s+/g, ' ');
}

function validDate(v) {
  if (v instanceof Date) {
    return Number.isFinite(+v) ? new Date(+v) : null;
  }

  if (typeof v === 'number') {
    const d = new Date(v);
    return Number.isFinite(+d) ? d : null;
  }

  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v);
    return Number.isFinite(+d) ? d : null;
  }

  return null;
}

// Month and year only.
function fmtDate(d) {
  return (
    String(d.getMonth() + 1).padStart(2, '0') +
    '/' +
    String(d.getFullYear()).slice(-2)
  );
}

function dayBefore(d) {
  const x = new Date(+d);
  x.setDate(x.getDate() - 1);
  return x;
}

function monthDuration(a, b) {
  return Math.max(
    0,
    Math.round((+b - +a) / 2629800000)
  );
}

// Map a modeled date into the active scenario timeline.
// When no scenario is active, the original date is retained.
function scenarioDate(date, mapDate) {
  const original = validDate(date);
  if (!original) return null;

  if (typeof mapDate !== 'function') {
    return original;
  }

  const mapped = validDate(mapDate(original));

  return mapped || original;
}

function description(stage) {
  const s = stage.toUpperCase();

  if (s.includes('ADVISORY') && s.includes('OPTIONALITY'))
    return 'Broker engagement · intelligence · optionality';

  if (s.includes('RESTRUCTURE'))
    return 'Early landlord exploration · preserve alternatives';

  if (s.includes('STRATEGIC'))
    return 'Objectives · constraints · viable scenarios';

  if (s.includes('MARKET'))
    return 'Market discovery · options · proposals';

  if (s.includes('TERM SHEET') || s.includes('LOI'))
    return 'Core renewal business terms';

  if (s.includes('LEASE AMEND') || s.includes('LEASE NEGOT'))
    return 'Documentation · final renewal terms';

  if (s.includes('SPACE REFRESH'))
    return 'Targeted refresh · as required';

  if (
    s.includes('DESIGN') ||
    s.includes('PERMIT') ||
    s.includes('CONSTRUCTION')
  )
    return 'Planning · approvals · buildout · occupancy';

  return 'Transaction process stage';
}

// ============================================================
// NORMAL RELOCATION PROCESS
// ============================================================

function buildStageModel(data, leaseExpiration, mapDate = null) {
  const exp = validDate(leaseExpiration);

  const rows = data
    .map((d, i) => ({
      i,
      date: validDate(d.date),
      stage: cleanStage(d.processStage)
    }))
    .filter(
      r =>
        r.date &&
        r.stage &&
        r.stage.toUpperCase() !== 'PROCESS_STAGE'
    )
    .sort((a, b) => +a.date - +b.date);

  if (!rows.length) return [];

  const first = new Map();

  for (const r of rows) {
    const k = r.stage.toUpperCase();

    if (!first.has(k)) {
      first.set(k, r);
    }
  }

  const ordered = [...first.values()]
    .sort((a, b) => +a.date - +b.date);

  return ordered.map((r, i) => {
    const next = ordered[i + 1];

    const modeledEnd =
      next?.date ||
      exp ||
      rows.at(-1).date;

    // Transform both boundaries using the same
    // time map as the scenario execution window.
    const start = scenarioDate(r.date, mapDate);
    const end = scenarioDate(modeledEnd, mapDate);

    const hasSpan =
      start &&
      end &&
      +end > +start;

    return {
      key: r.stage,
      start: new Date(+start),

      exclusiveEnd: hasSpan
        ? new Date(+end)
        : new Date(+start),

      displayEnd: hasSpan
        ? dayBefore(end)
        : new Date(+start),

      duration: hasSpan
        ? monthDuration(start, end)
        : 0,

      color: PALETTE[i % PALETTE.length],
      lane: .24 + (i % 7) * .095,
      description: description(r.stage),
      pointOnly: !hasSpan
    };
  });
}

// ============================================================
// EARLY RESTRUCTURE PROCESS
// ============================================================

function restructureLane(index) {
  return .43 + index * .115;
}

function buildRestructureModel(data, mapDate = null) {
  const phases = data
    .map(d => ({
      key: cleanStage(d.restructureActionPhase),
      start: validDate(d.restructureDateBreakout),
      end: validDate(d.restructurePhaseEndDate)
    }))
    .filter(
      p =>
        p.key &&
        p.start &&
        p.end &&
        +p.end > +p.start
    )
    .sort((a, b) => +a.start - +b.start);

  if (!phases.length) return [];

  const firstStart = phases[0].start;

  const normalBefore = buildStageModel(
    data,
    null,
    mapDate
  )
    .filter(
      p =>
        +p.start <
          +scenarioDate(firstStart, mapDate) &&
        !p.key.toUpperCase().includes('RESTRUCTURE')
    )
    .map((p, i) => ({
      ...p,
      lane: .24 + (i % 2) * .095
    }));

  const alt = phases.map((p, i) => {
    const start = scenarioDate(p.start, mapDate);
    const end = scenarioDate(p.end, mapDate);

    return {
      key: p.key,
      start,
      exclusiveEnd: end,
      displayEnd: end,
      duration: monthDuration(start, end),
      color: RESTRUCTURE_COLORS[
        i % RESTRUCTURE_COLORS.length
      ],
      lane: restructureLane(i),
      description: description(p.key),
      pointOnly: false,
      restructure: true
    };
  });

  return [...normalBefore, ...alt];
}

// ============================================================
// LABELS
// ============================================================

function shortLabel(stage, width) {
  if (width >= 230) return stage;

  const s = stage.toUpperCase();

  if (s.includes('EARLY RESTRUCTURE'))
    return 'EARLY RESTRUCTURE EXPLORATION';

  if (s.includes('TERM SHEET') || s.includes('LOI'))
    return 'RESTRUCTURE TERM SHEET';

  if (s.includes('LEASE AMEND'))
    return 'RESTRUCTURE LEASE AMENDMENT';

  if (s.includes('SPACE REFRESH'))
    return 'SPACE REFRESH';

  return stage;
}

// ============================================================
// PROCESS RENDERER
// ============================================================

function drawProcess({
  data,
  x,
  m,
  W,
  H,
  leaseExpiration,
  svg,
  ns,
  txt,
  restructureMode = false,
  mapDate = null
}) {
  const normalModel = buildStageModel(
    data,
    leaseExpiration,
    mapDate
  );

  const model = restructureMode
    ? buildRestructureModel(data, mapDate)
    : normalModel;

  if (!model.length) return;

  const defs =
    svg.querySelector('defs') ||
    svg.insertBefore(
      ns('defs'),
      svg.firstChild
    );

  model.forEach((p, i) => {
    const a = Math.max(m.l, x(p.start));

    const yy =
      m.t + (H - m.t - 32) * p.lane;

    // ----------------------------------------------
    // SINGLE MILESTONE
    // ----------------------------------------------

    if (p.pointOnly) {
      if (a >= m.l && a <= W - m.r) {
        svg.appendChild(
          ns('circle', {
            cx: a,
            cy: yy,
            r: 5,
            fill: p.color,
            stroke: p.color,
            'stroke-width': '2'
          })
        );

        const labelX = Math.max(m.l + 90, a - 10);

        const title = txt(
          labelX,
          yy - 14,
          p.key,
          'proc',
          'end'
        );

        title.setAttribute('fill', p.color);
        title.style.setProperty(
          'font-size', '19px', 'important'
        );
        title.style.setProperty(
          'font-weight', '700', 'important'
        );

        const sub = txt(
          labelX,
          yy + 23,
          `${fmtDate(p.start)} · MILESTONE`,
          'axis',
          'end'
        );

        sub.setAttribute('fill', '#D7DADE');
        sub.style.setProperty(
          'font-size', '18px', 'important'
        );
        sub.style.setProperty(
          'font-weight', '700', 'important'
        );
      }

      return;
    }

    // ----------------------------------------------
    // PROCESS BAR
    // ----------------------------------------------

    const b = Math.min(
      W - m.r,
      x(p.exclusiveEnd)
    );

    if (
      !Number.isFinite(a) ||
      !Number.isFinite(b) ||
      b <= a
    ) return;

    const width = b - a;
    const id = `processGradientLive${i}`;

    const g = ns('linearGradient', {
      id,
      x1: '0%',
      y1: '0%',
      x2: '100%',
      y2: '0%'
    });

    g.appendChild(
      ns('stop', {
        offset: '0%',
        'stop-color': p.color,
        'stop-opacity': '.10'
      })
    );

    g.appendChild(
      ns('stop', {
        offset: '50%',
        'stop-color': p.color,
        'stop-opacity': '.34'
      })
    );

    g.appendChild(
      ns('stop', {
        offset: '100%',
        'stop-color': p.color,
        'stop-opacity': '.10'
      })
    );

    defs.appendChild(g);

    svg.appendChild(
      ns('rect', {
        x: a,
        y: yy - 8,
        width,
        height: 16,
        rx: 6,
        fill: `url(#${id})`,
        stroke: p.color,
        'stroke-width': '1.6',
        'stroke-opacity': '.9'
      })
    );

    const mid = (a + b) / 2;

    const titleText = p.restructure
      ? shortLabel(p.key, width)
      : p.key;

    const edgePad = 12;
    const titleGuard = 150;

    let titleX = mid;
    let titleAnchor = 'middle';

    if (mid - titleGuard < m.l + edgePad) {
      titleX = m.l + edgePad;
      titleAnchor = 'start';
    } else if (
      mid + titleGuard > W - m.r - edgePad
    ) {
      titleX = W - m.r - edgePad;
      titleAnchor = 'end';
    }

    const title = txt(
      titleX,
      yy - 14,
      titleText,
      'proc',
      titleAnchor
    );

    title.setAttribute('fill', p.color);
    title.style.setProperty(
      'font-size', '19px', 'important'
    );
    title.style.setProperty(
      'font-weight', '700', 'important'
    );
    title.style.setProperty(
      'paint-order', 'stroke', 'important'
    );
    title.style.setProperty(
      'stroke', '#1B1D2C', 'important'
    );
    title.style.setProperty(
      'stroke-width', '2px', 'important'
    );

    // ----------------------------------------------
    // DYNAMIC DATE + DURATION
    // ----------------------------------------------

    const dateText =
      `${fmtDate(p.start)} · ${p.duration} MO`;

    const dateGuard = 145;

    let dateX = a + 4;
    let dateAnchor = 'start';

    if (dateX + dateGuard > W - m.r - edgePad) {
      dateX = W - m.r - edgePad;
      dateAnchor = 'end';
    } else {
      dateX = Math.max(
        m.l + edgePad,
        dateX
      );
    }

    const sub = txt(
      dateX,
      yy + 23,
      dateText,
      'axis',
      dateAnchor
    );

    sub.setAttribute('fill', '#D7DADE');
    sub.style.setProperty(
      'font-size', '18px', 'important'
    );
    sub.style.setProperty(
      'font-weight', '700', 'important'
    );
    sub.style.setProperty(
      'paint-order', 'stroke', 'important'
    );
    sub.style.setProperty(
      'stroke', '#1B1D2C', 'important'
    );
    sub.style.setProperty(
      'stroke-width', '2px', 'important'
    );
  });
}

export {
  drawProcess,
  buildStageModel,
  buildRestructureModel
};
