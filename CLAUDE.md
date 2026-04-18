# Familie Stamboom

## Project
- Vanilla JS stamboom-visualisatie app (geen frameworks, geen build tools)
- **Bestanden:** `index.html`, `app.js` (~15K regels), `style.css`
- **Cache-busting:** CSS `style.css?v=87`, JS `app.js?v=487` — verhoog bij elke wijziging
- **Snapshots:** `snapshots_v470.json` (52 trees, alle behalve Alle/Sayedahmed), `snapshots_v376.json` (legacy 7 trees), `.tmp_snapshots\` (chunks)
- **Live:** `https://kalantari020.github.io/familie-stamboom/`
- **Geen Netlify** voor deploy/hosting

## Data
- localStorage key: `familieboom_v11`
- Relaties veld: `state.relationships` (NIET `relations`)
- 216 personen, 380 relaties, 45 stambomen

## PIN
- Volledige toegang: `5768`, alleen-lezen: `1993`
- PIN guard in IIFE — `let`/`const` NIET bereikbaar via `window`/`preview_eval`
- Gebruik `preview_click` voor PIN-invoer

## Dev server
- Port 3456 (via `.claude/launch.json`)
- `smartViewMode` moet `false` zijn voor boomweergave-tests

## Layout engine (`computeLayout`)
- `computeLayout(overrideIds, headId)` — TWEE parameters: Set van person IDs + actieve boom ID
- `headId` is essentieel voor boom-specifieke logica (bijv. neef-nicht reclassificatie voor Fazelahmad)
- `resolveOverlaps()` verschuift alleen horizontaal, nooit verticaal
- Constanten: `NODE_W=180`, `NODE_H=100`, `H_GAP=50`, `V_GAP=90`, `PADDING=50`
- Trees via `computeStambomen()` retourneren `.headId` (niet `.id`)
- Ghost key format: `personId:cg:adjacentTo`

## Belangrijke pipeline-stappen (volgorde)
1. BFS → Partner equalization → Gen cascade → Initial Y
2. GEZIN-SNAPSHOT → GEZIN-CENTERING → T-BAR OVERLAP
3. LEAF-CHILD CENTERING → SIBLING-REUNIFICATIE → GHOST-ADJACENTIE
4. CHILDREN-Y-DISTRIBUTIE → CHILD-Y-PROXIMITY → POST-GAP CENTERING
5. SIBLING-CHILDREN SEPARATION → SIBLING COMPACTION + CENTERING
6. Ghost-sync → Hercentreer loop
7. **POST-COMPACTIE PARTNER TERUGPLAATSING** (NA hercentreer loop)
8. FINALE COMPACTIE → Y-PROXIMITY COMPACTIE → Y-LEVEL GAP COMPRESSIE
9. **BIRTHORDER RE-SORT** (met skip-non-group) → **HALF-SIBLING GROEPERING**
10. CROSS-FAMILY CENTERING → UNIVERSELE CENTERING → GHOST RECHTS
11. GROTE FAMILIE Y-SPREIDING → FINALE CENTERING → X-NORMALISATIE

## Verificatie na layout-wijzigingen
Controleer altijd 0 overlaps op deze bomen:
- Ahmad Saidi (`pmndya3eilyn1`, 29 kaarten) — halfbroers gegroepeerd per moeder
- Ali Ahmad Salehi (`pmndya3ei5vp4`, 13 kaarten) — Shamila naast Hekmatullah
- Hagig Gull (`pmndo2vxafahz`, 79 kaarten) — grootste boom
- Mahmad Salehi (`pmndya3ei0k93`, 15 kaarten)

## Bekende valkuilen
- Latere pipeline-stappen kunnen eerdere fixes ongedaan maken (bijv. hercentreer loop undid POST-COMPACTIE)
- Early de-interleave draait ALLEEN op `pushedYLevels`
- `parentKeyOf[childId]` = gesorteerde ouder-IDs met komma (half-sibling groepering)
