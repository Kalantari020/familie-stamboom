/* Coaching Platform — Scoring engine
   Implementeert het model uit SCORING.md:
     vraag -> dimensie -> punten -> dimensiescore -> ruwe totaalscore
     -> foundation floor -> level -> hefboom -> klantweergave
   Pure functies, geen DOM. Browser: globale Scoring. Node: module.exports. */

(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- 1. Dimensies */

  const DIMENSIONS = {
    F: { key: 'F', label: 'Gezond fundament',            weight: 0.25 },
    S: { key: 'S', label: 'Structuur & organisatie',     weight: 0.20 },
    R: { key: 'R', label: 'Richting',                    weight: 0.15 },
    D: { key: 'D', label: 'Discipline & consistentie',   weight: 0.15 },
    O: { key: 'O', label: 'Ownership & verantwoordelijkheid', weight: 0.15 },
    C: { key: 'C', label: 'Readiness & commitment',      weight: 0.10 }
  };

  const DIM_ORDER = ['F', 'S', 'R', 'D', 'O', 'C'];

  /* Draagvermogen: welk deel van de score zegt iets over "kun je jezelf dragen".
     Alleen F, S en D tellen mee in de fundamentindex. Richting, ownership en
     commitment zijn richtinggevend, geen draagvermogen. */
  const FOUNDATION_INDEX = { F: 0.45, S: 0.35, D: 0.20 };

  /* Hefboomprioriteit: bij gelijke achterstand pakken we eerst het fundament.
     Dit is de "fundament-first" regel binnen de focusbepaling. */
  const LEVERAGE_PRIORITY = { F: 1.30, S: 1.25, D: 1.15, O: 1.00, R: 0.90, C: 0.80 };

  const CAP_MARGIN = 15;   // totaal mag max 15 punten boven de fundamentindex uitkomen

  const LEVELS = [
    { level: 1, name: 'Fundament',      min: 0,  minFI: 0,  blurb: 'Basis stabiliseren.' },
    { level: 2, name: 'Stabiliteit',    min: 45, minFI: 0,  blurb: 'Consistentie en structuur opbouwen.' },
    { level: 3, name: 'Groei',          min: 65, minFI: 60, blurb: 'Gericht werken aan grotere persoonlijke doelen.' },
    { level: 4, name: 'Zelfstandigheid',min: 85, minFI: 75, blurb: 'Zelfstandig keuzes maken, bijsturen en blijven groeien.' }
  ];

  /* ---------------------------------------------------------------- 2. Helpers */

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);
  const txt = (v) => (typeof v === 'string' ? v.trim() : '');
  const words = (s) => txt(s).split(/\s+/).filter(Boolean).length;

  /* 1-10 -> 0-100. Bewust (x-1)/9 en niet x*10: een 1 betekent "niets", niet "10 punten". */
  function scale10(v) {
    const n = num(v);
    if (n === null) return null;
    return clamp((n - 1) / 9 * 100, 0, 100);
  }

  /* Rubriek 0-3 -> 0-100 */
  const rubric100 = (r) => clamp(r / 3 * 100, 0, 100);

  const CONCRETE = /(\b\d+\b|elke|iedere|per (dag|week|maand)|dagelijks|wekelijks|'?s ochtends|'?s avonds|uur|minuten|keer per|voor \d|om \d|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)/i;
  const VAGUE_ONLY = /^(?=.*\b(meer|minder|beter|gezonder|fitter|rustiger|harder|gewoon|proberen|misschien)\b)(?!.*(\d|elke|iedere|per (dag|week|maand)|dagelijks|stoppen met|elke ochtend)).*$/i;

  /* Automatische rubriek voor open vragen waar HELDERHEID en CONCREETHEID
     daadwerkelijk in de tekst zichtbaar zijn. Altijd provisional:
     de coach kan elke waarde overschrijven. */
  function autoRubric(text) {
    const w = words(text);
    if (w === 0) return null;   // niet ingevuld is niet hetzelfde als slecht ingevuld
    let r;
    if (w < 4) r = 0.5;
    else if (w < 12) r = 1.5;
    else if (w < 30) r = 2.2;
    else r = 2.6;
    const why = [];
    if (CONCRETE.test(text)) { r += 0.5; why.push('bevat concrete tijd/aantal'); }
    if (VAGUE_ONLY.test(text)) { r -= 0.6; why.push('alleen richtingwoorden, geen concreta'); }
    // Ondergrens 0,3: wie antwoordt maar onbruikbaar antwoordt scoort laag,
    // maar nooit gelijk aan "niets ingevuld".
    return { r: clamp(r, 0.3, 3), provisional: true, why: why.join(', ') || (w + ' woorden') };
  }

  /* ---------------------------------------------------------------- 3. Domein-classificatie
     Gebruikt voor de coherentiecheck (Q7 / Q12 / Q23) en voor de vertaling van
     de keuzevraag Q23 naar een domein. Bewust grof: het is een signaal, geen diagnose. */

  const DOMAIN_WORDS = {
    slaap:      /slaap|slapen|bedtijd|uitgerust|moe|vroeg op|nachtrust/i,
    voeding:    /eten|voeding|dieet|suiker|afvallen|calorie|koken|gezonder eten/i,
    beweging:   /sport|bewegen|fitness|gym|hardlopen|trainen|conditie|kracht/i,
    structuur:  /structuur|ritme|dagindeling|ochtend|routine|planning van mijn dag/i,
    planning:   /plannen|planning|agenda|organis|administratie|overzicht|to.?do/i,
    discipline: /discipline|volhouden|consistent|doorzetten|uitstel|procrast|motivatie/i,
    geld:       /geld|financ|schuld|sparen|inkomen|budget/i,
    werk:       /werk|carriere|carrière|baan|studie|business|onderneming/i,
    omgeving:   /omgeving|vrienden|mensen om me heen|relatie|partner|gezin|familie/i,
    scherm:     /telefoon|social media|instagram|tiktok|scherm|netflix|youtube|gamen/i
  };

  function classifyDomain(text) {
    const t = txt(text);
    if (!t) return null;
    for (const [dom, re] of Object.entries(DOMAIN_WORDS)) if (re.test(t)) return dom;
    return null;
  }

  const Q23_DOMAIN = {
    'Slaap & rust': 'slaap',
    'Voeding & gezondheid': 'voeding',
    'Beweging & conditie': 'beweging',
    'Dagstructuur': 'structuur',
    'Planning & organisatie': 'planning',
    'Discipline & volhouden': 'discipline',
    'Geld': 'geld',
    'Werk & carrière': 'werk',
    'Mijn omgeving': 'omgeving',
    'Ik weet het niet': null,
    'Anders': null
  };

  /* Q23 telt mee in ownership: waar legt hij de oorzaak?
     Intern en benoembaar scoort hoger dan extern of "ik weet het niet". */
  const Q23_OWNERSHIP = {
    'Slaap & rust': 85, 'Voeding & gezondheid': 85, 'Beweging & conditie': 85,
    'Dagstructuur': 90, 'Planning & organisatie': 90, 'Discipline & volhouden': 95,
    'Geld': 70, 'Werk & carrière': 70, 'Mijn omgeving': 35,
    'Ik weet het niet': 25, 'Anders': 60
  };

  /* ---------------------------------------------------------------- 4. Component-resolvers */

  function slaapComponent(a) {
    const s = scale10(a.q15_s);
    const bed = txt(a.q15_bed), rise = txt(a.q15_rise);
    if (!bed || !rise) return s === null ? null : { v: s, note: 'alleen tevredenheid' };
    const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t); return m ? (+m[1] * 60 + +m[2]) : null; };
    const b = toMin(bed), r = toMin(rise);
    if (b === null || r === null) return s === null ? null : { v: s, note: 'alleen tevredenheid' };
    let dur = (r - b + 1440) % 1440;
    let durScore;
    if (dur >= 420 && dur <= 540) durScore = 100;        // 7-9 uur
    else if (dur >= 360 && dur < 420) durScore = 65;     // 6-7 uur
    else if (dur > 540 && dur <= 600) durScore = 75;     // 9-10 uur
    else durScore = 30;
    const v = s === null ? durScore : (s * 0.7 + durScore * 0.3);
    return { v, note: (dur / 60).toFixed(1) + ' uur in bed' };
  }

  function bewegingScore(a) {
    const d = num(a.q17_n);
    if (d === null) return null;
    const map = [0, 25, 45, 65, 80, 90, 97, 100];
    return map[clamp(Math.round(d), 0, 7)];
  }

  function tijdlekScore(a) {
    if (!Array.isArray(a.q21)) return null;          // vraag niet beantwoord
    const sel = a.q21.filter(Boolean);
    const n = sel.length;
    if (n === 0) return { v: 90, note: 'geen tijdlek benoemd' };  // niet 100: onbenoemd is niet bewezen afwezig
    const map = { 1: 72, 2: 52, 3: 36, 4: 24 };
    return { v: n >= 5 ? 15 : map[n], note: n + ' tijdlek(ken)' };
  }

  function focusScore(a) {
    if (!Array.isArray(a.q10)) return null;          // vraag niet beantwoord
    const n = a.q10.filter(Boolean).length;
    if (n === 0) return null;
    if (n === 1) return { v: 75, note: '1 domein — scherp maar smal' };
    if (n === 2 || n === 3) return { v: 100, note: n + ' domeinen — scherpe focus' };
    if (n === 4) return { v: 85, note: '4 domeinen — nog werkbaar' };
    return { v: 40, note: n + ' domeinen — te veel tegelijk' };
  }

  function trotsScore(a) {
    const n = [a.q5_1, a.q5_2, a.q5_3].filter((x) => words(x) > 0).length;
    if (n === 0) return null;                        // niets ingevuld = geen meting
    return { v: [0, 45, 75, 100][n], note: n + ' van 3 benoemd' };
  }

  function coherentieScore(a) {
    const d7 = classifyDomain(a.q7);
    const d12 = classifyDomain(a.q12);
    const d23 = Q23_DOMAIN[txt(a.q23)] || null;
    const found = [d7, d12, d23].filter(Boolean);
    if (!txt(a.q7) && !txt(a.q12) && !txt(a.q23)) return null;   // niets beantwoord
    if (found.length < 2) return { v: 50, provisional: true, note: 'te weinig classificeerbaar' };
    const uniq = new Set(found);
    if (uniq.size === 1) return { v: 100, note: 'wil veranderen, doel en blokkade wijzen naar hetzelfde: ' + found[0] };
    if (uniq.size === 2 && found.length === 3) return { v: 70, note: '2 van 3 in lijn' };
    if (uniq.size === 2) return { v: 45, note: 'doel en blokkade wijzen verschillende kanten op' };
    return { v: 35, note: 'doel, wens en blokkade wijzen alle drie een andere kant op' };
  }

  /* ---------------------------------------------------------------- 5. De mapping
     Elke component: dimensie, gewicht binnen die dimensie, bron, resolver.
     Gewichten per dimensie tellen op tot 1.00 (bewaakt door de test-suite). */

  const COMPONENTS = [
    // Gezond fundament (25%)
    { id: 'f_gezondheid', dim: 'F', w: 0.20, src: 'V13', label: 'Lichamelijke gezondheid', kind: 'metric', actionable: false,
      get: (a) => scale10(a.q13_s) },
    { id: 'f_energie',    dim: 'F', w: 0.25, src: 'V14', label: 'Energie', kind: 'metric', actionable: false,
      get: (a) => scale10(a.q14_s) },
    { id: 'f_slaap',      dim: 'F', w: 0.25, src: 'V15', label: 'Slaap', kind: 'metric', up: 1.40,
      get: (a) => slaapComponent(a) },
    { id: 'f_voeding',    dim: 'F', w: 0.15, src: 'V16', label: 'Voeding', kind: 'metric', up: 0.95,
      get: (a) => scale10(a.q16_s) },
    { id: 'f_beweging',   dim: 'F', w: 0.15, src: 'V17', label: 'Beweging', kind: 'behaviour', up: 1.00,
      get: (a) => bewegingScore(a) },

    // Structuur & organisatie (20%)
    { id: 's_dagstructuur', dim: 'S', w: 0.45, src: 'V18', label: 'Dag- en weekstructuur', kind: 'metric', up: 1.35,
      get: (a) => scale10(a.q18_s) },
    { id: 's_zaken_op_orde', dim: 'S', w: 0.35, src: 'V19', label: 'Eigen zaken op orde (self-reliance)', kind: 'metric',
      get: (a) => scale10(a.q19_s) },
    { id: 's_tijdlek',      dim: 'S', w: 0.20, src: 'V21', label: 'Tijdbesteding', kind: 'derived', up: 1.20,
      get: (a) => tijdlekScore(a) },

    // Richting (15%)
    { id: 'r_toekomstbeeld', dim: 'R', w: 0.30, src: 'V9',  label: 'Helderheid toekomstbeeld', kind: 'rubric-auto',
      get: (a) => autoRubric(a.q9) },
    { id: 'r_focus',         dim: 'R', w: 0.15, src: 'V10', label: 'Focus in levensdomeinen', kind: 'derived', up: 1.10,
      get: (a) => focusScore(a) },
    { id: 'r_waarom',        dim: 'R', w: 0.25, src: 'V11', label: 'Verankering van het waarom', kind: 'rubric-auto', up: 0.90,
      get: (a) => autoRubric(a.q11) },
    { id: 'r_doel',          dim: 'R', w: 0.30, src: 'V12', label: 'Concreetheid 3-maandendoel', kind: 'rubric-auto', up: 1.20,
      get: (a) => autoRubric(a.q12) },

    // Discipline & consistentie (15%)
    { id: 'd_afspraken', dim: 'D', w: 0.50, src: 'V20', label: 'Afspraken met jezelf nakomen', kind: 'metric',
      get: (a) => scale10(a.q20_s) },
    { id: 'd_uitstel',   dim: 'D', w: 0.25, src: 'V8',  label: 'Uitstelgedrag', kind: 'rubric-coach', up: 1.10,
      get: (a) => (words(a.q8) === 0 ? null
        : { v: 50, provisional: true, note: 'vereist coachvalidatie — niet automatisch te scoren' }) },
    { id: 'd_gedrag',    dim: 'D', w: 0.25, src: 'V17', label: 'Bewezen consistentie (beweging)', kind: 'behaviour',
      get: (a) => bewegingScore(a) },

    // Ownership & verantwoordelijkheid (15%)
    { id: 'o_verantwoordelijkheid', dim: 'O', w: 0.35, src: 'V22', label: 'Benoemt eigen verantwoordelijkheid', kind: 'rubric-auto', up: 1.20,
      get: (a) => autoRubric(a.q22) },
    { id: 'o_attributie',  dim: 'O', w: 0.25, src: 'V23', label: 'Waar legt hij de oorzaak', kind: 'derived',
      get: (a) => { const k = txt(a.q23); return k in Q23_OWNERSHIP ? { v: Q23_OWNERSHIP[k], note: k } : null; } },
    { id: 'o_trots',       dim: 'O', w: 0.15, src: 'V5',  label: 'Kan eigen sterke punten benoemen', kind: 'derived', actionable: false,
      get: (a) => trotsScore(a) },
    { id: 'o_coherentie',  dim: 'O', w: 0.25, src: 'V7+V12+V23', label: 'Coherentie wens / doel / blokkade', kind: 'derived', up: 1.10,
      get: (a) => coherentieScore(a) },

    // Readiness & commitment (10%)
    { id: 'c_bereidheid', dim: 'C', w: 0.40, src: 'V25', label: 'Bereidheid (cijfer)', kind: 'metric', actionable: false,
      get: (a) => scale10(a.q25_s) },
    { id: 'c_offer',      dim: 'C', w: 0.35, src: 'V25b', label: 'Concreet bereid anders te doen', kind: 'rubric-auto', up: 1.20,
      get: (a) => autoRubric(a.q25_t) },
    { id: 'c_urgentie',   dim: 'C', w: 0.25, src: 'V24', label: 'Waarom nu (urgentie)', kind: 'rubric-auto', up: 0.90,
      get: (a) => autoRubric(a.q24) }
  ];

  /* Contextvragen: leveren bewust GEEN punten. */
  const CONTEXT_QUESTIONS = [
    { src: 'V1',  use: 'Leeftijd — context voor haalbaarheid en levensfase.' },
    { src: 'V2',  use: 'Woonsituatie — context voor omgevingsdruk en ruimte.' },
    { src: 'V3',  use: 'Werk/week — context voor tijdsbudget en belasting.' },
    { src: 'V4',  use: 'Cijfer voor het leven — zelfbeeld-kalibratie, geen punten.' },
    { src: 'V6',  use: 'Drie verbeterpunten — grondstof voor focusgesprek.' },
    { src: 'V7',  use: 'Eén ding veranderen — klantperceptie, telt alleen via coherentie.' },
    { src: 'V13t/V14t/V16t/V18t/V19t/V20t', use: 'Toelichtingen — signalen voor de coach.' }
  ];

  /* ---------------------------------------------------------------- 6. Berekening */

  function computeScore(answers) {
    const a = answers || {};
    const comps = [];

    for (const c of COMPONENTS) {
      const raw = c.get(a);
      let value = null, provisional = false, note = '';
      if (raw === null || raw === undefined) {
        value = null;
      } else if (typeof raw === 'number') {
        value = raw;
      } else if ('r' in raw) {                       // rubriek
        value = rubric100(raw.r);
        provisional = !!raw.provisional;
        note = raw.why || '';
      } else if ('v' in raw) {
        value = raw.v;
        provisional = !!raw.provisional;
        note = raw.note || '';
      }
      const override = a.__coach && a.__coach[c.id];
      if (typeof override === 'number') { value = clamp(override, 0, 100); provisional = false; note = 'door coach vastgesteld'; }
      comps.push({ id: c.id, dim: c.dim, w: c.w, src: c.src, label: c.label, kind: c.kind,
                   actionable: c.actionable !== false, up: c.up || 1,
                   value: value === null ? null : Math.round(value * 10) / 10, provisional, note,
                   answered: value !== null });
    }

    // Dimensiescores: herweeg over de componenten die daadwerkelijk beantwoord zijn.
    const dims = {};
    for (const k of DIM_ORDER) {
      const list = comps.filter((c) => c.dim === k);
      const answered = list.filter((c) => c.answered);
      const wsum = answered.reduce((s, c) => s + c.w, 0);
      const score = wsum > 0 ? answered.reduce((s, c) => s + c.value * c.w, 0) / wsum : null;
      dims[k] = {
        key: k, label: DIMENSIONS[k].label, weight: DIMENSIONS[k].weight,
        score: score === null ? null : Math.round(score),
        coverage: Math.round(wsum * 100),
        provisional: answered.some((c) => c.provisional),
        components: list
      };
    }

    const dimVal = (k) => (dims[k].score === null ? 0 : dims[k].score);

    // Ruwe totaalscore
    let wsumTotal = 0, acc = 0;
    for (const k of DIM_ORDER) {
      if (dims[k].score === null) continue;
      acc += dims[k].score * DIMENSIONS[k].weight;
      wsumTotal += DIMENSIONS[k].weight;
    }
    const rawTotal = wsumTotal > 0 ? acc / wsumTotal : 0;

    // Fundamentindex + foundation floor
    const fi = FOUNDATION_INDEX.F * dimVal('F') + FOUNDATION_INDEX.S * dimVal('S') + FOUNDATION_INDEX.D * dimVal('D');
    const cap = fi + CAP_MARGIN;
    const capped = Math.min(rawTotal, cap);
    const total = Math.round(clamp(capped, 0, 100));

    // Level: score-drempel EN fundamentdrempel
    let level = LEVELS[0];
    for (const L of LEVELS) if (total >= L.min && fi >= L.minFI) level = L;

    return {
      dims, components: comps,
      totalRaw: Math.round(rawTotal),
      total,
      foundationIndex: Math.round(fi),
      capApplied: rawTotal - capped > 0.5,
      capValue: Math.round(cap),
      level,
      flags: buildFlags(a, dims, rawTotal, capped, fi),
      focus: pickLeverage(dims),
      clientView: clientView(a, dims),
      provisional: comps.some((c) => c.answered && c.provisional)
    };
  }

  /* ---------------------------------------------------------------- 7. Hefboom */

  function pickLeverage(dims) {
    // Enabler-override: slaap is upstream van vrijwel alles. Onder de 40 wint slaap altijd.
    const slaap = dims.F.components.find((c) => c.id === 'f_slaap');
    if (slaap && slaap.answered && slaap.value < 40) {
      return { dim: 'F', dimLabel: DIMENSIONS.F.label, component: 'Slaap',
               reason: 'Slaap ligt onder de 40. Slaap werkt door in energie, discipline en structuur — daar begint de grootste winst.',
               override: 'enabler-slaap', ranking: rankDims(dims) };
    }
    const ranking = rankDims(dims);
    const top = ranking[0];
    if (!top) return null;
    // Binnen de winnende dimensie niet simpelweg de laagste component pakken:
    // indicatoren (energie, gezondheid, bereidheid) zijn geen knoppen, en
    // stroomopwaartse componenten leveren meer op dan stroomafwaartse.
    const weakest = dims[top.dim].components
      .filter((c) => c.answered && c.actionable)
      .sort((x, y) => (100 - y.value) * y.up - (100 - x.value) * x.up)[0];
    return {
      dim: top.dim, dimLabel: DIMENSIONS[top.dim].label,
      component: weakest ? weakest.label : null,
      reason: 'Grootste combinatie van achterstand, gewicht en fundamentprioriteit.',
      ranking
    };
  }

  function rankDims(dims) {
    return DIM_ORDER
      .filter((k) => dims[k].score !== null)
      .map((k) => ({
        dim: k, label: DIMENSIONS[k].label, score: dims[k].score,
        leverage: Math.round((100 - dims[k].score) * DIMENSIONS[k].weight * LEVERAGE_PRIORITY[k] * 10) / 10
      }))
      .sort((a, b) => b.leverage - a.leverage);
  }

  /* ---------------------------------------------------------------- 8. Signalen voor de coach */

  function buildFlags(a, dims, rawTotal, capped, fi) {
    const flags = [];

    if (rawTotal - capped > 0.5) {
      flags.push({ type: 'foundation-floor', level: 'hoog',
        text: 'Foundation floor toegepast: ruw ' + Math.round(rawTotal) + ' → ' + Math.round(capped) +
              '. Ambitie en commitment liggen hoger dan het draagvermogen (fundamentindex ' + Math.round(fi) + ').' });
    }

    // Zelfbeeld-kalibratie: V4 levert geen punten, maar wel een spiegel.
    const self = scale10(a.q4_s);
    if (self !== null) {
      const delta = Math.round(self - capped);
      if (delta >= 20) flags.push({ type: 'zelfbeeld', level: 'midden',
        text: 'Zelfbeeld ligt ' + delta + ' punten boven de gemeten stand. Mogelijk onderschat hij hoeveel er structureel misgaat.' });
      else if (delta <= -20) flags.push({ type: 'zelfbeeld', level: 'midden',
        text: 'Zelfbeeld ligt ' + Math.abs(delta) + ' punten onder de gemeten stand. Mogelijk te streng voor zichzelf — check op schaamte of perfectionisme.' });
    }

    // Commitment zonder fundament
    if (dims.C.score !== null && dims.C.score >= 75 && fi < 45) {
      flags.push({ type: 'commitment-gap', level: 'hoog',
        text: 'Hoge bereidheid op een smal fundament. Risico: te veel tegelijk starten en binnen drie weken afhaken. Beperk tot één spoor.' });
    }

    // Structuur vs. discipline — het klassieke misverstand uit sectie 15
    if (dims.S.score !== null && dims.D.score !== null && dims.S.score + 10 < dims.D.score) {
      flags.push({ type: 'structuur-vs-discipline', level: 'midden',
        text: 'Structuur scoort lager dan discipline. Waarschijnlijk geen wilskrachtprobleem maar een inrichtingsprobleem.' });
    }

    // Kritieke ondergrenzen
    for (const c of dims.F.components.concat(dims.S.components)) {
      if (c.answered && c.value < 30) {
        flags.push({ type: 'kritiek', level: 'hoog', text: 'Kritiek laag: ' + c.label + ' (' + c.value + ').' });
      }
    }

    // Te veel richtingen
    const doms = Array.isArray(a.q10) ? a.q10.filter(Boolean).length : 0;
    if (doms >= 4 && fi < 50) {
      flags.push({ type: 'spreiding', level: 'midden',
        text: doms + ' belangrijke levensdomeinen bij een fundamentindex van ' + Math.round(fi) + '. Prioriteren is hier de interventie.' });
    }

    // Onvoldoende data
    for (const k of DIM_ORDER) {
      if (dims[k].score === null) flags.push({ type: 'data', level: 'laag', text: 'Geen data voor ' + dims[k].label + '.' });
      else if (dims[k].coverage < 60) flags.push({ type: 'data', level: 'laag',
        text: 'Dunne dekking voor ' + dims[k].label + ' (' + dims[k].coverage + '% van de componenten ingevuld).' });
    }

    return flags;
  }

  /* Klant vs. coach (sectie 16): wat noemt de klant zelf als blokkade,
     versus welke hefboom komt uit het model? */
  function clientView(a, dims) {
    const claimed = txt(a.q23);
    const claimedDomain = Q23_DOMAIN[claimed] || null;
    const lev = pickLeverage(dims);
    const modelDim = lev ? lev.dim : null;
    const MAP = { slaap: 'F', voeding: 'F', beweging: 'F', structuur: 'S', planning: 'S',
                  discipline: 'D', geld: null, werk: null, omgeving: 'O', scherm: 'S' };
    const claimedDim = claimedDomain ? MAP[claimedDomain] : null;
    return {
      claimed, claimedDomain, claimedDim,
      modelDim, modelLabel: modelDim ? DIMENSIONS[modelDim].label : null,
      aligned: claimedDim !== null && modelDim !== null ? claimedDim === modelDim : null
    };
  }

  /* ---------------------------------------------------------------- 9. Export */

  const Scoring = {
    DIMENSIONS, DIM_ORDER, COMPONENTS, CONTEXT_QUESTIONS, LEVELS,
    FOUNDATION_INDEX, LEVERAGE_PRIORITY, CAP_MARGIN,
    computeScore, scale10, autoRubric, classifyDomain, rankDims
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Scoring;
  else root.Scoring = Scoring;
})(typeof window !== 'undefined' ? window : globalThis);
