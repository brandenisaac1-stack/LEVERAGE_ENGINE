
 // ChronOS Workforce Convergence
 // Live authentication and ranked-building milestone.

 import {
   connectWorkforceLayers,
   loadReloBuildings
 } from './workforce-data.js';

 import {
   createWorkforceMap
 } from './workforce-map.js';

 const $ = id => document.getElementById(id);

 // Public OAuth application ID only. Never a client secret.
 const CLIENT_ID = 's1njB7yKDBlf7REY';

 const PORTAL = 'https://savills-na.maps.arcgis.com';

 const defaults = {
   commuteMinutes: '45',
   competitorInfluence: '50',
   buildingCount: '3',
   travelMode: 'drive',
   earningsMin: '70000',
   earningsMax: '120000'
 };

 let data = [];
 let mapController = null;
 let identityManager = null;
 let selectedSubject = '';

 function status(message) {
   $('connectionStatus').textContent = message;
 }

 function setText(id, value) {
   const el = $(id);
   if (el) el.textContent = value;
 }

 function option(select, value, label) {
   const el = document.createElement('option');
   el.value = value;
   el.textContent = label;
   select.appendChild(el);
 }

 function selectedBuildings() {
   return data.slice(
     0,
     Number($('buildingCount').value)
   );
 }

 function currentSubject() {
   const record = data.find(
     b => b.subject === selectedSubject
   );

   if (
     !record ||
     !Number.isFinite(record.subjectLatitude) ||
     !Number.isFinite(record.subjectLongitude)
   ) {
     return null;
   }

   return {
     ...record,
     latitude: record.subjectLatitude,
     longitude: record.subjectLongitude
   };
 }

 function updateControls() {
   setText(
     'commuteValue',
     `${$('commuteMinutes').value} MIN`
   );

   setText(
     'competitorValue',
     `${$('competitorInfluence').value}%`
   );

   if (!data.length) return;

   renderData();
 }

 function renderData() {
   const subject = currentSubject();
   const subset = selectedBuildings();

   setText(
     'subjectAddress',
     selectedSubject || 'No subject selected'
   );

   const panel = $('rankedBuildings');
   panel.replaceChildren();

   subset.forEach(b => {
     const card = document.createElement('div');

     card.style.cssText =
       'border-bottom:1px solid #39425b;' +
       'padding:11px 0;cursor:pointer;';

     const heading = document.createElement('strong');
     heading.style.color = '#8ABDF3';

     heading.textContent =
       `#${b.rank}  ${
         b.address ||
         b.display ||
         'Ranked building'
       }`;

     card.appendChild(heading);

     if (b.score != null) {
       const score = document.createElement('div');

       score.textContent =
         `Relo composite: ${b.score.toFixed(1)}`;

       score.style.cssText =
         'margin-top:5px;' +
         'font-size:12px;' +
         'color:#D7DADE;';

       card.appendChild(score);
     }

     card.onclick = () => {
       const insights = $('locationInsights');
       insights.replaceChildren();

       const t = document.createElement('p');

       t.textContent =
         b.explanation ||
         'No published Relo ranking explanation for this building.';

       insights.appendChild(t);

       mapController?.view.goTo({
         center: [b.longitude, b.latitude],
         zoom: 13
       }).catch(() => {});
     };

     panel.appendChild(card);
   });

   mapController?.render({
     buildings: subset,
     subject,
     showBuildings: $('showBuildings').checked
   });

   setText(
     'mapSource',
     'LIVE: Savills ArcGIS · Relo Well | Isochrones not yet enabled'
   );

   setText(
     'locationInsights',
     'Select a ranked building for its published ranking explanation. Workforce scenarios and routing are pending validation.'
   );
 }

 function populateSubjects() {
   const select = $('subjectSelect');
   select.replaceChildren();

   const names = [
     ...new Set(
       data.map(b => b.subject).filter(Boolean)
     )
   ];

   if (!names.length) {
     option(
       select,
       '',
       'Subject field unavailable'
     );

     select.disabled = true;
     return;
   }

   names.forEach(name =>
     option(select, name, name)
   );

   select.disabled = false;
   selectedSubject = names[0];
   select.value = selectedSubject;

   select.onchange = () => {
     selectedSubject = select.value;
     renderData();
   };
 }

 async function loadLive() {
   status('LOADING LIVE ARCGIS DATA...');

   const FeatureLayer = await $arcgis.import(
     '@arcgis/core/layers/FeatureLayer.js'
   );

   const {
     reloLayer,
     tractLayer
   } = await connectWorkforceLayers(FeatureLayer);

   const result = await loadReloBuildings(reloLayer);

   data = result.buildings;

   if (!data.length) {
     throw new Error(
       'Relo Well returned no ranked buildings with usable coordinates. Verify eligibility and latitude/longitude fields.'
     );
   }

   if (!mapController) {
     mapController = await createWorkforceMap({
       container: 'map',
       $arcgis
     });
   }

   $('mapLoading')?.remove();

   populateSubjects();
   renderData();

   $('login').hidden = true;
   $('logout').hidden = false;

   status(
     `LIVE · ${data.length} RANKED BUILDINGS · TRACT LAYER CONNECTED`
   );

   console.info('Workforce layer fields', {
     relo: result.columns,
     tract: tractLayer.fields.map(f => f.name)
   });
 }

 async function initAuth() {
   const [
     OAuthInfo,
     IdentityManager
   ] = await Promise.all([
     $arcgis.import(
       '@arcgis/core/identity/OAuthInfo.js'
     ),
     $arcgis.import(
       '@arcgis/core/identity/IdentityManager.js'
     )
   ]);

   identityManager = IdentityManager;

   const info = new OAuthInfo({
     appId: CLIENT_ID,
     portalUrl: PORTAL,
     popup: true,
     popupCallbackUrl: '../oauth-callback.html',
     flowType: 'auto'
   });

   identityManager.registerOAuthInfos([info]);

   try {
     await identityManager.checkSignInStatus(
       `${PORTAL}/sharing/rest`
     );

     await loadLive();

   } catch (error) {
     console.error(
       'Workforce initialization or data load',
       error
     );

     status(
       error?.name === 'identity-manager:not-authenticated'
         ? 'SIGN IN REQUIRED'
         : `SIGN IN / LOAD DATA: ${
             error.message || error
           }`
     );
   }
 }

 function wire() {
   [
     'commuteMinutes',
     'competitorInfluence',
     'buildingCount',
     'travelMode',
     'earningsMin',
     'earningsMax',
     'showBuildings'
   ].forEach(id =>
     $(id)?.addEventListener(
       'input',
       updateControls
     )
   );

   $('resetAssumptions').onclick = () => {
     Object.entries(defaults).forEach(
       ([id, value]) => {
         $(id).value = value;
       }
     );

     [
       'showTalent',
       'showIsochrones',
       'showBuildings'
     ].forEach(id => {
       $(id).checked = true;
     });

     $('showCompetitors').checked = false;

     updateControls();
   };

   $('login').onclick = async () => {
     try {
       status('AUTHENTICATING...');

       await identityManager.getCredential(
         `${PORTAL}/sharing/rest`
       );

       await loadLive();

     } catch (error) {
       console.error(error);

       status(
         `ERROR: ${error.message || error}`
       );
     }
   };

   $('logout').onclick = () => {
     identityManager?.destroyCredentials();
     location.reload();
   };

   updateControls();
 }

 wire();

 initAuth().catch(error => {
   console.error(error);

   status(
     `INITIALIZATION ERROR: ${
       error.message || error
     }`
   );
 });
