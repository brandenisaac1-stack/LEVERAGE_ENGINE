
/*
 * ChronOS | Workforce Convergence Engine
 * workforce-map.js
 *
 * Stable 2D ArcGIS map renderer.
 *
 * - No automatic goTo() during render()
 * - Initial Washington, DC map extent
 * - Actual Relo Well building coordinates
 * - Separate subject and ranked-building layers
 * - Manual map navigation preserved
 * - No fabricated isochrones or workforce scores
 *
 * Independent of Lease Leverage Engine.
 */

export async function createWorkforceMap({
  container,
  $arcgis
}) {

  // ==========================================================
  // ARCGIS MODULES
  // ==========================================================

  const [
    ArcGISMap,
    MapView,
    GraphicsLayer,
    Graphic,
    Point
  ] = await Promise.all([
    $arcgis.import('@arcgis/core/Map.js'),
    $arcgis.import('@arcgis/core/views/MapView.js'),
    $arcgis.import('@arcgis/core/layers/GraphicsLayer.js'),
    $arcgis.import('@arcgis/core/Graphic.js'),
    $arcgis.import('@arcgis/core/geometry/Point.js')
  ]);

  // ==========================================================
  // GRAPHICS LAYERS
  // ==========================================================

  const buildingLayer = new GraphicsLayer({
    title: 'Relo Well Ranked Buildings'
  });

  const subjectLayer = new GraphicsLayer({
    title: 'Selected Subject Property'
  });

  // ==========================================================
  // MAP
  // ==========================================================

  const map = new ArcGISMap({
    basemap: 'dark-gray-vector',
    layers: [
      buildingLayer,
      subjectLayer
    ]
  });

  const view = new MapView({
    container,
    map,

    // Initial geographic context only.
    // This is not reapplied during rendering.
    center: [-77.0369, 38.9072],
    zoom: 11,

    constraints: {
      rotationEnabled: false
    }
  });

  await view.when();

  // ==========================================================
  // VALIDATION
  // ==========================================================

  function validCoordinates(record) {
    if (!record) return false;

    const lon = Number(record.longitude);
    const lat = Number(record.latitude);

    return (
      Number.isFinite(lon) &&
      Number.isFinite(lat) &&
      lon >= -180 &&
      lon <= 180 &&
      lat >= -90 &&
      lat <= 90
    );
  }

  function makePoint(record) {
    return new Point({
      longitude: Number(record.longitude),
      latitude: Number(record.latitude),
      spatialReference: {
        wkid: 4326
      }
    });
  }

  // ==========================================================
  // RANKED BUILDING GRAPHICS
  // ==========================================================

  function createBuildingGraphic(building) {

    return new Graphic({
      geometry: makePoint(building),

      attributes: {
        rank: building.rank,
        address:
          building.address ||
          building.display ||
          'Ranked building',

        score:
          building.score == null
            ? 'Not available'
            : Number(building.score).toFixed(1)
      },

      symbol: {
        type: 'simple-marker',
        style: 'circle',
        size: 18,

        color: [
          93,
          165,
          238,
          0.95
        ],

        outline: {
          color: [
            255,
            255,
            255,
            1
          ],
          width: 1.5
        }
      },

      popupTemplate: {
        title: 'Relo Well Rank #{rank}',

        content:
          '<b>{address}</b>' +
          '<br>Relo Composite: {score}'
      }
    });
  }

  // ==========================================================
  // SUBJECT GRAPHIC
  // ==========================================================

  function createSubjectGraphic(subject) {

    return new Graphic({
      geometry: makePoint(subject),

      attributes: {
        address:
          subject.subject ||
          subject.address ||
          'Selected subject'
      },

      symbol: {
        type: 'simple-marker',
        style: 'diamond',
        size: 23,

        color: [
          255,
          223,
          0,
          1
        ],

        outline: {
          color: [
            27,
            29,
            44,
            1
          ],
          width: 2
        }
      },

      popupTemplate: {
        title: 'Subject Property',
        content: '{address}'
      }
    });
  }

  // ==========================================================
  // STABLE RENDER
  // ==========================================================

  function render({
    buildings = [],
    subject = null,
    showBuildings = true
  } = {}) {

    // Update graphics only.
    // Do not alter center, zoom, or extent.

    buildingLayer.removeAll();
    subjectLayer.removeAll();

    if (
      showBuildings &&
      Array.isArray(buildings)
    ) {

      for (const building of buildings) {

        if (!validCoordinates(building)) {
          console.warn(
            '[ChronOS Workforce] Invalid building coordinates:',
            building.rank,
            building.address
          );

          continue;
        }

        buildingLayer.add(
          createBuildingGraphic(building)
        );
      }
    }

    if (subject) {

      if (validCoordinates(subject)) {

        subjectLayer.add(
          createSubjectGraphic(subject)
        );

      } else {

        console.warn(
          '[ChronOS Workforce] Subject coordinates unavailable:',
          subject.subject ||
          subject.address
        );
      }
    }

    // IMPORTANT:
    // No view.goTo() here.
    // No view.center assignment.
    // No view.zoom assignment.
    // No view.extent assignment.
  }

  // ==========================================================
  // OPTIONAL EXPLICIT NAVIGATION
  // ==========================================================

  async function focusBuilding(building) {

    if (!validCoordinates(building)) {
      console.warn(
        '[ChronOS Workforce] Cannot navigate to building:',
        building
      );

      return;
    }

    try {

      await view.goTo({
        center: [
          Number(building.longitude),
          Number(building.latitude)
        ],
        zoom: 13
      }, {
        duration: 400
      });

    } catch (error) {

      if (error?.name !== 'AbortError') {
        console.warn(
          '[ChronOS Workforce] Building navigation:',
          error
        );
      }
    }
  }

  // ==========================================================
  // RETURN PUBLIC CONTROLLER
  // ==========================================================

  return {
    map,
    view,
    buildingLayer,
    subjectLayer,
    render,
    focusBuilding,

    destroy() {
      view.destroy();
    }
  };
}
