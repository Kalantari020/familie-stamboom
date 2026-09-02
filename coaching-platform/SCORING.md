# Scoremodel — ontwerpspecificatie v1.0

> Dit document werkt sectie 18, 19 en 36 van de conceptbriefing uit:
> **vraag 1–25 → dimensie → punten → dimensiescore → totaalscore → foundation floor → klantweergave.**
> De implementatie staat in `scoring.js`, de bewijsvoering in `test/scoring.test.js` (54 tests).

---

## 1. Ontwerpprincipes

Zes regels bepalen elke keuze hieronder.

| # | Principe | Consequentie in het model |
|---|---|---|
| 1 | **Niet alle 25 vragen zijn scorevragen.** | 6 vragen zijn expliciet contextvragen zonder punten. |
| 2 | **Ambitie maskeert geen zwak fundament.** | Foundation floor: het totaal wordt geplafonneerd op de fundamentindex + 15. |
| 3 | **Zelfrapportage is geen meting.** | Elke automatisch geschatte waarde is `voorlopig` tot de coach hem valideert. |
| 4 | **Niet ingevuld is niet hetzelfde als slecht.** | Onbeantwoord = `null`; de dimensie herweegt over wat er wél is. |
| 5 | **De score wijst een startpunt aan, geen rangorde.** | De hefboom komt uit achterstand × gewicht × fundamentprioriteit, niet uit het laagste cijfer. |
| 6 | **Het model stelt geen diagnose.** | Uitkomsten heten signaal en hypothese, nooit conclusie. |

---

## 2. Van cijfer naar punten

**Schaalvragen (1–10):** `punten = (x − 1) / 9 × 100`

Bewust niet `x × 10`. Een 1 betekent "dit werkt niet", niet "10 punten waard". Zo is de schaal ook aan de onderkant informatief: het verschil tussen 1 en 3 is even zwaar als tussen 8 en 10.

**Rubrieken (open vragen), 0–3 → 0–100:** `punten = r / 3 × 100`

Drie verwerkingsmodi voor open vragen:

| Modus | Wanneer | Gedrag |
|---|---|---|
| `rubric-auto` | Helderheid en concreetheid zijn in de tekst zelf zichtbaar (V9, V11, V12, V22, V24, V25b) | Automatische schatting op basis van lengte, concrete tijd-/aantalmarkers en richtingwoorden. Ondergrens 0,3 — een onbruikbaar antwoord scoort laag, maar nooit gelijk aan niets. Altijd `voorlopig`. |
| `rubric-coach` | Betekenis vereist interpretatie (V8, uitstelgedrag) | Geen automatische schatting. Neutraal 50, gemarkeerd `vereist coachvalidatie`. |
| `derived` | Keuzevragen met een afleidbare betekenis (V5, V10, V21, V23, coherentie) | Deterministische regel, geen tekstinterpretatie. |

Dat V8 níet automatisch wordt gescoord is een bewuste keuze: woordaantal meet geen uitstelgedrag. Doen alsof dat wel zo is, zou het model precies zo onbetrouwbaar maken als het optellen-en-delen-door-25 dat sectie 18 verwerpt.

---

## 3. De mapping: 25 vragen → 22 scorecomponenten

Gewichten binnen elke dimensie tellen op tot 1,00 (bewaakt door test 1).

### Gezond fundament — 25%

| Component | Bron | Gewicht | Type | Knop? |
|---|---|---|---|---|
| Lichamelijke gezondheid | V13 | 20% | metric | indicator |
| Energie | V14 | 25% | metric | indicator |
| Slaap | V15 | 25% | metric | **knop** (upstream 1,40) |
| Voeding | V16 | 15% | metric | knop (0,95) |
| Beweging | V17 | 15% | behaviour | knop (1,00) |

**Slaap** combineert tevredenheid (70%) met feitelijke bedduur uit bedtijd/opstaantijd (30%): 7–9 uur = 100, 6–7 uur = 65, 9–10 uur = 75, daarbuiten = 30. Zijn de tijden niet ingevuld, dan telt alleen de tevredenheid.

**Beweging** is de enige vraag in de hele intake die feitelijk gedrag meet in plaats van een gevoel. 0 dagen = 0, 1 = 25, 2 = 45, 3 = 65, 4 = 80, 5 = 90, 6 = 97, 7 = 100.

### Structuur & organisatie — 20%

| Component | Bron | Gewicht | Type |
|---|---|---|---|
| Dag- en weekstructuur | V18 | 45% | metric (upstream 1,35) |
| Eigen zaken op orde (self-reliance) | V19 | 35% | metric |
| Tijdbesteding | V21 | 20% | derived (1,20) |

**Tijdbesteding**: 0 tijdlekken benoemd = 90 (niet 100 — onbenoemd is niet bewezen afwezig), 1 = 72, 2 = 52, 3 = 36, 4 = 24, 5+ = 15.

V19 en V20 zijn strikt gescheiden gehouden, zoals de briefing eist: V19 (eigen zaken op orde) laadt op **Structuur**, V20 (afspraken met jezelf nakomen) op **Discipline**. Ze delen geen enkele component.

### Richting — 15%

| Component | Bron | Gewicht | Type |
|---|---|---|---|
| Helderheid toekomstbeeld | V9 | 30% | rubric-auto |
| Concreetheid 3-maandendoel | V12 | 30% | rubric-auto (1,20) |
| Verankering van het waarom | V11 | 25% | rubric-auto (0,90) |
| Focus in levensdomeinen | V10 | 15% | derived (1,10) |

**Focus**: 2–3 domeinen = 100 (scherp), 4 = 85, 1 = 75 (scherp maar smal), 0 of >4 = 40. Meer belangrijk vinden is hier geen betere score.

### Discipline & consistentie — 15%

| Component | Bron | Gewicht | Type |
|---|---|---|---|
| Afspraken met jezelf nakomen | V20 | 50% | metric |
| Uitstelgedrag | V8 | 25% | rubric-coach (1,10) |
| Bewezen consistentie (beweging) | V17 | 25% | behaviour |

V17 laadt bewust op twee dimensies. Reden: het is het enige gedragsbewijs in de intake. In *Fundament* telt het als gezondheid, in *Discipline* als aantoonbare consistentie. Dubbeltelling is hier gewenst — zonder deze koppeling bestaat discipline in het model uitsluitend uit een cijfer dat de klant zichzelf geeft.

### Ownership & verantwoordelijkheid — 15%

| Component | Bron | Gewicht | Type |
|---|---|---|---|
| Benoemt eigen verantwoordelijkheid | V22 | 35% | rubric-auto (1,20) |
| Waar legt hij de oorzaak | V23 | 25% | derived |
| Coherentie wens / doel / blokkade | V7 + V12 + V23 | 25% | derived (1,10) |
| Kan eigen sterke punten benoemen | V5 | 15% | derived, indicator |

**Attributie (V23)**: discipline 95, dagstructuur/planning 90, slaap/voeding/beweging 85, geld/werk 70, anders 60, **mijn omgeving 35**, ik weet het niet 25. De oorzaak buiten jezelf leggen is geen fout, maar wel een lagere ownership-score — precies wat deze dimensie hoort te meten.

**Coherentie** vergelijkt drie antwoorden via een grove domeinclassificatie (slaap, voeding, beweging, structuur, planning, discipline, geld, werk, omgeving, scherm): alle drie hetzelfde domein = 100, 2 van 3 = 70, doel en blokkade uiteen = 45, alle drie verschillend = 35. Dit meet of iemand zijn wens, zijn doel en zijn zelfgenoemde blokkade op één lijn heeft staan.

### Readiness & commitment — 10%

| Component | Bron | Gewicht | Type |
|---|---|---|---|
| Bereidheid (cijfer) | V25 | 40% | metric, indicator |
| Concreet bereid anders te doen | V25b | 35% | rubric-auto (1,20) |
| Waarom nu (urgentie) | V24 | 25% | rubric-auto (0,90) |

V25 is bewust gesplitst. Het cijfer is intentie; het tweede deel is de prijs die iemand bereid is te betalen. "Ik ga er echt voor" en "mijn telefoon gaat om 22:00 de kamer uit" horen niet dezelfde score te krijgen.

### Contextvragen — bewust nul punten

| Vraag | Waarvoor dan wel |
|---|---|
| V1 leeftijd | Levensfase en haalbaarheid. |
| V2 woonsituatie | Omgevingsdruk en beschikbare ruimte. |
| V3 werk/week | Tijdsbudget en belasting. |
| V4 cijfer voor je leven | **Zelfbeeld-kalibratie** — zie §6. |
| V6 drie verbeterpunten | Grondstof voor het focusgesprek. |
| V7 één ding veranderen | Klantperceptie; telt uitsluitend indirect via coherentie. |
| Alle toelichtingen bij V13–V20 | Signalen voor de coach, geen punten. |

Zes van de 25 vragen leveren dus geen directe punten. Dat is geen verspilling: ze doen het werk dat sectie 18 ze toebedeelt — context leveren zonder de score te vervuilen.

---

## 4. Dimensiescore

```
dimensiescore = Σ(componentwaarde × componentgewicht) / Σ(gewicht van beantwoorde componenten)
```

Herweging over de beantwoorde componenten voorkomt dat een overgeslagen vraag als een nul telt. De dekking (`coverage`) wordt meegeleverd; onder de 60% krijgt de coach een `dunne dekking`-signaal.

## 5. Totaalscore en foundation floor

```
ruwe totaalscore   = Σ(dimensiescore × dimensiegewicht)

fundamentindex FI  = 0,45·F + 0,35·S + 0,20·D
plafond            = FI + 15
eindscore          = min(ruwe totaalscore, plafond)
```

Alleen **F**, **S** en **D** vormen de fundamentindex. Richting, ownership en commitment zeggen iets over waar iemand heen wil en hoe graag — niet over of hij zichzelf kan dragen.

Het plafond werkt **asymmetrisch**: een sterk fundament kan de score nooit omhoog trekken, een zwak fundament wel omlaag. De marge van 15 punten laat ruimte voor iemand die zijn basis grotendeels op orde heeft, maar sluit het geval uit dat sectie 19 beschrijft.

**Voorbeeld uit de briefing** (commitment 9, richting hoog, slaap/structuur/discipline 3):

```
ruw 46  →  FI 21  →  plafond 36  →  eindscore 36  →  Level 1
```

De klant ziet 36, geen 46. De commitment-dimensie blijft in de uitsplitsing zichtbaar hoog — de coach heeft die informatie nodig, en de klant verdient te zien dat zijn motivatie wél telt.

## 6. Levels — dubbele poort

| Level | Naam | Score ≥ | Fundamentindex ≥ |
|---|---|---|---|
| 1 | Fundament | 0 | — |
| 2 | Stabiliteit | 45 | — |
| 3 | Groei | 65 | **60** |
| 4 | Zelfstandigheid | 85 | **75** |

Vanaf level 3 geldt een tweede poort op de fundamentindex. Zo kan niemand naar "Groei" doorschuiven op basis van richting en motivatie alleen. Dit is de tweede plek waar *fundament-first* structureel in het systeem zit in plaats van in de tekst.

## 7. Hefboombepaling

Twee stappen, plus één override.

**Stap 1 — welke dimensie?**

```
hefboomwaarde = (100 − dimensiescore) × dimensiegewicht × fundamentprioriteit
fundamentprioriteit:  F 1,30 · S 1,25 · D 1,15 · O 1,00 · R 0,90 · C 0,80
```

**Stap 2 — welke component binnen die dimensie?** Niet simpelweg de laagste. Twee correcties:

- **Indicatoren zijn geen knoppen.** Energie, lichamelijke gezondheid, bereidheid en "kan sterke punten benoemen" zijn uitkomsten, geen handelingen. Ze worden nooit als startpunt gekozen.
- **Stroomopwaarts weegt zwaarder.** `(100 − waarde) × upstream`, met slaap 1,40 en dagstructuur 1,35 bovenaan.

**Override:** slaap onder 40 wint altijd. Slaap werkt door in energie, discipline én structuur; elke andere interventie kost meer en levert minder op zolang iemand structureel te kort slaapt.

Zonder deze correcties koos het model bij het demoprofiel *beweging* (score 25) boven *slaap* (score 40) — het laagste cijfer, maar de verkeerde eerste stap. Sectie 30 van de briefing schrijft precies het tegenovergestelde voor: begin bij slaap en ochtendstructuur. Test 9 borgt dit.

## 8. Klant vs. coach

V23 (zelfgenoemde blokkade) wordt naar een dimensie vertaald en vergeleken met de dimensie die het model aanwijst.

| Uitkomst | Betekenis voor de eerste sessie |
|---|---|
| `aligned: true` | Bevestigen en direct starten. |
| `aligned: false` | Hypothese om samen te toetsen — geen correctie van de klant. |
| `aligned: null` | Onvoldoende data ("ik weet het niet", "anders"). |

Het demoprofiel is het voorbeeld uit sectie 15: de klant zegt *discipline*, het model wijst naar *gezond fundament → slaap*, terwijl structuur (38) onder discipline (47) ligt. De coachingzin die daaruit volgt is niet "je hebt ongelijk" maar "laten we dat de komende weken testen".

## 9. Signalen voor de coach

| Signaal | Trigger | Niveau |
|---|---|---|
| `foundation-floor` | Plafond heeft ingegrepen | hoog |
| `commitment-gap` | Commitment ≥ 75 bij FI < 45 | hoog |
| `kritiek` | Fundament- of structuurcomponent onder 30 | hoog |
| `zelfbeeld` | V4 wijkt ≥ 20 punten af van de eindscore | midden |
| `structuur-vs-discipline` | Structuur ligt ≥ 10 punten onder discipline | midden |
| `spreiding` | 4 domeinen belangrijk bij FI < 50 | midden |
| `data` | Dimensie zonder data of dekking < 60% | laag |

**Zelfbeeld-kalibratie** is de reden dat V4 in de intake staat zonder punten op te leveren. Boven de score = mogelijk onderschat hij wat er structureel misgaat. Onder de score = mogelijk te streng voor zichzelf; check op schaamte of perfectionisme. Beide zijn gespreksmateriaal, geen oordeel.

## 10. Coachvalidatie

Elke component kan door de coach worden overschreven met een waarde 0–100. Een coachwaarde vervangt de automatische schatting en haalt de `voorlopig`-markering weg. Zolang er niet-gevalideerde rubrieken in het profiel zitten, staat het hele assessment op `voorlopig`.

Dit is de brug naar sectie 23 van de briefing: de startscore is zelfrapportage, latere metingen worden steeds meer gedrag. De componenten zijn daarvoor al voorbereid — `kind: 'behaviour'` markeert nu al welke component op feitelijk gedrag rust in plaats van op een gevoel.

## 11. Wat dit model bewust níet doet

- Geen diagnose, geen classificatie, geen medische of psychologische uitspraak.
- Geen ranglijst tussen klanten. De score is alleen vergelijkbaar met de eigen vorige meting.
- Geen automatische conclusie uit open tekst. Tekstschattingen zijn altijd voorlopig en altijd overschrijfbaar.
- Geen beloning voor leeglaten: een onbeantwoorde vraag levert geen punten én geen voordeel (test 10).

## 12. Openstaand voor v2

1. **Gedragsdata** (sectie 23): actiecompletion en streaks als vervanging van `rubric-auto` bij vervolgmetingen.
2. **Hertoetsfrequentie**: hoe vaak hermeten? Voorstel: elke 4 weken, met alleen de metric-vragen (13 vragen, ~3 minuten).
3. **Kalibratie op echte intakes**: de rubriekgrenzen en de plafondmarge van 15 zijn beredeneerd, niet empirisch. Na ~20 intakes bijstellen.
4. **Gewicht van V17-dubbeltelling** valideren zodra er beweegdata uit het traject zelf beschikbaar is.
