import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Same Firebase project as the BrewMate app. This web config is public by design;
// access to the data is controlled by Firestore security rules.
const firebaseConfig = {
  apiKey: 'AIzaSyAxX3jyhtbo5gcbiJ-6b0negwRxborkBjE',
  authDomain: 'brewmate-863cd.firebaseapp.com',
  projectId: 'brewmate-863cd',
  storageBucket: 'brewmate-863cd.firebasestorage.app',
  messagingSenderId: '749221653303',
  appId: '1:749221653303:web:8086ecc8357a726509c8b2',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
/** Cloud Functions in dezelfde regio als in functions/src/index.ts. */
export const functions = getFunctions(app, 'europe-west1');
// Firestore bewaart opgehaalde documenten in IndexedDB. Het dashboard start daardoor direct met
// de laatst bekende data, en bij opnieuw openen worden alleen gewijzigde documenten opgehaald.
// Werkt ook met meerdere tabbladen tegelijk.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
