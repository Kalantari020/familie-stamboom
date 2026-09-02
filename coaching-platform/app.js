/* Coaching Platform — prototype UI
   Vanilla JS, geen build tools. Rendert intake, startscore, klantdashboard en coachomgeving.
   Alle scoringlogica zit in scoring.js; dit bestand rekent niets zelf uit. */

(function () {
  'use strict';

  const KEY = 'coaching_platform_v1';
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* eerste keer of geblokkeerde storage */ }
    return { answers: {}, coach: {}, notes: '', history: [], step: 0, view: 'intake', submitted: false };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  function result() {
    const a = Object.assign({}, state.answers, { __coach: state.coach });
    return Scoring.computeScore(a);
  }

  /* ================================================================ INTAKE */

  function renderIntake() {
    const root = $('#view');
    root.innerHTML = '';
    const cats = INTAKE.categories;
    const step = Math.min(state.step, cats.length);   // stap 0..n-1 = categorie, n = afronden

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
      if (step > 0) { const b = el('button', 'ghost', 'Vorige'); b.onclick = () => { state.step--; save(); render(); }; nav.appendChild(b); }
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
      const b = el('button', 'ghost', 'Terug'); b.onclick = () => { state.step--; save(); render(); };
      const go = el('button', 'primary', 'Bekijk mijn startpunt');
      go.onclick = () => {
        state.submitted = true;
        if (!state.history.length) state.history.push({ label: 'Start', date: new Date().toISOString().slice(0, 10), total: result().total });
        state.view = 'client'; save(); render(); window.scrollTo(0, 0);
      };
      nav.appendChild(b); nav.appendChild(go);
      root.appendChild(nav);
    }
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
        const b = el('b', String(state.answers[q.id]) === String(i) ? 'on' : '', String(i));
        b.onclick = () => { setAns(q.id, i); render(); };
        sc.appendChild(b);
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
        const b = el('div', 'opt' + (on ? ' on' : '') + (full ? ' off' : ''), esc(o));
        b.onclick = () => {
          if (q.type === 'multi') {
            const list = (state.answers[q.id] || []).slice();
            const i = list.indexOf(o);
            if (i >= 0) list.splice(i, 1);
            else { if (q.max && list.length >= q.max) return; list.push(o); }
            setAns(q.id, list);
          } else setAns(q.id, cur === o ? '' : o);
          render();
        };
        opts.appendChild(b);
      });
      box.appendChild(opts);
      if (q.max) box.appendChild(el('div', 'muted', 'Maximaal ' + q.max + ' — nu ' + (cur.length || 0) + ' gekozen'));
      const other = q.type === 'multi' ? (cur.indexOf(q.otherOn) >= 0) : cur === q.otherOn;
      if (q.otherId && other) box.appendChild(input(q.otherId, 'text', 'Namelijk…'));
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
    const i = el('input');
    i.type = type; i.placeholder = ph || ''; i.value = state.answers[id] || '';
    i.oninput = () => setAns(id, i.value);
    return i;
  }
  function area(id) {
    const t = el('textarea');
    t.value = state.answers[id] || '';
    t.oninput = () => setAns(id, t.value);
    return t;
  }

  /* ================================================================ KLANTDASHBOARD */

  function barClass(v) { return v < 45 ? 'low' : v < 70 ? 'mid' : 'high'; }

  function renderClient() {
    const r = result();
    const root = $('#view');
    root.innerHTML = '';

    if (!state.submitted) {
      root.appendChild(el('div', 'card', '<p>Rond eerst de intake af. Je startpunt verschijnt daarna hier.</p>'));
      return;
    }

    const hero = el('div', 'card score-hero');
    hero.appendChild(el('div', 'eyebrow', 'Jouw startpunt'));
    hero.appendChild(el('div', 'score-big', r.total + '<small> / 100</small>'));
    hero.appendChild(el('div', 'level-pill', 'Level ' + r.level.level + ' — ' + esc(r.level.name)));
    hero.appendChild(el('p', 'muted', 'Dit is een momentopname van waar je vandaag staat. Geen oordeel, geen eindstand — een nulmeting.'));
    root.appendChild(hero);

    const bars = el('div', 'card');
    bars.appendChild(el('div', 'eyebrow', 'Jouw zes dimensies'));
    const bl = el('div', 'bars');
    Scoring.DIM_ORDER.forEach((k) => {
      const d = r.dims[k];
      const b = el('div', 'bar');
      const top = el('div', 'bar-top');
      top.appendChild(el('span', null, esc(d.label)));
      top.appendChild(el('span', null, d.score === null ? '<em>niet ingevuld</em>' : d.score));
      b.appendChild(top);
      const tr = el('div', 'bar-track');
      const fi = el('i', 'bar-fill ' + barClass(d.score || 0)); fi.style.display = 'block';
      fi.style.width = (d.score || 0) + '%'; fi.style.height = '100%';
      tr.appendChild(fi); b.appendChild(tr);
      bl.appendChild(b);
    });
    bars.appendChild(bl);
    root.appendChild(bars);

    if (r.focus) {
      const f = el('div', 'card');
      const fb = el('div', 'focus-box');
      fb.appendChild(el('div', 'eyebrow', 'Eerste focus'));
      fb.appendChild(el('h2', null, esc(r.focus.component || r.focus.dimLabel)));
      fb.appendChild(el('p', null, 'Je hoeft niet alles tegelijk te veranderen. We beginnen waar de grootste hefboom zit: ' +
        esc(r.focus.dimLabel.toLowerCase()) + '.'));
      f.appendChild(fb);
      root.appendChild(f);
    }

    if (state.history.length > 1) root.appendChild(historyCard());

    const g = el('div', 'card');
    g.appendChild(el('div', 'eyebrow', 'Jouw traject'));
    const badges = el('div', 'badges');
    [['Intake afgerond', true], ['Eerste week afgerond', state.history.length > 1],
     ['7 dagen consistent', false], ['Eerste maand afgerond', state.history.length > 3],
     ['+10 punten', state.history.length > 1 && (r.total - state.history[0].total) >= 10],
     ['Fundament opgebouwd', r.foundationIndex >= 60], ['Eerste doel behaald', false],
     ['Zelfstandig traject afgerond', r.level.level >= 4]
    ].forEach(([t, on]) => badges.appendChild(el('div', 'badge' + (on ? ' earned' : ''), esc(t))));
    g.appendChild(badges);
    g.appendChild(el('p', 'muted', '<br>Levels: 1 Fundament → 2 Stabiliteit → 3 Groei → 4 Zelfstandigheid. ' +
      'Een level schuift pas op als je fundament het draagt, niet alleen je motivatie.'));
    root.appendChild(g);

    const nm = el('button', 'ghost', 'Nieuwe meting vastleggen');
    nm.onclick = () => {
      state.history.push({ label: 'Meting ' + (state.history.length + 1), date: new Date().toISOString().slice(0, 10), total: r.total });
      save(); render();
    };
    const nav = el('div', 'nav-btns'); nav.appendChild(nm);
    nav.appendChild(el('div', 'muted', 'Interne coachnotities en hypotheses zijn hier bewust niet zichtbaar.'));
    root.appendChild(nav);
  }

  function historyCard() {
    const c = el('div', 'card');
    c.appendChild(el('div', 'eyebrow', 'Hoe ben ik veranderd'));
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

  /* ================================================================ COACHOMGEVING */

  function renderCoach() {
    const r = result();
    const root = $('#view');
    root.innerHTML = '';

    const head = el('div', 'card');
    head.appendChild(el('div', 'eyebrow', 'Coachomgeving'));
    head.appendChild(el('h1', null, 'Assessment'));
    head.appendChild(el('p', null, 'Deze weergave is niet zichtbaar voor de klant. Hypotheses zijn geen conclusies.'));
    const dl = el('dl', 'fsh');
    const add = (k, v) => { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); };
    add('Ruwe score', r.totalRaw);
    add('Fundamentindex', r.foundationIndex + ' <span class="muted">(0,45·F + 0,35·S + 0,20·D)</span>');
    add('Plafond', r.capValue + ' <span class="muted">(FI + ' + Scoring.CAP_MARGIN + ')</span>');
    add('Eindscore', '<b>' + r.total + '</b>' + (r.capApplied ? ' <span class="tag prov">floor toegepast</span>' : ''));
    add('Level', r.level.level + ' — ' + esc(r.level.name));
    add('Status', r.provisional ? '<span class="tag prov">voorlopig</span> bevat niet-gevalideerde rubrieken' : 'volledig gevalideerd');
    head.appendChild(dl);
    root.appendChild(head);

    // klant vs. coach
    const cv = r.clientView;
    const kc = el('div', 'card');
    kc.appendChild(el('div', 'eyebrow', 'Klant vs. coach'));
    kc.appendChild(el('p', null, '<b>Klant zegt:</b> ' + (esc(cv.claimed) || '—')));
    kc.appendChild(el('p', null, '<b>Model wijst naar:</b> ' + (esc(cv.modelLabel) || '—') +
      (r.focus && r.focus.component ? ' → ' + esc(r.focus.component) : '')));
    kc.appendChild(el('p', null, cv.aligned === true
      ? 'Klant en model wijzen dezelfde kant op. Bevestigen en direct starten.'
      : cv.aligned === false
        ? 'Verschil gedetecteerd. Dit is geen correctie van de klant maar een hypothese om samen te toetsen: “Laten we de komende weken testen of dit klopt.”'
        : 'Onvoldoende data om te vergelijken.'));
    root.appendChild(kc);

    // signalen
    if (r.flags.length) {
      const fl = el('div', 'card');
      fl.appendChild(el('div', 'eyebrow', 'Signalen'));
      r.flags.forEach((f) => fl.appendChild(el('div', 'flag ' + f.level, esc(f.text))));
      root.appendChild(fl);
    }

    // FACT / SIGNAL / HYPOTHESE / VERIFICATION / COACHING DECISION
    const as = el('div', 'card');
    as.appendChild(el('div', 'eyebrow', 'Coach assessment'));
    const rows = assessment(r);
    const dl2 = el('dl', 'fsh');
    rows.forEach(([k, v]) => { dl2.appendChild(el('dt', null, k)); dl2.appendChild(el('dd', null, v)); });
    as.appendChild(dl2);
    root.appendChild(as);

    // componenten + override
    const tb = el('div', 'card');
    tb.appendChild(el('div', 'eyebrow', 'Score-opbouw en validatie'));
    tb.appendChild(el('p', 'muted', 'Vul een waarde 0–100 in om een component vast te stellen. Een coachwaarde vervangt de automatische schatting.'));
    const t = el('table', 'assess');
    t.innerHTML = '<tr><th>Dimensie</th><th>Component</th><th>Bron</th><th>Type</th><th>Score</th><th>Coach</th></tr>';
    Scoring.DIM_ORDER.forEach((k) => {
      const d = r.dims[k];
      d.components.forEach((c, i) => {
        const tr = el('tr');
        tr.appendChild(el('td', null, i === 0 ? esc(d.label) + '<br><span class="muted">' + Math.round(d.weight * 100) + '% · ' + (d.score === null ? '—' : d.score) + '</span>' : ''));
        tr.appendChild(el('td', null, esc(c.label) + '<span class="muted"> · ' + Math.round(c.w * 100) + '%</span>' +
          (c.note ? '<br><span class="muted">' + esc(c.note) + '</span>' : '')));
        tr.appendChild(el('td', null, esc(c.src)));
        tr.appendChild(el('td', null, esc(c.kind) + (c.provisional ? '<span class="tag prov">voorlopig</span>' : '')));
        tr.appendChild(el('td', null, c.value === null ? '—' : c.value));
        const td = el('td');
        const inp = el('input', 'ovr'); inp.type = 'number'; inp.min = 0; inp.max = 100;
        inp.value = state.coach[c.id] === undefined ? '' : state.coach[c.id];
        inp.onchange = () => {
          const v = inp.value === '' ? undefined : Math.max(0, Math.min(100, Number(inp.value)));
          if (v === undefined) delete state.coach[c.id]; else state.coach[c.id] = v;
          save(); render();
        };
        td.appendChild(inp); tr.appendChild(td);
        t.appendChild(tr);
      });
    });
    const sc = el('div', 'tscroll'); sc.appendChild(t);
    tb.appendChild(sc);
    root.appendChild(tb);

    // contextvragen
    const ctx = el('div', 'card tight');
    ctx.appendChild(el('div', 'eyebrow', 'Contextvragen — bewust zonder punten'));
    const ul = el('ul'); ul.style.margin = '0'; ul.style.paddingLeft = '18px'; ul.style.color = 'var(--ink-2)';
    Scoring.CONTEXT_QUESTIONS.forEach((c) => ul.appendChild(el('li', null, '<b>' + esc(c.src) + '</b> — ' + esc(c.use))));
    ctx.appendChild(ul);
    root.appendChild(ctx);

    // notities
    const nt = el('div', 'card');
    nt.appendChild(el('div', 'eyebrow', 'Sessienotities'));
    const ta = el('textarea'); ta.style.minHeight = '120px'; ta.value = state.notes || '';
    ta.oninput = () => { state.notes = ta.value; save(); };
    nt.appendChild(ta);
    root.appendChild(nt);
  }

  function assessment(r) {
    const a = state.answers;
    const low = [];
    Scoring.DIM_ORDER.forEach((k) => { const d = r.dims[k]; if (d.score !== null && d.score < 50) low.push(d.label.toLowerCase() + ' ' + d.score); });
    const fact = [];
    if (a.q23) fact.push('Noemt zelf “' + esc(a.q23) + '” als grootste blokkade.');
    if (a.q25_s) fact.push('Bereidheid ' + esc(a.q25_s) + '/10.');
    if (a.q4_s) fact.push('Geeft het eigen leven een ' + esc(a.q4_s) + '/10.');
    if (a.q17_n !== undefined) fact.push('Beweegt ' + esc(a.q17_n) + ' dag(en) per week.');

    const signal = [];
    if (low.length) signal.push('Onder de 50: ' + low.join(', ') + '.');
    if (r.capApplied) signal.push('Motivatie ligt hoger dan draagvermogen (ruw ' + r.totalRaw + ' → ' + r.total + ').');
    r.flags.filter((f) => f.level === 'hoog').forEach((f) => signal.push(f.text));

    const hyp = [];
    if (r.clientView.aligned === false) hyp.push('Wat de klant als oorzaak benoemt (' + esc(r.clientView.claimed) +
      ') is mogelijk een gevolg. Het model wijst naar ' + esc(r.clientView.modelLabel).toLowerCase() + '.');
    if (r.dims.S.score !== null && r.dims.D.score !== null && r.dims.S.score + 10 < r.dims.D.score)
      hyp.push('Mogelijk geen disciplineprobleem maar een inrichtingsprobleem.');
    if (r.foundationIndex < 45 && r.dims.C.score >= 75) hyp.push('Risico op te veel tegelijk starten.');
    if (!hyp.length) hyp.push('Geen scherpe tegenstrijdigheid in de data. Beeld lijkt intern consistent.');

    const ver = [];
    r.components.filter((c) => c.answered && c.provisional).slice(0, 5)
      .forEach((c) => ver.push(esc(c.label) + ' (' + esc(c.src) + ')'));
    const verTxt = ver.length ? 'Nog te valideren in de eerste sessie: ' + ver.join(', ') + '.'
      : 'Alle componenten zijn gevalideerd.';

    const dec = r.focus
      ? 'Start bij <b>' + esc(r.focus.component || r.focus.dimLabel) + '</b> (' + esc(r.focus.dimLabel).toLowerCase() + '). ' +
        esc(r.focus.reason) + ' Eén spoor, twee weken, daarna herijken.'
      : 'Onvoldoende data voor een focusbepaling.';

    return [
      ['1. Fact', fact.length ? fact.join(' ') : '—'],
      ['2. Signal', signal.length ? signal.join(' ') : 'Geen opvallende uitschieters.'],
      ['3. Hypothese', hyp.join(' ')],
      ['4. Verification', verTxt],
      ['5. Decision', dec]
    ];
  }

  /* ================================================================ ROUTER */

  function render() {
    document.querySelectorAll('.top-nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === state.view));
    if (state.view === 'intake') renderIntake();
    else if (state.view === 'client') renderClient();
    else renderCoach();
  }

  window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.top-nav button').forEach((b) => {
      if (b.dataset.view) b.onclick = () => { state.view = b.dataset.view; save(); render(); window.scrollTo(0, 0); };
    });
    $('#demo').onclick = () => {
      state.answers = demoAnswers(); state.coach = {}; state.submitted = true; state.step = 4;
      state.history = [{ label: 'Start', date: new Date().toISOString().slice(0, 10), total: result().total }];
      state.view = 'client'; save(); render();
    };
    $('#reset').onclick = () => {
      if (!confirm('Alle ingevulde antwoorden wissen?')) return;
      state = { answers: {}, coach: {}, notes: '', history: [], step: 0, view: 'intake', submitted: false };
      save(); render();
    };
    render();
  });

  /* Demoprofiel = het voorbeeld uit sectie 15 van de briefing:
     klant zegt "discipline", data wijst naar structuur. */
  function demoAnswers() {
    return {
      q1: 29, q2: 'Alleen', q3: 'Fulltime IT-consultant, 45 uur per week, veel reistijd.',
      q4_s: 6, q4_t: 'Op papier gaat het prima maar ik voel me niet in controle.',
      q5_1: 'Mijn werk gaat goed', q5_2: 'Ik ben er voor mijn familie', q5_3: 'Ik geef niet snel op',
      q6_1: 'Mijn slaap', q6_2: 'Sporten', q6_3: 'Minder op mijn telefoon',
      q7: 'Mijn discipline', q8: 'Op tijd naar bed en s ochtends sporten',
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
      q22: 'Mijn gezondheid serieuzer nemen.',
      q23: 'Discipline & volhouden',
      q24: 'Ik word bijna 30 en ik wil niet over vijf jaar nog op dit punt staan.',
      q25_s: 8, q25_t: 'Ik wil er echt voor gaan en meer discipline opbrengen.'
    };
  }
})();
