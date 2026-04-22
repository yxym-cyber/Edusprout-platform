import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // 1. 初始化驗證 (從環境變數讀取)
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key:  process.env.GOOGLE_PRIVATE_KEY?.replace(/^"|"$/g, '').replace(/\\n/g, '\n'), // 處理換行符號
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        // 2. 載入試算表
        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID || '', serviceAccountAuth);
        await doc.loadInfo();

        // 3. 取得第一個工作表並寫入測試資料
        const sheet = doc.sheetsByIndex[0];
        await sheet.addRow({
            '時間': new Date().toLocaleString('zh-TW'),
            '訊息': '連線測試成功！這是來自 Next.js 的訊息',
            '狀態': '成功'
        });

        return NextResponse.json({ message: `成功連線到試算表：${doc.title}` });
    } catch (error: any) {
        console.error('測試失敗:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}