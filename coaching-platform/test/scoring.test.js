/* Test-suite — COACH SCORING FRAMEWORK V1.0
   Toetst rechtstreeks tegen de rekenvoorbeelden in het framework.
   Draaien: node test/scoring.test.js  (geen dependencies) */
const S = require('../scoring.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}
const head = (t) => console.log('\n' + t);

/* helper: dimensiescores forceren via coach-override (met reden, zoals §20 eist) */
function metDimensies(map) {
  const dimensions = {};
  Object.keys(map).forEach((k) => { dimensions[k] = { score: map[k], reason: 'testfixture' }; });
  return S.computeScore(basis(), { dimensions });
}

function basis(o) {
  return Object.assign({
    q1: 32, q2: 'Alleen', q3: 'Fulltime baan, 40 uur.',
    q4_s: 6, q4_t: 'Gaat wel.',
    q5_1: 'Mijn werk', q5_2: 'Mijn vrienden', q5_3: 'Doorzettingsvermogen',
    q6_1: 'Slaap', q6_2: 'Sport', q6_3: 'Focus',
    q7: 'Elke ochtend om 06:00 opstaan en sporten',
    q8: 'Op tijd naar bed gaan',
    q9: 'Ik wil over drie jaar fit zijn, 3 keer per week sporten en een eigen bedrijf hebben waar ik trots op ben.',
    q10: ['Gezondheid & lichaam', 'Werk & carrière', 'Mentale kracht & discipline'],
    q11: 'Ik merk dat ik zonder gezondheid niets van mijn plannen voor mijn gezin afkrijg.',
    q12: 'Elke werkdag om 23:00 naar bed en 3 keer per week sporten.',
    q13_s: 6, q14_s: 6, q15_s: 6, q15_bed: '23:00', q15_rise: '07:00',
    q16_s: 6, q17_n: 3, q18_s: 6, q19_s: 6, q20_s: 6,
    q21: ['Social media'], q21_t: '',
    q22: 'Mijn administratie: ik moet die elke week een uur bijhouden.',
    q23: 'Dagstructuur',
    q24: 'Ik merk nu dat mijn manier van leven me tegenhoudt en ik wil er niet over een jaar nog staan.',
    q25_s: 8, q25_t: 'Ik zet mijn telefoon om 22:00 in een andere kamer en sport 3 keer per week voor werktijd.'
  }, o);
}

/* ============================================================ §5 conversies */
head('1. Conversies (framework §5)');
ok('1–10 wordt score × 10 (7 → 70)', S.metric10(7) === 70);
ok('1–10 wordt score × 10 (5 → 50)', S.metric10(5) === 50);
ok('bewegingsschaal exact volgens tabel',
  JSON.stringify(S.MOVEMENT_SCALE) === JSON.stringify([0, 20, 35, 50, 65, 80, 90, 100]), S.MOVEMENT_SCALE.join(','));
[[0, 0], [1, 20], [2, 35], [3, 50], [4, 65], [5, 80], [6, 90], [7, 100]]
  .forEach(([d, v]) => ok('beweging ' + d + ' dagen → ' + v, S.movement(d) === v, S.movement(d)));

/* rekenvoorbeeld §5: gezondheid 70, energie 60, slaap 50, voeding 60, beweging 65 → 61 */
const f5 = S.computeScore(basis({ q13_s: 7, q14_s: 6, q15_s: 5, q16_s: 6, q17_n: 4 }));
ok('§5 rekenvoorbeeld: Gezond fundament = 61', f5.dims.F.score === 61, f5.dims.F.score);
ok('fundament is ongewogen gemiddelde van 5 vragen', f5.dims.F.components.length === 5 &&
  f5.dims.F.components.every((c) => c.weight === 0.20));

/* ============================================================ §6 structuur */
head('2. Structuur & organisatie (framework §6)');
const st = S.computeScore(basis({ q18_s: 4, q19_s: 6 }));
ok('§6 rekenvoorbeeld: (40 + 60) / 2 = 50', st.dims.S.score === 50, st.dims.S.score);
ok('Q20 zit NIET in structuur', !st.dims.S.components.some((c) => c.qid === 'Q20'));
ok('Q21 levert geen eigen scorecomponent', !st.dims.S.components.some((c) => c.qid === 'Q21'));
ok('Q21 levert wel een tijdsbestedingssignaal', st.timeSignal !== null && 'suggest' in st.timeSignal);

const zwaar = S.computeScore(basis({ q21: ['Social media', 'Gamen', 'YouTube', 'Telefoon algemeen'] }));
ok('veel digitale afleiding → signaal hoog, voorstel −10',
  zwaar.timeSignal.level === 'hoog' && zwaar.timeSignal.suggest === -10, JSON.stringify(zwaar.timeSignal));
ok('signaal past de score NIET automatisch aan', zwaar.dims.S.score === S.computeScore(basis()).dims.S.score);

const gecorr = S.computeScore(basis({ q18_s: 4, q19_s: 6 }),
  { structureModifier: { value: -5, reason: 'veel digitale afleiding' } });
ok('§6 coachcorrectie: 50 → 45', gecorr.dims.S.score === 45, gecorr.dims.S.score);
ok('correctie is zichtbaar met reden', gecorr.structureAdjust.from === 50 && gecorr.structureAdjust.to === 45 &&
  gecorr.structureAdjust.reason === 'veel digitale afleiding');
const teGroot = S.computeScore(basis({ q18_s: 4, q19_s: 6 }), { structureModifier: { value: -40, reason: 'x' } });
ok('correctie begrensd op ±10', teGroot.dims.S.score === 40, teGroot.dims.S.score);
const zonderReden = S.computeScore(basis({ q18_s: 4, q19_s: 6 }), { structureModifier: { value: -10 } });
ok('correctie zonder reden wordt genegeerd', zonderReden.dims.S.score === 50 && zonderReden.warnings.length > 0);

/* ============================================================ dimensiegewichten */
head('3. Dimensiegewichten binnen de dimensies (§7–§10)');
const b = S.computeScore(basis());
const gw = (k) => b.dims[k].components.map((c) => c.qid + ':' + c.weight).join(' ');
ok('Richting = Q9 30 / Q10 15 / Q11 25 / Q12 30', gw('R') === 'Q9:0.3 Q10:0.15 Q11:0.25 Q12:0.3', gw('R'));
ok('Discipline = Q8 30 / Q20 45 / Q25 25', gw('D') === 'Q8:0.3 Q20:0.45 Q25:0.25', gw('D'));
ok('Ownership = Q19 40 / Q22 40 / Q7 20', gw('O') === 'Q19:0.4 Q22:0.4 Q7:0.2', gw('O'));
ok('Readiness = Q24 35 / Q25 50 / Q12 15', gw('C') === 'Q24:0.35 Q25:0.5 Q12:0.15', gw('C'));
ok('dimensiegewichten 25/20/15/15/15/10',
  S.DIM_ORDER.map((k) => S.DIMENSIONS[k].weight).join(',') === '0.25,0.2,0.15,0.15,0.15,0.1');
ok('dimensiegewichten tellen op tot 1,00',
  Math.abs(S.DIM_ORDER.reduce((s, k) => s + S.DIMENSIONS[k].weight, 0) - 1) < 1e-9);

/* ============================================================ §11/§12 totaal */
head('4. Totaalscore (framework §11 en §12)');
const v12 = metDimensies({ F: 60, S: 50, R: 80, D: 55, O: 75, C: 90 });
ok('§12 rekenvoorbeeld: 15 + 10 + 12 + 8,25 + 11,25 + 9 = 65,5', v12.totalExact === 65.5, v12.totalExact);
ok('§12 dashboard toont 66', v12.total === 66, v12.total);
ok('§13 Foundation Index = (60 + 50) / 2 = 55', v12.foundationIndex === 55, v12.foundationIndex);
ok('§14 status bij 55 = 🟡 Opbouwen', v12.foundationStatus.code === 'opbouwen', v12.foundationStatus.label);
ok('§27 band bij 66 = Stevige basis', v12.scoreBand.label === 'Stevige basis', v12.scoreBand.label);
ok('§31 sterkste dimensie = Readiness 90', v12.strongest.key === 'C' && v12.strongest.score === 90);
ok('§31 grootste ontwikkelpunt = Structuur 50', v12.weakest.key === 'S' && v12.weakest.score === 50);

/* ============================================================ §15 geen harde cap */
head('5. Geen harde score-cap (framework §15)');
const v15 = metDimensies({ F: 35, S: 35, R: 95, D: 85, O: 90, C: 100 });
ok('totaalscore blijft een echte totaalscore', v15.total === 66, v15.total);
ok('score wordt niet kunstmatig afgestraft', v15.totalExact === 66.25, v15.totalExact);
ok('Foundation Index = 35', v15.foundationIndex === 35, v15.foundationIndex);
ok('§14 status = 🔴 Stabiliseren', v15.foundationStatus.code === 'stabiliseren', v15.foundationStatus.label);
ok('hoge score én rode foundation status bestaan naast elkaar',
  v15.total >= 60 && v15.foundationStatus.code === 'stabiliseren');
ok('§17 minimum foundation regel is actief', v15.minFoundationRule.active, JSON.stringify(v15.minFoundationRule.hits));
ok('§17 eerste focus komt uit het fundament', ['F', 'S'].indexOf(v15.focus.key) >= 0, v15.focus.key);
ok('§17 regel is herkenbaar gelabeld', v15.focus.rule === 'minimum-foundation', v15.focus.rule);
// Fundament op orde, structuur onder de grens, hefboom ligt elders (richting/discipline).
const v17 = metDimensies({ F: 90, S: 35, R: 10, D: 10, O: 50, C: 50 });
ok('§17 grijpt in als de hefboom buiten het fundament uitkomt',
  ['F', 'S'].indexOf(v17.focus.key) >= 0 && v17.focus.rule === 'minimum-foundation-override',
  v17.focus.key + '/' + v17.focus.rule);
ok('§17 groeidoel wordt niet afgewezen, de route wordt aangepast',
  /route ernaartoe wordt aangepast/.test(v17.focus.reden));

/* ============================================================ §14 statusgrenzen */
head('6. Foundation Status grenzen (framework §14)');
[[30, 'stabiliseren'], [39, 'stabiliseren'], [40, 'opbouwen'], [59, 'opbouwen'],
 [60, 'stevig'], [74, 'stevig'], [75, 'sterk'], [100, 'sterk']].forEach(([fi, code]) => {
  const r = metDimensies({ F: fi, S: fi });
  ok('FI ' + fi + ' → ' + code, r.foundationStatus.code === code, r.foundationStatus.code);
});

/* ============================================================ §16 prioriteit */
head('7. Prioriteitslogica (framework §16)');
const v16 = metDimensies({ F: 72, S: 42, R: 80, D: 48, O: 70, C: 90 });
ok('§16 eerste focus = Structuur', v16.focus.key === 'S', v16.focus.key + ' (' + v16.focus.label + ')');
ok('§16 tweede spoor = Discipline', v16.focus.secondary && v16.focus.secondary.key === 'D',
  v16.focus.secondary && v16.focus.secondary.key);
ok('niet "werk aan alle zes"', v16.focus.ranking.length === 6 && v16.focus.key !== null);
ok('§31 coachinghypothese: structuur beïnvloedt discipline',
  v16.hypotheses.some((h) => /structuur beïnvloedt discipline/i.test(h)), v16.hypotheses[0]);
const coachKiest = metDimensies({ F: 72, S: 42, R: 80, D: 48, O: 70, C: 90 });
const overr = S.computeScore(basis(), { dimensions: { F: { score: 72, reason: 't' }, S: { score: 42, reason: 't' },
  R: { score: 80, reason: 't' }, D: { score: 48, reason: 't' }, O: { score: 70, reason: 't' }, C: { score: 90, reason: 't' } },
  focusOverride: 'R' });
ok('coach kan de eerste focus overrulen', overr.focus.key === 'R' && overr.focus.rule === 'coach-override');

/* ============================================================ §4 contextvragen */
head('8. Contextvragen leveren geen punten (framework §4)');
const ref = S.computeScore(basis()).total;
[['q1', 64], ['q2', 'Ouders'], ['q3', 'iets heel anders'], ['q4_s', 1],
 ['q5_1', 'anders'], ['q6_1', 'anders'], ['q23', 'Geld']].forEach(([k, v]) => {
  const m = basis(); m[k] = v;
  ok(k + ' beïnvloedt de totaalscore niet', S.computeScore(m).total === ref, S.computeScore(m).total + ' vs ' + ref);
});
ok('Q23 zit in geen enkele dimensie',
  S.DIM_ORDER.every((k) => !S.computeScore(basis()).dims[k].components.some((c) => c.qid === 'Q23')));
ok('Q5 zit in geen enkele dimensie',
  S.DIM_ORDER.every((k) => !S.computeScore(basis()).dims[k].components.some((c) => c.qid === 'Q5')));

/* ============================================================ §19 inconsistenties */
head('9. Inconsistentiesignalen (framework §19)');
const inc1 = S.computeScore(basis({ q25_s: 10, q25_t: 'Ik ben eigenlijk niet bereid mijn huidige gewoontes aan te passen.' }));
ok('voorbeeld 1: commitment inconsistency', inc1.checks.some((c) => c.type === 'commitment'),
  inc1.checks.map((c) => c.type).join(','));
ok('score wordt NIET automatisch verlaagd', inc1.dims.C.components.find((c) => c.qid === 'Q25').value === 100);

const inc2 = S.computeScore(basis({ q20_s: 9, q20_t: 'Ik kom mijn afspraken met mezelf meestal niet na.' }));
ok('voorbeeld 2: self-assessment inconsistency', inc2.checks.some((c) => c.type === 'discipline'));
ok('Q20 blijft op 90 staan', inc2.dims.D.components.find((c) => c.qid === 'Q20').value === 90);

const inc3 = S.computeScore(basis({ q9: 'Ik weet niet wat ik over drie jaar wil.' }));
ok('voorbeeld 3: direction inconsistency of lage richtingscore',
  inc3.checks.some((c) => c.type === 'richting') || inc3.dims.R.score < b.dims.R.score,
  'R=' + inc3.dims.R.score + ' vs ' + b.dims.R.score);

const inc4 = S.computeScore(basis({ q13_s: 9, q13_t: 'Ik heb al maanden rugpijn en ben vaak kortademig.' }));
ok('voorbeeld 4: health validation signal', inc4.checks.some((c) => c.type === 'gezondheid'));
ok('gezondheidsscore blijft 90', inc4.dims.F.components.find((c) => c.qid === 'Q13').value === 90);

const slaap = S.computeScore(basis({ q15_s: 8, q15_bed: '02:00', q15_rise: '06:30' }));
ok('§5 slaapvalidatie: signaal bij 8/10 maar 4,5 uur', slaap.checks.some((c) => c.type === 'slaap'));
ok('§5 slaapscore blijft gebaseerd op de zelfscore (80)',
  slaap.dims.F.components.find((c) => c.qid === 'Q15').value === 80);
ok('elk signaal is een coach check, geen conclusie', slaap.checks.every((c) => c.icon === '⚠️' && c.titel));

/* ============================================================ §18 confidence */
head('10. Confidence per dimensie (framework §18)');
S.DIM_ORDER.forEach((k) => ok(k + ' heeft een confidence', ['hoog', 'medium', 'laag'].indexOf(b.dims[k].confidence.code) >= 0,
  b.dims[k].confidence.code));
ok('Fundament (alleen cijfers) heeft hoge confidence', b.dims.F.confidence.code === 'hoog', b.dims.F.confidence.code);
ok('Richting (vooral open vragen) is niet hoog', b.dims.R.confidence.code !== 'hoog', b.dims.R.confidence.code);
ok('confidence daalt bij een openstaande coach check',
  inc4.dims.F.confidence.rank < b.dims.F.confidence.rank, inc4.dims.F.confidence.code);
ok('overall confidence aanwezig', ['hoog', 'medium', 'laag'].indexOf(b.confidence.code) >= 0, b.confidence.code);
const gevalideerd = S.computeScore(basis(), { dimensions: { R: { score: 70, reason: 'in sessie besproken' } } });
ok('coachvalidatie zet confidence op hoog', gevalideerd.dims.R.confidence.code === 'hoog');

/* ============================================================ §20 override */
head('11. Coach override (framework §20)');
const ov = S.computeScore(basis(), { dimensions: { D: { score: 40, reason: 'concrete voorbeelden laten structureel niet nakomen zien' } } });
ok('override past de dimensiescore aan', ov.dims.D.score === 40, ov.dims.D.score);
ok('AI-baseline blijft bewaard', ov.dims.D.aiScore !== null && ov.dims.D.aiScore !== 40, ov.dims.D.aiScore);
ok('reden wordt vastgelegd', /structureel niet nakomen/.test(ov.dims.D.coachReason));
const zonder = S.computeScore(basis(), { dimensions: { D: { score: 40 } } });
ok('override zonder reden wordt geweigerd', zonder.dims.D.score !== 40 && zonder.warnings.length > 0, zonder.warnings[0]);
const ovComp = S.computeScore(basis(), { components: { f13: { value: 30, reason: 'klachten besproken' } } });
ok('componentoverride werkt en bewaart de AI-waarde',
  ovComp.dims.F.components[0].value === 30 && ovComp.dims.F.components[0].aiValue === 60,
  ovComp.dims.F.components[0].aiValue);
ok('coachValidated wordt gemarkeerd', ov.coachValidated === true && b.coachValidated === false);

/* ============================================================ §30 record */
head('12. Opslagstructuur (framework §30)');
const rec = b.record;
const velden = ['score_version', 'score_date', 'question_id', 'raw_value', 'normalized_value', 'score_dimension',
  'dimension_score', 'confidence', 'ai_observation', 'inconsistency_flag', 'coach_adjusted_score', 'coach_adjustment_reason'];
ok('record bevat alle voorgeschreven velden',
  velden.every((v) => v in rec.answers[0]), velden.filter((v) => !(v in rec.answers[0])).join(','));
ok('score is aan de frameworkversie gekoppeld', rec.score_version === '1.0' && b.frameworkVersion === '1.0');
ok('record bevat een rij per scorecomponent (20 componenten)', rec.answers.length === 20, rec.answers.length);
ok('record dekt 17 unieke scorevragen',
  new Set(rec.answers.map((r) => r.question_id)).size === 17, new Set(rec.answers.map((r) => r.question_id)).size);
ok('cross-loads zijn zichtbaar: Q19, Q25 en Q12 komen in twee dimensies voor',
  ['Q19', 'Q25', 'Q12'].every((q) => new Set(rec.answers.filter((r) => r.question_id === q).map((r) => r.score_dimension)).size === 2));
ok('record bevat zes dimensierijen', rec.dimensions.length === 6);
ok('coachaanpassing komt in het record terecht',
  ov.record.dimensions.find((d) => d.score_dimension === 'D').coach_adjustment_reason.length > 0);
ok('AI-baseline en coachscore staan los van elkaar in het record',
  ov.record.dimensions.find((d) => d.score_dimension === 'D').ai_dimension_score !== 40);

/* ============================================================ robuustheid */
head('13. Robuustheid');
const leeg = S.computeScore({});
ok('lege intake crasht niet', leeg.total === 0, leeg.total);
ok('lege intake geeft geen foundation status', leeg.foundationIndex === null);
ok('onbeantwoorde open vraag telt niet als nul',
  S.computeScore(basis({ q9: '' })).dims.R.components.find((c) => c.qid === 'Q9').answered === false);
let prev = -1, mono = true;
for (let v = 1; v <= 10; v++) {
  const t = S.computeScore(basis({ q13_s: v, q14_s: v, q15_s: v, q16_s: v, q18_s: v, q19_s: v, q20_s: v, q25_s: v })).total;
  if (t < prev) mono = false; prev = t;
}
ok('totaal stijgt monotoon met de cijfers', mono);
ok('alle scores binnen 0–100', S.DIM_ORDER.every((k) => b.dims[k].score >= 0 && b.dims[k].score <= 100));

/* ============================================================ §26 taal */
head('14. Taalregels (framework §26)');
ok('goedgekeurde formulering beschikbaar',
  S.LANGUAGE.toegestaan('Discipline', 55) === 'Je huidige discipline-score is 55/100.', S.LANGUAGE.toegestaan('Discipline', 55));
ok('verboden formuleringen expliciet vastgelegd', S.LANGUAGE.verboden.length === 4);
ok('observaties formuleren ownership als signaal',
  S.estimateOpen('q22', 'Mijn baas maakt mijn werk onmogelijk.').observation.indexOf('Ownership-signaal') === 0,
  S.estimateOpen('q22', 'Mijn baas maakt mijn werk onmogelijk.').observation);

console.log('\n' + pass + ' geslaagd, ' + fail + ' gefaald');
process.exit(fail ? 1 : 0);
