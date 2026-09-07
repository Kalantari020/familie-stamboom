/* Coaching Platform — COACHING ENGINE V1.0
   Sessie 1, wekelijkse check-in en Progress Score.

   Drie dingen die uitdrukkelijk NIET hetzelfde zijn:
     Startscore        — waar sta je?
     Action Completion — heb je gedaan wat je had afgesproken?
     Progress Score    — ontwikkel je je daadwerkelijk? */

(function (root) {
  'use strict';

  const VERSION = '1.0';
  const isNode = (typeof require === 'function' && typeof module !== 'undefined');
  const S = isNode ? require('./scoring.js') : root.Scoring;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const txt = (v) => (typeof v === 'string' ? v.trim() : '');
  const round = Math.round;

  /* ================================================================ SESSIE 1
     Zes blokken, 40 minuten. Geen herhaling van de intake: de vragen worden
     gevuld met wat deze klant zélf heeft geantwoord. */

  const SESSIE1_BLOKKEN = [
    { id: 'opening', min: 5, titel: 'Opening', doel: 'Beginnen bij de persoon, niet bij de score.' },
    { id: 'reality', min: 10, titel: 'Reality check', doel: 'Twee tot drie opvallende patronen onderzoeken.' },
    { id: 'bottleneck', min: 10, titel: 'De echte bottleneck', doel: 'Eén vraag beantwoorden: wat maakt het nu moeilijk?' },
    { id: 'focus', min: 5, titel: 'Focus kiezen', doel: 'Eén primaire focus, geen lijst van zes.' },
    { id: 'commitment', min: 5, titel: 'Eerste commitment', doel: 'Maximaal drie acties voor deze week.' },
    { id: 'afsluiting', min: 5, titel: 'Afsluiting', doel: 'De cyclus benoemen: doen → observeren → begrijpen → aanpassen.' }
  ];

  function sessieGids(answers, r, prio) {
    const a = answers || {};
    const g = SESSIE1_BLOKKEN.map((b) => Object.assign({ vragen: [], notities: '' }, b));
    const vind = (id) => g.find((x) => x.id === id);

    vind('opening').vragen = [
      'Ik heb je intake bekeken. Vandaag wil ik niet alle vragen opnieuw doornemen, maar begrijpen wat er achter je antwoorden zit en bepalen waar we het beste kunnen beginnen.',
      'Als je nu naar je intake kijkt: wat valt jou zelf het meest op?'
    ];

    // Reality check: de scherpste tegenstrijdigheden uit beide engines
    const rc = [];
    (prio.contradicties || []).forEach((c) => rc.push(c.vraag));
    (r.checks || []).forEach((c) => {
      if (c.type === 'commitment') rc.push('Je geeft aan dat je heel graag wilt veranderen. Als ik naar je toelichting kijk, blijft nog open wat je concreet anders gaat doen. Hoe kijk jij daarnaar?');
      if (c.type === 'discipline') rc.push('Je geeft jezelf een hoog cijfer voor het nakomen van afspraken met jezelf, maar je toelichting beschrijft iets anders. Hoe verklaar je dat verschil?');
      if (c.type === 'slaap') rc.push('Je slaapt structureel kort. Wat gebeurt er in de uren voordat je naar bed gaat?');
      if (c.type === 'gezondheid') rc.push('Je beoordeelt je gezondheid hoog, maar noemt ook concrete klachten. Hoe passen die twee bij elkaar?');
      if (c.type === 'zelfbeeld') rc.push('Je geeft je leven een ruime voldoende, terwijl een aantal basale dingen nog niet lopen. Waar zit dat verschil volgens jou?');
    });
    if (txt(a.q23) && prio.aiPrimary && prio.aiPrimaryLabel) {
      rc.push('Je zegt dat "' + txt(a.q23) + '" je het meest tegenhoudt. Als ik naar je antwoorden kijk, zie ik ook iets rond ' +
              prio.aiPrimaryLabel.toLowerCase() + '. Ik wil onderzoeken of het werkelijk het eerste is, of dat er iets onder ligt.');
    }
    vind('reality').vragen = rc.slice(0, 3);

    vind('bottleneck').vragen = [
      'Wat maakt het momenteel moeilijk voor jou om het leven te leiden dat je eigenlijk wilt?',
      txt(a.q8) ? 'Je noemde: "' + txt(a.q8) + '". Wat gebeurt er precies op het moment dat je het níét doet?' : null,
      'Als dit over drie maanden nog steeds zo is, wat betekent dat dan voor je?'
    ].filter(Boolean);

    vind('focus').vragen = [
      prio.aiPrimaryLabel ? 'Voorstel: de komende periode richten we ons eerst op ' + prio.aiPrimaryLabel.toLowerCase() + '.' : null,
      'Hypothese om te toetsen: ' + prio.hypothese,
      'Herken je dit? En zo niet — waar zou jij beginnen?'
    ].filter(Boolean);

    vind('commitment').vragen = [
      'Wat ben jij bereid om deze week daadwerkelijk anders te doen?',
      'Maximaal drie acties. Klein genoeg om uit te voeren, groot genoeg om iets van te leren.'
    ];

    vind('afsluiting').vragen = [
      'Je hoeft deze week niet je hele leven te veranderen. Ik wil vooral zien wat er gebeurt als je dit consequent uitvoert.',
      'Volgende keer kijken we niet alleen naar wat je hebt gedaan, maar vooral naar wat we daardoor over jou hebben geleerd.'
    ];

    // Actievoorstellen die passen bij de gekozen ingang
    const voorstellen = actieVoorstellen(prio, a);
    return { version: VERSION, duur: g.reduce((s, b) => s + b.min, 0), blokken: g, actievoorstellen: voorstellen };
  }

  const ACTIES = {
    slaap: ['Iedere avond vóór 23:00 naar bed', 'Telefoon vanaf 22:00 in een andere kamer', 'Elke ochtend op hetzelfde tijdstip op'],
    dagstructuur: ['Iedere ochtend de drie belangrijkste taken opschrijven', 'Telefoon tijdens het eerste uur van de dag wegleggen', 'Zondagavond 15 minuten je week vooruit plannen'],
    tijdsbesteding: ['Schermtijd één week bijhouden zonder er iets aan te veranderen', 'Sociale media van je startscherm halen', 'Eén avond per week zonder scherm'],
    prioritering: ['Één doel voor drie maanden opschrijven in één zin', 'Alle andere doelen bewust op de wachtlijst zetten', 'Wekelijks één ding benoemen dat je níét doet'],
    beweging: ['Drie keer per week 30 minuten bewegen, op vaste dagen', 'Elke werkdag 20 minuten wandelen', 'Sportkleding de avond ervoor klaarleggen'],
    F: ['Vaste bedtijd en vast opstaan, zeven dagen', 'Elke dag ontbijten', 'Drie keer per week 30 minuten bewegen'],
    S: ['Iedere ochtend drie belangrijkste taken opschrijven', 'Vast moment per week voor administratie', 'Avondroutine met een vast eindtijdstip'],
    R: ['Eén doel voor drie maanden formuleren', 'Wekelijks tien minuten terugkijken op je richting', 'Alles wat nu niet je doel is expliciet parkeren'],
    D: ['Eén afspraak met jezelf per dag, en die registreren', 'De kleinst mogelijke versie van je gewoonte doen op slechte dagen', 'Dagelijks afvinken wat je hebt gedaan'],
    O: ['Eén verantwoordelijkheid deze week oppakken die al lang blijft liggen', 'Wekelijks benoemen wat jouw aandeel was', 'Één ding dat je uitbesteedt zelf doen'],
    C: ['Concreet opschrijven wat je bereid bent op te geven', 'Eén gewoonte kiezen en er twee weken aan vasthouden', 'Wekelijks toetsen of je bereidheid nog klopt']
  };

  function actieVoorstellen(prio, a) {
    const key = (prio.chain && prio.chain.id) || prio.aiPrimary;
    const lijst = ACTIES[key] || ACTIES[prio.aiPrimary] || [];
    return lijst.slice(0, 3);
  }

  /* ================================================================ CHECK-IN
     Maximaal 5 minuten. Vier vragen: wat heb je gedaan → wat gebeurde er →
     wat heb je geleerd → wat doen we nu. */

  const STATUS = { done: { code: 'done', icon: '✅', label: 'Volledig uitgevoerd', pts: 100 },
                   partial: { code: 'partial', icon: '🟡', label: 'Gedeeltelijk', pts: 50 },
                   none: { code: 'none', icon: '❌', label: 'Niet uitgevoerd', pts: 0 } };

  const CHECKIN_VRAGEN = [
    { id: 'goed', label: 'Wat ging deze week goed?' },
    { id: 'obstakel', label: 'Waar liep je tegenaan?' },
    { id: 'geleerd', label: 'Wat heb je deze week over jezelf geleerd?' }
  ];
  const CHECKIN_CIJFERS = [
    { id: 'zorg', label: 'Hoe goed heb je deze week voor jezelf gezorgd?' },
    { id: 'afspraken', label: 'Hoe goed ben je je afspraken met jezelf nagekomen?' }
  ];

  function actionCompletion(checkin) {
    const acts = (checkin && checkin.actions) || [];
    if (!acts.length) return null;
    const pts = acts.reduce((s, x) => s + (STATUS[x.status] ? STATUS[x.status].pts : 0), 0);
    return round(pts / acts.length);
  }

  /* AI-analyse per check-in: bereidt betere vragen voor, vervangt de coach niet. */
  function analyseCheckin(checkin, intake, history) {
    const comp = actionCompletion(checkin);
    const reeks = (history || []).map(actionCompletion).filter((x) => x !== null);
    const gem = reeks.length ? round(reeks.reduce((s, x) => s + x, 0) / reeks.length) : comp;

    let consistentie = 'onbekend';
    if (reeks.length >= 2) {
      const onder = reeks.filter((x) => x < CONSISTENT).length;
      consistentie = onder === 0 ? 'hoog' : onder <= reeks.length / 3 ? 'gemiddeld' : 'wisselend';
    } else if (comp !== null) consistentie = comp >= 80 ? 'hoog' : comp >= CONSISTENT ? 'gemiddeld' : 'wisselend';

    const refl = (checkin && checkin.reflection) || {};
    const patronen = [], obstakels = [], checks = [], vragen = [];

    if (txt(refl.goed)) patronen.push(txt(refl.goed));
    if (txt(refl.obstakel)) obstakels.push(txt(refl.obstakel));

    // uitgevoerde versus niet-uitgevoerde acties
    const gedaan = (checkin.actions || []).filter((x) => x.status === 'done').map((x) => x.text);
    const niet = (checkin.actions || []).filter((x) => x.status === 'none').map((x) => x.text);
    if (gedaan.length) patronen.push('Wél volgehouden: ' + gedaan.join('; '));
    if (niet.length) obstakels.push('Niet uitgevoerd: ' + niet.join('; '));

    // ⚠️ "geen tijd" tegenover schermtijd uit de intake
    const geenTijd = /geen tijd|te druk|kwam er niet aan toe|geen ruimte/i.test(txt(refl.obstakel) + ' ' + txt(refl.goed));
    const scherm = Array.isArray((intake || {}).q21) ? intake.q21.filter(Boolean) : [];
    const schermTekst = txt((intake || {}).q21_t);
    if (geenTijd && (scherm.length >= 2 || /\d\s*(uur|u)\b/i.test(schermTekst))) {
      checks.push('Cliënt zegt "geen tijd", maar noemt in de intake ' +
        (scherm.length ? scherm.join(', ').toLowerCase() : 'aanzienlijke schermtijd') + '.');
      vragen.push('Je geeft aan dat je geen tijd hebt, maar je noemt ook ruim twee uur schermtijd. Hoe verhouden die twee zich volgens jou?');
    }
    // zelfbeoordeling versus uitvoering
    const zelf = checkin.ratings || {};
    if (typeof zelf.afspraken === 'number' && comp !== null && zelf.afspraken * 10 - comp >= 25) {
      checks.push('Zelfbeoordeling afspraken ' + zelf.afspraken + '/10 tegenover ' + comp + '% daadwerkelijk uitgevoerd.');
      vragen.push('Je beoordeelt jezelf hoger dan je uitvoering laat zien. Waar zit dat verschil volgens jou?');
    }
    // reflectie niet ingevuld
    if (!txt(refl.geleerd)) {
      checks.push('Geen antwoord op "wat heb je over jezelf geleerd" — het onderdeel dat zelfinzicht meet.');
      vragen.push('Wat heb je deze week over jezelf geleerd? Ook een klein inzicht telt.');
    }
    // volledig uitgevoerd maar geen resultaat
    if (comp === 100 && /niet|geen|werkte niet|geen verschil/i.test(txt(refl.goed))) {
      vragen.push('Je hebt alles uitgevoerd maar merkt weinig verschil. Dan is niet je discipline het probleem, maar mogelijk de gekozen aanpak. Wat zou je anders willen proberen?');
    }
    if (!vragen.length && comp !== null) {
      vragen.push(comp >= 80
        ? 'Je hebt vrijwel alles uitgevoerd. Wat maakte dat het deze week wél lukte?'
        : 'Wat was het moment waarop het deze week misging?');
    }

    return { version: VERSION, completion: comp, gemiddelde: gem, consistentie,
             patronen, obstakels, checks, coachvragen: vragen };
  }

  /* ================================================================ PROGRESS SCORE V1.0
     Vijf signalen. Niet dezelfde formule als de intake: de Startscore meet waar
     iemand begint, de Progress Score of hij daadwerkelijk verandert. */

  const PROGRESS_SIGNALEN = {
    gedrag:      { key: 'gedrag',      label: 'Gedrag & uitvoering',     weight: 0.30 },
    consistentie:{ key: 'consistentie',label: 'Consistentie',            weight: 0.25 },
    doel:        { key: 'doel',        label: 'Doelvoortgang',           weight: 0.20 },
    reflectie:   { key: 'reflectie',   label: 'Reflectie & zelfinzicht', weight: 0.15 },
    coach:       { key: 'coach',       label: 'Coachbeoordeling',        weight: 0.10 }
  };
  const SIGNAAL_ORDER = ['gedrag', 'consistentie', 'doel', 'reflectie', 'coach'];

  const MIN_WEKEN = 4;          // §23: geen wekelijkse ruis, minimaal een 4-weekse evaluatie
  const CONSISTENT = 50;        // een week telt als consistent vanaf de helft uitgevoerd
  const GEVOELIGHEID = 0.30;    // hoe sterk de ontwikkelingsindex de score verschuift
  const MAX_STAP = 15;          // maximale verschuiving per evaluatieperiode

  function reflectieScore(checkins) {
    const rel = checkins.map((c) => (c.reflection || {}).geleerd).map(txt);
    if (!rel.length) return null;
    const per = rel.map((t) => {
      if (!t) return 0;
      const f = S.features(t);
      if (f.onzeker || f.words < 4) return 25;
      if (f.words >= 15 && (f.persoonlijk || f.intern)) return 90;
      if (f.words >= 8) return 70;
      return 45;
    });
    return round(per.reduce((s, x) => s + x, 0) / per.length);
  }

  function consistentieScore(reeks) {
    if (!reeks.length) return null;
    const aandeel = reeks.filter((x) => x >= CONSISTENT).length / reeks.length;
    let langste = 0, huidig = 0;
    reeks.forEach((x) => { if (x >= CONSISTENT) { huidig++; langste = Math.max(langste, huidig); } else huidig = 0; });
    return round((0.6 * aandeel + 0.4 * (langste / reeks.length)) * 100);
  }

  /* input = { startScore, previousScore, checkins[], goalProgress, coachRating:{score,reason} } */
  function computeProgress(input) {
    const inp = input || {};
    const checkins = (inp.checkins || []).filter(Boolean);
    const reeks = checkins.map(actionCompletion).filter((x) => x !== null);

    if (checkins.length < MIN_WEKEN) {
      return { version: VERSION, ready: false, weken: checkins.length, weekenNodig: MIN_WEKEN - checkins.length,
               completion: reeks.length ? round(reeks.reduce((s, x) => s + x, 0) / reeks.length) : null,
               note: 'Progress Score wordt pas berekend na minimaal ' + MIN_WEKEN +
                     ' check-ins. De score is bedoeld voor trend, niet voor wekelijkse ruis.' };
    }

    const signalen = {
      gedrag: reeks.length ? round(reeks.reduce((s, x) => s + x, 0) / reeks.length) : null,
      consistentie: consistentieScore(reeks),
      doel: (typeof inp.goalProgress === 'number') ? clamp(round(inp.goalProgress), 0, 100) : null,
      reflectie: reflectieScore(checkins),
      coach: (inp.coachRating && typeof inp.coachRating.score === 'number' && txt(inp.coachRating.reason))
        ? clamp(round(inp.coachRating.score), 0, 100) : null
    };

    // §22: zonder gedragsbewijs geen score
    if (signalen.gedrag === null) {
      return { version: VERSION, ready: false, weken: checkins.length, weekenNodig: 0, completion: null,
               note: 'Geen uitvoeringsdata. Een score stijgt niet omdat iemand zegt dat het beter gaat.' };
    }

    let acc = 0, w = 0;
    SIGNAAL_ORDER.forEach((k) => {
      if (signalen[k] === null) return;
      acc += signalen[k] * PROGRESS_SIGNALEN[k].weight; w += PROGRESS_SIGNALEN[k].weight;
    });
    const index = w > 0 ? acc / w : 0;

    const basis = typeof inp.previousScore === 'number' ? inp.previousScore : inp.startScore;
    const stap = clamp((index - 50) * GEVOELIGHEID, -MAX_STAP, MAX_STAP);
    const score = clamp(round(basis + stap), 0, 100);

    return {
      version: VERSION, ready: true, weken: checkins.length,
      signalen: SIGNAAL_ORDER.map((k) => ({ key: k, label: PROGRESS_SIGNALEN[k].label,
        weight: PROGRESS_SIGNALEN[k].weight, score: signalen[k] })),
      ontwikkelingsindex: round(index),
      basis, delta: round(score - basis), score,
      completion: signalen.gedrag,
      bewijs: bouwBewijs(checkins, signalen, inp),
      note: 'Startscore, Action Completion en Progress Score zijn drie verschillende dingen.'
    };
  }

  /* Bewijs van ontwikkeling — het verhaal naast het cijfer. */
  function bouwBewijs(checkins, signalen, inp) {
    const uit = [];
    const alle = checkins.reduce((s, c) => s.concat(c.actions || []), []);
    if (alle.length) {
      const done = alle.filter((x) => x.status === 'done').length;
      uit.push(round(done / alle.length * 100) + '% van je afspraken nagekomen');
    }
    const reeks = checkins.map(actionCompletion).filter((x) => x !== null);
    let langste = 0, huidig = 0;
    reeks.forEach((x) => { if (x >= CONSISTENT) { huidig++; langste = Math.max(langste, huidig); } else huidig = 0; });
    if (langste >= 2) uit.push(langste + ' weken achter elkaar consistent');
    if (signalen.reflectie !== null && signalen.reflectie >= 60) uit.push('elke week gereflecteerd op je eigen patroon');
    if (typeof inp.goalProgress === 'number' && inp.goalProgress >= 100) uit.push('één belangrijk doel afgerond');
    else if (typeof inp.goalProgress === 'number' && inp.goalProgress >= 50) uit.push('je doel voor meer dan de helft gehaald');
    const inzichten = checkins.map((c) => txt((c.reflection || {}).geleerd)).filter(Boolean);
    if (inzichten.length) uit.push('inzicht gekregen in je terugkerende patroon: "' + inzichten[inzichten.length - 1] + '"');
    return uit;
  }

  const Coaching = { VERSION, SESSIE1_BLOKKEN, CHECKIN_VRAGEN, CHECKIN_CIJFERS, STATUS,
                     PROGRESS_SIGNALEN, SIGNAAL_ORDER, MIN_WEKEN, CONSISTENT, GEVOELIGHEID, MAX_STAP,
                     sessieGids, actionCompletion, analyseCheckin, computeProgress };
  if (typeof module !== 'undefined' && module.exports) module.exports = Coaching;
  else root.Coaching = Coaching;
})(typeof window !== 'undefined' ? window : globalThis);
