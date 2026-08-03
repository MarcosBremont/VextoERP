/* ============================================
   VextoERP - Configuración de Firebase
   ============================================ */

// Tu configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAEwutScbe1WpmGAk_nnZ-zQ5ui0lh0QsU",
  authDomain: "vextoerp-a5d5b.firebaseapp.com",
  projectId: "vextoerp-a5d5b",
  storageBucket: "vextoerp-a5d5b.firebasestorage.app",
  messagingSenderId: "555190021726",
  appId: "1:555190021726:web:57b7a78a2bb0475a534ecf",
  measurementId: "G-W1G451EMLF"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Referencia a Firestore
const db = firebase.firestore();