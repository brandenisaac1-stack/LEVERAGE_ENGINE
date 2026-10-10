
/*
 * ChronOS Workforce Convergence
 * STABLE ARCGIS MAP
 *
 * No automatic viewport repositioning.
 * No wheel zoom.
 * No render-triggered navigation.
 */

export async function createWorkforceMap({
  container,
  $arcgis
}) {

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

  const mapElement =
    typeof container === 'string'
      ? document.getElementById(container)
      : container;

  if (!mapElement) {
    throw new Error('ArcGIS map container not found.');
  }

  // Clear preview content before initializing ArcGIS.
  mapElement.replaceChildren();

  const buildingLayer = new GraphicsLayer({
    title: 'Relo Well Ranked Buildings'
  });

  const subjectLayer = new GraphicsLayer({
    title: 'Selected Subject Property'
  });

  const map = new ArcGISMap({
    basemap: 'dark-gray-vector',
    layers: [
      buildingLayer,
      subjectLayer
    ]
  });

  const view = new MapView({
    container: mapElement,
    map,
    center: [-77.0369, 38.9072],
    zoom: 11,
    constraints: {
      rotationEnabled: false
    },
    navigation: {
      mouseWheelZoomEnabled: false,
      browserTouchPanEnabled: false
    }
  });

  await view.when();

  // Prevent browser wheel events from interacting
  // with the map viewport.
  const stopWheel = event => {
    event.preventDefault();
    event.stopPropagation();
  };

  mapElement.addEventListener(
    'wheel',
    stopWheel,
    { passive: false }
  );

  function validCoordinates(record) {
    if (!record) return false;

    const lon = Number(record.longitude);
    const lat = Number(record.latitude);

    return (
      record.longitude != null &&
      record.latitude != null &&
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
      spatialReference: { wkid: 4326 }
    });
  }

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
        color: [93, 165, 238, 0.95],
        outline: {
          color: [255, 255, 255, 1],
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
        color: [255, 223, 0, 1],
        outline: {
          color: [27, 29, 44, 1],
          width: 2
        }
      },

      popupTemplate: {
        title: 'Subject Property',
        content: '{address}'
      }
    });
  }

  function render({
    buildings = [],
    subject = null,
    showBuildings = true
  } = {}) {

    buildingLayer.removeAll();
    subjectLayer.removeAll();

    if (showBuildings && Array.isArray(buildings)) {
      for (const building of buildings) {
        if (!validCoordinates(building)) {
          console.warn(
            '[ChronOS] Invalid building coordinates:',
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

    if (subject && validCoordinates(subject)) {
      subjectLayer.add(
        createSubjectGraphic(subject)
      );
    }

    // CRITICAL:
    // No goTo(), center, zoom, or extent changes.
  }

  async function focusBuilding(building) {
    if (!validCoordinates(building)) return;

    try {
      await view.goTo(
        {
          center: [
            Number(building.longitude),
            Number(building.latitude)
          ],
          zoom: 13
        },
        {
          animate: false
        }
      );
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.warn(
          '[ChronOS] Navigation error:',
          error
        );
      }
    }
  }

  return {
    map,
    view,
    buildingLayer,
    subjectLayer,
    render,
    focusBuilding,

    destroy() {
      mapElement.removeEventListener(
        'wheel',
        stopWheel
      );
      view.destroy();
    }
  };
}
