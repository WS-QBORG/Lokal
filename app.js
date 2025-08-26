// ============= Firebase Auth & Activity Tracking System ===========

// Function to open activity history panel
window.openActivityHistory = function() {
  // Track opening activity history
  logActivity('open', 'system', 'activity_history', {
    action_type: 'open_activity_history_panel'
  });
  
  // Open in new window/tab
  const activityWindow = window.open('firebase-history-panel.html', '_blank', 'noopener,noreferrer,width=1200,height=800,scrollbars=yes,resizable=yes');
  
  if (!activityWindow) {
    alert('Panel historii został zablokowany przez przeglądarkę. Sprawdź ustawienia popup-ów.');
  }
};

let currentUser = null;
let sessionStartTime = null;
let lastActivityTime = null;
let sessionId = null;
let activityHeartbeat = null;

// Enhanced activity tracking functions
function logActivity(action, objectType, objectId, metadata = {}) {
  // Ensure we have a real Firebase user (avoid localStorage fallback)
  const auth = window.firebaseAuth;
  const uid = (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid);
  if (!uid) return;

  const event = {
    timestamp: window.firebaseServerTimestamp(),
    user: currentUser?.email || auth?.currentUser?.email,
    userName: (currentUser?.displayName || currentUser?.email) || (auth?.currentUser?.displayName || auth?.currentUser?.email),
    action: action, // 'click', 'open', 'edit', 'add', 'delete', 'assign', 'filter'
    objectType: objectType, // 'point', 'projektant', 'projekt', 'klient', 'filter', 'sidebar'
    objectId: objectId,
    objectName: metadata.name || objectId,
    sessionId: sessionId,
    metadata: {
      ...metadata,
      url: window.location.href,
      userAgent: navigator.userAgent
    }
  };

  // Save to Firebase
  const db = window.firebaseDB;
  const ref = window.firebaseRef;
  const push = window.firebasePush;

  if (db && ref && push) {
    push(ref(db, `events/${uid}`), event)
      .catch(error => console.error('Error logging activity:', error));
  }
}

// Session tracking functions
function startSession() {
  if (!currentUser) return;
  
  sessionStartTime = new Date();
  sessionId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  lastActivityTime = new Date();
  
  const sessionData = {
    sessionId: sessionId,
    startTime: window.firebaseServerTimestamp(),
    user: currentUser.email,
    userName: currentUser.displayName || currentUser.email,
    userAgent: navigator.userAgent,
    url: window.location.href,
    status: 'active'
  };
  
  // Save session start to Firebase
  const db = window.firebaseDB;
  const ref = window.firebaseRef;
  const set = window.firebaseSet;
  
  if (db && ref && set) {
    set(ref(db, `sessions/${currentUser.uid}/${sessionId}`), sessionData)
      .catch(error => console.error('Error starting session:', error));
  }
  
  // Start heartbeat
  startHeartbeat();
}

function endSession() {
  if (!currentUser || !sessionId) return;
  
  const sessionDuration = Math.round((new Date() - sessionStartTime) / 1000);
  
  const sessionUpdate = {
    endTime: window.firebaseServerTimestamp(),
    duration: sessionDuration,
    status: 'ended'
  };
  
  // Update session in Firebase
  const db = window.firebaseDB;
  const ref = window.firebaseRef;
  const set = window.firebaseSet;
  
  if (db && ref && set) {
    set(ref(db, `sessions/${currentUser.uid}/${sessionId}/endTime`), sessionUpdate.endTime);
    set(ref(db, `sessions/${currentUser.uid}/${sessionId}/duration`), sessionUpdate.duration);
    set(ref(db, `sessions/${currentUser.uid}/${sessionId}/status`), sessionUpdate.status);
  }
  
  stopHeartbeat();
}

function startHeartbeat() {
  activityHeartbeat = setInterval(() => {
    if (currentUser && sessionId) {
      const now = new Date();
      const timeSinceLastActivity = (now - lastActivityTime) / 1000;
      
      // Update last seen if activity within 5 minutes
      if (timeSinceLastActivity < 300) {
        const db = window.firebaseDB;
        const ref = window.firebaseRef;
        const set = window.firebaseSet;
        
        if (db && ref && set) {
          set(ref(db, `sessions/${currentUser.uid}/${sessionId}/lastSeen`), window.firebaseServerTimestamp());
        }
      }
    }
  }, 30000); // Every 30 seconds
}

function stopHeartbeat() {
  if (activityHeartbeat) {
    clearInterval(activityHeartbeat);
    activityHeartbeat = null;
  }
}

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

// ========== MOBILE TOUCH EVENTS ==========

// Improved touch handling for mobile devices
document.addEventListener('DOMContentLoaded', function() {
  // Add touch event handling for buttons
  const buttons = document.querySelectorAll('.btn, .dropdown-button, .filter-option');
  buttons.forEach(button => {
    button.addEventListener('touchstart', function() {
      this.style.transform = 'scale(0.95)';
    });
    
    button.addEventListener('touchend', function() {
      setTimeout(() => {
        this.style.transform = '';
      }, 150);
    });
  });

  // Prevent zoom on double tap for better UX
  let lastTouchEnd = 0;
  document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, false);

  // Improved dropdown handling on mobile
  if (window.innerWidth <= 768) {
    const dropdownButtons = document.querySelectorAll('.dropdown-button');
    dropdownButtons.forEach(button => {
      button.addEventListener('touchstart', function(e) {
        e.stopPropagation();
      });
    });
  }
});

// ========== END MOBILE TOUCH EVENTS ==========

// ========== MOBILE TOGGLE FUNCTIONS ==========

// Toggle mobile panel
window.toggleMobilePanel = function() {
  const controlPanel = document.getElementById("controlPanel");
  const mobileToggle = document.getElementById("mobileToggle");
  
  if (controlPanel.classList.contains("mobile-show")) {
    controlPanel.classList.remove("mobile-show");
    mobileToggle.classList.remove("active");
    mobileToggle.innerHTML = "☰";
  } else {
    controlPanel.classList.add("mobile-show");
    mobileToggle.classList.add("active");
    mobileToggle.innerHTML = "✖";
  }
};

// Close mobile panel when clicking outside
document.addEventListener('click', function(event) {
  const controlPanel = document.getElementById("controlPanel");
  const mobileToggle = document.getElementById("mobileToggle");
  
  // Only on mobile
  if (window.innerWidth <= 768) {
    if (controlPanel.classList.contains("mobile-show") && 
        !controlPanel.contains(event.target) && 
        !mobileToggle.contains(event.target)) {
      controlPanel.classList.remove("mobile-show");
      mobileToggle.classList.remove("active");
      mobileToggle.innerHTML = "☰";
    }
  }
});

// Close mobile panel when opening sidebars on mobile
const originalShowProjektanci = window.showProjektanci;
window.showProjektanci = function() {
  if (window.innerWidth <= 768) {
    const controlPanel = document.getElementById("controlPanel");
    const mobileToggle = document.getElementById("mobileToggle");
    controlPanel.classList.remove("mobile-show");
    mobileToggle.classList.remove("active");
    mobileToggle.innerHTML = "☰";
  }
  originalShowProjektanci();
};

const originalShowKlienci = window.showKlienci;
window.showKlienci = function() {
  if (window.innerWidth <= 768) {
    const controlPanel = document.getElementById("controlPanel");
    const mobileToggle = document.getElementById("mobileToggle");
    controlPanel.classList.remove("mobile-show");
    mobileToggle.classList.remove("active");
    mobileToggle.innerHTML = "☰";
  }
  originalShowKlienci();
};

// ========== END MOBILE FUNCTIONS ==========
const handlowcy = ["Maciej Mierzwa", "Damian Grycel", "Krzysztof Joachimiak", "Marek Suwalski", "Tomasz Fierek", "Piotr Murawski", "Weronika Stępień"];

// ========== FIREBASE AUTH FUNCTIONS ==========
window.showLoginForm = function() {
  const loginHtml = `
    <div id="loginOverlay" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    ">
      <div style="
        background: white;
        padding: 30px;
        border-radius: 10px;
        width: 400px;
        max-width: 90%;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      ">
        <h2 style="text-align: center; margin-bottom: 20px; color: #333;">Logowanie Handlowców Firebase</h2>
        <form id="loginForm">
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; color: #555;">Email:</label>
            <input type="email" id="loginEmail" required style="
              width: 100%;
              padding: 10px;
              border: 1px solid #ddd;
              border-radius: 5px;
              font-size: 16px;
            " placeholder="twoj.email@qborg.pl">
          </div>
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 5px; color: #555;">Hasło:</label>
            <input type="password" id="loginPassword" required style="
              width: 100%;
              padding: 10px;
              border: 1px solid #ddd;
              border-radius: 5px;
              font-size: 16px;
            ">
          </div>
          <button type="submit" style="
            width: 100%;
            padding: 12px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
          ">Zaloguj się</button>
        </form>
        <div id="loginError" style="
          margin-top: 15px;
          padding: 10px;
          background: #fee;
          border: 1px solid #fcc;
          border-radius: 5px;
          color: #c33;
          display: none;
        "></div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', loginHtml);
  
  document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
      const auth = window.firebaseAuth;
      const signIn = window.firebaseSignIn;
      
      const userCredential = await signIn(auth, email, password);
      currentUser = userCredential.user;
      
      document.getElementById('loginOverlay').remove();
      showUserPanel();
      startSession();
      startActivityTracking();
      
    } catch (error) {
      console.error('Login error:', error);
      const errorDiv = document.getElementById('loginError');
      errorDiv.textContent = getFirebaseErrorMessage(error.code);
      errorDiv.style.display = 'block';
    }
  });
};

function getFirebaseErrorMessage(errorCode) {
  switch (errorCode) {
    case 'auth/user-not-found':
      return 'Nie znaleziono użytkownika o tym adresie email.';
    case 'auth/wrong-password':
      return 'Nieprawidłowe hasło.';
    case 'auth/invalid-email':
      return 'Nieprawidłowy format adresu email.';
    case 'auth/user-disabled':
      return 'To konto zostało wyłączone.';
    case 'auth/too-many-requests':
      return 'Zbyt wiele prób logowania. Spróbuj ponownie później.';
    default:
      return 'Błąd logowania: ' + errorCode;
  }
}

window.logout = async function() {
  if (currentUser) {
    logActivity('logout', 'system', 'logout', { 
      sessionDuration: Math.round((new Date() - sessionStartTime) / 1000)
    });
    endSession();
  }
  
  try {
    const auth = window.firebaseAuth;
    const signOut = window.firebaseSignOut;
    await signOut(auth);
    
    currentUser = null;
    sessionStartTime = null;
    lastActivityTime = null;
    sessionId = null;
    
    document.getElementById('userPanel')?.remove();
    showLoginForm();
  } catch (error) {
    console.error('Logout error:', error);
  }
};

window.showUserPanel = function() {
  const userName = currentUser.displayName || currentUser.email.split('@')[0];
  const userPanelHtml = `
    <div id="userPanel" style="
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(59, 130, 246, 0.95);
      color: white;
      padding: 10px 15px;
      border-radius: 8px;
      z-index: 1000;
      font-size: 14px;
      box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    ">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span>👤 ${userName}</span>
        <button onclick="logout()" style="
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        ">Wyloguj</button>
        <button onclick="openActivityHistory()" style="
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        ">📊 Historia</button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', userPanelHtml);
};

// ========== EVENT LOGGING ==========
// Legacy function - use logActivity instead
window.logEvent = function(eventType, data = {}) {
  if (!currentUser) return;
  logActivity('legacy_event', 'system', eventType, data);
};

window.startActivityTracking = function() {
  // Track page visibility
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      logEvent('page_hidden');
    } else {
      logEvent('page_visible');
      lastActivityTime = new Date();
    }
  });
  
  // Track clicks
  document.addEventListener('click', function(e) {
    lastActivityTime = new Date();
    
    let target = e.target;
    let elementInfo = {
      tagName: target.tagName,
      className: target.className,
      id: target.id,
      text: target.textContent?.substring(0, 100)
    };
    
    // Sprawdź czy to link lub przycisk
    if (target.tagName === 'A' || target.onclick || target.closest('a')) {
      const link = target.tagName === 'A' ? target : target.closest('a');
      elementInfo.href = link?.href;
      elementInfo.isLink = true;
    }
    
    logEvent('click', elementInfo);
  });
  
  // Track scroll
  let scrollTimeout;
  document.addEventListener('scroll', function() {
    lastActivityTime = new Date();
    
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      logEvent('scroll', {
        scrollY: window.scrollY,
        scrollX: window.scrollX
      });
    }, 1000);
  });
  
  // Track keyboard activity
  document.addEventListener('keydown', function(e) {
    lastActivityTime = new Date();
    
    logEvent('keydown', {
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey
    });
  });
  
  // Heartbeat every minute if active
  setInterval(() => {
    if (currentUser && lastActivityTime && (new Date() - lastActivityTime) < 120000) { // 2 minutes
      logEvent('heartbeat', {
        sessionDuration: Math.round((new Date() - sessionStartTime) / 1000)
      });
    }
  }, 60000);
};

window.showEventHistory = function() {
  const historyHtml = `
    <div id="historyOverlay" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    ">
      <div style="
        background: white;
        padding: 20px;
        border-radius: 10px;
        width: 90%;
        height: 80%;
        max-width: 800px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0;">Historia zdarzeń</h2>
          <div>
            <button onclick="downloadEventHistory()" style="
              background: #10b981;
              color: white;
              border: none;
              padding: 8px 12px;
              border-radius: 5px;
              cursor: pointer;
              margin-right: 10px;
            ">Pobierz CSV</button>
            <button onclick="document.getElementById('historyOverlay').remove()" style="
              background: #ef4444;
              color: white;
              border: none;
              padding: 8px 12px;
              border-radius: 5px;
              cursor: pointer;
            ">Zamknij</button>
          </div>
        </div>
        <div style="
          overflow-y: auto;
          flex: 1;
          border: 1px solid #ddd;
          border-radius: 5px;
          padding: 10px;
        ">
          ${generateEventHistoryTable()}
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', historyHtml);
};

window.generateEventHistoryTable = function() {
  const recentEvents = eventHistory.slice(-100).reverse(); // Ostatnie 100 zdarzeń
  
  return `
    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
      <thead>
        <tr style="background: #f8f9fa;">
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Czas</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Użytkownik</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Zdarzenie</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Szczegóły</th>
        </tr>
      </thead>
      <tbody>
        ${recentEvents.map(event => `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${new Date(event.timestamp).toLocaleString('pl-PL')}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${event.userName}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${event.eventType}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${JSON.stringify(event.data).substring(0, 100)}...</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
};

window.downloadEventHistory = function() {
  const csv = [
    ['Timestamp', 'User', 'Event Type', 'Data', 'URL'].join(','),
    ...eventHistory.map(event => [
      event.timestamp,
      event.userName,
      event.eventType,
      JSON.stringify(event.data).replace(/"/g, '""'),
      event.url
    ].map(field => `"${field}"`).join(','))
  ].join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qborg_event_history_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
};

// Start auth listener on page load (real Firebase session)
document.addEventListener("DOMContentLoaded", () => {
  const auth = window.firebaseAuth;
  const onAuthStateChanged = window.firebaseAuthState;

  if (auth && onAuthStateChanged) {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUser = user;
        sessionStartTime = new Date();
        lastActivityTime = new Date();
        showUserPanel();
        startSession();
        startActivityTracking();
        logActivity('login', 'system', 'auth_state_restored');
      } else {
        showLoginForm();
      }
    });
  } else {
    // Fallback: show login if Firebase not ready
    showLoginForm();
  }
});

// Remove legacy localStorage session persistence (use Firebase Auth persistence instead)
// (Intentionally left empty)

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
    const oldStatus = statusAssigned[projektant] || "Neutralny";
    statusAssigned[projektant] = status;
    
    // Track status change
    logActivity('edit', 'projektant', projektant, {
      name: projektant,
      field: 'status',
      old_value: oldStatus,
      new_value: status,
      action_type: 'change_status'
    });
    
    if (db && ref && set) {
      set(ref(db, `statusy/${projektant}`), status)
        .then(() => console.log('✅ Status zapisany:', projektant, status))
        .catch(console.error);
    }
  };


// 🔄 Funkcja rysująca obrys dla danego projektanta i działki
function drawPolygonForFeature(feature) {
  console.log("📐 Wywołano drawPolygonForFeature dla:", feature);
  console.log("🗺️ Polygon layer group:", polygonLayerGroup);
  const projektant = feature.properties?.projektant;
  const adres = feature.properties?.adres || '';
  const dzialka = feature.properties?.dzialka || '';
  // Użyj adresu + działki jako unikalny ID jeśli brak dzialkaId
  const dzialkaId = feature.properties?.id || feature.properties?.dzialkaId || 
    `${adres.replace(/[^a-zA-Z0-9]/g, '_')}_${dzialka.replace(/[^a-zA-Z0-9]/g, '_')}`.substring(0, 50);

  // 🚫 Jeśli brakuje danych – przerwij
  if (!projektant) {
    console.warn("⛔ Brak projektanta:", feature);
    return;
  }

  console.log("🔍 Szukam obrysu dla:", projektant, dzialkaId);

  // 🔗 Ścieżka do obrysu w Firebase
  const path = `obrysy/${projektant}/${dzialkaId}`;
  const db = window.firebaseDB;
  const ref = window.firebaseRef;
  const onValue = window.firebaseOnValue;

  if (!db || !ref || !onValue) {
    console.warn("⚠️ Firebase nie jest dostępne");
    return;
  }

  // 🧼 Wyczyść poprzednie obrysy, jeśli warstwa istnieje
  if (polygonLayerGroup) polygonLayerGroup.clearLayers();

  // 📥 Pobierz dane obrysu z Firebase
  onValue(ref(db, path), (snapshot) => {
    const data = snapshot.val();
    console.log("📥 Dane z Firebase dla obrysu:", data);

    // ❗ Jeśli brak danych - pokaż informację
    if (!data || !Array.isArray(data)) {
      console.log("⚠️ Brak obrysu działki - można dodać nowy");
      // Dodaj przycisk do rysowania obrysu w popupie
      showPolygonEditButtons(feature, dzialkaId);
      return;
    }

    // 🧭 Zamień dane na format Leaflet i narysuj
    const latlngs = data.map(pt => [pt.lat, pt.lng]);

    const polygon = L.polygon(latlngs, {
      color: '#3b82f6',
      fillColor: '#93c5fd',
      fillOpacity: 0.4,
      weight: 2
    });

    // ➕ Dodaj obrys do warstwy
    polygon.addTo(polygonLayerGroup);
    
    // Dodaj opcje edycji obrysu
    showPolygonEditButtons(feature, dzialkaId, true);
  });
}

// 🔧 Funkcja pokazująca przyciski edycji obrysu
function showPolygonEditButtons(feature, dzialkaId, hasPolygon = false) {
  const projektant = feature.properties?.projektant;
  const coords = feature.geometry?.coordinates;
  const lat = coords ? coords[1] : null;
  const lon = coords ? coords[0] : null;
  
  const buttonText = hasPolygon ? "✏️ Edytuj obrys działki" : "➕ Dodaj obrys działki";
  const buttonColor = hasPolygon ? "#f59e0b" : "#10b981";
  
  console.log("🔧 Dodaję przycisk obrysu dla:", projektant, "na pozycji:", lat, lon);
  
  // Nie szukaj markera - dodaj przycisk bezpośrednio do popupu w bindPopupToLayer
  window.currentPolygonButton = {
    text: buttonText,
    color: buttonColor,
    projektant: projektant,
    dzialkaId: dzialkaId,
    lat: lat,
    lon: lon
  };
}

// 🖊️ Funkcja rozpoczynająca edycję obrysu
window.startPolygonEdit = function(projektant, dzialkaId, lat, lon) {
  console.log("🖊️ Rozpoczynam edycję obrysu dla:", projektant, dzialkaId);
  
  // Sprawdź czy panel już istnieje
  const existingPanel = document.getElementById('polygonEditPanel');
  if (existingPanel) {
    existingPanel.remove();
  }
  
  // Wycentruj mapę na punkcie
  map.setView([lat, lon], 18);
  
  // Pokaż panel kontrolny do rysowania
  const controlPanel = document.createElement('div');
  controlPanel.id = 'polygonEditPanel';
  controlPanel.style.cssText = `
    position: fixed;
    top: 120px;
    right: 20px;
    transform: none;
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    z-index: 1500;
    text-align: center;
    border: 2px solid #3b82f6;
    min-width: 300px;
    max-width: 350px;
  `;
  
  controlPanel.innerHTML = `
    <h3 style="margin: 0 0 10px 0; color: #1f2937;">Edycja obrysu działki</h3>
    <p style="margin: 5px 0;"><b>Projektant:</b> ${projektant}</p>
    <p style="margin: 10px 0; font-size: 14px; color: #6b7280;">Użyj narzędzi rysowania na mapie aby narysować nowy obrys działki</p>
    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
      <button onclick="saveCurrentPolygon('${projektant}', '${dzialkaId}')" style="background:#10b981;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold;">✅ Zapisz obrys</button>
      <button onclick="cancelPolygonEdit()" style="background:#ef4444;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold;">❌ Anuluj</button>
    </div>
  `;
  
  document.body.appendChild(controlPanel);
  console.log("✅ Panel edycji obrysu utworzony");
}


// 💾 Zapisz narysowany obrys
window.saveCurrentPolygon = function(projektant, dzialkaId) {
  console.log("💾 Zapisuję obrys dla:", projektant, dzialkaId);
  
  if (!window.drawnItems) {
    alert("Błąd: System rysowania nie jest dostępny!");
    return;
  }
  
  const allLayers = window.drawnItems.getLayers();
  console.log("🔍 Wszystkie warstwy:", allLayers.length);
  
  if (allLayers.length === 0) {
    alert("Najpierw narysuj nowy obrys używając narzędzi rysowania na mapie!\n\nInstrukcja:\n1. Użyj narzędzi po lewej stronie mapy\n2. Narysuj polygon lub prostokąt\n3. Kliknij 'Zapisz obrys'");
    return;
  }
  
  // Użyj ostatnio dodanej warstwy
  const targetLayer = allLayers[allLayers.length - 1];
  console.log("🎯 Używam warstwy:", targetLayer);
  
  let polygonData = [];
  
  // Obsłuż różne typy warstw
  if (targetLayer.getLatLngs && typeof targetLayer.getLatLngs === 'function') {
    const latlngs = targetLayer.getLatLngs();
    // Sprawdź czy to jest polygon (array of arrays) czy prostokąt (array of latlngs)
    const coords = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
    polygonData = coords.map(latlng => ({
      lat: latlng.lat,
      lng: latlng.lng
    }));
  } else if (targetLayer.getBounds && typeof targetLayer.getBounds === 'function') {
    // Dla prostokątów
    const bounds = targetLayer.getBounds();
    polygonData = [
      { lat: bounds.getNorth(), lng: bounds.getWest() },
      { lat: bounds.getNorth(), lng: bounds.getEast() },
      { lat: bounds.getSouth(), lng: bounds.getEast() },
      { lat: bounds.getSouth(), lng: bounds.getWest() }
    ];
  }
  
  if (polygonData.length === 0) {
    alert("Nie można odczytać współrzędnych obrysu!");
    return;
  }
  
  console.log("📊 Dane obrysu do zapisania:", polygonData);
  
  // Zapisz do Firebase
  const db = window.firebaseDB;
  const ref = window.firebaseRef;
  const set = window.firebaseSet;
  
  if (db && ref && set) {
    const path = `obrysy/${projektant}/${dzialkaId}`;
    set(ref(db, path), polygonData)
      .then(() => {
        console.log('✅ Obrys zapisany do Firebase');
        alert('✅ Obrys działki został zapisany!');
        cancelPolygonEdit();
        
        // Odśwież wyświetlanie obrysu
        setTimeout(() => {
          const feature = geojsonFeatures.find(f => 
            f.properties?.projektant === projektant && 
            (f.properties?.id || f.properties?.dzialkaId || 
             `${f.properties?.adres?.replace(/[^a-zA-Z0-9]/g, '_')}_${f.properties?.dzialka?.replace(/[^a-zA-Z0-9]/g, '_')}`.substring(0, 50)) === dzialkaId
          );
          if (feature) drawPolygonForFeature(feature);
        }, 500);
      })
      .catch(err => {
        console.error('❌ Błąd zapisu obrysu:', err);
        alert('❌ Błąd podczas zapisywania obrysu');
      });
  } else {
    alert('❌ Firebase nie jest dostępne');
  }
}

// ❌ Anuluj edycję obrysu
window.cancelPolygonEdit = function() {
  const panel = document.getElementById('polygonEditPanel');
  if (panel) panel.remove();
}



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
    
    // Track add client action
    logActivity('open', 'client_panel', 'add_client_form', {
      prefilled_project: prefilledProject,
      action_type: 'open_add_client_form'
    });
    
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
        <div style="font-family: Arial, sans-serif; line-height: 1.4;">
          <b>${projektant}</b><br/>
          <b>Rok:</b> ${new Date().getFullYear()}<br/>
          <b>Inwestycja:</b> Dom jednorodzinny - ${adres}<br/>
          <b>Adres:</b> ${adres}<br/>
          <b>Działka:</b> Brak<br/><br/>
          <button type="button" onclick="event.stopPropagation(); startAddClientMode('Dom jednorodzinny - ${adres}')" style="background:#10b981;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;margin:4px 0;width:100%;">👥 Dodaj klienta</button><br/>
          <a href="https://maps.google.com/?q=${adres}" target="_blank" style="color:#3b82f6;text-decoration:none;">📍 Pokaż w Google Maps</a>
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
          popup: `Dom jednorodzinny - ${adres}`,
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

  let polygonLayerGroup = L.layerGroup().addTo(map);
  
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
            "popup": "Budowa budynku mieszkalnego jednorodzinnego - ul. Przykładowa 1",
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
            "popup": "Budowa budynku wielorodzinnego - ul. Testowa 2",
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
            "popup": "Budynek usługowy - ul. Biznesowa 3",
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
    
    // Najpierw zastosuj aktywne filtry, potem ogranicz do widocznego obszaru
    let filtered = geojsonFeatures;
    
    // Zastosuj filtry projektantów jeśli są aktywne
    if (activeFilters.projektanci && activeFilters.projektanci.length > 0) {
      filtered = filtered.filter(f => 
        activeFilters.projektanci.includes(f.properties?.projektant?.trim())
      );
    }
    
    // Zastosuj filtry handlowców jeśli są aktywne
    if (activeFilters.handlowcy && activeFilters.handlowcy.length > 0) {
      filtered = filtered.filter(f => 
        activeFilters.handlowcy.includes(projektanciAssigned[f.properties?.projektant?.trim()])
      );
    }
    
    // Zastosuj filtry lat jeśli są aktywne
    if (activeFilters.lata && activeFilters.lata.length > 0) {
      filtered = filtered.filter(f => {
        const rok = f.properties?.rok;
        return activeFilters.lata.includes(String(rok));
      });
    }
    
    // Na końcu ogranicz do widocznego obszaru
    const visible = filtered.filter(f => {
      return (
        f.geometry &&
        f.geometry.type === "Point" &&
        Array.isArray(f.geometry.coordinates) &&
        bounds.contains([f.geometry.coordinates[1], f.geometry.coordinates[0]])
      );
    });
    
    console.log(`🔍 Widoczne punkty po filtrach: ${visible.length} z ${geojsonFeatures.length} całkowitych`);
    
    // Wyczyść istniejące obrysy tylko jeśli mamy nowe punkty do pokazania
    if (window.drawnItems) {
      window.drawnItems.clearLayers();
    }
    
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
      const inwestycjaRaw = f.properties?.popup || 'Brak opisu';
      const inwestycja = inwestycjaRaw.replace(/<[^>]*>/g, '').replace(/Inwestycja:\s*/, '') || 'Brak opisu';
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
    
    // Zarządzaj obrysami działek - wyczyść istniejące obrysy
    if (window.drawnItems) {
      // Wyczyść wszystkie istniejące obrysy - prostokąty będą dodawane tylko po kliknięciu w punkt
      window.drawnItems.clearLayers();
    }
    
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

    const clearBtn = document.getElementById('clearFiltersBtn');
    if (clearBtn) {
      clearBtn.style.display = hasActiveFilters ? 'block' : 'none';
    }
  }

  window.clearAllFilters = function() {
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
      checkbox.checked = activeFilters.lata.includes(String(rok));
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
      checkbox.checked = activeFilters.inwestycje.includes(type);
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
    const inwestycjaRaw = feature.properties?.popup || 'Brak opisu';
    const adres = feature.properties?.adres || 'Brak adresu';
    const dzialka = feature.properties?.dzialka || 'Brak działki';
    const assigned = projektanciAssigned[proj] || "";
    const status = statusAssigned[proj] || "Neutralny";
    
    // Wyciągnij tylko tekst z HTML lub użyj surowego tekstu
    const inwestycja = inwestycjaRaw.replace(/<[^>]*>/g, '').replace(/Inwestycja:\s*/, '') || 'Brak opisu';

    const popup = `
      <div style="font-family: Arial, sans-serif; line-height: 1.4;">
        <b>${proj}</b><br/>
        <b>Rok:</b> ${rok}<br/>
        <b>Inwestycja:</b> ${inwestycja}<br/>
        <b>Adres:</b> ${adres}<br/>
        <b>Działka:</b> ${dzialka}<br/><br/>
        <label><b>Przypisz handlowca:</b></label><br/>
        <select onchange="assignHandlowiec('${proj}', this.value)" style="width: 100%; margin: 4px 0; padding: 2px;">
          <option value="">(brak)</option>
          ${handlowcy.map(h => `<option value="${h}" ${h === assigned ? 'selected' : ''}>${h}</option>`).join('')}
        </select><br/>
        <label><b>Status:</b></label><br/>
        <select onchange="saveStatus('${proj}', this.value)" style="width: 100%; margin: 4px 0; padding: 2px;">
          ${statusy.map(s => `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`).join('')}
        </select><br/><br/>
        <button type="button" onclick="event.stopPropagation(); startAddClientMode('${inwestycja.replace(/'/g, '\\\'')}')" style="background:#10b981;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;margin:4px 0;width:100%;">👥 Dodaj klienta</button><br/>
        <button type="button" onclick="event.stopPropagation(); startPolygonEdit('${proj}', '${dzialka.replace(/[^a-zA-Z0-9]/g, '_')}', ${lat}, ${lon})" style="background:#10b981;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;margin:4px 0;width:100%;">📐 Edytuj obrys działki</button><br/>
        <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" style="color:#3b82f6;text-decoration:none;">📍 Pokaż w Google Maps</a>
      </div>
    `;
    
    layer.bindPopup(popup);

    // 🔄 Dodaj tracking i rysowanie obrysu działki przy kliknięciu w marker
    layer.on("click", (e) => {
      console.log("🖱️ Kliknięto w marker, wywołuję drawPolygonForFeature");
      e.originalEvent.stopPropagation();
      
      // Track punkt click activity
      logActivity('click', 'point', `${proj}-${dzialka}`, {
        name: `${proj} - ${inwestycja}`,
        projektant: proj,
        dzialka: dzialka,
        adres: adres,
        rok: rok,
        coordinates: [lat, lon],
        assigned_handlowiec: assigned,
        status: status
      });
      
      drawPolygonForFeature(feature);
      
      // Pokaż suwak obrotu dla tego punktu
      const latlng = e.latlng;
      if (latlng) {
        const rect = createDefaultRectangle(latlng);
        if (window.drawnItems) {
          window.drawnItems.clearLayers();
          rect.addTo(window.drawnItems);
        }
      }
    });


    
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
    // Nie zamykaj sidebara automatycznie - użytkownik może chcieć modyfikować filtry
  };

  window.assignHandlowiec = function (projektant, handlowiec) {
    const oldHandlowiec = projektanciAssigned[projektant] || null;
    
    if (handlowiec) projektanciAssigned[projektant] = handlowiec;
    else delete projektanciAssigned[projektant];
    
    // Track assignment change
    logActivity('assign', 'projektant', projektant, {
      name: projektant,
      old_handlowiec: oldHandlowiec,
      new_handlowiec: handlowiec || null,
      action_type: handlowiec ? 'assign_handlowiec' : 'unassign_handlowiec'
    });
    
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
    // Track projektant profile view
    logActivity('open', 'projektant', name, {
      name: name,
      action_type: 'view_profile',
      handlowiec: projektanciAssigned[name] || null,
      project_count: geojsonFeatures.filter(f => f.properties?.projektant === name).length
    });
    
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
        const inwestycjaRaw = projekt.properties?.popup || 'Brak opisu';
        const inwestycja = inwestycjaRaw.replace(/<[^>]*>/g, '').replace(/Inwestycja:\s*/, '') || 'Brak opisu';
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
      checkbox.checked = activeFilters.handlowcy.includes(h);
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
  window.drawnItems = drawnItems; // Udostępnij globalnie
  
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
    console.log("🎨 Narysowano nowy element:", layer);
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

  loadGeoJSON();
  loadGeoJSONFromFirebase();
  loadClientsFromFirebase();

  // Ukryj suwak obrotu po kliknięciu w mapę (poza markerami)
  map.on('click', function() {
    document.getElementById("rotateControl").style.display = "none";
    if (window.drawnItems) {
      window.drawnItems.clearLayers();
    }
  });

  // ========== GEOLOKALIZACJA ==========
  
  let userLocationMarker = null;
  let userLocationCircle = null;
  let locationInfoPanel = null;

  window.showMyLocation = function() {
    if (!navigator.geolocation) {
      alert('Geolokalizacja nie jest obsługiwana przez twoją przeglądarkę');
      return;
    }

    // Pokaż loading
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
      loadingOverlay.style.display = 'flex';
      loadingOverlay.innerHTML = '<div class="spinner"></div>Pobieranie lokalizacji...';
    }

    navigator.geolocation.getCurrentPosition(
      function(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        // Ukryj loading
        if (loadingOverlay) {
          loadingOverlay.style.display = 'none';
        }

        // Usuń poprzednie markery lokalizacji
        if (userLocationMarker) {
          map.removeLayer(userLocationMarker);
        }
        if (userLocationCircle) {
          map.removeLayer(userLocationCircle);
        }

        // Dodaj marker użytkownika
        userLocationMarker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'user-location-marker',
            html: '<div style="background: #3b82f6; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        }).addTo(map);

        // Dodaj okrąg pokazujący promień (domyślnie 1km)
        const radiusKm = 1;
        userLocationCircle = L.circle([lat, lng], {
          radius: radiusKm * 1000, // promień w metrach
          color: '#3b82f6',
          fillColor: '#93c5fd',
          fillOpacity: 0.1,
          weight: 2,
          dashArray: '5, 5'
        }).addTo(map);

        // Wycentruj mapę na lokalizacji użytkownika
        map.setView([lat, lng], 14);

        // Policz punkty w promieniu
        const pointsInRadius = countPointsInRadius(lat, lng, radiusKm);
        
        // Pokaż panel z informacjami
        showLocationInfo(lat, lng, pointsInRadius, radiusKm);

        console.log('📍 Lokalizacja użytkownika:', lat, lng, 'Dokładność:', accuracy, 'metrów');
      },
      function(error) {
        // Ukryj loading
        if (loadingOverlay) {
          loadingOverlay.style.display = 'none';
        }

        let errorMessage = 'Nie udało się pobrać lokalizacji. ';
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMessage += 'Odmówiono dostępu do lokalizacji.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage += 'Lokalizacja niedostępna.';
            break;
          case error.TIMEOUT:
            errorMessage += 'Przekroczono czas oczekiwania.';
            break;
          default:
            errorMessage += 'Nieznany błąd.';
            break;
        }
        alert(errorMessage);
        console.error('❌ Błąd geolokalizacji:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  function countPointsInRadius(userLat, userLng, radiusKm) {
    let count = 0;
    geojsonFeatures.forEach(feature => {
      if (feature.geometry && feature.geometry.coordinates) {
        const pointLat = feature.geometry.coordinates[1];
        const pointLng = feature.geometry.coordinates[0];
        const distance = calculateDistance(userLat, userLng, pointLat, pointLng);
        if (distance <= radiusKm) {
          count++;
        }
      }
    });
    return count;
  }

  function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // promień Ziemi w km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  function showLocationInfo(lat, lng, pointCount, radius) {
    // Usuń poprzedni panel jeśli istnieje
    if (locationInfoPanel) {
      locationInfoPanel.remove();
    }

    // Utwórz panel informacyjny
    locationInfoPanel = document.createElement('div');
    locationInfoPanel.id = 'locationInfoPanel';
    locationInfoPanel.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(31, 41, 55, 0.95);
      backdrop-filter: blur(15px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 15px;
      color: white;
      z-index: 1500;
      width: 280px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
      text-align: left;
      font-size: 14px;
    `;

    locationInfoPanel.innerHTML = `
      <h4 style="color: #60a5fa; margin: 0 0 12px 0; font-size: 16px;">📍 Twoja lokalizacja</h4>
      <p style="margin: 0 0 8px 0; color: #d1d5db; font-size: 12px;">
        <strong>Współrzędne:</strong> ${lat.toFixed(4)}, ${lng.toFixed(4)}
      </p>
      <p style="margin: 0 0 12px 0; color: #d1d5db;">
        <strong>Punktów w promieniu ${radius} km:</strong>
        <span style="color: #10b981; font-weight: bold; margin-left: 5px;">${pointCount}</span>
      </p>
      <div style="display: flex; gap: 5px; margin-bottom: 10px; flex-wrap: wrap;">
        <button onclick="changeRadius(0.5)" style="padding: 4px 8px; background: ${radius === 0.5 ? '#3b82f6' : '#374151'}; border: 1px solid #4b5563; border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">0.5km</button>
        <button onclick="changeRadius(1)" style="padding: 4px 8px; background: ${radius === 1 ? '#3b82f6' : '#374151'}; border: 1px solid #4b5563; border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">1km</button>
        <button onclick="changeRadius(2)" style="padding: 4px 8px; background: ${radius === 2 ? '#3b82f6' : '#374151'}; border: 1px solid #4b5563; border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">2km</button>
        <button onclick="changeRadius(5)" style="padding: 4px 8px; background: ${radius === 5 ? '#3b82f6' : '#374151'}; border: 1px solid #4b5563; border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">5km</button>
      </div>
      <button onclick="closeLocationInfo()" style="width: 100%; padding: 6px; background: #ef4444; border: none; border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">✕ Zamknij</button>
    `;

    document.body.appendChild(locationInfoPanel);
  }

  window.changeRadius = function(newRadiusKm) {
    if (!userLocationMarker || !userLocationCircle) return;

    const userLatLng = userLocationMarker.getLatLng();
    
    // Usuń poprzedni okrąg
    map.removeLayer(userLocationCircle);
    
    // Dodaj nowy okrąg
    userLocationCircle = L.circle(userLatLng, {
      radius: newRadiusKm * 1000,
      color: '#3b82f6',
      fillColor: '#93c5fd',
      fillOpacity: 0.1,
      weight: 2,
      dashArray: '5, 5'
    }).addTo(map);

    // Przelicz punkty w nowym promieniu
    const pointsInRadius = countPointsInRadius(userLatLng.lat, userLatLng.lng, newRadiusKm);
    
    // Zaktualizuj panel
    showLocationInfo(userLatLng.lat, userLatLng.lng, pointsInRadius, newRadiusKm);
  };

  window.closeLocationInfo = function() {
    if (locationInfoPanel) {
      locationInfoPanel.remove();
      locationInfoPanel = null;
    }
    
    // Opcjonalnie usuń markery lokalizacji
    if (userLocationMarker) {
      map.removeLayer(userLocationMarker);
      userLocationMarker = null;
    }
    if (userLocationCircle) {
      map.removeLayer(userLocationCircle);
      userLocationCircle = null;
    }
  };

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

    // Track client profile view
    logActivity('open', 'client', `${imie}_${telefon}`, {
      name: imie,
      telefon: telefon,
      handlowiec: client.handlowiec,
      projektant: client.projektant,
      action_type: 'view_client_profile'
    });

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
      <button class="btn btn-primary" onclick="zoomToClient('${client.imie}', '${client.projektant}', '${client.projekt.match(/<b>Adres:<\/b>\s*(.*?)<br>/)?.[1] || ''}', '${client.projekt.match(/<b>Działka:<\/b>\s*(.*?)<br>/)?.[1] || ''}')">
  📍 Pokaż na pinezkę
</button>

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


// 📍 Znajdź pinezkę na podstawie projektanta, adresu i działki
window.zoomToClient = function(name, projektant, adres = '', dzialka = '') {
  // Szukaj tylko jeśli wszystko dostępne
  if (!projektant || !adres || !dzialka) {
    alert("Brakuje danych do znalezienia lokalizacji.");
    return;
  }

  const match = geojsonFeatures.find(f => {
    const popup = f.properties?.popup || "";
    return popup.includes(projektant) && popup.includes(adres) && popup.includes(dzialka);
  });

  if (!match) {
    alert("Nie znaleziono lokalizacji klienta.");
    return;
  }

  const [lng, lat] = match.geometry.coordinates;
  const marker = L.marker([lat, lng]).addTo(map);
  marker.bindPopup(`<b>${name}</b><br>${adres}<br>${dzialka}`).openPopup();
  map.setView([lat, lng], 16);
};





});
