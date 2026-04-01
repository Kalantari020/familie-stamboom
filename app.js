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
  const SESSION_KEY = IS_VIEW ? 'fb_sess_view' : 'fb_sess';
  const STORE_KEY   = IS_VIEW ? 'fb_pin_view'  : 'fb_pin_v2';
  const DEFAULT_PIN = IS_VIEW ? '1993'          : '5768';

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

// Verticale gezinnen: kinderen onder elkaar i.p.v. naast elkaar
let verticalGezinnen = new Set();
const VERTICAL_KEY = 'fb_vertical_gezinnen';
try {
  const saved = sessionStorage.getItem(VERTICAL_KEY);
  if (saved) verticalGezinnen = new Set(JSON.parse(saved));
} catch(e) {}
function saveVerticalState() {
  try { sessionStorage.setItem(VERTICAL_KEY, JSON.stringify([...verticalGezinnen])); } catch(e) {}
}
function toggleVerticalGezin(key) {
  if (verticalGezinnen.has(key)) {
    verticalGezinnen.delete(key);
  } else {
    verticalGezinnen.add(key);
  }
  saveVerticalState();
  render();
}

// Read-only modus: ?view=1 in de URL schakelt beheer uit
const READ_ONLY = new URLSearchParams(window.location.search).get('view') === '1';

// ============================================================
// START DATA — Familie Faizi
// ============================================================
// __START_DATA_BEGIN__
const START_DATA = {
  "persons": [
    {
      "id": "s01",
      "name": "Wali Mohammad Sayedi",
      "gender": "m",
      "birthdate": "01-07-1959",
      "deathdate": "",
      "family": "Sayedi",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 6
    },
    {
      "id": "s03",
      "name": "Ajab Khan Sayedi",
      "gender": "m",
      "birthdate": "10-12-1988",
      "deathdate": "",
      "family": "Sayedi",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 1
    },
    {
      "id": "s04",
      "name": "Sanga Hassanzai",
      "gender": "f",
      "birthdate": "27-06-1990",
      "deathdate": "",
      "family": "Hassanzai",
      "notes": "",
      "deceased": false
    },
    {
      "id": "s05",
      "name": "Ajmal Khan Sayedi",
      "gender": "m",
      "birthdate": "09-11-1989",
      "deathdate": "",
      "family": "Sayedi",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 2
    },
    {
      "id": "s06",
      "name": "Helai Sayedi",
      "gender": "f",
      "birthdate": "03-10-1991",
      "deathdate": "",
      "family": "Sayedi",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 3
    },
    {
      "id": "s07",
      "name": "Gaffar Khan Rashid",
      "gender": "m",
      "birthdate": "02-02-1984",
      "deathdate": "",
      "family": "Rashid",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 5
    },
    {
      "id": "s08",
      "name": "Benjamin Rahman Khan Rashid",
      "gender": "m",
      "birthdate": "25-06-2019",
      "deathdate": "",
      "family": "Rashid",
      "notes": "",
      "deceased": false
    },
    {
      "id": "s09",
      "name": "Fereshta Sayedi",
      "gender": "f",
      "birthdate": "27-08-1992",
      "deathdate": "",
      "family": "Sayedi",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 4
    },
    {
      "id": "s10",
      "name": "Jawed Sabur",
      "gender": "m",
      "birthdate": "15-03-1988",
      "deathdate": "",
      "family": "Sabur",
      "notes": "",
      "deceased": false
    },
    {
      "id": "s11",
      "name": "Hakim Khan Sayedi",
      "gender": "m",
      "birthdate": "15-07-1993",
      "deathdate": "",
      "family": "Sayedi",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 5
    },
    {
      "id": "s12",
      "name": "Halima Sayedi",
      "gender": "f",
      "birthdate": "13-06-1994",
      "deathdate": "",
      "family": "Sayedi",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 6
    },
    {
      "id": "s13",
      "name": "Saleh Mohammad Raoefi",
      "gender": "m",
      "birthdate": "01-07-1997",
      "deathdate": "",
      "family": "Raoefi",
      "notes": "",
      "deceased": false
    },
    {
      "id": "s14",
      "name": "Amira Nora Raoefi",
      "gender": "f",
      "birthdate": "20-07-2022",
      "deathdate": "",
      "family": "Raoefi",
      "notes": "",
      "deceased": false
    },
    {
      "id": "s15",
      "name": "Lina Maryam Raoefi",
      "gender": "f",
      "birthdate": "08-11-2023",
      "deathdate": "",
      "family": "Raoefi",
      "notes": "",
      "deceased": false
    },
    {
      "id": "f01",
      "name": "Khanaga Faizi",
      "gender": "m",
      "birthdate": "05-01-1965",
      "deathdate": "",
      "family": "Faizi",
      "notes": "",
      "deceased": false
    },
    {
      "id": "f02",
      "name": "Benazier Rashid",
      "gender": "f",
      "birthdate": "03-12-1967",
      "deathdate": "",
      "family": "Rashid",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 1
    },
    {
      "id": "f03",
      "name": "Hemat Faizi",
      "gender": "m",
      "birthdate": "02-06-1996",
      "deathdate": "",
      "family": "Faizi",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 1
    },
    {
      "id": "f05",
      "name": "Amina Faizi",
      "gender": "f",
      "birthdate": "17-01-2024",
      "deathdate": "",
      "family": "Faizi",
      "notes": "",
      "deceased": false
    },
    {
      "id": "f06",
      "name": "Nilab Faizi",
      "gender": "f",
      "birthdate": "21-03-1997",
      "deathdate": "",
      "family": "Faizi",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 2
    },
    {
      "id": "f07",
      "name": "Emamuddin Salehi",
      "gender": "m",
      "birthdate": "05-09-1989",
      "deathdate": "",
      "family": "Salehi",
      "notes": "",
      "deceased": false
    },
    {
      "id": "f08",
      "name": "Muhammad Salehi",
      "gender": "m",
      "birthdate": "10-05-2019",
      "deathdate": "",
      "family": "Salehi",
      "notes": "",
      "deceased": false
    },
    {
      "id": "f09",
      "name": "Ahmad Salehi",
      "gender": "m",
      "birthdate": "20-06-2020",
      "deathdate": "",
      "family": "Salehi",
      "notes": "",
      "deceased": false
    },
    {
      "id": "f10",
      "name": "Alia Faizi",
      "gender": "f",
      "birthdate": "28-09-1998",
      "deathdate": "",
      "family": "Faizi",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 3
    },
    {
      "id": "f11",
      "name": "Rahimgul Salehi",
      "gender": "m",
      "birthdate": "25-01-1997",
      "deathdate": "",
      "family": "Salehi",
      "notes": "",
      "deceased": false
    },
    {
      "id": "f12",
      "name": "Zainab Salehi",
      "gender": "f",
      "birthdate": "07-10-2022",
      "deathdate": "",
      "family": "Salehi",
      "notes": "",
      "deceased": false
    },
    {
      "id": "f13",
      "name": "Meraj Faizi",
      "gender": "m",
      "birthdate": "08-04-2003",
      "deathdate": "",
      "family": "Faizi",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 4
    },
    {
      "id": "f14",
      "name": "Mona Saidi",
      "gender": "f",
      "birthdate": "",
      "deathdate": "",
      "family": "Saidi",
      "notes": ""
    },
    {
      "id": "f15",
      "name": "Erfan Faizi",
      "gender": "m",
      "birthdate": "04-01-2006",
      "deathdate": "",
      "family": "Faizi",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 5
    },
    {
      "id": "f16",
      "name": "Alina Faizi",
      "gender": "f",
      "birthdate": "25-02-2008",
      "deathdate": "",
      "family": "Faizi",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 6
    },
    {
      "id": "f17",
      "name": "Hamza Faizi",
      "gender": "m",
      "birthdate": "18-12-2009",
      "deathdate": "",
      "family": "Faizi",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 7
    },
    {
      "id": "pmncyghyo65ha",
      "name": "Mirwais Khan Wazir Sayedi",
      "gender": "m",
      "birthdate": "08-11-2025",
      "deathdate": "",
      "family": "Sayedi",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnczpeoyc4hd",
      "name": "Arman Haydar Khan Sabur",
      "gender": "m",
      "birthdate": "10-03-2025",
      "deathdate": "",
      "family": "Sabur",
      "notes": "",
      "deceased": false
    },
    {
      "id": "r01",
      "name": "Abed Rahmani",
      "gender": "m",
      "birthdate": "01-01-1990",
      "deathdate": "",
      "family": "Rahmani",
      "notes": ""
    },
    {
      "id": "r02",
      "name": "Palwasha Faizi",
      "gender": "f",
      "birthdate": "03-06-1991",
      "deathdate": "",
      "family": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 9
    },
    {
      "id": "r03",
      "name": "Yaqub Rahmani",
      "gender": "m",
      "birthdate": "13-11-2019",
      "deathdate": "",
      "family": "Rahmani",
      "notes": ""
    },
    {
      "id": "r04",
      "name": "Muzammil Rahmani",
      "gender": "m",
      "birthdate": "04-12-2020",
      "deathdate": "",
      "family": "Rahmani",
      "notes": ""
    },
    {
      "id": "pmnd6s4yespmb",
      "name": "Zahra Salehi",
      "gender": "f",
      "family": "Salehi",
      "birthdate": "26-01-2024",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnd79y13i65o",
      "name": "Huzergol Ghorbandi",
      "gender": "m",
      "family": "Ghorbandi",
      "birthdate": "01-07-1959",
      "deathdate": "",
      "deceased": false,
      "notes": "",
      "photo": null
    },
    {
      "id": "pmnd7akkugpv5",
      "name": "Bibi Hura Qasim",
      "gender": "f",
      "family": "Ghorbandi",
      "birthdate": "02-02-1961",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnd7bkdrm6yz",
      "name": "Asif Khan Ghorbandi",
      "gender": "m",
      "family": "Ghorbandi",
      "birthdate": "01-07-1986",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 2
    },
    {
      "id": "pmnd7cfmvqiff",
      "name": "Mussa Khan Emran Ghorbandi",
      "gender": "m",
      "family": "Ghorbandi",
      "birthdate": "01-07-1988",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 3
    },
    {
      "id": "pmnd7cuzr39r9",
      "name": "Issa Khan Qader Ghorbandi",
      "gender": "m",
      "family": "Ghorbandi",
      "birthdate": "01-07-1990",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 4
    },
    {
      "id": "pmnd7ej1rf33c",
      "name": "Golgotai Ghorbandi",
      "gender": "f",
      "family": "Ghorbandi",
      "birthdate": "01-07-1984",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 1
    },
    {
      "id": "pmnd7hzc067x0",
      "name": "Lema Ghorbandi",
      "gender": "f",
      "family": "Ghorbandi",
      "birthdate": "18-06-1994",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 6
    },
    {
      "id": "pmnd7janquizq",
      "name": "Golalai Ghorbandi",
      "gender": "f",
      "family": "Ghorbandi",
      "birthdate": "01-07-1992",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 5
    },
    {
      "id": "pmnd7n0jbe5kc",
      "name": "Atifa Ghorbandi",
      "gender": "f",
      "family": "Ghorbandi",
      "birthdate": "07-09-1996",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 7
    },
    {
      "id": "pmnd7o54wo1ew",
      "name": "Shaista Ghorbandi",
      "gender": "f",
      "family": "Ghorbandi",
      "birthdate": "22-07-1999",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 8
    },
    {
      "id": "pmnd7oyi85tgd",
      "name": "Amena Ghorbandi",
      "gender": "f",
      "family": "Ghorbandi",
      "birthdate": "27-12-2001",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 9
    },
    {
      "id": "pmnd7qhxj4baj",
      "name": "Bader Khan Rashid",
      "gender": "m",
      "family": "Rashid",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 3
    },
    {
      "id": "pmnd7shvzi3c4",
      "name": "Beheshta Rashid",
      "gender": "f",
      "family": "Rashid",
      "birthdate": "18-01-2006",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnd7t84wv60c",
      "name": "Moqahdas Rashid",
      "gender": "f",
      "family": "Rashid",
      "birthdate": "22-06-2008",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnd7u7dc1sv8",
      "name": "Malaika Rashid",
      "gender": "f",
      "family": "Rashid",
      "birthdate": "11-05-2011",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": null
    },
    {
      "id": "pmnd7v4fly7vb",
      "name": "Bilal Rashid",
      "gender": "m",
      "family": "Rashid",
      "birthdate": "05-07-2015",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmndmqi8yk35j",
      "name": "Abdelqadir Ahmadzai",
      "gender": "m",
      "family": "Ghorbandi",
      "birthdate": "04-04-1984",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmndmre7xwo3z",
      "name": "Madina Noor Ahmadzai",
      "gender": "f",
      "family": "Ghorbandi",
      "birthdate": "08-12-2016",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmndmscnasvm5",
      "name": "Idris Omar Ahmadzai",
      "gender": "m",
      "family": "Ghorbandi",
      "birthdate": "30-10-2018",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmndmt69g664c",
      "name": "Hawa Umrah Ahmadzai",
      "gender": "f",
      "family": "Ghorbandi",
      "birthdate": "10-07-2022",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmndmv0pe6bnt",
      "name": "Mohammaddel Amiri",
      "gender": "m",
      "family": "Amiri",
      "birthdate": "08-10-1957",
      "deathdate": "",
      "deceased": false,
      "notes": ""
    },
    {
      "id": "pmndmvgb61us6",
      "name": "Shughla Rashid",
      "gender": "f",
      "family": "Rashid",
      "birthdate": "27-07-1979",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 6
    },
    {
      "id": "pmndmw6tmszgx",
      "name": "Aisha Amiri",
      "gender": "f",
      "family": "Amiri",
      "birthdate": "30-04-2007",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmndmwy22inp5",
      "name": "Alwina Amiri",
      "gender": "f",
      "family": "Amiri",
      "birthdate": "24-04-2009",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmndmxo0wy25u",
      "name": "Khadija Amiri",
      "gender": "f",
      "family": "Amiri",
      "birthdate": "27-06-2014",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmndn04a6kp3h",
      "name": "Kawsar Amiri",
      "gender": "f",
      "family": "Amiri",
      "birthdate": "25-05-2017",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmndn0xa5x3gg",
      "name": "Asra Amiri",
      "gender": "f",
      "family": "Amiri",
      "birthdate": "02-02-2021",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmndn2984pmss",
      "name": "Asma Amiri",
      "gender": "f",
      "family": "Amiri",
      "birthdate": "02-01-2002",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 1
    },
    {
      "id": "pmndn30vhfz8r",
      "name": "Rafi",
      "gender": "m",
      "family": "Amiri",
      "birthdate": "",
      "deathdate": "",
      "notes": ""
    },
    {
      "id": "pmndn3i30g9js",
      "name": "Zoya",
      "gender": "f",
      "family": "Amiri",
      "birthdate": "",
      "deathdate": "",
      "notes": ""
    },
    {
      "id": "pmndn3u2sqdff",
      "name": "Zaynab",
      "gender": "f",
      "family": "Amiri",
      "birthdate": "",
      "deathdate": "",
      "notes": ""
    },
    {
      "id": "pmndn4sw3j1fb",
      "name": "Husna Amiri",
      "gender": "f",
      "family": "Amiri",
      "birthdate": "24-11-2001",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmndn7m9expkq",
      "name": "Aisya Faizi",
      "gender": "f",
      "family": "Amiri",
      "birthdate": "16-09-2025",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmndnoxx6ndgz",
      "name": "Jamal Nader Rashid",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "deceased": false,
      "notes": ""
    },
    {
      "id": "pmndnpzkp3vwu",
      "name": "Zarlakhta Rashid",
      "gender": "f",
      "family": "Rashid",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 2
    },
    {
      "id": "pmndnrdrc68lf",
      "name": "Sejad Rashid",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 1
    },
    {
      "id": "pmndnrn9438x5",
      "name": "Noman Rashid",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 2
    },
    {
      "id": "pmndnryswhsem",
      "name": "Adel Rashid",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 3
    },
    {
      "id": "pmndns7ewdxvw",
      "name": "Amer Rashid",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 4
    },
    {
      "id": "pmndnsji2txom",
      "name": "Adam Rashid",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 5
    },
    {
      "id": "pmndnticv1qox",
      "name": "Homaira Hakimi",
      "gender": "f",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": ""
    },
    {
      "id": "pmndwllk8hld1",
      "name": "Azghar Khan Rashid",
      "gender": "m",
      "family": "Durrani",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 4
    },
    {
      "id": "pmndwllk9fukl",
      "name": "Davud Khan Durrani",
      "gender": "m",
      "family": "Durrani",
      "birthdate": "01-10-1989",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 7
    },
    {
      "id": "pmndwllk96xxz",
      "name": "Nabila",
      "gender": "m",
      "family": "Durrani",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 8
    },
    {
      "id": "pmndya3eilyn1",
      "name": "Ahmad Saidi",
      "gender": "m",
      "family": "Saidi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 1
    },
    {
      "id": "pmndya3eiti9k",
      "name": "Mahmoed",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 2
    },
    {
      "id": "pmndya3eixb8j",
      "name": "Bibigul",
      "gender": "f",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 3
    },
    {
      "id": "pmndya3ei5vp4",
      "name": "Ali Ahmad Salehi",
      "gender": "m",
      "family": "Salehi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 4
    },
    {
      "id": "pmndya3ei0k93",
      "name": "Mahmad Salehi",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 7
    },
    {
      "id": "pmndya3eip3zu",
      "name": "Sheerinagah",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 8
    },
    {
      "id": "pmndyckredqon",
      "name": "Fawziya",
      "gender": "f",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": true,
      "photo": null
    },
    {
      "id": "pmndydlr61are",
      "name": "Hekmatullah Salehi",
      "gender": "m",
      "family": "Salehi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 1,
      "socialBirthOrder": 3
    },
    {
      "id": "pmndyeaduhd1o",
      "name": "Shamila",
      "gender": "f",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null
    },
    {
      "id": "pmndyf12hx96x",
      "name": "Khalil Reduaon Salehi",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmndyhcgqdpb9",
      "name": "Zakira",
      "gender": "f",
      "family": "Salehi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null
    },
    {
      "id": "pmndyjcrfva0k",
      "name": "Ehsanullah",
      "gender": "m",
      "family": "Salehi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 2
    },
    {
      "id": "pmndyjcrg5spz",
      "name": "Safiullah",
      "gender": "m",
      "family": "Salehi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 3
    },
    {
      "id": "pmndyjcrhx2b4",
      "name": "Saifullah",
      "gender": "m",
      "family": "Salehi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 4
    },
    {
      "id": "pmndyjcripek7",
      "name": "Muqadas",
      "gender": "m",
      "family": "Salehi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 5
    },
    {
      "id": "pmndyjcrjsvwo",
      "name": "Marwa",
      "gender": "m",
      "family": "Salehi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 6
    },
    {
      "id": "pmndyjcrkl9zf",
      "name": "Safya",
      "gender": "m",
      "family": "Salehi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 7
    },
    {
      "id": "pmndyjcrl3njh",
      "name": "Humairah",
      "gender": "m",
      "family": "Salehi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 8
    },
    {
      "id": "pmndyrysy3eq7",
      "name": "Sayedahmed",
      "gender": "m",
      "family": "Sayedi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmndyryt0viez",
      "name": "Maluka",
      "gender": "f",
      "family": "Sayedi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmndyxhre0zi1",
      "name": "Mahmadgul",
      "gender": "m",
      "family": "Ghorbandi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": true,
      "photo": null
    },
    {
      "id": "pmndyy6j6wndl",
      "name": "Hajiro",
      "gender": "f",
      "family": "Ghorbandi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": true,
      "photo": null
    },
    {
      "id": "pmnepe8ob5cod",
      "name": "Soraya",
      "gender": "f",
      "family": "Ghorbandi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnepfhttgn51",
      "name": "Amanda Jennah Hulsbergen",
      "gender": "f",
      "family": "Hulsbergen",
      "birthdate": "05-02",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null
    },
    {
      "id": "pmnepimbckf8a",
      "name": "Jamil Ghorbandi",
      "gender": "m",
      "family": "Ghorbandi",
      "birthdate": "03-02-2023",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnepimbeuxuf",
      "name": "Zidan Ghorbandi",
      "gender": "m",
      "family": "Ghorbandi",
      "birthdate": "27-11-2025",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnepl5nzikm3",
      "name": "Muchda Kakar",
      "gender": "f",
      "family": "Ghorbandi",
      "birthdate": "11-05",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnepmjsmeuk6",
      "name": "Sohail Durani",
      "gender": "m",
      "family": "Ghorbandi",
      "birthdate": "20-03-1994",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnepnt0eu2k2",
      "name": "Ezatullah Achmadzai",
      "gender": "m",
      "family": "Ghorbandi",
      "birthdate": "05-12-1991",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnepp0idbklv",
      "name": "Zunaira Dua Achmadzai",
      "gender": "f",
      "family": "Ghorbandi",
      "birthdate": "03-05-2025",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmneptum4xnzi",
      "name": "Alia Miakhel",
      "gender": "f",
      "family": "Durrani",
      "birthdate": "04-04-1992",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnepytxdqi9y",
      "name": "Mustafa Durrani",
      "gender": "m",
      "family": "Durrani",
      "birthdate": "18-06-2018",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null
    },
    {
      "id": "pmnepytxga1sz",
      "name": "Mujtaba Durrani",
      "gender": "m",
      "family": "Durrani",
      "birthdate": "21-12-2020",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null
    },
    {
      "id": "pmnepytxh5z3q",
      "name": "Muskaan Durrani",
      "gender": "f",
      "family": "Durrani",
      "birthdate": "17-08-2022",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null
    },
    {
      "id": "pmnepytxiuzsg",
      "name": "Abud Musawwir Durrani",
      "gender": "m",
      "family": "Durrani",
      "birthdate": "26-04-2024",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null
    },
    {
      "id": "pmneq7p4nynu3",
      "name": "Habib Gull Durrani",
      "gender": "m",
      "family": "Ghorbandi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmneq7p4ss5hl",
      "name": "Sakhi Gull Rashid",
      "gender": "m",
      "family": "Ghorbandi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmneq7p4udtvl",
      "name": "Malika Durrani",
      "gender": "f",
      "family": "Ghorbandi",
      "birthdate": "01-07-1962",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": null
    },
    {
      "id": "pmndo2vxafahz",
      "name": "Hagig Gull Durrani",
      "gender": "m",
      "family": "Durrani",
      "birthdate": "",
      "deathdate": "",
      "deceased": false,
      "notes": "",
      "photo": null,
      "birthOrder": null
    },
    {
      "id": "pmndo3i84yw8g",
      "name": "Babogal Sayedi",
      "gender": "f",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 5
    },
    {
      "id": "pmnfv2r03xoij",
      "name": "Fatima Zahra Salehi",
      "gender": "f",
      "family": "Salehi",
      "birthdate": "01-04-2026",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnfvopdootvl",
      "name": "Haya Rashid",
      "gender": "f",
      "family": "Rashid",
      "birthdate": "24-05-2021",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnfwiq4xex8n",
      "name": "Shafiqa",
      "gender": "f",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnfwiq4xoz2k",
      "name": "Laila",
      "gender": "f",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnfwl6r2lpes",
      "name": "Nabi Saidi",
      "gender": "m",
      "family": "Saidi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 1
    },
    {
      "id": "pmnfwl6r2k67v",
      "name": "Sediqa Saidi",
      "gender": "f",
      "family": "Saidi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 2
    },
    {
      "id": "pmnfwl6r2bl6p",
      "name": "Zergai Said Saidi",
      "gender": "m",
      "family": "Saidi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 3
    },
    {
      "id": "pmnfwl6r2i0v6",
      "name": "Farid Saidi",
      "gender": "m",
      "family": "Saidi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 4
    },
    {
      "id": "pmnfwl6r21xvr",
      "name": "Rafi Saidi",
      "gender": "m",
      "family": "Saidi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 5
    },
    {
      "id": "pmnfwl6r2gzuz",
      "name": "Latifa Saidi",
      "gender": "f",
      "family": "Saidi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 6
    },
    {
      "id": "pmnfwl6r2niud",
      "name": "Waheed Saidi",
      "gender": "m",
      "family": "Saidi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 7
    },
    {
      "id": "pmnfwpozxyoww",
      "name": "Fereshta Saidi",
      "gender": "f",
      "family": "Saidi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 8
    },
    {
      "id": "pmnfwpozxor6n",
      "name": "Saidwali Saidi",
      "gender": "m",
      "family": "Saidi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 9
    },
    {
      "id": "pmnfwpozx8uem",
      "name": "Sardarwali Saidi",
      "gender": "m",
      "family": "Saidi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 10
    },
    {
      "id": "pmnfwpozxxrih",
      "name": "Mariam Saidi",
      "gender": "f",
      "family": "Saidi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 11
    },
    {
      "id": "pmnfwpozxh323",
      "name": "Amina Saidi",
      "gender": "f",
      "family": "Saidi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 12
    },
    {
      "id": "pmnfwpozxxvot",
      "name": "Zainab Saidi",
      "gender": "f",
      "family": "Saidi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 13
    },
    {
      "id": "pmnfwpozx2yhq",
      "name": "Fatima Saidi",
      "gender": "f",
      "family": "Saidi",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 14
    },
    {
      "id": "pmnfx2dl6dya9",
      "name": "Mastora Faizi",
      "gender": "f",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnfx3knl6en8",
      "name": "Mina Salehi",
      "gender": "f",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": null,
      "socialBirthOrder": 1
    },
    {
      "id": "pmnfx5u9dct4w",
      "name": "Matiullah Salehi",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 2,
      "socialBirthOrder": 2
    },
    {
      "id": "pmnfx5u9dbm8a",
      "name": "Nasratullah Salehi",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false,
      "photo": null,
      "birthOrder": 2,
      "socialBirthOrder": 4
    },
    {
      "id": "pmnfx8zrswvz9",
      "name": "Davud Sediqi",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnfxa0in4tc9",
      "name": "Ibrahim Sediqi",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnfxa0io0z5u",
      "name": "Maryam Sediqi",
      "gender": "f",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnfxa0iou6j0",
      "name": "Sarah Sediqi",
      "gender": "f",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnfxaot46h83",
      "name": "Tahmina Salehi",
      "gender": "f",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnfxbasnb3sh",
      "name": "Abdurrahman Salehi",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    },
    {
      "id": "pmnfxbasnbq7c",
      "name": "Abdullah Saledhi",
      "gender": "m",
      "family": "",
      "birthdate": "",
      "deathdate": "",
      "notes": "",
      "deceased": false
    }
  ],
  "relationships": [
    {
      "type": "partner",
      "person1Id": "s01",
      "person2Id": "pmneq7p4udtvl"
    },
    {
      "type": "partner",
      "person1Id": "s03",
      "person2Id": "s04"
    },
    {
      "type": "partner",
      "person1Id": "s06",
      "person2Id": "s07"
    },
    {
      "type": "partner",
      "person1Id": "s09",
      "person2Id": "s10"
    },
    {
      "type": "partner",
      "person1Id": "s12",
      "person2Id": "s13"
    },
    {
      "type": "parent-child",
      "parentId": "s01",
      "childId": "s03"
    },
    {
      "type": "parent-child",
      "parentId": "pmneq7p4udtvl",
      "childId": "s03"
    },
    {
      "type": "parent-child",
      "parentId": "s01",
      "childId": "s05"
    },
    {
      "type": "parent-child",
      "parentId": "pmneq7p4udtvl",
      "childId": "s05"
    },
    {
      "type": "parent-child",
      "parentId": "s01",
      "childId": "s06"
    },
    {
      "type": "parent-child",
      "parentId": "pmneq7p4udtvl",
      "childId": "s06"
    },
    {
      "type": "parent-child",
      "parentId": "s01",
      "childId": "s09"
    },
    {
      "type": "parent-child",
      "parentId": "pmneq7p4udtvl",
      "childId": "s09"
    },
    {
      "type": "parent-child",
      "parentId": "s01",
      "childId": "s11"
    },
    {
      "type": "parent-child",
      "parentId": "pmneq7p4udtvl",
      "childId": "s11"
    },
    {
      "type": "parent-child",
      "parentId": "s01",
      "childId": "s12"
    },
    {
      "type": "parent-child",
      "parentId": "pmneq7p4udtvl",
      "childId": "s12"
    },
    {
      "type": "parent-child",
      "parentId": "s06",
      "childId": "s08"
    },
    {
      "type": "parent-child",
      "parentId": "s07",
      "childId": "s08"
    },
    {
      "type": "parent-child",
      "parentId": "s12",
      "childId": "s14"
    },
    {
      "type": "parent-child",
      "parentId": "s13",
      "childId": "s14"
    },
    {
      "type": "parent-child",
      "parentId": "s12",
      "childId": "s15"
    },
    {
      "type": "parent-child",
      "parentId": "s13",
      "childId": "s15"
    },
    {
      "type": "partner",
      "person1Id": "f01",
      "person2Id": "f02"
    },
    {
      "type": "partner",
      "person1Id": "f03",
      "person2Id": "pmndn4sw3j1fb"
    },
    {
      "type": "partner",
      "person1Id": "f06",
      "person2Id": "f07"
    },
    {
      "type": "partner",
      "person1Id": "f10",
      "person2Id": "f11"
    },
    {
      "type": "partner",
      "person1Id": "f13",
      "person2Id": "f14"
    },
    {
      "type": "parent-child",
      "parentId": "f01",
      "childId": "f03"
    },
    {
      "type": "parent-child",
      "parentId": "f02",
      "childId": "f03"
    },
    {
      "type": "parent-child",
      "parentId": "f01",
      "childId": "f06"
    },
    {
      "type": "parent-child",
      "parentId": "f02",
      "childId": "f06"
    },
    {
      "type": "parent-child",
      "parentId": "f01",
      "childId": "f10"
    },
    {
      "type": "parent-child",
      "parentId": "f02",
      "childId": "f10"
    },
    {
      "type": "parent-child",
      "parentId": "f01",
      "childId": "f13"
    },
    {
      "type": "parent-child",
      "parentId": "f02",
      "childId": "f13"
    },
    {
      "type": "parent-child",
      "parentId": "f01",
      "childId": "f15"
    },
    {
      "type": "parent-child",
      "parentId": "f02",
      "childId": "f15"
    },
    {
      "type": "parent-child",
      "parentId": "f01",
      "childId": "f16"
    },
    {
      "type": "parent-child",
      "parentId": "f02",
      "childId": "f16"
    },
    {
      "type": "parent-child",
      "parentId": "f01",
      "childId": "f17"
    },
    {
      "type": "parent-child",
      "parentId": "f02",
      "childId": "f17"
    },
    {
      "type": "parent-child",
      "parentId": "f03",
      "childId": "f05"
    },
    {
      "type": "parent-child",
      "parentId": "pmndn4sw3j1fb",
      "childId": "f05"
    },
    {
      "type": "parent-child",
      "parentId": "f06",
      "childId": "f08"
    },
    {
      "type": "parent-child",
      "parentId": "f07",
      "childId": "f08"
    },
    {
      "type": "parent-child",
      "parentId": "f06",
      "childId": "f09"
    },
    {
      "type": "parent-child",
      "parentId": "f07",
      "childId": "f09"
    },
    {
      "type": "parent-child",
      "parentId": "f10",
      "childId": "f12"
    },
    {
      "type": "parent-child",
      "parentId": "f11",
      "childId": "f12"
    },
    {
      "type": "parent-child",
      "parentId": "s03",
      "childId": "pmncyghyo65ha"
    },
    {
      "type": "parent-child",
      "parentId": "s04",
      "childId": "pmncyghyo65ha"
    },
    {
      "type": "parent-child",
      "parentId": "s09",
      "childId": "pmnczpeoyc4hd"
    },
    {
      "type": "parent-child",
      "parentId": "s10",
      "childId": "pmnczpeoyc4hd"
    },
    {
      "type": "partner",
      "person1Id": "r01",
      "person2Id": "r02"
    },
    {
      "type": "parent-child",
      "parentId": "r01",
      "childId": "r03"
    },
    {
      "type": "parent-child",
      "parentId": "r02",
      "childId": "r03"
    },
    {
      "type": "parent-child",
      "parentId": "r01",
      "childId": "r04"
    },
    {
      "type": "parent-child",
      "parentId": "r02",
      "childId": "r04"
    },
    {
      "type": "parent-child",
      "parentId": "f03",
      "childId": "pmndn7m9expkq"
    },
    {
      "type": "parent-child",
      "parentId": "pmndn4sw3j1fb",
      "childId": "pmndn7m9expkq"
    },
    {
      "type": "partner",
      "person1Id": "f16",
      "person2Id": "pmndnrn9438x5"
    },
    {
      "type": "parent-child",
      "parentId": "f10",
      "childId": "pmnd6s4yespmb"
    },
    {
      "type": "parent-child",
      "parentId": "f11",
      "childId": "pmnd6s4yespmb"
    },
    {
      "type": "partner",
      "person1Id": "pmnd79y13i65o",
      "person2Id": "pmnd7akkugpv5"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd79y13i65o",
      "childId": "pmnd7bkdrm6yz"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7akkugpv5",
      "childId": "pmnd7bkdrm6yz"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd79y13i65o",
      "childId": "pmnd7cfmvqiff"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7akkugpv5",
      "childId": "pmnd7cfmvqiff"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd79y13i65o",
      "childId": "pmnd7cuzr39r9"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7akkugpv5",
      "childId": "pmnd7cuzr39r9"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd79y13i65o",
      "childId": "pmnd7ej1rf33c"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7akkugpv5",
      "childId": "pmnd7ej1rf33c"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd79y13i65o",
      "childId": "pmnd7hzc067x0"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7akkugpv5",
      "childId": "pmnd7hzc067x0"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7akkugpv5",
      "childId": "pmnd7janquizq"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd79y13i65o",
      "childId": "pmnd7janquizq"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd79y13i65o",
      "childId": "pmnd7n0jbe5kc"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7akkugpv5",
      "childId": "pmnd7n0jbe5kc"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd79y13i65o",
      "childId": "pmnd7o54wo1ew"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7akkugpv5",
      "childId": "pmnd7o54wo1ew"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd79y13i65o",
      "childId": "pmnd7oyi85tgd"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7akkugpv5",
      "childId": "pmnd7oyi85tgd"
    },
    {
      "type": "partner",
      "person1Id": "pmnd7ej1rf33c",
      "person2Id": "pmnd7qhxj4baj"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7qhxj4baj",
      "childId": "pmnd7shvzi3c4"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7ej1rf33c",
      "childId": "pmnd7shvzi3c4"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7qhxj4baj",
      "childId": "pmnd7t84wv60c"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7ej1rf33c",
      "childId": "pmnd7t84wv60c"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7qhxj4baj",
      "childId": "pmnd7u7dc1sv8"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7ej1rf33c",
      "childId": "pmnd7u7dc1sv8"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7qhxj4baj",
      "childId": "pmnd7v4fly7vb"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7ej1rf33c",
      "childId": "pmnd7v4fly7vb"
    },
    {
      "type": "partner",
      "person1Id": "pmnd7janquizq",
      "person2Id": "pmndmqi8yk35j"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmqi8yk35j",
      "childId": "pmndmre7xwo3z"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7janquizq",
      "childId": "pmndmre7xwo3z"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmqi8yk35j",
      "childId": "pmndmscnasvm5"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7janquizq",
      "childId": "pmndmscnasvm5"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmqi8yk35j",
      "childId": "pmndmt69g664c"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7janquizq",
      "childId": "pmndmt69g664c"
    },
    {
      "type": "partner",
      "person1Id": "pmndmv0pe6bnt",
      "person2Id": "pmndmvgb61us6"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmv0pe6bnt",
      "childId": "pmndmw6tmszgx"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmvgb61us6",
      "childId": "pmndmw6tmszgx"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmv0pe6bnt",
      "childId": "pmndmwy22inp5"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmvgb61us6",
      "childId": "pmndmwy22inp5"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmv0pe6bnt",
      "childId": "pmndmxo0wy25u"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmvgb61us6",
      "childId": "pmndmxo0wy25u"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmv0pe6bnt",
      "childId": "pmndn04a6kp3h"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmvgb61us6",
      "childId": "pmndn04a6kp3h"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmv0pe6bnt",
      "childId": "pmndn0xa5x3gg"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmvgb61us6",
      "childId": "pmndn0xa5x3gg"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmv0pe6bnt",
      "childId": "pmndn2984pmss"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmvgb61us6",
      "childId": "pmndn2984pmss"
    },
    {
      "type": "partner",
      "person1Id": "pmndn2984pmss",
      "person2Id": "pmndn30vhfz8r"
    },
    {
      "type": "parent-child",
      "parentId": "pmndn30vhfz8r",
      "childId": "pmndn3i30g9js"
    },
    {
      "type": "parent-child",
      "parentId": "pmndn2984pmss",
      "childId": "pmndn3i30g9js"
    },
    {
      "type": "parent-child",
      "parentId": "pmndn30vhfz8r",
      "childId": "pmndn3u2sqdff"
    },
    {
      "type": "parent-child",
      "parentId": "pmndn2984pmss",
      "childId": "pmndn3u2sqdff"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmv0pe6bnt",
      "childId": "pmndn4sw3j1fb"
    },
    {
      "type": "parent-child",
      "parentId": "pmndmvgb61us6",
      "childId": "pmndn4sw3j1fb"
    },
    {
      "type": "partner",
      "person1Id": "pmndnoxx6ndgz",
      "person2Id": "pmndnpzkp3vwu"
    },
    {
      "type": "parent-child",
      "parentId": "pmndnoxx6ndgz",
      "childId": "pmndnrdrc68lf"
    },
    {
      "type": "parent-child",
      "parentId": "pmndnpzkp3vwu",
      "childId": "pmndnrdrc68lf"
    },
    {
      "type": "parent-child",
      "parentId": "pmndnoxx6ndgz",
      "childId": "pmndnrn9438x5"
    },
    {
      "type": "parent-child",
      "parentId": "pmndnpzkp3vwu",
      "childId": "pmndnrn9438x5"
    },
    {
      "type": "parent-child",
      "parentId": "pmndnoxx6ndgz",
      "childId": "pmndnryswhsem"
    },
    {
      "type": "parent-child",
      "parentId": "pmndnpzkp3vwu",
      "childId": "pmndnryswhsem"
    },
    {
      "type": "parent-child",
      "parentId": "pmndnoxx6ndgz",
      "childId": "pmndns7ewdxvw"
    },
    {
      "type": "parent-child",
      "parentId": "pmndnpzkp3vwu",
      "childId": "pmndns7ewdxvw"
    },
    {
      "type": "parent-child",
      "parentId": "pmndnoxx6ndgz",
      "childId": "pmndnsji2txom"
    },
    {
      "type": "parent-child",
      "parentId": "pmndnpzkp3vwu",
      "childId": "pmndnsji2txom"
    },
    {
      "type": "partner",
      "person1Id": "pmndnrdrc68lf",
      "person2Id": "pmndnticv1qox"
    },
    {
      "type": "partner",
      "person1Id": "pmndo2vxafahz",
      "person2Id": "pmndo3i84yw8g"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo2vxafahz",
      "childId": "f02"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo3i84yw8g",
      "childId": "f02"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo2vxafahz",
      "childId": "pmndnpzkp3vwu"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo3i84yw8g",
      "childId": "pmndnpzkp3vwu"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo2vxafahz",
      "childId": "pmnd7qhxj4baj"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo3i84yw8g",
      "childId": "pmnd7qhxj4baj"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo2vxafahz",
      "childId": "pmndwllk8hld1"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo3i84yw8g",
      "childId": "pmndwllk8hld1"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo2vxafahz",
      "childId": "s07"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo3i84yw8g",
      "childId": "s07"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo2vxafahz",
      "childId": "pmndmvgb61us6"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo3i84yw8g",
      "childId": "pmndmvgb61us6"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo2vxafahz",
      "childId": "pmndwllk9fukl"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo3i84yw8g",
      "childId": "pmndwllk9fukl"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo2vxafahz",
      "childId": "pmndwllk96xxz"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo3i84yw8g",
      "childId": "pmndwllk96xxz"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo2vxafahz",
      "childId": "r02"
    },
    {
      "type": "parent-child",
      "parentId": "pmndo3i84yw8g",
      "childId": "r02"
    },
    {
      "type": "sibling",
      "person1Id": "pmndo3i84yw8g",
      "person2Id": "pmndya3eilyn1"
    },
    {
      "type": "sibling",
      "person1Id": "pmndo3i84yw8g",
      "person2Id": "pmndya3eiti9k"
    },
    {
      "type": "sibling",
      "person1Id": "pmndo3i84yw8g",
      "person2Id": "pmndya3eixb8j"
    },
    {
      "type": "sibling",
      "person1Id": "pmndo3i84yw8g",
      "person2Id": "pmndya3ei5vp4"
    },
    {
      "type": "sibling",
      "person1Id": "pmndo3i84yw8g",
      "person2Id": "pmndya3ei0k93"
    },
    {
      "type": "sibling",
      "person1Id": "pmndo3i84yw8g",
      "person2Id": "pmndya3eip3zu"
    },
    {
      "type": "partner",
      "person1Id": "pmndya3ei5vp4",
      "person2Id": "pmndyckredqon"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyckredqon",
      "childId": "pmndydlr61are"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3ei5vp4",
      "childId": "pmndydlr61are"
    },
    {
      "type": "partner",
      "person1Id": "pmndydlr61are",
      "person2Id": "pmndyeaduhd1o"
    },
    {
      "type": "parent-child",
      "parentId": "pmndydlr61are",
      "childId": "pmndyf12hx96x"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyeaduhd1o",
      "childId": "pmndyf12hx96x"
    },
    {
      "type": "partner",
      "person1Id": "pmndya3ei5vp4",
      "person2Id": "pmndyhcgqdpb9"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyhcgqdpb9",
      "childId": "pmndyjcrfva0k"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3ei5vp4",
      "childId": "pmndyjcrfva0k"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyhcgqdpb9",
      "childId": "pmndyjcrg5spz"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3ei5vp4",
      "childId": "pmndyjcrg5spz"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyhcgqdpb9",
      "childId": "pmndyjcrhx2b4"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3ei5vp4",
      "childId": "pmndyjcrhx2b4"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyhcgqdpb9",
      "childId": "pmndyjcripek7"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3ei5vp4",
      "childId": "pmndyjcripek7"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyhcgqdpb9",
      "childId": "pmndyjcrjsvwo"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3ei5vp4",
      "childId": "pmndyjcrjsvwo"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyhcgqdpb9",
      "childId": "pmndyjcrkl9zf"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3ei5vp4",
      "childId": "pmndyjcrkl9zf"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyhcgqdpb9",
      "childId": "pmndyjcrl3njh"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3ei5vp4",
      "childId": "pmndyjcrl3njh"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyrysy3eq7",
      "childId": "s01"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyryt0viez",
      "childId": "s01"
    },
    {
      "type": "partner",
      "person1Id": "pmndyrysy3eq7",
      "person2Id": "pmndyryt0viez"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyrysy3eq7",
      "childId": "pmndya3eilyn1"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyryt0viez",
      "childId": "pmndya3eilyn1"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyrysy3eq7",
      "childId": "pmndya3eiti9k"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyryt0viez",
      "childId": "pmndya3eiti9k"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyrysy3eq7",
      "childId": "pmndya3eixb8j"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyryt0viez",
      "childId": "pmndya3eixb8j"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyrysy3eq7",
      "childId": "pmndya3ei5vp4"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyryt0viez",
      "childId": "pmndya3ei5vp4"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyrysy3eq7",
      "childId": "pmndo3i84yw8g"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyryt0viez",
      "childId": "pmndo3i84yw8g"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyrysy3eq7",
      "childId": "pmndya3ei0k93"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyryt0viez",
      "childId": "pmndya3ei0k93"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyrysy3eq7",
      "childId": "pmndya3eip3zu"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyryt0viez",
      "childId": "pmndya3eip3zu"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyxhre0zi1",
      "childId": "pmnd79y13i65o"
    },
    {
      "type": "partner",
      "person1Id": "pmndyxhre0zi1",
      "person2Id": "pmndyy6j6wndl"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyy6j6wndl",
      "childId": "pmnd79y13i65o"
    },
    {
      "type": "partner",
      "person1Id": "pmnd7bkdrm6yz",
      "person2Id": "pmnepe8ob5cod"
    },
    {
      "type": "partner",
      "person1Id": "pmnd7cfmvqiff",
      "person2Id": "pmnepfhttgn51"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7cfmvqiff",
      "childId": "pmnepimbckf8a"
    },
    {
      "type": "parent-child",
      "parentId": "pmnepfhttgn51",
      "childId": "pmnepimbckf8a"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7cfmvqiff",
      "childId": "pmnepimbeuxuf"
    },
    {
      "type": "parent-child",
      "parentId": "pmnepfhttgn51",
      "childId": "pmnepimbeuxuf"
    },
    {
      "type": "partner",
      "person1Id": "pmnd7cuzr39r9",
      "person2Id": "pmnepl5nzikm3"
    },
    {
      "type": "partner",
      "person1Id": "pmnd7hzc067x0",
      "person2Id": "pmnepmjsmeuk6"
    },
    {
      "type": "partner",
      "person1Id": "pmnd7n0jbe5kc",
      "person2Id": "pmnepnt0eu2k2"
    },
    {
      "type": "parent-child",
      "parentId": "pmnepnt0eu2k2",
      "childId": "pmnepp0idbklv"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7n0jbe5kc",
      "childId": "pmnepp0idbklv"
    },
    {
      "type": "partner",
      "person1Id": "pmndwllk9fukl",
      "person2Id": "pmneptum4xnzi"
    },
    {
      "type": "parent-child",
      "parentId": "pmndwllk9fukl",
      "childId": "pmnepytxdqi9y"
    },
    {
      "type": "parent-child",
      "parentId": "pmneptum4xnzi",
      "childId": "pmnepytxdqi9y"
    },
    {
      "type": "parent-child",
      "parentId": "pmndwllk9fukl",
      "childId": "pmnepytxga1sz"
    },
    {
      "type": "parent-child",
      "parentId": "pmneptum4xnzi",
      "childId": "pmnepytxga1sz"
    },
    {
      "type": "parent-child",
      "parentId": "pmndwllk9fukl",
      "childId": "pmnepytxh5z3q"
    },
    {
      "type": "parent-child",
      "parentId": "pmneptum4xnzi",
      "childId": "pmnepytxh5z3q"
    },
    {
      "type": "parent-child",
      "parentId": "pmndwllk9fukl",
      "childId": "pmnepytxiuzsg"
    },
    {
      "type": "parent-child",
      "parentId": "pmneptum4xnzi",
      "childId": "pmnepytxiuzsg"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyxhre0zi1",
      "childId": "pmneq7p4nynu3"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyy6j6wndl",
      "childId": "pmneq7p4nynu3"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyxhre0zi1",
      "childId": "pmndo2vxafahz"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyy6j6wndl",
      "childId": "pmndo2vxafahz"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyxhre0zi1",
      "childId": "pmneq7p4ss5hl"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyy6j6wndl",
      "childId": "pmneq7p4ss5hl"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyxhre0zi1",
      "childId": "pmneq7p4udtvl"
    },
    {
      "type": "parent-child",
      "parentId": "pmndyy6j6wndl",
      "childId": "pmneq7p4udtvl"
    },
    {
      "type": "parent-child",
      "parentId": "f07",
      "childId": "pmnfv2r03xoij"
    },
    {
      "type": "parent-child",
      "parentId": "f06",
      "childId": "pmnfv2r03xoij"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7qhxj4baj",
      "childId": "pmnfvopdootvl"
    },
    {
      "type": "parent-child",
      "parentId": "pmnd7ej1rf33c",
      "childId": "pmnfvopdootvl"
    },
    {
      "type": "partner",
      "person1Id": "pmndya3eilyn1",
      "person2Id": "pmnfwiq4xex8n"
    },
    {
      "type": "partner",
      "person1Id": "pmndya3eilyn1",
      "person2Id": "pmnfwiq4xoz2k"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3eilyn1",
      "childId": "pmnfwl6r2lpes"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfwiq4xex8n",
      "childId": "pmnfwl6r2lpes"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3eilyn1",
      "childId": "pmnfwl6r2k67v"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfwiq4xex8n",
      "childId": "pmnfwl6r2k67v"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3eilyn1",
      "childId": "pmnfwl6r2bl6p"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfwiq4xex8n",
      "childId": "pmnfwl6r2bl6p"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3eilyn1",
      "childId": "pmnfwl6r2i0v6"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfwiq4xex8n",
      "childId": "pmnfwl6r2i0v6"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3eilyn1",
      "childId": "pmnfwl6r21xvr"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfwiq4xex8n",
      "childId": "pmnfwl6r21xvr"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3eilyn1",
      "childId": "pmnfwl6r2gzuz"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfwiq4xex8n",
      "childId": "pmnfwl6r2gzuz"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3eilyn1",
      "childId": "pmnfwl6r2niud"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfwiq4xex8n",
      "childId": "pmnfwl6r2niud"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3eilyn1",
      "childId": "pmnfwpozxyoww"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfwiq4xoz2k",
      "childId": "pmnfwpozxyoww"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3eilyn1",
      "childId": "pmnfwpozxor6n"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfwiq4xoz2k",
      "childId": "pmnfwpozxor6n"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3eilyn1",
      "childId": "pmnfwpozx8uem"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfwiq4xoz2k",
      "childId": "pmnfwpozx8uem"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3eilyn1",
      "childId": "pmnfwpozxxrih"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfwiq4xoz2k",
      "childId": "pmnfwpozxxrih"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3eilyn1",
      "childId": "pmnfwpozxh323"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfwiq4xoz2k",
      "childId": "pmnfwpozxh323"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3eilyn1",
      "childId": "pmnfwpozxxvot"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfwiq4xoz2k",
      "childId": "pmnfwpozxxvot"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3eilyn1",
      "childId": "pmnfwpozx2yhq"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfwiq4xoz2k",
      "childId": "pmnfwpozx2yhq"
    },
    {
      "type": "partner",
      "person1Id": "pmndya3ei0k93",
      "person2Id": "pmnfx2dl6dya9"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfx2dl6dya9",
      "childId": "pmnfx3knl6en8"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3ei0k93",
      "childId": "pmnfx5u9dct4w"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfx2dl6dya9",
      "childId": "pmnfx5u9dct4w"
    },
    {
      "type": "parent-child",
      "parentId": "pmndya3ei0k93",
      "childId": "pmnfx5u9dbm8a"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfx2dl6dya9",
      "childId": "pmnfx5u9dbm8a"
    },
    {
      "type": "social-parent",
      "parentId": "pmndya3ei0k93",
      "childId": "pmnfx3knl6en8"
    },
    {
      "type": "social-parent",
      "parentId": "pmndya3ei0k93",
      "childId": "pmndydlr61are"
    },
    {
      "type": "partner",
      "person1Id": "pmnfx3knl6en8",
      "person2Id": "pmnfx8zrswvz9"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfx8zrswvz9",
      "childId": "pmnfxa0in4tc9"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfx3knl6en8",
      "childId": "pmnfxa0in4tc9"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfx8zrswvz9",
      "childId": "pmnfxa0io0z5u"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfx3knl6en8",
      "childId": "pmnfxa0io0z5u"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfx8zrswvz9",
      "childId": "pmnfxa0iou6j0"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfx3knl6en8",
      "childId": "pmnfxa0iou6j0"
    },
    {
      "type": "partner",
      "person1Id": "pmnfx5u9dct4w",
      "person2Id": "pmnfxaot46h83"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfx5u9dct4w",
      "childId": "pmnfxbasnb3sh"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfxaot46h83",
      "childId": "pmnfxbasnb3sh"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfx5u9dct4w",
      "childId": "pmnfxbasnbq7c"
    },
    {
      "type": "parent-child",
      "parentId": "pmnfxaot46h83",
      "childId": "pmnfxbasnbq7c"
    },
    {
      "type": "social-parent",
      "parentId": "pmnfx2dl6dya9",
      "childId": "pmndydlr61are"
    }
  ],
  "_version": 20260330020
};
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
const DATA_VERSION = 5;

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
  const storedVersion = parseInt(localStorage.getItem(DATA_VERSION_KEY) || '0', 10);
  if (storedVersion >= DATA_VERSION) return; // al gesynchroniseerd

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
  const BASELINE_KEY = 'fb_start_baseline';
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
    // Verberg partners van deze persoon (tenzij ze zelf ouder zijn in een niet-ingeklapt gezin)
    getPartnersOf(id).forEach(pid => {
      if (!hidden.has(pid)) hidden.add(pid);
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

  // Ouders worden nooit door hun EIGEN gezin verborgen (collectDescendants
  // start bij kinderen, niet bij ouders). Ze worden alleen verborgen als ze
  // nakomeling zijn van een ANDER ingeklapt gezin — in dat geval moeten ze
  // verborgen blijven. Dus: geen cleanup nodig.

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
function resolveOverlaps(pos, verticalGroupMap) {
  // Filter verticale groep-leden (behalve eerste) — overlappen bewust
  const vgFirst = new Set();
  const vgSkip = new Set();
  if (verticalGroupMap) {
    Object.keys(verticalGroupMap).forEach(id => {
      const group = verticalGroupMap[id];
      if (!vgFirst.has(group)) {
        vgFirst.add(group);
      } else {
        vgSkip.add(id);
      }
    });
  }
  const allNodeIds = Object.keys(pos).filter(id => pos[id] && !vgSkip.has(id));
  for (let pass = 0; pass < 5; pass++) {
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
        const overlapX = a.x < b.x + NODE_W && b.x < a.x + NODE_W;
        const overlapY = a.y < b.y + NODE_H && b.y < a.y + NODE_H;
        if (overlapX && overlapY) {
          const shiftNeeded = (a.x + NODE_W + H_GAP) - b.x;
          if (shiftNeeded > 0) {
            const bY = b.y;
            allNodeIds.forEach(nid => {
              if (pos[nid] && pos[nid].y === bY && pos[nid].x >= b.x) {
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
function computeLayout(overrideIds) {
  let activeIds = overrideIds || getActivePersonIds();

  // Filter verborgen personen door ingeklapte gezinnen
  if (collapsedGezinnen.size > 0) {
    activeIds = new Set(activeIds); // kopie zodat origineel niet gemuteerd wordt
    const hidden = getHiddenByCollapse(activeIds);
    hidden.forEach(id => activeIds.delete(id));
  }

  const persons   = state.persons.filter(p => activeIds.has(p.id));
  if (persons.length === 0) return {};

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
    const TREE_EXTRA_GAP = 150; // extra ruimte tussen verschillende stambomen
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

  // --- Top-down: for each subsequent generation, place children under parents ---
  gens.filter(g => g > 0).forEach(gen => {
    const yPos = PADDING + gen * (NODE_H + V_GAP);
    const genIds = byGen[gen] || [];

    // Scheiding: kinderen met ouders in layout vs aangetrouwd (geen ouders)
    const withParents = genIds.filter(id => (parentsOf[id] || []).filter(pid => pos[pid]).length > 0);
    const inlaws     = genIds.filter(id => (parentsOf[id] || []).filter(pid => pos[pid]).length === 0);

    // Detecteer cross-family partner paren (beide hebben ouders in layout)
    const crossFamilyPartnerMap = new Map();
    withParents.forEach(id => {
      (partnersOf[id] || []).forEach(pid => {
        if (withParents.includes(pid)) {
          if (!crossFamilyPartnerMap.has(id)) crossFamilyPartnerMap.set(id, new Set());
          crossFamilyPartnerMap.get(id).add(pid);
        }
      });
    });

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

    withParents.forEach(id => {
      let ps = (parentsOf[id] || []).filter(pid => pos[pid]).sort();

      // Als dit een sociaal kind is, voeg de sociale ouder (+ diens partner) toe
      // aan de ouder-set zodat het kind in dezelfde groep terechtkomt als bio-kinderen
      if (socialChildIds.has(id) && socialParentOfChild[id]) {
        const allParents = new Set(ps);
        socialParentOfChild[id].forEach(spId => {
          if (pos[spId]) allParents.add(spId);
          // Voeg ook de partner van de sociale ouder toe
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
        // Mogelijke cross-family: zoek ghost van ouder B naast ouder A
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
          if (crossFamilyPartnerMap.has(cid) && crossFamilyPartnerMap.get(cid).has(pid)) {
            // Cross-family partner: heeft eigen ouders in layout
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

      // Check of dit gezin verticaal moet worden weergegeven
      const gezinKey = [...group.parentIds].sort().join(',');
      const isVertical = verticalGezinnen.has(gezinKey);

      if (isVertical) {
        // Verticale plaatsing: plaats eerst als 1 kolom (allemaal zelfde X, zelfde Y)
        // Na alle layout-passes worden ze verticaal uitgespreid
        let startX = parentCenter - NODE_W / 2;
        if (startX < cursorX) startX = cursorX;

        expanded.forEach((id, i) => {
          pos[id] = { x: startX, y: yPos };
        });
        // Registreer voor post-layout verticale spreiding
        const vGroupIds = expanded.slice();
        expanded.forEach(id => { verticalGroupMap[id] = vGroupIds; });
        cursorX = startX + NODE_W + H_GAP;
      } else {
        // Standaard horizontale plaatsing
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
      if (crossFamilyGhostParentCenter !== null) {
        crossFamilyChildGhosts.push({
          children: group.children,
          center: crossFamilyGhostParentCenter,
          gen: gen,
          parentIds: group.parentIds
        });
      }
    });

    // Plaats cross-family ghost-kinderen (na alle originele kinderen geplaatst zijn)
    crossFamilyChildGhosts.forEach(({ children, center, gen: childGen, parentIds }) => {
      const ghostExpanded = [];
      children.forEach(cid => {
        const ghostChildId = CROSS_GHOST_PREFIX + cid + '_cf_' + parentIds.join('_');
        ghostExpanded.push(ghostChildId);
        if (!byGen[childGen]) byGen[childGen] = [];
        if (!byGen[childGen].includes(ghostChildId)) byGen[childGen].push(ghostChildId);
        genOf[ghostChildId] = childGen;
        ghostMeta[ghostChildId] = { personId: cid, adjacentTo: parentIds[1] };
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

  // --- Cross-family childrenOf fix: voorkom dubbele cascade ---
  // Na het bepalen van crossFamilyChildAnchor, verwijder cross-family kinderen
  // uit childrenOf voor de niet-anchor ouder. Zo cascaden alle ouder-shifts
  // alleen via de anchor-ouder naar de kinderen.
  Object.entries(crossFamilyChildAnchor).forEach(([childId, anchorParentId]) => {
    // Vind alle ouders van dit kind
    const allParents = (parentsOf[childId] || []);
    allParents.forEach(pid => {
      if (pid !== anchorParentId && childrenOf[pid]) {
        childrenOf[pid] = childrenOf[pid].filter(cid => cid !== childId);
      }
    });
  });

  // --- Compactie (vóór bottom-up): sluit gaten op elke generatie ---
  // Door eerst te compacteren, worden kinderen dichter bij elkaar geplaatst.
  // De bottom-up centering die hierna volgt plaatst ouders dan ook dichter bij elkaar.
  // Gebruik de verticale-snijlijn methode: schuif alleen als er op ALLE generaties
  // voldoende ruimte is, zodat er geen overlaps ontstaan.
  for (let cPass = 0; cPass < 3; cPass++) {
    const allIds = Object.keys(pos);
    const maxX = Math.max(...allIds.map(id => pos[id].x + NODE_W));

    for (let scanX = PADDING + H_GAP; scanX < maxX; scanX += H_GAP) {
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

      for (const id of allIds) {
        if (pos[id].x >= scanX) pos[id].x -= shift;
      }
      scanX -= shift;
    }
  }

  // --- Bouw ghost-adjacentie map voor cascade ---
  // Zodat ghosts meeschuiven als hun partner verschuift
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
    (childrenOf[id] || []).forEach(cid => {
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
          (childrenOf[id] || []).forEach(cid => {
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
        (childrenOf[id] || []).forEach(cid => {
          if (pos[cid] && !cascaded.has(cid)) {
            cascaded.add(cid);
            shiftWithDescendants(cid, dx);
          }
        });
      }
    });
  });

  // --- Finale fixOverlaps: de bottom-up cascade kan overlaps op lagere generaties
  // veroorzaken (ouder verschuift → kinderen cascaden → overlap met buren).
  // Eén extra fixOverlaps-pass lost dit op.
  gens.forEach(gen => fixOverlaps(gen));

  // --- Compactie: schuif alles rechts van verticale snijlijnen naar links ---
  // Scan x-as in stappen en zoek verticale "snijlijnen" waar er op ALLE generaties
  // voldoende ruimte is. Schuif alles rechts van de snijlijn naar links.
  for (let pass = 0; pass < 3; pass++) {
    // Verzamel alle node-rechterkanten, gesorteerd
    const allPositions = Object.entries(pos).map(([id, p]) => ({
      id, x: p.x, right: p.x + NODE_W, gen: genOf[id]
    }));
    allPositions.sort((a, b) => a.x - b.x);
    if (!allPositions.length) break;

    // Scan van links naar rechts: zoek x-posities waar alles links ervan
    // gescheiden is van alles rechts ervan door minstens H_GAP op ELKE generatie
    const maxX = Math.max(...allPositions.map(p => p.right));
    const step = H_GAP; // scan in fijne stappen

    for (let scanX = PADDING + step; scanX < maxX; scanX += step) {
      // Voor elke generatie: vind de maximale rechterrand links van scanX
      // en de minimale linkerrand rechts van (of op) scanX
      let minGap = Infinity;
      let hasLeft = false, hasRight = false;

      gens.forEach(gen => {
        const members = (byGen[gen] || []).filter(id => pos[id]);
        if (!members.length) return;

        let maxRight = -Infinity;  // rechterrand van nodes links van scanX
        let minLeft = Infinity;    // linkerrand van nodes rechts van scanX

        members.forEach(id => {
          if (pos[id].x + NODE_W <= scanX) {
            maxRight = Math.max(maxRight, pos[id].x + NODE_W);
            hasLeft = true;
          } else if (pos[id].x >= scanX) {
            minLeft = Math.min(minLeft, pos[id].x);
            hasRight = true;
          }
          // Nodes die scanX kruisen: gap = 0
          else {
            minGap = 0;
          }
        });

        if (maxRight > -Infinity && minLeft < Infinity) {
          const genGap = minLeft - maxRight;
          if (genGap < minGap) minGap = genGap;
        }
      });

      if (!hasLeft || !hasRight || minGap <= H_GAP) continue;

      // Er is een snijlijn bij scanX met minGap > H_GAP op alle generaties
      const shift = minGap - H_GAP;
      if (shift < 2) continue;

      // Schuif alles met x >= scanX naar links
      for (const id of Object.keys(pos)) {
        if (pos[id].x >= scanX) pos[id].x -= shift;
      }

      // Na verschuiving: scanX aanpassen (volgende scan start eerder)
      scanX -= shift;
    }
  }

  // Normalize so minimum is at PADDING
  const allX = Object.values(pos).map(p => p.x);
  const minX = Math.min(...allX);
  if (minX < PADDING) {
    const shift = PADDING - minX;
    Object.values(pos).forEach(p => { p.x += shift; });
  }

  // KERNREGEL: geen overlappende kaarten
  resolveOverlaps(pos, verticalGroupMap);

  // --- Post-layout: spreid verticale groepen uit ---
  const processedVGroups = new Set();
  Object.keys(verticalGroupMap).forEach(id => {
    const group = verticalGroupMap[id];
    const groupKey = group.join(',');
    if (processedVGroups.has(groupKey)) return;
    processedVGroups.add(groupKey);
    const validMembers = group.filter(gid => pos[gid]);
    if (validMembers.length < 2) return;
    const baseX = pos[validMembers[0]].x;
    const baseY = pos[validMembers[0]].y;
    validMembers.forEach((gid, i) => {
      pos[gid].x = baseX;
      pos[gid].y = baseY + i * (NODE_H + V_GAP * 0.5);
    });
  });

  // --- Cross-family ghosts: extraheer uit pos ---
  const crossFamilyGhosts = {};
  Object.keys(pos).forEach(id => {
    if (id.startsWith(CROSS_GHOST_PREFIX)) {
      const meta = ghostMeta[id];
      if (meta && pos[id]) {
        crossFamilyGhosts[meta.personId + ':cg:' + meta.adjacentTo] = {
          x: pos[id].x,
          y: pos[id].y,
          personId: meta.personId,
          adjacentTo: meta.adjacentTo
        };
      }
      delete pos[id];
    }
  });

  return { pos, crossFamilyGhosts };
}

// ============================================================
// SVG LINE RENDERING
// ============================================================
function renderLines(pos, treeRanges, treePositions, duplicates) {
  const svg = document.getElementById('svg-lines');
  const parts = [];

  // ── Bouw set van cross-family partner paren waarvoor ghosts bestaan ──
  const crossFamilySkipPairs = new Set();
  if (duplicates) {
    Object.values(duplicates).forEach(dup => {
      if (dup.adjacentTo) {
        // Dit is een cross-family ghost: skip de lange partner-lijn
        const pairKey = [dup.personId, dup.adjacentTo].sort().join('|');
        crossFamilySkipPairs.add(pairKey);
      }
    });
  }

  // ── Helper: teken alle relatielijnen voor een gegeven positie-map ──
  function drawLinesForPositions(lpos) {
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

      parts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="partner-line"/>`);
    });

    // Parent-child lines (gegroepeerd per ouder-set)
    const familyGroups = new Map();
    state.relationships.forEach(r => {
      if (r.type !== 'parent-child') return;
      if (!pids.has(r.parentId) || !pids.has(r.childId)) return;
      const allParentsOfChild = state.relationships
        .filter(rel => rel.type === 'parent-child' && rel.childId === r.childId)
        .map(rel => rel.parentId)
        .filter(pid => pids.has(pid))
        .sort();
      const key = allParentsOfChild.join(',');
      if (!familyGroups.has(key)) {
        familyGroups.set(key, { parents: allParentsOfChild, children: new Set() });
      }
      familyGroups.get(key).children.add(r.childId);
    });

    familyGroups.forEach(({ parents, children }) => {
      const validParents  = parents.filter(pid => lpos[pid]);
      const validChildren = [...children].filter(cid => lpos[cid]);
      if (!validParents.length || !validChildren.length) return;

      // --- Fix A: Cross-family aware drop point ---
      // Als ouders > 2*(NODE_W+H_GAP) uit elkaar staan, gebruik alleen de ouder
      // die het dichtst bij de kinderen staat. Ghost-kinderen worden apart afgehandeld (Fix C).
      let effectiveParents = validParents;
      if (validParents.length === 2) {
        const CROSS_THRESHOLD = 2 * (NODE_W + H_GAP);
        const dist = Math.abs(lcx(validParents[0]) - lcx(validParents[1]));
        if (dist > CROSS_THRESHOLD) {
          // Bepaal welke ouder het dichtst bij de kinderen staat
          const childCenterX = validChildren.reduce((s, cid) => s + lcx(cid), 0) / validChildren.length;
          const dist0 = Math.abs(lcx(validParents[0]) - childCenterX);
          const dist1 = Math.abs(lcx(validParents[1]) - childCenterX);
          // Gebruik alleen de dichtstbijzijnde ouder; de andere wordt via ghost-kinderen afgehandeld
          effectiveParents = dist0 <= dist1 ? [validParents[0]] : [validParents[1]];
        }
      }

      const parentCXs = effectiveParents.map(pid => lcx(pid));
      const dropX = parentCXs.reduce((s, x) => s + x, 0) / parentCXs.length;
      const dropY = Math.max(...validParents.map(pid => lbotY(pid)));
      const childTopY = Math.min(...validChildren.map(cid => ltopY(cid)));
      const midDropY  = dropY + (childTopY - dropY) * 0.45;

      parts.push(`<line x1="${dropX}" y1="${dropY}" x2="${dropX}" y2="${midDropY}" class="child-line"/>`);

      validChildren.sort((a, b) => lcx(a) - lcx(b));

      // Splits kinderen in clusters: als het gat tussen opeenvolgende kinderen
      // groter is dan 2× (NODE_W + H_GAP), breek de horizontale balk.
      // Dit voorkomt dat kinderen die als aangetrouwde partner ver weg staan
      // visueel verbonden worden met hun broers/zussen.
      const GAP_THRESHOLD = 2 * (NODE_W + H_GAP);
      const clusters = [[]];
      validChildren.forEach((cid, i) => {
        if (i > 0 && lcx(cid) - lcx(validChildren[i - 1]) > GAP_THRESHOLD) {
          clusters.push([]);
        }
        clusters[clusters.length - 1].push(cid);
      });

      // Bepaal of er meerdere clusters zijn (= er is minstens 1 kind ver weg)
      const hasDistantClusters = clusters.length > 1;
      // Voor verre clusters: gebruik een offset-Y zodat de connector niet
      // visueel samensmelt met horizontale balken van andere familiegroepen
      const connectorOffsetY = 28;

      clusters.forEach(cluster => {
        if (cluster.length === 1) {
          const cid = cluster[0];
          const dist = Math.abs(lcx(cid) - dropX);
          if (dist > GAP_THRESHOLD && hasDistantClusters) {
            // Kind is ver van de ouders — teken connector via offset-Y
            const offsetY = midDropY + connectorOffsetY;
            // Horizontale lijn van drop point naar boven het kind
            parts.push(`<line x1="${dropX}" y1="${midDropY}" x2="${dropX}" y2="${offsetY}" class="child-line"/>`);
            parts.push(`<line x1="${dropX}" y1="${offsetY}" x2="${lcx(cid)}" y2="${offsetY}" class="child-line"/>`);
            // Verticale lijn naar het kind
            parts.push(`<line x1="${lcx(cid)}" y1="${offsetY}" x2="${lcx(cid)}" y2="${ltopY(cid)}" class="child-line"/>`);
          } else {
            parts.push(`<line x1="${dropX}" y1="${midDropY}" x2="${lcx(cid)}" y2="${midDropY}" class="child-line"/>`);
            parts.push(`<line x1="${lcx(cid)}" y1="${midDropY}" x2="${lcx(cid)}" y2="${ltopY(cid)}" class="child-line"/>`);
          }
        } else {
          const leftX  = lcx(cluster[0]);
          const rightX = lcx(cluster[cluster.length - 1]);
          // Check of het drop point binnen het cluster valt
          const dropInCluster = dropX >= leftX && dropX <= rightX;

          if (dropInCluster || !hasDistantClusters) {
            // Standaard: horizontale balk op midDropY (drop point zit in dit cluster)
            parts.push(`<line x1="${leftX}" y1="${midDropY}" x2="${rightX}" y2="${midDropY}" class="child-line"/>`);
            cluster.forEach(cid => {
              parts.push(`<line x1="${lcx(cid)}" y1="${midDropY}" x2="${lcx(cid)}" y2="${ltopY(cid)}" class="child-line"/>`);
            });
          } else {
            // Ver cluster: teken balk en connector op een offset-Y zodat ze
            // niet overlappen met horizontale balken van andere familiegroepen.
            const offsetY = midDropY + connectorOffsetY;
            // Horizontale balk per cluster op offset-Y
            parts.push(`<line x1="${leftX}" y1="${offsetY}" x2="${rightX}" y2="${offsetY}" class="child-line"/>`);
            // Connector van drop punt naar cluster op offset-Y
            const connectX = dropX < leftX ? leftX : (dropX > rightX ? rightX : dropX);
            parts.push(`<line x1="${dropX}" y1="${midDropY}" x2="${dropX}" y2="${offsetY}" class="child-line"/>`);
            parts.push(`<line x1="${dropX}" y1="${offsetY}" x2="${connectX}" y2="${offsetY}" class="child-line"/>`);
            // Verticale lijnen van balk naar elk kind
            cluster.forEach(cid => {
              parts.push(`<line x1="${lcx(cid)}" y1="${offsetY}" x2="${lcx(cid)}" y2="${ltopY(cid)}" class="child-line"/>`);
            });
          }
        }
      });
    });
  }

  // ── Lijnen tekenen ──
  if (activeTreeId === null && treePositions && Object.keys(treePositions).length) {
    // Alle-families modus met per-boom posities: teken lijnen PER stamboom-eiland
    Object.values(treePositions).forEach(treePos => drawLinesForPositions(treePos));
  } else {
    // Enkele stamboom of unified alle-families modus: teken vanuit pos
    drawLinesForPositions(pos);
  }

  // Duplicaat-verbindingslijnen: lichtblauwe stippellijn tussen dezelfde persoon
  // op verschillende plekken in het canvas
  if (duplicates) {
    const drawnDupLinks = new Set();
    Object.values(duplicates).forEach(dup => {
      if (!dup.personId || !pos[dup.personId]) return;
      const linkKey = dup.personId + ':' + (dup.treeHeadId || '');
      if (drawnDupLinks.has(linkKey)) return;
      drawnDupLinks.add(linkKey);

      const x1 = pos[dup.personId].x + NODE_W / 2;
      const y1 = pos[dup.personId].y + NODE_H / 2;
      const x2 = dup.x + NODE_W / 2;
      const y2 = dup.y + NODE_H / 2;

      const horizDist = Math.abs(x2 - x1);
      const vertDist  = Math.abs(y2 - y1);
      const dist = Math.sqrt(horizDist * horizDist + vertDist * vertDist);
      if (dist < NODE_W) return; // te dicht, skip
      const dip  = Math.max(40, dist * 0.1);
      const mx   = (x1 + x2) / 2;
      const my   = Math.min(y1, y2) - dip;

      parts.push(`<path d="M ${x1} ${y1} Q ${mx} ${my}, ${x2} ${y2}" class="duplicate-link"/>`);
    });
  }

  // ── Cross-family ghost partner lijnen en duplicate-links ──
  if (duplicates) {
    Object.values(duplicates).forEach(dup => {
      if (!dup.adjacentTo || !pos[dup.adjacentTo]) return;
      // Teken korte partner-lijn tussen ghost en de aangrenzende persoon
      const realX = pos[dup.adjacentTo].x;
      const ghostX = dup.x;
      const leftX = Math.min(realX, ghostX);
      const rightX = Math.max(realX, ghostX);
      const y = pos[dup.adjacentTo].y + NODE_H / 2;
      const x1 = leftX + NODE_W;
      const x2 = rightX;
      if (x2 > x1) {
        parts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="partner-line"/>`);
      }
      // Teken gebogen duplicate-link van real positie naar ghost
      if (pos[dup.personId]) {
        const rx = pos[dup.personId].x + NODE_W / 2;
        const ry = pos[dup.personId].y + NODE_H / 2;
        const gx = dup.x + NODE_W / 2;
        const gy = dup.y + NODE_H / 2;
        const horizDist = Math.abs(gx - rx);
        const vertDist  = Math.abs(gy - ry);
        const dist = Math.sqrt(horizDist * horizDist + vertDist * vertDist);
        if (dist > NODE_W) { // Alleen tekenen als ver genoeg uit elkaar
          const dip = Math.max(40, dist * 0.1);
          const mx  = (rx + gx) / 2;
          const my  = Math.min(ry, gy) - dip;
          parts.push(`<path d="M ${rx} ${ry} Q ${mx} ${my}, ${gx} ${gy}" class="duplicate-link"/>`);
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

    // Groepeer ghost-kinderen per ouder-set (adjacentTo + mede-ouder)
    const ghostChildFamilies = new Map();
    ghostChildren.forEach(gc => {
      // Vind alle ouders van dit kind
      const parentIds = state.relationships
        .filter(r => r.type === 'parent-child' && r.childId === gc.personId)
        .map(r => r.parentId)
        .sort();
      const key = parentIds.join(',') + ':' + (gc.treeHeadId || '');
      if (!ghostChildFamilies.has(key)) {
        ghostChildFamilies.set(key, { parentIds, children: [], treeHeadId: gc.treeHeadId });
      }
      ghostChildFamilies.get(key).children.push(gc);
    });

    // Teken lijnen voor elke ghost-kind familie
    ghostChildFamilies.forEach(({ parentIds, children, treeHeadId }) => {
      // Vind ghost-ouder posities: duplicates van de ouders in dezelfde boom,
      // of de adjacentTo ouder (die in pos staat)
      const ghostParentPositions = [];
      parentIds.forEach(pid => {
        // Zoek ghost-ouder in duplicates (zelfde boom)
        const ghostParent = dupArr.find(d =>
          d.personId === pid && d.adjacentTo && d.treeHeadId === treeHeadId
        );
        if (ghostParent) {
          ghostParentPositions.push({ x: ghostParent.x + NODE_W / 2, y: ghostParent.y + NODE_H });
        } else if (pos[pid]) {
          // Originele positie als fallback (als ouder in pos staat in deze buurt)
          const avgChildX = children.reduce((s, c) => s + c.x, 0) / children.length;
          const dist = Math.abs(pos[pid].x - avgChildX);
          if (dist < 3 * (NODE_W + H_GAP)) {
            ghostParentPositions.push({ x: pos[pid].x + NODE_W / 2, y: pos[pid].y + NODE_H });
          }
        }
      });

      if (!ghostParentPositions.length || !children.length) return;

      const dropX = ghostParentPositions.reduce((s, p) => s + p.x, 0) / ghostParentPositions.length;
      const dropY = Math.max(...ghostParentPositions.map(p => p.y));
      const childTopY = Math.min(...children.map(c => c.y));
      const midDropY = dropY + (childTopY - dropY) * 0.45;

      // Verticale lijn van ouders naar midDropY
      parts.push(`<line x1="${dropX}" y1="${dropY}" x2="${dropX}" y2="${midDropY}" class="child-line"/>`);

      // Sorteer kinderen op x-positie
      children.sort((a, b) => a.x - b.x);
      const childCXs = children.map(c => c.x + NODE_W / 2);

      if (children.length === 1) {
        const cx = childCXs[0];
        parts.push(`<line x1="${dropX}" y1="${midDropY}" x2="${cx}" y2="${midDropY}" class="child-line"/>`);
        parts.push(`<line x1="${cx}" y1="${midDropY}" x2="${cx}" y2="${children[0].y}" class="child-line"/>`);
      } else {
        const leftX = childCXs[0];
        const rightX = childCXs[childCXs.length - 1];
        // Horizontale balk
        parts.push(`<line x1="${leftX}" y1="${midDropY}" x2="${rightX}" y2="${midDropY}" class="child-line"/>`);
        // Verticale lijnen naar elk ghost-kind
        children.forEach((c, i) => {
          parts.push(`<line x1="${childCXs[i]}" y1="${midDropY}" x2="${childCXs[i]}" y2="${c.y}" class="child-line"/>`);
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
    div.addEventListener('click', () => openDetailModal(person.id));

    container.appendChild(div);
  });

  // ── Duplicaat-kaarten: personen die in meerdere stambomen voorkomen ───────
  if (ghosts && Object.keys(ghosts).length) {
    Object.entries(ghosts).forEach(([key, g]) => {
      const person = getPerson(g.personId);
      if (!person) return;
      const gClass = person.gender === 'm' ? 'male' : person.gender === 'f' ? 'female' : 'unknown';
      const dupDiv = document.createElement('div');
      dupDiv.className = `card ${gClass} duplicate-card`;
      dupDiv.dataset.id = person.id;
      dupDiv.style.left = g.x + 'px';
      dupDiv.style.top  = g.y + 'px';
      const avatarHtml = person.photo
        ? `<div class="card-avatar" style="background:none;padding:0;overflow:hidden"><img src="${escHtml(person.photo)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`
        : `<div class="card-avatar">${initials(person.name)}</div>`;
      dupDiv.innerHTML = `
        <div class="duplicate-badge" title="Komt ook voor in andere stamboom">🔗</div>
        <div class="card-top">
          ${avatarHtml}
          <div class="card-info">
            <div class="card-name">${escHtml(person.name)}</div>
            ${person.birthdate ? `<div class="card-years">${escHtml(formatBirthdate(person.birthdate))}${person.deathdate ? ` – ${escHtml(formatBirthdate(person.deathdate))}` : person.deceased ? ' – overleden' : ''}</div>` : ''}
            ${person.family ? `<div class="card-years">${escHtml(person.family)}</div>` : ''}
          </div>
        </div>`;
      dupDiv.addEventListener('click', () => openDetailModal(person.id));
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

  // ── UNIFIED LAYOUT: alle personen in één computeLayout() call ──
  // Dit garandeert dat kinderen ALTIJD onder hun ouders staan,
  // ongeacht of ze tot verschillende stambomen behoren.
  const allPersonIds = new Set();
  stambomen.forEach(s => {
    candidateSets[s.headId].forEach(id => allPersonIds.add(id));
  });

  // Voeg partners toe die nog niet in de set zitten
  const extraPartners = new Set();
  allPersonIds.forEach(id => {
    getPartnersOf(id).forEach(pid => {
      if (!allPersonIds.has(pid)) extraPartners.add(pid);
    });
  });
  extraPartners.forEach(id => allPersonIds.add(id));

  // Eén unified layout voor alle personen
  const layoutResult = computeLayout(allPersonIds);
  const pos = layoutResult.pos || {};
  const crossFamilyGhosts = layoutResult.crossFamilyGhosts || {};

  if (!Object.keys(pos).length) return { positions: {}, duplicates: {}, treePositions: {}, treeRanges: {} };

  // ── Bereken treeRanges vanuit de unified posities ──
  // Wijs elke persoon toe aan hun primaire stamboom
  const LABEL_H = 56;
  const personToTree = {};

  // Sorteer stambomen van groot naar klein zodat de grootste boom
  // prioriteit krijgt bij het claimen van gedeelde personen
  const sortedStambomen = [...stambomen].sort((a, b) =>
    candidateSets[b.headId].size - candidateSets[a.headId].size
  );

  sortedStambomen.forEach(s => {
    const treePersons = candidateSets[s.headId];
    treePersons.forEach(pid => {
      if (!personToTree[pid] && pos[pid]) {
        personToTree[pid] = s.headId;
      }
    });
  });

  // Partners die nog geen boom hebben: wijs toe aan de boom van hun partner
  Object.keys(pos).forEach(pid => {
    if (personToTree[pid]) return;
    const partners = getPartnersOf(pid);
    for (const partnerId of partners) {
      if (personToTree[partnerId]) {
        personToTree[pid] = personToTree[partnerId];
        break;
      }
    }
  });

  // Bereken bounding boxes per stamboom
  const treeRanges = {};
  stambomen.forEach(s => {
    const treePersonIds = Object.keys(personToTree).filter(pid =>
      personToTree[pid] === s.headId && pos[pid]
    );
    if (!treePersonIds.length) return;

    const xs = treePersonIds.map(pid => pos[pid].x);
    const ys = treePersonIds.map(pid => pos[pid].y);
    const head = getPerson(s.headId);
    const familyName = head?.family || head?.name?.split(' ').slice(-1)[0] || s.label;

    treeRanges[s.headId] = {
      minX: Math.min(...xs) - PADDING / 3,
      maxX: Math.max(...xs) + NODE_W + PADDING / 3,
      minY: Math.min(...ys) - LABEL_H,
      maxY: Math.max(...ys) + NODE_H,
      label: familyName,
      count: treePersonIds.length
    };
  });

  // Cross-family ghosts → duplicates formaat
  const duplicates = {};
  Object.entries(crossFamilyGhosts).forEach(([key, g]) => {
    duplicates[key] = g;
  });

  // treePositions is leeg: unified layout tekent alle lijnen vanuit pos
  return { positions: pos, duplicates, treePositions: {}, treeRanges };
}

// ============================================================
// FULL RENDER
// ============================================================
// ============================================================
// COLLAPSE TOGGLES
// ============================================================
function renderCollapseToggles(pos) {
  const container = document.getElementById('cards-container');
  container.querySelectorAll('.gezin-toggle').forEach(el => el.remove());

  // Verzamel alle gezinnen: groepeer kinderen per ouderpaar
  const gezinMap = {}; // key → { parentIds, childIds }
  state.relationships.forEach(r => {
    if (r.type !== 'parent-child') return;
    if (!pos[r.parentId]) return; // ouder niet in layout
    const childParents = getParentsOf(r.childId).filter(pid => pos[pid] || collapsedGezinnen.size > 0).sort();
    if (childParents.length === 0) return;
    // Gebruik alleen ouders die in pos staan OF wiens gezin ingeklapt is
    const visibleParents = childParents.filter(pid => pos[pid]);
    if (visibleParents.length === 0) return;
    const key = visibleParents.sort().join(',');
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

    // Heeft dit gezin zichtbare kinderen of verborgen kinderen?
    const hasVisibleChildren = [...gezin.childIds].some(cid => pos[cid]);
    if (!hasVisibleChildren && !isCollapsed) return; // geen kinderen in layout en niet ingeklapt

    // Positie: midden-onder het ouderpaar
    const parentPositions = gezin.parentIds.map(pid => pos[pid]).filter(Boolean);
    if (!parentPositions.length) return;
    const midX = parentPositions.reduce((sum, p) => sum + p.x + NODE_W / 2, 0) / parentPositions.length;
    const bottomY = Math.max(...parentPositions.map(p => p.y + NODE_H));

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

    // Verticaal-toggle knop bij elk gezin met kinderen
    if (!isCollapsed && gezin.childIds.size >= 1) {
      const isVert = verticalGezinnen.has(key);
      const vBtn = document.createElement('div');
      vBtn.className = 'gezin-toggle vertical-toggle' + (isVert ? ' active' : '');
      vBtn.style.left = (midX + 24) + 'px';
      vBtn.style.top  = (bottomY + 6) + 'px';
      vBtn.innerHTML = isVert ? '═' : '║';
      vBtn.title = isVert ? 'Horizontaal weergeven' : 'Verticaal stapelen';
      vBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleVerticalGezin(key);
      });
      container.appendChild(vBtn);
    }
  });
}

function render() {
  let pos, ghosts = {}, treeRanges = null, treePositions = null, duplicates = {};
  if (activeTreeId === null && state.persons.length > 0) {
    const result = computeAllFamiliesLayout();
    pos = result.positions;
    ghosts = result.duplicates || {};
    duplicates = result.duplicates || {};
    treePositions = result.treePositions || {};
    treeRanges = result.treeRanges;
  } else {
    const layoutResult = computeLayout();
    pos = layoutResult.pos;
    // Cross-family ghosts: personen die in twee ouder-groepen voorkomen
    const crossGhosts = layoutResult.crossFamilyGhosts || {};
    Object.entries(crossGhosts).forEach(([key, g]) => {
      ghosts[key] = g;
      duplicates[key] = g;
    });
  }
  lastPositions = pos;
  renderLines(pos, treeRanges, treePositions, duplicates);
  renderCards(pos, treeRanges, ghosts);
  renderTreeLabels(pos, treeRanges);
  renderCollapseToggles(pos);
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
// Token wordt opgeslagen via de browser console: setGhToken('ghp_...')
const GH_TOKEN = localStorage.getItem('fb_gh_token') || '';
const GH_REPO  = 'Kalantari020/familie-stamboom';
const GH_FILE  = 'data/publish-state.json';
window.setGhToken = t => { localStorage.setItem('fb_gh_token', t); location.reload(); };

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
