import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

let adminApp: App;

function getAdminApp(): App {
    if (getApps().length > 0) {
        return getApps()[0];
    }

    adminApp = initializeApp({
        credential: cert({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
        }),
    });

    return adminApp;
}

export const adminDb = getFirestore(getAdminApp());
export const adminAuth = getAuth(getAdminApp());
