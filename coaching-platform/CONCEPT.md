# Coaching Platform — concept v1.0

**Eerst het fundament, daarna groei.**

Niet omdat groei onbelangrijk is, maar omdat duurzame groei begint bij het vermogen om jezelf te dragen.

---

## 1. Het uitgangspunt

Het doel is niet iemand fitter, productiever of succesvoller maken. Het doel is een man helpen zijn eigen leven te kunnen dragen: verantwoordelijkheid nemen, energie en gezondheid op orde krijgen, genoeg structuur creëren, afspraken met zichzelf nakomen, richting bepalen — en pas dán gericht groeien.

> Je hoeft niet perfect te zijn om te groeien. Je moet stabiel genoeg zijn om groei vol te houden.

Fundament betekent dus niet "alles perfect doen", maar "jezelf voldoende kunnen dragen".

De coach vraagt daarom niet *"wat wil je allemaal verbeteren?"* maar **"wat moet er eerst veranderen zodat de rest makkelijker wordt?"**

Het fundament is geen eindstation. De volgorde is **Fundament → Stabiliteit → Groei → Zelfstandigheid**, niet Fundament → Fundament → Fundament.

## 2. Rol en grenzen van de coach

De coach neemt het leven van de klant niet over. De klant blijft eigenaar van zijn keuzes, acties, gedrag en voortgang.

De coach levert: inzicht, structuur, reflectie, prioriteit, accountability, patroonherkenning, het uitdagen van excuses, de volgende stap, vastgehouden focus.

**Harde grens.** De coach stelt geen medische of psychologische diagnose. Het platform presenteert nooit conclusies als "je hebt een burn-out", "je hebt ADHD", "je bent verslaafd". Wel: *"dit lijkt een belangrijk patroon dat we verder moeten onderzoeken."* Waar professionele hulp nodig is, wordt dat herkend en geadviseerd; coaching kan daarnaast doorgaan binnen haar eigen grenzen.

**Afhankelijkheid is een faalmodus, geen verdienmodel.** Het eindpunt van elk traject is dat de klant zichzelf beter begrijpt en zijn leven zelfstandig kan sturen.

## 3. De klantreis

| Fase | Kern |
|---|---|
| Aanmelding | Filosofie vooraf duidelijk: duurzame verandering, geen motivatieboost. |
| Intake | 25 vragen. Doel: een bruikbaar eerste beeld, geen levensverhaal. |
| Startscore | Nulmeting na intake en betaling. Momentopname, geen oordeel. |
| Eerste sessie | Geen herhaling van de intake: *waar sta je → wat speelt er echt → waar beginnen we.* |
| Traject | Wekelijkse call van 30–45 minuten, één focus per periode, reflectie op het juiste moment. |
| Afronding | De klant stuurt zelfstandig verder. |

**De ontwikkeling van de vragen loopt mee met het traject:**

```
Intake        Waar sta je?
Begin         Wat moet er eerst veranderen?
Midden        Waarom doe je wat je doet?
Later         Wie wil je worden en welk leven wil je bouwen?
Einde         Hoe zorg je dat je dit zelfstandig blijft doen?
```

Diepere vragen horen niet in de intake. Een vraag krijgt waarde zodra de klant er ervaring bij heeft. Ze verschijnen in het dashboard als **reflectie** — nooit als "huiswerk".

## 4. Wat de intake moet doen

Informatief genoeg voor de coach. Niet onnodig lang. Geen psychologisch onderzoek. Wel genoeg zelfreflectie oproepen.

Gewenste beleving na afloop: *"Deze coach wil me serieus begrijpen"* → *"Ik ben benieuwd wat hij hieruit haalt."* De intake moet nieuwsgierigheid creëren, geen uitputting.

De volledige vragenset staat in [`intake.js`](intake.js); de introducties en slottekst zijn woordelijk overgenomen uit de briefing.

## 5. Klant versus coach

Het platform onderscheidt structureel twee dingen:

- wat de **klant** denkt dat zijn grootste probleem is (V23);
- wat het **model** aanwijst als grootste beperkende factor.

Die kunnen samenvallen. Juist als ze dat níet doen ontstaat de coaching:

> Klant: "Ik heb geen discipline."
> Coach: "Je hebt misschien niet primair een disciplineprobleem, maar een structuurprobleem. Laten we dat de komende weken testen."

Dat is een hypothese, geen correctie en geen diagnose.

## 6. Coach assessment

Intern werkt de coach met vijf lagen, zodat 25 intakevragen nooit tot een voorbarige conclusie leiden:

1. **Fact** — wat zegt de klant letterlijk?
2. **Signal** — wat valt op?
3. **Hypothese** — wat zou hieronder kunnen liggen?
4. **Verification** — wat moeten we eerst onderzoeken?
5. **Coaching decision** — wat betekent dit voor de coaching?

## 7. De score

Zes dimensies, gewogen: gezond fundament 25%, structuur & organisatie 20%, richting 15%, discipline & consistentie 15%, ownership & verantwoordelijkheid 15%, readiness & commitment 10%.

De score is nulmeting, bewustwording, gamification en voortgangsindicator. Uitdrukkelijk **geen** psychologische meting en geen oordeel over iemands waarde. Het doel is niet een hoge startscore, maar weten waar je staat en aantoonbaar vooruitgaan.

*Fundament-first* zit niet in een kunstmatige afstraffing van de totaalscore. De totaalscore blijft een echte totaalscore; de **Foundation Index** — het gemiddelde van gezond fundament en structuur — draagt de tweede helft van de boodschap. Zo kan het dashboard tegelijk laten zien: *startscore 66* én *Foundation Status 🔴 Stabiliseren*. Dat is eerlijker dan één cijfer dat beide dingen probeert te zeggen.

Ligt gezond fundament óf structuur onder 40, dan mag de eerste aanbeveling geen groeifocus zijn (**minimum foundation regel**). Het groeidoel wordt niet afgewezen — de route ernaartoe wordt aangepast.

Volledige uitwerking: [`SCORING.md`](SCORING.md).

## 8. Eén hefboom tegelijk

Niet alles wat verbeterd kan worden, moet nu verbeterd worden. Een klant met problemen op slaap, voeding, sport, telefoon, geld, carrière, planning én discipline krijgt geen plan met twaalf gewoontes. Hij krijgt: *"we beginnen de komende twee weken met je slaap en je ochtendstructuur."*

Het model kiest daarom niet het laagste cijfer, maar de grootste hefboom: achterstand × gewicht × fundamentprioriteit, met stroomopwaartse componenten voorrang boven stroomafwaartse — en indicatoren (energie, gezondheid) uitgesloten als startpunt, omdat het uitkomsten zijn en geen knoppen.

## 9. Wat de klant wel en niet ziet

**Wel:** score en dimensies, huidige focus, acties, consistentie, reflecties, doel en richting, scorehistorie.

**Niet:** ruwe hypotheses, interne observaties, coachnotities, risico-inschattingen. De klant krijgt de bruikbare conclusie en de volgende stap — tenzij de coach bewust iets deelt.

## 10. Gamification

Volwassen, niet infantiel. De progressie loopt via de Foundation Status (Stabiliseren → Opbouwen → Stevig → Sterk) en mijlpalen: eerste week, 7 dagen consistent, eerste maand, +10 punten, eerste doel behaald, fundament opgebouwd, zelfstandig traject afgerond.

Gamification moet gedrag versterken, niet het coachingproces verkleuteren. De score is het dashboardlampje, niet de bestemming — en verandert in trendstappen, niet in dagelijkse decimalen.

**Score en acties zijn twee gescheiden systemen.** Een lage startscore met hoge weekcompletion is een goed teken, en wordt ook zo benoemd.

## 11. UX-principes

Volwassen, premium, rustig, overzichtelijk. Lage cognitieve belasting. Duidelijke progressie. Eén duidelijke volgende stap per periode. De gebruiker moet altijd weten: *dit is waar ik nu aan werk.*

## 12. MVP-scope

**Klant:** account · intake · startscore · dashboard · huidige focus · acties · reflecties · progressie · scorehistorie · doel.

**Coach:** klantenoverzicht · intake bekijken · score bekijken · score aanpassen/valideren · coach assessment · doelen · acties · reflecties · sessienotities · progressie.

Wat in dit prototype al werkt en wat nog niet: zie [`README.md`](README.md).

## 13. Het model in negen stappen

```
UNDERSTAND  →  ASSESS  →  FOCUS  →  ACT  →  REFLECT
                                              ↓
        INDEPENDENCE  ←  OWN  ←  GROW  ←  BUILD
```

## 14. De kernvraag

Bij elke situatie moet het systeem uiteindelijk helpen beantwoorden:

> **Wat moet deze man nu als eerste veranderen om de rest van zijn leven beter bestuurbaar te maken?**

Dat is de kern. Alle techniek in dit platform bestaat om die vraag beter te beantwoorden — nooit andersom.
