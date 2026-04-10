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
      您是一位專業的學術秘書。請分析提供的會議逐字稿，並根據以下 JSON 格式生成結構化摘要。
      請務必使用『繁體中文』回答。

      輸出規格 (JSON)：
      {
        "title": "會議標題",
        "conclusions": ["結論 1", "結論 2"],
        "work_updates": [
          { "member": "成員姓名", "update": "工作進度簡述" }
        ],
        "citations": [
          { "text": "逐字稿中的關鍵原文引用", "context": "該引用的背景說明" }
        ]
      }

      注意：請僅回傳 JSON 格式內容，不要包含任何開頭說明或結尾結論。
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
