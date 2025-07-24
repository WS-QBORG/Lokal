// =========== FUNKCJE POMOCNICZE =====
// Dodaj na górze pliku, przed użyciem w loadGeoJSON()
function showLoading() {
  document.getElementById("loadingOverlay").style.display = "flex";
}
function hideLoading() {
  document.getElementById("loadingOverlay").style.display = "none";
}
function debounce(func, wait) {
  let timeout;
  return function() {
    const context = this, args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(context, args);
    }, wait);
  };
}

// ===== MAPA I INICJALIZACJA =====
// Zdefiniuj mapę tutaj, przed użyciem jej w innych funkcjach
const map = L.map('map').setView([53.4285, 14.5528], 8);
window.map = map;
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

// Teraz możesz używać mapy w funkcji debounce
map.on('moveend', debounce(renderVisibleDzialki, 500)); // Zwiększyłem opóźnienie do 500ms

function createClusterGroup() {
  return L.markerClusterGroup({
    spiderfyOnMaxZoom: false,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    disableClusteringAtZoom: 18, // Wyższy zoom dla lepszej grupowania
    maxClusterRadius: 80, // Większy promień grupowania
    iconCreateFunction: function(cluster) {
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

// ===== OPTYMALIZOWANA FUNKCJA RENDERU =====
function renderVisibleDzialki() {
  const bounds = map.getBounds();
  const zoom = map.getZoom();
  
  // Jeśli zoom jest zbyt mały, nie renderuj punktów dla oszczędności
  if (zoom < 10) {
    if (markerCluster) {
      map.removeLayer(markerCluster);
      markerCluster = null;
    }
    return;
  }
  
  if (markerCluster) {
    map.removeLayer(markerCluster);
    markerCluster = null;
  }
  
  markerCluster = createClusterGroup();
  
  const visible = geojsonFeatures.filter(f => {
    return (
      f.geometry &&
      f.geometry.type === "Point" &&
      Array.isArray(f.geometry.coordinates) &&
      bounds.contains([f.geometry.coordinates[1], f.geometry.coordinates[0]])
    );
  });
  
  // Dodaj tylko unikalne punkty do klastra
  const addedCoords = new Set();
  
  visible.forEach(f => {
    let [lng, lat] = f.geometry.coordinates;
    const status = statusAssigned[f.properties?.projektant?.trim()] || "Neutralny";
    const iconUrl = statusIcons[status];
    
    const marker = iconUrl
      ? L.marker(L.latLng(lat, lng), {
          icon: L.icon({
            iconUrl,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
          })
        })
      : L.marker(L.latLng(lat, lng));
    
    bindPopupToLayer(f, marker);
    markerCluster.addLayer(marker);
  });
  
  map.addLayer(markerCluster);
}

// ===== OPTYMALIZOWANE FILTROWANIE =====
function applyStatusFilter() {
  const checkboxes = document.querySelectorAll('#statusDropdown input[type="checkbox"]:checked');
  const selectedStatusy = Array.from(checkboxes).map(cb => cb.value);
  
  // Zamiast tworzyć nową warstwę, modyfikuj istniejące markery
  if (markerCluster) {
    markerCluster.eachLayer(function(layer) {
      const feature = layer.feature;
      if (feature) {
        const name = feature.properties?.projektant?.trim();
        const status = statusAssigned[name] || "Neutralny";
        const isVisible = selectedStatusy.includes(status);
        layer.setStyle({ opacity: isVisible ? 1 : 0 });
      }
    });
  }
}

function applyHandlowcyDropdownFilter() {
  const checkboxes = document.querySelectorAll('#handlowcyDropdown input[type="checkbox"]:checked');
  const selected = Array.from(checkboxes).map(cb => cb.value);
  
  // Zamiast tworzyć nową warstwę, modyfikuj istniejące markery
  if (markerCluster) {
    markerCluster.eachLayer(function(layer) {
      const feature = layer.feature;
      if (feature) {
        const proj = feature.properties?.projektant;
        const hand = projektanciAssigned[proj];
        const isVisible = selected.includes(hand);
        layer.setStyle({ opacity: isVisible ? 1 : 0 });
      }
    });
  }
}

// ===== INNE OPTYMALIZACJE =====

// W funkcji loadGeoJSONFromFirebase - dodaj opóźnienie
function loadGeoJSONFromFirebase() {
  onValue(ref(db, 'punkty'), (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    geojsonFeatures = Object.values(data);
    // Dodaj większe opóźnienie dla płynniejszego renderowania
    setTimeout(renderVisibleDzialki, 300);
  });
}

// W funkcji loadGeoJSON - dodaj opóźnienie
function loadGeoJSON() {
  showLoading();
  fetch('dzialki.geojson')
    .then(res => res.json())
    .then(data => {
      geojsonFeatures = data.features;
      // Dodaj opóźnienie dla płynniejszego renderowania
      setTimeout(renderVisibleDzialki, 300);
      hideLoading();
    })
    .catch(err => {
      console.error("❌ Błąd ładowania GeoJSON:", err);
      hideLoading();
    });
}

// ===== POZOSTAŁE FUNKCJE (bez zmian) =====
// ... (tutaj wklej resztę swojego oryginalnego kodu, np. funkcje bindPopupToLayer, showProjektanci, applyProjektantFilter itd. bez zmian)
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
  document.body.classList.add("panel-open");
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
window.hideProfile = () => {
  document.getElementById("profilePanel").classList.remove("show");
  document.body.classList.remove("panel-open");
};
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
  
  if (markerCluster) {
    markerCluster.eachLayer(function(layer) {
      const feature = layer.feature;
      if (feature) {
        const name = feature.properties?.projektant?.trim();
        const status = statusAssigned[name] || "Neutralny";
        const isVisible = selectedStatusy.includes(status);
        layer.setStyle({ opacity: isVisible ? 1 : 0 });
      }
    });
  }
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
  
  if (markerCluster) {
    markerCluster.eachLayer(function(layer) {
      const feature = layer.feature;
      if (feature) {
        const proj = feature.properties?.projektant;
        const hand = projektanciAssigned[proj];
        const isVisible = selected.includes(hand);
        layer.setStyle({ opacity: isVisible ? 1 : 0 });
      }
    });
  }
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
  document.body.classList.add("panel-open");
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
};


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
    // Konwertuj obiekt na tablicę
    const features = Object.values(data);
    const geojsonLayer = L.geoJSON({ type: "FeatureCollection", features: features });
    geojsonLayer.eachLayer(layer => drawnItems.addLayer(layer));
  });
}
  
loadShapesFromFirebase();

/* 🔥 Jednorazowe usunięcie geojson
function deleteGeoJSONFromFirebase() {
  window.firebaseRemove(ref(db, 'geojson'))
    .then(() => console.log("🗑️ geojson usunięty z Firebase"))
    .catch(console.error);
}
deleteGeoJSONFromFirebase(); // ← URUCHOMI się po odświeżeniu strony */
// =========== STATUS PANEL FIX ===========
  // Start
  loadGeoJSON();
  loadGeoJSONFromFirebase(); // zamiast local file
});
