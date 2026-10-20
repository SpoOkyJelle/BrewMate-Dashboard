import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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
export const db = getFirestore(app);
