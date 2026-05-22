"use client";

import { useState } from "react";

interface PromptItem {
    category: string;
    title: string;
    desc: string;
    content: string;
    featured?: boolean;
    badge?: string;
}

const grandmasterPrompt = `# Role: 首席提示詞煉金術士 (Chief Prompt Alchemist)

## Profile
- **Author**: Singularity Grandmaster
- **Version**: 2.3 (CoT-Enhanced Edition)
- **Goal**: 將用戶模糊的需求，透過嚴密的邏輯推演，轉化為生產級的「大師級 Prompt」。
- **Core Philosophy**: 「透視本質，先思後行」。不僅僅是修飾文字,而是重構思維邏輯。

## 評分標準 (The Rubric)
我們將針對生成的 Prompt 進行 5 維度極限測試 (0-100 分):
1. **結構性 (Structure)**: Markdown 層級是否如手術刀般精準？視覺動線是否無阻礙?
2. **明確性 (Clarity)**: 是否消除了所有歧義？是否有具體的 [Context] 與 [Constraints]?
3. **邏輯力 (Reasoning)**: 是否植入了思維鏈 (CoT)？流程是否閉環?
4. **防禦性 (Defense)**: 邊界條件 (Edge Cases) 是否被覆蓋？是否防止了 AI 偷懶或幻覺?
5. **模組化 (Modularity)**: 變數 {{Variables}} 設置是否便於規模化復用?

## Workflow: 煉成循環 (The Alchemy Loop)
請嚴格依照以下順序執行,不可跳過任何步驟:

### Phase 1: 需求診斷與過濾 (Diagnosis & Filtering)
1. **輸入分析**:審視用戶意圖。
2. **CRITICAL RULE (邏輯閘)**:若用戶輸入屬於以下情況,**禁止生成 Prompt**,直接進入「引導模式」:
   * 目標模糊(如:「寫個文案」、「幫我寫程式」但未指明細節)。
   * 缺乏關鍵變數(如:未指定受眾、語氣、平台)。
   * *Action*: 請用專業且引導性的口吻,提出 2-3 個最具殺傷力(關鍵)的問題,協助用戶釐清核心需求。

### Phase 2: 煉成反應 (The Crucible - Internal Processing)
**[重要]** 在輸出最終結果前,你必須先在後台執行 \`<thinking_process>\`(思維鏈):
1. **Drafting**: 構建 V1 版本的 Prompt 架構。
2. **Critique**: 扮演一個挑剔的測試者,攻擊 V1 的弱點(例如:如果用戶輸入空值會怎樣？如果用戶語言設定錯誤怎麼辦？指令是否會讓 AI 產生幻覺?)。
3. **Optimization**: 針對 Critique 發現的缺點進行修補,寫入防呆機制、範例 (Few-Shot) 與邏輯引導。

### Phase 3: 最終交付 (Final Output)
確認經過 Phase 2 的推演與優化後,請依序輸出以下三個區塊:

#### 1. 🧪 煉成報告 (Alchemy Report)
> - **品質評級**: [S/A/B] (基於 Rubric 的客觀評分)
> - **邏輯修復**: [說明你發現了原需求的什麼漏洞,並如何修補了它]
> - **關鍵機制**: [解釋你加入了什麼特殊的 Prompt 技巧,如 SCQA、Few-Shot、Role-Play 或防注入機制]

#### 2. 📜 大師級 Prompt (Masterpiece)
(必須使用 Markdown 代碼塊封裝,方便一鍵複製)
(結構範本:# Role -> ## Profile -> ## Constraints -> ## Workflow -> ## Rules -> ## Initialization)
(規範:所有需要用戶填寫的內容,請統一使用 {{user_variable}} 雙大括號格式標註)

#### 3. ⚙️ 使用指南 (User Guide)
(一句話說明如何啟動此 Prompt,例如:「請填入變數後發送...」)

---

## Example (Mental Model)
**User**: "幫我寫個 Python 爬蟲。"
**Alchemist (Phase 1)**: (拒絕生成) "為了確保代碼可用,請告訴我:1. 目標網站結構？ 2. 需要抓取的具體欄位？ 3. 是否需要處理反爬機制?"

**User**: "抓取 PTT 標題,不需要反爬,存成 CSV。"
**Alchemist (Phase 2 - Hidden)**:
* Thinking: 結構簡單,但需注意 PTT 有年齡驗證頁面 (Defense)。需加入 BeautifulSoup 與 requests 庫。輸出格式限制為 CSV。
**Alchemist (Phase 3)**: [輸出包含處理 cookie 邏輯與完整註解的 Python Expert Prompt]

---

## Initialization
你現在是 v2.3 版的「首席提示詞煉金術士」。
請簡短自我介紹(不超過 50 字),展現你的專業、嚴謹與邏輯力。
最後詢問:「請丟入您的原始想法,我將為您提煉出邏輯最嚴密的 Prompt。」`;

const prompts: PromptItem[] = [
    {
        category: "提示詞宗師",
        title: "首席提示詞煉金術士 v2.3",
        desc: "把你模糊的想法丟進去，它會反問你關鍵問題，然後產出一份結構完整、含防呆機制的「大師級 Prompt」可直接複製給任何 LLM。",
        content: grandmasterPrompt,
        featured: true,
        badge: "✨ 進階",
    },
    {
        category: "會議紀錄",
        title: "逐字稿議題化整理",
        desc: "將會議逐字稿依議題重組，產出結構化紀錄。",
        content: "你是一位專業的會議紀錄撰寫者。請依下列規範整理會議逐字稿：\n1. 將內容依議題分類，合併分散在不同段落的相同議題。\n2. 每個議題需包含：議題標題、背景說明、研議要點、共識決議。\n3. 條列待辦事項並標註負責單位與時限。\n4. 以正式公文語氣撰寫，避免主觀情緒字眼。",
    },
    {
        category: "教學設計",
        title: "課程大綱生成器",
        desc: "依主題快速產出 4 週課程大綱結構。",
        content: "請依以下主題生成 4 週課程大綱：\n主題：{請填入主題}\n對象：{請填入學習對象}\n\n每週需提供：\n- 學習目標（3 點）\n- 核心概念\n- 課堂活動建議\n- 評量方式\n- 延伸閱讀",
    },
    {
        category: "AI 工具應用",
        title: "n8n 工作流規劃",
        desc: "協助你規劃自動化流程節點。",
        content: "我想用 n8n 自動化以下流程：\n{請描述目的與來源/目標系統}\n\n請列出：\n1. 需要哪些節點（trigger / action / 邏輯）\n2. 每個節點的設定要點\n3. 可能遇到的錯誤與處理方式\n4. 一個簡單的測試方法",
    },
    {
        category: "公文撰寫",
        title: "會議通知公文",
        desc: "快速產出符合公文格式的會議通知。",
        content: "請依下列資訊撰寫會議通知公文（受文者：相關單位）：\n會議名稱：\n時間：\n地點：\n召集人：\n議程：\n備註：\n\n格式需符合公文三段式：主旨、說明、辦法。",
    },
    {
        category: "資料摘要",
        title: "長篇文件摘要",
        desc: "將長篇文件壓縮成重點摘要。",
        content: "請將以下內容摘要為：\n1. 一句話總結（30 字內）\n2. 三點核心觀點\n3. 兩個值得進一步追問的問題\n\n內容：\n{請貼上原始內容}",
    },
];

const LONG_PROMPT_THRESHOLD = 320; // 超過此字數預設摺疊

export default function LearnPrompts({ onBack }: { onBack: () => void }) {
    const [copied, setCopied] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const handleCopy = (title: string, content: string) => {
        navigator.clipboard.writeText(content);
        setCopied(title);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div className="min-h-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
            {/* Sticky 返回列 */}
            <div className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-slate-200 px-6 py-3">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-900 transition-all"
                    >
                        <span className="text-lg">←</span>
                        <span>返回 AI 學習 Hub</span>
                    </button>
                    <div className="text-xs text-slate-500">AI 學習 / <span className="font-bold text-slate-700">Prompt 資料庫</span></div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-6 py-10">
                {/* Hero */}
                <header className="mb-8">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-2xl" style={{background: "linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)"}}>
                            💡
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Prompt 資料庫</h1>
                    </div>
                    <p className="text-slate-600 leading-relaxed">收錄常用 Prompt 範本，點擊即可複製使用</p>
                </header>

                <div className="space-y-4">
                    {prompts.map((p, i) => {
                        const isLong = p.content.length > LONG_PROMPT_THRESHOLD;
                        const isOpen = expanded[`${i}`] || false;
                        const showFull = !isLong || isOpen;
                        return (
                            <div key={i}
                                 className="rounded-2xl transition-all p-5"
                                 style={{
                                     background: p.featured
                                         ? "linear-gradient(135deg, rgba(245,243,255,0.95), rgba(237,233,254,0.92))"
                                         : "rgba(255,255,255,0.95)",
                                     border: p.featured ? "1.5px solid rgba(167,139,250,0.55)" : "1px solid rgba(226,232,240,0.85)",
                                     boxShadow: p.featured
                                         ? "0 16px 36px -14px rgba(124,58,237,0.25), inset 0 1px 0 rgba(255,255,255,0.95)"
                                         : "0 4px 14px -8px rgba(30,58,138,0.1)",
                                 }}>
                                <div className="flex justify-between items-start gap-4 mb-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                                            <span className="inline-block text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded"
                                                  style={{
                                                      background: p.featured
                                                          ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                                                          : "rgba(219,234,254,0.95)",
                                                      color: p.featured ? "#fff" : "#1e40af",
                                                      border: p.featured ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(147,197,253,0.5)",
                                                      boxShadow: p.featured ? "0 4px 10px -4px rgba(99,102,241,0.5)" : "none",
                                                  }}>
                                                {p.category}
                                            </span>
                                            {p.badge && (
                                                <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-full"
                                                      style={{
                                                          background: "linear-gradient(135deg, rgba(254,243,199,0.95), rgba(254,215,170,0.95))",
                                                          color: "#92400e",
                                                          border: "1px solid rgba(251,191,36,0.5)",
                                                      }}>
                                                    {p.badge}
                                                </span>
                                            )}
                                        </div>
                                        <h3 className={`font-black text-slate-900 ${p.featured ? "text-lg md:text-xl" : "text-base"}`}>{p.title}</h3>
                                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{p.desc}</p>
                                    </div>
                                    <button
                                        onClick={() => handleCopy(p.title, p.content)}
                                        className="shrink-0 text-xs font-black py-2 px-3 rounded-xl transition-all active:scale-[0.97] flex items-center gap-1"
                                        style={{
                                            background: p.featured
                                                ? "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
                                                : "rgba(255,255,255,0.95)",
                                            color: p.featured ? "#fff" : "#1e40af",
                                            border: p.featured ? "1px solid rgba(255,255,255,0.3)" : "1.5px solid rgba(30,58,138,0.7)",
                                            boxShadow: p.featured ? "0 10px 22px -8px rgba(99,102,241,0.55)" : "none",
                                        }}
                                    >
                                        📋 一鍵複製
                                    </button>
                                </div>
                                <div className="relative mt-3">
                                    <pre className="text-xs text-slate-800 rounded-xl p-4 whitespace-pre-wrap font-mono leading-relaxed overflow-hidden"
                                         style={{
                                             background: p.featured ? "rgba(255,255,255,0.85)" : "rgba(248,250,252,0.9)",
                                             border: p.featured ? "1px solid rgba(167,139,250,0.35)" : "1px solid rgba(226,232,240,0.85)",
                                             maxHeight: showFull ? "none" : "180px",
                                         }}>
{p.content}
                                    </pre>
                                    {!showFull && (
                                        <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none rounded-b-xl"
                                             style={{
                                                 background: `linear-gradient(180deg, transparent, ${p.featured ? "rgba(245,243,255,0.95)" : "rgba(255,255,255,0.95)"} 85%)`,
                                             }} />
                                    )}
                                </div>
                                {isLong && (
                                    <button
                                        onClick={() => setExpanded((prev) => ({ ...prev, [`${i}`]: !isOpen }))}
                                        className="mt-3 w-full text-xs font-black py-2 rounded-xl transition-all flex items-center justify-center gap-1.5"
                                        style={{
                                            background: p.featured
                                                ? "rgba(255,255,255,0.85)"
                                                : "rgba(248,250,252,0.9)",
                                            color: p.featured ? "#6d28d9" : "#1e40af",
                                            border: p.featured ? "1px solid rgba(167,139,250,0.45)" : "1px solid rgba(165,180,252,0.45)",
                                        }}
                                    >
                                        <span>{isOpen ? "▲" : "▼"}</span>
                                        <span>{isOpen ? "收合內容" : `展開全文（${p.content.length} 字）`}</span>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                {copied && (
                    <div className="fixed bottom-6 right-6 p-4 rounded-2xl text-sm font-bold shadow-xl z-50 text-white flex items-center gap-2"
                         style={{
                             background: "linear-gradient(135deg, #10b981, #0d9488)",
                             boxShadow: "0 16px 32px -10px rgba(13,148,136,0.55)",
                             border: "1px solid rgba(255,255,255,0.3)",
                         }}>
                        <span>✓</span>
                        <span>已複製：{copied}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
