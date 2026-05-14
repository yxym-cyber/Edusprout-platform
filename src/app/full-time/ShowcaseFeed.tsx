"use client";

import { useEffect, useMemo, useState, useRef } from "react";
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
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { compressImage } from "@/lib/imageCompress";

// ===== 預設選項 =====
const AI_TOOLS = [
    "n8n", "Make.com", "Zapier",
    "ChatGPT", "GPT-4o", "GPT-5",
    "Claude", "Claude 3.5", "Claude 4",
    "Gemini", "Midjourney", "DALL·E",
    "Cursor", "v0", "其他",
];

const SCENARIOS = [
    "行政自動化", "資料分析", "文案生成",
    "教學設計", "客戶服務", "資料整理",
    "簡報製作", "其他",
];

// 接受的資源檔案副檔名
const ALLOWED_RESOURCE_EXT = [".json", ".md", ".txt", ".yaml", ".yml"];

type Post = {
    id: string;
    authorEmail: string;
    authorName: string;
    authorPhoto: string | null;
    caption: string;
    promptText: string;
    imageUrl: string;
    imagePublicId: string;
    tools: string[];
    scenario: string;
    impact: string;
    keyLogic: string;
    resourceUrl: string;
    resourceJson: string;
    resourceJsonName: string;
    createdAt: any;
    likes: number;
    likedBy: string[];
};

type Comment = {
    id: string;
    authorEmail: string;
    authorName: string;
    text: string;
    createdAt: any;
};

export default function ShowcaseFeed() {
    const { user } = useAuth();
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);

    // 上傳表單狀態
    const [showUpload, setShowUpload] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState("");
    const [caption, setCaption] = useState("");
    const [tools, setTools] = useState<string[]>([]);
    const [customTools, setCustomTools] = useState(""); // 勾選「其他」時填寫，可用逗號分隔多個
    const [scenario, setScenario] = useState("");
    const [impact, setImpact] = useState("");
    const [promptText, setPromptText] = useState("");
    const [keyLogic, setKeyLogic] = useState("");
    const [resourceUrl, setResourceUrl] = useState("");
    const [resourceJson, setResourceJson] = useState("");
    const [resourceJsonName, setResourceJsonName] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const [submitStage, setSubmitStage] = useState<string>("");
    const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const jsonInputRef = useRef<HTMLInputElement>(null);

    // 卡片展開狀態
    const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
    const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
    const [commentsByPost, setCommentsByPost] = useState<Record<string, Comment[]>>({});
    const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
    const commentUnsubs = useRef<Record<string, () => void>>({});

    // 即時讀取貼文
    useEffect(() => {
        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Post[];
            setPosts(list);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // ===== 儀表板統計 =====
    const stats = useMemo(() => {
        const total = posts.length;
        const scenarioCount: Record<string, number> = {};
        const toolCount: Record<string, number> = {};
        const userCount: Record<string, { name: string; photo: string | null; count: number }> = {};

        posts.forEach((p) => {
            if (p.scenario) {
                scenarioCount[p.scenario] = (scenarioCount[p.scenario] || 0) + 1;
            }
            (p.tools || []).forEach((t) => {
                toolCount[t] = (toolCount[t] || 0) + 1;
            });
            const key = p.authorEmail || p.authorName || "unknown";
            if (!userCount[key]) {
                userCount[key] = { name: p.authorName || "匿名", photo: p.authorPhoto || null, count: 0 };
            }
            userCount[key].count += 1;
        });

        const scenarioRanking = Object.entries(scenarioCount)
            .sort((a, b) => b[1] - a[1]);
        const toolRanking = Object.entries(toolCount)
            .sort((a, b) => b[1] - a[1]);
        const userRanking = Object.entries(userCount)
            .map(([email, v]) => ({ email, ...v }))
            .sort((a, b) => b.count - a.count);

        return {
            total,
            scenarioRanking,
            toolRanking,
            userRanking,
            topUser: userRanking[0] || null,
            topTool: toolRanking[0] || null,
            uniqueTools: toolRanking.length,
            uniqueScenarios: scenarioRanking.length,
        };
    }, [posts]);

    // 取得最踴躍使用者的 email（用來顯示皇冠）
    const topSharerEmail = stats.topUser?.email;

    useEffect(() => {
        return () => {
            Object.values(commentUnsubs.current).forEach((u) => u());
            commentUnsubs.current = {};
        };
    }, []);

    const showToast = (type: "success" | "error", text: string) => {
        setToast({ type, text });
        setTimeout(() => setToast(null), 2500);
    };

    const toggleTool = (t: string) => {
        setTools((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!f.type.startsWith("image/")) {
            showToast("error", "請上傳圖片檔");
            return;
        }
        if (f.size > 10 * 1024 * 1024) {
            showToast("error", "圖片過大（小於 10 MB）");
            return;
        }
        setFile(f);
        const reader = new FileReader();
        reader.onload = (ev) => setPreviewUrl(ev.target?.result as string);
        reader.readAsDataURL(f);
    };

    const handleJsonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const ext = "." + (f.name.split(".").pop() || "").toLowerCase();
        if (!ALLOWED_RESOURCE_EXT.includes(ext)) {
            showToast("error", `只接受 ${ALLOWED_RESOURCE_EXT.join(" / ")} 檔案`);
            return;
        }
        if (f.size > 500 * 1024) {
            showToast("error", "檔案過大（請小於 500 KB）");
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target?.result as string;
            // 只對 .json 做格式驗證；其他純文字檔直接接受
            if (ext === ".json") {
                try {
                    JSON.parse(content);
                } catch {
                    showToast("error", "JSON 格式有誤，請檢查內容");
                    return;
                }
            }
            setResourceJson(content);
            setResourceJsonName(f.name);
            showToast("success", `已載入 ${f.name}`);
        };
        reader.readAsText(f);
    };

    const resetForm = () => {
        setFile(null);
        setPreviewUrl("");
        setCaption("");
        setTools([]);
        setCustomTools("");
        setScenario("");
        setImpact("");
        setPromptText("");
        setKeyLogic("");
        setResourceUrl("");
        setResourceJson("");
        setResourceJsonName("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (jsonInputRef.current) jsonInputRef.current.value = "";
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return showToast("error", "請先登入");
        if (!file) return showToast("error", "請選擇圖片");
        if (!caption.trim()) return showToast("error", "請填寫標題/說明");
        if (tools.length === 0) return showToast("error", "請至少選擇一個 AI 工具");
        if (!scenario) return showToast("error", "請選擇應用場景");

        // 處理「其他」工具：把使用者輸入的字串展開成多個自訂工具名
        const customList = customTools
            .split(/[,，、\n]/)
            .map((s) => s.trim())
            .filter(Boolean);
        if (tools.includes("其他") && customList.length === 0) {
            return showToast("error", "勾選「其他」時請填寫工具名稱");
        }
        const finalTools = Array.from(new Set([
            ...tools.filter((t) => t !== "其他"),
            ...customList,
        ]));
        if (finalTools.length === 0) {
            return showToast("error", "請至少選擇一個 AI 工具");
        }

        setSubmitting(true);
        try {
            setSubmitStage("壓縮圖片中...");
            const compressed = await compressImage(file);
            setSubmitStage("上傳中...");
            const uploaded = await uploadImageToCloudinary(compressed);
            setSubmitStage("儲存中...");
            await addDoc(collection(db, "posts"), {
                authorEmail: user.email,
                authorName: user.displayName || user.email,
                authorPhoto: user.photoURL || null,
                caption: caption.trim(),
                promptText: promptText.trim(),
                imageUrl: uploaded.secure_url,
                imagePublicId: uploaded.public_id,
                tools: finalTools,
                scenario,
                impact: impact.trim(),
                keyLogic: keyLogic.trim(),
                resourceUrl: resourceUrl.trim(),
                resourceJson,
                resourceJsonName,
                createdAt: serverTimestamp(),
                likes: 0,
                likedBy: [],
            });
            showToast("success", "已成功發布！");
            resetForm();
            setShowUpload(false);
        } catch (err: any) {
            console.error(err);
            showToast("error", err.message || "上傳失敗");
        } finally {
            setSubmitting(false);
            setSubmitStage("");
        }
    };

    const toggleLike = async (post: Post) => {
        if (!user?.email) return;
        const liked = post.likedBy?.includes(user.email);
        try {
            await updateDoc(doc(db, "posts", post.id), {
                likes: increment(liked ? -1 : 1),
                likedBy: liked ? arrayRemove(user.email) : arrayUnion(user.email),
            });
        } catch (err) {
            console.error(err);
        }
    };

    const handleDelete = async (post: Post) => {
        if (!confirm("確定刪除這則貼文嗎？")) return;
        try {
            await deleteDoc(doc(db, "posts", post.id));
            showToast("success", "已刪除");
        } catch (err) {
            console.error(err);
            showToast("error", "刪除失敗（可能權限不足）");
        }
    };

    const toggleComments = (postId: string) => {
        if (openComments[postId]) {
            commentUnsubs.current[postId]?.();
            delete commentUnsubs.current[postId];
            setOpenComments((p) => ({ ...p, [postId]: false }));
            return;
        }
        const q = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"));
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Comment[];
            setCommentsByPost((prev) => ({ ...prev, [postId]: list }));
        });
        commentUnsubs.current[postId] = unsub;
        setOpenComments((p) => ({ ...p, [postId]: true }));
    };

    const submitComment = async (postId: string) => {
        const text = (commentDrafts[postId] || "").trim();
        if (!text || !user) return;
        try {
            await addDoc(collection(db, "posts", postId, "comments"), {
                authorEmail: user.email,
                authorName: user.displayName || user.email,
                text,
                createdAt: serverTimestamp(),
            });
            setCommentDrafts((p) => ({ ...p, [postId]: "" }));
        } catch (err) {
            console.error(err);
            showToast("error", "留言失敗");
        }
    };

    const downloadJson = (content: string, filename: string) => {
        const ext = (filename.split(".").pop() || "").toLowerCase();
        const mime =
            ext === "json" ? "application/json"
            : ext === "md" ? "text/markdown"
            : ext === "yaml" || ext === "yml" ? "application/x-yaml"
            : "text/plain";
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename || "resource.txt";
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatTime = (ts: any): string => {
        if (!ts?.toDate) return "";
        const d = ts.toDate() as Date;
        const diff = (Date.now() - d.getTime()) / 1000;
        if (diff < 60) return "剛剛";
        if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
        if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
        return d.toLocaleDateString("zh-TW");
    };

    return (
        <div className="bg-slate-50 min-h-full">
            <div className="max-w-2xl mx-auto py-8 px-4">
                {/* 頁首 */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                            <span>🌟</span> 成果分享動態牆
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">分享你用 AI 改造的成果，互相學習</p>
                    </div>
                    <button
                        onClick={() => setShowUpload((s) => !s)}
                        className="px-4 py-2.5 bg-blue-900 text-white rounded-xl font-bold text-sm shadow-md hover:bg-blue-800 transition-all flex items-center gap-2"
                    >
                        <span className="text-lg leading-none">+</span>
                        <span>{showUpload ? "收起" : "發表新成果"}</span>
                    </button>
                </div>

                {/* ===== 儀表板（最顯眼的英雄區塊）===== */}
                {!loading && posts.length > 0 && (
                    <section className="mb-8">
                        {/* 主視覺：三個 KPI + 分享之王 */}
                        <div className="relative bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 rounded-3xl shadow-2xl overflow-hidden mb-4">
                            {/* 背景裝飾 */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
                            <div className="absolute bottom-0 left-0 w-64 h-64 bg-pink-400/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />

                            <div className="relative p-6 md:p-8">
                                <div className="flex items-center gap-2 mb-5">
                                    <span className="text-2xl">📊</span>
                                    <h3 className="text-lg md:text-xl font-black text-white tracking-wide">
                                        平台統計儀表板
                                    </h3>
                                    <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-white/50">
                                        Live · 即時更新
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {/* 案例總數 */}
                                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20">
                                        <p className="text-xs font-bold text-white/70 uppercase tracking-wider mb-2">
                                            📚 案例總數
                                        </p>
                                        <p className="text-4xl md:text-5xl font-black text-white">
                                            {stats.total}
                                            <span className="text-base font-bold text-white/60 ml-1">篇</span>
                                        </p>
                                        <p className="text-xs text-white/60 mt-1">
                                            涵蓋 {stats.uniqueScenarios} 種應用場景
                                        </p>
                                    </div>

                                    {/* 分享之王 */}
                                    {stats.topUser && (
                                        <div className="bg-gradient-to-br from-yellow-400/20 to-orange-500/20 backdrop-blur-sm rounded-2xl p-5 border-2 border-yellow-300/40 relative overflow-hidden">
                                            <div className="absolute -top-3 -right-3 text-5xl rotate-12 opacity-30">👑</div>
                                            <p className="text-xs font-bold text-yellow-200 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                <span>👑</span> 分享之王
                                            </p>
                                            <div className="flex items-center gap-2.5">
                                                {stats.topUser.photo ? (
                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                    <img src={stats.topUser.photo} alt="" className="w-10 h-10 rounded-full ring-2 ring-yellow-300" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-yellow-400 text-blue-900 flex items-center justify-center font-black ring-2 ring-yellow-300">
                                                        {(stats.topUser.name || "?")[0]}
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <p className="text-base font-black text-white truncate">
                                                        {stats.topUser.name}
                                                    </p>
                                                    <p className="text-xs text-yellow-200 font-bold">
                                                        共分享 {stats.topUser.count} 篇
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* 熱門工具 */}
                                    {stats.topTool && (
                                        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20">
                                            <p className="text-xs font-bold text-white/70 uppercase tracking-wider mb-2">
                                                🔥 最熱門工具
                                            </p>
                                            <p className="text-2xl md:text-3xl font-black text-white truncate">
                                                {stats.topTool[0]}
                                            </p>
                                            <p className="text-xs text-white/60 mt-1">
                                                被使用 <span className="font-bold text-white">{stats.topTool[1]}</span> 次 · 共 {stats.uniqueTools} 種工具
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 兩欄圖表：分享類型 + 工具排行 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* 分享類型分布 */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-lg">📋</span>
                                    <h4 className="text-sm font-black text-slate-800">分享類型分布</h4>
                                    <span className="ml-auto text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        {stats.uniqueScenarios} 類
                                    </span>
                                </div>
                                <div className="space-y-2.5">
                                    {stats.scenarioRanking.slice(0, 6).map(([name, count], idx) => {
                                        const max = stats.scenarioRanking[0]?.[1] || 1;
                                        const pct = (count / max) * 100;
                                        const colors = [
                                            "from-emerald-500 to-emerald-400",
                                            "from-teal-500 to-teal-400",
                                            "from-cyan-500 to-cyan-400",
                                            "from-sky-500 to-sky-400",
                                            "from-blue-500 to-blue-400",
                                            "from-indigo-500 to-indigo-400",
                                        ];
                                        return (
                                            <div key={name}>
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-xs font-bold text-slate-700">
                                                        #{name}
                                                    </span>
                                                    <span className="text-xs font-black text-slate-500">
                                                        {count}
                                                    </span>
                                                </div>
                                                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full bg-gradient-to-r ${colors[idx % colors.length]} rounded-full transition-all duration-500`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 工具使用排行 */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-lg">🛠️</span>
                                    <h4 className="text-sm font-black text-slate-800">最常使用的工具</h4>
                                    <span className="ml-auto text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        Top {Math.min(6, stats.uniqueTools)}
                                    </span>
                                </div>
                                <div className="space-y-2.5">
                                    {stats.toolRanking.slice(0, 6).map(([name, count], idx) => {
                                        const max = stats.toolRanking[0]?.[1] || 1;
                                        const pct = (count / max) * 100;
                                        const medals = ["🥇", "🥈", "🥉"];
                                        return (
                                            <div key={name}>
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                                        {medals[idx] || <span className="text-slate-400 w-4 text-center">{idx + 1}</span>}
                                                        {name}
                                                    </span>
                                                    <span className="text-xs font-black text-slate-500">
                                                        {count} 次
                                                    </span>
                                                </div>
                                                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500"
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* ===== 上傳表單 ===== */}
                {showUpload && (
                    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 mb-6 space-y-5">
                        {/* 圖片 */}
                        <Field label="封面圖" required>
                            <div className="relative group">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                {previewUrl ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={previewUrl} alt="預覽" className="w-full max-h-72 object-contain bg-slate-100 rounded-lg border border-slate-200" />
                                ) : (
                                    <div className="w-full px-4 py-10 bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg group-hover:border-blue-900 transition-all flex flex-col items-center justify-center gap-2">
                                        <span className="text-3xl">📷</span>
                                        <span className="text-sm text-slate-500 font-medium">點擊選擇圖片（10 MB 內）</span>
                                    </div>
                                )}
                            </div>
                        </Field>

                        {/* 標題 */}
                        <Field label="標題/說明" required>
                            <input
                                type="text"
                                value={caption}
                                onChange={(e) => setCaption(e.target.value)}
                                placeholder="例如：用 n8n 自動整理每週信件摘要"
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900 focus:bg-white transition-all"
                            />
                        </Field>

                        {/* 工具標籤（多選） */}
                        <Field label="使用的 AI 工具（可複選）" required>
                            <div className="flex flex-wrap gap-2">
                                {AI_TOOLS.map((t) => {
                                    const active = tools.includes(t);
                                    return (
                                        <button
                                            type="button"
                                            key={t}
                                            onClick={() => toggleTool(t)}
                                            className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
                                                active
                                                    ? "bg-blue-900 text-white border-blue-900"
                                                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-400"
                                            }`}
                                        >
                                            {t}
                                        </button>
                                    );
                                })}
                            </div>
                            {tools.includes("其他") && (
                                <div className="mt-3 bg-blue-50/50 border border-blue-200 rounded-lg p-3">
                                    <label className="text-xs font-bold text-blue-900 block mb-1.5">
                                        請填寫工具名稱（多個請用逗號分隔）
                                    </label>
                                    <input
                                        type="text"
                                        value={customTools}
                                        onChange={(e) => setCustomTools(e.target.value)}
                                        placeholder="例如：Perplexity, Notion AI, Suno"
                                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900 transition-all"
                                    />
                                    <p className="text-[11px] text-slate-500 mt-1.5">
                                        填寫的工具名會顯示為標籤，方便其他人搜尋
                                    </p>
                                </div>
                            )}
                        </Field>

                        {/* 應用場景（單選） */}
                        <Field label="應用場景" required>
                            <div className="flex flex-wrap gap-2">
                                {SCENARIOS.map((s) => (
                                    <button
                                        type="button"
                                        key={s}
                                        onClick={() => setScenario(s)}
                                        className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
                                            scenario === s
                                                ? "bg-emerald-600 text-white border-emerald-600"
                                                : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400"
                                        }`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </Field>

                        {/* 成效 */}
                        <Field label="節省時間 / 成效（選填）">
                            <input
                                type="text"
                                value={impact}
                                onChange={(e) => setImpact(e.target.value)}
                                placeholder="例如：每週節省 5 小時"
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900 focus:bg-white transition-all"
                            />
                        </Field>

                        {/* Prompt */}
                        <Field label="使用的 Prompt（選填）">
                            <textarea
                                value={promptText}
                                onChange={(e) => setPromptText(e.target.value)}
                                placeholder="把你用的 Prompt 貼上來，方便大家學習參考"
                                rows={4}
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900 focus:bg-white transition-all font-mono text-sm"
                            />
                        </Field>

                        {/* ===== 技術實作（永遠顯示） ===== */}
                        <div className="border-2 border-dashed border-blue-200 rounded-xl p-4 bg-blue-50/30 space-y-4">
                            <p className="text-xs font-black text-blue-900 uppercase tracking-wider flex items-center gap-1">
                                <span>🔧</span> 技術實作（選填）
                            </p>

                                <Field label="關鍵邏輯（條列說明流程或邏輯）">
                                    <textarea
                                        value={keyLogic}
                                        onChange={(e) => setKeyLogic(e.target.value)}
                                        placeholder={"例如：\n1. 觸發：每天早上 9 點\n2. 從 Gmail 抓取未讀信件\n3. 用 GPT 分類並摘要\n4. 寫進 Notion 資料庫"}
                                        rows={5}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900 transition-all font-mono text-sm"
                                    />
                                </Field>

                                <Field label="分享 URL（n8n.cloud / GitHub 連結等）">
                                    <input
                                        type="url"
                                        value={resourceUrl}
                                        onChange={(e) => setResourceUrl(e.target.value)}
                                        placeholder="https://..."
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900 transition-all"
                                    />
                                </Field>

                                <Field label="上傳專案檔案（500 KB 內）">
                                    <p className="text-xs text-slate-500 mb-2 leading-relaxed">
                                        接受純文字檔：<b>.json</b>（n8n / Make / Zapier workflow）、<b>.md</b>（Claude 系統提示、文件）、<b>.txt</b>（純文字 prompt）、<b>.yaml</b> / <b>.yml</b>（設定檔）
                                    </p>
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2 text-xs text-amber-800 flex items-start gap-2">
                                        <span className="text-base leading-none">⚠️</span>
                                        <span><b>上傳前請務必移除</b>檔案內所有 API Key、Webhook URL、密碼、Token 等私密資訊，避免外流。</span>
                                    </div>
                                    <div className="relative group">
                                        <input
                                            ref={jsonInputRef}
                                            type="file"
                                            accept=".json,.md,.txt,.yaml,.yml,application/json,text/markdown,text/plain,text/yaml,application/x-yaml"
                                            onChange={handleJsonChange}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        <div className="w-full px-4 py-4 bg-white border-2 border-dashed border-slate-200 rounded-lg group-hover:border-blue-900 transition-all flex items-center justify-center gap-2 text-sm">
                                            <span>📄</span>
                                            <span className="text-slate-500">
                                                {resourceJsonName || "點擊選擇檔案（.json / .md / .txt / .yaml / .yml）"}
                                            </span>
                                        </div>
                                    </div>
                            </Field>
                        </div>

                        {/* 操作按鈕 */}
                        <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => { resetForm(); setShowUpload(false); }}
                                className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700"
                            >
                                取消
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-5 py-2 bg-blue-900 text-white rounded-lg font-bold text-sm shadow-md hover:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all"
                            >
                                {submitting ? (submitStage || "處理中...") : "發布"}
                            </button>
                        </div>
                    </form>
                )}

                {/* ===== 貼文列表 ===== */}
                {loading ? (
                    <div className="text-center text-slate-400 py-16 animate-pulse">載入中...</div>
                ) : posts.length === 0 ? (
                    <div className="text-center text-slate-400 py-16 bg-white rounded-2xl border border-slate-200">
                        <p className="text-4xl mb-3">📭</p>
                        <p className="font-semibold">還沒有任何成果分享</p>
                        <p className="text-sm mt-1">成為第一個分享的人吧！</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {posts.map((post) => {
                            const isMine = post.authorEmail === user?.email;
                            const liked = !!user?.email && post.likedBy?.includes(user.email);
                            const comments = commentsByPost[post.id] || [];
                            const hasDetail = !!(post.promptText || post.keyLogic || post.resourceUrl || post.resourceJson);
                            const detailOpen = !!openDetails[post.id];

                            return (
                                <article key={post.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                    {/* 作者列 */}
                                    <header className="p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {post.authorPhoto ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img src={post.authorPhoto} alt="" className="w-9 h-9 rounded-full" />
                                            ) : (
                                                <div className="w-9 h-9 rounded-full bg-slate-300 text-white flex items-center justify-center font-bold">
                                                    {(post.authorName || "?")[0]}
                                                </div>
                                            )}
                                            <div>
                                                <p className="text-sm font-bold text-slate-800 flex items-center gap-1">
                                                    {post.authorEmail === topSharerEmail && (
                                                        <span
                                                            title="分享之王"
                                                            className="text-base leading-none drop-shadow-[0_0_4px_rgba(250,204,21,0.6)]"
                                                        >
                                                            👑
                                                        </span>
                                                    )}
                                                    {post.authorName}
                                                </p>
                                                <p className="text-xs text-slate-400">{formatTime(post.createdAt)}</p>
                                            </div>
                                        </div>
                                        {isMine && (
                                            <button
                                                onClick={() => handleDelete(post)}
                                                className="text-xs text-slate-400 hover:text-red-500 font-bold"
                                            >
                                                刪除
                                            </button>
                                        )}
                                    </header>

                                    {/* 圖片 */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={post.imageUrl} alt={post.caption} className="w-full bg-slate-100" />

                                    {/* 標題 */}
                                    {post.caption && (
                                        <h3 className="px-4 pt-4 text-base font-black text-slate-800">{post.caption}</h3>
                                    )}

                                    {/* 標籤列：場景 + 工具 */}
                                    <div className="px-4 pt-2 flex flex-wrap gap-1.5">
                                        {post.scenario && (
                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                #{post.scenario}
                                            </span>
                                        )}
                                        {post.tools?.map((t) => (
                                            <span key={t} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                                                {t}
                                            </span>
                                        ))}
                                    </div>

                                    {/* 成效（醒目區塊） */}
                                    {post.impact && (
                                        <div className="mx-4 mt-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
                                            <span className="text-lg">⚡</span>
                                            <span className="text-sm font-bold text-amber-900">{post.impact}</span>
                                        </div>
                                    )}

                                    {/* 互動列 */}
                                    <div className="px-4 mt-3 pb-2 flex items-center gap-4 flex-wrap">
                                        <button
                                            onClick={() => toggleLike(post)}
                                            className={`flex items-center gap-1 text-sm font-bold transition-colors ${liked ? "text-red-500" : "text-slate-500 hover:text-red-500"}`}
                                        >
                                            <span className="text-xl">{liked ? "❤️" : "🤍"}</span>
                                            <span>{post.likes || 0}</span>
                                        </button>
                                        <button
                                            onClick={() => toggleComments(post.id)}
                                            className="flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-blue-900"
                                        >
                                            <span className="text-xl">💬</span>
                                            <span>{openComments[post.id] ? "收起" : "留言"}</span>
                                        </button>
                                        {hasDetail && (
                                            <button
                                                onClick={() => setOpenDetails((p) => ({ ...p, [post.id]: !detailOpen }))}
                                                className="ml-auto flex items-center gap-1 text-xs font-bold py-1.5 px-3 bg-blue-50 text-blue-700 rounded-full border border-blue-200 hover:bg-blue-100 transition-all"
                                            >
                                                <span>{detailOpen ? "▲" : "▼"}</span>
                                                {detailOpen ? "收起詳情" : "查看詳情"}
                                            </button>
                                        )}
                                    </div>

                                    {/* ===== 詳情展開區 ===== */}
                                    {detailOpen && hasDetail && (
                                        <div className="border-t border-slate-100 mt-2 px-4 py-4 bg-slate-50/50 space-y-4">
                                            {/* Prompt */}
                                            {post.promptText && (
                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-black uppercase tracking-wider text-blue-700">💡 使用的 Prompt</span>
                                                        <button
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(post.promptText);
                                                                showToast("success", "Prompt 已複製");
                                                            }}
                                                            className="text-xs font-bold py-1 px-2 bg-white border border-blue-900 text-blue-900 rounded hover:bg-blue-900 hover:text-white transition-all"
                                                        >
                                                            📋 一鍵複製
                                                        </button>
                                                    </div>
                                                    <pre className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-auto">
{post.promptText}
                                                    </pre>
                                                </div>
                                            )}

                                            {/* 關鍵邏輯 */}
                                            {post.keyLogic && (
                                                <div>
                                                    <p className="text-xs font-black uppercase tracking-wider text-blue-700 mb-2">🔧 關鍵邏輯</p>
                                                    <pre className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-3 whitespace-pre-wrap font-sans leading-relaxed">
{post.keyLogic}
                                                    </pre>
                                                </div>
                                            )}

                                            {/* 資源連結 */}
                                            {(post.resourceUrl || post.resourceJson) && (
                                                <div>
                                                    <p className="text-xs font-black uppercase tracking-wider text-blue-700 mb-2">📦 資源</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {post.resourceUrl && (
                                                            <a
                                                                href={post.resourceUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs font-bold py-2 px-3 bg-white border border-blue-900 text-blue-900 rounded-lg hover:bg-blue-900 hover:text-white transition-all flex items-center gap-1"
                                                            >
                                                                🔗 開啟連結
                                                            </a>
                                                        )}
                                                        {post.resourceJson && (
                                                            <button
                                                                onClick={() => downloadJson(post.resourceJson, post.resourceJsonName)}
                                                                className="text-xs font-bold py-2 px-3 bg-white border border-blue-900 text-blue-900 rounded-lg hover:bg-blue-900 hover:text-white transition-all flex items-center gap-1"
                                                            >
                                                                ⬇️ 下載 {post.resourceJsonName || "resource.txt"}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ===== 留言區 ===== */}
                                    {openComments[post.id] && (
                                        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50 space-y-3">
                                            {comments.length === 0 ? (
                                                <p className="text-xs text-slate-400 italic text-center py-2">還沒有留言</p>
                                            ) : (
                                                comments.map((c) => (
                                                    <div key={c.id} className="text-sm">
                                                        <span className="font-bold text-slate-700 mr-2">{c.authorName}</span>
                                                        <span className="text-slate-700">{c.text}</span>
                                                        <p className="text-[10px] text-slate-400 mt-0.5">{formatTime(c.createdAt)}</p>
                                                    </div>
                                                ))
                                            )}
                                            <div className="flex gap-2 pt-2">
                                                <input
                                                    type="text"
                                                    value={commentDrafts[post.id] || ""}
                                                    onChange={(e) => setCommentDrafts((p) => ({ ...p, [post.id]: e.target.value }))}
                                                    onKeyDown={(e) => { if (e.key === "Enter") submitComment(post.id); }}
                                                    placeholder="新增留言..."
                                                    className="flex-1 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900"
                                                />
                                                <button
                                                    onClick={() => submitComment(post.id)}
                                                    className="px-3 py-1.5 bg-blue-900 text-white text-xs font-bold rounded-md hover:bg-blue-800"
                                                >
                                                    送出
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="h-3" />
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 p-4 rounded-md text-sm font-medium shadow-lg z-50 ${toast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                    {toast.text}
                </div>
            )}
        </div>
    );
}

// 小元件：表單欄位包裝
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-sm font-semibold text-slate-700 block mb-2">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {children}
        </div>
    );
}
