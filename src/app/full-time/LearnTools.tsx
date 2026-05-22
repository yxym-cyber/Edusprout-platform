"use client";

import { useState } from "react";

type Category = "chat" | "search" | "image" | "code" | "agent" | "doc";
type Pricing = "free" | "paid" | "freemium";

interface Tool {
    name: string;
    maker: string;
    category: Category;
    icon: string;
    desc: string;
    useCases: string[];
    recommend: number; // 0-10
    difficulty: 1 | 2 | 3 | 4 | 5;
    stars: 0 | 1 | 2 | 3 | 4 | 5;
    pricing: Pricing;
}

const tools: Tool[] = [
    { name: "ChatGPT", maker: "OpenAI", category: "chat", icon: "🤖", pricing: "freemium",
      desc: "最廣為人知的對話 AI，能寫作、翻譯、分析、回答問題。免費版已非常實用，是入門 AI 最好的第一步，全球用戶數最多。",
      useCases: ["報告撰寫", "翻譯潤稿", "資料整理", "腦力激盪", "學習輔助"],
      recommend: 9.5, difficulty: 2, stars: 5 },
    { name: "Claude", maker: "Anthropic", category: "chat", icon: "✦", pricing: "freemium",
      desc: "擅長長文分析、邏輯推理與細膩表達，回答品質穩定。處理複雜文件、撰寫需要思辨的內容時特別突出，適合研究與寫作情境。",
      useCases: ["長文分析", "研究整理", "文案撰寫", "邏輯推理", "程式輔助"],
      recommend: 9.5, difficulty: 2, stars: 5 },
    { name: "Gemini", maker: "Google", category: "chat", icon: "💎", pricing: "freemium",
      desc: "整合 Google 搜尋、雲端硬碟、Gmail，在 Google 生態系工作的人特別順手。能處理超長文件，與 Workspace 深度整合是最大優勢。",
      useCases: ["Google 整合", "文件摘要", "郵件撰寫", "試算表分析"],
      recommend: 8.5, difficulty: 2, stars: 4 },
    { name: "Perplexity AI", maker: "Perplexity AI", category: "search", icon: "🔍", pricing: "freemium",
      desc: "AI 搜尋引擎，每個答案都附上來源連結，有效降低幻覺風險。用來快速查找資料、了解時事、確認事實，比傳統搜尋更有效率。",
      useCases: ["即時資料查詢", "新聞摘要", "來源查核", "競品研究"],
      recommend: 9.0, difficulty: 1, stars: 5 },
    { name: "NotebookLM", maker: "Google", category: "doc", icon: "📓", pricing: "free",
      desc: "上傳多份 PDF 後，AI 能跨文件回答問題並標注來源。念書、消化大量報告的神器，還能自動生成 Podcast 摘要音檔，完全免費。",
      useCases: ["文獻整理", "跨文件問答", "讀書筆記", "報告摘要"],
      recommend: 9.0, difficulty: 1, stars: 5 },
    { name: "Gamma", maker: "Gamma App", category: "doc", icon: "📊", pricing: "freemium",
      desc: "輸入主題或貼上文字，AI 自動生成精美簡報、文件或網頁。不需要設計技能，從打草稿到完成簡報只需幾分鐘，職場新人必學工具。",
      useCases: ["AI 簡報生成", "提案文件", "讀書報告", "視覺化呈現"],
      recommend: 9.0, difficulty: 1, stars: 5 },
    { name: "ChatGPT 圖像生成", maker: "OpenAI (GPT-4o)", category: "image", icon: "🖼️", pricing: "freemium",
      desc: "直接在 ChatGPT 對話中生成圖像，可以邊聊天邊調整，不需要學特殊指令。對初學者最友善，適合快速出圖用於簡報或社群。",
      useCases: ["快速出圖", "簡報插圖", "概念圖", "對話式修圖"],
      recommend: 8.5, difficulty: 1, stars: 4 },
    { name: "Midjourney", maker: "Midjourney Inc.", category: "image", icon: "🎨", pricing: "paid",
      desc: "目前畫質最精緻的 AI 圖像生成工具，適合製作簡報配圖、視覺提案、創意素材。需付費訂閱，輸出品質在業界首屈一指。",
      useCases: ["簡報配圖", "視覺設計", "創意發想", "社群素材"],
      recommend: 8.0, difficulty: 3, stars: 4 },
    { name: "Cursor", maker: "Anysphere", category: "code", icon: "⚡", pricing: "freemium",
      desc: "AI 原生程式碼編輯器，可以用自然語言描述需求直接生成或修改整個檔案。對非工程師想寫簡單程式的人也很友善，2025 年爆紅。",
      useCases: ["AI 寫程式", "自動重構", "自然語言轉程式", "全專案修改"],
      recommend: 9.0, difficulty: 2, stars: 5 },
    { name: "GitHub Copilot", maker: "GitHub / Microsoft", category: "code", icon: "👾", pricing: "paid",
      desc: "直接整合在 VS Code 等編輯器中，邊寫程式邊自動補全建議。有程式基礎的人生產力倍增器，學生可申請免費方案。",
      useCases: ["程式碼補全", "Bug 修復", "程式說明", "單元測試"],
      recommend: 8.5, difficulty: 3, stars: 4 },
    { name: "n8n", maker: "n8n GmbH", category: "agent", icon: "🔗", pricing: "freemium",
      desc: "開源工作流自動化工具，可以把 AI 和各種 App（Gmail、Notion、Slack）串在一起自動執行任務。有視覺化介面，不需要寫程式。",
      useCases: ["工作流自動化", "App 串接", "定時任務", "資料同步"],
      recommend: 8.0, difficulty: 4, stars: 4 },
    { name: "Make", maker: "Make (Integromat)", category: "agent", icon: "⚙️", pricing: "freemium",
      desc: "視覺化自動化平台，比 n8n 更容易上手，支援 1000+ 種應用程式串接。免費版就能處理基本自動化工作流，適合職場新人入門。",
      useCases: ["流程自動化", "表單處理", "通知推送", "資料轉換"],
      recommend: 8.5, difficulty: 3, stars: 4 },
];

const categoryMeta: Record<Category, { label: string; color: string; bg: string; border: string; emoji: string }> = {
    chat:   { label: "對話 AI",  color: "text-blue-900",  bg: "bg-blue-50",    border: "border-blue-200",    emoji: "💬" },
    search: { label: "AI 搜尋",  color: "text-cyan-800",  bg: "bg-cyan-50",    border: "border-cyan-200",    emoji: "🔍" },
    image:  { label: "圖像生成",  color: "text-pink-800",  bg: "bg-pink-50",    border: "border-pink-200",    emoji: "🎨" },
    code:   { label: "程式輔助",  color: "text-amber-800", bg: "bg-amber-50",   border: "border-amber-200",   emoji: "👾" },
    agent:  { label: "AI Agent", color: "text-violet-800",bg: "bg-violet-50",  border: "border-violet-200",  emoji: "⚙️" },
    doc:    { label: "文件整理",  color: "text-emerald-800",bg: "bg-emerald-50",border: "border-emerald-200", emoji: "📄" },
};

const pricingMeta: Record<Pricing, { label: string; cls: string }> = {
    free:     { label: "完全免費",  cls: "bg-emerald-100 text-emerald-800" },
    paid:     { label: "付費",      cls: "bg-yellow-100 text-yellow-800" },
    freemium: { label: "免費／付費", cls: "bg-indigo-100 text-indigo-800" },
};

export default function LearnTools({ onBack }: { onBack: () => void }) {
    const [filter, setFilter] = useState<Category | "all">("all");

    const filteredTools = filter === "all" ? tools : tools.filter(t => t.category === filter);

    return (
        <div className="min-h-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
            {/* Sticky 返回列 */}
            <div className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-slate-200 px-6 py-3">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-900 transition-all"
                    >
                        <span className="text-lg">←</span>
                        <span>返回 AI 學習 Hub</span>
                    </button>
                    <div className="text-xs text-slate-500">AI 學習 / <span className="font-bold text-slate-700">AI 工具對照</span></div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-6 py-10">
                {/* Hero */}
                <header className="mb-8">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-2xl" style={{background: "linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)"}}>
                            🗂️
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI 工具對照表</h1>
                    </div>
                    <p className="text-slate-600 leading-relaxed">精選 12 款實用 AI 工具，了解各工具適合的使用情境、上手難易度與推薦程度</p>
                </header>

                {/* Stats chips */}
                <div className="flex gap-2 flex-wrap mb-6">
                    <span className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1.5 text-xs text-slate-600 shadow-sm"><strong className="text-blue-900 font-bold">12</strong> 款精選工具</span>
                    <span className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1.5 text-xs text-slate-600 shadow-sm"><strong className="text-blue-900 font-bold">6</strong> 種使用情境</span>
                    <span className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1.5 text-xs text-slate-600 shadow-sm">🎯 適合大學新生與職場新鮮人</span>
                    <span className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1.5 text-xs text-slate-600 shadow-sm">📅 2025 年版</span>
                </div>

                {/* Intro card */}
                <div className="bg-blue-900 rounded-2xl p-6 md:p-7 mb-8 text-white flex flex-wrap gap-6 items-center">
                    <div className="flex-1 min-w-[260px]">
                        <h2 className="text-lg font-bold mb-1">不知道從哪開始學 AI？</h2>
                        <p className="text-sm text-blue-100 leading-relaxed">依使用情境分類，每張卡片列出推薦程度、上手難易度與主要使用場景。建議從推薦分數高、難易度低的工具優先入手。</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl px-5 py-4 min-w-[240px]">
                        <div className="text-xs font-bold mb-1.5">🎯 新手建議起點</div>
                        <div className="text-sm leading-relaxed">ChatGPT 或 Claude → Perplexity → NotebookLM → Gamma<br/><span className="text-blue-200 text-xs">四個工具皆有免費版，可涵蓋 80% 日常工作需求</span></div>
                    </div>
                </div>

                {/* Filter bar */}
                <div className="flex gap-2 flex-wrap items-center mb-6">
                    <span className="text-xs text-slate-500 mr-1">篩選：</span>
                    <FilterBtn active={filter === "all"} onClick={() => setFilter("all")}>全部工具</FilterBtn>
                    {(Object.keys(categoryMeta) as Category[]).map(cat => (
                        <FilterBtn key={cat} active={filter === cat} onClick={() => setFilter(cat)}>
                            {categoryMeta[cat].emoji} {categoryMeta[cat].label}
                        </FilterBtn>
                    ))}
                </div>

                {/* Tool grid */}
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {filteredTools.map((tool, i) => (
                        <ToolCard key={i} tool={tool} />
                    ))}
                </div>

                {/* Beginner path */}
                <div className="mt-10 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                        🎯 新手建議學習路徑
                    </h3>
                    <div className="flex gap-2 flex-wrap items-center">
                        {["ChatGPT 或 Claude", "Perplexity AI", "NotebookLM", "Gamma"].map((step, i, arr) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2 text-sm font-medium text-blue-900">
                                    <div className="w-5 h-5 rounded-full bg-blue-900 text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</div>
                                    {step}
                                </div>
                                {i < arr.length - 1 && <span className="text-slate-400">→</span>}
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-slate-600 mt-3 leading-relaxed">以上四個工具皆有完整免費版，可涵蓋日常工作 80% 的 AI 輔助需求。熟悉後再視工作需求延伸學習圖像生成、程式輔助或自動化工具。</p>
                </div>
            </div>
        </div>
    );
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`text-xs px-3.5 py-1.5 rounded-full border-2 font-medium transition-all ${
                active
                    ? "bg-blue-900 text-white border-blue-900 shadow"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-900"
            }`}
        >
            {children}
        </button>
    );
}

function ToolCard({ tool }: { tool: Tool }) {
    const meta = categoryMeta[tool.category];
    const pricing = pricingMeta[tool.pricing];

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 relative overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-all duration-200">
            {/* top accent bar */}
            <div className={`absolute top-0 left-0 right-0 h-1 ${meta.bg.replace("bg-", "bg-").replace("-50", "-500")}`} style={{ background: getCategoryBarColor(tool.category) }} />

            <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-xl shrink-0">
                    {tool.icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-base font-bold text-slate-900 truncate">{tool.name}</div>
                    <div className="text-[11px] text-slate-500">{tool.maker}</div>
                </div>
                <div className="flex flex-col gap-1 items-end shrink-0">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${pricing.cls}`}>{pricing.label}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${meta.bg} ${meta.color} border ${meta.border}`}>{meta.label}</span>
                </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-3">{tool.desc}</p>

            <div className="flex flex-wrap gap-1 mb-3">
                {tool.useCases.map((uc, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">{uc}</span>
                ))}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
                <div className="text-center">
                    <div className="text-[10px] text-slate-500 mb-1">推薦程度</div>
                    <div className="text-base font-bold text-blue-900">{tool.recommend}<span className="text-[10px] text-slate-400 font-normal">/10</span></div>
                </div>
                <div className="text-center">
                    <div className="text-[10px] text-slate-500 mb-1">上手難易</div>
                    <div className="flex justify-center gap-0.5 mt-1.5">
                        {[1,2,3,4,5].map(i => (
                            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= tool.difficulty ? "bg-blue-900" : "bg-slate-200"}`} />
                        ))}
                    </div>
                </div>
                <div className="text-center">
                    <div className="text-[10px] text-slate-500 mb-1">評價</div>
                    <div className="flex justify-center gap-0 mt-0.5 text-xs">
                        {[1,2,3,4,5].map(i => (
                            <span key={i} className={i <= tool.stars ? "text-amber-400" : "text-slate-200"}>★</span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function getCategoryBarColor(cat: Category): string {
    const map: Record<Category, string> = {
        chat: "#1e3a8a", search: "#0891b2", image: "#be185d",
        code: "#d97706", agent: "#7c3aed", doc: "#059669",
    };
    return map[cat];
}
