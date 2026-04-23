import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  await signInWithPopup(auth, provider);
}

// Email/password sign-in for dev-time E2E testing against deployed backends.
// The caller is responsible for providing credentials (typically from Vite env
// vars prefixed VITE_*). Do NOT hard-code credentials in this module.
export async function signInWithEmailPassword(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signOutUser() {
  await signOut(auth);
}

export { onAuthStateChanged };
