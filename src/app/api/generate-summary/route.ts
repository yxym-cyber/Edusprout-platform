import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!apiKey) {
  throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
}
const genAI = new GoogleGenerativeAI(apiKey);
const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const model = genAI.getGenerativeModel({ model: modelName });

// Retry 工具函式：遇到 503 自動重試，最多 5 次
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithRetry(
  prompt: [string, string],
  maxRetries = 5
): Promise<any> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result;
    } catch (error: any) {
      lastError = error;

      const message = String(error?.message || "");
      const isRetryable =
        message.includes("503") ||
        message.includes("Service Unavailable") ||
        message.includes("high demand");

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const baseDelay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, 8s, 16s
      const jitter = Math.floor(Math.random() * 500);
      const delay = baseDelay + jitter;

      console.warn(
        `[Gemini] 第 ${attempt + 1} 次失敗（503），${delay}ms 後重試... | model: ${modelName} | error: ${message}`
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Firestore REST API 輔助函式
async function firestoreGet(path: string, token: string) {
  const res = await fetch(`${FS_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore GET failed: ${err}`);
  }
  return res.json();
}

async function firestoreAdd(collection: string, fields: Record<string, any>, token: string) {
  const res = await fetch(`${FS_BASE}/${collection}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore POST failed: ${err}`);
  }
  return res.json();
}

// 將 JS 值轉成 Firestore REST API 的 Value 格式
function toFsValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "number") return Number.isInteger(val) ? { integerValue: val } : { doubleValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFsValue) } };
  if (typeof val === "object") {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) fields[k] = toFsValue(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export async function POST(req: NextRequest) {
  try {
    const { meetingId, sourceId } = await req.json();
    if (!meetingId || !sourceId) {
      return NextResponse.json({ error: "Missing required IDs" }, { status: 400 });
    }

    // 取得使用者 ID Token
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. 用 ID Token 從 Firestore 讀取逐字稿
    const sourceDoc = await firestoreGet(`meeting_sources/${sourceId}`, token);
    const transcriptText = sourceDoc.fields?.transcript_text?.stringValue;
    if (!transcriptText) {
      return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
    }

    // 2. 呼叫 Gemini AI
    const systemPrompt = `
# Role: 高階行政決策分析師 (Executive Meeting Strategist)

## Profile
- Expertise: 擅長處理複雜政策討論（科技、教育），具備極強的邏輯歸納能力。
- Writing Style: 採用「去人稱化」的行政公文語體，用語專業、精煉，展現中立且客觀的立場。

## Core Mission
將混亂的會議逐字稿轉化為以「議題導向」為核心的正式會議紀錄。嚴禁出現「某某人說」、「某某人表示」、「我覺得」等口語表達，必須將其轉化為客觀事實或共識結論。

## Constraints
1. 去人稱化原則：使用「會議指出」、「經討論認為」、「現狀分析顯示」、「擬採取措施」等專業起手式。
2. 邏輯閉環：每個議題必須包含「背景/問題描述」、「討論要點」、「最終決議/共識」。
3. 專業術語：精確處理科技政策（如：AI 倫理、數位轉型）與教育政策（如：素養教育、產學合作）之術語。

## Workflow
### Step 1: 語意過濾與實體識別
從逐字稿中提取所有與「科技政策」及「教育政策」相關的核心名詞、政策目標與爭議點。

### Step 2: 議題模組化 (Issue-Based Reconstruction)
將內容依據議題重新排列。若同一議題在逐字稿中分散在不同段落，必須合併處理。
- 議題標題：精簡的標題（例如：關於 AI 輔助教學資源分配之研議）。
- 現狀內容：彙整各方提到的背景與挑戰。
- 研議方向：將各方意見轉化為客觀要點或「綜合評估」。

### Step 3: 行動任務提煉 (Action Items)
單獨列出所有提及的具體任務、負責單位（若有）與時程規劃。

## Output Format (JSON Only)
請務必使用『繁體中文』，僅回傳以下 JSON 格式，不要包含任何說明文字或 markdown 標記：

{
  "title": "會議標題（從逐字稿語意推斷）",
  "issues": [
    {
      "title": "議題名稱（精簡標題）",
      "background": "背景說明：目前面臨的政策環境或挑戰",
      "discussion_points": [
        "要點 1：客觀描述討論內容",
        "要點 2：針對...之疑慮，傾向採取...之方案"
      ],
      "conclusion": "共識決議：條列最終決議事項"
    }
  ],
  "action_items": [
    {
      "id": 1,
      "task": "具體行動內容",
      "owner": "負責單位或人員（若無則填「待定」）",
      "deadline": "預計完成時限（若無則填「待定」）"
    }
  ],
  "notes": "補充說明：記錄會議中提到的參考文獻、數據或不屬於上述議題的關鍵資訊（若無則填空字串）"
}
    `;

    const result = await generateWithRetry([systemPrompt, transcriptText]);
    let text = result.response.text();
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsedData = JSON.parse(text);

    // 3. 將結果寫入 Firestore（用 ID Token）
    const fields = {
      meetingId: toFsValue(meetingId),
      sourceId: toFsValue(sourceId),
      data: toFsValue(parsedData),
      version: toFsValue(1),
      createdAt: { timestampValue: new Date().toISOString() },
    };
    const genDoc = await firestoreAdd("meeting_generated", fields, token);
    const newId = genDoc.name?.split("/").pop();

    return NextResponse.json({ success: true, id: newId, data: parsedData });
  } catch (error: any) {
    console.error("--- AI Generation Error ---", error.message);
    return NextResponse.json({ error: error.message || "Failed to generate summary" }, { status: 500 });
  }
}
