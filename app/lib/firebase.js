import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

if (typeof window !== 'undefined' && !firebaseConfig.projectId) {
  console.error("CRITICAL ERROR: NEXT_PUBLIC_FIREBASE_PROJECT_ID is not defined in the environment! " +
    "Firebase Firestore client-side initialization will fail.");
}


let app;
let db;

if (!firebase.apps.length) {
  app = firebase.initializeApp(firebaseConfig);
} else {
  app = firebase.app();
}
db = firebase.firestore();

if (typeof window !== 'undefined') {
  const shouldClearPersistence = localStorage.getItem('clear_firestore_persistence') === 'true';
  if (shouldClearPersistence) {
    localStorage.removeItem('clear_firestore_persistence');
    db.clearIndexedDbPersistence()
      .then(() => {
        console.log("Successfully cleared corrupted Firestore IndexedDB persistence.");
        initPersistence();
      })
      .catch((err) => {
        console.error("Failed to clear IndexedDB persistence:", err);
        initPersistence();
      });
  } else {
    initPersistence();
  }
}

function initPersistence() {
  db.enablePersistence({ synchronizeTabs: true })
    .then(() => {
      console.log("Firestore offline persistence successfully enabled.");
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn("Firestore persistence failed-precondition: Multiple tabs open.");
      } else if (err.code === 'unimplemented') {
        console.warn("Firestore persistence unimplemented: Browser does not support persistence.");
      } else {
        console.error("Firestore persistence error:", err);
        localStorage.setItem('clear_firestore_persistence', 'true');
      }
    });
}

const handleFirestoreError = async (error) => {
  console.error("Firestore error handler caught:", error);
  if (!error) return;

  const errMsg = error.message || String(error);
  const isPersistenceError =
    errMsg.includes('IndexedDbTransactionError') ||
    errMsg.includes('IndexedDB') ||
    errMsg.includes('AbortError') ||
    error.code === 'unavailable' ||
    error.name === 'IndexedDbTransactionError';

  if (isPersistenceError && typeof window !== 'undefined') {
    console.warn("Detected fatal Firestore/IndexedDB persistence error. Setting clear flag and reloading...");
    localStorage.setItem('clear_firestore_persistence', 'true');
    try {
      if (db) {
        await db.terminate();
        await db.clearIndexedDbPersistence();
        console.log("Terminated and cleared persistence immediately.");
      }
    } catch (err) {
      console.error("Failed to clear persistence immediately:", err);
    }
    window.location.reload();
  }
};

export { app, db, handleFirestoreError };
export default firebase;