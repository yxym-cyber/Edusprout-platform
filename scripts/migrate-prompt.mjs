// 一次性遷移腳本：將舊貼文的 promptText 搬移到新的 prompt 欄位
// 執行方式：node scripts/migrate-prompt.mjs

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDMK6eYMZZcUXd43cABkTeq5HGUFFHc8T8",
    authDomain: "meeting-platform-47259.firebaseapp.com",
    projectId: "meeting-platform-47259",
    storageBucket: "meeting-platform-47259.firebasestorage.app",
    messagingSenderId: "134132038571",
    appId: "1:134132038571:web:43311817ab9bd5d85cf0ee",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrate() {
    console.log("讀取所有貼文...");
    const snap = await getDocs(collection(db, "posts"));

    let updated = 0;
    let skipped = 0;

    for (const d of snap.docs) {
        const data = d.data();
        const hasOldPrompt = data.promptText && data.promptText.trim();
        const hasNewPrompt = data.prompt && data.prompt.trim();

        if (hasOldPrompt && !hasNewPrompt) {
            console.log(`更新貼文 ${d.id}（作者：${data.authorName}）`);
            await updateDoc(doc(db, "posts", d.id), {
                prompt: data.promptText.trim(),
            });
            updated++;
        } else {
            skipped++;
        }
    }

    console.log(`\n完成！共更新 ${updated} 筆，略過 ${skipped} 筆`);
    process.exit(0);
}

migrate().catch((err) => {
    console.error("遷移失敗：", err);
    process.exit(1);
});
