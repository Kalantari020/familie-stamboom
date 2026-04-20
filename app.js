// ============================================================
// VERSION + AUTO-REFRESH BIJ STALE CACHE (mobiel-vriendelijk)
// ============================================================
// Versie van deze build. Wordt vergeleken met live index.html om te
// detecteren of de mobiele browser een verouderde versie cached.
const APP_VERSION = 'v585';
(function checkForUpdate() {
  // Op pageload: vergelijk geladen versie met index.html van server
  // Als index.html een nieuwere ?v=X bevat, herlaad automatisch
  if (typeof window === 'undefined' || !window.fetch) return;
  setTimeout(async () => {
    try {
      const resp = await fetch(window.location.pathname + '?nc=' + Date.now(), { cache: 'no-store' });
      if (!resp.ok) return;
      const html = await resp.text();
      const m = html.match(/app\.js\?v=(\d+)/);
      if (!m) return;
      const liveV = parseInt(m[1]);
      const localV = parseInt(APP_VERSION.replace('v', ''));
      if (liveV > localV) {
        console.log('[Stamboom] Nieuwere versie beschikbaar (' + liveV + ' vs lokaal ' + localV + ') - herladen...');
        window.location.href = window.location.pathname + '?v=' + liveV + '&t=' + Date.now();
      }
    } catch (e) { /* offline of fout — negeer */ }
  }, 1500);
})();

// ============================================================
// CONSTANTS
// ============================================================
const NODE_W  = 180;
const NODE_H  = 100;
const H_GAP   = 50;
const V_GAP   = 90;
const PADDING = 50;
const USER_ID = 's11'; // Hakim Khan Sayedi


// ============================================================
// STATE
// ============================================================
// ============================================================
// TOEGANGSBEVEILIGING — PIN
// Gebruikt SubtleCrypto (PBKDF2) voor sterke client-side hashing.
// De hash + salt worden opgeslagen; de PIN zelf nooit.
// Wijzig de PIN via de browser console: setPinCode('jouwnieuwepin')
// ============================================================
(function pinGuard() {
  const IS_VIEW     = new URLSearchParams(window.location.search).get('view') === '1';
  const SESSION_KEY = IS_VIEW ? 'fb_sess_view'    : 'fb_sess';
  const STORE_KEY   = IS_VIEW ? 'fb_pin_view_v3'  : 'fb_pin_v3';
  const DEFAULT_PIN = IS_VIEW ? '1993'            : '5768';

  async function deriveKey(pin, salt) {
    const enc     = new TextEncoder();
    const keyMat  = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits    = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 10000 }, keyMat, 256);
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function hashPin(pin, saltHex) {
    const salt = saltHex
      ? new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h,16)))
      : crypto.getRandomValues(new Uint8Array(16));
    const hex  = await deriveKey(pin, salt);
    const sHex = Array.from(salt).map(b => b.toString(16).padStart(2,'0')).join('');
    return { hash: hex, salt: sHex };
  }

  // Initialiseer standaard PIN (2805) als er nog geen is opgeslagen
  async function ensureDefaultPin() {
    if (!localStorage.getItem(STORE_KEY)) {
      const { hash, salt } = await hashPin(DEFAULT_PIN);
      localStorage.setItem(STORE_KEY, JSON.stringify({ hash, salt }));
    }
  }

  // Publieke hulpfunctie om PIN te wijzigen via console: setPinCode('1234')
  window.setPinCode = async function(newPin) {
    if (!/^\d{4}$/.test(newPin)) { console.warn('PIN moet 4 cijfers zijn'); return; }
    const { hash, salt } = await hashPin(newPin);
    localStorage.setItem(STORE_KEY, JSON.stringify({ hash, salt }));
    sessionStorage.removeItem(SESSION_KEY);
    console.log('✅ PIN bijgewerkt. Ververs de pagina.');
  };

  async function checkSession() {
    await ensureDefaultPin();
    const stored  = JSON.parse(localStorage.getItem(STORE_KEY));
    const sessVal = sessionStorage.getItem(SESSION_KEY);
    if (sessVal === stored.hash) {
      document.getElementById('pin-screen').style.display = 'none';
      return true;
    }
    return false;
  }

  let current   = '';
  let attempts  = 0;
  let lockedUntil = 0;

  const dots    = document.querySelectorAll('.pin-dot');
  const errorEl = document.getElementById('pin-error');

  function updateDots() {
    dots.forEach((d, i) => d.classList.toggle('filled', i < current.length));
  }

  function shake() {
    const box = document.getElementById('pin-box');
    box.classList.add('shake');
    setTimeout(() => box.classList.remove('shake'), 500);
  }

  async function trySubmit() {
    const now = Date.now();
    if (now < lockedUntil) {
      const secs = Math.ceil((lockedUntil - now) / 1000);
      errorEl.textContent = `Te veel pogingen. Wacht ${secs}s.`;
      current = ''; updateDots(); return;
    }
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (!stored.hash) return;
    const { hash } = await hashPin(current, stored.salt);
    if (hash === stored.hash) {
      attempts = 0;
      sessionStorage.setItem(SESSION_KEY, stored.hash);
      const screen = document.getElementById('pin-screen');
      screen.classList.add('fade-out');
      setTimeout(() => screen.style.display = 'none', 400);
    } else {
      attempts++;
      if (attempts >= 5) {
        lockedUntil = Date.now() + 30000;
        errorEl.textContent = 'Te veel pogingen. Wacht 30 seconden.';
        attempts = 0;
      } else {
        errorEl.textContent = `Onjuiste code (${5 - attempts} pogingen over)`;
      }
      shake();
      current = ''; updateDots();
      setTimeout(() => { errorEl.textContent = ''; }, 3000);
    }
  }

  const keypad = document.getElementById('pin-keypad');
  let lastPointerAt = 0;
  function handleKey(val) {
    if (val === 'clear') {
      current = current.slice(0, -1);
    } else if (val === 'ok') {
      if (current.length === 4) { updateDots(); trySubmit(); return; }
    } else if (current.length < 4) {
      current += val;
      if (current.length === 4) { updateDots(); trySubmit(); return; }
    }
    updateDots();
  }
  keypad.addEventListener('pointerdown', e => {
    const btn = e.target.closest('.pin-key');
    if (!btn) return;
    e.preventDefault();
    lastPointerAt = Date.now();
    handleKey(btn.dataset.val);
  });
  keypad.addEventListener('click', e => {
    if (Date.now() - lastPointerAt < 500) return;
    const btn = e.target.closest('.pin-key');
    if (!btn) return;
    handleKey(btn.dataset.val);
  });

  document.addEventListener('keydown', e => {
    if (document.getElementById('pin-screen').style.display === 'none') return;
    if (/^[0-9]$/.test(e.key) && current.length < 4) {
      current += e.key;
      updateDots();
      if (current.length === 4) trySubmit();
    } else if (e.key === 'Backspace') {
      current = current.slice(0, -1);
      updateDots();
    } else if (e.key === 'Enter' && current.length === 4) {
      trySubmit();
    }
  });

  // Lokaal (file://) = geen PIN nodig, direct toegang
  if (window.location.protocol === 'file:') {
    document.getElementById('pin-screen').style.display = 'none';
    return;
  }

  // Start: check bestaande sessie
  checkSession();
})();

// ============================================================
// STATE
// ============================================================
let state = { persons: [], relationships: [] };
let zoom = 1;
let currentEditId = null;
let confirmCallback = null;
let lastPositions = {};
let activeTreeId = null; // null = toon alles
let goldenPath = null;
// {
//   sourceId: string,
//   sourceGhostKey: string|null,
//   pathIds: Set<string>,        // alle persoon-IDs op het pad
//   edges: Set<string>,          // "childId|parentId" combinaties
//   ghostNodes: Set<string>      // ghost-keys op pad
// }
let lastDuplicates = {};
let currentPhotoData = null; // base64 of huidige foto in modal

// Ingeklapte gezinnen: Set van keys "parentId1,parentId2" (gesorteerd)
let collapsedGezinnen = new Set();
const COLLAPSED_KEY = 'fb_collapsed_gezinnen';
try {
  const saved = sessionStorage.getItem(COLLAPSED_KEY);
  if (saved) collapsedGezinnen = new Set(JSON.parse(saved));
} catch(e) {}
function saveCollapsedState() {
  try { sessionStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedGezinnen])); } catch(e) {}
}

// Verticale gezinnen-functie verwijderd (v484): niet meer gebruikt.

// Smart View modus
let smartViewMode = false;
let smartViewOrigin = false; // true als we vanuit Smart View in detail-view zitten
const SMART_KEY = 'fb_smart_view';
const ACTIVE_TREE_KEY = 'fb_active_tree';
try { smartViewMode = sessionStorage.getItem(SMART_KEY) === 'true'; } catch(e) {}
// Herstel laatst geselecteerde stamboom (anders Alle Families)
try {
  const savedTreeId = sessionStorage.getItem(ACTIVE_TREE_KEY);
  if (savedTreeId && savedTreeId !== 'null') activeTreeId = savedTreeId;
} catch(e) {}

const FAMILY_COLORS = [
  '#dc2626',  // strong red
  '#1d4ed8',  // royal blue
  '#16a34a',  // bright green
  '#7c3aed',  // purple
  '#ea580c',  // orange
  '#0891b2',  // cyan/teal
  '#c026d3',  // magenta
  '#ca8a04',  // amber/gold
  '#000000',  // black (rust voor extra spacing)
  '#475569'   // slate gray
];

// Read-only modus: ?view=1 in de URL schakelt beheer uit
const READ_ONLY = new URLSearchParams(window.location.search).get('view') === '1';

// ============================================================
// START DATA — Familie Faizi
// ============================================================
// __START_DATA_BEGIN__
const START_DATA = {"persons":[{"id":"s01","name":"Wali Mohammad Sayedi","gender":"m","birthdate":"01-07-1959","deathdate":"","family":"Sayedi","notes":"","deceased":false,"photo":null,"birthOrder":6},{"id":"s03","name":"Ajab Khan Sayedi","gender":"m","birthdate":"10-12-1988","deathdate":"","family":"Sayedi","notes":"","deceased":false,"photo":null,"birthOrder":1},{"id":"s04","name":"Sanga Hassanzai","gender":"f","birthdate":"27-06-1990","deathdate":"","family":"Hassanzai","notes":"","deceased":false},{"id":"s05","name":"Ajmal Khan Sayedi","gender":"m","birthdate":"09-11-1989","deathdate":"","family":"Sayedi","notes":"","deceased":false,"photo":null,"birthOrder":2},{"id":"s06","name":"Helai Sayedi","gender":"f","birthdate":"03-10-1991","deathdate":"","family":"Sayedi","notes":"","deceased":false,"photo":null,"birthOrder":3},{"id":"s07","name":"Gaffar Khan Rashid","gender":"m","birthdate":"02-02-1984","deathdate":"","family":"Durrani","notes":"","deceased":false,"photo":null,"birthOrder":6,"socialBirthOrder":null},{"id":"s08","name":"Benjamin Rahman Khan Rashid","gender":"m","birthdate":"25-06-2019","deathdate":"","family":"Rashid","notes":"","deceased":false},{"id":"s09","name":"Fereshta Sayedi","gender":"f","birthdate":"27-08-1992","deathdate":"","family":"Sayedi","notes":"","deceased":false,"photo":null,"birthOrder":4},{"id":"s10","name":"Jawed Sabur","gender":"m","birthdate":"15-03-1988","deathdate":"","family":"Sabur","notes":"","deceased":false},{"id":"s11","name":"Hakim Khan Sayedi","gender":"m","birthdate":"15-07-1993","deathdate":"","family":"Sayedi","notes":"","deceased":false,"photo":null,"birthOrder":5},{"id":"s12","name":"Halima Sayedi","gender":"f","birthdate":"13-06-1994","deathdate":"","family":"Sayedi","notes":"","deceased":false,"photo":null,"birthOrder":6},{"id":"s13","name":"Saleh Mohammad Raoefi","gender":"m","birthdate":"01-07-1997","deathdate":"","family":"Raoefi","notes":"","deceased":false},{"id":"s14","name":"Amira Nora Raoefi","gender":"f","birthdate":"20-07-2022","deathdate":"","family":"Raoefi","notes":"","deceased":false},{"id":"s15","name":"Lina Maryam Raoefi","gender":"f","birthdate":"08-11-2023","deathdate":"","family":"Raoefi","notes":"","deceased":false},{"id":"f01","name":"Khanaga Faizi","gender":"m","birthdate":"05-01-1965","deathdate":"","family":"Faizi","notes":"","deceased":false,"birthOrder":6},{"id":"f02","name":"Benazier Rashid","gender":"f","birthdate":"03-12-1967","deathdate":"","family":"Durrani","notes":"","deceased":false,"photo":null,"birthOrder":2,"socialBirthOrder":null},{"id":"f03","name":"Hemat Faizi","gender":"m","birthdate":"02-06-1996","deathdate":"","family":"Faizi","notes":"","deceased":false,"photo":null,"birthOrder":1},{"id":"f05","name":"Amina Faizi","gender":"f","birthdate":"17-01-2024","deathdate":"","family":"Faizi","notes":"","deceased":false},{"id":"f06","name":"Nilab Faizi","gender":"f","birthdate":"21-03-1997","deathdate":"","family":"Faizi","notes":"","deceased":false,"photo":null,"birthOrder":2},{"id":"f07","name":"Emamuddin Salehi","gender":"m","birthdate":"05-09-1989","deathdate":"","family":"Salehi","notes":"","deceased":false,"photo":null,"birthOrder":3,"socialBirthOrder":null},{"id":"f08","name":"Muhammad Salehi","gender":"m","birthdate":"10-05-2019","deathdate":"","family":"Salehi","notes":"","deceased":false},{"id":"f09","name":"Ahmad Salehi","gender":"m","birthdate":"20-06-2020","deathdate":"","family":"Salehi","notes":"","deceased":false},{"id":"f10","name":"Alia Faizi","gender":"f","birthdate":"28-09-1998","deathdate":"","family":"Faizi","notes":"","deceased":false,"photo":null,"birthOrder":3},{"id":"f11","name":"Rahimgul Salehi","gender":"m","birthdate":"25-01-1997","deathdate":"","family":"Salehi","notes":"","deceased":false,"photo":null,"birthOrder":5,"socialBirthOrder":null},{"id":"f12","name":"Zainab Salehi","gender":"f","birthdate":"07-10-2022","deathdate":"","family":"Salehi","notes":"","deceased":false},{"id":"f13","name":"Meraj Faizi","gender":"m","birthdate":"08-04-2003","deathdate":"","family":"Faizi","notes":"","deceased":false,"photo":null,"birthOrder":4},{"id":"f14","name":"Mona Saidi","gender":"f","birthdate":"","deathdate":"","family":"Saidi","notes":""},{"id":"f15","name":"Erfan Faizi","gender":"m","birthdate":"04-01-2006","deathdate":"","family":"Faizi","notes":"","deceased":false,"photo":null,"birthOrder":5},{"id":"f16","name":"Alina Faizi","gender":"f","birthdate":"25-02-2008","deathdate":"","family":"Faizi","notes":"","deceased":false,"photo":null,"birthOrder":6},{"id":"f17","name":"Hamza Faizi","gender":"m","birthdate":"18-12-2009","deathdate":"","family":"Faizi","notes":"","deceased":false,"photo":null,"birthOrder":7},{"id":"pmncyghyo65ha","name":"Mirwais Khan Wazir Sayedi","gender":"m","birthdate":"08-11-2025","deathdate":"","family":"Sayedi","notes":"","deceased":false},{"id":"pmnczpeoyc4hd","name":"Arman Haydar Khan Sabur","gender":"m","birthdate":"10-03-2025","deathdate":"","family":"Sabur","notes":"","deceased":false},{"id":"r01","name":"Abed Rahmani","gender":"m","birthdate":"01-01-1990","deathdate":"","family":"Rahmani","notes":""},{"id":"r02","name":"Shaesta Faizi","gender":"f","birthdate":"03-06-1991","deathdate":"","family":"","notes":"","deceased":false,"photo":null,"birthOrder":10,"socialBirthOrder":null},{"id":"r03","name":"Yaqub Rahmani","gender":"m","birthdate":"13-11-2019","deathdate":"","family":"Rahmani","notes":""},{"id":"r04","name":"Muzammil Rahmani","gender":"m","birthdate":"04-12-2020","deathdate":"","family":"Rahmani","notes":""},{"id":"pmnd6s4yespmb","name":"Zahra Salehi","gender":"f","family":"Salehi","birthdate":"26-01-2024","deathdate":"","notes":"","deceased":false},{"id":"pmnd79y13i65o","name":"Huzurgol Ghorbandi","gender":"m","family":"Durrani","birthdate":"01-07-1959","deathdate":"","deceased":false,"notes":"","photo":null,"birthOrder":7,"socialBirthOrder":null},{"id":"pmnd7akkugpv5","name":"Bibi Hura Qasim","gender":"f","family":"Qasim","birthdate":"02-02-1961","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmnd7bkdrm6yz","name":"Asif Khan Ghorbandi","gender":"m","family":"Ghorbandi","birthdate":"01-07-1986","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":2},{"id":"pmnd7cfmvqiff","name":"Mussa Khan Emran Ghorbandi","gender":"m","family":"Ghorbandi","birthdate":"01-07-1988","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":3},{"id":"pmnd7cuzr39r9","name":"Issa Khan Qader Ghorbandi","gender":"m","family":"Ghorbandi","birthdate":"01-07-1990","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":4},{"id":"pmnd7ej1rf33c","name":"Golgotai Ghorbandi","gender":"f","family":"Ghorbandi","birthdate":"01-07-1984","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":1},{"id":"pmnd7hzc067x0","name":"Lema Ghorbandi","gender":"f","family":"Ghorbandi","birthdate":"18-06-1995","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":6,"socialBirthOrder":null},{"id":"pmnd7janquizq","name":"Golalai Ghorbandi","gender":"f","family":"Ghorbandi","birthdate":"01-07-1992","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":5},{"id":"pmnd7n0jbe5kc","name":"Atifa Ghorbandi","gender":"f","family":"Ghorbandi","birthdate":"07-09-1996","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":7},{"id":"pmnd7o54wo1ew","name":"Shaista Ghorbandi","gender":"f","family":"Ghorbandi","birthdate":"22-07-1999","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":8},{"id":"pmnd7oyi85tgd","name":"Amena Ghorbandi","gender":"f","family":"Ghorbandi","birthdate":"27-12-2001","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":9},{"id":"pmnd7qhxj4baj","name":"Bader Khan Rashid","gender":"m","family":"Durrani","birthdate":"01-07-1980","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":4,"socialBirthOrder":null},{"id":"pmnd7shvzi3c4","name":"Beheshta Rashid","gender":"f","family":"Rashid","birthdate":"18-01-2006","deathdate":"","notes":"","deceased":false},{"id":"pmnd7t84wv60c","name":"Moqahdas Rashid","gender":"f","family":"Rashid","birthdate":"22-06-2008","deathdate":"","notes":"","deceased":false},{"id":"pmnd7u7dc1sv8","name":"Malaika Rashid","gender":"f","family":"Rashid","birthdate":"11-05-2011","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null},{"id":"pmnd7v4fly7vb","name":"Bilal Rashid","gender":"m","family":"Rashid","birthdate":"05-07-2015","deathdate":"","notes":"","deceased":false},{"id":"pmndmqi8yk35j","name":"Abdelqadir Ahmadzai","gender":"m","family":"Ahmadzai","birthdate":"04-04-1984","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmndmre7xwo3z","name":"Madina Noor Ahmadzai","gender":"f","family":"Ahmadzai","birthdate":"08-12-2016","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmndmscnasvm5","name":"Idris Omar Ahmadzai","gender":"m","family":"Ahmadzai","birthdate":"30-10-2018","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmndmt69g664c","name":"Hawa Umrah Ahmadzai","gender":"f","family":"Ahmadzai","birthdate":"10-07-2022","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmndmv0pe6bnt","name":"Mohammaddel Amiri","gender":"m","family":"Amiri","birthdate":"08-10-1957","deathdate":"","deceased":false,"notes":""},{"id":"pmndmvgb61us6","name":"Shughla Rashid","gender":"f","family":"Durrani","birthdate":"27-07-1979","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":7,"socialBirthOrder":null},{"id":"pmndmw6tmszgx","name":"Aisha Amiri","gender":"f","family":"Amiri","birthdate":"30-04-2007","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":3,"socialBirthOrder":null},{"id":"pmndmwy22inp5","name":"Alwina Amiri","gender":"f","family":"Amiri","birthdate":"24-04-2009","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":4,"socialBirthOrder":null},{"id":"pmndmxo0wy25u","name":"Khadija Amiri","gender":"f","family":"Amiri","birthdate":"27-06-2014","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":5,"socialBirthOrder":null},{"id":"pmndn04a6kp3h","name":"Kawsar Amiri","gender":"f","family":"Amiri","birthdate":"25-05-2017","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":6,"socialBirthOrder":null},{"id":"pmndn0xa5x3gg","name":"Asra Amiri","gender":"f","family":"Amiri","birthdate":"02-02-2021","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":7,"socialBirthOrder":null},{"id":"pmndn2984pmss","name":"Asma Amiri","gender":"f","family":"Amiri","birthdate":"02-01-2002","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":1},{"id":"pmndn30vhfz8r","name":"Rafi","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":1,"socialBirthOrder":null},{"id":"pmndn3i30g9js","name":"Zoya","gender":"f","family":"Amiri","birthdate":"","deathdate":"","notes":""},{"id":"pmndn3u2sqdff","name":"Zaynab","gender":"f","family":"Amiri","birthdate":"","deathdate":"","notes":""},{"id":"pmndn4sw3j1fb","name":"Husna Amiri","gender":"f","family":"Amiri","birthdate":"24-11-2001","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":2,"socialBirthOrder":null},{"id":"pmndn7m9expkq","name":"Aisya Faizi","gender":"f","family":"Faizi","birthdate":"16-09-2025","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmndnoxx6ndgz","name":"Jamal Nader Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","deceased":false,"notes":"","photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmndnpzkp3vwu","name":"Zarlakhta Rashid","gender":"f","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":3,"socialBirthOrder":null},{"id":"pmndnrdrc68lf","name":"Sejad Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":1,"socialBirthOrder":null},{"id":"pmndnrn9438x5","name":"Noman Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":2,"socialBirthOrder":null},{"id":"pmndnryswhsem","name":"Adel Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":3,"socialBirthOrder":null},{"id":"pmndns7ewdxvw","name":"Amer Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":4,"socialBirthOrder":null},{"id":"pmndnsji2txom","name":"Adam Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":5,"socialBirthOrder":null},{"id":"pmndnticv1qox","name":"Homaira Hakimi","gender":"f","family":"Hakimi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmndwllk8hld1","name":"Azghar Khan Rashid","gender":"m","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":5,"socialBirthOrder":null},{"id":"pmndwllk9fukl","name":"Davud Khan Durrani","gender":"m","family":"Durrani","birthdate":"01-10-1989","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":8,"socialBirthOrder":null},{"id":"pmndwllk96xxz","name":"Nabila","gender":"f","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":9,"socialBirthOrder":null},{"id":"pmndya3eilyn1","name":"Ahmad Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":1},{"id":"pmndya3eiti9k","name":"Mahmoed","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":2},{"id":"pmndya3eixb8j","name":"Bibigul","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":3},{"id":"pmndya3ei5vp4","name":"Ali Ahmad Salehi","gender":"m","family":"Salehi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":4},{"id":"pmndya3ei0k93","name":"Mahmad Salehi","gender":"m","family":"Salehi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":7,"socialBirthOrder":null},{"id":"pmndya3eip3zu","name":"Sheerinagah","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":8},{"id":"pmndyckredqon","name":"Fawziya","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":true,"photo":null},{"id":"pmndydlr61are","name":"Hekmatullah Salehi","gender":"m","family":"Salehi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":1,"socialBirthOrder":3},{"id":"pmndyf12hx96x","name":"Khalil Reduaon Salehi","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":1,"socialBirthOrder":null},{"id":"pmndyhcgqdpb9","name":"Zakira","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmndyjcrfva0k","name":"Ehsanullah","gender":"m","family":"Salehi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":2},{"id":"pmndyjcrg5spz","name":"Safiullah","gender":"m","family":"Salehi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":3},{"id":"pmndyjcrhx2b4","name":"Saifullah","gender":"m","family":"Salehi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":4},{"id":"pmndyjcripek7","name":"Muqadas","gender":"f","family":"Salehi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":5,"socialBirthOrder":null},{"id":"pmndyjcrjsvwo","name":"Marwa","gender":"f","family":"Salehi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":6,"socialBirthOrder":null},{"id":"pmndyjcrkl9zf","name":"Safya","gender":"f","family":"Salehi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":7,"socialBirthOrder":null},{"id":"pmndyjcrl3njh","name":"Humairah","gender":"f","family":"Salehi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":8,"socialBirthOrder":null},{"id":"pmndyrysy3eq7","name":"Sayedahmed","gender":"m","family":"Sayedi","birthdate":"","deathdate":"","notes":"","deceased":false},{"id":"pmndyryt0viez","name":"Bibi Maluka","gender":"f","family":"Sayedi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmndyxhre0zi1","name":"Mahmadgul Durrani","gender":"m","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":true,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmndyy6j6wndl","name":"Bibi Hajiro","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":true,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmnepe8ob5cod","name":"Soraya","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmnepfhttgn51","name":"Amanda Jennah Hulsbergen","gender":"f","family":"Hulsbergen","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmnepimbckf8a","name":"Jamil Ghorbandi","gender":"m","family":"Ghorbandi","birthdate":"03-02-2023","deathdate":"","notes":"","deceased":false},{"id":"pmnepimbeuxuf","name":"Zidan Ghorbandi","gender":"m","family":"Ghorbandi","birthdate":"27-11-2025","deathdate":"","notes":"","deceased":false},{"id":"pmnepl5nzikm3","name":"Muchda Kakar","gender":"f","family":"Kakar","birthdate":"11-05","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmnepmjsmeuk6","name":"Sohail Durani","gender":"m","family":"Durani","birthdate":"20-03-1994","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmnepnt0eu2k2","name":"Ezatullah Achmadzai","gender":"m","family":"Achmadzai","birthdate":"05-12-1991","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmnepp0idbklv","name":"Zunaira Dua Achmadzai","gender":"f","family":"Achmadzai","birthdate":"03-05-2025","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmneptum4xnzi","name":"Diwa Alia Miakhel","gender":"f","family":"","birthdate":"04-04-1992","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmnepytxdqi9y","name":"Mustafa Durrani","gender":"m","family":"Durrani","birthdate":"18-06-2018","deathdate":"","notes":"","deceased":false,"photo":null},{"id":"pmnepytxga1sz","name":"Mujtaba Durrani","gender":"m","family":"Durrani","birthdate":"21-12-2020","deathdate":"","notes":"","deceased":false,"photo":null},{"id":"pmnepytxh5z3q","name":"Muskaan Durrani","gender":"f","family":"Durrani","birthdate":"17-08-2022","deathdate":"","notes":"","deceased":false,"photo":null},{"id":"pmnepytxiuzsg","name":"Abud Musawwir Durrani","gender":"m","family":"Durrani","birthdate":"26-04-2024","deathdate":"","notes":"","deceased":false,"photo":null},{"id":"pmneq7p4nynu3","name":"Habib Gull Durrani","gender":"m","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":4,"socialBirthOrder":null},{"id":"pmneq7p4ss5hl","name":"Sakhi Gull Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":6,"socialBirthOrder":null},{"id":"pmneq7p4udtvl","name":"Malika Durrani","gender":"f","family":"Ghorbandi","birthdate":"01-07-1962","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":8,"socialBirthOrder":null},{"id":"pmndo2vxafahz","name":"Hagig Gull Durrani","gender":"m","family":"Durrani","birthdate":"","deathdate":"","deceased":false,"notes":"","photo":null,"birthOrder":5,"socialBirthOrder":null},{"id":"pmndo3i84yw8g","name":"Babogal Sayedi","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":5},{"id":"pmnfv2r03xoij","name":"Fatima Zahra Salehi","gender":"f","family":"Salehi","birthdate":"01-04-2026","deathdate":"","notes":"","deceased":false},{"id":"pmnfvopdootvl","name":"Haya Rashid","gender":"f","family":"Rashid","birthdate":"24-05-2021","deathdate":"","notes":"","deceased":false},{"id":"pmnfwiq4xex8n","name":"Shafiqa","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false},{"id":"pmnfwiq4xoz2k","name":"Laila","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false},{"id":"pmnfwl6r2lpes","name":"Nabi Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":1},{"id":"pmnfwl6r2k67v","name":"Sediqa Saidi","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":2},{"id":"pmnfwl6r2bl6p","name":"Zergai Said Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":3},{"id":"pmnfwl6r2i0v6","name":"Farid Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":4},{"id":"pmnfwl6r21xvr","name":"Rafi Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":5},{"id":"pmnfwl6r2gzuz","name":"Latifa Saidi","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":6},{"id":"pmnfwl6r2niud","name":"Waheed Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":7},{"id":"pmnfwpozxyoww","name":"Fereshta Saidi","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":8},{"id":"pmnfwpozxor6n","name":"Saidwali Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":9},{"id":"pmnfwpozx8uem","name":"Sardarwali Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":10},{"id":"pmnfwpozxxrih","name":"Mariam Saidi","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":11},{"id":"pmnfwpozxh323","name":"Amina Saidi","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":2},{"id":"pmnfwpozxxvot","name":"Zainab Saidi","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":13},{"id":"pmnfwpozx2yhq","name":"Fatima Saidi","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":14},{"id":"pmnfx2dl6dya9","name":"Mastora Faizi","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false},{"id":"pmnfx3knl6en8","name":"Mina Salehi","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":1},{"id":"pmnfx5u9dct4w","name":"Matiullah Salehi","gender":"m","family":"Salehi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":2,"socialBirthOrder":2},{"id":"pmnfx5u9dbm8a","name":"Nasratullah Salehi","gender":"m","family":"Salehi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":2,"socialBirthOrder":4},{"id":"pmnfx8zrswvz9","name":"Davud Sediqi","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false},{"id":"pmnfxa0in4tc9","name":"Ibrahim Sediqi","gender":"m","family":"Sediqi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmnfxa0io0z5u","name":"Maryam Sediqi","gender":"f","family":"Sediqi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmnfxa0iou6j0","name":"Sarah Sediqi","gender":"f","family":"Sediqi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmnfxaot46h83","name":"Tahmina Salehi","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false},{"id":"pmnfxbasnb3sh","name":"Abdurrahman Salehi","gender":"m","family":"Salehi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmnfxbasnbq7c","name":"Abdullah Saledhi","gender":"m","family":"Salehi","birthdate":"","deathdate":"","notes":"","deceased":false,"photo":null,"birthOrder":null,"socialBirthOrder":null},{"id":"pmni01k22obxh","name":"Haajar Rashid","gender":"f","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmni01k23erra","name":"Yahya Rashid","gender":"m","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmni01k24zyhf","name":"Omar Rashid","gender":"m","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmni01k25pnza","name":"Iqra Rashid","gender":"f","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmni053i84su6","name":"Sarah Saidi","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmni053iamxzp","name":"Sama Saidi","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmni053icew6m","name":"Hafsa Saidi","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmni053ie8pn9","name":"Yaqub Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmni053ifs7ju","name":"Ishaq Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null},{"id":"pmni053ih3c7e","name":"Safia Saidi","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null},{"id":"pmni06p0ji4hg","name":"Laila Babo","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmni0aw5mfovo","name":"Mergalela Durrani","gender":"f","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null,"photo":null},{"id":"pmni0aw5rt7j6","name":"Habibrahman Durrani","gender":"m","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null,"photo":null},{"id":"pmni0aw5t19yo","name":"Saifrahman Durrani","gender":"m","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null,"photo":null},{"id":"pmni0aw5wzj12","name":"Parwana Durrani","gender":"f","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null,"photo":null},{"id":"pmni0aw5zil6x","name":"Asina Durrani","gender":"f","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null,"photo":null},{"id":"pmni0aw61wfnn","name":"Samia Durrani","gender":"f","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":7,"socialBirthOrder":null,"photo":null},{"id":"pmni0aw63vtas","name":"Malalai Durrani","gender":"f","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null,"photo":null},{"id":"pmni0byqqbuqw","name":"Shirnagha","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmni0d7t09vcm","name":"Baryalai","gender":"m","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null,"photo":null},{"id":"pmni0d7t6qrt0","name":"Khalid","gender":"m","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null,"photo":null},{"id":"pmni0d7t9876w","name":"Abubakr","gender":"m","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null,"photo":null},{"id":"pmni0d7tck3oc","name":"Marwa","gender":"f","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null,"photo":null},{"id":"pmni0dr4npt6r","name":"Abdullah","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmni0e8yfpn37","name":"Zaiynab","gender":"f","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null,"photo":null},{"id":"pmni0fiiiy1qs","name":"Ferdaws","gender":"m","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null,"photo":null},{"id":"pmni0mtna5vxw","name":"Fazelahmad","gender":"m","family":"","birthdate":"","deathdate":"","deceased":true,"photo":null,"notes":"","birthOrder":null,"socialBirthOrder":null},{"id":"pmni0nrmgl4he","name":"Bibi Shazada","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":true,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmni0s7et7v3g","name":"Sanama","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmni0s7etaht7","name":"Ilas","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmni0s7etyv3g","name":"Agha Gol","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmni0s7ety1t7","name":"Akhamier","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null,"photo":null},{"id":"pmni0s7etwzn0","name":"Amien","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null,"photo":null},{"id":"pmni0s7etpgpa","name":"Candagah","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmni0tu13oc3d","name":"Shoroh","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmni0tu14jfoi","name":"Kazem","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmni0tu14y8tb","name":"Nazem","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmni0tu14n6g5","name":"Golalai of Toryolay?","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmni0tu14seye","name":"Hamida","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmni0tu141lkn","name":"Farzana","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmni0tu14q8j4","name":"Shazia","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmni0v8ui9mjd","name":"Zakira","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null,"photo":null},{"id":"pmni0v8uiepz0","name":"Najiba","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null,"photo":null},{"id":"pmni0v8uiu40k","name":"Firoz Khan","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null,"photo":null},{"id":"pmni0v8uiimus","name":"Ghiyal","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null,"photo":null},{"id":"pmni0v8uierpw","name":"Farhad","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null,"photo":null},{"id":"pmni0v8ui7vpw","name":"Fawad","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null,"photo":null},{"id":"pmni0v8uihcrv","name":"Khaybar","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":7,"socialBirthOrder":null,"photo":null},{"id":"pmni0xjxqp5fh","name":"Nasrina","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null,"photo":null},{"id":"pmni0xjxqgts8","name":"Marjam","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null,"photo":null},{"id":"pmni0xjxq42rt","name":"Samirah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null,"photo":null},{"id":"pmni0xjxq3aqh","name":"Fazzerrahman","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null,"photo":null},{"id":"pmni0xjxqy5q5","name":"Shamila","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":7,"socialBirthOrder":null,"photo":null},{"id":"pmni0xjxqh0e7","name":"Ubaidah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":8,"socialBirthOrder":null,"photo":null},{"id":"pmni10qwrkobm","name":"Nazifa","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmni10qws5lcv","name":"Nader","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmni10qwsq7q9","name":"Shaista","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null,"photo":null},{"id":"pmni10qws94io","name":"Hasinah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null,"photo":null},{"id":"pmni10qwsu0z7","name":"Naser","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null},{"id":"pmni10qwsgyfr","name":"Mansoor","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":7,"socialBirthOrder":null},{"id":"pmni14pya5f9h","name":"Mirwais","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmni14pyarspx","name":"Moniqa","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmni14pyav3jq","name":"Emal","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmni14pyaujp1","name":"Faisal","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmni14pyai87w","name":"Heejrat","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null},{"id":"pmo007gyaqm2k","name":"Aqsa Hanifa","gender":"f","family":"Salehi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo0h2kl0159h","name":"Fahim","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null,"photo":null},{"id":"pmo34v17r5l0j","name":"Rabia Rashid","gender":"f","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmo34ycr3rguf","name":"Ayoub Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null,"photo":null},{"id":"pmo34ycr7lser","name":"Nawaab Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null,"photo":null},{"id":"pmo34ycrdz5uf","name":"Zavar Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null,"photo":null},{"id":"pmo34ycrhfbhs","name":"Spogme Rashid","gender":"f","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null,"photo":null},{"id":"pmo34ycrl4b8j","name":"Store","gender":"f","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null,"photo":null},{"id":"pmo34ycrplrzh","name":"Mohabbat","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null,"photo":null},{"id":"pmo34ycrwm0ax","name":"Hejrat","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":7,"socialBirthOrder":null,"photo":null},{"id":"pmo34z25i1fky","name":"Nazifa","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmo350x9zbuxz","name":"Mashal Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null,"photo":null},{"id":"pmo350xa4any3","name":"Maiwand Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null,"photo":null},{"id":"pmo350xa8twge","name":"Morsal Rashid","gender":"f","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null,"photo":null},{"id":"pmo350xacwuzv","name":"Yousuf Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null,"photo":null},{"id":"pmo350xag72uv","name":"Ashraf Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null,"photo":null},{"id":"pmo350xaj9g7p","name":"Momina Rashid","gender":"f","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null,"photo":null},{"id":"pmo351h5beg9f","name":"Samira Rashid","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmo352v2f85e1","name":"Hadya Rashid","gender":"f","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null,"photo":null},{"id":"pmo352v2m7cyp","name":"Madinah Rashid","gender":"f","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null,"photo":null},{"id":"pmo352v2qd6mg","name":"Sanna Rashid","gender":"f","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null,"photo":null},{"id":"pmo352v2v4165","name":"Ismail Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null,"photo":null},{"id":"pmo352v30t7ge","name":"Yousra Rashid","gender":"f","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null,"photo":null},{"id":"pmo353ouw5u1k","name":"Azima","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmo354mcnbz26","name":"Sulaiman Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null,"photo":null},{"id":"pmo354mcujmgy","name":"Zainab Rashid","gender":"f","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null,"photo":null},{"id":"pmo354mczv982","name":"Marwa Rashid","gender":"f","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null,"photo":null},{"id":"pmo3552jz6uwr","name":"Khaybar","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmo3561dkcpxd","name":"Zikria","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null,"photo":null},{"id":"pmo3561dq8ahj","name":"Mariam","gender":"f","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null,"photo":null},{"id":"pmo357kjbhmd5","name":"Zavar","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmo358jhjmb83","name":"Burhan Rashid","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null,"photo":null},{"id":"pmo358jhpzptz","name":"Kawsar Rashid","gender":"f","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null,"photo":null},{"id":"pmo358vl3n6yf","name":"Didar","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmo359q5jrkg1","name":"Mujda","gender":"f","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null,"photo":null},{"id":"pmo359q5q3jz9","name":"Osman","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null,"photo":null},{"id":"pmo35a6zz26rc","name":"Lina","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmo49w9tiqty7","name":"Mohammad","gender":"m","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null,"photo":null},{"id":"pmo4a1a67tuyw","name":"Yunus","gender":"m","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null,"photo":null},{"id":"pmo4a26jk7k5x","name":"Raana Rashid","gender":"f","family":"Rashid","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null,"photo":null},{"id":"pmo4abxn5ihq5","name":"Rahimgul Durrani","gender":"m","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null,"photo":null},{"id":"pmo4acfl57fx5","name":"Hamidgul","gender":"m","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null,"photo":null},{"id":"pmo4adrr9bkk1","name":"Sarah Durrani","gender":"f","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null,"photo":null},{"id":"pmo4ahx86c7rh","name":"??","gender":"m","family":"Durrani","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null,"photo":null},{"id":"pmo4su8c7xqg0","name":"Ruqiyah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4supk01lh5","name":"Mohammad Amien","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4sw6rkvo1k","name":"Sardara","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4szd62qiup","name":"Bibirawza","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4szd632k5i","name":"Deenmahmad","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4szd63w9un","name":"Neekmahmad","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4szd63jn8i","name":"Noormahmad","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmo4szd63ws4w","name":"Lutfullah","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null},{"id":"pmo4t07f8o0lo","name":"Allahmahmad","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4t2s73wzcp","name":"Babo","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null,"photo":null},{"id":"pmo4t2s73iom6","name":"Rahima","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null,"photo":null},{"id":"pmo4t2s73omvz","name":"Rahiema","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null,"photo":null},{"id":"pmo4t2s73j77q","name":"Sharief","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null,"photo":null},{"id":"pmo4t2s73rsl9","name":"Abderrahiem","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":7,"socialBirthOrder":null,"photo":null},{"id":"pmo4t2s73sf3c","name":"Fatima","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null},{"id":"pmo4t2s73uerq","name":"Hamed","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":8,"socialBirthOrder":null,"photo":null},{"id":"pmo4tjfzukw6f","name":"Omid","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4tkhyjlb4b","name":"Ibrahim Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4tlndgesy8","name":"Maria","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4tnohqn8eh","name":"Abdullah Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4tnohtq4o0","name":"Yusuf Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4tnohv1bc0","name":"Sannah Saidi","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4tnohyzf86","name":"Madina Saidi","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmo4tnoi01vyn","name":"Saleh Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null},{"id":"pmo4tnoi2nco0","name":"Isa Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null},{"id":"pmo4tnoi53dc8","name":"Idris Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":7,"socialBirthOrder":null},{"id":"pmo4tqukpwhe3","name":"Salma","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4tu4zyqlgu","name":"Milad Saidi","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmo4tv65lojwy","name":"Mumin Aisha Saidi","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null,"photo":null},{"id":"pmo4txoa8ol14","name":"Silsila","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4ty3cwvfaj","name":"Khadija Saidi","gender":"f","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4u0rpbm1wn","name":"NAVRAGEN","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4u1b0rwt71","name":"Hasanaat","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4u21q3m2zy","name":"NAVRAGEN?","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4u2pw7zjnf","name":"Abu Bakr","gender":"m","family":"Saidi","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4u647klb92","name":"Mulla","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4u96zph9n5","name":"Fatima","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null,"photo":null},{"id":"pmo4ucl28pqjj","name":"Zarifa","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null,"photo":null},{"id":"pmo4uctew3mow","name":"Sardar","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4ud9jg0tmt","name":"Amirdeen","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4ufn9y0ahn","name":"Noorullah","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4ufxpzbouu","name":"Qudrat","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4uhm5mmib3","name":"Zus van Nasriena??","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4uhy1e7hvn","name":"Uitzoeken??","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4ui8vvr8db","name":"Uitzoeken???","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4uiz4fgqk4","name":"Shah Sultana","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4ukqv90teo","name":"Abdullah","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4ukqv97tr8","name":"Hamied","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4ukqv901b9","name":"Ahdulhadi","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4ukqv9yug2","name":"Karima","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmo4ukqv99usn","name":"Fazela","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null},{"id":"pmo4uo5dgmtlx","name":"Talha","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4uo5dgha11","name":"Sanna","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4uo5dgc3b8","name":"Habiba","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4uo5dglrux","name":"Mohammad","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmo4uo5dgy46j","name":"Afiya","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null},{"id":"pmo4uo5dg4vji","name":"Sarah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null},{"id":"pmo4uo5dgl0fe","name":"Hafisa","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":7,"socialBirthOrder":null},{"id":"pmo4uo5dgp42t","name":"Aisha","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":8,"socialBirthOrder":null},{"id":"pmo4uou2dx2vf","name":"Qais","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4uu2cqnft3","name":"Shafi","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4uu2cq2lpc","name":"Farzana","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmo4uu2cqsbf5","name":"Frunaaz","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null},{"id":"pmo4uu2cqoyhk","name":"Shuiab","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null},{"id":"pmo4uu2cqp1pf","name":"Noeriya","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":7,"socialBirthOrder":null},{"id":"pmo4uu2cq5qe2","name":"Shukriya","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":7,"socialBirthOrder":null},{"id":"pmo4uvvnnu1ci","name":"Abu Zhar","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4uvvnn3c4e","name":"Sumayah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4uvvnn5wxq","name":"Sama","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4uyms1yfxm","name":"Aziza","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4uzq511aub","name":"Anas","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4uzq51bp93","name":"Basit","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4uzq513h5w","name":"Mariam","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4uzq51eqjf","name":"Hamzah","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmo4v10zvm6sl","name":"Hafiz","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4v10zwor2y","name":"Hanief","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4v10zwmzpy","name":"Muhammad","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4v10zwgs3c","name":"Saleh Zahid","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmo4v10zwtuom","name":"Rahiel","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null},{"id":"pmo4v4r3i85jz","name":"Daad Mahmad","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4v6ag4btzt","name":"Shuaib","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4v6ag5tbeg","name":"Tayba","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4v6ag5yshe","name":"Yaser","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4v6ag5y6kb","name":"Beheshta","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmo4v6ag5kd8o","name":"Madina","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null},{"id":"pmo4v6ag5b5bp","name":"Omar","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null},{"id":"pmo4vafk9ne7l","name":"Mur'awey","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4vpgqhm6yf","name":"Shakargul","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4vq95k7dyj","name":"Naqib","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4vqmi2wfp4","name":"Kubrah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4vr6r2vi98","name":"Fereshta","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4w4s6vuvgz","name":"Emran","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4w4s6vkh69","name":"Mujieb","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4w4s6vrg8q","name":"Ismai'iel","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4w4s6vss7k","name":"Hajatullah","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmo4w5y12nsjo","name":"Yunus","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4w5y12cae6","name":"Shahied","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4w5y12507h","name":"Basit","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4w5y12b1h5","name":"Yusrah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmo4w6fakq8md","name":"Asif","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4w72fa5g45","name":"Mahmad Naiem","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4w72fa19ws","name":"Shikiba","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4w98msm30i","name":"Katoray","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4wbnzfjghc","name":"Breshna","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4wc2jwpi7w","name":"Muhammad Ali","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4wchtwvh9c","name":"Suhaila","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4wdt6k43c8","name":"Mirhan","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4wdt6kdksz","name":"Sirat","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4wdt6krvxa","name":"Sufrah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4wdt6kzel5","name":"Aisha","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmo4weihvuabj","name":"Taha Khaliel","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4weihvk4lp","name":"Hafsa Fatimah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4wfjlerx9r","name":"Nazriya","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4wmwkisp4b","name":"Subhanallah","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4wnqt5sjf7","name":"Khoja","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4wo9v600oy","name":"Benafsha","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4wor2wvrjj","name":"Firdaus","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4wor2wihti","name":"Iman","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4wpxi0f3um","name":"Nazifa","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4wqumxm2vm","name":"Basit","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4wqumxcirr","name":"Nieuwe kind?","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4wrv2hr3pk","name":"Moqadas","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4wrv2hslwp","name":"Mustafa","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4wrv2hxrd0","name":"Nog eentje?","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4wveblf5x5","name":"Hedayatullah","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4wveblcjbe","name":"Inaytullah","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4wvebloqky","name":"Abu Bakr","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4wvebltb8q","name":"Kauthar","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmo4wveblrmqi","name":"nog een meisje?","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null},{"id":"pmo4wvebl2zvm","name":"Nog een meisje??","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null},{"id":"pmo4wwjpk1bd3","name":"Qais","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4wyoiqmfi7","name":"Fatema","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4x48qp13uy","name":"Mahmad Sherien","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4x5y2qnpps","name":"Nasibah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4x5y2qdylg","name":"Abdul Wares","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4x5y2qxoih","name":"Abdul Shakur","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4x5y2qytl3","name":"Abdul Saboor","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmo4x5y2qi17y","name":"Hadiya","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null},{"id":"pmo4x5y2qeicw","name":"Aisha","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null},{"id":"pmo4x5y2qvd6t","name":"Hoera","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4x78d6od26","name":"Shahmahmoed","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4x88upl6ua","name":"Zahrah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":1,"socialBirthOrder":null},{"id":"pmo4x88up7i7r","name":"Zohrah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4x88upxoul","name":"Sumayyah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4x88up5ikb","name":"Khadija","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmo4x9ugigsr6","name":"Mariam","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4xeqmrsud9","name":"Gulsherien","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false},{"id":"pmo4xkx7hr4du","name":"Ma'lim","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4xvsspw66y","name":"Gulsuma","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4xvsspty1z","name":"Malala","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4xwldcsefq","name":"Rahiemgul","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4xwwkoq57t","name":"Musafir","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4xxff5byvg","name":"Gulbushrah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4xy7vm7yae","name":"Zahir","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo4yhshfrk8r","name":"Idries","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4yhshfg8bw","name":"Ziyuldeen","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":2,"socialBirthOrder":null},{"id":"pmo4yhshfiqj9","name":"Noman","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":3,"socialBirthOrder":null},{"id":"pmo4yhshfnakz","name":"Hanzalah","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":4,"socialBirthOrder":null},{"id":"pmo4yhshfchtu","name":"Hajaj","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":5,"socialBirthOrder":null},{"id":"pmo4yhshfqlrh","name":"A'ridh","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":6,"socialBirthOrder":null},{"id":"pmo4yhshfcij8","name":"Khadija","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":7,"socialBirthOrder":null},{"id":"pmo4yhshf4aid","name":"Sajidah","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":8,"socialBirthOrder":null},{"id":"pmo70z4rspi7d","name":"KInd 1","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo70z4rsajz3","name":"kind 2","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo70z4rs3c8z","name":"kind 3","gender":"m","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo70zlol6io2","name":"Vrouw Faisal?","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null},{"id":"pmo71019rdde4","name":"Vrouw Heejrat?","gender":"f","family":"","birthdate":"","deathdate":"","notes":"","deceased":false,"birthOrder":null,"socialBirthOrder":null}],"relationships":[{"type":"partner","person1Id":"s01","person2Id":"pmneq7p4udtvl"},{"type":"partner","person1Id":"s03","person2Id":"s04"},{"type":"partner","person1Id":"s06","person2Id":"s07"},{"type":"partner","person1Id":"s09","person2Id":"s10"},{"type":"partner","person1Id":"s12","person2Id":"s13"},{"type":"parent-child","parentId":"s01","childId":"s03"},{"type":"parent-child","parentId":"pmneq7p4udtvl","childId":"s03"},{"type":"parent-child","parentId":"s01","childId":"s05"},{"type":"parent-child","parentId":"pmneq7p4udtvl","childId":"s05"},{"type":"parent-child","parentId":"s01","childId":"s06"},{"type":"parent-child","parentId":"pmneq7p4udtvl","childId":"s06"},{"type":"parent-child","parentId":"s01","childId":"s09"},{"type":"parent-child","parentId":"pmneq7p4udtvl","childId":"s09"},{"type":"parent-child","parentId":"s01","childId":"s11"},{"type":"parent-child","parentId":"pmneq7p4udtvl","childId":"s11"},{"type":"parent-child","parentId":"s01","childId":"s12"},{"type":"parent-child","parentId":"pmneq7p4udtvl","childId":"s12"},{"type":"parent-child","parentId":"s06","childId":"s08"},{"type":"parent-child","parentId":"s07","childId":"s08"},{"type":"parent-child","parentId":"s12","childId":"s14"},{"type":"parent-child","parentId":"s13","childId":"s14"},{"type":"parent-child","parentId":"s12","childId":"s15"},{"type":"parent-child","parentId":"s13","childId":"s15"},{"type":"partner","person1Id":"f01","person2Id":"f02"},{"type":"partner","person1Id":"f03","person2Id":"pmndn4sw3j1fb"},{"type":"partner","person1Id":"f06","person2Id":"f07"},{"type":"partner","person1Id":"f10","person2Id":"f11"},{"type":"partner","person1Id":"f13","person2Id":"f14"},{"type":"parent-child","parentId":"f01","childId":"f03"},{"type":"parent-child","parentId":"f02","childId":"f03"},{"type":"parent-child","parentId":"f01","childId":"f06"},{"type":"parent-child","parentId":"f02","childId":"f06"},{"type":"parent-child","parentId":"f01","childId":"f10"},{"type":"parent-child","parentId":"f02","childId":"f10"},{"type":"parent-child","parentId":"f01","childId":"f13"},{"type":"parent-child","parentId":"f02","childId":"f13"},{"type":"parent-child","parentId":"f01","childId":"f15"},{"type":"parent-child","parentId":"f02","childId":"f15"},{"type":"parent-child","parentId":"f01","childId":"f16"},{"type":"parent-child","parentId":"f02","childId":"f16"},{"type":"parent-child","parentId":"f01","childId":"f17"},{"type":"parent-child","parentId":"f02","childId":"f17"},{"type":"parent-child","parentId":"f03","childId":"f05"},{"type":"parent-child","parentId":"pmndn4sw3j1fb","childId":"f05"},{"type":"parent-child","parentId":"f06","childId":"f08"},{"type":"parent-child","parentId":"f07","childId":"f08"},{"type":"parent-child","parentId":"f06","childId":"f09"},{"type":"parent-child","parentId":"f07","childId":"f09"},{"type":"parent-child","parentId":"f10","childId":"f12"},{"type":"parent-child","parentId":"f11","childId":"f12"},{"type":"parent-child","parentId":"s03","childId":"pmncyghyo65ha"},{"type":"parent-child","parentId":"s04","childId":"pmncyghyo65ha"},{"type":"parent-child","parentId":"s09","childId":"pmnczpeoyc4hd"},{"type":"parent-child","parentId":"s10","childId":"pmnczpeoyc4hd"},{"type":"partner","person1Id":"r01","person2Id":"r02"},{"type":"parent-child","parentId":"r01","childId":"r03"},{"type":"parent-child","parentId":"r02","childId":"r03"},{"type":"parent-child","parentId":"r01","childId":"r04"},{"type":"parent-child","parentId":"r02","childId":"r04"},{"type":"parent-child","parentId":"f03","childId":"pmndn7m9expkq"},{"type":"parent-child","parentId":"pmndn4sw3j1fb","childId":"pmndn7m9expkq"},{"type":"partner","person1Id":"f16","person2Id":"pmndnrn9438x5"},{"type":"parent-child","parentId":"f10","childId":"pmnd6s4yespmb"},{"type":"parent-child","parentId":"f11","childId":"pmnd6s4yespmb"},{"type":"partner","person1Id":"pmnd79y13i65o","person2Id":"pmnd7akkugpv5"},{"type":"parent-child","parentId":"pmnd79y13i65o","childId":"pmnd7bkdrm6yz"},{"type":"parent-child","parentId":"pmnd7akkugpv5","childId":"pmnd7bkdrm6yz"},{"type":"parent-child","parentId":"pmnd79y13i65o","childId":"pmnd7cfmvqiff"},{"type":"parent-child","parentId":"pmnd7akkugpv5","childId":"pmnd7cfmvqiff"},{"type":"parent-child","parentId":"pmnd79y13i65o","childId":"pmnd7cuzr39r9"},{"type":"parent-child","parentId":"pmnd7akkugpv5","childId":"pmnd7cuzr39r9"},{"type":"parent-child","parentId":"pmnd79y13i65o","childId":"pmnd7ej1rf33c"},{"type":"parent-child","parentId":"pmnd7akkugpv5","childId":"pmnd7ej1rf33c"},{"type":"parent-child","parentId":"pmnd79y13i65o","childId":"pmnd7hzc067x0"},{"type":"parent-child","parentId":"pmnd7akkugpv5","childId":"pmnd7hzc067x0"},{"type":"parent-child","parentId":"pmnd7akkugpv5","childId":"pmnd7janquizq"},{"type":"parent-child","parentId":"pmnd79y13i65o","childId":"pmnd7janquizq"},{"type":"parent-child","parentId":"pmnd79y13i65o","childId":"pmnd7n0jbe5kc"},{"type":"parent-child","parentId":"pmnd7akkugpv5","childId":"pmnd7n0jbe5kc"},{"type":"parent-child","parentId":"pmnd79y13i65o","childId":"pmnd7o54wo1ew"},{"type":"parent-child","parentId":"pmnd7akkugpv5","childId":"pmnd7o54wo1ew"},{"type":"parent-child","parentId":"pmnd79y13i65o","childId":"pmnd7oyi85tgd"},{"type":"parent-child","parentId":"pmnd7akkugpv5","childId":"pmnd7oyi85tgd"},{"type":"partner","person1Id":"pmnd7ej1rf33c","person2Id":"pmnd7qhxj4baj"},{"type":"parent-child","parentId":"pmnd7qhxj4baj","childId":"pmnd7shvzi3c4"},{"type":"parent-child","parentId":"pmnd7ej1rf33c","childId":"pmnd7shvzi3c4"},{"type":"parent-child","parentId":"pmnd7qhxj4baj","childId":"pmnd7t84wv60c"},{"type":"parent-child","parentId":"pmnd7ej1rf33c","childId":"pmnd7t84wv60c"},{"type":"parent-child","parentId":"pmnd7qhxj4baj","childId":"pmnd7u7dc1sv8"},{"type":"parent-child","parentId":"pmnd7ej1rf33c","childId":"pmnd7u7dc1sv8"},{"type":"parent-child","parentId":"pmnd7qhxj4baj","childId":"pmnd7v4fly7vb"},{"type":"parent-child","parentId":"pmnd7ej1rf33c","childId":"pmnd7v4fly7vb"},{"type":"partner","person1Id":"pmnd7janquizq","person2Id":"pmndmqi8yk35j"},{"type":"parent-child","parentId":"pmndmqi8yk35j","childId":"pmndmre7xwo3z"},{"type":"parent-child","parentId":"pmnd7janquizq","childId":"pmndmre7xwo3z"},{"type":"parent-child","parentId":"pmndmqi8yk35j","childId":"pmndmscnasvm5"},{"type":"parent-child","parentId":"pmnd7janquizq","childId":"pmndmscnasvm5"},{"type":"parent-child","parentId":"pmndmqi8yk35j","childId":"pmndmt69g664c"},{"type":"parent-child","parentId":"pmnd7janquizq","childId":"pmndmt69g664c"},{"type":"partner","person1Id":"pmndmv0pe6bnt","person2Id":"pmndmvgb61us6"},{"type":"parent-child","parentId":"pmndmv0pe6bnt","childId":"pmndmw6tmszgx"},{"type":"parent-child","parentId":"pmndmvgb61us6","childId":"pmndmw6tmszgx"},{"type":"parent-child","parentId":"pmndmv0pe6bnt","childId":"pmndmwy22inp5"},{"type":"parent-child","parentId":"pmndmvgb61us6","childId":"pmndmwy22inp5"},{"type":"parent-child","parentId":"pmndmv0pe6bnt","childId":"pmndmxo0wy25u"},{"type":"parent-child","parentId":"pmndmvgb61us6","childId":"pmndmxo0wy25u"},{"type":"parent-child","parentId":"pmndmv0pe6bnt","childId":"pmndn04a6kp3h"},{"type":"parent-child","parentId":"pmndmvgb61us6","childId":"pmndn04a6kp3h"},{"type":"parent-child","parentId":"pmndmv0pe6bnt","childId":"pmndn0xa5x3gg"},{"type":"parent-child","parentId":"pmndmvgb61us6","childId":"pmndn0xa5x3gg"},{"type":"parent-child","parentId":"pmndmv0pe6bnt","childId":"pmndn2984pmss"},{"type":"parent-child","parentId":"pmndmvgb61us6","childId":"pmndn2984pmss"},{"type":"partner","person1Id":"pmndn2984pmss","person2Id":"pmndn30vhfz8r"},{"type":"parent-child","parentId":"pmndn30vhfz8r","childId":"pmndn3i30g9js"},{"type":"parent-child","parentId":"pmndn2984pmss","childId":"pmndn3i30g9js"},{"type":"parent-child","parentId":"pmndn30vhfz8r","childId":"pmndn3u2sqdff"},{"type":"parent-child","parentId":"pmndn2984pmss","childId":"pmndn3u2sqdff"},{"type":"parent-child","parentId":"pmndmv0pe6bnt","childId":"pmndn4sw3j1fb"},{"type":"parent-child","parentId":"pmndmvgb61us6","childId":"pmndn4sw3j1fb"},{"type":"partner","person1Id":"pmndnoxx6ndgz","person2Id":"pmndnpzkp3vwu"},{"type":"parent-child","parentId":"pmndnoxx6ndgz","childId":"pmndnrdrc68lf"},{"type":"parent-child","parentId":"pmndnpzkp3vwu","childId":"pmndnrdrc68lf"},{"type":"parent-child","parentId":"pmndnoxx6ndgz","childId":"pmndnrn9438x5"},{"type":"parent-child","parentId":"pmndnpzkp3vwu","childId":"pmndnrn9438x5"},{"type":"parent-child","parentId":"pmndnoxx6ndgz","childId":"pmndnryswhsem"},{"type":"parent-child","parentId":"pmndnpzkp3vwu","childId":"pmndnryswhsem"},{"type":"parent-child","parentId":"pmndnoxx6ndgz","childId":"pmndns7ewdxvw"},{"type":"parent-child","parentId":"pmndnpzkp3vwu","childId":"pmndns7ewdxvw"},{"type":"parent-child","parentId":"pmndnoxx6ndgz","childId":"pmndnsji2txom"},{"type":"parent-child","parentId":"pmndnpzkp3vwu","childId":"pmndnsji2txom"},{"type":"partner","person1Id":"pmndnrdrc68lf","person2Id":"pmndnticv1qox"},{"type":"partner","person1Id":"pmndo2vxafahz","person2Id":"pmndo3i84yw8g"},{"type":"parent-child","parentId":"pmndo2vxafahz","childId":"f02"},{"type":"parent-child","parentId":"pmndo3i84yw8g","childId":"f02"},{"type":"parent-child","parentId":"pmndo2vxafahz","childId":"pmndnpzkp3vwu"},{"type":"parent-child","parentId":"pmndo3i84yw8g","childId":"pmndnpzkp3vwu"},{"type":"parent-child","parentId":"pmndo2vxafahz","childId":"pmnd7qhxj4baj"},{"type":"parent-child","parentId":"pmndo3i84yw8g","childId":"pmnd7qhxj4baj"},{"type":"parent-child","parentId":"pmndo2vxafahz","childId":"pmndwllk8hld1"},{"type":"parent-child","parentId":"pmndo3i84yw8g","childId":"pmndwllk8hld1"},{"type":"parent-child","parentId":"pmndo2vxafahz","childId":"s07"},{"type":"parent-child","parentId":"pmndo3i84yw8g","childId":"s07"},{"type":"parent-child","parentId":"pmndo2vxafahz","childId":"pmndmvgb61us6"},{"type":"parent-child","parentId":"pmndo3i84yw8g","childId":"pmndmvgb61us6"},{"type":"parent-child","parentId":"pmndo2vxafahz","childId":"pmndwllk9fukl"},{"type":"parent-child","parentId":"pmndo3i84yw8g","childId":"pmndwllk9fukl"},{"type":"parent-child","parentId":"pmndo2vxafahz","childId":"pmndwllk96xxz"},{"type":"parent-child","parentId":"pmndo3i84yw8g","childId":"pmndwllk96xxz"},{"type":"parent-child","parentId":"pmndo2vxafahz","childId":"r02"},{"type":"parent-child","parentId":"pmndo3i84yw8g","childId":"r02"},{"type":"sibling","person1Id":"pmndo3i84yw8g","person2Id":"pmndya3eilyn1"},{"type":"sibling","person1Id":"pmndo3i84yw8g","person2Id":"pmndya3eiti9k"},{"type":"sibling","person1Id":"pmndo3i84yw8g","person2Id":"pmndya3eixb8j"},{"type":"sibling","person1Id":"pmndo3i84yw8g","person2Id":"pmndya3ei5vp4"},{"type":"sibling","person1Id":"pmndo3i84yw8g","person2Id":"pmndya3ei0k93"},{"type":"sibling","person1Id":"pmndo3i84yw8g","person2Id":"pmndya3eip3zu"},{"type":"partner","person1Id":"pmndya3ei5vp4","person2Id":"pmndyckredqon"},{"type":"parent-child","parentId":"pmndyckredqon","childId":"pmndydlr61are"},{"type":"parent-child","parentId":"pmndya3ei5vp4","childId":"pmndydlr61are"},{"type":"partner","person1Id":"pmndydlr61are","person2Id":"pmni0xjxqy5q5"},{"type":"parent-child","parentId":"pmndydlr61are","childId":"pmndyf12hx96x"},{"type":"parent-child","parentId":"pmni0xjxqy5q5","childId":"pmndyf12hx96x"},{"type":"partner","person1Id":"pmndya3ei5vp4","person2Id":"pmndyhcgqdpb9"},{"type":"parent-child","parentId":"pmndyhcgqdpb9","childId":"pmndyjcrfva0k"},{"type":"parent-child","parentId":"pmndya3ei5vp4","childId":"pmndyjcrfva0k"},{"type":"parent-child","parentId":"pmndyhcgqdpb9","childId":"pmndyjcrg5spz"},{"type":"parent-child","parentId":"pmndya3ei5vp4","childId":"pmndyjcrg5spz"},{"type":"parent-child","parentId":"pmndyhcgqdpb9","childId":"pmndyjcrhx2b4"},{"type":"parent-child","parentId":"pmndya3ei5vp4","childId":"pmndyjcrhx2b4"},{"type":"parent-child","parentId":"pmndyhcgqdpb9","childId":"pmndyjcripek7"},{"type":"parent-child","parentId":"pmndya3ei5vp4","childId":"pmndyjcripek7"},{"type":"parent-child","parentId":"pmndyhcgqdpb9","childId":"pmndyjcrjsvwo"},{"type":"parent-child","parentId":"pmndya3ei5vp4","childId":"pmndyjcrjsvwo"},{"type":"parent-child","parentId":"pmndyhcgqdpb9","childId":"pmndyjcrkl9zf"},{"type":"parent-child","parentId":"pmndya3ei5vp4","childId":"pmndyjcrkl9zf"},{"type":"parent-child","parentId":"pmndyhcgqdpb9","childId":"pmndyjcrl3njh"},{"type":"parent-child","parentId":"pmndya3ei5vp4","childId":"pmndyjcrl3njh"},{"type":"parent-child","parentId":"pmndyrysy3eq7","childId":"s01"},{"type":"parent-child","parentId":"pmndyryt0viez","childId":"s01"},{"type":"partner","person1Id":"pmndyrysy3eq7","person2Id":"pmndyryt0viez"},{"type":"parent-child","parentId":"pmndyrysy3eq7","childId":"pmndya3eilyn1"},{"type":"parent-child","parentId":"pmndyryt0viez","childId":"pmndya3eilyn1"},{"type":"parent-child","parentId":"pmndyrysy3eq7","childId":"pmndya3eiti9k"},{"type":"parent-child","parentId":"pmndyryt0viez","childId":"pmndya3eiti9k"},{"type":"parent-child","parentId":"pmndyrysy3eq7","childId":"pmndya3eixb8j"},{"type":"parent-child","parentId":"pmndyryt0viez","childId":"pmndya3eixb8j"},{"type":"parent-child","parentId":"pmndyrysy3eq7","childId":"pmndya3ei5vp4"},{"type":"parent-child","parentId":"pmndyryt0viez","childId":"pmndya3ei5vp4"},{"type":"parent-child","parentId":"pmndyrysy3eq7","childId":"pmndo3i84yw8g"},{"type":"parent-child","parentId":"pmndyryt0viez","childId":"pmndo3i84yw8g"},{"type":"parent-child","parentId":"pmndyrysy3eq7","childId":"pmndya3ei0k93"},{"type":"parent-child","parentId":"pmndyryt0viez","childId":"pmndya3ei0k93"},{"type":"parent-child","parentId":"pmndyrysy3eq7","childId":"pmndya3eip3zu"},{"type":"parent-child","parentId":"pmndyryt0viez","childId":"pmndya3eip3zu"},{"type":"parent-child","parentId":"pmndyxhre0zi1","childId":"pmnd79y13i65o"},{"type":"partner","person1Id":"pmndyxhre0zi1","person2Id":"pmndyy6j6wndl"},{"type":"parent-child","parentId":"pmndyy6j6wndl","childId":"pmnd79y13i65o"},{"type":"partner","person1Id":"pmnd7bkdrm6yz","person2Id":"pmnepe8ob5cod"},{"type":"partner","person1Id":"pmnd7cfmvqiff","person2Id":"pmnepfhttgn51"},{"type":"parent-child","parentId":"pmnd7cfmvqiff","childId":"pmnepimbckf8a"},{"type":"parent-child","parentId":"pmnepfhttgn51","childId":"pmnepimbckf8a"},{"type":"parent-child","parentId":"pmnd7cfmvqiff","childId":"pmnepimbeuxuf"},{"type":"parent-child","parentId":"pmnepfhttgn51","childId":"pmnepimbeuxuf"},{"type":"partner","person1Id":"pmnd7cuzr39r9","person2Id":"pmnepl5nzikm3"},{"type":"partner","person1Id":"pmnd7hzc067x0","person2Id":"pmnepmjsmeuk6"},{"type":"partner","person1Id":"pmnd7n0jbe5kc","person2Id":"pmnepnt0eu2k2"},{"type":"parent-child","parentId":"pmnepnt0eu2k2","childId":"pmnepp0idbklv"},{"type":"parent-child","parentId":"pmnd7n0jbe5kc","childId":"pmnepp0idbklv"},{"type":"partner","person1Id":"pmndwllk9fukl","person2Id":"pmneptum4xnzi"},{"type":"parent-child","parentId":"pmndwllk9fukl","childId":"pmnepytxdqi9y"},{"type":"parent-child","parentId":"pmneptum4xnzi","childId":"pmnepytxdqi9y"},{"type":"parent-child","parentId":"pmndwllk9fukl","childId":"pmnepytxga1sz"},{"type":"parent-child","parentId":"pmneptum4xnzi","childId":"pmnepytxga1sz"},{"type":"parent-child","parentId":"pmndwllk9fukl","childId":"pmnepytxh5z3q"},{"type":"parent-child","parentId":"pmneptum4xnzi","childId":"pmnepytxh5z3q"},{"type":"parent-child","parentId":"pmndwllk9fukl","childId":"pmnepytxiuzsg"},{"type":"parent-child","parentId":"pmneptum4xnzi","childId":"pmnepytxiuzsg"},{"type":"parent-child","parentId":"pmndyxhre0zi1","childId":"pmneq7p4nynu3"},{"type":"parent-child","parentId":"pmndyy6j6wndl","childId":"pmneq7p4nynu3"},{"type":"parent-child","parentId":"pmndyxhre0zi1","childId":"pmndo2vxafahz"},{"type":"parent-child","parentId":"pmndyy6j6wndl","childId":"pmndo2vxafahz"},{"type":"parent-child","parentId":"pmndyxhre0zi1","childId":"pmneq7p4ss5hl"},{"type":"parent-child","parentId":"pmndyy6j6wndl","childId":"pmneq7p4ss5hl"},{"type":"parent-child","parentId":"pmndyxhre0zi1","childId":"pmneq7p4udtvl"},{"type":"parent-child","parentId":"pmndyy6j6wndl","childId":"pmneq7p4udtvl"},{"type":"parent-child","parentId":"f07","childId":"pmnfv2r03xoij"},{"type":"parent-child","parentId":"f06","childId":"pmnfv2r03xoij"},{"type":"parent-child","parentId":"pmnd7qhxj4baj","childId":"pmnfvopdootvl"},{"type":"parent-child","parentId":"pmnd7ej1rf33c","childId":"pmnfvopdootvl"},{"type":"partner","person1Id":"pmndya3eilyn1","person2Id":"pmnfwiq4xex8n"},{"type":"partner","person1Id":"pmndya3eilyn1","person2Id":"pmnfwiq4xoz2k"},{"type":"parent-child","parentId":"pmndya3eilyn1","childId":"pmnfwl6r2lpes"},{"type":"parent-child","parentId":"pmnfwiq4xex8n","childId":"pmnfwl6r2lpes"},{"type":"parent-child","parentId":"pmndya3eilyn1","childId":"pmnfwl6r2k67v"},{"type":"parent-child","parentId":"pmnfwiq4xex8n","childId":"pmnfwl6r2k67v"},{"type":"parent-child","parentId":"pmndya3eilyn1","childId":"pmnfwl6r2bl6p"},{"type":"parent-child","parentId":"pmnfwiq4xex8n","childId":"pmnfwl6r2bl6p"},{"type":"parent-child","parentId":"pmndya3eilyn1","childId":"pmnfwl6r2i0v6"},{"type":"parent-child","parentId":"pmnfwiq4xex8n","childId":"pmnfwl6r2i0v6"},{"type":"parent-child","parentId":"pmndya3eilyn1","childId":"pmnfwl6r21xvr"},{"type":"parent-child","parentId":"pmnfwiq4xex8n","childId":"pmnfwl6r21xvr"},{"type":"parent-child","parentId":"pmndya3eilyn1","childId":"pmnfwl6r2gzuz"},{"type":"parent-child","parentId":"pmnfwiq4xex8n","childId":"pmnfwl6r2gzuz"},{"type":"parent-child","parentId":"pmndya3eilyn1","childId":"pmnfwl6r2niud"},{"type":"parent-child","parentId":"pmnfwiq4xex8n","childId":"pmnfwl6r2niud"},{"type":"parent-child","parentId":"pmndya3eilyn1","childId":"pmnfwpozxyoww"},{"type":"parent-child","parentId":"pmnfwiq4xoz2k","childId":"pmnfwpozxyoww"},{"type":"parent-child","parentId":"pmndya3eilyn1","childId":"pmnfwpozxor6n"},{"type":"parent-child","parentId":"pmnfwiq4xoz2k","childId":"pmnfwpozxor6n"},{"type":"parent-child","parentId":"pmndya3eilyn1","childId":"pmnfwpozx8uem"},{"type":"parent-child","parentId":"pmnfwiq4xoz2k","childId":"pmnfwpozx8uem"},{"type":"parent-child","parentId":"pmndya3eilyn1","childId":"pmnfwpozxxrih"},{"type":"parent-child","parentId":"pmnfwiq4xoz2k","childId":"pmnfwpozxxrih"},{"type":"parent-child","parentId":"pmndya3eilyn1","childId":"pmnfwpozxh323"},{"type":"parent-child","parentId":"pmnfwiq4xoz2k","childId":"pmnfwpozxh323"},{"type":"parent-child","parentId":"pmndya3eilyn1","childId":"pmnfwpozxxvot"},{"type":"parent-child","parentId":"pmnfwiq4xoz2k","childId":"pmnfwpozxxvot"},{"type":"parent-child","parentId":"pmndya3eilyn1","childId":"pmnfwpozx2yhq"},{"type":"parent-child","parentId":"pmnfwiq4xoz2k","childId":"pmnfwpozx2yhq"},{"type":"partner","person1Id":"pmndya3ei0k93","person2Id":"pmnfx2dl6dya9"},{"type":"parent-child","parentId":"pmnfx2dl6dya9","childId":"pmnfx3knl6en8"},{"type":"parent-child","parentId":"pmndya3ei0k93","childId":"pmnfx5u9dct4w"},{"type":"parent-child","parentId":"pmnfx2dl6dya9","childId":"pmnfx5u9dct4w"},{"type":"parent-child","parentId":"pmndya3ei0k93","childId":"pmnfx5u9dbm8a"},{"type":"parent-child","parentId":"pmnfx2dl6dya9","childId":"pmnfx5u9dbm8a"},{"type":"social-parent","parentId":"pmndya3ei0k93","childId":"pmnfx3knl6en8"},{"type":"social-parent","parentId":"pmndya3ei0k93","childId":"pmndydlr61are"},{"type":"partner","person1Id":"pmnfx3knl6en8","person2Id":"pmnfx8zrswvz9"},{"type":"parent-child","parentId":"pmnfx8zrswvz9","childId":"pmnfxa0in4tc9"},{"type":"parent-child","parentId":"pmnfx3knl6en8","childId":"pmnfxa0in4tc9"},{"type":"parent-child","parentId":"pmnfx8zrswvz9","childId":"pmnfxa0io0z5u"},{"type":"parent-child","parentId":"pmnfx3knl6en8","childId":"pmnfxa0io0z5u"},{"type":"parent-child","parentId":"pmnfx8zrswvz9","childId":"pmnfxa0iou6j0"},{"type":"parent-child","parentId":"pmnfx3knl6en8","childId":"pmnfxa0iou6j0"},{"type":"partner","person1Id":"pmnfx5u9dct4w","person2Id":"pmnfxaot46h83"},{"type":"parent-child","parentId":"pmnfx5u9dct4w","childId":"pmnfxbasnb3sh"},{"type":"parent-child","parentId":"pmnfxaot46h83","childId":"pmnfxbasnb3sh"},{"type":"parent-child","parentId":"pmnfx5u9dct4w","childId":"pmnfxbasnbq7c"},{"type":"parent-child","parentId":"pmnfxaot46h83","childId":"pmnfxbasnbq7c"},{"type":"social-parent","parentId":"pmnfx2dl6dya9","childId":"pmndydlr61are"},{"type":"partner","person1Id":"pmndwllk8hld1","person2Id":"pmnfwl6r2gzuz"},{"type":"parent-child","parentId":"pmndwllk8hld1","childId":"pmni01k22obxh"},{"type":"parent-child","parentId":"pmnfwl6r2gzuz","childId":"pmni01k22obxh"},{"type":"parent-child","parentId":"pmndwllk8hld1","childId":"pmni01k23erra"},{"type":"parent-child","parentId":"pmnfwl6r2gzuz","childId":"pmni01k23erra"},{"type":"parent-child","parentId":"pmndwllk8hld1","childId":"pmni01k24zyhf"},{"type":"parent-child","parentId":"pmnfwl6r2gzuz","childId":"pmni01k24zyhf"},{"type":"parent-child","parentId":"pmndwllk8hld1","childId":"pmni01k25pnza"},{"type":"parent-child","parentId":"pmnfwl6r2gzuz","childId":"pmni01k25pnza"},{"type":"partner","person1Id":"pmndwllk96xxz","person2Id":"pmnfwl6r2i0v6"},{"type":"parent-child","parentId":"pmnfwl6r2i0v6","childId":"pmni053i84su6"},{"type":"parent-child","parentId":"pmndwllk96xxz","childId":"pmni053i84su6"},{"type":"parent-child","parentId":"pmnfwl6r2i0v6","childId":"pmni053iamxzp"},{"type":"parent-child","parentId":"pmndwllk96xxz","childId":"pmni053iamxzp"},{"type":"parent-child","parentId":"pmnfwl6r2i0v6","childId":"pmni053icew6m"},{"type":"parent-child","parentId":"pmndwllk96xxz","childId":"pmni053icew6m"},{"type":"parent-child","parentId":"pmnfwl6r2i0v6","childId":"pmni053ie8pn9"},{"type":"parent-child","parentId":"pmndwllk96xxz","childId":"pmni053ie8pn9"},{"type":"parent-child","parentId":"pmnfwl6r2i0v6","childId":"pmni053ifs7ju"},{"type":"parent-child","parentId":"pmndwllk96xxz","childId":"pmni053ifs7ju"},{"type":"parent-child","parentId":"pmnfwl6r2i0v6","childId":"pmni053ih3c7e"},{"type":"parent-child","parentId":"pmndwllk96xxz","childId":"pmni053ih3c7e"},{"type":"partner","person1Id":"pmneq7p4nynu3","person2Id":"pmni06p0ji4hg"},{"type":"parent-child","parentId":"pmneq7p4nynu3","childId":"pmni0aw5mfovo"},{"type":"parent-child","parentId":"pmni06p0ji4hg","childId":"pmni0aw5mfovo"},{"type":"parent-child","parentId":"pmneq7p4nynu3","childId":"pmni0aw5rt7j6"},{"type":"parent-child","parentId":"pmni06p0ji4hg","childId":"pmni0aw5rt7j6"},{"type":"parent-child","parentId":"pmneq7p4nynu3","childId":"pmni0aw5t19yo"},{"type":"parent-child","parentId":"pmni06p0ji4hg","childId":"pmni0aw5t19yo"},{"type":"parent-child","parentId":"pmneq7p4nynu3","childId":"pmni0aw5wzj12"},{"type":"parent-child","parentId":"pmni06p0ji4hg","childId":"pmni0aw5wzj12"},{"type":"parent-child","parentId":"pmneq7p4nynu3","childId":"pmni0aw5zil6x"},{"type":"parent-child","parentId":"pmni06p0ji4hg","childId":"pmni0aw5zil6x"},{"type":"parent-child","parentId":"pmneq7p4nynu3","childId":"pmni0aw61wfnn"},{"type":"parent-child","parentId":"pmni06p0ji4hg","childId":"pmni0aw61wfnn"},{"type":"parent-child","parentId":"pmneq7p4nynu3","childId":"pmni0aw63vtas"},{"type":"parent-child","parentId":"pmni06p0ji4hg","childId":"pmni0aw63vtas"},{"type":"partner","person1Id":"pmni0aw5mfovo","person2Id":"pmni0byqqbuqw"},{"type":"parent-child","parentId":"pmni0byqqbuqw","childId":"pmni0d7t09vcm"},{"type":"parent-child","parentId":"pmni0aw5mfovo","childId":"pmni0d7t09vcm"},{"type":"parent-child","parentId":"pmni0byqqbuqw","childId":"pmni0d7t6qrt0"},{"type":"parent-child","parentId":"pmni0aw5mfovo","childId":"pmni0d7t6qrt0"},{"type":"parent-child","parentId":"pmni0byqqbuqw","childId":"pmni0d7t9876w"},{"type":"parent-child","parentId":"pmni0aw5mfovo","childId":"pmni0d7t9876w"},{"type":"parent-child","parentId":"pmni0byqqbuqw","childId":"pmni0d7tck3oc"},{"type":"parent-child","parentId":"pmni0aw5mfovo","childId":"pmni0d7tck3oc"},{"type":"partner","person1Id":"pmni0aw63vtas","person2Id":"pmni0dr4npt6r"},{"type":"parent-child","parentId":"pmni0dr4npt6r","childId":"pmni0e8yfpn37"},{"type":"parent-child","parentId":"pmni0aw63vtas","childId":"pmni0e8yfpn37"},{"type":"parent-child","parentId":"pmni0byqqbuqw","childId":"pmni0fiiiy1qs"},{"type":"parent-child","parentId":"pmni0aw5mfovo","childId":"pmni0fiiiy1qs"},{"type":"partner","person1Id":"pmni0mtna5vxw","person2Id":"pmni0nrmgl4he"},{"type":"parent-child","parentId":"pmni0mtna5vxw","childId":"pmni0s7et7v3g"},{"type":"parent-child","parentId":"pmni0nrmgl4he","childId":"pmni0s7et7v3g"},{"type":"parent-child","parentId":"pmni0mtna5vxw","childId":"pmni0s7etaht7"},{"type":"parent-child","parentId":"pmni0nrmgl4he","childId":"pmni0s7etaht7"},{"type":"parent-child","parentId":"pmni0mtna5vxw","childId":"pmni0s7etyv3g"},{"type":"parent-child","parentId":"pmni0nrmgl4he","childId":"pmni0s7etyv3g"},{"type":"parent-child","parentId":"pmni0mtna5vxw","childId":"pmni0s7ety1t7"},{"type":"parent-child","parentId":"pmni0nrmgl4he","childId":"pmni0s7ety1t7"},{"type":"parent-child","parentId":"pmni0mtna5vxw","childId":"pmni0s7etwzn0"},{"type":"parent-child","parentId":"pmni0nrmgl4he","childId":"pmni0s7etwzn0"},{"type":"parent-child","parentId":"pmni0mtna5vxw","childId":"f01"},{"type":"parent-child","parentId":"pmni0nrmgl4he","childId":"f01"},{"type":"parent-child","parentId":"pmni0mtna5vxw","childId":"pmni0s7etpgpa"},{"type":"parent-child","parentId":"pmni0nrmgl4he","childId":"pmni0s7etpgpa"},{"type":"parent-child","parentId":"pmni0s7et7v3g","childId":"pmni0tu13oc3d"},{"type":"parent-child","parentId":"pmni0s7et7v3g","childId":"pmni0tu14jfoi"},{"type":"parent-child","parentId":"pmni0s7et7v3g","childId":"pmni0tu14y8tb"},{"type":"parent-child","parentId":"pmni0s7et7v3g","childId":"pmni0tu14n6g5"},{"type":"parent-child","parentId":"pmni0s7et7v3g","childId":"pmni0tu14seye"},{"type":"parent-child","parentId":"pmni0s7et7v3g","childId":"pmni0tu141lkn"},{"type":"parent-child","parentId":"pmni0s7et7v3g","childId":"pmni0tu14q8j4"},{"type":"parent-child","parentId":"pmni0s7etaht7","childId":"pmni0v8ui9mjd"},{"type":"parent-child","parentId":"pmni0s7etaht7","childId":"pmni0v8uihcrv"},{"type":"parent-child","parentId":"pmni0s7etyv3g","childId":"pmni0xjxqp5fh"},{"type":"parent-child","parentId":"pmni0s7etyv3g","childId":"pmni0xjxqgts8"},{"type":"parent-child","parentId":"pmni0s7etyv3g","childId":"f07"},{"type":"parent-child","parentId":"pmni0s7etyv3g","childId":"pmni0xjxq42rt"},{"type":"parent-child","parentId":"pmni0s7etyv3g","childId":"f11"},{"type":"parent-child","parentId":"pmni0s7etyv3g","childId":"pmni0xjxq3aqh"},{"type":"parent-child","parentId":"pmni0s7etyv3g","childId":"pmni0xjxqy5q5"},{"type":"parent-child","parentId":"pmni0s7etyv3g","childId":"pmni0xjxqh0e7"},{"type":"parent-child","parentId":"pmni0s7ety1t7","childId":"pmni10qwrkobm"},{"type":"parent-child","parentId":"pmni0s7ety1t7","childId":"pmni10qws5lcv"},{"type":"parent-child","parentId":"pmni0s7ety1t7","childId":"pmni10qwsq7q9"},{"type":"parent-child","parentId":"pmni0s7ety1t7","childId":"pmni10qws94io"},{"type":"parent-child","parentId":"pmni0s7ety1t7","childId":"pmni10qwsu0z7"},{"type":"parent-child","parentId":"pmni0s7ety1t7","childId":"pmni10qwsgyfr"},{"type":"parent-child","parentId":"pmni0s7etwzn0","childId":"pmni14pya5f9h"},{"type":"parent-child","parentId":"pmni0s7etwzn0","childId":"pmni14pyarspx"},{"type":"parent-child","parentId":"pmni0s7etwzn0","childId":"pmni14pyav3jq"},{"type":"parent-child","parentId":"pmni0s7etwzn0","childId":"pmni14pyaujp1"},{"type":"parent-child","parentId":"pmni0s7etwzn0","childId":"pmni14pyai87w"},{"type":"parent-child","parentId":"pmndydlr61are","childId":"pmo007gyaqm2k"},{"type":"parent-child","parentId":"pmni0xjxqy5q5","childId":"pmo007gyaqm2k"},{"type":"partner","person1Id":"pmndyjcripek7","person2Id":"pmo0h2kl0159h"},{"type":"partner","person1Id":"pmneq7p4ss5hl","person2Id":"pmo34v17r5l0j"},{"type":"parent-child","parentId":"pmneq7p4ss5hl","childId":"pmo34ycr3rguf"},{"type":"parent-child","parentId":"pmo34v17r5l0j","childId":"pmo34ycr3rguf"},{"type":"parent-child","parentId":"pmneq7p4ss5hl","childId":"pmo34ycr7lser"},{"type":"parent-child","parentId":"pmo34v17r5l0j","childId":"pmo34ycr7lser"},{"type":"parent-child","parentId":"pmneq7p4ss5hl","childId":"pmo34ycrdz5uf"},{"type":"parent-child","parentId":"pmo34v17r5l0j","childId":"pmo34ycrdz5uf"},{"type":"parent-child","parentId":"pmneq7p4ss5hl","childId":"pmo34ycrhfbhs"},{"type":"parent-child","parentId":"pmo34v17r5l0j","childId":"pmo34ycrhfbhs"},{"type":"parent-child","parentId":"pmneq7p4ss5hl","childId":"pmo34ycrl4b8j"},{"type":"parent-child","parentId":"pmo34v17r5l0j","childId":"pmo34ycrl4b8j"},{"type":"parent-child","parentId":"pmneq7p4ss5hl","childId":"pmo34ycrplrzh"},{"type":"parent-child","parentId":"pmo34v17r5l0j","childId":"pmo34ycrplrzh"},{"type":"parent-child","parentId":"pmneq7p4ss5hl","childId":"pmo34ycrwm0ax"},{"type":"parent-child","parentId":"pmo34v17r5l0j","childId":"pmo34ycrwm0ax"},{"type":"partner","person1Id":"pmo34ycr3rguf","person2Id":"pmo34z25i1fky"},{"type":"parent-child","parentId":"pmo34ycr3rguf","childId":"pmo350x9zbuxz"},{"type":"parent-child","parentId":"pmo34z25i1fky","childId":"pmo350x9zbuxz"},{"type":"parent-child","parentId":"pmo34ycr3rguf","childId":"pmo350xa4any3"},{"type":"parent-child","parentId":"pmo34z25i1fky","childId":"pmo350xa4any3"},{"type":"parent-child","parentId":"pmo34ycr3rguf","childId":"pmo350xa8twge"},{"type":"parent-child","parentId":"pmo34z25i1fky","childId":"pmo350xa8twge"},{"type":"parent-child","parentId":"pmo34ycr3rguf","childId":"pmo350xacwuzv"},{"type":"parent-child","parentId":"pmo34z25i1fky","childId":"pmo350xacwuzv"},{"type":"parent-child","parentId":"pmo34ycr3rguf","childId":"pmo350xag72uv"},{"type":"parent-child","parentId":"pmo34z25i1fky","childId":"pmo350xag72uv"},{"type":"parent-child","parentId":"pmo34ycr3rguf","childId":"pmo350xaj9g7p"},{"type":"parent-child","parentId":"pmo34z25i1fky","childId":"pmo350xaj9g7p"},{"type":"partner","person1Id":"pmo34ycr7lser","person2Id":"pmo351h5beg9f"},{"type":"parent-child","parentId":"pmo34ycr7lser","childId":"pmo352v2f85e1"},{"type":"parent-child","parentId":"pmo351h5beg9f","childId":"pmo352v2f85e1"},{"type":"parent-child","parentId":"pmo34ycr7lser","childId":"pmo352v2m7cyp"},{"type":"parent-child","parentId":"pmo351h5beg9f","childId":"pmo352v2m7cyp"},{"type":"parent-child","parentId":"pmo34ycr7lser","childId":"pmo352v2qd6mg"},{"type":"parent-child","parentId":"pmo351h5beg9f","childId":"pmo352v2qd6mg"},{"type":"parent-child","parentId":"pmo34ycr7lser","childId":"pmo352v2v4165"},{"type":"parent-child","parentId":"pmo351h5beg9f","childId":"pmo352v2v4165"},{"type":"parent-child","parentId":"pmo34ycr7lser","childId":"pmo352v30t7ge"},{"type":"parent-child","parentId":"pmo351h5beg9f","childId":"pmo352v30t7ge"},{"type":"partner","person1Id":"pmo34ycrdz5uf","person2Id":"pmo353ouw5u1k"},{"type":"parent-child","parentId":"pmo34ycrdz5uf","childId":"pmo354mcnbz26"},{"type":"parent-child","parentId":"pmo353ouw5u1k","childId":"pmo354mcnbz26"},{"type":"parent-child","parentId":"pmo34ycrdz5uf","childId":"pmo354mcujmgy"},{"type":"parent-child","parentId":"pmo353ouw5u1k","childId":"pmo354mcujmgy"},{"type":"parent-child","parentId":"pmo34ycrdz5uf","childId":"pmo354mczv982"},{"type":"parent-child","parentId":"pmo353ouw5u1k","childId":"pmo354mczv982"},{"type":"partner","person1Id":"pmo34ycrhfbhs","person2Id":"pmo3552jz6uwr"},{"type":"parent-child","parentId":"pmo34ycrhfbhs","childId":"pmo3561dkcpxd"},{"type":"parent-child","parentId":"pmo3552jz6uwr","childId":"pmo3561dkcpxd"},{"type":"parent-child","parentId":"pmo34ycrhfbhs","childId":"pmo3561dq8ahj"},{"type":"parent-child","parentId":"pmo3552jz6uwr","childId":"pmo3561dq8ahj"},{"type":"partner","person1Id":"pmo34ycrl4b8j","person2Id":"pmo357kjbhmd5"},{"type":"parent-child","parentId":"pmo34ycrl4b8j","childId":"pmo358jhjmb83"},{"type":"parent-child","parentId":"pmo357kjbhmd5","childId":"pmo358jhjmb83"},{"type":"parent-child","parentId":"pmo34ycrl4b8j","childId":"pmo358jhpzptz"},{"type":"parent-child","parentId":"pmo357kjbhmd5","childId":"pmo358jhpzptz"},{"type":"partner","person1Id":"pmo34ycrl4b8j","person2Id":"pmo358vl3n6yf"},{"type":"parent-child","parentId":"pmo34ycrl4b8j","childId":"pmo359q5jrkg1"},{"type":"parent-child","parentId":"pmo358vl3n6yf","childId":"pmo359q5jrkg1"},{"type":"parent-child","parentId":"pmo34ycrl4b8j","childId":"pmo359q5q3jz9"},{"type":"parent-child","parentId":"pmo358vl3n6yf","childId":"pmo359q5q3jz9"},{"type":"partner","person1Id":"pmo34ycrwm0ax","person2Id":"pmo35a6zz26rc"},{"type":"parent-child","parentId":"pmni0aw63vtas","childId":"pmo49w9tiqty7"},{"type":"parent-child","parentId":"pmni0dr4npt6r","childId":"pmo49w9tiqty7"},{"type":"parent-child","parentId":"pmo34ycrl4b8j","childId":"pmo4a1a67tuyw"},{"type":"parent-child","parentId":"pmo357kjbhmd5","childId":"pmo4a1a67tuyw"},{"type":"parent-child","parentId":"pmo34ycrdz5uf","childId":"pmo4a26jk7k5x"},{"type":"parent-child","parentId":"pmo353ouw5u1k","childId":"pmo4a26jk7k5x"},{"type":"parent-child","parentId":"pmndyxhre0zi1","childId":"pmo4abxn5ihq5"},{"type":"parent-child","parentId":"pmndyy6j6wndl","childId":"pmo4abxn5ihq5"},{"type":"parent-child","parentId":"pmndyxhre0zi1","childId":"pmo4acfl57fx5"},{"type":"parent-child","parentId":"pmndyy6j6wndl","childId":"pmo4acfl57fx5"},{"type":"parent-child","parentId":"pmndo2vxafahz","childId":"pmo4adrr9bkk1"},{"type":"parent-child","parentId":"pmndo3i84yw8g","childId":"pmo4adrr9bkk1"},{"type":"parent-child","parentId":"pmndyxhre0zi1","childId":"pmo4ahx86c7rh"},{"type":"parent-child","parentId":"pmndyy6j6wndl","childId":"pmo4ahx86c7rh"},{"type":"partner","person1Id":"pmndya3eip3zu","person2Id":"pmo4su8c7xqg0"},{"type":"parent-child","parentId":"pmndya3eip3zu","childId":"pmo4supk01lh5"},{"type":"parent-child","parentId":"pmo4su8c7xqg0","childId":"pmo4supk01lh5"},{"type":"partner","person1Id":"pmndya3eiti9k","person2Id":"pmo4sw6rkvo1k"},{"type":"parent-child","parentId":"pmndya3eiti9k","childId":"pmo4szd62qiup"},{"type":"parent-child","parentId":"pmo4sw6rkvo1k","childId":"pmo4szd62qiup"},{"type":"parent-child","parentId":"pmndya3eiti9k","childId":"pmo4szd632k5i"},{"type":"parent-child","parentId":"pmo4sw6rkvo1k","childId":"pmo4szd632k5i"},{"type":"parent-child","parentId":"pmndya3eiti9k","childId":"pmo4szd63w9un"},{"type":"parent-child","parentId":"pmo4sw6rkvo1k","childId":"pmo4szd63w9un"},{"type":"parent-child","parentId":"pmndya3eiti9k","childId":"pmo4szd63jn8i"},{"type":"parent-child","parentId":"pmo4sw6rkvo1k","childId":"pmo4szd63jn8i"},{"type":"parent-child","parentId":"pmndya3eiti9k","childId":"pmo4szd63ws4w"},{"type":"parent-child","parentId":"pmo4sw6rkvo1k","childId":"pmo4szd63ws4w"},{"type":"partner","person1Id":"pmndya3eixb8j","person2Id":"pmo4t07f8o0lo"},{"type":"parent-child","parentId":"pmndya3eixb8j","childId":"pmo4t2s73wzcp"},{"type":"parent-child","parentId":"pmo4t07f8o0lo","childId":"pmo4t2s73wzcp"},{"type":"parent-child","parentId":"pmndya3eixb8j","childId":"pmo4t2s73iom6"},{"type":"parent-child","parentId":"pmo4t07f8o0lo","childId":"pmo4t2s73iom6"},{"type":"parent-child","parentId":"pmndya3eixb8j","childId":"pmo4t2s73omvz"},{"type":"parent-child","parentId":"pmo4t07f8o0lo","childId":"pmo4t2s73omvz"},{"type":"parent-child","parentId":"pmndya3eixb8j","childId":"pmo4t2s73j77q"},{"type":"parent-child","parentId":"pmo4t07f8o0lo","childId":"pmo4t2s73j77q"},{"type":"parent-child","parentId":"pmndya3eixb8j","childId":"pmo4t2s73rsl9"},{"type":"parent-child","parentId":"pmo4t07f8o0lo","childId":"pmo4t2s73rsl9"},{"type":"parent-child","parentId":"pmndya3eixb8j","childId":"pmo4t2s73sf3c"},{"type":"parent-child","parentId":"pmo4t07f8o0lo","childId":"pmo4t2s73sf3c"},{"type":"parent-child","parentId":"pmndya3eixb8j","childId":"pmo4t2s73uerq"},{"type":"parent-child","parentId":"pmo4t07f8o0lo","childId":"pmo4t2s73uerq"},{"type":"partner","person1Id":"pmnfwl6r2k67v","person2Id":"pmo4tjfzukw6f"},{"type":"parent-child","parentId":"pmnfwl6r2k67v","childId":"pmo4tkhyjlb4b"},{"type":"parent-child","parentId":"pmo4tjfzukw6f","childId":"pmo4tkhyjlb4b"},{"type":"partner","person1Id":"pmnfwl6r2bl6p","person2Id":"pmo4tlndgesy8"},{"type":"parent-child","parentId":"pmnfwl6r2bl6p","childId":"pmo4tnohqn8eh"},{"type":"parent-child","parentId":"pmo4tlndgesy8","childId":"pmo4tnohqn8eh"},{"type":"parent-child","parentId":"pmnfwl6r2bl6p","childId":"pmo4tnohtq4o0"},{"type":"parent-child","parentId":"pmo4tlndgesy8","childId":"pmo4tnohtq4o0"},{"type":"parent-child","parentId":"pmnfwl6r2bl6p","childId":"pmo4tnohv1bc0"},{"type":"parent-child","parentId":"pmo4tlndgesy8","childId":"pmo4tnohv1bc0"},{"type":"parent-child","parentId":"pmnfwl6r2bl6p","childId":"pmo4tnohyzf86"},{"type":"parent-child","parentId":"pmo4tlndgesy8","childId":"pmo4tnohyzf86"},{"type":"parent-child","parentId":"pmnfwl6r2bl6p","childId":"pmo4tnoi01vyn"},{"type":"parent-child","parentId":"pmo4tlndgesy8","childId":"pmo4tnoi01vyn"},{"type":"parent-child","parentId":"pmnfwl6r2bl6p","childId":"pmo4tnoi2nco0"},{"type":"parent-child","parentId":"pmo4tlndgesy8","childId":"pmo4tnoi2nco0"},{"type":"parent-child","parentId":"pmnfwl6r2bl6p","childId":"pmo4tnoi53dc8"},{"type":"parent-child","parentId":"pmo4tlndgesy8","childId":"pmo4tnoi53dc8"},{"type":"partner","person1Id":"pmnfwl6r21xvr","person2Id":"pmo4tqukpwhe3"},{"type":"parent-child","parentId":"pmnfwl6r21xvr","childId":"pmo4tu4zyqlgu"},{"type":"parent-child","parentId":"pmnfwl6r21xvr","childId":"pmo4tv65lojwy"},{"type":"parent-child","parentId":"pmo4tqukpwhe3","childId":"pmo4tv65lojwy"},{"type":"social-parent","parentId":"pmo4tqukpwhe3","childId":"pmo4tu4zyqlgu"},{"type":"partner","person1Id":"pmnfwl6r2niud","person2Id":"pmo4txoa8ol14"},{"type":"parent-child","parentId":"pmnfwl6r2niud","childId":"pmo4ty3cwvfaj"},{"type":"parent-child","parentId":"pmo4txoa8ol14","childId":"pmo4ty3cwvfaj"},{"type":"partner","person1Id":"pmnfwpozxyoww","person2Id":"pmo4u0rpbm1wn"},{"type":"parent-child","parentId":"pmnfwpozxyoww","childId":"pmo4u1b0rwt71"},{"type":"parent-child","parentId":"pmo4u0rpbm1wn","childId":"pmo4u1b0rwt71"},{"type":"partner","person1Id":"pmnfwpozxxrih","person2Id":"pmo4u21q3m2zy"},{"type":"parent-child","parentId":"pmnfwpozxxrih","childId":"pmo4u2pw7zjnf"},{"type":"parent-child","parentId":"pmo4u21q3m2zy","childId":"pmo4u2pw7zjnf"},{"type":"parent-child","parentId":"pmndya3eixb8j","childId":"pmo4u647klb92"},{"type":"parent-child","parentId":"pmo4t07f8o0lo","childId":"pmo4u647klb92"},{"type":"parent-child","parentId":"pmndya3eixb8j","childId":"pmo4u96zph9n5"},{"type":"parent-child","parentId":"pmo4t07f8o0lo","childId":"pmo4u96zph9n5"},{"type":"partner","person1Id":"pmo4u647klb92","person2Id":"pmo4ucl28pqjj"},{"type":"partner","person1Id":"pmo4t2s73wzcp","person2Id":"pmo4uctew3mow"},{"type":"partner","person1Id":"pmo4t2s73iom6","person2Id":"pmo4ud9jg0tmt"},{"type":"partner","person1Id":"pmo4t2s73omvz","person2Id":"pmo4ufn9y0ahn"},{"type":"partner","person1Id":"pmo4u96zph9n5","person2Id":"pmo4ufxpzbouu"},{"type":"partner","person1Id":"pmo4t2s73j77q","person2Id":"pmo4uhm5mmib3"},{"type":"partner","person1Id":"pmo4t2s73rsl9","person2Id":"pmo4uhy1e7hvn"},{"type":"partner","person1Id":"pmo4t2s73uerq","person2Id":"pmo4ui8vvr8db"},{"type":"partner","person1Id":"pmo4t07f8o0lo","person2Id":"pmo4uiz4fgqk4"},{"type":"parent-child","parentId":"pmo4uiz4fgqk4","childId":"pmo4ukqv90teo"},{"type":"parent-child","parentId":"pmo4t07f8o0lo","childId":"pmo4ukqv90teo"},{"type":"parent-child","parentId":"pmo4uiz4fgqk4","childId":"pmo4ukqv97tr8"},{"type":"parent-child","parentId":"pmo4t07f8o0lo","childId":"pmo4ukqv97tr8"},{"type":"parent-child","parentId":"pmo4uiz4fgqk4","childId":"pmo4ukqv901b9"},{"type":"parent-child","parentId":"pmo4t07f8o0lo","childId":"pmo4ukqv901b9"},{"type":"parent-child","parentId":"pmo4uiz4fgqk4","childId":"pmo4ukqv9yug2"},{"type":"parent-child","parentId":"pmo4t07f8o0lo","childId":"pmo4ukqv9yug2"},{"type":"parent-child","parentId":"pmo4uiz4fgqk4","childId":"pmo4ukqv99usn"},{"type":"parent-child","parentId":"pmo4t07f8o0lo","childId":"pmo4ukqv99usn"},{"type":"parent-child","parentId":"pmo4u647klb92","childId":"pmo4uo5dgmtlx"},{"type":"parent-child","parentId":"pmo4ucl28pqjj","childId":"pmo4uo5dgmtlx"},{"type":"parent-child","parentId":"pmo4u647klb92","childId":"pmo4uo5dgha11"},{"type":"parent-child","parentId":"pmo4ucl28pqjj","childId":"pmo4uo5dgha11"},{"type":"parent-child","parentId":"pmo4u647klb92","childId":"pmo4uo5dgc3b8"},{"type":"parent-child","parentId":"pmo4ucl28pqjj","childId":"pmo4uo5dgc3b8"},{"type":"parent-child","parentId":"pmo4u647klb92","childId":"pmo4uo5dglrux"},{"type":"parent-child","parentId":"pmo4ucl28pqjj","childId":"pmo4uo5dglrux"},{"type":"parent-child","parentId":"pmo4u647klb92","childId":"pmo4uo5dgy46j"},{"type":"parent-child","parentId":"pmo4ucl28pqjj","childId":"pmo4uo5dgy46j"},{"type":"parent-child","parentId":"pmo4u647klb92","childId":"pmo4uo5dg4vji"},{"type":"parent-child","parentId":"pmo4ucl28pqjj","childId":"pmo4uo5dg4vji"},{"type":"parent-child","parentId":"pmo4u647klb92","childId":"pmo4uo5dgl0fe"},{"type":"parent-child","parentId":"pmo4ucl28pqjj","childId":"pmo4uo5dgl0fe"},{"type":"parent-child","parentId":"pmo4u647klb92","childId":"pmo4uo5dgp42t"},{"type":"parent-child","parentId":"pmo4ucl28pqjj","childId":"pmo4uo5dgp42t"},{"type":"parent-child","parentId":"pmo4t2s73iom6","childId":"pmo4uou2dx2vf"},{"type":"parent-child","parentId":"pmo4ud9jg0tmt","childId":"pmo4uou2dx2vf"},{"type":"parent-child","parentId":"pmo4t2s73wzcp","childId":"pmndn30vhfz8r"},{"type":"parent-child","parentId":"pmo4uctew3mow","childId":"pmndn30vhfz8r"},{"type":"parent-child","parentId":"pmo4t2s73wzcp","childId":"pmo0h2kl0159h"},{"type":"parent-child","parentId":"pmo4uctew3mow","childId":"pmo0h2kl0159h"},{"type":"parent-child","parentId":"pmo4t2s73wzcp","childId":"pmo4uu2cqnft3"},{"type":"parent-child","parentId":"pmo4uctew3mow","childId":"pmo4uu2cqnft3"},{"type":"parent-child","parentId":"pmo4t2s73wzcp","childId":"pmo4uu2cq2lpc"},{"type":"parent-child","parentId":"pmo4uctew3mow","childId":"pmo4uu2cq2lpc"},{"type":"parent-child","parentId":"pmo4t2s73wzcp","childId":"pmo4uu2cqsbf5"},{"type":"parent-child","parentId":"pmo4uctew3mow","childId":"pmo4uu2cqsbf5"},{"type":"parent-child","parentId":"pmo4t2s73wzcp","childId":"pmo4uu2cqoyhk"},{"type":"parent-child","parentId":"pmo4uctew3mow","childId":"pmo4uu2cqoyhk"},{"type":"parent-child","parentId":"pmo4t2s73wzcp","childId":"pmo4uu2cqp1pf"},{"type":"parent-child","parentId":"pmo4uctew3mow","childId":"pmo4uu2cqp1pf"},{"type":"parent-child","parentId":"pmo4t2s73wzcp","childId":"pmo4uu2cq5qe2"},{"type":"parent-child","parentId":"pmo4uctew3mow","childId":"pmo4uu2cq5qe2"},{"type":"parent-child","parentId":"pmo4u96zph9n5","childId":"pmo4uvvnnu1ci"},{"type":"parent-child","parentId":"pmo4ufxpzbouu","childId":"pmo4uvvnnu1ci"},{"type":"parent-child","parentId":"pmo4u96zph9n5","childId":"pmo4uvvnn3c4e"},{"type":"parent-child","parentId":"pmo4ufxpzbouu","childId":"pmo4uvvnn3c4e"},{"type":"parent-child","parentId":"pmo4u96zph9n5","childId":"pmo4uvvnn5wxq"},{"type":"parent-child","parentId":"pmo4ufxpzbouu","childId":"pmo4uvvnn5wxq"},{"type":"partner","person1Id":"pmo4ukqv901b9","person2Id":"pmo4uyms1yfxm"},{"type":"parent-child","parentId":"pmo4ukqv901b9","childId":"pmo4uzq511aub"},{"type":"parent-child","parentId":"pmo4uyms1yfxm","childId":"pmo4uzq511aub"},{"type":"parent-child","parentId":"pmo4ukqv901b9","childId":"pmo4uzq51bp93"},{"type":"parent-child","parentId":"pmo4uyms1yfxm","childId":"pmo4uzq51bp93"},{"type":"parent-child","parentId":"pmo4ukqv901b9","childId":"pmo4uzq513h5w"},{"type":"parent-child","parentId":"pmo4uyms1yfxm","childId":"pmo4uzq513h5w"},{"type":"parent-child","parentId":"pmo4ukqv901b9","childId":"pmo4uzq51eqjf"},{"type":"parent-child","parentId":"pmo4uyms1yfxm","childId":"pmo4uzq51eqjf"},{"type":"parent-child","parentId":"pmo4t2s73j77q","childId":"pmo4v10zvm6sl"},{"type":"parent-child","parentId":"pmo4uhm5mmib3","childId":"pmo4v10zvm6sl"},{"type":"parent-child","parentId":"pmo4t2s73j77q","childId":"pmo4v10zwor2y"},{"type":"parent-child","parentId":"pmo4uhm5mmib3","childId":"pmo4v10zwor2y"},{"type":"parent-child","parentId":"pmo4t2s73j77q","childId":"pmo4v10zwmzpy"},{"type":"parent-child","parentId":"pmo4uhm5mmib3","childId":"pmo4v10zwmzpy"},{"type":"parent-child","parentId":"pmo4t2s73j77q","childId":"pmo4v10zwgs3c"},{"type":"parent-child","parentId":"pmo4uhm5mmib3","childId":"pmo4v10zwgs3c"},{"type":"parent-child","parentId":"pmo4t2s73j77q","childId":"pmo4v10zwtuom"},{"type":"parent-child","parentId":"pmo4uhm5mmib3","childId":"pmo4v10zwtuom"},{"type":"partner","person1Id":"pmo4szd62qiup","person2Id":"pmo4v4r3i85jz"},{"type":"parent-child","parentId":"pmo4szd62qiup","childId":"pmo4v6ag4btzt"},{"type":"parent-child","parentId":"pmo4v4r3i85jz","childId":"pmo4v6ag4btzt"},{"type":"parent-child","parentId":"pmo4szd62qiup","childId":"pmo4v6ag5tbeg"},{"type":"parent-child","parentId":"pmo4v4r3i85jz","childId":"pmo4v6ag5tbeg"},{"type":"parent-child","parentId":"pmo4szd62qiup","childId":"pmo4v6ag5yshe"},{"type":"parent-child","parentId":"pmo4v4r3i85jz","childId":"pmo4v6ag5yshe"},{"type":"parent-child","parentId":"pmo4szd62qiup","childId":"pmo4v6ag5y6kb"},{"type":"parent-child","parentId":"pmo4v4r3i85jz","childId":"pmo4v6ag5y6kb"},{"type":"parent-child","parentId":"pmo4szd62qiup","childId":"pmo4v6ag5kd8o"},{"type":"parent-child","parentId":"pmo4v4r3i85jz","childId":"pmo4v6ag5kd8o"},{"type":"parent-child","parentId":"pmo4szd62qiup","childId":"pmo4v6ag5b5bp"},{"type":"parent-child","parentId":"pmo4v4r3i85jz","childId":"pmo4v6ag5b5bp"},{"type":"partner","person1Id":"pmni0s7etaht7","person2Id":"pmo4vafk9ne7l"},{"type":"parent-child","parentId":"pmo4vafk9ne7l","childId":"pmni0v8uiu40k"},{"type":"parent-child","parentId":"pmni0s7etaht7","childId":"pmni0v8uiu40k"},{"type":"parent-child","parentId":"pmo4vafk9ne7l","childId":"pmni0v8uiimus"},{"type":"parent-child","parentId":"pmni0s7etaht7","childId":"pmni0v8uiimus"},{"type":"parent-child","parentId":"pmo4vafk9ne7l","childId":"pmni0v8uierpw"},{"type":"parent-child","parentId":"pmni0s7etaht7","childId":"pmni0v8uierpw"},{"type":"parent-child","parentId":"pmo4vafk9ne7l","childId":"pmni0v8ui7vpw"},{"type":"parent-child","parentId":"pmni0s7etaht7","childId":"pmni0v8ui7vpw"},{"type":"parent-child","parentId":"pmo4vafk9ne7l","childId":"pmni0v8uiepz0"},{"type":"parent-child","parentId":"pmni0s7etaht7","childId":"pmni0v8uiepz0"},{"type":"parent-child","parentId":"pmo4vafk9ne7l","childId":"pmni0v8ui9mjd"},{"type":"partner","person1Id":"pmni0v8uiu40k","person2Id":"pmo4vpgqhm6yf"},{"type":"parent-child","parentId":"pmni0s7etaht7","childId":"pmo4vq95k7dyj"},{"type":"parent-child","parentId":"pmo4vafk9ne7l","childId":"pmo4vq95k7dyj"},{"type":"partner","person1Id":"pmo4vq95k7dyj","person2Id":"pmo4vqmi2wfp4"},{"type":"partner","person1Id":"pmni0v8uierpw","person2Id":"pmo4vr6r2vi98"},{"type":"parent-child","parentId":"pmo4vafk9ne7l","childId":"pmni0v8uihcrv"},{"type":"parent-child","parentId":"pmni0v8uiu40k","childId":"pmo4w4s6vuvgz"},{"type":"parent-child","parentId":"pmo4vpgqhm6yf","childId":"pmo4w4s6vuvgz"},{"type":"parent-child","parentId":"pmni0v8uiu40k","childId":"pmo4w4s6vkh69"},{"type":"parent-child","parentId":"pmo4vpgqhm6yf","childId":"pmo4w4s6vkh69"},{"type":"parent-child","parentId":"pmni0v8uiu40k","childId":"pmo4w4s6vrg8q"},{"type":"parent-child","parentId":"pmo4vpgqhm6yf","childId":"pmo4w4s6vrg8q"},{"type":"parent-child","parentId":"pmni0v8uiu40k","childId":"pmo4w4s6vss7k"},{"type":"parent-child","parentId":"pmo4vpgqhm6yf","childId":"pmo4w4s6vss7k"},{"type":"parent-child","parentId":"pmni0v8uierpw","childId":"pmo4w5y12nsjo"},{"type":"parent-child","parentId":"pmo4vr6r2vi98","childId":"pmo4w5y12nsjo"},{"type":"parent-child","parentId":"pmni0v8uierpw","childId":"pmo4w5y12cae6"},{"type":"parent-child","parentId":"pmo4vr6r2vi98","childId":"pmo4w5y12cae6"},{"type":"parent-child","parentId":"pmni0v8uierpw","childId":"pmo4w5y12507h"},{"type":"parent-child","parentId":"pmo4vr6r2vi98","childId":"pmo4w5y12507h"},{"type":"parent-child","parentId":"pmni0v8uierpw","childId":"pmo4w5y12b1h5"},{"type":"parent-child","parentId":"pmo4vr6r2vi98","childId":"pmo4w5y12b1h5"},{"type":"partner","person1Id":"pmni0v8uiepz0","person2Id":"pmo4w6fakq8md"},{"type":"parent-child","parentId":"pmni0v8uiepz0","childId":"pmo4w72fa5g45"},{"type":"parent-child","parentId":"pmo4w6fakq8md","childId":"pmo4w72fa5g45"},{"type":"parent-child","parentId":"pmni0v8uiepz0","childId":"pmo4w72fa19ws"},{"type":"parent-child","parentId":"pmo4w6fakq8md","childId":"pmo4w72fa19ws"},{"type":"partner","person1Id":"pmni0s7etwzn0","person2Id":"pmo4w98msm30i"},{"type":"parent-child","parentId":"pmo4w98msm30i","childId":"pmni14pya5f9h"},{"type":"parent-child","parentId":"pmo4w98msm30i","childId":"pmni14pyarspx"},{"type":"parent-child","parentId":"pmo4w98msm30i","childId":"pmni14pyav3jq"},{"type":"parent-child","parentId":"pmo4w98msm30i","childId":"pmni14pyaujp1"},{"type":"parent-child","parentId":"pmo4w98msm30i","childId":"pmni14pyai87w"},{"type":"partner","person1Id":"pmni14pya5f9h","person2Id":"pmo4wbnzfjghc"},{"type":"partner","person1Id":"pmni14pyarspx","person2Id":"pmo4wc2jwpi7w"},{"type":"partner","person1Id":"pmni14pyav3jq","person2Id":"pmo4wchtwvh9c"},{"type":"parent-child","parentId":"pmni14pya5f9h","childId":"pmo4wdt6k43c8"},{"type":"parent-child","parentId":"pmo4wbnzfjghc","childId":"pmo4wdt6k43c8"},{"type":"parent-child","parentId":"pmni14pya5f9h","childId":"pmo4wdt6kdksz"},{"type":"parent-child","parentId":"pmo4wbnzfjghc","childId":"pmo4wdt6kdksz"},{"type":"parent-child","parentId":"pmni14pya5f9h","childId":"pmo4wdt6krvxa"},{"type":"parent-child","parentId":"pmo4wbnzfjghc","childId":"pmo4wdt6krvxa"},{"type":"parent-child","parentId":"pmni14pya5f9h","childId":"pmo4wdt6kzel5"},{"type":"parent-child","parentId":"pmo4wbnzfjghc","childId":"pmo4wdt6kzel5"},{"type":"parent-child","parentId":"pmni14pyav3jq","childId":"pmo4weihvuabj"},{"type":"parent-child","parentId":"pmo4wchtwvh9c","childId":"pmo4weihvuabj"},{"type":"parent-child","parentId":"pmni14pyav3jq","childId":"pmo4weihvk4lp"},{"type":"parent-child","parentId":"pmo4wchtwvh9c","childId":"pmo4weihvk4lp"},{"type":"partner","person1Id":"pmni0s7ety1t7","person2Id":"pmo4wfjlerx9r"},{"type":"parent-child","parentId":"pmo4wfjlerx9r","childId":"pmni10qws5lcv"},{"type":"parent-child","parentId":"pmo4wfjlerx9r","childId":"pmni10qwsgyfr"},{"type":"parent-child","parentId":"pmo4wfjlerx9r","childId":"pmni10qws94io"},{"type":"parent-child","parentId":"pmo4wfjlerx9r","childId":"pmni10qwsq7q9"},{"type":"parent-child","parentId":"pmo4wfjlerx9r","childId":"pmni10qwrkobm"},{"type":"parent-child","parentId":"pmo4wfjlerx9r","childId":"pmni10qwsu0z7"},{"type":"partner","person1Id":"pmni10qwsq7q9","person2Id":"pmo4wmwkisp4b"},{"type":"partner","person1Id":"pmni10qwrkobm","person2Id":"pmo4wnqt5sjf7"},{"type":"partner","person1Id":"pmni10qws5lcv","person2Id":"pmo4wo9v600oy"},{"type":"parent-child","parentId":"pmni10qws5lcv","childId":"pmo4wor2wvrjj"},{"type":"parent-child","parentId":"pmo4wo9v600oy","childId":"pmo4wor2wvrjj"},{"type":"parent-child","parentId":"pmni10qws5lcv","childId":"pmo4wor2wihti"},{"type":"parent-child","parentId":"pmo4wo9v600oy","childId":"pmo4wor2wihti"},{"type":"partner","person1Id":"pmni10qwsu0z7","person2Id":"pmo4wpxi0f3um"},{"type":"parent-child","parentId":"pmni10qwsu0z7","childId":"pmo4wqumxm2vm"},{"type":"parent-child","parentId":"pmo4wpxi0f3um","childId":"pmo4wqumxm2vm"},{"type":"parent-child","parentId":"pmni10qwsu0z7","childId":"pmo4wqumxcirr"},{"type":"parent-child","parentId":"pmo4wpxi0f3um","childId":"pmo4wqumxcirr"},{"type":"parent-child","parentId":"pmni10qwsq7q9","childId":"pmo4wrv2hr3pk"},{"type":"parent-child","parentId":"pmo4wmwkisp4b","childId":"pmo4wrv2hr3pk"},{"type":"parent-child","parentId":"pmni10qwsq7q9","childId":"pmo4wrv2hslwp"},{"type":"parent-child","parentId":"pmo4wmwkisp4b","childId":"pmo4wrv2hslwp"},{"type":"parent-child","parentId":"pmni10qwsq7q9","childId":"pmo4wrv2hxrd0"},{"type":"parent-child","parentId":"pmo4wmwkisp4b","childId":"pmo4wrv2hxrd0"},{"type":"parent-child","parentId":"pmni10qwrkobm","childId":"pmo4wveblf5x5"},{"type":"parent-child","parentId":"pmo4wnqt5sjf7","childId":"pmo4wveblf5x5"},{"type":"parent-child","parentId":"pmni10qwrkobm","childId":"pmo4wveblcjbe"},{"type":"parent-child","parentId":"pmo4wnqt5sjf7","childId":"pmo4wveblcjbe"},{"type":"parent-child","parentId":"pmni10qwrkobm","childId":"pmo4wvebloqky"},{"type":"parent-child","parentId":"pmo4wnqt5sjf7","childId":"pmo4wvebloqky"},{"type":"parent-child","parentId":"pmni10qwrkobm","childId":"pmo4wvebltb8q"},{"type":"parent-child","parentId":"pmo4wnqt5sjf7","childId":"pmo4wvebltb8q"},{"type":"parent-child","parentId":"pmni10qwrkobm","childId":"pmo4wveblrmqi"},{"type":"parent-child","parentId":"pmo4wnqt5sjf7","childId":"pmo4wveblrmqi"},{"type":"parent-child","parentId":"pmni10qwrkobm","childId":"pmo4wvebl2zvm"},{"type":"parent-child","parentId":"pmo4wnqt5sjf7","childId":"pmo4wvebl2zvm"},{"type":"partner","person1Id":"pmni10qws94io","person2Id":"pmo4wwjpk1bd3"},{"type":"partner","person1Id":"pmni0s7etyv3g","person2Id":"pmo4wyoiqmfi7"},{"type":"parent-child","parentId":"pmo4wyoiqmfi7","childId":"pmni0xjxqp5fh"},{"type":"parent-child","parentId":"pmo4wyoiqmfi7","childId":"pmni0xjxqgts8"},{"type":"parent-child","parentId":"pmo4wyoiqmfi7","childId":"f07"},{"type":"parent-child","parentId":"pmo4wyoiqmfi7","childId":"f11"},{"type":"parent-child","parentId":"pmo4wyoiqmfi7","childId":"pmni0xjxq3aqh"},{"type":"parent-child","parentId":"pmo4wyoiqmfi7","childId":"pmni0xjxqh0e7"},{"type":"partner","person1Id":"pmni0xjxqp5fh","person2Id":"pmo4x48qp13uy"},{"type":"parent-child","parentId":"pmni0xjxqp5fh","childId":"pmo4x5y2qnpps"},{"type":"parent-child","parentId":"pmo4x48qp13uy","childId":"pmo4x5y2qnpps"},{"type":"parent-child","parentId":"pmni0xjxqp5fh","childId":"pmo4x5y2qdylg"},{"type":"parent-child","parentId":"pmo4x48qp13uy","childId":"pmo4x5y2qdylg"},{"type":"parent-child","parentId":"pmni0xjxqp5fh","childId":"pmo4x5y2qxoih"},{"type":"parent-child","parentId":"pmo4x48qp13uy","childId":"pmo4x5y2qxoih"},{"type":"parent-child","parentId":"pmni0xjxqp5fh","childId":"pmo4x5y2qytl3"},{"type":"parent-child","parentId":"pmo4x48qp13uy","childId":"pmo4x5y2qytl3"},{"type":"parent-child","parentId":"pmni0xjxqp5fh","childId":"pmo4x5y2qi17y"},{"type":"parent-child","parentId":"pmo4x48qp13uy","childId":"pmo4x5y2qi17y"},{"type":"parent-child","parentId":"pmni0xjxqp5fh","childId":"pmo4x5y2qeicw"},{"type":"parent-child","parentId":"pmo4x48qp13uy","childId":"pmo4x5y2qeicw"},{"type":"parent-child","parentId":"pmni0xjxqp5fh","childId":"pmo4x5y2qvd6t"},{"type":"parent-child","parentId":"pmo4x48qp13uy","childId":"pmo4x5y2qvd6t"},{"type":"partner","person1Id":"pmni0xjxq42rt","person2Id":"pmo4x78d6od26"},{"type":"parent-child","parentId":"pmni0xjxq42rt","childId":"pmo4x88upl6ua"},{"type":"parent-child","parentId":"pmo4x78d6od26","childId":"pmo4x88upl6ua"},{"type":"parent-child","parentId":"pmni0xjxq42rt","childId":"pmo4x88up7i7r"},{"type":"parent-child","parentId":"pmo4x78d6od26","childId":"pmo4x88up7i7r"},{"type":"parent-child","parentId":"pmni0xjxq42rt","childId":"pmo4x88upxoul"},{"type":"parent-child","parentId":"pmo4x78d6od26","childId":"pmo4x88upxoul"},{"type":"parent-child","parentId":"pmni0xjxq42rt","childId":"pmo4x88up5ikb"},{"type":"parent-child","parentId":"pmo4x78d6od26","childId":"pmo4x88up5ikb"},{"type":"partner","person1Id":"pmni0xjxq3aqh","person2Id":"pmo4x9ugigsr6"},{"type":"parent-child","parentId":"pmo4xeqmrsud9","childId":"pmni0xjxq42rt"},{"type":"partner","person1Id":"pmo4xeqmrsud9","person2Id":"pmni0s7etyv3g"},{"type":"parent-child","parentId":"pmo4xeqmrsud9","childId":"pmni0xjxqy5q5"},{"type":"partner","person1Id":"pmni0s7et7v3g","person2Id":"pmo4xkx7hr4du"},{"type":"parent-child","parentId":"pmo4xkx7hr4du","childId":"pmni0tu13oc3d"},{"type":"parent-child","parentId":"pmo4xkx7hr4du","childId":"pmni0tu14jfoi"},{"type":"parent-child","parentId":"pmo4xkx7hr4du","childId":"pmni0tu14y8tb"},{"type":"parent-child","parentId":"pmo4xkx7hr4du","childId":"pmni0tu14n6g5"},{"type":"parent-child","parentId":"pmo4xkx7hr4du","childId":"pmni0tu14seye"},{"type":"parent-child","parentId":"pmo4xkx7hr4du","childId":"pmni0tu141lkn"},{"type":"parent-child","parentId":"pmo4xkx7hr4du","childId":"pmni0tu14q8j4"},{"type":"parent-child","parentId":"pmni0mtna5vxw","childId":"pmo4xvsspw66y"},{"type":"parent-child","parentId":"pmni0nrmgl4he","childId":"pmo4xvsspw66y"},{"type":"parent-child","parentId":"pmni0mtna5vxw","childId":"pmo4xvsspty1z"},{"type":"parent-child","parentId":"pmni0nrmgl4he","childId":"pmo4xvsspty1z"},{"type":"partner","person1Id":"pmo4xvsspw66y","person2Id":"pmo4xwldcsefq"},{"type":"partner","person1Id":"pmo4xvsspty1z","person2Id":"pmo4xwwkoq57t"},{"type":"parent-child","parentId":"pmo4xvsspty1z","childId":"pmo4xxff5byvg"},{"type":"parent-child","parentId":"pmo4xwwkoq57t","childId":"pmo4xxff5byvg"},{"type":"partner","person1Id":"pmo4xxff5byvg","person2Id":"pmo4xy7vm7yae"},{"type":"parent-child","parentId":"pmo4t2s73iom6","childId":"pmo4yhshfrk8r"},{"type":"parent-child","parentId":"pmo4ud9jg0tmt","childId":"pmo4yhshfrk8r"},{"type":"parent-child","parentId":"pmo4t2s73iom6","childId":"pmo4yhshfg8bw"},{"type":"parent-child","parentId":"pmo4ud9jg0tmt","childId":"pmo4yhshfg8bw"},{"type":"parent-child","parentId":"pmo4t2s73iom6","childId":"pmo4yhshfiqj9"},{"type":"parent-child","parentId":"pmo4ud9jg0tmt","childId":"pmo4yhshfiqj9"},{"type":"parent-child","parentId":"pmo4t2s73iom6","childId":"pmo4yhshfnakz"},{"type":"parent-child","parentId":"pmo4ud9jg0tmt","childId":"pmo4yhshfnakz"},{"type":"parent-child","parentId":"pmo4t2s73iom6","childId":"pmo4yhshfchtu"},{"type":"parent-child","parentId":"pmo4ud9jg0tmt","childId":"pmo4yhshfchtu"},{"type":"parent-child","parentId":"pmo4t2s73iom6","childId":"pmo4yhshfqlrh"},{"type":"parent-child","parentId":"pmo4ud9jg0tmt","childId":"pmo4yhshfqlrh"},{"type":"parent-child","parentId":"pmo4t2s73iom6","childId":"pmo4yhshfcij8"},{"type":"parent-child","parentId":"pmo4ud9jg0tmt","childId":"pmo4yhshfcij8"},{"type":"parent-child","parentId":"pmo4t2s73iom6","childId":"pmo4yhshf4aid"},{"type":"parent-child","parentId":"pmo4ud9jg0tmt","childId":"pmo4yhshf4aid"},{"type":"parent-child","parentId":"pmnfwl6r2k67v","childId":"f14"},{"type":"parent-child","parentId":"pmo4tjfzukw6f","childId":"f14"},{"type":"parent-child","parentId":"pmni14pyarspx","childId":"pmo70z4rspi7d"},{"type":"parent-child","parentId":"pmo4wc2jwpi7w","childId":"pmo70z4rspi7d"},{"type":"parent-child","parentId":"pmni14pyarspx","childId":"pmo70z4rsajz3"},{"type":"parent-child","parentId":"pmo4wc2jwpi7w","childId":"pmo70z4rsajz3"},{"type":"parent-child","parentId":"pmni14pyarspx","childId":"pmo70z4rs3c8z"},{"type":"parent-child","parentId":"pmo4wc2jwpi7w","childId":"pmo70z4rs3c8z"},{"type":"partner","person1Id":"pmni14pyaujp1","person2Id":"pmo70zlol6io2"},{"type":"partner","person1Id":"pmni14pyai87w","person2Id":"pmo71019rdde4"}]};
// __START_DATA_END__

// ============================================================
// STORAGE
// ============================================================
const STORAGE_KEY = 'familieboom_v11';
const DATA_VERSION_KEY = 'fb_data_version';

// DATA_VERSION: verhoog dit getal ELKE keer dat START_DATA wordt gewijzigd.
// Dit triggert een smart sync die:
//   ✅ bestaande persoonsvelden updatet (naam, geboortedatum, etc.)
//   ✅ nieuwe personen/relaties toevoegt
//   ✅ relaties verwijdert die niet meer in START_DATA staan
//   ✅ door gebruiker toegevoegde personen/relaties behoudt
const DATA_VERSION = 100;
const FORCE_RESET_VERSION = 100; // Bij deze versie: volledige reset van localStorage

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    alert('⚠️ Opslag vol!\n\nDe wijziging kon niet worden opgeslagen. Foto\'s nemen veel ruimte in. Verwijder een foto of exporteer en reset de app.');
  }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      state = parsed;
      syncWithStartData();
      return true;
    } catch (e) {
      console.error('[Stamboom] localStorage data is corrupt:', e);
      showToast('⚠️ Opgeslagen data is corrupt en kon niet worden geladen. Standaarddata wordt gebruikt.', '', 8000);
    }
  }
  return false;
}

// Smart sync: synchroniseer localStorage met START_DATA op basis van DATA_VERSION.
// Drie operaties:
//   1. UPDATE: personen die in START_DATA staan → update velden (naam, geboortedatum, etc.)
//   2. ADD:    personen/relaties in START_DATA die niet in localStorage staan → toevoegen
//   3. DELETE: relaties die in de VORIGE versie van START_DATA stonden maar nu niet meer → verwijderen
//
// Alles wat de gebruiker zelf heeft toegevoegd via de UI blijft behouden.
function syncWithStartData() {
  const BASELINE_KEY = 'fb_start_baseline';
  const storedVersion = parseInt(localStorage.getItem(DATA_VERSION_KEY) || '0', 10);
  if (storedVersion >= DATA_VERSION) return; // al gesynchroniseerd

  // Harde reset: vervang localStorage volledig door START_DATA
  if (storedVersion < FORCE_RESET_VERSION) {
    console.log(`[Stamboom] Harde reset: v${storedVersion} → v${DATA_VERSION} (${START_DATA.persons.length} personen)`);
    state = JSON.parse(JSON.stringify(START_DATA));
    localStorage.setItem(BASELINE_KEY, JSON.stringify(START_DATA));
    localStorage.setItem(DATA_VERSION_KEY, String(DATA_VERSION));
    saveState();
    return;
  }

  console.log(`[Stamboom] Data sync: v${storedVersion} → v${DATA_VERSION}`);
  const startIds = new Set(START_DATA.persons.map(p => p.id));
  let updated = 0, added = 0, removed = 0;

  // --- Relatie-sleutel helper ---
  const relKey = r => {
    if (r.type === 'partner' || r.type === 'sibling')
      return `${r.type}|${[r.person1Id, r.person2Id].sort().join(',')}`;
    return `${r.type}|${r.parentId || r.person1Id}|${r.childId || r.person2Id}`;
  };

  // --- 1. UPDATE bestaande personen (alleen velden die Claude wijzigde) ---
  // Baseline = de START_DATA snapshot van de VORIGE sync.
  // Als localStorage-waarde == baseline → gebruiker heeft NIET gewijzigd → update naar nieuwe START_DATA
  // Als localStorage-waarde != baseline → gebruiker HEEFT gewijzigd → behoud gebruikerswaarde
  // Bij eerste sync (geen baseline): NIET updaten — gebruiker heeft mogelijk al wijzigingen gemaakt
  const baselineRaw = localStorage.getItem(BASELINE_KEY);
  const baseline = baselineRaw ? JSON.parse(baselineRaw) : null;
  const baselinePersons = {};
  if (baseline) {
    baseline.persons.forEach(p => { baselinePersons[p.id] = p; });
  }

  START_DATA.persons.forEach(sp => {
    const existing = state.persons.find(p => p.id === sp.id);
    if (!existing) return;
    const base = baselinePersons[sp.id]; // vorige START_DATA waarde
    Object.keys(sp).forEach(key => {
      if (key === 'id') return;
      if (sp[key] === existing[key]) return; // al gelijk, niets te doen
      if (!base) return; // geen baseline → eerste sync → behoud gebruikerswaarde
      // Heeft de gebruiker dit veld gewijzigd ten opzichte van de vorige START_DATA?
      const userChanged = existing[key] !== base[key];
      if (userChanged) return; // gebruiker heeft dit veld zelf gewijzigd → behouden
      // Gebruiker heeft het NIET gewijzigd → update naar nieuwe START_DATA waarde
      existing[key] = sp[key];
      updated++;
    });
  });

  // --- 2. ADD ontbrekende personen ---
  const existingIds = new Set(state.persons.map(p => p.id));
  START_DATA.persons.forEach(sp => {
    if (existingIds.has(sp.id)) return;
    state.persons.push(JSON.parse(JSON.stringify(sp)));
    existingIds.add(sp.id);
    added++;
  });

  // --- 3. ADD ontbrekende relaties ---
  const existingRels = new Set(state.relationships.map(relKey));
  START_DATA.relationships.forEach(sr => {
    const key = relKey(sr);
    if (!existingRels.has(key)) {
      state.relationships.push(JSON.parse(JSON.stringify(sr)));
      existingRels.add(key);
      added++;
    }
  });

  // --- 4. DELETE relaties die niet meer in START_DATA staan ---
  // Alleen relaties verwijderen waarvan BEIDE personen in START_DATA staan
  // (= relaties die oorspronkelijk uit START_DATA kwamen).
  // Relaties met door-gebruiker-toegevoegde personen blijven altijd behouden.
  const startRelKeys = new Set(START_DATA.relationships.map(relKey));
  const before = state.relationships.length;
  state.relationships = state.relationships.filter(r => {
    const key = relKey(r);
    // Relatie staat in START_DATA → behouden
    if (startRelKeys.has(key)) return true;
    // Check of BEIDE personen uit START_DATA komen
    const ids = [r.parentId, r.childId, r.person1Id, r.person2Id].filter(Boolean);
    const bothFromStart = ids.every(id => startIds.has(id));
    if (bothFromStart) {
      // Relatie was oorspronkelijk uit START_DATA maar is verwijderd → ook hier verwijderen
      removed++;
      return false;
    }
    // Minstens één persoon is door gebruiker toegevoegd → behouden
    return true;
  });

  // --- 5. DEDUP: verwijder dubbele relaties ---
  {
    const seen = new Set();
    state.relationships = state.relationships.filter(r => {
      const k = relKey(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  // Baseline opslaan: snapshot van huidige START_DATA voor volgende sync
  // Hiermee weten we bij de volgende sync welke velden de GEBRUIKER heeft gewijzigd
  localStorage.setItem(BASELINE_KEY, JSON.stringify(START_DATA));
  localStorage.setItem(DATA_VERSION_KEY, String(DATA_VERSION));
  saveState();

  if (updated || added || removed) {
    console.log(`[Stamboom] Sync klaar: ${updated} bijgewerkt, ${added} toegevoegd, ${removed} verwijderd`);
  }
}

// ============================================================
// CYCLE DETECTION
// ============================================================
function wouldCreateCycle(parentId, childId) {
  // BFS: check of childId al een voorouder is van parentId
  const visited = new Set();
  const queue = [parentId];
  while (queue.length) {
    const current = queue.shift();
    if (current === childId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    // Zoek ouders van current
    state.relationships.forEach(r => {
      if (r.type === 'parent-child' && r.childId === current) {
        queue.push(r.parentId);
      }
    });
  }
  return false;
}

// ============================================================
// GRAPH HELPERS
// ============================================================
function getPerson(id) {
  return state.persons.find(p => p.id === id);
}

function getChildrenOf(personId) {
  return state.relationships
    .filter(r => r.type === 'parent-child' && r.parentId === personId)
    .map(r => r.childId);
}

function getParentsOf(personId) {
  return state.relationships
    .filter(r => r.type === 'parent-child' && r.childId === personId)
    .map(r => r.parentId);
}

function getPartnersOf(personId) {
  return state.relationships
    .filter(r => r.type === 'partner' && (r.person1Id === personId || r.person2Id === personId))
    .map(r => r.person1Id === personId ? r.person2Id : r.person1Id);
}

function getSocialParentsOf(personId) {
  return state.relationships
    .filter(r => r.type === 'social-parent' && r.childId === personId)
    .map(r => r.parentId);
}

function getSocialChildrenOf(personId) {
  return state.relationships
    .filter(r => r.type === 'social-parent' && r.parentId === personId)
    .map(r => r.childId);
}

// ============================================================
// GOUDEN PAD HELPERS
// ============================================================
function getBioFather(personId) {
  return getParentsOf(personId).map(getPerson).filter(Boolean).find(p => p.gender === 'm')?.id || null;
}
function getBioMother(personId) {
  return getParentsOf(personId).map(getPerson).filter(Boolean).find(p => p.gender === 'f')?.id || null;
}

function buildPathUp(startId, posMap, dupsMap, sourceGhostKey) {
  const pathIds = new Set([startId]);
  const edges = new Set();
  const ghostNodes = new Set(sourceGhostKey ? [sourceGhostKey] : []);
  const visited = new Set([startId]);
  const queue = [startId];
  while (queue.length) {
    const cur = queue.shift();
    const bioParents = getParentsOf(cur);
    bioParents.forEach(parentId => {
      // Visible in pos OF als ghost in dups
      let visible = !!(posMap && posMap[parentId]);
      let parentGhostKey = null;
      if (!visible && dupsMap) {
        for (const [k, g] of Object.entries(dupsMap)) {
          if (g.personId === parentId) { parentGhostKey = k; visible = true; break; }
        }
      }
      if (!visible) return;
      pathIds.add(parentId);
      edges.add(cur + '|' + parentId);
      if (parentGhostKey) ghostNodes.add(parentGhostKey);
      if (!visited.has(parentId)) {
        visited.add(parentId);
        queue.push(parentId);
      }
    });
  }
  return { sourceId: startId, sourceGhostKey, pathIds, edges, ghostNodes };
}

function findAncestorRoot(startId, side) {
  // side: 'father', 'mother', 'social'
  let curr = startId;
  const seen = new Set();
  while (curr && !seen.has(curr)) {
    seen.add(curr);
    let next;
    if (side === 'social') {
      next = getSocialParentsOf(curr)[0];
    } else if (curr === startId) {
      next = (side === 'father') ? getBioFather(curr) : getBioMother(curr);
    } else {
      next = getBioFather(curr) || getBioMother(curr);
    }
    if (!next) break;
    curr = next;
  }
  return curr;
}

function findHeadForRoot(rootId) {
  // Zoek de tree head waarvan rootId of zijn afstammelingen onderdeel zijn
  const stambomen = computeStambomen();
  // Eerste poging: exact match
  const exact = stambomen.find(s => s.headId === rootId);
  if (exact) return exact.headId;
  // Anders: zoek een tree die de root bevat als descendant
  for (const s of stambomen) {
    const persons = new Set(getStamboomPersons(s.headId));
    if (persons.has(rootId)) return s.headId;
  }
  return rootId; // fallback
}

function getSiblingsOf(personId) {
  return state.relationships
    .filter(r => r.type === 'sibling' && (r.person1Id === personId || r.person2Id === personId))
    .map(r => r.person1Id === personId ? r.person2Id : r.person1Id);
}

function uid() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ============================================================
// STAMBOOM HELPERS
// ============================================================

// Geeft alle personen terug die bij de stamboom van headId horen
// (headId + partner(s) + alle nakomelingen + hun partners)
// Social-parent logica:
// - Social children van het hoofd (of diens bloedlijn) worden meegenomen
// - Maar alleen als de social parent zelf in de bloedlijn van deze boom zit
//   (d.w.z. het hoofd IS de social parent, of de social parent is nakomeling van het hoofd)
// - In de boom van de biologische ouder worden social-parent relaties genegeerd
function getStamboomPersons(headId) {
  const result = new Set();
  // Houd bij welke personen via de bloedlijn bereikt zijn (niet alleen als partner)
  const bloodline = new Set();
  function walk(id) {
    if (result.has(id)) return;
    result.add(id);
    bloodline.add(id);
    getPartnersOf(id).forEach(pid => result.add(pid));
    getChildrenOf(id).forEach(cid => {
      // Co-ouder: alleen toevoegen als ze GEEN eigen ouders hebben en niet al in een andere boom zitten
      getParentsOf(cid).forEach(pid => {
        if (!result.has(pid) &&
            getParentsOf(pid).length === 0 &&
            !getPartnersOf(pid).some(pp => getParentsOf(pp).length > 0)) {
          result.add(pid);
        }
      });
      walk(cid);
    });
    // Social children: alleen meenemen als de social parent in de bloedlijn
    // van deze boom zit (= id zelf is in de bloodline set)
    // Dit voorkomt dat sociale kinderen via een aangetrouwde partner worden meegesleurd
    if (bloodline.has(id)) {
      getSocialChildrenOf(id).forEach(cid => walk(cid));
    }
  }
  walk(headId);
  return [...result];
}

// Berekent de lijst van stambomen voor de sidebar
function computeStambomen() {
  const stambomen = [];
  const seenHeads = new Set();

  // Helper: vind het mannelijke hoofd van een gezin (of de persoon zelf)
  function findHead(personId) {
    const person = getPerson(personId);
    if (!person) return null;
    if (person.gender === 'm') return person;
    // Zoek een mannelijke partner
    const malePartner = getPartnersOf(personId)
      .map(getPerson)
      .find(p => p && p.gender === 'm');
    return malePartner || person;
  }

  // 1. Alle root-personen (geen ouders) → topniveau stambomen
  state.persons
    .filter(p => getParentsOf(p.id).length === 0)
    .forEach(person => {
      const head = findHead(person.id);
      if (!head || seenHeads.has(head.id)) return;
      seenHeads.add(head.id);
      getPartnersOf(head.id).forEach(pid => seenHeads.add(pid));
      const persons = getStamboomPersons(head.id);
      stambomen.push({ headId: head.id, label: head.name, count: persons.length, isRoot: true });
    });

  // 2. Sub-stambomen: elke persoon met kinderen die nog niet als hoofd staat
  state.persons
    .filter(p => getChildrenOf(p.id).length > 0)
    .forEach(person => {
      const head = findHead(person.id);
      if (!head || seenHeads.has(head.id)) return;
      seenHeads.add(head.id);
      getPartnersOf(head.id).forEach(pid => seenHeads.add(pid));
      const persons = getStamboomPersons(head.id);
      stambomen.push({ headId: head.id, label: head.name, count: persons.length, isRoot: false });
    });

  // Sorteer: roots eerst, dan alfabetisch
  stambomen.sort((a, b) => {
    if (a.isRoot !== b.isRoot) return a.isRoot ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return stambomen;
}

// Geeft de actieve persoon-IDs terug (alles als geen filter actief)
function getActivePersonIds() {
  if (!activeTreeId) return new Set(state.persons.map(p => p.id));
  return new Set(getStamboomPersons(activeTreeId));
}

// ============================================================
// GEZIN COLLAPSE/EXPAND
// ============================================================
function getHiddenByCollapse(activeIds) {
  if (collapsedGezinnen.size === 0) return new Set();
  const hidden = new Set();

  function collectDescendants(id) {
    if (hidden.has(id)) return;
    hidden.add(id);
    // Verberg partners, MAAR alleen als die partner geen eigen ouders heeft
    // die zichtbaar blijven (en niet zelf verborgen zijn).
    // Anders is de partner bereikbaar via zijn eigen tak en moet zichtbaar blijven.
    getPartnersOf(id).forEach(pid => {
      if (hidden.has(pid)) return;
      const partnerParents = getParentsOf(pid);
      // Partner heeft zichtbare ouders in een ANDERE tak → niet verbergen
      const hasVisibleParent = partnerParents.length > 0 &&
        partnerParents.some(ppid => activeIds.has(ppid) && !hidden.has(ppid));
      if (!hasVisibleParent) hidden.add(pid);
    });
    // Verberg alle kinderen recursief
    getChildrenOf(id).forEach(cid => collectDescendants(cid));
    getSocialChildrenOf(id).forEach(cid => collectDescendants(cid));
  }

  collapsedGezinnen.forEach(key => {
    const parentIds = key.split(',');
    // Verifieer dat ouders in de actieve set zitten
    if (!parentIds.every(pid => activeIds.has(pid))) return;

    // Vind kinderen van dit ouderpaar
    const firstParent = parentIds[0];
    const children = getChildrenOf(firstParent).filter(cid => {
      const cParents = getParentsOf(cid).sort();
      return cParents.join(',') === key;
    });

    children.forEach(cid => collectDescendants(cid));
  });

  return hidden;
}

function toggleGezin(key) {
  if (collapsedGezinnen.has(key)) {
    collapsedGezinnen.delete(key);
  } else {
    collapsedGezinnen.add(key);
  }
  saveCollapsedState();
  render();
}

// ============================================================
// KERNREGEL: geen twee kaarten mogen overlappen (2D)
// ============================================================
// Sweep-line algoritme: sorteer alle nodes op X, controleer elk paar
// op 2D overlap. Bij overlap: verschuif de rechter node + alles rechts
// ervan op dezelfde Y. Maximaal 5 passes.
function resolveOverlaps(pos, verticalGroupMap, extraSkipSet) {
  // Per-paar skip: alleen nodes in DEZELFDE verticale groep skippen
  const sameGroup = new Set();
  if (verticalGroupMap) {
    const groups = {};
    Object.keys(verticalGroupMap).forEach(id => {
      const g = verticalGroupMap[id];
      if (!groups[g]) groups[g] = [];
      groups[g].push(id);
    });
    Object.values(groups).forEach(members => {
      for (let i = 0; i < members.length; i++)
        for (let j = i + 1; j < members.length; j++) {
          const key = members[i] < members[j]
            ? members[i] + '|' + members[j]
            : members[j] + '|' + members[i];
          sameGroup.add(key);
        }
    });
  }
  // ALLE nodes meenemen (niet meer globaal skippen)
  const allNodeIds = Object.keys(pos).filter(id =>
    pos[id] && (!extraSkipSet || !extraSkipSet.has(id))
  );
  for (let pass = 0; pass < 30; pass++) {
    let hadOverlap = false;
    allNodeIds.sort((a, b) => pos[a].x - pos[b].x);
    for (let i = 0; i < allNodeIds.length; i++) {
      const idA = allNodeIds[i];
      const a = pos[idA];
      if (!a) continue;
      for (let j = i + 1; j < allNodeIds.length; j++) {
        const idB = allNodeIds[j];
        const b = pos[idB];
        if (!b) continue;
        if (b.x >= a.x + NODE_W + H_GAP) break;
        // Skip overlap-check alleen als DEZELFDE verticale groep
        const pairKey = idA < idB ? idA + '|' + idB : idB + '|' + idA;
        if (sameGroup.has(pairKey)) continue;
        const overlapX = a.x < b.x + NODE_W && b.x < a.x + NODE_W;
        const overlapY = a.y < b.y + NODE_H && b.y < a.y + NODE_H;
        if (overlapX && overlapY) {
          const shiftNeeded = (a.x + NODE_W + H_GAP) - b.x;
          if (shiftNeeded > 0) {
            const bY = b.y;
            const bX = b.x;
            allNodeIds.forEach(nid => {
              if (pos[nid] && pos[nid].y === bY && pos[nid].x >= bX && nid !== idA) {
                pos[nid].x += shiftNeeded;
              }
            });
            hadOverlap = true;
          }
        }
      }
    }
    if (!hadOverlap) break;
  }
}

// ============================================================
// LAYOUT ALGORITHM
// ============================================================
function computeLayout(overrideIds, headId) {
  let activeIds = overrideIds || getActivePersonIds();
  // Track reclassified neef-nicht movers (Nilab, Alia) zodat post-pipeline
  // ghost-creator hen ook bij hun originele bio-familie kan tonen
  const reclassifiedBioParents = {}; // moverId → {bioParents:[], partnerId}

  // Filter verborgen personen door ingeklapte gezinnen
  let hiddenByCollapse = new Set();
  if (collapsedGezinnen.size > 0) {
    activeIds = new Set(activeIds); // kopie zodat origineel niet gemuteerd wordt
    hiddenByCollapse = getHiddenByCollapse(activeIds);
    hiddenByCollapse.forEach(id => activeIds.delete(id));
  }

  const persons   = state.persons.filter(p => activeIds.has(p.id));
  if (persons.length === 0) return {};

  // Dynamische V_GAP: grotere bomen krijgen meer verticale ruimte
  const effectiveVGap = V_GAP + Math.min(persons.length, 80) * 0.6;

  // --- Build adjacency maps ---
  const childrenOf  = {};
  const parentsOf   = {};
  const partnersOf  = {};
  const verticalGroupMap = {}; // id → [ids in same vertical column]

  persons.forEach(p => {
    childrenOf[p.id]  = [];
    parentsOf[p.id]   = [];
    partnersOf[p.id]  = [];
  });

  // Eerst biologische parent-child en partner relaties verwerken
  const pendingSocialParent = [];
  state.relationships.forEach(r => {
    if (r.type === 'parent-child') {
      if (childrenOf[r.parentId] !== undefined) {
        childrenOf[r.parentId].push(r.childId);
        if (parentsOf[r.childId] !== undefined) parentsOf[r.childId].push(r.parentId);
      }
    } else if (r.type === 'social-parent') {
      pendingSocialParent.push(r);
    } else if (r.type === 'partner') {
      if (partnersOf[r.person1Id] !== undefined) partnersOf[r.person1Id].push(r.person2Id);
      if (partnersOf[r.person2Id] !== undefined) partnersOf[r.person2Id].push(r.person1Id);
    }
  });

  // --- Detecteer en breek parent-child cycli ---
  // Een cyclus ontstaat als persoon A zowel voorouder als nakomeling is van persoon B
  // (bijv. door data-fouten). Dit veroorzaakt oneindige lus in generatie-toewijzing.
  {
    const W = 0, G = 1, B = 2;
    const color = {};
    function dfsCycle(id) {
      color[id] = G;
      const kids = childrenOf[id] || [];
      for (let i = kids.length - 1; i >= 0; i--) {
        const cid = kids[i];
        if (color[cid] === G) {
          // Back-edge gevonden = cyclus. Verwijder deze edge.
          console.warn(`[Layout] Cyclus gedetecteerd: ${getPerson(id)?.name} → ${getPerson(cid)?.name}. Edge verwijderd.`);
          kids.splice(i, 1);
          if (parentsOf[cid]) parentsOf[cid] = parentsOf[cid].filter(p => p !== id);
        } else if (color[cid] !== B) {
          dfsCycle(cid);
        }
      }
      color[id] = B;
    }
    Object.keys(childrenOf).forEach(id => { if (!color[id]) dfsCycle(id); });
  }

  // Social-parent relaties verwerken:
  // Altijd registreren in socialChildIds (voor socialBirthOrder sortering).
  // Alleen als parent-child toevoegen als het kind GEEN bio-ouders heeft.
  const socialChildIds = new Set(); // Track sociale kinderen voor sortering
  const hasBioParents = new Set();
  persons.forEach(p => {
    if (parentsOf[p.id].length > 0) hasBioParents.add(p.id);
  });
  pendingSocialParent.forEach(r => {
    if (childrenOf[r.parentId] === undefined) return; // social parent niet in layout
    if (parentsOf[r.childId] === undefined) return;   // kind niet in layout
    // Altijd als sociaal kind registreren (voor socialBirthOrder)
    socialChildIds.add(r.childId);
    // Heeft het kind biologische ouders in deze layout?
    if (hasBioParents.has(r.childId)) return; // ja → NIET als parent-child toevoegen (voorkomt gen-shift)
    // Geen bio-ouders → social-parent als parent-child behandelen
    childrenOf[r.parentId].push(r.childId);
    parentsOf[r.childId].push(r.parentId);
  });

  // Infer co-ouder paren (delen een kind maar hebben geen expliciete partner-relatie)
  // Alleen voor personen zonder eigen ouders in deze layout (vrij-zwevende co-ouders)
  // BELANGRIJK: social-parent relaties worden UITGESLOTEN — die mogen geen
  // co-ouder-koppeling veroorzaken (anders schuiven generaties verkeerd)
  const socialParentSet = new Set();
  state.relationships.forEach(r => {
    if (r.type === 'social-parent') socialParentSet.add(r.parentId + ':' + r.childId);
  });
  persons.forEach(p => {
    (childrenOf[p.id] || []).forEach(cid => {
      if (socialParentSet.has(p.id + ':' + cid)) return;
      (parentsOf[cid] || []).forEach(copid => {
        if (copid === p.id || partnersOf[copid] === undefined) return;
        if (parentsOf[copid].length > 0) return;
        if (socialParentSet.has(copid + ':' + cid)) return;
        if (!partnersOf[p.id].includes(copid)) partnersOf[p.id].push(copid);
        if (!partnersOf[copid].includes(p.id)) partnersOf[copid].push(p.id);
      });
    });
  });

  // --- Assign generation levels via BFS (met cyclus-beveiliging) ---
  const genOf = {};
  const roots = persons.filter(p => parentsOf[p.id].length === 0).map(p => p.id);

  const queue = [...roots];
  let head = 0;
  roots.forEach(id => { genOf[id] = 0; });

  const MAX_GEN = 50; // veiligheidsgrens — voorkomt oneindige lus bij circulaire relaties
  while (head < queue.length) {
    const id = queue[head++];
    const currentGen = genOf[id] || 0;
    if (currentGen >= MAX_GEN) continue; // cyclus afkappen
    (childrenOf[id] || []).forEach(cid => {
      const g = currentGen + 1;
      if (genOf[cid] === undefined || genOf[cid] < g) {
        genOf[cid] = g;
        queue.push(cid);
      }
    });
  }

  // Any disconnected node defaults to gen 0
  persons.forEach(p => { if (genOf[p.id] === undefined) genOf[p.id] = 0; });

  // Partners must share the same generation (take max, multiple passes)
  // ALLEEN voor personen die in deze layout zitten — voorkom leaking naar buiten
  for (let pass = 0; pass < 6; pass++) {
    state.relationships.forEach(r => {
      if (r.type === 'partner') {
        if (!activeIds.has(r.person1Id) || !activeIds.has(r.person2Id)) return;
        const g = Math.max(genOf[r.person1Id] || 0, genOf[r.person2Id] || 0);
        genOf[r.person1Id] = g;
        genOf[r.person2Id] = g;
      }
      // Broers/zussen op hetzelfde generatieniveau zetten
      if (r.type === 'sibling') {
        if (!activeIds.has(r.person1Id) || !activeIds.has(r.person2Id)) return;
        const g = Math.max(genOf[r.person1Id] ?? 0, genOf[r.person2Id] ?? 0);
        if (genOf[r.person1Id] !== undefined) genOf[r.person1Id] = g;
        if (genOf[r.person2Id] !== undefined) genOf[r.person2Id] = g;
      }
    });
  }

  // Generatie-sync voor inferred co-ouder paren (niet in state.relationships)
  for (let pass = 0; pass < 3; pass++) {
    persons.forEach(p => {
      (partnersOf[p.id] || []).forEach(pid => {
        if (genOf[p.id] !== undefined && genOf[pid] !== undefined) {
          const g = Math.max(genOf[p.id], genOf[pid]);
          genOf[p.id] = g;
          genOf[pid] = g;
        }
      });
    });
  }

  // Na co-ouder gen-sync: cascade generatieniveaus door naar kinderen.
  // Gaffar werd bijv. van gen0 → gen1 getild, maar Benjamin (zijn kind) was al gen1
  // via BFS (toen Gaffar nog gen0 was). Nu moet Benjamin naar gen2.
  {
    const cascadeQueue = persons.map(p => p.id);
    let qi = 0;
    const cascadeCount = {}; // veiligheid: max aantal keer per persoon
    while (qi < cascadeQueue.length) {
      const id = cascadeQueue[qi++];
      cascadeCount[id] = (cascadeCount[id] || 0) + 1;
      if (cascadeCount[id] > 5) continue; // cyclus-beveiliging: stop na 5 keer
      const myGen = genOf[id] ?? 0;
      if (myGen >= MAX_GEN) continue; // cyclus-beveiliging
      (childrenOf[id] || []).forEach(cid => {
        if (genOf[cid] !== undefined && genOf[cid] < myGen + 1) {
          genOf[cid] = myGen + 1;
          cascadeQueue.push(cid); // opnieuw door de kinderen van dit kind
        }
      });
    }
  }

  // Post-cascade partner re-alignment: cascade kan partners uit sync trekken.
  // Bijv. Bibi Hura (gen 0→1) is partner van Wazir Gol (gen 1→3 na cascade).
  // Verplaats in-laws (geen ouders in deze layout) naar de generatie van hun
  // partner, TENZIJ de partner een afstammeling is van de in-law (circulaire
  // relatie, bijv. Mahmadgul → Wazir Gol → Hajiro → partner Mahmadgul).
  {
    // Helper: is descendantId een afstammeling van ancestorId?
    function isDescOf(ancestorId, descendantId) {
      const visited = new Set();
      function walk(id) {
        if (visited.has(id)) return false;
        visited.add(id);
        if (id === descendantId) return true;
        return (childrenOf[id] || []).some(cid => walk(cid));
      }
      return (childrenOf[ancestorId] || []).some(cid => walk(cid));
    }

    const rootPersons = persons.filter(p => (parentsOf[p.id] || []).length === 0);
    let changed = false;
    rootPersons.forEach(p => {
      (partnersOf[p.id] || []).forEach(pid => {
        if (genOf[p.id] !== undefined && genOf[pid] !== undefined && genOf[p.id] < genOf[pid]) {
          // Alleen verplaatsen als partner GEEN afstammeling is (geen circulaire relatie)
          if (!isDescOf(p.id, pid)) {
            genOf[p.id] = genOf[pid];
            changed = true;
          }
        }
      });
    });
    // Re-cascade als er iets veranderd is (meerdere niveaus)
    if (changed) {
      const cq = persons.map(p => p.id);
      let ci = 0;
      const cc2 = {};
      while (ci < cq.length) {
        const id = cq[ci++];
        cc2[id] = (cc2[id] || 0) + 1;
        if (cc2[id] > 5) continue; // cyclus-beveiliging
        const myGen = genOf[id] ?? 0;
        if (myGen >= MAX_GEN) continue;
        (childrenOf[id] || []).forEach(cid => {
          if (genOf[cid] !== undefined && genOf[cid] < myGen + 1) {
            genOf[cid] = myGen + 1;
            cq.push(cid);
          }
        });
      }
    }
  }

  // --- Group by generation ---
  const byGen = {};
  persons.forEach(p => {
    const g = genOf[p.id];
    if (!byGen[g]) byGen[g] = [];
    byGen[g].push(p.id);
  });
  const gens = Object.keys(byGen).map(Number).sort((a, b) => a - b);

  // DEBUG: expose genOf voor inspectie
  if (typeof window !== 'undefined') window._debugGenOf = genOf;

  const pos = {};

  // Helper: couple center x (midpoint between two partners, or just the node center)
  const coupleCenterX = id => {
    const myPartners = (partnersOf[id] || []).filter(pid => genOf[pid] === genOf[id] && pos[pid]);
    if (!myPartners.length) return pos[id] ? pos[id].x + NODE_W / 2 : 0;
    const xs = [pos[id].x, ...myPartners.map(pid => pos[pid].x)];
    return (Math.min(...xs) + Math.max(...xs) + NODE_W) / 2;
  };

  // Helper: duw nodes naar rechts als ze overlappen.
  // Partners worden als eenheid behandeld (nooit splitsen),
  // MAAR alleen als ze dicht bij elkaar staan (max 2 nodes ertussen).
  // Ver-uit-elkaar-staande partners (cross-family huwelijken) worden apart behandeld,
  // anders ontstaat een "brug" die alles ertussen ver naar rechts duwt.
  const MAX_PARTNER_DIST = 3 * (NODE_W + H_GAP);
  const fixOverlaps = gen => {
    // Filter verticale groep-leden (behalve eerste) — die overlappen bewust
    const vgFirstOnly = new Set();
    const genMembers = (byGen[gen] || []).filter(id => {
      if (!pos[id]) return false;
      if (verticalGroupMap[id]) {
        const group = verticalGroupMap[id];
        if (vgFirstOnly.has(group)) return false; // niet-eerste lid, skip
        vgFirstOnly.add(group);
      }
      return true;
    });
    const inUnit = new Set();
    const units = [];
    genMembers.forEach(id => {
      if (inUnit.has(id)) return;
      // Alleen nabije partners in dezelfde unit opnemen
      const myPartners = (partnersOf[id] || []).filter(pid =>
        genOf[pid] === gen && pos[pid] &&
        Math.abs(pos[pid].x - pos[id].x) <= MAX_PARTNER_DIST
      );
      const unit = [id, ...myPartners].sort((a, b) => pos[a].x - pos[b].x);
      // Voeg ghost-nodes toe die adjacent zijn aan unit-members
      unit.slice().forEach(uid => {
        Object.entries(ghostMeta).forEach(([gid, meta]) => {
          if (meta.adjacentTo === uid && pos[gid] && !unit.includes(gid)) {
            unit.push(gid);
          }
        });
      });
      unit.sort((a, b) => pos[a].x - pos[b].x);
      unit.forEach(uid => inUnit.add(uid));
      units.push(unit);
    });
    units.sort((a, b) => pos[a[0]].x - pos[b[0]].x);
    for (let i = 1; i < units.length; i++) {
      const prevRight = pos[units[i - 1][units[i - 1].length - 1]].x;
      const currLeft  = pos[units[i][0]].x;
      const minX = prevRight + NODE_W + H_GAP;
      if (currLeft < minX) {
        const shift = minX - currLeft;
        const toShift = new Set();
        for (let j = i; j < units.length; j++) {
          units[j].forEach(uid => toShift.add(uid));
        }
        toShift.forEach(uid => { pos[uid].x += shift; });
      }
    }
  };

  // --- Place gen 0 (roots + their partners) ---
  {
    const TREE_EXTRA_GAP = 80; // ruimte tussen verschillende stambomen
    const gen0 = byGen[0] || [];
    const seen = new Set();
    const ordered = [];
    // roots first, then their in-law partners directly after
    // Bij meerdere partners: partner1 — persoon — partner2 (man tussen vrouwen)
    gen0.filter(id => (parentsOf[id] || []).length === 0).forEach(id => {
      if (seen.has(id)) return;
      const myPartners = (partnersOf[id] || []).filter(pid => gen0.includes(pid) && !seen.has(pid));
      if (myPartners.length >= 2) {
        // Meerdere partners: eerste partner links, persoon midden, rest rechts
        seen.add(myPartners[0]); ordered.push(myPartners[0]);
        seen.add(id); ordered.push(id);
        for (let i = 1; i < myPartners.length; i++) {
          seen.add(myPartners[i]); ordered.push(myPartners[i]);
        }
      } else {
        seen.add(id); ordered.push(id);
        myPartners.forEach(pid => { seen.add(pid); ordered.push(pid); });
      }
    });
    gen0.forEach(id => {
      if (seen.has(id)) return;
      seen.add(id); ordered.push(id);
    });

    // Build a map from person id → tree head id (for detecting tree boundaries)
    // Gebruik alleen root-stambomen (zelfde filter als canvas)
    const personToTreeHead = {};
    if (!activeTreeId) {
      const allSt2 = computeStambomen();
      const rootSt2 = allSt2.filter(s => {
        if (getParentsOf(s.headId).length > 0) return false;
        if (getPartnersOf(s.headId).some(pid => getParentsOf(pid).length > 0)) return false;
        if (getChildrenOf(s.headId).some(cid =>
          getParentsOf(cid).some(pid => pid !== s.headId && getParentsOf(pid).length > 0)
        )) return false;
        return true;
      });
      rootSt2.forEach(s => {
        // Alleen bomen waarvan het hoofd in deze layout zit — voorkomt dat personen
        // van een andere familie hier een verkeerde treeHead-toewijzing krijgen
        if (!activeIds.has(s.headId)) return;
        getStamboomPersons(s.headId).forEach(pid => {
          if (!personToTreeHead[pid]) personToTreeHead[pid] = s.headId;
        });
      });
    }

    let curX = PADDING;
    let prevTreeHead = null;
    ordered.forEach(id => {
      const treeHead = personToTreeHead[id] || null;
      if (prevTreeHead !== null && treeHead !== null && treeHead !== prevTreeHead) {
        curX += TREE_EXTRA_GAP;
      }
      pos[id] = { x: curX, y: PADDING };
      curX += NODE_W + H_GAP;
      if (treeHead !== null) prevTreeHead = treeHead;
    });
  }

  // --- Cross-family ghost tracking ---
  // Personen die in twee ouder-groepen voorkomen (als kind EN als schoon-kind)
  // krijgen een ghost-slot in de groep van hun partner.
  const CROSS_GHOST_PREFIX = '__cg__';
  const ghostMeta = {}; // ghostId → { personId, adjacentTo }
  // Track welke ouder de "anchor" is voor cross-family kinderen
  // crossFamilyChildAnchor[childId] = anchorParentId
  // De anchor-ouder mag boven de originele kinderen centeren, de andere ouder niet
  const crossFamilyChildAnchor = {};
  const cousinChildReferences = {}; // nonAnchorParentId → { anchorParentId, childIds }
  const cousinPairSet = new Set(); // "idA,idB" keys van neef-nicht paren (persistent over generaties)

  // --- Top-down: for each subsequent generation, place children under parents ---
  gens.filter(g => g > 0).forEach(gen => {
    const yPos = PADDING + gen * (NODE_H + effectiveVGap);
    const genIds = byGen[gen] || [];

    // Scheiding: kinderen met ouders in layout vs aangetrouwd (geen ouders)
    const withParents = genIds.filter(id => (parentsOf[id] || []).filter(pid => pos[pid]).length > 0);
    const inlaws     = genIds.filter(id => (parentsOf[id] || []).filter(pid => pos[pid]).length === 0);

    // Detecteer cross-family partner paren (beide hebben ouders in layout)
    // MAAR: als beide partners een gemeenschappelijke voorouder delen (neef-nicht huwelijk),
    // markeer als cousin-pair → geen ghost-duplicaten, wel stippellijn-verbinding.
    const crossFamilyPartnerMap = new Map();

    // Helper: verzamel alle voorouders van een persoon in de layout
    const getAncestors = (personId) => {
      const ancestors = new Set();
      const queue = [personId];
      while (queue.length > 0) {
        const current = queue.shift();
        (parentsOf[current] || []).forEach(pid => {
          if (pos[pid] || byGen[0]?.includes(pid) || Object.values(byGen).flat().includes(pid)) {
            if (!ancestors.has(pid)) {
              ancestors.add(pid);
              queue.push(pid);
            }
          }
        });
      }
      return ancestors;
    };

    // NEEF-NICHT DETECTIE — voor Fazelahmad, Hagig Gull EN Mahmadgul bomen.
    // In Fazelahmad: Emamuddin-Nilab, Rahimgul-Alia, Hemat-Husna paren.
    // In Hagig Gull: Hemat-Husna paar (beiden kleinkinderen via Khanaga/Shughla).
    // In Mahmadgul: Bader-Golgotai paar (beide kleinkinderen via Hagig Gull/Huzurgol).
    if (headId === 'pmni0mtna5vxw' || headId === 'pmndo2vxafahz' || headId === 'pmndyxhre0zi1' || headId === 'pmndyrysy3eq7') {
      withParents.forEach(id => {
        (partnersOf[id] || []).forEach(pid => {
          if (withParents.includes(pid)) {
            const ancestorsA = getAncestors(id);
            const ancestorsB = getAncestors(pid);
            let sharedAncestor = false;
            for (const anc of ancestorsA) {
              if (ancestorsB.has(anc)) { sharedAncestor = true; break; }
            }
            if (sharedAncestor) {
              cousinPairSet.add([id, pid].sort().join(','));
            }
            if (!crossFamilyPartnerMap.has(id)) crossFamilyPartnerMap.set(id, new Set());
            crossFamilyPartnerMap.get(id).add(pid);
          }
        });
      });
    }

    // --- NEEF-NICHT PARTNER HERPOSITIONERING ---
    // Bij neef-nicht huwelijken: verplaats partner met minder broers/zussen
    // naar de inlaw-lijst zodat ze naast hun echtgenoot worden geplaatst.
    // Sla originele bio-ouders op (in functie-scope reclassifiedBioParents)
    // zodat post-pipeline ghosts gemaakt kunnen worden.
    if (headId === 'pmni0mtna5vxw') {
      const cfProcessed = new Set();
      crossFamilyPartnerMap.forEach((partners, personId) => {
        partners.forEach(partnerId => {
          const pairKey = [personId, partnerId].sort().join(',');
          if (cfProcessed.has(pairKey)) return;
          if (!cousinPairSet.has(pairKey)) return;
          cfProcessed.add(pairKey);
          const parentsA = (parentsOf[personId] || []).filter(pid => pos[pid]).sort().join(',');
          const parentsB = (parentsOf[partnerId] || []).filter(pid => pos[pid]).sort().join(',');
          if (parentsA === parentsB) return;
          const siblingsA = withParents.filter(id => id !== personId &&
            (parentsOf[id] || []).filter(p => pos[p]).sort().join(',') === parentsA).length;
          const siblingsB = withParents.filter(id => id !== partnerId &&
            (parentsOf[id] || []).filter(p => pos[p]).sort().join(',') === parentsB).length;
          let mover;
          if (siblingsA < siblingsB) mover = personId;
          else if (siblingsB < siblingsA) mover = partnerId;
          else mover = personId < partnerId ? personId : partnerId;
          const idx = withParents.indexOf(mover);
          if (idx >= 0) {
            const moverPartner = mover === personId ? partnerId : personId;
            // Sla bio-ouders op VOOR het clearen
            reclassifiedBioParents[mover] = {
              bioParents: [...(parentsOf[mover] || [])],
              partnerId: moverPartner
            };
            withParents.splice(idx, 1);
            inlaws.push(mover);
            // Verwijder mover uit bio-ouders' childrenOf en parentsOf
            (parentsOf[mover] || []).forEach(pid => {
              if (childrenOf[pid]) {
                childrenOf[pid] = childrenOf[pid].filter(cid => cid !== mover);
              }
            });
            parentsOf[mover] = [];
          }
        });
      });
    }

    // Groepeer kinderen per ouder-set (broers/zussen in dezelfde groep)
    // Sociale kinderen worden samengevoegd met bio-kinderen van hun
    // sociale ouder, zodat socialBirthOrder en birthOrder samen de volgorde bepalen.
    const groups = {};

    // Bouw een map van sociale ouder → kind (voor het samenvoegen)
    const socialParentOfChild = {}; // childId → [socialParentIds]
    state.relationships.forEach(r => {
      if (r.type !== 'social-parent') return;
      if (!socialParentOfChild[r.childId]) socialParentOfChild[r.childId] = [];
      socialParentOfChild[r.childId].push(r.parentId);
    });

    // Sayedahmed boom: geen social-parent merging voor "echte" sociale ouders
    // (bv. Hekmat onder Mahmad). MAAR wel mergen voor stiefouders — sociale
    // ouders die partner zijn van een bio-ouder van dit kind. Voorbeeld: Mina
    // is bio-dochter van Mastora, sociale dochter van Mahmad. Mahmad is
    // Mastora's man → stiefvader → Mina hoort bij siblings (Matiullah, Nasrat)
    // die ook Mastora als bio-moeder hebben.
    const skipFullSocialMerge = (headId === 'pmndyrysy3eq7');
    withParents.forEach(id => {
      let ps = (parentsOf[id] || []).filter(pid => pos[pid]).sort();

      if (socialChildIds.has(id) && socialParentOfChild[id]) {
        const allParents = new Set(ps);
        socialParentOfChild[id].forEach(spId => {
          if (skipFullSocialMerge) {
            // Sayedahmed: alleen mergen als spId partner is van een bio-ouder
            const isStepParent = ps.some(bp => (partnersOf[bp] || []).includes(spId));
            if (!isStepParent) return;
          }
          // Behoud OUD gedrag (v505 en eerder): voeg spId toe als pos bestaat,
          // maar partner WORDT TOEGEVOEGD ZELFS als spId zelf geen pos heeft
          if (pos[spId]) allParents.add(spId);
          (partnersOf[spId] || []).forEach(partnerId => {
            if (pos[partnerId] && genOf[partnerId] === genOf[spId]) allParents.add(partnerId);
          });
        });
        ps = [...allParents].sort();
      }

      const key = ps.join(',');
      if (!groups[key]) groups[key] = { parentIds: ps, children: [] };
      groups[key].children.push(id);
    });

    // Sorteer kinderen binnen elke groep: geboorte-volgorde → geboortedatum → onbekend
    // socialBirthOrder heeft voorrang in sociale-kind groepen,
    // birthOrder heeft voorrang in biologische groepen
    Object.values(groups).forEach((group, _, __, groupKey) => {
      group.children.sort((a, b) => {
        const personA = getPerson(a);
        const personB = getPerson(b);
        // Kies de juiste volgorde: socialBirthOrder voor sociale kinderen,
        // anders birthOrder
        const isSocialA = socialChildIds.has(a);
        const isSocialB = socialChildIds.has(b);
        const boA = (isSocialA && personA?.socialBirthOrder != null)
          ? personA.socialBirthOrder : personA?.birthOrder;
        const boB = (isSocialB && personB?.socialBirthOrder != null)
          ? personB.socialBirthOrder : personB?.birthOrder;
        // Volgorde heeft altijd voorrang (ook boven geboortedatum)
        if (boA != null && boB != null) return boA - boB;
        if (boA != null) return -1;
        if (boB != null) return 1;
        // Fallback naar geboortedatum
        const pa = parseBirthdate(personA?.birthdate);
        const pb = parseBirthdate(personB?.birthdate);
        if (!pa && !pb) return 0;
        if (!pa) return 1;
        if (!pb) return -1;
        if (pa.year !== pb.year) return pa.year - pb.year;
        if (pa.month && pb.month && pa.month !== pb.month) return pa.month - pb.month;
        if (pa.day && pb.day) return pa.day - pb.day;
        return 0;
      });
    });

    // Sorteer groepen op het x-midden van hun ouders.
    const sortedGroups = Object.entries(groups).sort(([keyA, a], [keyB, b]) => {
      const cx = g => {
        const xs = g.parentIds.map(pid => pos[pid].x + NODE_W / 2);
        return (Math.min(...xs) + Math.max(...xs)) / 2;
      };
      const cxDiff = cx(a) - cx(b);
      if (Math.abs(cxDiff) > 1) return cxDiff;
      const aSocial = 0;
      const bSocial = 0;
      return aSocial - bSocial;
    }).map(([, g]) => g);

    // Plaatsing: elk kind gecentreerd onder ouders, partner direct ernaast
    const placedInlaws = new Set();
    let cursorX = PADDING;
    // Verzamel cross-family child ghost plaatsingen (worden na de sortedGroups loop verwerkt)
    const crossFamilyChildGhosts = [];
    sortedGroups.forEach(group => {
      // --- Cross-family koppel detectie ---
      // Als beide ouders ver uit elkaar staan en een ghost naast de ander heeft,
      // gebruik het dichtstbijzijnde paar (origineel + ghost) als parentCenter.
      let parentCenter;
      let crossFamilyGhostParentCenter = null; // center van het ANDERE paar voor ghost-kinderen
      const parentXs = group.parentIds.map(pid => pos[pid].x + NODE_W / 2);
      const parentDist = Math.abs(Math.max(...parentXs) - Math.min(...parentXs));

      if (group.parentIds.length === 2 && parentDist > 3 * (NODE_W + H_GAP)) {
        // Cross-family koppel: zoek ghost van ouder B naast ouder A
        const [pA, pB] = group.parentIds;
        const ghostBnearA = CROSS_GHOST_PREFIX + pB + '_' + pA;
        const ghostAnearB = CROSS_GHOST_PREFIX + pA + '_' + pB;

        if (pos[ghostBnearA]) {
          // Paar A: origineel pA + ghost pB → dichtbij, gebruik als parentCenter
          const pairACenterXs = [pos[pA].x + NODE_W / 2, pos[ghostBnearA].x + NODE_W / 2];
          parentCenter = (Math.min(...pairACenterXs) + Math.max(...pairACenterXs)) / 2;
          // Registreer pA als anchor: alleen pA mag boven originele kinderen centeren
          group.children.forEach(cid => { crossFamilyChildAnchor[cid] = pA; });
          // Paar B: origineel pB + ghost pA → voor ghost-kinderen
          if (pos[ghostAnearB]) {
            const pairBCenterXs = [pos[pB].x + NODE_W / 2, pos[ghostAnearB].x + NODE_W / 2];
            crossFamilyGhostParentCenter = (Math.min(...pairBCenterXs) + Math.max(...pairBCenterXs)) / 2;
          }
        } else if (pos[ghostAnearB]) {
          // Paar B: origineel pB + ghost pA → dichtbij, gebruik als parentCenter
          const pairBCenterXs = [pos[pB].x + NODE_W / 2, pos[ghostAnearB].x + NODE_W / 2];
          parentCenter = (Math.min(...pairBCenterXs) + Math.max(...pairBCenterXs)) / 2;
          // Registreer pB als anchor
          group.children.forEach(cid => { crossFamilyChildAnchor[cid] = pB; });
          // Paar A voor ghost-kinderen (geen ghost beschikbaar, skip)
        } else {
          // Geen ghosts gevonden, val terug op standaard
          parentCenter = (Math.min(...parentXs) + Math.max(...parentXs)) / 2;
        }
      } else {
        parentCenter = (Math.min(...parentXs) + Math.max(...parentXs)) / 2;
      }

      // Bouw volgorde: elk kind gevolgd door aangetrouwde partner(s) en cross-family ghosts
      // Bij meerdere partners: partner1 — kind — partner2 (persoon tussen partners)
      const expanded = [];
      group.children.forEach(cid => {
        const inlawPartners = (partnersOf[cid] || []).filter(pid =>
          inlaws.includes(pid) && !placedInlaws.has(pid)
        );
        if (inlawPartners.length >= 2) {
          // Meerdere partners: eerste links, kind midden, rest rechts
          placedInlaws.add(inlawPartners[0]);
          expanded.push(inlawPartners[0]);
          expanded.push(cid);
          for (let i = 1; i < inlawPartners.length; i++) {
            placedInlaws.add(inlawPartners[i]);
            expanded.push(inlawPartners[i]);
          }
        } else {
          expanded.push(cid);
          inlawPartners.forEach(pid => {
            expanded.push(pid);
            placedInlaws.add(pid);
          });
        }
        // Voeg cross-family ghost partners toe
        (partnersOf[cid] || []).forEach(pid => {
          if (inlaws.includes(pid) && placedInlaws.has(pid)) return; // al geplaatst
          if (inlaws.includes(pid) && !placedInlaws.has(pid)) return; // al afgehandeld hierboven
          // Cross-family partner: heeft eigen ouders in layout. Check zowel
          // same-gen partners (crossFamilyPartnerMap) als cross-gen partners
          // (partner heeft parents in pos, ongeacht gen). Cross-gen voorbeeld:
          // Alina gen 2 + Noman gen 3 in Hagig boom — beide kleinkinderen.
          const isSameGenCross = crossFamilyPartnerMap.has(cid) && crossFamilyPartnerMap.get(cid).has(pid);
          const isCrossGenCousin = !isSameGenCross && (parentsOf[pid] || []).some(ppid => pos[ppid]);
          if (isSameGenCross || isCrossGenCousin) {
            // Voeg ghost-slot toe zodat er ruimte is naast het kind
            const ghostId = CROSS_GHOST_PREFIX + pid + '_' + cid;
            expanded.push(ghostId);
            if (!byGen[gen]) byGen[gen] = [];
            if (!byGen[gen].includes(ghostId)) byGen[gen].push(ghostId);
            genOf[ghostId] = gen;
            ghostMeta[ghostId] = { personId: pid, adjacentTo: cid };
          }
        });
      });

      // Standaard horizontale plaatsing (verticaal stapelen-functie verwijderd v484)
      {
        const totalW = expanded.length * NODE_W + (expanded.length - 1) * H_GAP;
        let startX = parentCenter - totalW / 2;
        if (startX < cursorX) startX = cursorX;

        expanded.forEach((id, i) => {
          pos[id] = { x: startX + i * (NODE_W + H_GAP), y: yPos };
        });
        cursorX = startX + totalW + H_GAP;
      }

      // --- Cross-family ghost-kinderen aanmaken ---
      // Als dit een cross-family koppel is, maak ghost-kinderen aan onder het andere paar
      // Cross-family ghost-kinderen aanmaken onder het andere ouder-paar
      if (crossFamilyGhostParentCenter !== null) {
        const anchorForGroup = crossFamilyChildAnchor[group.children[0]];
        const nonAnchorParent = group.parentIds.find(pid => pid !== anchorForGroup);

        if (nonAnchorParent) {
          crossFamilyChildGhosts.push({
            children: group.children,
            center: crossFamilyGhostParentCenter,
            gen: gen,
            parentIds: group.parentIds,
            nonAnchorParent: nonAnchorParent
          });
        }
      }
    });

    // Plaats cross-family ghost-kinderen (na alle originele kinderen geplaatst zijn)
    crossFamilyChildGhosts.forEach(({ children, center, gen: childGen, parentIds, nonAnchorParent }) => {
      const ghostExpanded = [];
      children.forEach(cid => {
        const ghostChildId = CROSS_GHOST_PREFIX + cid + '_cf_' + parentIds.join('_');
        ghostExpanded.push(ghostChildId);
        if (!byGen[childGen]) byGen[childGen] = [];
        if (!byGen[childGen].includes(ghostChildId)) byGen[childGen].push(ghostChildId);
        genOf[ghostChildId] = childGen;
        ghostMeta[ghostChildId] = { personId: cid, adjacentTo: nonAnchorParent };
      });

      const totalW = ghostExpanded.length * NODE_W + (ghostExpanded.length - 1) * H_GAP;
      let startX = center - totalW / 2;

      ghostExpanded.forEach((id, i) => {
        pos[id] = { x: startX + i * (NODE_W + H_GAP), y: yPos };
      });
      cursorX = startX + totalW + H_GAP;
    });

    // Resterende in-laws (niet inline geplaatst): direct naast hun partner
    inlaws.forEach(id => {
      if (placedInlaws.has(id)) return;
      const partner = (partnersOf[id] || []).find(pid => pos[pid] && genOf[pid] === gen);
      if (partner) {
        pos[id] = { x: pos[partner].x + NODE_W + H_GAP, y: yPos };
      } else {
        const maxX = Math.max(PADDING, ...genIds.filter(gid => pos[gid]).map(gid => pos[gid].x));
        pos[id] = { x: maxX + NODE_W + H_GAP, y: yPos };
      }
    });

    fixOverlaps(gen);

  });

  // ── GLOBAL CROSS-GEN COUSIN-PAIR DETECTIE ──
  // De per-gen detectie hierboven mist cousin-pairs waar partners in
  // verschillende generaties zitten (bijv. Alina gen 2 + Noman gen 3 in Hagig
  // tree). Deze pas detecteert ze wel en voegt ze toe aan cousinPairSet.
  if (headId === 'pmni0mtna5vxw' || headId === 'pmndo2vxafahz' || headId === 'pmndyxhre0zi1' || headId === 'pmndyrysy3eq7') {
    const inPos = id => !!pos[id];
    const getAllAncestors = (personId) => {
      const ancestors = new Set();
      const queue = [personId];
      while (queue.length > 0) {
        const cur = queue.shift();
        (parentsOf[cur] || []).forEach(pid => {
          if (inPos(pid) && !ancestors.has(pid)) {
            ancestors.add(pid);
            queue.push(pid);
          }
        });
      }
      return ancestors;
    };
    state.relationships.forEach(rel => {
      if (rel.type !== 'partner') return;
      const a = rel.person1Id, b = rel.person2Id;
      if (!inPos(a) || !inPos(b)) return;
      // Beide moeten ouders in pos hebben (geen pure inlaws)
      if ((parentsOf[a] || []).filter(inPos).length === 0) return;
      if ((parentsOf[b] || []).filter(inPos).length === 0) return;
      const key = [a, b].sort().join(',');
      if (cousinPairSet.has(key)) return; // al gedetecteerd
      const ancA = getAllAncestors(a);
      const ancB = getAllAncestors(b);
      for (const anc of ancA) {
        if (ancB.has(anc)) {
          cousinPairSet.add(key);
          break;
        }
      }
    });
  }

  // --- Bewaar volledige childrenOf VOOR cross-family removal ---
  // Nodig zodat shiftWithDescendants OOK cross-family kinderen kan cascaden
  const fullChildrenOf = {};
  Object.entries(childrenOf).forEach(([pid, children]) => {
    fullChildrenOf[pid] = [...children];
  });

  // Cross-family childrenOf fix VERWIJDERD — veroorzaakte NaN x-values
  // doordat ouders met 0 kinderen Math.min/max op lege arrays triggerden.
  // In plaats daarvan wordt crossFamilyChildAnchor direct gecheckt in de pipeline.

  // --- Familie-bewuste scanline shift helper ---
  // Verschuift nodes rechts van scanX, maar beschermt ouder-kind verbindingen.
  // Retourneert true als ALLE nodes verschoven zijn (gap volledig gesloten).
  function familyAwareScanShift(scanX, shift) {
    let allShifted = true;
    for (const id of Object.keys(pos)) {
      if (!pos[id] || pos[id].x < scanX) continue;
      // Check: heeft deze node een ouder links van scanX?
      // Alleen blokkeren als de shift het kind VOORBIJ (links van) de ouder zou plaatsen.
      // Als het kind na de shift nog steeds rechts van de ouder staat, is de shift veilig
      // (het brengt het kind dichter bij de ouder).
      let blocked = false;
      const parents = parentsOf[id];
      if (parents) {
        for (let i = 0; i < parents.length; i++) {
          const pid = parents[i];
          if (pos[pid] && pos[pid].x < scanX) {
            // Ouder is links van scanX. Zou shift het kind voorbij de ouder plaatsen?
            if (pos[id].x - shift < pos[pid].x) {
              blocked = true;
              break;
            }
          }
        }
      }
      if (!blocked) {
        pos[id].x -= shift;
      } else {
        allShifted = false;
      }
    }
    return allShifted;
  }

  // --- Compactie (vóór bottom-up): sluit gaten op elke generatie ---
  // Door eerst te compacteren, worden kinderen dichter bij elkaar geplaatst.
  // De bottom-up centering die hierna volgt plaatst ouders dan ook dichter bij elkaar.
  // Gebruik de verticale-snijlijn methode: schuif alleen als er op ALLE generaties
  // voldoende ruimte is, zodat er geen overlaps ontstaan.
  for (let cPass = 0; cPass < 7; cPass++) {
    const allIds = Object.keys(pos);
    const maxX = Math.max(...allIds.map(id => pos[id].x + NODE_W));
    const scanStep = 15;

    for (let scanX = PADDING + scanStep; scanX < maxX; scanX += scanStep) {
      let minGap = Infinity;
      let hasLeft = false, hasRight = false;

      gens.forEach(gen => {
        const members = (byGen[gen] || []).filter(id => pos[id]);
        if (!members.length) return;
        let maxRight = -Infinity;
        let minLeft = Infinity;

        members.forEach(id => {
          const left = pos[id].x;
          const right = left + NODE_W;
          if (right <= scanX) {
            maxRight = Math.max(maxRight, right);
            hasLeft = true;
          } else if (left >= scanX) {
            minLeft = Math.min(minLeft, left);
            hasRight = true;
          } else {
            // Node kruist de scanlijn → geen gap hier
            minGap = 0;
          }
        });

        if (maxRight > -Infinity && minLeft < Infinity) {
          const genGap = minLeft - maxRight;
          if (genGap < minGap) minGap = genGap;
        }
      });

      if (!hasLeft || !hasRight || minGap <= H_GAP) continue;

      const shift = minGap - H_GAP;
      if (shift < 2) continue;

      const allMoved = familyAwareScanShift(scanX, shift);
      if (allMoved) scanX -= shift;
    }
  }
  // --- Bouw ghost-adjacentie map voor cascade ---
  // Zodat ghosts meeschuiven als hun partner verschuift
  // NOTE: nodig vóór bottom-up cascade EN vóór gezin-snapshot bouw
  const ghostsAdjacentTo = {}; // personId → [ghostIds]
  Object.entries(ghostMeta).forEach(([ghostId, meta]) => {
    if (!ghostsAdjacentTo[meta.adjacentTo]) ghostsAdjacentTo[meta.adjacentTo] = [];
    ghostsAdjacentTo[meta.adjacentTo].push(ghostId);
  });

  // --- Bottom-up: shift parent couples to center over their children ---
  // Na elke fixOverlaps worden de verschuivingen doorgegeven aan alle nakomelingen,
  // zodat gen3/gen4 niet wegdrijft van hun ouders.

  // Helper: verschuif een persoon en AL zijn nakomelingen met dezelfde offset
  let shiftedInlaws = new Set();
  const shiftWithDescendants = (id, dx, _visited) => {
    const visited = _visited || new Set();
    if (!pos[id] || Math.abs(dx) < 0.5 || visited.has(id)) return;
    visited.add(id);
    pos[id].x += dx;
    // Verschuif ook aangrenzende ghosts (cross-family partner duplicaten)
    (ghostsAdjacentTo[id] || []).forEach(gid => {
      if (pos[gid]) pos[gid].x += dx;
    });
    // Verschuif ook inlaw-partners (zonder ouders in layout) zodat ze niet
    // achterblijven wanneer hun partner met de cascade meeschuift
    (partnersOf[id] || []).forEach(pid => {
      if (pos[pid] && !shiftedInlaws.has(pid) &&
          !(parentsOf[pid] || []).some(ppid => pos[ppid])) {
        shiftedInlaws.add(pid);
        pos[pid].x += dx;
      }
    });
    (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid => {
      // Skip cross-family kinderen als wij NIET de anchor-ouder zijn
      // Voorkomt dubbele cascade (eenmaal via anchor, eenmaal via non-anchor)
      if (crossFamilyChildAnchor[cid] && crossFamilyChildAnchor[cid] !== id) return;
      if (pos[cid]) shiftWithDescendants(cid, dx, visited);
    });
  };

  [...gens].reverse().forEach(gen => {
    shiftedInlaws = new Set();
    const processed = new Set();
    (byGen[gen] || []).forEach(id => {
      if (processed.has(id) || !pos[id]) return;
      const myPartners = (partnersOf[id] || []).filter(pid => {
        if (genOf[pid] !== gen || !pos[pid]) return false;
        // Skip cross-family partner originelen die ver weg staan:
        // als er een ghost van deze partner naast ons staat, is de originele positie irrelevant
        const dist = Math.abs(pos[pid].x - pos[id].x);
        if (dist > 3 * (NODE_W + H_GAP)) {
          const ghostId = CROSS_GHOST_PREFIX + pid + '_' + id;
          if (pos[ghostId]) return false; // ghost staat al naast ons
        }
        return true;
      });
      const unit = [id, ...myPartners];
      unit.forEach(pid => processed.add(pid));

      const allChildren = new Set();
      unit.forEach(pid => (childrenOf[pid] || []).filter(cid => pos[cid]).forEach(cid => {
        // Skip kinderen die via cross-family aan een ANDERE anchor-ouder zijn toegewezen
        // (die ouder centreert boven de originelen; deze ouder heeft ghost-kinderen)
        if (crossFamilyChildAnchor[cid] && !unit.includes(crossFamilyChildAnchor[cid])) return;
        allChildren.add(cid);
      }));
      if (!allChildren.size) return;

      const childXs = [...allChildren].map(cid => pos[cid].x + NODE_W / 2);
      const childCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2;
      const unitXs = unit.map(pid => pos[pid].x);
      const unitCenter = (Math.min(...unitXs) + Math.max(...unitXs) + NODE_W) / 2;
      const shift = childCenter - unitCenter;
      if (Math.abs(shift) > 1) {
        unit.forEach(pid => {
          pos[pid].x += shift;
          // Verschuif ook aangrenzende ghosts (cross-family partner/kind duplicaten)
          (ghostsAdjacentTo[pid] || []).forEach(gid => {
            if (pos[gid]) pos[gid].x += shift;
          });
        });
      }
    });

    shiftedInlaws = new Set();
    // --- birthOrder handhaving: na centering, vóór fixOverlaps ---
    // Als centering siblings in verkeerde volgorde heeft gezet, swap hun unit-posities.
    // De cascade na fixOverlaps verschuift dan automatisch hun kinderen mee.
    {
      const sibGroups = {};
      (byGen[gen] || []).forEach(id => {
        if (!pos[id] || !getPerson(id)) return;
        const ps = (parentsOf[id] || []).filter(pid => pos[pid]).sort();
        if (!ps.length) return;
        const key = ps.join(',');
        if (!sibGroups[key]) sibGroups[key] = [];
        if (!sibGroups[key].includes(id)) sibGroups[key].push(id);
      });

      Object.values(sibGroups).forEach(siblings => {
        if (siblings.length < 2) return;
        // Ook sorteren op geboortedatum als niemand birthOrder heeft
        const hasBirthOrder = siblings.some(id => {
          const p = getPerson(id);
          return p?.birthOrder != null ||
            (socialChildIds.has(id) && p?.socialBirthOrder != null);
        });
        const hasBirthdate = siblings.some(id => {
          const bd = parseBirthdate(getPerson(id)?.birthdate);
          return bd && bd.year;
        });
        if (!hasBirthOrder && !hasBirthdate) return;

        const currentOrder = [...siblings].sort((a, b) => pos[a].x - pos[b].x);
        const desiredOrder = [...siblings].sort((a, b) => {
          const personA = getPerson(a), personB = getPerson(b);
          const isSocA = socialChildIds.has(a);
          const isSocB = socialChildIds.has(b);
          const boA = (isSocA && personA?.socialBirthOrder != null)
            ? personA.socialBirthOrder : personA?.birthOrder;
          const boB = (isSocB && personB?.socialBirthOrder != null)
            ? personB.socialBirthOrder : personB?.birthOrder;
          if (boA != null && boB != null) return boA - boB;
          if (boA != null) return -1;
          if (boB != null) return 1;
          const pa = parseBirthdate(personA?.birthdate);
          const pb = parseBirthdate(personB?.birthdate);
          if (!pa && !pb) return 0;
          if (!pa) return 1;
          if (!pb) return -1;
          if (pa.year !== pb.year) return pa.year - pb.year;
          if (pa.month && pb.month && pa.month !== pb.month) return pa.month - pb.month;
          if (pa.day && pb.day) return pa.day - pb.day;
          return 0;
        });
        if (desiredOrder.every((id, i) => id === currentOrder[i])) return;

        // Verzamel units (sibling + partners op dezelfde generatie)
        // Filter cross-family partners eruit (net als centering) en neem ghosts mee
        const units = {};
        siblings.forEach(id => {
          const partners = (partnersOf[id] || []).filter(pid => {
            if (genOf[pid] !== gen || !pos[pid]) return false;
            // Skip cross-family partner originelen die ver weg staan
            const dist = Math.abs(pos[pid].x - pos[id].x);
            if (dist > 3 * (NODE_W + H_GAP)) {
              const ghostId = CROSS_GHOST_PREFIX + pid + '_' + id;
              if (pos[ghostId]) return false;
            }
            return true;
          });
          // Voeg ghost-partners toe in plaats van ver-weg originelen
          const ghostPartners = [];
          (ghostsAdjacentTo[id] || []).forEach(gid => {
            if (pos[gid] && !partners.includes(gid)) ghostPartners.push(gid);
          });
          units[id] = [id, ...partners, ...ghostPartners];
        });
        // Huidige slot-posities: linkerkant van elke unit in huidige volgorde
        const slotXs = currentOrder.map(id => Math.min(...units[id].map(uid => pos[uid].x)));
        // Wijs gewenste volgorde toe aan de bestaande slots
        // Track verschuivingen om nakomelingen mee te cascaden
        const birthOrderShifts = {};
        desiredOrder.forEach((id, i) => {
          const unit = units[id];
          const currentMinX = Math.min(...unit.map(uid => pos[uid].x));
          const dx = slotXs[i] - currentMinX;
          if (Math.abs(dx) > 0.5) {
            unit.forEach(uid => { pos[uid].x += dx; });
            birthOrderShifts[id] = dx;
          }
        });
        // Cascade: verschuif nakomelingen mee na birthOrder swap
        Object.entries(birthOrderShifts).forEach(([id, dx]) => {
          (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid => {
            if (crossFamilyChildAnchor[cid] && crossFamilyChildAnchor[cid] !== id) return;
            if (pos[cid]) shiftWithDescendants(cid, dx);
          });
        });
      });
    }

    // Track posities vóór fixOverlaps, zodat we verschuivingen kunnen doorgeven
    const beforeX = {};
    (byGen[gen] || []).forEach(id => { if (pos[id]) beforeX[id] = pos[id].x; });

    fixOverlaps(gen);

    // Cascade: als fixOverlaps een ouder naar rechts duwde, schuif ook alle nakomelingen mee.
    // Gebruik een Set om dubbele cascades te voorkomen (als beide ouders in dezelfde unit zitten
    // en dezelfde shift kregen, mag het kind maar één keer verschoven worden).
    const cascaded = new Set();
    (byGen[gen] || []).forEach(id => {
      if (!pos[id] || beforeX[id] === undefined) return;
      const dx = pos[id].x - beforeX[id];
      if (Math.abs(dx) > 0.5) {
        (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid => {
          if (crossFamilyChildAnchor[cid] && crossFamilyChildAnchor[cid] !== id) return;
          if (pos[cid] && !cascaded.has(cid)) {
            cascaded.add(cid);
            shiftWithDescendants(cid, dx);
          }
        });
      }
    });
  });

  // === GEZIN-SNAPSHOT SYSTEEM ===
  // Na de bottom-up cascade zijn ouders gecentreerd boven hun kinderen.
  // Sla de relatieve posities van kinderen t.o.v. hun ouder-centrum op als snapshot.
  // Na ELKE stap die posities wijzigt, worden deze snapshots afgedwongen zodat
  // gezinnen er ALTIJD identiek uitzien, ongeacht de context (eigen boom vs grotere boom).
  const gezinSnapshots = [];
  {
    const processedPairs = new Set();
    Object.keys(childrenOf).forEach(parentId => {
      if (!pos[parentId]) return;
      const partners = (partnersOf[parentId] || []).filter(pid =>
        pos[pid] && genOf[pid] === genOf[parentId]
      );
      const parentUnit = [parentId, ...partners].sort();
      const gezinKey = parentUnit.join('+');
      if (processedPairs.has(gezinKey)) return;
      processedPairs.add(gezinKey);

      const children = new Set();
      parentUnit.forEach(pid => {
        (childrenOf[pid] || []).filter(cid => pos[cid]).forEach(cid => children.add(cid));
      });
      if (children.size === 0) return;

      const parentXs = parentUnit.filter(pid => pos[pid]).map(pid => pos[pid].x);
      const parentCenterX = (Math.min(...parentXs) + Math.max(...parentXs) + NODE_W) / 2;

      const members = {};
      [...children].forEach(cid => {
        if (!pos[cid]) return;
        members[cid] = { dx: pos[cid].x - parentCenterX };
        // Inlaw-partners (partners zonder ouders in layout)
        (partnersOf[cid] || []).filter(pid =>
          pos[pid] && !(parentsOf[pid] || []).some(ppid => pos[ppid])
        ).forEach(pid => {
          members[pid] = { dx: pos[pid].x - parentCenterX };
        });
        // Ghost-partners
        (ghostsAdjacentTo[cid] || []).forEach(gid => {
          if (pos[gid]) {
            members[gid] = { dx: pos[gid].x - parentCenterX };
          }
        });
      });

      gezinSnapshots.push({ parentIds: parentUnit, members });
    });

    // Sorteer top-down (op generatie van ouders) zodat enforcement correct cascadeert
    gezinSnapshots.sort((a, b) => {
      const genA = genOf[a.parentIds[0]] || 0;
      const genB = genOf[b.parentIds[0]] || 0;
      return genA - genB;
    });
  }

  // Herstel gezins-integriteit: kinderen terug naar correcte relatieve positie t.o.v. ouders.
  // Wordt aangeroepen na layout-stappen die posities wijzigen.
  // Skip inlaw-partners die ook kinderen zijn van een ander gezin (cross-family koppels) —
  // die worden door hun EIGEN ouder-snapshot gepositioneerd.
  function enforceGezinSnapshots() {
    gezinSnapshots.forEach(({ parentIds, members }) => {
      const parentXs = parentIds.filter(pid => pos[pid]).map(pid => pos[pid].x);
      if (!parentXs.length) return;
      const parentCenterX = (Math.min(...parentXs) + Math.max(...parentXs) + NODE_W) / 2;
      Object.entries(members).forEach(([mid, { dx }]) => {
        if (!pos[mid]) return;
        // Skip inlaw-partners die hun eigen ouders in de layout hebben
        // (cross-family koppels). Die worden door hun EIGEN ouder-snapshot gepositioneerd.
        const isChildOfThisFamily = parentIds.some(pid => (childrenOf[pid] || []).includes(mid));
        if (!isChildOfThisFamily) {
          const hasOwnParents = (parentsOf[mid] || []).some(ppid => pos[ppid]);
          if (hasOwnParents) return;
        }
        // Skip kinderen met crossFamilyChildAnchor die naar een ANDERE familie wijst
        if (crossFamilyChildAnchor[mid] && !parentIds.includes(crossFamilyChildAnchor[mid])) return;
        pos[mid].x = parentCenterX + dx;
      });
    });
  }

  // --- Finale fixOverlaps MET cascade ---
  gens.forEach(gen => {
    const beforeFixX = {};
    (byGen[gen] || []).forEach(id => { if (pos[id]) beforeFixX[id] = pos[id].x; });
    fixOverlaps(gen);
    const cascadedFix = new Set();
    (byGen[gen] || []).forEach(id => {
      if (!pos[id] || beforeFixX[id] === undefined) return;
      const dx = pos[id].x - beforeFixX[id];
      if (Math.abs(dx) > 0.5) {
        (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid => {
          if (crossFamilyChildAnchor[cid] && crossFamilyChildAnchor[cid] !== id) return;
          if (pos[cid] && !cascadedFix.has(cid)) {
            cascadedFix.add(cid);
            shiftWithDescendants(cid, dx);
          }
        });
      }
    });
  });

  // --- Compactie ---
  for (let pass = 0; pass < 7; pass++) {
    const allPositions = Object.entries(pos).map(([id, p]) => ({
      id, x: p.x, right: p.x + NODE_W, gen: genOf[id]
    }));
    allPositions.sort((a, b) => a.x - b.x);
    if (!allPositions.length) break;
    const maxX = Math.max(...allPositions.map(p => p.right));
    const step = 15;
    for (let scanX = PADDING + step; scanX < maxX; scanX += step) {
      let minGap = Infinity;
      let hasLeft = false, hasRight = false;
      gens.forEach(gen => {
        const members = (byGen[gen] || []).filter(id => pos[id]);
        if (!members.length) return;
        let maxRight = -Infinity, minLeft = Infinity;
        members.forEach(id => {
          if (pos[id].x + NODE_W <= scanX) { maxRight = Math.max(maxRight, pos[id].x + NODE_W); hasLeft = true; }
          else if (pos[id].x >= scanX) { minLeft = Math.min(minLeft, pos[id].x); hasRight = true; }
          else { minGap = 0; }
        });
        if (maxRight > -Infinity && minLeft < Infinity) {
          const genGap = minLeft - maxRight;
          if (genGap < minGap) minGap = genGap;
        }
      });
      if (!hasLeft || !hasRight || minGap <= 25) continue;
      const shift = minGap - 25;
      if (shift < 2) continue;
      const allMoved2 = familyAwareScanShift(scanX, shift);
      if (allMoved2) scanX -= shift;
    }
  }

  // --- Subtree-aware compactie ---
  // Per gen-0 familie: bereken subtree contour en sluit gaps tussen aangrenzende subtrees
  {
    // Bereken subtree membership: alle nakomelingen + inlaw-partners
    function getSubtreeMembers(rootIds) {
      const members = new Set();
      function walk(id) {
        if (!pos[id] || members.has(id)) return;
        members.add(id);
        // Inlaw-partners meenemen (geen ouders in layout)
        (partnersOf[id] || []).forEach(pid => {
          if (pos[pid] && !(parentsOf[pid] || []).some(ppid => pos[ppid]) && !members.has(pid)) {
            members.add(pid);
          }
        });
        // Ghost-nodes meenemen
        (ghostsAdjacentTo[id] || []).forEach(gid => {
          if (pos[gid] && !members.has(gid)) members.add(gid);
        });
        (childrenOf[id] || []).forEach(cid => walk(cid));
      }
      rootIds.forEach(rid => walk(rid));
      return members;
    }

    // Bereken contour per subtree: per generatie de min-X en max-X
    function getContour(members) {
      const contour = {}; // gen → { left, right }
      members.forEach(id => {
        if (!pos[id]) return;
        const gen = genOf[id];
        if (gen === undefined) return;
        if (!contour[gen]) contour[gen] = { left: Infinity, right: -Infinity };
        contour[gen].left = Math.min(contour[gen].left, pos[id].x);
        contour[gen].right = Math.max(contour[gen].right, pos[id].x + NODE_W);
      });
      return contour;
    }

    // Gen-0 subtrees: groepeer gen-0 personen per familie-unit
    const gen0 = (byGen[0] || []).filter(id => pos[id]);
    const gen0Sorted = [...gen0].sort((a, b) => pos[a].x - pos[b].x);

    // Groepeer gen-0 personen in partner-units
    const gen0Units = [];
    const gen0Processed = new Set();
    gen0Sorted.forEach(id => {
      if (gen0Processed.has(id)) return;
      const unit = [id];
      gen0Processed.add(id);
      (partnersOf[id] || []).forEach(pid => {
        if (gen0.includes(pid) && !gen0Processed.has(pid) && pos[pid] &&
            Math.abs(pos[pid].x - pos[id].x) < MAX_PARTNER_DIST) {
          unit.push(pid);
          gen0Processed.add(pid);
        }
      });
      gen0Units.push(unit);
    });

    // Sorteer units op gemiddelde X
    gen0Units.sort((a, b) => {
      const avgA = a.reduce((s, id) => s + pos[id].x, 0) / a.length;
      const avgB = b.reduce((s, id) => s + pos[id].x, 0) / b.length;
      return avgA - avgB;
    });

    // Compactie: voor elk paar aangrenzende subtrees, sluit gap
    // Veiligheidsaanpak: bewaar posities voor compactie, revert als overlaps ontstaan
    for (let pass = 0; pass < 3; pass++) {
      let anyShift = false;
      for (let i = 1; i < gen0Units.length; i++) {
        const leftMembers = getSubtreeMembers(gen0Units[i - 1]);
        const rightMembers = getSubtreeMembers(gen0Units[i]);

        // Skip als dezelfde persoon in beide subtrees zit (cross-family overlap)
        let hasOverlap = false;
        for (const id of rightMembers) {
          if (leftMembers.has(id)) { hasOverlap = true; break; }
        }
        if (hasOverlap) continue;

        const leftContour = getContour(leftMembers);
        const rightContour = getContour(rightMembers);

        // Bereken minimum gap over alle generaties waar BEIDE subtrees leden hebben
        let minGap = Infinity;
        let hasSharedGen = false;
        Object.keys(leftContour).forEach(gen => {
          if (!rightContour[gen]) return;
          hasSharedGen = true;
          const gap = rightContour[gen].left - leftContour[gen].right;
          if (gap < minGap) minGap = gap;
        });

        if (!hasSharedGen || minGap <= H_GAP || !isFinite(minGap)) continue;

        const shift = minGap - H_GAP;
        if (shift < 5) continue;

        // Bewaar posities voor verificatie
        const savedPos = {};
        rightMembers.forEach(id => { if (pos[id]) savedPos[id] = { x: pos[id].x }; });

        // Verschuif hele rechter subtree naar links
        rightMembers.forEach(id => { if (pos[id]) pos[id].x -= shift; });

        // Verificatie: check of shift overlaps veroorzaakt
        let causedOverlap = false;
        const allIds = [...leftMembers, ...rightMembers].filter(id => pos[id]);
        for (let a = 0; a < allIds.length && !causedOverlap; a++) {
          for (let b = a + 1; b < allIds.length && !causedOverlap; b++) {
            const pa = pos[allIds[a]], pb = pos[allIds[b]];
            if (pa.x < pb.x + NODE_W && pa.x + NODE_W > pb.x &&
                pa.y < pb.y + NODE_H && pa.y + NODE_H > pb.y) {
              causedOverlap = true;
            }
          }
        }

        if (causedOverlap) {
          // Revert
          Object.entries(savedPos).forEach(([id, s]) => { if (pos[id]) pos[id].x = s.x; });
        } else {
          anyShift = true;
        }
      }
      if (!anyShift) break;
    }

    // --- Gen-1 subtree compactie ---
    // Voor elke gen-0 unit: compact de gen-1 kinderen subtrees
    gen0Units.forEach(unit => {
      // Verzamel alle gen-1 kinderen van deze unit
      const gen1Children = new Set();
      unit.forEach(parentId => {
        (childrenOf[parentId] || []).forEach(cid => {
          if (pos[cid] && genOf[cid] === 1) gen1Children.add(cid);
        });
      });
      if (gen1Children.size < 2) return;

      // Groepeer gen-1 in partner-units
      const gen1Sorted = [...gen1Children].sort((a, b) => pos[a].x - pos[b].x);
      const gen1Units = [];
      const gen1Done = new Set();
      gen1Sorted.forEach(id => {
        if (gen1Done.has(id)) return;
        const u = [id];
        gen1Done.add(id);
        (partnersOf[id] || []).forEach(pid => {
          if (gen1Children.has(pid) && !gen1Done.has(pid) && pos[pid] &&
              Math.abs(pos[pid].x - pos[id].x) < MAX_PARTNER_DIST) {
            u.push(pid);
            gen1Done.add(pid);
          }
        });
        // Ook inlaw-partners (niet in gen1Children maar wel gen-1) meenemen
        (partnersOf[id] || []).forEach(pid => {
          if (!gen1Done.has(pid) && pos[pid] && genOf[pid] === 1 &&
              Math.abs(pos[pid].x - pos[id].x) < MAX_PARTNER_DIST) {
            u.push(pid);
            gen1Done.add(pid);
          }
        });
        gen1Units.push(u);
      });

      if (gen1Units.length < 2) return;

      // Sorteer op gemiddelde X
      gen1Units.sort((a, b) => {
        const avgA = a.reduce((s, id) => s + pos[id].x, 0) / a.length;
        const avgB = b.reduce((s, id) => s + pos[id].x, 0) / b.length;
        return avgA - avgB;
      });

      // Compactie met safety check
      for (let pass = 0; pass < 3; pass++) {
        let anyShift = false;
        for (let i = 1; i < gen1Units.length; i++) {
          const leftMembers = getSubtreeMembers(gen1Units[i - 1]);
          const rightMembers = getSubtreeMembers(gen1Units[i]);

          // Skip bij gedeelde leden
          let shared = false;
          for (const id of rightMembers) {
            if (leftMembers.has(id)) { shared = true; break; }
          }
          if (shared) continue;

          const leftContour = getContour(leftMembers);
          const rightContour = getContour(rightMembers);

          let minGap = Infinity;
          let hasSharedGen = false;
          Object.keys(leftContour).forEach(gen => {
            if (!rightContour[gen]) return;
            hasSharedGen = true;
            const gap = rightContour[gen].left - leftContour[gen].right;
            if (gap < minGap) minGap = gap;
          });

          if (!hasSharedGen || minGap <= H_GAP || !isFinite(minGap)) continue;

          const shift = minGap - H_GAP;
          if (shift < 5) continue;

          // Save positions
          const savedPos = {};
          rightMembers.forEach(id => { if (pos[id]) savedPos[id] = { x: pos[id].x }; });

          // Shift right subtree left
          rightMembers.forEach(id => { if (pos[id]) pos[id].x -= shift; });

          // Verify no overlaps between left and right subtrees
          let causedOverlap = false;
          const allIds = [...leftMembers, ...rightMembers].filter(id => pos[id]);
          for (let a = 0; a < allIds.length && !causedOverlap; a++) {
            for (let b = a + 1; b < allIds.length && !causedOverlap; b++) {
              const pa = pos[allIds[a]], pb = pos[allIds[b]];
              if (pa.x < pb.x + NODE_W && pa.x + NODE_W > pb.x &&
                  pa.y < pb.y + NODE_H && pa.y + NODE_H > pb.y) {
                causedOverlap = true;
              }
            }
          }

          if (causedOverlap) {
            Object.entries(savedPos).forEach(([id, s]) => { if (pos[id]) pos[id].x = s.x; });
          } else {
            anyShift = true;
          }
        }
        if (!anyShift) break;
      }
    });
  }

  // Na subtree compactie: overlaps oplossen
  resolveOverlaps(pos, verticalGroupMap);

  // Normalize
  const allX = Object.values(pos).map(p => p.x);
  const minX = Math.min(...allX);
  if (minX < PADDING) {
    const shift = PADDING - minX;
    Object.values(pos).forEach(p => { p.x += shift; });
  }



  // --- Cross-family kinderen herpositioneren ---
  const postLayoutAnchorGroups = [];
  {
    const processedAnchors = new Set();
    Object.entries(crossFamilyChildAnchor).forEach(([childId, anchorParentId]) => {
      if (processedAnchors.has(anchorParentId)) return;
      processedAnchors.add(anchorParentId);
      if (!pos[childId] || !pos[anchorParentId]) return;
      const otherParentId = (parentsOf[childId] || []).find(pid => pid !== anchorParentId && pos[pid]);
      if (!otherParentId) return;
      const ghostId = CROSS_GHOST_PREFIX + otherParentId + '_' + anchorParentId;
      if (!pos[ghostId]) return;
      const anchorCX = pos[anchorParentId].x + NODE_W / 2;
      const ghostCX = pos[ghostId].x + NODE_W / 2;
      const coupleCenter = (anchorCX + ghostCX) / 2;
      const siblingGroup = Object.entries(crossFamilyChildAnchor)
        .filter(([, anchor]) => anchor === anchorParentId)
        .map(([cid]) => cid).filter(cid => pos[cid]);
      if (!siblingGroup.length) return;
      const expandedIds = [];
      siblingGroup.forEach(cid => {
        const partners = (partnersOf[cid] || []).filter(pid =>
          pos[pid] && !pid.startsWith(CROSS_GHOST_PREFIX) &&
          !(parentsOf[pid] || []).some(ppid => pos[ppid])
        );
        [cid, ...partners].sort((a, b) => pos[a].x - pos[b].x).forEach(id => {
          if (!expandedIds.includes(id)) expandedIds.push(id);
        });
      });
      const totalW = expandedIds.length * NODE_W + (expandedIds.length - 1) * H_GAP;
      const newStartX = coupleCenter - totalW / 2;
      expandedIds.sort((a, b) => pos[a].x - pos[b].x);
      expandedIds.forEach((id, i) => { pos[id].x = newStartX + i * (NODE_W + H_GAP); });
      postLayoutAnchorGroups.push({ siblingGroup, anchorParentId, ghostId });
    });
  }

  // --- resolveOverlaps + cascade ---
  const beforeResolveX = {};
  Object.entries(pos).forEach(([id, p]) => { beforeResolveX[id] = p.x; });
  resolveOverlaps(pos, verticalGroupMap);

  gens.forEach(gen => {
    const cascadedResolve = new Set();
    (byGen[gen] || []).forEach(id => {
      if (!pos[id] || beforeResolveX[id] === undefined) return;
      const dx = pos[id].x - beforeResolveX[id];
      if (Math.abs(dx) > 0.5) {
        (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid => {
          if (crossFamilyChildAnchor[cid] && crossFamilyChildAnchor[cid] !== id) return;
          if (pos[cid] && !cascadedResolve.has(cid)) {
            cascadedResolve.add(cid);
            shiftWithDescendants(cid, dx);
          }
        });
      }
    });
  });



  // Re-enforce cross-family anchor groups (met displacement limiet)
  const maxAnchorDist = 4 * (NODE_W + H_GAP); // 920px — skip als ghost te ver is
  const maxAnchorShift = NODE_W + H_GAP; // 230px — beperk displacement
  postLayoutAnchorGroups.forEach(({ siblingGroup, anchorParentId, ghostId }) => {
    const validSiblings = siblingGroup.filter(cid => pos[cid]);
    if (!validSiblings.length || !pos[anchorParentId] || !pos[ghostId]) return;

    // Skip als ghost te ver van anchor is — herpositionering zou chaos veroorzaken
    const ghostDist = Math.abs(pos[anchorParentId].x - pos[ghostId].x);
    if (ghostDist > maxAnchorDist) return;

    const expandedIds = [];
    validSiblings.forEach(cid => {
      const partners = (partnersOf[cid] || []).filter(pid =>
        pos[pid] && !pid.startsWith(CROSS_GHOST_PREFIX) &&
        !(parentsOf[pid] || []).some(ppid => pos[ppid])
      );
      [cid, ...partners].forEach(id => { if (!expandedIds.includes(id)) expandedIds.push(id); });
    });
    expandedIds.sort((a, b) => pos[a].x - pos[b].x);
    const childXs = expandedIds.map(id => pos[id].x);
    const childCenter = (Math.min(...childXs) + Math.max(...childXs) + NODE_W) / 2;
    const anchorLeft = pos[anchorParentId].x < pos[ghostId].x;

    // Bereken gewenste posities
    let newAnchorX, newGhostX;
    if (anchorLeft) {
      newAnchorX = childCenter - NODE_W - H_GAP / 2;
      newGhostX = childCenter + H_GAP / 2;
    } else {
      newGhostX = childCenter - NODE_W - H_GAP / 2;
      newAnchorX = childCenter + H_GAP / 2;
    }

    // Beperk displacement zodat ouders niet te ver verschuiven
    const anchorDx = newAnchorX - pos[anchorParentId].x;
    const ghostDx = newGhostX - pos[ghostId].x;
    const clampedAnchorDx = Math.max(-maxAnchorShift, Math.min(maxAnchorShift, anchorDx));
    const clampedGhostDx = Math.max(-maxAnchorShift, Math.min(maxAnchorShift, ghostDx));
    pos[anchorParentId].x += clampedAnchorDx;
    pos[ghostId].x += clampedGhostDx;

    validSiblings.forEach(cid => {
      (ghostsAdjacentTo[cid] || []).filter(gid => pos[gid]).forEach(gid => {
        pos[gid].x = pos[cid].x + NODE_W + H_GAP;
      });
    });
  });



  // Finale convergentie-loop
  for (let cycle = 0; cycle < 3; cycle++) {
    const beforeCycleX = {};
    Object.entries(pos).forEach(([id, p]) => { beforeCycleX[id] = p.x; });
    resolveOverlaps(pos, verticalGroupMap);
    let hadShift = false;
    gens.forEach(gen => {
      const cascadedCycle = new Set();
      (byGen[gen] || []).forEach(id => {
        if (!pos[id] || beforeCycleX[id] === undefined) return;
        const dx = pos[id].x - beforeCycleX[id];
        if (Math.abs(dx) > 0.5) {
          hadShift = true;
          (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid => {
            if (crossFamilyChildAnchor[cid] && crossFamilyChildAnchor[cid] !== id) return;
            if (pos[cid] && !cascadedCycle.has(cid)) {
              cascadedCycle.add(cid);
              shiftWithDescendants(cid, dx);
            }
          });
        }
      });
    });
    if (!hadShift) break;
  }

  // Gezin-snapshot enforcement na convergentie-loop — DISABLED: veroorzaakt overlaps bij cross-family koppels
  // enforceGezinSnapshots();
  // resolveOverlaps(pos, verticalGroupMap);



  // ===== FINALE GEZIN-CENTERING =====
  // Herhaalde bottom-up centering: verschuif ouder-unit naar kindercentrum,
  // dan fixOverlaps + cascade. Dezelfde logica als de initiële centering-pass,
  // maar nu NA compactie/resolveOverlaps/cross-family herpositionering.
  // Dit herstelt de centering die door die stappen is gebroken.
  for (let finalePass = 0; finalePass < 6; finalePass++) {
    let anyShift = false;

    [...gens].reverse().forEach(gen => {
      shiftedInlaws = new Set();
      const processed = new Set();
      (byGen[gen] || []).forEach(id => {
        if (processed.has(id) || !pos[id]) return;
        const myPartners = (partnersOf[id] || []).filter(pid => {
          if (genOf[pid] !== gen || !pos[pid]) return false;
          const dist = Math.abs(pos[pid].x - pos[id].x);
          if (dist > MAX_PARTNER_DIST) {
            const ghostId = CROSS_GHOST_PREFIX + pid + '_' + id;
            if (pos[ghostId]) return false;
          }
          return true;
        });
        const unit = [id, ...myPartners];
        unit.forEach(pid => processed.add(pid));

        const allChildren = new Set();
        unit.forEach(pid => (childrenOf[pid] || []).filter(cid => pos[cid]).forEach(cid => {
          if (crossFamilyChildAnchor[cid] && !unit.includes(crossFamilyChildAnchor[cid])) return;
          allChildren.add(cid);
        }));
        if (!allChildren.size) return;

        const childXs = [...allChildren].map(cid => pos[cid].x + NODE_W / 2);
        const childCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2;
        const unitXs = unit.map(pid => pos[pid].x);
        const unitCenter = (Math.min(...unitXs) + Math.max(...unitXs) + NODE_W) / 2;
        const shift = childCenter - unitCenter;
        if (Math.abs(shift) > 1) {
          anyShift = true;
          unit.forEach(pid => {
            pos[pid].x += shift;
            (ghostsAdjacentTo[pid] || []).forEach(gid => {
              if (pos[gid]) pos[gid].x += shift;
            });
          });
        }
      });

      // fixOverlaps + cascade voor deze generatie
      shiftedInlaws = new Set();
      const beforeX = {};
      (byGen[gen] || []).forEach(id => { if (pos[id]) beforeX[id] = pos[id].x; });
      fixOverlaps(gen);
      const cascadedV = new Set();
      (byGen[gen] || []).forEach(id => {
        if (!pos[id] || beforeX[id] === undefined) return;
        const dx = pos[id].x - beforeX[id];
        if (Math.abs(dx) > 0.5) {
          (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid => {
            if (crossFamilyChildAnchor[cid] && crossFamilyChildAnchor[cid] !== id) return;
            if (pos[cid] && !cascadedV.has(cid)) {
              cascadedV.add(cid);
              shiftWithDescendants(cid, dx);
            }
          });
        }
      });
    });

    if (!anyShift) break;

    // Na centering + fixOverlaps: resolveOverlaps voor cross-generatie overlaps
    const beforeResolveFinX = {};
    Object.entries(pos).forEach(([id, p]) => { beforeResolveFinX[id] = p.x; });
    resolveOverlaps(pos, verticalGroupMap);
    gens.forEach(gen => {
      shiftedInlaws = new Set();
      const cascadedResFin = new Set();
      (byGen[gen] || []).forEach(id => {
        if (!pos[id] || beforeResolveFinX[id] === undefined) return;
        const dx = pos[id].x - beforeResolveFinX[id];
        if (Math.abs(dx) > 0.5) {
          anyShift = true;
          (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid => {
            if (crossFamilyChildAnchor[cid] && crossFamilyChildAnchor[cid] !== id) return;
            if (pos[cid] && !cascadedResFin.has(cid)) {
              cascadedResFin.add(cid);
              shiftWithDescendants(cid, dx);
            }
          });
        }
      });
    });
  }

  // Helper: verschuif een persoon en al zijn afstammelingen in Y-richting
  // Partners worden meegenomen als ze (1) op ~zelfde Y stonden en (2) dichtbij in X staan.
  // Dit voorkomt dat verre cross-family partners worden meegesleurd (isCloseX check),
  // maar vangt wel inlaw-partners die net op een iets andere Y staan (SHIFT_AMOUNT tolerantie).
  function shiftDescendantsY(id, dy, visited) {
    if (!pos[id] || visited.has(id)) return;
    visited.add(id);
    pos[id].y += dy;
    (partnersOf[id] || []).forEach(pid => {
      if (pos[pid] && !visited.has(pid)) {
        const wasAtSameY = Math.abs(pos[pid].y - (pos[id].y - dy)) < 20;
        const isCloseX = Math.abs(pos[pid].x - pos[id].x) < MAX_PARTNER_DIST;
        if (wasAtSameY && isCloseX) {
          visited.add(pid);
          pos[pid].y += dy;
          (childrenOf[pid] || []).forEach(gcid => {
            if (pos[gcid] && !visited.has(gcid)) shiftDescendantsY(gcid, dy, visited);
          });
        }
      }
    });
    (childrenOf[id] || []).forEach(cid => {
      if (pos[cid] && !visited.has(cid)) shiftDescendantsY(cid, dy, visited);
    });
  }




  // ===== T-BAR OVERLAP DETECTIE EN Y-VERSCHUIVING =====
  // Als twee gezinnen op dezelfde generatie kinderen hebben wiens X-ranges overlappen,
  // worden de kinderen (+ afstammelingen) van het conflicterende gezin naar beneden verschoven.
  // Dit voorkomt dat horizontale T-bars van verschillende gezinnen over elkaar lopen.
  // Iteratief: Y-verschuivingen kunnen nieuwe overlaps creëren, dus herhaal tot convergentie.
  for (let tbarPass = 0; tbarPass < 8; tbarPass++) {
    let anyTbarShift = false;
    // Bouw gezin-groepen: ouder(s) → kinderen
    const familyUnits = new Map(); // key → { parentIds, childIds, childY, barLeft, barRight }
    gens.forEach(gen => {
      const processed = new Set();
      (byGen[gen] || []).forEach(id => {
        if (processed.has(id) || !pos[id]) return;
        const myPartners = (partnersOf[id] || []).filter(pid => {
          if (genOf[pid] !== gen || !pos[pid]) return false;
          if (Math.abs(pos[pid].x - pos[id].x) > MAX_PARTNER_DIST) return false;
          return true;
        });
        const unit = [id, ...myPartners];
        unit.forEach(pid => processed.add(pid));

        const allChildren = new Set();
        unit.forEach(pid => (childrenOf[pid] || []).filter(cid => pos[cid]).forEach(cid => {
          if (crossFamilyChildAnchor[cid] && !unit.includes(crossFamilyChildAnchor[cid])) return;
          allChildren.add(cid);
        }));
        if (!allChildren.size) return;

        const childArr = [...allChildren];
        const childY = Math.min(...childArr.map(cid => pos[cid].y));
        const childCXs = childArr.map(cid => pos[cid].x + NODE_W / 2);
        const barLeft = Math.min(...childCXs);
        const barRight = Math.max(...childCXs);
        const key = unit.sort().join(',');
        familyUnits.set(key, { parentIds: unit, childIds: childArr, childY, barLeft, barRight });
      });
    });

    // Ghost-family T-bar detectie: voeg ghost-gezinnen toe met lagere prioriteit
    if (ghostMeta && Object.keys(ghostMeta).length) {
      // Groepeer ghost-kinderen per ghost-ouder-set
      const ghostFamilies = new Map();
      Object.entries(ghostMeta).forEach(([ghostId, meta]) => {
        if (!meta || !meta.personId || !pos[ghostId]) return;
        // Vind alle ouders van de echte persoon
        const parentIds = (parentsOf[meta.personId] || []).filter(pid => pos[pid]).sort();
        if (!parentIds.length) return;
        const key = 'ghost:' + parentIds.join(',');
        if (!ghostFamilies.has(key)) ghostFamilies.set(key, { parentIds, childIds: [], isGhost: true });
        ghostFamilies.get(key).childIds.push(ghostId);
      });
      ghostFamilies.forEach((fam, key) => {
        if (!fam.childIds.length) return;
        const childY = Math.min(...fam.childIds.map(cid => pos[cid].y));
        const childCXs = fam.childIds.map(cid => pos[cid].x + NODE_W / 2);
        familyUnits.set(key, { ...fam, childY, barLeft: Math.min(...childCXs), barRight: Math.max(...childCXs) });
      });
    }

    // Vergelijk ALLE families: check of een gezin's bar door een ander gezin's
    // kaartgebied loopt (of omgekeerd), EN de X-ranges overlappen.
    // Aanvullend: check of T-bar door ENIGE niet-familie kaart loopt.
    const SHIFT_AMOUNT = NODE_H + V_GAP; // 100 + 90 = 190px naar beneden
    const famArr = [];
    familyUnits.forEach((fam, key) => {
      const sameYChildren = fam.childIds.filter(cid => pos[cid] && Math.abs(pos[cid].y - fam.childY) < SHIFT_AMOUNT);
      const childBottomY = sameYChildren.length > 0
        ? Math.max(...sameYChildren.map(cid => pos[cid].y + NODE_H))
        : fam.childY + NODE_H;
      famArr.push({ key, ...fam, childBottomY, barY: fam.childY - 15 });
    });

    // Sorteer: echte gezinnen eerst (hogere prioriteit), dan ghost-gezinnen
    // Voor Fazelahmad-boom: gebruik OUDER-birthOrder als tiebreaker zodat
    // kleinkinderen de geboortevolgorde van hun ouders volgen
    // (Sanama BO 1 → eerste rij, Khanaga BO 6 → laatste rij).
    // BELANGRIJK: alleen birthOrder van ouders die DIRECT kind van tree head zijn
    // (anders wordt Benazier's BO=1 relatief aan Hagig Gull gebruikt i.p.v.
    // Khanaga's BO=6 relatief aan Fazelahmad).
    const getFamBirthOrder = (fam) => {
      let minBO = Infinity;
      fam.parentIds.forEach(pid => {
        // Alleen kijken naar ouders die kind zijn van de tree head
        if (!(parentsOf[pid] || []).includes(headId)) return;
        const p = state.persons.find(x => x.id === pid);
        if (p && typeof p.birthOrder === 'number' && p.birthOrder < minBO) {
          minBO = p.birthOrder;
        }
      });
      return minBO;
    };
    famArr.sort((a, b) => {
      const aGhost = a.isGhost ? 1 : 0;
      const bGhost = b.isGhost ? 1 : 0;
      if (aGhost !== bGhost) return aGhost - bGhost;
      // Fazelahmad-only: birthOrder als primaire sort
      if (headId === 'pmni0mtna5vxw') {
        const aBO = getFamBirthOrder(a);
        const bBO = getFamBirthOrder(b);
        if (aBO !== bBO) return aBO - bBO;
      }
      return a.childY - b.childY;
    });

    // Geplaatste gezinnen bijhouden met hun actuele Y-range
    const placedFams = [];
    // Bouw set van alle gezins-leden voor card-blocking check
    const allFamilyIds = new Set();
    famArr.forEach(fam => {
      fam.parentIds.forEach(pid => allFamilyIds.add(pid));
      fam.childIds.forEach(cid => allFamilyIds.add(cid));
    });

    famArr.forEach(fam => {
      let needShift = 0;
      const famMemberIds = new Set([...fam.parentIds, ...fam.childIds]);
      fam.parentIds.forEach(pid => (partnersOf[pid] || []).forEach(ppid => famMemberIds.add(ppid)));

      // Check 1: T-bar/kaartgebied conflict met geplaatste gezinnen
      for (const p of placedFams) {
        if (fam.barLeft > p.barRight + H_GAP || fam.barRight < p.barLeft - H_GAP) continue;

        const famBarY = fam.childY + needShift - 15;
        const famTopY = fam.childY + needShift;
        const famBotY = fam.childBottomY + needShift;

        const conflict =
          (famBarY >= p.childY - 15 && famBarY <= p.childBottomY) ||
          (p.barY >= famTopY - 15 && p.barY <= famBotY) ||
          (famTopY < p.childBottomY && famBotY > p.childY);

        if (conflict) {
          const minShift = p.childBottomY - fam.childY + V_GAP;
          needShift = Math.max(needShift, Math.ceil(minShift / SHIFT_AMOUNT) * SHIFT_AMOUNT);
        }
      }

      // Check 2: T-bar door niet-familie kaarten (card-blocking)
      const barY = fam.childY + needShift - 15;
      for (const id of Object.keys(pos)) {
        if (famMemberIds.has(id)) continue;
        // Skip ghost cards die een familielid representeren
        if (ghostMeta[id] && famMemberIds.has(ghostMeta[id].personId)) continue;
        // Skip ghost cards die adjacent zijn aan een familielid
        if (ghostMeta[id] && famMemberIds.has(ghostMeta[id].adjacentTo)) continue;
        const card = pos[id];
        // X-overlap met T-bar
        if (fam.barRight < card.x || fam.barLeft > card.x + NODE_W) continue;
        // T-bar Y door kaart
        if (barY > card.y && barY < card.y + NODE_H) {
          const minShift = card.y + NODE_H - fam.childY + V_GAP;
          needShift = Math.max(needShift, Math.ceil(minShift / SHIFT_AMOUNT) * SHIFT_AMOUNT);
        }
      }

      // Ghost-gezinnen: beperk Y-shift tot max 1 generatie
      if (fam.isGhost && needShift > SHIFT_AMOUNT) {
        needShift = SHIFT_AMOUNT;
      }

      placedFams.push({
        barLeft: fam.barLeft, barRight: fam.barRight,
        barY: fam.childY + needShift - 15,
        childY: fam.childY + needShift,
        childBottomY: fam.childBottomY + needShift
      });

      if (needShift > 0) {
        anyTbarShift = true;
        const shifted = new Set();
        fam.childIds.forEach(cid => {
          if (pos[cid] && !shifted.has(cid)) {
            shiftDescendantsY(cid, needShift, shifted);
          }
        });
      }
    });

    // Na Y-verschuiving: resolveOverlaps opnieuw draaien om nieuwe overlaps op te lossen
    resolveOverlaps(pos, verticalGroupMap);

    if (!anyTbarShift) break;
  }

  // Gezin-snapshot enforcement na T-bar loop — DISABLED: veroorzaakt overlaps bij cross-family koppels
  // enforceGezinSnapshots();
  // resolveOverlaps(pos, verticalGroupMap);

  // --- Post-layout: spreid verticale groepen uit (kinderen + partners) ---
  // Strategie: houd kaarten op de correcte X (onder ouders) en verschuif naar
  // beneden als er overlaps zijn. Lijnen worden langer i.p.v. kaarten verplaatst.
  if (verticalGroupMap.__groups) {
    // Verzamel alle niet-verticale posities voor overlap-detectie
    const verticalIds = new Set();
    verticalGroupMap.__groups.forEach(({ children, childPartnerMap }) => {
      children.forEach(cid => {
        verticalIds.add(cid);
        (childPartnerMap[cid] || []).forEach(pid => verticalIds.add(pid));
      });
    });

    verticalGroupMap.__groups.forEach(({ children, childPartnerMap }) => {
      const validChildren = children.filter(cid => pos[cid]);
      if (validChildren.length === 0) return;

      // Re-center baseX onder ouders (ouders kunnen verplaatst zijn door fixOverlaps/compactie)
      let baseX = pos[validChildren[0]].x;
      const firstChild = validChildren[0];
      const parentIdsOfChild = (parentsOf[firstChild] || []).filter(pid => pos[pid]);
      if (parentIdsOfChild.length > 0) {
        const parentCX = parentIdsOfChild.reduce((s, pid) => s + pos[pid].x + NODE_W / 2, 0) / parentIdsOfChild.length;
        baseX = parentCX - NODE_W / 2;
      }
      const baseY = pos[validChildren[0]].y;
      const hasPartner = validChildren.some(cid => (childPartnerMap[cid] || []).length > 0);
      const slotW = hasPartner ? 2 * NODE_W + H_GAP : NODE_W;

      let currentY = baseY;
      validChildren.forEach((cid, i) => {
        // Check overlap met bestaande niet-verticale kaarten op deze Y
        let rowY = currentY;
        for (let safety = 0; safety < 20; safety++) {
          let hasOverlap = false;
          const ids = Object.keys(pos).filter(nid =>
            pos[nid] && !verticalIds.has(nid) && nid !== cid
          );
          for (const nid of ids) {
            const n = pos[nid];
            // Check 2D overlap met de kolom (kind + eventuele partner)
            const overlapX = baseX < n.x + NODE_W && n.x < baseX + slotW;
            const overlapY = rowY < n.y + NODE_H && n.y < rowY + NODE_H;
            if (overlapX && overlapY) {
              // Verschuif naar beneden voorbij deze kaart
              rowY = n.y + NODE_H + effectiveVGap * 0.3;
              hasOverlap = true;
              break;
            }
          }
          if (!hasOverlap) break;
        }

        pos[cid].x = baseX;
        pos[cid].y = rowY;
        // Plaats partners rechts naast het kind
        (childPartnerMap[cid] || []).forEach(pid => {
          if (pos[pid]) {
            pos[pid].x = baseX + NODE_W + H_GAP;
            pos[pid].y = rowY;
          }
        });
        currentY = rowY + NODE_H + effectiveVGap * 0.5;
      });
    });
  }

  // --- Post-vertical compactie: sluit gaps die vrijkwamen door verticale herpositionering ---
  for (let pass = 0; pass < 5; pass++) {
    const allP2 = Object.entries(pos).map(([id, p]) => ({
      id, x: p.x, right: p.x + NODE_W, gen: genOf[id]
    }));
    allP2.sort((a, b) => a.x - b.x);
    if (!allP2.length) break;
    const maxX2 = Math.max(...allP2.map(p => p.right));
    const step2 = 15;
    let shifted2 = false;
    for (let scanX = PADDING + step2; scanX < maxX2; scanX += step2) {
      let minGap = Infinity;
      let hasLeft = false, hasRight = false;
      gens.forEach(gen => {
        const members = (byGen[gen] || []).filter(id => pos[id]);
        if (!members.length) return;
        let maxRight = -Infinity, minLeft = Infinity;
        members.forEach(id => {
          if (pos[id].x + NODE_W <= scanX) { maxRight = Math.max(maxRight, pos[id].x + NODE_W); hasLeft = true; }
          else if (pos[id].x >= scanX) { minLeft = Math.min(minLeft, pos[id].x); hasRight = true; }
          else { minGap = 0; }
        });
        if (maxRight > -Infinity && minLeft < Infinity) {
          const genGap = minLeft - maxRight;
          if (genGap < minGap) minGap = genGap;
        }
      });
      if (!hasLeft || !hasRight || minGap <= 25) continue;
      const shift = minGap - 25;
      if (shift < 2) continue;
      const allMoved3 = familyAwareScanShift(scanX, shift);
      if (allMoved3) scanX -= shift;
      shifted2 = true;
    }
    if (!shifted2) break;
  }

  // Fix overlaps die ontstaan zijn door verticale herpositionering
  // Gebruik een overlap-fix die OOK verticale leden meeneemt
  {
    const allIds = Object.keys(pos).filter(id => pos[id]);
    for (let pass = 0; pass < 5; pass++) {
      let fixed = false;
      allIds.sort((a, b) => pos[a].x - pos[b].x);
      for (let i = 0; i < allIds.length; i++) {
        const a = pos[allIds[i]];
        if (!a) continue;
        for (let j = i + 1; j < allIds.length; j++) {
          const b = pos[allIds[j]];
          if (!b) continue;
          if (b.x >= a.x + NODE_W + H_GAP) break;
          if (a.x < b.x + NODE_W && b.x < a.x + NODE_W &&
              a.y < b.y + NODE_H && b.y < a.y + NODE_H) {
            const shift = (a.x + NODE_W + H_GAP) - b.x;
            if (shift > 0) {
              // Verschuif b en alles rechts ervan op dezelfde Y
              const bY = b.y;
              const bX = b.x;
              const shiftedIds = [];
              allIds.forEach(nid => {
                if (pos[nid] && pos[nid].x >= bX && nid !== allIds[i]) {
                  // Alleen verschuiven als op vergelijkbare Y (binnen NODE_H afstand)
                  if (Math.abs(pos[nid].y - bY) < NODE_H) {
                    pos[nid].x += shift;
                    shiftedIds.push(nid);
                  }
                }
              });
              // Cascade naar nakomelingen van verschoven nodes
              const cascaded = new Set(shiftedIds);
              shiftedIds.forEach(nid => {
                (fullChildrenOf[nid] || childrenOf[nid] || []).forEach(cid => {
                  if (crossFamilyChildAnchor[cid] && crossFamilyChildAnchor[cid] !== nid) return;
                  if (pos[cid] && !cascaded.has(cid)) {
                    cascaded.add(cid);
                    shiftWithDescendants(cid, shift);
                  }
                });
              });
              fixed = true;
            }
          }
        }
      }
      if (!fixed) break;
    }
  }



  // --- Post-layout: verborgen partners naast zichtbare partner plaatsen ---
  // Als een persoon verborgen is door collapse maar een zichtbare partner heeft,
  // plaats die persoon naast de partner (als "late inlaw"). Zo verschijnt Alina
  // (kind Benazier, ingeklapt) naast Noman (kind Zarlakhta, zichtbaar) zonder
  // dat ze onder Benazier verschijnt.
  if (hiddenByCollapse.size > 0) {
    let addedAny = false;
    hiddenByCollapse.forEach(hidId => {
      if (pos[hidId]) return; // al geplaatst (zou niet moeten)
      // Zoek een zichtbare partner
      let visiblePartner = null;
      state.relationships.forEach(r => {
        if (r.type !== 'partner') return;
        const otherId = r.person1Id === hidId ? r.person2Id :
                        r.person2Id === hidId ? r.person1Id : null;
        if (otherId && pos[otherId] && !visiblePartner) {
          visiblePartner = otherId;
        }
      });
      if (visiblePartner) {
        pos[hidId] = {
          x: pos[visiblePartner].x + NODE_W + H_GAP,
          y: pos[visiblePartner].y
        };
        addedAny = true;
      }
    });
    if (addedAny) resolveOverlaps(pos, verticalGroupMap);
  }



  // --- Post-layout: Geboorte-volgorde correctie (unit-based) ---
  // Na alle compactie-stappen: controleer of kinderen op volgorde staan.
  // Verplaats koppels als eenheid (kind + partner + ghost-partners),
  // zodat partners niet achterblijven bij een swap.
  const familyGroupsBO = {};
  state.relationships.forEach(r => {
    if ((r.type !== 'parent-child' && r.type !== 'social-parent') || !pos[r.childId]) return;
    const parents = state.relationships
      .filter(rel => (rel.type === 'parent-child' || rel.type === 'social-parent') && rel.childId === r.childId && pos[rel.parentId])
      .map(rel => rel.parentId)
      .sort();
    if (!parents.length) return;
    const key = parents.join(',');
    if (!familyGroupsBO[key]) familyGroupsBO[key] = new Set();
    familyGroupsBO[key].add(r.childId);
  });

  Object.values(familyGroupsBO).forEach(childSet => {
    const siblings = [...childSet]
      .filter(id => pos[id] && !id.startsWith(CROSS_GHOST_PREFIX));
    if (siblings.length < 2) return;

    // Alleen kinderen op dezelfde Y-rij
    const refY = pos[siblings[0]].y;
    const sameRow = siblings.filter(id => Math.abs(pos[id].y - refY) < 20);
    if (sameRow.length < 2) return;

    // Bouw units: kind + nabije partners (niet-siblings) + ghost-partners
    const sibSet = new Set(sameRow);
    const units = {};
    sameRow.forEach(id => {
      const unit = [id];
      (partnersOf[id] || []).forEach(pid => {
        if (pos[pid] && Math.abs(pos[pid].y - refY) < 20 &&
            Math.abs(pos[pid].x - pos[id].x) <= 3 * (NODE_W + H_GAP) &&
            !sibSet.has(pid)) {
          unit.push(pid);
        }
      });
      // Ghost-partners
      (ghostsAdjacentTo[id] || []).forEach(gid => {
        if (pos[gid] && Math.abs(pos[gid].y - refY) < 20) {
          unit.push(gid);
        }
      });
      // Sorteer unit op X (links → rechts)
      unit.sort((a, b) => pos[a].x - pos[b].x);
      units[id] = unit;
    });

    // Huidige volgorde: sorteer siblings op de linkerkant van hun unit
    const currentOrder = [...sameRow].sort((a, b) => {
      const leftA = Math.min(...units[a].map(uid => pos[uid].x));
      const leftB = Math.min(...units[b].map(uid => pos[uid].x));
      return leftA - leftB;
    });

    // Gewenste volgorde: op birthOrder / geboortedatum
    const desiredOrder = [...sameRow].sort((a, b) => {
      const pa = getPerson(a), pb = getPerson(b);
      const isSocA = socialChildIds.has(a), isSocB = socialChildIds.has(b);
      const boA = (isSocA && pa?.socialBirthOrder != null) ? pa.socialBirthOrder : pa?.birthOrder;
      const boB = (isSocB && pb?.socialBirthOrder != null) ? pb.socialBirthOrder : pb?.birthOrder;
      if (boA != null && boB != null) return boA - boB;
      if (boA != null) return -1;
      if (boB != null) return 1;
      const bdA = parseBirthdate(pa?.birthdate);
      const bdB = parseBirthdate(pb?.birthdate);
      if (!bdA && !bdB) return 0;
      if (!bdA) return 1;
      if (!bdB) return -1;
      if (bdA.year !== bdB.year) return bdA.year - bdB.year;
      if (bdA.month && bdB.month && bdA.month !== bdB.month) return bdA.month - bdB.month;
      if (bdA.day && bdB.day) return bdA.day - bdB.day;
      return 0;
    });

    // Check of al correct EN compact (geen grote gaten)
    const orderCorrect = desiredOrder.every((id, i) => id === currentOrder[i]);
    if (orderCorrect) {
      // Check of er gaten zijn tussen opeenvolgende units
      let hasGap = false;
      for (let i = 1; i < currentOrder.length; i++) {
        const prevUnit = units[currentOrder[i - 1]];
        const currUnit = units[currentOrder[i]];
        const prevRight = Math.max(...prevUnit.map(uid => pos[uid].x + NODE_W));
        const currLeft = Math.min(...currUnit.map(uid => pos[uid].x));
        if (currLeft - prevRight > H_GAP + 10) {
          hasGap = true;
          break;
        }
      }
      if (!hasGap) return; // Volgorde correct EN compact → skip
    }

    // Startpositie = meest linkse positie van alle units
    const startX = Math.min(...currentOrder.map(id =>
      Math.min(...units[id].map(uid => pos[uid].x))
    ));

    // Compacteer units: plaats leden naast elkaar (H_GAP tussenstuk)
    // Dit dicht gaten die ontstaan als een sibling tussen koppelleden stond
    const unitOffsets = {};
    const unitWidths = {};
    sameRow.forEach(id => {
      const unit = units[id];
      if (unit.length === 1) {
        unitOffsets[id] = [{ uid: id, dx: 0 }];
        unitWidths[id] = NODE_W;
      } else {
        // Compact: plaats unit-leden naast elkaar, behoud links→rechts volgorde
        const offsets = [];
        let dx = 0;
        unit.forEach(uid => {
          offsets.push({ uid, dx });
          dx += NODE_W + H_GAP;
        });
        unitOffsets[id] = offsets;
        unitWidths[id] = dx - H_GAP;
      }
    });

    // Herplaats units in gewenste volgorde + cascade per lid naar nakomelingen
    shiftedInlaws = new Set();
    let curX = startX;
    desiredOrder.forEach(id => {
      // Verplaats elk unit-lid individueel en cascade per lid
      unitOffsets[id].forEach(({ uid, dx }) => {
        const oldX = pos[uid].x;
        const newX = curX + dx;
        const memberDx = newX - oldX;
        pos[uid].x = newX;

        // Cascade verschuiving naar nakomelingen van DIT lid
        // Gebruik directe childrenOf (niet fullChildrenOf) om cross-family cascade te beperken.
        // Cross-family kinderen worden later herpositioneerd door de cf_reposition stap.
        if (Math.abs(memberDx) > 0.5 && !uid.startsWith(CROSS_GHOST_PREFIX)) {
          (childrenOf[uid] || []).forEach(cid => {
            if (pos[cid]) shiftWithDescendants(cid, memberDx);
          });
        }
      });

      curX += unitWidths[id] + H_GAP;
    });
  });

  // --- Post-layout: Hercentreer kinderen onder ouderpaar ---
  // Na alle verschuivingen kunnen kinderen niet meer gecentreerd staan
  // onder hun ouders. Schuif ze terug als er ruimte is.
  const recenteredVisited = new Set();
  const coupleChildGroups = {};
  state.relationships.forEach(r => {
    if ((r.type !== 'parent-child' && r.type !== 'social-parent') || !pos[r.childId]) return;
    const parents = state.relationships
      .filter(rel => (rel.type === 'parent-child' || rel.type === 'social-parent') && rel.childId === r.childId && pos[rel.parentId])
      .map(rel => rel.parentId).sort();
    if (parents.length < 1) return;
    const key = parents.join(',');
    if (!coupleChildGroups[key]) coupleChildGroups[key] = { parents, children: new Set() };
    coupleChildGroups[key].children.add(r.childId);
  });

  // Sorteer van rechts naar links zodat verschuivingen geen cascade-conflicten geven
  const sortedCouples = Object.values(coupleChildGroups)
    .filter(g => g.children.size > 0)
    .sort((a, b) => {
      const cxA = Math.max(...a.parents.map(pid => pos[pid]?.x || 0));
      const cxB = Math.max(...b.parents.map(pid => pos[pid]?.x || 0));
      return cxB - cxA;
    });

  sortedCouples.forEach(({ parents, children }) => {
    const childIds = [...children].filter(id => pos[id] && !id.startsWith(CROSS_GHOST_PREFIX));
    if (!childIds.length) return;

    // Skip als kinderen zelf nakomelingen hebben — cascade te risicovol
    let childrenHaveDescendants = false;
    childIds.forEach(cid => {
      const desc = fullChildrenOf[cid] || childrenOf[cid] || [];
      if (desc.some(did => pos[did])) childrenHaveDescendants = true;
    });
    if (childrenHaveDescendants) return;

    // Bereken ouder-centrum
    const parentXs = parents.filter(pid => pos[pid]).map(pid => pos[pid].x);
    if (!parentXs.length) return;
    const coupleLeft = Math.min(...parentXs);
    const coupleRight = Math.max(...parentXs) + NODE_W;
    // Skip als ouders te ver uit elkaar staan
    if (coupleRight - coupleLeft > 3 * (NODE_W + H_GAP)) return;
    const coupleCenter = (coupleLeft + coupleRight) / 2;

    // Skip als ouders te ver van kinderen staan (cross-family situatie)
    const childXmin = Math.min(...childIds.map(cid => pos[cid].x));
    const childXmax = Math.max(...childIds.map(cid => pos[cid].x)) + NODE_W;
    const childCenterEst = (childXmin + childXmax) / 2;
    if (Math.abs(coupleCenter - childCenterEst) > 4 * (NODE_W + H_GAP)) return;

    // Verzamel kind-units (kind + partner op zelfde Y)
    const childRow = pos[childIds[0]].y;
    const unitMembers = new Set();
    childIds.forEach(cid => {
      if (Math.abs(pos[cid].y - childRow) > 20) return;
      unitMembers.add(cid);
      (partnersOf[cid] || []).forEach(pid => {
        if (pos[pid] && Math.abs(pos[pid].y - childRow) < 20 &&
            Math.abs(pos[pid].x - pos[cid].x) <= 3 * (NODE_W + H_GAP)) {
          unitMembers.add(pid);
        }
      });
    });
    if (unitMembers.size === 0) return;

    // Bereken kinderen-centrum
    const allUnitIds = [...unitMembers];
    const childLeft = Math.min(...allUnitIds.map(id => pos[id].x));
    const childRight = Math.max(...allUnitIds.map(id => pos[id].x + NODE_W));
    const childCenter = (childLeft + childRight) / 2;

    const dx = coupleCenter - childCenter;
    if (Math.abs(dx) < 3) return; // al gecentreerd

    // Bepaal shift-limieten op basis van buren (clamp i.p.v. cancel)
    let minDx = -Infinity, maxDx = Infinity;
    Object.keys(pos).forEach(nid => {
      const p = pos[nid];
      if (!p || unitMembers.has(nid) || Math.abs(p.y - childRow) >= NODE_H) return;
      if (p.x + NODE_W <= childLeft) {
        minDx = Math.max(minDx, p.x + NODE_W + H_GAP - childLeft);
      }
      if (p.x >= childRight) {
        maxDx = Math.min(maxDx, p.x - H_GAP - childRight);
      }
    });
    if (minDx > maxDx) return;

    const clampedDx = Math.max(minDx, Math.min(maxDx, dx));
    if (Math.abs(clampedDx) < 3) return;
    // Verschuif alle unit-leden (leaf kinderen, geen cascade nodig)
    shiftedInlaws = new Set();
    allUnitIds.forEach(id => {
      if (recenteredVisited.has(id)) return;
      recenteredVisited.add(id);
      pos[id].x += clampedDx;
    });
  });



  // --- Post-birth-order: herpositioneer cross-family kinderen onder anchor-ouder ---
  // De birth-order correctie kan cross-family kinderen ver van hun ouders verschuiven
  // door cascade-effecten over meerdere generaties. Breng ze terug onder hun anchor-ouder.
  // Gebruik actuele anchor-positie (niet ghost, want die is mogelijk stale).
  postLayoutAnchorGroups.forEach(({ siblingGroup, anchorParentId }) => {
    const validSiblings = siblingGroup.filter(cid => pos[cid]);
    if (!validSiblings.length || !pos[anchorParentId]) return;
    const expandedIds = [];
    validSiblings.forEach(cid => {
      const partners = (partnersOf[cid] || []).filter(pid =>
        pos[pid] && !pid.startsWith(CROSS_GHOST_PREFIX) &&
        !(parentsOf[pid] || []).some(ppid => pos[ppid])
      );
      [cid, ...partners].forEach(id => { if (!expandedIds.includes(id)) expandedIds.push(id); });
    });
    expandedIds.sort((a, b) => pos[a].x - pos[b].x);
    // Centreer onder anchor-ouder + nabije partner (als die adjacent is)
    const anchorCX = pos[anchorParentId].x + NODE_W / 2;
    const nearPartner = (partnersOf[anchorParentId] || []).find(pid =>
      pos[pid] && Math.abs(pos[pid].x - pos[anchorParentId].x) <= (NODE_W + H_GAP) * 1.5
    );
    const coupleCenter = nearPartner
      ? (anchorCX + pos[nearPartner].x + NODE_W / 2) / 2
      : anchorCX;
    const totalW = expandedIds.length * NODE_W + (expandedIds.length - 1) * H_GAP;
    const newStartX = coupleCenter - totalW / 2;
    expandedIds.forEach((id, i) => { pos[id].x = newStartX + i * (NODE_W + H_GAP); });
  });

  // resolveOverlaps hier verwijderd: veroorzaakte dat kinderen (Hemat) ver van
  // hun ouders (Benazier/Khanaga) werden geduwd (X=1355 → X=4205).
  // Test bevestigt: 0 overlaps in alle 44 stambomen zonder deze call.

  // --- Post-layout: Y-diepte separatie voor overlappende kinderGroepen ---
  // Als kinderen van verschillende ouderparen op dezelfde Y-rij overlappen,
  // verschuif de kleinere groep naar een dieper Y-niveau.
  // Dit voorkomt horizontale overlapping en creëert visuele scheiding.
  // Bouw een map: childId → sorted parent key (gebruikt door Y-diepte EN de-interleave)
  const parentKeyOf = {};
  const pushedYLevels = new Set(); // Y-levels die groepen ontvangen door Y-diepte pushes
  const pushedGroupKeys = new Set(); // 'yKey:pKey' van groepen die door Y-diepte zijn verschoven
  state.relationships.forEach(r => {
    if ((r.type !== 'parent-child' && r.type !== 'social-parent') || !pos[r.childId]) return;
    if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
    const parents = state.relationships
      .filter(rel => (rel.type === 'parent-child' || rel.type === 'social-parent') && rel.childId === r.childId && pos[rel.parentId])
      .map(rel => rel.parentId).sort();
    if (!parents.length) return;
    parentKeyOf[r.childId] = parents.join(',');
  });

  {

    // Groepeer kinderen per Y-rij en per ouder-key
    const childGroupsByY = {};
    Object.entries(parentKeyOf).forEach(([childId, pKey]) => {
      if (!pos[childId]) return;
      const y = pos[childId].y;
      const yKey = Math.round(y / 10) * 10;
      if (!childGroupsByY[yKey]) childGroupsByY[yKey] = {};
      if (!childGroupsByY[yKey][pKey]) childGroupsByY[yKey][pKey] = [];
      childGroupsByY[yKey][pKey].push(childId);
    });

    // Per Y-rij: detecteer overlap en verschuif kleinere groep naar dieper niveau
    Object.entries(childGroupsByY).forEach(([yKey, groups]) => {
      const groupList = Object.entries(groups)
        .filter(([, ids]) => ids.length > 0)
        .map(([pKey, ids]) => {
          const xs = ids.map(id => pos[id].x);
          const xMin = Math.min(...xs);
          const xMax = Math.max(...xs) + NODE_W;
          // Bereken ouder-center voor sortering
          const parentIds = pKey.split(',');
          const parentXs = parentIds.filter(pid => pos[pid]).map(pid => pos[pid].x + NODE_W / 2);
          const parentCenter = parentXs.length > 0
            ? parentXs.reduce((s, x) => s + x, 0) / parentXs.length
            : (xMin + xMax) / 2;
          return { pKey, ids, xMin, xMax, parentCenter, count: ids.length };
        });

      if (groupList.length < 2) return;

      // Sorteer op ouder-center positie (links naar rechts)
      groupList.sort((a, b) => a.parentCenter - b.parentCenter);

      // Check paargewijs op overlap
      // Track welke groepen al verschoven zijn (max 1x per groep)
      const pushedGroupIdx = new Set();
      for (let i = 0; i < groupList.length; i++) {
        if (pushedGroupIdx.has(i)) continue; // al verschoven, skip
        for (let j = i + 1; j < groupList.length; j++) {
          if (pushedGroupIdx.has(j)) continue; // al verschoven, skip
          const gA = groupList[i];
          const gB = groupList[j];

          // Skip als de ouder-sets overlappen (= siblings, niet scheiden!)
          const parentsA = new Set(gA.pKey.split(','));
          const parentsB = new Set(gB.pKey.split(','));
          let shareParent = false;
          for (const p of parentsA) { if (parentsB.has(p)) { shareParent = true; break; } }
          if (shareParent) continue;

          // Overlap als xMin van B < xMax van A (met marge)
          const overlap = gA.xMax > gB.xMin - H_GAP / 2;
          if (!overlap) continue;

          // Verschuif de groep met ouder-positie verder naar rechts (= later geboren)
          // Dit houdt de eerstgeborene's kinderen op het ondiepste Y-niveau.
          // groupList is gesorteerd op parentCenter (links→rechts), dus gB is altijd rechts.
          const toPushDown = gB;
          const dyShift = NODE_H + effectiveVGap;

          // Verzamel alle IDs in de te verschuiven groep (kinderen + hun partners)
          const shiftedIds = [];
          toPushDown.ids.forEach(cid => {
            if (!pos[cid]) return;
            // Check: heeft dit kind een partner die in een ANDERE oudergroep zit
            // die NIET wordt verschoven? (bijv. Husna is kind van Mohammaddel
            // maar partner van Hemat uit de Benazier-groep → blijf bij Hemat)
            const hasStayingPartner = (partnersOf[cid] || []).some(pid => {
              if (!pos[pid]) return false;
              const ppKey = parentKeyOf[pid];
              return ppKey && ppKey !== toPushDown.pKey;
            });
            if (hasStayingPartner) return; // Blijf bij partner op huidige Y-niveau

            pos[cid].y += dyShift;
            pushedYLevels.add(Math.round(pos[cid].y));
            pushedGroupKeys.add(Math.round(pos[cid].y) + ':' + toPushDown.pKey);
            shiftedIds.push(cid);
            // Verschuif ook partners (inlaws) die naast dit kind staan,
            // MAAR niet als de partner zelf een oudergroep heeft die blijft
            // (bijv. Hemat is kind van Benazier EN partner van Husna/Mohammaddel)
            (partnersOf[cid] || []).forEach(pid => {
              if (!pos[pid] || Math.abs(pos[pid].y - (pos[cid].y - dyShift)) >= NODE_H / 2) return;
              // Check: heeft deze partner een eigen ouder-key in een ANDERE groep?
              const partnerPKey = parentKeyOf[pid];
              if (partnerPKey && partnerPKey !== toPushDown.pKey) {
                // Partner hoort bij een andere oudergroep → niet meeverschuiven
                return;
              }
              pos[pid].y += dyShift;
              shiftedIds.push(pid);
            });
            // Cascade: verschuif ook alle nakomelingen
            const shiftDescY = (id, visited) => {
              if (!visited) visited = new Set();
              (fullChildrenOf[id] || childrenOf[id] || []).forEach(did => {
                if (pos[did] && !visited.has(did)) {
                  visited.add(did);
                  pos[did].y += dyShift;
                  shiftDescY(did, visited);
                }
              });
            };
            shiftDescY(cid);
          });

          // Hercentreer de verschoven groep onder hun ouders
          if (shiftedIds.length > 0) {
            const parentIds = toPushDown.pKey.split(',');
            const parentXs = parentIds.filter(pid => pos[pid]).map(pid => pos[pid].x + NODE_W / 2);
            if (parentXs.length > 0) {
              const parentCenterX = parentXs.reduce((s, x) => s + x, 0) / parentXs.length;
              // Bereken huidige center van de verschoven groep (alleen de directe kinderen)
              const childXs = toPushDown.ids.filter(id => pos[id] && shiftedIds.includes(id)).map(id => pos[id].x);
              if (childXs.length > 0) {
                const groupLeft = Math.min(...childXs);
                const groupRight = Math.max(...childXs) + NODE_W;
                const groupCenter = (groupLeft + groupRight) / 2;
                const dx = parentCenterX - groupCenter;
                if (Math.abs(dx) > 5) {
                  shiftedIds.forEach(id => {
                    if (pos[id]) pos[id].x += dx;
                  });
                }
              }
            }
          }
          // Markeer deze groep als verschoven zodat hij niet nóg een keer geduwd wordt
          pushedGroupIdx.add(j);
        }
      }
    });
  }



  // (Sibling-reunificatie draait als FINALE stap na alle centering/compactie)

  // --- De-interleave: familie-groepen op dezelfde Y-rij ontwarren ---
  // Na Y-diepte separatie kunnen kinderen van verschillende ouders door
  // elkaar op de X-as staan. Deze stap groepeert ze per ouder-paar.
  {
    // Herbouw groupsByY met huidige posities (na Y-diepte verschuivingen)
    const groupsByY = {};
    Object.entries(parentKeyOf).forEach(([childId, pKey]) => {
      if (!pos[childId]) return;
      const yKey = Math.round(pos[childId].y);
      if (!groupsByY[yKey]) groupsByY[yKey] = {};
      if (!groupsByY[yKey][pKey]) groupsByY[yKey][pKey] = [];
      groupsByY[yKey][pKey].push(childId);
    });

    Object.entries(groupsByY).forEach(([yKey, groups]) => {
      // Alleen de-interleave op Y-levels waar groepen naartoe zijn geduwd
      if (!pushedYLevels.has(parseInt(yKey))) return;

      // Bouw geordende groepslijst (gesorteerd op linkerzijde)
      const groupList = Object.entries(groups)
        .filter(([, ids]) => ids.length > 0)
        .map(([pKey, ids]) => {
          // Inclusief partners die bij deze kinderen horen
          const allIds = new Set(ids);
          ids.forEach(cid => {
            (partnersOf[cid] || []).forEach(pid => {
              if (pos[pid] && Math.abs(pos[pid].y - pos[cid].y) < NODE_H / 2) {
                allIds.add(pid);
              }
            });
          });
          const expandedIds = [...allIds];
          const xs = expandedIds.filter(id => pos[id]).map(id => pos[id].x);
          if (xs.length === 0) return null;
          const xMin = Math.min(...xs);
          const xMax = Math.max(...xs) + NODE_W;
          // Ouder-center voor sortering
          const parentIds = pKey.split(',');
          const parentXs = parentIds.filter(pid => pos[pid]).map(pid => pos[pid].x + NODE_W / 2);
          const parentCenter = parentXs.length > 0
            ? parentXs.reduce((s, x) => s + x, 0) / parentXs.length
            : (xMin + xMax) / 2;
          const wasPushed = pushedGroupKeys.has(parseInt(yKey) + ':' + pKey);
          return { pKey, ids: expandedIds, xMin, xMax, parentCenter, wasPushed };
        })
        .filter(Boolean)
        .sort((a, b) => a.parentCenter - b.parentCenter);

      if (groupList.length < 2) return;

      // Detecteer en ontwar interleaving: schuif rechter groep zodat hij
      // pas NA de linker groep begint (met H_GAP tussenruimte)
      for (let i = 0; i < groupList.length - 1; i++) {
        const gA = groupList[i];
        const gB = groupList[i + 1];
        if (gA.pKey === gB.pKey) continue;

        // Bereken minimale start voor gB: na het einde van gA + gap
        const minStart = gA.xMax + H_GAP;
        if (gB.xMin < minStart) {
          const shift = minStart - gB.xMin;
          // Alleen verschuiven als de groep daadwerkelijk door Y-diepte is geduwd.
          if (!gB.wasPushed) continue;
          // Verschuif alleen deze geduude groep (en verdere gepushte groepen) naar rechts
          for (let k = i + 1; k < groupList.length; k++) {
            if (!groupList[k].wasPushed) continue;
            groupList[k].ids.forEach(id => {
              if (pos[id]) pos[id].x += shift;
            });
            groupList[k].xMin += shift;
            groupList[k].xMax += shift;
          }
        }
      }
    });
  }



  // --- Finale overlap-check na Y-diepte separatie + de-interleave ---
  resolveOverlaps(pos, verticalGroupMap);




  // --- Root re-centering: centreer gen-0 ouders boven hun kinderen ---
  // Na alle fixOverlaps/compactie/Y-diepte stappen kan de root ver van zijn
  // kinderen af staan (bijv. Hagig Gull). Dit komt doordat compactie de
  // kinderen verschuift maar de gap naar gen-0 niet detecteert (geen generatie
  // heeft nodes aan BEIDE zijden van de gap). Hercentreer hier.
  {
    const gen0Ids = (byGen[0] || []).filter(id => pos[id]);
    const rootProcessed = new Set();
    gen0Ids.forEach(id => {
      if (rootProcessed.has(id)) return;
      const partners = (partnersOf[id] || []).filter(pid =>
        pos[pid] && genOf[pid] === 0 &&
        Math.abs(pos[pid].x - pos[id].x) < 3 * (NODE_W + H_GAP)
      );
      const unit = [id, ...partners];
      unit.forEach(pid => rootProcessed.add(pid));

      // Verzamel alle directe kinderen van deze unit
      const allChildren = new Set();
      unit.forEach(pid => {
        (childrenOf[pid] || []).forEach(cid => {
          if (pos[cid]) allChildren.add(cid);
        });
      });
      if (allChildren.size === 0) return;

      const childXs = [...allChildren].map(cid => pos[cid].x + NODE_W / 2);
      const childCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2;
      const unitXs = unit.map(pid => pos[pid].x);
      const unitCenter = (Math.min(...unitXs) + Math.max(...unitXs) + NODE_W) / 2;
      const shift = childCenter - unitCenter;
      if (Math.abs(shift) > 5) {
        unit.forEach(pid => {
          pos[pid].x += shift;
          (ghostsAdjacentTo[pid] || []).forEach(gid => {
            if (pos[gid]) pos[gid].x += shift;
          });
        });
      }
    });
  }

  // --- Finale cross-family herpositionering ---
  // Na alle overlap-resoluties kunnen cross-family kinderen weer ver van hun
  // anchor-ouder staan. Herpositioneer ze een laatste keer.
  postLayoutAnchorGroups.forEach(({ siblingGroup, anchorParentId }) => {
    const validSiblings = siblingGroup.filter(cid => pos[cid]);
    if (!validSiblings.length || !pos[anchorParentId]) return;
    const expandedIds = [];
    validSiblings.forEach(cid => {
      const partners = (partnersOf[cid] || []).filter(pid =>
        pos[pid] && !pid.startsWith(CROSS_GHOST_PREFIX) &&
        !(parentsOf[pid] || []).some(ppid => pos[ppid])
      );
      [cid, ...partners].forEach(id => { if (!expandedIds.includes(id)) expandedIds.push(id); });
    });
    expandedIds.sort((a, b) => pos[a].x - pos[b].x);
    const anchorCX = pos[anchorParentId].x + NODE_W / 2;
    const nearPartner = (partnersOf[anchorParentId] || []).find(pid =>
      pos[pid] && Math.abs(pos[pid].x - pos[anchorParentId].x) <= (NODE_W + H_GAP) * 1.5
    );
    const coupleCenter = nearPartner
      ? (anchorCX + pos[nearPartner].x + NODE_W / 2) / 2
      : anchorCX;
    const totalW = expandedIds.length * NODE_W + (expandedIds.length - 1) * H_GAP;
    const newStartX = coupleCenter - totalW / 2;
    expandedIds.forEach((id, i) => { pos[id].x = newStartX + i * (NODE_W + H_GAP); });
  });



  // --- Finale X-normalisatie: voorkom negatieve posities ---
  {
    const allFinalX = Object.values(pos).map(p => p.x);
    const finalMinX = Math.min(...allFinalX);
    if (finalMinX < PADDING) {
      const normShift = PADDING - finalMinX;
      Object.values(pos).forEach(p => { p.x += normShift; });
    }
  }



  // --- Cross-family ghosts: extraheer uit pos ---
  const crossFamilyGhosts = {};
  // Finale overlap-check na alle layout-stappen
  resolveOverlaps(pos, verticalGroupMap);

  Object.keys(pos).forEach(id => {
    if (id.startsWith(CROSS_GHOST_PREFIX)) {
      const meta = ghostMeta[id];
      if (meta && pos[id]) {
        // Onderdruk ghost als het echte persoon al in de layout staat
        const realPos = pos[meta.personId];
        const adjPos = pos[meta.adjacentTo];

        // Child-ghosts (bevatten '_cf_'): onderdrukken als echte persoon DICHTBIJ de
        // niet-anchor ouder staat. Als het kind ver weg staat, toon als duplicaat.
        const isChildGhost = id.includes('_cf_');

        // Neef-nicht paren: ghost NOOIT onderdrukken — beide moeten zichtbaar zijn
        // (eenmaal als kind onder eigen ouders, eenmaal als schoonzoon/-dochter naast partner)
        const isCousinGhost = cousinPairSet.has([meta.personId, meta.adjacentTo].sort().join(','));

        const alreadyNear = isCousinGhost
            ? false    // neef-nicht: altijd ghost tonen
            : realPos && adjPos &&
              Math.abs(realPos.y - adjPos.y) < 3 * (NODE_H + V_GAP) &&
              Math.abs(realPos.x - adjPos.x) <= 3 * (NODE_W + H_GAP);

        if (!alreadyNear) {
          crossFamilyGhosts[meta.personId + ':cg:' + meta.adjacentTo] = {
            x: pos[id].x,
            y: pos[id].y,
            personId: meta.personId,
            adjacentTo: meta.adjacentTo
          };
        }
      }
      delete pos[id];
    }
  });

  // Post-ghost overlap-check: ghosts fungeerden als spacers
  resolveOverlaps(pos, verticalGroupMap);

  // --- Partner-adjacentie: herpositioneer partners die te ver van hun echtgenoot staan ---
  // Draait NA ghost-extractie zodat ghost-posities niet interfereren.
  // Geldt voor inlaw-partners EN cross-family partners (bijv. Noman ↔ Alina).
  {
    const fixedPartners = new Set();
    // Helper: plaats moverId naast anchorId, schuif blokkerende kaarten opzij
    const placeNextTo = (anchorId, moverId) => {
      const targetX = pos[anchorId].x + NODE_W + H_GAP;
      const targetY = pos[anchorId].y;
      // Verschuif kaarten die op de doelpositie staan naar rechts
      Object.keys(pos).forEach(oid => {
        if (oid === moverId || oid === anchorId || !pos[oid]) return;
        if (Math.abs(pos[oid].y - targetY) >= NODE_H / 2) return;
        if (pos[oid].x >= targetX && pos[oid].x < targetX + NODE_W) {
          // Blokkeerder gevonden: verschuif alles rechts van targetX
          const shift = NODE_W + H_GAP;
          Object.keys(pos).forEach(sid => {
            if (sid === moverId || sid === anchorId || !pos[sid]) return;
            if (Math.abs(pos[sid].y - targetY) >= NODE_H / 2) return;
            if (pos[sid].x >= targetX) pos[sid].x += shift;
          });
        }
      });
      pos[moverId].x = targetX;
      pos[moverId].y = targetY;
      fixedPartners.add(moverId);
    };

    Object.keys(pos).forEach(id => {
      if (fixedPartners.has(id)) return;
      (partnersOf[id] || []).forEach(pid => {
        if (!pos[pid] || fixedPartners.has(pid)) return;
        if (Math.abs(pos[id].y - pos[pid].y) >= NODE_H) return;
        const dist = Math.abs(pos[id].x - pos[pid].x);
        if (dist <= (NODE_W + H_GAP) * 1.5) return; // Dicht genoeg

        const idHasParents = (parentsOf[id] || []).some(p => pos[p]);
        const pidHasParents = (parentsOf[pid] || []).some(p => pos[p]);

        // Neef-nicht paren: NIET verplaatsen — beide moeten onder eigen ouders
        // blijven. Het ghost-systeem maakt een kopie naast de partner.
        const pairKey = [id, pid].sort().join(',');
        if (cousinPairSet.has(pairKey)) return;

        if (!pidHasParents && idHasParents) {
          placeNextTo(id, pid);
        } else if (!idHasParents && pidHasParents) {
          placeNextTo(pid, id);
        } else if (idHasParents && pidHasParents) {
          // Cross-family: verplaats degene met minder kinderen
          const idKids = (childrenOf[id] || []).filter(c => pos[c]).length;
          const pidKids = (childrenOf[pid] || []).filter(c => pos[c]).length;
          if (pidKids <= idKids) {
            placeNextTo(id, pid);
          } else {
            placeNextTo(pid, id);
          }
        }
      });
    });
  }
  resolveOverlaps(pos, verticalGroupMap);

  // --- Neef-nicht herpositionering + ghost-plaatsing ---
  if (cousinPairSet.size > 0) {
    // Stap 1: Verplaats neef-nicht paar-leden naar oudergebied (zonder push)
    cousinPairSet.forEach(pairKey => {
      const [idA, idB] = pairKey.split(',');
      [idA, idB].forEach(personId => {
        if (!pos[personId]) return;
        const myParents = (parentsOf[personId] || []).filter(pid => pos[pid]);
        if (!myParents.length) return;

        // Skip als persoon al tussen broers/zussen staat op dezelfde Y-rij
        // (birth-order sorting heeft hen al correct geplaatst)
        const myY = pos[personId].y;
        const siblingIds = new Set();
        myParents.forEach(pid => {
          (fullChildrenOf[pid] || childrenOf[pid] || []).forEach(cid => {
            if (cid !== personId && pos[cid] && Math.abs(pos[cid].y - myY) < 10) {
              siblingIds.add(cid);
            }
          });
        });
        if (siblingIds.size > 0) return;

        const parentXs = myParents.map(pid => pos[pid].x + NODE_W / 2);
        const parentCenter = (Math.min(...parentXs) + Math.max(...parentXs)) / 2;
        const targetX = parentCenter - NODE_W / 2;

        // Skip als persoon al binnen het bereik van ouders staat
        const personCX = pos[personId].x + NODE_W / 2;
        const parentSpanMin = Math.min(...parentXs) - NODE_W;
        const parentSpanMax = Math.max(...parentXs) + NODE_W;
        if (personCX >= parentSpanMin && personCX <= parentSpanMax) return;

        const oldX = pos[personId].x;
        pos[personId].x = targetX;
        shiftedInlaws = new Set();
        (fullChildrenOf[personId] || childrenOf[personId] || []).forEach(cid => {
          if (pos[cid]) shiftWithDescendants(cid, targetX - oldX);
        });
      });
    });

    resolveOverlaps(pos, verticalGroupMap);

    // Stap 2: Ghost-posities — plaats naast partner, maak ruimte indien nodig
    const cousinGhostKeys = Object.keys(crossFamilyGhosts).filter(key => {
      const g = crossFamilyGhosts[key];
      return cousinPairSet.has([g.personId, g.adjacentTo].sort().join(','));
    });
    // Sorteer links→rechts op partner-positie zodat pushes correct cascaden
    cousinGhostKeys.sort((a, b) => {
      const xA = pos[crossFamilyGhosts[a].adjacentTo]?.x || 0;
      const xB = pos[crossFamilyGhosts[b].adjacentTo]?.x || 0;
      return xA - xB;
    });
    cousinGhostKeys.forEach(key => {
      const g = crossFamilyGhosts[key];
      const adjP = pos[g.adjacentTo];
      if (!adjP) return;
      const gy = adjP.y;
      const rightX = adjP.x + NODE_W + H_GAP;
      const leftX = adjP.x - NODE_W - H_GAP;
      const hasOverlap = (x) => {
        if (Object.values(pos).some(p =>
          Math.abs(p.y - gy) < NODE_H && p.x < x + NODE_W && p.x + NODE_W > x
        )) return true;
        return cousinGhostKeys.some(k => {
          if (k === key) return false;
          const og = crossFamilyGhosts[k];
          if (og.x === undefined) return false;
          return Math.abs(og.y - gy) < NODE_H && og.x < x + NODE_W && og.x + NODE_W > x;
        });
      };
      if (!hasOverlap(rightX)) {
        // Rechts vrij → ghost rechts (partner altijd RECHTS van kind)
        g.x = rightX;
        g.y = gy;
      } else {
        // Rechts bezet → MAAK RUIMTE rechts (partner ALTIJD rechts)
        const pushDx = NODE_W + H_GAP;
        const toShift = new Set();
        Object.keys(pos).forEach(id => {
          if (pos[id] && pos[id].x >= rightX) toShift.add(id);
        });
        // Trek partners mee die net links van de grens staan
        for (const id of [...toShift]) {
          (partnersOf[id] || []).forEach(pid => {
            if (pos[pid] && !toShift.has(pid) &&
                Math.abs(pos[pid].y - pos[id].y) < 10 &&
                pos[id].x - pos[pid].x > 0 &&
                pos[id].x - pos[pid].x <= NODE_W + H_GAP + 10) {
              toShift.add(pid);
            }
          });
        }
        toShift.forEach(id => { pos[id].x += pushDx; });
        Object.keys(crossFamilyGhosts).forEach(k => {
          if (k === key) return;
          const og = crossFamilyGhosts[k];
          if (og.x !== undefined && og.x >= rightX) og.x += pushDx;
        });
        g.x = rightX;
        g.y = gy;
      }
    });

    // Stap 3: Herpositioneer cross-family kinderen onder anchor + cousin-ghost
    // Na resolveOverlaps en ghost-pushes kunnen kinderen ver van anchor afdrijven.
    const processedAnchorsStep3 = new Set();
    Object.entries(crossFamilyChildAnchor).forEach(([childId, anchorId]) => {
      if (processedAnchorsStep3.has(anchorId)) return;
      processedAnchorsStep3.add(anchorId);
      if (!pos[anchorId]) return;

      // Zoek de cousin-ghost van de partner naast de anchor
      const otherParent = (parentsOf[childId] || []).find(pid => pid !== anchorId && pos[pid]);
      if (!otherParent) return;
      const ghostKey = otherParent + ':cg:' + anchorId;
      const ghost = crossFamilyGhosts[ghostKey];
      if (!ghost || ghost.x === undefined) return;

      // Verzamel alle kinderen van deze anchor
      const siblings = Object.entries(crossFamilyChildAnchor)
        .filter(([, a]) => a === anchorId)
        .map(([cid]) => cid)
        .filter(cid => pos[cid]);
      if (!siblings.length) return;

      // Bereken center onder anchor + ghost
      const coupleCenter = (pos[anchorId].x + ghost.x + NODE_W) / 2;
      const totalW = siblings.length * NODE_W + (siblings.length - 1) * H_GAP;
      const startX = coupleCenter - totalW / 2;

      siblings.sort((a, b) => pos[a].x - pos[b].x);
      siblings.forEach((cid, i) => {
        const newX = startX + i * (NODE_W + H_GAP);
        const dx = newX - pos[cid].x;
        if (Math.abs(dx) > 1) {
          pos[cid].x = newX;
        }
      });
    });
    resolveOverlaps(pos, verticalGroupMap);
  }

  // Hercontroleer ghosts: onderdruk die nu overbodig zijn na partner-adjacentie
  // MAAR: neef-niet ghosts nooit onderdrukken
  Object.keys(crossFamilyGhosts).forEach(key => {
    const g = crossFamilyGhosts[key];
    // Neef-nicht paren: altijd behouden
    if (cousinPairSet.has([g.personId, g.adjacentTo].sort().join(','))) return;
    const realPos = pos[g.personId];
    const adjPos = pos[g.adjacentTo];
    if (realPos && adjPos &&
        Math.abs(realPos.y - adjPos.y) < 3 * (NODE_H + V_GAP) &&
        Math.abs(realPos.x - adjPos.x) <= 3 * (NODE_W + H_GAP)) {
      delete crossFamilyGhosts[key];
    }
  });

  // ===== FINALE LEAF-CHILD CENTERING =====
  // Allerlaatste stap: centreer leaf-kinderen (zonder eigen nakomelingen)
  // onder hun ouders. Alle eerdere stappen (T-bar, compactie, partner-adjacentie)
  // zijn afgerond, dus posities zijn definitief. Geen cascade nodig.
  {
    const leafGroups = {};
    state.relationships.forEach(r => {
      if ((r.type !== 'parent-child' && r.type !== 'social-parent') || !pos[r.childId]) return;
      const pids = state.relationships
        .filter(rel => (rel.type === 'parent-child' || rel.type === 'social-parent') && rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      if (!pids.length) return;
      const key = pids.join(',');
      if (!leafGroups[key]) leafGroups[key] = { parents: pids, children: new Set() };
      leafGroups[key].children.add(r.childId);
    });

    Object.values(leafGroups).forEach(({ parents, children }) => {
      const cids = [...children].filter(id => pos[id] && !id.startsWith(CROSS_GHOST_PREFIX));
      if (!cids.length) return;

      // Alleen leaf-kinderen (geen eigen kinderen in layout)
      if (cids.some(cid => (childrenOf[cid] || []).some(did => pos[did]))) return;

      // Ouder-centrum
      const pxs = parents.filter(pid => pos[pid]).map(pid => pos[pid].x);
      if (!pxs.length) return;
      const pLeft = Math.min(...pxs);
      const pRight = Math.max(...pxs) + NODE_W;
      if (pRight - pLeft > 3 * (NODE_W + H_GAP)) return;
      const pCenter = (pLeft + pRight) / 2;

      // Kind-groep op zelfde Y-rij
      const cRow = pos[cids[0]].y;
      const sameRow = cids.filter(cid => Math.abs(pos[cid].y - cRow) < 20);
      if (sameRow.length < 1) return;

      // Skip als ouders te ver van kinderen (cross-family)
      const cMinX = Math.min(...sameRow.map(id => pos[id].x));
      const cMaxR = Math.max(...sameRow.map(id => pos[id].x)) + NODE_W;
      const cCenter = (cMinX + cMaxR) / 2;
      if (Math.abs(pCenter - cCenter) > 4 * (NODE_W + H_GAP)) return;

      const dx = pCenter - cCenter;
      if (Math.abs(dx) < 3) return;

      // Clamp: bepaal ruimte op de kinderen Y-rij
      let minDx = -Infinity, maxDx = Infinity;
      const cSet = new Set(sameRow);
      Object.keys(pos).forEach(nid => {
        const p = pos[nid];
        if (!p || cSet.has(nid) || Math.abs(p.y - cRow) >= NODE_H) return;
        if (p.x + NODE_W <= cMinX) {
          minDx = Math.max(minDx, p.x + NODE_W + H_GAP - cMinX);
        }
        if (p.x >= cMaxR) {
          maxDx = Math.min(maxDx, p.x - H_GAP - cMaxR);
        }
      });
      if (minDx > maxDx) return;

      const clamped = Math.max(minDx, Math.min(maxDx, dx));
      if (Math.abs(clamped) < 3) return;

      sameRow.forEach(id => { pos[id].x += clamped; });
    });
  }

  // ===== FINALE SIBLING-REUNIFICATIE =====
  // Als siblings op verschillende Y-niveaus staan doordat de Y-diepte separatie
  // sommigen oversloeg (bijv. door partner-link), verplaats die naar hun siblings.
  // Dit draait als allerlaatste stap zodat centering/compactie niet verstoord worden.
  {
    // Bouw sibling-groepen per ouderpaar
    const sibGroupsByPK = {};
    state.relationships.forEach(r => {
      if ((r.type !== 'parent-child' && r.type !== 'social-parent') || !pos[r.childId]) return;
      if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
      const pids = state.relationships
        .filter(rel => (rel.type === 'parent-child' || rel.type === 'social-parent') && rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      if (!pids.length) return;
      const key = pids.join(',');
      if (!sibGroupsByPK[key]) sibGroupsByPK[key] = { parents: pids, children: new Set() };
      sibGroupsByPK[key].children.add(r.childId);
    });

    Object.values(sibGroupsByPK).forEach(({ parents, children }) => {
      const cids = [...children].filter(id => pos[id]);
      if (cids.length < 2) return;

      // Groepeer per Y-niveau (bucket NODE_H)
      const byY = {};
      cids.forEach(cid => {
        const y = pos[cid].y;
        let found = false;
        for (const bk of Object.keys(byY)) {
          if (Math.abs(y - Number(bk)) < NODE_H) { byY[bk].push(cid); found = true; break; }
        }
        if (!found) byY[y] = [cid];
      });
      const yLevels = Object.keys(byY).map(Number).sort((a, b) => a - b);
      if (yLevels.length < 2) return;

      // Majority Y = niveau met de meeste siblings
      let majYKey = yLevels[0], majCount = byY[yLevels[0]].length;
      yLevels.forEach(y => { if (byY[y].length > majCount) { majYKey = y; majCount = byY[y].length; } });
      const targetY = pos[byY[majYKey][0]].y;

      // Verschuif minority siblings
      yLevels.forEach(yKey => {
        if (yKey === majYKey) return;
        byY[yKey].forEach(cid => {
          const oldY = pos[cid].y;
          if (Math.abs(oldY - targetY) < 5) return; // al op juiste plek
          const dyShift = targetY - oldY;
          pos[cid].y = targetY;

          // X-positie: rechts van het rechtste sibling op doel-rij
          const sibsAtTarget = byY[majYKey].filter(sid => pos[sid]);
          sibsAtTarget.sort((a, b) => pos[a].x - pos[b].x);
          const lastSibX = pos[sibsAtTarget[sibsAtTarget.length - 1]].x;
          pos[cid].x = lastSibX + NODE_W + H_GAP;
          byY[majYKey].push(cid);

          // Verplaats inlaw-partners (zonder eigen ouders in layout) mee naast het sibling
          (partnersOf[cid] || []).forEach(pid => {
            if (!pos[pid]) return;
            const pidHasParents = (parentsOf[pid] || []).some(p => pos[p]);
            if (pidHasParents) return; // heeft eigen ouders, niet verplaatsen
            if (Math.abs(pos[pid].y - targetY) >= NODE_H) return; // niet op zelfde rij
            pos[pid].x = pos[cid].x + NODE_W + H_GAP;
          });

          // Verschuif adjacent partner-ghosts mee naast het kind
          // (Ghosts zijn al uit pos verwijderd → update crossFamilyGhosts)
          (ghostsAdjacentTo[cid] || []).forEach(gid => {
            const meta = ghostMeta[gid];
            if (!meta) return;
            const cfgKey = meta.personId + ':cg:' + meta.adjacentTo;
            const ghost = crossFamilyGhosts[cfgKey];
            if (ghost) {
              ghost.y = targetY;
              ghost.x = pos[cid].x + NODE_W + H_GAP;
            }
          });
        });
      });

      // Na verplaatsing: herorden siblings op birthOrder
      const allSibCids = [...children].filter(id => pos[id] && Math.abs(pos[id].y - targetY) < 5);
      if (allSibCids.length >= 2) {
        const hasBirthOrder = allSibCids.some(cid => {
          const p = state.persons.find(pp => pp.id === cid);
          return p && p.birthOrder;
        });
        if (hasBirthOrder) {
          // Check of huidige volgorde al overeenkomt met birthOrder
          const xSorted = [...allSibCids].sort((a, b) => pos[a].x - pos[b].x);
          const boSorted = [...allSibCids].sort((a, b) => {
            const pa = state.persons.find(p => p.id === a);
            const pb = state.persons.find(p => p.id === b);
            return (pa?.birthOrder || 999) - (pb?.birthOrder || 999);
          });
          const needsReorder = !xSorted.every((id, i) => id === boSorted[i]);

          if (needsReorder) {
            // Verzamel startX vanuit alle betrokken posities
            const allSlotXs = [];
            allSibCids.forEach(cid => {
              allSlotXs.push(pos[cid].x);
              (partnersOf[cid] || []).forEach(pid => {
                if (pos[pid] && Math.abs(pos[pid].y - targetY) < NODE_H &&
                    !(parentsOf[pid] || []).some(p => pos[p])) {
                  allSlotXs.push(pos[pid].x);
                }
              });
              (ghostsAdjacentTo[cid] || []).forEach(gid => {
                const gm = ghostMeta[gid];
                if (!gm) return;
                const gk = gm.personId + ':cg:' + gm.adjacentTo;
                const gg = crossFamilyGhosts[gk];
                if (gg && Math.abs(gg.y - targetY) < NODE_H) {
                  allSlotXs.push(gg.x);
                }
              });
            });
            const startX = Math.min(...allSlotXs);

            let curX = startX;
            boSorted.forEach(cid => {
              pos[cid].x = curX;
              curX += NODE_W + H_GAP;

              // Inlaw partners (zonder ouders) rechts naast het kind
              (partnersOf[cid] || []).forEach(pid => {
                if (!pos[pid]) return;
                if (Math.abs(pos[pid].y - targetY) >= NODE_H) return;
                if ((parentsOf[pid] || []).some(p => pos[p])) return;
                pos[pid].x = curX;
                pos[pid].y = targetY;
                curX += NODE_W + H_GAP;
              });

              // Ghosts rechts naast het kind (via crossFamilyGhosts)
              (ghostsAdjacentTo[cid] || []).forEach(gid => {
                const gm = ghostMeta[gid];
                if (!gm) return;
                const gk = gm.personId + ':cg:' + gm.adjacentTo;
                const gg = crossFamilyGhosts[gk];
                if (gg && Math.abs(gg.y - targetY) < NODE_H) {
                  gg.x = curX;
                  curX += NODE_W + H_GAP;
                }
              });
            });
          }
        }
      }
    });
  }

  // ===== FINALE GHOST-ADJACENTIE =====
  // Zorg dat cross-family ghosts op dezelfde Y staan als de persoon waar ze bij horen
  // (Ghosts zijn al uit pos verwijderd en staan nu in crossFamilyGhosts)
  {
    Object.entries(ghostsAdjacentTo).forEach(([personId, ghostIds]) => {
      if (!pos[personId]) return;
      const py = pos[personId].y;
      const px = pos[personId].x;

      ghostIds.forEach(gid => {
        const meta = ghostMeta[gid];
        if (!meta) return;
        const cfgKey = meta.personId + ':cg:' + meta.adjacentTo;
        const ghost = crossFamilyGhosts[cfgKey];
        if (!ghost) return;
        if (Math.abs(ghost.y - py) < NODE_H) return; // al op juiste Y

        const targetX = px + NODE_W + H_GAP;

        // Maak ruimte: verschuif echte nodes rechts van targetX op dezelfde Y-lijn
        Object.keys(pos).forEach(nid => {
          if (pos[nid] && Math.abs(pos[nid].y - py) < NODE_H / 2 && pos[nid].x >= targetX) {
            pos[nid].x += NODE_W + H_GAP;
          }
        });
        // Verschuif ook andere ghosts op dezelfde Y-lijn
        Object.keys(crossFamilyGhosts).forEach(k => {
          if (k === cfgKey) return;
          const og = crossFamilyGhosts[k];
          if (Math.abs(og.y - py) < NODE_H / 2 && og.x >= targetX) {
            og.x += NODE_W + H_GAP;
          }
        });

        ghost.y = py;
        ghost.x = targetX;
      });
    });
  }


  // ===== FINALE CHILDREN-Y-DISTRIBUTIE =====
  // Herpositioneer kindergroepen die te ver horizontaal van hun ouders staan
  // naar het eerste Y-niveau waarop ze passen, gecentreerd onder de ouders.
  {
    const YSTEP = NODE_H + V_GAP + 45; // 235px
    const MAX_CDIST = 4 * (NODE_W + H_GAP); // 920px

    // Bouw parent-paar → kinderen mapping
    const redistGrps = {};
    state.relationships.forEach(r => {
      if ((r.type !== 'parent-child' && r.type !== 'social-parent') || !pos[r.childId]) return;
      if (r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
      const pids = state.relationships
        .filter(rel => (rel.type === 'parent-child' || rel.type === 'social-parent') && rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      if (!pids.length) return;
      const key = pids.join(',');
      if (!redistGrps[key]) redistGrps[key] = { parents: pids, children: new Set() };
      redistGrps[key].children.add(r.childId);
    });

    const farGroups = Object.values(redistGrps)
      .map(g => {
        const cids = [...g.children].filter(id => pos[id]);
        if (!cids.length) return null;
        // Cross-family ouders op verschillende Y-niveaus: gebruik dichtstbijzijnde
        // ouder + ghost als center (niet het gemiddelde van de echte posities)
        let pCX;
        if (g.parents.length === 2 &&
            pos[g.parents[0]] && pos[g.parents[1]] &&
            Math.abs(pos[g.parents[0]].y - pos[g.parents[1]].y) > NODE_H) {
          const childY = Math.max(...cids.map(cid => pos[cid].y));
          const [p1, p2] = g.parents;
          const closerP = Math.abs(pos[p1].y - childY) < Math.abs(pos[p2].y - childY) ? p1 : p2;
          const fartherP = closerP === p1 ? p2 : p1;
          const ghostKey = fartherP + ':cg:' + closerP;
          const ghost = crossFamilyGhosts[ghostKey];
          if (ghost && ghost.x !== undefined) {
            pCX = (pos[closerP].x + NODE_W / 2 + ghost.x + NODE_W / 2) / 2;
          } else {
            pCX = pos[closerP].x + NODE_W / 2;
          }
        } else {
          pCX = g.parents.reduce((s, pid) => s + pos[pid].x + NODE_W / 2, 0) / g.parents.length;
        }
        const cCX = cids.reduce((s, cid) => s + pos[cid].x + NODE_W / 2, 0) / cids.length;
        // Skip als enig kind al dichtbij minstens 1 ouder staat (cross-family correct geplaatst)
        const anyChildClose = cids.some(cid => {
          const cx = pos[cid].x + NODE_W / 2;
          return g.parents.some(pid => Math.abs(cx - pos[pid].x - NODE_W / 2) <= MAX_CDIST);
        });
        if (anyChildClose) return null;
        return { parents: g.parents, cids, pCX, dist: Math.abs(cCX - pCX) };
      })
      .filter(g => g && g.dist > MAX_CDIST)
      .sort((a, b) => b.dist - a.dist);

    const movedChildren = new Set();

    farGroups.forEach(({ parents, cids, pCX }) => {
      const active = cids.filter(id => pos[id] && !movedChildren.has(id));
      if (!active.length) return;

      const curCCX = active.reduce((s, id) => s + pos[id].x + NODE_W / 2, 0) / active.length;
      if (Math.abs(curCCX - pCX) <= MAX_CDIST) return;
      const parentY = Math.min(...parents.map(pid => pos[pid].y));
      const curChildY = pos[active[0]].y;

      // Verzamel alles dat meeverhuist (kinderen, inlaws, afstammelingen)
      const willMove = new Set(active);
      active.forEach(cid => {
        (partnersOf[cid] || []).forEach(pid => {
          if (pos[pid] && Math.abs(pos[pid].y - curChildY) < NODE_H &&
              !(parentsOf[pid] || []).some(p => pos[p])) willMove.add(pid);
        });
      });
      const collectDesc = (id, vis) => {
        if (vis.has(id)) return;
        vis.add(id);
        (fullChildrenOf[id] || childrenOf[id] || []).forEach(c => {
          if (!pos[c] || willMove.has(c)) return;
          // Skip kinderen die ook een ouder hebben BUITEN willMove
          // (die kinderen horen bij de andere ouder, niet bij deze groep)
          const otherParent = (parentsOf[c] || []).some(pid =>
            pos[pid] && pid !== id && !willMove.has(pid) && !active.includes(pid));
          if (otherParent) return;
          willMove.add(c);
          collectDesc(c, vis);
        });
      };
      const descVis = new Set();
      active.forEach(c => collectDesc(c, descVis));
      // Inlaws van afstammelingen
      [...willMove].forEach(d => {
        if (active.includes(d)) return;
        (partnersOf[d] || []).forEach(pid => {
          if (pos[pid] && !willMove.has(pid) &&
              !(parentsOf[pid] || []).some(p => pos[p])) willMove.add(pid);
        });
      });

      // Breedte-berekening
      let slotCount = 0;
      active.forEach(cid => {
        slotCount++;
        (partnersOf[cid] || []).forEach(pid => {
          if (pos[pid] && Math.abs(pos[pid].y - curChildY) < NODE_H &&
              !(parentsOf[pid] || []).some(p => pos[p])) slotCount++;
        });
      });
      const needW = slotCount * (NODE_W + H_GAP);

      // Zoek eerste vrije Y — probeer gecentreerd, anders zoek vrij gat
      let targetY = null;
      let bestStartX = pCX - needW / 2;
      for (let py = parentY + YSTEP; py <= parentY + 15 * YSTEP; py += YSTEP) {
        // Verzamel bezette intervallen op dit Y-niveau
        const occupied = [];
        for (const nid of Object.keys(pos)) {
          if (willMove.has(nid) || !pos[nid]) continue;
          if (Math.abs(pos[nid].y - py) >= NODE_H) continue;
          occupied.push({ l: pos[nid].x - H_GAP, r: pos[nid].x + NODE_W + H_GAP });
        }
        // Check ook ghosts
        Object.values(crossFamilyGhosts).forEach(gh => {
          if (Math.abs(gh.y - py) >= NODE_H) return;
          occupied.push({ l: gh.x - H_GAP, r: gh.x + NODE_W + H_GAP });
        });
        occupied.sort((a, b) => a.l - b.l);

        // Merge overlappende intervallen
        const merged = [];
        occupied.forEach(o => {
          if (merged.length && o.l <= merged[merged.length - 1].r) {
            merged[merged.length - 1].r = Math.max(merged[merged.length - 1].r, o.r);
          } else {
            merged.push({ ...o });
          }
        });

        // Zoek vrije gaten waar needW in past
        const gaps = [];
        // Gat links van eerste bezetting
        if (!merged.length || merged[0].l >= PADDING + needW) {
          gaps.push({ l: PADDING, r: merged.length ? merged[0].l : Infinity });
        }
        // Gaten tussen bezettingen
        for (let i = 0; i < merged.length - 1; i++) {
          const gapW = merged[i + 1].l - merged[i].r;
          if (gapW >= needW) gaps.push({ l: merged[i].r, r: merged[i + 1].l });
        }
        // Gat rechts van laatste bezetting
        if (merged.length) {
          gaps.push({ l: merged[merged.length - 1].r, r: Infinity });
        } else {
          gaps.push({ l: PADDING, r: Infinity });
        }

        // Kies het gat dat het dichtst bij pCX ligt, maar max MAX_CDIST afstand
        let bestGap = null, bestDist = Infinity;
        gaps.forEach(gap => {
          let sx = pCX - needW / 2;
          if (sx < gap.l) sx = gap.l;
          if (sx + needW > gap.r) sx = gap.r - needW;
          if (sx < gap.l) return;
          const center = sx + needW / 2;
          const d = Math.abs(center - pCX);
          if (d > MAX_CDIST) return; // te ver van ouders
          if (d < bestDist) { bestDist = d; bestGap = gap; bestStartX = sx; }
        });

        if (bestGap) { targetY = py; break; }
      }

      if (!targetY) return;
      const dy = targetY - curChildY;

      // Sorteer op birthOrder
      active.sort((a, b) => {
        const pa = state.persons.find(p => p.id === a);
        const pb = state.persons.find(p => p.id === b);
        return (pa?.birthOrder || 999) - (pb?.birthOrder || 999);
      });

      // Plaats kinderen in het gevonden gat
      let cx = bestStartX;
      active.forEach(cid => {
        pos[cid].x = cx; pos[cid].y = targetY;
        cx += NODE_W + H_GAP;
        (partnersOf[cid] || []).forEach(pid => {
          if (!pos[pid] || (parentsOf[pid] || []).some(p => pos[p])) return;
          if (Math.abs(pos[pid].y - curChildY) >= NODE_H) return;
          pos[pid].x = cx; pos[pid].y = targetY;
          cx += NODE_W + H_GAP;
        });
        movedChildren.add(cid);
      });

      // Cascade afstammelingen Y
      willMove.forEach(d => {
        if (active.includes(d)) return;
        if (pos[d]) pos[d].y += dy;
      });

      // Ghosts van verplaatste personen
      const activeSet = new Set(active);
      willMove.forEach(mid => {
        (ghostsAdjacentTo[mid] || []).forEach(gid => {
          const gm = ghostMeta[gid];
          if (!gm) return;
          const gk = gm.personId + ':cg:' + gm.adjacentTo;
          const gh = crossFamilyGhosts[gk];
          if (!gh) return;
          if (activeSet.has(mid)) {
            gh.x = pos[mid].x + NODE_W + H_GAP;
            gh.y = pos[mid].y;
          } else {
            gh.y += dy;
          }
        });
      });
    });

    // Post-redistributie compactie: gebruik bestaande scanline
    for (let cp = 0; cp < 3; cp++) {
      const allIds = Object.keys(pos).filter(id => pos[id]);
      if (!allIds.length) break;
      const mxX = Math.max(...allIds.map(id => pos[id].x + NODE_W));
      const scanStep = 30;
      let shifted = false;

      for (let sx = PADDING + scanStep; sx < mxX; sx += scanStep) {
        let minG = Infinity, hL = false, hR = false;
        gens.forEach(gen => {
          const members = (byGen[gen] || []).filter(id => pos[id]);
          let mR = -Infinity, mL = Infinity;
          members.forEach(id => {
            const l = pos[id].x, r = l + NODE_W;
            if (r <= sx) { mR = Math.max(mR, r); hL = true; }
            else if (l >= sx) { mL = Math.min(mL, l); hR = true; }
            else minG = 0;
          });
          if (mR > -Infinity && mL < Infinity) minG = Math.min(minG, mL - mR);
        });
        if (!hL || !hR || minG <= H_GAP) continue;
        const sh = minG - H_GAP;
        if (sh < 2) continue;
        if (familyAwareScanShift(sx, sh)) { shifted = true; }
      }
      if (!shifted) break;
    }

    // Ghost-adjacentie fixup na compactie
    Object.entries(ghostsAdjacentTo).forEach(([personId, gids]) => {
      if (!pos[personId]) return;
      gids.forEach(gid => {
        const gm = ghostMeta[gid];
        if (!gm) return;
        const gk = gm.personId + ':cg:' + gm.adjacentTo;
        const gh = crossFamilyGhosts[gk];
        if (!gh) return;
        gh.y = pos[personId].y;
        gh.x = pos[personId].x + NODE_W + H_GAP;
      });
    });

    resolveOverlaps(pos, verticalGroupMap);
  }


  // ===== FINALE CHILD-Y-PROXIMITY =====
  // Kinderen die >1.2 YSTEP onder hun ouders staan → verplaats omhoog als er ruimte is
  {
    const YSTEP = NODE_H + V_GAP + 45; // 235px
    const cyGrps = {};
    state.relationships.forEach(r => {
      if ((r.type !== 'parent-child' && r.type !== 'social-parent') || !pos[r.childId]) return;
      if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
      const pids = state.relationships
        .filter(rel => (rel.type === 'parent-child' || rel.type === 'social-parent') && rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      if (!pids.length) return;
      const key = pids.join(',');
      if (!cyGrps[key]) cyGrps[key] = { parents: pids, children: new Set() };
      cyGrps[key].children.add(r.childId);
    });

    Object.values(cyGrps).forEach(({ parents, children }) => {
      const cids = [...children].filter(id => pos[id]);
      if (!cids.length) return;
      const minPY = Math.min(...parents.map(pid => pos[pid].y));
      const idealY = minPY + YSTEP;
      const toFix = cids.filter(cid => pos[cid].y - idealY > YSTEP * 1.2);
      if (!toFix.length) return;

      const pCX = parents.reduce((s, pid) => s + pos[pid].x + NODE_W / 2, 0) / parents.length;

      const slots = [];
      toFix.forEach(cid => {
        slots.push({ id: cid, type: 'child' });
        (partnersOf[cid] || []).forEach(pid => {
          if (pos[pid] && !(parentsOf[pid] || []).some(p => pos[p])) {
            slots.push({ id: pid, type: 'inlaw' });
          }
        });
      });

      const needW = slots.length * (NODE_W + H_GAP);
      const startX = pCX - needW / 2;

      let hasRoom = true;
      for (const nid of Object.keys(pos)) {
        if (toFix.includes(nid) || slots.some(s => s.id === nid) || !pos[nid]) continue;
        if (Math.abs(pos[nid].y - idealY) >= NODE_H) continue;
        if (pos[nid].x + NODE_W > startX - H_GAP && pos[nid].x < startX + needW + H_GAP) {
          hasRoom = false; break;
        }
      }
      if (!hasRoom) return;

      const oldY = pos[toFix[0]].y;
      const dy = idealY - oldY;
      let cx = startX;
      slots.forEach(({ id }) => {
        pos[id].x = cx;
        pos[id].y = idealY;
        cx += NODE_W + H_GAP;
      });

      // Cascade afstammelingen Y
      const slotsSet = new Set(slots.map(s => s.id));
      const cascadeDescY = (id, visited) => {
        if (visited.has(id)) return;
        visited.add(id);
        (fullChildrenOf[id] || childrenOf[id] || []).forEach(c => {
          if (pos[c] && !slotsSet.has(c)) {
            pos[c].y += dy;
            cascadeDescY(c, visited);
            (partnersOf[c] || []).forEach(p => {
              if (pos[p] && !slotsSet.has(p) && !visited.has(p) &&
                  !(parentsOf[p] || []).some(pp => pos[pp])) {
                pos[p].y += dy;
                visited.add(p);
              }
            });
          }
        });
      };
      toFix.forEach(cid => cascadeDescY(cid, new Set()));

      // Ghosts van verplaatste personen
      slotsSet.forEach(mid => {
        (ghostsAdjacentTo[mid] || []).forEach(gid => {
          const gm = ghostMeta[gid];
          if (!gm) return;
          const gk = gm.personId + ':cg:' + gm.adjacentTo;
          const gh = crossFamilyGhosts[gk];
          if (gh) { gh.y = pos[mid].y; gh.x = pos[mid].x + NODE_W + H_GAP; }
        });
      });
    });

    resolveOverlaps(pos, verticalGroupMap);
  }

  // ===== FINALE PARTNER-ADJACENTIE =====
  // Na alle verplaatsingen: controleer dat inlaw-partners naast hun echtgenoot staan
  {
    Object.keys(pos).forEach(id => {
      (partnersOf[id] || []).forEach(pid => {
        if (!pos[pid]) return;
        const pidHasParents = (parentsOf[pid] || []).some(p => pos[p]);
        const idHasParents = (parentsOf[id] || []).some(p => pos[p]);
        const sameY = Math.abs(pos[id].y - pos[pid].y) < NODE_H;

        if (sameY) {
          const dist = Math.abs(pos[id].x - pos[pid].x);
          if (dist <= NODE_W + H_GAP + 5) return; // al naast elkaar
        }

        // Verplaats inlaw (zonder ouders) naar partner met ouders
        // Maak ruimte als de doelpositie bezet is
        const placeNextTo = (targetId, movingId) => {
          const tx = pos[targetId].x + NODE_W + H_GAP;
          const ty = pos[targetId].y;
          // Verschuif bestaande nodes op dezelfde Y die in de weg staan
          Object.keys(pos).forEach(nid => {
            if (nid === movingId || nid === targetId || !pos[nid]) return;
            if (Math.abs(pos[nid].y - ty) >= NODE_H) return;
            if (pos[nid].x >= tx && pos[nid].x < tx + NODE_W) {
              const shift = tx + NODE_W + H_GAP - pos[nid].x;
              // Verschuif deze node en alles rechts ervan
              Object.keys(pos).forEach(sid => {
                if (pos[sid] && Math.abs(pos[sid].y - ty) < NODE_H && pos[sid].x >= pos[nid].x && sid !== targetId && sid !== movingId) {
                  pos[sid].x += shift;
                }
              });
            }
          });
          pos[movingId].x = tx;
          pos[movingId].y = ty;
        };

        if (!pidHasParents && idHasParents) {
          placeNextTo(id, pid);
        } else if (!idHasParents && pidHasParents) {
          placeNextTo(pid, id);
        }
      });
    });

    // Na partner-verplaatsing: herpositioneer ver-afgelegen kinderen
    const YSTEP = NODE_H + V_GAP + 45;
    Object.keys(pos).forEach(id => {
      const cids = (fullChildrenOf[id] || childrenOf[id] || []).filter(cid => pos[cid]);
      if (!cids.length) return;
      const partner = (partnersOf[id] || []).find(pid =>
        pos[pid] && Math.abs(pos[pid].y - pos[id].y) < NODE_H);
      if (!partner) return;
      const pCX = (pos[id].x + pos[partner].x + NODE_W) / 2;
      const childY = pos[id].y + YSTEP;
      const farChildren = cids.filter(cid =>
        Math.abs(pos[cid].x + NODE_W / 2 - pCX) > 4 * (NODE_W + H_GAP) &&
        Math.abs(pos[cid].y - childY) < NODE_H);
      if (!farChildren.length) return;

      const slots = [];
      farChildren.forEach(cid => {
        slots.push(cid);
        (partnersOf[cid] || []).forEach(pid => {
          if (pos[pid] && !(parentsOf[pid] || []).some(p => pos[p]) &&
              Math.abs(pos[pid].y - pos[cid].y) < NODE_H) slots.push(pid);
        });
      });
      const needW = slots.length * (NODE_W + H_GAP);
      const sx = pCX - needW / 2;
      let ok = true;
      for (const nid of Object.keys(pos)) {
        if (slots.includes(nid) || !pos[nid]) continue;
        if (Math.abs(pos[nid].y - childY) >= NODE_H) continue;
        if (pos[nid].x + NODE_W > sx - H_GAP && pos[nid].x < sx + needW + H_GAP) { ok = false; break; }
      }
      if (!ok) return;
      let cx = sx;
      slots.forEach(sid => { pos[sid].x = cx; pos[sid].y = childY; cx += NODE_W + H_GAP; });
    });

    // Overlap-resolutie na partner- en kind-verplaatsingen
    resolveOverlaps(pos, verticalGroupMap);
  }

  // ===== FINALE SIBLING-GAP-SLUITING =====
  // Sluit onnodige gaten tussen siblings door hele subtrees te verschuiven.
  // De scanline-compactie kan dit niet omdat kinderen de scan-lijn kruisen.
  {
    // Bouw parent-paar → kinderen mapping
    const sibGrps = {};
    state.relationships.forEach(r => {
      if ((r.type !== 'parent-child' && r.type !== 'social-parent') || !pos[r.childId]) return;
      const pids = state.relationships
        .filter(rel => (rel.type === 'parent-child' || rel.type === 'social-parent') && rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      if (!pids.length) return;
      const key = pids.join(',');
      if (!sibGrps[key]) sibGrps[key] = { parents: pids, children: new Set() };
      sibGrps[key].children.add(r.childId);
    });

    Object.values(sibGrps).forEach(({ parents, children }) => {
      const cids = [...children].filter(id => pos[id]);
      if (cids.length < 2) return;
      cids.sort((a, b) => pos[a].x - pos[b].x);

      let restarts = 0;
      const MAX_RESTARTS = cids.length * 3;
      for (let i = 0; i < cids.length - 1; i++) {
        const lid = cids[i], rid = cids[i + 1];
        const gap = pos[rid].x - pos[lid].x - NODE_W;
        if (gap <= H_GAP + 5) continue;

        // Bouw RIGHT set: rid + alle siblings rechts + al hun afstammelingen + inlaws
        const rightSet = new Set();
        const collectTree = (id) => {
          if (rightSet.has(id)) return;
          rightSet.add(id);
          (fullChildrenOf[id] || childrenOf[id] || []).forEach(c => {
            if (pos[c]) collectTree(c);
          });
          (partnersOf[id] || []).forEach(pid => {
            if (pos[pid] && !rightSet.has(pid) && !(parentsOf[pid] || []).some(p => pos[p])) {
              rightSet.add(pid);
              collectTree(pid);
            }
          });
        };
        for (let j = i + 1; j < cids.length; j++) {
          collectTree(cids[j]);
          (partnersOf[cids[j]] || []).forEach(pid => {
            if (pos[pid] && !(parentsOf[pid] || []).some(p => pos[p])) {
              rightSet.add(pid);
              collectTree(pid);
            }
          });
        }
        // Ouders NIET toevoegen aan rightSet - ze staan vaak tussen siblings
        // en hun partner-adjacentie zou de shift blokkeren

        // Vind minimum gap tussen LEFT-nodes en RIGHT-nodes op gelijke Y-niveaus
        let minGap = Infinity;
        rightSet.forEach(rid2 => {
          if (!pos[rid2]) return;
          const ry = pos[rid2].y, rl = pos[rid2].x;
          Object.keys(pos).forEach(lid2 => {
            if (rightSet.has(lid2) || !pos[lid2]) return;
            if (Math.abs(pos[lid2].y - ry) >= NODE_H) return;
            const lr = pos[lid2].x + NODE_W;
            if (lr <= rl) minGap = Math.min(minGap, rl - lr);
          });
        });

        if (minGap <= H_GAP || !isFinite(minGap)) continue;
        const shift = minGap - H_GAP;

        // Verschuif RIGHT set
        rightSet.forEach(id => { pos[id].x -= shift; });
        // Update ghost-posities
        rightSet.forEach(mid => {
          (ghostsAdjacentTo[mid] || []).forEach(gid => {
            const gm = ghostMeta[gid];
            if (!gm) return;
            const gk = gm.personId + ':cg:' + gm.adjacentTo;
            const gh = crossFamilyGhosts[gk];
            if (gh) { gh.x = pos[mid].x + NODE_W + H_GAP; gh.y = pos[mid].y; }
          });
        });
        // Update cids posities voor volgende iteratie
        cids.sort((a, b) => pos[a].x - pos[b].x);
        restarts++;
        if (restarts >= MAX_RESTARTS) break;
        i = -1; // Herstart loop (posities zijn veranderd)
      }
    });

    resolveOverlaps(pos, verticalGroupMap);
  }

  // ===== FINALE Y-LEVEL GAP-SLUITING =====
  // Sluit gaten tussen niet-sibling nodes op dezelfde Y-niveaus (bijv. Jamal→Bader, Golgotai→Azghar)
  {
    const yLevels = {};
    Object.keys(pos).forEach(id => {
      const y = pos[id].y;
      if (!yLevels[y]) yLevels[y] = [];
      yLevels[y].push(id);
    });

    // Process top Y-levels first (ouders voor kinderen)
    const sortedYs = Object.keys(yLevels).map(Number).sort((a, b) => a - b);
    let totalPasses = 0;
    const MAX_PASSES = 20;

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let anyShift = false;

      for (const y of sortedYs) {
        const nodes = yLevels[y].filter(id => pos[id] && Math.abs(pos[id].y - y) < 1);
        if (nodes.length < 2) continue;
        nodes.sort((a, b) => pos[a].x - pos[b].x);

        for (let i = 0; i < nodes.length - 1; i++) {
          const lid = nodes[i], rid = nodes[i + 1];
          const gap = pos[rid].x - pos[lid].x - NODE_W;
          if (gap <= H_GAP + 5) continue;

          // Bouw connected component vanuit rid (nakomelingen + inlaw-partners)
          const rightSet = new Set();
          const collectRight = (id) => {
            if (rightSet.has(id)) return;
            rightSet.add(id);
            (fullChildrenOf[id] || childrenOf[id] || []).forEach(c => {
              if (pos[c]) collectRight(c);
            });
            (partnersOf[id] || []).forEach(pid => {
              if (pos[pid] && !rightSet.has(pid) && !(parentsOf[pid] || []).some(p => pos[p] && !rightSet.has(p))) {
                rightSet.add(pid);
                collectRight(pid);
              }
            });
          };

          // Verzamel alle nodes rechts van het gat op dit Y-level + hun subtrees
          for (let j = i + 1; j < nodes.length; j++) {
            collectRight(nodes[j]);
          }

          // Vind minimum gap
          let minGap = Infinity;
          rightSet.forEach(rid2 => {
            if (!pos[rid2]) return;
            const ry = pos[rid2].y, rl = pos[rid2].x;
            Object.keys(pos).forEach(lid2 => {
              if (rightSet.has(lid2) || !pos[lid2]) return;
              if (Math.abs(pos[lid2].y - ry) >= NODE_H) return;
              const lr = pos[lid2].x + NODE_W;
              if (lr <= rl) minGap = Math.min(minGap, rl - lr);
            });
          });

          if (minGap <= H_GAP || !isFinite(minGap)) continue;
          const shift = minGap - H_GAP;
          rightSet.forEach(id => { pos[id].x -= shift; });

          // Update ghosts
          rightSet.forEach(mid => {
            (ghostsAdjacentTo[mid] || []).forEach(gid => {
              const gm = ghostMeta[gid];
              if (!gm) return;
              const gk = gm.personId + ':cg:' + gm.adjacentTo;
              const gh = crossFamilyGhosts[gk];
              if (gh) { gh.x = pos[mid].x + NODE_W + H_GAP; gh.y = pos[mid].y; }
            });
          });
          anyShift = true;
        }
      }
      if (!anyShift) break;
      totalPasses++;
    }
    if (totalPasses > 0) resolveOverlaps(pos, verticalGroupMap);
  }

  // ===== FINALE POST-GAP CENTERING =====
  // Na gap-sluiting: hercentreer ouders boven hun kinderen.
  // Multi-partner personen worden NIET verschoven (ze zitten in meerdere groepen
  // die tegengestelde richtingen trekken).
  {
    // Detecteer personen met 2+ partners in de layout
    const multiPartnerIds = new Set();
    Object.keys(pos).forEach(id => {
      const partners = (partnersOf[id] || []).filter(pid => pos[pid]);
      if (partners.length >= 2) multiPartnerIds.add(id);
    });

    const pgcGrps = {};
    state.relationships.forEach(r => {
      if ((r.type !== 'parent-child' && r.type !== 'social-parent') || !pos[r.childId]) return;
      if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
      const pids = state.relationships
        .filter(rel => (rel.type === 'parent-child' || rel.type === 'social-parent') && rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      if (!pids.length) return;
      const key = pids.join(',');
      if (!pgcGrps[key]) pgcGrps[key] = { parents: pids, children: new Set() };
      pgcGrps[key].children.add(r.childId);
    });

    for (let pass = 0; pass < 3; pass++) {
      let anyShift = false;
      Object.values(pgcGrps).forEach(({ parents, children }) => {
        const cids = [...children].filter(id => pos[id]);
        if (!cids.length || parents.length < 2) return;
        if (!parents.every(pid => pos[pid])) return;
        const parentYs = parents.map(pid => pos[pid].y);
        if (Math.max(...parentYs) - Math.min(...parentYs) > NODE_H) return;
        const activeCids = cids.filter(cid =>
          !crossFamilyChildAnchor[cid] || parents.includes(crossFamilyChildAnchor[cid]));
        if (!activeCids.length) return;

        const childXs = activeCids.map(cid => pos[cid].x + NODE_W / 2);
        const childCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2;
        const parentXs = parents.map(pid => pos[pid].x);
        const parentCenter = (Math.min(...parentXs) + Math.max(...parentXs) + NODE_W) / 2;
        const rawDx = childCenter - parentCenter;
        const maxCenterDx = 2 * (NODE_W + H_GAP);
        const dx = Math.max(-maxCenterDx, Math.min(maxCenterDx, rawDx));

        if (Math.abs(dx) <= 5) return;
        anyShift = true;

        // Verschuif ouders — maar NIET multi-partner personen
        parents.forEach(pid => {
          if (multiPartnerIds.has(pid)) return;
          pos[pid].x += dx;
          (ghostsAdjacentTo[pid] || []).forEach(gid => {
            if (pos[gid]) pos[gid].x += dx;
          });
        });
      });
      if (!anyShift) break;
    }
    resolveOverlaps(pos, verticalGroupMap);
  }

  // ===== FINALE BIRTH ORDER CORRECTIE =====
  // Na alle FINALE stappen (gap-sluiting, centering) kan de geboorte-volgorde
  // van siblings verstoord zijn. Herstel door units (sibling + partner) te swappen.
  {
    const sibGroups = {};
    Object.keys(pos).forEach(id => {
      const person = getPerson(id);
      if (!person) return;
      const ps = (parentsOf[id] || []).filter(pid => pos[pid]).sort();
      if (!ps.length) return;
      const key = ps.join(',');
      if (!sibGroups[key]) sibGroups[key] = [];
      if (!sibGroups[key].includes(id)) sibGroups[key].push(id);
    });

    Object.values(sibGroups).forEach(siblings => {
      if (siblings.length < 2) return;
      const hasBirthOrder = siblings.some(id => {
        const p = getPerson(id);
        return p?.birthOrder != null ||
          (socialChildIds.has(id) && p?.socialBirthOrder != null);
      });
      if (!hasBirthOrder) return;

      const currentOrder = [...siblings].sort((a, b) => pos[a].x - pos[b].x);
      const desiredOrder = [...siblings].sort((a, b) => {
        const personA = getPerson(a), personB = getPerson(b);
        const isSocA = socialChildIds.has(a);
        const isSocB = socialChildIds.has(b);
        const boA = (isSocA && personA?.socialBirthOrder != null)
          ? personA.socialBirthOrder : personA?.birthOrder;
        const boB = (isSocB && personB?.socialBirthOrder != null)
          ? personB.socialBirthOrder : personB?.birthOrder;
        if (boA != null && boB != null) return boA - boB;
        if (boA != null) return -1;
        if (boB != null) return 1;
        const pa = parseBirthdate(personA?.birthdate);
        const pb = parseBirthdate(personB?.birthdate);
        if (!pa && !pb) return 0;
        if (!pa) return 1;
        if (!pb) return -1;
        if (pa.year !== pb.year) return pa.year - pb.year;
        if (pa.month && pb.month && pa.month !== pb.month) return pa.month - pb.month;
        if (pa.day && pb.day) return pa.day - pb.day;
        return 0;
      });
      if (desiredOrder.every((id, i) => id === currentOrder[i])) return;

      // Bouw blokken: sibling + same-Y partner(s) + adjacente ghosts
      // Elk blok wordt als geheel geplaatst zodat partners adjacent blijven
      const sibY = pos[siblings[0]]?.y;
      const blocks = {};
      siblings.forEach(id => {
        const partners = (partnersOf[id] || []).filter(pid =>
          pos[pid] && Math.abs(pos[pid].y - sibY) < NODE_H
        );
        const ghostPartners = [];
        (ghostsAdjacentTo[id] || []).forEach(gid => {
          if (pos[gid] && !partners.includes(gid)) ghostPartners.push(gid);
        });
        // Sibling altijd eerst, dan partners (geplaatst als adjacent blok)
        blocks[id] = [id, ...partners, ...ghostPartners];
      });

      // Startpositie = linkerkant van het meest linkse blok in huidige volgorde
      const allBlockMembers = currentOrder.flatMap(id => blocks[id]);
      const startX = Math.min(...allBlockMembers.filter(uid => pos[uid]).map(uid => pos[uid].x));

      // Plaats blokken sequentieel in gewenste volgorde
      shiftedInlaws = new Set();
      let curX = startX;
      desiredOrder.forEach(id => {
        const block = blocks[id];
        const oldMinX = Math.min(...block.map(uid => pos[uid].x));
        // Plaats elk blok-lid opeenvolgend
        block.forEach((uid, j) => {
          const newX = curX + j * (NODE_W + H_GAP);
          const dx = newX - pos[uid].x;
          if (Math.abs(dx) > 0.5) {
            pos[uid].x = newX;
          }
        });
        // Cascade naar nakomelingen: verschil t.o.v. oorspronkelijke positie
        const dx = curX - oldMinX;
        if (Math.abs(dx) > 0.5) {
          (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid => {
            if (crossFamilyChildAnchor[cid] && crossFamilyChildAnchor[cid] !== id) return;
            if (pos[cid]) shiftWithDescendants(cid, dx);
          });
        }
        curX += block.length * (NODE_W + H_GAP);
      });
    });
    resolveOverlaps(pos, verticalGroupMap);
  }

  // ===== MULTI-PARTNER LAYOUT =====
  // Personen met 2+ partners: forceer adjacentie [P_links][Persoon][P_rechts].
  // Positie berekend om kinderen-groepen gelijkmatig te centreren.
  // Kinderen blijven op hun huidige plek; alleen ouders worden verplaatst.
  {
    const step = NODE_W + H_GAP; // 230px
    const pcRels = state.relationships.filter(r => r.type === 'parent-child' || r.type === 'social-parent');
    const processed = new Set();

    Object.keys(pos).forEach(mId => {
      if (processed.has(mId)) return;
      const allPartners = (partnersOf[mId] || []).filter(pid => pos[pid]);
      if (allPartners.length < 2) return;
      processed.add(mId);
      allPartners.forEach(pid => processed.add(pid));

      // Vind gedeelde kinderen per partner-paar
      const mChildSet = new Set(pcRels.filter(r => r.parentId === mId).map(r => r.childId));

      const groups = allPartners.map(pId => {
        const pChildSet = new Set(pcRels.filter(r => r.parentId === pId).map(r => r.childId));
        const shared = [...mChildSet].filter(cid => pChildSet.has(cid) && pos[cid]);
        let centerX;
        if (shared.length > 0) {
          const xs = shared.map(cid => pos[cid].x);
          centerX = (Math.min(...xs) + Math.max(...xs) + NODE_W) / 2;
        } else {
          centerX = pos[pId].x + NODE_W / 2;
        }
        return { partnerId: pId, children: shared, centerX };
      });

      // Sorteer op children center X (links → rechts)
      groups.sort((a, b) => a.centerX - b.centerX);

      // Optimale M-positie: gelijke offset voor beide kinderen-groepen
      // left pair center = M.x - 25, right pair center = M.x + 205
      // → M.x = (leftCenter + rightCenter - NODE_W) / 2
      const leftCenter = groups[0].centerX;
      const rightCenter = groups[groups.length - 1].centerX;
      const newMX = Math.round((leftCenter + rightCenter - NODE_W) / 2);

      // Herpositioneer M en partners
      pos[mId].x = newMX;
      groups.forEach((g, i) => {
        if (i === 0) {
          pos[g.partnerId].x = newMX - step; // links van M
        } else {
          pos[g.partnerId].x = newMX + i * step; // rechts van M
        }
        pos[g.partnerId].y = pos[mId].y;
      });
    });

    resolveOverlaps(pos, verticalGroupMap);
  }

  // ===== FINALE GHOST ADJACENCY =====
  // Ghost MOET ALTIJD direct naast adjacentTo staan. Geen uitzonderingen.
  // Als de adjacente positie bezet is, MAAK RUIMTE door pos-nodes te verschuiven.
  // Ghost wordt NOOIT verplaatst naar een niet-adjacente positie.
  {
    const step = NODE_W + H_GAP; // 230px

    Object.entries(crossFamilyGhosts).forEach(([key, g]) => {
      const adjId = g.adjacentTo;
      const adj = pos[adjId];
      if (!adj) return;

      const adjX = adj.x;
      const adjY = adj.y;
      const rightX = adjX + step;
      const leftX = adjX - step;

      // Check of adjacente slots bezet zijn door pos-entries
      const isOccupiedByPos = (tx, ty) =>
        Object.keys(pos).some(id =>
          Math.abs(pos[id].y - ty) < NODE_H && Math.abs(pos[id].x - tx) < NODE_W);

      const rightBusy = isOccupiedByPos(rightX, adjY);

      if (!rightBusy) {
        // Rechts vrij → ghost rechts (standaardregel: partner altijd RECHTS)
        g.x = rightX; g.y = adjY;
      } else {
        // Rechts bezet → MAAK RUIMTE rechts (partner ALTIJD rechts van kind)
        const sameYids = Object.keys(pos).filter(id =>
          id !== adjId && Math.abs(pos[id].y - adjY) < NODE_H);

        shiftedInlaws = new Set();
        sameYids
          .filter(id => pos[id].x >= rightX - 1)
          .sort((a, b) => pos[b].x - pos[a].x)
          .forEach(id => {
            pos[id].x += step;
            (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid => {
              if (crossFamilyChildAnchor[cid] && crossFamilyChildAnchor[cid] !== id) return;
              if (pos[cid]) shiftWithDescendants(cid, step);
            });
          });
        // Verschuif ook andere ghosts in het verschoven gebied
        Object.entries(crossFamilyGhosts).forEach(([k2, g2]) => {
          if (k2 === key) return;
          if (Math.abs(g2.y - adjY) < NODE_H && g2.x >= rightX - 1) g2.x += step;
        });
        g.x = rightX; g.y = adjY;
      }
    });

    // Ghost-ghost overlap: als twee ghosts overlappen,
    // maak ruimte zodat beide RECHTS van hun partner staan
    const gEntries = Object.entries(crossFamilyGhosts);
    for (let i = 0; i < gEntries.length; i++) {
      for (let j = i + 1; j < gEntries.length; j++) {
        const [k1, g1] = gEntries[i];
        const [k2, g2] = gEntries[j];
        if (Math.abs(g1.x - g2.x) < NODE_W && Math.abs(g1.y - g2.y) < NODE_H) {
          const adj2 = pos[g2.adjacentTo];
          if (!adj2) continue;
          // Partner altijd rechts: verschuif g2 verder naar rechts
          const newRightX = adj2.x + step;
          if (Math.abs(newRightX - g1.x) < NODE_W) {
            // Nog steeds overlap → verschuif 2 posities rechts
            g2.x = adj2.x + 2 * step;
          } else {
            g2.x = newRightX;
          }
          g2.y = adj2.y;
        }
      }
    }

    resolveOverlaps(pos, verticalGroupMap);

    // FINAL GHOST SNAP — garanteer dat elke ghost EXACT naast zijn partner staat.
    // resolveOverlaps kan pos-nodes verplaatst hebben, waardoor ghost niet meer
    // adjacent is. Snap alle ghosts naar adj.x ± step.
    // Check of de snap-positie bezet is door een pos-entry; zo ja, probeer andere kant.
    // Als beide bezet: maak ruimte door pos-nodes te verschuiven.
    const isOccupiedFinal = (tx, ty, ignoreGhostKey) =>
      Object.keys(pos).some(id =>
        Math.abs(pos[id].y - ty) < NODE_H && Math.abs(pos[id].x - tx) < NODE_W) ||
      Object.entries(crossFamilyGhosts).some(([k, g2]) =>
        k !== ignoreGhostKey && Math.abs(g2.y - ty) < NODE_H && Math.abs(g2.x - tx) < NODE_W);

    Object.entries(crossFamilyGhosts).forEach(([key, g]) => {
      const adj = pos[g.adjacentTo];
      if (!adj) return;
      // Partner altijd RECHTS van kind
      const rightX = adj.x + step;

      if (!isOccupiedFinal(rightX, adj.y, key)) {
        g.x = rightX; g.y = adj.y;
      } else {
        // Rechts bezet — maak ruimte rechts (partner ALTIJD rechts)
        const insertX = rightX;
        Object.keys(pos).forEach(nid => {
          if (pos[nid] && Math.abs(pos[nid].y - adj.y) < NODE_H && pos[nid].x >= insertX - 1) {
            pos[nid].x += step;
          }
        });
        Object.entries(crossFamilyGhosts).forEach(([k2, g2]) => {
          if (k2 !== key && Math.abs(g2.y - adj.y) < NODE_H && g2.x >= insertX - 1) {
            g2.x += step;
          }
        });
        g.x = insertX; g.y = adj.y;
      }
    });
  }


  // ===== FINALE CHILDREN-UNDER-PARENTS =====
  // Verschuif kinderen-groepen zodat ze gecentreerd staan onder hun ouder-paar.
  // ALLEEN voor groepen waar alle kinderen leaf-nodes zijn (geen eigen kinderen).
  // Per Y-niveau van rechts naar links (zodat rechtse shifts eerst plaatsvinden).
  {
    const cupPcRels = state.relationships.filter(r => r.type === 'parent-child' || r.type === 'social-parent');

    // Bouw parent-paar groepen
    const cupGroups = {};
    cupPcRels.forEach(r => {
      if (!pos[r.childId]) return;
      if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
      const pids = cupPcRels
        .filter(rel => rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      if (pids.length < 2) return;
      if (!pids.every(p => pos[p])) return;
      const pYs = pids.map(p => pos[p].y);
      if (Math.max(...pYs) - Math.min(...pYs) > NODE_H) return;

      const key = pids.join(',');
      if (!cupGroups[key]) cupGroups[key] = { parents: pids, children: new Set() };
      cupGroups[key].children.add(r.childId);
    });

    // Sorteer: per Y-niveau, rechts → links
    const cupSorted = Object.values(cupGroups).sort((a, b) => {
      const ay = Math.min(...a.parents.map(p => pos[p].y));
      const by = Math.min(...b.parents.map(p => pos[p].y));
      if (ay !== by) return ay - by;
      const aCx = a.parents.reduce((s, p) => s + pos[p].x, 0) / a.parents.length;
      const bCx = b.parents.reduce((s, p) => s + pos[p].x, 0) / b.parents.length;
      return bCx - aCx; // rechts eerst
    });

    cupSorted.forEach(({ parents, children }) => {
      const cids = [...children].filter(id => pos[id]);
      if (!cids.length) return;

      // LEAF CHECK: alle kinderen moeten leaf-nodes zijn
      const allLeaf = cids.every(cid =>
        !cupPcRels.some(r => r.parentId === cid && pos[r.childId]));
      if (!allLeaf) return;

      // Bouw unit: kinderen + hun inlaw partners op dezelfde Y
      const childY = pos[cids[0]].y;
      const unit = new Set();
      cids.forEach(cid => {
        unit.add(cid);
        (partnersOf[cid] || []).forEach(pid => {
          if (pos[pid] && !cids.includes(pid) && Math.abs(pos[pid].y - childY) < NODE_H) {
            unit.add(pid);
          }
        });
      });
      const unitArr = [...unit];

      // Parent pair center
      const pXs = parents.map(p => pos[p].x);
      const parentCenter = (Math.min(...pXs) + Math.max(...pXs) + NODE_W) / 2;

      // Children unit center
      const uXs = unitArr.map(u => pos[u].x);
      const unitCenter = (Math.min(...uXs) + Math.max(...uXs) + NODE_W) / 2;

      const dx = parentCenter - unitCenter;
      if (Math.abs(dx) < NODE_W / 2) return; // al dichtbij genoeg

      // Per-node overlap check na verschuiving
      const otherNodes = Object.keys(pos).filter(id =>
        !unit.has(id) && pos[id] && Math.abs(pos[id].y - childY) < NODE_H);

      let wouldOverlap = false;
      unitArr.forEach(uid => {
        const newX = pos[uid].x + dx;
        otherNodes.forEach(nid => {
          if (Math.abs(pos[nid].x - newX) < NODE_W + H_GAP - 5) wouldOverlap = true;
        });
      });

      if (wouldOverlap) return;

      // Verschuif alleen pos (leaf-nodes, geen nakomelingen)
      unitArr.forEach(uid => {
        pos[uid].x += dx;
      });
    });

    resolveOverlaps(pos, verticalGroupMap);
  }


  // ===== SIBLING-CHILDREN SEPARATION =====
  // Golden Rule 3+4: Kinderen van verschillende ouder-paren mogen NIET
  // door elkaar staan op hetzelfde Y-niveau (interleaving).
  // Detecteer interleaving en verplaats de groep wiens ouders meer
  // rechts staan naar een nieuw Y-niveau eronder.
  // Draait LAAT in de FINALE keten zodat alle X-verschuivingen al gebeurd zijn.
  {
    const YSTEP = NODE_H + V_GAP + 45; // 235px
    const sepPcRels = state.relationships.filter(r => r.type === 'parent-child' || r.type === 'social-parent');

    // Groepeer kinderen per Y-niveau
    const childYMap = {};
    Object.keys(pos).forEach(id => {
      if (id.startsWith && id.startsWith(CROSS_GHOST_PREFIX)) return;
      const hasParent = sepPcRels.some(r => r.childId === id && pos[r.parentId]);
      if (!hasParent) return;
      const yKey = Math.round(pos[id].y);
      if (!childYMap[yKey]) childYMap[yKey] = [];
      childYMap[yKey].push(id);
    });

    // Bestaande Y-niveaus voor target-berekening
    const allYLevels = [...new Set(Object.values(pos).map(p => Math.round(p.y)))].sort((a, b) => a - b);

    // Process van boven naar beneden
    Object.keys(childYMap).map(Number).sort((a, b) => a - b).forEach(yLevel => {
      const childIds = childYMap[yLevel].filter(id => pos[id] && Math.abs(pos[id].y - yLevel) < NODE_H);
      if (childIds.length < 3) return;

      // Groepeer per ouder-paar
      const pairGroups = {};
      childIds.forEach(cid => {
        const pids = sepPcRels
          .filter(r => r.childId === cid && pos[r.parentId])
          .map(r => r.parentId).sort();
        if (!pids.length) return;
        const key = pids.join(',');
        if (!pairGroups[key]) pairGroups[key] = { parents: pids, children: [] };
        pairGroups[key].children.push(cid);
      });

      const groups = Object.values(pairGroups);
      if (groups.length < 2) return;

      // Check elk paar groepen op interleaving
      for (let gi = 0; gi < groups.length; gi++) {
        for (let gj = gi + 1; gj < groups.length; gj++) {
          const gA = groups[gi], gB = groups[gj];
          const aKids = gA.children.filter(c => pos[c] && Math.abs(pos[c].y - yLevel) < NODE_H);
          const bKids = gB.children.filter(c => pos[c] && Math.abs(pos[c].y - yLevel) < NODE_H);
          if (aKids.length < 1 || bKids.length < 1) continue;

          // Half-sibling check: niet splitsen als ouder-paren een ouder delen
          {
            let shareParent = false;
            for (const p of gA.parents) { if (gB.parents.includes(p)) { shareParent = true; break; } }
            if (shareParent) continue;
          }

          // X-range overlap check
          const aXs = aKids.map(c => pos[c].x);
          const bXs = bKids.map(c => pos[c].x);
          const aMin = Math.min(...aXs), aMax = Math.max(...aXs) + NODE_W;
          const bMin = Math.min(...bXs), bMax = Math.max(...bXs) + NODE_W;
          if (aMax <= bMin || bMax <= aMin) continue;

          // Interleaving check: tel parent-pair wissels in X-gesorteerde volgorde
          const combined = [
            ...aKids.map(c => ({ id: c, group: 'A' })),
            ...bKids.map(c => ({ id: c, group: 'B' }))
          ].sort((a, b) => pos[a.id].x - pos[b.id].x);

          let switches = 0, lastGrp = null;
          combined.forEach(c => {
            if (lastGrp && c.group !== lastGrp) switches++;
            lastGrp = c.group;
          });
          if (switches < 2) continue;

          // INTERLEAVED! Groep met ouders meer RECHTS gaat naar beneden.
          // Alleen ouders BOVEN het kinderen-Y-niveau meetellen.
          const visualParentAvgX = (parents) => {
            const above = parents.filter(p => pos[p] && pos[p].y < yLevel);
            if (above.length === 0) return parents.reduce((s, p) => s + (pos[p] ? pos[p].x : 0), 0) / parents.length;
            return above.reduce((s, p) => s + pos[p].x, 0) / above.length;
          };
          const aParentAvgX = visualParentAvgX(gA.parents);
          const bParentAvgX = visualParentAvgX(gB.parents);
          const moveKids = aParentAvgX <= bParentAvgX ? bKids : aKids;
          const moveParents = aParentAvgX <= bParentAvgX ? gB.parents : gA.parents;

          // Bepaal doel-Y: nieuw niveau tussen huidig en volgend bestaand niveau
          let targetY = yLevel + YSTEP;
          const nextExistingY = allYLevels.find(ey => ey > yLevel + NODE_H);
          if (nextExistingY !== undefined && nextExistingY - yLevel < YSTEP + NODE_H) {
            const midY = Math.round((yLevel + nextExistingY) / 2);
            if (midY - yLevel >= NODE_H + 5 && nextExistingY - midY >= NODE_H + 5) {
              targetY = midY;
            } else {
              targetY = nextExistingY;
            }
          }

          // Verplaats kinderen + hun biologische subtree
          const movedSet = new Set();
          const shiftDown = (id, dy) => {
            if (movedSet.has(id) || !pos[id]) return;
            movedSet.add(id);
            pos[id].y += dy;
            sepPcRels.filter(r => r.parentId === id && pos[r.childId] && !movedSet.has(r.childId))
              .forEach(r => shiftDown(r.childId, dy));
          };

          const dy = targetY - yLevel;
          moveKids.forEach(cid => {
            shiftDown(cid, dy);
            (partnersOf[cid] || []).forEach(pid => {
              if (pos[pid] && !movedSet.has(pid) && Math.abs(pos[pid].y - yLevel) < NODE_H) {
                pos[pid].y += dy;
                movedSet.add(pid);
              }
            });
          });

          // Hercentreer verplaatste kinderen onder hun ouders
          let centerParents = moveParents.filter(p => pos[p] && pos[p].y < targetY);
          if (centerParents.length === 0) centerParents = moveParents.filter(p => pos[p]);
          if (centerParents.length >= 1) {
            const pXs = centerParents.map(p => pos[p].x);
            const parentCenter = (Math.min(...pXs) + Math.max(...pXs) + NODE_W) / 2;
            const movedAtTarget = moveKids.filter(c => pos[c] && Math.abs(pos[c].y - targetY) < NODE_H);
            if (movedAtTarget.length) {
              const unit = new Set(movedAtTarget);
              movedAtTarget.forEach(cid => {
                (partnersOf[cid] || []).forEach(pid => {
                  if (pos[pid] && Math.abs(pos[pid].y - targetY) < NODE_H) unit.add(pid);
                });
              });
              const unitArr = [...unit];
              const uXs = unitArr.map(u => pos[u].x);
              const unitCenter = (Math.min(...uXs) + Math.max(...uXs) + NODE_W) / 2;
              const dx = parentCenter - unitCenter;
              if (Math.abs(dx) > 5) {
                unitArr.forEach(uid => { pos[uid].x += dx; });
              }
            }
          }
        }
      }
    });

    resolveOverlaps(pos, verticalGroupMap);
  }


  // ===== SIBLING COMPACTION + CENTERING =====
  // Golden Rules:
  // 1) Kinderen moeten altijd gecentreerd onder hun ouder-paar staan
  // 2) Geen onnodige gaten tussen broers/zussen — gap alleen als er een
  //    partner-kaart (relationship) tussen zit
  // Volgorde: CENTER → COMPACT. Centering kan gaps creëren (door cascade
  // via cross-family), compact sluit ze daarna.
  {
    const scPcRels = state.relationships.filter(r => r.type === 'parent-child' || r.type === 'social-parent');

    // Bouw parent-paar → kinderen mapping
    const scPairMap = {};
    scPcRels.forEach(r => {
      if (!pos[r.childId] || !pos[r.parentId]) return;
      if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
      const allP = scPcRels
        .filter(rel => rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      const key = allP.join(',');
      if (!scPairMap[key]) scPairMap[key] = { parents: allP, children: new Set() };
      scPairMap[key].children.add(r.childId);
    });

    // --- COMPACT FUNCTIE (herbruikbaar) ---
    const runCompact = () => {
      let anyCompact = false;
      Object.values(scPairMap).forEach(({ parents, children }) => {
        const childArr = [...children].filter(id => pos[id]);
        if (childArr.length < 2) return;

        const byY = {};
        childArr.forEach(cid => {
          const yKey = Math.round(pos[cid].y);
          if (!byY[yKey]) byY[yKey] = [];
          byY[yKey].push(cid);
        });

        Object.keys(byY).map(Number).forEach(yLevel => {
          const kids = byY[yLevel]
            .filter(id => pos[id] && Math.abs(pos[id].y - yLevel) < NODE_H)
            .sort((a, b) => pos[a].x - pos[b].x);
          if (kids.length < 2) return;

          for (let i = 1; i < kids.length; i++) {
            const leftSib = kids[i - 1];
            const rightSib = kids[i];
            const leftRight = pos[leftSib].x + NODE_W;
            const rightLeft = pos[rightSib].x;

            // Count ALL cards between these two siblings (pos + ghosts)
            // This correctly handles: cross-family ghosts, displaced partners,
            // and any other non-sibling cards that sit between them.
            let cardsBetween = 0;
            const counted = new Set();
            // Check all pos nodes between them (not siblings)
            Object.keys(pos).forEach(nid => {
              if (children.has(nid) || !pos[nid]) return;
              if (Math.abs(pos[nid].y - yLevel) >= NODE_H) return;
              // Skip partners whose spouse is NOT in our sibling group
              // (they belong to another parent-pair and should stay near their spouse)
              if ((partnersOf[nid] || []).length > 0 &&
                  !(partnersOf[nid] || []).some(pid => children.has(pid))) return;
              if (pos[nid].x >= leftRight - 5 && pos[nid].x + NODE_W <= rightLeft + 5) {
                cardsBetween++;
                counted.add(nid);
              }
            });
            // Check cross-family ghosts between them
            Object.values(crossFamilyGhosts).forEach(g => {
              if (Math.abs(g.y - yLevel) >= NODE_H) return;
              if (g.x >= leftRight - 5 && g.x + NODE_W <= rightLeft + 5) {
                cardsBetween++;
              }
            });

            let expectedRight = leftRight + H_GAP;
            if (cardsBetween > 0) expectedRight += cardsBetween * (NODE_W + H_GAP);

            const gap = rightLeft - expectedRight;
            if (Math.abs(gap) <= 5) continue;
            anyCompact = true;

            // Verschuif resterende siblings + subtrees
            // gap > 0: te ver → schuif naar links (-gap)
            // gap < 0: te dicht → schuif naar rechts (-gap)
            const dx = -gap;
            const shifted = new Set();
            const shiftTree = (nid, cdx) => {
              if (shifted.has(nid) || !pos[nid]) return;
              shifted.add(nid);
              pos[nid].x += cdx;
              (partnersOf[nid] || []).forEach(pid => {
                if (pos[pid] && !shifted.has(pid) && Math.abs(pos[pid].y - pos[nid].y) < NODE_H) {
                  shifted.add(pid); pos[pid].x += cdx;
                }
              });
              scPcRels.forEach(r => {
                if (r.parentId === nid && pos[r.childId] && !shifted.has(r.childId)) {
                  if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
                  shiftTree(r.childId, cdx);
                }
              });
            };
            for (let j = i; j < kids.length; j++) {
              shiftTree(kids[j], dx);
            }

            // CARD REDISTRIBUTIE: na compactie staan tussenliggende kaarten
            // (cross-family ghosts + niet-sibling pos-entries) op verkeerde
            // posities. Herplaats ze in de juiste slots tussen siblings.
            // Pos-entries worden alleen zelf verplaatst (geen subtree cascade)
            // — de centering pass handelt kinderen-herpositionering af.
            {
              const cStep = NODE_W + H_GAP;
              const betweenItems = [];

              // Niet-sibling pos-entries tussen leftSib en originele rightSib
              Object.keys(pos).forEach(nid => {
                if (children.has(nid) || !pos[nid]) return;
                if (shifted.has(nid)) return;
                if (Math.abs(pos[nid].y - yLevel) >= NODE_H) return;
                // Skip partners whose spouse is NOT in our sibling group
                if ((partnersOf[nid] || []).length > 0 &&
                    !(partnersOf[nid] || []).some(pid => children.has(pid))) return;
                if (pos[nid].x >= leftRight - 5 && pos[nid].x + NODE_W <= rightLeft + 5) {
                  betweenItems.push({ type: 'pos', id: nid, x: pos[nid].x });
                }
              });

              // Cross-family ghosts
              Object.values(crossFamilyGhosts).forEach(g => {
                if (Math.abs(g.y - yLevel) >= NODE_H) return;
                if (g.x >= leftRight - 5 && g.x + NODE_W <= rightLeft + 5) {
                  betweenItems.push({ type: 'ghost', ghost: g, x: g.x });
                }
              });

              if (betweenItems.length > 0) {
                betweenItems.sort((a, b) => a.x - b.x);
                let slotX = leftRight + H_GAP;

                betweenItems.forEach(item => {
                  // Skip slots bezet door reeds verschoven siblings
                  while (Object.keys(pos).some(nid =>
                    shifted.has(nid) && pos[nid] &&
                    Math.abs(pos[nid].y - yLevel) < NODE_H &&
                    Math.abs(pos[nid].x - slotX) < NODE_W)) {
                    slotX += cStep;
                  }

                  if (item.type === 'pos') {
                    const itemDx = slotX - item.x;
                    if (Math.abs(itemDx) > 5) {
                      pos[item.id].x = slotX;
                    }
                  } else {
                    item.ghost.x = slotX;
                    item.ghost.y = yLevel;
                  }
                  slotX += cStep;
                });
              }
            }
          }
        });
      });
      resolveOverlaps(pos, verticalGroupMap);
      return anyCompact;
    };

    // --- CENTER FUNCTIE ---
    const runCenter = () => {
      const sortedPairs = Object.values(scPairMap).sort((a, b) => {
        const aY = Math.min(...a.parents.filter(p => pos[p]).map(p => pos[p].y));
        const bY = Math.min(...b.parents.filter(p => pos[p]).map(p => pos[p].y));
        return bY - aY; // bottom-up
      });

      let anyShift = false;
      sortedPairs.forEach(({ parents, children }) => {
        const childArr = [...children].filter(id => pos[id]);
        if (childArr.length < 1) return;

        const byY = {};
        childArr.forEach(cid => {
          const yKey = Math.round(pos[cid].y);
          if (!byY[yKey]) byY[yKey] = [];
          byY[yKey].push(cid);
        });

        Object.keys(byY).map(Number).forEach(yLevel => {
          const kids = byY[yLevel].filter(id => pos[id] && Math.abs(pos[id].y - yLevel) < NODE_H);
          if (kids.length < 1) return;

          const parentAbove = parents.filter(p => pos[p] && pos[p].y < yLevel);
          const cp = parentAbove.length > 0 ? parentAbove : parents.filter(p => pos[p]);
          if (cp.length === 0) return;

          // Cross-family aware center: als ouders ver uit elkaar staan
          // (of één ouder weggefilterd door parentAbove), gebruik ghost-positie.
          let pxArr = cp.map(p => pos[p].x);
          const allVisibleParents = parents.filter(p => pos[p]);
          if (cp.length === 2) {
            const CROSS_THRESHOLD = 2 * (NODE_W + H_GAP);
            if (Math.abs(pxArr[0] - pxArr[1]) > CROSS_THRESHOLD) {
              const kidXs0 = kids.map(cid => pos[cid].x);
              const childAvgX = kidXs0.reduce((s, x) => s + x, 0) / kidXs0.length;
              const d0 = Math.abs(pxArr[0] + NODE_W / 2 - childAvgX);
              const d1 = Math.abs(pxArr[1] + NODE_W / 2 - childAvgX);
              const closeIdx = d0 <= d1 ? 0 : 1;
              const farIdx = 1 - closeIdx;
              const farPid = cp[farIdx], closePid = cp[closeIdx];
              let ghostX = null;
              for (const g of Object.values(crossFamilyGhosts)) {
                if (g.personId === farPid && g.adjacentTo === closePid) {
                  ghostX = g.x; break;
                }
              }
              if (ghostX !== null) {
                pxArr = [pos[closePid].x, ghostX];
              } else {
                pxArr = [pos[closePid].x];
              }
            }
          } else if (cp.length === 1 && allVisibleParents.length === 2) {
            // Eén ouder weggefilterd (bijv. onder kinderen door cross-family).
            // Check of de ontbrekende ouder een ghost heeft naast cp[0].
            const presentPid = cp[0];
            const missingPid = allVisibleParents.find(p => p !== presentPid);
            if (missingPid) {
              let ghostX = null;
              for (const g of Object.values(crossFamilyGhosts)) {
                if (g.personId === missingPid && g.adjacentTo === presentPid) {
                  ghostX = g.x; break;
                }
              }
              if (ghostX !== null) {
                pxArr = [pos[presentPid].x, ghostX];
              }
            }
          }

          const parentCenter = (Math.min(...pxArr) + Math.max(...pxArr) + NODE_W) / 2;

          const kidXs = kids.map(cid => pos[cid].x);
          const childCenter = (Math.min(...kidXs) + Math.max(...kidXs) + NODE_W) / 2;

          const cdx = parentCenter - childCenter;
          if (Math.abs(cdx) <= 10) return;

          // CROSS-FAMILY GUARD: skip centering als de verschuiving enorm is
          // t.o.v. de kindgroep-breedte. Dit voorkomt dat cross-family kinderen
          // (bijv. Latifa op Y=9041, ouders op Y=344) heen-en-weer geslingerd
          // worden, wat via resolveOverlaps de layout van andere kinderen verstoort.
          const childGroupWidth = Math.max(...kidXs) - Math.min(...kidXs) + NODE_W;
          if (Math.abs(cdx) > Math.max(1500, childGroupWidth * 3)) return;

          anyShift = true;

          // Verschuif siblings + subtrees. Cascade STOPT als een
          // nakomeling een ouder heeft die NIET meeverhuist. Dit voorkomt
          // dat centering van paar A de kinderen van paar B verstoort.
          // Partners bewegen WEL altijd mee (visuele koppeling), waardoor
          // hun gezamenlijke kinderen ook correct cascaden.
          // Voorbeeld: Hagig centering verplaatst Gaffar → partner Helai
          // mee → Benjamin (kind van Gaffar+Helai, beide in moveSet) mee.
          const moveSet = new Set();
          const collectSubtree = (nid, isDirectChild) => {
            if (moveSet.has(nid) || !pos[nid]) return;
            if (!isDirectChild) {
              // Alleen cascaden als ALLE ouders in pos al in moveSet zitten.
              const nodeParentsInPos = scPcRels
                .filter(r => r.childId === nid && pos[r.parentId])
                .map(r => r.parentId);
              if (nodeParentsInPos.length > 0 &&
                  nodeParentsInPos.some(pid => !moveSet.has(pid))) return;
            }
            moveSet.add(nid);
            // Partners altijd meenemen (visuele koppeling)
            (partnersOf[nid] || []).forEach(pid => {
              if (pos[pid] && !moveSet.has(pid) && Math.abs(pos[pid].y - pos[nid].y) < NODE_H) {
                moveSet.add(pid);
              }
            });
            scPcRels.forEach(r => {
              if (r.parentId === nid && pos[r.childId] && !moveSet.has(r.childId)) {
                if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
                collectSubtree(r.childId, false);
              }
            });
          };
          kids.forEach(cid => collectSubtree(cid, true));
          moveSet.forEach(nid => { pos[nid].x += cdx; });
          // Verschuif ook cross-family ghosts die adjacent aan moveSet-nodes staan
          // Anders blokkeren ze de centering (ghost overlapt met verschoven node)
          Object.values(crossFamilyGhosts).forEach(g => {
            if (moveSet.has(g.adjacentTo)) g.x += cdx;
          });
        });
      });

      if (anyShift) resolveOverlaps(pos, verticalGroupMap);
      return anyShift;
    };

    // === PARTNER RELOCATIE ===
    // Partners die ver van hun echtgenoot staan (>= 2 × step) worden
    // teruggeplaatst naast hun partner. Dit lost misplaatste partners op
    // (bijv. Homaira die 920px van Sejad staat) VOORDAT compactie draait.
    {
      const NODE_W_L = NODE_W, H_GAP_L = H_GAP, NODE_H_L = NODE_H; // block-scoped
      const step = NODE_W_L + H_GAP_L; // 230px
      const partnerRels = state.relationships.filter(r => r.type === 'partner');
      partnerRels.forEach(rel => {
        const p1 = rel.person1Id, p2 = rel.person2Id;
        if (!pos[p1] || !pos[p2]) return;
        if (Math.abs(pos[p1].y - pos[p2].y) >= NODE_H_L) return;
        const dist = Math.abs(pos[p1].x - pos[p2].x);
        if (dist <= step + 5) return; // al adjacent

        // Bepaal wie verplaatst wordt: de niet-sibling (geen ouder boven)
        const p1IsChild = scPcRels.some(r => r.childId === p1 && pos[r.parentId] && pos[r.parentId].y < pos[p1].y);
        const p2IsChild = scPcRels.some(r => r.childId === p2 && pos[r.parentId] && pos[r.parentId].y < pos[p2].y);
        let toMove, anchor;
        if (p1IsChild && !p2IsChild) { toMove = p2; anchor = p1; }
        else if (p2IsChild && !p1IsChild) { toMove = p1; anchor = p2; }
        else return; // beide siblings of geen van beide — skip

        // toMove mag geen kinderen hebben (cascaderisico)
        const hasChildren = scPcRels.some(r => (r.type === 'parent-child' || r.type === 'social-parent') && r.parentId === toMove && pos[r.childId]);
        if (hasChildren) return;

        const rightX = pos[anchor].x + step;
        const leftX = pos[anchor].x - step;
        const anchorY = pos[anchor].y;
        const isFree = (tx, ty) =>
          !Object.keys(pos).some(id => id !== toMove &&
            pos[id] && Math.abs(pos[id].y - ty) < NODE_H_L && Math.abs(pos[id].x - tx) < NODE_W_L) &&
          !Object.values(crossFamilyGhosts).some(g =>
            Math.abs(g.y - ty) < NODE_H_L && Math.abs(g.x - tx) < NODE_W_L);
        if (isFree(rightX, anchorY)) { pos[toMove].x = rightX; pos[toMove].y = anchorY; }
        else if (isFree(leftX, anchorY)) { pos[toMove].x = leftX; pos[toMove].y = anchorY; }
      });
      resolveOverlaps(pos, verticalGroupMap);
    }

    // === UITVOERING: center → compact → center → compact ===
    // Meerdere passes: centering kan gaps maken, compact sluit ze,
    // waardoor centering weer iets moet verschuiven, etc.
    // Meer iteraties voor grotere bomen (cascade-effecten vereisen convergentie).
    // Loop stopt pas als ZOWEL centering ALS compactie geen wijzigingen meer maken.
    const maxIter = Object.keys(pos).length > 80 ? 6 : 4;
    for (let iter = 0; iter < maxIter; iter++) {
      const centered = runCenter();
      const compacted = runCompact();
      if (!centered && !compacted) break;
    }

    // Ghost-sync: centering/compactie verschuift pos-entries maar
    // crossFamilyGhosts volgen niet automatisch. Snap elke ghost
    // terug naar adjacentTo ± step. Als beide zijden bezet: maak ruimte.
    {
      const step = NODE_W + H_GAP; // 230px
      Object.entries(crossFamilyGhosts).forEach(([key, g]) => {
        const adj = pos[g.adjacentTo];
        if (!adj) return;
        const preferRight = g.x >= adj.x;
        const rightX = adj.x + step, leftX = adj.x - step;

        const isOccupied = (tx, ty, ignoreKey) =>
          Object.keys(pos).some(id =>
            Math.abs(pos[id].y - ty) < NODE_H && Math.abs(pos[id].x - tx) < NODE_W) ||
          Object.entries(crossFamilyGhosts).some(([k, g2]) =>
            k !== ignoreKey && Math.abs(g2.y - ty) < NODE_H && Math.abs(g2.x - tx) < NODE_W);

        if (preferRight && !isOccupied(rightX, adj.y, key)) {
          g.x = rightX; g.y = adj.y;
        } else if (!isOccupied(leftX, adj.y, key)) {
          g.x = leftX; g.y = adj.y;
        } else if (!isOccupied(rightX, adj.y, key)) {
          g.x = rightX; g.y = adj.y;
        } else {
          // Beide zijden bezet — MAAK RUIMTE rechts
          // Alleen AANGRENZENDE nodes verschuiven (cascade), niet alles op dezelfde Y.
          // Dit voorkomt dat verre nodes (bijv. Benjamin op x=3330) worden meegeschoven
          // als een ghost bij x=2525 wordt geplaatst.
          const insertX = rightX;
          const shiftedIds = new Set();
          const cascadeShift = (fromX) => {
            Object.keys(pos).forEach(nid => {
              if (shiftedIds.has(nid) || !pos[nid]) return;
              if (Math.abs(pos[nid].y - adj.y) >= NODE_H) return;
              if (pos[nid].x >= fromX - 1 && pos[nid].x < fromX + NODE_W + H_GAP) {
                shiftedIds.add(nid);
                pos[nid].x += step;
                cascadeShift(pos[nid].x - step); // check the original position's neighbor
              }
            });
            Object.entries(crossFamilyGhosts).forEach(([k2, g2]) => {
              if (k2 === key) return;
              if (Math.abs(g2.y - adj.y) >= NODE_H) return;
              if (g2.x >= fromX - 1 && g2.x < fromX + NODE_W + H_GAP) {
                g2.x += step;
                cascadeShift(g2.x - step);
              }
            });
          };
          cascadeShift(insertX);
          g.x = insertX; g.y = adj.y;
        }
      });
    }

    resolveOverlaps(pos, verticalGroupMap);

    // Hercentreer na ghost-sync: ghost-plaatsing kan nodes verschuiven
    // waardoor centering verbroken is (bijv. Noman ghost duwt Hamza naar rechts).
    // Meerdere passes voor convergentie bij grote bomen.
    for (let postIter = 0; postIter < 3; postIter++) {
      const postCentered = runCenter();
      const postCompacted = runCompact();
      if (!postCentered && !postCompacted) break;
    }
    resolveOverlaps(pos, verticalGroupMap);

    // === POST-COMPACTIE PARTNER TERUGPLAATSING ===
    // Na compactie/centering/ghost-sync/hercentreer kunnen partners ver van
    // hun echtgenoot staan. Verplaats ze (+ kinderen) terug naast hun partner.
    {
      const pcStep = NODE_W + H_GAP;
      const partnerRels = state.relationships.filter(r => r.type === 'partner');
      // Bouw map: persoon → aantal partners op zelfde Y rij
      // Bij multi-partner (2+) is de MULTI-PARTNER LAYOUT al gerund en heeft de
      // partners correct als [P_links][Person][P_rechts] geplaatst. Skip deze
      // partner-relaties — anders verstoort POST-COMPACT die volgorde.
      const multiPartnerCenters = new Set();
      Object.keys(pos).forEach(id => {
        const samerow = (partnersOf[id] || []).filter(pid =>
          pos[pid] && Math.abs(pos[pid].y - pos[id].y) < NODE_H);
        if (samerow.length >= 2) multiPartnerCenters.add(id);
      });
      partnerRels.forEach(rel => {
        const p1 = rel.person1Id, p2 = rel.person2Id;
        if (!pos[p1] || !pos[p2]) return;
        if (Math.abs(pos[p1].y - pos[p2].y) >= NODE_H) return;
        // Skip als één van beide een multi-partner center is
        if (multiPartnerCenters.has(p1) || multiPartnerCenters.has(p2)) return;
        const dist = Math.abs(pos[p1].x - pos[p2].x);
        if (dist <= pcStep + 5) return;

        const p1IsChild = scPcRels.some(r => r.childId === p1 && pos[r.parentId] && pos[r.parentId].y < pos[p1].y);
        const p2IsChild = scPcRels.some(r => r.childId === p2 && pos[r.parentId] && pos[r.parentId].y < pos[p2].y);
        let toMove, anchor;
        if (p1IsChild && !p2IsChild) { toMove = p2; anchor = p1; }
        else if (p2IsChild && !p1IsChild) { toMove = p1; anchor = p2; }
        else if (p1IsChild && p2IsChild) {
          const p1Kids = scPcRels.filter(r => r.parentId === p1 && pos[r.childId]).length;
          const p2Kids = scPcRels.filter(r => r.parentId === p2 && pos[r.childId]).length;
          if (p1Kids <= p2Kids) { toMove = p1; anchor = p2; }
          else { toMove = p2; anchor = p1; }
        }
        else return;

        const oldX = pos[toMove].x;
        const rightX = pos[anchor].x + pcStep;
        const leftX = pos[anchor].x - pcStep;
        const anchorY = pos[anchor].y;
        const isFree = (tx, ty) =>
          !Object.keys(pos).some(id => id !== toMove &&
            pos[id] && Math.abs(pos[id].y - ty) < NODE_H && Math.abs(pos[id].x - tx) < NODE_W) &&
          !Object.values(crossFamilyGhosts).some(g =>
            Math.abs(g.y - ty) < NODE_H && Math.abs(g.x - tx) < NODE_W);

        let targetX = null;
        if (isFree(rightX, anchorY)) targetX = rightX;
        else if (isFree(leftX, anchorY)) targetX = leftX;
        else {
          Object.keys(pos).forEach(nid => {
            if (nid !== toMove && nid !== anchor && pos[nid] &&
                Math.abs(pos[nid].y - anchorY) < NODE_H && pos[nid].x >= rightX - 1) {
              pos[nid].x += pcStep;
            }
          });
          targetX = rightX;
        }

        if (targetX !== null) {
          const dx = targetX - oldX;
          pos[toMove].x = targetX;
          pos[toMove].y = anchorY;
          const movedIds = new Set([toMove]);
          const moveDesc = (parentId) => {
            scPcRels.filter(r => r.parentId === parentId && pos[r.childId]).forEach(r => {
              if (movedIds.has(r.childId)) return;
              movedIds.add(r.childId);
              pos[r.childId].x += dx;
              (partnersOf[r.childId] || []).forEach(pid => {
                if (pos[pid] && !movedIds.has(pid) && Math.abs(pos[pid].y - pos[r.childId].y) < NODE_H) {
                  movedIds.add(pid);
                  pos[pid].x += dx;
                }
              });
              moveDesc(r.childId);
            });
          };
          moveDesc(toMove);
        }
      });
    }

  }



  // ===== Y-LEVEL SPACING =====
  // Zorg dat er minimaal V_GAP (90px) visuele ruimte zit tussen elke
  // twee opeenvolgende Y-niveaus. De SIBLING-CHILDREN SEPARATION kan
  // tussenliggende niveaus creëren met slechts 18px visueel gat.
  // Fix: push alle nodes op te dichte niveaus (+ alles eronder) omlaag.
  {
    const MIN_Y_STEP = NODE_H + V_GAP; // 190px minimum tussen Y-centers
    const allY = [...new Set(Object.values(pos).map(p => Math.round(p.y)))].sort((a, b) => a - b);
    for (let i = 1; i < allY.length; i++) {
      const gap = allY[i] - allY[i - 1];
      if (gap >= MIN_Y_STEP) continue;
      const pushDown = MIN_Y_STEP - gap;
      const threshold = allY[i] - 1;
      Object.values(pos).forEach(p => {
        if (Math.round(p.y) >= threshold) p.y += pushDown;
      });
      Object.values(crossFamilyGhosts).forEach(g => {
        if (Math.round(g.y) >= threshold) g.y += pushDown;
      });
      for (let j = i; j < allY.length; j++) allY[j] += pushDown;
    }
  }



  // ===== FINALE COMPACTIE (na Y-LEVEL SPACING) =====
  // Y-LEVEL SPACING duwt Y-niveaus uit elkaar. Ghosts die tijdens
  // compactie op hetzelfde Y-niveau als siblings stonden, kunnen nu
  // op een ander Y terechtkomen. Dit laat gaps achter tussen siblings.
  // Oplossing: hercompacteer NA Y-spacing als afsluitende stap.
  {
    const scPcRels2 = state.relationships.filter(r => r.type === 'parent-child' || r.type === 'social-parent');
    const scPairMap2 = {};
    scPcRels2.forEach(r => {
      if (!pos[r.childId] || !pos[r.parentId]) return;
      if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
      const allP = scPcRels2.filter(rel => rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      const key = allP.join(',');
      if (!scPairMap2[key]) scPairMap2[key] = { parents: allP, children: new Set() };
      scPairMap2[key].children.add(r.childId);
    });

    for (let fi = 0; fi < 3; fi++) {
      let anyGap = false;
      Object.values(scPairMap2).forEach(({ parents, children }) => {
        const childArr = [...children].filter(id => pos[id]);
        if (childArr.length < 2) return;
        const byY = {};
        childArr.forEach(cid => {
          const yKey = Math.round(pos[cid].y);
          if (!byY[yKey]) byY[yKey] = [];
          byY[yKey].push(cid);
        });

        Object.keys(byY).map(Number).forEach(yLevel => {
          const kids = byY[yLevel]
            .filter(id => pos[id] && Math.abs(pos[id].y - yLevel) < NODE_H)
            .sort((a, b) => pos[a].x - pos[b].x);
          if (kids.length < 2) return;

          for (let i = 1; i < kids.length; i++) {
            const leftRight = pos[kids[i - 1]].x + NODE_W;
            const rightLeft = pos[kids[i]].x;
            // Tel kaarten ertussen (alleen op exact zelfde Y-niveau)
            let btw = 0;
            Object.keys(pos).forEach(nid => {
              if (children.has(nid) || !pos[nid]) return;
              if (Math.abs(pos[nid].y - yLevel) >= NODE_H) return;
              if (pos[nid].x >= leftRight - 5 && pos[nid].x + NODE_W <= rightLeft + 5) btw++;
            });
            Object.values(crossFamilyGhosts).forEach(g => {
              if (Math.abs(g.y - yLevel) >= NODE_H) return;
              if (g.x >= leftRight - 5 && g.x + NODE_W <= rightLeft + 5) btw++;
            });
            const expected = leftRight + H_GAP + btw * (NODE_W + H_GAP);
            const gap = rightLeft - expected;
            if (gap <= 5) continue;
            anyGap = true;
            // Verschuif rechter siblings naar links
            const dx = -gap;
            const shifted = new Set();
            const shiftR = (nid, cdx) => {
              if (shifted.has(nid) || !pos[nid]) return;
              shifted.add(nid);
              pos[nid].x += cdx;
              const partnersOf2 = state.relationships.filter(r =>
                r.type === 'partner' && (r.person1Id === nid || r.person2Id === nid))
                .map(r => r.person1Id === nid ? r.person2Id : r.person1Id);
              partnersOf2.forEach(pid => {
                if (pos[pid] && !shifted.has(pid) && Math.abs(pos[pid].y - pos[nid].y) < NODE_H) {
                  shifted.add(pid); pos[pid].x += cdx;
                }
              });
              scPcRels2.forEach(r => {
                if (r.parentId === nid && pos[r.childId] && !shifted.has(r.childId)) {
                  if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
                  shiftR(r.childId, cdx);
                }
              });
            };
            for (let j = i; j < kids.length; j++) shiftR(kids[j], dx);
            // Herplaats tussenliggende kaarten
            const cStep = NODE_W + H_GAP;
            const betweenItems = [];
            Object.keys(pos).forEach(nid => {
              if (children.has(nid) || !pos[nid] || shifted.has(nid)) return;
              if (Math.abs(pos[nid].y - yLevel) >= NODE_H) return;
              if (pos[nid].x >= leftRight - 5 && pos[nid].x + NODE_W <= rightLeft + 5) {
                betweenItems.push({ type: 'pos', id: nid, x: pos[nid].x });
              }
            });
            Object.values(crossFamilyGhosts).forEach(g => {
              if (Math.abs(g.y - yLevel) >= NODE_H) return;
              if (g.x >= leftRight - 5 && g.x + NODE_W <= rightLeft + 5) {
                betweenItems.push({ type: 'ghost', ghost: g, x: g.x });
              }
            });
            if (betweenItems.length > 0) {
              betweenItems.sort((a, b) => a.x - b.x);
              let slotX = leftRight + H_GAP;
              betweenItems.forEach(item => {
                while (Object.keys(pos).some(nid =>
                  shifted.has(nid) && pos[nid] &&
                  Math.abs(pos[nid].y - yLevel) < NODE_H &&
                  Math.abs(pos[nid].x - slotX) < NODE_W)) {
                  slotX += cStep;
                }
                if (item.type === 'pos') pos[item.id].x = slotX;
                else { item.ghost.x = slotX; item.ghost.y = yLevel; }
                slotX += cStep;
              });
            }
          }
        });
      });
      if (!anyGap) break;
      resolveOverlaps(pos, verticalGroupMap);
    }
  }




  // ===== FINALE Y-PROXIMITY COMPACTIE =====
  // Leaf-node kinderen die >2 YSTEP onder hun ouders staan → verplaats
  // omhoog naar het dichtstbijzijnde Y-niveau met horizontale ruimte.
  // De standaard CHILD-Y-PROXIMITY checkt alleen de gecentreerde positie
  // op idealY. Deze stap zoekt ook in horizontale gaten én op
  // tussenliggende Y-niveaus.
  {
    const YSTEP = NODE_H + V_GAP + 45; // 235px
    const MAX_HDIST = 4 * (NODE_W + H_GAP); // 920px

    // Sla de originele Y-niveaus op VOOR Y-PROXIMITY begint.
    // Cascade-verplaatsingen creëren soms tussenliggende Y-niveaus (bijv. y=945)
    // die de tooCloseToExisting check blokkeren voor latere groepen.
    const originalYLevels = [...new Set(Object.values(pos).map(p => Math.round(p.y)))];

    const ypGrps = {};
    state.relationships.forEach(r => {
      if ((r.type !== 'parent-child' && r.type !== 'social-parent') || !pos[r.childId]) return;
      if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
      const pids = state.relationships
        .filter(rel => (rel.type === 'parent-child' || rel.type === 'social-parent') && rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      if (!pids.length) return;
      const key = pids.join(',');
      if (!ypGrps[key]) ypGrps[key] = { parents: pids, children: new Set() };
      ypGrps[key].children.add(r.childId);
    });

    // Filter: kinderen die >1.2 YSTEP te ver staan
    const ypSorted = Object.values(ypGrps).map(g => {
      const cids = [...g.children].filter(id => pos[id]);
      if (!cids.length) return null;
      const minPY = Math.min(...g.parents.map(pid => pos[pid].y));
      const idealY = minPY + YSTEP;
      const toFix = cids.filter(cid => pos[cid].y - idealY > YSTEP * 1.2);
      if (!toFix.length) return null;
      const maxCY = Math.max(...toFix.map(cid => pos[cid].y));
      return { parents: g.parents, toFix, idealY, maxCY, drop: maxCY - idealY };
    }).filter(Boolean).sort((a, b) => b.drop - a.drop); // grootste drop eerst

    ypSorted.forEach(({ parents, toFix, idealY, maxCY }) => {
      const activeFix = toFix.filter(id => pos[id] && pos[id].y - idealY > YSTEP * 0.5);
      if (!activeFix.length) return;

      const pCX = parents.reduce((s, pid) => s + pos[pid].x + NODE_W / 2, 0) / parents.length;

      // Verzamel slots (kinderen + eventuele inlaw-partners)
      const slots = [];
      activeFix.forEach(cid => {
        slots.push({ id: cid, type: 'child' });
        (partnersOf[cid] || []).forEach(pid => {
          if (pos[pid] && !(parentsOf[pid] || []).some(p => pos[p])) {
            slots.push({ id: pid, type: 'inlaw' });
          }
        });
      });
      const slotsSet = new Set(slots.map(s => s.id));
      const needW = slots.length > 0 ? (slots.length - 1) * (NODE_W + H_GAP) + NODE_W : 0;

      // Verzamel nakomelingen-onder-curY voor cascade (non-leaf support)
      const curY = pos[activeFix[0]].y;
      const cascadeDown = new Set();
      const descParent = {};
      const ypCollectDesc = (pid, rootCid) => {
        (fullChildrenOf[pid] || childrenOf[pid] || []).forEach(cid => {
          if (pos[cid] && !slotsSet.has(cid) && !cascadeDown.has(cid)) {
            if (pos[cid].y >= curY) {
              cascadeDown.add(cid);
              descParent[cid] = rootCid;
            }
            ypCollectDesc(cid, rootCid);
          }
        });
        (partnersOf[pid] || []).forEach(ppid => {
          if (pos[ppid] && !slotsSet.has(ppid) && !cascadeDown.has(ppid) && pos[ppid].y >= curY) {
            cascadeDown.add(ppid);
            descParent[ppid] = rootCid;
          }
        });
      };
      activeFix.forEach(cid => ypCollectDesc(cid, cid));
      const descYOffsets = [...new Set([...cascadeDown].map(did => pos[did].y - curY))].filter(o => o > 0);

      // Probeer Y-niveaus: idealY, dan bestaande tussenliggende niveaus
      const tryLevels = [idealY];
      const existingYs = [...new Set(Object.values(pos).map(p => Math.round(p.y)))]
        .filter(y => y > idealY + 5 && y < maxCY - 5)
        .sort((a, b) => a - b);
      tryLevels.push(...existingYs);

      let targetY = null, targetStartX = null;
      const MIN_Y_STEP_YP = NODE_H + V_GAP; // 190px

      for (const tryY of tryLevels) {
        // Skip Y-niveaus die te dicht bij bestaande niveaus liggen
        // (zou Y-LEVEL SPACING triggeren en boom groter maken)
        // Gebruik originalYLevels (vóór Y-PROXIMITY) zodat cascade-gecreëerde
        // Y-niveaus (bijv. y=945) latere groepen niet blokkeren
        // tooCloseToExisting: skip levels die te dicht bij ander Y-niveau zitten.
        // BUG-FIX: minimum-afstand 5px (was 0px) — voorkomt dat 648/649 (1px apart)
        // elkaar wederzijds blokkeren bij snap-candidates.
        const tooCloseToExisting = originalYLevels.some(uy =>
          Math.abs(uy - tryY) > 5 && Math.abs(uy - tryY) < MIN_Y_STEP_YP);
        if (tooCloseToExisting) {
          continue;
        }

        // Bezette intervallen op dit Y-niveau (excl. te verplaatsen nodes)
        const occupied = [];
        for (const nid of Object.keys(pos)) {
          if (slotsSet.has(nid) || cascadeDown.has(nid) || !pos[nid]) continue;
          if (Math.abs(pos[nid].y - tryY) >= NODE_H) continue;
          occupied.push({ l: pos[nid].x - H_GAP, r: pos[nid].x + NODE_W + H_GAP });
        }
        Object.values(crossFamilyGhosts).forEach(gh => {
          if (Math.abs(gh.y - tryY) >= NODE_H) return;
          occupied.push({ l: gh.x - H_GAP, r: gh.x + NODE_W + H_GAP });
        });
        occupied.sort((a, b) => a.l - b.l);

        // Merge overlappende intervallen
        const merged = [];
        occupied.forEach(o => {
          if (merged.length && o.l <= merged[merged.length - 1].r) {
            merged[merged.length - 1].r = Math.max(merged[merged.length - 1].r, o.r);
          } else {
            merged.push({ ...o });
          }
        });

        // Zoek vrije gaten die breed genoeg zijn
        const gaps = [];
        if (!merged.length) {
          gaps.push({ l: PADDING, r: Infinity });
        } else {
          if (merged[0].l >= PADDING + needW) {
            gaps.push({ l: PADDING, r: merged[0].l });
          }
          for (let i = 0; i < merged.length - 1; i++) {
            if (merged[i + 1].l - merged[i].r >= needW) {
              gaps.push({ l: merged[i].r, r: merged[i + 1].l });
            }
          }
          gaps.push({ l: merged[merged.length - 1].r, r: Infinity });
        }

        // Kies het gat dat het dichtst bij de ouder-center (pCX) ligt
        let bestX = null, bestDist = Infinity;
        gaps.forEach(gap => {
          if (gap.r !== Infinity && gap.r - gap.l < needW) return;
          const idealX = pCX - needW / 2;
          const clampedX = Math.max(gap.l, Math.min(idealX,
            gap.r === Infinity ? idealX : gap.r - needW));
          const centerX = clampedX + needW / 2;
          const dist = Math.abs(centerX - pCX);
          if (dist < bestDist && dist <= MAX_HDIST) {
            bestDist = dist;
            bestX = clampedX;
          }
        });

        if (bestX !== null) {
          targetY = tryY;
          targetStartX = bestX;
          break; // eerste (dichtstbijzijnde) beschikbare niveau
        }
      }

      if (targetY === null) return; // geen ruimte gevonden

      // Sla originele posities op voor delta-berekening bij cascade
      const origSlotPos = {};
      slots.forEach(({ id }) => { origSlotPos[id] = { x: pos[id].x, y: pos[id].y }; });

      // Verplaats kinderen naar targetY met horizontale gap-plaatsing
      let cx = targetStartX;
      slots.forEach(({ id }) => {
        pos[id].x = cx;
        pos[id].y = targetY;
        cx += NODE_W + H_GAP;
      });

      // Cascade Y-shift naar nakomelingen onder curY
      if (cascadeDown.size > 0) {
        const deltaY = targetY - curY;
        cascadeDown.forEach(did => {
          const rootCid = descParent[did];
          const deltaX = (rootCid && origSlotPos[rootCid])
            ? pos[rootCid].x - origSlotPos[rootCid].x : 0;
          pos[did].y += deltaY;
          pos[did].x += deltaX;
        });
      }

      // Ghost-sync voor alle verplaatste personen (slots + nakomelingen)
      const allMoved = new Set([...slotsSet, ...cascadeDown]);
      allMoved.forEach(mid => {
        if (!pos[mid]) return;
        (ghostsAdjacentTo[mid] || []).forEach(gid => {
          const gm = ghostMeta[gid];
          if (!gm) return;
          const gk = gm.personId + ':cg:' + gm.adjacentTo;
          const gh = crossFamilyGhosts[gk];
          if (gh) { gh.y = pos[mid].y; gh.x = pos[mid].x + NODE_W + H_GAP; }
        });
      });

    });

    resolveOverlaps(pos, verticalGroupMap);

    // --- POST-Y-PROXIMITY CENTERING ---
    // Na alle Y-PROXIMITY verplaatsingen: centreer kindergroepen onder hun ouders.
    // Aanpak: groepeer kandidaten per Y-niveau. Bij meerdere groepen op hetzelfde
    // Y-niveau, herordenen op volgorde van ouder-center-X en sequentieel plaatsen.
    // Bij enkelvoudige groepen: maximale verschuiving richting ouder-center.
    {
      // Herbouw de gezinsgroepen
      const ypCenterGrps = {};
      state.relationships.forEach(r => {
        if ((r.type !== 'parent-child' && r.type !== 'social-parent') || !pos[r.childId]) return;
        if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
        const pids = state.relationships
          .filter(rel => (rel.type === 'parent-child' || rel.type === 'social-parent') && rel.childId === r.childId && pos[rel.parentId])
          .map(rel => rel.parentId).sort();
        if (!pids.length) return;
        const key = pids.join(',');
        if (!ypCenterGrps[key]) ypCenterGrps[key] = { parents: pids, children: new Set() };
        ypCenterGrps[key].children.add(r.childId);
      });

      // Verzamel kandidaten: kinderen ver van ouders (cY - minPY > 1.5*YSTEP)
      // BELANGRIJK: splits kinderen per Y-niveau binnen elke oudergroep.
      // Ouders kunnen kinderen hebben op meerdere Y-niveaus (bijv. y=520 én y=710).
      // Elke subset wordt apart beoordeeld als centering-kandidaat.
      const centerCandidates = [];
      Object.values(ypCenterGrps).forEach(({ parents, children }) => {
        const cids = [...children].filter(id => pos[id]);
        if (cids.length < 1) return;
        const parentsInLayout = parents.filter(id => pos[id]);
        if (!parentsInLayout.length) return;
        const minPY = Math.min(...parentsInLayout.map(id => pos[id].y));

        // Groepeer kinderen per Y-niveau
        const cidsByY = {};
        cids.forEach(cid => {
          const y = Math.round(pos[cid].y);
          if (!cidsByY[y]) cidsByY[y] = [];
          cidsByY[y].push(cid);
        });

        // Beoordeel elke Y-subset apart
        Object.entries(cidsByY).forEach(([yStr, yCids]) => {
          const cY = parseInt(yStr);
          if (cY - minPY < YSTEP * 1.5) return;

          // Cross-family ouders op verschillende Y-niveaus: gebruik dichtstbijzijnde
          // ouder + ghost als center
          let pCX;
          if (parentsInLayout.length === 2 &&
              Math.abs(pos[parentsInLayout[0]].y - pos[parentsInLayout[1]].y) > NODE_H) {
            const [p1, p2] = parentsInLayout;
            const closerP = Math.abs(pos[p1].y - cY) < Math.abs(pos[p2].y - cY) ? p1 : p2;
            const fartherP = closerP === p1 ? p2 : p1;
            const ghostKey = fartherP + ':cg:' + closerP;
            const ghost = crossFamilyGhosts[ghostKey];
            if (ghost && ghost.x !== undefined) {
              pCX = (pos[closerP].x + NODE_W / 2 + ghost.x + NODE_W / 2) / 2;
            } else {
              pCX = pos[closerP].x + NODE_W / 2;
            }
          } else {
            pCX = parentsInLayout.reduce((s, pid) => s + pos[pid].x + NODE_W / 2, 0) / parentsInLayout.length;
          }

          const cMinX = Math.min(...yCids.map(id => pos[id].x));
          const cMaxX = Math.max(...yCids.map(id => pos[id].x)) + NODE_W;
          const cCenter = (cMinX + cMaxX) / 2;
          const offset = pCX - cCenter;
          if (Math.abs(offset) <= 50) return;

          // Inlaw-partners (partners zonder ouders in layout, op zelfde Y)
          const allIds = [...yCids];
          yCids.forEach(cid => {
            (partnersOf[cid] || []).forEach(pid => {
              if (pos[pid] && Math.abs(pos[pid].y - cY) < NODE_H &&
                  !(parentsOf[pid] || []).some(ppid => pos[ppid]) &&
                  !allIds.includes(pid)) {
                allIds.push(pid);
              }
            });
          });
          // Sorteer op huidige X (behoudt geboorte-volgorde)
          allIds.sort((a, b) => pos[a].x - pos[b].x);
          const width = allIds.length > 0 ? (allIds.length - 1) * (NODE_W + H_GAP) + NODE_W : 0;

          // Skip niet-aaneengesloten groepen (kinderen verspreid met vreemde nodes ertussen)
          const actualSpan = cMaxX - cMinX;
          if (actualSpan > width + (NODE_W + H_GAP) * 2) return;

          centerCandidates.push({ parents, cids: yCids, allIds, cY, pCX, offset, width });
        });
      });

      // Groepeer op Y-niveau
      const byYLevel = {};
      centerCandidates.forEach(c => {
        if (!byYLevel[c.cY]) byYLevel[c.cY] = [];
        byYLevel[c.cY].push(c);
      });

      Object.entries(byYLevel).forEach(([yKey, groups]) => {
        const yLevel = parseInt(yKey);
        const allCandIds = new Set();
        groups.forEach(g => g.allIds.forEach(id => allCandIds.add(id)));

        // Ghost-keys van kandidaten (niet als obstakel tellen)
        const candGhostKeys = new Set();
        allCandIds.forEach(id => {
          (ghostsAdjacentTo[id] || []).forEach(gid => {
            const gm = ghostMeta[gid];
            if (gm) candGhostKeys.add(gm.personId + ':cg:' + gm.adjacentTo);
          });
        });

        // Obstakels op dit Y-niveau (nodes die NIET kandidaat zijn)
        // Ghosts (pos en crossFamilyGhosts) worden NIET als obstakel geteld:
        // fixGhostOverlaps herpositioneert ze later
        const obstacles = [];
        Object.keys(pos).forEach(nid => {
          if (allCandIds.has(nid) || !pos[nid]) return;
          if (nid.startsWith && nid.startsWith(CROSS_GHOST_PREFIX)) return;
          if (Math.abs(pos[nid].y - yLevel) >= NODE_H) return;
          // Exclude "close children": ouders < 1.5*YSTEP hierboven → gaan later naar ander Y-niveau
          const nidPars = (parentsOf[nid] || []).filter(pid => pos[pid]);
          if (nidPars.length > 0) {
            const nidMinPY = Math.min(...nidPars.map(pid => pos[pid].y));
            if (pos[nid].y - nidMinPY < 235 * 1.5) return;
          }
          obstacles.push({ l: pos[nid].x, r: pos[nid].x + NODE_W });
        });
        obstacles.sort((a, b) => a.l - b.l);

        if (groups.length >= 2) {
          // === MULTI-GROUP: probeer herordening, maar met "do no harm" check ===
          groups.sort((a, b) => a.pCX - b.pCX);
          let minStartX = PADDING;
          const placements = [];

          groups.forEach(grp => {
            const idealStart = grp.pCX - grp.width / 2;
            let startX = Math.max(minStartX, idealStart);
            let needShift = true;
            let maxIter = 30;
            while (needShift && maxIter-- > 0) {
              needShift = false;
              for (const obs of obstacles) {
                if (startX < obs.r + H_GAP && startX + grp.width > obs.l - H_GAP) {
                  startX = obs.r + H_GAP;
                  needShift = true;
                }
              }
            }
            placements.push({ grp, startX });
            minStartX = startX + grp.width + H_GAP;
          });

          // "Do no harm": check of een groep significant verslechtert
          let anySigWorse = false;
          placements.forEach(({ grp, startX }) => {
            const newCenter = startX + grp.width / 2;
            const newAbsOff = Math.abs(grp.pCX - newCenter);
            const oldAbsOff = Math.abs(grp.offset);
            if (newAbsOff > oldAbsOff + 150) anySigWorse = true;
          });

          if (!anySigWorse) {
            // Multi-group is veilig → pas toe
            shiftedInlaws = new Set();
            placements.forEach(({ grp, startX }) => {
              let cx = startX;
              const grpIdSet = new Set(grp.allIds);
              grp.allIds.forEach(id => {
                const oldX = pos[id].x;
                const dx = cx - oldX;
                pos[id].x = cx;
                cx += NODE_W + H_GAP;
                (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid => {
                  if (pos[cid] && !grpIdSet.has(cid) && !allCandIds.has(cid)) {
                    shiftWithDescendants(cid, dx);
                  }
                });
                (ghostsAdjacentTo[id] || []).forEach(gid => {
                  const gm = ghostMeta[gid];
                  if (!gm) return;
                  const gk = gm.personId + ':cg:' + gm.adjacentTo;
                  const gh = crossFamilyGhosts[gk];
                  if (gh) gh.x += dx;
                });
              });
            });
          } else {
            // Multi-group schaadt → per-groep single shift (alle andere nodes als obstakel)
            groups.sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset));
            shiftedInlaws = new Set();
            groups.forEach(grp => {
              const desiredDx = grp.offset;
              if (Math.abs(desiredDx) <= 10) return;
              const grpSet = new Set(grp.allIds);
              const grpMinX = Math.min(...grp.allIds.map(id => pos[id].x));
              const grpMaxX = Math.max(...grp.allIds.map(id => pos[id].x)) + NODE_W;
              let internalObs = false;
              let closestLeftR = -Infinity;
              let closestRightL = Infinity;
              Object.keys(pos).forEach(nid => {
                if (grpSet.has(nid) || !pos[nid]) return;
                if (nid.startsWith && nid.startsWith(CROSS_GHOST_PREFIX)) return;
                if (Math.abs(pos[nid].y - yLevel) >= NODE_H) return;
                const npars = (parentsOf[nid] || []).filter(pid => pos[pid]);
                if (npars.length > 0 && pos[nid].y - Math.min(...npars.map(pid => pos[pid].y)) < 235 * 1.5) return;
                const l = pos[nid].x, r = pos[nid].x + NODE_W;
                if (l < grpMaxX && r > grpMinX) { internalObs = true; }
                if (r <= grpMinX) closestLeftR = Math.max(closestLeftR, r);
                if (l >= grpMaxX) closestRightL = Math.min(closestRightL, l);
              });
              if (internalObs) return;
              let dx;
              if (desiredDx < 0) {
                const maxLeft = closestLeftR > -Infinity
                  ? grpMinX - closestLeftR - H_GAP
                  : grpMinX - PADDING;
                dx = Math.max(desiredDx, -Math.max(0, maxLeft));
              } else {
                const maxRight = closestRightL < Infinity
                  ? closestRightL - H_GAP - grpMaxX
                  : desiredDx;
                dx = Math.min(desiredDx, Math.max(0, maxRight));
              }
              if (grpMinX + dx < PADDING) dx = PADDING - grpMinX;
              if (Math.abs(dx) > 3) {
                const grpIdSet = new Set(grp.allIds);
                grp.allIds.forEach(id => {
                  pos[id].x += dx;
                  (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid => {
                    if (pos[cid] && !grpIdSet.has(cid)) {
                      shiftWithDescendants(cid, dx);
                    }
                  });
                  (ghostsAdjacentTo[id] || []).forEach(gid => {
                    const gm = ghostMeta[gid];
                    if (!gm) return;
                    const gk = gm.personId + ':cg:' + gm.adjacentTo;
                    const gh = crossFamilyGhosts[gk];
                    if (gh) gh.x += dx;
                  });
                });
              }
            });
          }

        } else {
          // === SINGLE GROUP: maximale verschuiving richting ouder-center ===
          const grp = groups[0];
          const desiredDx = grp.offset;
          const grpMinX = Math.min(...grp.allIds.map(id => pos[id].x));
          const grpMaxX = Math.max(...grp.allIds.map(id => pos[id].x)) + NODE_W;

          // Zoek beperkingen door obstakels
          let internalObstacle = false;
          let closestLeftR = -Infinity;
          let closestRightL = Infinity;

          for (const obs of obstacles) {
            if (obs.l < grpMaxX && obs.r > grpMinX) {
              internalObstacle = true;
              break;
            }
            if (obs.r <= grpMinX) closestLeftR = Math.max(closestLeftR, obs.r);
            if (obs.l >= grpMaxX) closestRightL = Math.min(closestRightL, obs.l);
          }

          if (!internalObstacle) {
            let dx;
            if (desiredDx < 0) {
              const maxLeft = closestLeftR > -Infinity
                ? grpMinX - closestLeftR - H_GAP
                : grpMinX - PADDING;
              dx = Math.max(desiredDx, -Math.max(0, maxLeft));
            } else {
              const maxRight = closestRightL < Infinity
                ? closestRightL - H_GAP - grpMaxX
                : desiredDx;
              dx = Math.min(desiredDx, Math.max(0, maxRight));
            }
            if (grpMinX + dx < PADDING) dx = PADDING - grpMinX;

            if (Math.abs(dx) > 3) {
              shiftedInlaws = new Set();
              const grpIdSet = new Set(grp.allIds);
              grp.allIds.forEach(id => {
                pos[id].x += dx;
                (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid => {
                  if (pos[cid] && !grpIdSet.has(cid)) {
                    shiftWithDescendants(cid, dx);
                  }
                });
                (ghostsAdjacentTo[id] || []).forEach(gid => {
                  const gm = ghostMeta[gid];
                  if (!gm) return;
                  const gk = gm.personId + ':cg:' + gm.adjacentTo;
                  const gh = crossFamilyGhosts[gk];
                  if (gh) gh.x += dx;
                });
              });
            }
          }
        }
      });

      // "Close children" die op centering Y-niveaus staan maar zelf dicht bij hun
      // ouders zijn → komen later op ander Y-niveau. Skip in resolveOverlaps zodat
      // ze de gecentreerde nodes niet verjagen.
      const closeChildSkip = new Set();
      Object.keys(byYLevel).forEach(yKey => {
        const yl = parseInt(yKey);
        Object.keys(pos).forEach(nid => {
          if (!pos[nid]) return;
          if (nid.startsWith && nid.startsWith(CROSS_GHOST_PREFIX)) { closeChildSkip.add(nid); return; }
          if (Math.abs(pos[nid].y - yl) >= NODE_H) return;
          const npars = (parentsOf[nid] || []).filter(pid => pos[pid]);
          if (npars.length > 0) {
            const npMinPY = Math.min(...npars.map(pid => pos[pid].y));
            if (pos[nid].y - npMinPY < 235 * 1.5) closeChildSkip.add(nid);
          }
        });
      });
      resolveOverlaps(pos, verticalGroupMap, closeChildSkip);
    }

    // Ghost-pos overlap fix: ghost kan overlappen met een pos-entry
    // die door de Y-proximity verplaatst is (of door cross-tree positie).
    // Zoek alternating links/rechts tot 15 slots voor een vrije plek.
    const fixGhostOverlaps = () => {
      Object.entries(crossFamilyGhosts).forEach(([key, g]) => {
        const hasOverlap = Object.keys(pos).some(nid =>
          pos[nid] && Math.abs(pos[nid].x - g.x) < NODE_W && Math.abs(pos[nid].y - g.y) < NODE_H);
        if (!hasOverlap) return;
        const isFree = (tx) =>
          !Object.keys(pos).some(nid =>
            pos[nid] && Math.abs(pos[nid].x - tx) < NODE_W && Math.abs(pos[nid].y - g.y) < NODE_H) &&
          !Object.values(crossFamilyGhosts).some(g2 =>
            g2 !== g && Math.abs(g2.x - tx) < NODE_W && Math.abs(g2.y - g.y) < NODE_H);
        for (let d = 1; d <= 15; d++) {
          const rx = g.x + d * (NODE_W + H_GAP);
          if (isFree(rx)) { g.x = rx; return; }
          const lx = g.x - d * (NODE_W + H_GAP);
          if (lx >= PADDING && isFree(lx)) { g.x = lx; return; }
        }
      });
    };
    fixGhostOverlaps();

    // Y-LEVEL SPACING herhalen: de Y-proximity verplaatsing kan nieuwe
    // Y-niveaus creëren die te dicht bij bestaande niveaus liggen.
    {
      const MIN_Y_STEP2 = NODE_H + V_GAP; // 190px minimum
      const allY2 = [...new Set(Object.values(pos).map(p => Math.round(p.y)))].sort((a, b) => a - b);
      for (let i = 1; i < allY2.length; i++) {
        const gap2 = allY2[i] - allY2[i - 1];
        if (gap2 >= MIN_Y_STEP2) continue;
        const pushDown2 = MIN_Y_STEP2 - gap2;
        const threshold2 = allY2[i] - 1;
        Object.values(pos).forEach(p => {
          if (Math.round(p.y) >= threshold2) p.y += pushDown2;
        });
        Object.values(crossFamilyGhosts).forEach(g => {
          if (Math.round(g.y) >= threshold2) g.y += pushDown2;
        });
        for (let j = i; j < allY2.length; j++) allY2[j] += pushDown2;
      }
    }
  }


  // ===== FINALE Y-LEVEL GAP COMPRESSIE =====
  // Na Y-PROXIMITY en spacing: comprimeer grote Y-level gaten (> YSTEP)
  // naar precies YSTEP. Dit reduceert de totale boomhoogte.
  {
    const YSTEP_COMP = NODE_H + V_GAP + 45; // 235px
    const allYcomp = [...new Set(Object.values(pos).map(p => Math.round(p.y)))].sort((a, b) => a - b);
    for (let i = 1; i < allYcomp.length; i++) {
      const gapComp = allYcomp[i] - allYcomp[i - 1];
      if (gapComp <= YSTEP_COMP) continue;
      const compress = gapComp - YSTEP_COMP;
      const thresholdComp = allYcomp[i] - 1;
      Object.values(pos).forEach(p => {
        if (Math.round(p.y) >= thresholdComp) p.y -= compress;
      });
      Object.values(crossFamilyGhosts).forEach(g => {
        if (Math.round(g.y) >= thresholdComp) g.y -= compress;
      });
      for (let j = i; j < allYcomp.length; j++) allYcomp[j] -= compress;
    }

    // Na compressie: heroplossing overlaps + ghost fix
    resolveOverlaps(pos, verticalGroupMap);
    Object.entries(crossFamilyGhosts).forEach(([key, g]) => {
      const hasOv = Object.keys(pos).some(nid =>
        pos[nid] && Math.abs(pos[nid].x - g.x) < NODE_W && Math.abs(pos[nid].y - g.y) < NODE_H);
      if (!hasOv) return;
      const isFreeC = (tx) =>
        !Object.keys(pos).some(nid =>
          pos[nid] && Math.abs(pos[nid].x - tx) < NODE_W && Math.abs(pos[nid].y - g.y) < NODE_H) &&
        !Object.values(crossFamilyGhosts).some(g2 =>
          g2 !== g && Math.abs(g2.x - tx) < NODE_W && Math.abs(g2.y - g.y) < NODE_H);
      for (let d = 1; d <= 15; d++) {
        const rx = g.x + d * (NODE_W + H_GAP);
        if (isFreeC(rx)) { g.x = rx; return; }
        const lx = g.x - d * (NODE_W + H_GAP);
        if (lx >= PADDING && isFreeC(lx)) { g.x = lx; return; }
      }
    });
  }



  // ===== FINALE BIRTHORDER RE-SORT =====
  // Na alle FINALE stappen (gap-sluiting, Y-proximity, compressie) kan de
  // birthOrder van siblings verbroken zijn. Herstel de linker-naar-rechter
  // volgorde op basis van birthOrder/birthdate.
  {
    const boSibGroups = {};
    state.relationships.forEach(r => {
      if ((r.type !== 'parent-child' && r.type !== 'social-parent') || !pos[r.childId]) return;
      if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
      const pids = state.relationships
        .filter(rel => (rel.type === 'parent-child' || rel.type === 'social-parent') && rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      if (!pids.length) return;
      const key = pids.join(',');
      if (!boSibGroups[key]) boSibGroups[key] = { parents: pids, children: new Set() };
      boSibGroups[key].children.add(r.childId);
    });

    Object.values(boSibGroups).forEach(({ parents, children }) => {
      const siblings = [...children].filter(id => pos[id]);
      if (siblings.length < 2) return;

      // Check of er birthOrder of birthdate data is
      const hasBirthOrder = siblings.some(id => {
        const p = getPerson(id);
        return p?.birthOrder != null ||
          (socialChildIds.has(id) && p?.socialBirthOrder != null);
      });
      const hasBirthdate = siblings.some(id => {
        const bd = parseBirthdate(getPerson(id)?.birthdate);
        return bd && bd.year;
      });
      if (!hasBirthOrder && !hasBirthdate) return;

      // Alleen siblings op hetzelfde Y-niveau sorteren (anders is het een ander probleem)
      const primaryY = Math.round(pos[siblings[0]].y);
      const sameLevelSibs = siblings.filter(id => Math.abs(pos[id].y - primaryY) < NODE_H);
      if (sameLevelSibs.length < 2) return;

      const currentOrder = [...sameLevelSibs].sort((a, b) => pos[a].x - pos[b].x);
      const desiredOrder = [...sameLevelSibs].sort((a, b) => {
        const personA = getPerson(a), personB = getPerson(b);
        const isSocA = socialChildIds.has(a);
        const isSocB = socialChildIds.has(b);
        const boA = (isSocA && personA?.socialBirthOrder != null)
          ? personA.socialBirthOrder : personA?.birthOrder;
        const boB = (isSocB && personB?.socialBirthOrder != null)
          ? personB.socialBirthOrder : personB?.birthOrder;
        if (boA != null && boB != null) return boA - boB;
        if (boA != null) return -1;
        if (boB != null) return 1;
        const pa = parseBirthdate(personA?.birthdate);
        const pb = parseBirthdate(personB?.birthdate);
        if (!pa && !pb) return 0;
        if (!pa) return 1;
        if (!pb) return -1;
        if (pa.year !== pb.year) return pa.year - pb.year;
        if (pa.month && pb.month && pa.month !== pb.month) return pa.month - pb.month;
        if (pa.day && pb.day) return pa.day - pb.day;
        return 0;
      });
      if (desiredOrder.every((id, i) => id === currentOrder[i])) return;

      // Verzamel units (sibling + partners + crossFamilyGhosts op zelfde Y)
      // Units bevatten pos-IDs EN crossFamilyGhost keys (voor multi-card units)
      const units = {};
      sameLevelSibs.forEach(id => {
        const unitPosIds = [id];
        const unitGhostKeys = [];

        // Partners op zelfde Y-niveau en dichtbij (excl. andere siblings)
        (partnersOf[id] || []).forEach(pid => {
          if (pos[pid] && Math.abs(pos[pid].y - primaryY) < NODE_H &&
              Math.abs(pos[pid].x - pos[id].x) <= 3 * (NODE_W + H_GAP) &&
              !sameLevelSibs.includes(pid)) {
            unitPosIds.push(pid);
          }
        });

        // CrossFamilyGhosts adjacent to this sibling (via ghostMeta lookup)
        (ghostsAdjacentTo[id] || []).forEach(gid => {
          const gm = ghostMeta[gid];
          if (!gm) return;
          const gk = gm.personId + ':cg:' + gm.adjacentTo;
          const gh = crossFamilyGhosts[gk];
          if (gh && Math.abs(gh.y - primaryY) < NODE_H) {
            unitGhostKeys.push(gk);
          }
        });

        units[id] = { posIds: unitPosIds, ghostKeys: unitGhostKeys };
      });

      // Sla originele sibling-posities op voor cascade-delta
      const origBOPos = {};
      sameLevelSibs.forEach(id => {
        origBOPos[id] = { x: pos[id].x, y: pos[id].y };
      });

      // Bereken startX: linkerkant van alle units in huidige volgorde
      const allUnitXs = [];
      currentOrder.forEach(id => {
        const u = units[id];
        u.posIds.forEach(uid => { if (pos[uid]) allUnitXs.push(pos[uid].x); });
        u.ghostKeys.forEach(gk => {
          const gh = crossFamilyGhosts[gk];
          if (gh) allUnitXs.push(gh.x);
        });
      });
      if (!allUnitXs.length) return;
      const startBOX = Math.min(...allUnitXs);

      // SEQUENTIËLE PLAATSING: units links-naar-rechts in gewenste volgorde
      // Elke unit verbruikt zijn volledige breedte (multi-card units nemen meer ruimte)
      // Collect all IDs in this group's units (siblings + their partners/ghosts)
      const allGroupPosIds = new Set();
      const allGroupGhostKeys = new Set();
      sameLevelSibs.forEach(id => {
        const u = units[id];
        u.posIds.forEach(uid => allGroupPosIds.add(uid));
        u.ghostKeys.forEach(gk => allGroupGhostKeys.add(gk));
      });
      // Check if a position is occupied by a non-group card at the same Y
      const isBlockedByNonGroup = (tx) => {
        for (const nid of Object.keys(pos)) {
          if (allGroupPosIds.has(nid) || !pos[nid]) continue;
          if (Math.abs(pos[nid].y - primaryY) >= NODE_H) continue;
          if (Math.abs(pos[nid].x - tx) < NODE_W + H_GAP / 2) return true;
        }
        for (const [gk, gh] of Object.entries(crossFamilyGhosts)) {
          if (allGroupGhostKeys.has(gk)) continue;
          if (Math.abs(gh.y - primaryY) >= NODE_H) continue;
          if (Math.abs(gh.x - tx) < NODE_W + H_GAP / 2) return true;
        }
        return false;
      };

      let curBOX = startBOX;
      desiredOrder.forEach(id => {
        const u = units[id];

        // Alle members met hun huidige X, gesorteerd op positie
        const members = [];
        u.posIds.forEach(uid => {
          if (pos[uid]) members.push({ type: 'pos', id: uid, x: pos[uid].x });
        });
        u.ghostKeys.forEach(gk => {
          const gh = crossFamilyGhosts[gk];
          if (gh) members.push({ type: 'ghost', key: gk, x: gh.x });
        });
        members.sort((a, b) => a.x - b.x);
        if (!members.length) return;

        // Plaats elke member, skip posities bezet door niet-groep kaarten
        members.forEach((m, i) => {
          while (isBlockedByNonGroup(curBOX)) curBOX += NODE_W + H_GAP;
          if (m.type === 'pos') {
            pos[m.id].x = curBOX;
          } else {
            crossFamilyGhosts[m.key].x = curBOX;
          }
          curBOX += NODE_W + H_GAP;
        });

        // Cascade naar nakomelingen met de sibling's eigen delta
        const sibDx = pos[id].x - origBOPos[id].x;
        if (Math.abs(sibDx) > 0.5) {
          (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid => {
            if (crossFamilyChildAnchor[cid] && crossFamilyChildAnchor[cid] !== id) return;
            if (pos[cid]) shiftWithDescendants(cid, sibDx);
          });
        }
      });
    });
    resolveOverlaps(pos, verticalGroupMap);


    // Ghost-sync na re-sort: als ghost te ver van adjacentTo staat, sync terug
    Object.entries(crossFamilyGhosts).forEach(([key, g]) => {
      const adj = pos[g.adjacentTo];
      if (!adj) return;
      if (Math.abs(g.x - adj.x) > 3 * (NODE_W + H_GAP) || Math.abs(g.y - adj.y) > NODE_H) {
        g.y = adj.y;
        g.x = adj.x + NODE_W + H_GAP;
      }
    });

    // Ghost-overlap fix na re-sort: ghosts die overlappen verschuiven
    // Partner altijd RECHTS van kind — zoek alleen rechts
    Object.entries(crossFamilyGhosts).forEach(([key, g]) => {
      const hasOverlap = Object.keys(pos).some(nid =>
        pos[nid] && Math.abs(pos[nid].x - g.x) < NODE_W && Math.abs(pos[nid].y - g.y) < NODE_H);
      const hasGhostOverlap = Object.entries(crossFamilyGhosts).some(([k2, g2]) =>
        k2 !== key && Math.abs(g2.x - g.x) < NODE_W && Math.abs(g2.y - g.y) < NODE_H);
      if (!hasOverlap && !hasGhostOverlap) return;
      const isFree = (tx) =>
        !Object.keys(pos).some(nid =>
          pos[nid] && Math.abs(pos[nid].x - tx) < NODE_W && Math.abs(pos[nid].y - g.y) < NODE_H) &&
        !Object.values(crossFamilyGhosts).some(g2 =>
          g2 !== g && Math.abs(g2.x - tx) < NODE_W && Math.abs(g2.y - g.y) < NODE_H);
      const adj = pos[g.adjacentTo];
      if (adj) {
        // Partner altijd rechts: zoek vrije plek rechts van adjacentTo
        for (let d = 1; d <= 10; d++) {
          const rx = adj.x + d * (NODE_W + H_GAP);
          if (isFree(rx)) { g.x = rx; g.y = adj.y; return; }
        }
      }
      // Fallback: zoek rechts van huidige positie
      for (let d = 1; d <= 10; d++) {
        const rx = g.x + d * (NODE_W + H_GAP);
        if (isFree(rx)) { g.x = rx; return; }
      }
    });
  }

  // ===== HALF-SIBLING GROEPERING =====
  // Na birthorder re-sort kunnen half-siblings (kinderen van zelfde vader,
  // verschillende moeders) nog door elkaar staan. Groepeer ze per ouder-paar.
  {
    const hsGroupsByY = {};
    Object.entries(parentKeyOf).forEach(([childId, pKey]) => {
      if (!pos[childId]) return;
      const yKey = Math.round(pos[childId].y);
      if (!hsGroupsByY[yKey]) hsGroupsByY[yKey] = {};
      if (!hsGroupsByY[yKey][pKey]) hsGroupsByY[yKey][pKey] = [];
      hsGroupsByY[yKey][pKey].push(childId);
    });

    Object.entries(hsGroupsByY).forEach(([yKey, groups]) => {
      const groupKeys = Object.keys(groups);
      if (groupKeys.length < 2) return;
      // Check: delen groepen een ouder? (half-siblings)
      const allPids = new Set();
      let shared = false;
      for (const pk of groupKeys) {
        for (const pid of pk.split(',')) {
          if (allPids.has(pid)) { shared = true; break; }
          allPids.add(pid);
        }
        if (shared) break;
      }
      if (!shared) return;

      // Bouw groepslijst met parentCenter-sortering
      const step = NODE_W + H_GAP;
      const gList = groupKeys.map(pKey => {
        const ids = groups[pKey];
        // Include partners op zelfde Y
        const allIds = new Set(ids);
        ids.forEach(cid => {
          (partnersOf[cid] || []).forEach(pid => {
            if (pos[pid] && Math.abs(pos[pid].y - pos[cid].y) < NODE_H / 2) allIds.add(pid);
          });
        });
        const expanded = [...allIds].filter(id => pos[id]);
        if (!expanded.length) return null;
        const parentIds = pKey.split(',');
        const pxs = parentIds.filter(pid => pos[pid]).map(pid => pos[pid].x + NODE_W / 2);
        const pCenter = pxs.length ? pxs.reduce((s,x) => s+x, 0) / pxs.length : 0;
        return { pKey, ids: expanded, pCenter };
      }).filter(Boolean).sort((a, b) => a.pCenter - b.pCenter);

      if (gList.length < 2) return;

      // Check: zijn ze al gegroepeerd (niet interleaved)?
      let isInterleaved = false;
      for (let i = 0; i < gList.length - 1 && !isInterleaved; i++) {
        const aMax = Math.max(...gList[i].ids.map(id => pos[id].x));
        const bMin = Math.min(...gList[i+1].ids.map(id => pos[id].x));
        if (bMin < aMax + H_GAP) isInterleaved = true;
      }
      if (!isInterleaved) return;

      // Herplaats: alle groepen sequentieel
      const allIds = [];
      gList.forEach(g => g.ids.forEach(id => allIds.push(id)));
      const startX = Math.min(...allIds.map(id => pos[id].x));
      const origX = {};
      allIds.forEach(id => { origX[id] = pos[id].x; });

      let curX = startX;
      gList.forEach(g => {
        // Sorteer binnen groep op huidige x
        const sorted = [...g.ids].sort((a, b) => pos[a].x - pos[b].x);
        sorted.forEach(id => {
          pos[id].x = curX;
          curX += step;
        });
      });

      // Cascade kinderen mee
      const movedSet = new Set(allIds);
      allIds.forEach(id => {
        const dx = pos[id].x - origX[id];
        if (Math.abs(dx) < 1) return;
        (childrenOf[id] || []).forEach(cid => {
          if (pos[cid] && !movedSet.has(cid)) {
            shiftWithDescendants(cid, dx);
          }
        });
      });
    });
    resolveOverlaps(pos, verticalGroupMap);
  }


  // ===== CROSS-FAMILY CENTERING CORRECTIE =====
  // Na alle layout-stappen (centering, resolveOverlaps, fixGhostOverlaps, Y-compressie,
  // birthorder sort) zijn ghost- en ouder-posities nu stabiel. Corrigeer cross-family
  // kinderen: verschuif ze richting het ghost-paar (ouder + ghost naast partner).
  {
    const YSTEP = NODE_H + V_GAP + 45; // 235px
    // Vind cross-family ouder-paren: ouders op verschillende Y-niveaus
    const cfGroups = {};
    state.relationships.forEach(r => {
      if ((r.type !== 'parent-child' && r.type !== 'social-parent') || !pos[r.childId]) return;
      if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
      const pids = state.relationships
        .filter(rel => (rel.type === 'parent-child' || rel.type === 'social-parent') && rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      if (pids.length !== 2) return;
      if (Math.abs(pos[pids[0]].y - pos[pids[1]].y) <= NODE_H) return;
      const key = pids.join(',');
      if (!cfGroups[key]) cfGroups[key] = { parents: pids, children: new Set() };
      cfGroups[key].children.add(r.childId);
    });

    Object.values(cfGroups).forEach(({ parents, children }) => {
      const cids = [...children].filter(id => pos[id]);
      if (cids.length < 1) return;

      // Groepeer per Y-niveau
      const cidsByY = {};
      cids.forEach(cid => {
        const y = Math.round(pos[cid].y);
        if (!cidsByY[y]) cidsByY[y] = [];
        cidsByY[y].push(cid);
      });

      Object.entries(cidsByY).forEach(([yStr, yCids]) => {
        const cY = parseInt(yStr);
        if (yCids.length < 1) return;

        const [p1, p2] = parents;
        const closerP = Math.abs(pos[p1].y - cY) < Math.abs(pos[p2].y - cY) ? p1 : p2;
        const fartherP = closerP === p1 ? p2 : p1;

        // Zoek ghost van fartherP naast closerP
        const ghostKey = fartherP + ':cg:' + closerP;
        const ghost = crossFamilyGhosts[ghostKey];
        let pCX;
        if (ghost) {
          pCX = (pos[closerP].x + NODE_W / 2 + ghost.x + NODE_W / 2) / 2;
        } else {
          pCX = pos[closerP].x + NODE_W / 2;
        }

        // Verzamel allIds (kinderen + inlaw partners)
        const allIds = [...yCids];
        yCids.forEach(cid => {
          (partnersOf[cid] || []).forEach(pid => {
            if (pos[pid] && Math.abs(pos[pid].y - cY) < NODE_H &&
                !(parentsOf[pid] || []).some(ppid => pos[ppid]) &&
                !allIds.includes(pid)) {
              allIds.push(pid);
            }
          });
        });
        allIds.sort((a, b) => pos[a].x - pos[b].x);

        // Bereken huidige center en offset
        const grpMinX = Math.min(...allIds.map(id => pos[id].x));
        const grpMaxX = Math.max(...allIds.map(id => pos[id].x)) + NODE_W;
        const grpW = grpMaxX - grpMinX;
        const cCenter = (grpMinX + grpMaxX) / 2;
        const desiredDx = pCX - cCenter;
        if (Math.abs(desiredDx) <= 30) return;

        // Probeer centreren op huidig Y-niveau met obstakels
        const grpSet = new Set(allIds);
        let internalObs = false;
        let closestLeftR = -Infinity;
        let closestRightL = Infinity;
        Object.keys(pos).forEach(nid => {
          if (grpSet.has(nid) || !pos[nid]) return;
          if (nid.startsWith && nid.startsWith(CROSS_GHOST_PREFIX)) return;
          if (Math.abs(pos[nid].y - cY) >= NODE_H) return;
          const l = pos[nid].x, r = pos[nid].x + NODE_W;
          if (l < grpMaxX && r > grpMinX) { internalObs = true; }
          if (r <= grpMinX) closestLeftR = Math.max(closestLeftR, r);
          if (l >= grpMaxX) closestRightL = Math.min(closestRightL, l);
        });

        let dx = 0;
        let moveToNewY = false;

        if (!internalObs) {
          if (desiredDx < 0) {
            const maxLeft = closestLeftR > -Infinity
              ? grpMinX - closestLeftR - H_GAP
              : grpMinX - PADDING;
            dx = Math.max(desiredDx, -Math.max(0, maxLeft));
          } else {
            const maxRight = closestRightL < Infinity
              ? closestRightL - H_GAP - grpMaxX
              : desiredDx;
            dx = Math.min(desiredDx, Math.max(0, maxRight));
          }
          if (grpMinX + dx < PADDING) dx = PADDING - grpMinX;
          // Als de shift minder dan 40% van gewenst is, probeer een nieuw Y-niveau
          if (Math.abs(desiredDx) > 200 && Math.abs(dx) < Math.abs(desiredDx) * 0.4) {
            moveToNewY = true;
          }
        } else {
          moveToNewY = true;
        }

        if (moveToNewY && Math.abs(desiredDx) > 200) {
          // Kan niet centreren op huidig Y → verplaats naar nieuw Y-niveau
          // Zoek eerste vrije Y-laag waar centrering mogelijk is
          const closerPY = pos[closerP].y;
          for (let tryY = closerPY + YSTEP; tryY <= closerPY + 10 * YSTEP; tryY += YSTEP) {
            // Check of dit Y-niveau vrij is rond pCX
            const idealStartX = pCX - grpW / 2;
            const idealEndX = idealStartX + grpW;
            let blocked = false;
            Object.keys(pos).forEach(nid => {
              if (grpSet.has(nid) || !pos[nid]) return;
              if (Math.abs(pos[nid].y - tryY) >= NODE_H) return;
              const l = pos[nid].x, r = pos[nid].x + NODE_W;
              if (l < idealEndX + H_GAP && r > idealStartX - H_GAP) blocked = true;
            });
            Object.values(crossFamilyGhosts).forEach(g => {
              if (Math.abs(g.y - tryY) >= NODE_H) return;
              if (g.x < idealEndX + H_GAP && g.x + NODE_W > idealStartX - H_GAP) blocked = true;
            });
            if (!blocked) {
              // Vrij Y-niveau gevonden → verplaats kinderen hierheen, gecentreerd
              let cx = idealStartX;
              allIds.forEach(id => {
                pos[id].x = cx;
                pos[id].y = tryY;
                cx += NODE_W + H_GAP;
              });
              dx = 0;
              break;
            }
          }
        } else if (Math.abs(dx) > 3) {
          allIds.forEach(id => { pos[id].x += dx; });
        }
      });
    });
    // Ghost-overlaps kunnen ontstaan door verschuiving; fix ze
    // Partner altijd RECHTS van kind — zoek alleen rechts
    Object.entries(crossFamilyGhosts).forEach(([key, g]) => {
      const hasOv = Object.keys(pos).some(nid =>
        pos[nid] && Math.abs(pos[nid].x - g.x) < NODE_W && Math.abs(pos[nid].y - g.y) < NODE_H);
      if (!hasOv) return;
      const adj = pos[g.adjacentTo];
      const isFreeC = (tx) =>
        !Object.keys(pos).some(nid =>
          pos[nid] && Math.abs(pos[nid].x - tx) < NODE_W && Math.abs(pos[nid].y - g.y) < NODE_H) &&
        !Object.values(crossFamilyGhosts).some(g2 =>
          g2 !== g && Math.abs(g2.x - tx) < NODE_W && Math.abs(g2.y - g.y) < NODE_H);
      // Partner altijd rechts: zoek vrije plek rechts van adjacentTo
      const baseX = adj ? adj.x : g.x;
      for (let d = 1; d <= 15; d++) {
        const rx = baseX + d * (NODE_W + H_GAP);
        if (isFreeC(rx)) { g.x = rx; return; }
      }
    });
  }



  // ===== UNIVERSELE CENTERING AFDWINGING =====
  // Check ALLE families: kinderen moeten gecentreerd staan onder ouders.
  // Als dat niet kan op het huidige Y-niveau (obstakels), verplaats naar nieuw Y-niveau.
  {
    const YSTEP_UC = NODE_H + V_GAP + 45; // 235px
    const MIN_OFFSET = 80; // px verschil voordat we ingrijpen
    const pcRels = state.relationships.filter(r => r.type === 'parent-child' || r.type === 'social-parent');

    // Bouw parent-paar → kinderen mapping
    const ucGroups = {};
    pcRels.forEach(r => {
      if (!pos[r.childId]) return;
      if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
      const pids = pcRels
        .filter(rel => rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      if (!pids.length) return;
      const key = pids.join(',');
      if (!ucGroups[key]) ucGroups[key] = { parents: pids, children: new Set() };
      ucGroups[key].children.add(r.childId);
    });

    // Verwerk families met de grootste offset eerst
    const ucCandidates = [];
    Object.values(ucGroups).forEach(({ parents, children }) => {
      const cids = [...children].filter(id => pos[id]);
      if (!cids.length) return;
      const parentsInLayout = parents.filter(id => pos[id]);
      if (!parentsInLayout.length) return;

      // Bereken ouder-center
      let pCX;
      if (parentsInLayout.length === 2 &&
          Math.abs(pos[parentsInLayout[0]].y - pos[parentsInLayout[1]].y) > NODE_H) {
        // Cross-family: gebruik dichtstbijzijnde ouder + ghost
        const childY = Math.min(...cids.map(id => pos[id].y));
        const [p1, p2] = parentsInLayout;
        const closerP = Math.abs(pos[p1].y - childY) < Math.abs(pos[p2].y - childY) ? p1 : p2;
        const fartherP = closerP === p1 ? p2 : p1;
        const ghostKey = fartherP + ':cg:' + closerP;
        const ghost = crossFamilyGhosts[ghostKey];
        if (ghost && ghost.x !== undefined) {
          pCX = (pos[closerP].x + NODE_W / 2 + ghost.x + NODE_W / 2) / 2;
        } else {
          pCX = pos[closerP].x + NODE_W / 2;
        }
      } else {
        const pMinX = Math.min(...parentsInLayout.map(id => pos[id].x));
        const pMaxX = Math.max(...parentsInLayout.map(id => pos[id].x)) + NODE_W;
        pCX = (pMinX + pMaxX) / 2;
      }
      const minPY = Math.min(...parentsInLayout.map(id => pos[id].y));

      // Groepeer kinderen per Y-niveau
      const cidsByY = {};
      cids.forEach(cid => {
        const y = Math.round(pos[cid].y);
        if (!cidsByY[y]) cidsByY[y] = [];
        cidsByY[y].push(cid);
      });

      Object.entries(cidsByY).forEach(([yStr, yCids]) => {
        const cY = parseInt(yStr);
        if (cY <= minPY) return; // kinderen boven ouders → skip

        // Verzamel alle IDs (kinderen + inlaw partners op zelfde Y)
        const allIds = [...yCids];
        yCids.forEach(cid => {
          (partnersOf[cid] || []).forEach(pid => {
            if (pos[pid] && Math.abs(pos[pid].y - cY) < NODE_H &&
                !(parentsOf[pid] || []).some(ppid => pos[ppid]) &&
                !allIds.includes(pid)) {
              allIds.push(pid);
            }
          });
        });
        allIds.sort((a, b) => pos[a].x - pos[b].x);

        const grpMinX = Math.min(...allIds.map(id => pos[id].x));
        const grpMaxX = Math.max(...allIds.map(id => pos[id].x)) + NODE_W;
        const grpW = grpMaxX - grpMinX;
        const cCenter = (grpMinX + grpMaxX) / 2;
        const offset = pCX - cCenter;

        if (Math.abs(offset) <= MIN_OFFSET) return;

        ucCandidates.push({
          parents: parentsInLayout, pCX, allIds, yCids, cY, grpW,
          offset, absOff: Math.abs(offset), minPY
        });
      });
    });

    // Sorteer: grootste offset eerst
    ucCandidates.sort((a, b) => b.absOff - a.absOff);
    const ucMoved = new Set();

    ucCandidates.forEach(cand => {
      // Skip als deze kinderen al verplaatst zijn
      if (cand.allIds.some(id => ucMoved.has(id))) return;

      const { pCX, allIds, cY, grpW, offset, minPY } = cand;

      // Half-sibling check: niet shiften als halfbroers/zussen op zelfde Y staan
      // (voorkomt interleaving van kinderen van verschillende moeders)
      {
        const grpSetHs = new Set(allIds);
        const myParents = new Set();
        cand.yCids.forEach(cid => {
          pcRels.filter(r => r.childId === cid).forEach(r => myParents.add(r.parentId));
        });
        let hasHalfSib = false;
        Object.keys(pos).forEach(nid => {
          if (hasHalfSib || grpSetHs.has(nid) || !pos[nid]) return;
          if (Math.abs(pos[nid].y - cY) >= NODE_H) return;
          pcRels.filter(r => r.childId === nid).forEach(r => {
            if (myParents.has(r.parentId)) hasHalfSib = true;
          });
        });
        if (hasHalfSib) return;
      }

      // Probeer eerst te shiften op huidig Y-niveau
      const grpSet = new Set(allIds);
      const grpMinX = Math.min(...allIds.map(id => pos[id].x));
      const grpMaxX = Math.max(...allIds.map(id => pos[id].x)) + NODE_W;
      let internalObs = false;
      let closestLeftR = -Infinity;
      let closestRightL = Infinity;
      Object.keys(pos).forEach(nid => {
        if (grpSet.has(nid) || !pos[nid]) return;
        if (nid.startsWith && nid.startsWith(CROSS_GHOST_PREFIX)) return;
        if (Math.abs(pos[nid].y - cY) >= NODE_H) return;
        const l = pos[nid].x, r = pos[nid].x + NODE_W;
        if (l < grpMaxX && r > grpMinX) { internalObs = true; }
        if (r <= grpMinX) closestLeftR = Math.max(closestLeftR, r);
        if (l >= grpMaxX) closestRightL = Math.min(closestRightL, l);
      });

      let dx = 0;
      if (!internalObs) {
        if (offset < 0) {
          const maxLeft = closestLeftR > -Infinity
            ? grpMinX - closestLeftR - H_GAP : grpMinX - PADDING;
          dx = Math.max(offset, -Math.max(0, maxLeft));
        } else {
          const maxRight = closestRightL < Infinity
            ? closestRightL - H_GAP - grpMaxX : offset;
          dx = Math.min(offset, Math.max(0, maxRight));
        }
        if (grpMinX + dx < PADDING) dx = PADDING - grpMinX;
      }

      // Check of shift voldoende is (>90% van gewenst = bijna perfect gecentreerd)
      if (Math.abs(dx) >= Math.abs(offset) * 0.9) {
        // Shift is goed genoeg → toepassen
        if (Math.abs(dx) > 3) {
          allIds.forEach(id => { pos[id].x += dx; });
          allIds.forEach(id => ucMoved.add(id));
        }
        return;
      }

      // Shift onvoldoende → verplaats naar nieuw Y-niveau, gecentreerd
      // Verzamel ook afstammelingen die mee moeten verhuizen
      const moveSet = new Set(allIds);
      const collectDesc = (id) => {
        (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid => {
          if (!pos[cid] || moveSet.has(cid)) return;
          moveSet.add(cid);
          // Partners meenemen
          (partnersOf[cid] || []).forEach(pid => {
            if (pos[pid] && !moveSet.has(pid) &&
                !(parentsOf[pid] || []).some(ppid => pos[ppid] && !moveSet.has(ppid))) {
              moveSet.add(pid);
            }
          });
          collectDesc(cid);
        });
      };
      allIds.forEach(id => collectDesc(id));

      // Zoek eerste vrije Y-laag
      for (let tryY = minPY + YSTEP_UC; tryY <= minPY + 15 * YSTEP_UC; tryY += YSTEP_UC) {
        const idealStartX = pCX - grpW / 2;
        const idealEndX = idealStartX + grpW;
        let blocked = false;
        Object.keys(pos).forEach(nid => {
          if (moveSet.has(nid) || !pos[nid]) return;
          if (Math.abs(pos[nid].y - tryY) >= NODE_H) return;
          const l = pos[nid].x, r = pos[nid].x + NODE_W;
          if (l < idealEndX + H_GAP && r > idealStartX - H_GAP) blocked = true;
        });
        Object.values(crossFamilyGhosts).forEach(g => {
          if (Math.abs(g.y - tryY) >= NODE_H) return;
          if (g.x < idealEndX + H_GAP && g.x + NODE_W > idealStartX - H_GAP) blocked = true;
        });

        if (!blocked) {
          // Verplaats: kinderen op de eerste rij, gecentreerd
          const dy = tryY - cY;
          let cx = idealStartX;
          allIds.forEach(id => {
            pos[id].x = cx;
            pos[id].y = tryY;
            cx += NODE_W + H_GAP;
          });
          // Verschuif afstammelingen met dezelfde dy
          moveSet.forEach(id => {
            if (!allIds.includes(id) && pos[id]) {
              pos[id].y += dy;
            }
          });
          allIds.forEach(id => ucMoved.add(id));
          moveSet.forEach(id => ucMoved.add(id));
          break;
        }
      }
    });

    if (ucMoved.size > 0) {
      resolveOverlaps(pos, verticalGroupMap);
    }
  }

  // ===== FINALE GHOST RECHTS AFDWINGING =====
  // Allerlaatste controle: elk ghost MOET rechts van adjacentTo staan.
  // Eerdere stappen (birth-order sort, centering, resolveOverlaps) kunnen ghosts
  // naar links verplaatst hebben. Forceer nu de juiste positie.
  {
    const step = NODE_W + H_GAP;
    Object.entries(crossFamilyGhosts).forEach(([key, g]) => {
      const adj = pos[g.adjacentTo];
      if (!adj) return;
      // Check of ghost rechts staat (direct naast adjacentTo)
      const idealX = adj.x + step;
      if (Math.abs(g.x - idealX) < 5 && Math.abs(g.y - adj.y) < NODE_H) return; // al goed

      // Ghost staat niet direct rechts → forceer
      const isFreeG = (tx) =>
        !Object.keys(pos).some(nid =>
          pos[nid] && Math.abs(pos[nid].x - tx) < NODE_W && Math.abs(pos[nid].y - adj.y) < NODE_H) &&
        !Object.entries(crossFamilyGhosts).some(([k2, g2]) =>
          k2 !== key && Math.abs(g2.x - tx) < NODE_W && Math.abs(g2.y - adj.y) < NODE_H);

      if (isFreeG(idealX)) {
        g.x = idealX;
        g.y = adj.y;
      } else {
        // Rechts bezet → maak ruimte door alles rechts van adj te verschuiven
        Object.keys(pos).forEach(nid => {
          if (pos[nid] && Math.abs(pos[nid].y - adj.y) < NODE_H && pos[nid].x >= idealX - 1 && nid !== g.adjacentTo) {
            pos[nid].x += step;
          }
        });
        Object.entries(crossFamilyGhosts).forEach(([k2, g2]) => {
          if (k2 !== key && Math.abs(g2.y - adj.y) < NODE_H && g2.x >= idealX - 1) {
            g2.x += step;
          }
        });
        g.x = idealX;
        g.y = adj.y;
      }
    });
    resolveOverlaps(pos, verticalGroupMap);
  }

  // ===== GROTE FAMILIE Y-SPREIDING =====
  // Wanneer een Y-niveau te veel nodes bevat van meerdere families,
  // verplaats de grootste broer/zus-groep naar een lager Y-niveau.
  if (false) { // TIJDELIJK UITGESCHAKELD VOOR TEST
  // Dit geeft andere families ruimte om hun kinderen correct te centreren.
  {
    const spPcRels = state.relationships.filter(r => r.type === 'parent-child' || r.type === 'social-parent');

    // Groepeer nodes per Y-niveau (afronden op 10px voor tolerantie)
    const yBuckets = {};
    Object.keys(pos).forEach(nid => {
      if (nid.startsWith && nid.startsWith(CROSS_GHOST_PREFIX)) return;
      const y = Math.round(pos[nid].y / 10) * 10;
      if (!yBuckets[y]) yBuckets[y] = [];
      yBuckets[y].push(nid);
    });

    const SP_MIN_FAMILY = 5;   // minimale familiegrootte om te verplaatsen
    const SP_YSTEP = NODE_H + effectiveVGap;
    let spreadMoved = false;

    Object.entries(yBuckets).forEach(([yStr, nodeIds]) => {
      if (spreadMoved) return; // max 1 spread per run
      const denseY = parseInt(yStr);

      // Groepeer nodes op dit Y-niveau per ouder-set (= per familie)
      const famMap = {};
      nodeIds.forEach(nid => {
        const pids = spPcRels
          .filter(r => r.childId === nid && pos[r.parentId])
          .map(r => r.parentId).sort();
        if (!pids.length) return;
        const key = pids.join(',');
        if (!famMap[key]) famMap[key] = [];
        famMap[key].push(nid);
      });

      const fams = Object.values(famMap).sort((a, b) => b.length - a.length);
      if (fams.length < 2) return;           // slechts 1 familie → geen congestie
      if (nodeIds.length < 8) return;        // te weinig nodes op dit Y-niveau
      if (fams[0].length < SP_MIN_FAMILY) return; // grootste familie te klein
      // Alleen verplaatsen als de grootste duidelijk domineert (≥2x de op-één-na-grootste)
      if (fams[0].length < fams[1].length * 2) return;

      // Check X-nabijheid: alleen triggeren als families elkaar daadwerkelijk
      // in de weg zitten (overlappende X-bereiken). Als ze ver uit elkaar staan
      // (bijv. verschillende bomen in "Alle families" view), geen actie nodig.
      const largestXs = fams[0].map(id => pos[id].x);
      const lgLeft = Math.min(...largestXs);
      const lgRight = Math.max(...largestXs) + NODE_W;
      const PROX_MARGIN = NODE_W * 3; // 540px marge
      const hasNearbyFamily = fams.slice(1).some(fam => {
        const fXs = fam.map(id => pos[id].x);
        const fLeft = Math.min(...fXs);
        const fRight = Math.max(...fXs) + NODE_W;
        return fLeft <= lgRight + PROX_MARGIN && fRight >= lgLeft - PROX_MARGIN;
      });
      if (!hasNearbyFamily) return;

      const largestKids = fams[0];

      // Bepaal welke kinderen VERPLAATSBAAR zijn:
      // Een kind kan NIET verplaatsen als het eigen kinderen heeft
      // waarvan een ouder NIET meeverhuist (cross-family huwelijk).
      // Anders zouden kinderen boven hun ouder komen te staan.
      const candidateSet = new Set(largestKids);

      // Voeg aangetrouwde partners toe (geen eigen ouders in layout)
      largestKids.forEach(cid => {
        (partnersOf[cid] || []).forEach(pid => {
          if (!pos[pid] || candidateSet.has(pid)) return;
          if (Math.abs(pos[pid].y - denseY) >= NODE_H) return;
          const pP = (parentsOf[pid] || []).filter(ppid => pos[ppid]);
          if (pP.length === 0) candidateSet.add(pid);
        });
      });

      // Check per kandidaat of verplaatsing veilig is
      const movable = new Set();
      const checkSafe = (cid, visited) => {
        if (visited.has(cid)) return true;
        visited.add(cid);
        const kids = (fullChildrenOf[cid] || childrenOf[cid] || []).filter(k => pos[k]);
        for (const kid of kids) {
          const kidParents = (parentsOf[kid] || []).filter(ppid => pos[ppid]);
          const hasOutsideParent = kidParents.some(ppid => !candidateSet.has(ppid));
          if (hasOutsideParent && pos[kid].y > pos[cid].y) return false;
          if (!hasOutsideParent && !checkSafe(kid, visited)) return false;
        }
        return true;
      };

      largestKids.forEach(cid => {
        if (checkSafe(cid, new Set())) movable.add(cid);
      });

      if (movable.size < SP_MIN_FAMILY) return;

      // Bouw moveSet: verplaatsbare kinderen + partners + nakomelingen
      const moveSet = new Set(movable);
      movable.forEach(cid => {
        (partnersOf[cid] || []).forEach(pid => {
          if (candidateSet.has(pid)) moveSet.add(pid);
        });
      });

      const addDescSp = (id) => {
        (fullChildrenOf[id] || childrenOf[id] || []).forEach(kid => {
          if (!pos[kid] || moveSet.has(kid)) return;
          const kidParents = (parentsOf[kid] || []).filter(ppid => pos[ppid]);
          if (kidParents.some(ppid => !moveSet.has(ppid))) return;
          moveSet.add(kid);
          (partnersOf[kid] || []).forEach(pid => {
            if (pos[pid] && !moveSet.has(pid)) moveSet.add(pid);
          });
          addDescSp(kid);
        });
      };
      movable.forEach(cid => addDescSp(cid));

      // Bereken parent-center voor centreren na verplaatsing
      const moveAtY = [...movable].filter(id => Math.abs(pos[id].y - denseY) < NODE_H);
      if (!moveAtY.length) return;
      const parentIds = famMap[Object.keys(famMap).find(k => famMap[k] === fams[0])]
        ? [] : [];
      // Vind de ouders van de grootste familie
      const sampleKid = moveAtY[0];
      const spParents = spPcRels
        .filter(r => r.childId === sampleKid && pos[r.parentId])
        .map(r => r.parentId);
      let pCX;
      if (spParents.length >= 2) {
        const px = spParents.map(id => pos[id].x);
        pCX = (Math.min(...px) + Math.max(...px) + NODE_W) / 2;
      } else if (spParents.length === 1) {
        pCX = pos[spParents[0]].x + NODE_W / 2;
      } else {
        pCX = (Math.min(...moveAtY.map(id => pos[id].x)) +
               Math.max(...moveAtY.map(id => pos[id].x)) + NODE_W) / 2;
      }

      // Bereken totale breedte van de verplaatsbare groep op denseY
      const moveCount = moveAtY.length;
      const totalW = moveCount * NODE_W + (moveCount - 1) * H_GAP;
      const idealStartX = pCX - totalW / 2;

      // Zoek eerste vrije Y-laag (probeer tot 5 stappen omlaag)
      let foundY = -1;
      for (let step = 1; step <= 5; step++) {
        const tryY = denseY + step * SP_YSTEP;
        let blocked = false;
        Object.keys(pos).forEach(nid => {
          if (moveSet.has(nid) || !pos[nid]) return;
          if (Math.abs(pos[nid].y - tryY) >= NODE_H) return;
          if (pos[nid].x + NODE_W > idealStartX - H_GAP &&
              pos[nid].x < idealStartX + totalW + H_GAP) blocked = true;
        });
        Object.values(crossFamilyGhosts).forEach(g => {
          if (Math.abs(g.y - tryY) >= NODE_H) return;
          if (g.x + NODE_W > idealStartX - H_GAP &&
              g.x < idealStartX + totalW + H_GAP) blocked = true;
        });
        if (!blocked) { foundY = tryY; break; }
      }

      if (foundY < 0) return;

      // Verplaats: kinderen op nieuwe Y, gecentreerd onder ouders
      const yDelta = foundY - denseY;
      // Herpositioneer kinderen op nieuwe Y, gecentreerd
      let cx = idealStartX;
      moveAtY.sort((a, b) => pos[a].x - pos[b].x);
      moveAtY.forEach(id => {
        pos[id].x = cx;
        pos[id].y = foundY;
        cx += NODE_W + H_GAP;
      });
      // Verschuif ALLE afstammelingen (niet op denseY) met yDelta
      moveSet.forEach(id => {
        if (moveAtY.includes(id)) return; // al geplaatst
        if (pos[id]) pos[id].y += yDelta;
      });
      // Ghosts meeverplaatsen
      Object.entries(crossFamilyGhosts).forEach(([key, g]) => {
        if (moveSet.has(g.adjacentTo)) g.y += yDelta;
      });
      spreadMoved = true;
    });

    if (spreadMoved) resolveOverlaps(pos, verticalGroupMap);
  }
  } // EINDE TIJDELIJK UITGESCHAKELD




  // ===== FINALE CENTERING =====
  // Allerlaatste centering-pass: verschuif kindergroepen naar het exacte midden onder ouders.
  // Draait NA alle ghost-positionering en overlap-resolutie.
  // Verwerkt per Y-niveau van boven naar beneden zodat cascade-shifts niet conflicteren.
  {
    const fcPcRels = state.relationships.filter(r => r.type === 'parent-child' || r.type === 'social-parent');
    const fcGroups = {};
    fcPcRels.forEach(r => {
      if (!pos[r.childId] || (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX))) return;
      const pids = fcPcRels.filter(rel => rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      if (!pids.length) return;
      const key = pids.join(',');
      if (!fcGroups[key]) fcGroups[key] = { parents: pids, children: new Set() };
      fcGroups[key].children.add(r.childId);
    });

    // Verzamel alle centering-taken: (pCX, yCids, cY) per familie per Y-niveau
    const fcTasks = [];

    Object.values(fcGroups).forEach(({ parents, children }) => {
      const cids = [...children].filter(id => pos[id]);
      if (!cids.length) return;
      const pIL = parents.filter(id => pos[id]);
      if (!pIL.length) return;

      // Bereken ouder-center (pCX)
      let pCX;
      const isCF = pIL.length === 2 && Math.abs(pos[pIL[0]].y - pos[pIL[1]].y) > NODE_H;
      if (isCF) {
        const childY = Math.min(...cids.map(id => pos[id].y));
        const [p1, p2] = pIL;
        const cP = Math.abs(pos[p1].y - childY) < Math.abs(pos[p2].y - childY) ? p1 : p2;
        const fP = cP === p1 ? p2 : p1;
        const ghost = crossFamilyGhosts[fP + ':cg:' + cP];
        pCX = ghost && ghost.x !== undefined
          ? (pos[cP].x + NODE_W / 2 + ghost.x + NODE_W / 2) / 2
          : pos[cP].x + NODE_W / 2;
      } else {
        const px = pIL.map(id => pos[id].x);
        pCX = (Math.min(...px) + Math.max(...px) + NODE_W) / 2;
      }
      const minPY = Math.min(...pIL.map(id => pos[id].y));

      // Groepeer kinderen per Y-niveau
      const cidsByY = {};
      cids.forEach(cid => {
        const y = Math.round(pos[cid].y);
        if (!cidsByY[y]) cidsByY[y] = [];
        cidsByY[y].push(cid);
      });

      Object.entries(cidsByY).forEach(([yStr, yCids]) => {
        const cY = parseInt(yStr);
        if (cY <= minPY) return;
        fcTasks.push({ pIL, yCids, cY, isCF, cids });
      });
    });

    // Sorteer: kleinste Y eerst (bovenste niveau eerst verwerken)
    fcTasks.sort((a, b) => a.cY - b.cY);

    let fcMoved = false;

    // Multi-pass: herhaal tot convergentie (max 4 passes)
    for (let fcPass = 0; fcPass < 4; fcPass++) {
    let fcPassMoved = false;

    fcTasks.forEach(({ pIL, yCids, cY, isCF, cids }) => {
      // Herbereken pCX elke iteratie (ouderposities kunnen verschoven zijn door eerdere cascade)
      let pCX;
      if (isCF) {
        const childY = Math.min(...cids.filter(id => pos[id]).map(id => pos[id].y));
        const [p1, p2] = pIL;
        const cP = Math.abs(pos[p1].y - childY) < Math.abs(pos[p2].y - childY) ? p1 : p2;
        const fP = cP === p1 ? p2 : p1;
        const ghost = crossFamilyGhosts[fP + ':cg:' + cP];
        pCX = ghost && ghost.x !== undefined
          ? (pos[cP].x + NODE_W / 2 + ghost.x + NODE_W / 2) / 2
          : pos[cP].x + NODE_W / 2;
      } else {
        const px = pIL.map(id => pos[id].x);
        pCX = (Math.min(...px) + Math.max(...px) + NODE_W) / 2;
      }
      // Skip enkelvoudige kinderen met grote offset (cross-family verplaatst)
      if (yCids.length === 1 && Math.abs(pCX - (pos[yCids[0]].x + NODE_W / 2)) > 500) return;
      // Herbereken groepposities (kunnen veranderd zijn door eerdere shifts)
      const allIds = [...yCids];
      yCids.forEach(cid => {
        (partnersOf[cid] || []).forEach(pid => {
          if (pos[pid] && Math.abs(pos[pid].y - cY) < NODE_H && !allIds.includes(pid))
            allIds.push(pid);
        });
      });
      allIds.sort((a, b) => pos[a].x - pos[b].x);

      const grpMinX = Math.min(...allIds.map(id => pos[id].x));
      const grpMaxX = Math.max(...allIds.map(id => pos[id].x)) + NODE_W;
      const cCenter = (grpMinX + grpMaxX) / 2;
      const offset = pCX - cCenter;
      if (Math.abs(offset) <= 3) return;

      // Cross-family: begrens shift tot max 1 stap (grotere offset = waarschijnlijk onjuiste pCX)
      if (isCF && Math.abs(offset) > NODE_W + H_GAP) return;

      // Verzamel interne nodes (niet van deze familie, maar TUSSEN de groep)
      // en voeg ze toe aan moveSet ipv te skippen
      const grpSet = new Set(allIds);
      const internalIds = [];
      Object.keys(pos).forEach(nid => {
        if (grpSet.has(nid) || !pos[nid]) return;
        if (Math.abs(pos[nid].y - cY) >= NODE_H) return;
        if (pos[nid].x + NODE_W > grpMinX && pos[nid].x < grpMaxX) {
          internalIds.push(nid);
          grpSet.add(nid);
        }
      });
      // Interne ghosts ook meenemen
      const internalGhostKeys = [];
      Object.entries(crossFamilyGhosts).forEach(([key, g]) => {
        if (Math.abs(g.y - cY) >= NODE_H) return;
        if (allIds.includes(g.adjacentTo)) return;
        if (g.x + NODE_W > grpMinX && g.x < grpMaxX) {
          internalGhostKeys.push(key);
        }
      });

      // Herbereken groepsgrenzen inclusief interne nodes
      const expandedIds = [...allIds, ...internalIds];
      const expMinX = Math.min(...expandedIds.map(id => pos[id].x));
      const expMaxX = Math.max(...expandedIds.map(id => pos[id].x)) + NODE_W;

      // Bereken maximale veilige shift (alleen EXTERNE obstakels)
      // Geen PADDING-limiet: X-NORMALISATIE corrigeert negatieve posities na deze stap
      let maxLeft = 99999;
      let maxRight = 99999;
      Object.keys(pos).forEach(nid => {
        if (grpSet.has(nid) || !pos[nid]) return;
        if (Math.abs(pos[nid].y - cY) >= NODE_H) return;
        if (pos[nid].x + NODE_W <= expMinX)
          maxLeft = Math.min(maxLeft, expMinX - pos[nid].x - NODE_W - H_GAP);
        if (pos[nid].x >= expMaxX)
          maxRight = Math.min(maxRight, pos[nid].x - expMaxX - H_GAP);
      });
      Object.values(crossFamilyGhosts).forEach(g => {
        if (Math.abs(g.y - cY) >= NODE_H) return;
        if (grpSet.has(g.adjacentTo)) return;
        if (internalGhostKeys.some(k => crossFamilyGhosts[k] === g)) return;
        if (g.x + NODE_W <= expMinX)
          maxLeft = Math.min(maxLeft, expMinX - g.x - NODE_W - H_GAP);
        if (g.x >= expMaxX)
          maxRight = Math.min(maxRight, g.x - expMaxX - H_GAP);
      });

      let dx;
      if (offset < 0) dx = Math.max(offset, -Math.max(0, maxLeft));
      else dx = Math.min(offset, Math.max(0, maxRight));
      // Verzamel afstammelingen voor cascade (nodig voor zowel X- als Y-shift)
      const moveSet = new Set(expandedIds);
      const collectDescFC = (id) => {
        (fullChildrenOf[id] || childrenOf[id] || []).forEach(cid2 => {
          if (!pos[cid2] || moveSet.has(cid2)) return;
          moveSet.add(cid2);
          (partnersOf[cid2] || []).forEach(pid => {
            if (pos[pid] && !moveSet.has(pid)) moveSet.add(pid);
          });
          collectDescFC(cid2);
        });
      };
      expandedIds.forEach(id => collectDescFC(id));

      if (Math.abs(dx) <= 1) return;

      // Pas X-shift toe
      moveSet.forEach(id => { if (pos[id]) pos[id].x += dx; });
      Object.entries(crossFamilyGhosts).forEach(([key, g]) => {
        if (moveSet.has(g.adjacentTo) || internalGhostKeys.includes(key)) g.x += dx;
      });
      fcMoved = true;
      fcPassMoved = true;
    });

    if (!fcPassMoved) break; // Convergentie bereikt
    } // einde multi-pass loop

    if (fcMoved) resolveOverlaps(pos, verticalGroupMap);
  }

  // ===== POST-PIPELINE SIBLING COMPACTIE =====
  // Sluit excessive gaps (> 460px) tussen siblings.
  // Alleen verschuiven als de subtree VOLLEDIG vrij is (geen overlaps).
  {
    const scpcRels = state.relationships.filter(r => r.type === 'parent-child' || r.type === 'social-parent');

    const sibMap = {};
    scpcRels.forEach(r => {
      if (!pos[r.childId] || !pos[r.parentId]) return;
      if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
      const allP = scpcRels
        .filter(rel => rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      const key = allP.join(',');
      if (!sibMap[key]) sibMap[key] = { parents: allP, children: new Set() };
      sibMap[key].children.add(r.childId);
    });

    // Top-down: hogere generaties eerst
    const sortedGroups = Object.values(sibMap)
      .filter(g => g.children.size >= 2)
      .sort((a, b) => {
        const aY = Math.min(...a.parents.filter(p => pos[p]).map(p => pos[p].y));
        const bY = Math.min(...b.parents.filter(p => pos[p]).map(p => pos[p].y));
        return aY - bY;
      });

    for (let pass = 0; pass < 5; pass++) {
      let anyCompacted = false;

      sortedGroups.forEach(({ parents, children }) => {
        const childArr = [...children].filter(cid => pos[cid]);
        if (childArr.length < 2) return;

        const byY = {};
        childArr.forEach(cid => {
          const yKey = Math.round(pos[cid].y);
          let found = false;
          for (const bk of Object.keys(byY)) {
            if (Math.abs(Number(bk) - yKey) < NODE_H) { byY[bk].push(cid); found = true; break; }
          }
          if (!found) byY[yKey] = [cid];
        });

        Object.values(byY).forEach(kids => {
          if (kids.length < 2) return;
          kids.sort((a, b) => pos[a].x - pos[b].x);

          for (let i = 1; i < kids.length; i++) {
            const leftSib = kids[i - 1];
            const rightSib = kids[i];
            const leftRight = pos[leftSib].x + NODE_W;
            const rightLeft = pos[rightSib].x;
            const sibY = pos[leftSib].y;

            let cardsBetween = 0;
            Object.keys(pos).forEach(nid => {
              if (children.has(nid) || !pos[nid]) return;
              if (Math.abs(pos[nid].y - sibY) >= NODE_H) return;
              if (pos[nid].x >= leftRight - 5 && pos[nid].x + NODE_W <= rightLeft + 5) cardsBetween++;
            });
            Object.values(crossFamilyGhosts).forEach(g => {
              if (Math.abs(g.y - sibY) < NODE_H && g.x >= leftRight - 5 && g.x + NODE_W <= rightLeft + 5) cardsBetween++;
            });

            const expectedGap = (1 + cardsBetween) * (NODE_W + H_GAP);
            const actualGap = rightLeft - pos[leftSib].x;
            const excess = actualGap - expectedGap;
            if (excess <= NODE_W) continue; // alleen grote gaps (> 1 kaartbreedte)

            // Verzamel subtree
            const moveSet = new Set();
            const collectSub = (nid) => {
              if (moveSet.has(nid) || !pos[nid]) return;
              moveSet.add(nid);
              (partnersOf[nid] || []).forEach(pid => {
                if (pos[pid] && !moveSet.has(pid) && Math.abs(pos[pid].y - pos[nid].y) < NODE_H) moveSet.add(pid);
              });
              scpcRels.forEach(r => {
                if (r.parentId === nid && pos[r.childId] && !moveSet.has(r.childId)) {
                  if (r.childId.startsWith && r.childId.startsWith(CROSS_GHOST_PREFIX)) return;
                  collectSub(r.childId);
                }
              });
            };
            for (let j = i; j < kids.length; j++) collectSub(kids[j]);

            // Bereken max veilige shift: check per moveSet-node
            let safeShift = excess;
            moveSet.forEach(nid => {
              const ny = pos[nid].y;
              Object.keys(pos).forEach(oid => {
                if (moveSet.has(oid) || !pos[oid]) return;
                if (Math.abs(pos[oid].y - ny) >= NODE_H) return;
                const minDist = pos[oid].x + NODE_W + H_GAP;
                const newX = pos[nid].x - safeShift;
                if (minDist > newX) {
                  safeShift = Math.min(safeShift, pos[nid].x - minDist);
                }
              });
            });

            if (safeShift < NODE_W) continue; // minder dan 1 kaartbreedte winst

            const dx = -safeShift;
            moveSet.forEach(nid => { pos[nid].x += dx; });
            Object.values(crossFamilyGhosts).forEach(g => {
              if (moveSet.has(g.adjacentTo) || moveSet.has(g.personId)) g.x += dx;
            });
            anyCompacted = true;
          }
        });
      });

      if (!anyCompacted) break;
      resolveOverlaps(pos, verticalGroupMap);
    }
  }

  // ===== BIRTHORDER Y-REASSIGNMENT (Fazelahmad + Mahmadgul) =====
  // Wijst Y-levels van kleinkind-families toe op basis van ouder-birthOrder.
  // Verzamelt huidige Y-levels, sorteert, en wijst toe aan ouders in BO-volgorde.
  // Beweegt hele family-groepen (ouder's kinderen + inlaws + kleinkinderen).
  if (headId === 'pmni0mtna5vxw' || headId === 'pmndyxhre0zi1' || headId === 'pmndyrysy3eq7') {
    // Vind alle directe kinderen van de tree head (Fazelahmad)
    const headChildren = (childrenOf[headId] || []).filter(cid => pos[cid]);

    // Bouw familyGroups: { headChildId: { bo, currentY, members: Set<id> } }
    const familyGroups = [];
    headChildren.forEach(hcid => {
      const hcPerson = state.persons.find(x => x.id === hcid);
      const bo = (hcPerson && typeof hcPerson.birthOrder === 'number') ? hcPerson.birthOrder : 9999;

      // Verzamel ALLE descendants (kinderen + kleinkinderen + ...) van deze head-child
      const members = new Set();
      const collect = (id) => {
        if (members.has(id) || !pos[id]) return;
        members.add(id);
        // partners op zelfde Y
        (partnersOf[id] || []).forEach(pid => {
          if (pos[pid] && Math.abs(pos[pid].y - pos[id].y) < NODE_H) {
            members.add(pid);
            // Inlaw partners' kinderen ook
            (childrenOf[pid] || []).forEach(cid2 => collect(cid2));
          }
        });
        // kinderen
        (childrenOf[id] || []).forEach(cid => collect(cid));
      };
      // Start met kinderen van deze head-child (NIET de head-child zelf,
      // want die staat op de head-children rij die we niet willen verplaatsen)
      (childrenOf[hcid] || []).forEach(cid => collect(cid));
      // Inlaw partner van head-child: verzamel ook diens kinderen via head-child
      (partnersOf[hcid] || []).forEach(pid => {
        if (pos[pid]) {
          (childrenOf[pid] || []).forEach(cid => collect(cid));
        }
      });

      if (members.size === 0) return;

      // Bereken huidige minY en maxY van deze familie
      const ys = [...members].map(id => pos[id].y);
      const minY = Math.min(...ys);

      familyGroups.push({ headChildId: hcid, bo, minY, members });
    });

    if (familyGroups.length >= 2) {
      // Verzamel unieke minY-waarden, gesorteerd ascending
      const uniqueYs = [...new Set(familyGroups.map(g => g.minY))].sort((a, b) => a - b);

      // Sorteer family groups op birthOrder
      const sortedByBO = [...familyGroups].sort((a, b) => a.bo - b.bo);

      // Wijs Y-levels toe in BO-volgorde
      const yMap = new Map(); // headChildId → newMinY
      sortedByBO.forEach((g, i) => {
        const targetY = uniqueYs[Math.min(i, uniqueYs.length - 1)];
        yMap.set(g.headChildId, targetY);
      });

      // DEBUG: log family groups info
      if (typeof window !== 'undefined') {
        window._debugBORealign = {
          familyGroups: familyGroups.map(g => ({
            headChild: state.persons.find(p => p.id === g.headChildId)?.name,
            bo: g.bo,
            minY: g.minY,
            memberCount: g.members.size,
            sampleMembers: [...g.members].slice(0, 5).map(id => state.persons.find(p => p.id === id)?.name)
          })),
          uniqueYs,
          sortedByBO: sortedByBO.map(g => ({
            headChild: state.persons.find(p => p.id === g.headChildId)?.name,
            bo: g.bo, minY: g.minY
          })),
          yMapEntries: [...yMap.entries()].map(([k, v]) => ({
            headChild: state.persons.find(p => p.id === k)?.name,
            targetY: v
          }))
        };
      }

      // Pas verschuivingen toe per familie
      familyGroups.forEach(g => {
        const targetY = yMap.get(g.headChildId);
        const delta = targetY - g.minY;
        if (Math.abs(delta) < 1) return;
        g.members.forEach(id => {
          if (pos[id]) pos[id].y += delta;
        });
      });

      // Run resolveOverlaps om eventuele X-conflicts op te lossen
      resolveOverlaps(pos, verticalGroupMap);
    }
  }

  // ===== NEEF-NICHT GHOST DUPLICATEN — Hagig Gull-stijl (Fazelahmad) =====
  // Herbouw de bio-rij van Khanaga sequentieel in birthOrder volgorde,
  // waarbij neef-nicht movers (Nilab, Alia) als ghosts worden ingeschoven
  // op hun juiste BO-positie tussen de echte kinderen.
  // Eindresultaat lijkt op Khanaga-rij in Hagig Gull:
  // Hemat → Husna → Nilab(g) → Emamuddin(g) → Alia(g) → Rahimgul(g) → Meraj → Mona → Erfan → ...
  if (headId === 'pmni0mtna5vxw' && reclassifiedBioParents) {
    // Groepeer movers per bio-parent set
    const moversByBioParents = {};
    Object.entries(reclassifiedBioParents).forEach(([moverId, info]) => {
      const bioParents = info.bioParents.filter(pid => pos[pid]);
      if (!bioParents.length) return;
      const key = bioParents.sort().join(',');
      if (!moversByBioParents[key]) moversByBioParents[key] = { bioParents, movers: [] };
      const moverPerson = state.persons.find(x => x.id === moverId);
      const bo = (moverPerson && typeof moverPerson.birthOrder === 'number') ? moverPerson.birthOrder : 9999;
      moversByBioParents[key].movers.push({ moverId, partnerId: info.partnerId, bo });
    });

    Object.values(moversByBioParents).forEach(({ bioParents, movers }) => {
      // Verzamel echte bio-siblings (na reclassificatie zonder movers)
      const realChildIds = [];
      bioParents.forEach(pid => {
        (childrenOf[pid] || []).forEach(cid => {
          if (pos[cid] && !movers.some(m => m.moverId === cid) && !realChildIds.includes(cid)) {
            realChildIds.push(cid);
          }
        });
      });
      if (!realChildIds.length) return;

      // Bio-Y: alle siblings op zelfde Y
      const bioY = pos[realChildIds[0]].y;

      // Bouw "units" — elk een groep cards die samen in bio-rij staan
      // Real unit: { type: 'real', childId, partnerIds (inlaws op zelfde Y), bo }
      // Ghost unit: { type: 'ghost', moverId, partnerId, bo }
      const units = [];

      realChildIds.forEach(cid => {
        const child = state.persons.find(x => x.id === cid);
        const bo = (child && typeof child.birthOrder === 'number') ? child.birthOrder : 9999;
        const partnerIds = (partnersOf[cid] || []).filter(pid =>
          pos[pid] && Math.abs(pos[pid].y - bioY) < NODE_H
        );
        units.push({ type: 'real', childId: cid, partnerIds, bo });
      });

      movers.forEach(({ moverId, partnerId, bo }) => {
        units.push({ type: 'ghost', moverId, partnerId, bo });
      });

      // Sorteer op birthOrder (BO 1 eerst, hoogste BO laatst)
      units.sort((a, b) => a.bo - b.bo);

      // StartX = leftmost X van huidige bio-rij cards (voor Hemat zit hij links)
      const allBioXs = [];
      realChildIds.forEach(cid => {
        allBioXs.push(pos[cid].x);
        (partnersOf[cid] || []).forEach(pid => {
          if (pos[pid] && Math.abs(pos[pid].y - bioY) < NODE_H) allBioXs.push(pos[pid].x);
        });
      });
      let startX = Math.min(...allBioXs);

      // Helper: shift descendants horizontaal mee
      const shiftDesc = (id, dx) => {
        if (Math.abs(dx) < 1) return;
        (childrenOf[id] || []).forEach(cid => {
          if (pos[cid]) {
            pos[cid].x += dx;
            shiftDesc(cid, dx);
            (partnersOf[cid] || []).forEach(pid => {
              if (pos[pid] && Math.abs(pos[pid].y - pos[cid].y) < NODE_H) {
                // partner op zelfde Y — alleen shiften als deze niet al via eigen ouder shift krijgt
                if (!realChildIds.includes(pid)) pos[pid].x += dx;
              }
            });
          }
        });
      };

      // Plaats units sequentieel
      let curX = startX;
      // Anchor voor ghost adjacentTo (eerste real child — VER van real positie van mover)
      const ghostAnchor = realChildIds[0];

      units.forEach(unit => {
        if (unit.type === 'real') {
          // Verplaats kind naar curX
          const oldChildX = pos[unit.childId].x;
          const childDx = curX - oldChildX;
          pos[unit.childId].x = curX;
          shiftDesc(unit.childId, childDx);
          curX += NODE_W + H_GAP;

          // Verplaats inlaw-partners
          unit.partnerIds.forEach(pid => {
            const oldPartnerX = pos[pid].x;
            const partnerDx = curX - oldPartnerX;
            pos[pid].x = curX;
            shiftDesc(pid, partnerDx);
            curX += NODE_W + H_GAP;
          });
        } else if (unit.type === 'ghost') {
          // Mover ghost (Nilab/Alia)
          const moverGhostX = curX;
          crossFamilyGhosts[unit.moverId + ':cg:bioRow'] = {
            x: moverGhostX, y: bioY,
            personId: unit.moverId,
            adjacentTo: ghostAnchor
          };
          curX += NODE_W + H_GAP;

          // Partner ghost (Emamuddin/Rahimgul)
          const partnerGhostX = curX;
          crossFamilyGhosts[unit.partnerId + ':cg:bioRow'] = {
            x: partnerGhostX, y: bioY,
            personId: unit.partnerId,
            adjacentTo: ghostAnchor
          };
          curX += NODE_W + H_GAP;

          // Kinderen ghosts onder dit paar
          const sharedChildren = (childrenOf[unit.moverId] || []).filter(cid =>
            (childrenOf[unit.partnerId] || []).includes(cid) && pos[cid]
          );
          if (sharedChildren.length > 0) {
            const childY = bioY + NODE_H + V_GAP;
            const childCenterX = (moverGhostX + partnerGhostX + NODE_W) / 2;
            const totalW = sharedChildren.length * NODE_W + (sharedChildren.length - 1) * H_GAP;
            let cx = childCenterX - totalW / 2;
            sharedChildren.forEach((cid, i) => {
              const cgx = cx + i * (NODE_W + H_GAP);
              crossFamilyGhosts[cid + ':cg:bioRow'] = {
                x: cgx, y: childY,
                personId: cid,
                adjacentTo: ghostAnchor
              };
            });
          }
        }
      });
    });

    // Resolve overlaps na herbouwde bio-rij
    resolveOverlaps(pos, verticalGroupMap);
  }

  // ===== POST-PIPELINE CENTERING (Fazelahmad only) =====
  // Voor elke direct kind van Fazelahmad: centreer zijn kinderen-rij + ghosts
  // onder hem (Regel 10). Dit fixt offsets die ontstaan zijn door BIRTHORDER
  // Y-REASSIGNMENT (Y-swap zonder X-recentrering) en door ghost-insertions.
  if (headId === 'pmni0mtna5vxw') {
    const headChildren = (childrenOf[headId] || []).filter(cid => pos[cid]);
    headChildren.forEach(hcid => {
      // Bereken parent-cluster center (kind + partner van Fazelahmad)
      const partners = (partnersOf[hcid] || []).filter(pid =>
        pos[pid] && Math.abs(pos[pid].y - pos[hcid].y) < NODE_H
      );
      const parentCluster = [hcid, ...partners];
      const parentXs = parentCluster.map(id => pos[id].x);
      const parentMinX = Math.min(...parentXs);
      const parentMaxX = Math.max(...parentXs) + NODE_W;
      const parentCenter = (parentMinX + parentMaxX) / 2;

      // Verzamel directe kinderen van hcid (en ook van zijn partners voor co-parented)
      const allChildIds = new Set();
      [hcid, ...partners].forEach(pid => {
        (childrenOf[pid] || []).forEach(cid => {
          if (pos[cid]) allChildIds.add(cid);
        });
      });
      if (!allChildIds.size) return;

      // Vind de Y van de kinderen (ze staan op zelfde Y na BIRTHORDER Y-REASSIGNMENT)
      const childYs = [...allChildIds].map(cid => pos[cid].y);
      const childY = Math.min(...childYs);

      // Verzamel ALLE cards op deze Y die deel uitmaken van dit family-cluster:
      // - Kinderen zelf
      // - Inlaw-partners van kinderen op zelfde Y
      // - Bio-row ghosts (cg:bioRow) op zelfde Y die bij dit cluster horen
      const clusterIds = new Set(allChildIds);
      const clusterGhostKeys = new Set();
      allChildIds.forEach(cid => {
        (partnersOf[cid] || []).forEach(pid => {
          if (pos[pid] && Math.abs(pos[pid].y - childY) < NODE_H) clusterIds.add(pid);
        });
      });
      // Bio-row ghosts op zelfde Y die deel zijn van deze parent's bio-rij
      Object.entries(crossFamilyGhosts).forEach(([gKey, g]) => {
        if (!gKey.endsWith(':cg:bioRow')) return;
        if (Math.abs(g.y - childY) > NODE_H) return;
        // Check of de mover (g.personId) een biological child is van hcid
        if ((childrenOf[hcid] || []).includes(g.personId) ||
            partners.some(p => (childrenOf[p] || []).includes(g.personId))) {
          clusterGhostKeys.add(gKey);
        }
        // Of een partner van een mover die in dit cluster valt — check via adjacentTo
        // (adjacentTo is een bio-sibling van mover, dus zit in dit cluster)
        else if (g.adjacentTo && allChildIds.has(g.adjacentTo)) {
          clusterGhostKeys.add(gKey);
        }
      });

      // Bereken cluster center
      const clusterXs = [];
      clusterIds.forEach(id => clusterXs.push(pos[id].x));
      clusterGhostKeys.forEach(gKey => clusterXs.push(crossFamilyGhosts[gKey].x));
      if (!clusterXs.length) return;
      const clusterMinX = Math.min(...clusterXs);
      const clusterMaxX = Math.max(...clusterXs) + NODE_W;
      const clusterCenter = (clusterMinX + clusterMaxX) / 2;

      const dx = parentCenter - clusterCenter;
      if (Math.abs(dx) < 1) return; // al gecentreerd

      // Shift alle cluster-leden + ghosts + descendants horizontaal
      // visited tracking voorkomt dat gedeelde kinderen (bijv. Amina van Hemat+Husna)
      // dubbel worden geshift via beide ouders.
      const visited = new Set();
      const shiftAll = (id, dx) => {
        if (visited.has(id)) return;
        visited.add(id);
        if (pos[id]) pos[id].x += dx;
        (childrenOf[id] || []).forEach(cid => {
          if (pos[cid] && !visited.has(cid)) {
            shiftAll(cid, dx);
            (partnersOf[cid] || []).forEach(ppid => {
              if (pos[ppid] && !visited.has(ppid) && Math.abs(pos[ppid].y - pos[cid].y) < NODE_H && !clusterIds.has(ppid)) {
                visited.add(ppid);
                pos[ppid].x += dx;
              }
            });
          }
        });
      };
      clusterIds.forEach(id => shiftAll(id, dx));
      // Shift bio-row ghosts in dit cluster
      clusterGhostKeys.forEach(gKey => {
        crossFamilyGhosts[gKey].x += dx;
      });
      // Shift ook ghost-children (cg:bioRow op één laag onder bio-rij)
      Object.entries(crossFamilyGhosts).forEach(([gKey, g]) => {
        if (!gKey.endsWith(':cg:bioRow')) return;
        if (clusterGhostKeys.has(gKey)) return;
        // Ghost-kinderen onder de bio-rij ghosts
        if (Math.abs(g.y - (childY + NODE_H + V_GAP)) < NODE_H) {
          // Check of dit ghost-kind onder een ghost in clusterGhostKeys hoort
          const parentGhostInCluster = [...clusterGhostKeys].some(parentKey => {
            const parentGhost = crossFamilyGhosts[parentKey];
            return parentGhost && Math.abs(parentGhost.x - g.x) < 3 * (NODE_W + H_GAP);
          });
          if (parentGhostInCluster) g.x += dx;
        }
      });
    });

    // resolveOverlaps NIET hier — mijn shifts zijn al overlap-vrij en
    // resolveOverlaps shifted Aqamir's helft naar rechts door floating-point
    // Y-overlap met grandkids row (Y=1100 vs Y=1216 = 116px diff, randgeval).

    // Hagig Gull patroon (alle kids op zelfde Y) NIET geïmplementeerd — was te
    // breed (16000+ px) en screenshot timeoutte. Volgende keer: meer geleidelijke
    // aanpak nodig. TODO discuss met Hakim.

    // ===== KID-CLUSTER COMPRESSION (safe, no cascade) =====
    // Voor parents met kids die nog 460-gaps hebben (lege slots tussen siblings):
    // shift KIDS ZELF (niet descendants/partners) naar 230-gap centered onder parent.
    // Skip head-children (al door POST-PIPELINE CENTERING gehandeld).
    // Skip parents zonder partner mechanics op kids (om Khanaga rij niet te breken).
    {
      const allParentIds = new Set();
      Object.keys(pos).forEach(id => {
        if ((childrenOf[id] || []).some(cid => pos[cid])) allParentIds.add(id);
      });
      // Skip alleen Fazelahmad zelf. Head-children OOK includeren want
      // POST-PIPELINE CENTERING centert wel maar comprimeert geen 460-gaps.
      // Safety: hasGrandkids check skipt parents waarvan kids grandkids hebben.
      allParentIds.delete(headId);

      // Track kids al verwerkt om double-processing via partner te voorkomen
      const processedKidSets = new Set();

      allParentIds.forEach(parentId => {
        const partners = (partnersOf[parentId] || []).filter(pid =>
          pos[pid] && Math.abs(pos[pid].y - pos[parentId].y) < NODE_H
        );
        const kidIds = new Set();
        [parentId, ...partners].forEach(pid => {
          (childrenOf[pid] || []).forEach(cid => {
            if (pos[cid]) kidIds.add(cid);
          });
        });
        if (!kidIds.size) return;

        // Hash van kid set om dedupe te doen
        const kidsKey = [...kidIds].sort().join(',');
        if (processedKidSets.has(kidsKey)) return;
        processedKidSets.add(kidsKey);

        const kidsY = Math.min(...[...kidIds].map(id => pos[id].y));
        const kidsOnY = [...kidIds].filter(id => Math.abs(pos[id].y - kidsY) < NODE_H);
        if (kidsOnY.length < 2) return;

        // Skip kids die ZELF children hebben (cascade probleem)
        const hasGrandkids = kidsOnY.some(cid => (childrenOf[cid] || []).some(gcid => pos[gcid]));
        if (hasGrandkids) return;

        // Sorteer kids op X
        const sortedKids = kidsOnY.sort((a, b) => pos[a].x - pos[b].x);

        // Bereken parent-cluster center
        const parentCluster = [parentId, ...partners];
        const parentXs = parentCluster.map(id => pos[id].x);
        const parentMinX = Math.min(...parentXs);
        const parentMaxX = Math.max(...parentXs) + NODE_W;
        const parentCenter = (parentMinX + parentMaxX) / 2;

        const step = NODE_W + H_GAP;
        const totalWidth = sortedKids.length * NODE_W + (sortedKids.length - 1) * H_GAP;
        const newStartX = parentCenter - totalWidth / 2;

        // SAFE shift: alleen kids zelf, geen descendants/partners
        sortedKids.forEach((id, i) => {
          pos[id].x = newStartX + i * step;
        });
      });
    }

    // ===== GHOST-CHILDREN RE-CENTER (Fazelahmad) =====
    // Plaats ghost-kinderen van alle cousin-pair couples op een EIGEN Y rij
    // (één laag onder Hemat+Husna's real kids) om overlap met real kids te voorkomen.
    // Multi-couple flow: meerdere couples op zelfde bio-row → kids worden zij-aan-zij
    // gelegd in couple-X-volgorde, gecentreerd onder het bio-row span. Per couple
    // worden hun kids in BO-volgorde geplaatst.
    if (reclassifiedBioParents) {
      // Bouw cluster-lijst: één entry per couple met hun shared children
      const clusters = [];
      Object.entries(reclassifiedBioParents).forEach(([moverId, info]) => {
        const partnerId = info.partnerId;
        const moverGhost = crossFamilyGhosts[moverId + ':cg:bioRow'];
        const partnerGhost = crossFamilyGhosts[partnerId + ':cg:bioRow'];
        if (!moverGhost || !partnerGhost) return;

        const sharedChildren = (childrenOf[moverId] || []).filter(cid =>
          (childrenOf[partnerId] || []).includes(cid) && pos[cid]
        );
        if (!sharedChildren.length) return;

        sharedChildren.sort((a, b) => {
          const pa = state.persons.find(x => x.id === a);
          const pb = state.persons.find(x => x.id === b);
          const boa = (pa && typeof pa.birthOrder === 'number') ? pa.birthOrder : 9999;
          const bob = (pb && typeof pb.birthOrder === 'number') ? pb.birthOrder : 9999;
          return boa - bob;
        });

        const leftX = Math.min(moverGhost.x, partnerGhost.x);
        const rightX = Math.max(moverGhost.x, partnerGhost.x) + NODE_W;
        const coupleCenterX = (leftX + rightX) / 2;
        clusters.push({
          moverId, partnerId, sharedChildren,
          leftX, rightX, coupleCenterX,
          bioRowY: moverGhost.y
        });
      });

      // Sorteer clusters op coupleCenterX (links naar rechts)
      clusters.sort((a, b) => a.coupleCenterX - b.coupleCenterX);

      if (clusters.length > 0) {
        // Standaard Y voor ghost-kids: bio-row + 2*(NODE_H+V_GAP)
        // = één rij onder Hemat+Husna's real kids (Amina, Aisya)
        const baseChildY = clusters[0].bioRowY + 2 * (NODE_H + V_GAP);

        // Eerste pass: bereken individuele cluster ideale start X (gecentreerd onder couple)
        clusters.forEach(c => {
          const w = c.sharedChildren.length * NODE_W + (c.sharedChildren.length - 1) * H_GAP;
          c.idealStartX = c.coupleCenterX - w / 2;
          c.totalWidth = w;
          c.idealEndX = c.idealStartX + w;
          c.yLevel = 0; // 0 = standaard, 1 = één rij lager, etc.
        });

        // Tweede pass: detecteer X-overlap tussen clusters; bij overlap, schuif de
        // LINKER cluster één Y-rij naar BENEDEN (langere T-lijn vanaf ghost-ouder)
        // zodat de RECHTER cluster gecentreerd blijft op standaard Y. Zo blijft
        // elke cluster netjes gecentreerd onder zijn eigen ouder-paar.
        for (let i = clusters.length - 1; i >= 1; i--) {
          const left = clusters[i - 1];
          const right = clusters[i];
          if (left.idealEndX > right.idealStartX - H_GAP) {
            // Conflict: zet linker cluster één Y-laag dieper dan rechter
            left.yLevel = right.yLevel + 1;
          }
        }

        // Pas posities toe op de ghost-children
        // Update adjacentTo naar de mover (= een ECHTE parent van het kind) zodat
        // Fix C in renderLines T-bars tekent van ghost-parent → ghost-children.
        clusters.forEach(c => {
          const childY = baseChildY + c.yLevel * (NODE_H + V_GAP);
          c.sharedChildren.forEach((cid, i) => {
            const ghostKey = cid + ':cg:bioRow';
            if (crossFamilyGhosts[ghostKey]) {
              crossFamilyGhosts[ghostKey].x = c.idealStartX + i * (NODE_W + H_GAP);
              crossFamilyGhosts[ghostKey].y = childY;
              crossFamilyGhosts[ghostKey].adjacentTo = c.moverId;
            }
          });
        });
      }
    }

    // ===== Y-SPACING ENFORCEMENT (Fazelahmad) =====
    // Voor opeenvolgende kids-rijen: minimum Y-gap = NODE_H + V_GAP = 190.
    // Als gap te krap is, schuif alle cards en ghosts onder de conflict-Y omlaag.
    // Voorkomt T-bars die op Y vlakbij andere kaarten zitten.
    {
      const MIN_Y_GAP = NODE_H + V_GAP; // 190px
      // Verzamel alle unieke Y-waarden van kids/grandkids (skip head + head-children)
      const headChildIds = new Set([headId, ...(childrenOf[headId] || [])]);
      const ySet = new Set();
      Object.entries(pos).forEach(([id, p]) => {
        if (headChildIds.has(id)) return;
        // Skip head-children's partners (op zelfde Y als head children)
        if ((childrenOf[headId] || []).some(hcid =>
          (partnersOf[hcid] || []).includes(id) && Math.abs(pos[hcid]?.y - p.y) < NODE_H
        )) return;
        ySet.add(Math.round(p.y));
      });
      const sortedYs = [...ySet].sort((a, b) => a - b);

      // Itereer paren en accumuleer shifts naar onderen
      let totalShift = 0;
      const yShiftMap = {}; // currentY → shiftAmount
      for (let i = 1; i < sortedYs.length; i++) {
        const prevY = sortedYs[i - 1];
        const curY = sortedYs[i];
        const effectivePrevY = prevY + (yShiftMap[prevY] || 0);
        const effectiveCurY = curY + totalShift;
        const gap = effectiveCurY - effectivePrevY;
        if (gap < MIN_Y_GAP) {
          totalShift += MIN_Y_GAP - gap;
        }
        yShiftMap[curY] = totalShift;
      }

      // Pas shifts toe (alle pos en ghosts op Y >= curY krijgen shift)
      if (totalShift > 0) {
        Object.entries(pos).forEach(([id, p]) => {
          const origY = Math.round(p.y);
          // Skip head + head-children + their partners (Y=50, Y=276)
          if (headChildIds.has(id)) return;
          if (origY < sortedYs[0]) return; // boven eerste kids-Y
          // Vind de toepasselijke shift voor deze Y
          for (let i = sortedYs.length - 1; i >= 0; i--) {
            if (origY >= sortedYs[i]) {
              p.y += yShiftMap[sortedYs[i]] || 0;
              return;
            }
          }
        });
        // Idem voor ghosts
        Object.values(crossFamilyGhosts).forEach(g => {
          const origY = Math.round(g.y);
          if (origY < sortedYs[0]) return;
          for (let i = sortedYs.length - 1; i >= 0; i--) {
            if (origY >= sortedYs[i]) {
              g.y += yShiftMap[sortedYs[i]] || 0;
              return;
            }
          }
        });
      }
    }
  }

  // ===== POST-PIPELINE: Kinderen ONDER ouders garanderen =====
  // Detecteer kinderen die BOVEN hun bio-ouders eindigen (Y kleiner dan parent Y).
  // Verplaats hen naar Y = max(parents.Y) + NODE_H + V_GAP en centreer X onder ouders.
  // Voorkomt visuele inconsistentie waar bv. Muhammad Salehi boven zijn moeder Nilab
  // eindigt door pipeline-shifts.
  // Alleen voor Mahmadgul-style trees met diepe shifts.
  if (headId === 'pmndyxhre0zi1' || headId === 'pmndyrysy3eq7' || headId === 'pmni0mtna5vxw') {
    const Y_STEP = NODE_H + V_GAP; // 190
    const visited = new Set();
    state.persons.forEach(person => {
      if (visited.has(person.id) || !pos[person.id]) return;
      const myParentIds = (parentsOf[person.id] || []).filter(pid => pos[pid]);
      if (!myParentIds.length) return;
      const parentMaxY = Math.max(...myParentIds.map(pid => pos[pid].y));
      if (pos[person.id].y < parentMaxY + Y_STEP - 10) {
        // Kind staat boven ouders → schuif naar onder en centreer X
        const targetY = parentMaxY + Y_STEP;
        const myY = pos[person.id].y;
        // Zoek alle siblings op zelfde Y met gedeelde ouder-set
        const siblingIds = state.persons.filter(p =>
          pos[p.id] && Math.abs(pos[p.id].y - myY) < 10 &&
          (parentsOf[p.id] || []).some(pid => myParentIds.includes(pid))
        ).map(p => p.id);
        // Sorteer op huidige X om volgorde te behouden
        siblingIds.sort((a, b) => pos[a].x - pos[b].x);
        // Bereken centering: couple center van ouders
        const parentXs = myParentIds.map(pid => pos[pid].x);
        const parentCenterX = (Math.min(...parentXs) + Math.max(...parentXs) + NODE_W) / 2;
        const totalW = siblingIds.length * NODE_W + (siblingIds.length - 1) * H_GAP;
        const newStartX = parentCenterX - totalW / 2;
        // Check: geen conflict met andere cards op target Y
        const conflictFree = !Object.entries(pos).some(([id, p]) => {
          if (siblingIds.includes(id) || myParentIds.includes(id)) return false;
          if (Math.abs(p.y - targetY) >= NODE_H) return false;
          return p.x < newStartX + totalW && p.x + NODE_W > newStartX;
        });
        siblingIds.forEach((sid, i) => {
          if (visited.has(sid)) return;
          pos[sid].y = targetY;
          if (conflictFree) {
            pos[sid].x = newStartX + i * (NODE_W + H_GAP);
          }
          visited.add(sid);
        });
      }
      visited.add(person.id);
    });
  }

  // ===== POST-PIPELINE PARTNER-ALIGNMENT =====
  // Garandeer dat partners (met of zonder gedeelde kinderen) op dezelfde Y
  // staan. Voorkomt visuele inconsistentie waar bv. Laila Babo onder Habib Gull
  // staat terwijl ze partners zijn.
  // Mover = partner zonder ouders in tree (ingetrouwd); anchor = partner met
  // ouders in tree (bloed-afstammeling).
  if (headId === 'pmni0mtna5vxw' || headId === 'pmndyxhre0zi1' || headId === 'pmndyrysy3eq7') {
    if (typeof window !== 'undefined') {
      window._debugAlignLog = [];
      window._debugAllPartnersLog = [];
    }
    // Loop via state.relationships voor partner-paren (niet via partnersOf)
    state.relationships.forEach(rel => {
      if (rel.type !== 'partner') return;
      const a = rel.person1Id, b = rel.person2Id;
      // Debug log: capture values NOW (not by reference)
      if (typeof window !== 'undefined') {
        const aPerson = state.persons.find(p => p.id === a);
        const bPerson = state.persons.find(p => p.id === b);
        if ((aPerson?.name === 'Habib Gull Durrani' || bPerson?.name === 'Habib Gull Durrani') ||
            (aPerson?.name === 'Laila Babo' || bPerson?.name === 'Laila Babo')) {
          window._debugAllPartnersLog.push({
            phase: 'enter',
            a: aPerson?.name, b: bPerson?.name,
            posA_y: pos[a]?.y, posB_y: pos[b]?.y,
            inPos_a: !!pos[a], inPos_b: !!pos[b]
          });
        }
      }
      if (!pos[a] || !pos[b]) {
        if (typeof window !== 'undefined') {
          const aPerson = state.persons.find(p => p.id === a);
          if (aPerson?.name === 'Habib Gull Durrani') window._debugAllPartnersLog.push({phase: 'skip-pos', a: aPerson?.name});
        }
        return;
      }
      const aY = pos[a].y, bY = pos[b].y;
      if (Math.abs(aY - bY) < 10) {
        if (typeof window !== 'undefined') {
          const aPerson = state.persons.find(p => p.id === a);
          if (aPerson?.name === 'Habib Gull Durrani') window._debugAllPartnersLog.push({phase: 'skip-aligned', a: aPerson?.name, aY, bY});
        }
        return;
      }
      // Bepaal mover/anchor
      const aParents = (parentsOf[a] || []).filter(pid => pos[pid]);
      const bParents = (parentsOf[b] || []).filter(pid => pos[pid]);
      let moverId, anchorY, anchorId;
      if (aParents.length === 0 && bParents.length > 0) {
        moverId = a; anchorId = b; anchorY = bY;
      } else if (bParents.length === 0 && aParents.length > 0) {
        moverId = b; anchorId = a; anchorY = aY;
      } else {
        anchorY = Math.max(aY, bY);
        moverId = (aY === anchorY) ? b : a;
        anchorId = (aY === anchorY) ? a : b;
      }
      if (typeof window !== 'undefined') window._debugAlignLog.push({
        a: state.persons.find(p => p.id === a)?.name,
        b: state.persons.find(p => p.id === b)?.name,
        aY, bY, moverId, anchorY,
        moverName: state.persons.find(p => p.id === moverId)?.name
      });
      pos[moverId].y = anchorY;
    });
  }

  // ===== GENERIC Y-SPACING ENFORCEMENT (Regel 13) =====
  // Voor alle bomen: minimum Y-gap tussen consecutive kids-rijen = NODE_H + V_GAP = 190px.
  // Voorkomt dat T-bars (op kidY-15) door kaarten van bovenliggende rij lopen.
  // Snap eerst Y-rijen die <40px uit elkaar staan (floating-point of T-bar shift)
  // naar dezelfde Y. Daarna: voor elke gap < 190, push alles eronder naar beneden.
  // SAFEGUARD: alleen draaien als alle pos.y geldige nummers zijn (geen NaN).
  {
    const allPosValues = Object.values(pos).filter(p => p && typeof p.y === 'number' && !isNaN(p.y));
    const allGhostValues = Object.values(crossFamilyGhosts).filter(g => g && typeof g.y === 'number' && !isNaN(g.y));
    if (allPosValues.length > 0) {
      const MIN_Y_GAP = NODE_H + V_GAP; // 190
      const SNAP_THRESHOLD = 40; // Y-rijen binnen 40px snappen naar zelfde Y

      // Stap 1: SNAP — verzamel alle unieke Y's, snap close-rows naar min Y
      const allYsRaw = new Set();
      allPosValues.forEach(p => allYsRaw.add(Math.round(p.y)));
      allGhostValues.forEach(g => allYsRaw.add(Math.round(g.y)));
      const sortedRaw = [...allYsRaw].sort((a, b) => a - b);
      const snapMap = {};
      let groupStart = sortedRaw[0];
      sortedRaw.forEach(y => {
        if (y - groupStart > SNAP_THRESHOLD) groupStart = y;
        snapMap[y] = groupStart;
      });
      allPosValues.forEach(p => {
        const ry = Math.round(p.y);
        if (snapMap[ry] !== undefined && snapMap[ry] !== ry) p.y = snapMap[ry];
      });
      allGhostValues.forEach(g => {
        const ry = Math.round(g.y);
        if (snapMap[ry] !== undefined && snapMap[ry] !== ry) g.y = snapMap[ry];
      });

      // Stap 2: Y-GAP push — verzamel UPDATED unieke Y's, push als gap < 190
      const ySet = new Set();
      allPosValues.forEach(p => ySet.add(Math.round(p.y)));
      allGhostValues.forEach(g => ySet.add(Math.round(g.y)));
      const sortedYs = [...ySet].sort((a, b) => a - b);

      let totalShift = 0;
      const yShiftMap = {};
      for (let i = 1; i < sortedYs.length; i++) {
        const prevY = sortedYs[i - 1];
        const curY = sortedYs[i];
        const effectivePrevY = prevY + (yShiftMap[prevY] || 0);
        const effectiveCurY = curY + totalShift;
        const gap = effectiveCurY - effectivePrevY;
        if (gap < MIN_Y_GAP) {
          totalShift += MIN_Y_GAP - gap;
        }
        yShiftMap[curY] = totalShift;
      }
      if (totalShift > 0) {
        const applyShift = (rec) => {
          const origY = Math.round(rec.y);
          for (let i = sortedYs.length - 1; i >= 0; i--) {
            if (origY >= sortedYs[i]) {
              rec.y += yShiftMap[sortedYs[i]] || 0;
              return;
            }
          }
        };
        allPosValues.forEach(applyShift);
        allGhostValues.forEach(applyShift);
      }
    }
  }

  // ===== FINALE Y-NORMALISATIE =====
  // Verschuif ALLE nodes zodat de topmost Y exact PADDING is.
  // Voorkomt dat cards op negatieve Y eindigen (boven viewport, niet bereikbaar).
  {
    const allY = [
      ...Object.values(pos).map(p => p.y),
      ...Object.values(crossFamilyGhosts).map(g => g.y)
    ].filter(y => !isNaN(y));
    if (allY.length > 0) {
      const finalMinY = Math.min(...allY);
      const normShiftY = PADDING - finalMinY;
      if (Math.abs(normShiftY) > 0.5) {
        Object.values(pos).forEach(p => { p.y += normShiftY; });
        Object.values(crossFamilyGhosts).forEach(g => { g.y += normShiftY; });
      }
    }
  }

  // ===== FALLBACK X PLACEMENT BIJ NaN (safety net) =====
  // Als de pipeline ergens NaN-x produceert (bekende bug bij sommige bomen
  // met veel descendants), ken alsnog X-waarden toe per generatie zodat de
  // boom tenminste zichtbaar is (niet perfect gelayout maar leesbaar).
  {
    const nanIds = Object.entries(pos).filter(([_, p]) => p && (typeof p.x !== 'number' || isNaN(p.x))).map(([id]) => id);
    if (nanIds.length > 0) {
      console.warn('[Layout] NaN x voor ' + nanIds.length + ' personen — fallback placement.');
      // Group NaN ids by Y, place horizontaal naast elkaar per Y-rij
      const byY = {};
      nanIds.forEach(id => {
        const yKey = (typeof pos[id].y === 'number' && !isNaN(pos[id].y)) ? Math.round(pos[id].y) : 0;
        if (!byY[yKey]) byY[yKey] = [];
        byY[yKey].push(id);
      });
      Object.entries(byY).forEach(([yStr, ids]) => {
        ids.forEach((id, i) => {
          pos[id].x = PADDING + i * (NODE_W + H_GAP);
          if (typeof pos[id].y !== 'number' || isNaN(pos[id].y)) pos[id].y = PADDING;
        });
      });
    }
    // Idem voor crossFamilyGhosts
    Object.values(crossFamilyGhosts).forEach(g => {
      if (typeof g.x !== 'number' || isNaN(g.x)) g.x = PADDING;
      if (typeof g.y !== 'number' || isNaN(g.y)) g.y = PADDING;
    });
  }

  // ===== MULTI-PARTNER LAYOUT =====
  // Voor heads met meerdere partners (bijv. Agha Gol met Fatema + Gulsherien):
  // 1. Voeg extra X-gap toe tussen de kinderen-clusters van verschillende moeders
  // 2. Verplaats head row naar de GAP-area zodat couple-drop net naast elke cluster
  //    eindigt (T-lijn tussen ouders gaat met korte extended line naar zijn cluster).
  {
    // Helper: krijg alle bio-descendants van een persoon
    const getBioDesc = (rootId) => {
      const result = new Set([rootId]);
      const queue = [rootId];
      while (queue.length) {
        const id = queue.shift();
        (childrenOf[id] || []).forEach(cid => {
          if (!result.has(cid) && pos[cid]) { result.add(cid); queue.push(cid); }
        });
      }
      return result;
    };

    const processed = new Set();
    persons.forEach(p => {
      if (processed.has(p.id)) return;
      const headId = p.id;
      if (!pos[headId]) return;
      const myPartners = (partnersOf[headId] || []).filter(pid =>
        pos[pid] && genOf[pid] === genOf[headId]
      );
      if (myPartners.length < 2) return;

      const sortedPartners = [...myPartners].sort((a, b) => pos[a].x - pos[b].x);
      const leftP = sortedPartners[0];
      const rightP = sortedPartners[sortedPartners.length - 1];
      if (pos[leftP].x >= pos[headId].x || pos[rightP].x <= pos[headId].x) return;

      const leftKids = (childrenOf[headId] || []).filter(cid =>
        pos[cid] && (parentsOf[cid] || []).includes(leftP)
      );
      const rightKids = (childrenOf[headId] || []).filter(cid =>
        pos[cid] && (parentsOf[cid] || []).includes(rightP)
      );
      if (leftKids.length === 0 || rightKids.length === 0) return;

      processed.add(headId);
      sortedPartners.forEach(pid => processed.add(pid));

      // Bepaal LEFT cluster (kids van leftP + inlaws + descendants)
      const leftCluster = new Set();
      leftKids.forEach(kid => {
        getBioDesc(kid).forEach(id => leftCluster.add(id));
        (partnersOf[kid] || []).forEach(pid => {
          if (pos[pid]) {
            leftCluster.add(pid);
            getBioDesc(pid).forEach(id => leftCluster.add(id));
          }
        });
      });
      const rightCluster = new Set();
      rightKids.forEach(kid => {
        getBioDesc(kid).forEach(id => rightCluster.add(id));
        (partnersOf[kid] || []).forEach(pid => {
          if (pos[pid]) {
            rightCluster.add(pid);
            getBioDesc(pid).forEach(id => rightCluster.add(id));
          }
        });
      });

      // Stap 1: shift right cluster naar rechts voor visible gap
      const EXTRA_GAP = NODE_W + H_GAP; // 230
      rightCluster.forEach(id => {
        if (pos[id]) pos[id].x += EXTRA_GAP;
      });

      // Stap 2: verplaats head row (Fatema, Agha Gol, Gulsherien) naar GAP center
      // tussen left cluster end en right cluster start.
      const leftClusterMaxX = Math.max(...[...leftCluster].filter(id => pos[id]).map(id => pos[id].x + NODE_W));
      const rightClusterMinX = Math.min(...[...rightCluster].filter(id => pos[id]).map(id => pos[id].x));
      const gapCenter = (leftClusterMaxX + rightClusterMinX) / 2;

      // Plaats head row gecentreerd op gapCenter
      // Volgorde: leftP - head - rightP (3 cards), totaal width = 3*NODE_W + 2*H_GAP = 640
      const totalHeadW = 3 * NODE_W + 2 * H_GAP;
      const headRowStartX = gapCenter - totalHeadW / 2;

      const oldLeftX = pos[leftP].x;
      const oldHeadX = pos[headId].x;
      const oldRightX = pos[rightP].x;
      const newLeftX = headRowStartX;
      const newHeadX = headRowStartX + NODE_W + H_GAP;
      const newRightX = headRowStartX + 2 * (NODE_W + H_GAP);
      pos[leftP].x = newLeftX;
      pos[headId].x = newHeadX;
      pos[rightP].x = newRightX;
    });
  }

  // ===== FINALE X-NORMALISATIE =====
  // Verschuif ALLE nodes zodat de leftmost X exact PADDING is.
  // Zo begint elke boom links in beeld (geen onnodig wit/scrollen naar rechts).
  {
    const allX = [
      ...Object.values(pos).map(p => p.x),
      ...Object.values(crossFamilyGhosts).map(g => g.x)
    ].filter(x => !isNaN(x));
    if (allX.length > 0) {
      const finalMinX = Math.min(...allX);
      const normShift = PADDING - finalMinX;
      if (Math.abs(normShift) > 0.5) {
        Object.values(pos).forEach(p => { p.x += normShift; });
        Object.values(crossFamilyGhosts).forEach(g => { g.x += normShift; });
      }
    }
  }


  // --- Duplicaat-kinderen bij partner-ghosts ---
  // Als een partner-ghost ver van de echte kinderen staat, maak kind-duplicaten aan
  // zodat kinderen zichtbaar zijn bij BEIDE ouder-clusters.
  // Draait aan het EINDE van de pipeline zodat finale posities worden gebruikt.
  {
    const partnerGhosts = Object.entries(crossFamilyGhosts).filter(([k, g]) => {
      return (partnersOf[g.personId] || []).includes(g.adjacentTo);
    });

    partnerGhosts.forEach(([ghostKey, ghost]) => {
      const parentA = ghost.adjacentTo;
      const parentB = ghost.personId;
      if (!pos[parentA]) return;

      const childrenA = new Set(fullChildrenOf[parentA] || childrenOf[parentA] || []);
      const childrenB = new Set(fullChildrenOf[parentB] || childrenOf[parentB] || []);
      const commonChildren = [...childrenA].filter(cid => childrenB.has(cid) && pos[cid]);
      if (!commonChildren.length) return;

      const parentAX = pos[parentA].x;
      const parentAY = pos[parentA].y;
      const FAR_THRESHOLD = 3 * (NODE_W + H_GAP);
      const farChildren = commonChildren.filter(cid =>
        Math.abs(pos[cid].x - parentAX) > FAR_THRESHOLD ||
        Math.abs(pos[cid].y - parentAY) > 3 * (NODE_H + V_GAP)
      );
      if (!farChildren.length) return;

      const clusterCenterX = (pos[parentA].x + ghost.x) / 2 + NODE_W / 2;
      const childY = Math.max(pos[parentA].y, ghost.y) + NODE_H + V_GAP;
      const totalW = farChildren.length * NODE_W + (farChildren.length - 1) * H_GAP;
      let startX = clusterCenterX - totalW / 2;

      farChildren.forEach((cid, i) => {
        const childGhostKey = cid + ':cg:' + parentA;
        if (crossFamilyGhosts[childGhostKey]) return;
        let gx = startX + i * (NODE_W + H_GAP);
        // Collision check: verschuif naar rechts als ghost overlapt met bestaande kaarten of ghosts
        for (let attempt = 0; attempt < 50; attempt++) {
          let blocked = false;
          for (const oid of Object.keys(pos)) {
            const p = pos[oid];
            if (Math.abs(p.y - childY) < NODE_H && Math.abs(p.x - gx) < NODE_W + H_GAP) {
              blocked = true; break;
            }
          }
          if (!blocked) {
            for (const [k, og] of Object.entries(crossFamilyGhosts)) {
              if (Math.abs(og.y - childY) < NODE_H && Math.abs(og.x - gx) < NODE_W + H_GAP) {
                blocked = true; break;
              }
            }
          }
          if (!blocked) break;
          gx += NODE_W + H_GAP;
        }
        crossFamilyGhosts[childGhostKey] = {
          x: gx,
          y: childY,
          personId: cid,
          adjacentTo: parentA
        };
      });
    });
  }

  // --- Post-pipeline Y-proximity: kinderen dichter bij ouders ---
  // Als kinderen > 1.5 generatie-afstand van hun ouders staan en er ruimte is,
  // verplaats ze naar de eerstvolgende vrije Y-positie dicht bij de ouders.
  {
    const MAX_GAP = 1.4 * (NODE_H + V_GAP);
    const allIds = new Set(Object.keys(pos));
    // Groepeer kinderen per ouder-set
    const parentChildGroups = new Map();
    state.relationships.forEach(r => {
      if (r.type !== 'parent-child' || !pos[r.parentId] || !pos[r.childId]) return;
      const parents = state.relationships
        .filter(rel => (rel.type === 'parent-child' || rel.type === 'social-parent') && rel.childId === r.childId)
        .map(rel => rel.parentId)
        .filter(pid => pos[pid])
        .sort();
      if (!parents.length) return;
      const key = parents.join(',');
      if (!parentChildGroups.has(key)) parentChildGroups.set(key, { parents, children: new Set() });
      parentChildGroups.get(key).children.add(r.childId);
    });

    parentChildGroups.forEach(({ parents, children }) => {
      const parentMaxY = Math.max(...parents.map(pid => pos[pid].y + NODE_H));
      const idealY = parentMaxY + V_GAP;
      const childArr = [...children].filter(cid => pos[cid] && pos[cid].y - parentMaxY > MAX_GAP);
      if (!childArr.length) return;

      // Check of idealY vrij is voor deze kinderen
      const childMinX = Math.min(...childArr.map(cid => pos[cid].x));
      const childMaxX = Math.max(...childArr.map(cid => pos[cid].x)) + NODE_W;
      let blocked = false;
      for (const oid of allIds) {
        if (children.has(oid) || parents.includes(oid) || !pos[oid]) continue;
        if (pos[oid].x + NODE_W <= childMinX - H_GAP || pos[oid].x >= childMaxX + H_GAP) continue;
        if (Math.abs(pos[oid].y - idealY) < NODE_H + 10) { blocked = true; break; }
      }
      if (blocked) return;

      // Verplaats kinderen naar idealY
      const dy = idealY - Math.min(...childArr.map(cid => pos[cid].y));
      childArr.forEach(cid => { pos[cid].y += dy; });
    });
  }

  // --- Post-pipeline ghost suppression ---
  // Verwijder ghosts waarvan het echte persoon na alle pipeline-stappen
  // dichtbij de adjacentTo persoon staat (was misschien ver weg bij extractie).
  {
    const NEAR_X = 3 * (NODE_W + H_GAP);
    const NEAR_Y = 3 * (NODE_H + V_GAP);
    const toRemove = [];
    Object.entries(crossFamilyGhosts).forEach(([key, ghost]) => {
      // Skip bioRow ghosts (Fazelahmad neef-nicht): die zijn bewust geplaatst
      // in de bio-rij ondanks dat real-positie dichtbij adjacentTo kan staan.
      if (key.endsWith(':cg:bioRow')) return;
      // Skip cousin-pair ghosts: die moeten ALTIJD zichtbaar blijven
      // (bijv. Alina+Noman in Hagig boom, beide kleinkinderen op verschillende rijen)
      if (cousinPairSet.has([ghost.personId, ghost.adjacentTo].sort().join(','))) return;
      const realPos = pos[ghost.personId];
      const adjPos = pos[ghost.adjacentTo];
      if (realPos && adjPos &&
          Math.abs(realPos.x - adjPos.x) <= NEAR_X &&
          Math.abs(realPos.y - adjPos.y) < NEAR_Y) {
        toRemove.push(key);
      }
    });
    toRemove.forEach(k => delete crossFamilyGhosts[k]);
  }

  // --- Post-pipeline ghost compaction ---
  // Schuif partner-ghosts dichter naar hun adjacentTo als er onnodige ruimte is
  {
    Object.entries(crossFamilyGhosts).forEach(([gKey, ghost]) => {
      // Skip bioRow ghosts (Fazelahmad neef-nicht): die staan bewust geplaatst
      if (gKey.endsWith(':cg:bioRow')) return;
      const adjPos = pos[ghost.adjacentTo];
      if (!adjPos) return;
      // Bepaal ideale positie: direct rechts of links van adjacentTo
      const idealRight = adjPos.x + NODE_W + H_GAP;
      const idealLeft = adjPos.x - NODE_W - H_GAP;
      const ideal = ghost.x >= adjPos.x ? idealRight : idealLeft;
      if (Math.abs(ghost.x - ideal) < 2) return; // al goed

      // Check of ideale positie vrij is van echte kaarten en andere ghosts
      const blocked = (tx) => {
        for (const id of Object.keys(pos)) {
          if (id === ghost.adjacentTo || id === ghost.personId) continue;
          const p = pos[id];
          if (Math.abs(p.y - ghost.y) < NODE_H && p.x < tx + NODE_W && p.x + NODE_W > tx) return true;
        }
        for (const [k, og] of Object.entries(crossFamilyGhosts)) {
          if (og === ghost) continue;
          if (Math.abs(og.y - ghost.y) < NODE_H && og.x < tx + NODE_W && og.x + NODE_W > tx) return true;
        }
        return false;
      };
      if (!blocked(ideal)) {
        ghost.x = ideal;
      }
    });
  }

  // --- Post-ghost: sluit gaten naast ghosts, alleen onder siblings ---
  {
    Object.entries(crossFamilyGhosts).forEach(([gKey, ghost]) => {
      // Skip bioRow ghosts (Fazelahmad neef-nicht): die zijn bewust geplaatst
      // tussen siblings en moeten niet worden gecompacteerd
      if (gKey.endsWith(':cg:bioRow')) return;
      const adjId = ghost.adjacentTo;
      const adjPos = pos[adjId];
      if (!adjPos || Math.abs(adjPos.y - ghost.y) > 10) return;

      // Vind siblings van adjacentTo (kinderen van dezelfde ouders)
      const adjParents = state.relationships
        .filter(r => r.type === 'parent-child' && r.childId === adjId)
        .map(r => r.parentId);
      if (adjParents.length === 0) return;

      const siblingIds = new Set();
      adjParents.forEach(pid => {
        state.relationships
          .filter(r => (r.type === 'parent-child' || r.type === 'social-parent') && r.parentId === pid)
          .forEach(r => siblingIds.add(r.childId));
      });

      // Verzamel siblings + ghost op dezelfde rij
      const rowCards = [];
      siblingIds.forEach(sid => {
        if (pos[sid] && Math.abs(pos[sid].y - ghost.y) < 10) {
          rowCards.push({ id: sid, x: pos[sid].x, isGhost: false });
        }
      });
      rowCards.push({ id: gKey, x: ghost.x, isGhost: true });
      rowCards.sort((a, b) => a.x - b.x);

      // Vind ghost positie en sluit gat rechts ervan
      const ghostIdx = rowCards.findIndex(rc => rc.isGhost);
      if (ghostIdx < 0 || ghostIdx + 1 >= rowCards.length) return;

      const ghostRight = ghost.x + NODE_W;
      const next = rowCards[ghostIdx + 1];
      const gap = next.x - ghostRight;
      if (gap <= H_GAP + 10) return;

      const shift = gap - H_GAP;
      for (let j = ghostIdx + 1; j < rowCards.length; j++) {
        if (rowCards[j].isGhost) {
          crossFamilyGhosts[rowCards[j].id].x -= shift;
        } else {
          pos[rowCards[j].id].x -= shift;
        }
        rowCards[j].x -= shift;
      }
    });
  }

  // --- Post-ghost: centreer kinderen van ghost-paren onder ouders ---
  {
    const centeredChildren = new Set();
    const MAX_PARENT_DIST = 2 * (NODE_H + V_GAP); // max Y-afstand ouder→kind

    Object.values(crossFamilyGhosts).forEach(ghost => {
      const adjPos = pos[ghost.adjacentTo];
      if (!adjPos) return;

      const pid1 = ghost.personId;
      const pid2 = ghost.adjacentTo;
      const childIds = [...new Set(state.relationships
        .filter(r => r.type === 'parent-child' && (r.parentId === pid1 || r.parentId === pid2))
        .map(r => r.childId))]
        .filter(cid => {
          if (centeredChildren.has(cid)) return false;
          const pars = state.relationships
            .filter(r2 => r2.type === 'parent-child' && r2.childId === cid)
            .map(r2 => r2.parentId);
          return pars.includes(pid1) && pars.includes(pid2);
        })
        .filter(cid => pos[cid] && pos[cid].y > ghost.y &&
                        pos[cid].y - ghost.y <= MAX_PARENT_DIST);

      if (childIds.length === 0) return;

      // Ouder-centrum
      const pLeft = Math.min(ghost.x, adjPos.x);
      const pRight = Math.max(ghost.x, adjPos.x) + NODE_W;
      const pCX = (pLeft + pRight) / 2;

      const cLeft = Math.min(...childIds.map(cid => pos[cid].x));
      const cRight = Math.max(...childIds.map(cid => pos[cid].x)) + NODE_W;
      const cCX = (cLeft + cRight) / 2;
      const dx = pCX - cCX;
      if (Math.abs(dx) < 5) return;

      // Check of verschuiving vrij is van obstakels
      const childY = pos[childIds[0]].y;
      const childSet = new Set(childIds);
      let canShift = true;
      for (const [oid, op] of Object.entries(pos)) {
        if (childSet.has(oid)) continue;
        if (Math.abs(op.y - childY) >= NODE_H) continue;
        const newLeft = cLeft + dx;
        const newRight = cRight + dx;
        if (op.x + NODE_W + H_GAP <= newLeft || op.x >= newRight + H_GAP) continue;
        canShift = false; break;
      }

      if (canShift) {
        childIds.forEach(cid => {
          pos[cid].x += dx;
          centeredChildren.add(cid);
        });
      }

      // Y-uitlijning: zoek neven-kinderen op zelfde generatie, lijn Y uit
      const adjSiblings = state.relationships
        .filter(r => r.type === 'parent-child' && r.childId === ghost.adjacentTo)
        .map(r => r.parentId);
      if (adjSiblings.length > 0) {
        // Vind andere kinderen van dezelfde ouders (neven)
        const cousinChildren = new Set();
        adjSiblings.forEach(gpid => {
          state.relationships
            .filter(r => (r.type === 'parent-child' || r.type === 'social-parent') && r.parentId === gpid)
            .forEach(r => {
              // r.childId is een sibling van adjacentTo
              const sibId = r.childId;
              if (sibId === ghost.adjacentTo) return;
              state.relationships
                .filter(r2 => r2.type === 'parent-child' && r2.parentId === sibId)
                .forEach(r2 => {
                  if (pos[r2.childId] && Math.abs(pos[r2.childId].y - childY) < NODE_H + V_GAP) {
                    cousinChildren.add(r2.childId);
                  }
                });
            });
        });
        if (cousinChildren.size > 0) {
          const cousinY = pos[[...cousinChildren][0]].y;
          if (Math.abs(cousinY - childY) > 5 && Math.abs(cousinY - childY) < NODE_H) {
            // Check of Y-verschuiving veilig is (geen overlaps)
            const dy = cousinY - childY;
            let safeY = true;
            for (const cid of childIds) {
              const newY = pos[cid].y + dy;
              for (const [oid, op] of Object.entries(pos)) {
                if (childIds.includes(oid)) continue;
                if (Math.abs(op.x - pos[cid].x) < NODE_W && Math.abs(op.y - newY) < NODE_H) {
                  safeY = false; break;
                }
              }
              if (!safeY) break;
            }
            if (safeY) {
              childIds.forEach(cid => { pos[cid].y = cousinY; });
            }
          }
        }
      }
    });
  }

  // --- Finale pos-vs-pos overlap resolutie ---
  resolveOverlaps(pos, verticalGroupMap);

  // --- Finale ghost-vs-pos overlap resolutie ---
  // Na alle post-pipeline stappen: verschuif ghosts die overlappen met pos-kaarten
  {
    Object.entries(crossFamilyGhosts).forEach(([gKey, ghost]) => {
      for (let attempt = 0; attempt < 50; attempt++) {
        let blocked = false;
        for (const oid of Object.keys(pos)) {
          const p = pos[oid];
          if (Math.abs(p.y - ghost.y) < NODE_H && Math.abs(p.x - ghost.x) < NODE_W + H_GAP) {
            blocked = true; break;
          }
        }
        if (!blocked) {
          for (const [k2, og] of Object.entries(crossFamilyGhosts)) {
            if (k2 === gKey) continue;
            if (Math.abs(og.y - ghost.y) < NODE_H && Math.abs(og.x - ghost.x) < NODE_W + H_GAP) {
              blocked = true; break;
            }
          }
        }
        if (!blocked) break;
        ghost.x += NODE_W + H_GAP;
      }
    });
  }

  // Expose reclassified movers globaal zodat renderLines T-bars naar bio-parents
  // kan skippen (Nilab/Alia hebben in state.relationships nog steeds Khanaga als
  // parent, maar visueel staan ze als inlaw bij Emamuddin/Rahimgul op Agha Gol's rij).
  if (headId === 'pmni0mtna5vxw') {
    window._reclassifiedMovers = new Set(Object.keys(reclassifiedBioParents));
  }

  // ===== SUB-TREE OVERLAY (Mahmadgul) =====
  // Voor elke head-child van Mahmadgul: als er een approved snapshot bestaat voor
  // die head-child's eigen tree, OVERSCHRIJF zijn descendant posities met die uit
  // de snapshot (met X/Y offset zodat hij past in Mahmadgul context).
  // Resultaat: visueel identiek aan elke individueel goedgekeurde sub-stamboom.
  if ((headId === 'pmndyxhre0zi1' || headId === 'pmndyrysy3eq7' || headId === 'pmni0mtna5vxw') && typeof window !== 'undefined' && window._loadedSnapshots) {
    const snapshots = window._loadedSnapshots;
    const headChildren = (childrenOf[headId] || []).filter(cid => pos[cid]);

    headChildren.forEach(hcid => {
      const snap = snapshots[hcid];
      if (!snap || !snap.cards) return;
      const snapHeadPos = snap.cards[hcid];
      if (!snapHeadPos) return;
      const xOffset = pos[hcid].x - snapHeadPos.x;
      const yOffset = pos[hcid].y - snapHeadPos.y;
      // Apply offset aan alle descendants in snapshot
      Object.entries(snap.cards).forEach(([id, snapPos]) => {
        if (id === hcid) return; // skip head-child himself (al op positie)
        if (!pos[id]) return; // skip als niet in mahmadgul tree
        pos[id].x = snapPos.x + xOffset;
        pos[id].y = snapPos.y + yOffset;
      });
    });
  }

  // ===== ABSOLUTE FINALE BIRTHORDER Y-REASSIGNMENT =====
  // Run als laatste stap na ALLE pipeline shifts. Garandeert dat kleinkind-rijen
  // op Y-laag-volgorde van head-children's BO eindigen, ongeacht welke vorige
  // pipeline-stap families dieper trok.
  if (headId === 'pmni0mtna5vxw' || headId === 'pmndyxhre0zi1' || headId === 'pmndyrysy3eq7') {
    const headChildren = (childrenOf[headId] || []).filter(cid => pos[cid]);
    const familyGroups = [];
    headChildren.forEach(hcid => {
      const hcPerson = state.persons.find(x => x.id === hcid);
      const bo = (hcPerson && typeof hcPerson.birthOrder === 'number') ? hcPerson.birthOrder : 9999;
      const members = new Set();
      const collect = (id) => {
        if (members.has(id) || !pos[id]) return;
        members.add(id);
        (partnersOf[id] || []).forEach(pid => {
          if (pos[pid] && Math.abs(pos[pid].y - pos[id].y) < NODE_H) {
            members.add(pid);
            (childrenOf[pid] || []).forEach(cid2 => collect(cid2));
          }
        });
        (childrenOf[id] || []).forEach(cid => collect(cid));
      };
      (childrenOf[hcid] || []).forEach(cid => collect(cid));
      (partnersOf[hcid] || []).forEach(pid => {
        if (pos[pid]) (childrenOf[pid] || []).forEach(cid => collect(cid));
      });
      if (members.size === 0) return;
      const minY = Math.min(...[...members].map(id => pos[id].y));
      familyGroups.push({ headChildId: hcid, bo, minY, members });
    });
    if (familyGroups.length >= 2) {
      const uniqueYs = [...new Set(familyGroups.map(g => g.minY))].sort((a, b) => a - b);
      const sortedByBO = [...familyGroups].sort((a, b) => a.bo - b.bo);
      const yMap = new Map();
      sortedByBO.forEach((g, i) => {
        const targetY = uniqueYs[Math.min(i, uniqueYs.length - 1)];
        yMap.set(g.headChildId, targetY);
      });
      familyGroups.forEach(g => {
        const targetY = yMap.get(g.headChildId);
        const delta = targetY - g.minY;
        if (Math.abs(delta) < 1) return;
        g.members.forEach(id => {
          if (pos[id]) pos[id].y += delta;
        });
      });
    }
  }

  // ===== ABSOLUTE FINALE PARTNER-ALIGNMENT (na BO Y-reassign) =====
  if (headId === 'pmni0mtna5vxw' || headId === 'pmndyxhre0zi1' || headId === 'pmndyrysy3eq7') {
    state.relationships.forEach(rel => {
      if (rel.type !== 'partner') return;
      const a = rel.person1Id, b = rel.person2Id;
      if (!pos[a] || !pos[b]) return;
      const aY = pos[a].y, bY = pos[b].y;
      if (Math.abs(aY - bY) < 10) return;
      const aParents = (parentsOf[a] || []).filter(pid => pos[pid]);
      const bParents = (parentsOf[b] || []).filter(pid => pos[pid]);
      let moverId, anchorY;
      if (aParents.length === 0 && bParents.length > 0) {
        moverId = a; anchorY = bY;
      } else if (bParents.length === 0 && aParents.length > 0) {
        moverId = b; anchorY = aY;
      } else {
        anchorY = Math.max(aY, bY);
        moverId = (aY === anchorY) ? b : a;
      }
      pos[moverId].y = anchorY;
    });
  }

  // ===== FINALE Y-NORMALISATIE 2: zorg dat min Y == PADDING =====
  // Na BO-reassign en partner-align kunnen Y-waarden weer negatief zijn.
  if (headId === 'pmni0mtna5vxw' || headId === 'pmndyxhre0zi1' || headId === 'pmndyrysy3eq7') {
    const allY = [
      ...Object.values(pos).map(p => p.y),
      ...Object.values(crossFamilyGhosts).map(g => g.y)
    ].filter(y => !isNaN(y));
    if (allY.length > 0) {
      const finalMinY = Math.min(...allY);
      const normShiftY = PADDING - finalMinY;
      if (Math.abs(normShiftY) > 0.5) {
        Object.values(pos).forEach(p => { p.y += normShiftY; });
        Object.values(crossFamilyGhosts).forEach(g => { g.y += normShiftY; });
      }
    }
  }

  // ===== Y-QUANTIZE + COMPACT =====
  // Cluster Y-waarden die dichtbij elkaar liggen (< 100px) tot één Y-rij.
  // Daarna enforce minimum gap van 190px tussen opeenvolgende Y-rijen.
  // Resultaat: schone discrete Y-niveaus zonder rare 4/13/26px micro-gaps.
  // Alleen voor Mahmadgul — Fazelahmad heeft eigen specifieke layout.
  if (headId === 'pmndyxhre0zi1' || headId === 'pmndyrysy3eq7') {
    const Y_MERGE_THRESHOLD = 100; // Y-waarden binnen 100px → samen
    const Y_MIN_GAP = NODE_H + V_GAP; // 190px tussen rijen

    // Verzamel alle unieke Y's (pos + ghosts)
    const allYs = new Set();
    Object.values(pos).forEach(p => { if (!isNaN(p.y)) allYs.add(Math.round(p.y)); });
    Object.values(crossFamilyGhosts).forEach(g => { if (!isNaN(g.y)) allYs.add(Math.round(g.y)); });
    const sortedYs = [...allYs].sort((a, b) => a - b);

    // Stap 1: Cluster Y-waarden die binnen Y_MERGE_THRESHOLD vallen
    // yMap: oudY → nieuwY (representatief voor cluster)
    const yMap = new Map();
    let clusterStart = sortedYs[0];
    let clusterRep = clusterStart;
    yMap.set(sortedYs[0], clusterRep);
    for (let i = 1; i < sortedYs.length; i++) {
      const cur = sortedYs[i];
      if (cur - clusterStart < Y_MERGE_THRESHOLD) {
        // Behoort bij huidige cluster
        yMap.set(cur, clusterRep);
      } else {
        // Nieuwe cluster
        clusterStart = cur;
        clusterRep = cur;
        yMap.set(cur, clusterRep);
      }
    }

    // Stap 2: Bouw lijst van unieke cluster-Y's, sorteer
    const clusterYs = [...new Set(yMap.values())].sort((a, b) => a - b);

    // Stap 3: Hertoewijs Y-waarden zodat opeenvolgende cluster-Y's exact Y_MIN_GAP apart zijn
    const yReassign = new Map(); // oudClusterY → nieuwY
    let curY = clusterYs[0];
    yReassign.set(clusterYs[0], curY);
    for (let i = 1; i < clusterYs.length; i++) {
      curY += Y_MIN_GAP;
      yReassign.set(clusterYs[i], curY);
    }

    // Stap 4: Pas toe op alle pos en ghosts
    Object.values(pos).forEach(p => {
      if (isNaN(p.y)) return;
      const oldClusterY = yMap.get(Math.round(p.y));
      if (oldClusterY === undefined) return;
      p.y = yReassign.get(oldClusterY);
    });
    Object.values(crossFamilyGhosts).forEach(g => {
      if (isNaN(g.y)) return;
      const oldClusterY = yMap.get(Math.round(g.y));
      if (oldClusterY === undefined) return;
      g.y = yReassign.get(oldClusterY);
    });

    // Stap 5: Re-run partner-alignment + Y-normalisatie na quantize
    state.relationships.forEach(rel => {
      if (rel.type !== 'partner') return;
      const a = rel.person1Id, b = rel.person2Id;
      if (!pos[a] || !pos[b]) return;
      const aY = pos[a].y, bY = pos[b].y;
      if (Math.abs(aY - bY) < 10) return;
      const aParents = (parentsOf[a] || []).filter(pid => pos[pid]);
      const bParents = (parentsOf[b] || []).filter(pid => pos[pid]);
      let moverId, anchorY;
      if (aParents.length === 0 && bParents.length > 0) {
        moverId = a; anchorY = bY;
      } else if (bParents.length === 0 && aParents.length > 0) {
        moverId = b; anchorY = aY;
      } else {
        anchorY = Math.max(aY, bY);
        moverId = (aY === anchorY) ? b : a;
      }
      pos[moverId].y = anchorY;
    });

    // Y-NORM: zorg dat min Y == PADDING
    const allY2 = [
      ...Object.values(pos).map(p => p.y),
      ...Object.values(crossFamilyGhosts).map(g => g.y)
    ].filter(y => !isNaN(y));
    if (allY2.length > 0) {
      const minY2 = Math.min(...allY2);
      const shift2 = PADDING - minY2;
      if (Math.abs(shift2) > 0.5) {
        Object.values(pos).forEach(p => { p.y += shift2; });
        Object.values(crossFamilyGhosts).forEach(g => { g.y += shift2; });
      }
    }

    // ===== HIERARCHISCHE BO LAYOUT =====
    // Voor Mahmadgul: elke head-child's hele sub-tree (kinderen + kleinkinderen +
    // ...) krijgt zijn eigen Y-block onder de vorige sub-tree.
    // Habib's HELE sub-tree → Y=430 tot 430+depth*190
    // Hagig's HELE sub-tree → onder Habib's eind + Y_GAP
    // Etc. Geeft duidelijk visueel onderscheid tussen sub-bomen.
    // Cousin-pair shared members (bv. Beheshta = kid van Bader uit Hagig EN
    // Golgotai uit Huzurgol) worden geassigned aan de EERSTE family in BO-volgorde.
    const headChildren = (childrenOf[headId] || []).filter(cid => pos[cid]);
    const headChildrenSorted = [...headChildren].sort((a, b) => {
      const aPerson = state.persons.find(x => x.id === a);
      const bPerson = state.persons.find(x => x.id === b);
      const aBo = (aPerson && typeof aPerson.birthOrder === 'number') ? aPerson.birthOrder : 9999;
      const bBo = (bPerson && typeof bPerson.birthOrder === 'number') ? bPerson.birthOrder : 9999;
      return aBo - bBo;
    });
    const visitedAcrossFamilies = new Set();
    const familyGroups = [];
    headChildrenSorted.forEach(hcid => {
      const hcPerson = state.persons.find(x => x.id === hcid);
      const bo = (hcPerson && typeof hcPerson.birthOrder === 'number') ? hcPerson.birthOrder : 9999;
      const members = new Set();
      const collect = (id) => {
        if (members.has(id) || !pos[id]) return;
        if (visitedAcrossFamilies.has(id)) return; // Geclaimed door eerdere family
        members.add(id);
        visitedAcrossFamilies.add(id);
        (partnersOf[id] || []).forEach(pid => {
          if (pos[pid] && Math.abs(pos[pid].y - pos[id].y) < NODE_H && !visitedAcrossFamilies.has(pid)) {
            members.add(pid);
            visitedAcrossFamilies.add(pid);
            (childrenOf[pid] || []).forEach(cid2 => collect(cid2));
          }
        });
        (childrenOf[id] || []).forEach(cid => collect(cid));
      };
      (childrenOf[hcid] || []).forEach(cid => collect(cid));
      (partnersOf[hcid] || []).forEach(pid => {
        if (pos[pid]) (childrenOf[pid] || []).forEach(cid => collect(cid));
      });
      if (members.size === 0) return;
      const ys = [...members].map(id => pos[id].y);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      familyGroups.push({ headChildId: hcid, bo, minY, maxY, depth: maxY - minY, members });
    });
    if (familyGroups.length >= 2) {
      const Y_STEP = NODE_H + V_GAP; // 190
      const sortedByBO = [...familyGroups].sort((a, b) => a.bo - b.bo);
      const headChildY = pos[headId] ? pos[headId].y + Y_STEP : PADDING + Y_STEP;
      let nextStartY = headChildY + Y_STEP;
      // DEBUG log
      if (typeof window !== 'undefined') {
        window._debugHierLayout = { nextStartYInit: nextStartY, sortedByBO: sortedByBO.map(g => ({ headChild: state.persons.find(p => p.id === g.headChildId)?.name, bo: g.bo, minY: g.minY, maxY: g.maxY, depth: g.depth, memberCount: g.members.size })) };
        window._debugHierShifts = [];
      }
      sortedByBO.forEach((g) => {
        const delta = nextStartY - g.minY;
        if (typeof window !== 'undefined') {
          window._debugHierShifts.push({ headChild: state.persons.find(p => p.id === g.headChildId)?.name, oldMinY: g.minY, targetStartY: nextStartY, delta, oldMaxY: g.maxY, newMaxY: nextStartY + g.depth });
        }
        if (Math.abs(delta) >= 1) {
          g.members.forEach(id => {
            if (pos[id]) pos[id].y += delta;
          });
        }
        nextStartY = nextStartY + g.depth + Y_STEP;
      });
    }

    // Re-run partner-alignment + Y-NORM na BO reassign
    state.relationships.forEach(rel => {
      if (rel.type !== 'partner') return;
      const a = rel.person1Id, b = rel.person2Id;
      if (!pos[a] || !pos[b]) return;
      const aY = pos[a].y, bY = pos[b].y;
      if (Math.abs(aY - bY) < 10) return;
      const aParents = (parentsOf[a] || []).filter(pid => pos[pid]);
      const bParents = (parentsOf[b] || []).filter(pid => pos[pid]);
      let moverId, anchorY;
      if (aParents.length === 0 && bParents.length > 0) {
        moverId = a; anchorY = bY;
      } else if (bParents.length === 0 && aParents.length > 0) {
        moverId = b; anchorY = aY;
      } else {
        anchorY = Math.max(aY, bY);
        moverId = (aY === anchorY) ? b : a;
      }
      pos[moverId].y = anchorY;
    });
    const allY3 = [
      ...Object.values(pos).map(p => p.y),
      ...Object.values(crossFamilyGhosts).map(g => g.y)
    ].filter(y => !isNaN(y));
    if (allY3.length > 0) {
      const minY3 = Math.min(...allY3);
      const shift3 = PADDING - minY3;
      if (Math.abs(shift3) > 0.5) {
        Object.values(pos).forEach(p => { p.y += shift3; });
        Object.values(crossFamilyGhosts).forEach(g => { g.y += shift3; });
      }
    }
  }

  // ===== ABSOLUTE FINALE SUB-TREE OVERLAY (Mahmadgul) =====
  // STACK sub-trees verticaal per BO. Alleen BIO-descendants van head-child
  // worden geshift (geen cousin-pair ghosts van andere bomen).
  if ((headId === 'pmndyxhre0zi1' || headId === 'pmndyrysy3eq7' || headId === 'pmni0mtna5vxw') && typeof window !== 'undefined' && window._loadedSnapshots) {
    const snapshots = window._loadedSnapshots;
    const Y_STEP = NODE_H + V_GAP;
    // Helper: is descendant bio van head-child (via parent-child relations)?
    // OOK voor Sayedahmed: stepchildren via partner — als head-child's partner
    // bio-ouder is van X, dan hoort X bij deze head-child's huishouden
    // (bv. Mina via Mastora bij Mahmad). Niet voor Mahmadgul (zou snapshot breken).
    const includeStepchildren = (headId === 'pmndyrysy3eq7');
    const bioDescendantsCache = new Map();
    const getBioDescendants = (hcid) => {
      if (bioDescendantsCache.has(hcid)) return bioDescendantsCache.get(hcid);
      const result = new Set([hcid]);
      const queue = [hcid];
      if (includeStepchildren) {
        // Voeg stepchildren toe: bio-kids van head-child's partners
        state.relationships
          .filter(r => r.type === 'partner' && (r.person1Id === hcid || r.person2Id === hcid))
          .forEach(r => {
            const pid = r.person1Id === hcid ? r.person2Id : r.person1Id;
            state.relationships
              .filter(rr => rr.type === 'parent-child' && rr.parentId === pid)
              .forEach(rr => {
                if (!result.has(rr.childId)) { result.add(rr.childId); queue.push(rr.childId); }
              });
          });
      }
      while (queue.length) {
        const id = queue.shift();
        state.relationships
          .filter(r => r.type === 'parent-child' && r.parentId === id)
          .forEach(r => {
            if (!result.has(r.childId)) { result.add(r.childId); queue.push(r.childId); }
          });
      }
      bioDescendantsCache.set(hcid, result);
      return result;
    };
    // Sorteer head-children op birthOrder
    const headChildren = (childrenOf[headId] || []).filter(cid => pos[cid]);
    const sortedHC = [...headChildren].sort((a, b) => {
      const aP = state.persons.find(p => p.id === a);
      const bP = state.persons.find(p => p.id === b);
      const aBO = (aP && typeof aP.birthOrder === 'number') ? aP.birthOrder : 9999;
      const bBO = (bP && typeof bP.birthOrder === 'number') ? bP.birthOrder : 9999;
      return aBO - bBO;
    });
    // Extra ruimte tussen Y-blokken van head-children — zodat blokken visueel
    // duidelijk gescheiden zijn (i.p.v. dezelfde gap als binnen blok).
    const BLOCK_GAP = Y_STEP + 2 * V_GAP; // 190 + 180 = 370 px tussen blokken
    const headChildY = pos[headId] ? pos[headId].y + Y_STEP : PADDING + Y_STEP;
    let nextSubTreeStartY = headChildY + BLOCK_GAP;
    const visitedAcrossOverlay = new Set();

    // ── BIO-OWNERSHIP MAP ──
    // Voor elke (kleinkind/...) descendant: welke head-child claimt 'm als bio?
    // Eigenaar = head-child met KORTSTE bio-pad (parent-child hops).
    // Bij gelijke afstand wint head-child met laagste BO (= eerste in sortedHC).
    // Doel: cousin-pair partners (Helai bio van Wali Mohammad, Khanaga bio van
    // Fazelahmad, Golgotai bio van Huzurgol, etc.) en hun bio-kinderen
    // (Beheshta) krijgen REAL placement in eigenaar's Y-block, GHOST in andere
    // head-children's blokken waar ze toevallig in de standalone snapshot staan.
    const bioOwnerMap = new Map(); // descendantId → { dist, owner: hcid }
    sortedHC.forEach(hcid => {
      const visited = new Map([[hcid, 0]]);
      const queue = [[hcid, 0]];
      // Stepchildren via partner: dist=2 (head-child → partner → stepchild)
      // Alleen voor Sayedahmed (Mahmadgul snapshot mag niet wijzigen).
      if (includeStepchildren) {
        state.relationships
          .filter(r => r.type === 'partner' && (r.person1Id === hcid || r.person2Id === hcid))
          .forEach(r => {
            const pid = r.person1Id === hcid ? r.person2Id : r.person1Id;
            state.relationships
              .filter(rr => rr.type === 'parent-child' && rr.parentId === pid)
              .forEach(rr => {
                if (!visited.has(rr.childId)) {
                  visited.set(rr.childId, 2);
                  queue.push([rr.childId, 2]);
                }
              });
          });
      }
      while (queue.length) {
        const [id, dist] = queue.shift();
        state.relationships
          .filter(r => r.type === 'parent-child' && r.parentId === id)
          .forEach(r => {
            if (!visited.has(r.childId)) {
              visited.set(r.childId, dist + 1);
              queue.push([r.childId, dist + 1]);
            }
          });
      }
      visited.forEach((dist, id) => {
        if (id === hcid) return;
        const cur = bioOwnerMap.get(id);
        if (!cur || dist < cur.dist) bioOwnerMap.set(id, { dist, owner: hcid });
      });
    });

    if (typeof window !== 'undefined') window._debugOverlay = { mahmadgulY: pos[headId]?.y, headChildY, initStart: nextSubTreeStartY, perChild: [] };
    sortedHC.forEach(hcid => {
      // Probeer eigen snapshot; anders partner's snapshot (bv. Malika → Wali Mohammad)
      let snap = snapshots[hcid];
      let snapHeadId = hcid;
      if (!snap || !snap.cards) {
        const partnerIds = state.relationships
          .filter(r => r.type === 'partner' && (r.person1Id === hcid || r.person2Id === hcid))
          .map(r => r.person1Id === hcid ? r.person2Id : r.person1Id);
        for (const pid of partnerIds) {
          if (snapshots[pid] && snapshots[pid].cards && snapshots[pid].cards[hcid]) {
            snap = snapshots[pid];
            snapHeadId = pid;
            break;
          }
        }
      }
      if (!snap || !snap.cards) {
        // Geen snapshot beschikbaar: fallback met bio-descendants
        const bioD = getBioDescendants(hcid);
        bioD.delete(hcid);
        // Neem ook partners van bio-descendants mee (inlaw spouses zoals Zahir bij Gulbushrah)
        [...bioD].forEach(did => {
          state.relationships
            .filter(r => r.type === 'partner' && (r.person1Id === did || r.person2Id === did))
            .forEach(r => {
              const pid = r.person1Id === did ? r.person2Id : r.person1Id;
              if (pos[pid]) bioD.add(pid);
            });
        });
        const toShift = [...bioD].filter(id => pos[id] && !visitedAcrossOverlay.has(id));
        if (toShift.length === 0) return;
        const curMinY = Math.min(...toShift.map(id => pos[id].y));
        const curMaxY = Math.max(...toShift.map(id => pos[id].y));
        // Voor KLEINE families (≤5 descendants): plaats direct onder head-child
        // i.p.v. te stacken naar nextSubTreeStartY (=diepe positie)
        let targetStartY = nextSubTreeStartY;
        if (toShift.length <= 5) {
          const headY = pos[hcid] ? pos[hcid].y : 0;
          const naturalY = headY + Y_STEP; // direct onder head-child
          // Check of er ruimte is op naturalY (geen andere cards in X-range)
          // Schuif kids X naar onder hcid om naturalY te checken
          const headX = pos[hcid] ? pos[hcid].x : 0;
          const naturalMinX = headX - 100;
          const naturalMaxX = headX + NODE_W + 100;
          const blocked = Object.entries(pos).some(([id, p]) => {
            if (toShift.includes(id) || id === hcid) return false;
            if (Math.abs(p.y - naturalY) >= NODE_H) return false;
            return p.x + NODE_W >= naturalMinX - H_GAP && p.x <= naturalMaxX + H_GAP;
          });
          if (!blocked) {
            targetStartY = naturalY;
          }
        }
        const yOffset = targetStartY - curMinY;
        toShift.forEach(id => {
          pos[id].y += yOffset;
          visitedAcrossOverlay.add(id);
        });
        // Update nextSubTreeStartY alleen als we de stacked positie gebruikten
        if (targetStartY === nextSubTreeStartY) {
          nextSubTreeStartY = nextSubTreeStartY + (curMaxY - curMinY) + BLOCK_GAP;
        }
        return;
      }
      // Snap-head positie: het eigen hcid (gebruik in snapshot van hcid OF partner)
      const snapHeadPos = snap.cards[hcid];
      if (!snapHeadPos) return;
      const bioDescendants = getBioDescendants(hcid);
      // Alleen snap cards die BIO-descendants zijn van hcid → shift
      // Partners van bio-descendants ook meenemen (inlaw, op zelfde Y)
      const partnersOfBio = new Set();
      bioDescendants.forEach(bid => {
        state.relationships.forEach(r => {
          if (r.type === 'partner') {
            if (r.person1Id === bid) partnersOfBio.add(r.person2Id);
            if (r.person2Id === bid) partnersOfBio.add(r.person1Id);
          }
        });
      });
      const allowedIds = new Set([...bioDescendants, ...partnersOfBio]);
      // Filter alleen kaarten die DIEPER (Y > snap head Y) staan dan head-child.
      // Excluded: head-child zelf en zijn partners op zelfde rij.
      const snapDescendants = Object.entries(snap.cards).filter(
        ([id, p]) => id !== hcid && allowedIds.has(id) && p.y > snapHeadPos.y
      );
      if (snapDescendants.length === 0) return;

      // Splits in REAL vs GHOST op basis van bio-ownership
      // - REAL: bio-descendant van DEZE hcid en GEEN andere head-child claimt 'm
      //   (geen entry in bioOwnerMap, of owner === hcid)
      // - GHOST: andere head-child is eigenaar (kortere bio-pad of partner-of-bio
      //   met bio-parents in andere head-child)
      const realSnapDescendants = [];
      const ghostSnapDescendants = [];
      snapDescendants.forEach(entry => {
        const [id] = entry;
        const ownerInfo = bioOwnerMap.get(id);
        const ownedByOther = ownerInfo && ownerInfo.owner !== hcid;
        if (ownedByOther) {
          ghostSnapDescendants.push(entry);
        } else {
          realSnapDescendants.push(entry);
        }
      });
      if (realSnapDescendants.length === 0) return;

      const snapMinY = Math.min(...realSnapDescendants.map(([_, p]) => p.y));
      const snapMaxY = Math.max(...realSnapDescendants.map(([_, p]) => p.y));
      const xOffset = pos[hcid].x - snapHeadPos.x;
      const yOffset = nextSubTreeStartY - snapMinY;
      if (typeof window !== 'undefined') window._debugOverlay.perChild.push({
        head: state.persons.find(p => p.id === hcid)?.name,
        snapHeadX: snapHeadPos.x, snapHeadY: snapHeadPos.y,
        actualHeadX: pos[hcid].x, actualHeadY: pos[hcid].y,
        snapMinY, snapMaxY, xOffset, yOffset, nextSubTreeStartY,
        realCount: realSnapDescendants.length,
        ghostCount: ghostSnapDescendants.length
      });
      realSnapDescendants.forEach(([id, snapPos]) => {
        if (visitedAcrossOverlay.has(id)) return;
        if (!pos[id]) return;
        pos[id].x = snapPos.x + xOffset;
        pos[id].y = snapPos.y + yOffset;
        visitedAcrossOverlay.add(id);
      });
      // GHOSTS: SUPPRESS alle Mahmadgul-eigen ghosts voor IDs in deze head-child's
      // bio-tree (incl. partners). Daarna toevoegen van snapshot ghosts (geshift).
      // BELANGRIJK: skip overlay-ghosts (door eerdere head-child's overlays geplaatst)
      // — die mogen blijven staan in hun eigen Y-block.
      Object.keys(crossFamilyGhosts).forEach(key => {
        if (key.includes(':cg:overlay_')) return; // bewaar overlay-ghosts
        const g = crossFamilyGhosts[key];
        if (allowedIds.has(g.personId) || allowedIds.has(g.adjacentTo)) {
          delete crossFamilyGhosts[key];
        }
      });

      // Helper: bepaal adjacentTo voor een ghost gebaseerd op snap.cards posities
      // Voorkeur: spouse (partner op zelfde Y, dichtbij), dan ouder
      const findAdjacentTo = (ghostId, ghostSnapPos) => {
        // Probeer partner: snap.cards entry met partner-relatie + dichtbij in snap
        const spouseIds = state.relationships
          .filter(r => r.type === 'partner' && (r.person1Id === ghostId || r.person2Id === ghostId))
          .map(r => r.person1Id === ghostId ? r.person2Id : r.person1Id)
          .filter(sid => snap.cards[sid]);
        if (spouseIds.length > 0) {
          let best = spouseIds[0], bestDist = Infinity;
          spouseIds.forEach(sid => {
            const sc = snap.cards[sid];
            const d = Math.abs(sc.x - ghostSnapPos.x) + Math.abs(sc.y - ghostSnapPos.y);
            if (d < bestDist) { bestDist = d; best = sid; }
          });
          return best;
        }
        // Probeer ouder
        const parentIds = state.relationships
          .filter(r => r.type === 'parent-child' && r.childId === ghostId)
          .map(r => r.parentId)
          .filter(pid => snap.cards[pid]);
        if (parentIds.length > 0) {
          let best = parentIds[0], bestDist = Infinity;
          parentIds.forEach(pid => {
            const pc = snap.cards[pid];
            const d = Math.abs(pc.x - ghostSnapPos.x) + Math.abs(pc.y - ghostSnapPos.y);
            if (d < bestDist) { bestDist = d; best = pid; }
          });
          return best;
        }
        return hcid; // fallback
      };

      // Voeg ghosts toe voor 'stolen descendants' (eigendom van andere head-child)
      // Plaats op snap-positie met offset → in DEZE head-child's Y-block
      ghostSnapDescendants.forEach(([id, snapPos], i) => {
        const newX = snapPos.x + xOffset;
        const newY = snapPos.y + yOffset;
        const adjacentTo = findAdjacentTo(id, snapPos);
        const newKey = id + ':cg:overlay_owner_' + hcid + '_' + i;
        crossFamilyGhosts[newKey] = {
          x: newX,
          y: newY,
          personId: id,
          adjacentTo: adjacentTo
        };
      });

      // Voeg snapshot ghosts toe op nieuwe positie (cousin-pair ghosts uit
      // standalone tree, bv. Husna/Noman/Hemat in Hagig's standalone)
      if (snap.ghosts && snap.ghosts.length > 0) {
        snap.ghosts.forEach((sg, i) => {
          const newX = sg.x + xOffset;
          const newY = sg.y + yOffset;
          const adjacentTo = findAdjacentTo(sg.id, sg);
          const newKey = sg.id + ':cg:overlay_' + hcid + '_' + i;
          crossFamilyGhosts[newKey] = {
            x: newX,
            y: newY,
            personId: sg.id,
            adjacentTo: adjacentTo
          };
        });
      }
      nextSubTreeStartY = nextSubTreeStartY + (snapMaxY - snapMinY) + BLOCK_GAP;
    });

    // (POST-OVERLAY SIBLING-Y ALIGNMENT verplaatst naar einde van computeLayout
    // zodat hij ook draait wanneer snapshots niet geladen zijn — zie ABSOLUTE
    // SIBLING-Y ALIGNMENT verderop)

    // Y-NORM na overlay: zorg dat min Y == PADDING
    const allYf = [
      ...Object.values(pos).map(p => p.y),
      ...Object.values(crossFamilyGhosts).map(g => g.y)
    ].filter(y => !isNaN(y));
    if (allYf.length > 0) {
      const minYf = Math.min(...allYf);
      const shiftf = PADDING - minYf;
      if (Math.abs(shiftf) > 0.5) {
        Object.values(pos).forEach(p => { p.y += shiftf; });
        Object.values(crossFamilyGhosts).forEach(g => { g.y += shiftf; });
      }
    }
  }

  // ===== ABSOLUTE FINALE LEAF-CHILD CENTERING =====
  // Allerlaatste stap NA alles. Centreer leaf-kinderen (geen eigen nakomelingen)
  // onder hun ouder-couple center. Voorkomt dat post-pipeline shifts (compactie,
  // ghost-sync, sub-tree overlay) de centering breken — bv. Asma+Rafi → Zoya+Zaynab
  // die op de volledige kids-row stonden maar 115px naar links waren geshift.
  {
    const leafGroups = {};
    state.relationships.forEach(r => {
      if (r.type !== 'parent-child' || !pos[r.childId]) return;
      const pids = state.relationships
        .filter(rel => rel.type === 'parent-child' && rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      if (!pids.length) return;
      const key = pids.join(',');
      if (!leafGroups[key]) leafGroups[key] = { parents: pids, children: new Set() };
      leafGroups[key].children.add(r.childId);
    });
    Object.values(leafGroups).forEach(({ parents, children }) => {
      const cids = [...children].filter(id => pos[id] && !id.startsWith(CROSS_GHOST_PREFIX));
      if (!cids.length) return;
      // Alleen leaf-kinderen
      if (cids.some(cid => (childrenOf[cid] || []).some(did => pos[did]))) return;
      // Alleen bij meerdere ouders (couple)
      if (parents.length < 2) return;
      const pxs = parents.map(pid => pos[pid].x);
      const pys = parents.map(pid => pos[pid].y);
      // Skip als ouders niet op zelfde Y
      if (Math.max(...pys) - Math.min(...pys) > NODE_H) return;
      // Skip cross-family (ouders ver uit elkaar)
      const pSpan = Math.max(...pxs) + NODE_W - Math.min(...pxs);
      if (pSpan > 3 * (NODE_W + H_GAP)) return;
      const pCenter = (Math.min(...pxs) + Math.max(...pxs) + NODE_W) / 2;
      const cRow = pos[cids[0]].y;
      const sameRow = cids.filter(cid => Math.abs(pos[cid].y - cRow) < 20);
      if (sameRow.length === 0) return;
      const cMinX = Math.min(...sameRow.map(id => pos[id].x));
      const cMaxR = Math.max(...sameRow.map(id => pos[id].x)) + NODE_W;
      const cCenter = (cMinX + cMaxR) / 2;
      // Alleen shiften als ouders binnen redelijke Y-afstand (niet cross-block)
      // 5 Y_STEPS = 950px is genoeg voor kinderen die 2 generaties dieper liggen
      // door layout-distributie (bijv. Davud's kids op Y=944 met Davud op Y=284)
      if (Math.abs(pos[cids[0]].y - pys[0]) > 5 * (NODE_H + V_GAP)) return;
      const dx = pCenter - cCenter;
      if (Math.abs(dx) < 3) return;
      // Vind partners van kids op zelfde Y - die moeten meeschuiven
      // (anders blokkeren ze de centering, bijv. Meraj naast Mona)
      const partnersOfCids = new Set();
      sameRow.forEach(cid => {
        state.relationships.forEach(r => {
          if (r.type !== 'partner') return;
          let partnerId = null;
          if (r.person1Id === cid) partnerId = r.person2Id;
          if (r.person2Id === cid) partnerId = r.person1Id;
          if (partnerId && pos[partnerId] && Math.abs(pos[partnerId].y - cRow) < 20) {
            partnersOfCids.add(partnerId);
          }
        });
      });
      const allCardsToShift = new Set([...sameRow, ...partnersOfCids]);
      // Bereken extended cluster bounds (incl. partners) voor clamp
      const allCardsArr = [...allCardsToShift];
      const allMinX = Math.min(...allCardsArr.map(id => pos[id].x));
      const allMaxR = Math.max(...allCardsArr.map(id => pos[id].x)) + NODE_W;
      // Clamp tegen andere kaarten op kids-rij (excl. kids EN hun partners)
      let minDx = -Infinity, maxDx = Infinity;
      const cSet = allCardsToShift;
      Object.keys(pos).forEach(nid => {
        const p = pos[nid];
        if (!p || cSet.has(nid) || Math.abs(p.y - cRow) >= NODE_H) return;
        if (p.x + NODE_W <= allMinX) {
          minDx = Math.max(minDx, p.x + NODE_W + H_GAP - allMinX);
        }
        if (p.x >= allMaxR) {
          maxDx = Math.min(maxDx, p.x - H_GAP - allMaxR);
        }
      });
      if (minDx > maxDx) return;
      const clamped = Math.max(minDx, Math.min(maxDx, dx));
      if (Math.abs(clamped) < 3) return;
      // Shift kids + hun partners samen
      allCardsToShift.forEach(id => { pos[id].x += clamped; });
    });
  }

  // ===== ABSOLUTE FINALE Y-SPACING tussen overlappende kinderen-rijen =====
  // Zorg dat opeenvolgende kinderen-rijen die in X overlappen minimaal Y_STEP
  // (190px) uit elkaar staan. Voorkomt situaties zoals Nawab kids op Y=856 en
  // Zavar Rashid kids op Y=967 (slechts 111px gap) waardoor T-bars elkaar raken.
  {
    const Y_STEP = NODE_H + V_GAP; // 190
    // Verzamel alle bestaande Y-rijen
    const yToCards = new Map();
    Object.entries(pos).forEach(([id, p]) => {
      if (!p) return;
      const yKey = Math.round(p.y);
      if (!yToCards.has(yKey)) yToCards.set(yKey, []);
      yToCards.get(yKey).push({ id, x: p.x });
    });
    const sortedYs = [...yToCards.keys()].sort((a, b) => a - b);
    // Bouw cumulatieve Y-shifts per Y-niveau (vanaf bovenaan, schuif rijen
    // daaronder mee als ze te dicht op de vorige overlapping zitten)
    const yShifts = new Map();
    let cumulativeShift = 0;
    for (let i = 1; i < sortedYs.length; i++) {
      const prevY = sortedYs[i - 1];
      const curY = sortedYs[i];
      const actualGap = (curY + cumulativeShift) - (prevY + (yShifts.get(prevY) || 0));
      // Check of rijen X-overlappen
      const prevCards = yToCards.get(prevY);
      const curCards = yToCards.get(curY);
      const prevMinX = Math.min(...prevCards.map(c => c.x));
      const prevMaxX = Math.max(...prevCards.map(c => c.x)) + NODE_W;
      const curMinX = Math.min(...curCards.map(c => c.x));
      const curMaxX = Math.max(...curCards.map(c => c.x)) + NODE_W;
      const xOverlap = prevMaxX > curMinX && prevMinX < curMaxX;
      if (xOverlap && actualGap < Y_STEP - 5) {
        cumulativeShift += (Y_STEP - actualGap);
      }
      yShifts.set(curY, cumulativeShift);
    }
    // Pas cumulative shifts toe
    Object.values(pos).forEach(p => {
      if (!p) return;
      const yKey = Math.round(p.y);
      const shift = yShifts.get(yKey) || 0;
      if (shift > 0) p.y += shift;
    });
    Object.values(crossFamilyGhosts).forEach(g => {
      if (!g) return;
      const yKey = Math.round(g.y);
      const shift = yShifts.get(yKey) || 0;
      if (shift > 0) g.y += shift;
    });
  }

  // ===== ABSOLUTE FINALE OVERLAP-FIX =====
  // Detecteer kaarten die exact op dezelfde Y én bijna dezelfde X staan.
  // Voorbeeld: Babogal landde op Zakira's positie (X=4995, Y=240) doordat
  // MULTI-PARTNER LAYOUT Zakira naar rechts van Ali Ahmad verplaatste, maar
  // Babogal was daar al gepositioneerd. Schuif overlap-cards (+ hun partners en
  // bio-descendants) naar rechts om ruimte te maken.
  {
    const STEP = NODE_W + H_GAP; // 230
    for (let pass = 0; pass < 5; pass++) {
      let fixedAny = false;
      const idsByY = {};
      Object.entries(pos).forEach(([id, p]) => {
        if (!p) return;
        const yKey = Math.round(p.y);
        if (!idsByY[yKey]) idsByY[yKey] = [];
        idsByY[yKey].push({ id, x: p.x });
      });
      Object.values(idsByY).forEach(ids => {
        ids.sort((a, b) => a.x - b.x);
        for (let i = 0; i < ids.length - 1; i++) {
          const a = ids[i], b = ids[i + 1];
          if (b.x - a.x < NODE_W) {
            // Overlap: shift b en alle naar rechts liggende cards op zelfde Y
            const dx = (a.x + NODE_W + H_GAP) - b.x;
            for (let j = i + 1; j < ids.length; j++) {
              if (pos[ids[j].id]) {
                pos[ids[j].id].x += dx;
                ids[j].x += dx;
              }
            }
            fixedAny = true;
          }
        }
      });
      if (!fixedAny) break;
    }
    // Stap 2: gap compactie head-rij — sluit overbodige gaten op de
    // hoofd-children rij die ontstaan door overlap-shifts.
    {
      const headY = pos[headId]?.y;
      if (headY !== undefined) {
        const targetY = Math.round(headY + NODE_H + V_GAP);
        const ids = [];
        Object.entries(pos).forEach(([id, p]) => {
          if (!p) return;
          if (Math.abs(Math.round(p.y) - targetY) < 5) ids.push({ id, x: p.x });
        });
        ids.sort((a, b) => a.x - b.x);
        for (let i = 0; i < ids.length - 1; i++) {
          const a = ids[i], b = ids[i + 1];
          const gap = b.x - a.x;
          if (gap > STEP + 5) {
            const shift = gap - STEP;
            for (let j = i + 1; j < ids.length; j++) {
              if (pos[ids[j].id]) {
                pos[ids[j].id].x -= shift;
                ids[j].x -= shift;
              }
            }
          }
        }
      }
    }
  }

  // ===== ABSOLUTE LAATSTE: HALF-SIBLINGS CLUSTER MERGE =====
  // Wanneer een leaf-child slechts 1 bio-parent in de tree heeft (andere ouder
  // onbekend), en die parent heeft AL kinderen met een andere partner die WEL
  // in de tree zit: behandel het lonely kind als half-broer/zus van die kids.
  // Plaats lonely kids direct naast hun half-siblings op zelfde Y, geordend
  // op birthOrder.
  {
    const isLeaf = id => !(childrenOf[id] || []).some(cid => pos[cid]);
    const inTree = id => !!pos[id];

    // Per parent: alle bio-kids
    const parentToKids = {};
    state.relationships.forEach(r => {
      if (r.type !== 'parent-child' || !pos[r.childId] || !pos[r.parentId]) return;
      if (!parentToKids[r.parentId]) parentToKids[r.parentId] = [];
      parentToKids[r.parentId].push(r.childId);
    });

    Object.entries(parentToKids).forEach(([pid, kidIds]) => {
      // Lonely kids: leafs met SLECHTS deze pid als bio-parent (anderen unknown)
      const lonelyKids = kidIds.filter(kid => {
        if (!isLeaf(kid)) return false;
        const bp = state.relationships.filter(r =>
          r.type === 'parent-child' && r.childId === kid && pos[r.parentId]);
        return bp.length === 1;
      });
      // Shared kids: leafs met >= 2 bio-parents in tree (incl. deze pid)
      const sharedKids = kidIds.filter(kid => {
        if (!isLeaf(kid)) return false;
        const bp = state.relationships.filter(r =>
          r.type === 'parent-child' && r.childId === kid && pos[r.parentId]);
        return bp.length >= 2;
      });
      if (!lonelyKids.length || !sharedKids.length) return;

      // Cluster Y van shared kids
      const sharedY = pos[sharedKids[0]].y;
      // Sortering op birthOrder
      const allCluster = [...sharedKids, ...lonelyKids];
      const sortedCluster = [...allCluster].sort((a, b) => {
        const aP = state.persons.find(p => p.id === a);
        const bP = state.persons.find(p => p.id === b);
        const aBO = (aP && typeof aP.birthOrder === 'number') ? aP.birthOrder : 9999;
        const bBO = (bP && typeof bP.birthOrder === 'number') ? bP.birthOrder : 9999;
        return aBO - bBO;
      });
      // Centreer cluster onder de "primary couple" (= shared kid's parents)
      const sharedParentIds = state.relationships
        .filter(r => r.type === 'parent-child' && r.childId === sharedKids[0] && pos[r.parentId])
        .map(r => r.parentId);
      const coupleCenterX = sharedParentIds.reduce((s, p) => s + pos[p].x + NODE_W / 2, 0) / sharedParentIds.length;
      const numCards = sortedCluster.length;
      const totalW = numCards * NODE_W + (numCards - 1) * H_GAP;
      const startX = coupleCenterX - totalW / 2;
      // OVERLAP CHECK: zou nieuwe placement met andere cards op zelfde Y botsen?
      const newRanges = sortedCluster.map((_, i) => ({
        l: startX + i * (NODE_W + H_GAP),
        r: startX + i * (NODE_W + H_GAP) + NODE_W
      }));
      const blocked = Object.entries(pos).some(([id, p]) => {
        if (sortedCluster.includes(id)) return false;
        if (Math.abs(p.y - sharedY) >= NODE_H) return false;
        return newRanges.some(r => !(p.x + NODE_W <= r.l - H_GAP || p.x >= r.r + H_GAP));
      });
      if (blocked) return; // skip merge — zou overlap geven
      sortedCluster.forEach((id, i) => {
        pos[id].x = startX + i * (NODE_W + H_GAP);
        pos[id].y = sharedY;
      });
    });
  }

  // ===== ABSOLUTE LAATSTE: T-LINE MIN LENGTH =====
  // Voor elke leaf-children groep: als T-lijn (parent → kid) korter is dan
  // 1.5 * Y_STEP (= 285px), push de kids een halve Y_STEP omlaag (95px) zodat
  // er meer ruimte is tussen ouders en kinderen. Voorkomt dat Azghar-stijl
  // groepen TE strak onder hun ouders staan terwijl andere groepen ver weg zijn.
  // Skip head's eigen kinderen (gen=1).
  {
    const Y_STEP = NODE_H + V_GAP; // 190
    const MIN_T_LENGTH = Math.round(Y_STEP * 1.5); // 285
    const isLeaf = id => !(childrenOf[id] || []).some(cid => pos[cid]);
    const minTreeY = Math.min(...Object.values(pos).map(p => p.y));

    const grpsByParent = {};
    state.relationships.forEach(r => {
      if (r.type !== 'parent-child' || !pos[r.childId]) return;
      const parents = state.relationships
        .filter(rel => rel.type === 'parent-child' && rel.childId === r.childId && pos[rel.parentId])
        .map(rel => rel.parentId).sort();
      if (!parents.length) return;
      const key = parents.join(',');
      if (!grpsByParent[key]) grpsByParent[key] = { parents, children: new Set() };
      grpsByParent[key].children.add(r.childId);
    });

    Object.values(grpsByParent).forEach(({ parents, children }) => {
      const cids = [...children].filter(id => pos[id] && isLeaf(id));
      if (!cids.length) return;
      // SKIP cousin-pair: als parents in HEEL verschillende Y-blocks staan
      // (verschil > 2 * Y_STEP), dan is dit een cross-block cousin-pair situatie.
      // Niet pushen — kids horen bij ÉÉN ouder's block, niet beide.
      const parentYs = parents.map(pid => pos[pid].y);
      const parentYRange = Math.max(...parentYs) - Math.min(...parentYs);
      if (parentYRange > 2 * Y_STEP) return;
      const parentY = Math.max(...parentYs);
      // Skip head's kids (parents op head row)
      if (parentY <= minTreeY + 50) return;
      const currentY = pos[cids[0]].y;
      const tLength = currentY - parentY;
      if (tLength >= MIN_T_LENGTH - 5) return; // al lang genoeg

      const targetY = parentY + MIN_T_LENGTH;
      // Verzamel cluster (kids + inlaws op zelfde Y)
      const cluster = new Set(cids);
      cids.forEach(cid => {
        (partnersOf[cid] || []).forEach(pid => {
          if (pos[pid] && Math.abs(pos[pid].y - currentY) < 5 &&
              !(parentsOf[pid] || []).some(p => pos[p])) cluster.add(pid);
        });
      });
      // Check overlap met cards op targetY (excl. cluster zelf)
      const ranges = [...cluster].map(id => ({l: pos[id].x, r: pos[id].x + NODE_W}));
      const blocked = Object.entries(pos).some(([id, p]) => {
        if (cluster.has(id)) return false;
        if (Math.abs(p.y - targetY) >= NODE_H) return false;
        return ranges.some(r => !(p.x + NODE_W <= r.l - H_GAP || p.x >= r.r + H_GAP));
      });
      if (blocked) return;
      cluster.forEach(id => { pos[id].y = targetY; });
    });
  }

  // ===== ABSOLUTE SIBLING-Y ALIGNMENT (Mahmadgul + Sayedahmed) =====
  // Bio-siblings (kids met dezelfde ouder-set) moeten op DEZELFDE Y staan.
  // Voorbeeld: in Mahmadgul kreeg Meraj Faizi door Sediqa+Omid sub-overlay een
  // andere Y dan zijn bio-zusters Hemat/Nilab/Alia. Align naar minY.
  if (headId === 'pmndyxhre0zi1' || headId === 'pmndyrysy3eq7') {
    const Y_STEP_SIB = NODE_H + V_GAP;
    const sibGroups = {};
    Object.keys(pos).forEach(cid => {
      if (!pos[cid] || cid.startsWith(CROSS_GHOST_PREFIX)) return;
      const bioParents = state.relationships
        .filter(r => r.type === 'parent-child' && r.childId === cid && pos[r.parentId])
        .map(r => r.parentId);
      if (bioParents.length === 0) return;
      const key = [...bioParents].sort().join(',');
      if (!sibGroups[key]) sibGroups[key] = [];
      sibGroups[key].push(cid);
    });
    Object.values(sibGroups).forEach(cids => {
      if (cids.length < 2) return;
      const ys = cids.map(id => pos[id].y);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      if (maxY - minY < 1) return; // al gealigneerd
      if (maxY - minY > Y_STEP_SIB * 1.5) return; // te ver uit elkaar = cross-block
      // Align siblings + hun partners op zelfde rij naar minY
      cids.forEach(id => {
        const oldY = pos[id].y;
        pos[id].y = minY;
        // Partner op (bijna) zelfde rij als oude Y mee laten gaan
        (partnersOf[id] || []).forEach(pid => {
          if (!pos[pid]) return;
          if (Math.abs(pos[pid].y - oldY) < 30) pos[pid].y = minY;
        });
      });
    });
  }

  // ===== ULTIMATE Y-SPACING (ABSOLUTE LAATSTE PASS) =====
  // Garandeert minimum Y_STEP gap (190px) tussen alle Y-rijen die X-overlappen.
  // Loopt 3x om cascade-shifts op te lossen waarbij eerdere shifts nieuwe
  // gap-violaties creeeren bij rijen verder naar beneden.
  // Dit lost o.a. Habib Gull op (Mergalela kids @ Y=535 vs Malalai kids @ Y=652).
  // SKIP voor Mahmadgul/Sayedahmed/Fazelahmad: die gebruiken SUB-TREE OVERLAY met
  // snapshot posities die EXACT goedgekeurd zijn — niet aanpassen.
  if (headId !== 'pmndyxhre0zi1' && headId !== 'pmndyrysy3eq7' && headId !== 'pmni0mtna5vxw') {
    const Y_STEP = NODE_H + V_GAP; // 190
    for (let pass = 0; pass < 3; pass++) {
      // Verzamel alle Y-rijen
      const yToCards = new Map();
      Object.entries(pos).forEach(([id, p]) => {
        if (!p || typeof p.y !== 'number' || isNaN(p.y)) return;
        const yKey = Math.round(p.y);
        if (!yToCards.has(yKey)) yToCards.set(yKey, []);
        yToCards.get(yKey).push({ id, x: p.x });
      });
      Object.entries(crossFamilyGhosts).forEach(([key, g]) => {
        if (!g || typeof g.y !== 'number' || isNaN(g.y)) return;
        const yKey = Math.round(g.y);
        if (!yToCards.has(yKey)) yToCards.set(yKey, []);
        yToCards.get(yKey).push({ id: '__ghost_' + key, x: g.x, isGhost: true, key });
      });

      const sortedYs = [...yToCards.keys()].sort((a, b) => a - b);
      let cumulativeShift = 0;
      const yShifts = new Map();
      yShifts.set(sortedYs[0], 0);

      for (let i = 1; i < sortedYs.length; i++) {
        const prevY = sortedYs[i - 1];
        const curY = sortedYs[i];
        const effPrevY = prevY + (yShifts.get(prevY) || 0);
        const effCurY = curY + cumulativeShift;
        const actualGap = effCurY - effPrevY;
        // Check X overlap tussen rijen
        const prevCards = yToCards.get(prevY);
        const curCards = yToCards.get(curY);
        const prevMinX = Math.min(...prevCards.map(c => c.x));
        const prevMaxX = Math.max(...prevCards.map(c => c.x)) + NODE_W;
        const curMinX = Math.min(...curCards.map(c => c.x));
        const curMaxX = Math.max(...curCards.map(c => c.x)) + NODE_W;
        const xOverlap = prevMaxX > curMinX && prevMinX < curMaxX;
        if (xOverlap && actualGap < Y_STEP) {
          cumulativeShift += (Y_STEP - actualGap);
        }
        yShifts.set(curY, cumulativeShift);
      }

      if (cumulativeShift === 0) break; // stable, geen verdere shifts nodig

      // Pas shifts toe
      Object.values(pos).forEach(p => {
        if (!p || typeof p.y !== 'number' || isNaN(p.y)) return;
        const yKey = Math.round(p.y);
        const shift = yShifts.get(yKey) || 0;
        if (shift > 0) p.y += shift;
      });
      Object.values(crossFamilyGhosts).forEach(g => {
        if (!g || typeof g.y !== 'number' || isNaN(g.y)) return;
        const yKey = Math.round(g.y);
        const shift = yShifts.get(yKey) || 0;
        if (shift > 0) g.y += shift;
      });
    }
  }

  // ===== SNAPSHOT-DIRECT OVERRIDE (alle bomen met goedgekeurde snapshot) =====
  // Voor bomen die een eigen snapshot hebben (Habib Gull, Hagig Gull, Mahmadgul,
  // Sayedahmed, etc): overschrijf alle posities direct met snapshot waarden zodat
  // de goedgekeurde layout 1:1 wordt getoond. Pas ook snapshot-ghosts toe (incl.
  // cousin-pair ghosts zoals Bader's kids in Mahmadgul). Cards die NIET in snapshot
  // zitten (later toegevoegd) behouden hun computed positie.
  // SKIP voor Fazelahmad: die gebruikt SUB-TREE OVERLAY (head-children snapshots)
  // — direct override zou conflicteren.
  if (headId && headId !== 'pmni0mtna5vxw' && typeof window !== 'undefined' && window._loadedSnapshots && window._loadedSnapshots[headId]) {
    const snap = window._loadedSnapshots[headId];
    if (snap && snap.cards) {
      // Tel hoeveel cards in pos vs in snapshot zitten
      const posIds = Object.keys(pos).filter(id => !id.startsWith(CROSS_GHOST_PREFIX));
      const inBoth = posIds.filter(id => snap.cards[id]);
      // Alleen toepassen als minstens 30% van pos cards in snapshot zit.
      // Lager dan 80% omdat bomen als Fazelahmad 75 nieuwe personen kunnen hebben
      // gekregen sinds snapshot — de snapshot dekt dan de basis maar nieuwe personen
      // krijgen pipeline-positie. Beter dan helemaal geen snapshot toepassen.
      if (posIds.length > 0 && inBoth.length / posIds.length >= 0.3) {
        // Pas snapshot card posities toe
        Object.entries(snap.cards).forEach(([id, snapPos]) => {
          if (pos[id]) {
            pos[id].x = snapPos.x;
            pos[id].y = snapPos.y;
          }
        });
        // Pas snapshot ghosts toe — vervang ALLE pipeline-ghosts voor personen
        // die snapshot ghosts hebben, zodat we geen dubbele krijgen
        if (snap.ghosts && snap.ghosts.length > 0) {
          // Verzamel alle personIds die snapshot ghosts hebben
          const snapGhostPersonIds = new Set(snap.ghosts.map(g => g.id));
          // Verwijder ALLE bestaande ghosts (pipeline + overlay + snapshot) voor
          // deze personIds, zodat alleen de snapshot ghost overblijft
          Object.keys(crossFamilyGhosts).forEach(key => {
            const g = crossFamilyGhosts[key];
            if (key.includes(':cg:overlay_') || key.includes(':cg:snapshot_')) {
              delete crossFamilyGhosts[key];
              return;
            }
            // Verwijder pipeline-ghosts voor personen die in snapshot.ghosts staan
            if (g && snapGhostPersonIds.has(g.personId)) {
              delete crossFamilyGhosts[key];
            }
          });
          snap.ghosts.forEach((g, i) => {
            const newKey = g.id + ':cg:snapshot_' + i;
            crossFamilyGhosts[newKey] = {
              x: g.x,
              y: g.y,
              personId: g.id,
              adjacentTo: g.adjacentTo
            };
          });
        }
      }
    }
  }

  // ===== ABSOLUTE LAATSTE X-NORMALISATIE (na alle overlays) =====
  // SUB-TREE OVERLAY en SNAPSHOT-DIRECT OVERRIDE kunnen negatieve X creeeren.
  // Force minX = PADDING zodat geen kaarten links van canvas-rand vallen.
  {
    const allX = [
      ...Object.values(pos).map(p => p?.x).filter(x => typeof x === 'number' && !isNaN(x)),
      ...Object.values(crossFamilyGhosts).map(g => g?.x).filter(x => typeof x === 'number' && !isNaN(x))
    ];
    if (allX.length > 0) {
      const finalMinX = Math.min(...allX);
      const normShift = PADDING - finalMinX;
      if (Math.abs(normShift) > 0.5) {
        Object.values(pos).forEach(p => { if (p && typeof p.x === 'number') p.x += normShift; });
        Object.values(crossFamilyGhosts).forEach(g => { if (g && typeof g.x === 'number') g.x += normShift; });
      }
    }
  }

  return { pos, crossFamilyGhosts, cousinChildReferences };
}

// (V2 layout verwijderd)

// ============================================================
// SVG LINE RENDERING
// ============================================================
function renderLines(pos, treeRanges, treePositions, duplicates) {
  const svg = document.getElementById('svg-lines');
  const parts = [];    // Verticale lijnen (midden-laag)
  const bgParts = [];  // Foreign line segments (achter, opacity 0.3)
  const fgParts = [];  // Horizontale T-bars + partner lijnen (voorgrond, bovenop)
  // Reset T-bar zone tracking voor extended-line overlap detectie (multi-vrouwen).
  // Wordt in elke drawLinesForPositions opnieuw opgebouwd (Fase 1.5).
  window._renderedTBarZones = [];

  // ── Bouw set van cross-family partner paren waarvoor ghosts bestaan ──
  const crossFamilySkipPairs = new Set();
  // Duplicate kaartposities voor lijn-gap berekening (beschikbaar in alle helpers)
  const dupCardPositions = {};
  if (duplicates) {
    Object.values(duplicates).forEach(dup => {
      if (dup.adjacentTo) {
        // Dit is een cross-family ghost: skip de lange partner-lijn
        const pairKey = [dup.personId, dup.adjacentTo].sort().join('|');
        crossFamilySkipPairs.add(pairKey);
      }
      dupCardPositions[dup.personId + ':' + dup.adjacentTo] = { x: dup.x, y: dup.y };
    });
  }

  // ── Helper: check of een lijn door een kaart gaat ──
  function hLineBlocked(y, xA, xB, lpos, excludeIds) {
    const minX = Math.min(xA, xB), maxX = Math.max(xA, xB);
    for (const id of Object.keys(lpos)) {
      if (excludeIds.has(id)) continue;
      const p = lpos[id];
      if (y <= p.y + 2 || y >= p.y + NODE_H - 2) continue;
      if (maxX <= p.x + 2 || minX >= p.x + NODE_W - 2) continue;
      return true;
    }
    return false;
  }
  function vLineBlocked(x, yA, yB, lpos, excludeIds) {
    const minY = Math.min(yA, yB), maxY = Math.max(yA, yB);
    const checkPos = p => {
      if (x <= p.x + 2 || x >= p.x + NODE_W - 2) return false;
      if (maxY <= p.y + 2 || minY >= p.y + NODE_H - 2) return false;
      return true;
    };
    for (const id of Object.keys(lpos)) {
      if (excludeIds.has(id)) continue;
      if (checkPos(lpos[id])) return true;
    }
    for (const p of Object.values(dupCardPositions)) {
      if (checkPos(p)) return true;
    }
    return false;
  }
  // Get card rects that would block a horizontal line at Y, return their X ranges
  function getHBlockers(y, xA, xB, lpos, excludeIds) {
    const minX = Math.min(xA, xB), maxX = Math.max(xA, xB);
    const blockers = [];
    const checkPos = p => {
      if (y <= p.y + 2 || y >= p.y + NODE_H - 2) return;
      if (maxX <= p.x + 2 || minX >= p.x + NODE_W - 2) return;
      blockers.push({ left: p.x - 4, right: p.x + NODE_W + 4 });
    };
    for (const id of Object.keys(lpos)) {
      if (excludeIds.has(id)) continue;
      checkPos(lpos[id]);
    }
    for (const p of Object.values(dupCardPositions)) {
      checkPos(p);
    }
    blockers.sort((a, b) => a.left - b.left);
    return blockers;
  }
  // Draw a horizontal line avoiding blockers — returns SVG segments
  // extraAttr: optional inline style string, e.g. 'style="stroke:#3b82f6;stroke-width:2"'
  function drawHLineAvoiding(y, xA, xB, cls, lpos, excludeIds, extraAttr) {
    const minX = Math.min(xA, xB), maxX = Math.max(xA, xB);
    const blockers = getHBlockers(y, xA, xB, lpos, excludeIds);
    const ea = extraAttr || '';
    if (!blockers.length) {
      return `<line x1="${xA}" y1="${y}" x2="${xB}" y2="${y}" class="${cls}" ${ea}/>`;
    }
    // Clear segments at full opacity; blocked portions → bgParts (semi-transparant, achter)
    const segs = [];
    let curX = minX;
    blockers.forEach(b => {
      if (curX < b.left) {
        segs.push(`<line x1="${curX}" y1="${y}" x2="${b.left}" y2="${y}" class="${cls}" ${ea}/>`);
      }
      const blockStart = Math.max(curX, b.left);
      if (b.right > blockStart) {
        bgParts.push(`<line x1="${blockStart}" y1="${y}" x2="${b.right}" y2="${y}" class="${cls}" ${ea}/>`);
      }
      curX = Math.max(curX, b.right);
    });
    if (curX < maxX) {
      segs.push(`<line x1="${curX}" y1="${y}" x2="${maxX}" y2="${y}" class="${cls}" ${ea}/>`);
    }
    return segs.join('');
  }

  // Draw a vertical line avoiding blockers — returns SVG segments
  function drawVLineAvoiding(x, yA, yB, cls, lpos, excludeIds, extraAttr) {
    const minY = Math.min(yA, yB), maxY = Math.max(yA, yB);
    const ea = extraAttr || '';
    if (maxY - minY < 2) return '';
    // Find blocking cards (inclusief duplicate kaarten)
    const blockers = [];
    const addBlocker = p => {
      if (x <= p.x + 2 || x >= p.x + NODE_W - 2) return;
      if (p.y + NODE_H <= minY + 2 || p.y >= maxY - 2) return;
      blockers.push({ top: p.y - 4, bot: p.y + NODE_H + 4 });
    };
    for (const id of Object.keys(lpos)) {
      if (excludeIds.has(id)) continue;
      addBlocker(lpos[id]);
    }
    for (const p of Object.values(dupCardPositions)) {
      addBlocker(p);
    }
    if (!blockers.length) {
      return `<line x1="${x}" y1="${yA}" x2="${x}" y2="${yB}" class="${cls}" ${ea}/>`;
    }
    // Clear segments at full opacity; blocked portions → bgParts (semi-transparant, achter)
    blockers.sort((a, b) => a.top - b.top);
    const segs = [];
    let curY = minY;
    blockers.forEach(b => {
      if (curY < b.top) {
        segs.push(`<line x1="${x}" y1="${curY}" x2="${x}" y2="${b.top}" class="${cls}" ${ea}/>`);
      }
      const blockStart = Math.max(curY, b.top);
      if (b.bot > blockStart) {
        bgParts.push(`<line x1="${x}" y1="${blockStart}" x2="${x}" y2="${b.bot}" class="${cls}" ${ea}/>`);
      }
      curY = Math.max(curY, b.bot);
    });
    if (curY < maxY) {
      segs.push(`<line x1="${x}" y1="${curY}" x2="${x}" y2="${maxY}" class="${cls}" ${ea}/>`);
    }
    return segs.join('');
  }

  // ── V8: Globale gezin-kleurmap opbouwen uit ALLE parent-child relaties ──
  // Kleur-groepen voor contrast-check: kleuren in DEZELFDE groep worden
  // visueel als "vergelijkbaar" gezien en mogen niet samen bij nabije gezinnen.
  // Gebruik HUE-families: red/orange/yellow zijn warm-rood-tinten, blue/cyan
  // zijn blauw-tinten, etc. Voorkomt naburige paren met vergelijkbare warmte.
  const COLOR_GROUP = {
    '#dc2626': 'red-orange',     // rood
    '#ea580c': 'red-orange',     // oranje (warm-rood familie)
    '#ca8a04': 'yellow',         // geel/amber (eigen groep, los van rood-warm)
    '#16a34a': 'green',          // groen
    '#0891b2': 'blue',           // cyaan/teal valt onder blauw-koel
    '#1d4ed8': 'blue',           // royal blue
    '#7c3aed': 'purple-pink',    // paars
    '#c026d3': 'purple-pink',    // magenta (paars-roze familie)
    '#000000': 'neutral',        // zwart
    '#475569': 'neutral'         // grijs
  };
  const colorGroup = (c) => COLOR_GROUP[c] || c;
  const colorsConflict = (a, b) => colorGroup(a) === colorGroup(b);

  const gezinColorMap = new Map();
  {
    const allGezinKeys = new Set();
    state.relationships.forEach(r => {
      if (r.type !== 'parent-child') return;
      const allParents = state.relationships
        .filter(rel => (rel.type === 'parent-child' || rel.type === 'social-parent') && rel.childId === r.childId)
        .map(rel => rel.parentId)
        .sort();
      allGezinKeys.add(allParents.join(','));
    });
    // Stap 1: hash-gebaseerde initiële kleur
    [...allGezinKeys].sort().forEach((key) => {
      let hash = 0;
      for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
      }
      gezinColorMap.set(key, FAMILY_COLORS[Math.abs(hash) % FAMILY_COLORS.length]);
    });

    // Stap 2: fix kleurbotsingen (incl. groep-conflicten zoals 2 groene tinten)
    // tussen visueel nabije gezinnen.
    // Gebruik T-BAR positie (kids Y + X span van kids) i.p.v. volledige gezin-bbox.
    // Dit voorkomt dat een gezin met ouder ver weg (zoals Khanaga met kids op Y=2140
    // en parent op Y=276) als "overlap" wordt gezien met alle gezinnen ertussen.
    {
      const famPos = new Map();
      const VIS_Y_MARGIN = 4 * (NODE_H + V_GAP); // Y-marge voor visuele nabijheid (760px) — striktere check
      gezinColorMap.forEach((color, key) => {
        const pids = key.split(',');
        // T-BAR positie: kids Y + X span van kids (waar de horizontale lijn loopt)
        const childIds = state.relationships
          .filter(r => r.type === 'parent-child' && pids.includes(r.parentId))
          .map(r => r.childId);
        const validKids = [...new Set(childIds)].filter(id => pos[id]);
        if (validKids.length === 0) return;
        const kidYs = validKids.map(id => pos[id].y);
        const kidXs = validKids.map(id => pos[id].x);
        // Gebruik MIN/MAX van alle kid Y's (bij meerdere Y-niveaus zoals neef-nicht ghosts)
        famPos.set(key, {
          yMin: Math.min(...kidYs),
          yMax: Math.max(...kidYs),
          xMin: Math.min(...kidXs),
          xMax: Math.max(...kidXs) + NODE_W
        });
      });
      const entries = [...gezinColorMap.entries()];
      // Loop meerdere keren tot er geen kleur-groep botsingen meer zijn
      const tryAssign = (j, iColor, siblings) => {
        // siblings = alle gezinnen die direct naburig zijn met entries[j]
        const neighborGroups = new Set([colorGroup(iColor)]);
        siblings.forEach(sc => neighborGroups.add(colorGroup(sc)));
        for (let ci = 1; ci <= FAMILY_COLORS.length; ci++) {
          const nc = FAMILY_COLORS[ci % FAMILY_COLORS.length];
          if (!neighborGroups.has(colorGroup(nc))) return nc;
        }
        return null;
      };
      const getNeighborColors = (targetKey, targetPos) => {
        const out = [];
        entries.forEach(([k, c]) => {
          if (k === targetKey) return;
          const pk = famPos.get(k);
          if (!pk) return;
          if (pk.yMin <= targetPos.yMax + VIS_Y_MARGIN && targetPos.yMin <= pk.yMax + VIS_Y_MARGIN &&
              pk.xMin <= targetPos.xMax + NODE_W && targetPos.xMin <= pk.xMax + NODE_W) {
            out.push(c);
          }
        });
        return out;
      };
      for (let pass = 0; pass < 8; pass++) {
        let changed = false;
        for (let i = 0; i < entries.length; i++) {
          const pi = famPos.get(entries[i][0]);
          if (!pi) continue;
          for (let j = i + 1; j < entries.length; j++) {
            if (!colorsConflict(entries[i][1], entries[j][1])) continue;
            const pj = famPos.get(entries[j][0]);
            if (!pj) continue;
            if (!(pi.yMin <= pj.yMax + VIS_Y_MARGIN && pj.yMin <= pi.yMax + VIS_Y_MARGIN)) continue;
            if (!(pi.xMin <= pj.xMax + 2*NODE_W && pj.xMin <= pi.xMax + 2*NODE_W)) continue;
            // Probeer entries[j] te wijzigen
            const siblingsJ = getNeighborColors(entries[j][0], pj).filter(c => c !== entries[j][1]);
            const newColorJ = tryAssign(j, entries[i][1], siblingsJ);
            if (newColorJ) {
              entries[j][1] = newColorJ;
              gezinColorMap.set(entries[j][0], newColorJ);
              changed = true;
              continue;
            }
            // Als j niet kan wijzigen, probeer i te wijzigen
            const siblingsI = getNeighborColors(entries[i][0], pi).filter(c => c !== entries[i][1]);
            const newColorI = tryAssign(i, entries[j][1], siblingsI);
            if (newColorI) {
              entries[i][1] = newColorI;
              gezinColorMap.set(entries[i][0], newColorI);
              changed = true;
            }
          }
        }
        if (!changed) break;
      }
      // DEBUG export NA resolver
      if (typeof window !== 'undefined') {
        window._debugFamPos = famPos;
        window._debugEntries = entries.map(([k,v]) => ({ key: k, color: v }));
      }
    }
  }

  // ── Generatie-diepte map vanuit stamhoofd ──
  // Voor variabele lijn-dikte: stamhoofd→kinderen het dikst, daarna afnemend.
  // BFS vanaf activeTreeId via parent-child relaties.
  const depthFromHead = new Map();
  if (typeof activeTreeId !== 'undefined' && activeTreeId) {
    depthFromHead.set(activeTreeId, 0);
    const queue = [[activeTreeId, 0]];
    while (queue.length) {
      const [id, d] = queue.shift();
      state.relationships
        .filter(r => r.type === 'parent-child' && r.parentId === id)
        .forEach(r => {
          if (!depthFromHead.has(r.childId)) {
            depthFromHead.set(r.childId, d + 1);
            queue.push([r.childId, d + 1]);
          }
        });
    }
  }
  // Lijn-dikte op basis van diepte van de OUDER (parent depth N → line N→N+1):
  // depth 0 (stamhoofd): 5px, 1: 4px, 2: 3px, 3: 2.5px, 4+: 2px
  const lineThicknessForDepth = (depth) => {
    if (depth === 0) return 5;
    if (depth === 1) return 4;
    if (depth === 2) return 3;
    if (depth === 3) return 2.5;
    return 2;
  };
  const getThickness = (parentIds) => {
    if (!depthFromHead.size) return 2;
    let minDepth = Infinity;
    parentIds.forEach(pid => {
      const d = depthFromHead.get(pid);
      if (d !== undefined && d < minDepth) minDepth = d;
    });
    return minDepth === Infinity ? 2 : lineThicknessForDepth(minDepth);
  };

  // ── Helper: teken alle relatielijnen voor een gegeven positie-map ──
  function drawLinesForPositions(lpos, dups) {
    const pids = new Set(Object.keys(lpos));
    const lcx   = id => (lpos[id]?.x || 0) + NODE_W / 2;
    const lmidY = id => (lpos[id]?.y || 0) + NODE_H / 2;
    const lbotY = id => (lpos[id]?.y || 0) + NODE_H;
    const ltopY = id => lpos[id]?.y || 0;


    // Partner lines — altijd rechte stippellijn (partners staan altijd naast elkaar)
    const drawnPartners = new Set();
    state.relationships.forEach(r => {
      if (r.type !== 'partner') return;
      const key = [r.person1Id, r.person2Id].sort().join('|');
      if (drawnPartners.has(key)) return;
      drawnPartners.add(key);
      if (!pids.has(r.person1Id) || !pids.has(r.person2Id)) return;

      // Skip lange partner-lijn als er cross-family ghosts voor bestaan
      if (crossFamilySkipPairs.has(key)) return;

      const leftId  = lpos[r.person1Id].x <= lpos[r.person2Id].x ? r.person1Id : r.person2Id;
      const rightId = leftId === r.person1Id ? r.person2Id : r.person1Id;
      const y  = lmidY(leftId);
      const x1 = lpos[leftId].x + NODE_W;
      const x2 = lpos[rightId].x;
      if (x2 <= x1) return;
      // Geen lange partner-lijnen tekenen — gaan door andere kaarten heen
      if ((x2 - x1) > 3 * (NODE_W + H_GAP)) return;
      // Skip partner lines that would pass through other cards
      if (hLineBlocked(y, x1, x2, lpos, new Set([leftId, rightId]))) return;

      fgParts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="partner-line"/>`);
    });

    // Parent-child lines (gegroepeerd per ouder-set)
    // Skip reclassified movers (Nilab/Alia in Fazelahmad): zij hebben relaties met
    // bio-parents (Khanaga+Benazier) maar zijn visueel verplaatst naar Agha Gol's rij
    // als inlaw. Tekening van T-bar Khanaga→Nilab zou een lange foutieve lijn maken.
    const reclassifiedMovers = window._reclassifiedMovers || new Set();
    // Per-tree config: voor Sayedahmed wil de gebruiker GEEN echte social-parent
    // lijnen, maar wel stiefouders (sociale ouders die partner zijn van een
    // bio-ouder). Mina (bio van Mastora, sociaal van Mahmad=stiefvader) hoort
    // bij siblings Matiullah+Nasrat onder Mahmad+Mastora T-bar.
    const skipFullSocialParent = (typeof activeTreeId !== 'undefined' && activeTreeId === 'pmndyrysy3eq7');
    const familyGroups = new Map();
    state.relationships.forEach(r => {
      if (r.type !== 'parent-child') return;
      if (!pids.has(r.parentId) || !pids.has(r.childId)) return;
      if (reclassifiedMovers.has(r.childId)) return; // skip reclassified movers
      const childId = r.childId;
      const bioParents = state.relationships
        .filter(rel => rel.type === 'parent-child' && rel.childId === childId && pids.has(rel.parentId))
        .map(rel => rel.parentId);
      const socialParents = state.relationships
        .filter(rel => rel.type === 'social-parent' && rel.childId === childId && pids.has(rel.parentId))
        .map(rel => rel.parentId);
      const partnersOfFn = (id) => state.relationships
        .filter(rel => rel.type === 'partner' && (rel.person1Id === id || rel.person2Id === id))
        .map(rel => rel.person1Id === id ? rel.person2Id : rel.person1Id);
      let effectiveParents;
      if (skipFullSocialParent) {
        // Alleen stiefouders meenemen (social-parent die partner is van een bio)
        const stepParents = socialParents.filter(spId =>
          bioParents.some(bp => partnersOfFn(bp).includes(spId))
        );
        effectiveParents = [...new Set([...bioParents, ...stepParents])].sort();
      } else {
        effectiveParents = [...new Set([...bioParents, ...socialParents])].sort();
      }
      const key = effectiveParents.join(',');
      if (!familyGroups.has(key)) {
        familyGroups.set(key, { parents: effectiveParents, children: new Set() });
      }
      familyGroups.get(key).children.add(r.childId);
    });

    // ── Fase 1: Bereken alle T-bar data per familiegroep ──
    // Verzamel horizontale T-bar segmenten zodat we overlappen kunnen detecteren
    // en conflicterende bars naar beneden kunnen verschuiven.
    const tbarData = []; // Array van { dropX, dropY, midDropY, validParents, validChildren, clusters, hasDistantClusters, gezinKey }

    familyGroups.forEach(({ parents, children }) => {
      const validParents  = parents.filter(pid => lpos[pid]);
      const validChildren = [...children].filter(cid => lpos[cid]);
      if (!validParents.length || !validChildren.length) return;

      const gezinKey = [...parents].sort().join(',');

      // --- Drop point berekening (Fix A: Cross-family aware) ---
      // Helper: vind dichtstbijzijnde ghost van een persoon t.o.v. een Y-positie.
      // Returns ghost-pos object of null.
      const findGhostNearY = (personId, targetY) => {
        if (!dups) return null;
        let best = null, bestDist = Infinity;
        for (const d of Object.values(dups)) {
          if (d.personId !== personId) continue;
          const dist = Math.abs(d.y - targetY);
          if (dist < bestDist) { bestDist = dist; best = d; }
        }
        return best;
      };

      // Bouw "effectieve" parent-positie map. Voor elke parent: als er een ghost
      // bestaat die dichter bij de kinderen staat dan de echte positie → gebruik
      // de ghost. Voorkomt enorme verticale T-bar drops over de hele tree als
      // bijv. Golgotai (REAL in Huzurgol-block, Y=4238) partner is van Bader
      // (in Hagig-block, Y=1382). Haar ghost staat naast Bader (Y=1382) → die
      // ghost moet gebruikt worden voor de T-bar naar de gedeelde kinderen.
      const childMinY = Math.min(...validChildren.map(cid => ltopY(cid)));
      const effParentPos = new Map();
      validParents.forEach(pid => {
        const realY = lpos[pid].y;
        const realDist = Math.abs(realY - childMinY);
        const ghost = findGhostNearY(pid, childMinY);
        if (ghost) {
          const ghostDist = Math.abs(ghost.y - childMinY);
          if (ghostDist < realDist) {
            effParentPos.set(pid, { x: ghost.x, y: ghost.y, isGhost: true });
            return;
          }
        }
        effParentPos.set(pid, { x: lpos[pid].x, y: lpos[pid].y, isGhost: false });
      });
      const eCX = pid => (effParentPos.get(pid).x) + NODE_W / 2;
      const eBotY = pid => (effParentPos.get(pid).y) + NODE_H;

      let dropX, dropY;
      if (validParents.length === 2) {
        const CROSS_THRESHOLD = 2 * (NODE_W + H_GAP);
        const dist = Math.abs(eCX(validParents[0]) - eCX(validParents[1]));
        if (dist > CROSS_THRESHOLD) {
          const childCenterX = validChildren.reduce((s, cid) => s + lcx(cid), 0) / validChildren.length;
          const dist0 = Math.abs(eCX(validParents[0]) - childCenterX);
          const dist1 = Math.abs(eCX(validParents[1]) - childCenterX);
          const closeParent = dist0 <= dist1 ? validParents[0] : validParents[1];
          const farParent   = dist0 <= dist1 ? validParents[1] : validParents[0];

          let ghostPos = null;
          if (dups) {
            for (const d of Object.values(dups)) {
              if (d.personId === farParent && d.adjacentTo === closeParent) {
                ghostPos = d; break;
              }
            }
          }

          if (ghostPos) {
            const ghostCX = ghostPos.x + NODE_W / 2;
            dropX = (eCX(closeParent) + ghostCX) / 2;
            dropY = Math.max(eBotY(closeParent), ghostPos.y + NODE_H);
          } else {
            // GEEN ghost: neem couple center (midpoint van de 2 parents).
            // Voor multi-partner heads (Agha Gol-Fatema, Agha Gol-Gulsherien)
            // staat de couple center boven de kinder-cluster.
            const cx0 = eCX(validParents[0]);
            const cx1 = eCX(validParents[1]);
            dropX = (cx0 + cx1) / 2;
            dropY = Math.max(eBotY(validParents[0]), eBotY(validParents[1]));
          }
        } else {
          const parentCXs = validParents.map(pid => eCX(pid));
          dropX = parentCXs.reduce((s, x) => s + x, 0) / parentCXs.length;
          dropY = Math.max(...validParents.map(pid => eBotY(pid)));
        }
      } else {
        dropX = eCX(validParents[0]);
        dropY = eBotY(validParents[0]);
      }

      const childTopY = Math.min(...validChildren.map(cid => ltopY(cid)));
      const midDropY  = childTopY - 15; // Horizontale balk net BOVEN de kinderkaarten

      validChildren.sort((a, b) => lcx(a) - lcx(b));

      const GAP_THRESHOLD = 2 * (NODE_W + H_GAP);
      const clusters = [[]];
      validChildren.forEach((cid, i) => {
        if (i > 0 && lcx(cid) - lcx(validChildren[i - 1]) > GAP_THRESHOLD) {
          clusters.push([]);
        }
        clusters[clusters.length - 1].push(cid);
      });

      const hasDistantClusters = clusters.length > 1;

      // Detect children at multiple Y levels (e.g. some at gen-2, others at gen-3)
      let yLevelGroups = null;
      if (validChildren.length > 1) {
        const sortedByY = [...validChildren].sort((a, b) => ltopY(a) - ltopY(b));
        const groups = [[sortedByY[0]]];
        for (let i = 1; i < sortedByY.length; i++) {
          const last = groups[groups.length - 1];
          if (ltopY(sortedByY[i]) - ltopY(last[last.length - 1]) > NODE_H) {
            groups.push([]);
          }
          groups[groups.length - 1].push(sortedByY[i]);
        }
        if (groups.length > 1) yLevelGroups = groups;
      }

      tbarData.push({ dropX, dropY, midDropY, childTopY, validParents, validChildren, clusters, hasDistantClusters, gezinKey, yLevelGroups });
    });

    // ── Fase 1.5: Verdeel overlappende T-bars over beschikbare verticale ruimte ──
    // Na compactie kunnen horizontale balken van verschillende gezinnen op dezelfde
    // Y-positie overlappen. Verdeel de midDropY waarden EVENREDIG over de beschikbare
    // verticale ruimte tussen ouder-onderkant en kind-bovenkant.
    {
      const hBars = tbarData
        .filter(d => d.validChildren.length > 1)
        .map(d => ({
          data: d,
          left: Math.min(...d.validChildren.map(cid => lcx(cid))),
          right: Math.max(...d.validChildren.map(cid => lcx(cid))),
          midY: d.midDropY,
          childTopY: d.childTopY,
          dropY: d.dropY,
          dropX: d.dropX
        }));

      const MARGIN = 8, Y_TOL = 5;
      const visited = new Set();

      // Helper: check of twee T-bars een gedeelde ouder hebben (bv. multi-partner
      // persoon zoals Store met 2 partners → 2 child-families). Als de bars NIET
      // overlappen in hun kid-X-range mogen ze op dezelfde Y; als ze WEL overlappen
      // (door extension lines of dropX in elkaars kids range) moeten ze toch
      // verticaal gescheiden worden voor visueel duidelijke gap.
      const sharesParent = (i, j) => {
        const pi = hBars[i].data.validParents || [];
        const pj = hBars[j].data.validParents || [];
        return pi.some(p => pj.includes(p));
      };
      const kidsXOverlap = (i, j) => {
        // Echte X-overlap tussen kid-clusters (niet via extension)
        return hBars[i].left <= hBars[j].right && hBars[i].right >= hBars[j].left;
      };
      const extensionsOverlap = (i, j) => {
        // Check of dropX van een bar in de kids X-range van de andere valt
        // (zou tot visueel overlapping van extension line met T-bar leiden)
        const aL = Math.min(hBars[i].left, hBars[i].dropX);
        const aR = Math.max(hBars[i].right, hBars[i].dropX);
        const bL = Math.min(hBars[j].left, hBars[j].dropX);
        const bR = Math.max(hBars[j].right, hBars[j].dropX);
        return aL <= bR + H_GAP / 2 && aR >= bL - H_GAP / 2;
      };

      for (let i = 0; i < hBars.length; i++) {
        if (visited.has(i)) continue;
        // Transitive closure: vind alle bars die overlappen in X en zelfde childTopY
        const group = [i];
        visited.add(i);
        let queue = [i];
        while (queue.length) {
          const next = [];
          for (const qi of queue) {
            for (let j = 0; j < hBars.length; j++) {
              if (visited.has(j)) continue;
              if (Math.abs(hBars[qi].childTopY - hBars[j].childTopY) > Y_TOL) continue;
              // Multi-partner met gedeelde ouder: alleen Y-distribute als
              // hun extensions/dropX in elkaars zone vallen (anders mag samen blijven)
              if (sharesParent(qi, j) && !extensionsOverlap(qi, j)) continue;
              const aL = Math.min(hBars[qi].left, hBars[qi].dropX);
              const aR = Math.max(hBars[qi].right, hBars[qi].dropX);
              const bL = Math.min(hBars[j].left, hBars[j].dropX);
              const bR = Math.max(hBars[j].right, hBars[j].dropX);
              if (aL <= bR + H_GAP / 2 && aR >= bL - H_GAP / 2) {
                group.push(j); visited.add(j); next.push(j);
              }
            }
          }
          queue = next;
        }
        if (group.length <= 1) continue;

        const childTopYGrp = Math.min(...group.map(gi => hBars[gi].childTopY));
        const maxDropY = Math.max(...group.map(gi => hBars[gi].dropY));
        const top = maxDropY + MARGIN;
        const bot = childTopYGrp - MARGIN;

        // Sorteer: breedste T-bar → dichtst bij kinderen (bot)
        group.sort((a, b) => (hBars[b].right - hBars[b].left) - (hBars[a].right - hBars[a].left));
        // Limiteer step: max 50px tussen T-bars zodat ze visueel close bij kinderen blijven
        // (anders staat een T-bar te ver van zijn eigen kinderen)
        const naturalStep = group.length > 1 ? (bot - top) / (group.length - 1) : 0;
        const step = Math.min(naturalStep, 50);
        group.forEach((gi, idx) => {
          hBars[gi].data.midDropY = Math.round(bot - idx * step);
          hBars[gi].midY = hBars[gi].data.midDropY;
        });
      }
    }

    // ── Fase 1.5: PRE-COLLECT T-bar zones voor multi-vrouwen overlap detectie ──
    if (!window._renderedTBarZones) window._renderedTBarZones = [];
    tbarData.forEach(data => {
      if (!data.validChildren?.length) return;
      const cxs = data.validChildren.map(cid => lcx(cid));
      const xMin = Math.min(...cxs);
      const xMax = Math.max(...cxs);
      const finalMin = data.hasDistantClusters ? Math.min(xMin, data.dropX) : xMin;
      const finalMax = data.hasDistantClusters ? Math.max(xMax, data.dropX) : xMax;
      window._renderedTBarZones.push({ y: data.midDropY, xMin: finalMin, xMax: finalMax, gezinKey: data.gezinKey });
    });

    // ── Fase 2: Teken de lijnen — balk altijd net boven kinderkaarten ──
    const goldenEdges = goldenPath?.edges || new Set();
    const isGoldenPair = (parentId, childId) => goldenEdges.has(childId + '|' + parentId);
    tbarData.forEach(data => {
      // V8: gezinskleur opzoeken + variabele lijn-dikte op basis van stamhoofd-diepte
      const gezinColor = gezinColorMap.get(data.gezinKey);
      const sw = getThickness(data.validParents);
      const cAttr = gezinColor ? `style="stroke:${gezinColor};stroke-width:${sw}"` : `style="stroke-width:${sw}"`;

      // [Verticaal stapelen-functie verwijderd v484 — was een aparte vertical-tak hier]

      const { dropX, dropY, midDropY, validChildren, clusters, hasDistantClusters } = data;

      // Collect family member IDs to exclude from obstruction checks
      const familyIds = new Set([...data.validParents, ...data.validChildren]);
      data.validParents.forEach(pid => {
        (getPartnersOf(pid) || []).forEach(ppid => familyIds.add(ppid));
      });

      // Multi-level children: draw separate T-bars per Y level
      // e.g. Zarlakhta has Noman at y=520 and Sejad/Adel/Amer/Adam at y=755
      if (data.yLevelGroups) {
        const { yLevelGroups } = data;
        const deepGroup = yLevelGroups[yLevelGroups.length - 1];
        const deepMidDropY = Math.min(...deepGroup.map(cid => ltopY(cid))) - 15;

        // Vertical stem from parent to deepest midDropY, routing around cards
        parts.push(drawVLineAvoiding(dropX, dropY, deepMidDropY, 'child-line', lpos, familyIds, cAttr));

        // For each Y-level group, draw horizontal bar and legs
        yLevelGroups.forEach(group => {
          const gTopY = Math.min(...group.map(cid => ltopY(cid)));
          const gMidDropY = gTopY - 15;
          group.sort((a, b) => lcx(a) - lcx(b));
          const gCXs = group.map(cid => lcx(cid));
          const barL = Math.min(...gCXs, dropX);
          const barR = Math.max(...gCXs, dropX);

          if (barR - barL > 2) {
            fgParts.push(drawHLineAvoiding(gMidDropY, barL, barR, 'child-line', lpos, familyIds, cAttr));
          }

          group.forEach(cid => {
            const cx = lcx(cid);
            const cy = ltopY(cid);
            if (cy - gMidDropY > 2) {
              parts.push(drawVLineAvoiding(cx, gMidDropY, cy, 'child-line', lpos, familyIds, cAttr));
            }
          });
        });

        // ── Gouden pad overlay voor yLevelGroups ──
        if (goldenEdges.size) {
          yLevelGroups.forEach(group => {
            const gTopY = Math.min(...group.map(cid => ltopY(cid)));
            const gMidDropY = gTopY - 15;
            const goldenGroupChildren = group.filter(cid =>
              data.validParents.some(pid => isGoldenPair(pid, cid))
            );
            goldenGroupChildren.forEach(cid => {
              const cx = lcx(cid);
              const cy = ltopY(cid);
              fgParts.push(`<line x1="${dropX}" y1="${dropY}" x2="${dropX}" y2="${gMidDropY}" style="stroke:#fbbf24;stroke-width:5"/>`);
              fgParts.push(`<line x1="${dropX}" y1="${gMidDropY}" x2="${cx}" y2="${gMidDropY}" style="stroke:#fbbf24;stroke-width:5"/>`);
              fgParts.push(`<line x1="${cx}" y1="${gMidDropY}" x2="${cx}" y2="${cy}" style="stroke:#fbbf24;stroke-width:5"/>`);
            });
          });
        }
        return;
      }

      // Detecteer of kinderen op een diepere Y-positie staan (Y-diepte separatie)
      // Als het Y-verschil groter is dan normaal, teken lijnen ALTIJD (achter kaarten door)
      const childTopY = Math.min(...validChildren.map(cid => ltopY(cid)));
      const deepChildThreshold = NODE_H + V_GAP * 1.8;
      const isDeepChild = (childTopY - dropY) > deepChildThreshold;
      const isChildDeep = cid => (ltopY(cid) - dropY) > deepChildThreshold;

      // Verticale lijn van ouder naar midDropY — routeer om kaarten heen
      parts.push(drawVLineAvoiding(dropX, dropY, midDropY, 'child-line', lpos, familyIds, cAttr));

      if (!hasDistantClusters) {
        // Alle kinderen dicht bij elkaar: één balk van linkerkind tot rechterkind
        const childCXs = validChildren.map(cid => lcx(cid));
        const barLeftX  = Math.min(...childCXs);
        const barRightX = Math.max(...childCXs);

        if (dropX < barLeftX - 2) {
          fgParts.push(drawHLineAvoiding(midDropY, dropX, barLeftX, 'child-line', lpos, familyIds, cAttr));
        } else if (dropX > barRightX + 2) {
          fgParts.push(drawHLineAvoiding(midDropY, barRightX, dropX, 'child-line', lpos, familyIds, cAttr));
        }

        if (barRightX - barLeftX > 2) {
          fgParts.push(drawHLineAvoiding(midDropY, barLeftX, barRightX, 'child-line', lpos, familyIds, cAttr));
        }

        validChildren.forEach(cid => {
          parts.push(drawVLineAvoiding(lcx(cid), midDropY, ltopY(cid), 'child-line', lpos, familyIds, cAttr));
        });
      } else {
        // Meerdere clusters: teken één doorlopende balk van dropX naar alle kinderen.
        // Elk kind MOET verbonden zijn — een losse kaart is erger dan een lange lijn.
        const allChildCXs = validChildren.map(cid => lcx(cid));
        const allLeft  = Math.min(...allChildCXs, dropX);
        const allRight = Math.max(...allChildCXs, dropX);

        // Eén horizontale balk van meest-links tot meest-rechts
        if (allRight - allLeft > 2) {
          fgParts.push(drawHLineAvoiding(midDropY, allLeft, allRight, 'child-line', lpos, familyIds, cAttr));
        }

        // Verticale lijnen naar elk kind
        validChildren.forEach(cid => {
          parts.push(drawVLineAvoiding(lcx(cid), midDropY, ltopY(cid), 'child-line', lpos, familyIds, cAttr));
        });
      }

      // ── Gouden pad overlay ──
      // Teken gouden T-bar per ouder-kind paar dat op het pad zit
      if (goldenEdges.size) {
        const goldenChildren = data.validChildren.filter(cid =>
          data.validParents.some(pid => isGoldenPair(pid, cid))
        );
        if (goldenChildren.length > 0) {
          goldenChildren.forEach(cid => {
            const cx = lcx(cid);
            const cy = ltopY(cid);
            fgParts.push(`<line x1="${data.dropX}" y1="${data.dropY}" x2="${data.dropX}" y2="${data.midDropY}" style="stroke:#fbbf24;stroke-width:5"/>`);
            fgParts.push(`<line x1="${data.dropX}" y1="${data.midDropY}" x2="${cx}" y2="${data.midDropY}" style="stroke:#fbbf24;stroke-width:5"/>`);
            fgParts.push(`<line x1="${cx}" y1="${data.midDropY}" x2="${cx}" y2="${cy}" style="stroke:#fbbf24;stroke-width:5"/>`);
          });
        }
      }
    });
  }

  // ── Lijnen tekenen ──
  if (activeTreeId === null && treePositions && Object.keys(treePositions).length) {
    // Alle-families modus met per-boom posities: teken lijnen PER stamboom-eiland
    Object.values(treePositions).forEach(treePos => drawLinesForPositions(treePos, duplicates));
  } else {
    // Enkele stamboom of unified alle-families modus: teken vanuit pos
    drawLinesForPositions(pos, duplicates);
  }

  // Duplicaat-verbindingslijnen verwijderd (blauwe stippellijnen)

  // ── Cross-family ghost partner lijnen ──
  if (duplicates) {
    const dupValues = Object.values(duplicates);

    Object.values(duplicates).forEach(dup => {
      if (!dup.adjacentTo) return;

      // Skip ghost-kinderen: die worden door Fix C hieronder afgehandeld
      const isGhostChild = state.relationships.some(r =>
        r.type === 'parent-child' && r.childId === dup.personId && r.parentId === dup.adjacentTo
      );
      if (isGhostChild) return;

      // Skip ghost als adjacentTo geen ECHTE partner is van personId
      // (bv. bio-row mover ghosts hebben adjacentTo = sibling-anchor, niet partner)
      const isPartner = state.relationships.some(r =>
        r.type === 'partner' &&
        ((r.person1Id === dup.personId && r.person2Id === dup.adjacentTo) ||
         (r.person2Id === dup.personId && r.person1Id === dup.adjacentTo))
      );
      if (!isPartner) return;

      // Zoek de DICHTSBIJZIJNDE instantie van de partner:
      // 1) Echte positie in pos
      // 2) Ghost van de partner in duplicates
      const candidates = [];
      if (pos[dup.adjacentTo]) {
        candidates.push({ x: pos[dup.adjacentTo].x, y: pos[dup.adjacentTo].y });
      }
      dupValues.forEach(d => {
        if (d.personId === dup.adjacentTo && d !== dup) {
          candidates.push({ x: d.x, y: d.y });
        }
      });
      if (!candidates.length) return;

      // Kies dichtsbijzijnde
      const ghostCX = dup.x + NODE_W / 2;
      const ghostCY = dup.y + NODE_H / 2;
      let best = candidates[0], bestDist = Infinity;
      candidates.forEach(c => {
        const dist = Math.sqrt(Math.pow(c.x + NODE_W/2 - ghostCX, 2) + Math.pow(c.y + NODE_H/2 - ghostCY, 2));
        if (dist < bestDist) { bestDist = dist; best = c; }
      });

      const targetX = best.x;
      const targetY = best.y;
      const ghostX = dup.x;
      const ghostY = dup.y;
      const sameY = Math.abs(ghostY - targetY) < 10;
      const dashStyle = 'style="stroke-dasharray:6 3"';

      if (sameY) {
        // Zelfde Y: horizontale partnerlijn
        const leftX = Math.min(targetX, ghostX);
        const rightX = Math.max(targetX, ghostX);
        const y = targetY + NODE_H / 2;
        const x1 = leftX + NODE_W;
        const x2 = rightX;
        if (x2 > x1) {
          fgParts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="partner-line" ${dashStyle}/>`);
        }
      } else {
        // Verschillende Y: L-vormige gestippelde partnerlijn
        const ghostMidY = ghostY + NODE_H / 2;
        const targetCX = targetX + NODE_W / 2;

        if (ghostY > targetY) {
          const startY = targetY + NODE_H;
          fgParts.push(`<line x1="${targetCX}" y1="${startY}" x2="${targetCX}" y2="${ghostMidY}" class="partner-line" ${dashStyle}/>`);
          const endX = ghostX < targetX ? ghostX + NODE_W : ghostX;
          fgParts.push(`<line x1="${targetCX}" y1="${ghostMidY}" x2="${endX}" y2="${ghostMidY}" class="partner-line" ${dashStyle}/>`);
        } else {
          const startY = targetY;
          fgParts.push(`<line x1="${targetCX}" y1="${startY}" x2="${targetCX}" y2="${ghostMidY}" class="partner-line" ${dashStyle}/>`);
          const endX = ghostX < targetX ? ghostX + NODE_W : ghostX;
          fgParts.push(`<line x1="${targetCX}" y1="${ghostMidY}" x2="${endX}" y2="${ghostMidY}" class="partner-line" ${dashStyle}/>`);
        }
      }
    });

    // --- Fix C: Ghost-kinderen lijnen tekenen ---
    // Groepeer ghost-kinderen en ghost-ouders uit duplicates per treeHeadId
    const dupArr = Object.values(duplicates);

    // Identificeer ghost-kinderen: entries waarvan personId als kind voorkomt in parent-child relaties
    // en adjacentTo een ouder is (= de ghost staat naast een ouder)
    const ghostChildren = dupArr.filter(dup => {
      if (!dup.adjacentTo) return false;
      // Check of adjacentTo een ouder is van personId
      return state.relationships.some(r =>
        r.type === 'parent-child' && r.childId === dup.personId && r.parentId === dup.adjacentTo
      );
    });

    // Groepeer ghost-kinderen per ouder-set + Y-bucket
    // Y-bucket (geen adjacentTo) zorgt dat ghost-siblings op dezelfde rij in
    // hetzelfde Y-blok altijd ÉÉN T-bar krijgen, zelfs als findAdjacentTo bij
    // de verschillende kids verschillende ouders koos (bijv. Beheshta→Golgotai
    // vs Bilal→Bader voor Bader+Golgotai cousin-pair in Huzurgol's block).
    const ghostChildFamilies = new Map();
    ghostChildren.forEach(gc => {
      const parentIds = state.relationships
        .filter(r => r.type === 'parent-child' && r.childId === gc.personId)
        .map(r => r.parentId)
        .sort();
      const yBucket = Math.round(gc.y / (NODE_H + V_GAP));
      const key = parentIds.join(',') + ':y' + yBucket;
      if (!ghostChildFamilies.has(key)) {
        ghostChildFamilies.set(key, { parentIds, children: [], treeHeadId: gc.treeHeadId });
      }
      ghostChildFamilies.get(key).children.push(gc);
    });

    // Teken lijnen voor elke ghost-kind familie
    ghostChildFamilies.forEach(({ parentIds, children, treeHeadId }) => {
      // Gezinskleur voor ghost-kind lijnen (solide, als gewone ouder-kind lijnen)
      // + variabele dikte op basis van diepte van de ouders vanuit stamhoofd
      const ghostGezinKey = parentIds.join(',');
      const ghostColor = gezinColorMap.get(ghostGezinKey);
      const ghostSw = getThickness(parentIds);
      const gcAttr = ghostColor
        ? `style="stroke:${ghostColor};stroke-width:${ghostSw}"`
        : `style="stroke-width:${ghostSw}"`;

      // Vind ouder-posities dichtbij de ghost-kinderen:
      // 1) Ghost-ouder in duplicates (partner-ghost naast echte ouder)
      // 2) Echte ouder in pos
      // Kies de dichtsbijzijnde instantie per ouder.
      const avgChildX = children.reduce((s, c) => s + c.x, 0) / children.length;
      const avgChildY = children.reduce((s, c) => s + c.y, 0) / children.length;
      const ghostParentPositions = [];
      parentIds.forEach(pid => {
        const candidates = [];
        // Zoek alle ghost-instanties van deze ouder in duplicates
        dupArr.forEach(d => {
          if (d.personId === pid && d.adjacentTo) {
            candidates.push({ x: d.x + NODE_W / 2, y: d.y + NODE_H });
          }
        });
        // Echte positie in pos
        if (pos[pid]) {
          candidates.push({ x: pos[pid].x + NODE_W / 2, y: pos[pid].y + NODE_H });
        }
        if (!candidates.length) return;
        // Kies dichtsbijzijnde instantie bij de kinderen
        let best = candidates[0], bestDist = Infinity;
        candidates.forEach(c => {
          const dist = Math.abs(c.x - avgChildX) + Math.abs(c.y - avgChildY);
          if (dist < bestDist) { bestDist = dist; best = c; }
        });
        if (bestDist < 5 * (NODE_W + H_GAP)) {
          ghostParentPositions.push(best);
        }
      });

      if (!ghostParentPositions.length || !children.length) return;

      const dropX = ghostParentPositions.reduce((s, p) => s + p.x, 0) / ghostParentPositions.length;
      const dropY = Math.max(...ghostParentPositions.map(p => p.y));
      const childTopY = Math.min(...children.map(c => c.y));
      const midDropY = childTopY - 15; // Horizontale balk net BOVEN de kinderkaarten

      // Sorteer kinderen op x-positie
      children.sort((a, b) => a.x - b.x);
      const childCXs = children.map(c => c.x + NODE_W / 2);

      // Verticale lijn van ouders naar midDropY
      parts.push(`<line x1="${dropX}" y1="${dropY}" x2="${dropX}" y2="${midDropY}" class="child-line" ${gcAttr}/>`);

      if (children.length === 1) {
        const cx = childCXs[0];
        fgParts.push(`<line x1="${dropX}" y1="${midDropY}" x2="${cx}" y2="${midDropY}" class="child-line" ${gcAttr}/>`);
        parts.push(`<line x1="${cx}" y1="${midDropY}" x2="${cx}" y2="${children[0].y}" class="child-line" ${gcAttr}/>`);
      } else {
        const leftX = childCXs[0];
        const rightX = childCXs[childCXs.length - 1];
        // Horizontale balk
        fgParts.push(`<line x1="${leftX}" y1="${midDropY}" x2="${rightX}" y2="${midDropY}" class="child-line" ${gcAttr}/>`);
        // Verticale lijnen naar elk ghost-kind
        children.forEach((c, i) => {
          parts.push(`<line x1="${childCXs[i]}" y1="${midDropY}" x2="${childCXs[i]}" y2="${c.y}" class="child-line" ${gcAttr}/>`);
        });
      }

      // ── Gouden pad overlay voor ghost-kinderen ──
      const goldenEdges2 = goldenPath?.edges || new Set();
      if (goldenEdges2.size) {
        children.forEach((c, i) => {
          const hasGoldenEdge = parentIds.some(pid => goldenEdges2.has(c.personId + '|' + pid));
          if (hasGoldenEdge) {
            const cx = childCXs[i];
            fgParts.push(`<line x1="${dropX}" y1="${dropY}" x2="${dropX}" y2="${midDropY}" style="stroke:#fbbf24;stroke-width:5"/>`);
            fgParts.push(`<line x1="${dropX}" y1="${midDropY}" x2="${cx}" y2="${midDropY}" style="stroke:#fbbf24;stroke-width:5"/>`);
            fgParts.push(`<line x1="${cx}" y1="${midDropY}" x2="${cx}" y2="${c.y}" style="stroke:#fbbf24;stroke-width:5"/>`);
          }
        });
      }
    });
  }

  // Size the SVG
  const allPos = Object.values(pos);
  // Inclusief duplicaat-posities voor SVG sizing
  if (duplicates) {
    Object.values(duplicates).forEach(d => allPos.push(d));
  }
  if (allPos.length) {
    const maxX = Math.max(...allPos.map(p => p.x + NODE_W)) + PADDING;
    const maxY = Math.max(...allPos.map(p => p.y + NODE_H)) + PADDING + 60;
    svg.style.width  = maxX + 'px';
    svg.style.height = maxY + 'px';
    svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
  }

  // Split geconcateneerde <line> elementen (van drawVLineAvoiding) in individuele entries
  {
    const expanded = [];
    parts.forEach(entry => {
      const matches = entry.match(/<line [^>]+>/g);
      if (matches && matches.length > 1) expanded.push(...matches);
      else if (entry.trim()) expanded.push(entry);
    });
    parts.length = 0;
    expanded.forEach(p => parts.push(p));
  }

  // Recolor: waar een vreemde verticale lijn een T-bar kruist, krijgt dat segment de T-bar kleur
  {
    const tbarZones = [];
    fgParts.forEach(s => {
      const m = s.match(/x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)".*?stroke:([^;"]+)/);
      if (!m) return;
      const x1 = parseFloat(m[1]), y1 = parseFloat(m[2]), x2 = parseFloat(m[3]), y2 = parseFloat(m[4]), stroke = m[5];
      if (Math.abs(y1 - y2) < 1 && Math.abs(x2 - x1) > NODE_W) {
        tbarZones.push({ xMin: Math.min(x1, x2), xMax: Math.max(x1, x2), y: y1, stroke });
      }
    });
    const MARGIN = 12;
    const newParts = [];
    parts.forEach(line => {
      const m = line.match(/x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)".*?stroke:([^;"]+)/);
      if (!m) { newParts.push(line); return; }
      const x1 = parseFloat(m[1]), y1 = parseFloat(m[2]), x2 = parseFloat(m[3]), y2 = parseFloat(m[4]), stroke = m[5];
      if (Math.abs(x1 - x2) > 1) { newParts.push(line); return; }
      const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
      const crossingZones = tbarZones.filter(z =>
        z.stroke !== stroke &&
        x1 >= z.xMin - 2 && x1 <= z.xMax + 2 &&
        minY < z.y && maxY > z.y
      );
      if (crossingZones.length === 0) { newParts.push(line); return; }
      const sw = line.match(/stroke-width:([^;"]+)/)?.[1] || '2';
      let curY = minY;
      crossingZones.sort((a, b) => a.y - b.y);
      crossingZones.forEach(z => {
        const zTop = z.y - MARGIN, zBot = z.y + MARGIN;
        if (curY < zTop)
          newParts.push(`<line x1="${x1}" y1="${curY}" x2="${x1}" y2="${zTop}" style="stroke:${stroke};stroke-width:${sw}"/>`);
        fgParts.push(`<line x1="${x1}" y1="${Math.max(curY, zTop)}" x2="${x1}" y2="${zBot}" style="stroke:${z.stroke};stroke-width:3"/>`);
        curY = zBot;
      });
      if (curY < maxY)
        newParts.push(`<line x1="${x1}" y1="${curY}" x2="${x1}" y2="${maxY}" style="stroke:${stroke};stroke-width:${sw}"/>`);
    });
    parts.length = 0;
    newParts.forEach(p => parts.push(p));
  }

  svg.innerHTML = (bgParts.length ? '<g opacity="0.3">' + bgParts.join('\n') + '</g>\n' : '') + parts.join('\n') + '\n' + fgParts.join('\n');
}

// ============================================================
// CARD RENDERING
// ============================================================
function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function extractYear(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts[0].length === 4) return parts[0];
  if (parts[parts.length - 1].length === 4) return parts[parts.length - 1];
  return parts[0];
}

// Parse geboortedatum naar { day, month, year } — ondersteunt YYYY, DD-MM-YYYY, YYYY-MM-DD
function parseBirthdate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length === 1) return { year: +parts[0], month: null, day: null };
  if (parts[0].length === 4) return { year: +parts[0], month: +parts[1] || null, day: +parts[2] || null };
  if (parts[2] && parts[2].length === 4) return { year: +parts[2], month: +parts[1] || null, day: +parts[0] || null };
  return { year: +parts[0], month: null, day: null };
}

function formatBirthdate(dateStr) {
  const d = parseBirthdate(dateStr);
  if (!d) return '';
  const maanden = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  if (d.day && d.month) return `${d.day} ${maanden[d.month - 1]} ${d.year}`;
  if (d.month) return `${maanden[d.month - 1]} ${d.year}`;
  return `${d.year}`;
}

function lifespan(person) {
  if (!person.birthdate && !person.deathdate) return '';
  const birth = person.birthdate ? extractYear(person.birthdate) : '?';
  if (person.deathdate) return `${birth} – ${extractYear(person.deathdate)}`;
  if (person.deceased)  return `${birth} – overleden`;
  return birth || '';
}

// Geeft dagen tot volgende verjaardag (0 = vandaag, negatief = al geweest dit jaar)
function daysUntilBirthday(dateStr) {
  const d = parseBirthdate(dateStr);
  if (!d || !d.month || !d.day) return null;
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next    = new Date(today.getFullYear(), d.month - 1, d.day);
  if (next < today) next = new Date(today.getFullYear() + 1, d.month - 1, d.day);
  return Math.round((next - today) / 86400000);
}

function ageOnNextBirthday(dateStr) {
  const d = parseBirthdate(dateStr);
  if (!d || !d.year) return null;
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let nextYear = today.getFullYear();
  if (d.month && d.day) {
    const next = new Date(today.getFullYear(), d.month - 1, d.day);
    if (next < today) nextYear = today.getFullYear() + 1;
  }
  return nextYear - d.year;
}

function renderCards(pos, treeRanges, ghosts) {
  const container = document.getElementById('cards-container');
  container.innerHTML = '';

  // Size canvas
  if (Object.keys(pos).length) {
    const maxX = Math.max(...Object.values(pos).map(p => p.x + NODE_W)) + PADDING;
    const maxY = Math.max(...Object.values(pos).map(p => p.y + NODE_H)) + PADDING;
    const canvas = document.getElementById('canvas');
    canvas.style.width  = maxX + 'px';
    canvas.style.height = maxY + 'px';
  }

  state.persons.forEach(person => {
    const p = pos[person.id];
    if (!p) return;

    const gClass   = person.gender === 'm' ? 'male' : person.gender === 'f' ? 'female' : 'unknown';
    const isUser   = person.id === USER_ID;
    const cardClass = `card ${gClass}${isUser ? ' user' : ''}`;
    const span = lifespan(person);

    const div = document.createElement('div');
    div.className = cardClass;
    if (goldenPath?.pathIds.has(person.id)) div.classList.add('golden-card');
    div.dataset.id = person.id;
    div.style.left = p.x + 'px';
    div.style.top  = p.y + 'px';
    const avatarHtml = person.photo
      ? `<div class="card-avatar" style="background:none;padding:0;overflow:hidden"><img src="${escHtml(person.photo)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`
      : `<div class="card-avatar">${initials(person.name)}</div>`;
    div.innerHTML = `
      <div class="card-top">
        ${avatarHtml}
        <div class="card-info">
          <div class="card-name">${escHtml(person.name)}</div>
          ${person.birthdate ? `<div class="card-years">${escHtml(formatBirthdate(person.birthdate))}${person.deathdate ? ` – ${escHtml(formatBirthdate(person.deathdate))}` : person.deceased ? ' – overleden' : ''}</div>` : ''}
          ${person.family ? `<div class="card-years">${escHtml(person.family)}</div>` : ''}
        </div>
      </div>
      ${READ_ONLY ? '' : `<div class="card-actions">
        <button class="btn-card-edit"   title="Bewerken">✏</button>
        <button class="btn-card-delete" title="Verwijderen">✕</button>
      </div>`}`;

    if (!READ_ONLY) {
      div.querySelector('.btn-card-edit').addEventListener('click', e => {
        e.stopPropagation(); openEditModal(person.id);
      });
      div.querySelector('.btn-card-delete').addEventListener('click', e => {
        e.stopPropagation(); confirmDeletePerson(person.id);
      });
    }
    let dblClickTimer = null;
    div.addEventListener('click', (e) => {
      if (dblClickTimer) return;
      dblClickTimer = setTimeout(() => {
        dblClickTimer = null;
        openDetailModal(person.id);
      }, 250);
    });
    div.addEventListener('dblclick', (e) => {
      if (dblClickTimer) { clearTimeout(dblClickTimer); dblClickTimer = null; }
      goldenPath = buildPathUp(person.id, lastPositions, lastDuplicates, null);
      render();
    });

    // Cousin-referentie badge: toon op non-anchor ouders wiens kinderen elders staan
    const ccr = window._cousinChildReferences || {};
    if (ccr[person.id]) {
      const ref = ccr[person.id];
      const childCount = ref.childIds.length;
      const badge = document.createElement('div');
      badge.className = 'cousin-ref-badge';
      badge.title = `${childCount} kind${childCount > 1 ? 'eren' : ''} bij andere tak`;
      badge.textContent = `${childCount}`;
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        // Pan naar anchor ouder
        const anchorCard = container.querySelector(`.card[data-id="${ref.anchorParentId}"]`);
        if (anchorCard) {
          anchorCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          anchorCard.classList.add('highlight-flash');
          setTimeout(() => anchorCard.classList.remove('highlight-flash'), 2000);
        }
      });
      div.appendChild(badge);
    }

    container.appendChild(div);
  });

  // ── Duplicaat-kaarten: personen die in meerdere stambomen voorkomen ───────
  if (ghosts && Object.keys(ghosts).length) {
    Object.entries(ghosts).forEach(([key, g]) => {
      const person = getPerson(g.personId);
      if (!person) return;
      // Valideer coördinaten — voorkom lege dozen bij ongeldige posities
      if (typeof g.x !== 'number' || typeof g.y !== 'number' || isNaN(g.x) || isNaN(g.y)) return;
      const gClass = person.gender === 'm' ? 'male' : person.gender === 'f' ? 'female' : 'unknown';
      const dupDiv = document.createElement('div');
      dupDiv.className = `card ${gClass} duplicate-card`;
      if (goldenPath?.ghostNodes.has(key)) dupDiv.classList.add('golden-card');
      dupDiv.dataset.id = person.id;
      dupDiv.style.left = g.x + 'px';
      dupDiv.style.top  = g.y + 'px';
      const avatarHtml = person.photo
        ? `<div class="card-avatar" style="background:none;padding:0;overflow:hidden"><img src="${escHtml(person.photo)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`
        : `<div class="card-avatar">${initials(person.name)}</div>`;
      dupDiv.innerHTML = `
        ${READ_ONLY ? '' : '<div class="duplicate-badge" title="Komt ook voor in andere stamboom">🔗</div>'}
        <div class="card-top">
          ${avatarHtml}
          <div class="card-info">
            <div class="card-name">${escHtml(person.name)}</div>
            ${person.birthdate ? `<div class="card-years">${escHtml(formatBirthdate(person.birthdate))}${person.deathdate ? ` – ${escHtml(formatBirthdate(person.deathdate))}` : person.deceased ? ' – overleden' : ''}</div>` : ''}
            ${person.family ? `<div class="card-years">${escHtml(person.family)}</div>` : ''}
          </div>
        </div>`;
      let ghostDblClickTimer = null;
      dupDiv.addEventListener('click', (e) => {
        if (ghostDblClickTimer) return;
        ghostDblClickTimer = setTimeout(() => {
          ghostDblClickTimer = null;
          openDetailModal(person.id);
        }, 250);
      });
      dupDiv.addEventListener('dblclick', (e) => {
        if (ghostDblClickTimer) { clearTimeout(ghostDblClickTimer); ghostDblClickTimer = null; }
        goldenPath = buildPathUp(g.personId, lastPositions, lastDuplicates, key);
        render();
      });
      container.appendChild(dupDiv);
    });
  }
}

// ============================================================
// SIDEBAR RENDERING
// ============================================================
function renderSidebar(filter = '') {
  const list      = document.getElementById('person-list');
  const treeList  = document.getElementById('tree-list');
  const stats     = document.getElementById('stats');
  const q         = filter.toLowerCase();

  // --- Stambomen ---
  // Toon ALLE stambomen (root + sub) in de sidebar zodat je per gezinshoofd kunt navigeren.
  // De root-filter zit alleen op het canvas (computeAllFamiliesLayout), niet hier.
  const allStambomenSidebar = computeStambomen();
  const filteredTrees = allStambomenSidebar.filter(s =>
    !q || s.label.toLowerCase().includes(q)
  );

  treeList.innerHTML = [
    // "Alle families" entry
    `<div class="tree-item${activeTreeId === null ? ' active' : ''}" data-head="all">
      <div class="tree-icon">🌍</div>
      <div class="tree-info">
        <div class="tree-name">Alle families</div>
        <div class="tree-count">${state.persons.length} personen</div>
      </div>
    </div>`,
    ...filteredTrees.map(s => `
      <div class="tree-item${activeTreeId === s.headId ? ' active' : ''}" data-head="${s.headId}">
        <div class="tree-icon">${s.isRoot ? '🌳' : '🌿'}</div>
        <div class="tree-info">
          <div class="tree-name">${escHtml(s.label)}</div>
          <div class="tree-count">${s.count} personen</div>
        </div>
      </div>`)
  ].join('');

  treeList.querySelectorAll('.tree-item').forEach(el => {
    el.addEventListener('click', () => {
      const head = el.dataset.head;
      if (head === 'all') {
        activeTreeId = null;
        if (smartViewMode) smartViewOrigin = false;
      } else {
        activeTreeId = head;
        if (smartViewMode) {
          smartViewMode = false;
          smartViewOrigin = true;
          try { sessionStorage.setItem(SMART_KEY, 'false'); } catch(e) {}
        }
      }
      // Onthoud laatst geselecteerde tree (overleeft page reload)
      try { sessionStorage.setItem(ACTIVE_TREE_KEY, activeTreeId || 'null'); } catch(e) {}
      render();
      setTimeout(() => {
        zoomFit();
        scrollToStamhoofd(head);
      }, 150);
    });
  });

  // --- Verjaardagen ---
  const bdList = document.getElementById('birthday-list');
  if (bdList) {
    const allBirthdays = state.persons
      .filter(p => p.birthdate && !p.deceased && !p.deathdate)
      .map(p => ({ p, days: daysUntilBirthday(p.birthdate), age: ageOnNextBirthday(p.birthdate) }))
      .filter(x => x.days !== null)
      .sort((a, b) => a.days - b.days);

    if (!allBirthdays.length) {
      bdList.innerHTML = `<div class="bd-empty">Geen verjaardagen bekend</div>`;
    } else {
      bdList.innerHTML = allBirthdays.map(({ p, days, age }) => {
        const gClass = p.gender === 'm' ? 'male' : p.gender === 'f' ? 'female' : 'unknown';
        const uClass = p.id === USER_ID ? 'user' : gClass;
        const label  = days === 0 ? 'Vandaag!' : days === 1 ? 'Morgen' : `Over ${days} dagen`;
        const soon   = days <= 7 ? ' bd-soon' : '';
        return `<div class="bd-item${soon}" data-id="${p.id}">
          <div class="avatar-sm ${uClass}">${initials(p.name)}</div>
          <div class="bd-info">
            <div class="bd-name">${escHtml(p.name)}</div>
            <div class="bd-meta">${label} · ${age === 0 ? 'pasgeboren' : 'wordt ' + age}</div>
          </div>
        </div>`;
      }).join('');
      bdList.querySelectorAll('.bd-item').forEach(el => {
        el.addEventListener('click', () => scrollToCard(el.dataset.id));
      });
    }
  }

  // --- Personen (gefilterd op actieve stamboom + zoekterm) ---
  const activeIds = getActivePersonIds();
  const filtered  = state.persons.filter(p =>
    activeIds.has(p.id) &&
    (!q || p.name.toLowerCase().includes(q) || (p.family || '').toLowerCase().includes(q))
  );

  stats.textContent = `${filtered.length}/${state.persons.length}`;

  list.innerHTML = filtered.map(p => {
    const gClass = p.gender === 'm' ? 'male' : p.gender === 'f' ? 'female' : 'unknown';
    const uClass = p.id === USER_ID ? 'user' : gClass;
    const yr     = p.birthdate ? (parseBirthdate(p.birthdate)?.year || '') : '';
    return `<div class="person-item" data-id="${p.id}">
      <div class="avatar-sm ${uClass}">${initials(p.name)}</div>
      <div class="item-text" style="flex: 1; cursor: pointer;" data-action="open-path-menu">
        <div class="item-name">${escHtml(p.name)}</div>
        ${yr ? `<div class="item-year">${yr}</div>` : ''}
      </div>
      ${READ_ONLY ? '' : `<button class="item-edit-btn" data-action="open-edit" title="Bewerken" style="background:transparent;border:none;color:var(--text-muted);font-size:14px;cursor:pointer;padding:4px 8px;border-radius:4px;">✏</button>`}
    </div>`;
  }).join('');

  list.querySelectorAll('.person-item').forEach(el => {
    el.addEventListener('click', e => {
      const target = e.target.closest('[data-action]');
      if (target?.dataset.action === 'open-edit') {
        e.stopPropagation();
        openEditModal(el.dataset.id);
        return;
      }
      if (target?.dataset.action === 'open-path-menu') {
        e.stopPropagation();
        showPathDropdown(el.dataset.id, target);
        return;
      }
      // Fallback: scroll naar kaart
      scrollToCard(el.dataset.id);
    });
  });
}

// ============================================================
// GOUDEN PAD DROPDOWN + ACTIVATE
// ============================================================
function closeOpenDropdowns() {
  document.querySelectorAll('.path-dropdown').forEach(el => el.remove());
}

function showPathDropdown(personId, anchorEl) {
  closeOpenDropdowns();
  const father = getBioFather(personId);
  const mother = getBioMother(personId);
  const socials = getSocialParentsOf(personId).map(getPerson).filter(Boolean);
  const items = [];
  if (father) items.push({ side: 'father', label: 'Vaders kant' });
  if (mother) items.push({ side: 'mother', label: 'Moeders kant' });
  if (!father && !mother && socials.length) {
    socials.forEach(s => items.push({ side: 'social', label: 'Sociale ouder: ' + s.name }));
  }
  if (!items.length) {
    // Fallback: geen ouders = scroll naar kaart
    scrollToCard(personId);
    return;
  }

  const dd = document.createElement('div');
  dd.className = 'path-dropdown';
  const rect = anchorEl.getBoundingClientRect();
  dd.style.cssText = `position:fixed;z-index:9999;left:${rect.right + 8}px;top:${rect.top}px;background:#1e3a5f;border:1px solid #60a5fa;border-radius:6px;padding:4px;box-shadow:0 8px 24px rgba(0,0,0,0.5);min-width:160px;`;
  items.forEach(it => {
    const btn = document.createElement('div');
    btn.className = 'path-dropdown-item';
    btn.style.cssText = 'padding:8px 12px;cursor:pointer;border-radius:4px;color:#e5e7eb;font-size:13px;';
    btn.textContent = it.label;
    btn.onmouseover = () => btn.style.background = '#2563eb';
    btn.onmouseout = () => btn.style.background = '';
    btn.onclick = () => { activatePath(personId, it.side); closeOpenDropdowns(); };
    dd.appendChild(btn);
  });
  document.body.appendChild(dd);
  setTimeout(() => {
    const closeOnClickElsewhere = (e) => {
      if (!dd.contains(e.target)) {
        closeOpenDropdowns();
        document.removeEventListener('click', closeOnClickElsewhere);
      }
    };
    document.addEventListener('click', closeOnClickElsewhere);
  }, 0);
}

function activatePath(personId, side) {
  const root = findAncestorRoot(personId, side);
  const headId = findHeadForRoot(root);
  activeTreeId = headId;
  if (smartViewMode) {
    smartViewMode = false;
    smartViewOrigin = true;
    try { sessionStorage.setItem(SMART_KEY, 'false'); } catch(e) {}
  }
  render();
  setTimeout(() => {
    goldenPath = buildPathUp(personId, lastPositions, lastDuplicates, null);
    render(); // Re-render met gouden pad
    setTimeout(() => {
      const targetCard = document.querySelector(`div.card[data-id="${personId}"]:not(.duplicate-card)`);
      if (targetCard) targetCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, 200);
  }, 100);
}

function scrollToCard(id) {
  const card = document.querySelector(`.card[data-id="${id}"]`);
  if (!card) return;
  const wrapper = document.getElementById('canvas-wrapper');
  const x = parseInt(card.style.left) * zoom;
  const y = parseInt(card.style.top)  * zoom;
  wrapper.scrollTo({
    left: x - wrapper.clientWidth  / 2 + (NODE_W * zoom) / 2,
    top:  y - wrapper.clientHeight / 2 + (NODE_H * zoom) / 2,
    behavior: 'smooth'
  });
}

// ============================================================
// TREE GROUP LABELS
// ============================================================
function renderTreeLabels(pos, treeRanges) {
  const canvas = document.getElementById('canvas');
  canvas.querySelectorAll('.tree-group-label').forEach(el => el.remove());
  if (!treeRanges) return;

  Object.entries(treeRanges).forEach(([headId, r]) => {
    const label = document.createElement('div');
    label.className = 'tree-group-label';
    // Centreer boven de boom
    const centerX = (r.minX + r.maxX) / 2;
    label.style.left      = centerX + 'px';
    label.style.top       = r.minY + 'px';
    label.style.transform = 'translateX(-50%)';
    label.textContent     = '🌳 Familie ' + escHtml(r.label);
    canvas.appendChild(label);
  });
}

// ============================================================
// ALL-FAMILIES LAYOUT
// ============================================================
function computeAllFamiliesLayout() {
  const allStambomen = computeStambomen();
  if (!allStambomen.length) return { positions: {}, duplicates: {}, treePositions: {}, treeRanges: {} };

  // Filter: toon alleen hoofdstambomen (hoofd mag geen ouders hebben)
  let candidates = allStambomen.filter(s => getParentsOf(s.headId).length === 0);

  // Bereken personen-sets per boom
  const candidateSets = {};
  candidates.forEach(s => {
    candidateSets[s.headId] = new Set(getStamboomPersons(s.headId));
  });

  // Sorteer op grootte en filter redundante bomen
  candidates.sort((a, b) => candidateSets[b.headId].size - candidateSets[a.headId].size);
  const selectedHeads = [];
  candidates.forEach(s => {
    const mySize = candidateSets[s.headId].size;
    const partners = getPartnersOf(s.headId);
    const absorbedByLargerTree = selectedHeads.some(headId => {
      const largerSet = candidateSets[headId];
      if (largerSet.size <= mySize * 2) return false;
      if (largerSet.has(s.headId)) return true;
      if (partners.some(pid => largerSet.has(pid))) return true;
      return false;
    });
    if (!absorbedByLargerTree) selectedHeads.push(s.headId);
  });

  let stambomen = candidates.filter(s => selectedHeads.includes(s.headId));
  if (!stambomen.length) return { positions: {}, duplicates: {}, treePositions: {}, treeRanges: {} };

  // ── SHELF-PACKING: elke boom apart layouten, dan 2D grid ──
  const LABEL_H = 56;
  const TREE_GAP = 80;
  const treeLayouts = [];

  stambomen.forEach(s => {
    const treePersons = candidateSets[s.headId];
    if (treePersons.size < 1) return;

    // Partners van boomleden toevoegen
    const fullSet = new Set(treePersons);
    treePersons.forEach(id => {
      getPartnersOf(id).forEach(pid => fullSet.add(pid));
    });

    const layoutResult = computeLayout(fullSet, s.headId);
    const treePos = layoutResult.pos || {};
    const treeCFG = layoutResult.crossFamilyGhosts || {};
    const treeCCR = layoutResult.cousinChildReferences || {};
    const ids = Object.keys(treePos);
    if (!ids.length) return;

    // Bounding box inclusief ghost-posities
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    ids.forEach(id => {
      minX = Math.min(minX, treePos[id].x);
      maxX = Math.max(maxX, treePos[id].x + NODE_W);
      minY = Math.min(minY, treePos[id].y);
      maxY = Math.max(maxY, treePos[id].y + NODE_H);
    });
    Object.values(treeCFG).forEach(g => {
      minX = Math.min(minX, g.x);
      maxX = Math.max(maxX, g.x + NODE_W);
      minY = Math.min(minY, g.y);
      maxY = Math.max(maxY, g.y + NODE_H);
    });

    const head = getPerson(s.headId);
    const familyName = head?.family || head?.name?.split(' ').slice(-1)[0] || s.label;

    treeLayouts.push({
      headId: s.headId,
      pos: treePos,
      cfg: treeCFG,
      ccr: treeCCR,
      bbox: { w: maxX - minX, h: maxY - minY + LABEL_H, offsetX: minX, offsetY: minY },
      label: familyName,
      count: ids.length
    });
  });

  if (!treeLayouts.length) return { positions: {}, duplicates: {}, treePositions: {}, treeRanges: {} };

  // ── Shelf-packing: sorteer op hoogte, pak in rijen ──
  treeLayouts.sort((a, b) => b.bbox.h - a.bbox.h);
  const targetWidth = Math.max(window.innerWidth - 260, 3000);

  const shelves = [];
  treeLayouts.forEach(tree => {
    const th = tree.bbox.h + TREE_GAP;

    let placed = false;
    for (const shelf of shelves) {
      const shelfRight = shelf.items.length > 0
        ? shelf.items[shelf.items.length - 1].x + shelf.items[shelf.items.length - 1].tree.bbox.w + TREE_GAP
        : PADDING;
      if (shelfRight + tree.bbox.w <= targetWidth) {
        shelf.items.push({ tree, x: shelfRight });
        shelf.h = Math.max(shelf.h, th);
        placed = true;
        break;
      }
    }

    if (!placed) {
      const shelfY = shelves.length > 0
        ? shelves[shelves.length - 1].y + shelves[shelves.length - 1].h
        : PADDING;
      shelves.push({ y: shelfY, h: th, items: [{ tree, x: PADDING }] });
    }
  });

  // ── Finale posities opbouwen per boom ──
  const pos = {};
  const duplicates = {};
  const treePositions = {};
  const treeRanges = {};

  shelves.forEach(shelf => {
    shelf.items.forEach(({ tree, x }) => {
      const dx = x - tree.bbox.offsetX;
      const dy = shelf.y + LABEL_H - tree.bbox.offsetY;

      // Per-boom positie-map voor renderLines
      const treePosMap = {};

      Object.entries(tree.pos).forEach(([id, p]) => {
        const shifted = { x: p.x + dx, y: p.y + dy };
        pos[id] = shifted;
        treePosMap[id] = shifted;
      });

      // Ghost/cross-family posities per boom
      Object.entries(tree.cfg).forEach(([key, g]) => {
        const shifted = { ...g, x: g.x + dx, y: g.y + dy };
        duplicates[key] = shifted;
      });

      // Cousin child references per boom
      if (tree.ccr) {
        Object.entries(tree.ccr).forEach(([parentId, ref]) => {
          if (!window._cousinChildReferences) window._cousinChildReferences = {};
          window._cousinChildReferences[parentId] = ref;
        });
      }

      treePositions[tree.headId] = treePosMap;

      const ids = Object.keys(tree.pos);
      const xs = ids.map(id => pos[id].x);
      const ys = ids.map(id => pos[id].y);

      treeRanges[tree.headId] = {
        minX: Math.min(...xs) - PADDING / 3,
        maxX: Math.max(...xs) + NODE_W + PADDING / 3,
        minY: Math.min(...ys) - LABEL_H,
        maxY: Math.max(...ys) + NODE_H,
        label: tree.label,
        count: tree.count
      };
    });
  });

  return { positions: pos, duplicates, treePositions, treeRanges };
}

// ============================================================
// FULL RENDER
// ============================================================
// ============================================================
// COLLAPSE TOGGLES
// ============================================================
function renderCollapseToggles(pos, dups) {
  const container = document.getElementById('cards-container');
  container.querySelectorAll('.gezin-toggle').forEach(el => el.remove());

  // Verzamel alle gezinnen: groepeer kinderen per ouderpaar
  // Belangrijk: toon knoppen voor ALLE gezinnen met zichtbare ouders,
  // ongeacht of kinderen momenteel zichtbaar zijn (ze kunnen verborgen zijn
  // door collapse van een ander gezin, of cross-family).
  const gezinMap = {}; // key → { parentIds, childIds }
  state.relationships.forEach(r => {
    if (r.type !== 'parent-child') return;
    if (!pos[r.parentId]) return; // ouder niet in layout
    // Gebruik alleen ouders die in pos staan
    const visibleParents = getParentsOf(r.childId).filter(pid => pos[pid]).sort();
    if (visibleParents.length === 0) return;
    const key = visibleParents.join(',');
    if (!gezinMap[key]) gezinMap[key] = { parentIds: visibleParents, childIds: new Set() };
    gezinMap[key].childIds.add(r.childId);
  });

  // Filter kinderen eruit waarvan niet ALLE ouders in de key daadwerkelijk een parent-child relatie hebben
  Object.entries(gezinMap).forEach(([key, gezin]) => {
    const parentIdsInKey = key.split(',');
    gezin.childIds.forEach(cid => {
      const actualParents = getParentsOf(cid);
      const allMatch = parentIdsInKey.every(pid => actualParents.includes(pid));
      if (!allMatch) gezin.childIds.delete(cid);
    });
  });

  Object.entries(gezinMap).forEach(([key, gezin]) => {
    if (gezin.childIds.size === 0) return;
    const isCollapsed = collapsedGezinnen.has(key);

    // Bereken aantal verborgen personen als ingeklapt
    let hiddenCount = 0;
    if (isCollapsed) {
      const tempActive = new Set(state.persons.map(p => p.id));
      const tempCollapsed = new Set([key]);
      const oldSet = collapsedGezinnen;
      collapsedGezinnen = tempCollapsed;
      hiddenCount = getHiddenByCollapse(tempActive).size;
      collapsedGezinnen = oldSet;
    }

    // Check of kinderen zichtbaar zijn in layout
    const hasVisibleChildren = [...gezin.childIds].some(cid => pos[cid]);
    // Skip toggle als kinderen niet zichtbaar zijn in deze boom (bv. Store-Didar
    // gezin in Zavar-only boom: kids Mujda/Osman zijn niet in tree)
    if (!hasVisibleChildren && !isCollapsed) return;

    // Positie: midden-onder het ouderpaar
    // Cross-family aware: als ouders ver uit elkaar staan, gebruik ghost-positie
    const parentPositions = gezin.parentIds.map(pid => pos[pid]).filter(Boolean);
    if (!parentPositions.length) return;
    let midX, bottomY;
    if (parentPositions.length === 2) {
      const CROSS_THRESHOLD = 2 * (NODE_W + H_GAP);
      const dist = Math.abs(
        (parentPositions[0].x + NODE_W / 2) - (parentPositions[1].x + NODE_W / 2)
      );
      if (dist > CROSS_THRESHOLD && dups) {
        // Vind welke ouder dichterbij de kinderen staat
        const childXs = [...gezin.childIds].filter(cid => pos[cid]).map(cid => pos[cid].x + NODE_W / 2);
        if (childXs.length > 0) {
          const childAvgX = childXs.reduce((s, x) => s + x, 0) / childXs.length;
          const d0 = Math.abs(parentPositions[0].x + NODE_W / 2 - childAvgX);
          const d1 = Math.abs(parentPositions[1].x + NODE_W / 2 - childAvgX);
          const closeIdx = d0 <= d1 ? 0 : 1;
          const farIdx = 1 - closeIdx;
          const closeParentId = gezin.parentIds[closeIdx];
          const farParentId = gezin.parentIds[farIdx];
          // Zoek ghost voor de verre ouder
          let ghostPos = null;
          for (const d of Object.values(dups)) {
            if (d.personId === farParentId && d.adjacentTo === closeParentId) {
              ghostPos = d; break;
            }
          }
          if (ghostPos) {
            const ghostCX = ghostPos.x + NODE_W / 2;
            const closeCX = parentPositions[closeIdx].x + NODE_W / 2;
            midX = (closeCX + ghostCX) / 2;
            bottomY = Math.max(parentPositions[closeIdx].y + NODE_H, ghostPos.y + NODE_H);
          } else {
            // Geen ghost gevonden: gebruik alleen de dichtsbijzijnde ouder
            midX = parentPositions[closeIdx].x + NODE_W / 2;
            bottomY = parentPositions[closeIdx].y + NODE_H;
          }
        } else {
          midX = parentPositions.reduce((sum, p) => sum + p.x + NODE_W / 2, 0) / parentPositions.length;
          bottomY = Math.max(...parentPositions.map(p => p.y + NODE_H));
        }
      } else {
        midX = parentPositions.reduce((sum, p) => sum + p.x + NODE_W / 2, 0) / parentPositions.length;
        bottomY = Math.max(...parentPositions.map(p => p.y + NODE_H));
      }
    } else {
      midX = parentPositions.reduce((sum, p) => sum + p.x + NODE_W / 2, 0) / parentPositions.length;
      bottomY = Math.max(...parentPositions.map(p => p.y + NODE_H));
    }

    const btn = document.createElement('div');
    btn.className = 'gezin-toggle' + (isCollapsed ? ' collapsed' : '');
    btn.style.left = (midX - 14) + 'px';
    btn.style.top  = (bottomY + 6) + 'px';

    if (isCollapsed) {
      btn.innerHTML = `<span class="toggle-icon">▶</span><span class="toggle-count">+${hiddenCount}</span>`;
      btn.title = `${hiddenCount} personen verborgen — klik om uit te klappen`;
      btn.style.left = (midX - 24) + 'px'; // breder element, iets meer naar links
    } else {
      btn.innerHTML = `<span class="toggle-icon">▼</span>`;
      btn.title = 'Klik om gezin in te klappen';
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleGezin(key);
    });

    container.appendChild(btn);

    // [Verticaal-toggle knop verwijderd v484]

    // Cousin-pair bio-row ghost toggle: als beide ouders een :cg:bioRow ghost hebben
    // (Fazelahmad neef-nicht), plaats óók toggles bij de ghost-couple in de bio-rij.
    if (parentPositions.length === 2 && dups) {
      const p0Ghost = dups[gezin.parentIds[0] + ':cg:bioRow'];
      const p1Ghost = dups[gezin.parentIds[1] + ':cg:bioRow'];
      if (p0Ghost && p1Ghost) {
        const gMidX = (p0Ghost.x + p1Ghost.x + NODE_W) / 2;
        const gBottomY = Math.max(p0Ghost.y, p1Ghost.y) + NODE_H;

        const gBtn = document.createElement('div');
        gBtn.className = 'gezin-toggle' + (isCollapsed ? ' collapsed' : '');
        gBtn.style.left = (gMidX - 14) + 'px';
        gBtn.style.top  = (gBottomY + 6) + 'px';
        if (isCollapsed) {
          gBtn.innerHTML = `<span class="toggle-icon">▶</span><span class="toggle-count">+${hiddenCount}</span>`;
          gBtn.title = `${hiddenCount} personen verborgen — klik om uit te klappen`;
          gBtn.style.left = (gMidX - 24) + 'px';
        } else {
          gBtn.innerHTML = `<span class="toggle-icon">▼</span>`;
          gBtn.title = 'Klik om gezin in te klappen';
        }
        gBtn.addEventListener('click', (e) => {
          e.stopPropagation(); e.preventDefault();
          toggleGezin(key);
        });
        container.appendChild(gBtn);

        // [Verticaal-toggle bij bio-row ghost verwijderd v484]
      }
    }

    // Ghost-area toggle: als ouders ver uit elkaar staan, plaats ook toggles bij de ghost-kopie
    if (parentPositions.length === 2 && dups) {
      const dist = Math.abs((parentPositions[0].x + NODE_W/2) - (parentPositions[1].x + NODE_W/2));
      if (dist > 2 * (NODE_W + H_GAP)) {
        // Vind ghost-kopieën van elk ouder bij de ander
        gezin.parentIds.forEach((pid, idx) => {
          const otherIdx = 1 - idx;
          const otherId = gezin.parentIds[otherIdx];
          // Zoek ghost van otherId naast pid
          let ghostOfOther = null;
          for (const d of Object.values(dups)) {
            if (d.personId === otherId && d.adjacentTo === pid) {
              ghostOfOther = d; break;
            }
          }
          if (!ghostOfOther) return;
          const gMidX = (parentPositions[idx].x + NODE_W/2 + ghostOfOther.x + NODE_W/2) / 2;
          const gBottomY = Math.max(parentPositions[idx].y + NODE_H, ghostOfOther.y + NODE_H);
          // Skip als dit dezelfde positie is als de hoofdtoggle
          if (Math.abs(gMidX - midX) < NODE_W) return;

          const gBtn = document.createElement('div');
          gBtn.className = 'gezin-toggle' + (isCollapsed ? ' collapsed' : '');
          gBtn.style.left = (gMidX - 14) + 'px';
          gBtn.style.top  = (gBottomY + 6) + 'px';
          if (isCollapsed) {
            gBtn.innerHTML = `<span class="toggle-icon">▶</span><span class="toggle-count">+${hiddenCount}</span>`;
            gBtn.title = `${hiddenCount} personen verborgen — klik om uit te klappen`;
            gBtn.style.left = (gMidX - 24) + 'px';
          } else {
            gBtn.innerHTML = `<span class="toggle-icon">▼</span>`;
            gBtn.title = 'Klik om gezin in te klappen';
          }
          gBtn.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            toggleGezin(key);
          });
          container.appendChild(gBtn);

          // [Verticaal-toggle bij ghost-area verwijderd v484]
        });
      }
    }
  });
}

function render() {
  // Smart View: toon netwerkdiagram als actief en geen specifieke boom geselecteerd
  if (smartViewMode && activeTreeId === null) {
    renderSmartView();
    renderSidebar(document.getElementById('search').value);
    return;
  }

  // Toon/verberg back-knop
  const backBtn = document.getElementById('btn-back-overview');
  if (backBtn) {
    backBtn.classList.toggle('hidden', !smartViewOrigin);
  }

  // Update smart view toggle knop
  const smartBtn = document.getElementById('btn-smart-view');
  if (smartBtn) smartBtn.classList.toggle('active', smartViewMode);

  let pos, ghosts = {}, treeRanges = null, treePositions = null, duplicates = {};
  if (activeTreeId === null && state.persons.length > 0) {
    const result = computeAllFamiliesLayout();
    pos = result.positions;
    ghosts = result.duplicates || {};
    duplicates = result.duplicates || {};
    treePositions = result.treePositions || {};
    treeRanges = result.treeRanges;
  } else {
    // Pass activeTreeId als headId zodat boom-specifieke logica (bijv. neef-nicht
    // herklassificatie voor Fazelahmad) ook fired bij single-tree view.
    const layoutResult = computeLayout(undefined, activeTreeId);
    pos = layoutResult.pos;
    // Cross-family ghosts: personen die in twee ouder-groepen voorkomen
    const crossGhosts = layoutResult.crossFamilyGhosts || {};
    Object.entries(crossGhosts).forEach(([key, g]) => {
      ghosts[key] = g;
      duplicates[key] = g;
    });
    // Cousin child references: non-anchor ouders die kinderen elders in de boom hebben
    window._cousinChildReferences = layoutResult.cousinChildReferences || {};
  }
  lastPositions = pos;
  lastDuplicates = duplicates;
  // Validate goldenPath: source moet nog bestaan
  if (goldenPath && !pos[goldenPath.sourceId]) {
    // Check if source is a ghost
    let stillVisible = false;
    if (duplicates) {
      for (const g of Object.values(duplicates)) {
        if (g.personId === goldenPath.sourceId) { stillVisible = true; break; }
      }
    }
    if (!stillVisible) goldenPath = null;
  }
  renderLines(pos, treeRanges, treePositions, duplicates);
  renderCards(pos, treeRanges, ghosts);
  renderTreeLabels(pos, treeRanges);
  renderCollapseToggles(pos, duplicates);
  renderSidebar(document.getElementById('search').value);
}

// ============================================================
// ZOOM
// ============================================================
function setZoom(z) {
  zoom = Math.min(2, Math.max(0.25, z));
  document.getElementById('canvas').style.transform = `scale(${zoom})`;
  document.getElementById('zoom-label').textContent  = Math.round(zoom * 100) + '%';
}

function zoomFit() {
  const wrapper = document.getElementById('canvas-wrapper');
  const canvas  = document.getElementById('canvas');
  const cw = parseFloat(canvas.style.width)  || 800;
  const ch = parseFloat(canvas.style.height) || 600;
  const ww = wrapper.clientWidth  - 40;
  const wh = wrapper.clientHeight - 40;
  const z  = Math.min(ww / cw, wh / ch, 1);
  setZoom(z);
  wrapper.scrollTo(0, 0);
}

// Scroll viewport naar leftmost top card (boom begint helemaal links)
function scrollToStamhoofd(headId) {
  // Robuust: 5x retry met toenemende delay om browser sticky-scroll restore te overrulen
  const attempt = (delay) => setTimeout(() => {
    const wrapper = document.getElementById('canvas-wrapper');
    if (!wrapper) return;
    // Altijd helemaal naar links scrollen — gebruiker wil niet naar links hoeven scrollen
    wrapper.scrollLeft = 0;
    wrapper.scrollTop = 0;
  }, delay);
  attempt(0);
  attempt(100);
  attempt(300);
  attempt(700);
  attempt(1500);
}

// Disable browser scroll restoration (voorkomt dat browser scroll positie herstelt na reload)
if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// ============================================================
// POPULATE SELECTS IN MODALS
// ============================================================
function populatePersonSelects() {
  const sorted = [...state.persons].sort((a, b) => a.name.localeCompare(b.name));
  const opts   = sorted.map(p => `<option value="${p.id}">${escHtml(p.name)}${p.family ? ' (' + escHtml(p.family) + ')' : ''}</option>`).join('');
  ['sel-parent', 'sel-child', 'sel-p1', 'sel-p2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}

// ============================================================
// PERSON PICKER — herbruikbaar component
// ============================================================
function buildPersonPicker(container, onSelect, excludeId) {
  let selectedId = null;

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Zoek persoon...';
  searchInput.style.cssText = 'width:100%;box-sizing:border-box;';

  const resultsList = document.createElement('div');
  resultsList.className = 'person-picker-results';

  container.appendChild(searchInput);
  container.appendChild(resultsList);

  function genderIcon(g) {
    if (g === 'm') return '♂';
    if (g === 'f') return '♀';
    return '⚧';
  }

  function renderResults(query) {
    const q = query.toLowerCase().trim();
    const sorted = [...state.persons]
      .filter(p => p.id !== excludeId)
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.family || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));

    resultsList.innerHTML = '';
    if (!sorted.length) {
      resultsList.innerHTML = '<div style="padding:8px 10px;font-size:13px;color:var(--text-muted)">Geen resultaten</div>';
      return;
    }
    sorted.forEach(p => {
      const item = document.createElement('div');
      item.className = 'person-picker-item' + (p.id === selectedId ? ' picked' : '');
      item.dataset.id = p.id;
      item.innerHTML = `<span>${genderIcon(p.gender)}</span><span>${escHtml(p.name)}</span>${p.family ? `<span class="person-picker-tag">${escHtml(p.family)}</span>` : ''}`;
      item.addEventListener('click', () => {
        selectedId = p.id;
        searchInput.value = p.name + (p.family ? ` (${p.family})` : '');
        resultsList.querySelectorAll('.person-picker-item').forEach(el => el.classList.remove('picked'));
        item.classList.add('picked');
        resultsList.innerHTML = '';
        onSelect(p.id);
      });
      resultsList.appendChild(item);
    });
  }

  searchInput.addEventListener('input', () => {
    selectedId = null;
    onSelect(null);
    renderResults(searchInput.value);
  });
  searchInput.addEventListener('focus', () => {
    renderResults(searchInput.value);
  });
  // Hide results when clicking outside (gebruik AbortController om memory leak te voorkomen)
  const pickerAbort = new AbortController();
  document.addEventListener('click', function hideOnOutside(e) {
    if (!container.contains(e.target)) {
      resultsList.innerHTML = '';
    }
  }, { signal: pickerAbort.signal });

  return {
    getSelectedId: () => selectedId,
    reset: () => {
      selectedId = null;
      searchInput.value = '';
      resultsList.innerHTML = '';
      onSelect(null);
    },
    destroy: () => {
      pickerAbort.abort();
    }
  };
}

// ============================================================
// MODAL: ADD / EDIT PERSON
// ============================================================
function setPhotoPreview(dataUrl) {
  currentPhotoData = dataUrl || null;
  const preview = document.getElementById('photo-preview');
  const removeBtn = document.getElementById('photo-remove');
  if (dataUrl) {
    preview.innerHTML = `<img src="${dataUrl}" alt="foto">`;
    if (removeBtn) removeBtn.style.display = '';
  } else {
    preview.innerHTML = '👤';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

function openAddModal() {
  if (READ_ONLY) return;
  currentEditId = null;
  document.getElementById('modal-person-title').textContent = 'Persoon toevoegen';
  document.getElementById('btn-person-submit').textContent  = 'Toevoegen';
  document.getElementById('form-person').reset();
  document.getElementById('chk-deceased').checked = false;
  setPhotoPreview(null);
  document.getElementById('rel-edit-section').style.display = 'none';
  document.getElementById('modal-person').classList.remove('hidden');
}

function openEditModal(id) {
  if (READ_ONLY) return;
  const person = getPerson(id);
  if (!person) return;
  currentEditId = id;
  document.getElementById('modal-person-title').textContent = 'Persoon bewerken';
  document.getElementById('btn-person-submit').textContent  = 'Opslaan';
  const form = document.getElementById('form-person');
  form.name.value      = person.name      || '';
  form.gender.value    = person.gender    || 'm';
  form.family.value    = person.family    || '';
  form.birthdate.value = person.birthdate || '';
  form.deathdate.value = person.deathdate || '';
  form.notes.value     = person.notes     || '';
  form.birthOrder.value = person.birthOrder || '';
  form.socialBirthOrder.value = person.socialBirthOrder || '';
  document.getElementById('chk-deceased').checked = !!person.deceased;
  setPhotoPreview(person.photo || null);

  // ── Relaties sectie ──────────────────────────────────────────
  const relSection = document.getElementById('rel-edit-section');
  const relContent = document.getElementById('rel-edit-content');
  relSection.style.display = '';

  function renderRelSection() {
    const partners       = getPartnersOf(id).map(pid => getPerson(pid)).filter(Boolean);
    const parents        = getParentsOf(id).map(pid => getPerson(pid)).filter(Boolean);
    const children       = getChildrenOf(id).map(pid => getPerson(pid)).filter(Boolean);
    const siblings       = getSiblingsOf(id).map(pid => getPerson(pid)).filter(Boolean);
    const socialParents  = getSocialParentsOf(id).map(pid => getPerson(pid)).filter(Boolean);
    const socialChildren = getSocialChildrenOf(id).map(pid => getPerson(pid)).filter(Boolean);

    function relGroup(label, persons, type) {
      const chips = persons.map(p => {
        const gi = p.gender === 'm' ? '♂' : p.gender === 'f' ? '♀' : '⚧';
        return `<span class="rel-chip" style="display:inline-flex;align-items:center;gap:4px;background:var(--accent-bg);border:1px solid var(--border);border-radius:20px;padding:3px 10px 3px 8px;margin:3px;font-size:13px">
          ${gi} ${escHtml(p.name)}
          <button type="button" class="rel-remove-btn" data-type="${type}" data-pid="${p.id}"
            style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px;padding:0 0 0 4px;line-height:1">×</button>
        </span>`;
      }).join('');
      const empty = persons.length === 0
        ? `<span style="color:var(--text-muted);font-size:12px;font-style:italic">Geen</span>`
        : '';
      return `<div style="margin-bottom:10px">
        <div style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:4px">${label.toUpperCase()}</div>
        <div>${chips}${empty}</div>
      </div>`;
    }

    relContent.innerHTML = `
      ${relGroup('Partners', partners, 'partner')}
      ${relGroup('Ouders', parents, 'parent')}
      ${relGroup('Broers & Zussen', siblings, 'sibling')}
      ${relGroup('Kinderen', children, 'child')}
      ${relGroup('Sociale ouders', socialParents, 'social-parent-remove')}
      ${relGroup('Sociale kinderen', socialChildren, 'social-child-remove')}
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center">
        <select id="rel-edit-type" style="width:130px;flex-shrink:0">
          <option value="child">Kind</option>
          <option value="partner">Partner</option>
          <option value="parent">Ouder</option>
          <option value="sibling">Broer/Zus</option>
          <option value="social-child">Sociale ouder van</option>
          <option value="social-parent">Sociaal kind van</option>
        </select>
        <div style="position:relative;flex:1;min-width:150px">
          <input type="text" id="rel-edit-name" placeholder="Naam zoeken of typen..." style="width:100%;box-sizing:border-box">
          <input type="hidden" id="rel-edit-existing-id">
          <div id="rel-edit-autocomplete" style="display:none;position:absolute;left:0;right:0;top:100%;background:var(--card-bg);border:1px solid var(--border);border-radius:6px;z-index:9999;max-height:180px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.3)"></div>
        </div>
        <button type="button" id="rel-edit-add" class="btn small primary" style="flex-shrink:0">+ Toevoegen</button>
      </div>
    `;

    // Remove-knoppen
    relContent.querySelectorAll('.rel-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const pid  = btn.dataset.pid;
        if (type === 'partner') {
          const idx = state.relationships.findIndex(r =>
            r.type === 'partner' &&
            ((r.person1Id === id && r.person2Id === pid) || (r.person1Id === pid && r.person2Id === id))
          );
          if (idx !== -1) state.relationships.splice(idx, 1);
        } else if (type === 'child') {
          const idx = state.relationships.findIndex(r =>
            r.type === 'parent-child' && r.parentId === id && r.childId === pid
          );
          if (idx !== -1) state.relationships.splice(idx, 1);
        } else if (type === 'parent') {
          const idx = state.relationships.findIndex(r =>
            r.type === 'parent-child' && r.parentId === pid && r.childId === id
          );
          if (idx !== -1) state.relationships.splice(idx, 1);
        } else if (type === 'social-parent-remove') {
          // id is the social child, pid is the social parent
          const idx = state.relationships.findIndex(r =>
            r.type === 'social-parent' && r.parentId === pid && r.childId === id
          );
          if (idx !== -1) state.relationships.splice(idx, 1);
        } else if (type === 'social-child-remove') {
          const idx = state.relationships.findIndex(r =>
            r.type === 'social-parent' && r.parentId === id && r.childId === pid
          );
          if (idx !== -1) state.relationships.splice(idx, 1);
        } else if (type === 'sibling') {
          const idx = state.relationships.findIndex(r =>
            r.type === 'sibling' &&
            ((r.person1Id === id && r.person2Id === pid) || (r.person1Id === pid && r.person2Id === id))
          );
          if (idx !== -1) state.relationships.splice(idx, 1);
        }
        saveState();
        render();
        renderRelSection();
      });
    });

    // Autocomplete op naam-input
    const nameInput  = relContent.querySelector('#rel-edit-name');
    const existingId = relContent.querySelector('#rel-edit-existing-id');
    const autoList   = relContent.querySelector('#rel-edit-autocomplete');

    nameInput.addEventListener('input', () => {
      const q = nameInput.value.trim().toLowerCase();
      existingId.value = '';
      if (!q) { autoList.style.display = 'none'; return; }
      const matches = state.persons
        .filter(p => p.id !== id && p.name.toLowerCase().includes(q))
        .slice(0, 10);
      if (!matches.length) { autoList.style.display = 'none'; return; }
      autoList.innerHTML = matches.map(p => {
        const gi = p.gender === 'm' ? '♂' : p.gender === 'f' ? '♀' : '⚧';
        const bd = p.birthdate ? ` · ${p.birthdate}` : '';
        return `<div class="person-picker-item" data-id="${p.id}"
          style="padding:8px 10px;cursor:pointer;display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--border)">
          <span>${gi}</span>
          <span style="flex:1">${escHtml(p.name)}</span>
          ${p.family ? `<span class="person-picker-tag">${escHtml(p.family)}</span>` : ''}
          <span style="color:var(--text-muted);font-size:11px">${bd}</span>
        </div>`;
      }).join('');
      autoList.style.display = 'block';
      autoList.querySelectorAll('.person-picker-item').forEach(item => {
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          const p = state.persons.find(x => x.id === item.dataset.id);
          if (!p) return;
          existingId.value = p.id;
          nameInput.value  = p.name;
          autoList.style.display = 'none';
        });
      });
    });
    nameInput.addEventListener('blur', () => setTimeout(() => { autoList.style.display = 'none'; }, 200));

    // + Toevoegen knop
    relContent.querySelector('#rel-edit-add').addEventListener('click', () => {
      const type     = relContent.querySelector('#rel-edit-type').value;
      const name     = nameInput.value.trim();
      const targetId = existingId.value;
      if (!name) return;

      if (targetId) {
        // Bestaande persoon
        if (type === 'partner') {
          const exists = state.relationships.some(r =>
            r.type === 'partner' &&
            ((r.person1Id === id && r.person2Id === targetId) || (r.person1Id === targetId && r.person2Id === id))
          );
          if (!exists) state.relationships.push({ type: 'partner', person1Id: id, person2Id: targetId });
        } else if (type === 'child') {
          if (wouldCreateCycle(id, targetId)) { alert('Deze relatie zou een cyclus creëren.'); return; }
          const exists = state.relationships.some(r =>
            r.type === 'parent-child' && r.parentId === id && r.childId === targetId
          );
          if (!exists) state.relationships.push({ type: 'parent-child', parentId: id, childId: targetId });
        } else if (type === 'parent') {
          if (wouldCreateCycle(targetId, id)) { alert('Deze relatie zou een cyclus creëren.'); return; }
          const exists = state.relationships.some(r =>
            r.type === 'parent-child' && r.parentId === targetId && r.childId === id
          );
          if (!exists) state.relationships.push({ type: 'parent-child', parentId: targetId, childId: id });
        } else if (type === 'social-child') {
          // id is the social parent, targetId is the social child
          const exists = state.relationships.some(r =>
            r.type === 'social-parent' && r.parentId === id && r.childId === targetId
          );
          if (!exists) state.relationships.push({ type: 'social-parent', parentId: id, childId: targetId });
        } else if (type === 'social-parent') {
          const exists = state.relationships.some(r =>
            r.type === 'social-parent' && r.parentId === targetId && r.childId === id
          );
          if (!exists) state.relationships.push({ type: 'social-parent', parentId: targetId, childId: id });
        } else if (type === 'sibling') {
          const exists = state.relationships.some(r =>
            r.type === 'sibling' &&
            ((r.person1Id === id && r.person2Id === targetId) || (r.person1Id === targetId && r.person2Id === id))
          );
          if (!exists) state.relationships.push({ type: 'sibling', person1Id: id, person2Id: targetId });
        }
      } else {
        // Nieuwe persoon
        const newP = { id: uid(), name, gender: '?', family: person.family || '', birthdate: '', deathdate: '', notes: '', deceased: false };
        state.persons.push(newP);
        if (type === 'partner') {
          state.relationships.push({ type: 'partner', person1Id: id, person2Id: newP.id });
        } else if (type === 'child') {
          state.relationships.push({ type: 'parent-child', parentId: id, childId: newP.id });
        } else if (type === 'parent') {
          state.relationships.push({ type: 'parent-child', parentId: newP.id, childId: id });
        } else if (type === 'social-child') {
          state.relationships.push({ type: 'social-parent', parentId: id, childId: newP.id });
        } else if (type === 'social-parent') {
          state.relationships.push({ type: 'social-parent', parentId: newP.id, childId: id });
        } else if (type === 'sibling') {
          state.relationships.push({ type: 'sibling', person1Id: id, person2Id: newP.id });
        }
        checkSmartLink(newP.id);
      }

      saveState();
      render();
      nameInput.value  = '';
      existingId.value = '';
      renderRelSection();
    });
  }

  renderRelSection();
  document.getElementById('modal-person').classList.remove('hidden');
}

// Foto-input handler — comprimeer naar max 300x300px voor opslag
document.getElementById('photo-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const MAX = 300;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      setPhotoPreview(canvas.toDataURL('image/jpeg', 0.80));
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});
document.getElementById('photo-remove').addEventListener('click', () => setPhotoPreview(null));

document.getElementById('form-person').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const data = {
    name:      form.name.value.trim(),
    gender:    form.gender.value,
    family:    form.family.value.trim(),
    birthdate: form.birthdate.value.trim(),
    deathdate: form.deathdate.value.trim(),
    deceased:  form.deceased.checked,
    photo:     currentPhotoData,
    notes:     form.notes.value.trim(),
    birthOrder: form.birthOrder.value ? parseInt(form.birthOrder.value, 10) : null,
    socialBirthOrder: form.socialBirthOrder.value ? parseInt(form.socialBirthOrder.value, 10) : null
  };
  if (!data.name) return;

  let savedId = currentEditId;
  if (currentEditId) {
    const person = getPerson(currentEditId);
    if (person) Object.assign(person, data);
  } else {
    const newP = { id: uid(), ...data };
    state.persons.push(newP);
    savedId = newP.id;
  }

  saveState();
  render();
  document.getElementById('modal-person').classList.add('hidden');

  // Na opslaan: check of slim koppelen van toepassing is
  if (savedId) checkSmartLink(savedId);
});

// ============================================================
// SLIM KOPPELEN — suggereer relaties bij zelfde achternaam
// ============================================================
function checkSmartLink(personId) {
  const person = getPerson(personId);
  if (!person || !person.family) return;

  const family = person.family.toLowerCase();

  // Vind personen met zelfde familienaam die nog niet gekoppeld zijn
  const matches = state.persons.filter(p => {
    if (p.id === personId) return false;
    if ((p.family || '').toLowerCase() !== family) return false;
    // Check: al een relatie?
    const linked = state.relationships.some(r => {
      if (r.type === 'partner')
        return (r.person1Id === personId && r.person2Id === p.id) ||
               (r.person1Id === p.id    && r.person2Id === personId);
      if (r.type === 'parent-child')
        return (r.parentId === personId && r.childId === p.id) ||
               (r.parentId === p.id    && r.childId === personId);
      if (r.type === 'sibling')
        return (r.person1Id === personId && r.person2Id === p.id) ||
               (r.person1Id === p.id    && r.person2Id === personId);
      if (r.type === 'social-parent')
        return (r.parentId === personId && r.childId === p.id) ||
               (r.parentId === p.id    && r.childId === personId);
      return false;
    });
    return !linked;
  });

  if (!matches.length) return;

  document.getElementById('smartlink-intro').textContent =
    `We vonden ${matches.length} persoon/personen met de familienaam "${person.family}". ` +
    `Wil je ${person.name} direct koppelen?`;

  const list = document.getElementById('smartlink-list');
  list.innerHTML = matches.map(p => `
    <div class="sl-row" data-sl-id="${p.id}">
      <span>${escHtml(p.name)}</span>
      <select class="sl-type">
        <option value="partner">Partner van</option>
        <option value="child-of">Kind van</option>
        <option value="parent-of">Ouder van</option>
        <option value="sibling">Broer/Zus van</option>
        <option value="social-child-of">Sociaal kind van</option>
        <option value="social-parent-of">Sociale ouder van</option>
      </select>
      <button class="btn primary sl-add">+ Link</button>
    </div>
  `).join('');

  list.querySelectorAll('.sl-row').forEach(row => {
    row.querySelector('.sl-add').addEventListener('click', () => {
      const pid  = row.dataset.slId;
      const type = row.querySelector('.sl-type').value;

      if (type === 'partner') {
        if (!state.relationships.some(r =>
          r.type === 'partner' &&
          ((r.person1Id === personId && r.person2Id === pid) ||
           (r.person1Id === pid    && r.person2Id === personId))
        )) state.relationships.push({ type: 'partner', person1Id: personId, person2Id: pid });

      } else if (type === 'child-of') {
        if (wouldCreateCycle(pid, personId)) { alert('Deze relatie zou een cyclus creëren.'); return; }
        if (!state.relationships.some(r =>
          r.type === 'parent-child' && r.parentId === pid && r.childId === personId
        )) state.relationships.push({ type: 'parent-child', parentId: pid, childId: personId });

      } else if (type === 'parent-of') {
        if (wouldCreateCycle(personId, pid)) { alert('Deze relatie zou een cyclus creëren.'); return; }
        if (!state.relationships.some(r =>
          r.type === 'parent-child' && r.parentId === personId && r.childId === pid
        )) state.relationships.push({ type: 'parent-child', parentId: personId, childId: pid });

      } else if (type === 'sibling') {
        if (!state.relationships.some(r =>
          r.type === 'sibling' &&
          ((r.person1Id === personId && r.person2Id === pid) ||
           (r.person1Id === pid    && r.person2Id === personId))
        )) state.relationships.push({ type: 'sibling', person1Id: personId, person2Id: pid });

      } else if (type === 'social-child-of') {
        if (!state.relationships.some(r =>
          r.type === 'social-parent' && r.parentId === pid && r.childId === personId
        )) state.relationships.push({ type: 'social-parent', parentId: pid, childId: personId });

      } else if (type === 'social-parent-of') {
        if (!state.relationships.some(r =>
          r.type === 'social-parent' && r.parentId === personId && r.childId === pid
        )) state.relationships.push({ type: 'social-parent', parentId: personId, childId: pid });
      }

      saveState();
      render();
      const btn = row.querySelector('.sl-add');
      btn.textContent = '✓ Gekoppeld';
      btn.className = 'btn sl-done';
      btn.disabled = true;
      row.querySelector('.sl-type').disabled = true;
    });
  });

  document.getElementById('modal-smartlink').classList.remove('hidden');
}

document.getElementById('btn-smartlink-close').addEventListener('click', () => {
  document.getElementById('modal-smartlink').classList.add('hidden');
});

document.getElementById('btn-person-cancel').addEventListener('click', () => {
  document.getElementById('modal-person').classList.add('hidden');
});

// ============================================================
// MODAL: ADD RELATION
// ============================================================
function openAddRelationModal() {
  if (READ_ONLY) return;
  openRelationModalFrom(null);
}

function openRelationModalFrom(preselectedId) {
  populatePersonSelects();
  document.getElementById('form-relation').reset();
  document.getElementById('rel-fields-parent-child').classList.remove('hidden');
  document.getElementById('rel-fields-partner').classList.add('hidden');

  if (preselectedId) {
    // Default to Partner type when coming from a card
    document.getElementById('rel-type').value = 'partner';
    document.getElementById('rel-fields-parent-child').classList.add('hidden');
    document.getElementById('rel-fields-partner').classList.remove('hidden');
    document.getElementById('sel-p1').value = preselectedId;
    document.getElementById('sel-parent').value = preselectedId;
  }

  document.getElementById('modal-relation').classList.remove('hidden');
}

document.getElementById('rel-type').addEventListener('change', function () {
  const isPartner = this.value === 'partner';
  document.getElementById('rel-fields-parent-child').classList.toggle('hidden',  isPartner);
  document.getElementById('rel-fields-partner').classList.toggle('hidden', !isPartner);
  // social-parent reuses the parent-child fields (same parentId/childId structure)
});

document.getElementById('form-relation').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const type = form.type.value;

  if (type === 'partner') {
    const p1 = form.person1Id.value;
    const p2 = form.person2Id.value;
    if (p1 === p2) { alert('Kies twee verschillende personen.'); return; }
    // Check duplicate
    const exists = state.relationships.some(r =>
      r.type === 'partner' &&
      ((r.person1Id === p1 && r.person2Id === p2) || (r.person1Id === p2 && r.person2Id === p1))
    );
    if (exists) { alert('Deze partnerrelatie bestaat al.'); return; }
    state.relationships.push({ type: 'partner', person1Id: p1, person2Id: p2 });
  } else if (type === 'social-parent') {
    const parentId = form.parentId.value;
    const childId  = form.childId.value;
    if (parentId === childId) { alert('Sociale ouder en kind mogen niet dezelfde persoon zijn.'); return; }
    const exists = state.relationships.some(r =>
      r.type === 'social-parent' && r.parentId === parentId && r.childId === childId
    );
    if (exists) { alert('Deze sociale ouder-relatie bestaat al.'); return; }
    state.relationships.push({ type: 'social-parent', parentId, childId });
  } else {
    const parentId = form.parentId.value;
    const childId  = form.childId.value;
    if (parentId === childId) { alert('Ouder en kind mogen niet dezelfde persoon zijn.'); return; }
    if (wouldCreateCycle(parentId, childId)) { alert('Deze relatie zou een cyclus creëren (het kind is al een voorouder van de ouder).'); return; }
    const exists = state.relationships.some(r =>
      r.type === 'parent-child' && r.parentId === parentId && r.childId === childId
    );
    if (exists) { alert('Deze relatie bestaat al.'); return; }
    state.relationships.push({ type: 'parent-child', parentId, childId });
  }

  saveState();
  render();
  document.getElementById('modal-relation').classList.add('hidden');
});

document.getElementById('btn-relation-cancel').addEventListener('click', () => {
  document.getElementById('modal-relation').classList.add('hidden');
});

// ============================================================
// MODAL: DELETE CONFIRM
// ============================================================
function showConfirm(message, callback) {
  document.getElementById('confirm-message').textContent = message;
  confirmCallback = callback;
  document.getElementById('modal-confirm').classList.remove('hidden');
}

function confirmDeletePerson(id) {
  if (READ_ONLY) return;
  const person = getPerson(id);
  if (!person) return;
  showConfirm(
    `"${person.name}" verwijderen? Alle relaties van deze persoon worden ook verwijderd.`,
    () => deletePerson(id)
  );
}

function deletePerson(id) {
  state.persons = state.persons.filter(p => p.id !== id);
  state.relationships = state.relationships.filter(r =>
    r.parentId !== id && r.childId !== id &&
    r.person1Id !== id && r.person2Id !== id
  );
  saveState();
  render();
}

document.getElementById('btn-confirm-yes').addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
  confirmCallback = null;
  document.getElementById('modal-confirm').classList.add('hidden');
});
document.getElementById('btn-confirm-no').addEventListener('click', () => {
  confirmCallback = null;
  document.getElementById('modal-confirm').classList.add('hidden');
});

// ============================================================
// MODAL: DETAIL VIEW
// ============================================================
function openDetailModal(id) {
  const person = getPerson(id);
  if (!person) return;

  const gClass = person.gender === 'm' ? 'male' : person.gender === 'f' ? 'female' : 'unknown';
  const uClass = person.id === USER_ID ? 'user' : gClass;
  const span   = lifespan(person);

  const parents   = getParentsOf(id).map(getPerson).filter(Boolean);
  const children  = getChildrenOf(id).map(getPerson).filter(Boolean);
  const partners  = getPartnersOf(id).map(getPerson).filter(Boolean);
  const siblings  = getSiblingsOf(id).map(getPerson).filter(Boolean);

  const pillGroup = (label, list) => {
    if (!list.length) return '';
    return `<div class="detail-section">
      <div class="detail-section-title">${label}</div>
      <div class="detail-pills">
        ${list.map(p => `<span class="detail-pill" data-id="${p.id}">${escHtml(p.name)}</span>`).join('')}
      </div>
    </div>`;
  };

  const modal = document.getElementById('modal-detail');
  modal.querySelector('.modal-content').innerHTML = `
    <div class="detail-header">
      ${person.photo
        ? `<div class="detail-avatar ${uClass}" style="background:none;padding:0;overflow:hidden"><img src="${escHtml(person.photo)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`
        : `<div class="detail-avatar ${uClass}">${initials(person.name)}</div>`}
      <div>
        <div class="detail-name">${escHtml(person.name)}</div>
        <div class="detail-sub">${[person.family, span].filter(Boolean).join(' · ')}</div>
      </div>
    </div>

    ${person.notes ? `<div class="detail-section"><div class="detail-section-title">Notities</div><p class="detail-notes">${escHtml(person.notes)}</p></div>` : ''}
    ${pillGroup('Ouders', parents)}
    ${pillGroup('Partners', partners)}
    ${pillGroup('Broers & Zussen', siblings)}
    ${pillGroup('Kinderen', children)}

    <div class="detail-divider"></div>

    ${READ_ONLY ? '' : `
    <div class="detail-section">
      <div class="detail-section-title">Toevoegen aan ${escHtml(person.name)}</div>

      <!-- RELATIETYPE + ANDERE OUDER -->
      <div class="quick-row" style="margin-bottom:6px">
        <select id="qa-relation" style="flex:1">
          <option value="child">Kind van ${escHtml(person.name)}</option>
          <option value="partner">Partner van ${escHtml(person.name)}</option>
          <option value="parent">Ouder van ${escHtml(person.name)}</option>
          <option value="sibling">Broer/Zus van ${escHtml(person.name)}</option>
          <option value="social-child-of">Sociaal kind van ${escHtml(person.name)}</option>
          <option value="social-parent-of">Sociale ouder van ${escHtml(person.name)}</option>
        </select>
      </div>
      <div id="qa-other-parent-row" class="quick-row" style="margin-bottom:6px;display:none">
        <label style="font-size:12px;color:var(--text-muted);flex:1;display:flex;align-items:center;gap:6px">
          Andere ouder:
          <select id="qa-other-parent" style="flex:1">
            <option value="">— geen / onbekend —</option>
            ${partners.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
            ${state.persons.filter(p => p.id !== id && !partners.find(pp=>pp.id===p.id)).map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
          </select>
        </label>
      </div>

      <!-- RIJEN MET AUTOCOMPLETE -->
      <div id="qa-rows-container"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="qa-add-row" class="btn small secondary">+ Rij toevoegen</button>
        <button id="qa-save-all" class="btn primary">Opslaan</button>
      </div>
    </div>
    `}

    <div class="form-actions" style="margin-top:8px">
      ${READ_ONLY ? '' : `
      <button id="btn-detail-edit" class="btn secondary">✏ Bewerken</button>
      <button id="btn-detail-merge" class="btn secondary">🔗 Samenvoegen</button>
      <button id="btn-detail-delete" class="btn danger">✕ Verwijderen</button>
      `}
      <button id="btn-detail-close" class="btn secondary">Sluiten</button>
    </div>
  `;

  modal.classList.remove('hidden');

  // Pill clicks → scroll to that card
  modal.querySelectorAll('.detail-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      modal.classList.add('hidden');
      scrollToCard(pill.dataset.id);
    });
  });

  // Edit button (alleen in beheer-modus)
  const btnEdit = modal.querySelector('#btn-detail-edit');
  if (btnEdit) btnEdit.addEventListener('click', () => {
    modal.classList.add('hidden');
    openEditModal(id);
  });

  // Merge button (alleen in beheer-modus)
  const btnMerge = modal.querySelector('#btn-detail-merge');
  if (btnMerge) btnMerge.addEventListener('click', () => {
    modal.classList.add('hidden');
    openMergeModal(id);
  });

  // Delete button (alleen in beheer-modus)
  const btnDel = modal.querySelector('#btn-detail-delete');
  if (btnDel) btnDel.addEventListener('click', () => {
    modal.classList.add('hidden');
    confirmDeletePerson(id);
  });

  // Close button
  modal.querySelector('#btn-detail-close').addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  // ── Show/hide "andere ouder" row ──────────────────────────────
  const qaRelation     = modal.querySelector('#qa-relation');
  const qaOtherParentRow = modal.querySelector('#qa-other-parent-row');
  if (qaRelation && qaOtherParentRow) {
    const updateQaRelationUI = () => {
      const val = qaRelation.value;
      qaOtherParentRow.style.display = val === 'child' ? '' : 'none';
      // Toon/verberg pleeg-volgorde veld op basis van relatietype
      const isSocial = val === 'social-child-of';
      const rows = modal.querySelectorAll('.qa-multi-row');
      rows.forEach(row => {
        const sboInput = row.querySelector('.qa-row-sbo');
        if (sboInput) sboInput.style.display = isSocial ? '' : 'none';
      });
    };
    qaRelation.addEventListener('change', updateQaRelationUI);
    updateQaRelationUI();
  }

  // ── Helper: maak één autocomplete-rij ─────────────────────────
  function createQaRow() {
    const row = document.createElement('div');
    row.className = 'quick-row qa-multi-row';
    row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;position:relative;flex-wrap:wrap';
    row.innerHTML = `
      <div style="position:relative;flex:3;min-width:140px">
        <input type="text" class="qa-row-name" placeholder="Naam (bestaand of nieuw)" style="width:100%;box-sizing:border-box">
        <input type="hidden" class="qa-row-existing-id">
        <div class="qa-row-autocomplete" style="display:none;position:absolute;left:0;right:0;top:100%;background:var(--card-bg);border:1px solid var(--border);border-radius:6px;z-index:9999;max-height:180px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.3)"></div>
      </div>
      <select class="qa-row-gender" style="width:62px;flex-shrink:0">
        <option value="m">Man</option>
        <option value="f">Vrouw</option>
        <option value="?">?</option>
      </select>
      <input type="text" class="qa-row-bd" placeholder="Geboortejaar" style="flex:2;min-width:90px">
      <input type="number" class="qa-row-bo" placeholder="Volgorde" min="1" style="width:68px;flex-shrink:0" title="Geboorte-volgorde">
      <input type="number" class="qa-row-sbo" placeholder="Pleeg-nr" min="1" style="width:68px;flex-shrink:0;display:none" title="Pleeg-volgorde (bij sociale ouder)">
      <button type="button" class="btn small danger qa-row-remove" style="flex-shrink:0;padding:4px 8px">✕</button>
    `;

    const nameInput  = row.querySelector('.qa-row-name');
    const existingId = row.querySelector('.qa-row-existing-id');
    const autoList   = row.querySelector('.qa-row-autocomplete');
    const genderSel  = row.querySelector('.qa-row-gender');
    const bdInput    = row.querySelector('.qa-row-bd');
    const removeBtn  = row.querySelector('.qa-row-remove');

    removeBtn.addEventListener('click', () => row.remove());

    nameInput.addEventListener('input', () => {
      const q = nameInput.value.trim().toLowerCase();
      existingId.value = '';
      row.dataset.locked = '';
      genderSel.disabled = false;
      bdInput.disabled   = false;
      if (!q) { autoList.style.display = 'none'; return; }
      const matches = state.persons
        .filter(p => p.id !== id && p.name.toLowerCase().includes(q))
        .slice(0, 10);
      if (!matches.length) { autoList.style.display = 'none'; return; }
      autoList.innerHTML = matches.map(p => {
        const gi = p.gender === 'm' ? '♂' : p.gender === 'f' ? '♀' : '⚧';
        const bd = p.birthdate ? ` · ${p.birthdate}` : '';
        return `<div class="person-picker-item" data-id="${p.id}" style="padding:8px 10px;cursor:pointer;display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--border)">
          <span>${gi}</span>
          <span style="flex:1">${escHtml(p.name)}</span>
          ${p.family ? `<span class="person-picker-tag">${escHtml(p.family)}</span>` : ''}
          <span style="color:var(--text-muted);font-size:11px">${bd}</span>
        </div>`;
      }).join('');
      autoList.style.display = 'block';
      autoList.querySelectorAll('.person-picker-item').forEach(item => {
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          const pid = item.dataset.id;
          const p   = state.persons.find(x => x.id === pid);
          if (!p) return;
          existingId.value   = pid;
          nameInput.value    = p.name;
          genderSel.value    = p.gender || '?';
          bdInput.value      = p.birthdate || '';
          genderSel.disabled = true;
          bdInput.disabled   = true;
          row.dataset.locked = '1';
          autoList.style.display = 'none';
        });
      });
    });

    nameInput.addEventListener('blur', () => setTimeout(() => { autoList.style.display = 'none'; }, 200));

    return row;
  }

  // ── Render 6 standaard rijen ───────────────────────────────────
  const qaRowsContainer = modal.querySelector('#qa-rows-container');
  if (qaRowsContainer) {
    for (let i = 0; i < 6; i++) {
      qaRowsContainer.appendChild(createQaRow());
    }
  }

  // ── + Rij toevoegen ───────────────────────────────────────────
  const qaAddRow = modal.querySelector('#qa-add-row');
  if (qaAddRow && qaRowsContainer) {
    qaAddRow.addEventListener('click', () => {
      const newRow = createQaRow();
      qaRowsContainer.appendChild(newRow);
      // Toon pleeg-volgorde als sociaal kind geselecteerd is
      if (qaRelation && qaRelation.value === 'social-child-of') {
        const sbo = newRow.querySelector('.qa-row-sbo');
        if (sbo) sbo.style.display = '';
      }
      newRow.querySelector('.qa-row-name').focus();
    });
  }

  // ── Opslaan ───────────────────────────────────────────────────
  const qaSaveAll = modal.querySelector('#qa-save-all');
  if (qaSaveAll && qaRowsContainer) {
    qaSaveAll.addEventListener('click', () => {
      const relation    = qaRelation ? qaRelation.value : 'child';
      const otherParent = modal.querySelector('#qa-other-parent')?.value || '';
      const rows        = [...qaRowsContainer.querySelectorAll('.qa-multi-row')];
      const toScroll    = [];
      let added = 0;

      rows.forEach(row => {
        const nameTxt    = row.querySelector('.qa-row-name').value.trim();
        const existId    = row.querySelector('.qa-row-existing-id').value;
        const gender     = row.querySelector('.qa-row-gender').value;
        const birthdate  = row.querySelector('.qa-row-bd').value.trim();
        const boVal      = row.querySelector('.qa-row-bo')?.value;
        const sboVal     = row.querySelector('.qa-row-sbo')?.value;
        const birthOrder = boVal ? parseInt(boVal, 10) : null;
        const socialBirthOrder = sboVal ? parseInt(sboVal, 10) : null;
        if (!nameTxt) return;

        if (existId) {
          // ── Bestaande persoon: relatie aanmaken + volgorde updaten ──
          const existPerson = getPerson(existId);
          if (existPerson) {
            if (birthOrder != null) existPerson.birthOrder = birthOrder;
            if (socialBirthOrder != null) existPerson.socialBirthOrder = socialBirthOrder;
          }
          if (relation === 'partner') {
            const exists = state.relationships.some(r =>
              r.type === 'partner' &&
              ((r.person1Id === id && r.person2Id === existId) || (r.person1Id === existId && r.person2Id === id))
            );
            if (!exists) state.relationships.push({ type: 'partner', person1Id: id, person2Id: existId });
          } else if (relation === 'child') {
            if (wouldCreateCycle(id, existId)) { showToast('⚠️ Cyclus gedetecteerd, relatie overgeslagen.', '', 4000); return; }
            const exists = state.relationships.some(r =>
              r.type === 'parent-child' && r.parentId === id && r.childId === existId
            );
            if (!exists) {
              state.relationships.push({ type: 'parent-child', parentId: id, childId: existId });
              if (otherParent) state.relationships.push({ type: 'parent-child', parentId: otherParent, childId: existId });
            }
          } else if (relation === 'parent') {
            if (wouldCreateCycle(existId, id)) { showToast('⚠️ Cyclus gedetecteerd, relatie overgeslagen.', '', 4000); return; }
            const exists = state.relationships.some(r =>
              r.type === 'parent-child' && r.parentId === existId && r.childId === id
            );
            if (!exists) state.relationships.push({ type: 'parent-child', parentId: existId, childId: id });
          } else if (relation === 'social-child-of') {
            // id is the social parent, existId is the social child
            const exists = state.relationships.some(r =>
              r.type === 'social-parent' && r.parentId === id && r.childId === existId
            );
            if (!exists) state.relationships.push({ type: 'social-parent', parentId: id, childId: existId });
          } else if (relation === 'social-parent-of') {
            // id is the social child, existId is the social parent
            const exists = state.relationships.some(r =>
              r.type === 'social-parent' && r.parentId === existId && r.childId === id
            );
            if (!exists) state.relationships.push({ type: 'social-parent', parentId: existId, childId: id });
          } else if (relation === 'sibling') {
            const exists = state.relationships.some(r =>
              r.type === 'sibling' &&
              ((r.person1Id === id && r.person2Id === existId) || (r.person1Id === existId && r.person2Id === id))
            );
            if (!exists) state.relationships.push({ type: 'sibling', person1Id: id, person2Id: existId });
          }
          toScroll.push(existId);

        } else {
          // ── Nieuwe persoon aanmaken + relatie ───────────────────
          const newPerson = { id: uid(), name: nameTxt, gender, family: person.family || '', birthdate, deathdate: '', notes: '', deceased: false, birthOrder, socialBirthOrder };
          state.persons.push(newPerson);

          if (relation === 'partner') {
            state.relationships.push({ type: 'partner', person1Id: id, person2Id: newPerson.id });
          } else if (relation === 'child') {
            state.relationships.push({ type: 'parent-child', parentId: id, childId: newPerson.id });
            if (otherParent) state.relationships.push({ type: 'parent-child', parentId: otherParent, childId: newPerson.id });
          } else if (relation === 'parent') {
            state.relationships.push({ type: 'parent-child', parentId: newPerson.id, childId: id });
          } else if (relation === 'social-child-of') {
            // id is the social parent, newPerson is the social child
            state.relationships.push({ type: 'social-parent', parentId: id, childId: newPerson.id });
          } else if (relation === 'social-parent-of') {
            // id is the social child, newPerson is the social parent
            state.relationships.push({ type: 'social-parent', parentId: newPerson.id, childId: id });
          } else if (relation === 'sibling') {
            state.relationships.push({ type: 'sibling', person1Id: id, person2Id: newPerson.id });
          }
          toScroll.push(newPerson.id);
          checkSmartLink(newPerson.id);
        }
        added++;
      });

      if (!added) return;
      saveState();
      modal.classList.add('hidden');
      render();
      if (toScroll.length) setTimeout(() => scrollToCard(toScroll[0]), 100);
      const relLabel = relation === 'child' ? 'kind' : relation === 'partner' ? 'partner' : relation === 'sibling' ? 'broer/zus' : relation === 'social-child-of' ? 'sociaal kind' : relation === 'social-parent-of' ? 'sociale ouder' : 'ouder';
      showToast(`✅ ${added} ${relLabel}${added > 1 && relation === 'child' ? 'eren' : added > 1 ? 's' : ''} toegevoegd`, 'success', 3000);
    });
  }
}

// Close modals on backdrop click (delegate because detail modal rebuilds its content)
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.closest('.modal').classList.add('hidden');
  }
});

// ============================================================
// EXPORT / IMPORT
// ============================================================
document.getElementById('btn-export').addEventListener('click', () => {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `familieboom_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported.persons) || !Array.isArray(imported.relationships))
        throw new Error('Ongeldig formaat: persons en relationships zijn vereist');

      // Valideer: alle IDs in relaties moeten bestaan in persons
      const knownIds = new Set(imported.persons.map(p => p.id));
      const validRels = imported.relationships.filter(r => {
        if (r.type === 'partner')       return knownIds.has(r.person1Id) && knownIds.has(r.person2Id);
        if (r.type === 'parent-child')  return knownIds.has(r.parentId)  && knownIds.has(r.childId);
        if (r.type === 'social-parent') return knownIds.has(r.parentId)  && knownIds.has(r.childId);
        if (r.type === 'sibling')       return knownIds.has(r.person1Id) && knownIds.has(r.person2Id);
        return false; // onbekend type verwijderen
      });
      // Cyclus-check: filter parent-child relaties die een cyclus zouden creëren
      // Tijdelijk state instellen zodat wouldCreateCycle werkt
      const prevState = state;
      state = { persons: imported.persons, relationships: [] };
      const safeRels = [];
      for (const r of validRels) {
        if ((r.type === 'parent-child' || r.type === 'social-parent') && wouldCreateCycle(r.parentId, r.childId)) {
          continue; // cyclus overslaan
        }
        safeRels.push(r);
        state.relationships.push(r);
      }
      state = prevState;
      const removed = imported.relationships.length - safeRels.length;

      state = { persons: imported.persons, relationships: safeRels };
      saveState();
      render();
      if (removed > 0) alert(`Importeer geslaagd. ${removed} ongeldige relatie(s) verwijderd.`);
    } catch (err) {
      alert('Fout bij laden: ' + err.message);
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

// ============================================================
// RESET
// ============================================================
document.getElementById('btn-reset').addEventListener('click', () => {
  showConfirm('Alle data terugzetten naar de startdata? Eigen wijzigingen gaan verloren.', () => {
    state = JSON.parse(JSON.stringify(START_DATA));
    saveState();
    render();
    setTimeout(zoomFit, 100);
  });
});

// ============================================================
// TOOLBAR BUTTONS
// ============================================================
document.getElementById('btn-add-person').addEventListener('click',   openAddModal);
document.getElementById('btn-add-relation').addEventListener('click', openAddRelationModal);
document.getElementById('btn-new-family').addEventListener('click', () => {
  // Open add-person modal; nieuwe root-persoon wordt automatisch een nieuwe stamboom
  currentEditId = null;
  document.getElementById('modal-person-title').textContent = 'Nieuwe familie starten';
  document.getElementById('btn-person-submit').textContent  = 'Aanmaken';
  document.getElementById('form-person').reset();
  document.getElementById('modal-person').classList.remove('hidden');
});
document.getElementById('btn-zoom-in').addEventListener('click',  () => setZoom(zoom + 0.1));
document.getElementById('btn-zoom-out').addEventListener('click', () => setZoom(zoom - 0.1));
document.getElementById('btn-zoom-fit').addEventListener('click', zoomFit);

// Pinch-to-zoom op mobiel
(function() {
  const wrapper = document.getElementById('canvas-wrapper');
  let pinching = false;
  let startDist = 0;
  let startZoom = 1;
  let lastZoom = 1;

  function getDist(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  wrapper.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
      pinching = true;
      startDist = getDist(e.touches[0], e.touches[1]);
      startZoom = zoom;
    }
  }, { passive: true });

  wrapper.addEventListener('touchmove', function(e) {
    if (pinching && e.touches.length === 2) {
      e.preventDefault();
      e.stopPropagation();
      const dist = getDist(e.touches[0], e.touches[1]);
      const ratio = dist / startDist;
      const newZoom = Math.min(2, Math.max(0.15, startZoom * ratio));
      if (Math.abs(newZoom - lastZoom) > 0.01) {
        lastZoom = newZoom;
        setZoom(newZoom);
      }
    }
  }, { passive: false });

  wrapper.addEventListener('touchend', function(e) {
    if (e.touches.length < 2) {
      pinching = false;
    }
  }, { passive: true });

  wrapper.addEventListener('touchcancel', function() {
    pinching = false;
  }, { passive: true });
})();

// Mobiel: sidebar toggle
(function() {
  const toggleBtn = document.getElementById('btn-sidebar-toggle');
  const overlay   = document.getElementById('sidebar-overlay');
  function openSidebar()  { document.body.classList.add('sidebar-open'); }
  function closeSidebar() { document.body.classList.remove('sidebar-open'); }
  if (toggleBtn) toggleBtn.addEventListener('click', () => {
    document.body.classList.contains('sidebar-open') ? closeSidebar() : openSidebar();
  });
  if (overlay) overlay.addEventListener('click', closeSidebar);
  // Sluit sidebar als gebruiker op een persoon in de lijst klikt
  document.getElementById('person-list').addEventListener('click', closeSidebar);
  document.getElementById('tree-list').addEventListener('click', closeSidebar);
})();

document.getElementById('search').addEventListener('input', e => {
  renderSidebar(e.target.value);
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
  }
  if (e.key === '+' && e.ctrlKey) { e.preventDefault(); setZoom(zoom + 0.1); }
  if (e.key === '-' && e.ctrlKey) { e.preventDefault(); setZoom(zoom - 0.1); }
});

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type = '', duration = 4000) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.4s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 400);
  }, duration);
}


// ============================================================
// SAMENVOEGEN — MERGE PERSONS
// ============================================================
function openMergeModal(keepId) {
  const keepPerson = getPerson(keepId);
  if (!keepPerson) return;

  const modal = document.getElementById('modal-merge');
  let selectedRemoveId = null;

  // Toon persoon A info
  const gClass = keepPerson.gender === 'm' ? 'male' : keepPerson.gender === 'f' ? 'female' : 'unknown';
  const uClass = keepPerson.id === USER_ID ? 'user' : gClass;
  document.getElementById('merge-person-a').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#0f172a;border-radius:8px;margin-bottom:4px">
      <div class="detail-avatar ${uClass}" style="width:36px;height:36px;font-size:13px;flex-shrink:0">${initials(keepPerson.name)}</div>
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(keepPerson.name)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${[keepPerson.family, lifespan(keepPerson)].filter(Boolean).join(' · ') || 'Geen extra info'}</div>
      </div>
    </div>`;

  // Reset zoek- en preview-velden
  const searchInput  = document.getElementById('merge-search');
  const resultsDiv   = document.getElementById('merge-results');
  const previewDiv   = document.getElementById('merge-preview');
  const confirmBtn   = document.getElementById('btn-merge-confirm');
  searchInput.value  = '';
  resultsDiv.innerHTML = '';
  previewDiv.style.display = 'none';
  confirmBtn.style.display = 'none';
  selectedRemoveId = null;

  // Zoekfunctie
  function doSearch(query) {
    const q = query.trim().toLowerCase();
    resultsDiv.innerHTML = '';
    selectedRemoveId = null;
    previewDiv.style.display = 'none';
    confirmBtn.style.display = 'none';

    if (q.length < 1) return;

    const matches = state.persons.filter(p =>
      p.id !== keepId &&
      p.name.toLowerCase().includes(q)
    );

    if (!matches.length) {
      resultsDiv.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:6px 4px">Geen resultaten gevonden</div>';
      return;
    }

    matches.forEach(p => {
      const pGClass = p.gender === 'm' ? 'male' : p.gender === 'f' ? 'female' : 'unknown';
      const item = document.createElement('div');
      item.className = 'merge-result-item';
      item.dataset.id = p.id;
      item.innerHTML = `
        <div>${escHtml(p.name)}</div>
        <div class="merge-result-family">${[p.family, lifespan(p)].filter(Boolean).join(' · ') || 'Geen extra info'}</div>`;
      item.addEventListener('click', () => {
        // Deselect previous
        resultsDiv.querySelectorAll('.merge-result-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        selectedRemoveId = p.id;

        // Toon preview
        previewDiv.style.display = 'block';
        previewDiv.innerHTML = `
          <strong style="color:var(--text)">Samenvoegen:</strong><br>
          <span style="color:#93c5fd">${escHtml(keepPerson.name)}</span>
          <span style="color:var(--text-muted)"> + </span>
          <span style="color:#f9a8d4">${escHtml(p.name)}</span>
          <span style="color:var(--text-muted)"> → </span>
          <span style="color:#86efac">${escHtml(keepPerson.name)}</span>
          <br><span style="color:var(--text-muted);font-size:11px;margin-top:4px;display:block">De persoon "${escHtml(p.name)}" wordt verwijderd. Alle relaties worden overgenomen door "${escHtml(keepPerson.name)}".</span>`;
        confirmBtn.style.display = 'inline-flex';
      });
      resultsDiv.appendChild(item);
    });
  }

  searchInput.oninput = e => doSearch(e.target.value);

  // Bevestig knop
  confirmBtn.onclick = () => {
    if (!selectedRemoveId) return;
    mergePersons(keepId, selectedRemoveId);
    modal.classList.add('hidden');
  };

  // Annuleer knop
  document.getElementById('btn-merge-cancel').onclick = () => {
    modal.classList.add('hidden');
  };

  modal.classList.remove('hidden');
  searchInput.focus();
}

function mergePersons(keepId, removeId) {
  if (keepId === removeId) return;

  const removePerson = getPerson(removeId);
  const keepPerson   = getPerson(keepId);
  if (!removePerson || !keepPerson) return;

  // Vervang alle verwijzingen naar removeId door keepId in relationships
  state.relationships = state.relationships.map(rel => {
    const r = { ...rel };
    if (r.type === 'parent-child' || r.type === 'social-parent') {
      if (r.parentId === removeId) r.parentId = keepId;
      if (r.childId  === removeId) r.childId  = keepId;
    } else if (r.type === 'partner' || r.type === 'sibling') {
      if (r.person1Id === removeId) r.person1Id = keepId;
      if (r.person2Id === removeId) r.person2Id = keepId;
    }
    return r;
  });

  // Verwijder zelf-referentiële relaties (bijv. keepId is ouder van keepId)
  state.relationships = state.relationships.filter(rel => {
    if (rel.type === 'parent-child' || rel.type === 'social-parent') return rel.parentId !== rel.childId;
    if (rel.type === 'partner' || rel.type === 'sibling')            return rel.person1Id !== rel.person2Id;
    return true;
  });

  // Verwijder duplicaten
  const seen = new Set();
  state.relationships = state.relationships.filter(rel => {
    let key;
    if (rel.type === 'parent-child') {
      key = `pc:${rel.parentId}:${rel.childId}`;
    } else if (rel.type === 'partner') {
      // partner is symmetrisch: sorteer IDs zodat A-B en B-A als duplicaat worden herkend
      const ids = [rel.person1Id, rel.person2Id].sort();
      key = `partner:${ids[0]}:${ids[1]}`;
    } else if (rel.type === 'sibling') {
      const ids = [rel.person1Id, rel.person2Id].sort();
      key = `sibling:${ids[0]}:${ids[1]}`;
    } else if (rel.type === 'social-parent') {
      key = `social-parent:${rel.parentId}:${rel.childId}`;
    } else {
      key = JSON.stringify(rel);
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Verwijder de persoon met removeId
  state.persons = state.persons.filter(p => p.id !== removeId);

  saveState();
  render();
  showToast(`✅ ${escHtml(removePerson.name)} samengevoegd met ${escHtml(keepPerson.name)}`, 'success');
}

// ============================================================
// UTILITY
// ============================================================
function genderIcon(g) {
  if (g === 'm') return '♂';
  if (g === 'f') return '♀';
  return '⚧';
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// PDF DOWNLOAD
// ============================================================
document.getElementById('btn-pdf').addEventListener('click', async () => {
  const btn = document.getElementById('btn-pdf');
  btn.disabled = true;
  btn.textContent = '⏳ Bezig...';
  showToast('PDF wordt gemaakt, even geduld...', 'info', 8000);

  try {
    await downloadPDF();
    showToast('✅ PDF gedownload!', 'success');
  } catch (err) {
    console.error('PDF error:', err);
    showToast('❌ PDF maken mislukt: ' + err.message, '', 6000);
  } finally {
    btn.disabled = false;
    btn.textContent = '📄 PDF';
  }
});

async function downloadPDF() {
  const { jsPDF } = window.jspdf;
  const canvas = document.getElementById('canvas');
  const treeW = parseFloat(canvas.style.width) || 800;
  const treeH = parseFloat(canvas.style.height) || 600;

  // Extra capture-buffer voorkomt dat de onderkant/rechterkant afgesneden wordt:
  // kaart-shadows, duplicate-badges en SVG-lijnen kunnen enkele px buiten
  // de berekende treeW/treeH uitsteken, en html2canvas rondt naar beneden af.
  // We meten de werkelijke content-bounds van de clone + nemen een marge mee.
  const SAFE_BUFFER = 40;

  // ── Eén-pagina PDF op maat ──
  // Maak één PDF-pagina met afmetingen die exact de hele boom bevatten,
  // zodat PDF-viewers (Adobe, Chrome, Preview) er gewoon in kunnen scrollen
  // i.p.v. de boom opgesplitst over meerdere pagina's.
  const MARGIN_MM = 12;
  const MM_TO_PX = 96 / 25.4;

  // Maak offscreen clone op 1:1 schaal (geen krimp — boom blijft scherp)
  const clone = prepareClone(canvas, 1);
  document.body.appendChild(clone);

  // Meet werkelijke content-afmetingen (incl. shadow/badges) en neem het
  // maximum met de berekende treeW/treeH + buffer, zodat niks wordt afgesneden.
  let captureW = treeW + SAFE_BUFFER;
  let captureH = treeH + SAFE_BUFFER;
  try {
    const rect = clone.getBoundingClientRect();
    // scrollWidth/Height vangt ook content die buiten de box uitsteekt (shadows)
    const measuredW = Math.max(clone.scrollWidth || 0, Math.ceil(rect.width) || 0);
    const measuredH = Math.max(clone.scrollHeight || 0, Math.ceil(rect.height) || 0);
    if (measuredW > 0) captureW = Math.max(captureW, measuredW + SAFE_BUFFER);
    if (measuredH > 0) captureH = Math.max(captureH, measuredH + SAFE_BUFFER);
    // Forceer ook de clone-box groot genoeg zodat html2canvas binnen dit canvas
    // de volledige inhoud rendert (en geen bottom-crop toepast).
    clone.style.width  = captureW + 'px';
    clone.style.height = captureH + 'px';
  } catch (e) {
    // Bij meetfout: val terug op conservatieve buffer
  }

  // Render-scale voor html2canvas (1 = 96 DPI, 1.5 = 144 DPI). Hoger = scherper PDF
  // maar grotere file. Bij grote bomen krimpen we de scale om te voorkomen dat de
  // canvas te groot wordt (browsers cappen rond 16384 px en ~268 megapixels).
  const MAX_CANVAS_DIM = 14000; // veilige bovengrens per dimensie
  const MAX_CANVAS_AREA = 200_000_000; // ~200 megapixels veilig
  let RENDER_SCALE = 1.5;
  const dimScale = Math.min(MAX_CANVAS_DIM / captureW, MAX_CANVAS_DIM / captureH);
  const areaScale = Math.sqrt(MAX_CANVAS_AREA / (captureW * captureH));
  RENDER_SCALE = Math.max(0.5, Math.min(RENDER_SCALE, dimScale, areaScale));

  // Boom-afmetingen (incl. buffer) omrekenen naar mm + paginamarges erbij
  const treeWmm = captureW / MM_TO_PX;
  const treeHmm = captureH / MM_TO_PX;
  const pageWmm = treeWmm + 2 * MARGIN_MM;
  // Extra ruimte onderaan voor footer (titel/datum)
  const FOOTER_MM = 10;
  const pageHmm = treeHmm + 2 * MARGIN_MM + FOOTER_MM;

  // jsPDF heeft geen technische bovengrens voor pagina-afmetingen, maar erg grote
  // pagina's kunnen sommige viewers traag maken. Bij gigantische bomen vallen we
  // terug op multi-page tegelmodus.
  const MAX_PAGE_DIM_MM = 5000;
  if (pageWmm > MAX_PAGE_DIM_MM || pageHmm > MAX_PAGE_DIM_MM) {
    document.body.removeChild(clone);
    return downloadPDFMultiPage(treeW, treeH);
  }

  try {
    // Capture met html2canvas — gebruik volledige captureW/captureH zodat
    // shadows en laatste rij kaarten volledig in beeld blijven.
    const cardsCanvas = await html2canvas(clone, {
      scale: RENDER_SCALE,
      backgroundColor: '#f1f5f9',
      useCORS: true,
      logging: false,
      width: captureW,
      height: captureH,
    });

    // SVG-lijnen eroverheen tekenen
    await compositeSVGOnCanvas(cardsCanvas, clone, captureW, captureH, RENDER_SCALE);

    // Bepaal landscape vs portrait op basis van afmetingen
    const orientation = pageWmm >= pageHmm ? 'landscape' : 'portrait';
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: [pageWmm, pageHmm],
      compress: true,
    });

    const imgData = cardsCanvas.toDataURL('image/jpeg', 0.92);
    pdf.addImage(imgData, 'JPEG', MARGIN_MM, MARGIN_MM, treeWmm, treeHmm);

    // Footer
    pdf.setFontSize(9);
    pdf.setTextColor(100);
    const title = document.querySelector('.tree-item.active .tree-name');
    const titleText = title ? title.textContent.trim() : 'Familie Stamboom';
    const footerY = pageHmm - 4;
    pdf.text(titleText, MARGIN_MM, footerY);
    pdf.text(new Date().toLocaleDateString('nl-NL'), pageWmm - MARGIN_MM, footerY, { align: 'right' });
    pdf.text(`${Math.round(pageWmm)}×${Math.round(pageHmm)} mm`, pageWmm / 2, footerY, { align: 'center' });

    pdf.save(buildPdfFilename(titleText));
  } finally {
    document.body.removeChild(clone);
  }
}

// Bouw een veilige PDF-bestandsnaam o.b.v. stamboom-hoofd (bijv. "Stamboom Wali.pdf")
function buildPdfFilename(headName) {
  const safe = (headName || 'Familie')
    .replace(/[\\/:*?"<>|]/g, '')  // verwijder Windows-onveilige tekens
    .trim();
  // Als het al "Stamboom" of "Alle" bevat, gebruik direct, anders prefixen
  if (/^(stamboom|alle|familie)/i.test(safe)) {
    return `${safe}.pdf`;
  }
  return `Stamboom ${safe}.pdf`;
}

async function downloadPDFMultiPage(treeW, treeH) {
  const { jsPDF } = window.jspdf;
  const PAPER_W = 420, PAPER_H = 297; // A3 landscape
  const MARGIN = 10;
  const MM_TO_PX = 96 / 25.4;
  const tileScale = 0.45;

  const printW = (PAPER_W - 2 * MARGIN) * MM_TO_PX;
  const printH = (PAPER_H - 2 * MARGIN) * MM_TO_PX;
  const tileTreeW = printW / tileScale;
  const tileTreeH = printH / tileScale;

  const cols = Math.ceil(treeW / tileTreeW);
  const rows = Math.ceil(treeH / tileTreeH);

  const canvas = document.getElementById('canvas');
  const clone = prepareClone(canvas, tileScale);
  document.body.appendChild(clone);

  try {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PAPER_W, PAPER_H] });
    let firstPage = true;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!firstPage) pdf.addPage();
        firstPage = false;

        const sx = col * tileTreeW;
        const sy = row * tileTreeH;
        const tw = Math.min(tileTreeW, treeW - sx);
        const th = Math.min(tileTreeH, treeH - sy);

        const tileCanvas = await html2canvas(clone, {
          scale: 2,
          backgroundColor: '#f1f5f9',
          x: sx, y: sy,
          width: tw, height: th,
          useCORS: true, logging: false,
        });

        await compositeSVGOnCanvas(tileCanvas, clone, tw, th, 2, sx, sy);

        const imgData = tileCanvas.toDataURL('image/jpeg', 0.92);
        const imgWmm = PAPER_W - 2 * MARGIN;
        const imgHmm = (th / tw) * imgWmm;

        pdf.addImage(imgData, 'JPEG', MARGIN, MARGIN, imgWmm, Math.min(imgHmm, PAPER_H - 2 * MARGIN));

        // Paginanummer en continuatie-markers
        pdf.setFontSize(7);
        pdf.setTextColor(150);
        pdf.text(`Pagina ${row * cols + col + 1}/${rows * cols}`, MARGIN, PAPER_H - 4);
        if (col < cols - 1) pdf.text('\u2192', PAPER_W - MARGIN - 3, PAPER_H / 2);
        if (row < rows - 1) pdf.text('\u2193', PAPER_W / 2, PAPER_H - MARGIN + 3);
      }
    }

    const titleEl = document.querySelector('.tree-item.active .tree-name');
    const titleText = titleEl ? titleEl.textContent.trim() : 'Familie Stamboom';
    pdf.save(buildPdfFilename(titleText));
  } finally {
    document.body.removeChild(clone);
  }
}

function prepareClone(canvas, scale) {
  const clone = canvas.cloneNode(true);
  clone.style.transform = 'none';
  clone.style.position = 'absolute';
  clone.style.left = '-99999px';
  clone.style.top = '0';
  clone.style.background = '#f1f5f9';
  clone.style.zIndex = '-1';

  // Verwijder interactieve elementen
  clone.querySelectorAll('.card-actions, .gezin-toggle, .vertical-toggle').forEach(el => el.remove());
  clone.querySelectorAll('.duplicate-badge').forEach(el => el.remove());

  // Bij kleine schaal: vereenvoudig kaarten
  if (scale < 0.4) {
    clone.querySelectorAll('.card-years').forEach(el => el.remove());
  }

  // Versterk lijnen bij kleine schaal
  if (scale < 0.5) {
    const boost = Math.min(2.5, 1 / scale);
    clone.querySelectorAll('.child-line, .social-line').forEach(el => {
      const w = parseFloat(el.getAttribute('stroke-width') || 1.5);
      el.setAttribute('stroke-width', w * boost);
    });
    clone.querySelectorAll('.partner-line').forEach(el => {
      const w = parseFloat(el.getAttribute('stroke-width') || 2);
      el.setAttribute('stroke-width', w * boost);
    });
  }

  return clone;
}

async function compositeSVGOnCanvas(targetCanvas, clone, w, h, renderScale, offsetX, offsetY) {
  const svgEl = clone.querySelector('#svg-lines');
  if (!svgEl) return;

  // Kloon SVG en stel viewBox in
  const svgClone = svgEl.cloneNode(true);
  svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const fullW = parseFloat(clone.style.width) || w;
  const fullH = parseFloat(clone.style.height) || h;
  svgClone.setAttribute('width', fullW);
  svgClone.setAttribute('height', fullH);

  const svgData = new XMLSerializer().serializeToString(svgClone);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = svgUrl;
  });

  const ctx = targetCanvas.getContext('2d');
  const ox = (offsetX || 0) * renderScale;
  const oy = (offsetY || 0) * renderScale;
  if (ox || oy) {
    ctx.save();
    ctx.translate(-ox, -oy);
    ctx.drawImage(img, 0, 0, fullW * renderScale, fullH * renderScale);
    ctx.restore();
  } else {
    ctx.drawImage(img, 0, 0, targetCanvas.width, targetCanvas.height);
  }

  URL.revokeObjectURL(svgUrl);
}

// ============================================================
// SMART VIEW — Netwerkdiagram met familiebubbles
// ============================================================

// Kleurpaletten per nesting-depth (steeds lichter)
const DEPTH_COLORS = [
  { bg: '#141e30', border: '#1e3a5f', header: '#2e61a8' },  // depth 0: rustig oceaanblauw
  { bg: '#142320', border: '#1e4038', header: '#2d7a6a' },  // depth 1: zacht zeegroen
  { bg: '#1e1a28', border: '#3a2e50', header: '#6b5b95' },  // depth 2: gedempd lavendel
  { bg: '#221c14', border: '#3e3422', header: '#8a7245' },  // depth 3: warm zand
  { bg: '#1a2028', border: '#2e3a48', header: '#4a7a9b' },  // depth 4: mistig blauwgrijs
];

// Bouw geneste gezinsdata voor Smart View
function buildFamilyTree(headId, depth, visited) {
  if (!headId || visited.has(headId)) return null;
  visited.add(headId);

  const head = getPerson(headId);
  if (!head) return null;

  const headName = head.name;
  const partners = getPartnersOf(headId).map(getPerson).filter(p => p);
  const partnerName = partners.length > 0 ? partners[0].name : '';

  // Alle kinderen van dit gezin (via hoofd + partners)
  const childIds = new Set();
  getChildrenOf(headId).forEach(cid => childIds.add(cid));
  partners.forEach(p => getChildrenOf(p.id).forEach(cid => childIds.add(cid)));
  getSocialChildrenOf(headId).forEach(cid => childIds.add(cid));

  // Eén gemengde lijst: kinderen in geboortevolgorde
  // Elk item is { type: 'name', label } of { type: 'family', data: subtree }
  const orderedChildren = [];

  // Sorteer kinderen op geboortedatum (oudste eerst)
  const sortedChildren = [...childIds]
    .map(cid => ({ cid, person: getPerson(cid) }))
    .filter(x => x.person)
    .sort((a, b) => {
      const boA = a.person.birthOrder, boB = b.person.birthOrder;
      if (boA != null && boB != null) return boA - boB;
      if (boA != null) return -1;
      if (boB != null) return 1;
      const pa = parseBirthdate(a.person.birthdate);
      const pb = parseBirthdate(b.person.birthdate);
      if (!pa && !pb) return 0;
      if (!pa) return 1;
      if (!pb) return -1;
      if (pa.year !== pb.year) return pa.year - pb.year;
      if (pa.month && pb.month && pa.month !== pb.month) return pa.month - pb.month;
      if (pa.day && pb.day) return pa.day - pb.day;
      return 0;
    });

  sortedChildren.forEach(({ cid, person: child }) => {
    const grandchildren = getChildrenOf(cid);
    const childPartners = getPartnersOf(cid);
    const partnerChildren = childPartners.flatMap(pid => getChildrenOf(pid));
    const allGC = [...new Set([...grandchildren, ...partnerChildren])];

    if (allGC.length > 0 && !visited.has(cid)) {
      // Kind heeft eigen gezin en is nog niet bezocht → recursief geneste blok
      const subtree = buildFamilyTree(cid, depth + 1, visited);
      if (subtree) orderedChildren.push({ type: 'family', data: subtree });
    } else if (!visited.has(cid)) {
      // Kind zonder eigen kinderen → naam + eventuele partner
      const cp = childPartners.map(getPerson).filter(p => p);
      const label = cp.length > 0 ? `${child.name} &\n${cp[0].name}` : child.name;
      orderedChildren.push({ type: 'name', id: cid, label });
      visited.add(cid);
      childPartners.forEach(pid => visited.add(pid));
    } else {
      // Kind is al bezocht (via partner-pad) → toon alsnog met eigen kinderen
      const cp = childPartners.map(getPerson).filter(p => p);

      if (allGC.length > 0) {
        const gcNames = allGC
          .map(gcid => getPerson(gcid))
          .filter(p => p)
          .sort((a, b) => {
            const boA = a.birthOrder, boB = b.birthOrder;
            if (boA != null && boB != null) return boA - boB;
            if (boA != null) return -1;
            if (boB != null) return 1;
            const pa = parseBirthdate(a.birthdate);
            const pb = parseBirthdate(b.birthdate);
            if (!pa && !pb) return 0;
            if (!pa) return 1;
            if (!pb) return -1;
            if (pa.year !== pb.year) return pa.year - pb.year;
            if (pa.month && pb.month && pa.month !== pb.month) return pa.month - pb.month;
            if (pa.day && pb.day) return pa.day - pb.day;
            return 0;
          })
          .map(p => p.name);
        const subtree = {
          headId: cid,
          headName: child.name,
          partnerName: cp.length > 0 ? cp[0].name : '',
          depth: depth + 1,
          orderedChildren: gcNames.map(n => ({ type: 'name', id: '', label: n })),
          color: DEPTH_COLORS[(depth + 1) % DEPTH_COLORS.length]
        };
        orderedChildren.push({ type: 'family', data: subtree });
      } else {
        const label = cp.length > 0 ? `${child.name} &\n${cp[0].name}` : child.name;
        orderedChildren.push({ type: 'name', id: cid, label });
      }
    }
  });

  return {
    headId, headName, partnerName, depth,
    orderedChildren,
    color: DEPTH_COLORS[depth % DEPTH_COLORS.length]
  };
}

function buildSmartViewData() {
  const stambomen = computeStambomen();

  // Vind echte roots: personen zonder ouders
  // Sorteer: grootste bomen eerst zodat hun kinderen niet als aparte roots worden gepakt
  const rootCandidates = stambomen
    .filter(s => s.isRoot && getParentsOf(s.headId).length === 0)
    .sort((a, b) => b.count - a.count);

  // Voeg daarna roots toe wiens hoofd wel ouders heeft maar wiens ouders NIET in een andere stamboom staan
  const otherRoots = stambomen
    .filter(s => s.isRoot && getParentsOf(s.headId).length > 0)
    .sort((a, b) => b.count - a.count);

  const allRoots = [...rootCandidates, ...otherRoots];

  const visited = new Set();
  const trees = [];

  allRoots.forEach(s => {
    if (visited.has(s.headId)) return;
    // Controleer of hoofd of partner al bezocht is (onderdeel van een andere boom)
    const partners = getPartnersOf(s.headId);
    if (partners.some(pid => visited.has(pid))) return;

    const children = getChildrenOf(s.headId);
    const partnerChildren = partners.flatMap(pid => getChildrenOf(pid));
    if (children.length === 0 && partnerChildren.length === 0) return;

    const tree = buildFamilyTree(s.headId, 0, visited);
    if (tree) trees.push(tree);
  });

  return trees;
}

function renderSmartView() {
  const trees = buildSmartViewData();
  if (trees.length === 0) return;

  const canvas = document.getElementById('canvas');
  const container = document.getElementById('cards-container');
  const svg = document.getElementById('svg-lines');

  container.innerHTML = '';
  svg.innerHTML = '';
  svg.setAttribute('width', 0);
  svg.setAttribute('height', 0);

  // Container voor geneste blokken (geen absolute positionering)
  const smartContainer = document.createElement('div');
  smartContainer.className = 'smart-trees-container';

  // Recursief render functie
  function renderFamilyBlock(familyData) {
    const block = document.createElement('div');
    block.className = 'smart-family-block';
    block.style.borderColor = familyData.color.border;
    block.style.background = familyData.color.bg;

    // Header: hoofd & partner
    const header = document.createElement('div');
    header.className = 'smart-family-header';
    header.style.background = familyData.color.header;
    if (familyData.partnerName) {
      header.innerHTML = `${familyData.headName} &amp;<br>${familyData.partnerName}`;
    } else {
      header.textContent = familyData.headName;
    }
    header.title = familyData.partnerName
      ? `${familyData.headName} & ${familyData.partnerName}`
      : familyData.headName;

    // Klik op header → navigeer naar klassieke view
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      activeTreeId = familyData.headId;
      smartViewMode = false;
      smartViewOrigin = true;
      try { sessionStorage.setItem(SMART_KEY, 'false'); } catch(e2) {}
      render();
      setTimeout(zoomFit, 100);
    });
    header.style.cursor = 'pointer';
    header.title = 'Klik voor klassieke weergave';

    block.appendChild(header);

    // Kinderen in volgorde: mix van namen en sub-gezinnen
    if (familyData.orderedChildren && familyData.orderedChildren.length > 0) {
      familyData.orderedChildren.forEach(item => {
        if (item.type === 'name') {
          const nameEl = document.createElement('div');
          nameEl.className = 'smart-family-child-name';
          if (item.label.includes('\n')) {
            nameEl.innerHTML = item.label.replace(/&/g, '&amp;').replace(/\n/g, '<br>');
          } else {
            nameEl.textContent = item.label;
          }
          block.appendChild(nameEl);
        } else if (item.type === 'family') {
          block.appendChild(renderFamilyBlock(item.data));
        }
      });
    }

    return block;
  }

  // Render alle root-bomen naast elkaar
  trees.forEach(tree => {
    smartContainer.appendChild(renderFamilyBlock(tree));
  });

  // Gebruik container in flow-layout (geen absolute pos)
  canvas.style.width = 'auto';
  canvas.style.height = 'auto';
  container.appendChild(smartContainer);

  // Verberg collapse toggles en tree labels
  document.querySelectorAll('.collapse-toggle, .tree-label').forEach(el => el.remove());

  // Toon/verberg back-knop
  const backBtn = document.getElementById('btn-back-overview');
  if (backBtn) backBtn.classList.add('hidden');

  // Update smart view toggle knop
  const smartBtn = document.getElementById('btn-smart-view');
  if (smartBtn) smartBtn.classList.add('active');
}

// ============================================================
// INIT
// ============================================================
(function init() {
  if (!loadState()) {
    state = JSON.parse(JSON.stringify(START_DATA));
    saveState();
  }

  // Pre-load snapshots voor sub-tree overlay (Mahmadgul/Sayedahmed gebruiken approved sub-trees)
  // snapshots_v470.json bevat ALLE 51 goedgekeurde stambomen
  fetch('snapshots_v470.json?v=' + APP_VERSION)
    .then(r => r.json())
    .then(snaps => {
      window._loadedSnapshots = snaps;
      // Re-render zodra snapshots geladen zijn (anders heeft eerste render geen overlay)
      if (typeof render === 'function') render();
    })
    .catch(() => {
      // Fallback naar oude snapshots als v470 niet bestaat
      fetch('snapshots_v376.json')
        .then(r => r.json())
        .then(snaps => { window._loadedSnapshots = snaps; if (typeof render === 'function') render(); })
        .catch(() => { window._loadedSnapshots = {}; });
    });

  // Read-only modus: verberg alle beheer-elementen
  if (READ_ONLY) {
    const hide = ['btn-add-person','btn-add-relation','btn-export','btn-import','btn-reset','btn-new-family'];
    hide.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    // CSS klasse op body zodat kaart-knoppen ook verborgen zijn
    document.body.classList.add('readonly');
  }

  // Smart View toggle knop
  const smartBtn = document.getElementById('btn-smart-view');
  if (smartBtn) {
    smartBtn.addEventListener('click', () => {
      smartViewMode = !smartViewMode;
      try { sessionStorage.setItem(SMART_KEY, String(smartViewMode)); } catch(e) {}
      if (smartViewMode) {
        activeTreeId = null;
        smartViewOrigin = false;
      } else {
        smartViewOrigin = false;
      }
      render();
      setTimeout(zoomFit, 100);
    });
  }

  // Naar Top knop
  const goTopBtn = document.getElementById('btn-go-top');
  if (goTopBtn) {
    goTopBtn.addEventListener('click', () => {
      scrollToStamhoofd(activeTreeId || 'all');
    });
  }

  // Terug naar Smart View overzicht
  const backBtn = document.getElementById('btn-back-overview');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      activeTreeId = null;
      smartViewMode = true;
      smartViewOrigin = false;
      try { sessionStorage.setItem(SMART_KEY, 'true'); } catch(e) {}
      render();
      setTimeout(zoomFit, 100);
    });
  }

  // Gouden pad: klik op leeg canvas => verdwijnt
  const canvas = document.getElementById('canvas');
  if (canvas) {
    canvas.addEventListener('click', (e) => {
      if (!goldenPath) return;
      if (!e.target.closest('.card') && !e.target.closest('.gezin-toggle')) {
        goldenPath = null;
        render();
      }
    });
  }

  render();
  setTimeout(() => {
    zoomFit();
    scrollToStamhoofd(activeTreeId || 'all');
  }, 150);
})();
