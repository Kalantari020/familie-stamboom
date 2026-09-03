/* Coaching Platform — prototype UI
   Rendert intake, klantdashboard (§25) en coachomgeving (§18–§20, §31)
   volgens COACH SCORING FRAMEWORK V1.0.
   Alle scoringlogica zit in scoring.js; dit bestand rekent niets zelf uit (§30). */

(function () {
  'use strict';

  const KEY = 'coaching_platform_v1';
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  let state = load();

  function blank() {
    return { answers: {},
             coach: { dimensions: {}, components: {}, structureModifier: {}, focusOverride: '',
                      focusValidation: { status: 'voorlopig', focus: null, reason: '' } },
             notes: '', history: [], actions: [], checkins: [],
             goalProgress: null, coachRating: { score: null, reason: '' },
             step: 0, view: 'intake', submitted: false };
  }
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return Object.assign(blank(), JSON.parse(raw)); }
    catch (e) { /* eerste keer of geblokkeerde storage */ }
    return blank();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function result() { return Scoring.computeScore(state.answers, state.coach); }
  function prio(r) { return Priority.computePriority(r || result(), state.coach); }
  function progress(r) {
    return Coaching.computeProgress({
      startScore: state.history.length ? state.history[0].total : (r || result()).total,
      previousScore: state.history.length ? state.history[state.history.length - 1].total : null,
      checkins: state.checkins, goalProgress: state.goalProgress, coachRating: state.coachRating
    });
  }

  /* ================================================================ INTAKE */

  function renderIntake() {
    const root = $('#view'); root.innerHTML = '';
    const cats = INTAKE.categories;
    const step = Math.min(state.step, cats.length);

    const pr = el('div', 'progress');
    pr.appendChild(el('i')).style.width = (step / cats.length * 100) + '%';
    root.appendChild(pr);

    if (step === 0 && !state.answers.q1) {
      const intro = el('div', 'card');
      intro.appendChild(el('div', 'eyebrow', 'Intake'));
      intro.appendChild(el('h1', null, 'Eerst het fundament, daarna groei'));
      INTAKE.intro.forEach((p) => intro.appendChild(el('p', null, esc(p))));
      root.appendChild(intro);
    }

    if (step < cats.length) {
      const c = cats[step];
      const card = el('div', 'card');
      card.appendChild(el('div', 'eyebrow', 'Deel ' + (step + 1) + ' van ' + cats.length));
      card.appendChild(el('h2', null, esc(c.title)));
      card.appendChild(el('p', null, esc(c.intro)));
      card.appendChild(el('hr', 'sep'));
      c.questions.forEach((q) => {
        const sec = (c.sections || []).find((s) => s.after === q.n - 1);
        if (sec) card.appendChild(el('div', 'eyebrow', esc(sec.title)));
        card.appendChild(renderQuestion(q));
      });
      root.appendChild(card);

      const nav = el('div', 'nav-btns');
      if (step > 0) { const bk = el('button', 'ghost', 'Vorige'); bk.onclick = () => { state.step--; save(); render(); }; nav.appendChild(bk); }
      const nx = el('button', 'primary', step === cats.length - 1 ? 'Intake afronden' : 'Volgende');
      nx.onclick = () => { state.step++; save(); render(); window.scrollTo(0, 0); };
      nav.appendChild(nx);
      nav.appendChild(el('div', 'muted', answeredCount() + ' van 25 vragen ingevuld'));
      root.appendChild(nav);
    } else {
      const card = el('div', 'card');
      card.appendChild(el('div', 'eyebrow', 'Klaar'));
      card.appendChild(el('h2', null, 'Einde van de intake'));
      INTAKE.outro.forEach((p) => card.appendChild(el('p', null, esc(p))));
      root.appendChild(card);
      const nav = el('div', 'nav-btns');
      const bk = el('button', 'ghost', 'Terug'); bk.onclick = () => { state.step--; save(); render(); };
      const go = el('button', 'primary', 'Bekijk mijn startpunt');
      go.onclick = () => { state.submitted = true; meting('Start'); state.view = 'client'; save(); render(); window.scrollTo(0, 0); };
      nav.appendChild(bk); nav.appendChild(go);
      root.appendChild(nav);
    }
  }

  function meting(label) {
    const r = result();
    if (state.history.some((m) => m.label === label)) return;
    state.history.push({ label, date: r.scoreDate, total: r.total, fi: r.foundationIndex,
                         status: r.foundationStatus ? r.foundationStatus.code : null, version: r.frameworkVersion });
  }

  function answeredCount() {
    let n = 0;
    INTAKE.categories.forEach((c) => c.questions.forEach((q) => {
      const ids = q.ids || [q.id];
      if (ids.some((id) => { const v = state.answers[id]; return Array.isArray(v) ? v.length : (v !== undefined && v !== ''); })) n++;
    }));
    return n;
  }
  function setAns(id, v) { state.answers[id] = v; save(); }

  function renderQuestion(q) {
    const box = el('div', 'q');
    box.appendChild(el('div', 'q-n', 'Vraag ' + q.n));
    box.appendChild(el('div', 'q-label', esc(q.label)));
    if (q.hint) box.appendChild(el('div', 'q-hint', esc(q.hint)));

    if (q.type === 'scale' || q.type === 'days') {
      const isDays = q.type === 'days';
      const lo = isDays ? 0 : 1, hi = isDays ? 7 : 10;
      const sc = el('div', 'scale');
      for (let i = lo; i <= hi; i++) {
        const bt = el('b', String(state.answers[q.id]) === String(i) ? 'on' : '', String(i));
        bt.onclick = () => { setAns(q.id, i); render(); };
        sc.appendChild(bt);
      }
      box.appendChild(sc);
      const lg = el('div', 'scale-legend');
      lg.appendChild(el('span', 'muted', isDays ? '0 dagen' : '1 — heel laag'));
      lg.appendChild(el('span', 'muted', isDays ? '7 dagen' : '10 — heel hoog'));
      box.appendChild(lg);
    } else if (q.type === 'choice' || q.type === 'multi') {
      const cur = q.type === 'multi' ? (state.answers[q.id] || []) : state.answers[q.id];
      const opts = el('div', 'opts');
      q.options.forEach((o) => {
        const on = q.type === 'multi' ? cur.indexOf(o) >= 0 : cur === o;
        const full = q.max && q.type === 'multi' && !on && cur.length >= q.max;
        const bt = el('div', 'opt' + (on ? ' on' : '') + (full ? ' off' : ''), esc(o));
        bt.onclick = () => {
          if (q.type === 'multi') {
            const list = (state.answers[q.id] || []).slice();
            const i = list.indexOf(o);
            if (i >= 0) list.splice(i, 1);
            else { if (q.max && list.length >= q.max) return; list.push(o); }
            setAns(q.id, list);
          } else setAns(q.id, cur === o ? '' : o);
          render();
        };
        opts.appendChild(bt);
      });
      box.appendChild(opts);
      if (q.max) box.appendChild(el('div', 'muted', 'Maximaal ' + q.max + ' — nu ' + (cur.length || 0) + ' gekozen'));
      const other = q.type === 'multi' ? (cur.indexOf(q.otherOn) >= 0) : cur === q.otherOn;
      if (q.otherId && other) box.appendChild(input(q.otherId, 'text', 'Namelijk…'));
      if (q.id === 'q21') box.appendChild(area('q21_t'));
    } else if (q.type === 'triple') {
      q.ids.forEach((id, i) => box.appendChild(input(id, 'text', (i + 1) + '.')));
    } else if (q.type === 'number') {
      box.appendChild(input(q.id, 'number', ''));
    } else {
      box.appendChild(area(q.id));
    }

    (q.extra || []).forEach((x) => {
      box.appendChild(el('div', 'q-hint', esc(x.label)));
      box.appendChild(input(x.id, x.type === 'time' ? 'time' : 'text', ''));
    });
    if (q.followUp) {
      box.appendChild(el('div', 'q-hint', esc(q.followUp.label)));
      box.appendChild(area(q.followUp.id));
    }
    return box;
  }
  function input(id, type, ph) {
    const i = el('input'); i.type = type; i.placeholder = ph || ''; i.value = state.answers[id] || '';
    i.oninput = () => setAns(id, i.value); return i;
  }
  function area(id) {
    const t = el('textarea'); t.value = state.answers[id] || '';
    t.oninput = () => setAns(id, t.value); return t;
  }

  /* ================================================================ KLANTDASHBOARD (§25) */

  const barClass = (v) => v < 40 ? 'low' : v < 60 ? 'mid' : v < 75 ? 'ok' : 'high';

  function renderClient() {
    const r = result();
    const root = $('#view'); root.innerHTML = '';

    if (!state.submitted) {
      root.appendChild(el('div', 'card', '<p>Rond eerst de intake af. Je startpunt verschijnt daarna hier.</p>'));
      return;
    }

    // Jouw startpunt + foundation status
    const hero = el('div', 'card score-hero');
    hero.appendChild(el('div', 'eyebrow', 'Jouw startpunt'));
    hero.appendChild(el('div', 'score-big', r.total + '<small> / 100</small>'));
    if (r.foundationStatus) {
      hero.appendChild(el('div', 'status-pill status-' + r.foundationStatus.code,
        r.foundationStatus.icon + ' Foundation Status — ' + esc(r.foundationStatus.label)));
      hero.appendChild(el('p', 'muted', esc(r.foundationStatus.text) + ' ' + esc(r.foundationStatus.focus)));
    }
    hero.appendChild(el('p', 'muted', '<b>' + esc(r.scoreBand.label) + '.</b> ' + esc(r.scoreBand.text) +
      '<br>Dit is je huidige startpunt — een momentopname, geen eindstand.'));
    root.appendChild(hero);

    // Dimensies
    const bars = el('div', 'card');
    bars.appendChild(el('div', 'eyebrow', 'Jouw dimensies'));
    Scoring.DIM_ORDER.forEach((k) => {
      const d = r.dims[k];
      const bx = el('div', 'bar');
      const top = el('div', 'bar-top');
      top.appendChild(el('span', null, d.icon + ' ' + esc(d.label)));
      top.appendChild(el('span', null, d.score === null ? '<em>niet ingevuld</em>' : d.score));
      bx.appendChild(top);
      const tr = el('div', 'bar-track');
      const fi = el('i', 'bar-fill ' + barClass(d.score || 0));
      fi.style.width = (d.score || 0) + '%';
      tr.appendChild(fi); bx.appendChild(tr);
      bars.appendChild(bx);
    });
    root.appendChild(bars);

    // Eerste focus — pas zichtbaar nadat de coach hem heeft gevalideerd (Priority Engine stap 5)
    const pr = prio(r);
    const f = el('div', 'card');
    const fb = el('div', 'focus-box');
    fb.appendChild(el('div', 'eyebrow', 'Jouw eerste focus'));
    if (pr.visibleToClient && pr.primaryFocus) {
      fb.appendChild(el('h2', null, esc(pr.primaryFocusLabel) +
        (pr.secondaryLabel && pr.secondary !== pr.primaryFocus ? ' &amp; ' + esc(pr.secondaryLabel.split(' ')[0].toLowerCase()) : '')));
      fb.appendChild(el('p', null, Scoring.LANGUAGE.focusZin +
        ' We beginnen bij het onderdeel waar op dit moment waarschijnlijk de grootste hefboom zit: ' +
        esc(focusZin({ key: pr.primaryFocus, label: pr.primaryFocusLabel })) + '.'));
    } else {
      fb.appendChild(el('h2', 'wachten', 'Wordt bepaald in je eerste sessie'));
      fb.appendChild(el('p', null, 'Je coach kijkt je antwoorden door en bepaalt samen met jou waar je begint. ' +
        'Dat gebeurt in het gesprek, niet automatisch op basis van een cijfer.'));
    }
    f.appendChild(fb);
    root.appendChild(f);

    // Doel (uit Q12)
    if ((state.answers.q12 || '').trim()) {
      const g = el('div', 'card tight');
      g.appendChild(el('div', 'eyebrow', 'Jouw doel'));
      g.appendChild(el('p', null, esc(state.answers.q12)));
      root.appendChild(g);
    }

    // Deze week — acties (§24: score en acties zijn twee systemen)
    const act = el('div', 'card');
    act.appendChild(el('div', 'eyebrow', 'Deze week'));
    if (!state.actions.length) {
      act.appendChild(el('p', 'muted', 'Je coach zet hier maximaal drie concrete acties klaar.'));
    } else {
      state.actions.forEach((a, i) => {
        const row = el('label', 'action');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!a.done;
        cb.onchange = () => { state.actions[i].done = cb.checked; save(); render(); };
        row.appendChild(cb); row.appendChild(el('span', a.done ? 'done' : '', esc(a.text)));
        act.appendChild(row);
      });
      const done = state.actions.filter((a) => a.done).length;
      const pct = Math.round(done / state.actions.length * 100);
      act.appendChild(el('div', 'muted', '<br>Completion deze week: <b>' + pct + '%</b>'));
      if (pct >= 80 && r.total < 60) {
        act.appendChild(el('div', 'note', 'Je staat nog niet waar je wilt staan, maar je gedrag laat zien dat je daadwerkelijk aan het veranderen bent.'));
      }
    }
    root.appendChild(act);

    // Reflectie
    const laatste = state.checkins[state.checkins.length - 1];
    if (laatste && (laatste.reflection || {}).geleerd) {
      const rf = el('div', 'card tight');
      rf.appendChild(el('div', 'eyebrow', 'Jouw reflectie'));
      rf.appendChild(el('p', null, '“' + esc(laatste.reflection.geleerd) + '”'));
      root.appendChild(rf);
    }

    // Progress Score
    const pg = progress(r);
    const pc = el('div', 'card');
    pc.appendChild(el('div', 'eyebrow', 'Jouw voortgang'));
    if (!pg.ready) {
      pc.appendChild(el('p', 'muted', esc(pg.note) +
        (pg.weekenNodig ? ' Nog ' + pg.weekenNodig + ' check-in(s) te gaan.' : '')));
      if (pg.completion !== null) pc.appendChild(el('p', null, 'Action completion tot nu toe: <b>' + pg.completion + '%</b>'));
    } else {
      pc.appendChild(el('p', null, '<span class="score-mid">' + pg.basis + ' → ' + pg.score + '</span>' +
        ' <span class="muted">over ' + pg.weken + ' weken</span>'));
      const ul = el('ul', 'plain');
      ul.appendChild(el('li', null, '<b>Deze periode heb je:</b>'));
      pg.bewijs.forEach((b) => ul.appendChild(el('li', null, esc(b))));
      pc.appendChild(ul);
    }
    root.appendChild(pc);

    // Progressie
    if (state.history.length > 1) root.appendChild(historyCard());

    // Mijlpalen
    const g2 = el('div', 'card');
    g2.appendChild(el('div', 'eyebrow', 'Jouw traject'));
    const badges = el('div', 'badges');
    const delta = state.history.length ? r.total - state.history[0].total : 0;
    [['Intake afgerond', true], ['Eerste week afgerond', state.history.length > 1],
     ['7 dagen consistent', state.actions.length > 0 && state.actions.every((a) => a.done)],
     ['Eerste maand afgerond', state.history.length > 3], ['+10 punten', delta >= 10],
     ['Fundament opgebouwd', r.foundationIndex !== null && r.foundationIndex >= 60],
     ['Eerste doel behaald', false], ['Zelfstandig traject afgerond', false]
    ].forEach(([t, on]) => badges.appendChild(el('div', 'badge' + (on ? ' earned' : ''), esc(t))));
    g2.appendChild(badges);
    root.appendChild(g2);

    const nav = el('div', 'nav-btns');
    const nm = el('button', 'ghost', 'Nieuwe meting vastleggen');
    nm.onclick = () => { meting('Meting ' + (state.history.length + 1)); save(); render(); };
    nav.appendChild(nm);
    nav.appendChild(el('div', 'muted', 'Interne coachnotities, hypotheses en signalen zijn hier bewust niet zichtbaar.'));
    root.appendChild(nav);
  }

  function focusZin(f) {
    const map = { F: 'je gezondheid, energie en herstel', S: 'je dagelijkse structuur',
                  R: 'je richting en je doel', D: 'het nakomen van je eigen afspraken',
                  O: 'het pakken van je eigen verantwoordelijkheid', C: 'je concrete bereidheid om iets anders te doen' };
    return map[f.key] || f.label.toLowerCase();
  }

  function historyCard() {
    const c = el('div', 'card');
    c.appendChild(el('div', 'eyebrow', 'Jouw progressie'));
    const h = el('div', 'hist');
    state.history.forEach((m) => {
      const d = el('div');
      const bar = el('i'); bar.style.height = Math.max(6, m.total) + 'px';
      d.appendChild(bar);
      d.appendChild(el('span', null, '<b>' + m.total + '</b><br>' + esc(m.label)));
      h.appendChild(d);
    });
    c.appendChild(h);
    const delta = state.history[state.history.length - 1].total - state.history[0].total;
    c.appendChild(el('p', 'muted', delta === 0 ? 'Nog geen verandering ten opzichte van je start.'
      : (delta > 0 ? '+' + delta : delta) + ' punten sinds je start.'));
    return c;
  }

  /* ================================================================ CHECK-IN (klant) */

  function renderCheckin() {
    const root = $('#view'); root.innerHTML = '';
    if (!state.submitted) { root.appendChild(el('div', 'card', '<p>Rond eerst de intake af.</p>')); return; }

    const head = el('div', 'card');
    head.appendChild(el('div', 'eyebrow', 'Wekelijkse check-in · maximaal 5 minuten'));
    head.appendChild(el('h1', null, 'Week ' + (state.checkins.length + 1)));
    head.appendChild(el('p', null, 'Wat heb je gedaan? → Wat gebeurde er? → Wat heb je geleerd? → Wat doen we nu?'));
    root.appendChild(head);

    if (!state.actions.length) {
      root.appendChild(el('div', 'card', '<p class="muted">Je coach heeft nog geen acties klaargezet voor deze week.</p>'));
      return;
    }

    const ac = el('div', 'card');
    ac.appendChild(el('div', 'eyebrow', 'Je acties'));
    state.actions.forEach((a, i) => {
      const row = el('div', 'checkin-row');
      row.appendChild(el('div', 'checkin-text', esc(a.text)));
      const opts = el('div', 'opts');
      Object.keys(Coaching.STATUS).forEach((k) => {
        const st = Coaching.STATUS[k];
        const b = el('div', 'opt' + (a.status === k ? ' on' : ''), st.icon + ' ' + esc(st.label));
        b.onclick = () => { state.actions[i].status = k; state.actions[i].done = (k === 'done'); save(); render(); };
        opts.appendChild(b);
      });
      row.appendChild(opts);
      ac.appendChild(row);
    });
    const gedaan = state.actions.filter((a) => a.status).length;
    const comp = Coaching.actionCompletion({ actions: state.actions.filter((a) => a.status) });
    ac.appendChild(el('div', 'muted', '<br>' + gedaan + ' van ' + state.actions.length + ' beoordeeld' +
      (comp !== null ? ' · action completion <b>' + comp + '%</b>' : '')));
    root.appendChild(ac);

    const rf = el('div', 'card');
    rf.appendChild(el('div', 'eyebrow', 'Reflectie'));
    state.draft = state.draft || { reflection: {}, ratings: {} };
    Coaching.CHECKIN_VRAGEN.forEach((q) => {
      rf.appendChild(el('div', 'q-label', esc(q.label)));
      const ta = el('textarea'); ta.value = state.draft.reflection[q.id] || '';
      ta.oninput = () => { state.draft.reflection[q.id] = ta.value; save(); };
      rf.appendChild(ta);
    });
    root.appendChild(rf);

    const rt = el('div', 'card');
    rt.appendChild(el('div', 'eyebrow', 'Zelfbeoordeling'));
    Coaching.CHECKIN_CIJFERS.forEach((q) => {
      rt.appendChild(el('div', 'q-label', esc(q.label)));
      const sc = el('div', 'scale');
      for (let i = 1; i <= 10; i++) {
        const b = el('b', String(state.draft.ratings[q.id]) === String(i) ? 'on' : '', String(i));
        b.onclick = () => { state.draft.ratings[q.id] = i; save(); render(); };
        sc.appendChild(b);
      }
      rt.appendChild(sc);
    });
    rt.appendChild(el('p', 'muted', '<br>Deze cijfers zijn signalen voor je coach, geen automatische scoreverhoging.'));
    root.appendChild(rt);

    const nav = el('div', 'nav-btns');
    const go = el('button', 'primary', 'Check-in versturen');
    go.disabled = state.actions.some((a) => !a.status);
    go.onclick = () => {
      state.checkins.push({
        week: state.checkins.length + 1, date: new Date().toISOString().slice(0, 10),
        actions: state.actions.map((a) => ({ text: a.text, status: a.status })),
        reflection: Object.assign({}, state.draft.reflection), ratings: Object.assign({}, state.draft.ratings)
      });
      state.actions.forEach((a) => { a.status = null; a.done = false; });
      state.draft = { reflection: {}, ratings: {} };
      state.view = 'client'; save(); render(); window.scrollTo(0, 0);
    };
    nav.appendChild(go);
    if (go.disabled) nav.appendChild(el('div', 'muted', 'Beoordeel eerst al je acties.'));
    root.appendChild(nav);

    if (state.checkins.length) {
      const hist = el('div', 'card tight');
      hist.appendChild(el('div', 'eyebrow', 'Eerdere check-ins'));
      state.checkins.forEach((c) => hist.appendChild(el('div', 'muted',
        'Week ' + c.week + ' · ' + esc(c.date) + ' · completion ' + Coaching.actionCompletion(c) + '%')));
      root.appendChild(hist);
    }
  }

  /* ================================================================ COACHOMGEVING */

  function renderCoach() {
    const r = result();
    const root = $('#view'); root.innerHTML = '';

    // Kop + §31 samenvatting
    const head = el('div', 'card');
    head.appendChild(el('div', 'eyebrow', 'Coachomgeving · Scoring Framework v' + r.frameworkVersion));
    head.appendChild(el('h1', null, 'Assessment'));
    head.appendChild(el('p', null, 'Niet zichtbaar voor de klant. Signalen zijn geen conclusies; scores zijn AI-baselines tot je ze valideert.'));
    const dl = el('dl', 'fsh');
    const add = (k, v) => { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); };
    add('Startscore', '<b>' + r.total + '</b> / 100 · ' + esc(r.scoreBand.label));
    add('Foundation Index', r.foundationIndex === null ? '—' : r.foundationIndex + ' <span class="muted">(F + S) / 2</span>');
    add('Foundation Status', r.foundationStatus ? r.foundationStatus.icon + ' ' + esc(r.foundationStatus.label) : '—');
    add('Sterkste dimensie', r.strongest ? esc(r.strongest.label) + ' — ' + r.strongest.score : '—');
    add('Grootste ontwikkelpunt', r.weakest ? esc(r.weakest.label) + ' — ' + r.weakest.score : '—');
    add('Eerste focus', r.focus ? esc(r.focus.label) + (r.focus.component ? ' <span class="muted">· ' + esc(r.focus.component) + '</span>' : '') : '—');
    add('Confidence', r.confidence.icon + ' ' + esc(r.confidence.label));
    add('Coach validation', r.coachValidated ? 'bevestigd' : '<span class="tag prov">nog niet gevalideerd</span>');
    head.appendChild(dl);
    if (r.focus) head.appendChild(el('div', 'note', esc(r.focus.reden)));
    if (r.minFoundationRule.active) head.appendChild(el('div', 'note warn',
      'Minimum foundation regel actief: ' + esc(r.minFoundationRule.hits.join(' · ')) +
      '. Geen groeifocus als eerste aanbeveling, tenzij je bewust overrulet.'));
    root.appendChild(head);

    if (r.warnings.length) {
      const w = el('div', 'card tight');
      r.warnings.forEach((x) => w.appendChild(el('div', 'note warn', esc(x))));
      root.appendChild(w);
    }

    // Coach checks (§19)
    const ck = el('div', 'card');
    ck.appendChild(el('div', 'eyebrow', 'Coach checks — inconsistenties en validatiesignalen'));
    if (!r.checks.length) ck.appendChild(el('p', 'muted', 'Geen tegenstrijdigheden gedetecteerd.'));
    r.checks.forEach((c) => {
      const d = el('div', 'flag hoog');
      d.appendChild(el('b', null, c.icon + ' ' + esc(c.titel) + (c.dim ? ' · ' + esc(Scoring.DIMENSIONS[c.dim].label) : '')));
      d.appendChild(el('div', null, esc(c.detail)));
      ck.appendChild(d);
    });
    ck.appendChild(el('p', 'muted', '<br>Signalen verlagen de score nooit automatisch. Corrigeren doe je hieronder, met een reden.'));
    root.appendChild(ck);

    // ---------- PRIORITY ENGINE V1.0 ----------
    const pr = prio(r);
    const pe = el('div', 'card');
    pe.appendChild(el('div', 'eyebrow', 'Priority Engine v' + pr.engineVersion));
    pe.appendChild(el('h2', null, 'Waar beginnen we?'));
    pe.appendChild(el('div', 'note', '<b>AI-hypothese:</b> ' + esc(pr.hypothese)));
    const pdl = el('dl', 'fsh');
    const padd = (k, v) => { pdl.appendChild(el('dt', null, k)); pdl.appendChild(el('dd', null, v)); };
    padd('Modus', esc(pr.mode) + ' <span class="muted">' + esc(pr.reden) + '</span>');
    padd('Primary focus', pr.aiPrimaryLabel ? esc(pr.aiPrimaryLabel) : '—');
    padd('Secondary focus', pr.secondaryLabel ? esc(pr.secondaryLabel) : '—');
    padd('Ingang', pr.entry ? esc(pr.entry) : '—');
    padd('Hefboomketen', pr.chain ? esc(pr.chain.keten) : 'geen');
    pe.appendChild(pdl);

    // de vijf stappen, transparant
    pr.steps.forEach((st) => {
      const box = el('div', 'stepbox');
      box.appendChild(el('div', 'stepnr', 'Stap ' + st.step));
      const body = el('div', 'stepbody');
      body.appendChild(el('b', null, esc(st.name)));
      body.appendChild(el('div', 'muted', esc(st.note || '')));
      if (st.step === 2 && st.rows) {
        const t2 = el('table', 'assess mini');
        t2.innerHTML = '<tr><th>Dimensie</th><th>Score</th><th>Gap</th><th>Impact</th><th>Bottleneck</th><th>Blokkeert</th></tr>';
        st.rows.forEach((x) => {
          const tr = el('tr');
          [esc(x.label), x.score, x.gap, '×' + x.impact, '<b>' + x.bottleneck + '</b>', '<span class="muted">' + esc(x.detail || '—') + '</span>']
            .forEach((c) => tr.appendChild(el('td', null, String(c))));
          t2.appendChild(tr);
        });
        const w = el('div', 'tscroll'); w.appendChild(t2); body.appendChild(w);
      }
      if (st.step === 3 && st.items) st.items.forEach((i) => {
        body.appendChild(el('div', 'flag hoog', '<b>⚠️ ' + esc(i.titel) + '</b><br>' + esc(i.detail) +
          '<br><span class="muted">Coachvraag: ' + esc(i.vraag) + '</span>'));
      });
      if (st.step === 4 && st.kandidaten) st.kandidaten.forEach((k) => {
        body.appendChild(el('div', 'note', '<b>' + esc(k.label) + '</b> (' + esc(k.entry) + ' · ' + k.entryScore + ') → ' +
          esc(k.unlocks.join(', ')) + '<br><span class="muted">' + esc(k.keten) + '</span>'));
      });
      if (st.step === 5) {
        const v = state.coach.focusValidation || {};
        const row = el('div', 'mod-row');
        const sel = el('select');
        [['voorlopig', 'Voorlopig (niet zichtbaar voor klant)'], ['bevestigd', 'Bevestigd'],
         ['gewijzigd', 'Gewijzigd'], ['verworpen', 'Verworpen']].forEach(([k, lab]) => {
          const o = el('option', null, lab); o.value = k; if ((v.status || 'voorlopig') === k) o.selected = true; sel.appendChild(o);
        });
        const dim = el('select');
        const oe = el('option', null, '(AI-voorstel: ' + (pr.aiPrimaryLabel || '—') + ')'); oe.value = ''; dim.appendChild(oe);
        Scoring.DIM_ORDER.forEach((k) => {
          const o = el('option', null, Scoring.DIMENSIONS[k].label); o.value = k;
          if (v.focus === k) o.selected = true; dim.appendChild(o);
        });
        const rsn = el('input'); rsn.type = 'text'; rsn.placeholder = 'reden / notitie'; rsn.value = v.reason || '';
        const btn = el('button', 'primary', 'Vastleggen');
        btn.onclick = () => {
          state.coach.focusValidation = { status: sel.value, focus: dim.value || pr.aiPrimary, reason: rsn.value };
          save(); render();
        };
        row.appendChild(sel); row.appendChild(dim); row.appendChild(rsn); row.appendChild(btn);
        body.appendChild(row);
        body.appendChild(el('div', pr.visibleToClient ? 'note' : 'note warn',
          pr.visibleToClient
            ? 'Focus is gevalideerd en zichtbaar voor de klant: ' + esc(pr.primaryFocusLabel) +
              (pr.focusSource === 'coach' ? ' (coachkeuze, AI stelde ' + esc(pr.aiPrimaryLabel) + ' voor)' : '')
            : 'Nog niet gevalideerd — de klant ziet nog geen focus.'));
      }
      box.appendChild(body);
      pe.appendChild(box);
    });
    root.appendChild(pe);

    // ---------- SESSIE 1 ----------
    const gids = Coaching.sessieGids(state.answers, r, pr);
    const sg = el('div', 'card');
    sg.appendChild(el('div', 'eyebrow', 'Sessie 1 — van inzicht naar focus · ' + gids.duur + ' minuten'));
    gids.blokken.forEach((b) => {
      const box = el('div', 'stepbox');
      box.appendChild(el('div', 'stepnr', b.min + "'"));
      const body = el('div', 'stepbody');
      body.appendChild(el('b', null, esc(b.titel)));
      body.appendChild(el('div', 'muted', esc(b.doel)));
      const ul = el('ul', 'plain');
      b.vragen.forEach((v) => ul.appendChild(el('li', null, esc(v))));
      body.appendChild(ul);
      box.appendChild(body); sg.appendChild(box);
    });
    if (gids.actievoorstellen.length) {
      sg.appendChild(el('div', 'eyebrow', 'Actievoorstellen bij deze focus'));
      const ul = el('ul', 'plain');
      gids.actievoorstellen.forEach((a) => {
        const li = el('li');
        li.appendChild(el('span', null, esc(a)));
        const add = el('button', 'ghost tiny', 'overnemen');
        add.onclick = () => { if (state.actions.length < 3) { state.actions.push({ text: a, status: null, done: false }); save(); render(); } };
        li.appendChild(add); ul.appendChild(li);
      });
      sg.appendChild(ul);
    }
    root.appendChild(sg);

    // ---------- CHECK-INS + PROGRESS ----------
    const pg = progress(r);
    const cc = el('div', 'card');
    cc.appendChild(el('div', 'eyebrow', 'Check-ins & Progress Score v' + Coaching.VERSION));
    if (state.checkins.length) {
      const last = state.checkins[state.checkins.length - 1];
      const an = Coaching.analyseCheckin(last, state.answers, state.checkins);
      cc.appendChild(el('p', null, '<b>Week ' + last.week + '</b> · action completion <b>' + an.completion +
        '%</b> · consistentie ' + esc(an.consistentie) + ' · gemiddeld ' + an.gemiddelde + '%'));
      if (an.patronen.length) cc.appendChild(el('div', 'note', '<b>Positief patroon:</b> ' + esc(an.patronen.join(' · '))));
      if (an.obstakels.length) cc.appendChild(el('div', 'note', '<b>Obstakel:</b> ' + esc(an.obstakels.join(' · '))));
      an.checks.forEach((c) => cc.appendChild(el('div', 'flag hoog', '⚠️ ' + esc(c))));
      if (an.coachvragen.length) {
        cc.appendChild(el('div', 'eyebrow', 'Coachvragen voor het gesprek'));
        const ul = el('ul', 'plain');
        an.coachvragen.forEach((v) => ul.appendChild(el('li', null, esc(v))));
        cc.appendChild(ul);
      }
    } else {
      cc.appendChild(el('p', 'muted', 'Nog geen check-ins ontvangen.'));
    }

    cc.appendChild(el('hr', 'sep'));
    const grow = el('div', 'mod-row');
    grow.appendChild(el('span', 'muted', 'Doelvoortgang 0–100'));
    const gi = el('input', 'ovr'); gi.type = 'number'; gi.min = 0; gi.max = 100;
    gi.value = state.goalProgress === null ? '' : state.goalProgress;
    gi.onchange = () => { state.goalProgress = gi.value === '' ? null : Number(gi.value); save(); render(); };
    grow.appendChild(gi);
    grow.appendChild(el('span', 'muted', 'Coachbeoordeling'));
    const ci2 = el('input', 'ovr'); ci2.type = 'number'; ci2.min = 0; ci2.max = 100;
    ci2.value = (state.coachRating || {}).score === null || (state.coachRating || {}).score === undefined ? '' : state.coachRating.score;
    const cr = el('input'); cr.type = 'text'; cr.placeholder = 'onderbouwing'; cr.value = (state.coachRating || {}).reason || '';
    const commitCR = () => { state.coachRating = { score: ci2.value === '' ? null : Number(ci2.value), reason: cr.value }; save(); render(); };
    ci2.onchange = commitCR; cr.onchange = commitCR;
    grow.appendChild(ci2); grow.appendChild(cr);
    cc.appendChild(grow);

    if (!pg.ready) {
      cc.appendChild(el('div', 'note warn', esc(pg.note) + (pg.weekenNodig ? ' Nog ' + pg.weekenNodig + ' check-in(s).' : '')));
    } else {
      const t3 = el('table', 'assess mini');
      t3.innerHTML = '<tr><th>Signaal</th><th>Gewicht</th><th>Score</th></tr>';
      pg.signalen.forEach((x) => {
        const tr = el('tr');
        tr.appendChild(el('td', null, esc(x.label)));
        tr.appendChild(el('td', null, Math.round(x.weight * 100) + '%'));
        tr.appendChild(el('td', null, x.score === null ? '<span class="muted">geen data</span>' : x.score));
        t3.appendChild(tr);
      });
      const w3 = el('div', 'tscroll'); w3.appendChild(t3); cc.appendChild(w3);
      cc.appendChild(el('div', 'note', 'Ontwikkelingsindex ' + pg.ontwikkelingsindex +
        ' → Progress Score <b>' + pg.basis + ' → ' + pg.score + '</b> (' + (pg.delta >= 0 ? '+' : '') + pg.delta + ')' +
        '<br><span class="muted">Startscore ' + (state.history.length ? state.history[0].total : r.total) +
        ' · Action completion ' + pg.completion + '% · Progress ' + pg.score + ' — drie verschillende dingen.</span>'));
    }
    root.appendChild(cc);

    // Klant vs. coach
    const kc = el('div', 'card');
    kc.appendChild(el('div', 'eyebrow', 'Klant vs. coach'));
    kc.appendChild(el('p', null, '<b>Klant noemt als blokkade (V23):</b> ' + (esc(state.answers.q23) || '—')));
    kc.appendChild(el('p', null, '<b>Model wijst als eerste focus:</b> ' + (r.focus ? esc(r.focus.label) : '—')));
    kc.appendChild(el('p', null, '<b>Coachinghypotheses:</b>'));
    const ul = el('ul', 'plain');
    r.hypotheses.forEach((h) => ul.appendChild(el('li', null, esc(h))));
    kc.appendChild(ul);
    root.appendChild(kc);

    // Tijdsbesteding (§6)
    if (r.timeSignal) {
      const ts = el('div', 'card');
      ts.appendChild(el('div', 'eyebrow', 'Tijdsbesteding (V21) — modifier op structuur'));
      ts.appendChild(el('p', null, r.timeSignal.icon + ' <b>' + esc(r.timeSignal.level) + '</b> — ' + esc(r.timeSignal.note) +
        (r.timeSignal.selected.length ? '<br><span class="muted">' + esc(r.timeSignal.selected.join(', ')) + '</span>' : '')));
      const cur = state.coach.structureModifier || {};
      const row = el('div', 'mod-row');
      const sel = el('select');
      [0, -5, -10, 5, 10].forEach((v) => {
        const o = el('option', null, v > 0 ? '+' + v : String(v)); o.value = v;
        if (String(cur.value || 0) === String(v)) o.selected = true;
        sel.appendChild(o);
      });
      const rsn = el('input'); rsn.type = 'text'; rsn.placeholder = 'Reden (verplicht bij een correctie)'; rsn.value = cur.reason || '';
      const apply = el('button', 'ghost', 'Toepassen');
      apply.onclick = () => {
        state.coach.structureModifier = { value: Number(sel.value), reason: rsn.value };
        save(); render();
      };
      row.appendChild(sel); row.appendChild(rsn); row.appendChild(apply);
      ts.appendChild(row);
      if (r.timeSignal.suggest !== 0) ts.appendChild(el('div', 'muted', 'Voorstel op basis van de antwoorden: ' + r.timeSignal.suggest + ' punten.'));
      if (r.structureAdjust) ts.appendChild(el('div', 'note',
        'Toegepast: ' + r.structureAdjust.from + ' → ' + r.structureAdjust.to + ' — ' + esc(r.structureAdjust.reason)));
      root.appendChild(ts);
    }

    // Dimensies: AI baseline → coach validated (§20)
    const dv = el('div', 'card');
    dv.appendChild(el('div', 'eyebrow', 'Dimensiescores — AI baseline → coach validated'));
    dv.appendChild(el('p', 'muted', 'Een override vereist een nieuwe score én een korte reden. De oorspronkelijke AI-score blijft bewaard.'));
    const dt = el('table', 'assess');
    dt.innerHTML = '<tr><th>Dimensie</th><th>Gewicht</th><th>AI</th><th>Definitief</th><th>Confidence</th><th>Coachscore</th><th>Reden</th></tr>';
    Scoring.DIM_ORDER.forEach((k) => {
      const d = r.dims[k], ov = (state.coach.dimensions || {})[k] || {};
      const tr = el('tr');
      tr.appendChild(el('td', null, d.icon + ' ' + esc(d.label)));
      tr.appendChild(el('td', null, Math.round(d.weight * 100) + '%'));
      tr.appendChild(el('td', null, d.aiScore === null ? '—' : d.aiScore));
      tr.appendChild(el('td', null, '<b>' + (d.score === null ? '—' : d.score) + '</b>' + (d.coachAdjusted ? '<span class="tag">coach</span>' : '')));
      tr.appendChild(el('td', null, d.confidence.icon + ' ' + esc(d.confidence.label)));
      const tdS = el('td'); const inS = el('input', 'ovr'); inS.type = 'number'; inS.min = 0; inS.max = 100;
      inS.value = ov.score === undefined ? '' : ov.score;
      const tdR = el('td'); const inR = el('input'); inR.type = 'text'; inR.placeholder = 'reden'; inR.value = ov.reason || '';
      const commit = () => {
        if (inS.value === '') delete state.coach.dimensions[k];
        else state.coach.dimensions[k] = { score: Number(inS.value), reason: inR.value };
        save(); render();
      };
      inS.onchange = commit; inR.onchange = commit;
      tdS.appendChild(inS); tdR.appendChild(inR); tr.appendChild(tdS); tr.appendChild(tdR);
      dt.appendChild(tr);
      if (d.coachAdjusted) {
        const nr = el('tr'); const td = el('td'); td.colSpan = 7;
        td.appendChild(el('div', 'note', esc(d.label) + ': ' + d.aiScore + ' → ' + d.score + ' — ' + esc(d.coachReason)));
        nr.appendChild(td); dt.appendChild(nr);
      }
    });
    const dsc = el('div', 'tscroll'); dsc.appendChild(dt); dv.appendChild(dsc);
    root.appendChild(dv);

    // Componenten
    const tb = el('div', 'card');
    tb.appendChild(el('div', 'eyebrow', 'Score-opbouw per vraag'));
    const t = el('table', 'assess');
    t.innerHTML = '<tr><th>Dimensie</th><th>Vraag</th><th>Component</th><th>Gewicht</th><th>Score</th><th>AI-observatie</th><th>Coach</th></tr>';
    Scoring.DIM_ORDER.forEach((k) => {
      r.dims[k].components.forEach((c, i) => {
        const ov = (state.coach.components || {})[c.id] || {};
        const tr = el('tr');
        tr.appendChild(el('td', null, i === 0 ? r.dims[k].icon + ' ' + esc(r.dims[k].label) : ''));
        tr.appendChild(el('td', null, esc(c.qid)));
        tr.appendChild(el('td', null, esc(c.label)));
        tr.appendChild(el('td', null, Math.round(c.weight * 100) + '%'));
        tr.appendChild(el('td', null, (c.value === null ? '—' : c.value) +
          (c.estimated && !c.coachAdjusted ? '<span class="tag prov">AI</span>' : '') +
          (c.coachAdjusted ? '<span class="tag">coach</span>' : '')));
        tr.appendChild(el('td', null, '<span class="muted">' + esc(c.observation ||
          (c.estimated ? '' : 'directe conversie')) + '</span>' +
          (c.bandName ? '<br><span class="muted">band ' + c.bandLo + '–' + c.bandHi + '</span>' : '')));
        const td = el('td', 'nowrap');
        const iv = el('input', 'ovr'); iv.type = 'number'; iv.min = 0; iv.max = 100;
        iv.value = ov.value === undefined ? '' : ov.value;
        const ir = el('input', 'ovr-r'); ir.type = 'text'; ir.placeholder = 'reden'; ir.value = ov.reason || '';
        const commit = () => {
          if (iv.value === '') delete state.coach.components[c.id];
          else state.coach.components[c.id] = { value: Number(iv.value), reason: ir.value };
          save(); render();
        };
        iv.onchange = commit; ir.onchange = commit;
        td.appendChild(iv); td.appendChild(ir); tr.appendChild(td);
        t.appendChild(tr);
      });
    });
    const sc = el('div', 'tscroll'); sc.appendChild(t); tb.appendChild(sc);
    root.appendChild(tb);

    // Contextvragen (§4)
    const ctx = el('div', 'card tight');
    ctx.appendChild(el('div', 'eyebrow', 'Contextvragen — bewust zonder directe score (§4)'));
    const cu = el('ul', 'plain');
    [['V1', 'Leeftijd'], ['V2', 'Woonsituatie'], ['V3', 'Werk/studie en normale week'],
     ['V4', 'Algemene levenswaardering — contextuele indicator, niet hetzelfde als coachingkwaliteit'],
     ['V5', 'Wat gaat goed — sterktes en context'], ['V6', 'Wat wil je verbeteren — context'],
     ['V21', 'Tijdsbesteding — modifier op structuur, geen eigen score'],
     ['V23', 'Wat houdt je tegen — coachingprioriteit, geen automatische score']
    ].forEach(([q, u]) => cu.appendChild(el('li', null, '<b>' + q + '</b> — ' + esc(u))));
    ctx.appendChild(cu);
    root.appendChild(ctx);

    // Acties beheren (§24)
    const ac = el('div', 'card');
    ac.appendChild(el('div', 'eyebrow', 'Acties deze week (maximaal 3)'));
    state.actions.forEach((a, i) => {
      const row = el('div', 'mod-row');
      const inp = el('input'); inp.type = 'text'; inp.value = a.text;
      inp.onchange = () => { state.actions[i].text = inp.value; save(); };
      const del = el('button', 'ghost', 'Verwijder');
      del.onclick = () => { state.actions.splice(i, 1); save(); render(); };
      row.appendChild(inp); row.appendChild(del); ac.appendChild(row);
    });
    if (state.actions.length < 3) {
      const addb = el('button', 'ghost', '+ Actie toevoegen');
      addb.onclick = () => { state.actions.push({ text: 'Nieuwe actie', done: false }); save(); render(); };
      ac.appendChild(addb);
    }
    ac.appendChild(el('p', 'muted', '<br>Score en acties zijn twee gescheiden systemen. Een lage score met hoge completion is een goed teken.'));
    root.appendChild(ac);

    // Notities
    const nt = el('div', 'card');
    nt.appendChild(el('div', 'eyebrow', 'Sessienotities'));
    const ta = el('textarea'); ta.style.minHeight = '110px'; ta.value = state.notes || '';
    ta.oninput = () => { state.notes = ta.value; save(); };
    nt.appendChild(ta);
    root.appendChild(nt);

    // Record (§30)
    const rc = el('div', 'card');
    rc.appendChild(el('div', 'eyebrow', 'Opslagrecord (§30) — Scoring Framework v' + r.frameworkVersion));
    const pre = el('pre', 'rec', esc(JSON.stringify({
      score_version: r.record.score_version, score_date: r.record.score_date,
      total_score: r.record.total_score, foundation_index: r.record.foundation_index,
      foundation_status: r.record.foundation_status, confidence: r.record.confidence,
      dimensions: r.record.dimensions, answers: r.record.answers.slice(0, 3).concat([{ '…': (r.record.answers.length - 3) + ' rijen ingekort' }])
    }, null, 2)));
    rc.appendChild(pre);
    root.appendChild(rc);
  }

  /* ================================================================ ROUTER */

  function render() {
    document.querySelectorAll('.top-nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === state.view));
    if (state.view === 'intake') renderIntake();
    else if (state.view === 'client') renderClient();
    else if (state.view === 'checkin') renderCheckin();
    else renderCoach();
  }

  window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.top-nav button').forEach((b) => {
      if (b.dataset.view) b.onclick = () => { state.view = b.dataset.view; save(); render(); window.scrollTo(0, 0); };
    });
    $('#demo').onclick = () => {
      state = blank();
      state.answers = demoAnswers(); state.submitted = true; state.step = 4;
      state.actions = [{ text: 'Elke werkdag om 23:00 telefoon weg en licht uit', status: null, done: false },
                       { text: 'Elke ochtend 10 minuten dagplanning maken', status: null, done: false },
                       { text: 'Zondagavond week vooruit plannen', status: null, done: false }];
      state.checkins = demoCheckins();
      state.goalProgress = 55;
      state.coachRating = { score: 60, reason: 'uitvoering is sterk, inzicht groeit' };
      state.coach.focusValidation = { status: 'bevestigd', focus: null, reason: 'bevestigd in sessie 1' };
      meting('Start'); state.view = 'client'; save(); render();
    };
    $('#reset').onclick = () => {
      if (!confirm('Alle ingevulde antwoorden wissen?')) return;
      state = blank(); save(); render();
    };
    render();
  });

  function demoCheckins() {
    const R = [
      { goed: 'Mijn ochtendroutine werkt', obstakel: 'Ik had geen tijd, mijn avonden blijven chaotisch',
        geleerd: 'Ik merk dat mijn avonden het grootste probleem zijn' },
      { goed: 'Drie keer op tijd naar bed', obstakel: 'Vrijdag toch weer laat geworden',
        geleerd: 'Als ik mijn telefoon wegleg lukt het bijna vanzelf' },
      { goed: 'Elke ochtend gepland', obstakel: 'Werk liep uit', geleerd: 'Ik plan mijn avonden niet, alleen mijn ochtenden' },
      { goed: 'Voor het eerst een hele week volgehouden', obstakel: 'Weinig',
        geleerd: 'Ik heb minder discipline nodig dan ik dacht, ik had vooral structuur nodig' }
    ];
    const P = [['done', 'done', 'done'], ['done', 'done', 'done'], ['done', 'done', 'done'], ['done', 'done', 'none']];
    return P.map((st, i) => ({
      week: i + 1, date: new Date(Date.now() - (4 - i) * 7 * 864e5).toISOString().slice(0, 10),
      actions: st.map((x, j) => ({ text: 'actie ' + (j + 1), status: x })),
      reflection: R[i], ratings: { zorg: 6 + i % 2, afspraken: 6 + i % 3 }
    }));
  }

  /* Demoprofiel: klant noemt discipline, de data wijst naar structuur en fundament. */
  function demoAnswers() {
    return {
      q1: 29, q2: 'Alleen', q3: 'Fulltime IT-consultant, 45 uur per week, veel reistijd.',
      q4_s: 6, q4_t: 'Op papier gaat het prima maar ik voel me niet in controle.',
      q5_1: 'Mijn werk gaat goed', q5_2: 'Ik ben er voor mijn familie', q5_3: 'Ik geef niet snel op',
      q6_1: 'Mijn slaap', q6_2: 'Sporten', q6_3: 'Minder op mijn telefoon',
      q7: 'Mijn discipline', q8: 'Op tijd naar bed gaan en s ochtends sporten, dat lukt me al jaren niet en dat geldt eigenlijk voor alles',
      q9: 'Ik wil over drie jaar in de beste vorm van mijn leven zijn en een eigen bedrijf hebben.',
      q10: ['Gezondheid & lichaam', 'Mentale kracht & discipline', 'Werk & carrière', 'Geld & financiële vrijheid'],
      q11: 'Omdat ik het gevoel heb dat ik onder mijn niveau leef en dat vreet aan me.',
      q12: 'Meer discipline krijgen', q13_s: 5, q13_t: 'Niet ziek maar ook niet fit.',
      q14_s: 4, q14_t: 'Vooral slecht slapen en te veel schermtijd.',
      q15_s: 5, q15_bed: '01:30', q15_rise: '07:00',
      q16_s: 5, q16_t: 'Te vaak afhalen in de avond.',
      q17_n: 1, q17_t: 'Soms een keer naar de sportschool in het weekend.',
      q18_s: 4, q18_t: 'Ik plan eigenlijk niets, ik zie wel wat er komt.',
      q19_s: 5, q19_t: 'Administratie en post blijven liggen.',
      q20_s: 6, q20_t: 'Sporten en vroeg opstaan houd ik nooit vol.',
      q21: ['Social media', 'YouTube', 'Telefoon algemeen'],
      q21_t: 'Ik zit vaak 4 tot 5 uur per dag op mijn telefoon en game soms tot diep in de nacht.',
      q22: 'Mijn gezondheid serieuzer nemen.',
      q23: 'Discipline & volhouden',
      q24: 'Ik word bijna 30 en ik wil niet over een jaar nog steeds op dit punt staan.',
      q25_s: 8, q25_t: 'Ik wil er echt voor gaan en meer discipline opbrengen.'
    };
  }
})();
