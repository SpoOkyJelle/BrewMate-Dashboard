# BrewMate Dashboard

Beheerdashboard voor de BrewMate-app. Leest live de Firestore-data van de app (`users`, `beers`,
`friends`, `friendRequests`) en toont statistieken van alle gebruikers.

- **Overzicht** – live gebruikersteller, biertjes en drinkers van vandaag, trends t.o.v. vorige week,
  biertjes per dag, wanneer er gedronken wordt, trechter van aanmelding tot vaste drinker, groei,
  glasmaten, topdrinkers en een live activiteitenfeed.
- **Gebruikers** – doorzoekbare en sorteerbare tabel met status (actief, nieuw, slapend…), CSV-export.
- **Gebruikersdetail** – statistieken, jaarkalender, biertjes, vrienden en app-instellingen van één gebruiker.
- **Behoud** – per aanmeldmaand welk deel van de gebruikers na 1, 2, … weken/maanden nog actief is.
- **Kaart** – waar biertjes gelogd zijn (hittekaart of losse biertjes) en de populairste plekken.
- **Netwerk** – vriendschappen als netwerk, met automatisch gevonden groepjes en drinkmaatjes.
- **Vergelijken** – 2 tot 4 gebruikers naast elkaar.
- **Berichten** – pushberichten sturen naar gebruikers (via een Cloud Function, zie hieronder).
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

## Pushberichten

De pagina **Berichten** stuurt pushberichten via de Cloud Function `sendPush` (map `functions/`).
Dat kan niet rechtstreeks vanuit de browser: Expo's push-dienst staat geen browserverzoeken toe,
en zo blijven de push-tokens op de server. De functie:

- controleert of de afzender in `admins` staat;
- slaat gebruikers over die pushmeldingen hebben uitgezet (`notifyPushEnabled: false`);
- verstuurt in groepjes van 100 via Expo en ruimt tokens op van apparaten die de app niet meer hebben;
- schrijft elk verstuurd bericht naar de collectie `pushLog` (zichtbaar onder "Eerder verstuurd").

Eenmalig uitrollen (het project moet op het Blaze-abonnement staan):

```bash
npm i -g firebase-tools
firebase login
cd functions && npm install && cd ..
firebase deploy --only functions
```

Gebruik je in Expo "Enhanced push security"? Zet dan je Expo access token in `functions/.env`
als `EXPO_ACCESS_TOKEN=...` voordat je uitrolt.

Voeg ook de regel voor `pushLog` uit [`firestore.rules.example`](firestore.rules.example) toe.

## Caching

- **Data:** Firestore bewaart opgehaalde documenten in de browser (IndexedDB). Het dashboard opent
  direct met de laatst bekende cijfers ("Bijwerken…") en haalt daarna alleen wijzigingen op ("Live").
- **Foto's:** profielfoto's en banners worden na één keer laden bewaard in de Cache Storage van de
  browser en daarna direct getoond, ook als Firebase Storage even niet bereikbaar is.
- Bij **uitloggen** worden beide caches gewist.

De fotocache werkt pas als de Storage-bucket CORS toestaat. Eenmalig instellen via
[Cloud Shell](https://console.cloud.google.com/?cloudshell=true&project=brewmate-863cd):

```bash
cat > cors.json <<'JSON'
[{"origin":["*"],"method":["GET","HEAD"],"responseHeader":["Content-Type","ETag"],"maxAgeSeconds":3600}]
JSON
gcloud storage buckets update gs://brewmate-863cd.firebasestorage.app --cors-file=cors.json
```

(Dezelfde instelling staat in [`storage-cors.json`](storage-cors.json).) Zonder deze stap worden de
foto's gewoon direct geladen, alleen zonder eigen cache.

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
