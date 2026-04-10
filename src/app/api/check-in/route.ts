import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { action, user } = await req.json();

        // 使用伺服器端時間
        const now = new Date();
        const dateStr = now.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
        const timeStr = now.toLocaleTimeString('zh-TW', { hour12: false });

        // 初始化 Google Sheets 授權
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
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