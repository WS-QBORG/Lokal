
// app.js

let map = L.map('map').setView([52.069, 19.480], 6);

// Ciemne tile z CartoDB (premium look)
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

// Marker Cluster
let markerCluster = L.markerClusterGroup(clusterOptions);
map.addLayer(markerCluster);

// Przykład danych – zamień na dynamiczne z geojson
const sampleData = [
  {
    lat: 52.2297,
    lon: 21.0122,
    content: `
      <b>Maciej Nowak</b><br>
      Rok: 2024<br>
      Inwestycja: budowa obiektów<br>
      Projektant: Maciej Nowak<br>
      Adres: Osina<br>
      Działka: obręb 2.0, nr 58/5<br>
      <br>
      <select>
        <option>(brak)</option>
        <option>Maciej Mierzwa</option>
        <option>Damian Grycel</option>
        <option>Krzysztof Joachimiak</option>
        <option>Marek Suwalski</option>
      </select><br>
      <a href="https://maps.google.com" target="_blank">Pokaż w Google Maps</a>
    `
  }
];

// Render markerów z popupami
sampleData.forEach(item => {
  const marker = L.marker([item.lat, item.lon]);
  bindDarkPopup(marker, item.content);
  markerCluster.addLayer(marker);
});

// Placeholdery do przycisków filtrowania – zależne od pełnej aplikacji
function filterMap(year) {
  console.log("Filtruj mapę dla roku:", year);
}

function showProjektanci() {
  document.getElementById('sidebar').classList.add('show');
}

function hideSidebar() {
  document.getElementById('sidebar').classList.remove('show');
}

function hideProfile() {
  document.getElementById('profilePanel').classList.remove('show');
}

function filterProjektanciList() {
  console.log("Filtrowanie projektantów...");
}

function applySortFilter() {
  console.log("Sortowanie...");
}

function applyProjektantFilter() {
  console.log("Pokaż wybranych...");
}
