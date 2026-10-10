
/*
 * ChronOS | Workforce Convergence Engine
 * workforce-geography.js
 *
 * Geographic intelligence and scenario orchestration.
 *
 * Uses the existing authenticated ArcGIS environment.
 * Does not alter Relo Well baseline rankings.
 * Does not modify Lease Leverage Engine.
 *
 * V1:
 * - Inspects published tract geography
 * - Resolves supported workforce measures
 * - Renders dynamic geographic intensity
 * - Supports industry-based geographic lenses
 * - Preserves ranked building origins
 * - Provides honest routing readiness
 *
 * Network service-area calculations are intentionally
 * gated until routing authorization is verified.
 */

const FIELD_CANDIDATES = Object.freeze({
  geoid: [
    'geoid_11',
    'GEOID_11',
    'GEOID',
    'source_geo_id'
  ],

  workers: [
    'workers_16_plus',
    'Workers_16_Plus',
    'employed',
    'labor_force'
  ],

  gravity: [
    'Talent_Gravity_Score',
    'Talent Gravity Score',
    'talent_gravity_score'
  ],

  opportunity: [
    'Opportunity_Score',
    'Opportunity Score',
    'opportunity_score'
  ],

  friction: [
    'Friction_Score',
    'Friction Score',
    'friction_score'
  ],

  knowledge: [
    'knowledge_work_intensity'
  ],

  professional: [
    'prof_services_share'
  ],

  finance: [
    'fin_re_share'
  ],

  educationHealth: [
    'edu_health_share'
  ],

  meanEarnings: [
    'mean_earnings'
  ],

  medianEarnings: [
    'median_earnings_workers'
  ],

  highEarnerShare: [
    'high_earner_share'
  ],

  commute: [
    'mean_travel_time_min'
  ],

  relativeFit: [
    'relative_fit_score'
  ]
});

const LENSES = Object.freeze({
  gravity: {
    label: 'Talent Gravity',
    field: 'gravity'
  },

  opportunity: {
    label: 'Opportunity',
    field: 'opportunity'
  },

  friction: {
    label: 'Friction',
    field: 'friction'
  },

  knowledge: {
    label: 'Knowledge Workforce',
    field: 'knowledge'
  },

  professional: {
    label: 'Professional Services',
    field: 'professional'
  },

  finance: {
    label: 'Finance & Real Estate',
    field: 'finance'
  },

  educationHealth: {
    label: 'Education & Healthcare',
    field: 'educationHealth'
  }
});

function resolveFields(fields) {
  const lookup = new Map();

  for (const field of fields) {
    lookup.set(
      String(field.name).toLowerCase(),
      field.name
    );

    if (field.alias) {
      lookup.set(
        String(field.alias).toLowerCase(),
        field.name
      );
    }
  }

  const resolved = {};

  for (const [key, candidates] of
    Object.entries(FIELD_CANDIDATES)) {

    resolved[key] = null;

    for (const candidate of candidates) {
      const match = lookup.get(
        candidate.toLowerCase()
      );

      if (match) {
        resolved[key] = match;
        break;
      }
    }
  }

  return resolved;
}

function finite(value) {
  if (value == null || value === '') {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function colorFor(value, min, max) {
  const range = Math.max(
    0.000001,
    max - min
  );

  const t = clamp(
    (value - min) / range,
    0,
    1
  );

  const stops = [
    [22, 42, 70],
    [25, 80, 122],
    [18, 117, 160],
    [20, 166, 189],
    [0, 217, 232]
  ];

  const scaled = t * (stops.length - 1);
  const i = Math.min(
    stops.length - 2,
    Math.floor(scaled)
  );

  const f = scaled - i;

  return stops[i].map(
    (v, channel) =>
      Math.round(
        v +
        (stops[i + 1][channel] - v) * f
      )
  );
}

function rangeOf(features, fieldName) {
  const values = features
    .map(f => finite(f.attributes?.[fieldName]))
    .filter(v => v != null);

  if (!values.length) {
    return null;
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length
  };
}

export async function createWorkforceGeography({
  map,
  view,
  tractLayer,
  $arcgis
}) {
  if (!map || !view || !tractLayer) {
    throw new Error(
      'Workforce geography requires an ArcGIS map, ' +
      'view, and the existing tract FeatureLayer.'
    );
  }

  await tractLayer.load();

  const geometryType = tractLayer.geometryType;

  const fields = resolveFields(
    tractLayer.fields
  );

  console.info(
    '[ChronOS Geography] Published fields:',
    fields
  );

  console.info(
    '[ChronOS Geography] Geometry:',
    geometryType
  );

  const [
    GraphicsLayer,
    Graphic
  ] = await Promise.all([
    $arcgis.import(
      '@arcgis/core/layers/GraphicsLayer.js'
    ),
    $arcgis.import(
      '@arcgis/core/Graphic.js'
    )
  ]);

  const geographyLayer = new GraphicsLayer({
    title: 'ChronOS Workforce Geography',
    visible: true
  });

  map.add(
    geographyLayer,
    0
  );

  let features = [];
  let currentLens = 'gravity';
  let visible = true;

  let lastResult = null;

  async function loadGeography() {
    if (geometryType !== 'polygon') {
      throw new Error(
        'The published uniquejoin layer is not polygon ' +
        'geometry. A matching tract polygon layer is ' +
        'required before choropleth rendering.'
      );
    }

    const q = tractLayer.createQuery();

    q.where = '1=1';
    q.outFields = [
      ...new Set(
        Object.values(fields).filter(Boolean)
      )
    ];

    q.returnGeometry = true;

    const result = await tractLayer.queryFeatures(q);

    features = result.features;

    if (!features.length) {
      throw new Error(
        'The tract layer returned no geographic records.'
      );
    }

    console.info(
      '[ChronOS Geography] Loaded records:',
      features.length
    );

    return features.length;
  }

  function renderLens(lensKey = currentLens) {
    const lens = LENSES[lensKey];

    if (!lens) {
      throw new Error(
        `Unknown workforce lens: ${lensKey}`
      );
    }

    const fieldName = fields[lens.field];

    if (!fieldName) {
      throw new Error(
        `The published tract layer does not contain ` +
        `a supported field for ${lens.label}.`
      );
    }

    const range = rangeOf(
      features,
      fieldName
    );

    if (!range) {
      throw new Error(
        `No numeric data available for ${lens.label}.`
      );
    }

    geographyLayer.removeAll();

    const graphics = [];

    for (const feature of features) {
      const value = finite(
        feature.attributes?.[fieldName]
      );

      if (value == null || !feature.geometry) {
        continue;
      }

      const rgb = colorFor(
        value,
        range.min,
        range.max
      );

      graphics.push(
        new Graphic({
          geometry: feature.geometry,

          attributes: {
            measure: lens.label,
            value,
            geoid:
              fields.geoid
                ? String(
                    feature.attributes?.[fields.geoid] ?? ''
                  )
                : ''
          },

          symbol: {
            type: 'simple-fill',

            color: [
              rgb[0],
              rgb[1],
              rgb[2],
              0.52
            ],

            outline: {
              color: [
                116,
                166,
                195,
                0.22
              ],
              width: 0.4
            }
          },

          popupTemplate: {
            title: '{measure}',
            content:
              'Value: {value}' +
              '<br>Geography: {geoid}'
          }
        })
      );
    }

    geographyLayer.addMany(
      graphics
    );

    currentLens = lensKey;

    lastResult = {
      lens: lensKey,
      label: lens.label,
      field: fieldName,
      range,
      rendered: graphics.length
    };

    return lastResult;
  }

  async function initialize() {
    await loadGeography();

    const preferred = [
      'gravity',
      'opportunity',
      'knowledge',
      'professional'
    ];

    const first = preferred.find(
      key => {
        const lens = LENSES[key];

        return Boolean(
          fields[lens.field]
        );
      }
    );

    if (!first) {
      throw new Error(
        'No supported workforce visualization ' +
        'field was published in uniquejoin.'
      );
    }

    return renderLens(first);
  }

  function setLens(lensKey) {
    return renderLens(
      lensKey
    );
  }

  function setVisible(nextVisible) {
    visible = Boolean(
      nextVisible
    );

    geographyLayer.visible = visible;
  }

  function getAvailableLenses() {
    return Object.entries(LENSES)
      .filter(
        ([, lens]) =>
          Boolean(fields[lens.field])
      )
      .map(
        ([key, lens]) => ({
          key,
          label: lens.label,
          field: fields[lens.field]
        })
      );
  }

  function getState() {
    return {
      currentLens,
      visible,
      fields: {...fields},
      lastResult,
      featureCount: features.length,
      geometryType
    };
  }

  function getRoutingReadiness() {
    return {
      ready: false,
      reason:
        'ArcGIS network service-area authorization ' +
        'and origin-to-workforce accessibility ' +
        'calculations have not yet been verified.'
    };
  }

  function destroy() {
    geographyLayer.removeAll();
    map.remove(
      geographyLayer
    );
  }

  return {
    initialize,
    setLens,
    setVisible,
    getAvailableLenses,
    getState,
    getRoutingReadiness,
    destroy,
    layer: geographyLayer
  };
}
