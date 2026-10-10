
 // ChronOS Workforce Convergence - isolated ArcGIS map.

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

   const subjectLayer = new GraphicsLayer({
     title: 'Selected subject'
   });

   const buildingLayer = new GraphicsLayer({
     title: 'Relo Well ranked buildings'
   });

   const map = new ArcGISMap({
     basemap: 'dark-gray-vector',
     layers: [buildingLayer, subjectLayer]
   });

   const view = new MapView({
     container,
     map,
     center: [-77.0369, 38.9072],
     zoom: 10
   });

   await view.when();

   const point = b => new Point({
     longitude: b.longitude,
     latitude: b.latitude,
     spatialReference: {wkid: 4326}
   });

   function render({
     buildings = [],
     subject = null,
     showBuildings = true
   }) {
     subjectLayer.removeAll();
     buildingLayer.removeAll();

     if (showBuildings) {
       buildings.forEach(b => {
         buildingLayer.add(
           new Graphic({
             geometry: point(b),
             attributes: {
               rank: b.rank,
               address:
                 b.address ||
                 b.display ||
                 'Ranked building'
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
               title: 'Relo Well rank #{rank}',
               content: '{address}'
             }
           })
         );
       });
     }

     if (subject) {
       subjectLayer.add(
         new Graphic({
           geometry: point(subject),
           attributes: {
             address:
               subject.subject ||
               subject.address ||
               'Selected subject'
           },
           symbol: {
             type: 'simple-marker',
             style: 'diamond',
             size: 22,
             color: [255, 223, 0, 1],
             outline: {
               color: [22, 25, 40, 1],
               width: 2
             }
           },
           popupTemplate: {
             title: 'Subject property',
             content: '{address}'
           }
         })
       );
     }

     const all = [
       ...(showBuildings ? buildings : []),
       ...(subject ? [subject] : [])
     ];

     if (all.length) {
       const coords = all.map(b => [
         b.longitude,
         b.latitude
       ]);

       const xmin = Math.min(...coords.map(c => c[0]));
       const xmax = Math.max(...coords.map(c => c[0]));
       const ymin = Math.min(...coords.map(c => c[1]));
       const ymax = Math.max(...coords.map(c => c[1]));

       view.goTo({
         extent: {
           xmin: xmin - 0.025,
           ymin: ymin - 0.025,
           xmax: xmax + 0.025,
           ymax: ymax + 0.025,
           spatialReference: {wkid: 4326}
         }
       }, {
         duration: 400
       }).catch(() => {});
     }
   }

   return {
     map,
     view,
     render,
     destroy: () => view.destroy()
   };
 }
