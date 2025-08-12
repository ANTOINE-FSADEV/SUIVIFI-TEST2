// firestore.js
// ====================================================================
// SECTION 1 : IMPORTS
// ====================================================================
import {
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    onSnapshot,
    query,
    runTransaction,
    arrayUnion,
    arrayRemove,
    addDoc,
    deleteDoc,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId, ADMIN_EMAILS } from './firebase-config.js';
import { getCurrentUser } from "./auth.js";
import { renderUI, populateFormForEdit, resetAndEnableForm, renderAdminPanel } from './ui.js';

// ====================================================================
// SECTION 2 : VARIABLES GLOBALES ET ÉTAT LOCAL
// ====================================================================

let transactionsCollection, optionsCollection, usersCollection, permissionsCollection;
let unsubscribePermissions = null, unsubscribeOptions = null;
let unsubscribeAdminUsers = null, unsubscribeAdminPermissions = null;
let unsubscribeTransactionsArray = [];

export let localState = {
    allTransactions: [],
    dropdownOptions: {},
    userPermissions: {},
    allUsers: [],
    allPermissions: [],
};

// ====================================================================
// SECTION 3 : FONCTIONS UTILITAIRES
// ====================================================================

function parseDate(dateString) {
    if (!dateString || typeof dateString !== 'string') {
        return new Date().toISOString().slice(0, 10);
    }
    if (dateString.includes('/')) {
        const parts = dateString.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            return `${year}-${month}-${day}`;
        }
    }
    return dateString;
}

// ====================================================================
// SECTION 4 : INITIALISATION ET ÉCOUTEURS DE DONNÉES
// ====================================================================

export function initFirestoreRefs() {
    const publicDataPath = `artifacts/${appId}/public/data`;
    transactionsCollection = collection(db, publicDataPath, 'transactions');
    optionsCollection = collection(db, publicDataPath, 'dropdown_options');
    usersCollection = collection(db, publicDataPath, 'users');
    permissionsCollection = collection(db, publicDataPath, 'user_permissions');
}

export function listenForDataChanges(user) {
    const userIsAdmin = ADMIN_EMAILS.includes(user.email);
    listenForOptionsChanges();
    listenForPermissionChanges(user);
    if (userIsAdmin) {
        listenForAdminData();
    }
}

export function stopDataListeners() {
    unsubscribeTransactionsArray.forEach(unsub => unsub());
    unsubscribeTransactionsArray = [];
    if (unsubscribeOptions) unsubscribeOptions();
    if (unsubscribePermissions) unsubscribePermissions();
    if (unsubscribeAdminUsers) unsubscribeAdminUsers();
    if (unsubscribeAdminPermissions) unsubscribeAdminPermissions();
}

function listenForPermissionChanges(user) {
    if (unsubscribePermissions) unsubscribePermissions();
    const permRef = doc(permissionsCollection, user.uid);
    unsubscribePermissions = onSnapshot(permRef, (docSnap) => {
        localState.userPermissions = docSnap.exists() ? docSnap.data() : { allowed_accounts: [], allowed_categories: [], allowed_affectations: [] };
        listenForTransactions(user);
    }, (error) => console.error("Error listener permissions:", error));
}

function listenForOptionsChanges() {
    if (unsubscribeOptions) unsubscribeOptions();
    unsubscribeOptions = onSnapshot(query(optionsCollection), (snapshot) => {
        const newOptions = {};
        snapshot.forEach(doc => {
            newOptions[doc.id] = doc.data();
        });

        localState.dropdownOptions = newOptions;

        updateMainUI();
        triggerAdminPanelRender();
    }, (error) => console.error("Error listener options:", error));
}

function listenForTransactions(user) {
    unsubscribeTransactionsArray.forEach(unsub => unsub());
    unsubscribeTransactionsArray = [];

    const userIsAdmin = ADMIN_EMAILS.includes(user.email);
    const readableAccounts = (localState.userPermissions.allowed_accounts || []).map(acc => acc.name);

    if (readableAccounts.length === 0 && !userIsAdmin) {
        localState.allTransactions = [];
        updateMainUI();
        return;
    }

    let queriesToRun = [];
    if (userIsAdmin) {
        queriesToRun.push(query(transactionsCollection));
    } else {
        for (let i = 0; i < readableAccounts.length; i += 10) {
            const chunk = readableAccounts.slice(i, i + 10);
            queriesToRun.push(query(transactionsCollection, where('compte', 'in', chunk)));
        }
    }

    const allTransactionDocs = {};
    queriesToRun.forEach((q, index) => {
        const unsub = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach(change => {
                const docId = change.doc.id;
                if (change.type === "removed") {
                    delete allTransactionDocs[docId];
                } else {
                    const data = change.doc.data();
                    delete data.id;
                    allTransactionDocs[docId] = { id: docId, ...data };
                }
            });
            localState.allTransactions = Object.values(allTransactionDocs).sort((a, b) => new Date(b.date_reglement) - new Date(a.date_reglement));
            updateMainUI();
        }, (error) => console.error(`Error listener transactions (chunk ${index}):`, error));
        unsubscribeTransactionsArray.push(unsub);
    });
}

function listenForAdminData() {
    if (unsubscribeAdminUsers) unsubscribeAdminUsers();
    unsubscribeAdminUsers = onSnapshot(query(usersCollection), (snapshot) => {
        localState.allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        triggerAdminPanelRender();
    });

    if (unsubscribeAdminPermissions) unsubscribeAdminPermissions();
    unsubscribeAdminPermissions = onSnapshot(query(permissionsCollection), (snapshot) => {
        localState.allPermissions = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        triggerAdminPanelRender();
    });
}

// ====================================================================
// SECTION 5 : MISE À JOUR DE L'INTERFACE
// ====================================================================

function triggerAdminPanelRender() {
    const user = getCurrentUser();
    if (!user || !ADMIN_EMAILS.includes(user.email) || document.getElementById('admin-modal-overlay').classList.contains('hidden')) return;

    if (localState.allUsers.length > 0 && localState.allTransactions) {
        renderAdminPanel(localState.dropdownOptions, localState.allUsers, localState.allPermissions, localState.allTransactions);
    }
}

function updateMainUI() {
    const user = getCurrentUser();
    if (!user) return;
    renderUI({
        transactions: localState.allTransactions,
        dropdownOptions: localState.dropdownOptions,
        userPermissions: localState.userPermissions,
        user: user,
        allUsers: localState.allUsers,
        allPermissions: localState.allPermissions
    });
}

// ====================================================================
// SECTION 6 : GESTION DES DONNÉES (CRUD & Actions)
// ====================================================================

export async function registerUserInFirestore(user) {
    const userRef = doc(usersCollection, user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        await setDoc(userRef, { uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL });
        const permRef = doc(permissionsCollection, user.uid);
        await setDoc(permRef, { allowed_accounts: [], allowed_categories: [], allowed_affectations: [] });
    } else if (userSnap.data().photoURL !== user.photoURL) {
        await updateDoc(userRef, { photoURL: user.photoURL });
    }
}

export function getTransactionById(id) {
    return localState.allTransactions.find(tx => tx.id === id);
}

export async function handleTransactionSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');
    const editingId = form.querySelector('#editing-tx-id').value;
    submitButton.disabled = true;
    submitButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> ${editingId ? 'Sauvegarde...' : 'Ajout...'}`;
    const formData = new FormData(form);
    const transactionData = Object.fromEntries(formData.entries());
    delete transactionData['editing-tx-id'];
    const user = getCurrentUser();

    try {
        const dataToSave = { ...transactionData, montant: parseFloat(transactionData.montant) };

        if (editingId) {
            // Logique de MISE À JOUR
            const modificationRecord = {
                date: new Date().toISOString(),
                modifie_par: {
                    uid: user.uid,
                    email: user.email,
                    name: user.displayName
                }
            };
            // On ajoute cette modification à un tableau d'historique
            dataToSave.historique_modifications = arrayUnion(modificationRecord);

            await updateDoc(doc(transactionsCollection, editingId), dataToSave);

        } else {
            // Logique de CRÉATION
            const counterRef = doc(db, `artifacts/${appId}/public/data/counters`, 'transactions_counter');
            const newNumero = await runTransaction(db, async (t) => {
                const counterDoc = await t.get(counterRef);
                const newCount = (counterDoc.data()?.count || 0) + 1;
                t.set(counterRef, { count: newCount }, { merge: true });
                return newCount;
            });

            dataToSave.date_ajout = new Date().toISOString();
            dataToSave.ajoute_par = {
                uid: user.uid,
                email: user.email,
                name: user.displayName
            };
            dataToSave.numero_operation = newNumero;
            // On initialise l'historique des modifications comme un tableau vide
            dataToSave.historique_modifications = [];

            await addDoc(transactionsCollection, dataToSave);
        }
        resetAndEnableForm();
    } catch (error) {
        console.error("Erreur lors de la soumission:", error);
        alert("Une erreur est survenue.");
        submitButton.disabled = false;
        submitButton.innerHTML = editingId ? '<i class="fa-solid fa-save mr-2"></i> Enregistrer les modifications' : '<i class="fa-solid fa-plus mr-2"></i> Ajouter l\'opération';
    }
}

export function handleEditTransaction(id) {
    const transaction = getTransactionById(id);
    if (transaction) populateFormForEdit(transaction);
}

export async function handleDeleteTransaction(id) {
    try {
        await deleteDoc(doc(transactionsCollection, id));
    } catch (error) { console.error("Erreur lors de la suppression:", error); }
}

export async function handleAddItem(e) {
    e.preventDefault();
    const key = e.target.dataset.key;
    const input = e.target.querySelector('input');
    const value = input.value.trim();
    if (!value) return;
    await addItemToList(key, value);
    input.value = '';
}

export async function handleBulkAddItem(e) {
    e.preventDefault();
    const key = e.target.dataset.key;
    const textarea = e.target.querySelector('textarea');
    const values = textarea.value.split('\n').map(v => v.trim()).filter(Boolean);
    if (values.length === 0) return;
    const docRef = doc(optionsCollection, key);
    try {
        await setDoc(docRef, { values: arrayUnion(...values) }, { merge: true });
        textarea.value = '';
    } catch (error) { console.error("Erreur d'ajout en masse:", error); }
}

export async function handleDeleteItem(e) {
    // CORRIGÉ : On cherche le bouton parent le plus proche qui a la classe .delete-item-btn
    const button = e.target.closest('.delete-item-btn');
    if (!button) return; // Sécurité si le bouton n'est pas trouvé

    // On récupère les données depuis le bouton trouvé, et non depuis la cible directe du clic
    const key = button.dataset.key;
    const rawValue = button.dataset.value;

    if (!key) {
        console.error("La suppression a échoué : l'attribut data-key est manquant sur le bouton.");
        return;
    }

    const collectionRef = collection(db, `artifacts/${appId}/public/data`, 'dropdown_options');
    const docRef = doc(collectionRef, key);

    let valueToRemove;
    try {
        valueToRemove = JSON.parse(rawValue);
    } catch (error) {
        valueToRemove = rawValue;
    }

    try {
        await updateDoc(docRef, { values: arrayRemove(valueToRemove) });
    } catch (error) {
        console.error("Erreur de suppression:", error);
        alert("Une erreur est survenue lors de la suppression.");
    }
}

export async function updateAccountInList(originalAccount, updatedAccount) {
    const docRef = doc(optionsCollection, 'comptes');

    try {
        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(docRef);
            if (!docSnap.exists()) {
                throw "Le document des comptes n'existe pas.";
            }

            const allAccounts = docSnap.data().values || [];

            if (originalAccount.name !== updatedAccount.name) {
                const nameExists = allAccounts.some(acc => acc.name === updatedAccount.name);
                if (nameExists) {
                    throw `Un compte avec le nom "${updatedAccount.name}" existe déjà.`;
                }
            }

            const accountIndex = allAccounts.findIndex(acc => acc.name === originalAccount.name);

            if (accountIndex === -1) {
                throw "Le compte original n'a pas été trouvé.";
            }

            allAccounts[accountIndex] = updatedAccount;

            transaction.update(docRef, { values: allAccounts });
        });
    } catch (error) {
        console.error("Erreur de transaction lors de la mise à jour du compte: ", error);
        throw error;
    }
}

export async function savePermissionsBatch(userId, finalPermissions) {
    const permRef = doc(permissionsCollection, userId);
    await setDoc(permRef, finalPermissions);
}

export async function addItemToList(key, value) {
    if (!key || !value) return;
    const docRef = doc(optionsCollection, key);
    try {
        await setDoc(docRef, { values: arrayUnion(value) }, { merge: true });
    } catch (error) {
        console.error("Erreur d'ajout de l'élément:", error);
        throw error;
    }
}

export async function deleteTransactionsBatch(ids) {
    if (!ids || ids.length === 0) return;
    const batch = writeBatch(db);
    ids.forEach(id => {
        batch.delete(doc(transactionsCollection, id));
    });
    await batch.commit();
}

export async function updateTransactionsBatch(ids, field, value) {
    if (!ids || ids.length === 0 || !field) return;
    const batch = writeBatch(db);
    const updateData = { [field]: value };
    ids.forEach(id => {
        batch.update(doc(transactionsCollection, id), updateData);
    });
    await batch.commit();
}

// ====================================================================
// SECTION 7 : IMPORT / EXPORT CSV
// ====================================================================

export function exportTransactionsToCSV(transactionsToExport, baseFileName = 'export-transactions') {
    if (!transactionsToExport || transactionsToExport.length === 0) {
        alert("Aucune transaction à exporter.");
        return;
    }
    const csv = Papa.unparse(transactionsToExport, { header: true });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const date = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `${baseFileName}-${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export async function importTransactionsFromCSV(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            complete: async (results) => {
                const transactions = results.data;
                if (transactions.length === 0) {
                    return reject("Fichier CSV vide ou mal formaté.");
                }
                const batch = writeBatch(db);
                const user = getCurrentUser();
                transactions.forEach(tx => {
                    if (!tx.compte || !tx.montant) return;
                    const newTxRef = doc(transactionsCollection);

                    const rawAmount = parseFloat(String(tx.montant).replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0;
                    let typeOperation = String(tx.type_operation).trim().toLowerCase();
                    const finalAmount = Math.abs(rawAmount);

                    const dataToSave = {
                        ...tx,
                        montant: finalAmount,
                        type_operation: typeOperation,
                        date_reglement: parseDate(tx.date_reglement),
                        ajoute_par: { uid: user.uid, email: user.email, name: user.displayName },
                        date_ajout: new Date().toISOString(),
                        numero_operation: null
                    };
                    batch.set(newTxRef, dataToSave);
                });
                try {
                    await batch.commit();
                    resolve(transactions.length);
                } catch (error) { reject(error); }
            },
            error: (error) => reject(error)
        });
    });
}