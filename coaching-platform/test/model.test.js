/* Test-suite — DATAMODEL MVP V1.0
   Kernregel: score-snapshots worden nooit overschreven. */
const Model = require('../model.js');
const Scoring = require('../scoring.js');
const Coaching = require('../coaching.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}
const head = (t) => console.log('\n' + t);

Model.reset();
const db = Model.all();
const clients = db.clients;
const ahmed = clients.find((c) => c.name === 'Ahmed');
const mark = clients.find((c) => c.name === 'Mark');
const david = clients.find((c) => c.name === 'David');

/* ============================================================ schema */
head('1. Entiteiten');
['users', 'clients', 'intakes', 'intake_answers', 'score_snapshots', 'dimension_scores',
 'goals', 'actions', 'check_ins', 'reflections', 'coach_sessions'].forEach((t) =>
  ok('tabel ' + t + ' bestaat en is gevuld', Array.isArray(db[t]) && db[t].length > 0, (db[t] || []).length));
ok('USER → CLIENT relatie', clients.every((c) => db.users.some((u) => u.id === c.user_id)));
ok('elke cliënt heeft een coach', clients.every((c) => db.users.some((u) => u.id === c.coach_id && u.role === 'coach')));
ok('CLIENT → INTAKE → ANSWERS',
  clients.every((c) => { const i = Model.intakeOf(c.id); return i && Model.where('intake_answers', (a) => a.intake_id === i.id).length > 20; }));
ok('intake_answers dragen raw_value én normalized_value',
  Model.where('intake_answers', (a) => a.normalized_value !== null).length > 0);
ok('genormaliseerde antwoorden hebben een dimensie',
  Model.where('intake_answers', (a) => a.normalized_value !== null).every((a) => Scoring.DIM_ORDER.indexOf(a.score_dimension) >= 0));
ok('schemaversie vastgelegd', db.schema_version === '1.0');

/* ============================================================ snapshots */
head('2. Score-snapshots worden nooit overschreven');
const voor = Model.snapshotsOf(ahmed.id).length;
const eerste = Model.startSnapshot(ahmed.id);
const eersteScore = eerste.overall_score;
const r = Model.scoreOf(ahmed.id);
Model.createSnapshot(ahmed.id, 'progress', r, { overall: 99, note: 'testmeting' });
const na = Model.snapshotsOf(ahmed.id);
ok('nieuwe meting voegt een rij toe', na.length === voor + 1, voor + ' → ' + na.length);
ok('de oorspronkelijke startscore is ongewijzigd',
  Model.startSnapshot(ahmed.id).overall_score === eersteScore, Model.startSnapshot(ahmed.id).overall_score + ' vs ' + eersteScore);
ok('de startsnapshot heeft nog hetzelfde id', Model.startSnapshot(ahmed.id).id === eerste.id);
ok('elke snapshot draagt een datum, type en scoreversie',
  na.every((s) => s.created_at && s.score_type && s.scoring_version));
ok('elke snapshot heeft zes dimensierijen',
  na.every((s) => Model.dimensionsOf(s.id).length === 6));
ok('dimensierijen bewaren ai_score naast coach_score',
  Model.dimensionsOf(na[0].id).every((d) => 'ai_score' in d && 'coach_score' in d && 'confidence' in d));
ok('volledige ontwikkeling is reconstrueerbaar uit de snapshots',
  na.map((s) => s.overall_score).length === na.length && na[0].score_type === 'start');
Model.remove('score_snapshots', na[na.length - 1].id);

/* ============================================================ coachvalidatie */
head('3. Focus is pas zichtbaar na coachvalidatie');
const prD = Model.priorityOf(david.id);
ok('David: focus nog niet gevalideerd', prD.visibleToClient === false, prD.validation.status);
ok('David: status is coach check', Model.clientStatus(david.id).code === 'rood', Model.clientStatus(david.id).label);
const prA = Model.priorityOf(ahmed.id);
ok('Ahmed: focus bevestigd en zichtbaar', prA.visibleToClient === true);
ok('focus_records leggen AI-voorstel én coachbesluit apart vast',
  Model.where('focus_records', (f) => f.client_id === ahmed.id).every((f) => 'primary_focus' in f && 'coach_validated_focus' in f));

/* ============================================================ archetypen */
head('4. Drie archetypen gedragen zich verschillend');
const A = Model.scoreOf(ahmed.id), M = Model.scoreOf(mark.id), D = Model.scoreOf(david.id);
console.log('  Ahmed ' + A.total + ' (FI ' + A.foundationIndex + ' ' + A.foundationStatus.label + ') · focus ' + prA.primaryFocusLabel);
console.log('  Mark  ' + M.total + ' (FI ' + M.foundationIndex + ' ' + M.foundationStatus.label + ') · focus ' + Model.priorityOf(mark.id).aiPrimaryLabel);
console.log('  David ' + D.total + ' (FI ' + D.foundationIndex + ' ' + D.foundationStatus.label + ') · focus ' + prD.aiPrimaryLabel);
ok('Mark heeft het zwakste fundament', M.foundationIndex < A.foundationIndex && M.foundationIndex < D.foundationIndex);
ok('Mark valt onder de minimum foundation regel', Model.priorityOf(mark.id).steps[0].passed === false);
ok('Mark krijgt een fundamentfocus', ['F', 'S'].indexOf(Model.priorityOf(mark.id).aiPrimary) >= 0);
ok('David heeft het sterkste fundament', D.foundationIndex > A.foundationIndex);
ok('David zit in een latere trajectfase dan Mark',
  Model.FASES.indexOf(Model.faseOf(david.id)) > Model.FASES.indexOf(Model.faseOf(mark.id)),
  Model.faseOf(david.id) + ' vs ' + Model.faseOf(mark.id));
ok('statuslichten verschillen per cliënt',
  new Set(clients.map((c) => Model.clientStatus(c.id).code)).size >= 2,
  clients.map((c) => c.name + ':' + Model.clientStatus(c.id).icon).join(' '));

/* ============================================================ check-ins */
head('5. Check-ins en evaluatieperiodes');
ok('check_in_actions koppelen aan een actie',
  Model.checkinActions(Model.checkinsOf(ahmed.id)[0].id).every((ca) => ca.action_id));
ok('action_completion is per check-in vastgelegd',
  Model.checkinsOf(ahmed.id).every((c) => typeof c.action_completion === 'number'));
ok('completion komt overeen met de engine',
  Model.checkinsOf(ahmed.id).every((c) =>
    c.action_completion === Coaching.actionCompletion({ actions: Model.checkinActions(c.id) })));
const pgA = Model.progressOf(ahmed.id);
ok('dezelfde weken verhogen de score niet twee keer', pgA.ready === false, JSON.stringify(pgA.weken));
ok('Mark heeft nog te weinig check-ins voor een Progress Score',
  Model.progressOf(mark.id).ready === false && Model.progressOf(mark.id).weekenNodig === 2);
ok('wekelijkse reflecties zijn onderscheiden van trajectreflecties',
  Model.reflectionsOf(ahmed.id).every((x) => x.type === 'weekly' || x.type === 'journey'));

/* ============================================================ persistentie */
head('6. Opslag');
Model.update('clients', ahmed.id, { goal_progress: 61 });
ok('update schrijft door', Model.first('clients', (c) => c.id === ahmed.id).goal_progress === 61);
const nieuw = Model.insert('goals', { client_id: ahmed.id, title: 'Testdoel', status: 'active' });
ok('insert geeft een id terug', !!nieuw.id && Model.goalsOf(ahmed.id).some((g) => g.id === nieuw.id));
Model.remove('goals', nieuw.id);
ok('remove verwijdert de rij', !Model.goalsOf(ahmed.id).some((g) => g.id === nieuw.id));
ok('reset herstelt de uitgangssituatie', Model.reset().clients.length === 3);

console.log('\n' + pass + ' geslaagd, ' + fail + ' gefaald');
process.exit(fail ? 1 : 0);
