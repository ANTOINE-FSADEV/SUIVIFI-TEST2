import { initAuth, initAuthEventListeners } from './auth.js';
import { initFirestoreRefs, listenForDataChanges, stopDataListeners, handleTransactionSubmit } from './firestore.js';
// MODIFIÉ : Import de la nouvelle fonction d'initialisation des éléments
import { initUIEventListeners, initElements } from './ui.js';

let isAppInitialized = false;

export function initializeAppLogic(user) {
    if (isAppInitialized) return;
    listenForDataChanges(user);
    isAppInitialized = true;
}

export function cleanupListeners() {
    stopDataListeners();
    isAppInitialized = false;
}

document.addEventListener('DOMContentLoaded', () => {
    // MODIFIÉ : On initialise les éléments en premier, c'est crucial
    initElements();

    initFirestoreRefs();
    initAuth();
    initAuthEventListeners();
    initUIEventListeners(handleTransactionSubmit);
});