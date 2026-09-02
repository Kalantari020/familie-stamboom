/* Test-suite scoring engine — geen dependencies. Draaien: node test/scoring.test.js */
const S = require('../scoring.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}
function head(t) { console.log('\n' + t); }

/* ------------------------------------------------ structurele invarianten */
head('1. Modelinvarianten');
const sums = {};
S.COMPONENTS.forEach((c) => { sums[c.dim] = (sums[c.dim] || 0) + c.w; });
S.DIM_ORDER.forEach((k) => ok('componentgewichten ' + k + ' = 1.00', Math.abs(sums[k] - 1) < 1e-9, sums[k]));
ok('dimensiegewichten = 1.00',
  Math.abs(S.DIM_ORDER.reduce((s, k) => s + S.DIMENSIONS[k].weight, 0) - 1) < 1e-9);
ok('fundamentindex-gewichten = 1.00',
  Math.abs(Object.values(S.FOUNDATION_INDEX).reduce((a, b) => a + b, 0) - 1) < 1e-9);
ok('schaal 1 -> 0', S.scale10(1) === 0);
ok('schaal 10 -> 100', S.scale10(10) === 100);
ok('lege intake crasht niet en geeft 0', S.computeScore({}).total === 0);

/* ------------------------------------------------ helper om profielen te bouwen */
function profiel(o) {
  return Object.assign({
    q1: 32, q2: 'Alleen', q3: 'Fulltime kantoorbaan, 40 uur.',
    q4_s: 6, q4_t: 'Gaat wel, maar ik loop op halve kracht.',
    q5_1: 'Mijn baan', q5_2: 'Mijn vriendengroep', q5_3: 'Ik geef niet snel op',
    q6_1: 'Slaap', q6_2: 'Sporten', q6_3: 'Focus',
    q7: 'Mijn dagstructuur', q8: 'Op tijd naar bed gaan',
    q9: 'Ik wil over drie jaar een lichaam en een ritme hebben waar ik trots op ben en een baan die past.',
    q10: ['Gezondheid & lichaam', 'Mentale kracht & discipline', 'Werk & carrière'],
    q11: 'Omdat ik merk dat ik zonder gezondheid en ritme niets van mijn plannen afkrijg.',
    q12: 'Elke werkdag om 23:00 naar bed en 3 keer per week sporten.',
    q13_s: 6, q14_s: 6, q15_s: 6, q15_bed: '23:00', q15_rise: '07:00',
    q16_s: 6, q17_n: 3, q18_s: 6, q19_s: 6, q20_s: 6,
    q21: ['Social media'], q22: 'Mijn administratie elke week een uur bijhouden.',
    q23: 'Dagstructuur',
    q24: 'Ik ben 32 en merk dat ik elk jaar hetzelfde voorneem en het niet doe.',
    q25_s: 8, q25_t: 'Ik zet mijn telefoon vanaf 22:00 in een andere kamer en sport 3x per week voor werktijd.'
  }, o);
}

/* ------------------------------------------------ sectie 19: fundament mag niet gemaskeerd worden */
head('2. Foundation floor (briefing sectie 19)');
const ambitieus = profiel({
  q13_s: 3, q14_s: 3, q15_s: 3, q15_bed: '02:00', q15_rise: '07:00', q16_s: 3, q17_n: 0,
  q18_s: 3, q19_s: 3, q20_s: 3, q21: ['Social media', 'Gamen', 'Netflix / streaming', 'YouTube'],
  q25_s: 9,
  q9: 'Ik wil over drie jaar financieel vrij zijn, een eigen bedrijf runnen en in de beste vorm van mijn leven zijn.',
  q11: 'Omdat ik niet wil eindigen zoals de mensen om me heen die het hebben opgegeven.',
  q12: 'Mijn omzet verdubbelen en 10 kilo spiermassa erbij.'
});
const rA = S.computeScore(ambitieus);
console.log('     ruw ' + rA.totalRaw + ' → gecapt ' + rA.total + ' | FI ' + rA.foundationIndex + ' | level ' + rA.level.level);
ok('foundation floor grijpt in', rA.capApplied, 'ruw ' + rA.totalRaw + ' vs ' + rA.total);
ok('totaal blijft binnen FI + 15', rA.total <= rA.foundationIndex + S.CAP_MARGIN);
ok('hoge commitment vertaalt niet naar hoog level', rA.level.level === 1, 'level ' + rA.level.level);
ok('commitment-dimensie is wel hoog', rA.dims.C.score >= 70, rA.dims.C.score);
ok('flag commitment-gap gezet', rA.flags.some((f) => f.type === 'commitment-gap'));
ok('flag foundation-floor gezet', rA.flags.some((f) => f.type === 'foundation-floor'));

/* ------------------------------------------------ sectie 15: discipline of structuur? */
head('3. Klant vs. coach (briefing sectie 15/16)');
const disciplineClaim = profiel({
  q15_s: 5, q15_bed: '01:30', q15_rise: '07:00', q18_s: 4, q19_s: 5, q20_s: 6,
  q21: ['Social media', 'YouTube', 'Gamen'],
  q10: ['Gezondheid & lichaam', 'Werk & carrière', 'Geld & financiële vrijheid', 'Persoonlijke ontwikkeling'],
  q23: 'Discipline & volhouden', q25_s: 8, q7: 'Mijn discipline'
});
const rD = S.computeScore(disciplineClaim);
console.log('     klant zegt: ' + rD.clientView.claimed + ' | model wijst: ' + rD.clientView.modelLabel);
ok('klant claimt discipline', rD.clientView.claimedDim === 'D');
ok('model wijst niet naar discipline', rD.clientView.modelDim !== 'D', rD.clientView.modelDim);
ok('verschil klant/coach gedetecteerd', rD.clientView.aligned === false);
ok('structuur scoort onder discipline', rD.dims.S.score < rD.dims.D.score, rD.dims.S.score + ' vs ' + rD.dims.D.score);
ok('flag structuur-vs-discipline gezet', rD.flags.some((f) => f.type === 'structuur-vs-discipline'));

/* ------------------------------------------------ enabler-override slaap */
head('4. Hefboombepaling');
const slecteSlaap = profiel({ q15_s: 2, q15_bed: '03:00', q15_rise: '07:00' });
const rS = S.computeScore(slecteSlaap);
ok('slaap onder 40 wint altijd', rS.focus.override === 'enabler-slaap', JSON.stringify(rS.focus.component));
const rBase = S.computeScore(profiel({}));
ok('zonder override komt hefboom uit de ranking', !rBase.focus.override);
ok('hefboom benoemt een concrete component', !!rBase.focus.component, rBase.focus.component);
ok('ranking is aflopend', rBase.focus.ranking.every((x, i, arr) => i === 0 || arr[i - 1].leverage >= x.leverage));

/* ------------------------------------------------ zelfbeeld-kalibratie */
head('5. Zelfbeeld-kalibratie (V4 zonder punten)');
const overschat = S.computeScore(profiel({
  q4_s: 9, q13_s: 3, q14_s: 3, q15_s: 3, q15_bed: '02:00', q15_rise: '06:30', q16_s: 3, q17_n: 0,
  q18_s: 3, q19_s: 3, q20_s: 3
}));
ok('overschatting gedetecteerd', overschat.flags.some((f) => f.type === 'zelfbeeld' && /boven/.test(f.text)));
const zonderV4 = Object.assign(profiel({}), { q4_s: '' });
const metV4 = profiel({ q4_s: 2 });
ok('V4 levert geen punten op', S.computeScore(zonderV4).total === S.computeScore(metV4).total,
  S.computeScore(zonderV4).total + ' vs ' + S.computeScore(metV4).total);

/* ------------------------------------------------ contextvragen leveren geen punten */
head('6. Contextvragen zijn scoreneutraal');
const base = profiel({});
['q1', 'q2', 'q3', 'q6_1', 'q6_2', 'q6_3'].forEach((f) => {
  const changed = Object.assign({}, base); changed[f] = (f === 'q1' ? 64 : 'volledig andere waarde');
  ok(f + ' beinvloedt de score niet', S.computeScore(changed).total === S.computeScore(base).total);
});

/* ------------------------------------------------ coach-override */
head('7. Coach-validatie');
const metOverride = Object.assign(profiel({}), { __coach: { d_uitstel: 20 } });
const rO = S.computeScore(metOverride);
ok('coach-override verlaagt discipline', rO.dims.D.score < rBase.dims.D.score, rO.dims.D.score + ' vs ' + rBase.dims.D.score);
ok('override haalt provisional-vlag weg', !rO.components.find((c) => c.id === 'd_uitstel').provisional);

/* ------------------------------------------------ monotonie */
head('8. Monotonie en grenzen');
const laag = profiel({ q13_s: 1, q14_s: 1, q15_s: 1, q16_s: 1, q17_n: 0, q18_s: 1, q19_s: 1, q20_s: 1, q25_s: 1,
  q15_bed: '03:00', q15_rise: '06:00', q21: ['Social media', 'Gamen', 'Netflix / streaming', 'YouTube', 'Telefoon algemeen'] });
const hoog = profiel({ q13_s: 10, q14_s: 10, q15_s: 10, q16_s: 10, q17_n: 6, q18_s: 10, q19_s: 10, q20_s: 10, q25_s: 10,
  q15_bed: '22:30', q15_rise: '06:30', q21: [] });
const rL = S.computeScore(laag), rH = S.computeScore(hoog);
console.log('     laag ' + rL.total + ' (level ' + rL.level.level + ') | hoog ' + rH.total + ' (level ' + rH.level.level + ')');
ok('laag profiel < hoog profiel', rL.total < rH.total);
ok('scores binnen 0-100', [rL, rH, rBase].every((r) => r.total >= 0 && r.total <= 100));
ok('sterk profiel bereikt minimaal level 3', rH.level.level >= 3, 'level ' + rH.level.level);
ok('zwak profiel blijft level 1', rL.level.level === 1);
let prev = -1, mono = true;
for (let v = 1; v <= 10; v++) { const t = S.computeScore(profiel({ q13_s: v, q14_s: v, q15_s: v, q16_s: v, q18_s: v, q19_s: v, q20_s: v })).total;
  if (t < prev) mono = false; prev = t; }
ok('totaal stijgt monotoon met de fundamentcijfers', mono);

/* ------------------------------------------------ indicatoren zijn geen knoppen */
head('9. Focus wijst naar een knop, niet naar een indicator');
const nonAct = S.COMPONENTS.filter((c) => c.actionable === false).map((c) => c.id);
ok('indicatoren gemarkeerd', nonAct.length >= 4, nonAct.join(', '));
[laag, disciplineClaim, ambitieus, profiel({})].forEach((p, i) => {
  const f = S.computeScore(p).focus;
  const comp = S.COMPONENTS.find((c) => c.label === f.component);
  ok('profiel ' + (i + 1) + ': focus is actionable', !comp || comp.actionable !== false,
    f.component + ' (' + f.dimLabel + ')');
});

// Briefing sectie 30: bij slechte slaap + slechte structuur begint de coaching
// bij slaap/ochtendstructuur, niet bij het laagste losse cijfer.
const sectie30 = profiel({
  q13_s: 5, q14_s: 4, q15_s: 5, q15_bed: '01:30', q15_rise: '07:00', q16_s: 5, q17_n: 1,
  q18_s: 4, q19_s: 5, q20_s: 6, q21: ['Social media', 'YouTube', 'Telefoon algemeen'],
  q23: 'Discipline & volhouden', q7: 'Mijn discipline', q12: 'Meer discipline krijgen', q25_s: 8
});
const r30 = S.computeScore(sectie30);
ok('slecht slapende klant krijgt slaap als eerste focus', r30.focus.component === 'Slaap',
  r30.focus.dimLabel + ' -> ' + r30.focus.component);
ok('niet de laagste losse component (beweging 25)', r30.focus.component !== 'Beweging');

/* ------------------------------------------------ niet ingevuld != slecht ingevuld */
head('10. Niet ingevuld is geen nulscore');
ok('lege open vraag levert null', S.autoRubric('') === null);
ok('lege open vraag levert null (spaties)', S.autoRubric('   ') === null);
const zonderDoel = Object.assign(profiel({}), { q12: '' });
const cZonder = S.computeScore(zonderDoel).components.find((c) => c.id === 'r_doel');
ok('component telt niet mee als hij leeg is', cZonder.answered === false && cZonder.value === null);
ok('dimensie herweegt over de ingevulde componenten', S.computeScore(zonderDoel).dims.R.coverage === 70,
  S.computeScore(zonderDoel).dims.R.coverage);
const vaagDoel = S.computeScore(profiel({ q12: 'Meer discipline krijgen' })).components.find((c) => c.id === 'r_doel');
ok('vaag antwoord telt wel mee maar scoort laag', vaagDoel.answered && vaagDoel.value > 0 && vaagDoel.value < 20,
  String(vaagDoel.value));
ok('leeglaten mag niet lonen t.o.v. vaag antwoord',
  S.computeScore(zonderDoel).dims.R.score >= S.computeScore(profiel({ q12: 'Meer discipline krijgen' })).dims.R.score);

console.log('\n' + pass + ' geslaagd, ' + fail + ' gefaald');
process.exit(fail ? 1 : 0);
