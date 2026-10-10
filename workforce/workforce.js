
/*
 * ChronOS | Workforce Convergence Engine
 * Live ArcGIS integration
 *
 * Independent of Lease Leverage Engine.
 *
 * Existing modules:
 *   workforce-data.js
 *   workforce-map.js
 *
 * No client secret is used.
 */

import {
  connectWorkforceLayers,
  loadReloBuildings
} from './workforce-data.js';

import {
  createWorkforceMap
} from './workforce-map.js';

// ============================================================
// CONFIGURATION
// ============================================================

const $ = id => document.getElementById(id);

const CLIENT_ID = 'HkPcxQmc1HwysD9F';

const PORTAL = 'https://savills-na.maps.arcgis.com';

// Reuse the existing repository-root OAuth callback.
// This must be an authorized redirect URI in ArcGIS.

const CALLBACK_URL = new URL(
  '../oauth-callback.html',
  window.location.href
).href;

const DEFAULTS = {
  commuteMinutes: '45',
  competitorInfluence: '50',
  buildingCount: '3',
  travelMode: 'drive',
  earningsMin: '70000',
  earningsMax: '120000'
};

// ============================================================
// APPLICATION STATE
// ============================================================

let buildings = [];
let mapController = null;
let identityManager = null;

let authReady = false;
let liveLoaded = false;
let loading = false;

let selectedSubject = '';
let subjectRecords = [];

// ============================================================
// UTILITIES
// ============================================================

function status(message) {
  const el = $('connectionStatus');

  if (el) {
    el.textContent = message;
  }

  console.info('[ChronOS Workforce]', message);
}

function setText(id, value) {
  const el = $(id);

  if (el) {
    el.textContent = value;
  }
}

function showError(error, prefix = 'ERROR') {
  console.error('[ChronOS Workforce]', error);

  status(
    `${prefix}: ${
      error?.message || String(error)
    }`
  );
}

function makeOption(value, label) {
  const option = document.createElement('option');

  option.value = value;
  option.textContent = label;

  return option;
}

function setLoading(active) {
  loading = active;

  const login = $('login');

  if (!login) return;

  login.disabled = active;

  login.textContent = active
    ? 'LOADING...'
    : 'SIGN IN / LOAD LIVE DATA';
}

// ============================================================
// CONTROL LABELS
// ============================================================

function updateControlLabels() {
  setText(
    'commuteValue',
    `${$('commuteMinutes')?.value || 45} MIN`
  );

  setText(
    'competitorValue',
    `${$('competitorInfluence')?.value || 50}%`
  );
}

function selectedBuildings() {
  const count = Number(
    $('buildingCount')?.value || 3
  );

  return buildings.slice(0, count);
}

// ============================================================
// SUBJECT PROPERTY
// ============================================================


function populateSubjects() {
  const select = $('subjectSelect');

  if (!select) return;

  select.replaceChildren();

  if (!subjectRecords.length) {
    select.appendChild(
      makeOption(
        '',
        'Subject address not published'
      )
    );

    select.disabled = true;
    selectedSubject = '';

    setText(
      'subjectAddress',
      'No subject property available'
    );

    return;
  }

  for (const subject of subjectRecords) {
    select.appendChild(
      makeOption(
        subject.address,
        subject.address
      )
    );
  }

  selectedSubject = subjectRecords[0].address;

  select.value = selectedSubject;
  select.disabled = false;

  setText(
    'subjectAddress',
    selectedSubject
  );
}


function currentSubject() {
  if (!selectedSubject) return null;

  const subject = subjectRecords.find(
    s => s.address === selectedSubject
  );

  if (!subject) return null;

  if (
    !Number.isFinite(subject.latitude) ||
    !Number.isFinite(subject.longitude)
  ) {
    return null;
  }

  return {
    subject: subject.address,
    address: subject.address,
    latitude: subject.latitude,
    longitude: subject.longitude
  };
}


// ============================================================
// LOCATION INSIGHTS
// ============================================================

function renderBuildingInsights(building) {
  const panel = $('locationInsights');

  if (!panel) return;

  panel.replaceChildren();

  const heading = document.createElement('div');

  heading.style.cssText = [
    'color:#FFDF00',
    'font-weight:700',
    'margin-bottom:10px'
  ].join(';');

  heading.textContent =
    building.address ||
    building.display ||
    `Ranked Building #${building.rank}`;

  panel.appendChild(heading);

  const explanation = document.createElement('p');

  explanation.textContent =
    building.explanation ||
    'No published ranking explanation is available.';

  panel.appendChild(explanation);

  const note = document.createElement('p');

  note.style.cssText = [
    'color:#8ABDF3',
    'font-size:11px',
    'margin-top:12px'
  ].join(';');

  note.textContent =
    'Baseline Relo Well ranking. Dynamic workforce ' +
    'scenario calculations are not yet enabled.';

  panel.appendChild(note);
}

// ============================================================
// RANKED BUILDINGS
// ============================================================

function renderRankings() {
  const panel = $('rankedBuildings');

  if (!panel) return;

  panel.replaceChildren();

  const subset = selectedBuildings();

  if (!subset.length) {
    const empty = document.createElement('p');

    empty.className = 'empty-state';

    empty.textContent =
      'No eligible ranked buildings were returned.';

    panel.appendChild(empty);

    return;
  }

  subset.forEach(building => {
    const card = document.createElement('div');

    card.style.cssText = [
      'border-bottom:1px solid #39425b',
      'padding:12px 0',
      'cursor:pointer'
    ].join(';');

    const heading = document.createElement('div');

    heading.style.cssText = [
      'color:#8ABDF3',
      'font-weight:700',
      'font-size:13px'
    ].join(';');

    heading.textContent =
      `#${building.rank}  ${
        building.address ||
        building.display ||
        'Ranked building'
      }`;

    card.appendChild(heading);

    if (building.score != null) {
      const score = document.createElement('div');

      score.style.cssText = [
        'color:#D7DADE',
        'font-size:12px',
        'margin-top:5px'
      ].join(';');

      score.textContent =
        `Relo composite: ${
          Number(building.score).toFixed(1)
        }`;

      card.appendChild(score);
    }

    card.addEventListener('click', () => {
      renderBuildingInsights(building);

      mapController?.view.goTo({
        center: [
          building.longitude,
          building.latitude
        ],
        zoom: 13
      }).catch(() => {});
    });

    panel.appendChild(card);
  });
}

// ============================================================
// LIVE MAP RENDERING
// ============================================================

function renderLive() {
  if (!liveLoaded) return;

  const subset = selectedBuildings();

  const subject = currentSubject();

  setText(
    'subjectAddress',
    selectedSubject || 'No subject selected'
  );

  renderRankings();

  mapController?.render({
    buildings: subset,
    subject,
    showBuildings: Boolean(
      $('showBuildings')?.checked
    )
  });

  setText(
    'mapSource',
    'LIVE SAVILLS ARCGIS · RELO WELL · ' +
    'ISOCHRONES PENDING'
  );
}

// ============================================================
// LIVE ARCGIS DATA
// ============================================================

async function loadLive() {
  if (loading) return;

  setLoading(true);

  try {
    status('CONNECTING TO SAVILLS ARCGIS...');

    const FeatureLayer = await $arcgis.import(
      '@arcgis/core/layers/FeatureLayer.js'
    );

    const {
      reloLayer,
      tractLayer
    } = await connectWorkforceLayers(
      FeatureLayer
    );

    status('READING RELO WELL RANKINGS...');

    const result = await loadReloBuildings(
      reloLayer
    );

    buildings = result.buildings;
subjectRecords = result.subjects || [];

console.info(
  'Relo Well field mapping:',
  result.columns
);

    console.info(
      'Tract fields:',
      tractLayer.fields.map(f => f.name)
    );

    if (!buildings.length) {
      throw new Error(
        'Relo Well returned no eligible ranked ' +
        'buildings with usable coordinates.'
      );
    }

    status('INITIALIZING ARCGIS MAP...');

    if (!mapController) {
      mapController = await createWorkforceMap({
        container: 'map',
        $arcgis
      });
    }

    $('mapLoading')?.remove();

    populateSubjects();

    liveLoaded = true;

    renderLive();

    $('login').hidden = true;
    $('logout').hidden = false;

    status(
      `LIVE · ${buildings.length} RANKED BUILDINGS · ` +
      'TRACT LAYER CONNECTED'
    );

  } catch (error) {
    showError(error, 'LIVE DATA ERROR');

  } finally {
    setLoading(false);
  }
}

// ============================================================
// ARCGIS OAUTH
// ============================================================

async function initializeAuthentication() {
  status('INITIALIZING ARCGIS AUTHENTICATION...');

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
  popup: false,
  flowType: 'auto'
});

  identityManager.registerOAuthInfos([info]);

  authReady = true;

  console.info(
    'Workforce OAuth callback:',
    CALLBACK_URL
  );

  try {
    await identityManager.checkSignInStatus(
      `${PORTAL}/sharing/rest`
    );

    status('EXISTING ARCGIS SESSION FOUND');

    await loadLive();

  } catch (error) {
    if (!liveLoaded) {
      status('SIGN IN REQUIRED');
    }
  }
}

async function signIn() {
  if (!authReady || !identityManager) {
    status(
      'ARCGIS AUTHENTICATION IS STILL INITIALIZING'
    );

    return;
  }

  try {
    status('OPENING SAVILLS ARCGIS SIGN-IN...');

    await identityManager.getCredential(
      `${PORTAL}/sharing/rest`
    );

    status('AUTHENTICATED');

    await loadLive();

  } catch (error) {
    showError(error, 'AUTHENTICATION ERROR');
  }
}

// ============================================================
// RESET ASSUMPTIONS
// ============================================================

function resetAssumptions() {
  Object.entries(DEFAULTS).forEach(
    ([id, value]) => {
      if ($(id)) {
        $(id).value = value;
      }
    }
  );

  [
    'showTalent',
    'showIsochrones',
    'showBuildings'
  ].forEach(id => {
    if ($(id)) {
      $(id).checked = true;
    }
  });

  if ($('showCompetitors')) {
    $('showCompetitors').checked = false;
  }

  updateControlLabels();
  renderLive();
}

// ============================================================
// EVENT HANDLERS
// ============================================================

function wireEvents() {
  $('login')?.addEventListener(
    'click',
    signIn
  );

  $('logout')?.addEventListener(
    'click',
    () => {
      identityManager?.destroyCredentials();
      window.location.reload();
    }
  );

  $('subjectSelect')?.addEventListener(
    'change',
    event => {
      selectedSubject = event.target.value;
      renderLive();
    }
  );

  $('buildingCount')?.addEventListener(
    'change',
    renderLive
  );

  $('showBuildings')?.addEventListener(
    'change',
    renderLive
  );

  [
    'commuteMinutes',
    'competitorInfluence',
    'travelMode',
    'earningsMin',
    'earningsMax'
  ].forEach(id => {
    $(id)?.addEventListener(
      'input',
      updateControlLabels
    );
  });

  $('resetAssumptions')?.addEventListener(
    'click',
    resetAssumptions
  );
}

// ============================================================
// INITIALIZATION
// ============================================================

function initialize() {
  wireEvents();

  updateControlLabels();

  status('WAITING FOR ARCGIS AUTHENTICATION');

  initializeAuthentication().catch(error => {
    showError(error, 'INITIALIZATION ERROR');
  });
}

initialize();
