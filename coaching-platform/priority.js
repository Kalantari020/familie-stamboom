/* Coaching Platform — PRIORITY ENGINE V1.0
   Bepaalt na de intake: startscore → grootste hefboom → eerste focus → eerste actie.

   Vijf stappen, in vaste volgorde:
     1. Foundation Check    — is de basis stabiel genoeg?
     2. Bottleneck Score    — niet de laagste dimensie, maar de meest beperkende
     3. Contradictie Check  — waar spreken de antwoorden elkaar tegen?
     4. Leverage Check      — welke verandering verbetert meerdere problemen tegelijk?
     5. Coach Validation    — AI stelt voor, coach bevestigt; pas dan zichtbaar voor de klant

   De engine bepaalt niet wat er mis is met iemand.
   Hij helpt bepalen waar het verstandig is om te beginnen. */

(function (root) {
  'use strict';

  const ENGINE_VERSION = '1.0';
  const S = (typeof require === 'function' && typeof module !== 'undefined') ? require('./scoring.js') : root.Scoring;

  /* ---------------------------------------------------------------- Model */

  /* Stap 1 — grenswaarde uit het framework (§17). */
  const FOUNDATION_MIN = 40;

  /* Stap 2 — impactgraaf: in welke mate maakt een zwakke dimensie een andere
     dimensie moeilijker? Dit is wat "bottleneck" onderscheidt van "laagste score".
     Commitment staat er bewust niet in als bron: het is een intentie, geen enabler. */
  const IMPACT = {
    F: { D: 0.50, S: 0.30 },   // energie en herstel dragen discipline en dagindeling
    S: { D: 0.60 },            // zonder structuur is discipline pure wilskracht
    R: { D: 0.40, C: 0.30 },   // zonder richting weet je niet waar je consistent in moet zijn
    D: { O: 0.10 },
    O: { D: 0.30, C: 0.20 },
    C: {}                      // commitment maakt niets anders makkelijker
  };

  /* Grens waaronder een dimensie meetelt als "nog niet op orde". */
  const WEAK = 60;

  /* Stap 4 — hefboomketens. De entry is de knop, unlocks zijn de gebieden die
     meebewegen. Bron: het coachingprincipe slaap → energie → training →
     discipline → structuur. */
  const CHAINS = [
    // `up` = hoe ver stroomopwaarts de ingang ligt. Slaap staat vooraan in de
    // keten slaap → energie → training → discipline → structuur; training staat
    // achteraan en is dus zelden het juiste beginpunt.
    { id: 'slaap', entry: 'Q15', label: 'Slaap en nachtritme', dim: 'F', up: 1.40,
      unlocks: ['Energie', 'Beweging', 'Afspraken met jezelf nakomen', 'Dagelijkse structuur'],
      keten: 'slaap → energie → training → discipline → structuur' },
    { id: 'dagstructuur', entry: 'Q18', label: 'Dag- en weekstructuur', dim: 'S', up: 1.20,
      unlocks: ['Afspraken met jezelf nakomen', 'Eigen zaken op orde', 'Beweging'],
      keten: 'structuur → uitvoering → discipline → resultaat' },
    { id: 'tijdsbesteding', entry: 'Q21', label: 'Tijdsbesteding en schermtijd', dim: 'S', up: 1.25,
      unlocks: ['Dagelijkse structuur', 'Slaap', 'Beweging'],
      keten: 'schermtijd → slaap → energie → uitvoering' },
    { id: 'prioritering', entry: 'Q12', label: 'Eén doel kiezen', dim: 'R', up: 1.10,
      unlocks: ['Afspraken met jezelf nakomen', 'Dagelijkse structuur'],
      keten: 'richting → prioriteit → consistentie' },
    { id: 'beweging', entry: 'Q17', label: 'Beweging', dim: 'F', up: 0.85,
      unlocks: ['Energie', 'Lichamelijke gezondheid'], keten: 'beweging → energie → gezondheid' }
  ];

  const val = (r, k) => (r.dims[k] && r.dims[k].score !== null ? r.dims[k].score : null);
  const comp = (r, qid) => {
    for (const k of S.DIM_ORDER) {
      const c = r.dims[k].components.find((x) => x.qid === qid);
      if (c && c.answered) return c;
    }
    return null;
  };

  /* ---------------------------------------------------------------- Stap 1 */

  function foundationCheck(r) {
    const f = val(r, 'F'), s = val(r, 'S');
    const hits = [];
    if (f !== null && f < FOUNDATION_MIN) hits.push({ dim: 'F', score: f });
    if (s !== null && s < FOUNDATION_MIN) hits.push({ dim: 'S', score: s });
    hits.sort((a, b) => a.score - b.score);
    return {
      step: 1, name: 'Foundation Check',
      passed: hits.length === 0,
      hits,
      forced: hits.length ? hits[0].dim : null,
      note: hits.length
        ? hits.map((h) => S.DIMENSIONS[h.dim].label + ' ' + h.score).join(' · ') + ' ligt onder ' + FOUNDATION_MIN +
          '. Geen automatische groeifocus zolang de basis instabiel is.'
        : 'Fundament en structuur liggen beide op of boven ' + FOUNDATION_MIN + '.'
    };
  }

  /* ---------------------------------------------------------------- Stap 2 */

  function bottleneckScore(r) {
    const gaps = {};
    S.DIM_ORDER.forEach((k) => { const v = val(r, k); gaps[k] = v === null ? null : 100 - v; });

    const rows = S.DIM_ORDER.filter((k) => gaps[k] !== null).map((k) => {
      const enables = IMPACT[k] || {};
      let mult = 1, detail = [];
      Object.keys(enables).forEach((tgt) => {
        if (gaps[tgt] === null) return;
        const bij = gaps[tgt] / 100 * enables[tgt];
        mult += bij;
        if (bij >= 0.05) detail.push(S.DIMENSIONS[tgt].label.split(' ')[0].toLowerCase() + ' +' + Math.round(bij * 100) / 100);
      });
      return {
        dim: k, label: S.DIMENSIONS[k].label, score: 100 - gaps[k], gap: gaps[k],
        impact: Math.round(mult * 1000) / 1000,
        bottleneck: Math.round(gaps[k] * mult * 10) / 10,
        detail: detail.join(', ')
      };
    }).sort((a, b) => b.bottleneck - a.bottleneck);

    return {
      step: 2, name: 'Bottleneck Score', rows, top: rows[0] || null,
      note: 'Achterstand vermenigvuldigd met de mate waarin die dimensie andere dimensies blokkeert. ' +
            'Niet de laagste score wint, maar de meest beperkende.'
    };
  }

  /* ---------------------------------------------------------------- Stap 3 */

  function contradictieCheck(r) {
    const out = [];
    const C = val(r, 'C'), D = val(r, 'D'), S_ = val(r, 'S'), R = val(r, 'R');
    const q20 = comp(r, 'Q20'), q8 = comp(r, 'Q8'), q12 = comp(r, 'Q12');

    if (C !== null && C >= 70 && ((D !== null && D < 55) || (S_ !== null && S_ < 55))) {
      out.push({ id: 'motivatie-uitvoering', titel: 'Hoge motivatie, weinig uitvoering',
        detail: 'Commitment ' + C + ' tegenover discipline ' + (D === null ? '—' : D) + ' en structuur ' + (S_ === null ? '—' : S_) + '.',
        vraag: 'Wat maakt dat je dit wel graag wilt, maar het in de praktijk niet van de grond komt?' });
    }
    if (q20 && q20.value >= 70 && q8 && q8.value <= 40) {
      out.push({ id: 'discipline-uitstel', titel: 'Hoge discipline, veel uitstel',
        detail: 'Geeft zichzelf ' + q20.value + '/100 op afspraken nakomen, terwijl het uitstelpatroon op ' + q8.value + '/100 wordt ingeschat.',
        vraag: 'Je zegt dat je je afspraken meestal nakomt. Waar lukt dat dan juist niet, en wat is daar anders?' });
    }
    if (R !== null && R >= 70 && q12 && q12.value <= 40) {
      out.push({ id: 'richting-doel', titel: 'Hoge richting, geen concreet doel',
        detail: 'Richting ' + R + ', terwijl het doel voor drie maanden op ' + q12.value + '/100 wordt ingeschat.',
        vraag: 'Je weet goed waar je naartoe wilt. Wat is dan de eerste stap die je de komende drie maanden zou moeten zetten?' });
    }
    return { step: 3, name: 'Contradictie Check', items: out,
      note: out.length ? out.length + ' tegenstrijdigheid(en) om in de sessie te onderzoeken.' : 'Geen tegenstrijdigheden gedetecteerd.' };
  }

  /* ---------------------------------------------------------------- Stap 4 */

  function leverageCheck(r) {
    const kandidaten = CHAINS.map((ch) => {
      const entry = comp(r, ch.entry);
      if (!entry) return null;
      // Componenten kunnen in twee dimensies laden (Q19, Q25, Q12): één keer tellen.
      const gezien = {}, zwak = [];
      S.DIM_ORDER.forEach((k) => r.dims[k].components.forEach((c) => {
        if (!c.answered || gezien[c.label]) return;
        if (ch.unlocks.indexOf(c.label) >= 0 && c.value < WEAK) { gezien[c.label] = 1; zwak.push(c.label + ' ' + c.value); }
      }));
      if (entry.value >= WEAK || zwak.length < 2) return null;
      const up = ch.up || 1;
      return { id: ch.id, label: ch.label, dim: ch.dim, entry: ch.entry, entryScore: entry.value,
               unlocks: zwak, keten: ch.keten, up,
               leverage: Math.round((100 - entry.value) * zwak.length * up * 10) / 10 };
    }).filter(Boolean).sort((a, b) => b.leverage - a.leverage);

    return { step: 4, name: 'Leverage Check', kandidaten, top: kandidaten[0] || null,
      note: kandidaten.length
        ? 'Sterkste keten: ' + kandidaten[0].keten + '.'
        : 'Geen keten waarbij één verandering meerdere gebieden tegelijk verbetert.' };
  }

  /* ---------------------------------------------------------------- Stap 5 */

  function coachValidation(coach) {
    const cv = (coach || {}).focusValidation || {};
    return {
      step: 5, name: 'Coach Validation',
      status: cv.status || 'voorlopig',              // voorlopig | bevestigd | gewijzigd | verworpen
      focus: cv.focus || null, reason: (cv.reason || '').trim(),
      validated: cv.status === 'bevestigd' || cv.status === 'gewijzigd',
      note: cv.status ? '' : 'AI-voorstel. Nog niet zichtbaar voor de klant.'
    };
  }

  /* ---------------------------------------------------------------- Engine */

  function computePriority(r, coach) {
    const s1 = foundationCheck(r);
    const s2 = bottleneckScore(r);
    const s3 = contradictieCheck(r);
    const s4 = leverageCheck(r);
    const s5 = coachValidation(coach);

    let mode, primary, reden;

    // Gebalanceerd profiel: basis stevig én geen enkele dimensie onder de grens.
    const alleOpNiveau = S.DIM_ORDER.every((k) => val(r, k) === null || val(r, k) >= WEAK);
    const fiOk = r.foundationIndex !== null && r.foundationIndex >= WEAK;

    if (!s1.passed) {
      mode = 'fundament';
      primary = s1.forced;
      reden = s1.note;
    } else if (alleOpNiveau && fiOk) {
      mode = 'groei';
      primary = s2.top ? s2.top.dim : null;
      reden = 'Basis is stevig en geen enkele dimensie blijft achter. De coaching verschuift van stabiliseren naar optimaliseren en groei.';
    } else {
      mode = 'bottleneck';
      primary = s2.top ? s2.top.dim : null;
      reden = 'Grootste beperking op basis van achterstand én doorwerking op andere dimensies.';
    }

    // secundair spoor: de volgende bottleneck die zelf nog onder de grens ligt
    const secundair = s2.rows.find((x) => x.dim !== primary && x.score < WEAK) || null;

    // Concrete ingang binnen de focus. Eerst een keten die in de focusdimensie
    // begint; anders een keten die de focusdimensie wél losmaakt; in groeimodus
    // mag de sterkste keten sowieso.
    const inFocus = s4.kandidaten.find((k) => k.dim === primary);
    const raaktFocus = s4.kandidaten.find((k) => primary && r.dims[primary].components
      .some((c) => c.answered && k.unlocks.some((u) => u.replace(/ \d+$/, '') === c.label)));
    const keten = inFocus || (mode === 'groei' ? s4.top : raaktFocus) || null;
    let ingang = keten ? keten.label : null;
    if (!ingang && primary) {
      const zwakste = r.dims[primary].components.filter((c) => c.answered).sort((a, b) => a.value - b.value)[0];
      ingang = zwakste ? zwakste.label : null;
    }

    const hypothese = bouwHypothese(r, primary, secundair, keten, mode, s3);

    // Stap 5 kan de focus wijzigen
    let definitief = primary, definitieveBron = 'ai';
    if (s5.validated && s5.focus && r.dims[s5.focus]) { definitief = s5.focus; definitieveBron = 'coach'; }

    return {
      engineVersion: ENGINE_VERSION,
      steps: [s1, s2, s3, s4, s5],
      mode,
      aiPrimary: primary,
      aiPrimaryLabel: primary ? S.DIMENSIONS[primary].label : null,
      secondary: secundair ? secundair.dim : null,
      secondaryLabel: secundair ? secundair.label : null,
      chain: keten,
      entry: ingang,
      reden,
      hypothese,
      contradicties: s3.items,
      validation: s5,
      primaryFocus: definitief,
      primaryFocusLabel: definitief ? S.DIMENSIONS[definitief].label : null,
      focusSource: definitieveBron,
      visibleToClient: s5.validated,
      record: {
        engine_version: ENGINE_VERSION,
        primary_focus: primary,
        secondary_focus: secundair ? secundair.dim : null,
        focus_mode: mode,
        leverage_chain: keten ? keten.id : null,
        ai_hypothesis: hypothese,
        coach_validated_focus: s5.validated ? definitief : null,
        coach_validation_status: s5.status,
        coach_validation_reason: s5.reason
      }
    };
  }

  /* Coachingtaal, geen algoritmetaal. Niet "je structuur-score is 38, dus
     werk aan structuur", maar wat dat vermoedelijk betekent. */

  /* ONDERWERP = eerste vermelding (zinsbegin), KORT = tweede vermelding. */
  const ONDERWERP = {
    F: 'Je energie en herstel', S: 'Je dagelijkse organisatie', R: 'Je richting',
    D: 'Het nakomen van afspraken met jezelf', O: 'Het pakken van je eigen verantwoordelijkheid',
    C: 'Je concrete bereidheid om daadwerkelijk iets anders te doen'
  };
  const KORT = {
    F: 'je energie en herstel', S: 'je dagelijkse organisatie', R: 'je richting',
    D: 'het nakomen van je eigen afspraken', O: 'je eigenaarschap', C: 'je concrete bereidheid'
  };
  const STERKTE = {
    F: 'je lichamelijke basis staat', S: 'je dagelijkse organisatie loopt',
    R: 'je weet goed waar je naartoe wilt', D: 'je komt afspraken met jezelf doorgaans na',
    O: 'je neemt verantwoordelijkheid voor je eigen situatie', C: 'je bent gemotiveerd'
  };

  function bouwHypothese(r, primary, secundair, keten, mode, s3) {
    if (!primary) return 'Onvoldoende data voor een hypothese.';
    const sterk = S.DIM_ORDER.filter((k) => k !== primary && val(r, k) !== null && val(r, k) >= 70)
      .sort((a, b) => val(r, b) - val(r, a)).slice(0, 2);
    const zinnen = [];

    if (mode === 'groei') {
      zinnen.push('Je basis is stevig en er blijft op dit moment geen enkel onderdeel achter.');
      zinnen.push('De vraag is niet meer wat er eerst gestabiliseerd moet worden, maar waar je gericht wilt groeien.');
      zinnen.push('De meeste ruimte lijkt te zitten in ' + KORT[primary] + '. Dat bepalen we samen.');
      return zinnen.join(' ');
    }

    if (mode === 'fundament') {
      zinnen.push('Voordat we aan je grotere doelen werken, lijkt ' + KORT[primary] + ' eerst aandacht nodig te hebben.');
      if (sterk.length) {
        const lof = sterk.map((k) => STERKTE[k]).join(' en ');
        zinnen.push(lof.charAt(0).toUpperCase() + lof.slice(1) + ' — dat is geen klein ding. ' +
                    'Maar zolang de basis niet meebeweegt, kost elk plan onnodig veel.');
      }
    } else {
      zinnen.push(ONDERWERP[primary] + ' lijkt momenteel de grootste beperking te zijn.');
      if (sterk.length) {
        const lof = sterk.map((k) => STERKTE[k]).join(' en ');
        zinnen.push(lof.charAt(0).toUpperCase() + lof.slice(1) + ', maar ' + KORT[primary] +
                    ' ondersteunt dat nog onvoldoende.');
      }
    }

    if (keten) {
      const gebieden = keten.unlocks.slice(0, 3).map((u) => u.replace(/ \d+$/, '').toLowerCase());
      zinnen.push('Verbetering hier werkt waarschijnlijk door in ' + gebieden.join(', ') + '.');
    }
    if (secundair) zinnen.push('Daarna komt ' + KORT[secundair.dim] + ' in beeld.');

    zinnen.push(s3.items.length
      ? 'Er zit daarnaast een tegenstrijdigheid in je antwoorden die ik eerst wil begrijpen. Dat onderzoeken we samen.'
      : 'Dit onderzoeken we eerst.');
    return zinnen.join(' ');
  }

  const Priority = { ENGINE_VERSION, FOUNDATION_MIN, WEAK, IMPACT, CHAINS, computePriority,
                     foundationCheck, bottleneckScore, contradictieCheck, leverageCheck };
  if (typeof module !== 'undefined' && module.exports) module.exports = Priority;
  else root.Priority = Priority;
})(typeof window !== 'undefined' ? window : globalThis);
