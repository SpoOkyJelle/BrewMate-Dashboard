# BrewMate Dashboard

Beheerdashboard voor de BrewMate-app. Leest live de Firestore-data van de app (`users`, `beers`,
`friends`, `friendRequests`) en toont statistieken van alle gebruikers.

- **Overzicht** – live gebruikersteller, biertjes en drinkers van vandaag, trends t.o.v. vorige week,
  biertjes per dag, wanneer er gedronken wordt, trechter van aanmelding tot vaste drinker, groei,
  glasmaten, topdrinkers en een live activiteitenfeed.
- **Gebruikers** – doorzoekbare en sorteerbare tabel met status (actief, nieuw, slapend…), CSV-export.
- **Gebruikersdetail** – statistieken, jaarkalender, biertjes, vrienden en app-instellingen van één gebruiker.
- **Beheerders** – beheerders toevoegen en verwijderen.

Inloggen gaat met hetzelfde Firebase-account als in de app. Alleen beheerders komen binnen.

## Starten

```bash
npm install
npm run dev        # http://localhost:5173
```

## Beheerders

Een account is beheerder zolang er een document `admins/{uid}` bestaat.

- **Eerste beheerder:** maak in de [Firebase-console](https://console.firebase.google.com/project/brewmate-863cd/firestore)
  de collectie `admins` aan met een document waarvan de **ID je user-ID** is (een veld zoals `name` is genoeg).
- **Daarna:** voeg beheerders toe via de pagina **Beheerders** in het dashboard, of met de knop
  **Maak beheerder** op de pagina van een gebruiker. De persoon moet al een BrewMate-account hebben.
- Je kunt jezelf niet verwijderen, zodat er altijd minstens één beheerder overblijft.
- Wie als beheerder verwijderd wordt, verliest direct de toegang (ook als het dashboard open staat).

## Firestore-regels

Het dashboard leest en schrijft rechtstreeks vanuit de browser, dus de Firestore-regels bepalen wat
mag. Beheerders moeten alle collecties kunnen lezen, en de collectie `admins` kunnen lezen en
beheren. Gewone app-gebruikers mogen **nooit** in `admins` schrijven, anders kan iedereen zichzelf
beheerder maken.

In [`firestore.rules.example`](firestore.rules.example) staan regels die dit afdwingen.

## Online zetten

`npm run build` maakt een statische site in `dist/`. Bijvoorbeeld met Firebase Hosting:

```bash
npm i -g firebase-tools
firebase login
firebase init hosting   # project: brewmate-863cd, public dir: dist, single-page app: yes
npm run build && firebase deploy --only hosting
```

## Opmerkingen

- De data komt live binnen via Firestore-listeners; dat is prima voor duizenden gebruikers/biertjes.
  Bij veel grotere aantallen is het beter de berekeningen naar een Cloud Function te verplaatsen.
- Tijden worden getoond in de tijdzone van je browser.
