"use client";

import { useState } from "react";

type SectionId = "data" | "hallucination" | "citation" | "disclosure" | "bias";

interface RuleCard {
    label: string;
    tone: "danger" | "warning" | "info" | "success" | "neutral";
    title: string;
    desc: string;
}

interface DisclosureRow {
    scenario: string;
    advice: string;
    level: "must" | "suggest" | "optional";
}

const toneClass: Record<RuleCard["tone"], { bg: string; border: string; label: string }> = {
    danger:  { bg: "bg-red-50",    border: "border-red-200",    label: "text-red-700" },
    warning: { bg: "bg-amber-50",  border: "border-amber-200",  label: "text-amber-700" },
    info:    { bg: "bg-blue-50",   border: "border-blue-200",   label: "text-blue-700" },
    success: { bg: "bg-emerald-50",border: "border-emerald-200",label: "text-emerald-700" },
    neutral: { bg: "bg-slate-50",  border: "border-slate-200",  label: "text-slate-700" },
};

const dataRules: RuleCard[] = [
    { label: "🚫 禁止輸入", tone: "danger", title: "個人資料", desc: "姓名、聯絡方式、可辨識身份的逐字稿內容，須先去識別化再輸入 AI 工具。" },
    { label: "🚫 禁止輸入", tone: "danger", title: "未發表研究數據", desc: "調查原始數據、未公開統計結果，在正式發表前不應輸入任何外部 AI 平台。" },
    { label: "🚫 禁止輸入", tone: "danger", title: "機密文件", desc: "計畫書、成果報告書、一校一本（校庫、學基庫）等機密性文件，一律不得輸入。" },
    { label: "⚠️ 輸入前確認", tone: "warning", title: "第三方授權資料", desc: "使用有著作權的資料庫、付費報告內容時，請先確認使用條款是否允許 AI 處理。" },
];

const citationRules: RuleCard[] = [
    { label: "📌 注意事項", tone: "info", title: "AI 產出不具引用效力", desc: "AI 生成的文字不能直接作為學術引用來源，須追溯至原始文獻後引用原始資料。" },
    { label: "📌 注意事項", tone: "info", title: "著作權歸屬尚不明確", desc: "AI 生成內容的著作權在各國法律尚未完全確立，對外發表時建議標注 AI 工具的使用情形。" },
    { label: "✅ 建議做法", tone: "success", title: "保留 AI 輔助紀錄", desc: "建議保存使用的 Prompt 與輸出內容，以便日後審查或說明研究過程。" },
    { label: "✅ 建議做法", tone: "success", title: "改寫而非直接使用", desc: "AI 產出應視為初稿或參考，以研究者自身語言重新整理後再使用。" },
];

const biasRules: RuleCard[] = [
    { label: "⚠️ 風險類型", tone: "warning", title: "訓練資料偏誤", desc: "AI 模型訓練資料以英文、西方觀點為主，處理本地政策或台灣特有議題時，分析可能有所偏差。" },
    { label: "⚠️ 風險類型", tone: "warning", title: "文獻摘要選擇偏誤", desc: "AI 摘要大量文獻時，可能放大某些觀點、忽略少數但重要的異議，建議人工抽查原文。" },
    { label: "⚠️ 風險類型", tone: "warning", title: "確認偏誤強化", desc: "Prompt 措辭本身會引導 AI 產出符合預設立場的結果，建議以不同角度提問相互驗證。" },
    { label: "✅ 因應做法", tone: "success", title: "多角度交叉驗證", desc: "同一個研究問題，嘗試從不同立場提問，比較 AI 回應是否一致，作為偏誤檢核。" },
];

const checklistItems = [
    "數據與統計數字須回溯至原始資料來源確認",
    "人名、機構名、法規名稱等專有名詞須逐一核實",
    "AI 提供的文獻引用須至原文確認是否真實存在",
    "時間敏感資訊（現行法規、最新政策）須確認 AI 知識截止日期",
    "若有疑慮，優先以官方資料、學術資料庫為準",
];

const disclosureRows: DisclosureRow[] = [
    { scenario: "對外正式研究報告", advice: "於方法論章節說明 AI 工具使用範圍與目的", level: "must" },
    { scenario: "政策建議簡報",     advice: "於文末或附錄注記「部分內容經 AI 輔助整理」", level: "must" },
    { scenario: "內部工作報告",     advice: "依各單位規範，建議主動告知主管", level: "suggest" },
    { scenario: "個人工作整理、草稿", advice: "無強制要求，但保留 AI 輔助紀錄為佳", level: "optional" },
    { scenario: "對外媒體發稿",     advice: "依各媒體 AI 使用政策，部分媒體有強制揭露要求", level: "must" },
];

const sections: { id: SectionId; num: string; title: string; desc: string }[] = [
    { id: "data",          num: "01", title: "資料輸入紅線",   desc: "哪些資料絕對不能輸入 AI 工具" },
    { id: "hallucination", num: "02", title: "幻覺與事實查核",  desc: "AI 輸出不等於事實，如何正確驗證" },
    { id: "citation",      num: "03", title: "引用與著作權",    desc: "AI 產出的引用效力與著作權問題" },
    { id: "disclosure",    num: "04", title: "AI 使用揭露標準", desc: "不同情境下是否需要揭露 AI 使用" },
    { id: "bias",          num: "05", title: "研究偏誤風險",    desc: "AI 可能帶入的偏誤與因應方式" },
];

export default function LearnEthics({ onBack }: { onBack: () => void }) {
    const [openIds, setOpenIds] = useState<Set<SectionId>>(new Set(["data", "hallucination"]));

    const toggle = (id: SectionId) => {
        setOpenIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const openSection = (id: SectionId) => {
        setOpenIds(prev => new Set(prev).add(id));
        setTimeout(() => {
            const el = document.getElementById(`sec-${id}`);
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
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
                    <div className="text-xs text-slate-500">AI 學習 / <span className="font-bold text-slate-700">AI 倫理</span></div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-6 py-10">
                {/* Hero */}
                <header className="mb-8">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-2xl" style={{background: "linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)"}}>
                            ⚖️
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI 倫理與負責任使用</h1>
                    </div>
                    <p className="text-slate-600 leading-relaxed">研究工作涉及資料隱私、事實準確性與學術誠信，使用 AI 工具前請確認你已了解以下原則</p>
                </header>

                {/* Intro banner */}
                <div className="bg-blue-900 rounded-2xl p-6 md:p-7 mb-8 text-white">
                    <h2 className="text-base font-bold mb-2 flex items-center gap-2">📋 為什麼研究人員需要特別注意 AI 倫理？</h2>
                    <p className="text-sm text-blue-100 leading-relaxed">研究工作的產出往往影響政策決策與公共利益，AI 工具雖能提升效率，但若使用不當，可能造成隱私洩漏、資訊失真或研究偏誤。了解以下規範，讓 AI 成為可靠的研究夥伴。</p>
                </div>

                {/* Quick nav */}
                <div className="flex gap-2 flex-wrap items-center mb-6">
                    <span className="text-xs text-slate-500 mr-1">快速跳轉：</span>
                    {sections.map(s => (
                        <button key={s.id} onClick={() => openSection(s.id)}
                            className="text-xs px-3 py-1.5 rounded-full border border-slate-300 bg-white text-slate-600 hover:border-blue-900 hover:text-blue-900 hover:bg-blue-50 transition-all"
                        >
                            {s.title}
                        </button>
                    ))}
                </div>

                {/* Sections */}
                <div className="space-y-4">
                    {sections.map(s => (
                        <SectionCard key={s.id} id={s.id} num={s.num} title={s.title} desc={s.desc} open={openIds.has(s.id)} onToggle={() => toggle(s.id)}>
                            {s.id === "data" && (
                                <div className="grid gap-3 md:grid-cols-2 mt-5">
                                    {dataRules.map((r, i) => <RuleCardEl key={i} card={r} />)}
                                </div>
                            )}
                            {s.id === "hallucination" && (
                                <div className="mt-5">
                                    <p className="text-sm text-slate-600 leading-relaxed mb-5">AI 語言模型有時會生成聽起來合理但實際上不正確的內容，稱為「幻覺（Hallucination）」。這在研究工作中風險尤高，因為錯誤資訊可能直接影響政策建議或研究結論。</p>
                                    <div className="bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500 rounded-lg p-5 mb-5">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[11px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded">GEM 平台提醒</span>
                                            <span className="text-sm font-bold text-amber-700">精準訪視協作搜尋平台 ／ PROMPT BOOK</span>
                                        </div>
                                        <p className="text-sm text-slate-700 leading-relaxed">使用本機構自建的<strong className="text-slate-900">精準訪視協作搜尋平台</strong>及 <strong className="text-slate-900">PROMPT BOOK</strong> 時，雖已透過 Prompt 設計降低幻覺發生機率，但由於內容仍由 AI 生成，<strong className="text-slate-900">所有輸出結果仍須由使用者自行檢核事實正確性</strong>，不得直接作為研究引用依據。</p>
                                    </div>
                                    <div className="space-y-2">
                                        {checklistItems.map((item, i) => (
                                            <div key={i} className="flex gap-3 items-start p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                                                <div className="w-5 h-5 rounded-full border-2 border-emerald-600 text-emerald-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">✓</div>
                                                <span className="text-sm text-slate-700 leading-relaxed">{item}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {s.id === "citation" && (
                                <div className="grid gap-3 md:grid-cols-2 mt-5">
                                    {citationRules.map((r, i) => <RuleCardEl key={i} card={r} />)}
                                </div>
                            )}
                            {s.id === "disclosure" && (
                                <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-500 text-xs">
                                                <th className="px-4 py-3 text-left font-bold tracking-wider">使用情境</th>
                                                <th className="px-4 py-3 text-left font-bold tracking-wider">揭露建議</th>
                                                <th className="px-4 py-3 text-left font-bold tracking-wider">層級</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {disclosureRows.map((row, i) => (
                                                <tr key={i} className="border-t border-slate-200 hover:bg-slate-50">
                                                    <td className="px-4 py-3 font-bold text-slate-900 align-top">{row.scenario}</td>
                                                    <td className="px-4 py-3 text-slate-600 align-top leading-relaxed">{row.advice}</td>
                                                    <td className="px-4 py-3 align-top"><DisclosureBadge level={row.level} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            {s.id === "bias" && (
                                <div className="grid gap-3 md:grid-cols-2 mt-5">
                                    {biasRules.map((r, i) => <RuleCardEl key={i} card={r} />)}
                                </div>
                            )}
                        </SectionCard>
                    ))}
                </div>

                {/* Summary */}
                <div className="mt-8 bg-blue-50 border border-blue-200 rounded-2xl p-6 flex gap-4 items-start">
                    <div className="text-2xl shrink-0">💡</div>
                    <p className="text-sm text-slate-700 leading-relaxed">
                        AI 是研究工作的輔助工具，<strong className="text-blue-900">不取代研究者的專業判斷</strong>。任何 AI 輸出在正式使用前，都需要經過<strong className="text-blue-900">事實查核、來源確認與人工審閱</strong>。使用 AI 提升效率的同時，研究者仍是最終成果的負責人。
                    </p>
                </div>
            </div>
        </div>
    );
}

function SectionCard({ id, num, title, desc, open, onToggle, children }: {
    id: SectionId; num: string; title: string; desc: string;
    open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
    return (
        <div id={`sec-${id}`} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <button onClick={onToggle}
                className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-slate-50 transition-all"
            >
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-900 text-xs font-bold flex items-center justify-center shrink-0">{num}</div>
                <div className="flex-1">
                    <div className="text-base font-bold text-slate-900">{title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                </div>
                <span className={`text-slate-400 text-base transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
            </button>
            {open && (
                <div className="px-6 pb-6 border-t border-slate-100">
                    {children}
                </div>
            )}
        </div>
    );
}

function RuleCardEl({ card }: { card: RuleCard }) {
    const cls = toneClass[card.tone];
    return (
        <div className={`rounded-xl p-4 border ${cls.bg} ${cls.border}`}>
            <div className={`text-[11px] font-bold tracking-wider mb-1.5 ${cls.label}`}>{card.label}</div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">{card.title}</h4>
            <p className="text-xs text-slate-600 leading-relaxed">{card.desc}</p>
        </div>
    );
}

function DisclosureBadge({ level }: { level: DisclosureRow["level"] }) {
    const map = {
        must:     { text: "建議揭露",   cls: "bg-red-100 text-red-800" },
        suggest:  { text: "視情況揭露", cls: "bg-amber-100 text-amber-800" },
        optional: { text: "自行判斷",   cls: "bg-slate-100 text-slate-600 border border-slate-300" },
    };
    const m = map[level];
    return <span className={`inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full ${m.cls}`}>{m.text}</span>;
}
