import { getAuth, onAuthStateChanged, GoogleAuthProvider, signOut, signInWithRedirect, getRedirectResult } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { initializeAppLogic, cleanupListeners } from './main.js';
import { showLoginScreen, showAppScreen, setupUIForUser } from './ui.js';
import { registerUserInFirestore } from "./firestore.js";

let currentUser = null;

export function getCurrentUser() {
    return currentUser;
}

export function initAuth() {
    const auth = getAuth();

    getRedirectResult(auth)
        .then((result) => {
            if (result) {
                console.log("Connexion via redirection réussie pour :", result.user.displayName);
            }
        }).catch((error) => {
            console.error("Erreur lors de la récupération du résultat de redirection :", error);
        });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                currentUser = user;

                await registerUserInFirestore(user);

                console.log("Forcing token refresh to get latest custom claims...");
                await user.getIdToken(true);
                console.log("Token refreshed. Claims should now be available.");

                setupUIForUser(user);
                showAppScreen();
                initializeAppLogic(user);

            } catch (error) {
                console.error("Une erreur est survenue lors de l'initialisation de la session utilisateur :", error);
                alert("Impossible de finaliser la connexion. " + error.message);
                await signOut(auth);
            }
        } else {
            currentUser = null;
            showLoginScreen();
            cleanupListeners();
        }
    });
}

async function handleGoogleSignIn() {
    const provider = new GoogleAuthProvider();
    const auth = getAuth();
    try {
        await signInWithRedirect(auth, provider);
    } catch (error) {
        console.error("Erreur de connexion Google:", error);
        alert("La connexion avec Google a échoué. Veuillez réessayer.");
    }
}

async function handleSignOut() {
    const auth = getAuth();
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Erreur de déconnexion:", error);
    }
}

export function initAuthEventListeners() {
    const googleSignInBtn = document.getElementById('google-signin-btn');

    // ## FIX : On vérifie si le bouton existe avant d'ajouter l'écouteur ##
    // Cela évite l'erreur si le script s'exécute alors que l'écran de connexion n'est pas visible.
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', handleGoogleSignIn);
    }

    document.body.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'logout-btn') {
            handleSignOut();
        }
    });
}