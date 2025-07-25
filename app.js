// =========== Firebase Init ===========
let projektanciAssigned = {};
let projektanciGlobal = [];
let projektanciNotes = {};
let geojsonFeatures = [];
let markerCluster;


// Dodaj po istniejących zmiennych globalnych
let activeFilters = {
  projektanci: [],
  handlowcy: [],
  statusy: [],
  lata: []
};


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
const handlowcy = ["Maciej Mierzwa", "Damian Grycel", "Krzysztof Joachimiak", "Marek Suwalski", "Tomasz Fierek", "Piotr Murawski", "Weronika Stępień"];

document.addEventListener("DOMContentLoaded", () => {
  const db = window.firebaseDB;
  const ref = window.firebaseRef;
  const onValue = window.firebaseOnValue;
  const set = window.firebaseSet;
  let activeRectangle = null;
  let originalLatLng = null;
  let baseCorners = null;       // 🌐 oryginalne narożniki (przed obrotem)
  let baseLatLng = null;        // 🌐 oryginalny środek

  // Zmienne statusów / akcji
  const statusy = ["Wizyta zaplanowana", "W kontakcie", "Podejmuje decyzję", "Wygrany", "Stracony"];
  const statusAssigned = {};

  // Ikonki statusów
  const statusIcons = {
    "Stracony": "icons/stracony.svg",
    "Podejmuje decyzję": "icons/mysli.svg",
    "Wizyta zaplanowana": "icons/umowiony.svg",
    "W kontakcie": "icons/rozmawia.svg",
    "Wygrany": "icons/wygrany.svg",
    "Neutralny": null  // standardowa pinezka
  };

  // Odczytywanie statusów / akcji
  const statusRef = firebaseRef(firebaseDB, 'statusy');
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
      
      // Renderuj tylko widoczne działki na mapie (wydajność!)
      renderVisibleDzialki();
    });
  }

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

  // 🔧 Funkcja tworząca klaster z lepszą konfiguracją
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

  // 🔧 NAPRAWIONY: Funkcja ładująca lokalny plik GeoJSON
  function loadGeoJSON() {
    showLoading();
    fetch('dzialki.geojson')
      .then(res => res.json())
      .then(data => {
        geojsonFeatures = data.features;
        // Renderuj widoczne działki po załadowaniu
        renderVisibleDzialki();
        hideLoading();
      })
      .catch(err => {
        console.error("❌ Błąd ładowania GeoJSON:", err);
        hideLoading();
      });
  }

  // 🔧 NAPRAWKA: Ulepszona funkcja jitter z lepszą logiką
  function deterministicJitter(text, maxDelta = 0.0003) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    const sin = Math.sin(hash);
    const cos = Math.cos(hash);
    return {
      lat: (sin * maxDelta) % maxDelta,
      lng: (cos * maxDelta) % maxDelta
    };
  }

  // 🔁 Funkcja renderująca tylko widoczne działki (WYDAJNOŚĆ!)
  function renderVisibleDzialki() {
    const bounds = map.getBounds();
    
    // Usuń poprzedni klaster
    if (markerCluster) {
      map.removeLayer(markerCluster);
    }
    
    // Stwórz nowy klaster
    markerCluster = createClusterGroup();
    
    // Filtruj tylko widoczne punkty w obecnym widoku mapy
    const visible = geojsonFeatures.filter(f => {
      return (
        f.geometry &&
        f.geometry.type === "Point" &&
        Array.isArray(f.geometry.coordinates) &&
        bounds.contains([f.geometry.coordinates[1], f.geometry.coordinates[0]])
      );
    });
    
    console.log(`🔍 Widoczne punkty: ${visible.length} z ${geojsonFeatures.length} całkowitych`);
    
    // 🔧 GRUPOWANIE DUPLIKATÓW: Zamiast jitter, grupuj duplikaty
    const groupedPoints = {};
    visible.forEach(f => {
      const [lng, lat] = f.geometry.coordinates;
      const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      
      if (!groupedPoints[key]) {
        groupedPoints[key] = {
          lat,
          lng,
          features: []
        };
      }
      groupedPoints[key].features.push(f);
    });
    
    // Stwórz markery dla zgrupowanych punktów
    const markers = [];
    Object.values(groupedPoints).forEach(group => {
      const { lat, lng, features } = group;
      const latlng = L.latLng(lat, lng);
      
      if (features.length === 1) {
        // Pojedynczy punkt - standardowy marker
        const f = features[0];
        const status = statusAssigned[f.properties?.projektant?.trim()] || "Neutralny";
        const iconUrl = statusIcons[status];
        
        const marker = iconUrl
          ? L.marker(latlng, {
              icon: L.icon({
                iconUrl,
                iconSize: [32, 32],
                iconAnchor: [16, 32],
                popupAnchor: [0, -32]
              })
            })
          : L.marker(latlng);
        
        bindPopupToLayer(f, marker);
        markers.push(marker);
      } else {
        // Duplikaty - marker z numerem
        const marker = L.marker(latlng, {
          icon: L.divIcon({
            html: `<div style="background:#ef4444;color:white;width:28px;height:28px;border-radius:50%;border:2px solid white;text-align:center;line-height:24px;font-size:12px;font-weight:bold;">${features.length}</div>`,
            className: 'grouped-marker',
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -28]
          })
        });
        
        // Popup dla zgrupowanych punktów
        bindGroupPopupToLayer(features, marker);
        markers.push(marker);
      }
    });
    
    // Dodaj wszystkie markery do klastra na raz (wydajność)
    markers.forEach(m => markerCluster.addLayer(m));
    map.addLayer(markerCluster);
  }

  // 🔧 Nowa funkcja do popupów dla zgrupowanych punktów
  function bindGroupPopupToLayer(features, layer) {
    const firstFeature = features[0];
    const coords = firstFeature.geometry?.coordinates;
    const lat = coords ? coords[1] : null;
    const lon = coords ? coords[0] : null;
    
    let popup = `<div style="max-height:200px;overflow-y:auto;">`;
    popup += `<b>🏠 ${features.length} punktów w tej lokalizacji:</b><br/><br/>`;
    
    features.forEach((f, index) => {
      const proj = f.properties?.projektant || 'brak';
      const rok = f.properties?.rok || 'brak';
      const inwestycja = f.properties?.popup || 'Brak opisu';
      const adres = f.properties?.adres || 'Brak adresu';
      const assigned = projektanciAssigned[proj] || "";
      const status = statusAssigned[proj] || "Neutralny";
      
      popup += `
        <div style="border-bottom:1px solid #eee;padding:0.5rem 0;${index === features.length - 1 ? 'border-bottom:none;' : ''}">
          <b>${proj}</b> (${rok})<br/>
          <small>${inwestycja}</small><br/>
          <small><b>Adres:</b> ${adres}</small><br/>
          <label>Handlowiec:</label>
          <select onchange="assignHandlowiec('${proj}', this.value)" style="width:100%;margin:2px 0;">
            <option value="">(brak)</option>
            ${handlowcy.map(h => `<option value="${h}" ${h === assigned ? 'selected' : ''}>${h}</option>`).join('')}
          </select>
          <label>Status:</label>
          <select onchange="saveStatus('${proj}', this.value)" style="width:100%;margin:2px 0;">
            ${statusy.map(s => `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      `;
    });
    
    popup += `</div>`;
    popup += `<br/><a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" style="color:#3b82f6;">📍 Pokaż w Google Maps</a>`;
    
    layer.bindPopup(popup);
  }

  // 🔧 NAPRAWKA: Nowa funkcja do odświeżania markerów (tylko aktualizuje ikony, nie przebudowuje)
  function refreshAllMarkers() {
    if (!markerCluster) return;
    
    markerCluster.eachLayer(marker => {
      if (marker.feature && marker.feature.properties) {
        const proj = marker.feature.properties.projektant?.trim();
        const status = statusAssigned[proj] || "Neutralny";
        const iconUrl = statusIcons[status];
        
        if (iconUrl) {
          marker.setIcon(L.icon({
            iconUrl,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
          }));
        } else {
          marker.setIcon(new L.Icon.Default());
        }
      }
    });
  }

  // 🔧 Funkcja do tworzenia wszystkich markerów (dla filtorów)
  function createAllMarkers() {
    renderVisibleDzialki();
  }

  // ========== ROK DROPDOWN SYSTEM (podobny do handlowców/statusów) ==========
  
  window.toggleRokDropdown = function () {
    const dropdown = document.getElementById("rokDropdown");
    const icon = document.getElementById("rokIcon");
    if (!dropdown || !icon) return;
    
    if (dropdown.style.display === "none" || dropdown.style.display === "") {
      renderRokDropdown();
      dropdown.style.display = "block";
      icon.textContent = "⯅";
    } else {
      dropdown.style.display = "none";
      icon.textContent = "⯆";
    }
  };

  function renderRokDropdown() {
    const container = document.getElementById("rokDropdown");
    container.innerHTML = "";
    
    // Zbierz wszystkie dostępne lata z danych
    const availableYears = [...new Set(
      geojsonFeatures
        .map(f => f.properties?.rok)
        .filter(rok => rok != null)
    )].sort((a, b) => b - a); // sortuj od najnowszych
    
    // Grupowanie projektów według lat
    const yearGroups = {};
    geojsonFeatures.forEach(f => {
      const rok = f.properties?.rok;
      if (!rok) return;
      
      if (!yearGroups[rok]) yearGroups[rok] = 0;
      yearGroups[rok]++;
    });
    
    // Dodaj opcję "Wszystkie"
    const allDiv = document.createElement("div");
    allDiv.style.display = "flex";
    allDiv.style.justifyContent = "space-between";
    allDiv.style.alignItems = "center";
    allDiv.style.marginBottom = "0.3rem";
    allDiv.style.color = "white";
    
    const allLabel = document.createElement("label");
    allLabel.style.display = "flex";
    allLabel.style.alignItems = "center";
    allLabel.style.gap = "0.5rem";
    
    const allCheckbox = document.createElement("input");
    allCheckbox.type = "checkbox";
    allCheckbox.value = "all";
    allCheckbox.onchange = applyRokFilter;
    
    const allSpan = document.createElement("span");
    allSpan.textContent = "Wszystkie lata";
    allSpan.style.fontWeight = "bold";
    
    allLabel.appendChild(allCheckbox);
    allLabel.appendChild(allSpan);
    
    const allCount = document.createElement("span");
    allCount.style.color = "#9ca3af";
    allCount.style.fontSize = "13px";
    allCount.textContent = geojsonFeatures.length;
    
    allDiv.appendChild(allLabel);
    allDiv.appendChild(allCount);
    container.appendChild(allDiv);
    
    // Dodaj separator
    const separator = document.createElement("div");
    separator.style.height = "1px";
    separator.style.backgroundColor = "#374151";
    separator.style.margin = "0.5rem 0";
    container.appendChild(separator);
    
    // Dodaj poszczególne lata
    availableYears.forEach(rok => {
      const count = yearGroups[rok] || 0;
      
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
      checkbox.value = rok;
      checkbox.onchange = applyRokFilter;
      
      const span = document.createElement("span");
      span.textContent = rok;
      
      label.appendChild(checkbox);
      label.appendChild(span);
      
      const countSpan = document.createElement("span");
      countSpan.style.color = "#9ca3af";
      countSpan.style.fontSize = "13px";
      countSpan.textContent = count;
      
      div.appendChild(label);
      div.appendChild(countSpan);
      container.appendChild(div);
    });
  }

  function applyRokFilter() {
  const checkboxes = document.querySelectorAll('#rokDropdown input[type="checkbox"]:checked');
  const selectedRoki = Array.from(checkboxes).map(cb => cb.value);
  
  // Jeśli zaznaczono "Wszystkie", wyczyść filtry lat
  if (selectedRoki.includes("all")) {
    document.querySelectorAll('#rokDropdown input[type="checkbox"]:not([value="all"])').forEach(cb => {
      cb.checked = false;
    });
    activeFilters.lata = [];
  } else {
    activeFilters.lata = selectedRoki.filter(rok => rok !== "all");
  }
  
  updateClearFiltersButton();
  applyAllFilters();
}

    
    // Jeśli nic nie zaznaczono, pokaż wszystko
    if (selectedRoki.length === 0) {
      renderVisibleDzialki();
      return;
    }
    
    // Filtruj według wybranych lat
    if (markerCluster) map.removeLayer(markerCluster);
    markerCluster = createClusterGroup();
    
    const filtered = geojsonFeatures.filter(f => {
      const rok = f.properties?.rok;
      return selectedRoki.includes(String(rok));
    });
    
    // Tymczasowo zastąp dane do renderowania
    const originalFeatures = [...geojsonFeatures];
    geojsonFeatures = filtered;
    renderVisibleDzialki();
    geojsonFeatures = originalFeatures; // przywróć oryginalne dane


  // Na końcu event listenera DOMContentLoaded
updateClearFiltersButton();

  
  }

  // Event listener do zamykania dropdown lat po kliknięciu poza nim
  document.addEventListener("click", function (e) {
    const dropdown = document.getElementById("rokDropdown");
    const wrapper = document.getElementById("rokDropdownWrapper");
    const icon = document.getElementById("rokIcon");
    if (dropdown && wrapper && !wrapper.contains(e.target)) {
      dropdown.style.display = "none";
      if (icon) icon.textContent = "⯆";
    }
  });

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
  activeFilters.projektanci = Array.from(checkboxes).map(cb => cb.value.trim());
  updateClearFiltersButton();
  applyAllFilters();
  hideSidebar();
};


function applyAllFilters() {
  if (markerCluster) map.removeLayer(markerCluster);
  markerCluster = createClusterGroup();
  
  let filtered = [...geojsonFeatures];
  
  // Filtr projektantów
  if (activeFilters.projektanci.length > 0) {
    filtered = filtered.filter(f => 
      activeFilters.projektanci.includes(f.properties?.projektant?.trim())
    );
  }
  
  // Filtr handlowców
  if (activeFilters.handlowcy.length > 0) {
    filtered = filtered.filter(f => {
      const proj = f.properties?.projektant?.trim();
      const hand = projektanciAssigned[proj];
      return activeFilters.handlowcy.includes(hand);
    });
  }
  
  // Filtr statusów
  if (activeFilters.statusy.length > 0) {
    filtered = filtered.filter(f => {
      const name = f.properties?.projektant?.trim();
      const status = statusAssigned[name] || "Neutralny";
      return activeFilters.statusy.includes(status);
    });
  }
  
  // Filtr lat
  if (activeFilters.lata.length > 0) {
    filtered = filtered.filter(f => {
      const rok = f.properties?.rok;
      return activeFilters.lata.includes(String(rok));
    });
  }
  
  // Renderuj przefiltrowane dane
  const bounds = map.getBounds();
  const visible = filtered.filter(f => {
    return (
      f.geometry &&
      f.geometry.type === "Point" &&
      Array.isArray(f.geometry.coordinates) &&
      bounds.contains([f.geometry.coordinates[1], f.geometry.coordinates[0]])
    );
  });
  
  // Użyj istniejącej logiki grupowania z renderVisibleDzialki
  const groupedPoints = {};
  visible.forEach(f => {
    const [lng, lat] = f.geometry.coordinates;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    
    if (!groupedPoints[key]) {
      groupedPoints[key] = { lat, lng, features: [] };
    }
    groupedPoints[key].features.push(f);
  });
  
  const markers = [];
  Object.values(groupedPoints).forEach(group => {
    const { lat, lng, features } = group;
    const latlng = L.latLng(lat, lng);
    
    if (features.length === 1) {
      const f = features[0];
      const status = statusAssigned[f.properties?.projektant?.trim()] || "Neutralny";
      const iconUrl = statusIcons[status];
      
      const marker = iconUrl
        ? L.marker(latlng, {
            icon: L.icon({
              iconUrl,
              iconSize: [32, 32],
              iconAnchor: [16, 32],
              popupAnchor: [0, -32]
            })
          })
        : L.marker(latlng);
      
      bindPopupToLayer(f, marker);
      markers.push(marker);
    } else {
      const marker = L.marker(latlng, {
        icon: L.divIcon({
          html: `<div style="background:#ef4444;color:white;width:28px;height:28px;border-radius:50%;border:2px solid white;text-align:center;line-height:24px;font-size:12px;font-weight:bold;">${features.length}</div>`,
          className: 'grouped-marker',
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          popupAnchor: [0, -28]
        })
      });
      
      bindGroupPopupToLayer(features, marker);
      markers.push(marker);
    }
  });
  
  markers.forEach(m => markerCluster.addLayer(m));
  map.addLayer(markerCluster);
}


function updateClearFiltersButton() {
  const hasActiveFilters = 
    activeFilters.projektanci.length > 0 ||
    activeFilters.handlowcy.length > 0 ||
    activeFilters.statusy.length > 0 ||
    activeFilters.lata.length > 0;
  
  let clearButton = document.getElementById("clearFiltersButton");
  
  if (hasActiveFilters && !clearButton) {
    // Stwórz przycisk jeśli nie istnieje
    clearButton = document.createElement("button");
    clearButton.id = "clearFiltersButton";
    clearButton.innerHTML = "🗑️ Wyczyść filtry";
    clearButton.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 1000;
      background: #ef4444;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      cursor: pointer;
      font-weight: bold;
    `;
    clearButton.onclick = clearAllFilters;
    document.body.appendChild(clearButton);
  } else if (!hasActiveFilters && clearButton) {
    // Usuń przycisk jeśli nie ma aktywnych filtrów
    clearButton.remove();
  }
}

function clearAllFilters() {
  // Wyczyść wszystkie filtry
  activeFilters = {
    projektanci: [],
    handlowcy: [],
    statusy: [],
    lata: []
  };
  
  // Odznacz wszystkie checkboxy
  document.querySelectorAll('#sidebar input[type="checkbox"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('#statusDropdown input[type="checkbox"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('#handlowcyDropdown input[type="checkbox"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('#rokDropdown input[type="checkbox"]').forEach(cb => cb.checked = false);
  
  // Pokaż wszystkie punkty
  renderVisibleDzialki();
  
  // Usuń przycisk
  updateClearFiltersButton();
}



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

  // =========== Sidebar & Profil HANDLOWCY ===========
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

applyStatusFilter

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
  activeFilters.handlowcy = Array.from(checkboxes).map(cb => cb.value);
  updateClearFiltersButton();
  applyAllFilters();
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

  // 🔄 Nasłuchuj ruch mapy i aktualizuj widoczne punkty
  map.on('moveend', () => {
    renderVisibleDzialki();
  });

  // Start
  loadGeoJSON();
  loadGeoJSONFromFirebase(); // zamiast local file
});
