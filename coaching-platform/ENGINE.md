# Coaching Engine v1.0 — Priority Engine, sessie, check-in en Progress Score

Deze laag zit tussen de Startscore en de coaching. Waar `SCORING.md` beschrijft *waar iemand staat*, beschrijft dit document *waar we beginnen* en *of hij daadwerkelijk verandert*.

Implementatie: `priority.js` en `coaching.js`. Tests: `test/priority.test.js` (56) en `test/coaching.test.js` (51).

---

## 1. Datastroom

```
25 intakevragen → raw answers → normalisatie 0–100 → 6 dimensies
      → AI-observaties + confidence → inconsistency checks
      → Startscore → Foundation Index
      → PRIORITY ENGINE
      → AI-coachhypothese → coach valideert → eerste focus
      → 1–3 concrete acties → wekelijkse check-in → reflectie
      → coachanalyse → aanpassen → PROGRESS SCORE → nieuwe focus
```

---

## 2. Priority Engine V1.0 — vijf stappen

De engine bepaalt niet wat er mis is met iemand. Hij helpt bepalen waar het verstandig is om te beginnen.

### Stap 1 — Foundation Check

Ligt **Gezond fundament < 40** of **Structuur < 40**, dan komt de eerste focus daaruit. Bij twee treffers wint de laagste. Geen automatische groeifocus zolang de basis instabiel is.

### Stap 2 — Bottleneck Score

Niet de laagste dimensie, maar de meest beperkende:

```
bottleneck = achterstand × (1 + Σ over geblokkeerde dimensies: hun achterstand/100 × impact)
```

De impactgraaf legt vast in welke mate een zwakke dimensie een andere moeilijker maakt:

| Bron | Blokkeert | Sterkte |
|---|---|---|
| Gezond fundament | Discipline · Structuur | 0,50 · 0,30 |
| Structuur | Discipline | 0,60 |
| Richting | Discipline · Commitment | 0,40 · 0,30 |
| Ownership | Discipline · Commitment | 0,30 · 0,20 |
| Discipline | Ownership | 0,10 |
| Commitment & Readiness | — | — |

**Commitment staat bewust niet in de graaf als bron.** Het is een intentie, geen enabler: hoge bereidheid maakt niets anders makkelijker. Dat is precies de reden dat readiness niet zwaar mag wegen in de prioriteit — de score telt mee (10%), de doorwerking niet.

Let ook op wat hier *niet* staat: de dimensiegewichten uit de Startscore. Die bepalen hoe iemand ervoor staat, niet waar hij moet beginnen. Zou fundament (25%) ook in de prioriteit meewegen, dan wint het altijd — ook bij een 61.

### Stap 3 — Contradictie Check

| Contradictie | Trigger | Coachvraag |
|---|---|---|
| Hoge motivatie, weinig uitvoering | Commitment ≥ 70 én discipline of structuur < 55 | *Wat maakt dat je dit wel graag wilt, maar het niet van de grond komt?* |
| Hoge discipline, veel uitstel | Q20 ≥ 70 én Q8 ≤ 40 | *Waar lukt dat dan juist niet, en wat is daar anders?* |
| Hoge richting, geen concreet doel | Richting ≥ 70 én Q12 ≤ 40 | *Wat is dan de eerste stap die je de komende drie maanden zou moeten zetten?* |

Elke contradictie levert een vraag op, geen conclusie.

### Stap 4 — Leverage Check

Welke verandering verbetert meerdere problemen tegelijk? Vijf ketens, elk met een ingang en de gebieden die meebewegen:

| Keten | Ingang | Stroomopwaarts |
|---|---|---|
| slaap → energie → training → discipline → structuur | Q15 | 1,40 |
| schermtijd → slaap → energie → uitvoering | Q21 | 1,25 |
| structuur → uitvoering → discipline → resultaat | Q18 | 1,20 |
| richting → prioriteit → consistentie | Q12 | 1,10 |
| beweging → energie → gezondheid | Q17 | 0,85 |

```
leverage = (100 − ingang) × aantal zwakke gebieden × stroomopwaarts
```

Een keten telt alleen mee als de ingang onder 60 ligt én minstens twee gebieden meebewegen. De stroomopwaartse factor voorkomt dat *beweging* wint van *slaap*: training staat achteraan in de keten, slaap vooraan. Zonder die factor koos de engine bij het demoprofiel beweging (score 20) boven slaap (score 50) — het laagste cijfer, maar het verkeerde beginpunt.

### Stap 5 — Coach Validation

De AI-focus is **voorlopig** en **niet zichtbaar voor de klant**. De coach bevestigt, wijzigt of verwerpt. Pas na bevestiging of wijziging verschijnt de focus op het klantdashboard. Daarvóór staat er:

> **Wordt bepaald in je eerste sessie.** Je coach kijkt je antwoorden door en bepaalt samen met jou waar je begint. Dat gebeurt in het gesprek, niet automatisch op basis van een cijfer.

Het AI-voorstel blijft naast de coachkeuze bewaard.

---

## 3. Validatie op 8 profielen

De engine is getoetst aan acht fictieve klanten met een vooraf bepaalde verwachte eerste focus. **8 van 8 komen overeen.**

| # | Profiel | F | S | R | D | O | C | FI | Status | Eerste focus |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Gemotiveerd maar chaotisch | 63 | 38 | 88 | 48 | 78 | 94 | 51 | 🟡 Opbouwen | Structuur *(stap 1)* |
| 2 | Gedisciplineerd maar richtingloos | 82 | 86 | 35 | 88 | 84 | 72 | 84 | 🔵 Sterk | Richting |
| 3 | Sterk fundament, weinig groei | 88 | 84 | 42 | 82 | 86 | 45 | 86 | 🔵 Sterk | Richting |
| 4 | Zwak fundament, hoge ambitie | 38 | 43 | 91 | 55 | 72 | 96 | 41 | 🟡 Opbouwen | Fundament *(stap 1)* |
| 5 | Alles tegelijk willen verbeteren | 61 | 54 | 48 | 44 | 67 | 82 | 58 | 🟡 Opbouwen | Richting → structuur |
| 6 | Laag commitment | 76 | 72 | 74 | 58 | 61 | 31 | 74 | 🟢 Stevig | Commitment & Readiness |
| 7 | Veel ownership, lage energie | 42 | 79 | 82 | 77 | 91 | 87 | 61 | 🟢 Stevig | Gezond fundament |
| 8 | Gebalanceerd | 74 | 72 | 76 | 70 | 78 | 79 | 73 | 🟢 Stevig | Optimaliseren / groei |

**Profiel 5 is de scherpste test.** De laagste dimensie is *discipline* (44), maar de engine kiest *richting* (48) — precies de redenering uit de validatie: weinig richting → te veel doelen → slechte prioriteit → weinig consistentie. Structuur volgt als tweede spoor.

**Profiel 8** krijgt geen bottleneck maar de modus **groei**: Foundation Index ≥ 60 én geen enkele dimensie onder de 60. De hypothese verandert dan mee: *"De vraag is niet meer wat er eerst gestabiliseerd moet worden, maar waar je gericht wilt groeien."*

### Afwijking in de totaalscores

De formule uit §11 geeft op drie profielen een andere uitkomst dan de tabel:

| # | In de tabel | Formule | Verschil |
|---|---|---|---|
| 2 | 73 | **76** | +3 |
| 3 | 72 | **75** | +3 |
| 7 | 69 | **73** | +4 |

De overige vijf komen op 1 punt na overeen. Het gewogen rekenvoorbeeld uit §12 (65,5) reproduceert wél exact, dus de formule staat. De verschillen komen uit de handmatige berekening in de tabel. Dit verandert niets aan de conclusie — de eerste focus klopt in alle acht gevallen, en dat is waar de test over ging.

---

## 4. De coachhypothese

Geen algoritmetaal. Niet *"je structuur-score is 38, dus je moet structuur verbeteren"*, maar:

> Je dagelijkse organisatie lijkt momenteel de grootste beperking te zijn. Je bent gemotiveerd en je weet goed waar je naartoe wilt, maar je dagelijkse organisatie ondersteunt dat nog onvoldoende. Verbetering hier werkt waarschijnlijk door in beweging, eigen zaken op orde. Daarna komt het nakomen van je eigen afspraken in beeld. Dit onderzoeken we eerst.

De hypothese benoemt altijd eerst wat er wél staat, dan de beperking, dan de doorwerking, en eindigt onderzoekend. Getest: geen scores in de tekst, altijd een sterkte benoemd, altijd een onderzoekende afsluiting.

---

## 5. Sessie 1 — van inzicht naar focus

Zes blokken, 40 minuten. De vragen worden gevuld met wat déze klant heeft geantwoord.

| Blok | Min | Kern |
|---|---|---|
| Opening | 5 | Begint bij de persoon, niet bij de score: *"Als je nu naar je intake kijkt: wat valt jou zelf het meest op?"* |
| Reality check | 10 | Maximaal drie patronen, samengesteld uit de contradicties en inconsistentiesignalen. |
| De echte bottleneck | 10 | *"Wat maakt het momenteel moeilijk voor jou om het leven te leiden dat je eigenlijk wilt?"* — met citaat uit zijn eigen Q8. |
| Focus kiezen | 5 | Eén primaire focus + de hypothese, gevolgd door *"Herken je dit? En zo niet — waar zou jij beginnen?"* |
| Eerste commitment | 5 | *"Wat ben jij bereid om deze week daadwerkelijk anders te doen?"* Maximaal drie acties. |
| Afsluiting | 5 | *"Volgende keer kijken we niet alleen naar wat je hebt gedaan, maar vooral naar wat we daardoor over jou hebben geleerd."* |

De engine stelt drie acties voor die passen bij de gevonden hefboomketen. De coach neemt ze over of vervangt ze.

---

## 6. Wekelijkse check-in — maximaal 5 minuten

**Vier vragen:** wat heb je gedaan → wat gebeurde er → wat heb je geleerd → wat doen we nu.

**Acties:** ✅ volledig (100) · 🟡 gedeeltelijk (50) · ❌ niet (0) → **Action Completion**.

**Reflectie:** wat ging goed · waar liep je tegenaan · wat heb je over jezelf geleerd. De derde is de belangrijkste: die meet zelfinzicht, niet gedrag.

**Zelfbeoordeling:** hoe goed heb je voor jezelf gezorgd · hoe goed ben je je afspraken nagekomen. Signalen, geen automatische scoreverhoging.

**AI-analyse** bereidt betere vragen voor, vervangt de coach niet. Gedetecteerd wordt onder meer:

- *"Geen tijd"* in de reflectie tegenover schermtijd uit de intake → ⚠️ coach check plus de vraag: *"Je geeft aan dat je geen tijd hebt, maar je noemt ook ruim twee uur schermtijd. Hoe verhouden die twee zich volgens jou?"*
- Zelfbeoordeling ≥ 25 punten boven de feitelijke uitvoering.
- Ontbrekend antwoord op de zelfinzichtvraag.
- 100% uitgevoerd zonder merkbaar resultaat → dan is niet de discipline het probleem maar de gekozen aanpak.

---

## 7. Progress Score V1.0

Vijf signalen — bewust niet dezelfde formule als de intake:

| Signaal | Gewicht | Bron |
|---|---|---|
| Gedrag & uitvoering | 30% | gemiddelde action completion |
| Consistentie | 25% | 0,6 × aandeel weken ≥ 50% + 0,4 × langste aaneengesloten reeks |
| Doelvoortgang | 20% | coach of klant, 0–100 |
| Reflectie & zelfinzicht | 15% | kwaliteit van de zelfinzichtantwoorden |
| Coachbeoordeling | 10% | coach, met onderbouwing |

```
ontwikkelingsindex = gewogen gemiddelde van de vijf signalen
Progress Score     = vorige score + (ontwikkelingsindex − 50) × 0,30      (max ±15)
```

**Drie verschillende dingen**, die het systeem nadrukkelijk gescheiden houdt:

| | Vraag |
|---|---|
| Startscore | Waar sta je? |
| Action Completion | Heb je gedaan wat je had afgesproken? |
| Progress Score | Ontwikkel je je daadwerkelijk? |

De twee voorbeelden uit de specificatie reproduceren exact:

| Start | Completion | Index | Progress |
|---|---|---|---|
| 58 | 92% | 80 | **67** — laag begonnen, duidelijke ontwikkeling |
| 75 | 38% | 41 | **72** — sterk begonnen, uitvoering blijft achter |

**Waarborgen:**

- Geen Progress Score vóór **vier** check-ins. De score is bedoeld voor trend, niet voor dagelijkse dopamine.
- Geen score zonder uitvoeringsdata: een score stijgt niet omdat iemand zegt dat het beter gaat.
- Maximaal 15 punten verschuiving per evaluatieperiode, ook bij een perfecte periode.
- Hele punten, geen decimalen.

### Bewijs van ontwikkeling

Naast het cijfer toont het dashboard altijd wat er feitelijk gebeurd is:

> Deze periode heb je: 92% van je afspraken nagekomen · 4 weken achter elkaar consistent · elke week gereflecteerd op je eigen patroon · je doel voor meer dan de helft gehaald · inzicht gekregen in je terugkerende patroon: *"Ik merk dat mijn avonden het grootste probleem zijn"*

Zo kan de coach zeggen: *"Je score is maar 4 punten gestegen, maar je gedrag is fundamenteel veranderd."* Dat voorkomt dat het product draait om één kunstmatig cijfer.

---

## 8. Wat wordt opgeslagen

**Per antwoord:** `question_id · raw_value · normalized_value · score_dimension · score_version · created_at`

**Per dimensie:** `ai_score · coach_score · confidence · ai_observation · coach_adjustment_reason`

**Per intake:** `start_score · foundation_index · foundation_status · primary_focus · secondary_focus · focus_mode · leverage_chain · ai_hypothesis · coach_validated_focus · coach_validation_status · coach_validation_reason`

Alles is aan een versie gekoppeld: `score_version 1.0` en `engine_version 1.0`. Bij een latere V1.1 blijft de oude score intact en is te analyseren waarom dezelfde klant onder V1.0 een 64 kreeg en onder V1.1 een 68.

---

## 9. Wat dit is

Geen dashboard met scores, maar een **coaching decision system**:

> Waar staat deze man → wat houdt hem waarschijnlijk tegen → wat moet eerst → welke actie voeren we uit → wat leren we daarvan → wat moet daarna veranderen?
