# BrewMate Dashboard

Admin dashboard for the BrewMate app. It reads the app's Firestore data (`users`, `beers`,
`friends`, `friendRequests`) and shows statistics for all users.

- **Overview** – total/new/active users, beers logged, volume, friendships, beers per day,
  user growth, glass sizes, drinking by hour and weekday, top drinkers, newest users.
- **Users** – searchable, sortable table of every user (beers, volume, streaks, friends,
  last seen). Filter on active / inactive / never logged. Export to CSV.
- **User detail** – one user's stats, beers per week, glass sizes, recent beers, friends and
  notification settings.

Login uses the same Firebase Auth accounts as the app. Only admins can get in.

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
```

### 1. Make yourself an admin

1. Open the [Firebase console](https://console.firebase.google.com/project/brewmate-863cd/firestore) → Firestore.
2. Find your user ID (Authentication tab, or the `users` collection).
3. Create a collection `admins` with a document whose **ID is your user ID**. The document can
   be empty (add any field, e.g. `name: "Jelle"`, if the console requires one).
4. Sign in to the dashboard with your normal BrewMate email and password.

If you sign in with an account that is not in `admins`, the dashboard shows your user ID and
tells you which document to create.

### 2. Firestore rules

The dashboard reads directly from Firestore in the browser, so your Firestore rules decide
what it can see. Signed-in admins need **read** access to `users`, `beers`, `friends`,
`friendRequests`, and to their own `admins/{uid}` document.

> ⚠️ The admin check is only as strong as your rules. Make sure clients **cannot write** to
> the `admins` collection, otherwise any app user could make themselves admin.

See [`firestore.rules.example`](firestore.rules.example) for a starting point.

## Deploy

`npm run build` creates a static site in `dist/`. Host it anywhere, for example Firebase Hosting:

```bash
npm i -g firebase-tools
firebase login
firebase init hosting   # project: brewmate-863cd, public dir: dist, single-page app: yes
npm run build && firebase deploy --only hosting
```

## Notes

- All data is loaded once when you open the dashboard (press **Refresh** to reload). This is
  fine for thousands of users/beers; for much larger data sets, move the aggregation to a
  Cloud Function or scheduled job.
- Dates are shown in your browser's time zone.
