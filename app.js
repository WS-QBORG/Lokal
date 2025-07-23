// =========== Firebase Init ===========

let projektanciAssigned = {};
let projektanciGlobal = [];
let projektanciNotes = {};
let geojsonFeatures = [];
let markerCluster;


// ===== Renderowanie projektantów =============
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

// =========== Firebase Init dla rysowania kwadratów  ===========

const db = window.firebaseDB;
const ref = window.firebaseRef;
const onValue = window.firebaseOnValue;
const set = window.firebaseSet;

const handlowcy = ["Maciej Mierzwa", "Damian Grycel", "Krzysztof Joachimiak", "Marek Suwalski", "Tomasz Fierek", "Piotr Murawski", "Weronika Stępień"];

document.addEventListener("DOMContentLoaded", () => {
 /* const db = window.firebaseDB;
  const ref = window.firebaseRef;
  const onValue = window.firebaseOnValue;
  const set = window.firebaseSet;*/

  let activeRectangle = null;
  let originalLatLng = null;

  let baseCorners = null;       // 🌐 oryginalne narożniki (przed obrotem)
  let baseLatLng = null;        // 🌐 oryginalny środek

// Zmienne statusów / akcji
const statusy = ["Neutralny", "W kontakcie", "Wizyta zaplanowana", "Wizyta odbyta", "Stracony"];
const statusAssigned = {};

// Odczytywanie statusów / akcji
const statusRef = ref(db, 'statusy');
onValue(statusRef, snapshot => {
  Object.assign(statusAssigned, snapshot.val() || {});
  console.log("📥 Statusy:", statusAssigned);
});

// Zapisywanie statusów / akcji
window.saveStatus = function (projektant, status) {
  statusAssigned[projektant] = status;
  set(ref(db, `statusy/${projektant}`), status)
    .then(() => console.log('✅ Status zapisany:', projektant, status))
    .catch(console.error);
};



  // 🔁 Tryb dodawania punktu
let addPointMode = false;

window.startAddPointMode = function () {
  addPointMode = true;
  document.getElementById("addPointPanel").style.display = "block";

  // uzupełnij select handlowców
  const select = document.getElementById("inputHandlowiec");
  select.innerHTML = handlowcy.map(h => `<option value="${h}">${h}</option>`).join('');
};

// ❌ Anuluj
window.cancelAddPoint = function () {
  addPointMode = false;
  document.getElementById("addPointPanel").style.display = "none";
};

// ✅ Zatwierdź i dodaj marker
window.confirmAddPoint = function () {
  const handlowiec = document.getElementById("inputHandlowiec").value;
  const projektant = document.getElementById("inputProjektant").value.trim();
  const adres = document.getElementById("inputAdres").value.trim();
  const klient = document.getElementById("inputKlient").value.trim();

  if (!projektant || !adres || !klient) {
    alert("Uzupełnij wszystkie pola.");
    return;
  }

  alert("Kliknij na mapie, aby wskazać lokalizację.");

  map.once("click", function (e) {
    const latlng = e.latlng;

    // Dodaj marker
    const marker = L.marker(latlng).addTo(map);
    marker.bindPopup(`
      <b>${projektant}</b><br/>
      Adres: ${adres}<br/>
      Klient: ${klient}<br/>
      Handlowiec: ${handlowiec}
    `);

    // Zapisz jako nowy punkt w geojsonFeatures
    const newFeature = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [latlng.lng, latlng.lat]
      },
      properties: {
        projektant,
        adres,
        klient,
        handlowiec,
        rok: new Date().getFullYear(),
        popup: `Dodany punkt – ${adres}`,
        dzialka: "Brak"
      }
    };

    geojsonFeatures.push(newFeature);
    saveGeoJSONToFirebase(); // ⬇️ zapisz do Firebase

    cancelAddPoint();
    alert("✅ Punkt dodany!");
  });
};

function saveGeoJSONToFirebase() {
  const featureCollection = {
    type: "FeatureCollection",
    features: geojsonFeatures
  };

  const newRef = push(ref(db, 'punkty'));
  set(newRef, featureCollection)
    .then(() => console.log("✅ GeoJSON zapisany"))
    .catch(console.error);
}


// 🔁 Funkcja ładująca dane GeoJSON z Firebase przy starcie
function loadGeoJSONFromFirebase() {
  // Nasłuchuj zmian pod ścieżką 'punkty' w Firebase
  onValue(ref(db, 'punkty'), (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    // Zamień dane z Firebase na tablicę punktów
    geojsonFeatures = Object.values(data);

    // Renderuj tylko widoczne działki na mapie
    renderVisibleDzialki();
  }); // <- ✅ zamknięcie onValue
}     // <- ✅ zamknięcie funkcji



document.getElementById("rotateSlider").addEventListener("input", function () {
  if (!activeRectangle || !baseCorners || !baseLatLng) {
    console.warn("Brak danych do obrotu");
    return;
  }

  const angle = parseFloat(this.value) * Math.PI / 180;

  const rotated = baseCorners.map(([lat, lng]) => {
    const dy = lat - baseLatLng.lat;
    const dx = lng - baseLatLng.lng;

    const newLat = baseLatLng.lat + dy * Math.cos(angle) - dx * Math.sin(angle);
    const newLng = baseLatLng.lng + dy * Math.sin(angle) + dx * Math.cos(angle);
    return [newLat, newLng];
  });

  console.log("🔁 Nowe punkty po obrocie:", rotated);

  // 🔄 PRZEORYSUJ NA MAPIE
  drawnItems.clearLayers();
  activeRectangle = L.polygon([rotated], {
    color: "#3b82f6",
    weight: 1.2,
    fillOpacity: 0.1
  });
  drawnItems.addLayer(activeRectangle);

  saveShapesToFirebase(); // 💾 Zapis do Firebase

});


  

  const assignmentsRef = ref(db, 'assignments');
  onValue(assignmentsRef, snapshot => {
    projektanciAssigned = snapshot.val() || {};
    console.log('📥 Firebase assignments:', projektanciAssigned);
    renderProjektanciList(projektanciGlobal);


  });

// Dodanie ładowania
  function showLoading() {
    document.getElementById("loadingOverlay").style.display = "flex";
  }
  function hideLoading() {
    document.getElementById("loadingOverlay").style.display = "none";
  }


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
      spiderfyOnMaxZoom: false,   // nie rozrzucaj punktów
      showCoverageOnHover: false, // nie pokazuj zasięgu klastra
      zoomToBoundsOnClick: true,  // nadal pozwól kliknąć
      disableClusteringAtZoom: 18, // Naprawa nachodzących cyfr na punkty
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

  map.on('moveend', () => {
  renderVisibleDzialki();
});


  function loadGeoJSON() {
  showLoading();

  fetch('dzialki.geojson')
    .then(res => res.json())
    .then(data => {
      geojsonFeatures = data.features;
      renderVisibleDzialki(); // pierwszy raz
      hideLoading();
    })
    .catch(err => {
      console.error("❌ Błąd ładowania GeoJSON:", err);
      hideLoading();
    });
}
function renderVisibleDzialki() {
  const bounds = map.getBounds();

  if (markerCluster) map.removeLayer(markerCluster);
  markerCluster = createClusterGroup();

  const visible = geojsonFeatures.filter(f => {
    if (!f.geometry || f.geometry.type !== "Point") return false;
    const [lng, lat] = f.geometry.coordinates;
    return bounds.contains([lat, lng]);
  });

  visible.forEach(f => {
    const [lng, lat] = f.geometry.coordinates;
    const latlng = L.latLng(lat, lng);

    const marker = L.marker(latlng);
    marker.on("click", () => {
      drawnItems.clearLayers(); // usuwamy poprzedni obrys

      const rect = createDefaultRectangle(latlng);
      drawnItems.addLayer(rect);
    });

    bindPopupToLayer(f, marker);
    markerCluster.addLayer(marker);
  });

  map.addLayer(markerCluster);
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

    const status = statusAssigned[proj] || "Neutralny";

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
  </select><br/>

  <label>Status:</label>
  <select onchange="saveStatus('${proj}', this.value)">
    ${statusy.map(s => `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`).join('')}
  </select><br/>

  <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" style="color:#3b82f6;">📍 Pokaż w Google Maps</a>
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


  window.hideProfile = () => document.getElementById("profilePanel").classList.remove("show");
  window.hideSidebar = () => document.getElementById("sidebar").classList.remove("show");

window.toggleStatusDropdown = function () {
  const dropdown = document.getElementById("statusDropdown");
  const icon = document.getElementById("statusIcon");
  if (!dropdown || !icon) return;

  if (dropdown.style.display === "none" || dropdown.style.display === "") {
    renderStatusDropdown();
    dropdown.style.display = "block";
    icon.textContent = "⯅"; // ▲
  } else {
    dropdown.style.display = "none";
    icon.textContent = "⯆"; // ▼
  }
};


function renderStatusDropdown() {
  const container = document.getElementById("statusDropdown");
  container.innerHTML = "";

  const grouped = {};
  geojsonFeatures.forEach(f => {
    const name = f.properties?.projektant?.trim();
    if (!name) return;

    const status = statusAssigned[name] || "Neutralny";
    if (!grouped[status]) grouped[status] = [];
    grouped[status].push(f);
  });

  statusy.forEach(status => {
    const count = (grouped[status] || []).length;

    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.justifyContent = "space-between";
    div.style.alignItems = "center";
    div.style.marginBottom = "0.3rem";
    div.style.color = "white";

    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "0.5rem";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = status;
    checkbox.onchange = applyStatusFilter;

    const text = document.createElement("span");
    text.textContent = status;

    label.appendChild(checkbox);
    label.appendChild(text);

    const countSpan = document.createElement("span");
    countSpan.style.color = "#9ca3af";
    countSpan.style.fontSize = "13px";
    countSpan.textContent = count;

    div.appendChild(label);
    div.appendChild(countSpan);
    container.appendChild(div);
  });
}

function applyStatusFilter() {
  const checkboxes = document.querySelectorAll('#statusDropdown input[type="checkbox"]:checked');
  const selectedStatusy = Array.from(checkboxes).map(cb => cb.value);

  if (markerCluster) map.removeLayer(markerCluster);
  markerCluster = createClusterGroup();

  const filtered = geojsonFeatures.filter(f => {
    const name = f.properties?.projektant?.trim();
    const status = statusAssigned[name] || "Neutralny";
    return selectedStatusy.includes(status);
  });

  const layer = L.geoJSON({ type: "FeatureCollection", features: filtered }, {
    pointToLayer: (feature, latlng) => L.marker(latlng),
    onEachFeature: bindPopupToLayer
  });

  markerCluster.addLayer(layer);
  map.addLayer(markerCluster);
}

document.addEventListener("click", function (e) {
  const dropdown = document.getElementById("statusDropdown");
  const wrapper = document.getElementById("statusDropdownWrapper");
  const icon = document.getElementById("statusIcon");

  if (dropdown && wrapper && !wrapper.contains(e.target)) {
    dropdown.style.display = "none";
    if (icon) icon.textContent = "⯆"; // ▼ po zamknięciu
  }
});

// Handlowcy
window.toggleHandlowcyDropdown = function () {
  const dropdown = document.getElementById("handlowcyDropdown");
  const icon = document.getElementById("handlowcyIcon");
  if (!dropdown || !icon) return;

  if (dropdown.style.display === "none" || dropdown.style.display === "") {
    renderHandlowcyDropdown();
    dropdown.style.display = "block";
    icon.textContent = "⯅";
  } else {
    dropdown.style.display = "none";
    icon.textContent = "⯆";
  }
};

function renderHandlowcyDropdown() {
  const container = document.getElementById("handlowcyDropdown");
  container.innerHTML = "";

  // Grupowanie projektów i projektantów
  const assignedProjects = {};
  const assignedProjektanci = {};

  geojsonFeatures.forEach(f => {
    const proj = f.properties?.projektant?.trim();
    const hand = projektanciAssigned[proj];
    if (!hand) return;

    // Licz projekty
    if (!assignedProjects[hand]) assignedProjects[hand] = 0;
    assignedProjects[hand]++;

    // Zlicz unikalnych projektantów
    assignedProjektanci[hand] = assignedProjektanci[hand] || new Set();
    assignedProjektanci[hand].add(proj);
  });

  handlowcy.forEach(h => {
    const projCount = assignedProjects[h] || 0;
    const designerCount = (assignedProjektanci[h]?.size) || 0;

    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.justifyContent = "space-between";
    div.style.alignItems = "center";
    div.style.marginBottom = "0.3rem";
    div.style.color = "white";

    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "0.5rem";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = h;
    checkbox.onchange = applyHandlowcyDropdownFilter;

    const span = document.createElement("span");
    span.textContent = h;
    span.className = "handlowiec-name";
    span.style.cursor = "pointer";
    span.onclick = () => showHandlowiecProfile(h);

    label.appendChild(checkbox);
    label.appendChild(span);

    const count = document.createElement("span");
    count.style.color = "#9ca3af";
    count.style.fontSize = "13px";
    count.innerHTML = `${designerCount} proj. / ${projCount} pkt`;

    div.appendChild(label);
    div.appendChild(count);
    container.appendChild(div);
  });
}

function applyHandlowcyDropdownFilter() {
  const checkboxes = document.querySelectorAll('#handlowcyDropdown input[type="checkbox"]:checked');
  const selected = Array.from(checkboxes).map(cb => cb.value);

  if (markerCluster) map.removeLayer(markerCluster);
  markerCluster = createClusterGroup();

  const filtered = geojsonFeatures.filter(f => {
    const proj = f.properties?.projektant;
    const hand = projektanciAssigned[proj];
    return selected.includes(hand);
  });

  const layer = L.geoJSON({ type: "FeatureCollection", features: filtered }, {
    pointToLayer: (feature, latlng) => L.marker(latlng),
    onEachFeature: bindPopupToLayer
  });

  markerCluster.addLayer(layer);
  map.addLayer(markerCluster);
}

window.showHandlowiecProfile = function (name) {
  const profile = document.getElementById("profilePanel");
  const content = document.getElementById("profileContent");

  // Znajdź projektantów przypisanych do tego handlowca
  const projektanci = Object.keys(projektanciAssigned).filter(proj => projektanciAssigned[proj] === name);
  const projekty = geojsonFeatures.filter(f => projektanci.includes(f.properties?.projektant));
  const liczbaProjektow = projekty.length;

  content.innerHTML = `
    <span id="profileClose" onclick="hideProfile()" style="cursor:pointer;position:absolute;top:10px;right:10px;color:#ef4444;font-size:22px;font-weight:bold;">✖</span>
    <h3>${name}</h3>
    <p><b>Liczba projektantów:</b> ${projektanci.length}</p>
    <p><b>Liczba projektów:</b> ${liczbaProjektow}</p>
    <ul style="margin-top:1rem;padding-left:1rem;">
      ${projektanci.map(p => `<li style="color:white;">${p}</li>`).join("")}
    </ul>
  `;
  profile.classList.add("show");
};


document.addEventListener("click", function (e) {
  const dropdown = document.getElementById("handlowcyDropdown");
  const wrapper = document.getElementById("handlowcyDropdownWrapper");
  const icon = document.getElementById("handlowcyIcon");

  if (dropdown && wrapper && !wrapper.contains(e.target)) {
    dropdown.style.display = "none";
    if (icon) icon.textContent = "⯆";
  }
});




// Funkcja obrotu
function rotateBounds(center, size, angle) {
  const lat = center.lat;
  const lng = center.lng;
  const half = size / 2;

  const corners = [
    [-half, -half],
    [-half, +half],
    [+half, +half],
    [+half, -half]
  ];

  return corners.map(([dy, dx]) => {
    const newLat = lat + dy * Math.cos(angle) - dx * Math.sin(angle);
    const newLng = lng + dy * Math.sin(angle) + dx * Math.cos(angle);
    return [newLat, newLng];
  });
}

// === Funkcja pomocnicza: tworzenie poly wokół punktu ===
function createDefaultRectangle(latlng, size = 0.0003) {
  originalLatLng = latlng;
  baseLatLng = latlng;
  document.getElementById("rotateSlider").value = 0;
  document.getElementById("rotateControl").style.display = "block";

  const corners = rotateBounds(latlng, size, 0); // 🔄 startowy obrys (bez obrotu)
  baseCorners = corners; // 💾 zapamiętaj punkty bazowe

  const polygon = L.polygon([corners], {
    color: "#3b82f6",
    weight: 1.2,
    fillOpacity: 0.1
  });

  activeRectangle = polygon;
  return polygon;
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

// === Zapisz wszystkie kształty z drawnItems do Firebase ===
function saveShapesToFirebase() {
  // Konwertujemy grupę warstw (poligony, prostokąty itd.) na format GeoJSON
  const geojson = drawnItems.toGeoJSON();

  // Zapisujemy dane do Firebase pod ścieżką 'obrysy'
  set(ref(db, 'obrysy'), geojson)
    .then(() => console.log('✅ Obrysy zapisane do Firebase'))
    .catch(console.error);
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


/* 🔥 Jednorazowe usunięcie geojson
function deleteGeojsonFromFirebase() {
  window.firebaseRemove(ref(db, 'geojson'))
    .then(() => console.log("🗑️ geojson usunięty z Firebase"))
    .catch(console.error);
}

deleteGeojsonFromFirebase(); // ← URUCHOMI się po odświeżeniu strony */
// =========== STATUS PANEL FIX ===========


  // Start
  loadGeoJSON();
  loadGeoJSONFromFirebase(); // zamiast local file



});



