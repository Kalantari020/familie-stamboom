# Coaching Platform — prototype

Werkend prototype van het coachingconcept **"Eerst het fundament, daarna groei"**: intake van 25 vragen → startscore over 6 dimensies → klantdashboard → coachomgeving met assessment en scorevalidatie.

Vanilla JS, geen frameworks, geen build tools — in lijn met de rest van deze repository.

## Openen

```
open coaching-platform/index.html          # werkt rechtstreeks vanaf het bestandssysteem
python3 -m http.server 3457                # of via een server
```

Klik **Demoprofiel** om het scenario uit sectie 15 van de briefing te laden: de klant zegt *"mijn probleem is discipline"*, terwijl de data naar slaap en structuur wijst.

## Bestanden

| Bestand | Inhoud |
|---|---|
| `CONCEPT.md` | Het concept, aangescherpt en gestructureerd. |
| **`SCORING.md`** | **Implementatie van COACH SCORING FRAMEWORK V1.0** — vraagmapping, conversies, Foundation Index, confidence, signalen, override en opslagstructuur. |
| **`ENGINE.md`** | **Coaching Engine V1.0** — Priority Engine (5 stappen), validatie op 8 profielen, sessie 1, wekelijkse check-in en Progress Score. |
| `intake.js` | De 25 vragen als data, inclusief introducties en slottekst. |
| `scoring.js` | Startscore-engine. Pure functies, geen DOM. Draait in browser en node. |
| `priority.js` | Priority Engine v1.0 — foundation check, bottleneck, contradicties, leverage, coachvalidatie. |
| `coaching.js` | Sessie 1-gids, wekelijkse check-in-analyse en Progress Score v1.0. |
| `app.js` | De prototype-UI: intake, klantdashboard, coachomgeving. |
| `style.css` | Styling volgens de UX-principes uit sectie 34. |
| `test/scoring.test.js` | 111 tests op de Startscore, getoetst aan de rekenvoorbeelden in het framework. |
| `test/priority.test.js` | 56 tests op de Priority Engine, inclusief de 8 validatieprofielen. |
| `test/coaching.test.js` | 51 tests op sessie 1, check-in en Progress Score. |

## Tests draaien

```
cd coaching-platform
node test/scoring.test.js && node test/priority.test.js && node test/coaching.test.js
```

218 tests, geen dependencies.

De tests toetsen rechtstreeks aan de rekenvoorbeelden in het framework:

- §5 conversies: `score × 10`, en de volledige bewegingstabel (0/20/35/50/65/80/90/100);
- §5 fundament: 70 + 60 + 50 + 60 + 65 → 61;
- §6 structuur: (40 + 60) / 2 = 50, met coachcorrectie 50 → 45 en begrenzing op ±10;
- §12 totaal: 60/50/80/55/75/90 → 65,5 → 66;
- §13/§14 Foundation Index 55 → 🟡 Opbouwen, en alle acht statusgrenzen;
- §15 geen harde cap: fundament 35 met readiness 100 geeft totaal 66 náást 🔴 Stabiliseren;
- §16 prioriteit: 72/42/80/48/70/90 → eerste focus Structuur, tweede spoor Discipline;
- §17 minimum foundation regel grijpt in zodra F of S onder 40 ligt;
- §19 alle vier inconsistentievoorbeelden, met de controle dat de score níét daalt;
- §20 override zonder reden wordt geweigerd; de AI-baseline blijft bewaard;
- §30 het opslagrecord bevat alle voorgeschreven velden.

## Wat werkt

**Klant (§25):** volledige intake over 4 delen met tussentijds opslaan · startscore · Foundation Status · zes dimensies · eerste focus · doel · acties deze week met completion · mijlpalen · progressie over metingen.

**Coach:** §31-samenvatting (sterkste dimensie, grootste ontwikkelpunt, eerste focus, confidence, coach validation) · coach checks met inconsistentiesignalen · coachinghypotheses · tijdsbestedingsmodifier met voorstel en toepassing · dimensiescores als AI baseline → coach validated met verplichte reden · score-opbouw per vraag met AI-observatie en band · contextvragenoverzicht · acties beheren · sessienotities · het volledige opslagrecord.

## Wat nog niet

Accounts en authenticatie, betaling, backend/database (alles staat nu in `localStorage`), meerdere klanten in het coachoverzicht, acties en reflecties als eigen objecten met completion, geplande reflecties per trajectfase, e-mail/notificaties.

## Belangrijkste openstaande keuzes

Zie `SCORING.md` §13. Kort:

1. Vervolgmetingen op gedragsdata in plaats van zelfrapportage (framework §21/§22).
2. Hermeetfrequentie — voorstel: elke 4 weken, alleen de cijfervragen (§23).
3. Kalibratie van de AI-banden op echte intakes, aan de hand van de coachcorrecties die daadwerkelijk zijn toegepast.
