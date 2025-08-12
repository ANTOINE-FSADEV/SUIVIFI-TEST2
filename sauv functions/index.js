// ====================================================================
// IMPORTS
// ====================================================================
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onUserCreated } = require("firebase-functions/v2/identity");
const { setGlobalOptions } = require("firebase-functions/v2");

// ====================================================================
// INITIALISATION
// ====================================================================
admin.initializeApp();
setGlobalOptions({ region: "europe-west1" });

// ====================================================================
// FONCTION 1 : Mettre à jour les "claims" quand les permissions changent
// ====================================================================
exports.updateUserPermissionsClaims = onDocumentWritten(
    "artifacts/fsadev-suivifi/public/data/user_permissions/{userId}",
    async (event) => {
        const userId = event.params.userId;
        const snapshot = event.data;

        if (!snapshot.after.exists) {
            console.log(`Permissions deleted for user ${userId}. Clearing claims.`);
            return admin.auth().setCustomUserClaims(userId, null);
        }

        const userData = snapshot.after.data();
        const readableAccounts = (userData.allowed_accounts || []).map(acc => acc.name);
        const writableAccounts = (userData.allowed_accounts || []).filter(acc => acc.access === 'write').map(acc => acc.name);

        const newClaims = {
            readable_accounts: readableAccounts,
            writable_accounts: writableAccounts
        };

        try {
            await admin.auth().setCustomUserClaims(userId, newClaims);
            console.log(`Successfully set custom claims for user ${userId}:`, newClaims);
        } catch (error) {
            console.error(`Error setting custom claims for user ${userId}:`, error);
        }
    }
);

// ====================================================================
// FONCTION 2 : Créer le document de permissions pour un nouvel utilisateur
// ====================================================================
exports.createPermissionsOnNewUser = onUserCreated(async (user) => {
    const userId = user.uid;
    const permissionsRef = admin.firestore().doc(
        `artifacts/fsadev-suivifi/public/data/user_permissions/${userId}`
    );

    console.log(`New user created: ${userId}. Creating default permissions document.`);

    return permissionsRef.set({
        allowed_accounts: [],
        allowed_categories: [],
        allowed_affectations: []
    });
});

// NOTE : Il n'y a plus d'accolade fermante seule ici.