"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, query, orderBy, where, getDocs } from "firebase/firestore";
import ShowcaseFeed from "./ShowcaseFeed";

type Tab = "n8n" | "ai-tools" | "prompts" | "showcase" | "meeting";

export default function FullTimePage() {
    const { user, userData, loading, logout } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>("n8n");

    // Meeting generation state
    const [title, setTitle] = useState("");
    const [date, setDate] = useState("");
    const [fileContent, setFileContent] = useState("");
    const [fileName, setFileName] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [meetings, setMeetings] = useState<any[]>([]);
    const [isGenerating, setIsGenerating] = useState<string | null>(null);
    const [message, setMessage] = useState({ type: "", text: "" });
    const [summaries, setSummaries] = useState<Record<string, any>>({});
    const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
    const [loadingSummary, setLoadingSummary] = useState<string | null>(null);

    // Lightbox state
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const [lbScale, setLbScale] = useState(1);
    const [lbPos, setLbPos] = useState({ x: 0, y: 0 });
    const lbDrag = useRef({ active: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0 });

    useEffect(() => {
        const handler = (e: MessageEvent) => {
            if (e.origin !== window.location.origin) return;
            if (e.data?.type === "lightbox-open") {
                setLightboxSrc(e.data.src);
                setLbScale(1);
                setLbPos({ x: 0, y: 0 });
            }
        };
        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
    }, []);

    useEffect(() => {
        if (!loading && (!user || (userData?.role !== "admin" && userData?.role !== "full-time"))) {
            router.push("/");
        } else if (user) {
            fetchMeetings();
        }
    }, [user, userData, loading, router]);

    const fetchMeetings = async () => {
        try {
            const q = query(collection(db, "meetings"), where("createdBy", "==", user?.email), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            const m = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMeetings(m);

            // 同時查詢哪些會議已有 AI 紀錄
            const genSnapshot = await getDocs(collection(db, "meeting_generated"));
            const genMap: Record<string, any> = {};
            genSnapshot.docs.forEach(doc => {
                const d = doc.data();
                if (d.meetingId) genMap[d.meetingId] = d.data;
            });
            setSummaries(genMap);
        } catch (error) {
            console.error("Error fetching meetings:", error);
        }
    };

    const fetchSummary = async (meetingId: string) => {
        if (summaries[meetingId]) {
            // 已有快取，直接展開
            setExpandedMeeting(prev => prev === meetingId ? null : meetingId);
            return;
        }
        setLoadingSummary(meetingId);
        try {
            const q = query(collection(db, "meeting_generated"), where("meetingId", "==", meetingId));
            const snap = await getDocs(q);
            if (!snap.empty) {
                const data = snap.docs[0].data().data;
                setSummaries(prev => ({ ...prev, [meetingId]: data }));
                setExpandedMeeting(meetingId);
            }
        } catch (error) {
            console.error("Error fetching summary:", error);
        } finally {
            setLoadingSummary(null);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.type !== "text/plain" && !file.name.endsWith(".txt")) {
            setMessage({ type: "error", text: "請選擇 .txt 格式的檔案" });
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setMessage({ type: "error", text: "檔案過大，請上傳 5MB 以內的檔案" });
            return;
        }
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (event) => {
            setFileContent(event.target?.result as string);
        };
        reader.readAsText(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !date || !fileContent) {
            setMessage({ type: "error", text: "請填寫所有欄位並上傳檔案" });
            return;
        }
        setIsSubmitting(true);
        setMessage({ type: "", text: "" });
        try {
            const sourceDoc = await addDoc(collection(db, "meeting_sources"), {
                transcript_text: fileContent,
                createdAt: serverTimestamp(),
            });
            await addDoc(collection(db, "meetings"), {
                title,
                date,
                sourceId: sourceDoc.id,
                createdAt: serverTimestamp(),
                createdBy: user?.email,
            });
            setMessage({ type: "success", text: "會議資料已成功上傳！" });
            setTitle("");
            setDate("");
            setFileContent("");
            setFileName("");
            fetchMeetings();
        } catch (error) {
            console.error("Error saving meeting:", error);
            setMessage({ type: "error", text: "儲存失敗，請稍後再試" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const generateAIReport = async (meetingId: string, sourceId: string) => {
        setIsGenerating(meetingId);
        setMessage({ type: "", text: "" });
        try {
            // 取得使用者 ID Token 傳給 API，讓伺服器以使用者身份存取 Firestore
            const { getAuth } = await import("firebase/auth");
            const token = await getAuth().currentUser?.getIdToken();
            const response = await fetch("/api/generate-summary", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ meetingId, sourceId }),
            });
            const data = await response.json();
            if (data.success) {
                setMessage({ type: "success", text: "✨ AI 紀錄生成成功！" });
                setSummaries(prev => ({ ...prev, [meetingId]: data.data }));
                setExpandedMeeting(meetingId);
            } else {
                throw new Error(data.error || "生成失敗");
            }
        } catch (error: any) {
            console.error("Generation error:", error);
            setMessage({ type: "error", text: `生成失敗: ${error.message}` });
        } finally {
            setIsGenerating(null);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">驗證中...</div>;
    if (!user || (userData?.role !== "admin" && userData?.role !== "full-time")) return null;

    const tabs: { id: Tab; label: string; emoji: string }[] = [
        { id: "n8n", label: "n8n 教學", emoji: "🔧" },
        { id: "ai-tools", label: "AI 工具教學", emoji: "🤖" },
        { id: "prompts", label: "Prompt 資料庫", emoji: "💡" },
        { id: "showcase", label: "成果動態牆", emoji: "🌟" },
        { id: "meeting", label: "會議紀錄生成", emoji: "📝" },
    ];

    return (
        <>
        <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 font-sans">
            {/* Navbar */}
            <nav className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shadow-sm sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push("/admin")}
                        className="text-slate-400 hover:text-blue-900 font-bold text-lg transition-colors mr-1"
                        title="返回管理門戶"
                    >
                        ←
                    </button>
                    <div className="w-9 h-9 bg-blue-900 rounded-xl flex items-center justify-center text-white font-black text-lg">M</div>
                    <h1 className="text-lg font-black text-blue-900 tracking-tight">AI 工具與教學介面</h1>
                </div>
                <button
                    onClick={logout}
                    className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-red-500 transition-all"
                >
                    {user.displayName} 登出
                </button>
            </nav>

            {/* Tab bar */}
            <div className="bg-slate-100 border-b border-slate-200 px-6 py-4">
                <div className="max-w-6xl mx-auto grid grid-cols-5 gap-3">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex flex-col items-center gap-1.5 py-4 px-3 rounded-2xl font-bold text-sm transition-all duration-200 shadow-sm border-2 ${
                                activeTab === tab.id
                                    ? "bg-blue-900 text-white border-blue-900 shadow-lg scale-[1.03]"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-900 hover:shadow-md"
                            }`}
                        >
                            <span className="text-3xl">{tab.emoji}</span>
                            <span className="text-base">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 flex flex-col">
                {activeTab === "n8n" && (
                    <iframe
                        src="/n8n_guide_modified_5.html"
                        className="w-full border-0"
                        style={{ height: "calc(100vh - 161px)" }}
                        title="n8n 工作流教學"
                    />
                )}
                {activeTab === "ai-tools" && (
                    <iframe
                        src="/n8n_guide_modified_5.html?tab=ai"
                        className="w-full border-0"
                        style={{ height: "calc(100vh - 161px)" }}
                        title="AI 工具教學"
                    />
                )}
                {activeTab === "prompts" && (
                    <div className="max-w-6xl mx-auto w-full py-12 px-6">
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
                            <header className="bg-blue-900 px-8 py-6 text-white">
                                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                                    <span>💡</span> Prompt 資料庫
                                </h1>
                                <p className="text-blue-100 text-sm mt-1">收錄常用 Prompt 範本，點擊即可複製使用</p>
                            </header>

                            <div className="p-8 space-y-5">
                                {[
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
                                ].map((p, i) => (
                                    <div
                                        key={i}
                                        className="bg-slate-50 rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all p-5"
                                    >
                                        <div className="flex justify-between items-start gap-4 mb-2">
                                            <div>
                                                <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded mb-1">
                                                    {p.category}
                                                </span>
                                                <h3 className="text-base font-black text-slate-800">{p.title}</h3>
                                                <p className="text-xs text-slate-500 mt-0.5">{p.desc}</p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(p.content);
                                                    setMessage({ type: "success", text: `已複製：${p.title}` });
                                                    setTimeout(() => setMessage({ type: "", text: "" }), 2000);
                                                }}
                                                className="shrink-0 text-xs font-bold py-2 px-3 bg-white border border-blue-900 text-blue-900 rounded hover:bg-blue-900 hover:text-white transition-all flex items-center gap-1"
                                            >
                                                📋 複製
                                            </button>
                                        </div>
                                        <pre className="mt-3 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed">
{p.content}
                                        </pre>
                                    </div>
                                ))}

                                {message.text && (
                                    <div className={`fixed bottom-6 right-6 p-4 rounded-md text-sm font-medium shadow-lg ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                                        {message.text}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {activeTab === "showcase" && <ShowcaseFeed />}
                {activeTab === "meeting" && (
                    <div className="max-w-2xl mx-auto w-full py-12 px-6">
                        <div className="bg-white rounded-lg border border-slate-200 shadow-xl overflow-hidden">
                            <header className="bg-blue-900 px-8 py-6 text-white text-center">
                                <h1 className="text-2xl font-bold tracking-tight">會議紀錄生成</h1>
                                <p className="text-blue-100 text-sm mt-1">建立與管理會議記錄</p>
                            </header>

                            <form onSubmit={handleSubmit} className="p-8 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-600">會議標題</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="例如：2026年第一次學術研討會"
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900 focus:bg-white transition-all"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-600">會議日期</label>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900 focus:bg-white transition-all"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-600">逐字稿檔案 (.txt)</label>
                                    <div className="relative group">
                                        <input
                                            type="file"
                                            accept=".txt"
                                            onChange={handleFileChange}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        <div className="w-full px-4 py-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg group-hover:border-blue-900 transition-all flex flex-col items-center justify-center gap-2">
                                            <svg className="w-8 h-8 text-slate-400 group-hover:text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                            </svg>
                                            <span className="text-sm text-slate-500 font-medium">
                                                {fileName || "點擊或拖曳檔案至此處上傳"}
                                            </span>
                                        </div>
                                    </div>
                                    {fileName && (
                                        <p className="text-xs text-slate-400 mt-1 italic">
                                            * 系統將自動讀取內容並轉存為文字
                                        </p>
                                    )}
                                </div>

                                {message.text && (
                                    <div className={`p-4 rounded-md text-sm font-medium ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                                        {message.text}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full py-3 bg-blue-900 text-white rounded-md font-bold hover:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-md active:transform active:scale-[0.99]"
                                >
                                    {isSubmitting ? "正在儲存中..." : "確認建立會議記錄"}
                                </button>
                            </form>

                            <div className="border-t border-slate-200 bg-slate-50/50 p-8">
                                <h2 className="text-lg font-bold text-slate-800 mb-4">現有會議清單</h2>
                                <div className="space-y-4">
                                    {meetings.length === 0 ? (
                                        <p className="text-sm text-slate-400 italic">尚未建立任何會議。</p>
                                    ) : (
                                        meetings.map((m) => (
                                            <div key={m.id} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                                {/* 會議列 */}
                                                <div className="p-4 flex justify-between items-center">
                                                    <div>
                                                        <h3 className="font-bold text-slate-800">{m.title}</h3>
                                                        <p className="text-xs text-slate-500">{m.date}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {/* 查看 AI 紀錄按鈕（有紀錄才顯示） */}
                                                        {summaries[m.id] && (
                                                            <button
                                                                onClick={() => fetchSummary(m.id)}
                                                                disabled={loadingSummary === m.id}
                                                                className="text-xs font-bold py-2 px-3 bg-green-50 border border-green-600 text-green-700 rounded hover:bg-green-600 hover:text-white transition-all flex items-center gap-1"
                                                            >
                                                                <span>{expandedMeeting === m.id ? "▲" : "▼"}</span>
                                                                查看 AI 紀錄
                                                            </button>
                                                        )}
                                                        {/* 生成 AI 紀錄按鈕 */}
                                                        <button
                                                            onClick={() => generateAIReport(m.id, m.sourceId)}
                                                            disabled={isGenerating === m.id}
                                                            className="text-xs font-bold py-2 px-3 bg-white border border-blue-900 text-blue-900 rounded hover:bg-blue-900 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                        >
                                                            {isGenerating === m.id ? (
                                                                <>
                                                                    <span className="animate-spin text-sm">↻</span>
                                                                    生成中...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <span>✨</span>
                                                                    {summaries[m.id] ? "重新生成" : "生成 AI 紀錄"}
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* 展開的 AI 紀錄內容 */}
                                                {expandedMeeting === m.id && summaries[m.id] && (
                                                    <div className="border-t border-slate-100 bg-slate-50 p-5 space-y-5 text-sm">
                                                        {/* 標題 */}
                                                        <h4 className="font-black text-blue-900 text-base border-l-4 border-blue-900 pl-3">{summaries[m.id].title}</h4>

                                                        {/* 一、核心討論議題 */}
                                                        {summaries[m.id].issues?.length > 0 && (
                                                            <div>
                                                                <p className="font-bold text-slate-700 mb-3">📋 一、核心討論議題</p>
                                                                <div className="space-y-4">
                                                                    {summaries[m.id].issues.map((issue: any, i: number) => (
                                                                        <div key={i} className="bg-white rounded-lg border border-slate-200 p-4 space-y-2">
                                                                            <p className="font-bold text-slate-800">議題 {i + 1}：{issue.title}</p>
                                                                            {issue.background && (
                                                                                <div>
                                                                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">背景說明</span>
                                                                                    <p className="text-slate-600 mt-0.5">{issue.background}</p>
                                                                                </div>
                                                                            )}
                                                                            {issue.discussion_points?.length > 0 && (
                                                                                <div>
                                                                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">研議要點</span>
                                                                                    <ul className="mt-0.5 space-y-1">
                                                                                        {issue.discussion_points.map((pt: string, j: number) => (
                                                                                            <li key={j} className="flex gap-2 text-slate-600">
                                                                                                <span className="text-blue-400 font-bold shrink-0">▸</span>
                                                                                                <span>{pt}</span>
                                                                                            </li>
                                                                                        ))}
                                                                                    </ul>
                                                                                </div>
                                                                            )}
                                                                            {issue.conclusion && (
                                                                                <div className="bg-blue-50 border border-blue-100 rounded px-3 py-2">
                                                                                    <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">共識決議</span>
                                                                                    <p className="text-blue-900 mt-0.5">{issue.conclusion}</p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* 二、待辦事項與行動計畫 */}
                                                        {summaries[m.id].action_items?.length > 0 && (
                                                            <div>
                                                                <p className="font-bold text-slate-700 mb-3">✅ 二、待辦事項與行動計畫</p>
                                                                <div className="overflow-x-auto">
                                                                    <table className="w-full text-xs border-collapse">
                                                                        <thead>
                                                                            <tr className="bg-slate-100 text-slate-600">
                                                                                <th className="text-left px-3 py-2 border border-slate-200 w-8">#</th>
                                                                                <th className="text-left px-3 py-2 border border-slate-200">任務描述</th>
                                                                                <th className="text-left px-3 py-2 border border-slate-200 whitespace-nowrap">負責單位</th>
                                                                                <th className="text-left px-3 py-2 border border-slate-200 whitespace-nowrap">預計時限</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {summaries[m.id].action_items.map((item: any, i: number) => (
                                                                                <tr key={i} className="bg-white hover:bg-slate-50">
                                                                                    <td className="px-3 py-2 border border-slate-200 text-slate-500">{item.id ?? i + 1}</td>
                                                                                    <td className="px-3 py-2 border border-slate-200 text-slate-700">{item.task}</td>
                                                                                    <td className="px-3 py-2 border border-slate-200 text-slate-600">{item.owner}</td>
                                                                                    <td className="px-3 py-2 border border-slate-200 text-slate-600">{item.deadline}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* 三、補充說明 */}
                                                        {summaries[m.id].notes && (
                                                            <div>
                                                                <p className="font-bold text-slate-700 mb-1">📎 三、補充說明</p>
                                                                <p className="text-slate-600 bg-white border border-slate-200 rounded px-3 py-2">{summaries[m.id].notes}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>

            {/* Lightbox */}
            {lightboxSrc && (
                <div
                    className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center select-none"
                    onClick={() => setLightboxSrc(null)}
                    onMouseMove={(e) => {
                        if (!lbDrag.current.active) return;
                        setLbPos({
                            x: lbDrag.current.startPosX + (e.clientX - lbDrag.current.startX),
                            y: lbDrag.current.startPosY + (e.clientY - lbDrag.current.startY),
                        });
                    }}
                    onMouseUp={() => { lbDrag.current.active = false; }}
                    onWheel={(e) => {
                        e.preventDefault();
                        setLbScale(s => Math.min(Math.max(s * (e.deltaY < 0 ? 1.12 : 0.89), 0.5), 8));
                    }}
                >
                    <button
                        onClick={() => setLightboxSrc(null)}
                        className="fixed top-4 right-6 bg-white/20 hover:bg-white/40 text-white border-0 rounded-full w-11 h-11 text-2xl cursor-pointer z-[10000] flex items-center justify-center"
                    >✕</button>
                    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-[10000]">
                        <button onClick={(e) => { e.stopPropagation(); setLbScale(s => Math.min(s * 1.3, 8)); }} className="bg-white/20 hover:bg-white/40 text-white border-0 rounded-full w-10 h-10 text-xl cursor-pointer">+</button>
                        <button onClick={(e) => { e.stopPropagation(); setLbScale(s => Math.max(s / 1.3, 0.5)); }} className="bg-white/20 hover:bg-white/40 text-white border-0 rounded-full w-10 h-10 text-xl cursor-pointer">−</button>
                        <button onClick={(e) => { e.stopPropagation(); setLbScale(1); setLbPos({ x: 0, y: 0 }); }} className="bg-white/20 hover:bg-white/40 text-white border-0 rounded-2xl px-4 h-10 text-xs font-bold cursor-pointer">重置</button>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={lightboxSrc}
                        alt="放大檢視"
                        draggable={false}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            lbDrag.current = { active: true, startX: e.clientX, startY: e.clientY, startPosX: lbPos.x, startPosY: lbPos.y };
                        }}
                        style={{
                            maxWidth: "90vw",
                            maxHeight: "85vh",
                            objectFit: "contain",
                            borderRadius: 8,
                            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
                            cursor: lbDrag.current.active ? "grabbing" : "grab",
                            transform: `translate(${lbPos.x}px, ${lbPos.y}px) scale(${lbScale})`,
                            transition: "none",
                        }}
                    />
                </div>
            )}
        </>
    );
}
