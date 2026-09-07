# SAYEDI — beeldmerk

Herteken van het wolfslogo als schone vector. Zelfde idee, andere constructie.

## Wat er anders is

| | Origineel | Nieuw |
|---|---|---|
| Constructie | losse shards, per stuk getekend | één gesloten silhouet met `fill-rule="evenodd"`; contour, oorholtes en gezicht zitten in hetzelfde pad |
| Symmetrie | benaderend, links en rechts wijken af | exact — alle coördinaten zijn gespiegeld om `x = 500` |
| Detail | ± 20 dunne scherven in de ruff | 3 ruff-punten per zijde, zwaarder |
| Snuit | smal, verloopt in de kop | eigen U-vorm die onderin uitloopt in een breed, vlak neusblok |
| Ogen | klein, weinig contrast | scherpe amandelvorm met donkere pupil |
| Kleinste leesbare maat | ± 90 px | **40 px** met `wolf.svg`, **24 px** met `wolf-icon.svg` |

De kop is ook smaller en langer gemaakt (verhouding 0,80 in plaats van 0,93). De oorspronkelijke versie liep breed uit onderaan, waardoor hij eerder als kat dan als wolf las.

## Bestanden

| Bestand | Gebruik |
|---|---|
| `wolf.svg` | Het beeldmerk. `fill="currentColor"`, geen achtergrond — neemt de tekstkleur over. Vanaf 40 px. |
| `wolf-icon.svg` | Vereenvoudigde variant zonder pupillen en met zwaardere vormen. Voor favicon, app-icoon en alles onder 40 px. |
| `logo.svg` | Volledige lockup: beeldmerk, woordmerk, streep en tagline. |
| `wolf-1024-dark.png` · `wolf-1024-light.png` | Export van het beeldmerk, wit op zwart en zwart op wit. |
| `icon-512.png` | Export van het icoon. |
| `logo-1200-dark.png` · `logo-1200-light.png` | Export van de lockup. |
| `wolf.png` · `wolf-icon.png` · `logo.png` | Contactvellen op meerdere maten en achtergronden. Alleen ter controle. |

## Gebruik

```html
<span style="color:#fff; width:48px; display:inline-block">
  <!-- inhoud van wolf.svg -->
</span>
```

Omdat het beeldmerk `currentColor` gebruikt, volstaat één bestand voor wit op zwart, zwart op wit en goud op zwart. Geen aparte kleurversies nodig.

**Vrije ruimte:** minimaal de halve oorhoogte rondom.
**Minimale maat:** 40 px voor `wolf.svg`, daaronder `wolf-icon.svg`.

## Nog te doen vóór drukwerk

Het woordmerk in `logo.svg` staat als `<text>` met een lettertypestack (Inter → Helvetica → Arial). In de browser is dat prima; voor drukwerk of overdracht aan een drukker moet de tekst naar outlines worden omgezet, zodat de letterafstand niet verschuift op een systeem zonder Inter.
