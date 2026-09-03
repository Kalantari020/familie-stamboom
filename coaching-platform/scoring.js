/* Coaching Platform — Scoring engine
   Implementatie van COACH SCORING FRAMEWORK V1.0.

   Modulair opgezet (framework §30): de scoring zit niet hardcoded in de UI.
   Elke berekening levert een record met raw_value, normalized_value, dimensie,
   confidence, ai_observation, inconsistency_flag en coach-aanpassing, zodat de
   methodiek later kan worden vervangen zonder de applicatie te herbouwen.

   Browser: globale Scoring. Node: module.exports. */

(function (root) {
  'use strict';

  const FRAMEWORK_VERSION = '1.0';

  /* ================================================================ 1. Model */

  const DIMENSIONS = {
    F: { key: 'F', icon: '🧱', label: 'Gezond fundament',                weight: 0.25 },
    S: { key: 'S', icon: '📅', label: 'Structuur & organisatie',         weight: 0.20 },
    R: { key: 'R', icon: '🧭', label: 'Richting',                        weight: 0.15 },
    D: { key: 'D', icon: '🔥', label: 'Discipline & consistentie',       weight: 0.15 },
    O: { key: 'O', icon: '🛡️', label: 'Ownership & verantwoordelijkheid', weight: 0.15 },
    C: { key: 'C', icon: '🚀', label: 'Commitment & Readiness',           weight: 0.10 }
  };
  const DIM_ORDER = ['F', 'S', 'R', 'D', 'O', 'C'];

  /* Framework §13: Foundation Index = (Gezond Fundament + Structuur) / 2 */
  const FOUNDATION_STATUS = [
    { min: 0,  max: 39,  code: 'stabiliseren', icon: '🔴', label: 'Stabiliseren',
      text: 'De basis is momenteel onvoldoende stabiel.', focus: 'Eerst functioneren en stabiliseren.' },
    { min: 40, max: 59,  code: 'opbouwen',     icon: '🟡', label: 'Opbouwen',
      text: 'Er is een basis, maar belangrijke onderdelen zijn nog instabiel.', focus: 'Structuur en consistentie opbouwen.' },
    { min: 60, max: 74,  code: 'stevig',       icon: '🟢', label: 'Stevig',
      text: 'De basis is voldoende om gerichter aan groei te werken.', focus: 'Fundament onderhouden en gericht groeien.' },
    { min: 75, max: 100, code: 'sterk',        icon: '🔵', label: 'Sterk',
      text: 'De basis is relatief stabiel en zelfsturend.', focus: 'Groei, prestaties en verdere ontwikkeling.' }
  ];

  /* Framework §27 — beschrijvend, niet normatief */
  const SCORE_BANDS = [
    { min: 0,  max: 39,  label: 'Instabiel',     text: 'Er zijn meerdere fundamentele gebieden die eerst aandacht nodig hebben.' },
    { min: 40, max: 59,  label: 'In opbouw',     text: 'Er is potentieel en bewustzijn, maar consistentie en basisstructuur moeten sterker worden.' },
    { min: 60, max: 74,  label: 'Stevige basis', text: 'Een bruikbare basis om gericht verder te bouwen.' },
    { min: 75, max: 89,  label: 'Sterk niveau',  text: 'De meeste belangrijke systemen functioneren relatief goed.' },
    { min: 90, max: 100, label: 'Zeer sterk',    text: 'Zeer consistente basis en hoge mate van zelfsturing.' }
  ];

  const CONFIDENCE = {
    hoog:   { code: 'hoog',   icon: '🟢', label: 'Hoog',   rank: 3 },
    medium: { code: 'medium', icon: '🟡', label: 'Medium', rank: 2 },
    laag:   { code: 'laag',   icon: '🔴', label: 'Laag',   rank: 1 }
  };

  /* Framework §17 — minimum foundation regel */
  const MIN_FOUNDATION = 40;
  /* Framework §6 — maximale coachcorrectie op structuur op basis van Q21 */
  const STRUCTURE_MODIFIER_MAX = 10;
  /* Framework §5 — bewegingsschaal, bewust niet lineair */
  const MOVEMENT_SCALE = [0, 20, 35, 50, 65, 80, 90, 100];

  /* ================================================================ 2. Helpers */

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);
  const txt = (v) => (typeof v === 'string' ? v.trim() : '');
  const words = (s) => txt(s).split(/\s+/).filter(Boolean).length;
  const round = (v) => Math.round(v);

  /* Framework §5/§6/§8: schaalvraag 1–10 wordt score × 10 */
  function metric10(v) {
    const n = num(v);
    return n === null ? null : clamp(n * 10, 0, 100);
  }

  function band(v, list) {
    for (const b of list) if (v >= b.min && v <= b.max) return b;
    return list[list.length - 1];
  }

  /* ================================================================ 3. Tekstanalyse
     Levert kenmerken op, geen oordeel. Elke afgeleide score is een AI-baseline
     die de coach kan bevestigen of aanpassen (framework §3, §20). */

  const RX = {
    concrete:  /(\b\d+\b|elke|iedere|per (dag|week|maand)|dagelijks|wekelijks|'?s ochtends|'?s avonds|uur|minuten|keer per|om \d|voor \d|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)/i,
    vaag:      /\b(meer|minder|beter|gezonder|fitter|rustiger|harder|gewoon|proberen|misschien|een beetje|wat)\b/i,
    onzeker:   /\b(weet (het )?niet|geen idee|geen flauw idee|weet ik niet|niks|niets|nvt|n\.v\.t\.|\?+)\b/i,
    intern:    /\b(ik|mijn|mezelf|mijzelf|zelf)\b/i,
    extern:    /\b(mijn baas|de baas|mijn werkgever|het bedrijf|anderen|de mensen|mijn omgeving|zij |ze maken|niemand|het systeem|de maatschappij|mijn ouders|mijn partner)\b/i,
    ernst:     /\b(altijd|nooit|structureel|constant|al jaren|al maanden|alles|iedere keer|elke keer|steeds weer|continu)\b/i,
    urgentie:  /\b(nu|niet langer|genoeg|zat|klaar mee|niet meer|over een jaar|voordat|anders|moment|wakker geschud|besef)\b/i,
    persoonlijk:/\b(ik voel|ik merk|ik wil|ik zie|voor mij|mijn (leven|gezin|kinderen|toekomst|gezondheid|vrouw|zoon|dochter))\b/i,
    klacht:    /\b(pijn|klachten|moe|vermoeid|rug|knie|blessure|hoofdpijn|maag|overgewicht|kortademig|ziek|medicijn)\b/i,
    negatie:   /\b(niet|geen|nauwelijks|zelden|amper|moeite)\b/i
  };

  function features(text) {
    const t = txt(text);
    return {
      text: t, words: words(t),
      concrete: RX.concrete.test(t), vaag: RX.vaag.test(t), onzeker: RX.onzeker.test(t),
      intern: RX.intern.test(t), extern: RX.extern.test(t), ernst: RX.ernst.test(t),
      urgentie: RX.urgentie.test(t), persoonlijk: RX.persoonlijk.test(t),
      klacht: RX.klacht.test(t), negatie: RX.negatie.test(t),
      items: t ? t.split(/[,;]|\ben\b|\n/).filter((s) => s.trim().length > 2).length : 0
    };
  }

  /* Bandindeling volgens framework §7 en §8:
     0–25 · 26–50 · 51–75 · 76–100. De middenwaarde van de band is de baseline. */
  const BANDS = {
    geen:    { lo: 0,  hi: 25,  mid: 15 },
    vaag:    { lo: 26, hi: 50,  mid: 40 },
    duidelijk:{ lo: 51, hi: 75, mid: 65 },
    sterk:   { lo: 76, hi: 100, mid: 85 }
  };

  function toBand(name, observation) {
    const b = BANDS[name];
    return { value: b.mid, bandLo: b.lo, bandHi: b.hi, bandName: name, estimated: true, observation };
  }

  /* --- per open vraag een eigen beoordelingsregel --------------------------- */

  const OPEN_RULES = {
    /* Q9 — 3-jaarsbeeld: is er richting, is het concreet, is het persoonlijk? */
    q9: (f) => {
      if (!f.words) return null;
      if (f.onzeker || f.words < 4) return toBand('geen', 'Geen bruikbare richting benoemd.');
      if (f.words >= 12 && f.concrete && f.persoonlijk) return toBand('sterk', 'Duidelijke, persoonlijke en concrete richting.');
      if (f.words >= 10 && (f.concrete || f.persoonlijk)) return toBand('duidelijk', 'Duidelijke richting benoemd.');
      if (f.vaag && !f.concrete) return toBand('vaag', 'Enige richting, maar vaag geformuleerd.');
      return toBand('duidelijk', 'Richting benoemd, nog beperkt uitgewerkt.');
    },
    /* Q11 — waarom: betekenis, niet mooie woorden */
    q11: (f) => {
      if (!f.words) return null;
      if (f.onzeker || f.words < 4) return toBand('geen', 'Geen betekenis benoemd.');
      if (f.words >= 12 && f.persoonlijk) return toBand('sterk', 'Persoonlijke, intrinsieke reden helder benoemd.');
      if (f.words >= 8 && (f.persoonlijk || f.intern)) return toBand('duidelijk', 'Reden is benoemd en persoonlijk gekleurd.');
      return toBand('vaag', 'Reden blijft algemeen.');
    },
    /* Q12 — één doel voor 3 maanden */
    q12: (f) => {
      if (!f.words) return null;
      if (f.onzeker) return toBand('geen', 'Geen doel benoemd.');
      if (f.concrete && f.words >= 6) return toBand('sterk', 'Concreet, toetsbaar doel.');
      if (f.concrete) return toBand('duidelijk', 'Doel met een concreet element.');
      if (f.vaag || f.words < 5) return toBand('vaag', 'Doel aanwezig maar zeer vaag.');
      return toBand('duidelijk', 'Duidelijk doel, nog niet meetbaar gemaakt.');
    },
    /* Q8 — uitstellen / niet volhouden. Negatieve gedragsindicator: hoe sterker
       het patroon, hoe lager de score. */
    q8: (f) => {
      if (!f.words) return null;
      if (f.onzeker) return toBand('duidelijk', 'Geen structureel patroon benoemd.');
      if (f.ernst && f.items >= 2) return toBand('geen', 'Sterk patroon over meerdere levensgebieden.');
      if (f.ernst || f.items >= 3) return toBand('vaag', 'Regelmatig terugkerend patroon.');
      if (f.items >= 2) return toBand('vaag', 'Meerdere zaken worden uitgesteld.');
      return toBand('duidelijk', 'Beperkt en afgebakend uitstelpatroon.');
    },
    /* Q22 — welke verantwoordelijkheid serieuzer? Ownership-signaal, geen oordeel. */
    q22: (f) => {
      if (!f.words) return null;
      if (f.onzeker) return toBand('geen', 'Ownership-signaal: geen eigen verantwoordelijkheid benoemd.');
      if (f.extern && !f.intern) return toBand('vaag', 'Ownership-signaal: verantwoordelijkheid vooral buiten zichzelf gelegd.');
      if (f.intern && f.concrete && f.words >= 8) return toBand('sterk', 'Ownership-signaal: concrete eigen verantwoordelijkheid benoemd.');
      if (f.intern && f.words >= 5) return toBand('duidelijk', 'Ownership-signaal: eigen verantwoordelijkheid benoemd.');
      return toBand('vaag', 'Ownership-signaal: benoeming blijft algemeen.');
    },
    /* Q7 — één ding veranderen: concreet en op zichzelf gericht? */
    q7: (f) => {
      if (!f.words) return null;
      if (f.onzeker) return toBand('geen', 'Geen eerste verandering kunnen benoemen.');
      if (f.extern && !f.intern) return toBand('vaag', 'Verandering vooral buiten zichzelf gezocht.');
      if (f.concrete || f.words >= 6) return toBand('sterk', 'Concrete eerste verandering benoemd.');
      return toBand('duidelijk', 'Eerste verandering benoemd.');
    },
    /* Q24 — waarom nu? Readiness-context: urgentie en aanleiding. */
    q24: (f) => {
      if (!f.words) return null;
      if (f.onzeker || f.words < 4) return toBand('geen', 'Geen aanleiding benoemd.');
      if (f.urgentie && f.persoonlijk && f.words >= 10) return toBand('sterk', 'Duidelijke persoonlijke aanleiding en urgentie.');
      if (f.urgentie || f.persoonlijk) return toBand('duidelijk', 'Aanleiding benoemd.');
      return toBand('vaag', 'Aanleiding blijft algemeen ("het wordt tijd").');
    }
  };

  function estimateOpen(key, text) {
    const f = features(text);
    const r = OPEN_RULES[key](f);
    return r ? Object.assign(r, { features: f }) : null;
  }

  /* ================================================================ 4. Dimensies */

  function mk(id, qid, label, value, opts) {
    return Object.assign({
      id, qid, label,
      value: value === null || value === undefined ? null : round(value),
      estimated: false, observation: '', weight: null, answered: value !== null && value !== undefined
    }, opts || {});
  }

  /* --- 1. Gezond fundament (25%) — ongewogen gemiddelde van 5 vragen (§5) --- */
  function dimFundament(a) {
    const comps = [
      mk('f13', 'Q13', 'Lichamelijke gezondheid', metric10(a.q13_s)),
      mk('f14', 'Q14', 'Energie',                 metric10(a.q14_s)),
      mk('f15', 'Q15', 'Slaap',                   metric10(a.q15_s)),
      mk('f16', 'Q16', 'Voeding',                 metric10(a.q16_s)),
      mk('f17', 'Q17', 'Beweging',                movement(a.q17_n))
    ];
    comps.forEach((c) => { c.weight = 0.20; });
    return { comps, score: mean(comps) };
  }
  function movement(v) {
    const d = num(v);
    return d === null ? null : MOVEMENT_SCALE[clamp(Math.round(d), 0, 7)];
  }

  /* --- 2. Structuur & organisatie (20%) — (Q18 + Q19) / 2, Q21 als modifier (§6) --- */
  function dimStructuur(a) {
    const comps = [
      mk('s18', 'Q18', 'Dagelijkse structuur',   metric10(a.q18_s), { weight: 0.50 }),
      mk('s19', 'Q19', 'Eigen zaken op orde',    metric10(a.q19_s), { weight: 0.50 })
    ];
    return { comps, score: mean(comps) };
  }

  /* Q21 levert geen eigen score. Het systeem stelt een correctie voor van
     maximaal ±10; de coach past die toe (§6). */
  function tijdsbestedingSignaal(a) {
    const sel = Array.isArray(a.q21) ? a.q21.filter(Boolean) : null;
    if (sel === null) return null;
    const f = features(a.q21_t);
    let n = sel.length;
    let level, suggest, note;
    const zwaar = f.ernst || /\b([5-9]|1\d)\s*(\+|uur)/i.test(f.text) || /diep in de nacht|hele dag/i.test(f.text);
    if (n === 0 && !f.words) { level = 'laag'; suggest = 0; note = 'Geen tijdlek benoemd.'; }
    else if (n >= 4 || zwaar) { level = 'hoog'; suggest = -10; note = 'Sterke negatieve invloed op structuur.'; }
    else if (n >= 2) { level = 'gemiddeld'; suggest = -5; note = 'Duidelijke negatieve invloed.'; }
    else { level = 'laag'; suggest = 0; note = 'Geen of minimale negatieve invloed.'; }
    return { level, suggest, note, selected: sel, icon: level === 'hoog' ? '⚠️' : level === 'gemiddeld' ? '⚠️' : '✓' };
  }

  /* --- 3. Richting (15%) — Q9 30 / Q10 15 / Q11 25 / Q12 30 (§7) --- */
  function dimRichting(a) {
    const e9 = estimateOpen('q9', a.q9), e11 = estimateOpen('q11', a.q11), e12 = estimateOpen('q12', a.q12);
    const comps = [
      openComp('r9', 'Q9', '3-jaarsbeeld', e9, 0.30),
      mk('r10', 'Q10', 'Prioritering levensgebieden', prioritering(a.q10), { weight: 0.15,
         observation: prioriteringNote(a.q10) }),
      openComp('r11', 'Q11', 'Waarom / betekenis', e11, 0.25),
      openComp('r12', 'Q12', 'Doel voor 3 maanden', e12, 0.30)
    ];
    return { comps, score: weighted(comps) };
  }
  function prioritering(sel) {
    if (!Array.isArray(sel)) return null;
    const n = sel.filter(Boolean).length;
    if (n === 0) return 40;
    if (n <= 2) return 100;
    if (n <= 4) return 90;
    return 70;
  }
  function prioriteringNote(sel) {
    if (!Array.isArray(sel)) return '';
    const n = sel.filter(Boolean).length;
    if (n === 0) return 'Geen duidelijke prioriteit aangegeven.';
    if (n <= 2) return n + ' duidelijke kernprioriteit(en).';
    if (n <= 4) return n + ' prioriteiten — nog werkbaar.';
    return n + ' prioriteiten — signaal van gebrek aan prioritering.';
  }

  /* --- 4. Discipline & consistentie (15%) — Q8 30 / Q20 45 / Q25 25 (§8) --- */
  function dimDiscipline(a) {
    const e8 = estimateOpen('q8', a.q8);
    const comps = [
      openComp('d8', 'Q8', 'Uitstellen / niet volhouden', e8, 0.30),
      mk('d20', 'Q20', 'Afspraken met jezelf nakomen', metric10(a.q20_s), { weight: 0.45 }),
      mk('d25', 'Q25', 'Bereidheid (cijfer)', metric10(a.q25_s), { weight: 0.25 })
    ];
    return { comps, score: weighted(comps) };
  }

  /* --- 5. Ownership (15%) — Q19 40 / Q22 40 / Q7 20 (§9) --- */
  function dimOwnership(a) {
    const e22 = estimateOpen('q22', a.q22), e7 = estimateOpen('q7', a.q7);
    const comps = [
      mk('o19', 'Q19', 'Eigen zaken op orde', metric10(a.q19_s), { weight: 0.40 }),
      openComp('o22', 'Q22', 'Verantwoordelijkheid benoemen', e22, 0.40),
      openComp('o7', 'Q7', 'Eén ding veranderen', e7, 0.20)
    ];
    return { comps, score: weighted(comps) };
  }

  /* --- 6. Commitment & Readiness (10%) — Q24 35 / Q25 50 / Q12 15 (§10) --- */
  function dimReadiness(a) {
    const e24 = estimateOpen('q24', a.q24), e12 = estimateOpen('q12', a.q12);
    const comps = [
      openComp('c24', 'Q24', 'Waarom nu', e24, 0.35),
      mk('c25', 'Q25', 'Bereidheid (cijfer)', metric10(a.q25_s), { weight: 0.50 }),
      openComp('c12', 'Q12', 'Eén doel kunnen kiezen', e12, 0.15)
    ];
    return { comps, score: weighted(comps) };
  }

  function openComp(id, qid, label, est, w) {
    const c = mk(id, qid, label, est ? est.value : null, { weight: w });
    if (est) {
      c.estimated = true; c.observation = est.observation;
      c.bandLo = est.bandLo; c.bandHi = est.bandHi; c.bandName = est.bandName;
    }
    return c;
  }

  function mean(comps) {
    const on = comps.filter((c) => c.answered);
    return on.length ? on.reduce((s, c) => s + c.value, 0) / on.length : null;
  }
  function weighted(comps) {
    const on = comps.filter((c) => c.answered);
    const w = on.reduce((s, c) => s + c.weight, 0);
    return w > 0 ? on.reduce((s, c) => s + c.value * c.weight, 0) / w : null;
  }

  /* ================================================================ 5. Confidence (§18) */

  function dimConfidence(comps, score, flagged, coachSet) {
    if (score === null) return CONFIDENCE.laag;
    if (coachSet) return CONFIDENCE.hoog;                 // door coach vastgesteld
    const on = comps.filter((c) => c.answered);
    const wTot = on.reduce((s, c) => s + (c.weight || 0), 0) || 1;
    const wEst = on.filter((c) => c.estimated && !c.coachAdjusted).reduce((s, c) => s + (c.weight || 0), 0);
    const share = wEst / wTot;
    let rank = share === 0 ? 3 : share <= 0.5 ? 2 : 1;
    if (comps.some((c) => !c.answered)) rank--;           // onvolledige data
    if (flagged) rank--;                                  // openstaande coach check
    rank = clamp(rank, 1, 3);
    return rank === 3 ? CONFIDENCE.hoog : rank === 2 ? CONFIDENCE.medium : CONFIDENCE.laag;
  }

  /* ================================================================ 6. Inconsistenties (§19)
     Nooit automatisch de score verlagen — altijd een ⚠️ Coach Check. */

  function coachChecks(a, dims) {
    const out = [];
    const add = (type, dim, titel, detail) => out.push({ type, dim, titel, detail, icon: '⚠️' });

    // 1. Commitment inconsistency
    const q25 = num(a.q25_s), f25 = features(a.q25_t);
    if (q25 !== null && q25 >= 8 && f25.words) {
      // Een hoog cijfer zonder concrete tegenprestatie is intentie, geen commitment (§10).
      if (f25.negatie || f25.onzeker || (!f25.concrete && (f25.vaag || f25.words < 10))) {
        add('commitment', 'C', 'Commitment inconsistency',
          'Bereidheid ' + q25 + '/10, maar de toelichting benoemt geen concrete verandering: “' + trim(f25.text) + '”');
      }
    }
    // 2. Self-assessment inconsistency (discipline)
    const q20 = num(a.q20_s), f20 = features(a.q20_t), f8 = features(a.q8);
    if (q20 !== null && q20 >= 8 && (f20.negatie || f8.ernst)) {
      add('discipline', 'D', 'Self-assessment inconsistency',
        'Geeft zichzelf ' + q20 + '/10 op afspraken nakomen, terwijl de toelichting een structureel patroon beschrijft.');
    }
    // 3. Direction inconsistency
    const f9 = features(a.q9), f12 = features(a.q12);
    if ((f9.onzeker || f12.onzeker) && dims.R.score !== null && dims.R.score >= 70) {
      add('richting', 'R', 'Direction inconsistency',
        'Richting scoort hoog terwijl het toekomstbeeld of het doel niet benoemd kan worden.');
    }
    // 4. Health validation signal
    const q13 = num(a.q13_s), f13 = features(a.q13_t);
    if (q13 !== null && q13 >= 8 && f13.klacht) {
      add('gezondheid', 'F', 'Health validation signal',
        'Gezondheid ' + q13 + '/10, terwijl er concrete klachten worden genoemd.');
    }
    // 5. Slaapvalidatie (§5) — duur en ritme valideren de zelfscore, corrigeren hem niet
    const slaap = slaapduur(a);
    const q15 = num(a.q15_s);
    if (slaap !== null && q15 !== null) {
      if (q15 >= 7 && slaap < 6) {
        add('slaap', 'F', 'Sleep validation signal',
          'Slaap ' + q15 + '/10, maar structureel ' + slaap.toFixed(1) + ' uur in bed. Score blijft gebaseerd op de zelfscore; coach kan corrigeren.');
      } else if (slaap < 6) {
        add('slaap', 'F', 'Sleep validation signal',
          'Structureel ' + slaap.toFixed(1) + ' uur in bed. Verdient bespreking los van de zelfscore.');
      }
    }
    // 6. Levenswaardering versus dimensies (Q4 is contextindicator, §4)
    const q4 = num(a.q4_s);
    if (q4 !== null && dims.F.score !== null && dims.S.score !== null) {
      const fi = (dims.F.score + dims.S.score) / 2;
      if (q4 * 10 - fi >= 25) add('zelfbeeld', null, 'Self-image check',
        'Waardeert het eigen leven met ' + q4 + '/10, terwijl de Foundation Index op ' + round(fi) + ' staat.');
    }
    return out;
  }
  function trim(s) { return s.length > 90 ? s.slice(0, 87) + '…' : s; }

  function slaapduur(a) {
    const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(txt(t)); return m ? (+m[1] * 60 + +m[2]) : null; };
    const b = toMin(a.q15_bed), r = toMin(a.q15_rise);
    if (b === null || r === null) return null;
    return ((r - b + 1440) % 1440) / 60;
  }

  /* ================================================================ 7. Hoofdberekening */

  /* coach = {
       dimensions: { F: { score, reason } },       // §20: override vereist een reden
       components: { f13: { value, reason } },
       structureModifier: { value, reason },       // §6: max ±10
       focusOverride: 'S'                          // §17
     } */
  function computeScore(answers, coachInput) {
    const a = answers || {};
    const coach = coachInput || {};
    const warnings = [];

    const raw = { F: dimFundament(a), S: dimStructuur(a), R: dimRichting(a), D: dimDiscipline(a), O: dimOwnership(a), C: dimReadiness(a) };

    // componentoverrides van de coach
    DIM_ORDER.forEach((k) => raw[k].comps.forEach((c) => {
      const ov = (coach.components || {})[c.id];
      if (!ov || ov.value === undefined || ov.value === null || ov.value === '') return;
      if (!txt(ov.reason)) { warnings.push('Override op ' + c.label + ' genegeerd: reden ontbreekt.'); return; }
      c.aiValue = c.value;
      c.value = round(clamp(Number(ov.value), 0, 100));
      c.answered = true; c.coachAdjusted = true; c.coachReason = txt(ov.reason);
    }));
    raw.F.score = mean(raw.F.comps);
    raw.S.score = mean(raw.S.comps);
    ['R', 'D', 'O', 'C'].forEach((k) => { raw[k].score = weighted(raw[k].comps); });

    // Q21 als coachcorrectie op structuur (max ±10)
    const tijd = tijdsbestedingSignaal(a);
    let structureAdjust = null;
    const sm = coach.structureModifier;
    if (sm && sm.value !== undefined && sm.value !== null && sm.value !== '' && Number(sm.value) !== 0) {
      if (!txt(sm.reason)) warnings.push('Structuurcorrectie genegeerd: reden ontbreekt.');
      else if (raw.S.score === null) warnings.push('Structuurcorrectie genegeerd: geen structuurscore.');
      else {
        const v = clamp(Number(sm.value), -STRUCTURE_MODIFIER_MAX, STRUCTURE_MODIFIER_MAX);
        structureAdjust = { value: round(v), reason: txt(sm.reason), from: round(raw.S.score) };
        raw.S.score = clamp(raw.S.score + v, 0, 100);
        structureAdjust.to = round(raw.S.score);
      }
    }

    // dimensieobjecten
    const dims = {};
    DIM_ORDER.forEach((k) => {
      dims[k] = {
        key: k, icon: DIMENSIONS[k].icon, label: DIMENSIONS[k].label, weight: DIMENSIONS[k].weight,
        aiScore: raw[k].score === null ? null : round(raw[k].score),
        score: raw[k].score === null ? null : round(raw[k].score),
        components: raw[k].comps, coachAdjusted: false, coachReason: ''
      };
    });

    const checks = coachChecks(a, dims);

    // dimensie-override door de coach (§20)
    DIM_ORDER.forEach((k) => {
      const ov = (coach.dimensions || {})[k];
      if (!ov || ov.score === undefined || ov.score === null || ov.score === '') return;
      if (!txt(ov.reason)) { warnings.push('Override op ' + dims[k].label + ' genegeerd: reden ontbreekt.'); return; }
      dims[k].score = round(clamp(Number(ov.score), 0, 100));
      dims[k].coachAdjusted = true; dims[k].coachReason = txt(ov.reason);
    });

    // confidence per dimensie
    DIM_ORDER.forEach((k) => {
      const flagged = checks.some((c) => c.dim === k);
      dims[k].confidence = dimConfidence(dims[k].components, dims[k].score, flagged, dims[k].coachAdjusted);
    });

    // Totaalscore (§11) — geen cap, dit blijft een echte totaalscore (§15)
    let acc = 0, wsum = 0;
    DIM_ORDER.forEach((k) => { if (dims[k].score !== null) { acc += dims[k].score * dims[k].weight; wsum += dims[k].weight; } });
    const totalExact = wsum > 0 ? acc / wsum : 0;
    const total = round(totalExact);

    // Foundation Index en Status (§13/§14)
    const fiParts = [dims.F.score, dims.S.score].filter((v) => v !== null);
    const foundationIndex = fiParts.length ? round(fiParts.reduce((s, v) => s + v, 0) / fiParts.length) : null;
    const foundationStatus = foundationIndex === null ? null : band(foundationIndex, FOUNDATION_STATUS);

    const scoreBand = band(total, SCORE_BANDS);
    const focus = bepaalFocus(dims, coach.focusOverride);
    const hypotheses = bepaalHypotheses(dims, a, checks);

    // overall confidence: gewogen gemiddelde van de dimensieranks
    let cAcc = 0, cW = 0;
    DIM_ORDER.forEach((k) => { if (dims[k].score !== null) { cAcc += dims[k].confidence.rank * dims[k].weight; cW += dims[k].weight; } });
    const cAvg = cW ? cAcc / cW : 1;
    const confidence = cAvg >= 2.6 ? CONFIDENCE.hoog : cAvg >= 1.8 ? CONFIDENCE.medium : CONFIDENCE.laag;

    const ranked = DIM_ORDER.filter((k) => dims[k].score !== null).sort((x, y) => dims[y].score - dims[x].score);

    const result = {
      frameworkVersion: FRAMEWORK_VERSION,
      scoreDate: new Date().toISOString().slice(0, 10),
      dims, total, totalExact: Math.round(totalExact * 100) / 100, scoreBand,
      foundationIndex, foundationStatus,
      minFoundationRule: minFoundationTriggered(dims),
      timeSignal: tijd, structureAdjust,
      checks, warnings, confidence,
      focus, hypotheses,
      strongest: ranked.length ? { key: ranked[0], label: dims[ranked[0]].label, score: dims[ranked[0]].score } : null,
      weakest: ranked.length ? { key: ranked[ranked.length - 1], label: dims[ranked[ranked.length - 1]].label, score: dims[ranked[ranked.length - 1]].score } : null,
      coachValidated: DIM_ORDER.some((k) => dims[k].coachAdjusted) ||
        DIM_ORDER.some((k) => dims[k].components.some((c) => c.coachAdjusted))
    };
    result.record = buildRecord(a, result);
    return result;
  }

  /* ================================================================ 8. Focus (§16 + §17) */

  function minFoundationTriggered(dims) {
    const f = dims.F.score, s = dims.S.score;
    const hits = [];
    if (f !== null && f < MIN_FOUNDATION) hits.push('Gezond fundament ' + f);
    if (s !== null && s < MIN_FOUNDATION) hits.push('Structuur ' + s);
    return hits.length ? { active: true, hits } : { active: false, hits: [] };
  }

  function bepaalFocus(dims, override) {
    const scored = DIM_ORDER.filter((k) => dims[k].score !== null);
    if (!scored.length) return null;

    // hefboom = achterstand × gewicht
    const ranking = scored.map((k) => ({
      key: k, label: dims[k].label, score: dims[k].score,
      leverage: Math.round((100 - dims[k].score) * dims[k].weight * 10) / 10
    })).sort((x, y) => y.leverage - x.leverage || x.score - y.score);

    let primary = ranking[0];
    let reden = 'Laagste relevante score in combinatie met de grootste hefboom.';
    let rule = null;

    // §17 minimum foundation regel. De regel geldt zodra F of S onder de grens
    // ligt; hij grijpt alleen daadwerkelijk in als de hefboom elders uitkwam.
    const mf = minFoundationTriggered(dims);
    if (mf.active) {
      rule = 'minimum-foundation';
      if (primary.key !== 'F' && primary.key !== 'S') {
        const kandidaten = ['F', 'S'].filter((k) => dims[k].score !== null && dims[k].score < MIN_FOUNDATION)
          .sort((x, y) => dims[x].score - dims[y].score);
        primary = ranking.find((r) => r.key === kandidaten[0]);
        reden = 'Minimum foundation regel: ' + mf.hits.join(' en ') + ' ligt onder ' + MIN_FOUNDATION +
                '. De eerste focus komt daarom uit het fundament in plaats van uit de hoogste hefboom. ' +
                'Het groeidoel blijft staan; de route ernaartoe wordt aangepast.';
        rule = 'minimum-foundation-override';
      } else {
        reden = 'Laagste relevante score in combinatie met de grootste hefboom. ' +
                'De minimum foundation regel wijst dezelfde kant op: ' + mf.hits.join(' en ') + ' ligt onder ' + MIN_FOUNDATION + '.';
      }
    }

    if (override && dims[override] && dims[override].score !== null) {
      primary = ranking.find((r) => r.key === override) || primary;
      reden = 'Coach heeft de eerste focus handmatig bepaald.';
      rule = 'coach-override';
    }

    const secondary = ranking.find((r) => r.key !== primary.key && r.score < 60) || null;
    const weakComp = dims[primary.key].components
      .filter((c) => c.answered).sort((x, y) => x.value - y.value)[0] || null;

    return {
      key: primary.key, label: primary.label, score: primary.score,
      secondary: secondary ? { key: secondary.key, label: secondary.label, score: secondary.score } : null,
      component: weakComp ? weakComp.label : null,
      reden, rule, ranking
    };
  }

  /* ================================================================ 9. Hypotheses (§31) */

  function bepaalHypotheses(dims, a, checks) {
    const h = [];
    const S = dims.S.score, D = dims.D.score, F = dims.F.score, R = dims.R.score, C = dims.C.score, O = dims.O.score;

    if (S !== null && D !== null && S < D) h.push('Structuur beïnvloedt discipline: de structuurscore ligt onder de disciplinescore.');
    if (F !== null && D !== null && F < 50 && D < 60) h.push('Energie en herstel beïnvloeden waarschijnlijk het volhouden van afspraken.');
    if (C !== null && F !== null && C >= 80 && F < 45) h.push('Hoge bereidheid op een nog smalle basis: risico op te veel tegelijk starten.');
    if (R !== null && R >= 75 && S !== null && S < 50) h.push('Richting is helder, de dagelijkse uitvoering nog niet.');
    if (O !== null && O < 50) h.push('Eigenaarschap over de eigen situatie verdient expliciete aandacht in de eerste sessies.');
    if (checks.some((c) => c.type === 'commitment')) h.push('Uitgesproken bereidheid en concrete bereidheid lopen mogelijk uiteen.');
    if (!h.length) h.push('Geen scherpe tegenstrijdigheid in de data. Het beeld lijkt intern consistent.');
    return h;
  }

  /* ================================================================ 10. Record (§30) */

  const RAW_OF = {
    Q7: 'q7', Q8: 'q8', Q9: 'q9', Q10: 'q10', Q11: 'q11', Q12: 'q12',
    Q13: 'q13_s', Q14: 'q14_s', Q15: 'q15_s', Q16: 'q16_s', Q17: 'q17_n',
    Q18: 'q18_s', Q19: 'q19_s', Q20: 'q20_s', Q22: 'q22', Q24: 'q24', Q25: 'q25_s'
  };

  function buildRecord(a, r) {
    const rows = [];
    DIM_ORDER.forEach((k) => r.dims[k].components.forEach((c) => {
      rows.push({
        score_version: FRAMEWORK_VERSION,
        score_date: r.scoreDate,
        question_id: c.qid,
        raw_value: a[RAW_OF[c.qid]] === undefined ? null : a[RAW_OF[c.qid]],
        normalized_value: c.coachAdjusted ? (c.aiValue === undefined ? null : c.aiValue) : c.value,
        score_dimension: k,
        dimension_score: r.dims[k].score,
        confidence: r.dims[k].confidence.code,
        ai_observation: c.observation || '',
        inconsistency_flag: r.checks.some((x) => x.dim === k) ? r.checks.filter((x) => x.dim === k).map((x) => x.type).join(',') : '',
        coach_adjusted_score: c.coachAdjusted ? c.value : null,
        coach_adjustment_reason: c.coachReason || ''
      });
    }));
    const dimensions = DIM_ORDER.map((k) => ({
      score_version: FRAMEWORK_VERSION, score_date: r.scoreDate, score_dimension: k,
      ai_dimension_score: r.dims[k].aiScore, dimension_score: r.dims[k].score,
      confidence: r.dims[k].confidence.code,
      coach_adjusted_score: r.dims[k].coachAdjusted ? r.dims[k].score : null,
      coach_adjustment_reason: r.dims[k].coachReason || ''
    }));
    return {
      score_version: FRAMEWORK_VERSION, score_date: r.scoreDate,
      total_score: r.total, foundation_index: r.foundationIndex,
      foundation_status: r.foundationStatus ? r.foundationStatus.code : null,
      confidence: r.confidence.code, answers: rows, dimensions
    };
  }

  /* ================================================================ 11. Taal (§26) */

  const LANGUAGE = {
    verboden: ['Je bent een 66/100 man.', 'Je hebt een slechte discipline.', 'Je fundament is slecht.', 'Je bent niet klaar voor succes.'],
    toegestaan: (dim, score) => 'Je huidige ' + dim.toLowerCase() + '-score is ' + score + '/100.',
    focusZin: 'Je hoeft niet alles tegelijk te veranderen.',
    startpunt: 'Dit is je huidige startpunt.'
  };

  /* ================================================================ Export */

  const Scoring = {
    FRAMEWORK_VERSION, DIMENSIONS, DIM_ORDER, FOUNDATION_STATUS, SCORE_BANDS, CONFIDENCE,
    MIN_FOUNDATION, STRUCTURE_MODIFIER_MAX, MOVEMENT_SCALE, LANGUAGE,
    computeScore, metric10, movement, estimateOpen, features, slaapduur, tijdsbestedingSignaal, band
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Scoring;
  else root.Scoring = Scoring;
})(typeof window !== 'undefined' ? window : globalThis);
