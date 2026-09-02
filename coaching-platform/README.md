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
| **`SCORING.md`** | **De ontwerpspecificatie van het scoremodel** — de openstaande stap uit sectie 36 van de briefing. |
| `intake.js` | De 25 vragen als data, inclusief introducties en slottekst. |
| `scoring.js` | De scoring-engine. Pure functies, geen DOM. Draait in browser en node. |
| `app.js` | De prototype-UI: intake, klantdashboard, coachomgeving. |
| `style.css` | Styling volgens de UX-principes uit sectie 34. |
| `test/scoring.test.js` | 54 tests op het scoremodel. Geen dependencies. |

## Tests draaien

```
cd coaching-platform && node test/scoring.test.js
```

De tests borgen onder meer:

- gewichten per dimensie tellen op tot 1,00;
- de foundation floor grijpt in bij het voorbeeld uit sectie 19 (ruw 46 → 36, level 1);
- hoge commitment op een zwak fundament levert geen hoog level op;
- contextvragen (V1, V2, V3, V4, V6) beïnvloeden de score aantoonbaar niet;
- de eerste focus wijst altijd naar een knop, nooit naar een indicator;
- een slecht slapende klant krijgt slaap als startpunt, niet het laagste losse cijfer;
- niet ingevuld levert geen punten én geen voordeel.

## Wat werkt

- Volledige intake over 4 delen, met tussentijds opslaan in `localStorage`.
- Startscore, zes dimensiebalken, level, eerste focus, badges, scorehistorie (`Nieuwe meting vastleggen`).
- Coachomgeving: fundamentindex en plafond zichtbaar, klant-vs-coachvergelijking, signalen, het vijflagige assessment (fact / signal / hypothese / verification / decision), volledige score-opbouw per component en een override-veld per component.
- Coachnotities.

## Wat nog niet

Accounts en authenticatie, betaling, backend/database (alles staat nu in `localStorage`), meerdere klanten in het coachoverzicht, acties en reflecties als eigen objecten met completion, geplande reflecties per trajectfase, e-mail/notificaties.

## Belangrijkste openstaande ontwerpkeuzes

Zie `SCORING.md` §12. Kort:

1. Overgang van zelfrapportage naar gedragsdata bij vervolgmetingen (sectie 23 van de briefing).
2. Hertoetsfrequentie — voorstel: elke 4 weken, alleen de 13 metric-vragen.
3. Kalibratie van rubriekgrenzen en de plafondmarge van 15 punten op echte intakes.
