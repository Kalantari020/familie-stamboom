# MVP V1.0 — datamodel en schermenplan

Technische blauwdruk. De prototype-implementatie staat in `model.js` (datamodel) en `app.js` (schermen); `test/model.test.js` borgt de regels hieronder.

---

## 1. Entiteiten

```
USER
 └── CLIENT
      ├── INTAKE ── ANSWERS
      ├── SCORE SNAPSHOTS ── DIMENSION SCORES
      ├── GOALS
      ├── ACTIONS
      ├── CHECK-INS ── CHECK-IN ACTIONS
      ├── REFLECTIONS
      ├── COACH SESSIONS
      └── FOCUS RECORDS
```

### users
`id · email · name · role (client/coach/admin) · created_at`

### clients
`id · user_id · coach_id · name · status · created_at · goal_progress · coach_rating {score, reason} · coach_input`

`coach_input` bundelt alle coachcorrecties: `dimensions{}`, `components{}`, `structureModifier{}`, `focusValidation{}`. In een echte database worden dat vier kleine tabellen; in het prototype is het één JSON-kolom.

### intakes
`id · client_id · status (in_progress/completed) · completed_at · scoring_version`

### intake_answers
`id · intake_id · question_id · raw_value · normalized_value · score_dimension · created_at`

`raw_value` is wat de cliënt invulde. `normalized_value` en `score_dimension` worden bij afronding ingevuld vanuit de scoring-engine — de ruwe invoer blijft altijd bewaard.

### score_snapshots
`id · client_id · score_type (start/progress) · overall_score · foundation_index · foundation_status · confidence · created_at · scoring_version · note`

### dimension_scores
`id · snapshot_id · dimension · ai_score · coach_score · confidence · ai_observation · coach_adjustment_reason`

### goals
`id · client_id · title · description · start_date · target_date · status`

### actions
`id · client_id · goal_id · title · description · frequency · start_date · end_date · status`

### check_ins
`id · client_id · week · action_completion · self_rating {zorg, afspraken} · reflection {goed, obstakel, geleerd} · submitted_at`

### check_in_actions
`id · check_in_id · action_id · title · status (done/partial/none)`

Toegevoegd bovenop de specificatie: `check_ins.action_completion` is een aggregaat, maar de coach moet per actie kunnen zien wat wel en niet lukte. De titel wordt meegekopieerd zodat de historie klopt als een actie later wordt hernoemd.

### reflections
`id · client_id · type (weekly/journey) · prompt · answer · created_at`

`type` scheidt de wekelijkse zelfinzichtvraag van de trajectreflecties, zodat het dashboard niet meteen de slotvraag van het traject toont.

### coach_sessions
`id · client_id · session_date · session_type · focus · coach_notes · next_step`

### focus_records
`id · client_id · engine_version · primary_focus · secondary_focus · focus_mode · leverage_chain · ai_hypothesis · coach_validated_focus · coach_validation_status · coach_validation_reason · created_at`

---

## 2. De cruciale regel

**Scores worden nooit overschreven.** Elke meting is een nieuwe rij in `score_snapshots` met eigen datum, type, dimensierijen en `scoring_version`.

```
Snapshot 01 · start    · 60 · 2026-07-30 · v1.0
Snapshot 02 · progress · 69 · 2026-08-27 · v1.0
Snapshot 03 · progress · 74 · 2026-09-24 · v1.0
```

Gevolgen die in `model.js` zijn afgedwongen en getest:

- `createSnapshot()` doet alleen `insert`, nooit `update` op een bestaande snapshot.
- Een nieuwe Progress Score rekent uitsluitend met de check-ins **ná** de vorige snapshot. Zonder die regel bleven dezelfde vier weken de score elke keer opnieuw verhogen.
- Elke snapshot draagt de versie waarmee hij berekend is. Bij een latere v1.1 blijft zichtbaar waarom dezelfde cliënt onder v1.0 een 64 kreeg en onder v1.1 een 68.

---

## 3. Klantschermen

| Route | Scherm | Inhoud |
|---|---|---|
| `#/` | Login | Rolkeuze, cliënt kiezen of nieuwe intake starten. |
| `#/intake` | Intake | **Eén vraag per scherm**, `01 / 25`, voortgangsbalk, categorie-intro bij elk deel. Geen enkele score zichtbaar. |
| `#/intake/klaar` | Afronding | *"Je intake is compleet."* Geen score. |
| `#/verwerken` | Verwerking | Korte laadstaat, waarna het startpunt betekenis krijgt. |
| `#/startpunt` | Jouw Startpunt | Score /100 · fundament + status · zes gebieden · waar beginnen we · volgende stap. |
| `#/dashboard` | Dashboard | Groet · huidig startpunt + delta · Foundation Status · focus · deze week (1–3 acties) · ontwikkeling · volgende reflectie · trajectfase. |
| `#/actions` | Acties | Alle acties met uitvoeringshistorie per week en een voortgangsbalk. |
| `#/checkin` | Check-in | Acties ✅ 🟡 ❌ · drie reflectievragen · twee zelfbeoordelingen. Versturen pas als alles beoordeeld is. |
| `#/reflection` | Reflectie | Alleen de reflectie die nu relevant is, plus eerdere antwoorden. |
| `#/progress` | Voortgang | `60 → 69 → 74` · zes gebieden · korte interpretatie · bewijs van ontwikkeling · alle metingen. |

**Wat de klant nooit ziet:** AI-hypotheses, confidence, inconsistency flags, ruwe scores per vraag, coachnotities, scorecorrecties.

---

## 4. Coachschermen

| Route | Scherm | Inhoud |
|---|---|---|
| `#/coach/clients` | Cliëntenoverzicht | Naam · start · nu · fundament · focus · completion · laatste check-in · status 🟢 🟡 🔴. Rij is klikbaar. |
| `#/coach/client` | Cliëntdetail | Kop met `start → nu`, huidige focus, fundament en fase. Negen tabs. |

**Tabs:** Coach brief · Assessment · Intake · Scores · Doelen · Acties · Check-ins · Sessies · Progressie.

### Statuslicht

| Licht | Wanneer |
|---|---|
| 🔴 | Focus nog niet gevalideerd, of drie of meer openstaande coach checks |
| 🟡 | Laatste action completion onder 60%, of nog geen check-in |
| 🟢 | Alles op koers |

### Coach brief
Wat valt op (twee sterkste, twee zwakste dimensies, afspraken met zichzelf) · mogelijke hypothese · te verifiëren vraag · in één oogopslag (fundament, completion, laatste check-in, laatste sessie, confidence) · laatste check-in met AI-samenvatting en coachvraag.

### Coach Assessment
AI-baseline per dimensie met confidence en een override-veld dat een reden vereist · AI-hypothese met primaire en secundaire focus, modus en hefboomketen · ⚠️ coach checks · coachbeslissing **✓ Bevestigen / ✎ Aanpassen / ✕ Verwerpen** met verplichte reden.

Pas na bevestigen of aanpassen verschijnt de focus bij de cliënt. Tot dat moment leest hij: *"Bespreken we in je eerste sessie."*

---

## 5. Demodata

Drie archetypen, met echte scores uit de engine — geen vaste getallen in de schermen:

| Cliënt | Start | Nu | FI | Status | Focus | Licht |
|---|---|---|---|---|---|---|
| Ahmed | 60 | 69 | 48 | 🟡 Opbouwen | Structuur & organisatie | 🟢 |
| Mark | 42 | 42 | 28 | 🔴 Stabiliseren | Gezond fundament *(minimum foundation regel)* | 🟡 |
| David | 75 | 86 | 77 | 🔵 Sterk | Discipline & consistentie | 🔴 *(focus niet gevalideerd)* |

Elk profiel laat een ander deel van het systeem zien: Ahmed de normale loop, Mark de fundament-first regel bij een instabiele basis, David de validatiepoort en een profiel dat toe is aan groei.

---

## 6. MVP-scope

**Wel:** account/rolkeuze · intake · startscore · dashboard · acties · wekelijkse check-in · reflectie · progressie · cliëntenoverzicht · intake bekijken · scores · assessment · doelen · acties · check-ins · sessies · progressie.

**Niet:** community · chat · uitgebreide gamification · badgesysteem · kalender · voedingsdatabase · workoutbibliotheek · AI-chatbot · abonnementen.

---

## 7. Wat de eerste versie moet bewijzen

> Kan deze methode iemand daadwerkelijk van inzicht → actie → reflectie → ontwikkeling brengen?

En, elke keer dat een cliënt de app opent, binnen vijf seconden:

**Waar sta ik? · Waar werk ik nu aan? · Wat moet ik deze week doen?**
