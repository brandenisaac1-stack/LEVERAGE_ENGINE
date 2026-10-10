
/*
 * ChronOS | Workforce Convergence
 * LIVE RELO WELL DATA
 *
 * Subject addresses are retrieved independently
 * of ranked candidate-building records.
 *
 * No client secret.
 * No changes to existing rankings.
 */

export const SERVICES = Object.freeze({
  relo:
    'https://services.arcgis.com/5e8P2PHwGNSRUvq3/arcgis/rest/services/Relo_Well/FeatureServer/0',

  tract:
    'https://services.arcgis.com/5e8P2PHwGNSRUvq3/arcgis/rest/services/uniquejoin/FeatureServer/0'
});

function findField(fields, candidates) {
  const names = new Map(
    fields.map(f => [
      f.name.toLowerCase(),
      f.name
    ])
  );

  for (const candidate of candidates) {
    const match = names.get(
      candidate.toLowerCase()
    );

    if (match) return match;
  }

  return null;
}

function value(attributes, fieldName) {
  return fieldName
    ? attributes[fieldName]
    : null;
}

function numberOrNull(raw) {
  if (raw == null || raw === '') return null;

  const n = Number(raw);

  return Number.isFinite(n) ? n : null;
}

function cleanText(raw) {
  return raw == null
    ? ''
    : String(raw).trim();
}

function eligibleRecord(raw) {
  if (raw == null || raw === '') return true;

  if (raw === true || raw === 1) return true;

  return [
    '1',
    'true',
    'yes',
    'eligible',
    'selected'
  ].includes(
    String(raw).trim().toLowerCase()
  );
}

export async function connectWorkforceLayers(
  FeatureLayer
) {
  const reloLayer = new FeatureLayer({
    url: SERVICES.relo,
    outFields: ['*']
  });

  const tractLayer = new FeatureLayer({
    url: SERVICES.tract,
    outFields: ['*']
  });

  await Promise.all([
    reloLayer.load(),
    tractLayer.load()
  ]);

  return {
    reloLayer,
    tractLayer
  };
}

export async function loadReloBuildings(
  reloLayer
) {
  const fields = reloLayer.fields;

  const columns = {
    rank: findField(fields, [
      'Relo_Final_Rank'
    ]),

    eligible: findField(fields, [
      'Relo_Candidate_Eligible'
    ]),

    address: findField(fields, [
      'Building_address',
      'Building_Address',
      'Relo_Display_Address',
      'Property_Address',
      'Address'
    ]),

    display: findField(fields, [
      'Relo_Display_Address',
      'Column60'
    ]),

    subject: findField(fields, [
      'Subject_Building_Address',
      'Subject_Address',
      'SubjectAddress',
      'Subject_address'
    ]),

    latitude: findField(fields, [
      'Latitude',
      'Lat'
    ]),

    longitude: findField(fields, [
      'Longitude',
      'Lon',
      'Long'
    ]),

    subjectLatitude: findField(fields, [
      'Subject_Latitude',
      'Subject_Lat'
    ]),

    subjectLongitude: findField(fields, [
      'Subject_Longitude',
      'Subject_Lon'
    ]),

    score: findField(fields, [
      'Relo_Weighted_Composite'
    ]),

    explanation: findField(fields, [
      'Relo_Ranking_Explanation'
    ]),

    talentGravity: findField(fields, [
      'Talent_Adjusted_Gravity_Convergence'
    ]),

    id: reloLayer.objectIdField
  };

  if (!columns.rank) {
    throw new Error(
      'Relo_Final_Rank is not published ' +
      'in the ArcGIS Relo Well layer.'
    );
  }

  // ======================================================
  // QUERY 1: SUBJECT ADDRESSES
  // ======================================================

  const subjects = [];

  if (columns.subject) {
    const subjectQuery = reloLayer.createQuery();

    subjectQuery.where =
      `${columns.subject} IS NOT NULL`;

    subjectQuery.outFields = [
      columns.subject,
      ...(columns.subjectLatitude
        ? [columns.subjectLatitude]
        : []),
      ...(columns.subjectLongitude
        ? [columns.subjectLongitude]
        : [])
    ];

    subjectQuery.returnGeometry = false;

    const subjectResult =
      await reloLayer.queryFeatures(subjectQuery);

    const seen = new Set();

    for (const feature of subjectResult.features) {
      const a = feature.attributes;

      const address = cleanText(
        value(a, columns.subject)
      );

      if (!address) continue;

      const key = address.toUpperCase();

      if (seen.has(key)) continue;

      seen.add(key);

      subjects.push({
        address,

        latitude: numberOrNull(
          value(a, columns.subjectLatitude)
        ),

        longitude: numberOrNull(
          value(a, columns.subjectLongitude)
        )
      });
    }
  }

  // ======================================================
  // QUERY 2: RANKED CANDIDATE BUILDINGS
  // ======================================================

  const q = reloLayer.createQuery();

  q.where =
    `${columns.rank} IS NOT NULL`;

  q.outFields = ['*'];

  q.returnGeometry = true;

  q.orderByFields = [
    `${columns.rank} ASC`
  ];

  const result = await reloLayer.queryFeatures(q);

  const buildings = [];

  for (const feature of result.features) {
    const a = feature.attributes;

    const rank = numberOrNull(
      value(a, columns.rank)
    );

    if (rank == null || rank < 1) continue;

    if (
      !eligibleRecord(
        value(a, columns.eligible)
      )
    ) continue;

    const geometry = feature.geometry;

    // Published Latitude / Longitude are preferred.
    // Point geometry is a fallback only when geographic
    // coordinates can be read safely.

    let latitude = numberOrNull(
      value(a, columns.latitude)
    );

    let longitude = numberOrNull(
      value(a, columns.longitude)
    );

    if (
      (latitude == null || longitude == null) &&
      geometry?.type === 'point' &&
      geometry.spatialReference?.isWGS84
    ) {
      latitude = latitude ??
        numberOrNull(geometry.y);

      longitude = longitude ??
        numberOrNull(geometry.x);
    }

    if (
      latitude == null ||
      longitude == null ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) continue;

    buildings.push({
      id: value(a, columns.id),

      rank,

      eligible: value(a, columns.eligible),

      address: cleanText(
        value(a, columns.address)
      ),

      display: cleanText(
        value(a, columns.display)
      ),

      subject: cleanText(
        value(a, columns.subject)
      ),

      latitude,
      longitude,

      subjectLatitude: numberOrNull(
        value(a, columns.subjectLatitude)
      ),

      subjectLongitude: numberOrNull(
        value(a, columns.subjectLongitude)
      ),

      score: numberOrNull(
        value(a, columns.score)
      ),

      explanation: cleanText(
        value(a, columns.explanation)
      ),

      talentGravity: numberOrNull(
        value(a, columns.talentGravity)
      )
    });
  }

  buildings.sort((a, b) =>
    a.rank - b.rank ||
    a.address.localeCompare(b.address)
  );

  console.info(
    '[ChronOS] Published Relo Well fields:',
    columns
  );

  console.info(
    '[ChronOS] Subject addresses:',
    subjects
  );

  console.info(
    '[ChronOS] Ranked buildings:',
    buildings.length
  );

  return {
    buildings,
    subjects,
    columns,
    totalReturned: result.features.length
  };
}
