
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
      if (countByYear[rok]) countByYear[rok]++;
    });

    const handlowcySet = new Set(Object.values(projektanciAssigned).filter(Boolean));

    const tab2023 = document.getElementById("tab2023");
    const tab2024 = document.getElementById("tab2024");
    const tab2025 = document.getElementById("tab2025");
    const tabHandlowcy = document.getElementById("tabHandlowcy");

    if (tab2023) tab2023.textContent = `2023 (${countByYear['2023']})`;
    if (tab2024) tab2024.textContent = `2024 (${countByYear['2024']})`;
    if (tab2025) tab2025.textContent = `2025 (${countByYear['2025']})`;
    if (tabHandlowcy) tabHandlowcy.textContent = `Handlowcy (${handlowcySet.size})`;
  }

  onValue(assignmentsRef, snapshot => {
    projektanciAssigned = snapshot.val() || {};
    console.log('📥 Firebase assignments:', projektanciAssigned);
    renderProjektanciList(projektanciGlobal);
    setTimeout(updateTabCounters, 100);
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
        geojsonFeatures = data.features;
        setTimeout(updateTabCounters, 100);
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

  // Final initialization
  loadGeoJSONWithFilter(null);
});
