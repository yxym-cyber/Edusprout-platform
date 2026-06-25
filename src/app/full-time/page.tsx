"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp, query, orderBy, where, getDocs } from "firebase/firestore";
import { generateMeetingSummary, LM_STUDIO_MODEL } from "@/lib/lmStudio";
import ShowcaseFeed from "./ShowcaseFeed";
import LearnHub, { LearnTopic } from "./LearnHub";
import LearnTools from "./LearnTools";
import LearnEthics from "./LearnEthics";
import LearnPrompts from "./LearnPrompts";

type Tab = "learn" | "showcase" | "meeting";

export default function FullTimePage() {
    const { user, userData, loading, logout } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>("learn");
    const [learnTopic, setLearnTopic] = useState<LearnTopic | null>(null);

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
            // 過濾掉軟刪除的紀錄（有 deletedAt 欄位的）
            const m = querySnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter((m: any) => !m.deletedAt);
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

    const softDeleteMeeting = async (meetingId: string) => {
        if (!confirm("確定要刪除這筆會議紀錄嗎？\n（記錄將從您的列表移除，但系統仍會保留備份）")) return;
        try {
            await updateDoc(doc(db, "meetings", meetingId), {
                deletedAt: serverTimestamp(),
                deletedBy: user?.email,
            });
            setMeetings(prev => prev.filter(m => m.id !== meetingId));
            setMessage({ type: "success", text: "已刪除，系統仍保有備份紀錄。" });
        } catch (err) {
            console.error(err);
            setMessage({ type: "error", text: "刪除失敗，請稍後再試。" });
        }
    };

    const generateAIReport = async (meetingId: string, sourceId: string) => {
        setIsGenerating(meetingId);
        setMessage({ type: "", text: "" });
        try {
            // 1. 從 Firestore 直接讀逐字稿（瀏覽器端，使用 firebase client SDK）
            setMessage({ type: "info", text: "📄 讀取逐字稿..." });
            const sourceSnap = await getDoc(doc(db, "meeting_sources", sourceId));
            if (!sourceSnap.exists()) {
                throw new Error("找不到逐字稿");
            }
            const transcriptText: string | undefined = sourceSnap.data()?.transcript_text;
            if (!transcriptText) {
                throw new Error("逐字稿內容為空");
            }

            // 2. 直接從瀏覽器呼叫桌機 LM Studio（透過 ngrok）
            setMessage({ type: "info", text: "🤖 呼叫本地模型生成中（可能需 1-3 分鐘）..." });
            const parsedData = await generateMeetingSummary(transcriptText);

            // 3. 寫回 Firestore
            setMessage({ type: "info", text: "💾 儲存結果..." });
            await addDoc(collection(db, "meeting_generated"), {
                meetingId,
                sourceId,
                data: parsedData,
                version: 1,
                model: LM_STUDIO_MODEL,
                createdAt: serverTimestamp(),
            });

            setMessage({ type: "success", text: "✨ AI 紀錄生成成功！" });
            setSummaries(prev => ({ ...prev, [meetingId]: parsedData }));
            setExpandedMeeting(meetingId);
        } catch (error: any) {
            console.error("Generation error:", error);
            setMessage({ type: "error", text: `生成失敗: ${error.message || "未知錯誤"}` });
        } finally {
            setIsGenerating(null);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">驗證中...</div>;
    if (!user || (userData?.role !== "admin" && userData?.role !== "full-time")) return null;

    const tabs: { id: Tab; label: string; emoji: string }[] = [
        { id: "learn", label: "AI 學習", emoji: "📚" },
        { id: "showcase", label: "成果動態牆", emoji: "🌟" },
        { id: "meeting", label: "會議紀錄生成", emoji: "📝" },
    ];

    // 每個 tab 對應的主色（accent 色），用來決定 active tab 漸層、indicator 等
    const tabAccents: Record<Tab, { gradient: string; ring: string; glow: string }> = {
        learn:    { gradient: "linear-gradient(135deg, #2563eb 0%, #6366f1 50%, #8b5cf6 100%)", ring: "rgba(99,102,241,0.55)", glow: "rgba(99,102,241,0.35)" },
        showcase: { gradient: "linear-gradient(135deg, #ec4899 0%, #d946ef 50%, #a855f7 100%)", ring: "rgba(217,70,239,0.55)", glow: "rgba(217,70,239,0.35)" },
        meeting:  { gradient: "linear-gradient(135deg, #0891b2 0%, #0284c7 50%, #1e40af 100%)", ring: "rgba(8,145,178,0.55)", glow: "rgba(8,145,178,0.35)" },
    };

    return (
        <>
        <div className="min-h-screen flex flex-col text-slate-900 font-sans" style={{
            background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
        }}>
            {/* Navbar */}
            <nav className="sticky top-0 z-20 px-6 md:px-8 py-3.5 flex justify-between items-center"
                 style={{
                     background: "rgba(255,255,255,0.78)",
                     backdropFilter: "blur(20px) saturate(180%)",
                     WebkitBackdropFilter: "blur(20px) saturate(180%)",
                     borderBottom: "1px solid rgba(226,232,240,0.85)",
                     boxShadow: "0 1px 0 rgba(255,255,255,0.9) inset, 0 4px 18px -8px rgba(15,23,42,0.08)",
                 }}>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push("/admin")}
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all"
                        style={{ background: "rgba(241,245,249,0.6)", border: "1px solid rgba(226,232,240,0.85)" }}
                        title="返回管理門戶"
                    >
                        <span className="text-base font-bold">←</span>
                    </button>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg shrink-0"
                         style={{
                             background: "linear-gradient(135deg, #1e3a8a 0%, #6366f1 60%, #ec4899 100%)",
                             boxShadow: "0 10px 24px -8px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
                         }}>
                        M
                    </div>
                    <div className="leading-tight">
                        <h1 className="text-sm md:text-base font-black text-slate-900 tracking-tight">高教深耕管理平台</h1>
                        <p className="hidden md:block text-[11px] text-slate-500 font-medium">AI 工具 · 學習 · 成果分享 · 會議自動化</p>
                    </div>
                </div>
                <button
                    onClick={logout}
                    className="px-4 py-2 text-xs md:text-sm font-bold rounded-xl text-slate-600 hover:text-rose-500 transition-all flex items-center gap-2"
                    style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(226,232,240,0.85)" }}
                >
                    <span className="hidden md:inline">{user.displayName}</span>
                    <span>登出 →</span>
                </button>
            </nav>

            {/* Tab bar：玻璃膠囊式切換器 */}
            <div className="relative px-6 py-5" style={{
                background: `
                    radial-gradient(ellipse 60% 80% at 18% 0%, rgba(165,180,252,0.35), transparent 65%),
                    radial-gradient(ellipse 50% 80% at 50% 0%, rgba(244,114,182,0.28), transparent 65%),
                    radial-gradient(ellipse 60% 80% at 85% 0%, rgba(125,211,252,0.30), transparent 65%),
                    linear-gradient(180deg, rgba(248,250,252,0.6) 0%, rgba(248,250,252,0) 100%)
                `,
            }}>
                <div className="max-w-4xl mx-auto rounded-3xl p-2 flex gap-2"
                     style={{
                         background: "rgba(255,255,255,0.72)",
                         backdropFilter: "blur(20px) saturate(180%)",
                         WebkitBackdropFilter: "blur(20px) saturate(180%)",
                         border: "1px solid rgba(255,255,255,0.95)",
                         boxShadow: "0 12px 36px -12px rgba(30,41,59,0.18), inset 0 1px 0 rgba(255,255,255,0.95)",
                     }}>
                    {tabs.map((tab) => {
                        const active = activeTab === tab.id;
                        const accent = tabAccents[tab.id];
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className="flex-1 relative rounded-2xl px-3 py-3 md:py-3.5 font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2.5 group"
                                style={{
                                    background: active ? accent.gradient : "transparent",
                                    color: active ? "#ffffff" : "#475569",
                                    boxShadow: active
                                        ? `0 12px 26px -8px ${accent.glow}, inset 0 1px 0 rgba(255,255,255,0.3)`
                                        : "none",
                                    border: active ? "1px solid rgba(255,255,255,0.35)" : "1px solid transparent",
                                }}
                            >
                                <span className={`text-xl md:text-2xl transition-transform duration-300 ${active ? "scale-110" : "group-hover:scale-105"}`}>{tab.emoji}</span>
                                <span className="hidden sm:inline">{tab.label}</span>
                                <span className="sm:hidden text-xs">{tab.label.slice(0, 2)}</span>
                                {active && (
                                    <span className="absolute inset-x-6 -bottom-px h-px rounded-full" style={{
                                        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)",
                                    }} />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 flex flex-col">
                {activeTab === "learn" && (
                    <div className="flex-1 flex flex-col" style={{ minHeight: "calc(100vh - 161px)" }}>
                        {learnTopic === null   && <LearnHub onSelect={setLearnTopic} />}
                        {learnTopic === "tools"   && <LearnTools onBack={() => setLearnTopic(null)} />}
                        {learnTopic === "ethics"  && <LearnEthics onBack={() => setLearnTopic(null)} />}
                        {learnTopic === "prompts" && <LearnPrompts onBack={() => setLearnTopic(null)} />}
                        {learnTopic === "n8n" && (
                            <div className="flex-1 flex flex-col bg-white">
                                <div className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-slate-200 px-6 py-3">
                                    <div className="max-w-6xl mx-auto flex items-center justify-between">
                                        <button
                                            onClick={() => setLearnTopic(null)}
                                            className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-900 transition-all"
                                        >
                                            <span className="text-lg">←</span>
                                            <span>返回 AI 學習 Hub</span>
                                        </button>
                                        <div className="text-xs text-slate-500">AI 學習 / <span className="font-bold text-slate-700">n8n 工作流自動化</span></div>
                                    </div>
                                </div>
                                <iframe
                                    src="/n8n_guide_modified_5.html"
                                    className="w-full border-0 flex-1"
                                    style={{ minHeight: "calc(100vh - 220px)" }}
                                    title="n8n 工作流教學"
                                />
                            </div>
                        )}
                    </div>
                )}
                {activeTab === "showcase" && <ShowcaseFeed />}
                {activeTab === "meeting" && (
                    <div className="relative overflow-hidden min-h-full" style={{
                        background: `
                            radial-gradient(ellipse 70% 55% at 12% 18%, rgba(165,243,252,0.55), transparent 60%),
                            radial-gradient(ellipse 55% 45% at 88% 22%, rgba(186,230,253,0.55), transparent 60%),
                            radial-gradient(ellipse 65% 50% at 50% 100%, rgba(191,219,254,0.50), transparent 60%),
                            radial-gradient(ellipse 50% 40% at 82% 78%, rgba(125,211,252,0.40), transparent 60%),
                            linear-gradient(135deg, #ecfeff 0%, #eff6ff 50%, #f0f9ff 100%)
                        `,
                    }}>
                        {/* 浮動裝飾 */}
                        <MeetingDecor />

                        <div className="max-w-3xl mx-auto w-full py-12 md:py-16 px-4 md:px-6 relative z-10">
                            {/* Hero 區 */}
                            <header className="text-center mb-10">
                                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6"
                                     style={{background: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.95)", boxShadow: "0 2px 8px rgba(8,47,73,0.06)"}}>
                                    <span className="w-2 h-2 bg-cyan-500 rounded-full" style={{animation: "meetingPulse 2.4s ease-in-out infinite"}} />
                                    <span className="text-xs font-bold text-slate-700">LM Studio · Gemma 27B 本機推論</span>
                                </div>
                                <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-4 text-slate-900 leading-tight">
                                    <span style={{
                                        background: "linear-gradient(135deg, #0e7490 0%, #0284c7 45%, #1e40af 100%)",
                                        WebkitBackgroundClip: "text",
                                        backgroundClip: "text",
                                        color: "transparent",
                                    }}>會議紀錄</span>
                                    <span className="text-slate-900">自動生成</span>
                                </h1>
                                <p className="text-sm md:text-base text-slate-600 max-w-xl mx-auto leading-relaxed">
                                    上傳逐字稿，AI 自動整理出議題、決議與待辦事項<br className="hidden md:block"/>
                                    產出結構化、可直接歸檔的會議紀錄
                                </p>
                            </header>

                            {/* 步驟膠囊 */}
                            <div className="flex justify-center mb-8">
                                <div className="inline-flex flex-wrap items-center gap-2 rounded-2xl px-5 py-3"
                                     style={{background: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.95)", backdropFilter: "blur(12px)", boxShadow: "0 4px 12px rgba(8,47,73,0.08)"}}>
                                    <span className="text-xs font-bold text-cyan-700 mr-2">🔄 三步驟</span>
                                    {[
                                        { i: "1", t: "上傳 .txt" },
                                        { i: "2", t: "AI 整理" },
                                        { i: "3", t: "歸檔分享" },
                                    ].map((s, i, arr) => (
                                        <span key={s.i} className="flex items-center gap-2">
                                            <span className="inline-flex items-center gap-1.5">
                                                <span className="w-5 h-5 rounded-full text-[10px] font-black text-white flex items-center justify-center"
                                                      style={{background: "linear-gradient(135deg, #06b6d4, #0284c7)"}}>{s.i}</span>
                                                <span className="text-sm text-slate-900 font-bold">{s.t}</span>
                                            </span>
                                            {i < arr.length - 1 && <span className="text-cyan-400">→</span>}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* 上傳卡 + 列表卡 整合於玻璃容器 */}
                            <div className="rounded-3xl overflow-hidden"
                                 style={{
                                     background: "rgba(255,255,255,0.72)",
                                     backdropFilter: "blur(20px) saturate(180%)",
                                     WebkitBackdropFilter: "blur(20px) saturate(180%)",
                                     border: "1px solid rgba(255,255,255,0.95)",
                                     boxShadow: "0 24px 48px -16px rgba(8,47,73,0.14), inset 0 1px 0 rgba(255,255,255,0.95)",
                                 }}>
                                {/* === 上傳表單 === */}
                                <div className="p-7 md:p-9 border-b border-cyan-100/60">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg shrink-0"
                                             style={{
                                                 background: "linear-gradient(135deg, #06b6d4 0%, #0369a1 100%)",
                                                 boxShadow: "0 10px 22px -8px rgba(2,132,199,0.55), inset 0 1px 0 rgba(255,255,255,0.3)",
                                             }}>📥</div>
                                        <div>
                                            <h2 className="text-base md:text-lg font-black text-slate-900">建立新會議</h2>
                                            <p className="text-[12px] text-slate-500">填寫資訊 + 上傳逐字稿</p>
                                        </div>
                                    </div>

                                    <form onSubmit={handleSubmit} className="space-y-5">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">會議標題</label>
                                                <input
                                                    type="text"
                                                    value={title}
                                                    onChange={(e) => setTitle(e.target.value)}
                                                    placeholder="例如：2026年第一次學術研討會"
                                                    className="w-full px-4 py-2.5 bg-white/80 border border-cyan-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:bg-white transition-all text-sm"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">會議日期</label>
                                                <input
                                                    type="date"
                                                    value={date}
                                                    onChange={(e) => setDate(e.target.value)}
                                                    className="w-full px-4 py-2.5 bg-white/80 border border-cyan-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:bg-white transition-all text-sm"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">逐字稿檔案 (.txt)</label>
                                            <div className="relative group">
                                                <input
                                                    type="file"
                                                    accept=".txt"
                                                    onChange={handleFileChange}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                />
                                                <div className={`w-full px-4 py-8 rounded-xl flex flex-col items-center justify-center gap-2 transition-all border-2 border-dashed ${fileName ? "border-cyan-400 bg-cyan-50/70" : "border-cyan-200/80 bg-white/50 group-hover:border-cyan-400 group-hover:bg-cyan-50/40"}`}>
                                                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl"
                                                         style={{
                                                             background: fileName
                                                                 ? "linear-gradient(135deg, #06b6d4, #0284c7)"
                                                                 : "linear-gradient(135deg, #67e8f9, #38bdf8)",
                                                             boxShadow: "0 10px 22px -8px rgba(8,145,178,0.5)",
                                                         }}>
                                                        {fileName ? "✓" : "📄"}
                                                    </div>
                                                    <span className={`text-sm font-bold ${fileName ? "text-cyan-700" : "text-slate-600"}`}>
                                                        {fileName || "點擊或拖曳 .txt 至此"}
                                                    </span>
                                                    <span className="text-[11px] text-slate-500">最大 5 MB</span>
                                                </div>
                                            </div>
                                        </div>

                                        {message.text && (
                                            <div className={`p-3.5 rounded-xl text-sm font-medium border ${
                                                message.type === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                : message.type === "error" ? "bg-rose-50 text-rose-700 border-rose-200"
                                                : "bg-sky-50 text-sky-700 border-sky-200"
                                            }`}>
                                                {message.text}
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="w-full py-3.5 text-white rounded-xl font-black text-sm tracking-wide transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            style={{
                                                background: isSubmitting
                                                    ? "linear-gradient(135deg, #94a3b8 0%, #64748b 100%)"
                                                    : "linear-gradient(135deg, #06b6d4 0%, #0284c7 50%, #1e40af 100%)",
                                                boxShadow: isSubmitting ? "none" : "0 12px 26px -8px rgba(8,145,178,0.55), inset 0 1px 0 rgba(255,255,255,0.25)",
                                            }}
                                        >
                                            {isSubmitting ? (
                                                <><span className="animate-spin">↻</span> 正在儲存中...</>
                                            ) : (
                                                <>📌 建立會議紀錄</>
                                            )}
                                        </button>
                                    </form>
                                </div>

                                {/* === 會議列表 === */}
                                <div className="p-7 md:p-9">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg shrink-0"
                                             style={{
                                                 background: "linear-gradient(135deg, #0ea5e9 0%, #1e40af 100%)",
                                                 boxShadow: "0 10px 22px -8px rgba(30,64,175,0.55), inset 0 1px 0 rgba(255,255,255,0.3)",
                                             }}>📚</div>
                                        <div className="flex-1">
                                            <h2 className="text-base md:text-lg font-black text-slate-900">會議檔案庫</h2>
                                            <p className="text-[12px] text-slate-500">{meetings.length} 場會議 · 點擊「生成 AI 紀錄」即可</p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {meetings.length === 0 ? (
                                            <div className="text-center py-12 rounded-2xl border-2 border-dashed border-cyan-200/70 bg-white/40">
                                                <p className="text-4xl mb-3">📭</p>
                                                <p className="text-sm font-bold text-slate-700">尚未建立任何會議</p>
                                                <p className="text-xs text-slate-500 mt-1">先在上方建立第一場會議</p>
                                            </div>
                                        ) : (
                                            meetings.map((m) => {
                                                const hasSummary = !!summaries[m.id];
                                                const isExpanded = expandedMeeting === m.id;
                                                return (
                                                    <div key={m.id}
                                                         className="rounded-2xl overflow-hidden transition-all"
                                                         style={{
                                                             background: hasSummary
                                                                 ? "linear-gradient(135deg, rgba(236,254,255,0.9), rgba(239,246,255,0.9))"
                                                                 : "rgba(255,255,255,0.88)",
                                                             border: hasSummary ? "1px solid rgba(34,211,238,0.35)" : "1px solid rgba(186,230,253,0.5)",
                                                             boxShadow: isExpanded
                                                                 ? "0 12px 30px -10px rgba(8,145,178,0.25), inset 0 1px 0 rgba(255,255,255,0.95)"
                                                                 : "0 4px 12px -6px rgba(8,47,73,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
                                                         }}>
                                                        {/* 會議列 */}
                                                        <div className="p-4 flex justify-between items-center gap-3 flex-wrap">
                                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                                                                     style={{
                                                                         background: hasSummary
                                                                             ? "linear-gradient(135deg, #06b6d4, #0284c7)"
                                                                             : "linear-gradient(135deg, #e0f2fe, #bae6fd)",
                                                                         color: hasSummary ? "#fff" : "#0c4a6e",
                                                                         boxShadow: hasSummary ? "0 8px 18px -6px rgba(8,145,178,0.45)" : "none",
                                                                     }}>
                                                                    {hasSummary ? "✓" : "🗂"}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <h3 className="font-black text-slate-900 text-sm md:text-base truncate">{m.title}</h3>
                                                                    <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                                                                        <span>📅 {m.date}</span>
                                                                        {hasSummary && (
                                                                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">已生成</span>
                                                                        )}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                {/* 刪除按鈕（軟刪除，Firebase 保留備份） */}
                                                                <button
                                                                    onClick={() => softDeleteMeeting(m.id)}
                                                                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm transition-all"
                                                                    style={{
                                                                        background: "rgba(255,255,255,0.85)",
                                                                        border: "1px solid rgba(252,165,165,0.5)",
                                                                        color: "#ef4444",
                                                                    }}
                                                                    title="刪除（系統仍保有備份）"
                                                                >
                                                                    🗑
                                                                </button>
                                                                {hasSummary && (
                                                                    <button
                                                                        onClick={() => fetchSummary(m.id)}
                                                                        disabled={loadingSummary === m.id}
                                                                        className="text-xs font-bold py-2 px-3 rounded-xl transition-all flex items-center gap-1"
                                                                        style={{
                                                                            background: isExpanded
                                                                                ? "linear-gradient(135deg, #10b981, #0d9488)"
                                                                                : "rgba(236,253,245,0.9)",
                                                                            color: isExpanded ? "#fff" : "#047857",
                                                                            border: isExpanded ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(167,243,208,0.85)",
                                                                            boxShadow: isExpanded ? "0 8px 18px -6px rgba(13,148,136,0.4)" : "none",
                                                                        }}
                                                                    >
                                                                        <span>{isExpanded ? "▲" : "▼"}</span>
                                                                        {isExpanded ? "收起" : "查看紀錄"}
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => generateAIReport(m.id, m.sourceId)}
                                                                    disabled={isGenerating === m.id}
                                                                    className="text-xs font-bold py-2 px-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                                                                    style={{
                                                                        background: hasSummary
                                                                            ? "rgba(255,255,255,0.9)"
                                                                            : "linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)",
                                                                        color: hasSummary ? "#0e7490" : "#fff",
                                                                        border: hasSummary ? "1px solid rgba(34,211,238,0.45)" : "1px solid rgba(255,255,255,0.3)",
                                                                        boxShadow: hasSummary ? "none" : "0 8px 18px -6px rgba(8,145,178,0.45)",
                                                                    }}
                                                                >
                                                                    {isGenerating === m.id ? (
                                                                        <><span className="animate-spin">↻</span>生成中...</>
                                                                    ) : (
                                                                        <><span>{hasSummary ? "🔄" : "✨"}</span>{hasSummary ? "重新生成" : "生成 AI 紀錄"}</>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* 展開的 AI 紀錄內容 */}
                                                        {isExpanded && summaries[m.id] && (
                                                            <div className="border-t border-cyan-100/60 px-5 py-5 space-y-6 text-sm"
                                                                 style={{background: "linear-gradient(135deg, rgba(255,255,255,0.85), rgba(240,249,255,0.65))"}}>
                                                                {/* 紀錄主標題 */}
                                                                <div className="flex items-center gap-3 pb-3 border-b border-cyan-100/60">
                                                                    <div className="w-1 h-8 rounded-full" style={{background: "linear-gradient(180deg, #06b6d4, #1e40af)"}} />
                                                                    <h4 className="font-black text-slate-900 text-base md:text-lg">{summaries[m.id].title}</h4>
                                                                </div>

                                                                {/* 一、核心討論議題 */}
                                                                {summaries[m.id].issues?.length > 0 && (
                                                                    <div>
                                                                        <SectionHeader emoji="📋" label="一、核心討論議題" tone="cyan" />
                                                                        <div className="space-y-3 mt-3">
                                                                            {summaries[m.id].issues.map((issue: any, i: number) => (
                                                                                <div key={i} className="rounded-2xl p-4 space-y-3"
                                                                                     style={{
                                                                                         background: "rgba(255,255,255,0.85)",
                                                                                         border: "1px solid rgba(186,230,253,0.7)",
                                                                                         boxShadow: "0 4px 12px -6px rgba(8,47,73,0.08)",
                                                                                     }}>
                                                                                    <p className="font-black text-slate-900 flex items-center gap-2">
                                                                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs text-white"
                                                                                              style={{background: "linear-gradient(135deg, #06b6d4, #0284c7)"}}>{i + 1}</span>
                                                                                        {issue.title}
                                                                                    </p>
                                                                                    {issue.background && (
                                                                                        <div>
                                                                                            <p className="text-[10px] font-black text-cyan-700 uppercase tracking-widest mb-1">背景說明</p>
                                                                                            <p className="text-slate-700 leading-relaxed">{issue.background}</p>
                                                                                        </div>
                                                                                    )}
                                                                                    {issue.discussion_points?.length > 0 && (
                                                                                        <div>
                                                                                            <p className="text-[10px] font-black text-cyan-700 uppercase tracking-widest mb-1">研議要點</p>
                                                                                            <ul className="space-y-1.5">
                                                                                                {issue.discussion_points.map((pt: string, j: number) => (
                                                                                                    <li key={j} className="flex gap-2 text-slate-700 leading-relaxed">
                                                                                                        <span className="text-sky-500 font-black shrink-0 mt-0.5">▸</span>
                                                                                                        <span>{pt}</span>
                                                                                                    </li>
                                                                                                ))}
                                                                                            </ul>
                                                                                        </div>
                                                                                    )}
                                                                                    {issue.conclusion && (
                                                                                        <div className="rounded-xl px-3.5 py-2.5"
                                                                                             style={{
                                                                                                 background: "linear-gradient(135deg, rgba(207,250,254,0.9), rgba(219,234,254,0.9))",
                                                                                                 border: "1px solid rgba(34,211,238,0.45)",
                                                                                             }}>
                                                                                            <p className="text-[10px] font-black text-cyan-700 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                                                                                                <span>✓</span>共識決議
                                                                                            </p>
                                                                                            <p className="text-slate-900 font-medium leading-relaxed">{issue.conclusion}</p>
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
                                                                        <SectionHeader emoji="✅" label="二、待辦事項與行動計畫" tone="sky" />
                                                                        <div className="mt-3 overflow-x-auto rounded-2xl"
                                                                             style={{
                                                                                 background: "rgba(255,255,255,0.9)",
                                                                                 border: "1px solid rgba(186,230,253,0.7)",
                                                                                 boxShadow: "0 4px 12px -6px rgba(8,47,73,0.08)",
                                                                             }}>
                                                                            <table className="w-full text-xs">
                                                                                <thead>
                                                                                    <tr style={{background: "linear-gradient(135deg, rgba(207,250,254,0.85), rgba(219,234,254,0.85))"}}>
                                                                                        <th className="text-left px-3 py-2.5 font-black text-cyan-900 uppercase tracking-wider w-10">#</th>
                                                                                        <th className="text-left px-3 py-2.5 font-black text-cyan-900 uppercase tracking-wider">任務描述</th>
                                                                                        <th className="text-left px-3 py-2.5 font-black text-cyan-900 uppercase tracking-wider whitespace-nowrap">負責單位</th>
                                                                                        <th className="text-left px-3 py-2.5 font-black text-cyan-900 uppercase tracking-wider whitespace-nowrap">預計時限</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {summaries[m.id].action_items.map((item: any, i: number) => (
                                                                                        <tr key={i} className="hover:bg-cyan-50/60 transition-colors" style={{borderTop: "1px solid rgba(186,230,253,0.45)"}}>
                                                                                            <td className="px-3 py-2.5 text-cyan-700 font-black">{item.id ?? i + 1}</td>
                                                                                            <td className="px-3 py-2.5 text-slate-800">{item.task}</td>
                                                                                            <td className="px-3 py-2.5 text-slate-600">{item.owner}</td>
                                                                                            <td className="px-3 py-2.5 text-slate-600">{item.deadline}</td>
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
                                                                        <SectionHeader emoji="📎" label="三、補充說明" tone="blue" />
                                                                        <p className="mt-3 text-slate-700 leading-relaxed rounded-xl px-4 py-3"
                                                                           style={{
                                                                               background: "rgba(255,255,255,0.85)",
                                                                               border: "1px solid rgba(186,230,253,0.7)",
                                                                           }}>{summaries[m.id].notes}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 底部資訊列 */}
                            <div className="mt-8 rounded-2xl p-5 flex items-center gap-3"
                                 style={{
                                     background: "rgba(255,255,255,0.6)",
                                     border: "1px solid rgba(255,255,255,0.85)",
                                     backdropFilter: "blur(20px)",
                                     boxShadow: "0 8px 24px rgba(8,47,73,0.06)",
                                 }}>
                                <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center text-xl shrink-0">🔒</div>
                                <div>
                                    <div className="text-slate-900 font-black text-sm">隱私保護</div>
                                    <div className="text-slate-600 text-xs mt-0.5 leading-relaxed">逐字稿透過本機 LM Studio 推論，內容不會經過第三方雲端 LLM 服務</div>
                                </div>
                            </div>
                        </div>

                        <style jsx>{`
                            @keyframes meetingPulse {
                                0%, 100% { opacity: 0.7; transform: scale(1); }
                                50% { opacity: 1; transform: scale(1.4); box-shadow: 0 0 12px rgba(6,182,212,0.6); }
                            }
                        `}</style>
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

// ===== 會議紀錄區塊用的小元件 =====
function SectionHeader({ emoji, label, tone }: { emoji: string; label: string; tone: "cyan" | "sky" | "blue" }) {
    const toneMap = {
        cyan: { bg: "linear-gradient(135deg, #06b6d4, #0284c7)", chip: "rgba(207,250,254,0.85)", text: "#0e7490" },
        sky:  { bg: "linear-gradient(135deg, #0ea5e9, #0369a1)", chip: "rgba(224,242,254,0.85)", text: "#075985" },
        blue: { bg: "linear-gradient(135deg, #3b82f6, #1e40af)", chip: "rgba(219,234,254,0.85)", text: "#1e3a8a" },
    };
    const t = toneMap[tone];
    return (
        <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm shrink-0" style={{background: t.bg, boxShadow: "0 6px 14px -6px rgba(8,47,73,0.35)"}}>
                {emoji}
            </div>
            <p className="font-black text-slate-900 text-sm md:text-base">{label}</p>
        </div>
    );
}

function MeetingDecor() {
    return (
        <>
            <div className="absolute top-20 left-[10%] w-2 h-2 bg-cyan-400 rounded-full" style={{animation: "meetFloat 4s ease-in-out infinite"}} />
            <div className="absolute top-40 right-[18%] w-1.5 h-1.5 bg-sky-400 rounded-full" style={{animation: "meetFloat 4s ease-in-out infinite 1s"}} />
            <div className="absolute bottom-32 left-[22%] w-2 h-2 bg-blue-400 rounded-full" style={{animation: "meetFloat 4s ease-in-out infinite 2s"}} />
            <div className="absolute top-1/2 right-[8%] w-3 h-3 bg-cyan-300 rounded-full" style={{animation: "meetFloat 4s ease-in-out infinite 0.5s"}} />
            <svg className="absolute top-12 right-10 w-32 h-32 opacity-20 pointer-events-none" viewBox="0 0 200 200" fill="none" style={{color: "#0284c7", animation: "meetSpin 18s linear infinite"}}>
                <circle cx="100" cy="100" r="60" stroke="currentColor" strokeWidth="2" strokeDasharray="4 6"/>
                <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="1" strokeDasharray="2 8"/>
                <rect x="80" y="80" width="40" height="40" rx="6" fill="currentColor" opacity="0.4"/>
            </svg>
            <svg className="absolute bottom-16 left-8 w-24 h-24 opacity-20 pointer-events-none" viewBox="0 0 200 200" fill="currentColor" style={{color: "#06b6d4", animation: "meetBob 6s ease-in-out infinite"}}>
                <rect x="40" y="60" width="120" height="14" rx="3"/>
                <rect x="40" y="90" width="90" height="14" rx="3"/>
                <rect x="40" y="120" width="120" height="14" rx="3"/>
                <rect x="40" y="150" width="60" height="14" rx="3"/>
            </svg>
            <style jsx>{`
                @keyframes meetFloat {
                    0%, 100% { opacity: 0.55; transform: translateY(0) scale(1); }
                    50% { opacity: 1; transform: translateY(-8px) scale(1.25); }
                }
                @keyframes meetSpin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes meetBob {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
            `}</style>
        </>
    );
}
