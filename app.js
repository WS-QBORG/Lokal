// =========== Firebase Init ===========
let projektanciAssigned = {};
let projektanciGlobal = [];
let projektanciNotes = {};
let geojsonFeatures = [];
let markerCluster;

const handlowcy = ["Maciej Mierzwa", "Damian Grycel", "Krzysztof Joachimiak", "Marek Suwalski"];

document.addEventListener("DOMContentLoaded", () => {
  const db = window.firebaseDB;
  const ref = window.firebaseRef;
  const onValue = window.firebaseOnValue;
  const set = window.firebaseSet;
  const assignmentsRef = ref(db, 'assignments');

  function updateTabCounters() {
    const countByYear = { '2023': 0, '2024': 0, '2025': 0 };
    geojsonFeatures.forEach(f => {
      const rok = f.properties?.rok;
      if (countByYear[rok] !== undefined) countByYear[rok]++;
    });

    const handlowcySet = new Set(Object.values(projektanciAssigned).filter(Boolean));

    document.getElementById("tab2023").textContent = `2023 (${countByYear['2023']})`;
    document.getElementById("tab2024").textContent = `2024 (${countByYear['2024']})`;
    document.getElementById("tab2025").textContent = `2025 (${countByYear['2025']})`;
    document.querySelector("button[onclick=\"showHandlowcy()\"]").textContent = `Handlowcy (${handlowcySet.size})`;
  }

  onValue(assignmentsRef, snapshot => {
    projektanciAssigned = snapshot.val() || {};
    console.log('📥 Firebase assignments:', projektanciAssigned);
    updateTabCounters();
    if (typeof renderProjektanciList === "function") {
      renderProjektanciList(projektanciGlobal);
    }
  });

  window.saveAssignment = function (projektant, handlowiec) {
    set(ref(db, `assignments/${projektant}`), handlowiec)
      .then(() => console.log('✅ Zapisano:', projektant, handlowiec))
      .catch(console.error);
  };

  const map = L.map('map').setView([53.4285, 14.5528], 8);
  window.map = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  function createClusterGroup() {
    return L.markerClusterGroup({
      iconCreateFunction: cluster => {
        const count = cluster.getChildCount();
        let color = '#3b82f6';
        if (count >= 100) color = '#000000';
        else if (count >= 10) color = '#9ca3af';
        return new L.DivIcon({
          html: `<div style="background:${color};color:white;width:40px;height:40px;border-radius:50%;border:2px solid white;text-align:center;line-height:38px;font-size:14px;font-weight:bold;">${count}</div>`,
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
        geojsonFeatures = data.features;
        updateTabCounters();
        const filtered = filterFn ? geojsonFeatures.filter(filterFn) : geojsonFeatures;
        const layer = L.geoJSON({ type: "FeatureCollection", features: filtered }, {
          pointToLayer: (feature, latlng) => L.marker(latlng),
          onEachFeature: bindPopupToLayer
        });
        markerCluster.addLayer(layer);
        map.addLayer(markerCluster);
      });
  }

  window.filterMap = function (rok) {
    loadGeoJSONWithFilter(rok === 'all' ? null : f => f.properties.rok == rok);
  };

  function bindPopupToLayer(feature, layer) {
    const coords = feature.geometry?.coordinates;
    const lat = coords?.[1];
    const lon = coords?.[0];
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

  window.applySortFilter = function () {
    const value = document.getElementById("sortFilterSelect").value;
    let list = [...projektanciGlobal];
    switch (value) {
      case "az": list.sort((a, b) => a.projektant.localeCompare(b.projektant)); break;
      case "za": list.sort((a, b) => b.projektant.localeCompare(a.projektant)); break;
      case "has-handlowiec": list = list.filter(p => projektanciAssigned[p.projektant]); break;
      case "no-handlowiec": list = list.filter(p => !projektanciAssigned[p.projektant]); break;
      case "proj-asc": list.sort((a, b) => a.liczba_projektow - b.liczba_projektow); break;
      case "proj-desc": list.sort((a, b) => b.liczba_projektow - a.liczba_projektow); break;
    }
    renderProjektanciList(list);
  };

  window.filterProjektanciList = function () {
    renderProjektanciList(projektanciGlobal);
  };

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
      <textarea onchange="projektanciNotes['${name}'] = this.value">${notes}</textarea>
    `;
    profile.classList.add("show");
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

  window.filterHandlowcyList = function () {
    renderHandlowcyList(handlowcy);
  };

  window.hideSidebar = () => document.getElementById("sidebar").classList.remove("show");
  window.hideProfile = () => document.getElementById("profilePanel").classList.remove("show");
  window.hideHandlowcy = () => document.getElementById("handlowcyPanel").classList.remove("show");

  loadGeoJSONWithFilter(null);
});
