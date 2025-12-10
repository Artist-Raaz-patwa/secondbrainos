import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/database";

const firebaseConfig = {
  apiKey: "AIzaSyBbnIvFqCYrFWgFyDPmHFFfWAWqY0lznB8",
  authDomain: "ndbrain-5eee8.firebaseapp.com",
  databaseURL: "https://ndbrain-5eee8-default-rtdb.firebaseio.com",
  projectId: "ndbrain-5eee8",
  storageBucket: "ndbrain-5eee8.firebasestorage.app",
  messagingSenderId: "808584447476",
  appId: "1:808584447476:web:e2a99e2587bd555e34a5a1",
  measurementId: "G-5ED83GWPVW"
};

// Initialize Firebase
// Ensure we don't initialize twice in dev (hot reload)
const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

export { app, db, auth };