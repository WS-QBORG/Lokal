// app.js
const handlowcy = ["Maciej Mierzwa", "Damian Grycel", "Krzysztof Joachimiak", "Marek Suwalski"];

let map = L.map('map').setView([53.4285, 14.5528], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

let geojsonFile = 'dzialki.geojson';
let markerCluster;
let projektanciGlobal = [];
let projektanciAssigned = {};
let projektanciNotes = {};
let geojsonFeatures = [];

function loadGeoJSONWithFilter(filterFn) {
  if (markerCluster) map.removeLayer(markerCluster);

  markerCluster = L.markerClusterGroup({
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      let color = '#3b82f6'; // granatowy
      if (count >= 100) color = '#000000'; // czarny
      else if (count >= 10) color = '#9ca3af'; // szary

      return new L.DivIcon({
        html: <div style="
          background: ${color};
          color: white;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 2px solid white;
          text-align: center;
          line-height: 38px;
          font-size: 14px;
          font-weight: bold;
        ">${count}</div>,
        className: 'custom-cluster',
        iconSize: [40, 40]
      });
    }
  });

  fetch(geojsonFile)
    .then(res => res.json())
    .then(data => {
      geojsonFeatures = data.features;
      const filtered = filterFn ? data.features.filter(filterFn) : data.features;

      const layer = L.geoJSON({ type: "FeatureCollection", features: filtered }, {
        onEachFeature: (feature, layer) => {
          const coords = feature.geometry?.coordinates;
          const lat = coords ? coords[1] : null;
          const lon = coords ? coords[0] : null;

          const rok = feature.properties?.rok || 'brak roku';
          const proj = feature.properties?.projektant || 'brak projektanta';
          const inwestycja = feature.properties?.popup || 'Brak opisu';
          const adres = feature.properties?.adres || 'Brak adresu';
          const dzialka = feature.properties?.dzialka || 'Brak działki';
          const assigned = projektanciAssigned[proj] || "";

          let popup = 
            <b>${proj}</b><br/>
            Rok: ${rok}<br/>
            <b>Inwestycja:</b> ${inwestycja}<br/>
            <b>Adres:</b> ${adres}<br/>
            <b>Działka:</b> ${dzialka}<br/>
            <label>Przypisz handlowca:</label>
            <select onchange="assignHandlowiecFromPopup('${proj}', this.value)">
              <option value="">(brak)</option>
              ${handlowcy.map(h => <option value="${h}" ${h === assigned ? 'selected' : ''}>${h}</option>).join('')}
            </select>
            <br><a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" style="color:#3b82f6;">📍 Pokaż w Google Maps</a>
          ;

          layer.bindPopup(popup);
        }
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

function renderProjektanciList(list) {
  const container = document.getElementById("sidebarContent");
  container.innerHTML = "";
  list.forEach(p => {
    const assigned = projektanciAssigned[p.projektant] || "";
    const div = document.createElement("div");
    div.className = "projektant-entry";
    div.innerHTML = 
      <label style="display: flex; align-items: center; gap: 0.5rem;">
        <input type="checkbox" value="${p.projektant}" />
        <span class="name" onclick="showProfile('${p.projektant}')">${p.projektant} – ${p.liczba_projektow} projektów</span>
      </label>
      <select onchange="assignHandlowiec('${p.projektant}', this.value)">
        <option value="">(brak)</option>
        ${handlowcy.map(h => <option ${h === assigned ? 'selected' : ''}>${h}</option>).join('')}
      </select>
    ;
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

      const rok = feature.properties?.rok || 'brak roku';
      const proj = feature.properties?.projektant || 'brak projektanta';
      const inwestycja = feature.properties?.popup || 'Brak opisu';
      const adres = feature.properties?.adres || 'Brak adresu';
      const dzialka = feature.properties?.dzialka || 'Brak działki';
      const assigned = projektanciAssigned[proj] || "";

      let popup = 
        <b>${proj}</b><br/>
        Rok: ${rok}<br/>
        <b>Inwestycja:</b> ${inwestycja}<br/>
        <b>Adres:</b> ${adres}<br/>
        <b>Działka:</b> ${dzialka}<br/>
        <label>Przypisz handlowca:</label>
        <select onchange="assignHandlowiecFromPopup('${proj}', this.value)">
          <option value="">(brak)</option>
          ${handlowcy.map(h => <option value="${h}" ${h === assigned ? 'selected' : ''}>${h}</option>).join('')}
        </select>
        <br><a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" style="color:#3b82f6;">📍 Pokaż w Google Maps</a>
      ;

      layer.bindPopup(popup);
    }
  });

  markerCluster.addLayer(layer);
  map.addLayer(markerCluster);
  hideSidebar();
}

function applySortFilter() {
  const value = document.getElementById("sortFilterSelect").value;
  let list = [...projektanciGlobal];

  switch (value) {
    case "az":
      list.sort((a, b) => a.projektant.localeCompare(b.projektant));
      break;
    case "za":
      list.sort((a, b) => b.projektant.localeCompare(a.projektant));
      break;
    case "has-handlowiec":
      list = list.filter(p => projektanciAssigned[p.projektant]);
      break;
    case "no-handlowiec":
      list = list.filter(p => !projektanciAssigned[p.projektant]);
      break;
    case "proj-asc":
      list.sort((a, b) => a.liczba_projektow - b.liczba_projektow);
      break;
    case "proj-desc":
      list.sort((a, b) => b.liczba_projektow - a.liczba_projektow);
      break;
  }

  renderProjektanciList(list);
}

function assignHandlowiec(projektant, handlowiec) {
  if (handlowiec) projektanciAssigned[projektant] = handlowiec;
  else delete projektanciAssigned[projektant];
}

function assignHandlowiecFromPopup(projektant, handlowiec) {
  assignHandlowiec(projektant, handlowiec);
  renderProjektanciList(projektanciGlobal);
}

function showProfile(name) {
  const profile = document.getElementById("profilePanel");
  const content = document.getElementById("profileContent");
  const notes = projektanciNotes[name] || "";
  const handlowiec = projektanciAssigned[name] || "(nieprzypisany)";

  const projekty = geojsonFeatures
    .filter(f => f.properties?.projektant === name)
    .map(f => {
      const desc = f.properties?.popup?.replace(//g, "") || "Brak opisu";
      const rok = f.properties?.rok || "?";
      return <li>${desc} (${rok})</li>;
    }).join("");

  content.innerHTML = 
    <h3>${name}</h3>
    <p><b>Handlowiec:</b> ${handlowiec}</p>
    <label>📝 Notatki:</label>
    <textarea onchange="projektanciNotes['${name}'] = this.value">${notes}</textarea>
    <hr>
    <b>📋 Projekty:</b><ul>${projekty || "<li>Brak projektów</li>"}</ul>
  ;

  profile.classList.add("show");
}

function hideSidebar() {
  document.getElementById("sidebar").classList.remove("show");
}

function hideProfile() {
  document.getElementById("profilePanel").classList.remove("show");
}

loadGeoJSONWithFilter(null);
