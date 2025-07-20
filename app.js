// =========== Firebase Init ===========
let projektanciAssigned = {};
let projektanciGlobal = [];
let projektanciNotes = {};
let geojsonFeatures = [];
let markerCluster;

const handlowcy = ["Maciej Mierzwa", "Damian Grycel", "Krzysztof Joachimiak", "Marek Suwalski"];

function showProjektanci() {
  fetch('projektanci.json')
    .then(res => res.json())
    .then(data => {
      projektanciGlobal = data;
      renderProjektanciList(projektanciGlobal);
      document.getElementById("sidebar").classList.add("show");
    });
}

function showHandlowcy() {
  renderHandlowcyList(handlowcy);
  document.getElementById("handlowcyPanel").classList.add("show");
}

// === Firebase listeners ===
document.addEventListener("DOMContentLoaded", () => {
  const db = window.firebaseDB;

  // 1. Załaduj przypisania
  const assignRef = window.firebaseRef(db, 'assignments');
  window.firebaseOnValue(assignRef, snapshot => {
    const data = snapshot.val();
    if (data) {
      projektanciAssigned = data;
      console.log("Firebase przypisania:", projektanciAssigned);
    }
  });

  // 2. Załaduj notatki
  const notesRef = window.firebaseRef(db, 'notes');
  window.firebaseOnValue(notesRef, snapshot => {
    const data = snapshot.val();
    if (data) {
      projektanciNotes = data;
      console.log("Firebase notatki:", projektanciNotes);
    }
  });
});

// =================== PROFILE RENDERING ===================
function renderDesignerProfile(name) {
  const panel = document.getElementById("profilePanel");
  const content = document.getElementById("profileContent");
  panel.classList.add("show");

  const projekty = geojsonFeatures.filter(f => f.properties.projektant === name);
  const handlowiec = projektanciAssigned[name] || "—";

  let html = `<h2>${name}</h2>`;
  html += `<p><strong>Handlowiec:</strong> ${handlowiec}</p>`;
  html += `<p><strong>Liczba projektów:</strong> ${projekty.length}</p>`;
  html += `<textarea placeholder="Notatki...">${projektanciNotes[name] || ''}</textarea>`;

  html += `<h3>Projekty:</h3><ul>`;
  for (const proj of projekty) {
    const props = proj.properties;
    html += `<li><span class="projekt-rok">${props.rok || ''}</span> – <a class="projekt-link" href="${props.link}" target="_blank">${props.opis}</a></li>`;
  }
  html += `</ul>`;

  content.innerHTML = html;

  // Zapis notatki na zmianę
  const textarea = content.querySelector("textarea");
  textarea.addEventListener("change", () => {
    const note = textarea.value;
    projektanciNotes[name] = note;

    const noteRef = window.firebaseRef(window.firebaseDB, `notes/${name}`);
    window.firebaseSet(noteRef, note);
  });
}

// =================== LISTA PROJEKTANTÓW ===================
function renderProjektanciList(data) {
  const container = document.getElementById("sidebarContent");
  container.innerHTML = '';

  data.forEach(proj => {
    const name = proj.name;
    const numProjects = proj.count || 0;
    const handlowiec = projektanciAssigned[name] || '—';
    const note = projektanciNotes[name] || '';

    const div = document.createElement("div");
    div.className = "projektant-entry";
    div.innerHTML = `
      <div class="name" onclick="renderDesignerProfile('${name}')">${name}</div>
      <div>Liczba projektów: ${numProjects}</div>
      <div>Handlowiec: ${handlowiec}</div>
      <textarea placeholder="Notatki...">${note}</textarea>
    `;

    const textarea = div.querySelector("textarea");
    textarea.addEventListener("change", () => {
      const text = textarea.value;
      projektanciNotes[name] = text;

      const noteRef = window.firebaseRef(window.firebaseDB, `notes/${name}`);
      window.firebaseSet(noteRef, text);
    });

    container.appendChild(div);
  });
}

// =================== FILTROWANIE, UKRYWANIE ===================
function hideSidebar() {
  document.getElementById("sidebar").classList.remove("show");
}
function hideProfile() {
  document.getElementById("profilePanel").classList.remove("show");
}
function hideHandlowcy() {
  document.getElementById("handlowcyPanel").classList.remove("show");
}
function applyProjektantFilter() {
  // Implementacja filtrowania zaznaczonych projektantów
}
function applyHandlowcyFilter() {
  // Implementacja filtrowania zaznaczonych handlowców
}
function filterProjektanciList() {
  // Implementacja filtrowania po input
}
function renderHandlowcyList(list) {
  // Implementacja listy handlowców
}
function applyHandlowcySort() {
  // Implementacja sortowania handlowców
}
function applySortFilter() {
  // Implementacja sortowania projektantów
}
function filterMap(rok) {
  // Implementacja filtrowania mapy
}
