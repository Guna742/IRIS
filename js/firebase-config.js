/**
 * I.R.I.S — Firebase Configuration
 * Uses Firebase Compat SDK (CDN-friendly, no bundler required).
 */

const firebaseConfig = {
    apiKey: "AIzaSyABLklv7SeSay2DoLPyCPSMXH7uQ1HGAqo",
    authDomain: "iris-c3308.firebaseapp.com",
    projectId: "iris-c3308",
    storageBucket: "iris-c3308.firebasestorage.app",
    messagingSenderId: "64091273200",
    appId: "1:64091273200:web:88dddf14e5413b2d17cf35"
};

// Initialize Firebase (guard against double-init)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const fbAuth = firebase.auth();
const fbDb = firebase.firestore();

// Enable debug logging for deeper troubleshooting
// firebase.firestore.setLogLevel('debug');
