import { initializeApp } from "https://www.gstatic.com/firebasejs/9.21.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.21.0/firebase-firestore.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/9.21.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAYzytMpL6FPGcVKPt7KEy-4CcnXzTxhJ8",
    authDomain: "hisab-kitab-95e11.firebaseapp.com",
    databaseURL: "https://hisab-kitab-95e11-default-rtdb.firebaseio.com",
    projectId: "hisab-kitab-95e11",
    storageBucket: "hisab-kitab-95e11.firebasestorage.app",
    messagingSenderId: "373894454116",
    appId: "1:373894454116:web:55de8be5ca9eb6d849f871",
    measurementId: "G-2D5YN7D526"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
