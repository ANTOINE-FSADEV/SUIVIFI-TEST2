const admin = require("firebase-admin");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");

admin.initializeApp();
setGlobalOptions({ region: "europe-west1" });

// ON NE GARDE QUE CETTE FONCTION
exports.updateUserPermissionsClaims = onDocumentWritten(
    "artifacts/fsadev-suivifi/public/data/user_permissions/{userId}",
    async (event) => {
        // ... le contenu de la fonction reste le même
        const userId = event.params.userId;
        const snapshot = event.data;

        if (!snapshot.after.exists) {
            return admin.auth().setCustomUserClaims(userId, null);
        }
        const userData = snapshot.after.data();
        const readableAccounts = (userData.allowed_accounts || []).map(acc => acc.name);
        const writableAccounts = (userData.allowed_accounts || []).filter(acc => acc.access === 'write').map(acc => acc.name);
        const newClaims = {
            readable_accounts: readableAccounts,
            writable_accounts: writableAccounts
        };
        return admin.auth().setCustomUserClaims(userId, newClaims);
    }
);