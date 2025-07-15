// Lista handlowców
const handlowcy = ["Maciej Mierzwa", "Damian Grycel", "Krzysztof Joachimiak", "Marek Suwalski"];

let map = L.map('map').setView([53.4285, 14.5528], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

let geojsonFile = 'dzialki.geojson';
let markerCluster;
let projektanciGlobal = [];
let projektanciAssigned = {}; // { "nazwisko": "handlowiec" }
let projektanciNotes = {};    // { "nazwisko": "uwagi..." }
let geojsonFeatures = [];     // wszystkie dane działek

function loadGeoJSONWithFilter(filterFn) {
  if (markerCluster) map.removeLayer(markerCluster);
  markerCluster = L.markerClusterGroup();

  fetch(geojsonFile)
    .then(res => res.json())
    .then(data => {
      geojsonFeatures = data.features;

      const filtered = filterFn ? geojsonFeatures.filter(filterFn) : geojsonFeatures;

      const layer = L.geoJSON({ type: "FeatureCollection", features: filtered }, {
        onEachFeature: (feature, layer) => {
          const coords = feature.geometry?.coordinates;
          const lat = coords ? coords[1] : null;
          const lon = coords ? coords[0] : null;

          let popup = feature.properties?.popup || 'Brak opisu';
          const rok = feature.properties?.rok || 'brak roku';
          const proj = feature.properties?.projektant || 'brak projektanta';

          if (lat && lon) {
            popup += `<br><a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank">📍 Pokaż w Google Maps</a>`;
          }

          layer.bindPopup(`<b>${proj}</b><br/>Rok: ${rok}<br/>${popup}`);
        }
      });

      markerCluster.addLayer(layer);
      map.addLayer(markerCluster);
    });
}

function filterMap(rok) {
  loadGeoJSONWithFilter(rok === 'all' ? null : f => f.properties.rok == rok)
