import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

export async function POST(req: Request) {
    try {
        // 驗證身份
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        try {
            await adminAuth.verifyIdToken(authHeader.slice(7));
        } catch {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const { action, user } = await req.json();

        // Input 驗證
        if (!['check-in', 'check-out'].includes(action)) {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
        if (typeof user !== 'string' || user.length === 0 || user.length > 100) {
            return NextResponse.json({ error: 'Invalid user' }, { status: 400 });
        }

        // 使用伺服器端時間
        const now = new Date();
        const dateStr = now.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
        const timeStr = now.toLocaleTimeString('zh-TW', { hour12: false });

        // 初始化 Google Sheets 授權
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY?.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID || '', serviceAccountAuth);
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];

        // 直接寫入新的一行 (原始紀錄模式)
        await sheet.addRow({
            '日期': dateStr,
            '姓名': user,
            '動作': action === 'check-in' ? '簽到' : '簽退',
            '時間': timeStr,
        });

        // 如果你有連動 Firebase，這裡也可以補上 addDoc 邏輯
        // await addDoc(collection(db, 'check_ins'), { ... });

        return NextResponse.json({ success: true, time: timeStr });
    } catch (error: any) {
        console.error('簽到失敗:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}