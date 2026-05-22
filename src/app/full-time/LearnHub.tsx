"use client";

import { useEffect, useRef, useState } from "react";
import {
    collection,
    addDoc,
    deleteDoc,
    doc,
    serverTimestamp,
    onSnapshot,
    query,
    orderBy,
    updateDoc,
    arrayUnion,
    arrayRemove,
    increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

export type LearnTopic = "tools" | "ethics" | "n8n" | "prompts";

type Wish = {
    id: string;
    authorEmail: string;
    authorName: string;
    authorPhoto: string | null;
    text: string;
    createdAt: { toDate?: () => Date } | null;
    likes: number;
    likedBy: string[];
};

interface TopicCard {
    id: LearnTopic;
    icon: string;
    title: string;
    desc: string;
    chip: string;
    tags: string[];
    cta: string;
    illustration: React.ReactNode;
}

const topics: TopicCard[] = [
    {
        id: "tools",
        icon: "🗂️",
        title: "AI 工具對照",
        desc: "精選 12 款實用工具，依使用情境分類比較，含推薦程度、上手難易與使用場景",
        chip: "12 款工具",
        tags: ["對話 AI", "AI 搜尋", "圖像生成", "+3"],
        cta: "探索工具",
        illustration: (
            <svg viewBox="0 0 200 200" fill="currentColor">
                <rect x="30" y="40" width="50" height="50" rx="8"/>
                <rect x="90" y="40" width="50" height="50" rx="8"/>
                <rect x="150" y="40" width="40" height="50" rx="8"/>
                <rect x="30" y="100" width="50" height="50" rx="8"/>
                <rect x="90" y="100" width="50" height="50" rx="8"/>
                <rect x="150" y="100" width="40" height="50" rx="8"/>
            </svg>
        ),
    },
    {
        id: "ethics",
        icon: "⚖️",
        title: "AI 倫理與負責任使用",
        desc: "研究工作的 AI 使用規範：資料紅線、事實查核、引用著作權、揭露標準",
        chip: "5 大原則",
        tags: ["資料隱私", "幻覺查核", "學術誠信"],
        cta: "閱讀規範",
        illustration: (
            <svg viewBox="0 0 200 200" fill="none" stroke="currentColor">
                <path d="M100 30 L100 170 M50 80 L150 80 M40 80 L60 130 L80 80 M120 80 L140 130 L160 80" strokeWidth="8" strokeLinecap="round"/>
                <circle cx="100" cy="30" r="10" fill="currentColor"/>
            </svg>
        ),
    },
    {
        id: "n8n",
        icon: "🔧",
        title: "n8n 工作流自動化",
        desc: "視覺化串接 AI 與各種 App，從入門到實作完整教學，把重複任務交給機器人",
        chip: "完整教學",
        tags: ["工作流", "App 串接", "自動化"],
        cta: "開始學習",
        illustration: (
            <svg viewBox="0 0 200 200" fill="currentColor">
                <circle cx="50" cy="60" r="20"/>
                <circle cx="150" cy="60" r="20"/>
                <circle cx="100" cy="140" r="20"/>
                <line x1="50" y1="60" x2="100" y2="140" stroke="currentColor" strokeWidth="3"/>
                <line x1="150" y1="60" x2="100" y2="140" stroke="currentColor" strokeWidth="3"/>
                <line x1="50" y1="60" x2="150" y2="60" stroke="currentColor" strokeWidth="3"/>
            </svg>
        ),
    },
    {
        id: "prompts",
        icon: "💡",
        title: "Prompt 資料庫",
        desc: "收錄會議紀錄、教學設計、公文撰寫等常用 Prompt 範本，點擊即可複製",
        chip: "5+ 範本",
        tags: ["會議紀錄", "教學設計", "公文撰寫"],
        cta: "瀏覽範本",
        illustration: (
            <svg viewBox="0 0 200 200" fill="currentColor">
                <rect x="30" y="40" width="140" height="20" rx="4"/>
                <rect x="30" y="75" width="100" height="20" rx="4"/>
                <rect x="30" y="110" width="140" height="20" rx="4"/>
                <rect x="30" y="145" width="80" height="20" rx="4"/>
            </svg>
        ),
    },
];

export default function LearnHub({ onSelect }: { onSelect: (topic: LearnTopic) => void }) {
    return (
        <div className="relative overflow-hidden min-h-full" style={{
            background: `
                radial-gradient(ellipse 70% 55% at 15% 20%, rgba(147,197,253,0.55), transparent 60%),
                radial-gradient(ellipse 55% 45% at 85% 25%, rgba(165,180,252,0.50), transparent 60%),
                radial-gradient(ellipse 65% 50% at 50% 100%, rgba(196,181,253,0.45), transparent 60%),
                radial-gradient(ellipse 50% 40% at 80% 80%, rgba(125,211,252,0.40), transparent 60%),
                linear-gradient(135deg, #eff6ff 0%, #e0e7ff 50%, #f5f3ff 100%)
            `,
        }}>
            {/* 浮動裝飾 */}
            <FloatingDecor />

            <div className="max-w-6xl mx-auto px-6 py-16 relative z-10">
                {/* Hero */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6"
                         style={{background: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.95)", boxShadow: "0 2px 8px rgba(30,58,138,0.06)"}}>
                        <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                        <span className="text-sm font-medium text-slate-700">2025 年版 · 持續更新</span>
                    </div>

                    <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-5 text-slate-900 leading-tight">
                        探索{" "}
                        <span style={{
                            background: "linear-gradient(135deg, #1e40af 0%, #6366f1 50%, #8b5cf6 100%)",
                            WebkitBackgroundClip: "text",
                            backgroundClip: "text",
                            color: "transparent",
                        }}>AI 學習資源</span>
                        <br/>提升你的研究效率
                    </h1>

                    <p className="text-base md:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
                        精選工具對照、實用 Prompt、自動化教學與倫理規範，<br className="hidden md:block"/>
                        一站式整合所有 AI 相關學習資源
                    </p>
                </div>

                {/* 4 主題卡 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                    {topics.map(topic => <TopicCardEl key={topic.id} topic={topic} onSelect={onSelect} />)}
                </div>

                {/* 許願池 */}
                <WishBoard />

                {/* 底部資訊列 */}
                <div className="mt-10 rounded-2xl p-6 flex items-center justify-between flex-wrap gap-4"
                     style={{background: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.85)", backdropFilter: "blur(20px)", boxShadow: "0 8px 24px rgba(30,58,138,0.06)"}}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-xl">📈</div>
                        <div>
                            <div className="text-slate-900 font-bold text-sm">資源持續成長中</div>
                            <div className="text-slate-600 text-xs mt-0.5">本月新增 3 個 Prompt 範本、更新 AI 倫理章節</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TopicCardEl({ topic, onSelect }: { topic: TopicCard; onSelect: (t: LearnTopic) => void }) {
    return (
        <button
            onClick={() => onSelect(topic.id)}
            className="group text-left rounded-3xl p-8 cursor-pointer block relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01]"
            style={{
                background: "rgba(255,255,255,0.72)",
                backdropFilter: "blur(20px) saturate(180%)",
                border: "1px solid rgba(255,255,255,0.85)",
                boxShadow: "0 8px 32px rgba(30,58,138,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
            }}
        >
            {/* 角落 illustration */}
            <div className="absolute -right-5 -bottom-5 w-40 h-40 opacity-[0.13] pointer-events-none" style={{color: "#1e3a8a"}}>
                {topic.illustration}
            </div>

            {/* icon + title 同一行 + tag 靠右 */}
            <div className="flex items-center justify-between mb-4 relative z-10 gap-3">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl shrink-0"
                         style={{
                             background: "linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)",
                             boxShadow: "0 10px 25px -8px rgba(30,58,138,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
                         }}>
                        {topic.icon}
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 truncate">{topic.title}</h3>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold text-slate-700 shrink-0"
                      style={{background: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.95)", boxShadow: "0 2px 8px rgba(30,58,138,0.06)"}}>
                    {topic.chip}
                </span>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed mb-6 relative z-10">{topic.desc}</p>

            <div className="flex flex-wrap gap-1.5 mb-6 relative z-10">
                {topic.tags.map((tag, i) => (
                    <span key={i} className="text-[11px] px-2.5 py-1 rounded-md font-medium"
                          style={{background: "rgba(219,234,254,0.85)", color: "#1e40af", border: "1px solid rgba(147,197,253,0.5)"}}>
                        {tag}
                    </span>
                ))}
            </div>

            <div className="flex items-center gap-2 text-sm font-bold text-blue-700 relative z-10">
                <span>{topic.cta}</span>
                <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
        </button>
    );
}

// ===== 許願池：成員寫下想學什麼 + 互相給愛心響應 =====
function WishBoard() {
    const { user } = useAuth();
    const [wishes, setWishes] = useState<Wish[]>([]);
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const q = query(collection(db, "learn_wishes"), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Wish, "id">) })) as Wish[];
            setWishes(list);
            setLoading(false);
        }, () => setLoading(false));
        return () => unsub();
    }, []);

    const showToast = (type: "success" | "error", t: string) => {
        setToast({ type, text: t });
        setTimeout(() => setToast(null), 2400);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!user) return showToast("error", "請先登入");
        if (!trimmed) return;
        if (trimmed.length > 500) return showToast("error", "請少於 500 字");
        setSubmitting(true);
        try {
            await addDoc(collection(db, "learn_wishes"), {
                authorEmail: user.email,
                authorName: user.displayName || user.email,
                authorPhoto: user.photoURL || null,
                text: trimmed,
                createdAt: serverTimestamp(),
                likes: 0,
                likedBy: [],
            });
            setText("");
            if (textareaRef.current) textareaRef.current.style.height = "auto";
            showToast("success", "已送出，謝謝你的分享 ✨");
        } catch (err) {
            console.error(err);
            showToast("error", "送出失敗，請稍後再試");
        } finally {
            setSubmitting(false);
        }
    };

    const toggleLike = async (w: Wish) => {
        if (!user?.email) return;
        const liked = w.likedBy?.includes(user.email);
        try {
            await updateDoc(doc(db, "learn_wishes", w.id), {
                likes: increment(liked ? -1 : 1),
                likedBy: liked ? arrayRemove(user.email) : arrayUnion(user.email),
            });
        } catch (err) {
            console.error(err);
        }
    };

    const handleDelete = async (w: Wish) => {
        if (!confirm("確定刪除這則許願嗎？")) return;
        try {
            await deleteDoc(doc(db, "learn_wishes", w.id));
            showToast("success", "已刪除");
        } catch (err) {
            console.error(err);
            showToast("error", "刪除失敗（可能權限不足）");
        }
    };

    const formatTime = (ts: { toDate?: () => Date } | null): string => {
        if (!ts?.toDate) return "";
        const d = ts.toDate();
        const diff = (Date.now() - d.getTime()) / 1000;
        if (diff < 60) return "剛剛";
        if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
        if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
        return d.toLocaleDateString("zh-TW");
    };

    const onTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value);
        const el = e.target;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 200) + "px";
    };

    return (
        <section className="rounded-3xl p-6 md:p-8 mb-2"
                 style={{
                     background: "rgba(255,255,255,0.72)",
                     backdropFilter: "blur(20px) saturate(180%)",
                     border: "1px solid rgba(255,255,255,0.95)",
                     boxShadow: "0 16px 36px -14px rgba(30,58,138,0.15), inset 0 1px 0 rgba(255,255,255,0.95)",
                 }}>
            {/* 標題列 */}
            <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-xl shrink-0"
                     style={{
                         background: "linear-gradient(135deg, #2563eb 0%, #6366f1 50%, #8b5cf6 100%)",
                         boxShadow: "0 10px 22px -8px rgba(99,102,241,0.55), inset 0 1px 0 rgba(255,255,255,0.3)",
                     }}>🌠</div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-base md:text-lg font-black text-slate-900">學習許願池</h3>
                    <p className="text-[12px] text-slate-500 leading-relaxed">寫下你想學的主題或對現有資源的回饋，按 ❤️ 表示你也想一起學</p>
                </div>
                <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest px-2 py-1 rounded-full"
                      style={{background: "rgba(224,231,255,0.85)", border: "1px solid rgba(165,180,252,0.55)"}}>
                    {wishes.length} 則
                </span>
            </div>

            {/* 發表表單 */}
            <form onSubmit={handleSubmit} className="mb-5">
                <div className="rounded-2xl p-3 transition-all"
                     style={{
                         background: "rgba(255,255,255,0.92)",
                         border: "1.5px solid rgba(165,180,252,0.55)",
                         boxShadow: "inset 0 1px 0 rgba(255,255,255,0.95)",
                     }}>
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={onTextChange}
                        placeholder="例如：想學如何用 ChatGPT 寫研究計畫；或：希望這裡多收錄一些 Notion AI 的範例……"
                        rows={2}
                        maxLength={500}
                        className="w-full resize-none bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400 leading-relaxed"
                    />
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-indigo-100/60">
                        <span className="text-[10px] text-slate-400 font-bold">{text.length}/500 字</span>
                        <button
                            type="submit"
                            disabled={submitting || !text.trim()}
                            className="px-5 py-2 text-white rounded-xl font-black text-xs transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                            style={{
                                background: !text.trim()
                                    ? "linear-gradient(135deg, #cbd5e1, #94a3b8)"
                                    : "linear-gradient(135deg, #2563eb 0%, #6366f1 50%, #8b5cf6 100%)",
                                boxShadow: !text.trim() ? "none" : "0 10px 22px -8px rgba(99,102,241,0.55), inset 0 1px 0 rgba(255,255,255,0.25)",
                            }}
                        >
                            {submitting ? (<><span className="animate-spin">↻</span>送出中...</>) : (<><span>✨</span>送出許願</>)}
                        </button>
                    </div>
                </div>
            </form>

            {/* 留言列表 */}
            {loading ? (
                <div className="text-center py-8 text-slate-500 text-sm flex items-center justify-center gap-2">
                    <span className="animate-spin">↻</span> 載入中...
                </div>
            ) : wishes.length === 0 ? (
                <div className="text-center py-10 rounded-2xl"
                     style={{background: "rgba(255,255,255,0.5)", border: "1px dashed rgba(165,180,252,0.55)"}}>
                    <p className="text-4xl mb-2">🌱</p>
                    <p className="text-sm font-bold text-slate-700">還沒有人許願</p>
                    <p className="text-[12px] text-slate-500 mt-1">成為第一個分享想法的人</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {wishes.map((w) => {
                        const isMine = w.authorEmail === user?.email;
                        const liked = !!user?.email && (w.likedBy || []).includes(user.email);
                        return (
                            <div key={w.id}
                                 className="rounded-2xl p-4 transition-all"
                                 style={{
                                     background: liked
                                         ? "linear-gradient(135deg, rgba(238,242,255,0.95), rgba(245,243,255,0.95))"
                                         : "rgba(255,255,255,0.85)",
                                     border: liked ? "1px solid rgba(165,180,252,0.55)" : "1px solid rgba(226,232,240,0.8)",
                                     boxShadow: "0 4px 12px -6px rgba(30,58,138,0.08)",
                                 }}>
                                <div className="flex items-start gap-3">
                                    {w.authorPhoto ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img src={w.authorPhoto} alt="" className="w-9 h-9 rounded-full shrink-0 ring-2 ring-white"
                                             style={{boxShadow: "0 0 0 1.5px rgba(165,180,252,0.45)"}} />
                                    ) : (
                                        <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center font-black text-white"
                                             style={{background: "linear-gradient(135deg, #6366f1, #8b5cf6)"}}>
                                            {(w.authorName || "?")[0]}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-black text-slate-900 truncate">{w.authorName}</span>
                                            <span className="text-[11px] text-slate-500">{formatTime(w.createdAt)}</span>
                                        </div>
                                        <p className="text-sm text-slate-800 leading-relaxed mt-1 whitespace-pre-wrap break-words">{w.text}</p>
                                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                                            <button
                                                onClick={() => toggleLike(w)}
                                                className="inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full transition-all active:scale-[0.97]"
                                                style={{
                                                    background: liked
                                                        ? "linear-gradient(135deg, #ec4899, #d946ef)"
                                                        : "rgba(255,255,255,0.9)",
                                                    color: liked ? "#fff" : "#475569",
                                                    border: liked ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(226,232,240,0.85)",
                                                    boxShadow: liked ? "0 6px 14px -6px rgba(217,70,239,0.55)" : "none",
                                                }}
                                            >
                                                <span>{liked ? "❤️" : "🤍"}</span>
                                                <span>{liked ? "我也想學" : "我也想學"}</span>
                                                {(w.likes || 0) > 0 && (
                                                    <span className="ml-0.5 px-1.5 py-0 rounded-full text-[10px] font-black"
                                                          style={{background: liked ? "rgba(255,255,255,0.25)" : "rgba(99,102,241,0.12)", color: liked ? "#fff" : "#4338ca"}}>
                                                        {w.likes}
                                                    </span>
                                                )}
                                            </button>
                                            {isMine && (
                                                <button
                                                    onClick={() => handleDelete(w)}
                                                    className="text-[11px] text-slate-400 hover:text-rose-500 font-bold transition-colors px-2 py-1 rounded-lg hover:bg-rose-50"
                                                >
                                                    刪除
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-6 right-6 px-4 py-3 rounded-2xl text-sm font-bold shadow-xl z-50 flex items-center gap-2"
                     style={{
                         background: toast.type === "success"
                             ? "linear-gradient(135deg, #10b981, #0d9488)"
                             : "linear-gradient(135deg, #f43f5e, #ec4899)",
                         color: "#fff",
                         boxShadow: toast.type === "success"
                             ? "0 16px 32px -10px rgba(13,148,136,0.55)"
                             : "0 16px 32px -10px rgba(244,63,94,0.55)",
                         border: "1px solid rgba(255,255,255,0.3)",
                     }}>
                    <span>{toast.type === "success" ? "✓" : "⚠"}</span>
                    <span>{toast.text}</span>
                </div>
            )}
        </section>
    );
}

function FloatingDecor() {
    return (
        <>
            <div className="absolute top-20 left-[10%] w-2 h-2 bg-blue-400 rounded-full" style={{animation: "hubPulse 4s ease-in-out infinite"}} />
            <div className="absolute top-40 right-[20%] w-1.5 h-1.5 bg-indigo-400 rounded-full" style={{animation: "hubPulse 4s ease-in-out infinite 1s"}} />
            <div className="absolute bottom-32 left-[25%] w-2 h-2 bg-purple-400 rounded-full" style={{animation: "hubPulse 4s ease-in-out infinite 2s"}} />
            <div className="absolute top-1/2 right-[8%] w-3 h-3 bg-sky-400 rounded-full" style={{animation: "hubPulse 4s ease-in-out infinite 0.5s"}} />
            <svg className="absolute top-16 right-12 w-32 h-32 opacity-25" viewBox="0 0 200 200" fill="none" style={{color: "#3b82f6", animation: "hubFloat 6s ease-in-out infinite"}}>
                <circle cx="100" cy="100" r="60" stroke="currentColor" strokeWidth="2" strokeDasharray="4 6"/>
                <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="1" strokeDasharray="2 8"/>
                <circle cx="100" cy="40" r="6" fill="currentColor"/>
                <circle cx="160" cy="100" r="6" fill="currentColor"/>
                <circle cx="100" cy="160" r="6" fill="currentColor"/>
                <circle cx="40" cy="100" r="6" fill="currentColor"/>
            </svg>
            <style jsx>{`
                @keyframes hubPulse {
                    0%, 100% { opacity: 0.5; transform: scale(1); }
                    50% { opacity: 0.9; transform: scale(1.2); }
                }
                @keyframes hubFloat {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-12px); }
                }
            `}</style>
        </>
    );
}
