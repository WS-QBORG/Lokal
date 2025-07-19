const REPO_OWNER = 'WS-QBORG';
const REPO_NAME = 'Lokal';
const MAIN_FILE = 'handlowcy.json';
const RAW_MAIN_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${MAIN_FILE}`;

let projektanciAssigned = {};
const handlowcy = ["Maciej Mierzwa", "Damian Grycel", "Krzysztof Joachimiak", "Marek Suwalski"];

let map = L.map('map').setView([53.4285, 14.5528], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

let geojsonFile = 'dzialki.geojson';
let markerCluster;
let projektanciGlobal = [];
let projektanciNotes = {};
let geojsonFeatures = [];

function cleanName(name) {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function createClusterGroup() {
  return L.markerClusterGroup({
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      let color = '#3b82f6';
      if (count >= 100) color = '#000000';
      else if (count >= 10) color = '#9ca3af';

      return new L.DivIcon({
        html: `<div style="background: ${color}; color: white; width: 40px; height: 40px; border-radius: 50%; border: 2px solid white; text-align: center; line-height: 38px; font-size: 14px; font-weight: bold;">${count}</div>`,
        className: 'custom-cluster',
        iconSize: [40, 40]
      });
    }
  });
}

function loadGeoJSONWithFilter(filterFn) {
  if (markerCluster) map.removeLayer(markerCluster);
  markerCluster = createClusterGroup();

  fetch(geojsonFile)
    .then(res => res.json())
    .then(data => {
      geojsonFeatures = data.features;
      const filtered = filterFn ? data.features.filter(filterFn) : data.features;

      const layer = L.geoJSON({ type: "FeatureCollection", features: filtered }, {
        pointToLayer: (feature, latlng) => L.marker(latlng),
        onEachFeature: bindPopupToLayer
      });

      markerCluster.addLayer(layer);
      map.addLayer(markerCluster);
    });
}

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

function showProfile(projektant) {
  const dane = projektanciGlobal.find(p => p.projektant === projektant);
  const handlowiec = projektanciAssigned[projektant] || "(nieprzypisany)";
  const notes = projektanciNotes[projektant] || "";
  const projekty = geojsonFeatures.filter(f => f.properties?.projektant === projektant);

  const container = document.getElementById("profileContent");
  container.innerHTML = `
    <span id="profileClose" onclick="hideProfile()">✖</span>
    <h2>${projektant}</h2>
    <p><b>Handlowiec:</b> ${handlowiec}</p>
    <p><b>Liczba projektów:</b> ${dane?.liczba_projektow || projekty.length}</p>
    <h3>Notatki</h3>
    <textarea onchange="projektanciNotes['${projektant}'] = this.value">${notes}</textarea>
    <h3>Projekty</h3>
    <ul>
      ${projekty.map(p => `<li><a class="projekt-link" href="https://www.google.com/maps/search/?api=1&query=${p.geometry?.coordinates[1]},${p.geometry?.coordinates[0]}" target="_blank">${p.properties?.popup || "Brak opisu"}</a> <span class="projekt-rok">(${p.properties?.rok})</span></li>`).join('')}
    </ul>
  `;
  document.getElementById("profilePanel").classList.add("show");
}

function hideProfile() {
  document.getElementById("profilePanel").classList.remove("show");
}

function bindPopupToLayer(feature, layer) {
  const coords = feature.geometry?.coordinates;
  const lat = coords ? coords[1] : null;
  const lon = coords ? coords[0] : null;

  const rok = feature.properties?.rok || 'brak roku';
  const proj = feature.properties?.projektant || 'brak projektanta';
  const inwestycja = feature.properties?.popup || 'Brak opisu';
  const adres = feature.properties?.adres || 'Brak adresu';
  const dzialka = feature.properties?.dzialka || 'Brak działki';
  const assigned = projektanciAssigned[proj] || "";

  const popup = `
    <b>${proj}</b><br/>
    Rok: ${rok}<br/>
    <b>Inwestycja:</b> ${inwestycja}<br/>
    <b>Adres:</b> ${adres}<br/>
    <b>Działka:</b> ${dzialka}<br/>
    <label>Przypisz handlowca:</label>
    <select onchange="assignHandlowiecFromPopup('${proj}', this.value)">
      <option value="">(brak)</option>
      ${handlowcy.map(h => `<option value="${h}" ${h === assigned ? 'selected' : ''}>${h}</option>`).join('')}
    </select>
    <br><a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" style="color:#3b82f6;">📍 Pokaż w Google Maps</a>
  `;

  layer.bindPopup(popup);
}

function assignHandlowiec(projektant, handlowiec) {
  if (handlowiec) projektanciAssigned[projektant] = handlowiec;
  else delete projektanciAssigned[projektant];
  renderProjektanciList(projektanciGlobal);
  updateProfileHandlowiec(projektant);
  saveAssignmentsToGitHub();
}

function assignHandlowiecFromPopup(projektant, handlowiec) {
  assignHandlowiec(projektant, handlowiec);
}

function renderProjektanciList(list) {
  const container = document.getElementById("sidebarContent");
  container.innerHTML = "";
  list.forEach(p => {
    const assigned = projektanciAssigned[p.projektant] || "";
    const div = document.createElement("div");
    div.className = "projektant-entry";
    div.innerHTML = `
      <label style="display: flex; align-items: center; gap: 0.5rem;">
        <input type="checkbox" value="${p.projektant}" />
        <span class="name" onclick="showProfile('${p.projektant}')">${p.projektant} – ${p.liczba_projektow} projektów</span>
      </label>
      <select onchange="assignHandlowiec('${p.projektant}', this.value)">
        <option value="">(brak)</option>
        ${handlowcy.map(h => `<option ${h === assigned ? 'selected' : ''}>${h}</option>`).join('')}
      </select>
    `;
    container.appendChild(div);
  });
}

function updateProfileHandlowiec(name) {
  const profile = document.getElementById("profileContent");
  if (!profile || !profile.innerHTML.includes(name)) return;
  const handlowiec = projektanciAssigned[name] || "(nieprzypisany)";
  profile.querySelector("p").innerHTML = `<b>Handlowiec:</b> ${handlowiec}`;
}

async function loadAssignmentsFromGitHub() {
  try {
    const res = await fetch(RAW_MAIN_URL);
    projektanciAssigned = await res.json();
  } catch (err) {
    console.error("Nie udało się pobrać handlowców:", err);
    projektanciAssigned = {};
  }
}

async function saveAssignmentsToGitHub() {
  try {
    const json = JSON.stringify(projektanciAssigned, null, 2);
    const bodyText = "```\n" + json + "\n```";

    await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: "Aktualizacja przypisań handlowców – " + new Date().toISOString(),
        body: bodyText
      })
    });
  } catch (err) {
    console.error("Błąd zapisu przypisań przez issue:", err);
  }
}

(async () => {
  await loadAssignmentsFromGitHub();
  loadGeoJSONWithFilter(null);
})();
