// =========== Firebase Init ===========

let projektanciAssigned = {};
let projektanciGlobal = [];
let projektanciNotes = {};
let geojsonFeatures = [];
let markerCluster;

// =========== Firebase Init dla rysowania kwadratów  ===========

const db = window.firebaseDB;
const ref = window.firebaseRef;
const onValue = window.firebaseOnValue;
const set = window.firebaseSet;

const handlowcy = ["Maciej Mierzwa", "Damian Grycel", "Krzysztof Joachimiak", "Marek Suwalski"];

document.addEventListener("DOMContentLoaded", () => {
  const db = window.firebaseDB;
  const ref = window.firebaseRef;
  const onValue = window.firebaseOnValue;
  const set = window.firebaseSet;

  const assignmentsRef = ref(db, 'assignments');
  onValue(assignmentsRef, snapshot => {
    projektanciAssigned = snapshot.val() || {};
    console.log('📥 Firebase assignments:', projektanciAssigned);
    renderProjektanciList(projektanciGlobal);
  });

  window.saveAssignment = function (projektant, handlowiec) {
    set(ref(db, `assignments/${projektant}`), handlowiec)
      .then(() => console.log('✅ Zapisano:', projektant, handlowiec))
      .catch(console.error);
  };

    // === Notatki Firebase ===
  const notesRef = ref(db, 'notes');
  onValue(notesRef, snapshot => {
    projektanciNotes = snapshot.val() || {};
    console.log('📥 Firebase notatki:', projektanciNotes);
    renderProjektanciList(projektanciGlobal); // odśwież listę z notatkami
  });

  window.saveNote = function (projektant, note) {
    set(ref(db, `notes/${projektant}`), note)
      .then(() => console.log('✅ Notatka zapisana:', projektant, note))
      .catch(console.error);
  };


  // =========== Mapa ===========

  const map = L.map('map').setView([53.4285, 14.5528], 8);
  window.map = map;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  function createClusterGroup() {
    return L.markerClusterGroup({
      iconCreateFunction: function (cluster) {
        const count = cluster.getChildCount();
        let color = '#3b82f6';
        if (count >= 100) color = '#000000';
        else if (count >= 10) color = '#9ca3af';
        return new L.DivIcon({
          html: `<div style="background:${color};color:white;width:40px;height:40px;
                     border-radius:50%;border:2px solid white;text-align:center;
                     line-height:38px;font-size:14px;font-weight:bold;">${count}</div>`,
          className: 'custom-cluster',
          iconSize: [40, 40]
        });
      }
    });
  }

  function loadGeoJSONWithFilter(filterFn) {
  if (markerCluster) map.removeLayer(markerCluster);
  markerCluster = createClusterGroup();

  fetch('dzialki.geojson')
    .then(res => res.json())
    .then(data => {
      geojsonFeatures = data.features.slice(0, 50); // ⬅️ tylko 50 punktów
      const filtered = filterFn ? geojsonFeatures.filter(filterFn) : geojsonFeatures;

      L.geoJSON(filtered, {
        pointToLayer: function (feature, latlng) {
          const marker = L.marker(latlng);
          markerCluster.addLayer(marker);

          // dodaj domyślny prostokąt dla każdego punktu
          const rect = createDefaultRectangle(latlng);
          rect.addTo(drawnItems);

          return marker;
        },
        onEachFeature: bindPopupToLayer
      }).addTo(map);

      // ładowanie obrysów dopiero po loadGeoJSONWithFilter() i loadShapesFromFirebase()
      loadGeoJSONWithFiltUncaught SyntaxError: expected expression, got keyword 'const'app.js:124:26er(null);
      loadShapesFromFirebase();
      map.addLayer(drawnItems); // ← dopiero teraz

    });
}





  window.filterMap = function (rok) {
    loadGeoJSONWithFilter(rok === 'all' ? null : f => f.properties.rok == rok);
  };

  function bindPopupToLayer(feature, layer) {
    const coords = feature.geometry?.coordinates;
    const lat = coords ? coords[1] : null;
    const lon = coords ? coords[0] : null;
    const proj = feature.properties?.projektant || 'brak';
    const rok = feature.properties?.rok || 'brak';
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
      <select onchange="assignHandlowiec('${proj}', this.value)">
        <option value="">(brak)</option>
        ${handlowcy.map(h => `<option value="${h}" ${h === assigned ? 'selected' : ''}>${h}</option>`).join('')}
      </select>
      <br><a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" style="color:#3b82f6;">📍 Pokaż w Google Maps</a>
    `;
    layer.bindPopup(popup);
  }

  // =========== Sidebar & Profil ===========
  window.showProjektanci = function () {
  const sidebar = document.getElementById("sidebar");
  if (sidebar.classList.contains("show")) {
    sidebar.classList.remove("show");
  } else {
    fetch('projektanci.json')
      .then(res => res.json())
      .then(data => {
        projektanciGlobal = data;
        renderProjektanciList(projektanciGlobal);
        sidebar.classList.add("show");
      });
  }
};


   window.applyProjektantFilter = function () {
    const checkboxes = document.querySelectorAll('#sidebar input[type="checkbox"]:checked');
    const selectedNames = Array.from(checkboxes).map(cb => cb.value.trim());

    if (markerCluster) map.removeLayer(markerCluster);
    markerCluster = createClusterGroup();

    const filtered = geojsonFeatures.filter(f => selectedNames.includes(f.properties?.projektant?.trim()));

    const layer = L.geoJSON({ type: "FeatureCollection", features: filtered }, {
      pointToLayer: (feature, latlng) => L.marker(latlng),
      onEachFeature: bindPopupToLayer
    });

    markerCluster.addLayer(layer);
    map.addLayer(markerCluster);
    hideSidebar();
  };


  window.renderProjektanciList = function (list) {
  const container = document.getElementById("sidebarContent");
  container.innerHTML = "";

  const searchValue = document.getElementById("searchInput")?.value?.toLowerCase() || "";

  list
    .filter(p => p.projektant.toLowerCase().includes(searchValue))
    .forEach(p => {
      const assigned = projektanciAssigned[p.projektant] || "";
      const div = document.createElement("div");
      div.className = "projektant-entry";
      div.innerHTML = `
  <label style="display:flex;align-items:center;gap:0.5rem;">
    <input type="checkbox" value="${p.projektant}" />
    <span class="name" onclick="showProfile('${p.projektant}')">
      ${p.projektant} – ${p.liczba_projektow} projektów
    </span>
  </label>
  <select onchange="assignHandlowiec('${p.projektant}', this.value)">
    <option value="">(brak)</option>
    ${handlowcy.map(h => `<option ${h === assigned ? 'selected' : ''}>${h}</option>`).join('')}
  </select>
`;



      container.appendChild(div);
    });
};


  window.assignHandlowiec = function (projektant, handlowiec) {
    if (handlowiec) projektanciAssigned[projektant] = handlowiec;
    else delete projektanciAssigned[projektant];
    renderProjektanciList(projektanciGlobal);
    updateProfileHandlowiec(projektant);
    saveAssignment(projektant, handlowiec);
  };

  function updateProfileHandlowiec(name) {
    const profile = document.getElementById("profileContent");
    if (!profile.innerHTML.includes(name)) return;
    const hand = projektanciAssigned[name] || "(nieprzypisany)";
    profile.querySelector("p").innerHTML = `<b>Handlowiec:</b> ${hand}`;
  }

  window.showProfile = function (name) {
    const profile = document.getElementById("profilePanel");
    const content = document.getElementById("profileContent");
    const notes = projektanciNotes[name] || "";
    const handlowiec = projektanciAssigned[name] || "(nieprzypisany)";
    const projekty = geojsonFeatures.filter(f => f.properties?.projektant === name);
    const liczba = projekty.length;

    content.innerHTML = `
      <span id="profileClose" onclick="hideProfile()" style="cursor:pointer;position:absolute;top:10px;right:10px;color:#ef4444;font-size:22px;font-weight:bold;">✖</span>
      <h3>${name}</h3>
      <p><b>Handlowiec:</b> ${handlowiec}</p>
      <p><b>Liczba projektów:</b> ${liczba}</p>
      <label>📝 Notatki:</label>
      <textarea onchange="projektanciNotes['${name}'] = this.value; saveNote('${name}', this.value)">${notes}</textarea>

    `;
    profile.classList.add("show");
  };

  window.applySortFilter = function () {
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
  };

    window.filterProjektanciList = function () {
    renderProjektanciList(projektanciGlobal);
  };

// =========== Sidebar & Profil HANDLOWCY ===========

  window.showHandlowcy = function () {
  const panel = document.getElementById("handlowcyPanel");
  if (panel.classList.contains("show")) {
    panel.classList.remove("show");
  } else {
    renderHandlowcyList(handlowcy);
    panel.classList.add("show");
  }
};


  window.hideHandlowcy = function () {
    document.getElementById("handlowcyPanel").classList.remove("show");
  };

  window.renderHandlowcyList = function (list) {
  const container = document.getElementById("handlowcyContent");
  const search = document.getElementById("handlowcySearchInput").value.toLowerCase();
  container.innerHTML = "";

  list
    .filter(h => h.toLowerCase().includes(search))
    .forEach(h => {
      const count = Object.values(projektanciAssigned).filter(x => x === h).length;
      const div = document.createElement("div");
      div.className = "handlowiec-entry";
      div.innerHTML = `
        <input type="checkbox" value="${h}" />
        <span class="name">${h}</span>
        <span style="color:#9ca3af;">${count} przypisań</span>
      `;
      container.appendChild(div);
    });
};


  window.applyHandlowcySort = function () {
    const value = document.getElementById("handlowcySortSelect").value;
    let list = [...handlowcy];

    if (value === "az") list.sort();
    else if (value === "za") list.sort().reverse();
    else if (value === "most") list.sort((a, b) =>
      Object.values(projektanciAssigned).filter(x => x === b).length -
      Object.values(projektanciAssigned).filter(x => x === a).length
    );
    else if (value === "least") list.sort((a, b) =>
      Object.values(projektanciAssigned).filter(x => x === a).length -
      Object.values(projektanciAssigned).filter(x => x === b).length
    );

    renderHandlowcyList(list);
  };

  window.filterHandlowcyList = function () {
    renderHandlowcyList(handlowcy);
  };

 window.applyHandlowcyFilter = function () {
  const checkboxes = document.querySelectorAll('#handlowcyContent input[type="checkbox"]:checked');
  const selectedHandlowcy = Array.from(checkboxes).map(cb => cb.value.trim());

  if (markerCluster) map.removeLayer(markerCluster);
  markerCluster = createClusterGroup();

  const filtered = geojsonFeatures.filter(f => selectedHandlowcy.includes(projektanciAssigned[f.properties?.projektant]));

  const layer = L.geoJSON({ type: "FeatureCollection", features: filtered }, {
    pointToLayer: (feature, latlng) => L.marker(latlng),
    onEachFeature: bindPopupToLayer
  });

  markerCluster.addLayer(layer);
  map.addLayer(markerCluster);
  hideHandlowcy();
};


  window.hideProfile = () => document.getElementById("profilePanel").classList.remove("show");
  window.hideSidebar = () => document.getElementById("sidebar").classList.remove("show");

// === Funkcja pomocnicza: tworzenie prostokąta wokół punktu ===
function createDefaultRectangle(latlng, size = 0.001) {
  const lat = latlng.lat;
  const lng = latlng.lng;
  return L.rectangle([
    [lat - size / 2, lng - size / 2],
    [lat + size / 2, lng + size / 2]
  ], {
    color: "#3b82f6",
    weight: 2,
    fillOpacity: 0.2,
    editable: true
  });
}

// === Dodaj rysowanie/edycję obrysów ===
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
  draw: {
    polygon: true,
    rectangle: true,
    circle: false,
    polyline: false,
    marker: false,
    circlemarker: false
  },
  edit: {
    featureGroup: drawnItems
  }
});
map.addControl(drawControl);

// === Po edycji lub dodaniu: zapisuj do Firebase ===
map.on(L.Draw.Event.CREATED, function (e) {
  const layer = e.layer;
  drawnItems.addLayer(layer);
  saveShapesToFirebase();
});

map.on(L.Draw.Event.EDITED, function () {
  saveShapesToFirebase();
});

map.on(L.Draw.Event.DELETED, function () {
  saveShapesToFirebase();
});

// === Zapisz kształty jako GeoJSON do Firebase ===
function saveShapesToFirebase() {
  const geojson = drawnItems.toGeoJSON();
  set(ref(db, 'obrysy'), geojson);
}

// === Wczytaj kształty z Firebase przy starcie ===
function loadShapesFromFirebase() {
  onValue(ref(db, 'obrysy'), (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    drawnItems.clearLayers();
    const geojsonLayer = L.geoJSON(data);
    geojsonLayer.eachLayer(layer => drawnItems.addLayer(layer));
  });
}
loadShapesFromFirebase();


  // Start
  loadGeoJSONWithFilter(null);
});
