
/*
 * ChronOS | Workforce Convergence Engine
 * Live ArcGIS Integration
 *
 * Independent of Lease Leverage Engine.
 *
 * Dependencies:
 *   workforce-data.js
 *   workforce-map.js
 *
 * No client secret is used in this browser application.
 */

import {
  connectWorkforceLayers,
  loadReloBuildings
} from './workforce-data.js';

import {
  createWorkforceMap
} from './workforce-map.js';

const $ = id => document.getElementById(id);

// ============================================================
// ARCGIS CONFIGURATION
// ============================================================

const CLIENT_ID = 's1njB7yKDBlf7REY';

const PORTAL = 'https://savills-na.maps.arcgis.com';

// Existing callback at the repository root.
// The URL is absolute to avoid relative-path ambiguity.

const CALLBACK_URL = new URL(
  '../oauth-callback.html',
  window.location.href
).href;

// ============================================================
// DEFAULT ASSUMPTIONS
// ============================================================

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

let loading = false;

let selectedSubject = '';

let liveLoaded = false;

// ============================================================
// GENERAL HELPERS
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

function makeOption(value, label) {
  const el = document.createElement('option');

  el.value = value;
  el.textContent = label;

  return el;
}

function showError(error, prefix = 'ERROR') {
  console.error('[ChronOS Workforce]', error);

  const message =
    error?.message ||
    String(error) ||
    'Unknown error';

  status(`${prefix}: ${message}`);
}

function setLoading(active) {
  loading = active;

  const login = $('login');

  if (login) {
    login.disabled = active;

    login.textContent = active
      ? 'LOADING...'
      : 'SIGN IN / LOAD LIVE DATA';
  }
}

// ============================================================
// CONTROL VALUES
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

  const subjects = [
    ...new Set(
      buildings
        .map(b => String(b.subject || '').trim())
        .filter(Boolean)
    )
  ];

  if (!subjects.length) {
    select.appendChild(
      makeOption(
        '',
        'Subject address unavailable'
      )
    );

    select.disabled = true;

    selectedSubject = '';

    setText(
      'subjectAddress',
      'No published subject address'
    );

    return;
  }

  for (const subject of subjects) {
    select.appendChild(
      makeOption(subject, subject)
    );
  }

  selectedSubject = subjects[0];

  select.value = selectedSubject;

  select.disabled = false;

  setText(
    'subjectAddress',
    selectedSubject
  );
}

function currentSubject() {
  if (!selectedSubject) return null;

  const record = buildings.find(
    b => b.subject === selectedSubject
  );

  if (!record) return null;

  if (
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

// ============================================================
// BUILDING COMPARISON
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

  for (const building of subset) {
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

      if (mapController?.view) {
        mapController.view.goTo({
          center: [
            building.longitude,
            building.latitude
          ],
          zoom: 13
        }).catch(error => {
          console.warn(
            'Map navigation interrupted',
            error
          );
        });
      }
    });

    panel.appendChild(card);
  }
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
// MAP AND LIVE OUTPUTS
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
// LOAD LIVE DATA
// ============================================================

async function loadLive() {
  if (loading) return;

  setLoading(true);

  status('CONNECTING TO SAVILLS ARCGIS...');

  try {
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

    console.info(
      'Relo Well published field mapping',
      result.columns
    );

    console.info(
      'Tract layer fields',
      tractLayer.fields.map(f => f.name)
    );

    if (!buildings.length) {
      throw new Error(
        'Relo Well returned no eligible ranked ' +
        'buildings with valid coordinates.'
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
// ARCGIS AUTHENTICATION
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

  const oauthInfo = new OAuthInfo({
    appId: CLIENT_ID,
    portalUrl: PORTAL,
    popup: true,
    popupCallbackUrl: CALLBACK_URL,
    flowType: 'auto'
  });

  identityManager.registerOAuthInfos([
    oauthInfo
  ]);

  authReady = true;

  console.info(
    'ChronOS Workforce OAuth callback:',
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
  for (const [id, value] of Object.entries(DEFAULTS)) {
    const element = $(id);

    if (element) {
      element.value = value;
    }
  }

  for (const id of [
    'showTalent',
    'showIsochrones',
    'showBuildings'
  ]) {
    const element = $(id);

    if (element) {
      element.checked = true;
    }
  }

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

  for (const id of [
    'commuteMinutes',
    'competitorInfluence',
    'travelMode',
    'earningsMin',
    'earningsMax'
  ]) {
    $(id)?.addEventListener(
      'input',
      updateControlLabels
    );
  }

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
    showError(
      error,
      'INITIALIZATION ERROR'
    );
  });
}

initialize();
