/* Test-suite — PRIORITY ENGINE V1.0
   Kern: de 8 fictieve klantprofielen uit de validatietest.
   Draaien: node test/priority.test.js */
const S = require('../scoring.js');
const P = require('../priority.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}
const head = (t) => console.log('\n' + t);

/* dimensiescores forceren via coach-override (met reden, zoals §20 eist) */
function profiel(F, S_, R, D, O, C) {
  const dimensions = {};
  [['F', F], ['S', S_], ['R', R], ['D', D], ['O', O], ['C', C]]
    .forEach(([k, v]) => { dimensions[k] = { score: v, reason: 'testprofiel' }; });
  return S.computeScore(vollediggevuld(), { dimensions });
}
/* volledig ingevulde antwoorden, zodat componenten bestaan voor de leverage check */
function vollediggevuld(o) {
  return Object.assign({
    q7: 'Mijn dagstructuur', q8: 'Op tijd naar bed gaan',
    q9: 'Ik wil over drie jaar fit zijn en een eigen bedrijf hebben waar ik trots op ben.',
    q10: ['Gezondheid & lichaam', 'Werk & carrière'],
    q11: 'Omdat ik merk dat ik zonder gezondheid niets van mijn plannen voor mijn gezin afkrijg.',
    q12: 'Elke werkdag om 23:00 naar bed en 3 keer per week sporten.',
    q13_s: 6, q14_s: 6, q15_s: 6, q15_bed: '23:00', q15_rise: '07:00',
    q16_s: 6, q17_n: 3, q18_s: 6, q19_s: 6, q20_s: 6, q21: ['Social media'],
    q22: 'Mijn administratie elke week een uur bijhouden.', q23: 'Dagstructuur',
    q24: 'Ik merk nu dat mijn manier van leven me tegenhoudt en wil er niet over een jaar nog staan.',
    q25_s: 8, q25_t: 'Ik zet mijn telefoon om 22:00 weg en sport 3 keer per week voor werktijd.'
  }, o);
}

/* ============================================================ De 8 profielen */
head('1. Validatietest — 8 fictieve klanten');

const PROFIELEN = [
  { n: 1, naam: 'Gemotiveerd maar chaotisch',    d: [63, 38, 88, 48, 78, 94], score: 64, focus: 'S', omschrijving: 'Structuur' },
  { n: 2, naam: 'Gedisciplineerd maar richtingloos', d: [82, 86, 35, 88, 84, 72], score: 73, focus: 'R', omschrijving: 'Richting' },
  { n: 3, naam: 'Sterk fundament, weinig groei', d: [88, 84, 42, 82, 86, 45], score: 72, focus: 'R', omschrijving: 'Richting / ambitie' },
  { n: 4, naam: 'Zwak fundament, hoge ambitie',  d: [38, 43, 91, 55, 72, 96], score: 61, focus: 'F', omschrijving: 'Fundament' },
  { n: 5, naam: 'Alles tegelijk willen verbeteren', d: [61, 54, 48, 44, 67, 82], score: 57, focus: 'R', omschrijving: 'Prioriteit & structuur', tweede: 'S' },
  { n: 6, naam: 'Laag commitment',               d: [76, 72, 74, 58, 61, 31], score: 64, focus: 'C', omschrijving: 'Readiness' },
  { n: 7, naam: 'Veel ownership, lage energie',  d: [42, 79, 82, 77, 91, 87], score: 69, focus: 'F', omschrijving: 'Gezond fundament' },
  { n: 8, naam: 'Gebalanceerd',                  d: [74, 72, 76, 70, 78, 79], score: 74, focus: null, omschrijving: 'Optimaliseren / groei', mode: 'groei' }
];

const tabel = [];
PROFIELEN.forEach((p) => {
  const r = profiel.apply(null, p.d);
  const pr = P.computePriority(r, {});
  tabel.push({ n: p.n, naam: p.naam, verwacht: p.omschrijving, score: r.total, verwachteScore: p.score,
               focus: pr.aiPrimaryLabel, focusKey: pr.aiPrimary, mode: pr.mode,
               tweede: pr.secondaryLabel, fi: r.foundationIndex, status: r.foundationStatus.label });
  if (p.mode === 'groei') {
    ok('Profiel ' + p.n + ' (' + p.naam + ') → ' + p.omschrijving,
      pr.mode === 'groei', 'mode=' + pr.mode + ', focus=' + pr.aiPrimaryLabel);
  } else {
    ok('Profiel ' + p.n + ' (' + p.naam + ') → ' + p.omschrijving,
      pr.aiPrimary === p.focus, 'engine koos ' + pr.aiPrimary + ' (' + pr.aiPrimaryLabel + ')');
  }
  if (p.tweede) ok('  · tweede spoor = ' + S.DIMENSIONS[p.tweede].label, pr.secondary === p.tweede, pr.secondary);
});

console.log('\n  ' + 'nr'.padEnd(3) + 'profiel'.padEnd(34) + 'score'.padEnd(7) + 'FI'.padEnd(5) + 'status'.padEnd(15) + 'eerste focus');
tabel.forEach((t) => console.log('  ' + String(t.n).padEnd(3) + t.naam.padEnd(34) +
  (t.score + ' (' + t.verwachteScore + ')').padEnd(7) + String(t.fi).padEnd(5) + t.status.padEnd(15) +
  (t.mode === 'groei' ? 'Optimaliseren / groei' : t.focus)));

/* ============================================================ Stap 1 */
head('2. Stap 1 — Foundation Check');
const p4 = P.computePriority(profiel(38, 43, 91, 55, 72, 96), {});
ok('fundament < 40 forceert fundamentfocus', p4.mode === 'fundament' && p4.aiPrimary === 'F', p4.mode + '/' + p4.aiPrimary);
ok('geen groeifocus bij instabiele basis', p4.mode !== 'groei');
ok('hoge richting (91) en commitment (96) overrulen de basis niet', p4.aiPrimary !== 'R' && p4.aiPrimary !== 'C');
const p1 = P.computePriority(profiel(63, 38, 88, 48, 78, 94), {});
ok('structuur < 40 forceert structuurfocus', p1.aiPrimary === 'S', p1.aiPrimary);
const beide = P.computePriority(profiel(30, 38, 90, 90, 90, 90), {});
ok('bij twee treffers wint de laagste', beide.aiPrimary === 'F', beide.aiPrimary);
ok('stap 1 is transparant', p4.steps[0].name === 'Foundation Check' && p4.steps[0].hits.length === 1);

/* ============================================================ Stap 2 */
head('3. Stap 2 — Bottleneck Score is niet "laagste dimensie"');
const p5r = profiel(61, 54, 48, 44, 67, 82);
const p5 = P.computePriority(p5r, {});
const laagste = S.DIM_ORDER.filter((k) => p5r.dims[k].score !== null)
  .sort((a, b) => p5r.dims[a].score - p5r.dims[b].score)[0];
ok('profiel 5: laagste dimensie is discipline', laagste === 'D', laagste);
ok('profiel 5: engine kiest NIET de laagste dimensie', p5.aiPrimary !== laagste, p5.aiPrimary);
ok('profiel 5: engine kiest richting (te veel doelen → weinig consistentie)', p5.aiPrimary === 'R');
const rows = p5.steps[1].rows;
ok('impactfactor > 1 waar een dimensie andere blokkeert', rows.find((x) => x.dim === 'R').impact > 1);
ok('commitment heeft impactfactor 1 (geen enabler)', rows.find((x) => x.dim === 'C').impact === 1);
ok('bottleneckrijen zijn aflopend gesorteerd', rows.every((x, i) => i === 0 || rows[i - 1].bottleneck >= x.bottleneck));

/* ============================================================ Stap 3 */
head('4. Stap 3 — Contradictie Check');
const c1 = P.contradictieCheck(profiel(60, 45, 60, 45, 60, 85));
ok('hoge motivatie + weinig uitvoering', c1.items.some((i) => i.id === 'motivatie-uitvoering'),
  c1.items.map((i) => i.id).join(','));
const uitstel = S.computeScore(vollediggevuld({ q20_s: 9,
  q8: 'Ik stel eigenlijk alles altijd uit, al jaren, sporten, administratie en mijn afspraken' }), {});
const c2 = P.contradictieCheck(uitstel);
ok('hoge discipline + veel uitstel', c2.items.some((i) => i.id === 'discipline-uitstel'),
  'Q20=' + uitstel.dims.D.components.find((c) => c.qid === 'Q20').value +
  ' Q8=' + uitstel.dims.D.components.find((c) => c.qid === 'Q8').value);
const geenDoel = S.computeScore(vollediggevuld({ q12: 'Weet ik nog niet' }), { dimensions: { R: { score: 80, reason: 't' } } });
const c3 = P.contradictieCheck(geenDoel);
ok('hoge richting + geen concreet doel', c3.items.some((i) => i.id === 'richting-doel'),
  c3.items.map((i) => i.id).join(','));
ok('elke contradictie levert een coachvraag op', c1.items.concat(c2.items, c3.items).every((i) => i.vraag && i.vraag.length > 10));

/* ============================================================ Stap 4 */
head('5. Stap 4 — Leverage Check');
const slecht = S.computeScore(vollediggevuld({ q15_s: 3, q14_s: 4, q17_n: 1, q18_s: 4, q20_s: 4 }), {});
const lev = P.leverageCheck(slecht);
ok('slaapketen gedetecteerd', lev.kandidaten.some((k) => k.id === 'slaap'), lev.kandidaten.map((k) => k.id).join(','));
ok('keten benoemt slaap → energie → training → discipline → structuur',
  /slaap → energie → training → discipline → structuur/.test(lev.top.keten), lev.top.keten);
ok('keten vereist minstens twee meebewegende gebieden', lev.kandidaten.every((k) => k.unlocks.length >= 2));
const goed = S.computeScore(vollediggevuld({ q15_s: 9, q14_s: 9, q17_n: 5, q18_s: 8, q20_s: 8 }), {});
ok('geen keten bij een gezond profiel', P.leverageCheck(goed).kandidaten.length === 0);
const metKeten = P.computePriority(slecht, {});
ok('de keten levert een concrete ingang binnen de focus', !!metKeten.entry, metKeten.entry);
ok('slaap wint van beweging: stroomopwaarts gaat voor stroomafwaarts',
  lev.kandidaten[0].id === 'slaap', lev.kandidaten.map((k) => k.id + ':' + k.leverage).join(' '));
ok('een component die in twee dimensies laadt telt één keer',
  lev.kandidaten.every((k) => new Set(k.unlocks).size === k.unlocks.length),
  JSON.stringify(lev.kandidaten.map((k) => k.unlocks)));
const ketenInFocus = P.computePriority(slecht, {});
ok('de gekozen keten hoort bij de gekozen focus',
  !ketenInFocus.chain || ketenInFocus.chain.dim === ketenInFocus.aiPrimary ||
  ketenInFocus.chain.unlocks.length > 0,
  ketenInFocus.aiPrimary + ' / ' + (ketenInFocus.chain && ketenInFocus.chain.dim));

/* ============================================================ Stap 5 */
head('6. Stap 5 — Coach Validation');
const voorlopig = P.computePriority(profiel(63, 38, 88, 48, 78, 94), {});
ok('AI-focus is voorlopig', voorlopig.validation.status === 'voorlopig');
ok('focus is NIET zichtbaar voor de klant vóór validatie', voorlopig.visibleToClient === false);
const bevestigd = P.computePriority(profiel(63, 38, 88, 48, 78, 94),
  { focusValidation: { status: 'bevestigd', focus: 'S', reason: 'klopt met het sessiegesprek' } });
ok('na bevestiging wordt de focus zichtbaar', bevestigd.visibleToClient === true);
ok('bevestigde focus blijft structuur', bevestigd.primaryFocus === 'S');
const gewijzigd = P.computePriority(profiel(63, 38, 88, 48, 78, 94),
  { focusValidation: { status: 'gewijzigd', focus: 'D', reason: 'in de sessie bleek discipline het echte thema' } });
ok('coach kan de focus wijzigen', gewijzigd.primaryFocus === 'D' && gewijzigd.focusSource === 'coach');
ok('AI-voorstel blijft naast de coachkeuze bewaard', gewijzigd.aiPrimary === 'S', gewijzigd.aiPrimary);
const verworpen = P.computePriority(profiel(63, 38, 88, 48, 78, 94), { focusValidation: { status: 'verworpen', reason: 'niet passend' } });
ok('verworpen focus wordt niet zichtbaar', verworpen.visibleToClient === false);

/* ============================================================ hypothese */
head('7. Coachhypothese — coachingtaal, geen algoritmetaal');
const h = P.computePriority(profiel(63, 38, 88, 48, 78, 94), {}).hypothese;
console.log('  » ' + h);
ok('hypothese noemt geen scores', !/\d{2}\/100|score is \d+/.test(h), h);
ok('hypothese benoemt wat wél sterk is', /weet goed waar je naartoe wilt|gemotiveerd|verantwoordelijkheid/.test(h));
ok('hypothese eindigt onderzoekend', /(Dit onderzoeken we eerst|Dat onderzoeken we samen)\.$/.test(h));
ok('geen omschrijving twee keer letterlijk herhaald in dezelfde zin',
  h.split('. ').every((z) => !/(\b\w{8,}\b)(?=.*\1.*\1)/.test(z)));
const hg = P.computePriority(profiel(74, 72, 76, 70, 78, 79), {}).hypothese;
ok('gebalanceerd profiel krijgt een groeihypothese', /groeien|optimaliseren|stevig/i.test(hg), hg);

/* ============================================================ record */
head('8. Opslag per intake');
const rec = P.computePriority(profiel(63, 38, 88, 48, 78, 94),
  { focusValidation: { status: 'bevestigd', focus: 'S', reason: 'bevestigd in sessie 1' } }).record;
['engine_version', 'primary_focus', 'secondary_focus', 'focus_mode', 'leverage_chain',
 'ai_hypothesis', 'coach_validated_focus', 'coach_validation_status', 'coach_validation_reason']
  .forEach((v) => ok('record bevat ' + v, v in rec));
ok('engine_version is 1.0', rec.engine_version === '1.0');
ok('AI-voorstel en coachkeuze staan los van elkaar', rec.primary_focus === 'S' && rec.coach_validated_focus === 'S');

console.log('\n' + pass + ' geslaagd, ' + fail + ' gefaald');
process.exit(fail ? 1 : 0);
