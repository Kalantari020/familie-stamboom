/* Coaching Platform — Intake definitie (25 vragen, 4 categorieen)
   Pure data. Geen scoringlogica hier: die staat in scoring.js.
   Werkt in browser (globale INTAKE) en in node (module.exports). */

const INTAKE = {
  intro: [
    'Deze intake helpt mij om te begrijpen waar je nu staat, wat voor jou belangrijk is en waar je naartoe wilt.',
    'Er zijn geen goede of foute antwoorden. Ik zoek geen perfect beeld van je leven. Ik wil vooral een eerlijk beeld van waar je nu staat, zodat we samen kunnen bepalen waar je het beste kunt beginnen.',
    'Neem rustig de tijd. Vooral bij de open vragen is een eerlijk antwoord waardevoller dan een antwoord waarvan je denkt dat het ‘goed’ klinkt.'
  ],
  outro: [
    'Bedankt voor je openheid.',
    'Je hoeft op basis van deze intake nog niets op te lossen. Je antwoorden geven ons een startpunt voor onze eerste sessie.',
    'Tijdens onze intake gaan we niet simpelweg alle vragen opnieuw door. We gebruiken je antwoorden om te kijken: waar sta je? → wat speelt er echt? → waar beginnen we? De rest ontdekken we stap voor stap gedurende het traject.'
  ],
  categories: [
    {
      id: 'c1',
      title: 'Jouw leven vandaag',
      intro: 'Voordat we iets willen veranderen, moeten we eerst begrijpen hoe je leven er nu uitziet. Wat gaat er goed? Waar loop je tegenaan? En hoe ervaar jij je eigen leven? Er is geen oordeel. Het gaat er niet om hoe je leven eruit zou moeten zien, maar om hoe het daadwerkelijk is.',
      questions: [
        { n: 1, id: 'q1', type: 'number', label: 'Hoe oud ben je?', min: 16, max: 99 },
        { n: 2, id: 'q2', type: 'choice', label: 'Met wie woon je momenteel?',
          options: ['Alleen', 'Partner', 'Gezin / kinderen', 'Ouders', 'Huisgenoten', 'Anders'], otherOn: 'Anders', otherId: 'q2_t' },
        { n: 3, id: 'q3', type: 'text', label: 'Wat doe je voor werk of studie? Hoe ziet een normale week er voor jou uit?' },
        { n: 4, id: 'q4_s', type: 'scale', label: 'Als je je leven vandaag een cijfer van 1–10 geeft, welk cijfer geef je dan?',
          followUp: { id: 'q4_t', label: 'Waarom dat cijfer?' } },
        { n: 5, id: 'q5', type: 'triple', label: 'Welke 3 dingen in je leven gaan goed en waar ben je trots op?',
          ids: ['q5_1', 'q5_2', 'q5_3'] },
        { n: 6, id: 'q6', type: 'triple', label: 'Welke 3 dingen in je leven zou je graag willen verbeteren?',
          ids: ['q6_1', 'q6_2', 'q6_3'] },
        { n: 7, id: 'q7', type: 'text', label: 'Als je vandaag één ding in je leven mocht veranderen, wat zou je kiezen?' },
        { n: 8, id: 'q8', type: 'text', label: 'Wat weet je dat je eigenlijk zou moeten doen, maar stel je steeds uit of houd je niet vol?' }
      ]
    },
    {
      id: 'c2',
      title: 'Jouw richting',
      intro: 'Veranderen is makkelijker wanneer je weet waarom je het doet en waar je naartoe wilt. Je hoeft nog niet precies te weten hoe je leven er over drie jaar uitziet. Het gaat erom dat we ontdekken wat voor jou belangrijk is en welke richting je op wilt.',
      questions: [
        { n: 9, id: 'q9', type: 'text', label: 'Waar zou je over 3 jaar trots op willen zijn?' },
        { n: 10, id: 'q10', type: 'multi', max: 4, label: 'Welke onderdelen van je leven vind je het belangrijkst? Kies maximaal 4.',
          options: ['Gezondheid & lichaam', 'Mentale kracht & discipline', 'Werk & carrière', 'Geld & financiële vrijheid',
            'Relatie & gezin', 'Familie & vrienden', 'Persoonlijke ontwikkeling', 'Vrijheid & lifestyle', 'Geloof & spiritualiteit', 'Anders'],
          otherOn: 'Anders', otherId: 'q10_t' },
        { n: 11, id: 'q11', type: 'text', label: 'Waarom zijn deze dingen belangrijk voor je?' },
        { n: 12, id: 'q12', type: 'text', label: 'Als je de komende 3 maanden maar één belangrijk doel mocht kiezen, welk doel zou je dan kiezen?' }
      ]
    },
    {
      id: 'c3',
      title: 'Jouw fundament',
      intro: 'Groeien wordt een stuk moeilijker als de basis van je leven niet goed genoeg werkt. Met je fundament bedoelen we de dingen die ervoor zorgen dat je jezelf goed kunt dragen: gezondheid, energie, slaap, voeding, beweging en structuur. Het hoeft niet perfect te zijn. We willen vooral weten waar je basis sterk is en waar verbetering nodig is.',
      sections: [
        { after: 12, title: 'Gezondheid' },
        { after: 17, title: 'Structuur' }
      ],
      questions: [
        { n: 13, id: 'q13_s', type: 'scale', label: 'Hoe gezond voel je je lichamelijk?',
          followUp: { id: 'q13_t', label: 'Waarom dat cijfer?' } },
        { n: 14, id: 'q14_s', type: 'scale', label: 'Hoeveel energie heb je meestal op een normale dag?',
          followUp: { id: 'q14_t', label: 'Wat heeft hier vooral invloed op?' } },
        { n: 15, id: 'q15_s', type: 'scale', label: 'Hoe tevreden ben je met je slaap?',
          extra: [
            { id: 'q15_bed', type: 'time', label: 'Hoe laat ga je meestal slapen?' },
            { id: 'q15_rise', type: 'time', label: 'Hoe laat sta je meestal op?' }
          ] },
        { n: 16, id: 'q16_s', type: 'scale', label: 'Hoe tevreden ben je met hoe je eet?',
          followUp: { id: 'q16_t', label: 'Wat zou je hierin willen verbeteren?' } },
        { n: 17, id: 'q17_n', type: 'days', label: 'Op hoeveel dagen per week beweeg of sport je minimaal 30 minuten?',
          followUp: { id: 'q17_t', label: 'Wat doe je dan?' } },
        { n: 18, id: 'q18_s', type: 'scale', label: 'Hoe gestructureerd zijn je dagen en weken?',
          followUp: { id: 'q18_t', label: 'Hoe plan je je dagen en weken?' } },
        { n: 19, id: 'q19_s', type: 'scale', label: 'Hoe goed lukt het je om je eigen zaken op orde te houden?',
          hint: 'Denk aan administratie, huis, verplichtingen, dingen die geregeld moeten worden.',
          followUp: { id: 'q19_t', label: 'Wat laat je regelmatig liggen?' } },
        { n: 20, id: 'q20_s', type: 'scale', label: 'Hoe goed lukt het je om afspraken met jezelf na te komen?',
          hint: 'Dit is iets anders dan vraag 19. Hier gaat het om: doe je wat je jezelf hebt voorgenomen?',
          followUp: { id: 'q20_t', label: 'Waar lukt dat je momenteel niet goed?' } },
        { n: 21, id: 'q21', type: 'multi', label: 'Waar gaat momenteel te veel van je tijd naartoe?',
          options: ['Social media', 'Gamen', 'Netflix / streaming', 'YouTube', 'Telefoon algemeen', 'Uitgaan', 'Anders'],
          otherOn: 'Anders', otherId: 'q21_t' },
        { n: 22, id: 'q22', type: 'text', label: 'Welke verantwoordelijkheid in je leven zou je momenteel serieuzer moeten nemen?' }
      ]
    },
    {
      id: 'c4',
      title: 'Wat staat je in de weg?',
      intro: 'Je weet misschien al wat je wilt veranderen. Maar weten wat je wilt is iets anders dan begrijpen wat je tegenhoudt. Door daar eerlijk naar te kijken, kunnen we voorkomen dat we alleen de symptomen aanpakken. Soms ligt het probleem ergens anders dan je in eerste instantie denkt.',
      questions: [
        { n: 23, id: 'q23', type: 'choice', label: 'Als je eerlijk kijkt naar je leven: welk onderdeel houdt je momenteel het meest tegen om verder te komen?',
          options: ['Slaap & rust', 'Voeding & gezondheid', 'Beweging & conditie', 'Dagstructuur', 'Planning & organisatie',
            'Discipline & volhouden', 'Geld', 'Werk & carrière', 'Mijn omgeving', 'Ik weet het niet', 'Anders'],
          otherOn: 'Anders', otherId: 'q23_t' },
        { n: 24, id: 'q24', type: 'text', label: 'Waarom wil je juist nu iets veranderen in je leven?' },
        { n: 25, id: 'q25_s', type: 'scale', label: 'Hoeveel moeite wil je de komende 3 maanden doen om je doel te bereiken?',
          followUp: { id: 'q25_t', label: 'Wat ben je concreet bereid anders te doen?' } }
      ]
    }
  ]
};

if (typeof module !== 'undefined' && module.exports) module.exports = { INTAKE };
