
 // ChronOS Workforce Convergence - live ArcGIS data access.
 // No client secret belongs in this browser module.

 export const SERVICES = Object.freeze({
   relo: 'https://services.arcgis.com/5e8P2PHwGNSRUvq3/arcgis/rest/services/Relo_Well/FeatureServer/0',
   tract: 'https://services.arcgis.com/5e8P2PHwGNSRUvq3/arcgis/rest/services/uniquejoin/FeatureServer/0'
 });

 const field = (fields, candidates) => {
   const byName = new Map(fields.map(f => [f.name.toLowerCase(), f.name]));
   for (const candidate of candidates) {
     const actual = byName.get(candidate.toLowerCase());
     if (actual) return actual;
   }
   return null;
 };

 const val = (a, name) => name ? a[name] : null;

 const numeric = value =>
   value == null || value === ''
     ? null
     : (Number.isFinite(+value) ? +value : null);

 const text = value =>
   value == null ? '' : String(value).trim();

 export async function connectWorkforceLayers(FeatureLayer) {
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

   return {reloLayer, tractLayer};
 }

 export async function loadReloBuildings(reloLayer) {
   const f = reloLayer.fields;

   const columns = {
     rank: field(f, ['Relo_Final_Rank']),
     eligible: field(f, ['Relo_Candidate_Eligible']),
     address: field(f, [
       'Building_Address',
       'Building_Address_1',
       'Property_Address',
       'Address'
     ]),
     subject: field(f, [
       'Subject_address',
       'Subject_Address',
       'SubjectAddress'
     ]),
     latitude: field(f, ['Latitude', 'Lat']),
     longitude: field(f, ['Longitude', 'Lon', 'Long']),
     subjectLatitude: field(f, [
       'Subject_Latitude',
       'Subject_Lat',
       'SubjectLatitude'
     ]),
     subjectLongitude: field(f, [
       'Subject_Longitude',
       'Subject_Lon',
       'SubjectLongitude'
     ]),
     score: field(f, ['Relo_Weighted_Composite']),
     explanation: field(f, ['Relo_Ranking_Explanation']),
     display: field(f, ['Column60']),
     id: reloLayer.objectIdField
   };

   if (!columns.rank) {
     throw new Error(
       'Relo Well is accessible, but Relo_Final_Rank is not published.'
     );
   }

   const q = reloLayer.createQuery();

   q.where = `${columns.rank} IS NOT NULL`;
   q.outFields = ['*'];
   q.returnGeometry = true;

   const features = await reloLayer.queryFeatures(q);

   const buildings = features.features.map(feature => {
     const a = feature.attributes;
     const geom = feature.geometry;

     const longitude =
       numeric(val(a, columns.longitude)) ??
       (geom?.type === 'point'
         ? numeric(geom.longitude ?? geom.x)
         : null);

     const latitude =
       numeric(val(a, columns.latitude)) ??
       (geom?.type === 'point'
         ? numeric(geom.latitude ?? geom.y)
         : null);

     return {
       id: val(a, columns.id),
       rank: numeric(val(a, columns.rank)),
       eligible: val(a, columns.eligible),
       address: text(val(a, columns.address)),
       subject: text(val(a, columns.subject)),
       longitude,
       latitude,
       subjectLatitude: numeric(
         val(a, columns.subjectLatitude)
       ),
       subjectLongitude: numeric(
         val(a, columns.subjectLongitude)
       ),
       score: numeric(val(a, columns.score)),
       explanation: text(val(a, columns.explanation)),
       display: text(val(a, columns.display))
     };
   }).filter(b =>
     b.rank != null &&
     b.rank >= 1 &&
     Number.isFinite(b.latitude) &&
     Number.isFinite(b.longitude)
   );

   const eligible = b => {
     if (!columns.eligible) return true;

     const v = b.eligible;

     if (v == null || v === '') return true;

     return (
       v === true ||
       v === 1 ||
       [
         'yes',
         'true',
         'eligible',
         '1',
         'selected'
       ].includes(String(v).toLowerCase().trim())
     );
   };

   const sorted = buildings
     .filter(eligible)
     .sort((a, b) =>
       a.rank - b.rank ||
       String(a.address).localeCompare(String(b.address))
     );

   return {
     buildings: sorted,
     columns,
     totalReturned: features.features.length
   };
 }
