# Coach Scoring Framework v1.0 — implementatiedocument

Dit document beschrijft hoe **COACH SCORING FRAMEWORK V1.0** is geïmplementeerd in `scoring.js`, en welke keuzes zijn gemaakt waar het framework ruimte liet. De rekenvoorbeelden uit het framework zijn als tests vastgelegd in `test/scoring.test.js` (111 tests, 0 gefaald).

> Elke berekende score draagt `score_version: "1.0"`. Wijzigt de methodiek, dan wijzigt de versie — oude scores blijven berekend met de versie waaronder ze zijn ontstaan (§30).

---

## 1. De drie soorten vragen (§3)

| Soort | Aantal | Gedrag |
|---|---|---|
| **Scorevragen** | 17 | Leveren direct punten via een vaste conversie. |
| **Contextvragen** | 7 | Beïnvloeden de score aantoonbaar niet (getest). |
| **Validatie / modifier** | 1 | Q21 corrigeert structuur via de coach, met maximaal ±10. |

De 17 scorevragen leveren **20 componenten**, omdat drie vragen in twee dimensies laden: Q19 (Structuur + Ownership), Q25 (Discipline + Readiness) en Q12 (Richting + Readiness). Dat is geen dubbeltelling per ongeluk — het framework schrijft die kruisverbanden expliciet voor in §6, §8, §9 en §10.

### Contextvragen — geen punten

Q1 leeftijd · Q2 woonsituatie · Q3 werk/week · Q4 levenswaardering · Q5 wat gaat goed · Q6 wat verbeteren · Q23 wat houdt je tegen.

Q4 en Q23 doen wel werk: Q4 voedt een **self-image check** (afwijking ≥ 25 punten van de Foundation Index), Q23 voedt de klant-vs-coachvergelijking en de coachingprioriteit. Punten leveren ze niet.

### Eén opgeloste dubbelzinnigheid

§4 noemt Q7, Q9, Q11 en Q24 bij de vragen "die geen directe score krijgen", terwijl §7, §9 en §10 er gewichten aan toekennen. Dit is opgelost volgens §3: ze krijgen **geen directe numerieke conversie**, maar een **AI-baseline in een band** die de coach kan bevestigen of aanpassen. In de UI zijn ze gemarkeerd met `AI` plus de band waarin ze vallen. Q23 en Q5 krijgen wél helemaal geen score — die staan in geen enkele dimensielijst.

---

## 2. Conversies (§5)

**Schaalvragen 1–10:** `punten = score × 10`. Een 7 wordt 70.

**Beweging (Q17)** — bewust niet lineair, zodat 7 dagen sporten niet als norm wordt gepresenteerd:

| Dagen | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| Score | 0 | 20 | 35 | 50 | 65 | 80 | 90 | 100 |

**Open vragen** krijgen een AI-baseline in een van vier banden (§7/§8), met de middenwaarde als score:

| Band | Bereik | Baseline |
|---|---|---|
| Geen / niet benoembaar | 0–25 | 15 |
| Aanwezig maar vaag | 26–50 | 40 |
| Duidelijk | 51–75 | 65 |
| Duidelijk, concreet en persoonlijk | 76–100 | 85 |

De beoordeling gebruikt kenmerken die in de tekst zelf zichtbaar zijn: lengte, concrete tijd- en aantalmarkers, vaagheidswoorden, onzekerheid ("weet niet"), interne versus externe attributie, ernstmarkers ("altijd", "al jaren"), urgentie en persoonlijke verankering. Per vraag geldt een eigen regel — Q8 is bijvoorbeeld een **negatieve** indicator: hoe sterker het uitstelpatroon, hoe lager de score.

Elke AI-baseline levert een `ai_observation` die in de coachomgeving zichtbaar is, bijvoorbeeld: *"Ownership-signaal: verantwoordelijkheid vooral buiten zichzelf gelegd."* Nooit: *"deze persoon neemt geen verantwoordelijkheid"* (§9).

---

## 3. De zes dimensies

### 🧱 Gezond fundament — 25% (§5)

Ongewogen gemiddelde van vijf vragen: `(Q13 + Q14 + Q15 + Q16 + Q17) / 5`.

Rekenvoorbeeld uit het framework: 70 + 60 + 50 + 60 + 65 → **61**. ✔ getest.

Slaapduur en slaapritme worden **niet** in de score verwerkt. Ze valideren de zelfscore: bij 8/10 met structureel 4–5 uur slaap blijft de score 80 en verschijnt een ⚠️ Sleep validation signal. Zo trekt het systeem geen medische conclusie.

### 📅 Structuur & organisatie — 20% (§6)

`(Q18 + Q19) / 2`. Q20 hoort hier bewust niet — die zit bij discipline.

Rekenvoorbeeld: (40 + 60) / 2 = **50**. ✔ getest.

**Q21 is een modifier, geen component.** Het systeem beoordeelt de tijdsbesteding op laag / gemiddeld / hoog en stelt een correctie voor van 0, −5 of −10. Die correctie wordt **niet automatisch toegepast**: de coach past hem toe en moet een reden opgeven. Correcties zijn begrensd op ±10 en zichtbaar als `50 → 45 — veel digitale afleiding`.

### 🧭 Richting — 15% (§7)

| Vraag | Gewicht |
|---|---|
| Q9 — 3-jaarsbeeld | 30% |
| Q10 — prioritering levensgebieden | 15% |
| Q11 — waarom / betekenis | 25% |
| Q12 — doel voor 3 maanden | 30% |

Q10 meet prioritering, niet ambitie: 1–2 kernprioriteiten → 100, 3–4 → 90, 5+ → 70, geen keuze → 40. Meer belangrijk vinden levert geen hogere score op.

### 🔥 Discipline & consistentie — 15% (§8)

Q8 30% · Q20 45% · Q25 25%.

Q25 levert hier het cijfer; de open toelichting valideert het. Een 9/10 naast "ik wil eigenlijk niets veranderen" verlaagt de score niet, maar levert een ⚠️ Commitment inconsistency.

### 🛡️ Ownership & verantwoordelijkheid — 15% (§9)

Q19 40% · Q22 40% · Q7 20%.

### 🚀 Readiness & commitment — 10% (§10)

Q24 35% · Q25 50% · Q12 15%.

---

## 4. Totaalscore (§11)

```
Startscore = F×0,25 + S×0,20 + R×0,15 + D×0,15 + O×0,15 + C×0,10
```

Rekenvoorbeeld §12: 60 / 50 / 80 / 55 / 75 / 90 → 15 + 10 + 12 + 8,25 + 11,25 + 9 = **65,5 → 66**. ✔ getest.

### Geen harde score-cap (§15)

De totaalscore wordt **niet** geplafonneerd. Een klant met een zwak fundament maar sterke richting, discipline, ownership en readiness houdt een reële totaalscore; de Foundation Status draagt het andere deel van de boodschap.

Rekenvoorbeeld §15: fundament 35, structuur 35, richting 95, discipline 85, ownership 90, readiness 100 → **totaal 66** naast **Foundation Status 🔴 Stabiliseren**. Beide staan tegelijk op het dashboard. ✔ getest.

---

## 5. Foundation Index en Status (§13/§14)

```
Foundation Index = (Gezond Fundament + Structuur) / 2
```

| Index | Status | Focus |
|---|---|---|
| 0–39 | 🔴 Stabiliseren | Eerst functioneren en stabiliseren. |
| 40–59 | 🟡 Opbouwen | Structuur en consistentie opbouwen. |
| 60–74 | 🟢 Stevig | Fundament onderhouden en gericht groeien. |
| 75–100 | 🔵 Sterk | Groei, prestaties en verdere ontwikkeling. |

Alle acht grenswaarden zijn getest.

### Scorebanden (§27)

0–39 Instabiel · 40–59 In opbouw · 60–74 Stevige basis · 75–89 Sterk niveau · 90–100 Zeer sterk. Beschrijvend, niet normatief.

---

## 6. Prioriteitslogica (§16) en minimum foundation regel (§17)

**Stap 1 — hefboom:** `(100 − dimensiescore) × dimensiegewicht`, aflopend gesorteerd; bij gelijke hefboom wint de laagste score.

Rekenvoorbeeld §16: 72 / 42 / 80 / 48 / 70 / 90 → eerste focus **Structuur**, tweede spoor **Discipline**. ✔ getest.

**Stap 2 — minimum foundation regel:** ligt Gezond fundament óf Structuur onder 40, dan mag de eerste aanbeveling geen groeifocus zijn. Twee uitkomsten:

| Situatie | `focus.rule` |
|---|---|
| Hefboom wees al naar F of S | `minimum-foundation` — de regel bevestigt de keuze |
| Hefboom wees elders | `minimum-foundation-override` — de focus verschuift naar de laagste van F/S |

Het groeidoel wordt nooit afgewezen. Alleen de route ernaartoe verandert: *"Doel: bedrijf opbouwen. Eerste focus: fundament/structuur."*

De coach kan de eerste focus altijd handmatig overrulen (`focus.rule: coach-override`).

---

## 7. Confidence (§18)

Elke dimensie krijgt naast een score een betrouwbaarheid: 🟢 Hoog · 🟡 Medium · 🔴 Laag.

De rang begint op basis van het aandeel van de dimensie dat op AI-schattingen rust:

| Aandeel AI-geschat | Startrang |
|---|---|
| 0% (alleen cijfers) | Hoog |
| ≤ 50% | Medium |
| > 50% | Laag |

Daarna één stap omlaag per onvolledige component, en één stap omlaag bij een openstaande coach check. Een door de coach vastgestelde dimensiescore staat altijd op **Hoog**.

In de praktijk: Gezond fundament en Structuur starten hoog (puur cijfermatig), Richting en Ownership starten lager (grotendeels open vragen). Dat is de bedoeling — het vertelt de coach precies waar de score nog een indicatie is en geen conclusie.

---

## 8. Inconsistentiesignalen (§19)

Zes detectoren. **Geen enkele verlaagt automatisch een score.** Alle zes produceren een ⚠️ Coach Check.

| Signaal | Trigger |
|---|---|
| Commitment inconsistency | Q25 ≥ 8 terwijl de toelichting geen concrete verandering benoemt |
| Self-assessment inconsistency | Q20 ≥ 8 terwijl de toelichting een structureel patroon beschrijft |
| Direction inconsistency | Richting ≥ 70 terwijl toekomstbeeld of doel niet benoembaar is |
| Health validation signal | Q13 ≥ 8 terwijl concrete klachten worden genoemd |
| Sleep validation signal | Zelfscore hoog bij korte slaapduur, of structureel < 6 uur |
| Self-image check | Q4 ligt ≥ 25 punten boven de Foundation Index |

Alle vier de voorbeelden uit §19 zijn als test opgenomen, inclusief de controle dat de onderliggende score onveranderd blijft.

---

## 9. Coach override (§20)

Een override — op dimensieniveau of op componentniveau — vereist **een nieuwe score én een reden**. Zonder reden wordt de override geweigerd en verschijnt een waarschuwing; de score blijft ongewijzigd. Getest in beide richtingen.

De AI-baseline blijft bewaard naast de coachscore:

```
Discipline: 52 → 40
Reden: concrete voorbeelden tonen structureel niet nakomen
```

Zo ontstaat het spoor **AI baseline → Coach validated score** dat §20 voorschrijft.

---

## 10. Opslagstructuur (§30)

De scoring zit niet hardcoded in de frontend. `computeScore()` levert een `record` met exact de velden uit §30:

```
score_version · score_date · question_id · raw_value · normalized_value ·
score_dimension · dimension_score · confidence · ai_observation ·
inconsistency_flag · coach_adjusted_score · coach_adjustment_reason
```

Plus een dimensieniveau met `ai_dimension_score` naast `dimension_score`, zodat de baseline en de gevalideerde score gescheiden opgeslagen kunnen worden. Het volledige record is zichtbaar onderin de coachomgeving en is direct geschikt als database-payload.

---

## 11. Score versus acties (§24)

Twee gescheiden systemen. De score zegt *waar sta je*, de acties zeggen *wat doe je*. Bij hoge completion en een nog lage score toont het klantdashboard expliciet:

> Je staat nog niet waar je wilt staan, maar je gedrag laat zien dat je daadwerkelijk aan het veranderen bent.

Conform §22 mag een score niet stijgen omdat iemand zegt dat het beter gaat: een nieuwe meting legt een nieuw meetmoment vast, gebaseerd op opnieuw ingevulde antwoorden en coachvalidatie.

---

## 12. Taal (§26)

De verboden formuleringen staan expliciet in de code vastgelegd (`Scoring.LANGUAGE.verboden`), zodat ze in reviews en tests herkenbaar blijven. Alle klantgerichte teksten in het prototype gebruiken de goedgekeurde vorm: *"Je huidige discipline-score is 55/100"*, *"Dit is je huidige startpunt"*, *"Je hoeft niet alles tegelijk te veranderen"*.

---

## 13. Openstaand voor v1.1

1. **Gedragsdata (§21/§22).** De componenten zijn voorbereid, maar vervolgmetingen draaien nu nog op dezelfde zelfrapportage. Volgende stap: actiecompletion en consistentie als eigen invoer.
2. **Scoremagnitude (§23).** Het framework wil trend, geen dagelijkse ruis. Voorstel: hermeten per 4 weken, alleen de cijfervragen.
3. **Kalibratie van de AI-banden.** De regels per open vraag zijn beredeneerd, niet empirisch. Na ~20 echte intakes vergelijken met de coachcorrecties die daadwerkelijk zijn toegepast — dat levert precies de data om de banden bij te stellen.
4. **Q21-modifier.** Nu maximaal ±10 op structuur. Zodra er schermtijddata beschikbaar is, kan dit een echte component worden in plaats van een coachcorrectie.
