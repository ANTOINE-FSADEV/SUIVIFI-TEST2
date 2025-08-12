// ui.js

// ====================================================================
// SECTION 1 : IMPORTS
// ====================================================================
import { ADMIN_EMAILS } from "./firebase-config.js";
import {
    handleAddItem,
    handleBulkAddItem,
    handleDeleteItem,
    savePermissionsBatch,
    handleDeleteTransaction,
    handleEditTransaction,
    exportTransactionsToCSV,
    importTransactionsFromCSV,
    addItemToList,
    deleteTransactionsBatch,
    updateTransactionsBatch,
    updateAccountInList
} from './firestore.js';


// ====================================================================
// SECTION 2 : ÉLÉMENTS DU DOM ET ÉTAT LOCAL
// ====================================================================
let elements = {};

export function initElements() {
    elements = {
        loginOverlay: document.getElementById('login-overlay'),
        appContainer: document.getElementById('app'),
        authInfoDiv: document.getElementById('auth-info'),
        adminModalOverlay: document.getElementById('admin-modal-overlay'),
        closeAdminModalBtn: document.getElementById('close-admin-modal-btn'),
        adminListsContent: document.getElementById('admin-lists-content'),
        adminPermissionsContent: document.getElementById('admin-permissions-content'),
        adminTabs: document.getElementById('admin-tabs'),
        dataModalOverlay: document.getElementById('data-modal-overlay'),
        closeDataModalBtn: document.getElementById('close-data-modal-btn'),
        formModalOverlay: document.getElementById('form-modal-overlay'),
        transactionsList: document.getElementById('transactions-list'),
        balancesContainer: document.getElementById('balances'),
        form: document.getElementById('transaction-form'),
        formTitle: document.getElementById('form-title'),
        editingTxIdInput: document.getElementById('editing-tx-id'),
        cancelEditBtn: document.getElementById('cancel-edit-btn'),
        confirmationModal: document.getElementById('confirmation-modal'),
        confirmationTitle: document.getElementById('confirmation-title'),
        confirmationMessage: document.getElementById('confirmation-message'),
        confirmActionBtn: document.getElementById('confirm-action-btn'),
        confirmCancelBtn: document.getElementById('confirm-cancel-btn'),
        openFilterPanelBtn: document.getElementById('open-filter-panel-btn'),
        closeFilterPanelBtn: document.getElementById('close-filter-panel-btn'),
        filterPanel: document.getElementById('filter-panel'),
        filterPanelOverlay: document.getElementById('filter-panel-overlay'),
    };
}

const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
let localUIData = { transactions: [], currentlyDisplayedTransactions: [] };
let onConfirmCallback = null;
let selectedTxIds = new Set();

// ====================================================================
// SECTION 3 : GESTION DE L'AFFICHAGE
// ====================================================================
export function showLoginScreen() {
    if (elements.loginOverlay) elements.loginOverlay.classList.remove('hidden');
    if (elements.appContainer) elements.appContainer.classList.add('hidden');
}

export function showAppScreen() {
    if (elements.loginOverlay) elements.loginOverlay.classList.add('hidden');
    if (elements.appContainer) elements.appContainer.classList.remove('hidden');
}

export function setupUIForUser(user) {
    if (elements.authInfoDiv) {
        elements.authInfoDiv.innerHTML = `
            <p class="font-semibold text-gray-800">${user.displayName}</p>
            <p class="text-sm text-gray-500">${user.email}</p>
            <div id="admin-btn-container" class="mt-2"></div>
            <button id="logout-btn" class="btn btn-logout text-sm mt-2">Déconnexion</button>
        `;
        if (ADMIN_EMAILS.includes(user.email)) {
            const adminBtnContainer = document.getElementById('admin-btn-container');
            if (adminBtnContainer) {
                adminBtnContainer.innerHTML = `<button id="open-admin-modal-btn" class="btn btn-admin text-sm">Administration</button>`;
                const openAdminBtn = document.getElementById('open-admin-modal-btn');
                if (openAdminBtn) {
                    openAdminBtn.addEventListener('click', () => {
                        renderAdminPanel(localUIData.dropdownOptions, localUIData.allUsers, localUIData.allPermissions, localUIData.transactions);
                        if (elements.adminModalOverlay) elements.adminModalOverlay.classList.remove('hidden');
                    });
                }
            }
        }
    }
}

function showConfirmationModal(title, message, onConfirm) {
    if (elements.confirmationModal) {
        elements.confirmationTitle.textContent = title;
        elements.confirmationMessage.textContent = message;
        onConfirmCallback = onConfirm;
        elements.confirmationModal.classList.remove('hidden');
    }
}

function hideConfirmationModal() {
    if (elements.confirmationModal) {
        elements.confirmationModal.classList.add('hidden');
        onConfirmCallback = null;
    }
}

function showDetailsModal(transactionId) {
    const tx = localUIData.transactions.find(t => t.id === transactionId);
    if (!tx) return;
    const modalOverlay = document.getElementById('details-modal-overlay');
    const modalContent = document.getElementById('details-modal-content');
    if (!modalOverlay || !modalContent) return;

    // Section 1: Affichage des détails de la transaction
    const labels = {
        libelle: 'Libellé', montant: 'Montant', date_reglement: 'Date de Règlement', compte: 'Compte',
        categorie: 'Catégorie', affectation: 'Affectation / Projet', type_paiement: 'Type de Paiement',
        source_destination: 'Source / Destination', numero_operation: 'Numéro d\'Opération'
    };
    let contentHtml = '';
    for (const key in labels) {
        if (tx[key] || (key === 'montant' && tx[key] === 0)) {
            let value = tx[key] || 'N/A';
            if (key === 'date_reglement') value = new Date(value).toLocaleDateString('fr-FR');
            if (key === 'montant') {
                const amount = parseFloat(value);
                const signedAmount = tx.type_operation === 'debit' ? -amount : amount;
                value = `${signedAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${tx.devise || ''}`;
            }
            contentHtml += `<div class="border-b pb-2 mb-2">
                <p class="text-sm text-gray-500">${labels[key]}</p>
                <p class="font-medium text-gray-800 break-words">${value}</p>
            </div>`;
        }
    }

    // NOUVEAU : Section 2: Affichage de l'historique de la transaction
    let historyHtml = '<div class="mt-6 pt-4 border-t">';
    historyHtml += '<h4 class="text-sm font-semibold text-gray-600 mb-3">Historique de l\'écriture</h4>';
    historyHtml += '<ul class="space-y-2 text-xs text-gray-500">';

    // Information de création
    if (tx.ajoute_par && tx.date_ajout) {
        const creationDate = new Date(tx.date_ajout).toLocaleString('fr-FR');
        historyHtml += `<li><strong>Créé par :</strong> ${tx.ajoute_par.name || tx.ajoute_par.email} le ${creationDate}</li>`;
    }

    // Informations de modification
    if (tx.historique_modifications && tx.historique_modifications.length > 0) {
        // On inverse le tableau pour afficher la dernière modification en premier
        [...tx.historique_modifications].reverse().forEach(modif => {
            const modifDate = new Date(modif.date).toLocaleString('fr-FR');
            historyHtml += `<li><strong>Modifié par :</strong> ${modif.modifie_par.name || modif.modifie_par.email} le ${modifDate}</li>`;
        });
    } else {
        historyHtml += `<li>Aucune modification enregistrée.</li>`;
    }

    historyHtml += '</ul></div>';

    // On combine les deux parties
    modalContent.innerHTML = contentHtml + historyHtml;
    modalOverlay.classList.remove('hidden');
}

// ====================================================================
// SECTION 4 : FONCTIONS DE RENDU PRINCIPALES
// ====================================================================
export function renderUI(data) {
    localUIData = data;
    const { dropdownOptions, userPermissions } = data;
    const isAdmin = ADMIN_EMAILS.includes(data.user.email);

    let formDropdownOptions = JSON.parse(JSON.stringify(dropdownOptions));
    if (!isAdmin) {
        if (formDropdownOptions.comptes) formDropdownOptions.comptes.values = (userPermissions.allowed_accounts || []).filter(acc => acc.access === 'write').map(acc => acc.name);
        if (formDropdownOptions.categories) formDropdownOptions.categories.values = userPermissions.allowed_categories || [];
        if (formDropdownOptions.affectations) formDropdownOptions.affectations.values = userPermissions.allowed_affectations || [];
    }
    populateAllSelects(formDropdownOptions);
    updateFiltersAndRender();
}

function updateFiltersAndRender() {
    if (!localUIData.transactions) return;

    const { transactions, user, userPermissions, dropdownOptions } = localUIData;
    const isAdmin = ADMIN_EMAILS.includes(user.email);

    const allUserVisibleTransactions = transactions.filter(tx => {
        const readableAccounts = isAdmin
            ? (dropdownOptions?.comptes?.values || []).map(acc => acc.name)
            : (userPermissions?.allowed_accounts || []).map(acc => acc.name);
        return readableAccounts.includes(tx.compte);
    });

    const getActiveFilters = (containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return [];
        const pills = Array.from(container.querySelectorAll('.account-pill.active'));
        const values = pills.map(p => p.dataset.value);
        return values.includes('all') ? [] : values;
    };

    const selectedAccounts = getActiveFilters('filter-accounts-container');
    const selectedYears = getActiveFilters('filter-years-container');
    const selectedCategories = getActiveFilters('filter-categories-container');
    const selectedTypes = getActiveFilters('filter-type-container');
    const selectedAffectations = getActiveFilters('filter-affectations-container'); // Ajout

    const accountFilteredTransactions = selectedAccounts.length > 0
        ? allUserVisibleTransactions.filter(tx => selectedAccounts.includes(tx.compte))
        : allUserVisibleTransactions;

    const availableYears = [...new Set(accountFilteredTransactions.map(tx => new Date(tx.date_reglement).getFullYear()))].filter(Boolean);
    const availableCategories = [...new Set(accountFilteredTransactions.map(tx => tx.categorie))].filter(Boolean);
    const availableTypes = [...new Set(accountFilteredTransactions.map(tx => tx.type_operation === 'debit' ? 'Débit' : 'Crédit'))].filter(Boolean);
    const availableAffectations = [...new Set(accountFilteredTransactions.map(tx => tx.affectation))].filter(Boolean); // Ajout

    const allReadableAccountObjects = dropdownOptions?.comptes?.values || [];

    createFilterPills('filter-accounts-container', allReadableAccountObjects, selectedAccounts);
    createFilterPills('filter-years-container', availableYears, selectedYears);
    createFilterPills('filter-categories-container', availableCategories, selectedCategories);
    createFilterPills('filter-type-container', availableTypes, selectedTypes);
    createFilterPills('filter-affectations-container', availableAffectations, selectedAffectations); // Ajout

    let finalFilteredTransactions = accountFilteredTransactions;
    if (selectedYears.length > 0) {
        finalFilteredTransactions = finalFilteredTransactions.filter(tx => selectedYears.includes(new Date(tx.date_reglement).getFullYear().toString()));
    }
    if (selectedCategories.length > 0) {
        finalFilteredTransactions = finalFilteredTransactions.filter(tx => selectedCategories.includes(tx.categorie));
    }
    if (selectedTypes.length > 0) {
        finalFilteredTransactions = finalFilteredTransactions.filter(tx => {
            const typeText = tx.type_operation === 'debit' ? 'Débit' : 'Crédit';
            return selectedTypes.includes(typeText);
        });
    }
    if (selectedAffectations.length > 0) { // Ajout
        finalFilteredTransactions = finalFilteredTransactions.filter(tx => selectedAffectations.includes(tx.affectation));
    }

    calculateAndRenderBalances(allUserVisibleTransactions, allReadableAccountObjects, user, userPermissions);
    renderTransactions(finalFilteredTransactions, user, userPermissions);
    localUIData.currentlyDisplayedTransactions = finalFilteredTransactions;
}

function renderTransactions(transactions, user, userPermissions) {
    if (!elements.transactionsList) return;
    elements.transactionsList.innerHTML = '';
    if (transactions.length === 0) {
        elements.transactionsList.innerHTML = '<tr><td colspan="9" class="text-center text-gray-500 py-8">Aucune opération à afficher.</td></tr>';
        return;
    }
    const isAdmin = ADMIN_EMAILS.includes(user.email);
    const allAccountsData = localUIData.dropdownOptions?.comptes?.values || [];
    transactions.forEach(tx => {
        const row = document.createElement('tr');
        row.dataset.id = tx.id;
        row.className = 'cursor-pointer hover:bg-gray-50';
        const canWrite = isAdmin || (userPermissions.allowed_accounts || []).some(acc => acc.name === tx.compte && acc.access === 'write');
        const actionButtons = canWrite ? `<button class="edit-tx-btn text-blue-600 hover:text-blue-800 p-1" data-id="${tx.id}" title="Modifier"><i class="fa-solid fa-pencil"></i></button> <button class="delete-tx-btn text-red-600 hover:text-red-800 p-1 ml-2" data-id="${tx.id}" title="Supprimer"><i class="fa-solid fa-trash-can"></i></button>` : '';
        const checkboxCell = isAdmin ? `<td class="w-12 px-2 sm:px-4 py-3 text-center"><input type="checkbox" class="transaction-checkbox h-4 w-4 rounded border-gray-300" data-id="${tx.id}"></td>` : '<td class="w-12 px-2 sm:px-4 py-3"></td>';
        const formattedAmount = parseFloat(tx.montant).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const truncate = (text, length) => !text || text.length <= length ? text || '' : text.substring(0, length) + '...';
        const truncatedLibelle = truncate(tx.libelle, 25);
        const truncatedSourceDest = truncate(tx.source_destination, 20);
        const account = allAccountsData.find(acc => acc.name === tx.compte);
        const accountColor = account?.color || '#9ca3af';
        const accountCellHtml = `<div class="flex items-center"><span class="h-2 w-2 rounded-full mr-2 flex-shrink-0" style="background-color: ${accountColor};"></span><span>${tx.compte}</span></div>`;
        row.innerHTML = `
            ${checkboxCell}
            <td class="w-10 px-2 py-3 text-sm text-gray-500">${tx.numero_operation || 'N/A'}</td>
            <td class="px-2 sm:px-4 py-3 text-sm text-gray-600">${new Date(tx.date_reglement).toLocaleDateString('fr-FR')}</td>
            <td class="px-3 sm:px-6 py-3 text-sm font-medium text-gray-800" title="${tx.libelle || ''}">${truncatedLibelle}</td>
            <td class="px-3 sm:px-6 py-3 text-sm text-gray-500" title="${tx.source_destination || ''}">${truncatedSourceDest}</td>
            <td class="px-3 sm:px-6 py-3 text-sm text-gray-500">${accountCellHtml}</td>
            <td class="px-3 sm:px-6 py-3 text-sm text-gray-500">${tx.categorie}</td>
            <td class="px-3 sm:px-6 py-3 text-sm text-right font-semibold ${tx.type_operation === 'debit' ? 'text-red-600' : 'text-green-600'}">${tx.type_operation === 'debit' ? '-' : '+'} ${formattedAmount} ${tx.devise}</td>
            <td class="px-2 sm:px-4 py-3 text-center text-sm">${actionButtons}</td>`;
        elements.transactionsList.appendChild(row);
    });
    updateCheckboxesState();
}

function calculateAndRenderBalances(transactions, allAccountsData, user, userPermissions) {
    if (!elements.balancesContainer) return;
    const isAdmin = ADMIN_EMAILS.includes(user.email);
    const accountsToDisplay = isAdmin ? allAccountsData : allAccountsData.filter(acc => (userPermissions.allowed_accounts || []).map(p => p.name).includes(acc.name));
    const balances = {};
    accountsToDisplay.forEach(acc => { balances[acc.name] = 0; });
    (transactions || []).forEach(tx => {
        if (balances.hasOwnProperty(tx.compte)) {
            balances[tx.compte] += (tx.type_operation === 'debit' ? -parseFloat(tx.montant) : parseFloat(tx.montant));
        }
    });
    elements.balancesContainer.innerHTML = '';
    accountsToDisplay.forEach((account) => {
        const balance = balances[account.name] || 0;
        const formattedBalance = balance.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const card = document.createElement('div');
        const borderColor = account.color || (balance >= 0 ? '#22c55e' : '#ef4444');
        card.className = `p-4 rounded-lg shadow-sm border-l-4 cursor-pointer hover:shadow-md transition-shadow`;
        card.style.borderColor = borderColor;
        card.innerHTML = `<p class="text-sm font-medium text-gray-500">${account.name}</p><p class="text-2xl font-bold ${balance >= 0 ? 'text-gray-800' : 'text-red-700'} mt-1">${formattedBalance} ${account.currency}</p>`;

        // NOUVEAU : Ajout de l'écouteur de clic
        card.addEventListener('click', () => {
            const container = document.getElementById('filter-accounts-container');
            if (!container) return;

            // Déselectionne tout
            container.querySelectorAll('.account-pill').forEach(p => p.classList.remove('active'));

            // Sélectionne la pilule correspondant au compte cliqué
            const targetPill = container.querySelector(`[data-value="${account.name}"]`);
            if (targetPill) {
                targetPill.classList.add('active');
            }

            // Met à jour l'affichage
            updateFiltersAndRender();

            // Affiche l'historique s'il est masqué
            const historyContainer = document.getElementById('history-table-container');
            const toggleBtn = document.getElementById('toggle-history-btn');
            if (historyContainer && historyContainer.classList.contains('hidden')) {
                historyContainer.classList.remove('hidden');
                if (toggleBtn) toggleBtn.textContent = 'Masquer';
            }
        });

        elements.balancesContainer.appendChild(card);
    });
}


// ====================================================================
// SECTION 5 : FONCTIONS UTILITAIRES
// ====================================================================
function createFilterPills(containerId, items, selectedValues = []) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'account-pill';
    allBtn.textContent = 'Tous';
    allBtn.dataset.value = 'all';
    if (selectedValues.length === 0) {
        allBtn.classList.add('active');
    }
    container.appendChild(allBtn);

    const isAccountPills = containerId === 'filter-accounts-container';
    const sortedItems = [...items].sort((a, b) => {
        const nameA = isAccountPills ? a.name : String(a);
        const nameB = isAccountPills ? b.name : String(b);
        return nameA.localeCompare(nameB, undefined, { numeric: true });
    });

    sortedItems.forEach(item => {
        const pill = document.createElement('button');
        pill.className = 'account-pill';
        const name = isAccountPills ? item.name : item;
        const color = isAccountPills ? item.color : null;

        pill.textContent = name;
        pill.dataset.value = name;

        // On nettoie les styles en ligne à chaque fois
        pill.style.backgroundColor = '';
        pill.style.borderColor = '';
        pill.style.color = '';

        if (selectedValues.includes(name)) {
            pill.classList.add('active');
            if (color) { // Si c'est un compte avec une couleur, on l'applique
                pill.style.backgroundColor = color;
                pill.style.borderColor = color;
                pill.style.color = 'white';
            }
            allBtn.classList.remove('active');
        } else {
            pill.classList.remove('active');
            if (color) { // Style inactif pour les comptes
                pill.style.color = color;
                pill.style.borderColor = color;
            }
        }
        container.appendChild(pill);
    });
}

export function populateSelect(elementId, options, placeholder = "Sélectionner...") {
    const select = document.getElementById(elementId);
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>`;
    if (options && Array.isArray(options)) {
        options.sort().forEach(option => {
            select.innerHTML += `<option value="${option}">${option}</option>`;
        });
    }
    if (Array.from(select.options).some(opt => opt.value === currentValue)) {
        select.value = currentValue;
    }
}

function populateAllSelects(opts) {
    if (!opts) return;
    const accountNames = (opts.comptes?.values || []).map(acc => acc.name);
    populateSelect('compte', accountNames);
    populateSelect('categorie', opts.categories?.values || []);
    populateSelect('affectation', opts.affectations?.values || []);
    populateSelect('type_paiement', ['Espèce', 'Chèque', 'Virement', 'Carte Bancaire']);
}

export function populateFormForEdit(transaction) {
    if (!elements.formModalOverlay) return;
    elements.formModalOverlay.classList.remove('hidden');
    elements.form.reset();
    elements.editingTxIdInput.value = transaction.id;
    for (const key in transaction) {
        const el = elements.form.elements[key];
        if (el) {
            if (el.type === 'radio') {
                elements.form.querySelector(`input[name="${key}"][value="${transaction[key]}"]`).checked = true;
            } else {
                el.value = transaction[key];
            }
        }
    }
    updateCurrencyField(transaction.compte);
    elements.formTitle.textContent = "Modifier l'Opération";
    elements.cancelEditBtn.classList.remove('hidden');
    elements.form.querySelector('button[type="submit"]').innerHTML = '<i class="fa-solid fa-save mr-2"></i> Enregistrer les modifications';
}

export function resetAndEnableForm() {
    if (!elements.form) return;
    const submitButton = elements.form.querySelector('button[type="submit"]');
    elements.form.reset();
    const dateInput = document.getElementById('date_reglement');
    if (dateInput) dateInput.valueAsDate = new Date();
    if (elements.editingTxIdInput) elements.editingTxIdInput.value = '';
    if (elements.formTitle) elements.formTitle.textContent = "Nouvelle Opération";
    if (elements.cancelEditBtn) elements.cancelEditBtn.classList.add('hidden');
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fa-solid fa-plus mr-2"></i> Ajouter l\'opération';
    }
}

function updateCurrencyField(selectedAccountName) {
    const currencyInput = document.getElementById('devise');
    if (!currencyInput) return;
    if (!selectedAccountName) {
        currencyInput.value = '';
        return;
    }
    const allAccountsData = (localUIData.dropdownOptions && localUIData.dropdownOptions.comptes) ? localUIData.dropdownOptions.comptes.values : [];
    const account = allAccountsData.find(acc => acc.name === selectedAccountName);
    const currency = (account && account.currency) ? account.currency : 'EUR';
    currencyInput.value = currency;
}


// ====================================================================
// SECTION 6 : PANNEAU D'ADMINISTRATION
// ====================================================================
async function handleAddOrphanItem(e) {
    const button = e.currentTarget;
    const key = button.dataset.key;
    const value = button.dataset.value;
    if (key === 'comptes') {
        const nameInput = document.getElementById('new-compte-name');
        if (nameInput) {
            nameInput.value = value;
            nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            nameInput.focus();
        }
        return;
    }
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    try {
        await addItemToList(key, value);
    } catch (error) {
        console.error("Erreur lors de l'ajout de l'orphelin:", error);
        alert("Une erreur est survenue lors de l'ajout.");
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-plus"></i> Ajouter';
    }
}

export function renderAdminPanel(dropdownOptions, allUsers, allPermissions, allTransactions) {
    renderAdminListsPanel(dropdownOptions, allTransactions);
    renderAdminPermissionsPanel(allUsers, allPermissions, dropdownOptions);
}

function renderAdminListsPanel(dropdownOptions, allTransactions) {
    if (!elements.adminListsContent) return;
    elements.adminListsContent.innerHTML = '';
    const listConfigs = {
        comptes: { name: 'Comptes', transactionKey: 'compte' },
        categories: { name: 'Catégories de dépenses', transactionKey: 'categorie' },
        affectations: { name: 'Affectations / Projets', transactionKey: 'affectation' }
    };
    for (const key in listConfigs) {
        const config = listConfigs[key];
        const optionData = dropdownOptions[key] || { values: [] };
        const card = document.createElement('div');
        card.dataset.listKey = key;
        card.className = 'bg-white p-4 rounded-md shadow-sm flex flex-col';
        if (key === 'comptes') {
            const addFormHtml = `
                <h3 class="text-lg font-semibold text-gray-700 mb-3">${config.name}</h3>
                <form id="add-compte-form" class="space-y-3 mb-4 p-3 bg-gray-50 rounded-md border">
                    <p class="text-sm font-medium">Ajouter un nouveau compte</p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label for="new-compte-name" class="block text-xs font-medium text-gray-600 mb-1">Nom</label><input type="text" id="new-compte-name" placeholder="Ex: Caisse Paris" class="form-input text-sm" required></div>
                        <div><label for="new-compte-currency" class="block text-xs font-medium text-gray-600 mb-1">Devise</label><select id="new-compte-currency" class="form-select text-sm" required><option value="EUR">EUR</option><option value="KMF">KMF</option><option value="FCFA">FCFA</option></select></div>
                    </div>
                    <div><label for="new-compte-color" class="block text-xs font-medium text-gray-600 mb-1">Couleur</label><input type="color" id="new-compte-color" value="#4A90E2" class="w-full h-8 p-0 border-none rounded cursor-pointer"></div>
                    <button type="submit" class="btn btn-primary text-sm w-full"><i class="fa-solid fa-plus mr-2"></i>Ajouter le compte</button>
                </form>`;
            let listHtml = '<div class="flex-grow overflow-y-auto border rounded-md" style="max-height: 250px;"><table class="min-w-full"><tbody class="bg-white divide-y divide-gray-200">';
            const values = [...(optionData.values || [])].sort((a, b) => a.name.localeCompare(b.name));
            if (values.length > 0) {
                values.forEach(value => {
                    const name = value.name;
                    const currency = `<span class="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">${value.currency}</span>`;
                    const colorSwatch = `<span class="inline-block w-4 h-4 rounded-full border border-gray-300" style="background-color: ${value.color || '#ccc'}"></span>`;
                    const dataValue = JSON.stringify(value);
                    listHtml += `<tr>
                            <td class="px-3 py-2 text-sm flex items-center gap-2">${colorSwatch} ${name}</td>
                            <td class="px-3 py-2 text-sm text-center">${currency}</td>
                            <td class="px-3 py-2 text-right">
                                <button class="edit-account-btn text-blue-600 hover:text-blue-800 p-1" data-account='${dataValue}' title="Modifier"><i class="fa-solid fa-pencil"></i></button>
                                <button class="delete-item-btn text-red-500 hover:text-red-700 p-1 ml-2" data-key="comptes" data-value='${dataValue}' title="Supprimer"><i class="fa-solid fa-trash-can"></i></button>
                            </td>
                        </tr>`;
                });
            } else {
                listHtml += '<tr><td colspan="3" class="px-3 py-4 text-sm text-gray-400 text-center">Aucun compte.</td></tr>';
            }
            listHtml += '</tbody></table></div>';
            card.innerHTML = addFormHtml + listHtml;
        } else {
            card.innerHTML = `
                <h3 class="text-lg font-semibold text-gray-700 mb-3">${config.name}</h3>
                <div class="flex-grow overflow-y-auto border rounded-md mb-4" style="max-height: 200px;"><table class="min-w-full"><tbody id="table-body-${key}" class="bg-white divide-y divide-gray-200"></tbody></table></div>
                <form class="add-item-form flex gap-2 mb-4" data-key="${key}"><input type="text" placeholder="Nouvel élément..." class="form-input flex-grow text-sm" required><button type="submit" class="btn btn-primary text-sm px-4"><i class="fa-solid fa-plus"></i></button></form>
                <form class="bulk-add-form" data-key="${key}"><label class="block text-sm font-medium text-gray-600 mb-1">Ajout en masse</label><textarea class="form-textarea text-sm w-full" rows="3"></textarea><button type="submit" class="btn btn-secondary text-sm w-full mt-2">Ajouter</button></form>`;
            const tableBody = card.querySelector(`#table-body-${key}`);
            const values = optionData.values || [];
            if (values.length > 0) {
                tableBody.innerHTML = values.sort().map(value => `<tr><td class="px-3 py-2 text-sm">${value}</td><td class="px-3 py-2 text-right"><button class="delete-item-btn text-red-500 hover:text-red-700 text-lg" data-key="${key}" data-value="${value}" title="Supprimer">&times;</button></td></tr>`).join('');
            } else {
                tableBody.innerHTML = '<tr><td class="px-3 py-4 text-sm text-gray-400 text-center">Aucun élément.</td></tr>';
            }
        }
        elements.adminListsContent.appendChild(card);
    }

    if (allTransactions && allTransactions.length > 0) {
        for (const key in listConfigs) {
            const config = listConfigs[key];
            const existingValues = new Set(key === 'comptes' ? (dropdownOptions[key]?.values || []).map(v => v.name) : (dropdownOptions[key]?.values || []));
            const valuesInTransactions = new Set(allTransactions.map(tx => tx[config.transactionKey]));
            const orphans = [...valuesInTransactions].filter(v => v && !existingValues.has(v));

            if (orphans.length > 0) {
                const card = elements.adminListsContent.querySelector(`[data-list-key="${key}"]`);
                if (card) {
                    let orphanHtml = `<div class="mt-4 pt-4 border-t"><h4 class="font-semibold text-sm text-amber-800 mb-2">Éléments Orphelins Détectés</h4><p class="text-xs text-gray-500 mb-3">Ces éléments sont utilisés dans des transactions mais n'existent pas dans vos listes.</p><ul class="space-y-2">`;
                    orphans.forEach(orphan => {
                        orphanHtml += `<li class="flex items-center justify-between bg-amber-50 p-2 rounded-md"><span class="text-sm text-amber-900">${orphan}</span><button class="add-orphan-btn btn-add-orphan text-xs" data-key="${key}" data-value="${orphan}" title="Ajouter à la liste"><i class="fa-solid fa-plus"></i> Ajouter</button></li>`;
                    });
                    orphanHtml += `</ul></div>`;
                    card.insertAdjacentHTML('beforeend', orphanHtml);
                }
            }
        }
    }

    const addCompteForm = document.getElementById('add-compte-form');
    if (addCompteForm) {
        addCompteForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('new-compte-name').value.trim();
            const currency = document.getElementById('new-compte-currency').value;
            const color = document.getElementById('new-compte-color').value;
            if (!name || !currency) return;
            const newAccount = { name, currency, color };
            try {
                await addItemToList('comptes', newAccount);
                addCompteForm.reset();
            } catch (error) { console.error("Erreur lors de l'ajout du compte:", error); alert("Une erreur est survenue."); }
        });
    }
    document.querySelectorAll('.add-item-form').forEach(f => f.addEventListener('submit', handleAddItem));
    document.querySelectorAll('.delete-item-btn').forEach(b => b.addEventListener('click', handleDeleteItem));
    document.querySelectorAll('.bulk-add-form').forEach(f => f.addEventListener('submit', handleBulkAddItem));
    document.querySelectorAll('.add-orphan-btn').forEach(b => b.addEventListener('click', handleAddOrphanItem));
}

function renderAdminPermissionsPanel(allUsers, allPermissions, dropdownOptions) {
    if (!elements.adminPermissionsContent) return;
    elements.adminPermissionsContent.innerHTML = '<div class="bg-white p-4 rounded-md shadow-sm mb-4"><p class="text-gray-700 font-medium">Sélectionner un utilisateur</p><div id="user-selection-buttons" class="flex flex-wrap gap-2 mt-2"></div></div><div id="permissions-details" class="hidden"></div>';
    const userSelectionButtons = document.getElementById('user-selection-buttons');
    const permissionsDetailsContainer = document.getElementById('permissions-details');
    if (!allUsers || allUsers.length === 0) {
        userSelectionButtons.innerHTML = '<p class="text-gray-500">Aucun utilisateur trouvé.</p>';
        return;
    }
    userSelectionButtons.innerHTML = allUsers.map(user => `<button class="user-button p-2 rounded-lg flex items-center gap-3 text-left" data-uid="${user.uid}"><img src="${user.photoURL || 'https://placehold.co/40x40/e2e8f0/64748b?text=??'}" alt="Photo de profil" class="w-10 h-10 rounded-full"><div><p class="font-semibold text-sm">${user.displayName}</p><p class="text-xs text-gray-500">${user.email}</p></div></button>`).join('');
    userSelectionButtons.querySelectorAll('.user-button').forEach(button => {
        button.addEventListener('click', (e) => {
            userSelectionButtons.querySelectorAll('.user-button').forEach(btn => btn.classList.remove('active'));
            const selectedButton = e.currentTarget;
            selectedButton.classList.add('active');
            const selectedUserId = selectedButton.dataset.uid;
            permissionsDetailsContainer.classList.remove('hidden');
            const savedPerms = allPermissions.find(p => p.id === selectedUserId)?.data || {};
            const permissionTypes = {
                allowed_accounts: { title: 'Comptes Autorisés', optionKey: 'comptes', hasLevels: true },
                allowed_categories: { title: 'Catégories Autorisées', optionKey: 'categories', hasLevels: false },
                allowed_affectations: { title: 'Affectations Autorisées', optionKey: 'affectations', hasLevels: false }
            };
            let html = '<form id="permissions-form" class="space-y-6">';
            for (const [key, config] of Object.entries(permissionTypes)) {
                html += `<div class="bg-white p-4 rounded-md shadow-sm permission-group" data-permission-type="${key}"><h4 class="font-semibold mb-3">${config.title}</h4>`;
                const allOptions = (dropdownOptions[config.optionKey]?.values || []);
                const sortedOptions = [...allOptions].sort((a, b) => (a.name || a).localeCompare(b.name || b));

                if (config.hasLevels) {
                    html += sortedOptions.map(optionObj => {
                        const optionName = optionObj.name;
                        const savedAccess = savedPerms[key]?.find(p => p.name === optionName)?.access || 'none';
                        return `<div class="flex justify-between items-center p-2 border-b"><span>${optionName}</span><div class="flex gap-3 text-sm"><label><input type="radio" name="perm_account_${optionName.replace(/\s/g, '')}" value="none" data-value="${optionName}" ${savedAccess === 'none' ? 'checked' : ''}> Non</label><label><input type="radio" name="perm_account_${optionName.replace(/\s/g, '')}" value="read" data-value="${optionName}" ${savedAccess === 'read' ? 'checked' : ''}> Visible</label><label><input type="radio" name="perm_account_${optionName.replace(/\s/g, '')}" value="write" data-value="${optionName}" ${savedAccess === 'write' ? 'checked' : ''}> Modifiable</label></div></div>`;
                    }).join('');
                } else {
                    html += `<div class="grid grid-cols-2 md:grid-cols-3 gap-2">` + sortedOptions.map(option => {
                        const isChecked = savedPerms[key]?.includes(option) || false;
                        return `<label class="flex items-center space-x-3"><input type="checkbox" data-value="${option}" ${isChecked ? 'checked' : ''}><span>${option}</span></label>`;
                    }).join('') + `</div>`;
                }
                html += `</div>`;
            }
            html += `<div class="mt-6 text-right"><button type="submit" id="save-permissions-btn" class="btn btn-primary" disabled>Enregistrer les modifications</button></div></form>`;
            permissionsDetailsContainer.innerHTML = html;
            const permForm = permissionsDetailsContainer.querySelector('#permissions-form');
            const saveButton = permForm.querySelector('#save-permissions-btn');
            permForm.addEventListener('input', () => { saveButton.disabled = false; });
            permForm.addEventListener('submit', async (submitEvent) => {
                submitEvent.preventDefault();
                saveButton.disabled = true;
                saveButton.textContent = 'Sauvegarde...';
                const finalPermissions = {};
                permForm.querySelectorAll('.permission-group').forEach(group => {
                    const type = group.dataset.permissionType;
                    if (type === 'allowed_accounts') {
                        finalPermissions[type] = [];
                        group.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
                            if (radio.value !== 'none') {
                                finalPermissions[type].push({ name: radio.dataset.value, access: radio.value });
                            }
                        });
                    } else {
                        finalPermissions[type] = [];
                        group.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
                            finalPermissions[type].push(checkbox.dataset.value);
                        });
                    }
                });
                try {
                    await savePermissionsBatch(selectedUserId, finalPermissions);
                    saveButton.textContent = 'Modifications enregistrées !';
                    setTimeout(() => {
                        saveButton.textContent = 'Enregistrer les modifications';
                        saveButton.disabled = true;
                    }, 2000);
                } catch (error) {
                    console.error("Erreur:", error);
                    alert("Une erreur est survenue.");
                    saveButton.textContent = 'Enregistrer les modifications';
                    saveButton.disabled = false;
                }
            });
        });
    });
}

// ====================================================================
// SECTION 7 : GESTION DES ACTIONS EN MASSE
// ====================================================================
function updateBulkActionsUI() {
    const bulkActionBar = document.getElementById('bulk-actions-bar');
    if (!bulkActionBar) return;
    const selectionCountSpan = document.getElementById('selection-count');
    const count = selectedTxIds.size;
    if (count > 0) {
        if (selectionCountSpan) selectionCountSpan.textContent = `${count} opération(s) sélectionnée(s)`;
        bulkActionBar.classList.remove('hidden');
    } else {
        bulkActionBar.classList.add('hidden');
    }
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    if (!selectAllCheckbox) return;
    const visibleCheckboxes = document.querySelectorAll('.transaction-checkbox');
    if (visibleCheckboxes.length === 0 && count === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        return;
    }
    if (count === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (count === visibleCheckboxes.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
}
function updateCheckboxesState() {
    document.querySelectorAll('.transaction-checkbox').forEach(cb => {
        cb.checked = selectedTxIds.has(cb.dataset.id);
    });
    updateBulkActionsUI();
}
function clearSelection() {
    selectedTxIds.clear();
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
    updateCheckboxesState();
}
// Version corrigée
function handleBulkModify() {
    const modal = document.getElementById('bulk-edit-modal-overlay');
    if (!modal) return;

    // Remplissage des informations de base
    const countElement = document.getElementById('bulk-edit-count');
    if (countElement) countElement.textContent = `Vous êtes sur le point de modifier ${selectedTxIds.size} opérations.`;

    const form = document.getElementById('bulk-edit-form');
    if (form) form.reset();

    const valueContainer = document.getElementById('bulk-edit-value-container');
    if (valueContainer) valueContainer.innerHTML = '';

    const confirmBtn = document.getElementById('bulk-edit-confirm-btn');
    if (confirmBtn) confirmBtn.disabled = true;

    // LA LIGNE MANQUANTE ET CRUCIALE : On peuple le menu déroulant
    populateSelect('bulk-edit-field-select', ['compte', 'categorie', 'affectation'], 'Sélectionner un champ...');

    // On affiche la fenêtre
    modal.classList.remove('hidden');
}

// ====================================================================
// SECTION 8 : ÉCOUTEURS D'ÉVÉNEMENTS
// ====================================================================
function initTransactionListEventListeners() {
    if (elements.transactionsList) {
        elements.transactionsList.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-tx-btn');
            const deleteBtn = e.target.closest('.delete-tx-btn');
            const row = e.target.closest('tr');
            if (editBtn) { e.stopPropagation(); handleEditTransaction(editBtn.dataset.id); }
            else if (deleteBtn) { e.stopPropagation(); showConfirmationModal('Supprimer l\'opération', 'Êtes-vous sûr ? Cette action est irréversible.', () => handleDeleteTransaction(deleteBtn.dataset.id)); }
            else if (row && row.dataset.id) { showDetailsModal(row.dataset.id); }
        });
    }
}

export function initUIEventListeners(handleTransactionSubmit) {
    // ---- Panneau de filtres ----
    // ---- Listeners pour la modale de données (Import/Export) ----
    const exportAllBtn = document.getElementById('export-all-csv-btn');
    if (exportAllBtn) {
        exportAllBtn.addEventListener('click', () => {
            exportTransactionsToCSV(localUIData.transactions, 'export-transactions-all');
        });
    }

    const exportFilteredBtn = document.getElementById('export-filtered-csv-btn');
    if (exportFilteredBtn) {
        exportFilteredBtn.addEventListener('click', () => {
            exportTransactionsToCSV(localUIData.currentlyDisplayedTransactions, 'export-transactions-filtrees');
        });
    }

    const importInput = document.getElementById('import-csv-input');
    if (importInput) {
        importInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const fileNameEl = document.getElementById('csv-file-name');
            if (fileNameEl) fileNameEl.textContent = `Fichier : ${file.name}`;

            showConfirmationModal('Confirmer l\'importation', `Êtes-vous sûr de vouloir importer les données de ce fichier ?`, async () => {
                try {
                    const count = await importTransactionsFromCSV(file);
                    alert(`${count} transaction(s) ont été importée(s) avec succès.`);
                    if (fileNameEl) fileNameEl.textContent = '';
                    importInput.value = '';
                } catch (error) {
                    alert("Erreur d'importation. Vérifiez le format de votre fichier et la console pour plus de détails.");
                    console.error("Erreur d'importation CSV:", error);
                } finally {
                    hideConfirmationModal();
                }
            });
        });
    }


    const openPanel = () => {
        if (elements.filterPanel) elements.filterPanel.classList.add('active');
        if (elements.filterPanelOverlay) elements.filterPanelOverlay.classList.add('active');
    };
    const compteSelect = document.getElementById('compte');
    if (compteSelect) {
        compteSelect.addEventListener('change', (e) => {
            updateCurrencyField(e.target.value);
        });
    }
    const closePanel = () => {
        if (elements.filterPanel) elements.filterPanel.classList.remove('active');
        if (elements.filterPanelOverlay) elements.filterPanelOverlay.classList.remove('active');
    };
    if (elements.openFilterPanelBtn) elements.openFilterPanelBtn.addEventListener('click', openPanel);
    if (elements.closeFilterPanelBtn) elements.closeFilterPanelBtn.addEventListener('click', closePanel);
    if (elements.filterPanelOverlay) elements.filterPanelOverlay.addEventListener('click', closePanel);

    if (elements.filterPanel) {
        elements.filterPanel.addEventListener('click', (e) => {
            const targetPill = e.target.closest('.account-pill');
            if (!targetPill) return;
            e.preventDefault();
            const pillContainer = targetPill.parentElement;
            const allBtn = pillContainer.querySelector('[data-value="all"]');
            const allPillsInContainer = Array.from(pillContainer.querySelectorAll('.account-pill:not([data-value="all"])'));
            if (isTouchDevice) {
                if (targetPill.dataset.value === 'all') {
                    pillContainer.querySelectorAll('.account-pill').forEach(p => p.classList.remove('active'));
                    targetPill.classList.add('active');
                } else {
                    targetPill.classList.toggle('active');
                    if (allBtn) allBtn.classList.remove('active');
                }
            } else {
                if (targetPill === allBtn) { allPillsInContainer.forEach(p => p.classList.remove('active')); }
                else if (e.shiftKey && pillContainer.dataset.lastClickedIndex !== undefined) {
                    const lastIndex = parseInt(pillContainer.dataset.lastClickedIndex);
                    const currentIndex = allPillsInContainer.indexOf(targetPill);
                    if (lastIndex !== -1 && currentIndex !== -1) {
                        const start = Math.min(lastIndex, currentIndex);
                        const end = Math.max(lastIndex, currentIndex);
                        for (let i = start; i <= end; i++) { allPillsInContainer[i].classList.add('active'); }
                    }
                } else if (e.ctrlKey || e.metaKey) {
                    targetPill.classList.toggle('active');
                    pillContainer.dataset.lastClickedIndex = allPillsInContainer.indexOf(targetPill);
                } else {
                    const wasActive = targetPill.classList.contains('active');
                    const numActive = pillContainer.querySelectorAll('.account-pill.active:not([data-value="all"])').length;
                    allPillsInContainer.forEach(p => p.classList.remove('active'));
                    if (!wasActive || numActive > 1) { targetPill.classList.add('active'); }
                    pillContainer.dataset.lastClickedIndex = allPillsInContainer.indexOf(targetPill);
                }
            }
            const anyActive = pillContainer.querySelector('.account-pill.active:not([data-value="all"])');
            if (allBtn) allBtn.classList.toggle('active', !anyActive);
            clearSelection();
            updateFiltersAndRender();
        });
    }

    // ---- Bouton flottant d'ajout (+) ----
    const addOperationFab = document.getElementById('add-operation-fab');
    if (addOperationFab) {
        addOperationFab.addEventListener('click', () => {
            resetAndEnableForm();
            updateCurrencyField('');
            if (elements.formModalOverlay) elements.formModalOverlay.classList.remove('hidden');
        });
    }

    // ---- Modale de formulaire de transaction ----
    if (elements.form) {
        elements.form.addEventListener('submit', (e) => {
            handleTransactionSubmit(e);
            if (elements.formModalOverlay) elements.formModalOverlay.classList.add('hidden');
        });
    }
    const closeFormBtn = document.getElementById('close-form-modal-btn');
    if (closeFormBtn) {
        closeFormBtn.addEventListener('click', () => {
            if (elements.formModalOverlay) elements.formModalOverlay.classList.add('hidden');
        });
    }
    if (elements.cancelEditBtn) {
        elements.cancelEditBtn.addEventListener('click', () => {
            resetAndEnableForm();
            if (elements.formModalOverlay) elements.formModalOverlay.classList.add('hidden');
        });
    }

    // ---- Modale d'édition de compte ----
    const editAccountModal = document.getElementById('edit-account-modal-overlay');
    if (editAccountModal) {
        const editAccountForm = document.getElementById('edit-account-form');
        const editAccountCancelBtn = document.getElementById('edit-account-cancel-btn');

        document.body.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-account-btn');
            if (editBtn) {
                const accountData = JSON.parse(editBtn.dataset.account);
                document.getElementById('edit-account-original-name').value = accountData.name;
                document.getElementById('edit-account-name').value = accountData.name;
                document.getElementById('edit-account-currency').value = accountData.currency;
                document.getElementById('edit-account-color').value = accountData.color || '#000000';
                editAccountModal.classList.remove('hidden');
            }
        });

        if (editAccountCancelBtn) {
            editAccountCancelBtn.addEventListener('click', () => editAccountModal.classList.add('hidden'));
        }

        if (editAccountForm) {
            editAccountForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitButton = editAccountForm.querySelector('button[type="submit"]');
                submitButton.disabled = true;
                const originalName = document.getElementById('edit-account-original-name').value;
                const updatedAccount = {
                    name: document.getElementById('edit-account-name').value.trim(),
                    currency: document.getElementById('edit-account-currency').value,
                    color: document.getElementById('edit-account-color').value
                };
                const originalAccount = { name: originalName };
                try {
                    await updateAccountInList(originalAccount, updatedAccount);
                    editAccountModal.classList.add('hidden');
                } catch (error) {
                    alert(`Erreur: ${error}`);
                } finally {
                    submitButton.disabled = false;
                }
            });
        }
    }

    // ---- Modale des détails de transaction ----
    const detailsModalOverlay = document.getElementById('details-modal-overlay');
    const closeDetailsModalBtn = document.getElementById('close-details-modal-btn');
    if (closeDetailsModalBtn) {
        closeDetailsModalBtn.addEventListener('click', () => detailsModalOverlay.classList.add('hidden'));
    }
    if (detailsModalOverlay) {
        detailsModalOverlay.addEventListener('click', (e) => { if (e.target === detailsModalOverlay) { detailsModalOverlay.classList.add('hidden'); } });
    }

    // ---- Modale d'administration ----
    if (elements.closeAdminModalBtn) {
        elements.closeAdminModalBtn.addEventListener('click', () => elements.adminModalOverlay.classList.add('hidden'));
    }
    if (elements.adminTabs) {
        elements.adminTabs.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                const tab = e.target.dataset.tab;
                elements.adminTabs.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                const activeTabContent = document.getElementById(`tab-${tab}`);
                if (activeTabContent) activeTabContent.classList.add('active');
            }
        });
    }

    // ---- Modale de gestion des données (Import/Export) ----
    const openDataModalBtn = document.getElementById('open-data-modal-btn');
    if (openDataModalBtn) {
        openDataModalBtn.addEventListener('click', () => {
            if (elements.dataModalOverlay) elements.dataModalOverlay.classList.remove('hidden');
        });
    }
    if (elements.closeDataModalBtn) {
        elements.closeDataModalBtn.addEventListener('click', () => {
            if (elements.dataModalOverlay) elements.dataModalOverlay.classList.add('hidden');
        });
    }

    // ---- Actions de masse ----
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.transaction-checkbox').forEach(cb => {
                cb.checked = isChecked;
                if (isChecked) { selectedTxIds.add(cb.dataset.id); } else { selectedTxIds.delete(cb.dataset.id); }
            });
            updateBulkActionsUI();
        });
    }
    if (elements.transactionsList) {
        elements.transactionsList.addEventListener('change', (e) => {
            if (e.target.classList.contains('transaction-checkbox')) {
                const id = e.target.dataset.id;
                if (e.target.checked) { selectedTxIds.add(id); } else { selectedTxIds.delete(id); }
                updateBulkActionsUI();
            }
        });
    }
    const bulkActionBar = document.getElementById('bulk-actions-bar');
    if (bulkActionBar) {
        const bulkModifyBtn = document.getElementById('bulk-modify-btn');
        const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
        if (bulkModifyBtn) bulkModifyBtn.addEventListener('click', handleBulkModify);
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', () => {
                showConfirmationModal(`Supprimer ${selectedTxIds.size} opérations`, 'Action irréversible.', async () => {
                    await deleteTransactionsBatch(Array.from(selectedTxIds));
                    clearSelection();
                });
            });
        }
    }

    // ---- Modale de modification en masse ----
    const bulkEditModal = document.getElementById('bulk-edit-modal-overlay');
    if (bulkEditModal) {
        const bulkEditCancelBtn = document.getElementById('bulk-edit-cancel-btn');
        const bulkEditForm = document.getElementById('bulk-edit-form');

        if (bulkEditCancelBtn) {
            bulkEditCancelBtn.addEventListener('click', () => bulkEditModal.classList.add('hidden'));
        }

        if (bulkEditForm) {
            const fieldSelect = document.getElementById('bulk-edit-field-select');
            if (fieldSelect) {
                fieldSelect.addEventListener('change', (e) => {
                    const field = e.target.value;
                    const container = document.getElementById('bulk-edit-value-container');
                    const confirmBtn = document.getElementById('bulk-edit-confirm-btn');
                    if (!container || !confirmBtn) return;
                    container.innerHTML = '';
                    confirmBtn.disabled = true;
                    if (!field) return;
                    let options = [];
                    if (field === 'compte') options = (localUIData.dropdownOptions.comptes.values || []).map(acc => acc.name);
                    else if (field === 'categorie') options = localUIData.dropdownOptions.categories.values;
                    else if (field === 'affectation') options = localUIData.dropdownOptions.affectations.values;

                    populateSelect('bulk-edit-field-select', ['compte', 'categorie', 'affectation'], 'Sélectionner un champ...');

                    container.innerHTML = `<label for="bulk-edit-value-select" class="block text-sm font-medium text-gray-600 mb-1">Nouvelle valeur</label><select id="bulk-edit-value-select" class="form-input" required>${options.map(o => `<option value="${o}">${o}</option>`).join('')}</select>`;
                    confirmBtn.disabled = false;
                });
            }
            bulkEditForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const field = document.getElementById('bulk-edit-field-select').value;
                const value = document.getElementById('bulk-edit-value-select').value;
                if (!field || !value) return;
                const btn = document.getElementById('bulk-edit-confirm-btn');
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Modification...';
                await updateTransactionsBatch(Array.from(selectedTxIds), field, value);
                bulkEditModal.classList.add('hidden');
                clearSelection();
                btn.disabled = false;
                btn.innerHTML = 'Appliquer';
            });
        }
    }

    // ---- Modale de confirmation ----
    if (elements.confirmActionBtn) {
        elements.confirmActionBtn.addEventListener('click', () => { if (onConfirmCallback) onConfirmCallback(); hideConfirmationModal(); });
    }
    if (elements.confirmCancelBtn) {
        elements.confirmCancelBtn.addEventListener('click', () => {
            hideConfirmationModal();
        });
    }

    // ---- Historique Déroulant ----
    const toggleBtn = document.getElementById('toggle-history-btn');
    const historyContainer = document.getElementById('history-table-container');

    if (toggleBtn && historyContainer) {
        toggleBtn.addEventListener('click', () => {
            const isHidden = historyContainer.classList.toggle('hidden');
            toggleBtn.textContent = isHidden ? 'Afficher' : 'Masquer';
        });
    }

    // Initialise les écouteurs de la liste de transactions elle-même
    initTransactionListEventListeners();
}