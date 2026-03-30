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
  const SESSION_KEY = 'fb_sess';
  const STORE_KEY   = 'fb_pin_v1';

  // Versleutel PIN via PBKDF2-SHA256 (100k iteraties)
  async function deriveKey(pin, salt) {
    const enc     = new TextEncoder();
    const keyMat  = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits    = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, keyMat, 256);
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
      const { hash, salt } = await hashPin('1993');
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

  document.getElementById('pin-keypad').addEventListener('click', e => {
    const btn = e.target.closest('.pin-key');
    if (!btn) return;
    const val = btn.dataset.val;
    if (val === 'clear') {
      current = current.slice(0, -1);
    } else if (val === 'ok') {
      if (current.length === 4) trySubmit();
    } else if (current.length < 4) {
      current += val;
      if (current.length === 4) setTimeout(trySubmit, 120);
    }
    updateDots();
  });

  // Ook toetsenbord-invoer
  document.addEventListener('keydown', e => {
    if (document.getElementById('pin-screen').style.display === 'none') return;
    if (/^[0-9]$/.test(e.key) && current.length < 4) {
      current += e.key;
      updateDots();
      if (current.length === 4) setTimeout(trySubmit, 120);
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
let currentPhotoData = null; // base64 of huidige foto in modal

// Read-only modus: ?view=1 in de URL schakelt beheer uit
const READ_ONLY = new URLSearchParams(window.location.search).get('view') === '1';

// ============================================================
// START DATA — Familie Faizi
// ============================================================
// __START_DATA_BEGIN__
const START_DATA = {
  _version: 20260330002,
  persons: [
    // === SAYEDI FAMILIE ===
    { id: 's01', name: 'Wali Mohammad Sayedi',  gender: 'm', birthdate: '01-07-1959', deathdate: '', family: 'Sayedi',    notes: '', deceased: false },
    { id: 's02', name: 'Malika Durrani',         gender: 'f', birthdate: '01-07-1962', deathdate: '', family: 'Durrani',   notes: '', deceased: false },
    { id: 's03', name: 'Ajab Khan Sayedi',       gender: 'm', birthdate: '10-12-1988', deathdate: '', family: 'Sayedi',    notes: '', deceased: false },
    { id: 's04', name: 'Sanga Hassanzai',        gender: 'f', birthdate: '27-06-1990', deathdate: '', family: 'Hassanzai', notes: '', deceased: false },
    { id: 's05', name: 'Ajmal Khan Sayedi',      gender: 'm', birthdate: '09-11-1989', deathdate: '', family: 'Sayedi',    notes: '', deceased: false },
    { id: 's06', name: 'Helai Sayedi',           gender: 'f', birthdate: '03-10-1991', deathdate: '', family: 'Sayedi',    notes: '', deceased: false },
    { id: 's07', name: 'Gaffar Khan Rashid',     gender: 'm', birthdate: '02-02-1984', deathdate: '', family: 'Rashid',    notes: '', deceased: false },
    { id: 's08', name: 'Benjamin Rahman Rashid', gender: 'm', birthdate: '25-06-2019', deathdate: '', family: 'Rashid',    notes: '', deceased: false },
    { id: 's09', name: 'Fereshta Sayedi',        gender: 'f', birthdate: '27-08-1992', deathdate: '', family: 'Sayedi',    notes: '', deceased: false },
    { id: 's10', name: 'Jawed Sabur Alokozay',   gender: 'm', birthdate: '15-03-1988', deathdate: '', family: 'Alokozay',  notes: '', deceased: false },
    { id: 's11', name: 'Hakim Khan Sayedi',      gender: 'm', birthdate: '15-07-1993', deathdate: '', family: 'Sayedi',    notes: '', deceased: false },
    { id: 's12', name: 'Halima Sayedi',          gender: 'f', birthdate: '',           deathdate: '', family: 'Sayedi',    notes: '', deceased: false },
    { id: 's13', name: 'Saleh Mohammad Raoefi',  gender: 'm', birthdate: '',           deathdate: '', family: 'Raoefi',    notes: '', deceased: false },
    { id: 's14', name: 'Amira Nora Raoefi',      gender: 'f', birthdate: '20-07-2022', deathdate: '', family: 'Raoefi',    notes: '', deceased: false },
    { id: 's15', name: 'Lina Maryam Raoefi',     gender: 'f', birthdate: '08-11-2023', deathdate: '', family: 'Raoefi',    notes: '', deceased: false },

    // === FAIZI FAMILIE ===
    { id: 'f01', name: 'Khanaga Faizi',      gender: 'm', birthdate: '05-01-1965', deathdate: '', family: 'Faizi',  notes: '', deceased: false },
    { id: 'f02', name: 'Benazier Rashid',    gender: 'f', birthdate: '03-12-1967', deathdate: '', family: 'Rashid', notes: '', deceased: false },
    { id: 'f03', name: 'Hemat Faizi',        gender: 'm', birthdate: '02-06-1996', deathdate: '', family: 'Faizi',  notes: '', deceased: false },
    { id: 'f04', name: 'Husna Amiri',        gender: 'f', birthdate: '24-11-2001', deathdate: '', family: 'Amiri',  notes: '', deceased: false },
    { id: 'f05', name: 'Amina Faizi',        gender: 'f', birthdate: '17-01-2024', deathdate: '', family: 'Faizi',  notes: '', deceased: false },
    { id: 'f06', name: 'Nilab Faizi',        gender: 'f', birthdate: '21-03-1997', deathdate: '', family: 'Faizi',  notes: '', deceased: false },
    { id: 'f07', name: 'Emamuddin Salehi',   gender: 'm', birthdate: '05-09-1989', deathdate: '', family: 'Salehi', notes: '', deceased: false },
    { id: 'f08', name: 'Muhammad Salehi',    gender: 'm', birthdate: '10-05-2019', deathdate: '', family: 'Salehi', notes: '', deceased: false },
    { id: 'f09', name: 'Ahmad Salehi',       gender: 'm', birthdate: '20-06-2020', deathdate: '', family: 'Salehi', notes: '', deceased: false },
    { id: 'f10', name: 'Alia Faizi',         gender: 'f', birthdate: '28-09-1998', deathdate: '', family: 'Faizi',  notes: '', deceased: false },
    { id: 'f11', name: 'Rahimgul Salehi',    gender: 'm', birthdate: '',           deathdate: '', family: 'Salehi', notes: '', deceased: false },
    { id: 'f12', name: 'Zainab Salehi',      gender: 'f', birthdate: '',           deathdate: '', family: 'Salehi', notes: '', deceased: false },
    { id: 'f13', name: 'Meraj Faizi',        gender: 'm', birthdate: '08-04-2003', deathdate: '', family: 'Faizi',  notes: '', deceased: false },
    { id: 'f14', name: 'Mona Saidi',         gender: 'f', birthdate: '',           deathdate: '', family: 'Saidi',  notes: '', deceased: false },
    { id: 'f15', name: 'Erfan Faizi',        gender: 'm', birthdate: '04-01-2006', deathdate: '', family: 'Faizi',  notes: '', deceased: false },
    { id: 'f16', name: 'Alina Faizi',        gender: 'f', birthdate: '25-02-2008', deathdate: '', family: 'Faizi',  notes: '', deceased: false },
    { id: 'f17', name: 'Hamza Faizi',        gender: 'm', birthdate: '18-12-2009', deathdate: '', family: 'Faizi',  notes: '', deceased: false },

    // === OVERIGE ===
    { id: 'pmncyghyo65ha',  name: 'Mirwais Khan Wazir Sayedi',   gender: 'm', birthdate: '08-11-2025', deathdate: '', family: 'Sayedi',  notes: '', deceased: false },
    { id: 'pmnczpeoyc4hd',  name: 'Arman Haydar Khan Alokozay',  gender: 'm', birthdate: '10-03-2025', deathdate: '', family: 'Sayedi',  notes: '', deceased: false },
    { id: 'r01',            name: 'Abed Rahmani',                gender: 'm', birthdate: '01-01-1990', deathdate: '', family: 'Rahmani', notes: '', deceased: false },
    { id: 'r02',            name: 'Palwasha Faizi',              gender: 'f', birthdate: '03-06-1991', deathdate: '', family: 'Faizi',   notes: '', deceased: false },
    { id: 'r03',            name: 'Yaqub Rahmani',               gender: 'm', birthdate: '13-11-2019', deathdate: '', family: 'Rahmani', notes: '', deceased: false },
    { id: 'r04',            name: 'Muzammil Rahmani',            gender: 'm', birthdate: '04-12-2020', deathdate: '', family: 'Rahmani', notes: '', deceased: false },
    { id: 'pmnd4qyb1ywgb',  name: 'Asiya Faizi',                 gender: 'f', birthdate: '16-09-2025', deathdate: '', family: 'Faizi',   notes: '', deceased: false },
    { id: 'pmnd50hsephva',  name: 'Noman Rashid',                gender: 'm', birthdate: '',           deathdate: '', family: 'Faizi',   notes: '', deceased: false },
  ],
  relationships: [
    // SAYEDI — partners
    { type: 'partner',      person1Id: 's01', person2Id: 's02' },
    { type: 'partner',      person1Id: 's03', person2Id: 's04' },
    { type: 'partner',      person1Id: 's06', person2Id: 's07' },
    { type: 'partner',      person1Id: 's09', person2Id: 's10' },
    { type: 'partner',      person1Id: 's12', person2Id: 's13' },
    // SAYEDI — ouder-kind
    { type: 'parent-child', parentId: 's01', childId: 's03' },
    { type: 'parent-child', parentId: 's02', childId: 's03' },
    { type: 'parent-child', parentId: 's01', childId: 's05' },
    { type: 'parent-child', parentId: 's02', childId: 's05' },
    { type: 'parent-child', parentId: 's01', childId: 's06' },
    { type: 'parent-child', parentId: 's02', childId: 's06' },
    { type: 'parent-child', parentId: 's01', childId: 's09' },
    { type: 'parent-child', parentId: 's02', childId: 's09' },
    { type: 'parent-child', parentId: 's01', childId: 's11' },
    { type: 'parent-child', parentId: 's02', childId: 's11' },
    { type: 'parent-child', parentId: 's01', childId: 's12' },
    { type: 'parent-child', parentId: 's02', childId: 's12' },
    { type: 'parent-child', parentId: 's06', childId: 's08' },
    { type: 'parent-child', parentId: 's07', childId: 's08' },
    { type: 'parent-child', parentId: 's12', childId: 's14' },
    { type: 'parent-child', parentId: 's13', childId: 's14' },
    { type: 'parent-child', parentId: 's12', childId: 's15' },
    { type: 'parent-child', parentId: 's13', childId: 's15' },
    { type: 'parent-child', parentId: 's03', childId: 'pmncyghyo65ha' },
    { type: 'parent-child', parentId: 's04', childId: 'pmncyghyo65ha' },
    { type: 'parent-child', parentId: 's09', childId: 'pmnczpeoyc4hd' },
    { type: 'parent-child', parentId: 's10', childId: 'pmnczpeoyc4hd' },

    // FAIZI — partners
    { type: 'partner',      person1Id: 'f01', person2Id: 'f02' },
    { type: 'partner',      person1Id: 'f03', person2Id: 'f04' },
    { type: 'partner',      person1Id: 'f06', person2Id: 'f07' },
    { type: 'partner',      person1Id: 'f10', person2Id: 'f11' },
    { type: 'partner',      person1Id: 'f13', person2Id: 'f14' },
    { type: 'partner',      person1Id: 'f16', person2Id: 'pmnd50hsephva' },
    // FAIZI — ouder-kind
    { type: 'parent-child', parentId: 'f01', childId: 'f03' },
    { type: 'parent-child', parentId: 'f02', childId: 'f03' },
    { type: 'parent-child', parentId: 'f01', childId: 'f06' },
    { type: 'parent-child', parentId: 'f02', childId: 'f06' },
    { type: 'parent-child', parentId: 'f01', childId: 'f10' },
    { type: 'parent-child', parentId: 'f02', childId: 'f10' },
    { type: 'parent-child', parentId: 'f01', childId: 'f13' },
    { type: 'parent-child', parentId: 'f02', childId: 'f13' },
    { type: 'parent-child', parentId: 'f01', childId: 'f15' },
    { type: 'parent-child', parentId: 'f02', childId: 'f15' },
    { type: 'parent-child', parentId: 'f01', childId: 'f16' },
    { type: 'parent-child', parentId: 'f02', childId: 'f16' },
    { type: 'parent-child', parentId: 'f01', childId: 'f17' },
    { type: 'parent-child', parentId: 'f02', childId: 'f17' },
    { type: 'parent-child', parentId: 'f03', childId: 'f05' },
    { type: 'parent-child', parentId: 'f04', childId: 'f05' },
    { type: 'parent-child', parentId: 'f06', childId: 'f08' },
    { type: 'parent-child', parentId: 'f07', childId: 'f08' },
    { type: 'parent-child', parentId: 'f06', childId: 'f09' },
    { type: 'parent-child', parentId: 'f07', childId: 'f09' },
    { type: 'parent-child', parentId: 'f10', childId: 'f12' },
    { type: 'parent-child', parentId: 'f11', childId: 'f12' },
    { type: 'parent-child', parentId: 'f03', childId: 'pmnd4qyb1ywgb' },
    { type: 'parent-child', parentId: 'f04', childId: 'pmnd4qyb1ywgb' },

    // RAHMANI
    { type: 'partner',      person1Id: 'r01', person2Id: 'r02' },
    { type: 'parent-child', parentId: 'r01', childId: 'r03' },
    { type: 'parent-child', parentId: 'r02', childId: 'r03' },
    { type: 'parent-child', parentId: 'r01', childId: 'r04' },
    { type: 'parent-child', parentId: 'r02', childId: 'r04' },
  ]
};
// __START_DATA_END__

// ============================================================
// STORAGE
// ============================================================
const STORAGE_KEY = 'familieboom_v11';

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
      // Altijd lokale data gebruiken als die bestaat — gebruikerswijzigingen gaan nooit verloren
      state = parsed;
      return true;
    } catch (e) {}
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

function uid() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ============================================================
// STAMBOOM HELPERS
// ============================================================

// Geeft alle personen terug die bij de stamboom van headId horen
// (headId + partner(s) + alle nakomelingen + hun partners)
function getStamboomPersons(headId) {
  const result = new Set();
  function walk(id) {
    if (result.has(id)) return;
    result.add(id);
    getPartnersOf(id).forEach(pid => result.add(pid));
    getChildrenOf(id).forEach(cid => walk(cid));
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
// LAYOUT ALGORITHM
// ============================================================
function computeLayout() {
  const activeIds = getActivePersonIds();
  const persons   = state.persons.filter(p => activeIds.has(p.id));
  if (persons.length === 0) return {};

  // --- Build adjacency maps ---
  const childrenOf  = {};
  const parentsOf   = {};
  const partnersOf  = {};

  persons.forEach(p => {
    childrenOf[p.id]  = [];
    parentsOf[p.id]   = [];
    partnersOf[p.id]  = [];
  });

  state.relationships.forEach(r => {
    if (r.type === 'parent-child') {
      if (childrenOf[r.parentId]) childrenOf[r.parentId].push(r.childId);
      if (parentsOf[r.childId])   parentsOf[r.childId].push(r.parentId);
    } else if (r.type === 'partner') {
      if (partnersOf[r.person1Id]) partnersOf[r.person1Id].push(r.person2Id);
      if (partnersOf[r.person2Id]) partnersOf[r.person2Id].push(r.person1Id);
    }
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
  for (let pass = 0; pass < 6; pass++) {
    state.relationships.forEach(r => {
      if (r.type === 'partner') {
        const g = Math.max(genOf[r.person1Id] || 0, genOf[r.person2Id] || 0);
        genOf[r.person1Id] = g;
        genOf[r.person2Id] = g;
      }
    });
  }

  // --- Group by generation ---
  const byGen = {};
  persons.forEach(p => {
    const g = genOf[p.id];
    if (!byGen[g]) byGen[g] = [];
    byGen[g].push(p.id);
  });
  const gens = Object.keys(byGen).map(Number).sort((a, b) => a - b);

  const pos = {};

  // Helper: couple center x (midpoint between two partners, or just the node center)
  const coupleCenterX = id => {
    const myPartners = (partnersOf[id] || []).filter(pid => genOf[pid] === genOf[id] && pos[pid]);
    if (!myPartners.length) return pos[id] ? pos[id].x + NODE_W / 2 : 0;
    const xs = [pos[id].x, ...myPartners.map(pid => pos[pid].x)];
    return (Math.min(...xs) + Math.max(...xs) + NODE_W) / 2;
  };

  // Helper: push all nodes in a generation that are >= startIdx to the right if needed
  const fixOverlaps = gen => {
    const sorted = (byGen[gen] || []).filter(id => pos[id]).sort((a, b) => pos[a].x - pos[b].x);
    for (let i = 1; i < sorted.length; i++) {
      const minX = pos[sorted[i - 1]].x + NODE_W + H_GAP;
      if (pos[sorted[i]].x < minX) {
        const shift = minX - pos[sorted[i]].x;
        for (let j = i; j < sorted.length; j++) pos[sorted[j]].x += shift;
      }
    }
  };

  // --- Place gen 0 (roots + their partners) ---
  {
    const gen0 = byGen[0] || [];
    const seen = new Set();
    const ordered = [];
    // roots first, then their in-law partners directly after
    gen0.filter(id => (parentsOf[id] || []).length === 0).forEach(id => {
      if (seen.has(id)) return;
      seen.add(id); ordered.push(id);
      (partnersOf[id] || []).filter(pid => gen0.includes(pid) && !seen.has(pid))
        .forEach(pid => { seen.add(pid); ordered.push(pid); });
    });
    gen0.forEach(id => {
      if (seen.has(id)) return;
      seen.add(id); ordered.push(id);
    });
    ordered.forEach((id, i) => {
      pos[id] = { x: PADDING + i * (NODE_W + H_GAP), y: PADDING };
    });
  }

  // --- Top-down: for each subsequent generation, place children under parents ---
  gens.filter(g => g > 0).forEach(gen => {
    const yPos = PADDING + gen * (NODE_H + V_GAP);
    const genIds = byGen[gen] || [];

    // Separate family members (have parents) from in-laws (no parents at this gen)
    const withParents = genIds.filter(id => (parentsOf[id] || []).filter(pid => pos[pid]).length > 0);
    const inlaws     = genIds.filter(id => (parentsOf[id] || []).filter(pid => pos[pid]).length === 0);

    // Group children by their parent set (siblings share the same group)
    const groups = {}; // key → { parentIds, children[] }
    withParents.forEach(id => {
      const ps = (parentsOf[id] || []).filter(pid => pos[pid]).sort();
      const key = ps.join(',');
      if (!groups[key]) groups[key] = { parentIds: ps, children: [] };
      groups[key].children.push(id);
    });

    // Sorteer kinderen binnen elke groep: oud → jong (links → rechts)
    Object.values(groups).forEach(group => {
      group.children.sort((a, b) => {
        const pa = parseBirthdate(getPerson(a)?.birthdate);
        const pb = parseBirthdate(getPerson(b)?.birthdate);
        if (!pa && !pb) return 0;
        if (!pa) return 1;  // onbekend → rechts
        if (!pb) return -1;
        if (pa.year !== pb.year) return pa.year - pb.year;
        if (pa.month && pb.month && pa.month !== pb.month) return pa.month - pb.month;
        if (pa.day && pb.day) return pa.day - pb.day;
        return 0;
      });
    });

    // Sort groups by the x-center of their parents
    const sortedGroups = Object.values(groups).sort((a, b) => {
      const cx = g => {
        const xs = g.parentIds.map(pid => pos[pid].x + NODE_W / 2);
        return (Math.min(...xs) + Math.max(...xs)) / 2;
      };
      return cx(a) - cx(b);
    });

    // Place each group centered under parents, packing left-to-right
    // In-laws are inserted INLINE directly after their partner sibling
    const placedInlaws = new Set();
    let cursorX = PADDING;
    sortedGroups.forEach(group => {
      const parentXs = group.parentIds.map(pid => pos[pid].x + NODE_W / 2);
      const parentCenter = (Math.min(...parentXs) + Math.max(...parentXs)) / 2;

      // Build expanded order: each child followed by its in-law partner (if any)
      const expanded = [];
      group.children.forEach(cid => {
        expanded.push(cid);
        (partnersOf[cid] || []).forEach(pid => {
          if (inlaws.includes(pid) && !placedInlaws.has(pid)) {
            expanded.push(pid);
            placedInlaws.add(pid);
          }
        });
      });

      const totalW = expanded.length * NODE_W + (expanded.length - 1) * H_GAP;
      let startX = parentCenter - totalW / 2;
      if (startX < cursorX) startX = cursorX;

      expanded.forEach((id, i) => {
        pos[id] = { x: startX + i * (NODE_W + H_GAP), y: yPos };
      });
      cursorX = startX + totalW + H_GAP;
    });

    // Place remaining in-laws (not yet placed inline) after their partner
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

  // --- Bottom-up: shift parent couples to center over their children ---
  // One clean pass per gen, bottom to top
  [...gens].reverse().forEach(gen => {
    const processed = new Set();
    (byGen[gen] || []).forEach(id => {
      if (processed.has(id) || !pos[id]) return;
      const myPartners = (partnersOf[id] || []).filter(pid => genOf[pid] === gen && pos[pid]);
      const unit = [id, ...myPartners];
      unit.forEach(pid => processed.add(pid));

      const allChildren = new Set();
      unit.forEach(pid => (childrenOf[pid] || []).filter(cid => pos[cid]).forEach(cid => allChildren.add(cid)));
      if (!allChildren.size) return;

      const childXs = [...allChildren].map(cid => pos[cid].x + NODE_W / 2);
      const childCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2;
      const unitXs = unit.map(pid => pos[pid].x);
      const unitCenter = (Math.min(...unitXs) + Math.max(...unitXs) + NODE_W) / 2;
      const shift = childCenter - unitCenter;
      if (Math.abs(shift) > 1) unit.forEach(pid => { pos[pid].x += shift; });
    });
    fixOverlaps(gen);
  });

  // Normalize so minimum is at PADDING
  const allX = Object.values(pos).map(p => p.x);
  const minX = Math.min(...allX);
  if (minX < PADDING) {
    const shift = PADDING - minX;
    Object.values(pos).forEach(p => { p.x += shift; });
  }

  return pos;
}

// ============================================================
// SVG LINE RENDERING
// ============================================================
function renderLines(pos) {
  const svg = document.getElementById('svg-lines');
  const parts = [];

  const cx  = id => (pos[id]?.x || 0) + NODE_W / 2;
  const midY = id => (pos[id]?.y || 0) + NODE_H / 2;
  const botY = id => (pos[id]?.y || 0) + NODE_H;
  const topY = id => pos[id]?.y || 0;

  // --- Partner lines ---
  const drawnPartners = new Set();
  state.relationships.forEach(r => {
    if (r.type !== 'partner') return;
    const key = [r.person1Id, r.person2Id].sort().join('|');
    if (drawnPartners.has(key)) return;
    drawnPartners.add(key);
    if (!pos[r.person1Id] || !pos[r.person2Id]) return;

    const leftId  = pos[r.person1Id].x <= pos[r.person2Id].x ? r.person1Id : r.person2Id;
    const rightId = leftId === r.person1Id ? r.person2Id : r.person1Id;
    const y = midY(leftId);
    const x1 = pos[leftId].x + NODE_W;
    const x2 = pos[rightId].x;
    if (x2 > x1) {
      parts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="partner-line"/>`);
    }
  });

  // --- Parent-child lines ---
  // Group children by their canonical parent set key
  const familyGroups = new Map();
  state.relationships.forEach(r => {
    if (r.type !== 'parent-child') return;
    const allParentsOfChild = state.relationships
      .filter(rel => rel.type === 'parent-child' && rel.childId === r.childId)
      .map(rel => rel.parentId)
      .sort();
    const key = allParentsOfChild.join(',');

    if (!familyGroups.has(key)) {
      familyGroups.set(key, { parents: allParentsOfChild, children: new Set() });
    }
    familyGroups.get(key).children.add(r.childId);
  });

  familyGroups.forEach(({ parents, children }) => {
    const validParents  = parents.filter(pid => pos[pid]);
    const validChildren = [...children].filter(cid => pos[cid]);
    if (!validParents.length || !validChildren.length) return;

    // Connection point: center of parents, bottom of lowest parent
    const parentCXs = validParents.map(pid => cx(pid));
    const dropX = parentCXs.reduce((s, x) => s + x, 0) / parentCXs.length;
    const dropY = Math.max(...validParents.map(pid => botY(pid)));

    const childTopY = Math.min(...validChildren.map(cid => topY(cid)));
    const midDropY  = dropY + (childTopY - dropY) * 0.45;

    // Vertical from parent bottom to midpoint
    parts.push(`<line x1="${dropX}" y1="${dropY}" x2="${dropX}" y2="${midDropY}" class="child-line"/>`);

    // Sort children by x
    validChildren.sort((a, b) => cx(a) - cx(b));

    if (validChildren.length === 1) {
      const cid = validChildren[0];
      parts.push(`<line x1="${dropX}" y1="${midDropY}" x2="${cx(cid)}" y2="${midDropY}" class="child-line"/>`);
      parts.push(`<line x1="${cx(cid)}" y1="${midDropY}" x2="${cx(cid)}" y2="${topY(cid)}" class="child-line"/>`);
    } else {
      const leftX  = cx(validChildren[0]);
      const rightX = cx(validChildren[validChildren.length - 1]);
      parts.push(`<line x1="${leftX}" y1="${midDropY}" x2="${rightX}" y2="${midDropY}" class="child-line"/>`);
      validChildren.forEach(cid => {
        parts.push(`<line x1="${cx(cid)}" y1="${midDropY}" x2="${cx(cid)}" y2="${topY(cid)}" class="child-line"/>`);
      });
    }
  });

  // Size the SVG
  if (Object.keys(pos).length) {
    const maxX = Math.max(...Object.values(pos).map(p => p.x + NODE_W)) + PADDING;
    const maxY = Math.max(...Object.values(pos).map(p => p.y + NODE_H)) + PADDING;
    svg.style.width  = maxX + 'px';
    svg.style.height = maxY + 'px';
    svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
  }

  svg.innerHTML = parts.join('\n');
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
  const now  = new Date();
  let nextYear = now.getFullYear();
  if (d.month && d.day) {
    const next = new Date(now.getFullYear(), d.month - 1, d.day);
    if (next < now) nextYear = now.getFullYear() + 1;
  }
  return nextYear - d.year;
}

function renderCards(pos) {
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
    div.dataset.id = person.id;
    div.style.left = p.x + 'px';
    div.style.top  = p.y + 'px';
    const avatarHtml = person.photo
      ? `<div class="card-avatar" style="background:none;padding:0;overflow:hidden"><img src="${person.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`
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
      <div class="card-actions">
        <button class="btn-card-edit"   title="Bewerken">✏</button>
        <button class="btn-card-delete" title="Verwijderen">✕</button>
      </div>`;

    div.querySelector('.btn-card-edit').addEventListener('click', e => {
      e.stopPropagation(); openEditModal(person.id);
    });
    div.querySelector('.btn-card-delete').addEventListener('click', e => {
      e.stopPropagation(); confirmDeletePerson(person.id);
    });
    div.addEventListener('click', () => openDetailModal(person.id));

    container.appendChild(div);
  });
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
  const stambomen = computeStambomen();
  const filteredTrees = stambomen.filter(s =>
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
      activeTreeId = head === 'all' ? null : head;
      render();
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
            <div class="bd-meta">${label} · wordt ${age}</div>
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
    const yr     = p.birthdate ? p.birthdate.split('-')[0] : '';
    return `<div class="person-item" data-id="${p.id}">
      <div class="avatar-sm ${uClass}">${initials(p.name)}</div>
      <div>
        <div class="item-name">${escHtml(p.name)}</div>
        ${yr ? `<div class="item-year">${yr}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.person-item').forEach(el => {
    el.addEventListener('click', () => scrollToCard(el.dataset.id));
  });
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
// FULL RENDER
// ============================================================
function render() {
  lastPositions = computeLayout();
  renderLines(lastPositions);
  renderCards(lastPositions);
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

// ============================================================
// POPULATE SELECTS IN MODALS
// ============================================================
function populatePersonSelects() {
  const sorted = [...state.persons].sort((a, b) => a.name.localeCompare(b.name));
  const opts   = sorted.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
  ['sel-parent', 'sel-child', 'sel-p1', 'sel-p2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
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
  currentEditId = null;
  document.getElementById('modal-person-title').textContent = 'Persoon toevoegen';
  document.getElementById('btn-person-submit').textContent  = 'Toevoegen';
  document.getElementById('form-person').reset();
  document.getElementById('chk-deceased').checked = false;
  setPhotoPreview(null);
  document.getElementById('modal-person').classList.remove('hidden');
}

function openEditModal(id) {
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
  document.getElementById('chk-deceased').checked = !!person.deceased;
  setPhotoPreview(person.photo || null);
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
    notes:     form.notes.value.trim()
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
        if (!state.relationships.some(r =>
          r.type === 'parent-child' && r.parentId === pid && r.childId === personId
        )) state.relationships.push({ type: 'parent-child', parentId: pid, childId: personId });

      } else if (type === 'parent-of') {
        if (!state.relationships.some(r =>
          r.type === 'parent-child' && r.parentId === personId && r.childId === pid
        )) state.relationships.push({ type: 'parent-child', parentId: personId, childId: pid });
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
  } else {
    const parentId = form.parentId.value;
    const childId  = form.childId.value;
    if (parentId === childId) { alert('Ouder en kind mogen niet dezelfde persoon zijn.'); return; }
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

  const parents  = getParentsOf(id).map(getPerson).filter(Boolean);
  const children = getChildrenOf(id).map(getPerson).filter(Boolean);
  const partners = getPartnersOf(id).map(getPerson).filter(Boolean);

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
        ? `<div class="detail-avatar ${uClass}" style="background:none;padding:0;overflow:hidden"><img src="${person.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`
        : `<div class="detail-avatar ${uClass}">${initials(person.name)}</div>`}
      <div>
        <div class="detail-name">${escHtml(person.name)}</div>
        <div class="detail-sub">${[person.family, span].filter(Boolean).join(' · ')}</div>
      </div>
    </div>

    ${person.notes ? `<div class="detail-section"><div class="detail-section-title">Notities</div><p class="detail-notes">${escHtml(person.notes)}</p></div>` : ''}
    ${pillGroup('Ouders', parents)}
    ${pillGroup('Partners', partners)}
    ${pillGroup('Kinderen', children)}

    <div class="detail-divider"></div>

    ${READ_ONLY ? '' : `
    <div class="detail-section">
      <div class="detail-section-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>Toevoegen aan ${escHtml(person.name)}</span>
        <button id="qa-mode-toggle" class="btn small secondary" style="font-size:11px">Meerdere kinderen</button>
      </div>

      <!-- ENKELVOUDIG FORMULIER -->
      <form id="form-quick-add" autocomplete="off">
        <div class="quick-row">
          <input type="text" id="qa-name" placeholder="Naam" required style="flex:2">
          <select id="qa-gender">
            <option value="m">Man</option>
            <option value="f">Vrouw</option>
            <option value="?">?</option>
          </select>
        </div>
        <div class="quick-row">
          <input type="text" id="qa-birthdate" placeholder="Geboortedatum (bijv. 15-05-1990)" style="flex:2">
        </div>
        <div class="quick-row">
          <select id="qa-relation">
            <option value="partner">Partner van ${escHtml(person.name)}</option>
            <option value="child">Kind van ${escHtml(person.name)}</option>
            <option value="parent">Ouder van ${escHtml(person.name)}</option>
          </select>
          <button type="submit" class="btn primary">Toevoegen</button>
        </div>
        <div id="qa-other-parent-row" class="quick-row hidden">
          <label style="font-size:13px;color:var(--text-muted);flex:1">
            Andere ouder:
            <select id="qa-other-parent" style="margin-left:6px">
              <option value="">— geen / onbekend —</option>
              ${partners.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
              ${state.persons.filter(p => p.id !== id && !partners.find(pp=>pp.id===p.id)).map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
            </select>
          </label>
        </div>
      </form>

      <!-- BULK KINDEREN FORMULIER -->
      <div id="qa-bulk-section" class="hidden">
        <div class="quick-row" style="margin-bottom:4px">
          <label style="font-size:13px;color:var(--text-muted);flex:1">
            Andere ouder:
            <select id="qa-bulk-other-parent" style="margin-left:6px">
              <option value="">— geen / onbekend —</option>
              ${partners.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
              ${state.persons.filter(p => p.id !== id && !partners.find(pp=>pp.id===p.id)).map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div id="qa-bulk-rows">
          <div class="quick-row qa-bulk-row">
            <input type="text" class="qa-bulk-name" placeholder="Naam kind" style="flex:2">
            <select class="qa-bulk-gender"><option value="m">M</option><option value="f">V</option><option value="?">?</option></select>
            <input type="text" class="qa-bulk-bd" placeholder="Geboortedatum" style="flex:2">
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="qa-bulk-add-row" class="btn small secondary">+ Rij toevoegen</button>
          <button id="qa-bulk-submit" class="btn primary">Alle kinderen opslaan</button>
        </div>
      </div>
    </div>
    `}

    <div class="form-actions" style="margin-top:8px">
      ${READ_ONLY ? '' : `
      <button id="btn-detail-edit" class="btn secondary">✏ Bewerken</button>
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

  // Toggle enkelvoudig ↔ bulk modus
  const modeToggle = modal.querySelector('#qa-mode-toggle');
  const singleForm = modal.querySelector('#form-quick-add');
  const bulkSection = modal.querySelector('#qa-bulk-section');
  if (modeToggle) {
    modeToggle.addEventListener('click', () => {
      const isBulk = !bulkSection.classList.contains('hidden');
      if (isBulk) {
        bulkSection.classList.add('hidden');
        singleForm.classList.remove('hidden');
        modeToggle.textContent = 'Meerdere kinderen';
      } else {
        singleForm.classList.add('hidden');
        bulkSection.classList.remove('hidden');
        modeToggle.textContent = 'Één persoon';
      }
    });
  }

  // Show/hide "andere ouder" row in enkelvoudig formulier
  const qaRelation = modal.querySelector('#qa-relation');
  const qaOtherParentRow = modal.querySelector('#qa-other-parent-row');
  if (qaRelation && qaOtherParentRow) {
    qaRelation.addEventListener('change', () => {
      qaOtherParentRow.classList.toggle('hidden', qaRelation.value !== 'child');
    });
  }

  // Enkelvoudig form submit
  if (singleForm) {
    singleForm.addEventListener('submit', e => {
      e.preventDefault();
      const name      = modal.querySelector('#qa-name').value.trim();
      const gender    = modal.querySelector('#qa-gender').value;
      const birthdate = modal.querySelector('#qa-birthdate').value.trim();
      const relation  = modal.querySelector('#qa-relation').value;
      if (!name) return;

      const newPerson = { id: uid(), name, gender, family: person.family || '', birthdate, deathdate: '', notes: '', deceased: false };
      state.persons.push(newPerson);

      if (relation === 'partner') {
        state.relationships.push({ type: 'partner', person1Id: id, person2Id: newPerson.id });
      } else if (relation === 'child') {
        state.relationships.push({ type: 'parent-child', parentId: id, childId: newPerson.id });
        const otherParentEl = modal.querySelector('#qa-other-parent');
        if (otherParentEl && otherParentEl.value) {
          state.relationships.push({ type: 'parent-child', parentId: otherParentEl.value, childId: newPerson.id });
        }
      } else if (relation === 'parent') {
        state.relationships.push({ type: 'parent-child', parentId: newPerson.id, childId: id });
      }

      saveState();
      modal.classList.add('hidden');
      render();
      setTimeout(() => scrollToCard(newPerson.id), 100);
      checkSmartLink(newPerson.id);
    });
  }

  // Bulk: rij toevoegen
  const bulkRowsContainer = modal.querySelector('#qa-bulk-rows');
  const addRowBtn = modal.querySelector('#qa-bulk-add-row');
  if (addRowBtn) {
    addRowBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'quick-row qa-bulk-row';
      row.innerHTML = `
        <input type="text" class="qa-bulk-name" placeholder="Naam kind" style="flex:2">
        <select class="qa-bulk-gender"><option value="m">M</option><option value="f">V</option><option value="?">?</option></select>
        <input type="text" class="qa-bulk-bd" placeholder="Geboortedatum" style="flex:2">
        <button type="button" class="btn small danger qa-bulk-remove" style="flex-shrink:0">✕</button>
      `;
      row.querySelector('.qa-bulk-remove').addEventListener('click', () => row.remove());
      bulkRowsContainer.appendChild(row);
    });
  }

  // Bulk: opslaan
  const bulkSubmit = modal.querySelector('#qa-bulk-submit');
  if (bulkSubmit) {
    bulkSubmit.addEventListener('click', () => {
      const otherParent = modal.querySelector('#qa-bulk-other-parent')?.value || '';
      const rows = [...modal.querySelectorAll('.qa-bulk-row')];
      const toScroll = [];
      let added = 0;

      rows.forEach(row => {
        const name      = row.querySelector('.qa-bulk-name').value.trim();
        const gender    = row.querySelector('.qa-bulk-gender').value;
        const birthdate = row.querySelector('.qa-bulk-bd').value.trim();
        if (!name) return;

        const newPerson = { id: uid(), name, gender, family: person.family || '', birthdate, deathdate: '', notes: '', deceased: false };
        state.persons.push(newPerson);
        state.relationships.push({ type: 'parent-child', parentId: id, childId: newPerson.id });
        if (otherParent) {
          state.relationships.push({ type: 'parent-child', parentId: otherParent, childId: newPerson.id });
        }
        toScroll.push(newPerson.id);
        added++;
      });

      if (!added) return;
      saveState();
      modal.classList.add('hidden');
      render();
      if (toScroll.length) setTimeout(() => scrollToCard(toScroll[0]), 100);
      showToast(`✅ ${added} kind${added > 1 ? 'eren' : ''} toegevoegd`, 'success', 3000);
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
        if (r.type === 'partner')      return knownIds.has(r.person1Id) && knownIds.has(r.person2Id);
        if (r.type === 'parent-child') return knownIds.has(r.parentId)  && knownIds.has(r.childId);
        return false; // onbekend type verwijderen
      });
      const removed = imported.relationships.length - validRels.length;

      state = { persons: imported.persons, relationships: validRels };
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
// PUBLICEER — via GitHub API → GitHub Actions → Netlify
// ============================================================
const GH_TOKEN = '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';
const GH_REPO  = 'Kalantari020/familie-stamboom';
const GH_FILE  = 'data/publish-state.json';

document.getElementById('btn-publish').addEventListener('click', () => {
  document.getElementById('publish-status').style.display = 'none';
  document.getElementById('modal-publish').classList.remove('hidden');
});
document.getElementById('btn-publish-close').addEventListener('click', () => {
  document.getElementById('modal-publish').classList.add('hidden');
});

// Alleen downloaden (backup)
document.getElementById('btn-publish-export').addEventListener('click', () => {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `familieboom_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Publiceren via GitHub API
document.getElementById('btn-publish-now').addEventListener('click', async () => {
  const statusEl = document.getElementById('publish-status');
  const btn      = document.getElementById('btn-publish-now');

  function setStatus(msg, color) {
    statusEl.style.display = 'block';
    statusEl.style.background = color;
    statusEl.textContent = msg;
  }

  btn.disabled    = true;
  btn.textContent = '⏳ Bezig...';
  setStatus('Verbinden met GitHub...', '#1e3a5f');

  try {
    // 1. Haal huidige SHA op (nodig voor update)
    setStatus('Verbinden met GitHub...', '#1e3a5f');
    const getResp = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`, {
      headers: { 'Authorization': `Bearer ${GH_TOKEN}`, 'Accept': 'application/vnd.github+json' }
    });
    if (!getResp.ok && getResp.status !== 404) {
      throw new Error(`GitHub verbinding mislukt (${getResp.status})`);
    }
    const fileInfo = getResp.ok ? await getResp.json() : {};
    const sha = fileInfo.sha || null;

    setStatus('Data klaarmaken...', '#1e3a5f');

    // 2. Strip fotos (te groot) en maak publish state
    const newVersion = Date.now();
    const publishState = {
      _version: newVersion,
      persons: (state.persons || []).map(p => {
        const { photo, ...rest } = p;
        return rest;
      }),
      relationships: state.relationships || []
    };

    // Base64 encode via TextEncoder (werkt met alle Unicode tekens)
    const jsonStr  = JSON.stringify(publishState, null, 2);
    const bytes    = new TextEncoder().encode(jsonStr);
    const binStr   = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    const content  = btoa(binStr);

    setStatus('Uploaden naar GitHub...', '#1e3a5f');

    const putBody = {
      message: `Publiceer stamboom ${new Date().toLocaleString('nl-NL')}`,
      content,
      ...(sha ? { sha } : {})
    };

    const putResp = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`, {
      method:  'PUT',
      headers: {
        'Authorization': `Bearer ${GH_TOKEN}`,
        'Accept':        'application/vnd.github+json',
        'Content-Type':  'application/json'
      },
      body: JSON.stringify(putBody)
    });

    const putResult = await putResp.json();
    if (!putResp.ok) {
      throw new Error(putResult.message || `GitHub fout (${putResp.status})`);
    }
    console.log('[publish] GitHub response:', putResp.status, putResult?.commit?.sha);

    // 3. Sla versie op
    state._version = newVersion;
    saveState();

    setStatus('✅ Geüpload! GitHub Actions deployt nu naar Netlify (~60 sec).', '#14532d');
    showToast('✅ Publiceren gestart! Binnen ~60 seconden live.', 'success', 7000);
    btn.textContent = '✅ Gepubliceerd';
    setTimeout(() => {
      btn.disabled    = false;
      btn.textContent = '🚀 Nu publiceren';
    }, 8000);

  } catch (err) {
    console.error(err);
    setStatus('❌ Fout: ' + err.message, '#7f1d1d');
    showToast('❌ Publiceren mislukt: ' + err.message, '', 6000);
    btn.disabled    = false;
    btn.textContent = '🚀 Nu publiceren';
  }
});

// ============================================================
// UTILITY
// ============================================================
function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// INIT
// ============================================================
(function init() {
  if (!loadState()) {
    state = JSON.parse(JSON.stringify(START_DATA));
    saveState();
  }

  // Read-only modus: verberg alle beheer-elementen
  if (READ_ONLY) {
    const hide = ['btn-add-person','btn-add-relation','btn-export','btn-import','btn-reset','btn-new-family','btn-publish'];
    hide.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    // CSS klasse op body zodat kaart-knoppen ook verborgen zijn
    document.body.classList.add('readonly');
  }

  render();
  setTimeout(zoomFit, 150);
})();
