    import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
    import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
    import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

    export const ADMIN_EMAILS = ["antoine.huart@fondationsadev.fr"];
    export const appId = 'fsadev-suivifi';

    const firebaseConfig = {
        apiKey: "AIzaSyAQiPUft1lQaLJ_W3lvSjrXxsNkKnw0vWk",
        authDomain: "fsadev-suivifi.firebaseapp.com",
        projectId: "fsadev-suivifi",
        storageBucket: "fsadev-suivifi.appspot.com",
        messagingSenderId: "704722009838",
        appId: "1:704722009838:web:d1f0b2d3355adfbf381fdff",
        measurementId: "G-7JKK4FQRVR"
    };

    console.log('%c DEBUG: La valeur de appId est : ', 'color: yellow; font-weight: bold;', appId);

    const app = initializeApp(firebaseConfig);
    export const auth = getAuth(app);
    export const db = getFirestore(app);