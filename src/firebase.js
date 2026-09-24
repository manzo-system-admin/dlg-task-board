import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, updateProfile } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseEnabled = Object.values(config).every(Boolean)
export const firebaseApp = firebaseEnabled ? initializeApp(config) : null
export const auth = firebaseApp ? getAuth(firebaseApp) : null
export const db = firebaseApp ? getFirestore(firebaseApp) : null
export const storage = firebaseApp ? getStorage(firebaseApp) : null
export const functions = firebaseApp ? getFunctions(firebaseApp, 'asia-southeast2') : null

export async function setupWebPush(onMessageReceived) {
  if (!firebaseApp || typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return { token: null, unsubscribe: () => {} }
  if (!import.meta.env.VITE_FIREBASE_VAPID_KEY || !(await isSupported())) return { token: null, unsubscribe: () => {} }
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  if (permission !== 'granted') return { token: null, unsubscribe: () => {} }
  const configParam = encodeURIComponent(btoa(JSON.stringify(config)))
  const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?config=${configParam}`)
  const activeRegistration = await navigator.serviceWorker.ready
  const messaging = getMessaging(firebaseApp)
  const token = await getToken(messaging, { vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY, serviceWorkerRegistration: activeRegistration || registration })
  const unsubscribe = onMessage(messaging, (payload) => onMessageReceived?.(payload))
  return { token, unsubscribe }
}

export function subscribeAuth(callback) {
  if (!auth) {
    callback(null)
    return () => {}
  }
  return onAuthStateChanged(auth, callback)
}

export async function signInWithGoogle() {
  if (!auth) return null
  return signInWithPopup(auth, new GoogleAuthProvider())
}

export async function signOutUser() {
  if (auth) await signOut(auth)
}

export async function updateGoogleProfile({ displayName, photoURL }) {
  if (!auth?.currentUser) return null
  await updateProfile(auth.currentUser, { displayName, photoURL })
  return auth.currentUser
}
