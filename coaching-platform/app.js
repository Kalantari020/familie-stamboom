/* Coaching Platform — MVP V1.0 prototype
   Klikbare schermen op het datamodel uit model.js. Rekent zelf niets uit:
   scoring.js, priority.js en coaching.js doen het werk. */

(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

  /* platte vragenlijst 1..25 met hun categorie */
  const VRAGEN = [];
  INTAKE.categories.forEach((c, ci) => c.questions.forEach((q) => VRAGEN.push(Object.assign({ cat: c, catIndex: ci }, q))));

  /* sessiestatus: wie kijkt er, en naar welke cliënt */
  let ses = { role: null, clientId: null, coachTab: 'assessment', intakeStep: 0, draft: null };
  try { const s = localStorage.getItem('coaching_session_v1'); if (s) ses = Object.assign(ses, JSON.parse(s)); } catch (e) {}
  const saveSes = () => { try { localStorage.setItem('coaching_session_v1', JSON.stringify(ses)); } catch (e) {} };

  const go = (h) => { location.hash = h; };
  const client = () => Model.first('clients', (c) => c.id === ses.clientId);

  /* ================================================================ chrome */

  function chrome() {
    const bar = $('#topbar'); bar.innerHTML = '';
    const inner = el('div', 'top-in');
    const brand = el('div');
    brand.appendChild(el('div', 'brand', 'FUNDAMENT<span>.</span>'));
    brand.appendChild(el('div', 'tagline', 'Eerst het fundament, daarna groei'));
    brand.style.cursor = 'pointer';
    brand.onclick = () => go(ses.role === 'coach' ? '#/coach/clients' : '#/dashboard');
    inner.appendChild(brand);

    const nav = el('nav', 'top-nav');
    if (ses.role === 'client' && ses.clientId) {
      [['#/dashboard', 'Dashboard'], ['#/actions', 'Acties'], ['#/checkin', 'Check-in'],
       ['#/reflection', 'Reflectie'], ['#/progress', 'Voortgang']].forEach(([h, l]) => {
        const b = el('button', location.hash === h ? 'on' : '', l); b.onclick = () => go(h); nav.appendChild(b);
      });
    } else if (ses.role === 'coach') {
      const b = el('button', /#\/coach\/clients/.test(location.hash) ? 'on' : '', 'Cliënten');
      b.onclick = () => go('#/coach/clients'); nav.appendChild(b);
    }
    if (ses.role) {
      const sw = el('button', '', 'Wisselen'); sw.onclick = () => { ses.role = null; ses.clientId = null; saveSes(); go('#/'); };
      nav.appendChild(sw);
      const rs = el('button', '', 'Reset data');
      rs.onclick = () => { if (confirm('Alle demodata terugzetten naar de uitgangssituatie?')) { Model.reset(); render(); } };
      nav.appendChild(rs);
    }
    inner.appendChild(nav);
    bar.appendChild(inner);
  }

  /* ================================================================ login */

  function screenLogin() {
    const v = $('#view');
    const card = el('div', 'card hero-card');
    card.appendChild(el('div', 'eyebrow', 'Coaching Platform · MVP v1.0'));
    card.appendChild(el('h1', null, 'Eerst het fundament, daarna groei'));
    card.appendChild(el('p', null, 'Kies met welke rol je het prototype wilt bekijken. Alle data is fictief en staat lokaal in je browser.'));
    v.appendChild(card);

    const row = el('div', 'row');
    const cl = el('div', 'card col');
    cl.appendChild(el('div', 'eyebrow', 'Cliënt'));
    cl.appendChild(el('h2', null, 'Bekijk het klantdashboard'));
    cl.appendChild(el('p', 'muted', 'Startpunt, focus, acties, check-in en voortgang.'));
    Model.where('clients', () => true).forEach((c) => {
      const r = Model.scoreOf(c.id); const st = Model.clientStatus(c.id);
      const b = el('button', 'ghost wide', '<b>' + esc(c.name) + '</b><span class="muted"> · startpunt ' +
        (Model.startSnapshot(c.id) ? Model.startSnapshot(c.id).overall_score : '—') + ' · ' +
        (r && r.foundationStatus ? r.foundationStatus.icon + ' ' + esc(r.foundationStatus.label) : '—') + '</span>');
      b.onclick = () => { ses.role = 'client'; ses.clientId = c.id; saveSes(); go('#/dashboard'); };
      cl.appendChild(b);
    });
    const nieuw = el('button', 'ghost wide', '+ Nieuwe cliënt — intake vanaf nul doorlopen');
    nieuw.onclick = () => {
      const u = Model.insert('users', { email: 'nieuw@voorbeeld.nl', name: 'Nieuwe cliënt', role: 'client', created_at: Model.now() });
      const c = Model.insert('clients', { user_id: u.id, coach_id: (Model.first('users', (x) => x.role === 'coach') || {}).id,
        name: 'Nieuwe cliënt', status: 'intake', created_at: Model.today(),
        coach_input: { dimensions: {}, components: {}, structureModifier: {}, focusValidation: {} } });
      Model.insert('intakes', { client_id: c.id, status: 'in_progress', completed_at: null, scoring_version: Scoring.FRAMEWORK_VERSION });
      ses.role = 'client'; ses.clientId = c.id; ses.intakeStep = 0; saveSes(); go('#/intake');
    };
    cl.appendChild(nieuw);
    row.appendChild(cl);

    const co = el('div', 'card col');
    co.appendChild(el('div', 'eyebrow', 'Coach'));
    co.appendChild(el('h2', null, 'Bekijk de coachomgeving'));
    co.appendChild(el('p', 'muted', 'Cliëntenoverzicht, intake, assessment, acties, check-ins en voortgang.'));
    const b = el('button', 'primary wide', 'Naar het coachdashboard');
    b.onclick = () => { ses.role = 'coach'; ses.clientId = null; saveSes(); go('#/coach/clients'); };
    co.appendChild(b);
    row.appendChild(co);
    v.appendChild(row);
  }

  /* ================================================================ intake — één vraag per scherm */

  function screenIntake() {
    const c = client(); if (!c) return go('#/');
    const intake = Model.intakeOf(c.id);
    const v = $('#view');
    const n = VRAGEN.length;
    const step = Math.min(Math.max(ses.intakeStep, 0), n);

    if (step === 0 && ses.intakeStep === 0 && !Object.keys(Model.answersObject(intake.id)).length) {
      // introscherm
      const card = el('div', 'card hero-card');
      card.appendChild(el('div', 'eyebrow', 'Jouw startpunt'));
      card.appendChild(el('h1', null, 'We willen eerst begrijpen waar je nu staat'));
      INTAKE.intro.forEach((p) => card.appendChild(el('p', null, esc(p))));
      const nav = el('div', 'nav-btns');
      const b = el('button', 'primary', 'Beginnen');
      b.onclick = () => { ses.intakeStep = 1; saveSes(); render(); };
      nav.appendChild(b); card.appendChild(nav);
      v.appendChild(card);
      return;
    }

    if (step > n) { go('#/intake/klaar'); return; }
    const q = VRAGEN[step - 1];
    if (!q) { go('#/intake/klaar'); return; }

    // voortgang
    const answers = Model.answersObject(intake.id);
    const gedaan = VRAGEN.filter((x) => (x.ids || [x.id]).some((id) => {
      const val = answers[id]; return Array.isArray(val) ? val.length : (val !== undefined && val !== '');
    })).length;

    const pr = el('div', 'progress');
    pr.appendChild(el('i')).style.width = (step / n * 100) + '%';
    v.appendChild(pr);
    const meta = el('div', 'intake-meta');
    meta.appendChild(el('span', null, String(step).padStart(2, '0') + ' / ' + n));
    meta.appendChild(el('span', 'muted', esc(q.cat.title)));
    v.appendChild(meta);

    // categorie-intro bij de eerste vraag van een deel
    if (q.cat.questions[0].n === q.n) {
      const ci = el('div', 'card tight');
      ci.appendChild(el('h2', null, esc(q.cat.title)));
      ci.appendChild(el('p', 'muted', esc(q.cat.intro)));
      v.appendChild(ci);
    }

    const card = el('div', 'card');
    card.appendChild(vraagBlok(q, intake));
    v.appendChild(card);

    const nav = el('div', 'nav-btns');
    if (step > 1) { const b = el('button', 'ghost', 'Terug'); b.onclick = () => { ses.intakeStep--; saveSes(); render(); }; nav.appendChild(b); }
    const nx = el('button', 'primary', step === n ? 'Intake afronden' : 'Verder →');
    nx.onclick = () => { ses.intakeStep++; saveSes(); if (ses.intakeStep > n) go('#/intake/klaar'); else render(); window.scrollTo(0, 0); };
    nav.appendChild(nx);
    nav.appendChild(el('div', 'muted', gedaan + ' van ' + n + ' beantwoord'));
    v.appendChild(nav);
  }

  function vraagBlok(q, intake) {
    const box = el('div', 'q');
    const answers = Model.answersObject(intake.id);
    const set = (id, val) => { const o = {}; o[id] = val; Model.saveAnswers(intake.id, o); };
    box.appendChild(el('div', 'q-label big', esc(q.label)));
    if (q.hint) box.appendChild(el('div', 'q-hint', esc(q.hint)));

    if (q.type === 'scale' || q.type === 'days') {
      const isDays = q.type === 'days', lo = isDays ? 0 : 1, hi = isDays ? 7 : 10;
      const sc = el('div', 'scale');
      for (let i = lo; i <= hi; i++) {
        const b = el('b', String(answers[q.id]) === String(i) ? 'on' : '', String(i));
        b.onclick = () => { set(q.id, i); render(); };
        sc.appendChild(b);
      }
      box.appendChild(sc);
      const lg = el('div', 'scale-legend');
      lg.appendChild(el('span', 'muted', isDays ? '0 dagen' : '1 — heel laag'));
      lg.appendChild(el('span', 'muted', isDays ? '7 dagen' : '10 — heel hoog'));
      box.appendChild(lg);
    } else if (q.type === 'choice' || q.type === 'multi') {
      const cur = q.type === 'multi' ? (answers[q.id] || []) : answers[q.id];
      const opts = el('div', 'opts');
      q.options.forEach((o) => {
        const on = q.type === 'multi' ? cur.indexOf(o) >= 0 : cur === o;
        const vol = q.max && q.type === 'multi' && !on && cur.length >= q.max;
        const b = el('div', 'opt' + (on ? ' on' : '') + (vol ? ' off' : ''), esc(o));
        b.onclick = () => {
          if (q.type === 'multi') {
            const list = (answers[q.id] || []).slice(); const i = list.indexOf(o);
            if (i >= 0) list.splice(i, 1); else { if (q.max && list.length >= q.max) return; list.push(o); }
            set(q.id, list);
          } else set(q.id, cur === o ? '' : o);
          render();
        };
        opts.appendChild(b);
      });
      box.appendChild(opts);
      if (q.max) box.appendChild(el('div', 'muted', (cur.length || 0) + ' / ' + q.max + ' geselecteerd'));
      const ander = q.type === 'multi' ? cur.indexOf(q.otherOn) >= 0 : cur === q.otherOn;
      if (q.otherId && ander) box.appendChild(veld(intake, q.otherId, 'text', 'Namelijk…'));
      if (q.id === 'q21') box.appendChild(tekst(intake, 'q21_t', 'Licht toe hoeveel tijd hier ongeveer naartoe gaat.'));
    } else if (q.type === 'triple') {
      q.ids.forEach((id, i) => box.appendChild(veld(intake, id, 'text', (i + 1) + '.')));
    } else if (q.type === 'number') {
      box.appendChild(veld(intake, q.id, 'number', ''));
    } else {
      box.appendChild(tekst(intake, q.id));
    }
    (q.extra || []).forEach((x) => {
      box.appendChild(el('div', 'q-hint', esc(x.label)));
      box.appendChild(veld(intake, x.id, x.type === 'time' ? 'time' : 'text', ''));
    });
    if (q.followUp) {
      box.appendChild(el('div', 'q-hint', esc(q.followUp.label)));
      box.appendChild(tekst(intake, q.followUp.id));
    }
    return box;
  }
  function veld(intake, id, type, ph) {
    const a = Model.answersObject(intake.id);
    const i = el('input'); i.type = type; i.placeholder = ph || ''; i.value = a[id] === undefined ? '' : a[id];
    i.oninput = () => { const o = {}; o[id] = i.value; Model.saveAnswers(intake.id, o); };
    return i;
  }
  function tekst(intake, id, ph) {
    const a = Model.answersObject(intake.id);
    const t = el('textarea'); t.value = a[id] || ''; if (ph) t.placeholder = ph;
    t.oninput = () => { const o = {}; o[id] = t.value; Model.saveAnswers(intake.id, o); };
    return t;
  }

  /* afronding + verwerkingsmoment — tijdens de intake geen enkele score tonen */
  function screenIntakeKlaar() {
    const c = client(); if (!c) return go('#/');
    const v = $('#view');
    const card = el('div', 'card hero-card');
    card.appendChild(el('div', 'eyebrow', 'Klaar'));
    card.appendChild(el('h1', null, 'Je intake is compleet'));
    card.appendChild(el('p', null, 'We hebben nu een eerste beeld van waar je staat.'));
    INTAKE.outro.slice(1).forEach((p) => card.appendChild(el('p', 'muted', esc(p))));
    const nav = el('div', 'nav-btns');
    const b = el('button', 'primary', 'Bekijk mijn startpunt');
    b.onclick = () => {
      const intake = Model.intakeOf(c.id);
      Model.update('intakes', intake.id, { status: 'completed', completed_at: Model.today() });
      Model.update('clients', c.id, { status: 'active' });
      const r = Model.scoreOf(c.id);
      Model.syncNormalized(intake.id, r);
      if (!Model.startSnapshot(c.id)) Model.createSnapshot(c.id, 'start', r, { note: 'Startscore na intake' });
      const pr = Model.priorityOf(c.id, r);
      if (!Model.focusOf(c.id)) Model.insert('focus_records', { client_id: c.id, engine_version: pr.engineVersion,
        primary_focus: pr.aiPrimary, secondary_focus: pr.secondary, focus_mode: pr.mode, ai_hypothesis: pr.hypothese,
        coach_validated_focus: null, coach_validation_status: 'voorlopig', coach_validation_reason: '', created_at: Model.today() });
      if ((Model.answersObject(intake.id).q12 || '').trim() && !Model.goalsOf(c.id).length) {
        Model.insert('goals', { client_id: c.id, title: Model.answersObject(intake.id).q12,
          description: 'Uit vraag 12 van de intake.', start_date: Model.today(), target_date: Model.today(90), status: 'active' });
      }
      go('#/verwerken');
    };
    nav.appendChild(b); card.appendChild(nav);
    v.appendChild(card);
  }

  function screenVerwerken() {
    const v = $('#view');
    const card = el('div', 'card hero-card center');
    card.appendChild(el('div', 'spinner'));
    card.appendChild(el('h2', null, 'We verwerken je antwoorden'));
    card.appendChild(el('p', 'muted', 'Een moment — we brengen in kaart waar je vandaag staat.'));
    v.appendChild(card);
    setTimeout(() => { if (location.hash === '#/verwerken') go('#/startpunt'); }, 1600);
  }

  /* ================================================================ startpunt */

  function screenStartpunt() {
    const c = client(); if (!c) return go('#/');
    const r = Model.scoreOf(c.id); const pr = Model.priorityOf(c.id, r);
    const snap = Model.startSnapshot(c.id);
    const v = $('#view');

    const hero = el('div', 'card score-hero');
    hero.appendChild(el('div', 'eyebrow', 'Jouw startpunt'));
    hero.appendChild(el('div', 'score-big', (snap ? snap.overall_score : r.total) + '<small> / 100</small>'));
    hero.appendChild(el('p', 'muted', 'Dit is geen oordeel over jou. Het is een momentopname van waar je vandaag staat.'));
    v.appendChild(hero);

    const fnd = el('div', 'card');
    fnd.appendChild(el('div', 'eyebrow', '🧱 Je fundament'));
    fnd.appendChild(el('div', 'score-mid', r.foundationIndex + ' / 100 — ' +
      r.foundationStatus.icon + ' ' + esc(r.foundationStatus.label)));
    fnd.appendChild(el('p', 'muted', esc(r.foundationStatus.text) + ' ' + esc(r.foundationStatus.focus)));
    v.appendChild(fnd);

    v.appendChild(dimensieKaart(r, 'Jouw zes gebieden'));

    const fb = el('div', 'card');
    const box = el('div', 'focus-box');
    box.appendChild(el('div', 'eyebrow', 'Waar beginnen we?'));
    if (pr.visibleToClient && pr.primaryFocus) {
      box.appendChild(el('h2', null, esc(pr.primaryFocusLabel)));
      box.appendChild(el('p', null, klantHypothese(r, pr)));
      box.appendChild(el('p', 'muted', 'Dit betekent niet dat dit “jouw probleem” is. Het is simpelweg het onderdeel waar we ' +
        'waarschijnlijk de meeste vooruitgang kunnen boeken door hier nu te beginnen.'));
    } else {
      box.appendChild(el('h2', 'wachten', 'Bespreken we in je eerste sessie'));
      box.appendChild(el('p', null, 'Je coach kijkt je antwoorden door en bepaalt samen met jou waar je begint. ' +
        'Dat gebeurt in het gesprek, niet automatisch op basis van een cijfer.'));
    }
    fb.appendChild(box);
    v.appendChild(fb);

    const nx = el('div', 'card tight');
    nx.appendChild(el('div', 'eyebrow', 'Je volgende stap'));
    nx.appendChild(el('p', null, 'Bespreek je startpunt tijdens je eerste coachsessie.'));
    const nav = el('div', 'nav-btns');
    const b = el('button', 'primary', 'Naar mijn dashboard →'); b.onclick = () => go('#/dashboard');
    nav.appendChild(b); nx.appendChild(nav);
    v.appendChild(nx);
  }

  /* klantvriendelijke variant van de hypothese: geen scores, geen jargon */
  function klantHypothese(r, pr) {
    const sterk = Scoring.DIM_ORDER.filter((k) => k !== pr.primaryFocus && r.dims[k].score !== null && r.dims[k].score >= 70)
      .sort((a, b) => r.dims[b].score - r.dims[a].score).slice(0, 2);
    const L = { F: 'je energie en herstel', S: 'je dagelijkse structuur', R: 'je richting',
                D: 'het nakomen van je eigen afspraken', O: 'het pakken van je eigen verantwoordelijkheid',
                C: 'je concrete bereidheid om iets anders te doen' };
    const S2 = { F: 'je lichamelijke basis staat', S: 'je dagelijkse organisatie loopt', R: 'je weet waar je naartoe wilt',
                 D: 'je komt afspraken met jezelf doorgaans na', O: 'je neemt verantwoordelijkheid voor je situatie',
                 C: 'je bent gemotiveerd om te veranderen' };
    let z = '';
    if (sterk.length) z += sterk.map((k) => S2[k]).join(' en ') + '. ';
    z = z.charAt(0).toUpperCase() + z.slice(1);
    z += 'Op basis van je antwoorden lijkt ' + L[pr.primaryFocus] + ' momenteel de grootste hefboom.';
    return esc(z);
  }

  function dimensieKaart(r, titel) {
    const card = el('div', 'card');
    card.appendChild(el('div', 'eyebrow', titel));
    Scoring.DIM_ORDER.forEach((k) => {
      const d = r.dims[k];
      const b = el('div', 'bar');
      const top = el('div', 'bar-top');
      top.appendChild(el('span', null, d.icon + ' ' + esc(d.label)));
      top.appendChild(el('span', null, d.score === null ? '<em>—</em>' : d.score + ' / 100'));
      b.appendChild(top);
      const tr = el('div', 'bar-track');
      const fi = el('i', 'bar-fill ' + barClass(d.score || 0)); fi.style.width = (d.score || 0) + '%';
      tr.appendChild(fi); b.appendChild(tr);
      card.appendChild(b);
    });
    return card;
  }
  const barClass = (v) => v < 40 ? 'low' : v < 60 ? 'mid' : v < 75 ? 'ok' : 'high';

  /* ================================================================ dashboard */

  function screenDashboard() {
    const c = client(); if (!c) return go('#/');
    const intake = Model.intakeOf(c.id);
    if (!intake || intake.status !== 'completed') { ses.intakeStep = ses.intakeStep || 0; saveSes(); return go('#/intake'); }
    const r = Model.scoreOf(c.id), pr = Model.priorityOf(c.id, r);
    const start = Model.startSnapshot(c.id), laatste = Model.latestSnapshot(c.id);
    const v = $('#view');

    const uur = new Date().getHours();
    const groet = uur < 12 ? 'Goedemorgen' : uur < 18 ? 'Goedemiddag' : 'Goedenavond';
    const kop = el('div', 'card hero-card');
    kop.appendChild(el('h1', null, groet + ', ' + esc(c.name)));
    kop.appendChild(el('p', 'muted', 'Eén stap tegelijk. Bouw eerst je fundament.'));
    v.appendChild(kop);

    // startpunt + fundament
    const sp = el('div', 'card');
    sp.appendChild(el('div', 'eyebrow', 'Jouw huidige startpunt'));
    const rij = el('div', 'split');
    const links = el('div');
    links.appendChild(el('div', 'score-big small', (laatste ? laatste.overall_score : r.total) + '<small> / 100</small>'));
    if (start && laatste && laatste.id !== start.id) {
      const d = laatste.overall_score - start.overall_score;
      links.appendChild(el('div', 'muted', (d >= 0 ? '+' : '') + d + ' sinds je start (' + start.overall_score + ')'));
    }
    rij.appendChild(links);
    const rechts = el('div');
    rechts.appendChild(el('div', 'status-pill status-' + r.foundationStatus.code,
      r.foundationStatus.icon + ' Fundament — ' + esc(r.foundationStatus.label)));
    rechts.appendChild(el('p', 'muted', 'Je hoeft niet alles tegelijk te veranderen. We beginnen bij het onderdeel dat nu de grootste hefboom heeft.'));
    rij.appendChild(rechts);
    sp.appendChild(rij);
    v.appendChild(sp);

    // focus
    const fc = el('div', 'card');
    const fb = el('div', 'focus-box');
    fb.appendChild(el('div', 'eyebrow', '🎯 Jouw focus'));
    if (pr.visibleToClient && pr.primaryFocus) {
      fb.appendChild(el('h2', null, esc(pr.primaryFocusLabel.toUpperCase())));
      fb.appendChild(el('p', null, klantHypothese(r, pr)));
    } else {
      fb.appendChild(el('h2', 'wachten', 'Bespreken we in je eerste sessie'));
      fb.appendChild(el('p', null, 'Je coach bepaalt samen met jou waar je begint.'));
    }
    fc.appendChild(fb);
    v.appendChild(fc);

    // deze week
    const acts = Model.activeActions(c.id);
    const week = el('div', 'card');
    week.appendChild(el('div', 'eyebrow', 'Deze week'));
    if (!acts.length) week.appendChild(el('p', 'muted', 'Je coach zet hier maximaal drie concrete acties klaar.'));
    else {
      acts.forEach((a) => {
        const row = el('div', 'action-line');
        row.appendChild(el('span', 'box' + (a.done_this_week ? ' on' : ''), a.done_this_week ? '✓' : ''));
        row.appendChild(el('span', a.done_this_week ? 'done' : '', esc(a.title)));
        row.onclick = () => { Model.update('actions', a.id, { done_this_week: !a.done_this_week }); render(); };
        week.appendChild(row);
      });
      const d = acts.filter((a) => a.done_this_week).length;
      week.appendChild(el('div', 'muted', '<br>' + d + ' / ' + acts.length + ' afgerond'));
      const nav = el('div', 'nav-btns');
      const b = el('button', 'primary', 'Check-in invullen'); b.onclick = () => go('#/checkin');
      nav.appendChild(b); week.appendChild(nav);
    }
    v.appendChild(week);

    // ontwikkeling
    const snaps = Model.snapshotsOf(c.id);
    const on = el('div', 'card');
    on.appendChild(el('div', 'eyebrow', '📈 Je ontwikkeling'));
    if (snaps.length < 2) {
      on.appendChild(el('p', 'muted', 'Na vier check-ins berekenen we je eerste Progress Score. De score is bedoeld voor trend, niet voor wekelijkse ruis.'));
    } else {
      on.appendChild(el('div', 'score-mid', snaps.map((s) => s.overall_score).join(' → ')));
      const d = snaps[snaps.length - 1].overall_score - snaps[0].overall_score;
      on.appendChild(el('div', 'muted', (d >= 0 ? '+' : '') + d + ' sinds je start'));
    }
    const nav2 = el('div', 'nav-btns');
    const b2 = el('button', 'ghost', 'Bekijk je volledige voortgang →'); b2.onclick = () => go('#/progress');
    nav2.appendChild(b2); on.appendChild(nav2);
    v.appendChild(on);

    // reflectie
    const rf = el('div', 'card');
    rf.appendChild(el('div', 'eyebrow', 'Jouw volgende reflectie'));
    rf.appendChild(el('p', null, volgendeReflectie(c.id)));
    const nav3 = el('div', 'nav-btns');
    const b3 = el('button', 'ghost', 'Reflecteren →'); b3.onclick = () => go('#/reflection');
    nav3.appendChild(b3); rf.appendChild(nav3);
    v.appendChild(rf);

    // traject
    const tj = el('div', 'card tight');
    tj.appendChild(el('div', 'eyebrow', 'Je traject'));
    const fase = Model.faseOf(c.id);
    const fl = el('div', 'phases');
    Model.FASES.forEach((f) => fl.appendChild(el('span', f === fase ? 'phase on' : 'phase', esc(f))));
    tj.appendChild(fl);
    tj.appendChild(el('div', 'muted', 'Huidige fase: <b>' + esc(fase) + '</b>'));
    v.appendChild(tj);
  }

  const REFLECTIES = [
    'Als je eerlijk kijkt naar je huidige leven: wat is volgens jou het belangrijkste patroon dat ervoor zorgt dat je nog niet bent waar je wilt zijn?',
    'Wat heb je deze week over jezelf geleerd?',
    'Als je leven over drie jaar precies loopt zoals jij het wilt, hoe ziet een normale dinsdag er dan uit?',
    'Welke keuzes maak je vandaag die je toekomstige leven sterker maken — en welke maken het juist moeilijker?',
    'Hoe zorg je ervoor dat je dit zelfstandig blijft doen wanneer de coaching stopt?'
  ];
  /* De trajectreflecties lopen mee met de fase van het traject. Wekelijkse
     check-in-antwoorden tellen daar niet in mee — die horen bij de check-in. */
  function volgendeReflectie(clientId) {
    const n = Model.reflectionsOf(clientId).filter((r) => r.type === 'journey').length;
    return esc(REFLECTIES[Math.min(n, REFLECTIES.length - 1)]);
  }

  /* ================================================================ acties */

  function screenActions() {
    const c = client(); if (!c) return go('#/');
    const v = $('#view');
    const kop = el('div', 'card hero-card');
    kop.appendChild(el('h1', null, 'Jouw acties'));
    kop.appendChild(el('p', 'muted', 'Maximaal drie tegelijk. Klein genoeg om uit te voeren, groot genoeg om iets van te leren.'));
    v.appendChild(kop);

    const acts = Model.actionsOf(c.id);
    if (!acts.length) { v.appendChild(el('div', 'card', '<p class="muted">Nog geen acties.</p>')); return; }
    const cis = Model.checkinsOf(c.id);
    acts.forEach((a) => {
      const card = el('div', 'card');
      card.appendChild(el('h3', null, esc(a.title)));
      card.appendChild(el('div', 'muted', esc(a.frequency || '') + (a.description ? ' · ' + esc(a.description) : '')));
      // historie over de check-ins
      let done = 0, tot = 0;
      cis.forEach((ci) => Model.checkinActions(ci.id).forEach((ca) => {
        if (ca.action_id !== a.id) return;
        tot++; if (ca.status === 'done') done++; else if (ca.status === 'partial') done += 0.5;
      }));
      if (tot) {
        const p = pct(done, tot);
        card.appendChild(el('div', 'bar-track big'));
        $('.bar-track.big:last-of-type', card) || null;
        const tr = card.lastChild;
        const fi = el('i', 'bar-fill ' + barClass(p)); fi.style.width = p + '%'; tr.appendChild(fi);
        card.appendChild(el('div', 'muted', Math.round(done * 10) / 10 + ' / ' + tot + ' weken · ' + p + '%'));
      } else card.appendChild(el('div', 'muted', 'Nog geen check-in met deze actie.'));
      v.appendChild(card);
    });
  }

  /* ================================================================ check-in */

  function screenCheckin() {
    const c = client(); if (!c) return go('#/');
    const acts = Model.activeActions(c.id);
    const v = $('#view');
    const wk = Model.checkinsOf(c.id).length + 1;

    const kop = el('div', 'card hero-card');
    kop.appendChild(el('div', 'eyebrow', 'Wekelijkse check-in · enkele minuten'));
    kop.appendChild(el('h1', null, 'Hoe ging deze week?'));
    v.appendChild(kop);
    if (!acts.length) { v.appendChild(el('div', 'card', '<p class="muted">Je coach heeft nog geen acties klaargezet.</p>')); return; }

    ses.draft = ses.draft || { status: {}, reflection: {}, ratings: {} };
    const d = ses.draft;

    const ac = el('div', 'card');
    ac.appendChild(el('div', 'eyebrow', 'Je acties'));
    acts.forEach((a) => {
      const row = el('div', 'checkin-row');
      row.appendChild(el('div', 'checkin-text', esc(a.title)));
      const opts = el('div', 'opts');
      Object.keys(Coaching.STATUS).forEach((k) => {
        const st = Coaching.STATUS[k];
        const b = el('div', 'opt' + (d.status[a.id] === k ? ' on' : ''), st.icon + ' ' + esc(st.label));
        b.onclick = () => { d.status[a.id] = k; saveSes(); render(); };
        opts.appendChild(b);
      });
      row.appendChild(opts); ac.appendChild(row);
    });
    const beoordeeld = acts.filter((a) => d.status[a.id]);
    if (beoordeeld.length) ac.appendChild(el('div', 'muted', '<br>' + beoordeeld.length + ' / ' + acts.length +
      ' beoordeeld · ' + Coaching.actionCompletion({ actions: beoordeeld.map((a) => ({ status: d.status[a.id] })) }) + '% uitgevoerd'));
    v.appendChild(ac);

    const rf = el('div', 'card');
    Coaching.CHECKIN_VRAGEN.forEach((q) => {
      rf.appendChild(el('div', 'q-label', esc(q.label)));
      const ta = el('textarea'); ta.value = d.reflection[q.id] || '';
      ta.oninput = () => { d.reflection[q.id] = ta.value; saveSes(); };
      rf.appendChild(ta);
    });
    v.appendChild(rf);

    const rt = el('div', 'card');
    Coaching.CHECKIN_CIJFERS.forEach((q) => {
      rt.appendChild(el('div', 'q-label', esc(q.label)));
      const sc = el('div', 'scale');
      for (let i = 1; i <= 10; i++) {
        const b = el('b', String(d.ratings[q.id]) === String(i) ? 'on' : '', String(i));
        b.onclick = () => { d.ratings[q.id] = i; saveSes(); render(); };
        sc.appendChild(b);
      }
      rt.appendChild(sc);
    });
    v.appendChild(rt);

    const nav = el('div', 'nav-btns');
    const go2 = el('button', 'primary', 'Versturen');
    go2.disabled = beoordeeld.length !== acts.length;
    go2.onclick = () => {
      const ci = Model.insert('check_ins', { client_id: c.id, week: wk, action_completion: null,
        self_rating: Object.assign({}, d.ratings), reflection: Object.assign({}, d.reflection), submitted_at: Model.now() });
      acts.forEach((a) => Model.insert('check_in_actions', { check_in_id: ci.id, action_id: a.id, title: a.title, status: d.status[a.id] }));
      Model.update('check_ins', ci.id, { action_completion: Coaching.actionCompletion({ actions: Model.checkinActions(ci.id) }) });
      if ((d.reflection.geleerd || '').trim()) Model.insert('reflections', { client_id: c.id, type: 'weekly',
        prompt: 'Wat heb je deze week over jezelf geleerd?', answer: d.reflection.geleerd, created_at: Model.now() });
      acts.forEach((a) => Model.update('actions', a.id, { done_this_week: false }));
      ses.draft = null; saveSes(); go('#/dashboard');
    };
    nav.appendChild(go2);
    if (go2.disabled) nav.appendChild(el('div', 'muted', 'Beoordeel eerst al je acties.'));
    v.appendChild(nav);
  }

  /* ================================================================ reflectie */

  function screenReflection() {
    const c = client(); if (!c) return go('#/');
    const v = $('#view');
    const kop = el('div', 'card hero-card');
    kop.appendChild(el('div', 'eyebrow', 'Reflectie'));
    kop.appendChild(el('h1', null, volgendeReflectie(c.id)));
    kop.appendChild(el('p', 'muted', 'Eén vraag tegelijk. Een eerlijk antwoord is waardevoller dan een antwoord waarvan je denkt dat het goed klinkt.'));
    v.appendChild(kop);

    const card = el('div', 'card');
    const ta = el('textarea'); ta.style.minHeight = '140px';
    card.appendChild(ta);
    const nav = el('div', 'nav-btns');
    const b = el('button', 'primary', 'Opslaan');
    b.onclick = () => {
      if (!ta.value.trim()) return;
      Model.insert('reflections', { client_id: c.id, type: 'journey',
        prompt: volgendeReflectie(c.id).replace(/&[a-z]+;/g, ''),
        answer: ta.value.trim(), created_at: Model.now() });
      go('#/dashboard');
    };
    nav.appendChild(b); card.appendChild(nav);
    v.appendChild(card);

    const eerder = Model.reflectionsOf(c.id);
    if (eerder.length) {
      const h = el('div', 'card tight');
      h.appendChild(el('div', 'eyebrow', 'Eerdere reflecties'));
      eerder.forEach((x) => {
        h.appendChild(el('div', 'refl', '“' + esc(x.answer) + '”<br><span class="muted">' +
          esc(x.created_at.slice(0, 10)) + (x.type === 'weekly' ? ' · uit een check-in' : '') + '</span>'));
      });
      v.appendChild(h);
    }
  }

  /* ================================================================ voortgang */

  function screenProgress() {
    const c = client(); if (!c) return go('#/');
    const r = Model.scoreOf(c.id), snaps = Model.snapshotsOf(c.id), pg = Model.progressOf(c.id);
    const v = $('#view');

    const kop = el('div', 'card score-hero');
    kop.appendChild(el('div', 'eyebrow', 'Je ontwikkeling'));
    kop.appendChild(el('div', 'score-big', snaps.map((s) => s.overall_score).join(' <span class="arrow">→</span> ')));
    if (snaps.length > 1) {
      const d = snaps[snaps.length - 1].overall_score - snaps[0].overall_score;
      kop.appendChild(el('div', 'level-line', (d >= 0 ? '+' : '') + d + ' punten sinds je start'));
    } else kop.appendChild(el('p', 'muted', 'Je eerste Progress Score volgt na vier check-ins.'));
    v.appendChild(kop);

    v.appendChild(dimensieKaart(r, 'De zes gebieden'));

    const int = el('div', 'card tight');
    int.appendChild(el('div', 'eyebrow', 'Wat valt op'));
    const beste = Scoring.DIM_ORDER.filter((k) => r.dims[k].score !== null)
      .sort((a, b) => r.dims[b].score - r.dims[a].score)[0];
    const zwakste = Scoring.DIM_ORDER.filter((k) => r.dims[k].score !== null)
      .sort((a, b) => r.dims[a].score - r.dims[b].score)[0];
    int.appendChild(el('p', null, 'Je sterkste gebied is op dit moment <b>' + esc(r.dims[beste].label.toLowerCase()) +
      '</b>. De meeste ruimte zit in <b>' + esc(r.dims[zwakste].label.toLowerCase()) + '</b>.'));
    v.appendChild(int);

    if (pg.ready || pg.bewijs) {
      const bw = el('div', 'card');
      bw.appendChild(el('div', 'eyebrow', 'Deze periode heb je'));
      if (pg.ready) {
        const ul = el('ul', 'plain');
        pg.bewijs.forEach((x) => ul.appendChild(el('li', null, esc(x))));
        bw.appendChild(ul);
      } else bw.appendChild(el('p', 'muted', esc(pg.note)));
      v.appendChild(bw);
    }

    if (snaps.length) {
      const tb = el('div', 'card');
      tb.appendChild(el('div', 'eyebrow', 'Metingen'));
      const t = el('table', 'assess');
      t.innerHTML = '<tr><th>Datum</th><th>Type</th><th>Score</th><th>Fundament</th><th>Versie</th></tr>';
      snaps.forEach((s) => {
        const tr = el('tr');
        [s.created_at.slice(0, 10), s.score_type === 'start' ? 'Startscore' : 'Progress Score',
         '<b>' + s.overall_score + '</b>', s.foundation_index + ' · ' + esc(s.foundation_status || '—'), 'v' + s.scoring_version]
          .forEach((x) => tr.appendChild(el('td', null, String(x))));
        t.appendChild(tr);
      });
      const w = el('div', 'tscroll'); w.appendChild(t); tb.appendChild(w);
      tb.appendChild(el('p', 'muted', 'Elke meting is een eigen momentopname. Oude scores worden nooit overschreven.'));
      v.appendChild(tb);
    }
  }

  /* ================================================================ coach — cliëntenoverzicht */

  function screenCoachClients() {
    const v = $('#view');
    const kop = el('div', 'card hero-card');
    kop.appendChild(el('div', 'eyebrow', 'Coachomgeving'));
    kop.appendChild(el('h1', null, 'Mijn cliënten'));
    v.appendChild(kop);

    const card = el('div', 'card');
    const t = el('table', 'assess clickable');
    t.innerHTML = '<tr><th>Cliënt</th><th>Start</th><th>Nu</th><th>Fundament</th><th>Focus</th><th>Completion</th><th>Laatste check-in</th><th>Status</th></tr>';
    Model.where('clients', () => true).forEach((c) => {
      const r = Model.scoreOf(c.id); const st = Model.clientStatus(c.id);
      const start = Model.startSnapshot(c.id), nu = Model.latestSnapshot(c.id);
      const pr = r ? Model.priorityOf(c.id, r) : null;
      const cis = Model.checkinsOf(c.id); const last = cis.length ? cis[cis.length - 1] : null;
      const tr = el('tr');
      tr.appendChild(el('td', null, '<b>' + esc(c.name) + '</b>'));
      tr.appendChild(el('td', null, start ? start.overall_score : '—'));
      tr.appendChild(el('td', null, nu ? '<b>' + nu.overall_score + '</b>' : '—'));
      tr.appendChild(el('td', null, r && r.foundationStatus ? r.foundationStatus.icon + ' ' + r.foundationIndex : '—'));
      tr.appendChild(el('td', null, pr && pr.visibleToClient ? esc(pr.primaryFocusLabel) :
        '<span class="tag prov">niet gevalideerd</span>'));
      tr.appendChild(el('td', null, last && last.action_completion !== null ? last.action_completion + '%' : '—'));
      tr.appendChild(el('td', null, last ? esc(last.submitted_at.slice(0, 10)) : '—'));
      tr.appendChild(el('td', null, st.icon + ' <span class="muted">' + esc(st.label) + '</span>'));
      tr.onclick = () => { ses.clientId = c.id; ses.coachTab = 'brief'; saveSes(); go('#/coach/client'); };
      t.appendChild(tr);
    });
    const w = el('div', 'tscroll'); w.appendChild(t); card.appendChild(w);
    card.appendChild(el('p', 'muted', '🟢 op koers · 🟡 aandacht nodig · 🔴 coach check'));
    v.appendChild(card);
  }

  /* ================================================================ coach — cliëntdetail */

  const TABS = [['brief', 'Coach brief'], ['assessment', 'Assessment'], ['intake', 'Intake'], ['scores', 'Scores'],
                ['goals', 'Doelen'], ['actions', 'Acties'], ['checkins', 'Check-ins'], ['sessions', 'Sessies'], ['progress', 'Progressie']];

  function screenCoachClient() {
    const c = client(); if (!c) return go('#/coach/clients');
    const r = Model.scoreOf(c.id);
    if (!r) { $('#view').appendChild(el('div', 'card', '<p>Intake nog niet afgerond.</p>')); return; }
    const pr = Model.priorityOf(c.id, r);
    const start = Model.startSnapshot(c.id), nu = Model.latestSnapshot(c.id);
    const v = $('#view');

    const kop = el('div', 'card');
    const back = el('button', 'ghost tiny', '← Alle cliënten'); back.onclick = () => go('#/coach/clients');
    kop.appendChild(back);
    kop.appendChild(el('h1', null, esc(c.name)));
    const line = el('div', 'split');
    const l = el('div');
    l.appendChild(el('div', 'score-mid', (start ? start.overall_score : '—') + (nu && start && nu.id !== start.id ? ' → ' + nu.overall_score : '')));
    if (start && nu && nu.id !== start.id) l.appendChild(el('div', 'muted', '+' + (nu.overall_score - start.overall_score) + ' sinds start'));
    line.appendChild(l);
    const rr = el('div');
    rr.appendChild(el('div', 'muted', 'Huidige focus: <b>' + (pr.visibleToClient ? esc(pr.primaryFocusLabel) : 'nog niet gevalideerd') + '</b>'));
    rr.appendChild(el('div', 'muted', 'Fundament: ' + r.foundationIndex + ' ' + r.foundationStatus.icon + ' ' + esc(r.foundationStatus.label)));
    rr.appendChild(el('div', 'muted', 'Fase: ' + esc(Model.faseOf(c.id))));
    line.appendChild(rr);
    kop.appendChild(line);
    v.appendChild(kop);

    const tabs = el('div', 'tabs');
    TABS.forEach(([k, lab]) => {
      const b = el('button', ses.coachTab === k ? 'on' : '', lab);
      b.onclick = () => { ses.coachTab = k; saveSes(); render(); };
      tabs.appendChild(b);
    });
    v.appendChild(tabs);

    ({ brief: tabBrief, assessment: tabAssessment, intake: tabIntake, scores: tabScores, goals: tabGoals,
       actions: tabActions, checkins: tabCheckins, sessions: tabSessions, progress: tabProgress }[ses.coachTab] || tabBrief)(c, r, pr, v);
  }

  function tabBrief(c, r, pr, v) {
    const cis = Model.checkinsOf(c.id); const last = cis.length ? cis[cis.length - 1] : null;
    const card = el('div', 'card');
    card.appendChild(el('div', 'eyebrow', 'AI Coach Brief'));
    card.appendChild(el('h2', null, 'Wat valt op?'));
    const ul = el('ul', 'plain');
    const ranked = Scoring.DIM_ORDER.filter((k) => r.dims[k].score !== null).sort((a, b) => r.dims[b].score - r.dims[a].score);
    ranked.slice(0, 2).forEach((k) => ul.appendChild(el('li', null, esc(r.dims[k].label) + ' is sterk: ' + r.dims[k].score)));
    ranked.slice(-2).forEach((k) => ul.appendChild(el('li', null, esc(r.dims[k].label) + ' blijft achter: ' + r.dims[k].score)));
    const q20 = r.dims.D.components.find((x) => x.qid === 'Q20');
    if (q20 && q20.answered) ul.appendChild(el('li', null, 'Afspraken met zichzelf: ' + Math.round(q20.value / 10) + '/10'));
    card.appendChild(ul);
    card.appendChild(el('div', 'note', '<b>Mogelijke hypothese:</b> ' + esc(pr.hypothese)));
    if (pr.contradicties.length) card.appendChild(el('div', 'note warn',
      '<b>Te verifiëren:</b> ' + esc(pr.contradicties[0].vraag)));
    v.appendChild(card);

    const snel = el('div', 'card');
    snel.appendChild(el('div', 'eyebrow', 'In één oogopslag'));
    const dl = el('dl', 'fsh');
    const add = (k, val) => { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, val)); };
    add('Fundament', r.foundationIndex + ' — ' + esc(r.foundationStatus.label));
    add('Action completion', last && last.action_completion !== null ? last.action_completion + '%' : '—');
    add('Laatste check-in', last ? esc(last.submitted_at.slice(0, 10)) : 'nog geen');
    const ss = Model.sessionsOf(c.id);
    add('Laatste sessie', ss.length ? esc(ss[0].session_date) + ' — ' + esc(ss[0].session_type) : 'nog geen');
    add('Confidence', r.confidence.icon + ' ' + esc(r.confidence.label));
    snel.appendChild(dl);
    v.appendChild(snel);

    if (last) {
      const an = Coaching.analyseCheckin(Model.checkinPayload(c.id).slice(-1)[0], Model.answersObject(Model.intakeOf(c.id).id), Model.checkinPayload(c.id));
      const cc = el('div', 'card');
      cc.appendChild(el('div', 'eyebrow', 'Laatste check-in — week ' + last.week));
      cc.appendChild(el('p', null, 'Action completion <b>' + an.completion + '%</b> · consistentie ' + esc(an.consistentie)));
      if ((last.reflection || {}).geleerd) cc.appendChild(el('div', 'refl', '“' + esc(last.reflection.geleerd) + '”'));
      an.checks.forEach((x) => cc.appendChild(el('div', 'flag hoog', '⚠️ ' + esc(x))));
      if (an.coachvragen.length) {
        cc.appendChild(el('div', 'eyebrow', 'Coachvraag voor het gesprek'));
        cc.appendChild(el('p', null, esc(an.coachvragen[0])));
      }
      v.appendChild(cc);
    }
  }

  function tabAssessment(c, r, pr, v) {
    const ci = Model.coachInputOf(c.id);

    const base = el('div', 'card');
    base.appendChild(el('div', 'eyebrow', 'AI-baseline'));
    const t = el('table', 'assess');
    t.innerHTML = '<tr><th>Dimensie</th><th>AI</th><th>Definitief</th><th>Confidence</th><th>Coachscore</th><th>Reden</th></tr>';
    Scoring.DIM_ORDER.forEach((k) => {
      const d = r.dims[k], ov = ci.dimensions[k] || {};
      const tr = el('tr');
      tr.appendChild(el('td', null, d.icon + ' ' + esc(d.label)));
      tr.appendChild(el('td', null, d.aiScore === null ? '—' : d.aiScore));
      tr.appendChild(el('td', null, '<b>' + (d.score === null ? '—' : d.score) + '</b>' + (d.coachAdjusted ? '<span class="tag">coach</span>' : '')));
      tr.appendChild(el('td', null, d.confidence.icon + ' ' + esc(d.confidence.label)));
      const tdS = el('td'); const inS = el('input', 'ovr'); inS.type = 'number'; inS.min = 0; inS.max = 100;
      inS.value = ov.score === undefined ? '' : ov.score;
      const tdR = el('td'); const inR = el('input'); inR.type = 'text'; inR.placeholder = 'reden'; inR.value = ov.reason || '';
      const commit = () => {
        if (inS.value === '') delete ci.dimensions[k]; else ci.dimensions[k] = { score: Number(inS.value), reason: inR.value };
        Model.update('clients', c.id, { coach_input: ci }); render();
      };
      inS.onchange = commit; inR.onchange = commit;
      tdS.appendChild(inS); tdR.appendChild(inR); tr.appendChild(tdS); tr.appendChild(tdR);
      t.appendChild(tr);
    });
    const w = el('div', 'tscroll'); w.appendChild(t); base.appendChild(w);
    base.appendChild(el('p', 'muted', 'Een override vereist een nieuwe score én een reden. De AI-score blijft bewaard.'));
    if (r.warnings.length) r.warnings.forEach((x) => base.appendChild(el('div', 'note warn', esc(x))));
    v.appendChild(base);

    const hyp = el('div', 'card');
    hyp.appendChild(el('div', 'eyebrow', 'AI-hypothese'));
    hyp.appendChild(el('p', null, esc(pr.hypothese)));
    const dl = el('dl', 'fsh');
    const add = (k, val) => { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, val)); };
    add('Primaire focus', esc(pr.aiPrimaryLabel || '—'));
    add('Secundair', esc(pr.secondaryLabel || '—'));
    add('Modus', esc(pr.mode) + ' <span class="muted">' + esc(pr.reden) + '</span>');
    add('Hefboomketen', pr.chain ? esc(pr.chain.keten) : 'geen');
    add('Confidence', r.confidence.icon + ' ' + esc(r.confidence.label));
    hyp.appendChild(dl);
    v.appendChild(hyp);

    if (r.checks.length || pr.contradicties.length) {
      const ck = el('div', 'card');
      ck.appendChild(el('div', 'eyebrow', '⚠️ Coach checks'));
      r.checks.forEach((x) => ck.appendChild(el('div', 'flag hoog', '<b>' + esc(x.titel) + '</b><br>' + esc(x.detail))));
      pr.contradicties.forEach((x) => ck.appendChild(el('div', 'flag hoog',
        '<b>' + esc(x.titel) + '</b><br>' + esc(x.detail) + '<br><span class="muted">' + esc(x.vraag) + '</span>')));
      ck.appendChild(el('p', 'muted', 'Signalen verlagen nooit automatisch een score.'));
      v.appendChild(ck);
    }

    // coachbeslissing
    const bes = el('div', 'card');
    bes.appendChild(el('div', 'eyebrow', 'Coachbeslissing'));
    const fv = ci.focusValidation || {};
    const knoppen = el('div', 'opts');
    [['bevestigd', '✓ Bevestigen'], ['gewijzigd', '✎ Aanpassen'], ['verworpen', '✕ Verwerpen']].forEach(([k, lab]) => {
      const b = el('div', 'opt' + (fv.status === k ? ' on' : ''), lab);
      b.onclick = () => { fv.status = k; if (k !== 'gewijzigd') fv.focus = pr.aiPrimary; ci.focusValidation = fv;
        Model.update('clients', c.id, { coach_input: ci }); render(); };
      knoppen.appendChild(b);
    });
    bes.appendChild(knoppen);
    if (fv.status === 'gewijzigd') {
      const sel = el('select');
      Scoring.DIM_ORDER.forEach((k) => { const o = el('option', null, Scoring.DIMENSIONS[k].label); o.value = k;
        if (fv.focus === k) o.selected = true; sel.appendChild(o); });
      sel.onchange = () => { fv.focus = sel.value; ci.focusValidation = fv; Model.update('clients', c.id, { coach_input: ci }); render(); };
      bes.appendChild(sel);
    }
    const rsn = el('input'); rsn.type = 'text'; rsn.placeholder = 'Waarom? (verplicht bij aanpassen)'; rsn.value = fv.reason || '';
    rsn.onchange = () => { fv.reason = rsn.value; ci.focusValidation = fv; Model.update('clients', c.id, { coach_input: ci }); render(); };
    bes.appendChild(rsn);
    const opsl = el('button', 'primary', 'Opslaan');
    opsl.onclick = () => {
      Model.insert('focus_records', { client_id: c.id, engine_version: pr.engineVersion,
        primary_focus: pr.aiPrimary, secondary_focus: pr.secondary, focus_mode: pr.mode, ai_hypothesis: pr.hypothese,
        coach_validated_focus: pr.visibleToClient ? pr.primaryFocus : null,
        coach_validation_status: fv.status || 'voorlopig', coach_validation_reason: fv.reason || '', created_at: Model.today() });
      render();
    };
    const nav = el('div', 'nav-btns'); nav.appendChild(opsl); bes.appendChild(nav);
    bes.appendChild(el('div', pr.visibleToClient ? 'note' : 'note warn', pr.visibleToClient
      ? 'Eerste focus → <b>' + esc(pr.primaryFocusLabel) + '</b>, zichtbaar voor de cliënt.'
      : 'De cliënt ziet nog geen focus.'));
    v.appendChild(bes);
  }

  function tabIntake(c, r, pr, v) {
    const intake = Model.intakeOf(c.id); const a = Model.answersObject(intake.id);
    const card = el('div', 'card');
    card.appendChild(el('div', 'eyebrow', 'Intake · afgerond ' + esc(intake.completed_at || '—') + ' · scoring v' + intake.scoring_version));
    INTAKE.categories.forEach((cat) => {
      card.appendChild(el('h3', 'cat', esc(cat.title)));
      cat.questions.forEach((q) => {
        const ids = q.ids || [q.id];
        const val = ids.map((id) => a[id]).filter((x) => x !== undefined && x !== '' && !(Array.isArray(x) && !x.length));
        const extra = [].concat(q.followUp ? [a[q.followUp.id]] : [], (q.extra || []).map((x) => a[x.id]))
          .filter((x) => x !== undefined && x !== '');
        const row = el('div', 'qa');
        row.appendChild(el('div', 'qa-q', q.n + '. ' + esc(q.label)));
        row.appendChild(el('div', 'qa-a', val.length ? esc([].concat.apply([], val).join(' · ')) : '<span class="muted">—</span>'));
        if (extra.length) row.appendChild(el('div', 'qa-x', esc(extra.join(' · '))));
        card.appendChild(row);
      });
    });
    v.appendChild(card);
  }

  function tabScores(c, r, pr, v) {
    v.appendChild(dimensieKaart(r, 'Dimensies'));
    const card = el('div', 'card');
    card.appendChild(el('div', 'eyebrow', 'Score-opbouw per vraag'));
    const t = el('table', 'assess');
    t.innerHTML = '<tr><th>Dim</th><th>Vraag</th><th>Component</th><th>Gew.</th><th>Score</th><th>AI-observatie</th></tr>';
    Scoring.DIM_ORDER.forEach((k) => r.dims[k].components.forEach((x, i) => {
      const tr = el('tr');
      tr.appendChild(el('td', null, i === 0 ? r.dims[k].icon : ''));
      tr.appendChild(el('td', null, esc(x.qid)));
      tr.appendChild(el('td', null, esc(x.label)));
      tr.appendChild(el('td', null, Math.round(x.weight * 100) + '%'));
      tr.appendChild(el('td', null, (x.value === null ? '—' : x.value) + (x.estimated ? '<span class="tag prov">AI</span>' : '')));
      tr.appendChild(el('td', null, '<span class="muted">' + esc(x.observation || 'directe conversie') + '</span>'));
      t.appendChild(tr);
    }));
    const w = el('div', 'tscroll'); w.appendChild(t); card.appendChild(w);
    v.appendChild(card);

    if (r.timeSignal) {
      const ts = el('div', 'card tight');
      ts.appendChild(el('div', 'eyebrow', 'Tijdsbesteding (V21) — modifier op structuur, max ±10'));
      ts.appendChild(el('p', null, r.timeSignal.icon + ' <b>' + esc(r.timeSignal.level) + '</b> — ' + esc(r.timeSignal.note)));
      const ciCoach = Model.coachInputOf(c.id);
      const row = el('div', 'mod-row');
      const sel = el('select');
      [0, -5, -10, 5, 10].forEach((x) => { const o = el('option', null, x > 0 ? '+' + x : String(x)); o.value = x;
        if (String((ciCoach.structureModifier || {}).value || 0) === String(x)) o.selected = true; sel.appendChild(o); });
      const rs = el('input'); rs.type = 'text'; rs.placeholder = 'reden'; rs.value = (ciCoach.structureModifier || {}).reason || '';
      const b = el('button', 'ghost', 'Toepassen');
      b.onclick = () => { ciCoach.structureModifier = { value: Number(sel.value), reason: rs.value };
        Model.update('clients', c.id, { coach_input: ciCoach }); render(); };
      row.appendChild(sel); row.appendChild(rs); row.appendChild(b);
      ts.appendChild(row);
      if (r.structureAdjust) ts.appendChild(el('div', 'note', 'Toegepast: ' + r.structureAdjust.from + ' → ' +
        r.structureAdjust.to + ' — ' + esc(r.structureAdjust.reason)));
      v.appendChild(ts);
    }
  }

  function tabGoals(c, r, pr, v) {
    const card = el('div', 'card');
    card.appendChild(el('div', 'eyebrow', 'Doelen'));
    Model.goalsOf(c.id).forEach((g) => {
      const b = el('div', 'goal');
      b.appendChild(el('h3', null, esc(g.title)));
      b.appendChild(el('div', 'muted', esc(g.description || '') + ' · ' + esc(g.start_date) + ' → ' + esc(g.target_date) + ' · ' + esc(g.status)));
      card.appendChild(b);
    });
    const row = el('div', 'mod-row');
    row.appendChild(el('span', 'muted', 'Doelvoortgang 0–100'));
    const gi = el('input', 'ovr'); gi.type = 'number'; gi.min = 0; gi.max = 100;
    gi.value = c.goal_progress === null || c.goal_progress === undefined ? '' : c.goal_progress;
    gi.onchange = () => { Model.update('clients', c.id, { goal_progress: gi.value === '' ? null : Number(gi.value) }); render(); };
    row.appendChild(gi);
    card.appendChild(row);
    v.appendChild(card);
  }

  function tabActions(c, r, pr, v) {
    const card = el('div', 'card');
    card.appendChild(el('div', 'eyebrow', 'Acties — maximaal drie tegelijk'));
    Model.activeActions(c.id).forEach((a) => {
      const row = el('div', 'mod-row');
      const i = el('input'); i.type = 'text'; i.value = a.title;
      i.onchange = () => Model.update('actions', a.id, { title: i.value });
      const f = el('select');
      ['dagelijks', 'wekelijks', '3x per week', 'eenmalig'].forEach((x) => { const o = el('option', null, x); o.value = x;
        if (a.frequency === x) o.selected = true; f.appendChild(o); });
      f.onchange = () => Model.update('actions', a.id, { frequency: f.value });
      const d = el('button', 'ghost', 'Archiveren');
      d.onclick = () => { Model.update('actions', a.id, { status: 'archived' }); render(); };
      row.appendChild(i); row.appendChild(f); row.appendChild(d);
      card.appendChild(row);
    });
    if (Model.activeActions(c.id).length < 3) {
      const g = Model.goalsOf(c.id)[0];
      const gids = Coaching.sessieGids(Model.answersObject(Model.intakeOf(c.id).id), r, pr);
      card.appendChild(el('div', 'eyebrow', 'Voorstellen bij deze focus'));
      gids.actievoorstellen.forEach((t) => {
        const row = el('div', 'mod-row');
        row.appendChild(el('span', null, esc(t)));
        const b = el('button', 'ghost tiny', 'toevoegen');
        b.onclick = () => { Model.insert('actions', { client_id: c.id, goal_id: g ? g.id : null, title: t, description: '',
          frequency: 'wekelijks', start_date: Model.today(), end_date: null, status: 'active' }); render(); };
        row.appendChild(b); card.appendChild(row);
      });
    }
    v.appendChild(card);
  }

  function tabCheckins(c, r, pr, v) {
    const payload = Model.checkinPayload(c.id);
    const cis = Model.checkinsOf(c.id);
    if (!cis.length) { v.appendChild(el('div', 'card', '<p class="muted">Nog geen check-ins.</p>')); return; }
    cis.slice().reverse().forEach((ci, idx) => {
      const card = el('div', 'card');
      card.appendChild(el('div', 'eyebrow', 'Week ' + ci.week + ' · ' + esc(ci.submitted_at.slice(0, 10))));
      card.appendChild(el('p', null, 'Action completion <b>' + ci.action_completion + '%</b>'));
      const ul = el('ul', 'plain');
      Model.checkinActions(ci.id).forEach((ca) => ul.appendChild(el('li', null,
        Coaching.STATUS[ca.status].icon + ' ' + esc(ca.title))));
      card.appendChild(ul);
      Coaching.CHECKIN_VRAGEN.forEach((q) => {
        const ans = (ci.reflection || {})[q.id];
        if (ans) { card.appendChild(el('div', 'qa-q', esc(q.label))); card.appendChild(el('div', 'qa-a', esc(ans))); }
      });
      const sr = ci.self_rating || {};
      if (sr.zorg || sr.afspraken) card.appendChild(el('div', 'muted',
        'Zelfbeoordeling — voor jezelf gezorgd ' + (sr.zorg || '—') + '/10 · afspraken nagekomen ' + (sr.afspraken || '—') + '/10'));
      if (idx === 0) {
        const an = Coaching.analyseCheckin(payload[payload.length - 1], Model.answersObject(Model.intakeOf(c.id).id), payload);
        card.appendChild(el('hr', 'sep'));
        card.appendChild(el('div', 'eyebrow', 'AI-samenvatting'));
        if (an.patronen.length) card.appendChild(el('div', 'note', '<b>Positief patroon:</b> ' + esc(an.patronen.join(' · '))));
        if (an.obstakels.length) card.appendChild(el('div', 'note', '<b>Obstakel:</b> ' + esc(an.obstakels.join(' · '))));
        an.checks.forEach((x) => card.appendChild(el('div', 'flag hoog', '⚠️ ' + esc(x))));
        an.coachvragen.forEach((x) => card.appendChild(el('div', 'note', '<b>Coachvraag:</b> ' + esc(x))));
      }
      v.appendChild(card);
    });
  }

  function tabSessions(c, r, pr, v) {
    const card = el('div', 'card');
    card.appendChild(el('div', 'eyebrow', 'Sessies'));
    Model.sessionsOf(c.id).forEach((s) => {
      const b = el('div', 'goal');
      b.appendChild(el('h3', null, esc(s.session_type) + ' — ' + esc(s.session_date)));
      b.appendChild(el('div', 'muted', 'Focus: ' + esc(s.focus || '—')));
      b.appendChild(el('p', null, esc(s.coach_notes || '')));
      b.appendChild(el('div', 'muted', 'Volgende stap: ' + esc(s.next_step || '—')));
      card.appendChild(b);
    });
    card.appendChild(el('hr', 'sep'));
    card.appendChild(el('div', 'eyebrow', 'Nieuwe sessienotitie'));
    const ta = el('textarea'); ta.placeholder = 'Wat is er besproken?';
    const ns = el('input'); ns.type = 'text'; ns.placeholder = 'Volgende stap';
    card.appendChild(ta); card.appendChild(ns);
    const nav = el('div', 'nav-btns');
    const b = el('button', 'primary', 'Opslaan');
    b.onclick = () => {
      if (!ta.value.trim()) return;
      Model.insert('coach_sessions', { client_id: c.id, session_date: Model.today(), session_type: 'Sessie',
        focus: pr.visibleToClient ? pr.primaryFocusLabel : null, coach_notes: ta.value.trim(), next_step: ns.value.trim() });
      render();
    };
    nav.appendChild(b); card.appendChild(nav);
    v.appendChild(card);

    const gids = Coaching.sessieGids(Model.answersObject(Model.intakeOf(c.id).id), r, pr);
    const sg = el('div', 'card');
    sg.appendChild(el('div', 'eyebrow', 'Sessie 1-gids · ' + gids.duur + ' minuten'));
    gids.blokken.forEach((bl) => {
      const box = el('div', 'stepbox');
      box.appendChild(el('div', 'stepnr', bl.min + "'"));
      const body = el('div', 'stepbody');
      body.appendChild(el('b', null, esc(bl.titel)));
      body.appendChild(el('div', 'muted', esc(bl.doel)));
      const ul = el('ul', 'plain');
      bl.vragen.forEach((x) => ul.appendChild(el('li', null, esc(x))));
      body.appendChild(ul); box.appendChild(body); sg.appendChild(box);
    });
    v.appendChild(sg);
  }

  function tabProgress(c, r, pr, v) {
    const pg = Model.progressOf(c.id);
    const snaps = Model.snapshotsOf(c.id);
    const card = el('div', 'card');
    card.appendChild(el('div', 'eyebrow', 'Progress Score v' + Coaching.VERSION));
    if (!pg.ready) card.appendChild(el('div', 'note warn', esc(pg.note) + (pg.weekenNodig ? ' Nog ' + pg.weekenNodig + ' check-in(s).' : '')));
    else {
      const t = el('table', 'assess mini');
      t.innerHTML = '<tr><th>Signaal</th><th>Gewicht</th><th>Score</th></tr>';
      pg.signalen.forEach((x) => {
        const tr = el('tr');
        tr.appendChild(el('td', null, esc(x.label)));
        tr.appendChild(el('td', null, Math.round(x.weight * 100) + '%'));
        tr.appendChild(el('td', null, x.score === null ? '<span class="muted">geen data</span>' : x.score));
        t.appendChild(tr);
      });
      const w = el('div', 'tscroll'); w.appendChild(t); card.appendChild(w);
      card.appendChild(el('div', 'note', 'Ontwikkelingsindex ' + pg.ontwikkelingsindex + ' → nieuwe Progress Score <b>' +
        pg.basis + ' → ' + pg.score + '</b> (' + (pg.delta >= 0 ? '+' : '') + pg.delta + ')'));
      const nav = el('div', 'nav-btns');
      const b = el('button', 'primary', 'Meting vastleggen');
      b.onclick = () => { Model.createSnapshot(c.id, 'progress', r, { overall: pg.score, note: 'Progress Score na ' + pg.weken + ' weken' }); render(); };
      nav.appendChild(b); card.appendChild(nav);
    }
    const row = el('div', 'mod-row');
    row.appendChild(el('span', 'muted', 'Coachbeoordeling'));
    const ci2 = el('input', 'ovr'); ci2.type = 'number'; ci2.min = 0; ci2.max = 100;
    ci2.value = (c.coach_rating || {}).score == null ? '' : c.coach_rating.score;
    const cr = el('input'); cr.type = 'text'; cr.placeholder = 'onderbouwing'; cr.value = (c.coach_rating || {}).reason || '';
    const commit = () => { Model.update('clients', c.id, { coach_rating: { score: ci2.value === '' ? null : Number(ci2.value), reason: cr.value } }); render(); };
    ci2.onchange = commit; cr.onchange = commit;
    row.appendChild(ci2); row.appendChild(cr);
    card.appendChild(row);
    v.appendChild(card);

    const sn = el('div', 'card');
    sn.appendChild(el('div', 'eyebrow', 'Score-snapshots — nooit overschreven'));
    const t2 = el('table', 'assess');
    t2.innerHTML = '<tr><th>Datum</th><th>Type</th><th>Score</th><th>FI</th><th>Status</th><th>Confidence</th><th>Versie</th><th>Notitie</th></tr>';
    snaps.forEach((s) => {
      const tr = el('tr');
      [s.created_at.slice(0, 10), s.score_type, '<b>' + s.overall_score + '</b>', s.foundation_index,
       esc(s.foundation_status || '—'), esc(s.confidence || '—'), 'v' + s.scoring_version, esc(s.note || '')]
        .forEach((x) => tr.appendChild(el('td', null, String(x))));
      t2.appendChild(tr);
    });
    const w2 = el('div', 'tscroll'); w2.appendChild(t2); sn.appendChild(w2);
    v.appendChild(sn);
  }

  /* ================================================================ router */

  const ROUTES = {
    '#/': screenLogin,
    '#/intake': screenIntake,
    '#/intake/klaar': screenIntakeKlaar,
    '#/verwerken': screenVerwerken,
    '#/startpunt': screenStartpunt,
    '#/dashboard': screenDashboard,
    '#/actions': screenActions,
    '#/checkin': screenCheckin,
    '#/reflection': screenReflection,
    '#/progress': screenProgress,
    '#/coach/clients': screenCoachClients,
    '#/coach/client': screenCoachClient
  };

  function render() {
    const h = location.hash || '#/';
    const fn = ROUTES[h] || screenLogin;
    if (!ses.role && h !== '#/') { location.hash = '#/'; return; }
    chrome();
    const v = $('#view'); v.innerHTML = '';
    fn();
  }

  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  window.addEventListener('DOMContentLoaded', () => { Model.load(); if (!location.hash) location.hash = '#/'; render(); });
})();
