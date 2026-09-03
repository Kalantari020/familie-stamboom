/* Coaching Platform — DATAMODEL MVP V1.0
   Entiteiten, opslag en seed. Eén harde regel (specificatie §5 van het
   datamodel): score-snapshots worden NOOIT overschreven. Elke meting is een
   nieuwe rij, zodat de volledige ontwikkeling reconstrueerbaar blijft.

   USER → CLIENT → { INTAKE → ANSWERS, SCORE SNAPSHOTS, GOALS, ACTIONS,
                     CHECK-INS, REFLECTIONS, COACH SESSIONS } */

(function (root) {
  'use strict';

  const SCHEMA_VERSION = '1.0';
  const KEY = 'coaching_mvp_v1';
  const isNode = (typeof require === 'function' && typeof module !== 'undefined');
  const Scoring = isNode ? require('./scoring.js') : root.Scoring;
  const Priority = isNode ? require('./priority.js') : root.Priority;
  const Coaching = isNode ? require('./coaching.js') : root.Coaching;

  const TABLES = ['users', 'clients', 'intakes', 'intake_answers', 'score_snapshots', 'dimension_scores',
                  'goals', 'actions', 'check_ins', 'check_in_actions', 'reflections', 'coach_sessions', 'focus_records'];

  let seq = 0;
  const uid = (p) => p + '_' + (Date.now().toString(36)) + (++seq).toString(36);
  const today = (offsetDays) => new Date(Date.now() + (offsetDays || 0) * 864e5).toISOString().slice(0, 10);
  const now = () => new Date().toISOString();

  function empty() {
    const db = { schema_version: SCHEMA_VERSION };
    TABLES.forEach((t) => { db[t] = []; });
    return db;
  }

  let db = empty();

  /* ---------------------------------------------------------------- opslag */

  function load() {
    try {
      const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(KEY);
      if (raw) { const p = JSON.parse(raw); TABLES.forEach((t) => { if (!p[t]) p[t] = []; }); db = p; return db; }
    } catch (e) { /* eerste keer of geblokkeerde storage */ }
    db = seed(); save(); return db;
  }
  function save() { try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  function reset() { db = seed(); save(); return db; }
  function all() { return db; }
  const where = (t, f) => db[t].filter(f);
  const first = (t, f) => db[t].find(f) || null;
  function insert(t, row) { const r = Object.assign({ id: uid(t.slice(0, 3)) }, row); db[t].push(r); save(); return r; }
  function update(t, id, patch) { const r = first(t, (x) => x.id === id); if (r) { Object.assign(r, patch); save(); } return r; }
  function remove(t, id) { const i = db[t].findIndex((x) => x.id === id); if (i >= 0) { db[t].splice(i, 1); save(); } }

  /* ---------------------------------------------------------------- intake */

  function intakeOf(clientId) { return first('intakes', (i) => i.client_id === clientId); }

  function answersObject(intakeId) {
    const out = {};
    where('intake_answers', (a) => a.intake_id === intakeId).forEach((a) => { out[a.question_id] = a.raw_value; });
    return out;
  }

  /* Slaat het volledige antwoordobject op als losse rijen (één per veld). */
  function saveAnswers(intakeId, answers) {
    const bestaand = {};
    where('intake_answers', (a) => a.intake_id === intakeId).forEach((a) => { bestaand[a.question_id] = a; });
    Object.keys(answers).forEach((qid) => {
      if (qid.indexOf('__') === 0) return;
      const raw = answers[qid];
      if (bestaand[qid]) { bestaand[qid].raw_value = raw; bestaand[qid].updated_at = now(); }
      else insert('intake_answers', { intake_id: intakeId, question_id: qid, raw_value: raw,
                                      normalized_value: null, score_dimension: null, created_at: now() });
    });
    save();
  }

  /* Vult normalized_value en score_dimension bij vanuit het scoreresultaat. */
  function syncNormalized(intakeId, result) {
    const perVraag = {};
    Scoring.DIM_ORDER.forEach((k) => result.dims[k].components.forEach((c) => {
      if (!perVraag[c.qid]) perVraag[c.qid] = { value: c.value, dim: k };
    }));
    const MAP = { Q7: 'q7', Q8: 'q8', Q9: 'q9', Q10: 'q10', Q11: 'q11', Q12: 'q12', Q13: 'q13_s', Q14: 'q14_s',
                  Q15: 'q15_s', Q16: 'q16_s', Q17: 'q17_n', Q18: 'q18_s', Q19: 'q19_s', Q20: 'q20_s',
                  Q22: 'q22', Q24: 'q24', Q25: 'q25_s' };
    where('intake_answers', (a) => a.intake_id === intakeId).forEach((a) => {
      const qid = Object.keys(MAP).find((q) => MAP[q] === a.question_id);
      if (qid && perVraag[qid]) { a.normalized_value = perVraag[qid].value; a.score_dimension = perVraag[qid].dim; }
    });
    save();
  }

  /* ---------------------------------------------------------------- scores */

  function coachInputOf(clientId) {
    const c = first('clients', (x) => x.id === clientId);
    return (c && c.coach_input) || { dimensions: {}, components: {}, structureModifier: {}, focusValidation: {} };
  }

  function scoreOf(clientId) {
    const intake = intakeOf(clientId);
    if (!intake) return null;
    return Scoring.computeScore(answersObject(intake.id), coachInputOf(clientId));
  }
  function priorityOf(clientId, r) {
    const res = r || scoreOf(clientId);
    return res ? Priority.computePriority(res, coachInputOf(clientId)) : null;
  }

  /* NOOIT overschrijven: elke meting is een nieuwe snapshot-rij. */
  function createSnapshot(clientId, type, r, extra) {
    const res = r || scoreOf(clientId);
    if (!res) return null;
    const snap = insert('score_snapshots', {
      client_id: clientId, score_type: type,
      overall_score: (extra && typeof extra.overall === 'number') ? extra.overall : res.total,
      foundation_index: res.foundationIndex,
      foundation_status: res.foundationStatus ? res.foundationStatus.code : null,
      confidence: res.confidence.code,
      created_at: now(), scoring_version: res.frameworkVersion,
      note: (extra && extra.note) || ''
    });
    Scoring.DIM_ORDER.forEach((k) => {
      const d = res.dims[k];
      insert('dimension_scores', {
        snapshot_id: snap.id, dimension: k, ai_score: d.aiScore,
        coach_score: d.coachAdjusted ? d.score : null, confidence: d.confidence.code,
        ai_observation: (d.components.find((c) => c.observation) || {}).observation || '',
        coach_adjustment_reason: d.coachReason || ''
      });
    });
    return snap;
  }

  const snapshotsOf = (clientId) => where('score_snapshots', (s) => s.client_id === clientId)
    .sort((a, b) => a.created_at < b.created_at ? -1 : 1);
  const dimensionsOf = (snapshotId) => where('dimension_scores', (d) => d.snapshot_id === snapshotId);
  function latestSnapshot(clientId) { const s = snapshotsOf(clientId); return s.length ? s[s.length - 1] : null; }
  function startSnapshot(clientId) { return snapshotsOf(clientId).find((s) => s.score_type === 'start') || null; }

  /* ---------------------------------------------------------------- acties en check-ins */

  const actionsOf = (clientId) => where('actions', (a) => a.client_id === clientId && a.status !== 'archived');
  const activeActions = (clientId) => actionsOf(clientId).filter((a) => a.status === 'active');
  const checkinsOf = (clientId) => where('check_ins', (c) => c.client_id === clientId).sort((a, b) => a.week - b.week);
  const checkinActions = (checkinId) => where('check_in_actions', (c) => c.check_in_id === checkinId);
  const goalsOf = (clientId) => where('goals', (g) => g.client_id === clientId);
  const sessionsOf = (clientId) => where('coach_sessions', (s) => s.client_id === clientId)
    .sort((a, b) => a.session_date < b.session_date ? 1 : -1);
  const reflectionsOf = (clientId) => where('reflections', (r) => r.client_id === clientId)
    .sort((a, b) => a.created_at < b.created_at ? 1 : -1);
  const focusOf = (clientId) => {
    const f = where('focus_records', (x) => x.client_id === clientId).sort((a, b) => a.created_at < b.created_at ? -1 : 1);
    return f.length ? f[f.length - 1] : null;
  };

  /* Check-ins in het formaat dat de Coaching Engine verwacht.
     `sinds` beperkt tot één evaluatieperiode: dezelfde weken mogen de score
     niet twee keer verhogen. */
  function checkinPayload(clientId, sinds) {
    return checkinsOf(clientId).filter((c) => !sinds || (c.submitted_at || '') > sinds).map((c) => ({
      week: c.week, date: c.submitted_at ? c.submitted_at.slice(0, 10) : null,
      actions: checkinActions(c.id).map((ca) => ({ text: ca.title, status: ca.status })),
      reflection: c.reflection || {}, ratings: c.self_rating || {}
    }));
  }

  function progressOf(clientId) {
    const start = startSnapshot(clientId), laatste = latestSnapshot(clientId);
    const c = first('clients', (x) => x.id === clientId) || {};
    // Een nieuwe Progress Score rekent alleen met de weken sinds de vorige meting.
    const sinds = (laatste && laatste.score_type === 'progress') ? laatste.created_at : null;
    return Coaching.computeProgress({
      startScore: start ? start.overall_score : null,
      previousScore: laatste ? laatste.overall_score : null,
      checkins: checkinPayload(clientId, sinds),
      goalProgress: typeof c.goal_progress === 'number' ? c.goal_progress : undefined,
      coachRating: c.coach_rating || {}
    });
  }

  /* Statuslicht op het coachoverzicht: 🟢 op koers · 🟡 aandacht · 🔴 coach check */
  function clientStatus(clientId) {
    const r = scoreOf(clientId);
    if (!r) return { code: 'grijs', icon: '⚪', label: 'Intake nog niet af' };
    const pr = priorityOf(clientId, r);
    const cis = checkinsOf(clientId);
    const laatste = cis.length ? cis[cis.length - 1] : null;
    if (!pr.visibleToClient) return { code: 'rood', icon: '🔴', label: 'Focus nog niet gevalideerd' };
    if (r.checks.filter((x) => x.type !== 'data').length >= 3) return { code: 'rood', icon: '🔴', label: 'Coach check' };
    if (laatste && laatste.action_completion !== null && laatste.action_completion < 60)
      return { code: 'geel', icon: '🟡', label: 'Uitvoering blijft achter' };
    if (!laatste) return { code: 'geel', icon: '🟡', label: 'Nog geen check-in' };
    return { code: 'groen', icon: '🟢', label: 'Op koers' };
  }

  const FASES = ['Inzicht', 'Fundament', 'Stabiliteit', 'Groei', 'Ownership', 'Zelfstandigheid'];
  function faseOf(clientId) {
    const r = scoreOf(clientId);
    if (!r) return FASES[0];
    const fi = r.foundationIndex;
    if (fi === null) return FASES[0];
    if (fi < 40) return FASES[1];
    if (fi < 60) return FASES[2];
    if (fi < 75) return FASES[3];
    return FASES[4];
  }

  /* ---------------------------------------------------------------- seed */

  function seed() {
    db = empty();
    const coach = insert('users', { email: 'coach@fundament.nl', name: 'Coach', role: 'coach', created_at: now() });

    const PROFIELEN = [
      { naam: 'Ahmed', email: 'ahmed@voorbeeld.nl', answers: A_AHMED(), weken: 4, doel: 55,
        rating: { score: 60, reason: 'uitvoering is sterk, inzicht groeit' }, focusStatus: 'bevestigd' },
      { naam: 'Mark', email: 'mark@voorbeeld.nl', answers: A_MARK(), weken: 2, doel: 25,
        rating: { score: 40, reason: 'uitvoering blijft achter bij de intentie' }, focusStatus: 'bevestigd' },
      { naam: 'David', email: 'david@voorbeeld.nl', answers: A_DAVID(), weken: 4, doel: 80,
        rating: { score: 80, reason: 'consistent, klaar voor groeidoelen' }, focusStatus: 'voorlopig' }
    ];

    PROFIELEN.forEach((p, idx) => {
      const u = insert('users', { email: p.email, name: p.naam, role: 'client', created_at: now() });
      const c = insert('clients', { user_id: u.id, coach_id: coach.id, name: p.naam, status: 'active',
                                    created_at: today(-40 + idx), goal_progress: p.doel, coach_rating: p.rating,
                                    coach_input: { dimensions: {}, components: {}, structureModifier: {}, focusValidation: {} } });
      const intake = insert('intakes', { client_id: c.id, status: 'completed', completed_at: today(-35 + idx),
                                         scoring_version: Scoring.FRAMEWORK_VERSION });
      saveAnswers(intake.id, p.answers);

      const r = Scoring.computeScore(p.answers, {});
      syncNormalized(intake.id, r);
      const startSnap = createSnapshot(c.id, 'start', r, { note: 'Startscore na intake' });
      startSnap.created_at = new Date(Date.now() - (35 - idx) * 864e5).toISOString();

      const pr = Priority.computePriority(r, {});
      if (p.focusStatus === 'bevestigd') {
        c.coach_input.focusValidation = { status: 'bevestigd', focus: pr.aiPrimary, reason: 'bevestigd in sessie 1' };
      }
      insert('focus_records', { client_id: c.id, engine_version: pr.engineVersion,
        primary_focus: pr.aiPrimary, secondary_focus: pr.secondary, focus_mode: pr.mode,
        ai_hypothesis: pr.hypothese, coach_validated_focus: p.focusStatus === 'bevestigd' ? pr.aiPrimary : null,
        coach_validation_status: p.focusStatus, coach_validation_reason: p.focusStatus === 'bevestigd' ? 'bevestigd in sessie 1' : '',
        created_at: today(-34 + idx) });

      const goal = insert('goals', { client_id: c.id, title: p.answers.q12 || 'Doel voor drie maanden',
        description: 'Uit vraag 12 van de intake.', start_date: today(-34 + idx), target_date: today(56), status: 'active' });

      const acties = Coaching.sessieGids(p.answers, r, pr).actievoorstellen;
      const acts = acties.map((t) => insert('actions', { client_id: c.id, goal_id: goal.id, title: t,
        description: '', frequency: 'wekelijks', start_date: today(-34 + idx), end_date: null, status: 'active' }));

      // check-ins met per-actie resultaat
      const REFL = [
        { goed: 'Mijn ochtendroutine werkt', obstakel: 'Ik had geen tijd, mijn avonden blijven chaotisch',
          geleerd: 'Ik merk dat mijn avonden het grootste probleem zijn' },
        { goed: 'Drie keer op tijd naar bed', obstakel: 'Vrijdag toch weer laat geworden',
          geleerd: 'Als ik mijn telefoon wegleg lukt het bijna vanzelf' },
        { goed: 'Elke ochtend gepland', obstakel: 'Werk liep uit',
          geleerd: 'Ik plan mijn avonden niet, alleen mijn ochtenden' },
        { goed: 'Voor het eerst een hele week volgehouden', obstakel: 'Weinig',
          geleerd: 'Ik heb minder discipline nodig dan ik dacht, ik had vooral structuur nodig' }
      ];
      const PATROON = idx === 1
        ? [['done', 'none', 'none'], ['done', 'none', 'partial']]
        : idx === 2
          ? [['done', 'done', 'done'], ['done', 'done', 'done'], ['done', 'done', 'partial'], ['done', 'done', 'done']]
          : [['done', 'done', 'done'], ['done', 'done', 'done'], ['done', 'done', 'done'], ['done', 'done', 'none']];

      PATROON.slice(0, p.weken).forEach((st, w) => {
        const ci = insert('check_ins', { client_id: c.id, week: w + 1,
          action_completion: null, self_rating: { zorg: 6 + (w % 2), afspraken: 6 + (w % 3) },
          reflection: REFL[w % REFL.length], submitted_at: new Date(Date.now() - (p.weken - w) * 7 * 864e5).toISOString() });
        st.forEach((s, j) => insert('check_in_actions', { check_in_id: ci.id, action_id: (acts[j] || {}).id || null,
          title: (acts[j] || {}).title || ('actie ' + (j + 1)), status: s }));
        ci.action_completion = Coaching.actionCompletion({ actions: checkinActions(ci.id) });
        insert('reflections', { client_id: c.id, type: 'weekly', prompt: 'Wat heb je deze week over jezelf geleerd?',
          answer: REFL[w % REFL.length].geleerd, created_at: ci.submitted_at });
      });

      insert('coach_sessions', { client_id: c.id, session_date: today(-33 + idx), session_type: 'Sessie 1 — intake',
        focus: pr.aiPrimaryLabel, coach_notes: 'Startpunt besproken. ' + pr.hypothese,
        next_step: 'Eerste week uitvoeren en check-in invullen.' });

      // progress-snapshot na vier weken
      if (p.weken >= Coaching.MIN_WEKEN) {
        const pg = progressOf(c.id);
        if (pg.ready) {
          const ps = createSnapshot(c.id, 'progress', r, { overall: pg.score, note: 'Progress Score na ' + pg.weken + ' weken' });
          ps.confidence = r.confidence.code;
        }
      }
    });
    save();
    return db;
  }

  /* --- seed-antwoorden: drie herkenbare archetypen ------------------------ */

  function A_AHMED() {   // gemotiveerd, richting helder, structuur blijft achter
    return { q1: 29, q2: 'Alleen', q3: 'Fulltime IT-consultant, 45 uur per week, veel reistijd.',
      q4_s: 6, q4_t: 'Op papier gaat het prima maar ik voel me niet in controle.',
      q5_1: 'Mijn werk gaat goed', q5_2: 'Ik ben er voor mijn familie', q5_3: 'Ik geef niet snel op',
      q6_1: 'Mijn slaap', q6_2: 'Sporten', q6_3: 'Minder op mijn telefoon',
      q7: 'Mijn dagstructuur, elke avond de volgende dag plannen',
      q8: 'Op tijd naar bed gaan en s ochtends sporten, dat lukt me al jaren niet',
      q9: 'Ik wil over drie jaar in de beste vorm van mijn leven zijn en een eigen bedrijf hebben waar ik trots op ben.',
      q10: ['Gezondheid & lichaam', 'Mentale kracht & discipline', 'Werk & carrière'],
      q11: 'Omdat ik voel dat ik onder mijn niveau leef en dat wil ik niet voor mijn gezin.',
      q12: 'Elke werkdag om 23:00 naar bed en 3 keer per week sporten.',
      q13_s: 6, q13_t: 'Niet ziek maar ook niet fit.', q14_s: 5, q14_t: 'Vooral slecht slapen en te veel schermtijd.',
      q15_s: 5, q15_bed: '01:00', q15_rise: '07:00', q16_s: 6, q16_t: 'Te vaak afhalen in de avond.',
      q17_n: 2, q17_t: 'In het weekend naar de sportschool.',
      q18_s: 4, q18_t: 'Ik plan eigenlijk niets, ik zie wel wat er komt.',
      q19_s: 5, q19_t: 'Administratie en post blijven liggen.',
      q20_s: 5, q20_t: 'Sporten en vroeg opstaan houd ik nooit vol.',
      q21: ['Social media', 'YouTube', 'Telefoon algemeen'], q21_t: 'Vaak 4 tot 5 uur per dag op mijn telefoon.',
      q22: 'Mijn gezondheid serieuzer nemen en elke week mijn administratie doen.',
      q23: 'Discipline & volhouden', q24: 'Ik word bijna 30 en wil niet over een jaar nog op dit punt staan.',
      q25_s: 9, q25_t: 'Ik wil er echt voor gaan.' };
  }

  function A_MARK() {    // zwak fundament, hoge ambitie
    return { q1: 41, q2: 'Gezin / kinderen', q3: 'Eigen klusbedrijf, onregelmatige dagen van 10 tot 12 uur.',
      q4_s: 4, q4_t: 'Ik ren de hele dag en kom aan niets toe.',
      q5_1: 'Mijn kinderen', q5_2: 'Mijn vakmanschap', q5_3: '',
      q6_1: 'Slaap', q6_2: 'Gewicht', q6_3: 'Rust',
      q7: 'Beter slapen', q8: 'Sporten en op tijd stoppen met werken, dat lukt structureel nooit, al jaren niet, en dat geldt voor alles',
      q9: 'Ik wil fit zijn en meer tijd hebben voor mijn gezin.',
      q10: ['Gezondheid & lichaam', 'Relatie & gezin', 'Geld & financiële vrijheid', 'Werk & carrière'],
      q11: 'Omdat ik merk dat ik mijn kinderen mis en zelf op is.',
      q12: 'Meer rust krijgen',
      q13_s: 4, q13_t: 'Rugpijn en te zwaar.', q14_s: 3, q14_t: 'Ik slaap slecht en eet slecht.',
      q15_s: 3, q15_bed: '00:30', q15_rise: '05:30', q16_s: 3, q16_t: 'Onderweg eten.',
      q17_n: 0, q17_t: '', q18_s: 3, q18_t: 'Geen planning, alles is spoed.',
      q19_s: 3, q19_t: 'Administratie loopt maanden achter.',
      q20_s: 4, q20_t: 'Ik beloof mezelf van alles en doe het niet.',
      q21: ['Telefoon algemeen'], q21_t: 'Vooral werk op de telefoon.',
      q22: 'Mijn gezondheid.', q23: 'Slaap & rust',
      q24: 'Mijn huisarts zei dat het zo niet langer gaat.',
      q25_s: 8, q25_t: 'Ik wil echt veranderen maar weet niet waar ik moet beginnen.' };
  }

  function A_DAVID() {   // stevige basis, klaar voor groei
    return { q1: 36, q2: 'Partner', q3: 'Teamlead bij een softwarebedrijf, 40 uur, vaste dagen.',
      q4_s: 8, q4_t: 'Gaat goed, ik wil alleen meer uit mezelf halen.',
      q5_1: 'Mijn relatie', q5_2: 'Mijn conditie', q5_3: 'Mijn financiën op orde',
      q6_1: 'Meer focus', q6_2: 'Krachttraining', q6_3: 'Zakelijke stap',
      q7: 'Twee keer per week krachttraining toevoegen aan mijn schema',
      q8: 'Krachttraining, dat schuif ik soms door',
      q9: 'Ik wil over drie jaar een leidinggevende rol hebben en in de beste vorm van mijn leven zijn.',
      q10: ['Werk & carrière', 'Gezondheid & lichaam'],
      q11: 'Omdat ik merk dat ik groei nodig heb om gemotiveerd te blijven, voor mijzelf en mijn partner.',
      q12: 'Drie keer per week krachttraining en in september mijn certificering halen.',
      q13_s: 8, q13_t: 'Fit, ik hardloop al jaren.', q14_s: 7, q14_t: 'Goede slaap en vaste ritmes.',
      q15_s: 8, q15_bed: '22:45', q15_rise: '06:30', q16_s: 7, q16_t: 'Meer eiwitten.',
      q17_n: 4, q17_t: 'Hardlopen en fietsen.', q18_s: 8, q18_t: 'Ik plan elke zondagavond mijn week.',
      q19_s: 8, q19_t: 'Weinig blijft liggen.', q20_s: 7, q20_t: 'Krachttraining schuif ik soms door.',
      q21: [], q21_t: '', q22: 'Mijn krachttraining serieus inplannen in plaats van erbij doen.',
      q23: 'Discipline & volhouden', q24: 'Ik voel dat ik toe ben aan een volgende stap in mijn werk.',
      q25_s: 8, q25_t: 'Ik plan twee vaste krachtsessies op dinsdag en donderdag om 07:00.' };
  }

  const Model = { SCHEMA_VERSION, TABLES, FASES, load, save, reset, all, where, first, insert, update, remove,
                  uid, today, now, intakeOf, answersObject, saveAnswers, syncNormalized, coachInputOf,
                  scoreOf, priorityOf, createSnapshot, snapshotsOf, dimensionsOf, latestSnapshot, startSnapshot,
                  actionsOf, activeActions, checkinsOf, checkinActions, checkinPayload, goalsOf, sessionsOf,
                  reflectionsOf, focusOf, progressOf, clientStatus, faseOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = Model;
  else root.Model = Model;
})(typeof window !== 'undefined' ? window : globalThis);
