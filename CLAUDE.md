# Familie Stamboom

## Project
- Vanilla JS stamboom-visualisatie app (geen frameworks, geen build tools)
- **Bestanden:** `index.html`, `app.js` (~15K regels), `style.css`
- **Cache-busting:** CSS `style.css?v=87`, JS `app.js?v=606` — verhoog bij elke wijziging
- **Snapshots:** `snapshots_v606.json` (90 goedgekeurde trees, 0 overlaps — 22-04-2026), `snapshots_v470.json` (legacy), `snapshots_v376.json` (legacy 7 trees)
- **Live:** `https://kalantari020.github.io/familie-stamboom/`
- **Geen Netlify** voor deploy/hosting

## Data
- localStorage key: `familieboom_v11`
- Relaties veld: `state.relationships` (NIET `relations`)
- **426 personen, 786 relaties, 90 stambomen** (data: `familieboom_2026-04-21.json`, DATA_VERSION=102)

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
12. **Agha Gol Hekmat-kids centering** (scoped pmni0s7etyv3g)
13. **Multi-partner cluster herpositionering** (Ahmad Saidi, Ali Ahmad Salehi, Allahmahmad):
    - gen1 rij gesplitst in 2 moeder-clusters, head gecentreerd in gap
    - inlaws adjacent binnen cluster
    - leaf-kids centering onder ouderpaar (optioneel per config)
    - `reassignYByBO` (Allahmahmad): unieke Y-laag per gen1-kind's BO
    - recursieve `centerChildrenUnder` met units [child + partner-adjacent]
    - universele partner-sync (alle descendants)
14. **Mahmoed specific** — Bibirawza+Daad Mahmad adjacent + kids gecentreerd (pmndya3eiti9k)
15. **X-NORMALISATIE** (minX = PADDING)

## Verificatie na layout-wijzigingen
**Snapshot regressie-test verplicht** (`snapshots_v606.json`, 90 trees, 0 overlaps baseline).
Reference trees — 0 diffs verplicht:
- Ahmad Saidi (`pmndya3eilyn1`, 50 kaarten) — cluster-per-moeder (Shafiqa/Laila)
- Ali Ahmad Salehi (`pmndya3ei5vp4`, 15 kaarten) — cluster-per-moeder (Fawziya/Zakira)
- Allahmahmad (`pmo4t07f8o0lo`, 67 kaarten) — cluster-per-moeder (Bibigul/Shah Sultana) + Y-per-BO
- Agha Gol (`pmni0s7etyv3g`, 35 kaarten) — Hekmat-kids centering
- Mahmoed (`pmndya3eiti9k`, 14 kaarten) — Bibirawza+Daad Mahmad adjacent
- Mahmadgul (`pmndyxhre0zi1`, 173 kaarten) — SUB-TREE OVERLAY, T-lijnen via uitgebreide Fix C

## Bekende valkuilen
- Latere pipeline-stappen kunnen eerdere fixes ongedaan maken (bijv. hercentreer loop undid POST-COMPACTIE)
- Early de-interleave draait ALLEEN op `pushedYLevels`
- `parentKeyOf[childId]` = gesorteerde ouder-IDs met komma (half-sibling groepering)

---

## Skills gebruiken (VERPLICHT)

- **Layout-werk** (Y-volgorde, ghost, T-bar, neef-nicht, centering, spacing, pipeline): gebruik **`stamboom-architect`** skill. Voorkomt regressies in goedgekeurde bomen.
- **Niet-layout werk** (kaart-styling, sidebar, PIN, publish, modals, data-import, werkwijze): gebruik **`stamboom`** skill.

Beide skills bevatten de volledige regel-set. Deze CLAUDE.md is de snelle samenvatting.

## Visuele kernregels

- Kaart-kleuren: man blauw, vrouw roze, Hakim (USER_ID `s11`) goud. Gender `?` → neutraal.
- Overleden: **geen kruis** (islamitisch), alleen subtiele tekstmarkering.
- Geen "heden" op kaart — alleen geboortedatum tonen.
- Ghost: gestippelde rand, opacity ~0.65. Ghost-icoon NIET in view-mode of PDF.
- T-lijn dikte neemt af per generatie (stamhoofd dikst).
- Partners altijd direct naast elkaar — gewone lijn, geen boog.
- Stamhoofd direct zichtbaar bij openen (`leftmost X = PADDING = 50`), geen scroll.
- T-lijn-kleurcontrast: buur-sub-gezinnen niet dezelfde warmte-groep (`COLOR_GROUP` check).
- PDF: volledige boom scrollbaar, ghost-UI strippen via `prepareClone`, filename `Stamboom [Naam].pdf`.

## Gedragsregels (niet-layout)

- **Alle-families view**: alleen root-stambomen (hoofd + partner geen ouders elders). Sub-stambomen filteren.
- **Sociale-ouder**: kind verschijnt in bio + social boom. **SayedAhmed-uitzondering**: geen social-parent-lijn.
- **Duplicate-merge** bij start. "Voeg uit bestaande toe" → alleen relatie, geen duplicate persoon.
- **Quick-add**: 6 rijen default, geen toggle. "Kind" → "Andere ouder" default = partner. Kinderen L→R = oud→jong.
- **Dual-PIN**: `1993` view (read-only), `5768` admin. PBKDF2-SHA256 + salt. `READ_ONLY` guards op ALLE write-functies.
- **Publish**: browser → `data/publish-state.json` → GitHub Actions → START_DATA. Token via `localStorage.setGhToken()`, NOOIT in source.
- **Cache-busting**: `APP_VERSION` (`app.js:6`) = `?v=N` in `index.html`. Mismatch = reload-loop.
- **DATA_VERSION** bumpen standaard; **FORCE_RESET_VERSION** alleen bij bewuste user-local overschrijving.
- **UTF-8 zonder BOM** bij START_DATA schrijven (emoji's anders corrupt).
- **Geen Netlify** — categorisch vermijden.

## Werkwijze Hakim

- Taal: Nederlands, direct, kort.
- Root-cause over cosmetisch — Hakim denkt in systemen.
- Iteratie: push → bump `?v=N+1` → hard refresh → feedback. 10-20 pushes/avond normaal.
- Wacht op `DEPLOYED v=N` vóór je "klaar" meldt.
- Test op desktop `:3456` EN mobiel (WhatsApp-link). Lokaal ≠ live, altijd beide bevestigen.
- Bij onduidelijkheid: vraag door (`/grill-me`-stijl) vóór implementatie.
- "Pas voor alle gevallen toe" = generiek, niet ad-hoc. "Doe ze allemaal" = bundel in één push.
- Screenshots: interpreteer beeld vóór je code wijzigt.

## Regressie-preventie

**Alle 90 stambomen goedgekeurd** (22-04-2026) behalve 2 WIP:
- ❌ **Sayedahmed** (`pmndyrysy3eq7`) — WIP
- ❌ **Alle families** (samengestelde view)

**Snapshot baseline**: `snapshots_v606.json` (alle 90 goedgekeurde trees, 0 overlaps totaal).

**Regel 1**: een fix voor boom A breekt boom B — meest voorkomende fout. Altijd snapshot-test draaien vóór push tegen `snapshots_v606.json`.

**Multi-partner stamhoofden** (auto-splitsing per-moeder cluster):
| Boom | Partners | Config in `multiPartnerConfigs` |
|---|---|---|
| Ahmad Saidi | Shafiqa + Laila | leafPairs voor Rafi/Waheed/Fereshta/Mariam |
| Ali Ahmad Salehi | Fawziya + Zakira | leafPairs voor Muqadas+Fahim |
| Allahmahmad | Bibigul + Shah Sultana | `reassignYByBO: true` |

## Volledig regel-rapport

`C:\Administratie\Admin_Systeem\STAMBOOM_REGELS_EN_GELEERDE_LESSEN.md` — gedestilleerd uit chat 309b8bc6 (29 mrt – 20 apr 2026, 915 user-berichten). Zie ook de twee skills voor volledige details per domein.
