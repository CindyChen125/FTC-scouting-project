import { initializeApp } from 'firebase/app'
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore'

// Firebase web config is not a secret — it identifies the project, it doesn't
// authorize access. Access control is enforced by Firestore security rules,
// not by hiding this object. Safe to commit.
const firebaseConfig = {
  apiKey: 'AIzaSyDYppEopzelDAxoUlshuU-P6uBgixh2Eyk',
  authDomain: 'ftc-scouting-project.firebaseapp.com',
  projectId: 'ftc-scouting-project',
  storageBucket: 'ftc-scouting-project.firebasestorage.app',
  messagingSenderId: '26620506409',
  appId: '1:26620506409:web:00cf79c6d32643bc7fc738'
}

export const app = initializeApp(firebaseConfig)

// persistentLocalCache gives the same offline-first behavior as our own
// backup/submit split, but for shared data: writes made with no signal are
// queued in IndexedDB and sync automatically once connectivity returns, and
// reads are served from the local cache when offline.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
})
