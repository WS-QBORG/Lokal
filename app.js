// =========== Firebase Init ===========
let projektanciAssigned = {};
let projektanciGlobal = [];
let projektanciNotes = {};
let geojsonFeatures = [];
let markerCluster;

// Klienci
let klienciGlobal = [];
let klienciNotes = {};

// Dodaj po istniejących zmiennych globalnych
let activeFilters = {
  projektanci: [],
  handlowcy: [],
  statusy: [],
  lata: [],
  inwestycje: []
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
  const push = window.firebasePush;
  let activeRectangle = null;
  let originalLatLng = null;
  let baseCorners = null;
  let baseLatLng = null;

  // Zmienne statusów / akcji
  const statusy = ["Wizyta zaplanowana", "W kontakcie", "Podejmuje decyzję", "Wygrany", "Stracony"];
  const statusAssigned = {};

  // Ikonki statusów
  const statusIcons = {
    "Stracony": "icons/przegrany.svg",
    "Podejmuje decyzję": "icons/decyzja.svg",
    "Wizyta zaplanowana": "icons/zaplanowana.svg",
    "W kontakcie": "icons/kontakt.svg",
    "Wygrany": "icons/wygrany.svg",
    "Neutralny": null
  };

  // Odczytywanie statusów / akcji
  if (db && ref && onValue) {
    const statusRef = ref(db, 'statusy');
    onValue(statusRef, snapshot => {
      Object.assign(statusAssigned, snapshot.val() || {});
      console.log("📥 Statusy:", statusAssigned);
    });
  }

  // Zapisywanie statusów / akcji
  window.saveStatus = function (projektant, status) {
    statusAssigned[projektant] = status;
    if (db && ref && set) {
      set(ref(db, `statusy/${projektant}`), status)
        .then(() => console.log('✅ Status zapisany:', projektant, status))
        .catch(console.error);
    }
  };

  // 🔁 Tryb dodawania punktu
  let addPointMode = false;
  window.startAddPointMode = function () {
    addPointMode = true;
    document.getElementById("addPointPanel").style.display = "block";
    const select = document.getElementById("inputHandlowiec");
    select.innerHTML = handlowcy.map(h => `<option value="${h}">${h}</option>`).join('');
  };

  // 👥 Tryb dodawania klienta
  let addClientMode = false;
  window.startAddClientMode = function (prefilledProject = '') {
    console.log("🔍 Otwieranie panelu dodawania klienta z projektem:", prefilledProject);
    
    // Najpierw załaduj projektantów jeśli nie ma
    if (projektanciGlobal.length === 0) {
      console.log("⚠️ Ładowanie projektantów przed otwarciem panelu klienta");
      fetch('projektanci.json')
        .then(res => res.json())
        .then(data => {
          projektanciGlobal = data;
          openClientPanel(prefilledProject);
        })
        .catch(err => {
          console.warn("⚠️ Nie można załadować projektanci.json:", err);
          // Używamy przykładowych danych
          projektanciGlobal = [
            { projektant: "Jan Kowalski", liczba_projektow: 5 },
            { projektant: "Anna Nowak", liczba_projektow: 3 },
            { projektant: "Piotr Wiśniewski", liczba_projektow: 7 }
          ];
          openClientPanel(prefilledProject);
        });
    } else {
      openClientPanel(prefilledProject);
    }
  };

  function openClientPanel(prefilledProject) {
    addClientMode = true;
    document.getElementById("addClientPanel").style.display = "block";
    
    // Wypełnij dropdown handlowców
    const handlowiecSelect = document.getElementById("inputClientHandlowiec");
    handlowiecSelect.innerHTML = '<option value="">(wybierz handlowca)</option>' + 
      handlowcy.map(h => `<option value="${h}">${h}</option>`).join('');
    
    // Wypełnij dropdown projektantów
    const projektantSelect = document.getElementById("inputClientProjektant");
    projektantSelect.innerHTML = '<option value="">(wybierz projektanta)</option>' + 
      projektanciGlobal.map(p => `<option value="${p.projektant}">${p.projektant}</option>`).join('');
    
    // Wypełnij dropdown projektów
    const projektSelect = document.getElementById("inputClientProjekt");
    const uniqueProjects = [...new Set(geojsonFeatures.map(f => f.properties?.popup).filter(Boolean))];
    projektSelect.innerHTML = '<option value="">(wybierz projekt)</option>' + 
      uniqueProjects.map(p => `<option value="${p}" ${p === prefilledProject ? 'selected' : ''}>${p}</option>`).join('');
    
    console.log("✅ Panel klienta otwarty z", projektanciGlobal.length, "projektantami");
  }

  window.cancelAddClient = function () {
    addClientMode = false;
    document.getElementById("addClientPanel").style.display = "none";
    document.getElementById("addClientForm").reset();
  };

  window.confirmAddClient = function () {
    console.log("🔍 Próba dodania klienta...");
    
    const imie = document.getElementById("inputClientImie").value.trim();
    const telefon = document.getElementById("inputClientTelefon").value.trim();
    const handlowiec = document.getElementById("inputClientHandlowiec").value;
    const projektant = document.getElementById("inputClientProjektant").value;
    const projekt = document.getElementById("inputClientProjekt").value;
    
    console.log("📝 Dane klienta:", { imie, telefon, handlowiec, projektant, projekt });
    
    if (!imie || !telefon || !handlowiec || !projektant || !projekt) {
      console.warn("⚠️ Niekompletne dane klienta");
      alert("Uzupełnij wszystkie pola.");
      return;
    }
    
    // Dodaj klienta do listy
    const newClient = {
      imie: imie,
      telefon: telefon,
      handlowiec: handlowiec,
      projektant: projektant,
      projekt: projekt,
      dataUtworzenia: new Date().toISOString()
    };
    
    console.log("➕ Dodawanie klienta:", newClient);
    
    klienciGlobal.push(newClient);
    saveClientToFirebase(newClient);
    cancelAddClient();
    alert(`✅ Klient ${imie} został dodany!`);
  };

  function saveClientToFirebase(client) {
    if (!db || !ref || !set || !push) {
      console.warn("Firebase nie jest dostępne");
      return;
    }
    
    const newRef = push(ref(db, 'klienci'));
    set(newRef, client)
      .then(() => console.log("✅ Klient zapisany do Firebase"))
      .catch(console.error);
  }

  function loadClientsFromFirebase() {
    if (!db || !ref || !onValue) {
      console.warn("Firebase nie jest dostępne");
      return;
    }
    
    onValue(ref(db, 'klienci'), (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      
      klienciGlobal = Object.values(data);
      console.log("📥 Klienci załadowani z Firebase:", klienciGlobal);
    });
  }

  window.cancelAddPoint = function () {
    addPointMode = false;
    document.getElementById("addPointPanel").style.display = "none";
  };

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
      
      const marker = L.marker(latlng).addTo(map);
 marker.bindPopup(`
  <div class="popup-wrapper">
    <h4 class="popup-title">${projektant}</h4>
    <p><b>Rok:</b> ${rok}</p>
    <p><b>Inwestycja:</b><br>${inwestycja}</p>
    <p><b>Adres:</b> ${adres || "Brak adresu"}</p>
    <p><b>Działka:</b> ${dzialka || "Brak działki"}</p>

    <div class="popup-select">
      <label for="statusSelect">Status:</label>
      <select onchange="updateStatus('${projektant}', this.value)">
        ${generateStatusOptions(projektant)}
      </select>
    </div>

    <div class="popup-actions">
      <button class="btn btn-success" onclick="assignHandlowiec('${projektant}')">+ Przypisz handlowca</button>
      <button class="btn btn-add-client" onclick="openAddClient('${projektant}')">➕ Dodaj klienta</button>
    </div>

    <a href="https://maps.google.com/?q=${adres}" target="_blank" class="popup-link">📍 Pokaż w Google Maps</a>
  </div>
`);

      
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
          popup: `<b>Inwestycja:</b> Dom jednorodzinny - ${adres}`,
          dzialka: "Brak"
        }
      };
      
      geojsonFeatures.push(newFeature);
      saveGeoJSONToFirebase();
      cancelAddPoint();
      alert("✅ Punkt dodany!");
    });
  };

  function saveGeoJSONToFirebase() {
    if (!db || !ref || !set || !push) {
      console.warn("Firebase nie jest dostępne");
      return;
    }
    
    const featureCollection = {
      type: "FeatureCollection",
      features: geojsonFeatures
    };
    const newRef = push(ref(db, 'punkty'));
    set(newRef, featureCollection)
      .then(() => console.log("✅ GeoJSON zapisany"))
      .catch(console.error);
  }

  function loadGeoJSONFromFirebase() {
    if (!db || !ref || !onValue) {
      console.warn("Firebase nie jest dostępne");
      return;
    }
    
    onValue(ref(db, 'punkty'), (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      
      geojsonFeatures = Object.values(data);
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
    
    drawnItems.clearLayers();
    activeRectangle = L.polygon([rotated], {
      color: "#3b82f6",
      weight: 1.2,
      fillOpacity: 0.1
    });
    drawnItems.addLayer(activeRectangle);
    saveShapesToFirebase();
  });

  if (db && ref && onValue) {
    const assignmentsRef = ref(db, 'assignments');
    onValue(assignmentsRef, snapshot => {
      projektanciAssigned = snapshot.val() || {};
      console.log('📥 Firebase assignments:', projektanciAssigned);
      renderProjektanciList(projektanciGlobal);
    });
  }

  function showLoading() {
    document.getElementById("loadingOverlay").style.display = "flex";
  }
  
  function hideLoading() {
    document.getElementById("loadingOverlay").style.display = "none";
  }

  window.saveAssignment = function (projektant, handlowiec) {
    if (db && ref && set) {
      set(ref(db, `assignments/${projektant}`), handlowiec)
        .then(() => console.log('✅ Zapisano:', projektant, handlowiec))
        .catch(console.error);
    }
  };

  if (db && ref && onValue) {
    const notesRef = ref(db, 'notes');
    onValue(notesRef, snapshot => {
      projektanciNotes = snapshot.val() || {};
      console.log('📥 Firebase notatki:', projektanciNotes);
      renderProjektanciList(projektanciGlobal);
    });
  }

  window.saveNote = function (projektant, note) {
    if (db && ref && set) {
      set(ref(db, `notes/${projektant}`), note)
        .then(() => console.log('✅ Notatka zapisana:', projektant, note))
        .catch(console.error);
    }
  };

  // =========== Mapa ===========
  const map = L.map('map').setView([53.4285, 14.5528], 8);
  window.map = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  function createClusterGroup() {
    return L.markerClusterGroup({
      spiderfyOnMaxZoom: false,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 18,
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

  function loadGeoJSON() {
    showLoading();
    
    // Przykładowe dane jeśli brak pliku dzialki.geojson
    const sampleData = {
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "geometry": {
            "type": "Point",
            "coordinates": [14.5528, 53.4285]
          },
          "properties": {
            "projektant": "Jan Kowalski",
            "rok": 2024,
            "popup": "<b>Inwestycja:</b> Dom jednorodzinny - ul. Przykładowa 1",
            "adres": "ul. Przykładowa 1, Szczecin",
            "dzialka": "123/45"
          }
        },
        {
          "type": "Feature", 
          "geometry": {
            "type": "Point",
            "coordinates": [14.5828, 53.4385]
          },
          "properties": {
            "projektant": "Anna Nowak",
            "rok": 2023,
            "popup": "<b>Inwestycja:</b> Dom wielorodzinny - ul. Testowa 2",
            "adres": "ul. Testowa 2, Szczecin",
            "dzialka": "456/78"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Point", 
            "coordinates": [14.5428, 53.4185]
          },
          "properties": {
            "projektant": "Piotr Wiśniewski",
            "rok": 2024,
            "popup": "<b>Inwestycja:</b> Budynek usługowy - ul. Biznesowa 3",
            "adres": "ul. Biznesowa 3, Szczecin", 
            "dzialka": "789/12"
          }
        }
      ]
    };
    
    fetch('dzialki.geojson')
      .then(res => res.json())
      .then(data => {
        geojsonFeatures = data.features;
        renderVisibleDzialki();
        hideLoading();
      })
      .catch(err => {
        console.warn("⚠️ Nie można załadować dzialki.geojson, używam przykładowych danych:", err);
        geojsonFeatures = sampleData.features;
        renderVisibleDzialki();
        hideLoading();
      });
  }

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

  function renderVisibleDzialki() {
    const bounds = map.getBounds();
    
    if (markerCluster) {
      map.removeLayer(markerCluster);
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
    
    console.log(`🔍 Widoczne punkty: ${visible.length} z ${geojsonFeatures.length} całkowitych`);
    
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

  function createAllMarkers() {
    renderVisibleDzialki();
  }

  // ========== FUNKCJE FILTROWANIA ==========
  
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

    // Filtr typów inwestycji - NAPRAWIONY
    if (activeFilters.inwestycje.length > 0) {
      filtered = filtered.filter(f => {
        const popup = f.properties?.popup;
        if (!popup) return false;
        
        const type = extractInvestmentType(popup);
        return type && activeFilters.inwestycje.includes(type);
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
    
    console.log(`🎯 Zastosowano filtry: ${filtered.length} z ${geojsonFeatures.length} punktów`);
  }

  // ========== FUNKCJA WYCIĄGANIA TYPU INWESTYCJI - POPRAWIONA ==========
  function extractInvestmentType(popup) {
    if (!popup || typeof popup !== 'string') {
      console.warn('Brak lub nieprawidłowy popup:', popup);
      return 'Inne';
    }
    
    // Normalizuj tekst do analizy
    const normalizedText = popup.toLowerCase();
    console.log('🔍 Analizuję popup dla typu inwestycji:', popup.substring(0, 100) + '...');
    
    // Sprawdź różne wzorce dla typu inwestycji
    let investmentText = '';
    
    // Wzorzec 1: HTML <b>Inwestycja:</b>
    let match = popup.match(/<b>Inwestycja:<\/b>\s*([^<]+)/i);
    if (match) {
      investmentText = match[1].trim();
    } 
    // Wzorzec 2: Bez HTML tagów "Inwestycja:"
    else {
      match = popup.match(/Inwestycja:\s*([^\n\r<]+)/i);
      if (match) {
        investmentText = match[1].trim();
      }
    }
    
    // Jeśli nie znaleziono wzorca "Inwestycja:", szukaj słów kluczowych w całym tekście
    if (!investmentText) {
      investmentText = normalizedText;
      console.log('⚠️ Nie znaleziono wzorca "Inwestycja:", używam całego tekstu');
    }
    
    const analysisText = investmentText.toLowerCase();
    console.log('📝 Tekst do analizy:', analysisText);
    
    // Klasyfikacja z lepszymi wzorcami
    if (analysisText.includes('jednorodzinny') || 
        analysisText.includes('dom jednorodzinny') ||
        analysisText.includes('budynek jednorodzinny') ||
        analysisText.includes('mieszkalny jednorodzinny')) {
      console.log('✅ Klasyfikowano jako: Dom jednorodzinny');
      return 'Dom jednorodzinny';
    }
    else if (analysisText.includes('wielorodzinny') || 
             analysisText.includes('dom wielorodzinny') ||
             analysisText.includes('budynek wielorodzinny') ||
             analysisText.includes('mieszkalny wielorodzinny') ||
             analysisText.includes('blok') ||
             analysisText.includes('apartament')) {
      console.log('✅ Klasyfikowano jako: Dom wielorodzinny');
      return 'Dom wielorodzinny';
    }
    else if (analysisText.includes('usługowy') || 
             analysisText.includes('budynek usługowy') ||
             analysisText.includes('obiekt usługowy') ||
             analysisText.includes('handel') ||
             analysisText.includes('biuro') ||
             analysisText.includes('sklep') ||
             analysisText.includes('restauracja') ||
             analysisText.includes('hotel')) {
      console.log('✅ Klasyfikowano jako: Budynek usługowy');
      return 'Budynek usługowy';
    }
    else if (analysisText.includes('kanalizacja') || 
             analysisText.includes('infrastruktura') ||
             analysisText.includes('droga') ||
             analysisText.includes('most') ||
             analysisText.includes('wodociąg') ||
             analysisText.includes('ściekowa') ||
             analysisText.includes('deszczowa')) {
      console.log('✅ Klasyfikowano jako: Infrastruktura');
      return 'Infrastruktura';
    }
    else if (analysisText.includes('instalacja') || 
             analysisText.includes('instalacje') ||
             analysisText.includes('elektryczna') ||
             analysisText.includes('grzewcza') ||
             analysisText.includes('wentylacja') ||
             analysisText.includes('klimatyzacja')) {
      console.log('✅ Klasyfikowano jako: Instalacje');
      return 'Instalacje';
    }
    else if (analysisText.includes('przemysłowy') ||
             analysisText.includes('przemysł') ||
             analysisText.includes('fabryka') ||
             analysisText.includes('zakład') ||
             analysisText.includes('hala') ||
             analysisText.includes('magazyn')) {
      console.log('✅ Klasyfikowano jako: Przemysł');
      return 'Przemysł';
    }
    else {
      console.log('⚠️ Klasyfikowano jako: Inne');
      return 'Inne';
    }
  }

  function updateClearFiltersButton() {
    const hasActiveFilters = 
      activeFilters.projektanci.length > 0 ||
      activeFilters.handlowcy.length > 0 ||
      activeFilters.statusy.length > 0 ||
      activeFilters.lata.length > 0 ||
      activeFilters.inwestycje.length > 0;

    let clearButton = document.getElementById("clearFiltersButton");
    
    if (hasActiveFilters && !clearButton) {
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
      clearButton.remove();
    }
  }

  function clearAllFilters() {
    activeFilters = {
      projektanci: [],
      handlowcy: [],
      statusy: [],
      lata: [],
      inwestycje: []
    };
    
    document.querySelectorAll('#sidebar input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('#statusDropdown input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('#handlowcyDropdown input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('#rokDropdown input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('#inwestycjeDropdown input[type="checkbox"]').forEach(cb => cb.checked = false);
    
    renderVisibleDzialki();
    updateClearFiltersButton();
  }

  // ========== ROK DROPDOWN SYSTEM ==========
  
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
    
    const availableYears = [...new Set(
      geojsonFeatures
        .map(f => f.properties?.rok)
        .filter(rok => rok != null)
    )].sort((a, b) => b - a);
    
    const yearGroups = {};
    geojsonFeatures.forEach(f => {
      const rok = f.properties?.rok;
      if (!rok) return;
      
      if (!yearGroups[rok]) yearGroups[rok] = 0;
      yearGroups[rok]++;
    });
    
    // Dodaj opcję "Wszystkie"
    const allDiv = document.createElement("div");
    allDiv.className = "filter-option";
    
    const allLabel = document.createElement("label");
    
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
    allCount.className = "filter-count";
    allCount.textContent = geojsonFeatures.length;
    
    allDiv.appendChild(allLabel);
    allDiv.appendChild(allCount);
    container.appendChild(allDiv);
    
    const separator = document.createElement("div");
    separator.style.height = "1px";
    separator.style.backgroundColor = "#374151";
    separator.style.margin = "0.5rem 0";
    container.appendChild(separator);
    
    availableYears.forEach(rok => {
      const count = yearGroups[rok] || 0;
      
      const div = document.createElement("div");
      div.className = "filter-option";
      
      const label = document.createElement("label");
      
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = rok;
      checkbox.onchange = applyRokFilter;
      
      const span = document.createElement("span");
      span.textContent = rok;
      
      label.appendChild(checkbox);
      label.appendChild(span);
      
      const countSpan = document.createElement("span");
      countSpan.className = "filter-count";
      countSpan.textContent = count;
      
      div.appendChild(label);
      div.appendChild(countSpan);
      container.appendChild(div);
    });
  }

  function applyRokFilter() {
    const checkboxes = document.querySelectorAll('#rokDropdown input[type="checkbox"]:checked');
    const selectedRoki = Array.from(checkboxes).map(cb => cb.value);
    
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

  // ========== INWESTYCJE DROPDOWN SYSTEM - NAPRAWIONY ==========

  window.toggleInwestycjeDropdown = function () {
    const dropdown = document.getElementById("inwestycjeDropdown");
    const icon = document.getElementById("inwestycjeIcon");
    if (!dropdown || !icon) return;
    
    if (dropdown.style.display === "none" || dropdown.style.display === "") {
      renderInwestycjeDropdown();
      dropdown.style.display = "block";
      icon.textContent = "⯅";
    } else {
      dropdown.style.display = "none";
      icon.textContent = "⯆";
    }
  };

  function renderInwestycjeDropdown() {
    const container = document.getElementById("inwestycjeDropdown");
    container.innerHTML = "";
    
    // Grupuj inwestycje według typu
    const investmentGroups = {};
    geojsonFeatures.forEach(f => {
      const popup = f.properties?.popup;
      if (!popup) return;
      
      const type = extractInvestmentType(popup);
      if (!type) return;
      
      if (!investmentGroups[type]) investmentGroups[type] = 0;
      investmentGroups[type]++;
    });
    
    console.log('🏠 Zgrupowane inwestycje:', investmentGroups);
    
    // Sortuj typy alfabetycznie
    const sortedTypes = Object.keys(investmentGroups).sort();
    
    if (sortedTypes.length === 0) {
      const noDataDiv = document.createElement("div");
      noDataDiv.style.color = "#9ca3af";
      noDataDiv.style.textAlign = "center";
      noDataDiv.style.padding = "1rem";
      noDataDiv.textContent = "Brak danych o inwestycjach";
      container.appendChild(noDataDiv);
      return;
    }
    
    sortedTypes.forEach(type => {
      const count = investmentGroups[type];
      
      const div = document.createElement("div");
      div.className = "filter-option";
      
      const label = document.createElement("label");
      
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = type;
      checkbox.onchange = applyInwestycjeFilter;
      
      const span = document.createElement("span");
      span.textContent = type;
      
      label.appendChild(checkbox);
      label.appendChild(span);
      
      const countSpan = document.createElement("span");
      countSpan.className = "filter-count";
      countSpan.textContent = count;
      
      div.appendChild(label);
      div.appendChild(countSpan);
      container.appendChild(div);
    });
  }

  function applyInwestycjeFilter() {
    const checkboxes = document.querySelectorAll('#inwestycjeDropdown input[type="checkbox"]:checked');
    activeFilters.inwestycje = Array.from(checkboxes).map(cb => cb.value);
    
    console.log('🎯 Wybrane filtry inwestycji:', activeFilters.inwestycje);
    
    updateClearFiltersButton();
    applyAllFilters();
  }

  // Event listener do zamykania dropdown
  document.addEventListener("click", function (e) {
    const dropdown = document.getElementById("inwestycjeDropdown");
    const wrapper = document.getElementById("inwestycjeDropdownWrapper");
    const icon = document.getElementById("inwestycjeIcon");
    if (dropdown && wrapper && !wrapper.contains(e.target)) {
      dropdown.style.display = "none";
      if (icon) icon.textContent = "⯆";
    }
  });

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
      <button type="button" onclick="event.stopPropagation(); startAddClientMode(${JSON.stringify(inwestycja)})" style="background:#10b981;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;margin:4px 0;">👥 Dodaj klienta</button><br/>
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
      // Załaduj przykładowych projektantów jeśli brak pliku
      const sampleProjectanci = [
        { projektant: "Jan Kowalski", liczba_projektow: 5 },
        { projektant: "Anna Nowak", liczba_projektow: 3 },
        { projektant: "Piotr Wiśniewski", liczba_projektow: 7 }
      ];
      
      fetch('projektanci.json')
        .then(res => res.json())
        .then(data => {
          projektanciGlobal = data;
          renderProjektanciList(projektanciGlobal);
          sidebar.classList.add("show");
        })
        .catch(err => {
          console.warn("⚠️ Nie można załadować projektanci.json, używam przykładowych danych:", err);
          projektanciGlobal = sampleProjectanci;
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
    
    // Generuj listę projektów
    let projektyHtml = '';
    if (projekty.length > 0) {
      projektyHtml = `
        <div style="margin-top:1rem;">
          <h4 style="color:white;margin-bottom:0.5rem;">📋 Projekty (${liczba}):</h4>
          <div style="max-height:200px;overflow-y:auto;background:#374151;border:1px solid #4b5563;border-radius:0.375rem;padding:0.5rem;">
      `;
      
      projekty.forEach((projekt, index) => {
        const rok = projekt.properties?.rok || 'brak';
        const adres = projekt.properties?.adres || 'Brak adresu';
        const dzialka = projekt.properties?.dzialka || 'Brak działki';
        const inwestycja = projekt.properties?.popup || 'Brak opisu';
        const coords = projekt.geometry?.coordinates;
        const lat = coords ? coords[1] : null;
        const lon = coords ? coords[0] : null;
        
        projektyHtml += `
          <div style="border-bottom:1px solid #4b5563;padding:0.5rem 0;${index === projekty.length - 1 ? 'border-bottom:none;' : ''}">
            <div style="font-weight:bold;color:#60a5fa;">${rok} - ${adres}</div>
            <div style="font-size:0.85em;color:#d1d5db;margin-top:0.25rem;">${inwestycja}</div>
            <div style="font-size:0.8em;color:#9ca3af;margin-top:0.25rem;">Działka: ${dzialka}</div>
            ${lat && lon ? `<a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" style="color:#3b82f6;font-size:0.8em;">📍 Pokaż na mapie</a>` : ''}
          </div>
        `;
      });
      
      projektyHtml += `
          </div>
        </div>
      `;
    }
    
    content.innerHTML = `
      <span id="profileClose" onclick="hideProfile()" style="cursor:pointer;position:absolute;top:10px;right:10px;color:#ef4444;font-size:22px;font-weight:bold;">✖</span>
      <h3>${name}</h3>
      <p><b>Handlowiec:</b> ${handlowiec}</p>
      <p><b>Liczba projektów:</b> ${liczba}</p>
      <label>📝 Notatki:</label>
      <textarea onchange="projektanciNotes['${name}'] = this.value; saveNote('${name}', this.value)" style="width:100%;height:100px;margin-top:0.5rem;padding:0.5rem;background:#374151;border:1px solid #4b5563;border-radius:0.375rem;color:white;resize:vertical;">${notes}</textarea>
      ${projektyHtml}
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
      icon.textContent = "⯅";
    } else {
      dropdown.style.display = "none";
      icon.textContent = "⯆";
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
      div.className = "filter-option";
      
      const label = document.createElement("label");
      
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = status;
      checkbox.onchange = applyStatusFilter;
      
      const text = document.createElement("span");
      text.textContent = status;
      
      label.appendChild(checkbox);
      label.appendChild(text);
      
      const countSpan = document.createElement("span");
      countSpan.className = "filter-count";
      countSpan.textContent = count;
      
      div.appendChild(label);
      div.appendChild(countSpan);
      container.appendChild(div);
    });
  }

  function applyStatusFilter() {
    const checkboxes = document.querySelectorAll('#statusDropdown input[type="checkbox"]:checked');
    activeFilters.statusy = Array.from(checkboxes).map(cb => cb.value);
    updateClearFiltersButton();
    applyAllFilters();
  }

  document.addEventListener("click", function (e) {
    const dropdown = document.getElementById("statusDropdown");
    const wrapper = document.getElementById("statusDropdownWrapper");
    const icon = document.getElementById("statusIcon");
    if (dropdown && wrapper && !wrapper.contains(e.target)) {
      dropdown.style.display = "none";
      if (icon) icon.textContent = "⯆";
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
    
    const assignedProjects = {};
    const assignedProjektanci = {};
    
    geojsonFeatures.forEach(f => {
      const proj = f.properties?.projektant?.trim();
      const hand = projektanciAssigned[proj];
      if (!hand) return;
      
      if (!assignedProjects[hand]) assignedProjects[hand] = 0;
      assignedProjects[hand]++;
      
      assignedProjektanci[hand] = assignedProjektanci[hand] || new Set();
      assignedProjektanci[hand].add(proj);
    });
    
    handlowcy.forEach(h => {
      const projCount = assignedProjects[h] || 0;
      const designerCount = (assignedProjektanci[h]?.size) || 0;
      
      const div = document.createElement("div");
      div.className = "filter-option";
      
      const label = document.createElement("label");
      
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
      count.className = "filter-count";
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

  function createDefaultRectangle(latlng, size = 0.0003) {
    originalLatLng = latlng;
    baseLatLng = latlng;
    document.getElementById("rotateSlider").value = 0;
    document.getElementById("rotateControl").style.display = "block";
    
    const corners = rotateBounds(latlng, size, 0);
    baseCorners = corners;
    
    const polygon = L.polygon([corners], {
      color: "#3b82f6",
      weight: 1.2,
      fillOpacity: 0.1
    });
    
    activeRectangle = polygon;
    return polygon;
  }

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

  function saveShapesToFirebase() {
    if (!db || !ref || !set) {
      console.warn("Firebase nie jest dostępne");
      return;
    }
    
    const geojson = drawnItems.toGeoJSON();
    set(ref(db, 'obrysy'), geojson)
      .then(() => console.log('✅ Obrysy zapisane do Firebase'))
      .catch(console.error);
  }

  function loadShapesFromFirebase() {
    if (!db || !ref || !onValue) {
      console.warn("Firebase nie jest dostępne");
      return;
    }
    
    onValue(ref(db, 'obrysy'), (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      drawnItems.clearLayers();
      const geojsonLayer = L.geoJSON(data);
      geojsonLayer.eachLayer(layer => drawnItems.addLayer(layer));
    });
  }
  
  loadShapesFromFirebase();

  map.on('moveend', () => {
    renderVisibleDzialki();
  });

  // Na końcu event listenera DOMContentLoaded
  updateClearFiltersButton();

  // Start
  loadGeoJSON();
  loadGeoJSONFromFirebase();
  loadClientsFromFirebase();

  // ========== KLIENCI PANEL SYSTEM ==========

  window.showKlienci = function () {
    const sidebar = document.getElementById("clientSidebar");
    if (sidebar.classList.contains("show")) {
      sidebar.classList.remove("show");
    } else {
      renderKlienciList(klienciGlobal);
      sidebar.classList.add("show");
    }
  };

  window.renderKlienciList = function (list) {
    const container = document.getElementById("clientSidebarContent");
    container.innerHTML = "";
    const searchValue = document.getElementById("clientSearchInput")?.value?.toLowerCase() || "";
    
    list
      .filter(k => k.imie?.toLowerCase().includes(searchValue) || 
                   k.telefon?.includes(searchValue) ||
                   k.handlowiec?.toLowerCase().includes(searchValue) ||
                   k.projektant?.toLowerCase().includes(searchValue))
      .forEach(k => {
        const div = document.createElement("div");
        div.className = "client-entry";
        div.innerHTML = `
          <div class="client-name" onclick="showClientProfile('${k.imie}', '${k.telefon}')">
            ${k.imie}
          </div>
          <div class="client-details">
            📞 ${k.telefon}<br/>
            👨‍💼 ${k.handlowiec}<br/>
            👷 ${k.projektant}<br/>
            🏠 ${k.projekt?.substring(0, 50)}...
          </div>
        `;
        container.appendChild(div);
      });
  };

  window.showClientProfile = function (imie, telefon) {
    const client = klienciGlobal.find(k => k.imie === imie && k.telefon === telefon);
    if (!client) return;

    const profile = document.getElementById("clientProfilePanel");
    const content = document.getElementById("clientProfileContent");
    const notes = klienciNotes[`${imie}_${telefon}`] || "";
    const dataUtworzenia = client.dataUtworzenia ? new Date(client.dataUtworzenia).toLocaleDateString('pl-PL') : 'Brak danych';
    
    content.innerHTML = `
      <span id="clientProfileClose" onclick="hideClientProfile()" style="cursor:pointer;position:absolute;top:10px;right:10px;color:#ef4444;font-size:22px;font-weight:bold;">✖</span>
      <h3 style="color:#10b981;">${imie}</h3>
      <p><b>📞 Telefon:</b> ${telefon}</p>
      <p><b>👨‍💼 Handlowiec:</b> ${client.handlowiec}</p>
      <p><b>👷 Projektant:</b> ${client.projektant}</p>
      <p><b>🏠 Projekt:</b> ${client.projekt}</p>
      <p><b>📅 Data dodania:</b> ${dataUtworzenia}</p>
      <label>📝 Notatki:</label>
      <textarea onchange="klienciNotes['${imie}_${telefon}'] = this.value; saveClientNote('${imie}', '${telefon}', this.value)" style="width:100%;height:100px;margin-top:0.5rem;padding:0.5rem;background:#374151;border:1px solid #4b5563;border-radius:0.375rem;color:white;resize:vertical;">${notes}</textarea>
      <button class="btn btn-primary" onclick="zoomToClient('${name}')">📍 Pokaż na pinezkę</button>
    `;
    
    document.body.classList.add("panel-open");
    profile.classList.add("show");
  };

  window.hideClientProfile = () => {
    document.getElementById("clientProfilePanel").classList.remove("show");
    document.body.classList.remove("panel-open");
  };

  window.hideClientSidebar = () => document.getElementById("clientSidebar").classList.remove("show");

  window.applyClientSortFilter = function () {
    const value = document.getElementById("clientSortFilterSelect").value;
    let list = [...klienciGlobal];
    
    switch (value) {
      case "az":
        list.sort((a, b) => a.imie.localeCompare(b.imie));
        break;
      case "za":
        list.sort((a, b) => b.imie.localeCompare(a.imie));
        break;
      case "newest":
        list.sort((a, b) => new Date(b.dataUtworzenia) - new Date(a.dataUtworzenia));
        break;
      case "oldest":
        list.sort((a, b) => new Date(a.dataUtworzenia) - new Date(b.dataUtworzenia));
        break;
      case "by-handlowiec":
        list.sort((a, b) => a.handlowiec.localeCompare(b.handlowiec));
        break;
      case "by-projektant":
        list.sort((a, b) => a.projektant.localeCompare(b.projektant));
        break;
    }
    
    renderKlienciList(list);
  };

  window.filterKlienciList = function () {
    renderKlienciList(klienciGlobal);
  };

  function saveClientNote(imie, telefon, note) {
    if (!db || !ref || !set) {
      console.warn("Firebase nie jest dostępne");
      return;
    }
    
    const noteKey = `${imie}_${telefon}`;
    set(ref(db, `klienci-notatki/${noteKey}`), note)
      .then(() => console.log('✅ Notatka klienta zapisana'))
      .catch(console.error);
  }

  // Ładowanie notatek klientów z Firebase
  if (db && ref && onValue) {
    const notesRef = ref(db, 'klienci-notatki');
    onValue(notesRef, snapshot => {
      Object.assign(klienciNotes, snapshot.val() || {});
      console.log("📥 Notatki klientów:", klienciNotes);
    });
  }


// 🔍 Pokazuje pinezkę klienta na mapie
window.zoomToClient = function(name) {
  // Szukamy działki, której klient to podana osoba
  const feature = geojsonFeatures.find(f => f.properties?.klient?.trim() === name);

  if (!feature) {
    alert("Brak lokalizacji przypisanej do tego klienta.");
    return;
  }

  const coords = feature.geometry?.coordinates;
  const lat = coords?.[1];
  const lng = coords?.[0];

  if (lat && lng) {
    const marker = L.marker([lat, lng]).addTo(map);
    const adres = feature.properties?.adres || "brak adresu";
    const dzialka = feature.properties?.dzialka || "brak działki";
    marker.bindPopup(`<b>${name}</b><br>${adres}<br>${dzialka}`).openPopup();
    map.setView([lat, lng], 16);
  } else {
    alert("Brak współrzędnych dla klienta.");
  }
};


});
