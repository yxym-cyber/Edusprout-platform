import { NextResponse } from "next/server";

/**
 * 此路由已停用：改為從瀏覽器直接呼叫 LM Studio (via ngrok)。
 * 詳見 src/lib/lmStudio.ts 與 src/app/full-time/page.tsx 的 generateAIReport()
 *
 * 你可以手動刪除這個檔案：
 *   rm src/app/api/generate-summary/route.ts
 *   rmdir src/app/api/generate-summary
 */
export async function POST() {
    return NextResponse.json(
        { error: "此 API 已停用，請使用瀏覽器端 LM Studio 整合" },
        { status: 410 }
    );
}
