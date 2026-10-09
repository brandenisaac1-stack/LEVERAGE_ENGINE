
/*
 * ChronOS | Workforce Convergence Engine
 * Version 1 — Independent application preview
 *
 * Live ArcGIS integration will be added separately.
 * No fabricated rankings, workforce data, or isochrones.
 */

const $ = id => document.getElementById(id);

const defaults = {
  commuteMinutes: '45',
  competitorInfluence: '50',
  buildingCount: '3',
  travelMode: 'drive',
  earningsMin: '70000',
  earningsMax: '120000'
};

function syncControls() {
  $('commuteValue').textContent =
    `${$('commuteMinutes').value} MIN`;

  $('competitorValue').textContent =
    `${$('competitorInfluence').value}%`;

  $('mapSource').textContent =
    'PREVIEW ONLY · Live ArcGIS layer connections pending';

  $('rankedBuildings').innerHTML = `
    <span class="preview-badge">
      TOP ${$('buildingCount').value} · DATA NOT LOADED
    </span>

    <p class="empty-state">
      The approved Relo Well rankings will appear here
      after ArcGIS data integration. No placeholder
      buildings or rankings are displayed.
    </p>
  `;

  $('locationInsights').innerHTML = `
    <p class="empty-state">
      Select a live Relo Well building after the data
      connector is installed. Workforce accessibility
      will require a validated service-area analysis.
    </p>
  `;
}

function initialize() {
  $('connectionStatus').textContent =
    'INTERFACE PREVIEW · NOT CONNECTED';

  $('mapLoading').innerHTML = `
    <h2>WORKFORCE CONVERGENCE</h2>

    <p>
      The independent dashboard is running.
      The map, Relo Well rankings, workforce layers,
      and network isochrones will be connected in
      the next implementation stage.
    </p>
  `;

  const marker = document.createElement('div');

  marker.className = 'preview-marker';
  marker.textContent = 'MAP VIEW · PENDING LIVE ARCGIS';

  $('map').appendChild(marker);

  const controlIds = [
    'commuteMinutes',
    'competitorInfluence',
    'buildingCount',
    'travelMode',
    'earningsMin',
    'earningsMax',
    'showTalent',
    'showIsochrones',
    'showBuildings',
    'showCompetitors'
  ];

  for (const id of controlIds) {
    $(id)?.addEventListener('input', syncControls);
  }

  $('resetAssumptions').addEventListener('click', () => {
    for (const [id, value] of Object.entries(defaults)) {
      $(id).value = value;
    }

    for (const id of [
      'showTalent',
      'showIsochrones',
      'showBuildings'
    ]) {
      $(id).checked = true;
    }

    $('showCompetitors').checked = false;

    syncControls();
  });

  $('login').addEventListener('click', () => {
    window.alert(
      'ArcGIS sign-in is not connected in this ' +
      'interface-only checkpoint. The next module ' +
      'will integrate Savills ArcGIS OAuth and ' +
      'hosted layers. No credentials are requested here.'
    );
  });

  $('logout').addEventListener('click', () => {
    window.alert(
      'No Workforce Convergence session is active.'
    );
  });

  syncControls();
}

initialize();
