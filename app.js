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
let geojsonFeatures = [];     // Zbiór wszystkich działek, zapisany globalnie

function loadGeoJSONWithFilter(filterFn) {
  if (markerCluster) map.removeLayer(markerCluster);
  markerCluster = L.markerClusterGroup();

  fetch(geojsonFile)
    .then(res => res.json())
    .then(data => {
      geojsonFeatures = data.features; // zapisz do globalnej zmiennej

      const filtered = filterFn ? data.features.filter(filterFn) : data.features;

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
    }); // <--- brakujący nawias zamykający .then
} // <--- ten nawias był brakujący!

function filterMap(rok) {
  loadGeoJSONWithFilter(rok === 'all' ? null : f => f.properties.rok == rok);
}

function showProjektanci() {
  fetch('projektanci.json')
    .then(res => res.json())
    .then(projektanci => {
      projektanciGlobal = projektanci;
      renderProjektanciList(projektanciGlobal);
      document.getElementById("sidebar").classList.add("show");
    });
}

function renderProjektanciList(list) {
  const container = document.getElementById("sidebarContent");
  container.innerHTML = "<h3>Projektanci</h3>";
  list.forEach(p => {
    const assigned = projektanciAssigned[p.projektant] || "";
    const div = document.createElement("div");
    div.className = "projektant-entry";
    div.innerHTML = `
      <div class="name" onclick="showProfile('${p.projektant}')">${p.projektant} – ${p.liczba_projektow} projektów</div>
      <select onchange="assignHandlowiec('${p.projektant}', this.value)">
        <option value="">(brak)</option>
        ${handlowcy.map(h => `<option ${h === assigned ? 'selected' : ''}>${h}</option>`).join('')}
      </select>
    `;
    container.appendChild(div);
  });
}

function filterProjektanciList() {
  const input = document.getElementById("searchInput").value.toLowerCase();
  const filtered = projektanciGlobal.filter(p => p.projektant.toLowerCase().includes(input));
  renderProjektanciList(filtered);
}

function applyProjektantFilter() {
  const checkboxes = document.querySelectorAll('#sidebar input[type="checkbox"]:checked');
  const selectedNames = Array.from(checkboxes).map(cb => cb.value.trim());

  if (markerCluster) map.removeLayer(markerCluster);
  markerCluster = L.markerClusterGroup();

  const filtered = geojsonFeatures.filter(f =>
    selectedNames.includes(f.properties?.projektant?.trim())
  );

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
  hideSidebar();
}


function sortAZ() {
  projektanciGlobal.sort((a, b) => a.projektant.localeCompare(b.projektant));
  renderProjektanciList(projektanciGlobal);
}

function sortZA() {
  projektanciGlobal.sort((a, b) => b.projektant.localeCompare(a.projektant));
  renderProjektanciList(projektanciGlobal);
}

function filterAssigned(assigned) {
  const filtered = projektanciGlobal.filter(p => assigned ? projektanciAssigned[p.projektant] : !projektanciAssigned[p.projektant]);
  renderProjektanciList(filtered);
}

function assignHandlowiec(projektant, handlowiec) {
  if (handlowiec) projektanciAssigned[projektant] = handlowiec;
  else delete projektanciAssigned[projektant];
}

function showProfile(name) {
  const profile = document.getElementById("profilePanel");
  const content = document.getElementById("profileContent");
  const notes = projektanciNotes[name] || "";
  const handlowiec = projektanciAssigned[name] || "(nieprzypisany)";

  const projekty = geojsonFeatures
    .filter(f => f.properties?.projektant === name)
    .map(f => {
      const desc = f.properties?.popup?.replace(/`/g, "") || "Brak opisu";
      const rok = f.properties?.rok || "?";
      return `<li>${desc} (${rok})</li>`;
    }).join("");

  content.innerHTML = `
    <h3>${name}</h3>
    <p><b>Handlowiec:</b> ${handlowiec}</p>
    <label>📝 Notatki:</label>
    <textarea onchange="projektanciNotes['${name}'] = this.value">${notes}</textarea>
    <hr>
    <b>📋 Projekty:</b><ul>${projekty || "<li>Brak projektów</li>"}</ul>
  `;

  profile.classList.add("show");
}


function hideSidebar() {
  document.getElementById("sidebar").classList.remove("show");
}

function hideProfile() {
  document.getElementById("profilePanel").classList.remove("show");
}

// Początkowy załadunek
loadGeoJSONWithFilter(null);
