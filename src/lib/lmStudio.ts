/**
 * LM Studio 瀏覽器端 client（直接從瀏覽器呼叫桌機 LM Studio via ngrok）
 *
 * 注意：
 * 1. 桌機 LM Studio 必須開啟 CORS（Developer → Server settings → Enable CORS）
 * 2. 桌機 ngrok 必須處於運行狀態
 * 3. 這個 URL 寫死在前端是 OK 的（瀏覽器本來就看得到）
 */

// ngrok 對外網址
export const LM_STUDIO_BASE_URL = "https://shea-projectional-amal.ngrok-free.dev";

// LM Studio 載入的模型 id
export const LM_STUDIO_MODEL = "google/gemma-4-26b-a4b";

// 預設逾時（毫秒）。Gemma 27B 在消費級顯卡上可能跑 1-2 分鐘
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface ChatCompletionOptions {
    temperature?: number;
    max_tokens?: number;
    timeoutMs?: number;
}

/**
 * 呼叫 LM Studio /v1/chat/completions（OpenAI 相容 API）
 * 回傳 assistant 的純文字內容
 */
export async function chatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {}
): Promise<string> {
    const {
        temperature = 0.3,
        max_tokens = 4096,
        timeoutMs = DEFAULT_TIMEOUT_MS,
    } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(`${LM_STUDIO_BASE_URL}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // 跳過 ngrok 免費版的瀏覽器警告頁
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({
                model: LM_STUDIO_MODEL,
                messages,
                temperature,
                max_tokens,
                stream: false,
            }),
            signal: controller.signal,
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(`LM Studio HTTP ${res.status}: ${errText.slice(0, 300)}`);
        }

        const data = await res.json();
        const content: string | undefined = data?.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error("LM Studio 回傳空內容");
        }
        return content;
    } catch (error: any) {
        const msg = String(error?.message || error || "");
        if (msg.includes("aborted") || error?.name === "AbortError") {
            throw new Error("呼叫超時（5 分鐘），請確認桌機 LM Studio 與 ngrok 正常運作");
        }
        if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
            throw new Error("無法連線到本地模型。請確認桌機已開啟 LM Studio Server、ngrok 正在運行、CORS 已啟用");
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * 從模型輸出中萃取 JSON（防呆處理 markdown code block 等情況）
 */
export function extractJson<T = any>(raw: string): T {
    let text = raw.trim();

    // 移除 ```json ... ``` 或 ``` ... ``` 區塊標記
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    try {
        return JSON.parse(text);
    } catch {
        // Fallback：抓出第一個 { 到最後一個 } 之間的內容
        const firstBrace = text.indexOf("{");
        const lastBrace = text.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            const sliced = text.slice(firstBrace, lastBrace + 1);
            return JSON.parse(sliced);
        }
        throw new Error("無法從模型輸出解析 JSON");
    }
}

/**
 * 會議紀錄結構化輸出
 */
export interface MeetingSummary {
    title: string;
    issues: Array<{
        title: string;
        background: string;
        discussion_points: string[];
        conclusion: string;
    }>;
    action_items: Array<{
        id: number;
        task: string;
        owner: string;
        deadline: string;
    }>;
    notes: string;
}

const MEETING_SYSTEM_PROMPT = `
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
請務必使用『繁體中文』，**僅回傳一個合法 JSON 物件**，不要包含任何說明文字、不要使用 markdown code block（不要 \`\`\`json）。直接從 { 開始，以 } 結束。

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
`.trim();

/**
 * 從逐字稿產生會議紀錄
 */
export async function generateMeetingSummary(transcriptText: string): Promise<MeetingSummary> {
    const rawText = await chatCompletion(
        [
            { role: "system", content: MEETING_SYSTEM_PROMPT },
            { role: "user", content: transcriptText },
        ],
        { temperature: 0.3, max_tokens: 4096 }
    );
    return extractJson<MeetingSummary>(rawText);
}
