/* Test-suite — COACHING ENGINE V1.0 (sessie 1, check-in, Progress Score) */
const S = require('../scoring.js');
const P = require('../priority.js');
const C = require('../coaching.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}
const head = (t) => console.log('\n' + t);

const INTAKE = {
  q7: 'Mijn discipline', q8: 'Op tijd naar bed gaan en sporten, dat lukt al jaren niet',
  q9: 'Ik wil over drie jaar fit zijn en een eigen bedrijf hebben.',
  q10: ['Gezondheid & lichaam', 'Werk & carrière'], q11: 'Omdat ik onder mijn niveau leef.',
  q12: 'Meer discipline krijgen', q13_s: 5, q14_s: 4, q15_s: 5, q15_bed: '01:30', q15_rise: '07:00',
  q16_s: 5, q17_n: 1, q18_s: 4, q19_s: 5, q20_s: 6,
  q21: ['Social media', 'YouTube', 'Telefoon algemeen'], q21_t: 'Vaak 4 tot 5 uur per dag op mijn telefoon.',
  q22: 'Mijn gezondheid serieuzer nemen.', q23: 'Discipline & volhouden',
  q24: 'Ik word bijna 30 en wil niet over een jaar nog op dit punt staan.',
  q25_s: 8, q25_t: 'Ik wil er echt voor gaan.'
};

/* ============================================================ Sessie 1 */
head('1. Sessie 1 — van inzicht naar focus');
const r = S.computeScore(INTAKE, {});
const prio = P.computePriority(r, {});
const gids = C.sessieGids(INTAKE, r, prio);

ok('zes blokken', gids.blokken.length === 6, gids.blokken.length);
ok('duur is 40 minuten', gids.duur === 40, gids.duur);
ok('blokken in de juiste volgorde',
  gids.blokken.map((b) => b.id).join(',') === 'opening,reality,bottleneck,focus,commitment,afsluiting');
ok('opening begint bij de persoon, niet bij de score',
  /wat valt jou zelf het meest op/i.test(gids.blokken[0].vragen.join(' ')) &&
  !/score|\d+\/100/i.test(gids.blokken[0].vragen.join(' ')));
ok('reality check gebruikt de eigen antwoorden van de klant',
  gids.blokken[1].vragen.some((v) => /Discipline & volhouden/.test(v)), gids.blokken[1].vragen.join(' | ').slice(0, 120));
ok('reality check toont maximaal 3 patronen', gids.blokken[1].vragen.length <= 3, gids.blokken[1].vragen.length);
ok('bottleneckblok stelt de kernvraag',
  /Wat maakt het momenteel moeilijk voor jou/.test(gids.blokken[2].vragen[0]));
ok('bottleneckblok citeert wat hij uitstelt',
  gids.blokken[2].vragen.some((v) => /Op tijd naar bed gaan/.test(v)));
ok('focusblok bevat de hypothese', /lijkt|aandacht nodig/.test(gids.blokken[3].vragen.join(' ')));
ok('focusblok vraagt om herkenning, legt niet op',
  /Herken je dit\? En zo niet/.test(gids.blokken[3].vragen.join(' ')));
ok('commitmentblok vraagt naar bereidheid, geeft geen plan',
  /Wat ben jij bereid om deze week daadwerkelijk anders te doen/.test(gids.blokken[4].vragen.join(' ')));
ok('maximaal drie actievoorstellen', gids.actievoorstellen.length <= 3, gids.actievoorstellen.length);
ok('actievoorstellen passen bij de hefboom', gids.actievoorstellen.length > 0, gids.actievoorstellen.join(' | '));
ok('afsluiting benoemt de leercyclus',
  /wat we daardoor over jou hebben geleerd/.test(gids.blokken[5].vragen.join(' ')));
console.log('  » focus: ' + prio.aiPrimaryLabel + ' | ingang: ' + prio.entry);
gids.actievoorstellen.forEach((a) => console.log('    · ' + a));

/* ============================================================ Check-in */
head('2. Wekelijkse check-in');
const week = (statussen, refl, ratings) => ({
  actions: statussen.map((s, i) => ({ text: 'actie ' + (i + 1), status: s })),
  reflection: refl || {}, ratings: ratings || {}
});

ok('completion 2 van 3 → 67%', C.actionCompletion(week(['done', 'done', 'none'])) === 67,
  C.actionCompletion(week(['done', 'done', 'none'])));
ok('gedeeltelijk telt half mee', C.actionCompletion(week(['done', 'partial', 'none'])) === 50,
  C.actionCompletion(week(['done', 'partial', 'none'])));
ok('drie statussen beschikbaar', Object.keys(C.STATUS).length === 3 &&
  C.STATUS.done.icon === '✅' && C.STATUS.partial.icon === '🟡' && C.STATUS.none.icon === '❌');
ok('drie reflectievragen', C.CHECKIN_VRAGEN.length === 3);
ok('derde vraag meet zelfinzicht', /over jezelf geleerd/.test(C.CHECKIN_VRAGEN[2].label));
ok('twee zelfbeoordelingscijfers', C.CHECKIN_CIJFERS.length === 2);

// het voorbeeld uit de briefing: "geen tijd" tegenover schermtijd
const ci = week(['done', 'done', 'none'],
  { goed: 'Mijn ochtendroutine werkt', obstakel: 'Ik had geen tijd, mijn avonden blijven chaotisch', geleerd: 'Ik plan mijn avonden niet' },
  { zorg: 6, afspraken: 7 });
const an = C.analyseCheckin(ci, INTAKE, [ci]);
console.log('  » completion ' + an.completion + '% · consistentie ' + an.consistentie);
an.checks.forEach((c) => console.log('    ⚠️ ' + c));
an.coachvragen.forEach((v) => console.log('    ? ' + v));
ok('action completion 67%', an.completion === 67, an.completion);
ok('positief patroon herkend', an.patronen.some((p) => /ochtendroutine/i.test(p)));
ok('obstakel herkend', an.obstakels.some((o) => /avonden/i.test(o)));
ok('⚠️ coach check: geen tijd versus schermtijd', an.checks.some((c) => /geen tijd/i.test(c)), an.checks.join(' | '));
ok('coachvraag over tijd versus schermtijd',
  an.coachvragen.some((v) => /Hoe verhouden die twee zich/.test(v)));
ok('coachvraag is een vraag, geen conclusie', an.coachvragen.every((v) => /\?$/.test(v.trim())));

const zelfOverschat = C.analyseCheckin(week(['none', 'none', 'done'], { geleerd: 'Weinig' }, { afspraken: 9 }), INTAKE, []);
ok('zelfbeoordeling boven uitvoering wordt gesignaleerd',
  zelfOverschat.checks.some((c) => /Zelfbeoordeling/.test(c)), zelfOverschat.checks.join(' | '));
const geenReflectie = C.analyseCheckin(week(['done'], {}), INTAKE, []);
ok('ontbrekende reflectie wordt gesignaleerd', geenReflectie.checks.some((c) => /zelfinzicht/.test(c)));
const alTop = C.analyseCheckin(week(['done', 'done'], { goed: 'Alles gedaan maar merkte geen verschil', geleerd: 'Onduidelijk' }), INTAKE, []);
ok('100% uitgevoerd zonder resultaat → aanpak ter discussie, niet de discipline',
  alTop.coachvragen.some((v) => /niet je discipline het probleem/.test(v)), alTop.coachvragen.join(' | '));

/* ============================================================ Progress Score */
head('3. Progress Score V1.0');
ok('vijf signalen met de juiste gewichten',
  C.SIGNAAL_ORDER.map((k) => C.PROGRESS_SIGNALEN[k].weight).join(',') === '0.3,0.25,0.2,0.15,0.1',
  C.SIGNAAL_ORDER.map((k) => C.PROGRESS_SIGNALEN[k].weight).join(','));
ok('gewichten tellen op tot 1,00',
  Math.abs(C.SIGNAAL_ORDER.reduce((s, k) => s + C.PROGRESS_SIGNALEN[k].weight, 0) - 1) < 1e-9);
ok('labels volgens specificatie',
  C.SIGNAAL_ORDER.map((k) => C.PROGRESS_SIGNALEN[k].label).join(' | ') ===
  'Gedrag & uitvoering | Consistentie | Doelvoortgang | Reflectie & zelfinzicht | Coachbeoordeling');

const kort = C.computeProgress({ startScore: 60, checkins: [week(['done']), week(['done'])] });
ok('geen score vóór 4 check-ins', kort.ready === false && kort.weekenNodig === 2, JSON.stringify(kort.weekenNodig));
ok('wel al een action completion zichtbaar', kort.completion === 100, kort.completion);
ok('geen score zonder uitvoeringsdata',
  C.computeProgress({ startScore: 60, checkins: [{}, {}, {}, {}] }).ready === false);

/* Voorbeeld 1 uit de briefing: startscore 58, completion 92% → Progress 67 */
const goedeReflectie = { goed: 'ochtendroutine werkt', obstakel: 'avonden', geleerd: 'Ik merk dat mijn avonden het grootste probleem zijn' };
const v1 = C.computeProgress({
  startScore: 58,
  // vier weken: 100%, 100%, 100%, 67% → gemiddeld 92%
  checkins: [week(['done', 'done', 'done'], goedeReflectie), week(['done', 'done', 'done'], goedeReflectie),
             week(['done', 'done', 'done'], goedeReflectie), week(['done', 'done', 'none'], goedeReflectie)],
  goalProgress: 55, coachRating: { score: 60, reason: 'uitvoering is sterk, inzicht groeit' }
});
console.log('  » voorbeeld 1: start 58 · completion ' + v1.completion + '% · index ' + v1.ontwikkelingsindex + ' → ' + v1.score);
ok('voorbeeld 1: completion ligt rond 92%', v1.completion >= 88 && v1.completion <= 95, v1.completion);
ok('voorbeeld 1: Progress Score = 67', v1.score === 67, v1.score);
ok('voorbeeld 1: lage start met sterke uitvoering geeft duidelijke stijging', v1.delta >= 8, v1.delta);

/* Voorbeeld 2: startscore 75, completion 35% → Progress 72 */
const zwak = { goed: 'weinig', obstakel: 'geen tijd', geleerd: 'Ik onderschat hoeveel mijn werk vraagt van mijn avonden' };
const v2 = C.computeProgress({
  startScore: 75,
  // vier weken: 50%, 25%, 25%, 50% → gemiddeld 38%
  checkins: [week(['done', 'none'], zwak), week(['done', 'none', 'none', 'none'], zwak),
             week(['none', 'none', 'none', 'done'], zwak), week(['done', 'none'], zwak)],
  goalProgress: 30, coachRating: { score: 30, reason: 'uitvoering blijft achter bij de intentie' }
});
console.log('  » voorbeeld 2: start 75 · completion ' + v2.completion + '% · index ' + v2.ontwikkelingsindex + ' → ' + v2.score);
ok('voorbeeld 2: completion rond 35%', v2.completion >= 30 && v2.completion <= 40, v2.completion);
ok('een halve week telt mee voor consistentie, niet als nul',
  v2.signalen.find((s) => s.key === 'consistentie').score > 0,
  v2.signalen.find((s) => s.key === 'consistentie').score);
ok('voorbeeld 2: Progress Score = 72', v2.score === 72, v2.score);
ok('voorbeeld 2: sterke start met zwakke uitvoering daalt licht', v2.delta < 0 && v2.delta >= -5, v2.delta);

ok('Startscore, Action Completion en Progress Score zijn drie verschillende getallen',
  v1.score !== 58 && v1.score !== v1.completion && v2.score !== 75 && v2.score !== v2.completion);

/* trend, geen ruis */
head('4. Trend in plaats van wekelijkse ruis');
const stap = C.computeProgress({ startScore: 66, previousScore: 66,
  checkins: [week(['done', 'done', 'partial'], goedeReflectie), week(['done', 'done', 'done'], goedeReflectie),
             week(['done', 'partial', 'done'], goedeReflectie), week(['done', 'done', 'done'], goedeReflectie)],
  goalProgress: 60, coachRating: { score: 65, reason: 'consistent' } });
console.log('  » 66 → ' + stap.score + ' (delta ' + stap.delta + ')');
ok('score beweegt in hele punten', Number.isInteger(stap.score));
ok('stap is beperkt tot maximaal 15 punten', Math.abs(stap.delta) <= C.MAX_STAP);
ok('minimaal 4 weken per evaluatie', C.MIN_WEKEN === 4);
const perfect = C.computeProgress({ startScore: 40, checkins: [week(['done']), week(['done']), week(['done']), week(['done'])],
  goalProgress: 100, coachRating: { score: 100, reason: 'uitstekend' } });
ok('zelfs een perfecte periode springt niet meer dan 15 punten', perfect.delta <= C.MAX_STAP, perfect.delta);

/* bewijs van ontwikkeling */
head('5. Bewijs van ontwikkeling naast het cijfer');
console.log('  » ' + v1.bewijs.join('\n  » '));
ok('bewijs bevat nagekomen afspraken', v1.bewijs.some((b) => /% van je afspraken nagekomen/.test(b)));
ok('bewijs bevat consistentie', v1.bewijs.some((b) => /weken achter elkaar consistent/.test(b)));
ok('bewijs bevat het eigen inzicht van de klant', v1.bewijs.some((b) => /avonden het grootste probleem/.test(b)));
ok('bewijs staat los van het cijfer', v1.bewijs.length >= 3, v1.bewijs.length);

console.log('\n' + pass + ' geslaagd, ' + fail + ' gefaald');
process.exit(fail ? 1 : 0);
