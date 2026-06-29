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

// AI 工具分組（MECE：每個工具品牌只出現一次）
const AI_TOOL_GROUPS = [
    {
        group: "🔄 自動化整合",
        tools: ["n8n", "Make.com", "Zapier"],
    },
    {
        group: "💬 AI 語言模型",
        tools: ["ChatGPT", "Claude", "Gemini", "Grok", "Microsoft Copilot", "Perplexity"],
    },
    {
        group: "🎨 圖像生成",
        tools: ["Midjourney", "DALL·E", "Stable Diffusion", "Ideogram"],
    },
    {
        group: "💻 程式開發",
        tools: ["Cursor", "GitHub Copilot", "v0", "Bolt.new", "Codex", "Claude Code"],
    },
    {
        group: "✨ 其他工具",
        tools: ["Notion AI", "ElevenLabs", "Suno", "Runway", "其他"],
    },
];

// 平鋪版（供其他邏輯使用）
const AI_TOOLS = AI_TOOL_GROUPS.flatMap((g) => g.tools);

const SCENARIOS = [
    "文案與內容生成",
    "資料分析整理",
    "自動化流程",
    "圖像生成",
    "程式開發輔助",
    "教學設計",
    "客戶服務",
    "會議與筆記",
    "研究資料蒐集",
    "簡報製作",
    "其他",
];

const DIFFICULTY_LEVELS = [
    { value: "新手可上手", emoji: "🌱", desc: "不需要技術背景，照著操作就能做" },
    { value: "需要基礎", emoji: "🔧", desc: "有一點 AI 工具使用經驗會更順" },
    { value: "進階挑戰", emoji: "🚀", desc: "需要一定的技術知識或設定經驗" },
];

// 接受的資源檔案副檔名
const ALLOWED_RESOURCE_EXT = [".json", ".md", ".txt", ".yaml", ".yml"];

type Post = {
    id: string;
    authorEmail: string;
    authorName: string;
    authorPhoto: string | null;
    caption: string;
    // 新結構化欄位
    problem: string;      // ① 想解決的問題
    workflow: string;     // ② 工具/流程介紹
    impact: string;       // ③ 具體成果
    futurePlan: string;   // ④ 後續應用規劃
    // 舊欄位（向下相容既有貼文）
    promptText: string;
    keyLogic: string;
    // 圖片（支援多張）
    imageUrl: string;        // 主圖（backward compat）
    imagePublicId: string;
    imageUrls: string[];     // 所有圖片
    imagePublicIds: string[];
    tools: string[];
    scenario: string;
    resourceUrl: string;
    resourceJson: string;
    resourceJsonName: string;
    driveUrl: string;
    difficulty: string;
    createdAt: any;
    updatedAt?: any;
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
    const [files, setFiles] = useState<(File | null)[]>([null, null, null]);
    const [previewUrls, setPreviewUrls] = useState<string[]>(["", "", ""]);
    const [caption, setCaption] = useState("");
    const [tools, setTools] = useState<string[]>([]);
    const [customTools, setCustomTools] = useState("");
    const [scenario, setScenario] = useState("");
    const [problem, setProblem] = useState("");      // ① 問題背景
    const [workflow, setWorkflow] = useState("");    // ② 工具/流程介紹
    const [impact, setImpact] = useState("");        // ③ 具體成果
    const [futurePlan, setFuturePlan] = useState(""); // ④ 後續規劃
    const [resourceUrl, setResourceUrl] = useState("");
    const [resourceJson, setResourceJson] = useState("");
    const [resourceJsonName, setResourceJsonName] = useState("");
    const [driveUrl, setDriveUrl] = useState("");
    const [difficulty, setDifficulty] = useState("");
    const [customScenario, setCustomScenario] = useState("");
    // 卡片圖片切換
    const [selectedImg, setSelectedImg] = useState<Record<string, number>>({});

    const [submitting, setSubmitting] = useState(false);
    const [submitStage, setSubmitStage] = useState<string>("");
    const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const fileInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null]);
    const jsonInputRef = useRef<HTMLInputElement>(null);
    const formRef = useRef<HTMLDivElement>(null);

    // 篩選狀態
    const [filterScenario, setFilterScenario] = useState<string>("");
    const [filterMine, setFilterMine] = useState(false);
    const [filterUser, setFilterUser] = useState<string>(""); // 成果人物誌篩選

    // 篩選後貼文
    const filteredPosts = useMemo(() => {
        return posts.filter((p) => {
            if (filterMine && p.authorEmail !== user?.email) return false;
            if (filterUser && p.authorEmail !== filterUser) return false;
            if (filterScenario && p.scenario !== filterScenario) return false;
            return true;
        });
    }, [posts, filterScenario, filterMine, filterUser, user?.email]);

    // 卡片展開狀態
    const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
    const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
    const [commentsByPost, setCommentsByPost] = useState<Record<string, Comment[]>>({});
    const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
    const commentUnsubs = useRef<Record<string, () => void>>({});

    // ===== 編輯貼文狀態 =====
    const [editingPost, setEditingPost] = useState<Post | null>(null);
    const [editCaption, setEditCaption] = useState("");
    const [editTools, setEditTools] = useState<string[]>([]);
    const [editCustomTools, setEditCustomTools] = useState("");
    const [editScenario, setEditScenario] = useState("");
    const [editCustomScenario, setEditCustomScenario] = useState("");
    const [editProblem, setEditProblem] = useState("");
    const [editWorkflow, setEditWorkflow] = useState("");
    const [editImpact, setEditImpact] = useState("");
    const [editFuturePlan, setEditFuturePlan] = useState("");
    const [editDifficulty, setEditDifficulty] = useState("");
    const [editResourceUrl, setEditResourceUrl] = useState("");
    const [editResourceJson, setEditResourceJson] = useState("");
    const [editResourceJsonName, setEditResourceJsonName] = useState("");
    const [editDriveUrl, setEditDriveUrl] = useState("");
    const [editFile, setEditFile] = useState<File | null>(null);
    const [editPreviewUrl, setEditPreviewUrl] = useState("");
    const [editSubmitting, setEditSubmitting] = useState(false);
    const editFileInputRef = useRef<HTMLInputElement>(null);
    const editJsonInputRef = useRef<HTMLInputElement>(null);

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
        const userCount: Record<string, { name: string; photo: string | null; count: number; latest: number }> = {};

        let totalLikes = 0;
        let weekNew = 0;
        const oneWeekAgo = Date.now() - 7 * 86400 * 1000;

        posts.forEach((p) => {
            if (p.scenario) {
                scenarioCount[p.scenario] = (scenarioCount[p.scenario] || 0) + 1;
            }
            (p.tools || []).forEach((t) => {
                toolCount[t] = (toolCount[t] || 0) + 1;
            });
            totalLikes += p.likes || 0;
            const createdMs: number = (() => {
                const ts = p.createdAt;
                if (ts && typeof ts.toDate === "function") return (ts.toDate() as Date).getTime();
                return 0;
            })();
            if (createdMs && createdMs >= oneWeekAgo) weekNew += 1;

            const key = p.authorEmail || p.authorName || "unknown";
            if (!userCount[key]) {
                userCount[key] = { name: p.authorName || "匿名", photo: p.authorPhoto || null, count: 0, latest: 0 };
            }
            userCount[key].count += 1;
            if (createdMs > userCount[key].latest) userCount[key].latest = createdMs;
        });

        const scenarioRanking = Object.entries(scenarioCount)
            .sort((a, b) => b[1] - a[1]);
        const toolRanking = Object.entries(toolCount)
            .sort((a, b) => b[1] - a[1]);
        const userRanking = Object.entries(userCount)
            .map(([email, v]) => ({ email, ...v }))
            .sort((a, b) => b.count - a.count);

        // 最近活動時間軸（按時間倒序前 6 筆）
        const recentTimeline = [...posts]
            .filter((p) => p.createdAt?.toDate)
            .sort((a, b) => (b.createdAt.toDate() as Date).getTime() - (a.createdAt.toDate() as Date).getTime())
            .slice(0, 6);

        return {
            total,
            totalLikes,
            weekNew,
            scenarioRanking,
            toolRanking,
            userRanking,
            topUser: userRanking[0] || null,
            topTool: toolRanking[0] || null,
            uniqueTools: toolRanking.length,
            uniqueScenarios: scenarioRanking.length,
            uniqueAuthors: userRanking.length,
            recentTimeline,
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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!f.type.startsWith("image/")) { showToast("error", "請上傳圖片檔"); return; }
        if (f.size > 10 * 1024 * 1024) { showToast("error", "圖片過大（小於 10 MB）"); return; }
        const newFiles = [...files];
        newFiles[idx] = f;
        setFiles(newFiles);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const newUrls = [...previewUrls];
            newUrls[idx] = ev.target?.result as string;
            setPreviewUrls(newUrls);
        };
        reader.readAsDataURL(f);
    };

    const removeFile = (idx: number) => {
        const newFiles = [...files];
        newFiles[idx] = null;
        setFiles(newFiles);
        const newUrls = [...previewUrls];
        newUrls[idx] = "";
        setPreviewUrls(newUrls);
        const ref = fileInputRefs.current[idx];
        if (ref) ref.value = "";
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
        setFiles([null, null, null]);
        setPreviewUrls(["", "", ""]);
        setCaption("");
        setTools([]);
        setCustomTools("");
        setScenario("");
        setProblem("");
        setWorkflow("");
        setImpact("");
        setFuturePlan("");
        setResourceUrl("");
        setResourceJson("");
        setResourceJsonName("");
        setDriveUrl("");
        setDifficulty("");
        setCustomScenario("");
        fileInputRefs.current.forEach((ref) => { if (ref) ref.value = ""; });
        if (jsonInputRef.current) jsonInputRef.current.value = "";
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return showToast("error", "請先登入");
        if (!files[0]) return showToast("error", "請至少選擇一張主圖");
        if (!caption.trim()) return showToast("error", "請填寫標題/說明");
        if (tools.length === 0) return showToast("error", "請至少選擇一個 AI 工具");
        if (!scenario) return showToast("error", "請選擇應用場景");
        if (scenario === "其他" && !customScenario.trim()) return showToast("error", "請填寫自訂場景名稱");

        const customList = customTools.split(/[,，、\n]/).map((s) => s.trim()).filter(Boolean);
        if (tools.includes("其他") && customList.length === 0) return showToast("error", "勾選「其他」時請填寫工具名稱");
        const finalTools = Array.from(new Set([...tools.filter((t) => t !== "其他"), ...customList]));
        if (finalTools.length === 0) return showToast("error", "請至少選擇一個 AI 工具");

        setSubmitting(true);
        try {
            const uploadedUrls: string[] = [];
            const uploadedIds: string[] = [];
            for (let i = 0; i < 3; i++) {
                const f = files[i];
                if (!f) continue;
                setSubmitStage(`壓縮圖片 ${uploadedUrls.length + 1}...`);
                const compressed = await compressImage(f);
                setSubmitStage(`上傳圖片 ${uploadedUrls.length + 1}...`);
                const uploaded = await uploadImageToCloudinary(compressed);
                uploadedUrls.push(uploaded.secure_url);
                uploadedIds.push(uploaded.public_id);
            }
            setSubmitStage("儲存中...");
            await addDoc(collection(db, "posts"), {
                authorEmail: user.email,
                authorName: user.displayName || user.email,
                authorPhoto: user.photoURL || null,
                caption: caption.trim(),
                imageUrl: uploadedUrls[0] || "",
                imagePublicId: uploadedIds[0] || "",
                imageUrls: uploadedUrls,
                imagePublicIds: uploadedIds,
                tools: finalTools,
                scenario: scenario === "其他" ? customScenario.trim() : scenario,
                problem: problem.trim(),
                workflow: workflow.trim(),
                impact: impact.trim(),
                futurePlan: futurePlan.trim(),
                resourceUrl: resourceUrl.trim(),
                resourceJson,
                resourceJsonName,
                driveUrl: driveUrl.trim(),
                difficulty,
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

    // ===== 編輯貼文函式 =====
    const openEdit = (post: Post) => {
        setEditingPost(post);
        setEditCaption(post.caption || "");
        setEditTools(post.tools || []);
        setEditCustomTools("");
        setEditScenario(post.scenario || "");
        setEditCustomScenario("");
        setEditProblem(post.problem || "");
        // 舊貼文若沒有 workflow，把 keyLogic + promptText 合併帶入
        setEditWorkflow(post.workflow || [post.keyLogic, post.promptText].filter(Boolean).join("\n\n"));
        setEditImpact(post.impact || "");
        setEditFuturePlan(post.futurePlan || "");
        setEditDifficulty(post.difficulty || "");
        setEditResourceUrl(post.resourceUrl || "");
        setEditResourceJson(post.resourceJson || "");
        setEditResourceJsonName(post.resourceJsonName || "");
        setEditDriveUrl(post.driveUrl || "");
        setEditFile(null);
        setEditPreviewUrl((post.imageUrls?.[0] || post.imageUrl) || "");
    };

    const closeEdit = () => {
        setEditingPost(null);
        setEditFile(null);
        setEditPreviewUrl("");
        if (editFileInputRef.current) editFileInputRef.current.value = "";
        if (editJsonInputRef.current) editJsonInputRef.current.value = "";
    };

    const toggleEditTool = (t: string) => {
        setEditTools((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
    };

    const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!f.type.startsWith("image/")) { showToast("error", "請上傳圖片檔"); return; }
        if (f.size > 10 * 1024 * 1024) { showToast("error", "圖片過大（小於 10 MB）"); return; }
        setEditFile(f);
        const reader = new FileReader();
        reader.onload = (ev) => setEditPreviewUrl(ev.target?.result as string);
        reader.readAsDataURL(f);
    };

    const handleEditJsonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const ext = "." + (f.name.split(".").pop() || "").toLowerCase();
        if (!ALLOWED_RESOURCE_EXT.includes(ext)) { showToast("error", `只接受 ${ALLOWED_RESOURCE_EXT.join(" / ")} 檔案`); return; }
        if (f.size > 500 * 1024) { showToast("error", "檔案過大（請小於 500 KB）"); return; }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target?.result as string;
            if (ext === ".json") {
                try { JSON.parse(content); } catch { showToast("error", "JSON 格式有誤"); return; }
            }
            setEditResourceJson(content);
            setEditResourceJsonName(f.name);
            showToast("success", `已載入 ${f.name}`);
        };
        reader.readAsText(f);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingPost) return;
        if (!editCaption.trim()) return showToast("error", "請填寫標題/說明");
        if (editTools.length === 0) return showToast("error", "請至少選擇一個 AI 工具");
        if (!editScenario) return showToast("error", "請選擇應用場景");
        if (editScenario === "其他" && !editCustomScenario.trim()) return showToast("error", "請填寫自訂場景名稱");

        const customList = editCustomTools.split(/[,，、\n]/).map((s) => s.trim()).filter(Boolean);
        if (editTools.includes("其他") && customList.length === 0) return showToast("error", "勾選「其他」時請填寫工具名稱");
        const finalTools = Array.from(new Set([...editTools.filter((t) => t !== "其他"), ...customList]));

        setEditSubmitting(true);
        try {
            let imageUrl = editingPost.imageUrls?.[0] || editingPost.imageUrl;
            let imagePublicId = editingPost.imagePublicIds?.[0] || editingPost.imagePublicId;
            let imageUrls = editingPost.imageUrls || [editingPost.imageUrl].filter(Boolean);
            let imagePublicIds = editingPost.imagePublicIds || [editingPost.imagePublicId].filter(Boolean);
            if (editFile) {
                const compressed = await compressImage(editFile);
                const uploaded = await uploadImageToCloudinary(compressed);
                imageUrl = uploaded.secure_url;
                imagePublicId = uploaded.public_id;
                imageUrls = [uploaded.secure_url, ...imageUrls.slice(1)];
                imagePublicIds = [uploaded.public_id, ...imagePublicIds.slice(1)];
            }
            await updateDoc(doc(db, "posts", editingPost.id), {
                caption: editCaption.trim(),
                tools: finalTools,
                scenario: editScenario === "其他" ? editCustomScenario.trim() : editScenario,
                problem: editProblem.trim(),
                workflow: editWorkflow.trim(),
                impact: editImpact.trim(),
                futurePlan: editFuturePlan.trim(),
                difficulty: editDifficulty,
                resourceUrl: editResourceUrl.trim(),
                resourceJson: editResourceJson,
                resourceJsonName: editResourceJsonName,
                driveUrl: editDriveUrl.trim(),
                imageUrl,
                imagePublicId,
                imageUrls,
                imagePublicIds,
                updatedAt: serverTimestamp(),
            });
            showToast("success", "已成功更新！");
            closeEdit();
        } catch (err: any) {
            console.error(err);
            showToast("error", err.message || "更新失敗");
        } finally {
            setEditSubmitting(false);
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
        <div className="relative overflow-hidden min-h-full" style={{
            background: `
                radial-gradient(ellipse 70% 55% at 15% 18%, rgba(251,207,232,0.55), transparent 60%),
                radial-gradient(ellipse 55% 45% at 85% 22%, rgba(245,208,254,0.55), transparent 60%),
                radial-gradient(ellipse 65% 50% at 50% 100%, rgba(233,213,255,0.55), transparent 60%),
                radial-gradient(ellipse 50% 40% at 78% 78%, rgba(252,165,165,0.30), transparent 60%),
                linear-gradient(135deg, #fdf2f8 0%, #fae8ff 50%, #faf5ff 100%)
            `,
        }}>
            {/* 浮動裝飾 */}
            <ShowcaseDecor />

            <div className="max-w-3xl mx-auto py-12 md:py-16 px-4 md:px-6 relative z-10">
                {/* Hero 標題 */}
                <header className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6"
                         style={{background: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.95)", boxShadow: "0 2px 8px rgba(131,24,67,0.06)"}}>
                        <span className="w-2 h-2 bg-rose-500 rounded-full" style={{animation: "showcasePulse 2.4s ease-in-out infinite"}} />
                        <span className="text-xs font-bold text-slate-700">{stats.total} 篇成果 · {stats.uniqueScenarios} 種應用場景</span>
                    </div>
                    <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-4 text-slate-900 leading-tight">
                        <span style={{
                            background: "linear-gradient(135deg, #ec4899 0%, #d946ef 50%, #a855f7 100%)",
                            WebkitBackgroundClip: "text",
                            backgroundClip: "text",
                            color: "transparent",
                        }}>成果</span>
                        <span className="text-slate-900">分享動態牆</span>
                    </h1>
                    <p className="text-sm md:text-base text-slate-600 max-w-xl mx-auto leading-relaxed mb-6">
                        分享你用 AI 改造的工作流，<br className="hidden md:block"/>
                        看看同事們做了什麼酷東西，互相啟發
                    </p>
                    <button
                        onClick={() => {
                            if (!showUpload) {
                                setShowUpload(true);
                                setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
                            } else {
                                setShowUpload(false);
                            }
                        }}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-black text-sm transition-all active:scale-[0.98]"
                        style={{
                            background: showUpload
                                ? "linear-gradient(135deg, #94a3b8, #64748b)"
                                : "linear-gradient(135deg, #ec4899 0%, #d946ef 50%, #a855f7 100%)",
                            boxShadow: showUpload
                                ? "0 8px 18px -6px rgba(100,116,139,0.5)"
                                : "0 14px 30px -10px rgba(217,70,239,0.55), inset 0 1px 0 rgba(255,255,255,0.3)",
                        }}
                    >
                        <span className="text-lg leading-none">{showUpload ? "✕" : "✨"}</span>
                        <span>{showUpload ? "收起發表表單" : "發表新成果"}</span>
                    </button>
                </header>

                {/* ===== 儀表板（最顯眼的英雄區塊）===== */}
                {!loading && posts.length > 0 && (
                    <section className="mb-10 space-y-4">
                        {/* === 主 KPI 區（暗色玻璃漸層） === */}
                        <div className="relative rounded-3xl overflow-hidden"
                             style={{
                                 background: "linear-gradient(135deg, #831843 0%, #86198f 45%, #581c87 100%)",
                                 boxShadow: "0 24px 56px -16px rgba(131,24,67,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
                             }}>
                            {/* 背景裝飾光暈 */}
                            <div className="absolute top-0 right-0 w-72 h-72 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4"
                                 style={{background: "radial-gradient(circle, rgba(251,191,36,0.32), transparent 70%)", animation: "dashGlowA 6s ease-in-out infinite"}} />
                            <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4"
                                 style={{background: "radial-gradient(circle, rgba(244,114,182,0.32), transparent 70%)", animation: "dashGlowB 6s ease-in-out infinite 1.5s"}} />
                            <div className="absolute top-1/2 left-1/2 w-96 h-96 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2"
                                 style={{background: "radial-gradient(circle, rgba(216,180,254,0.18), transparent 70%)", animation: "dashGlowA 8s ease-in-out infinite 3s"}} />

                            <div className="relative p-6 md:p-8">
                                <div className="flex items-center gap-2 mb-6">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                                         style={{background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.25)"}}>📊</div>
                                    <h3 className="text-base md:text-lg font-black text-white tracking-wide">
                                        平台統計儀表板
                                    </h3>
                                    <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/80 px-2.5 py-1 rounded-full"
                                          style={{background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)"}}>
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" style={{animation: "showcasePulse 2.4s ease-in-out infinite"}} />
                                        Live
                                    </span>
                                </div>

                                {/* 4 個 KPI */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {[
                                        { icon: "📚", label: "案例總數", value: stats.total, suffix: " 篇", sub: `${stats.uniqueScenarios} 種場景` },
                                        { icon: "✨", label: "本週新增", value: stats.weekNew, suffix: " 篇", sub: "近 7 天" },
                                        { icon: "❤️", label: "累積愛心", value: stats.totalLikes, suffix: "", sub: "總按讚數" },
                                        { icon: "👥", label: "活躍作者", value: stats.uniqueAuthors, suffix: " 人", sub: "曾發表過" },
                                    ].map((kpi, idx) => (
                                        <div key={idx} className="rounded-2xl p-4 md:p-5 transition-all hover:-translate-y-0.5"
                                             style={{
                                                 background: "rgba(255,255,255,0.1)",
                                                 backdropFilter: "blur(12px)",
                                                 border: "1px solid rgba(255,255,255,0.22)",
                                                 boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
                                             }}>
                                            <p className="text-[10px] font-black text-white/70 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                <span>{kpi.icon}</span> {kpi.label}
                                            </p>
                                            <p className="text-3xl md:text-4xl font-black text-white leading-none">
                                                <AnimatedNumber value={kpi.value} duration={1100 + idx * 120} suffix={kpi.suffix} />
                                            </p>
                                            <p className="text-[11px] text-white/60 mt-2">{kpi.sub}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* 分享之王 占整列 */}
                                {stats.topUser && (
                                    <div className="relative rounded-2xl p-5 mt-3 overflow-hidden"
                                         style={{
                                             background: "linear-gradient(135deg, rgba(251,191,36,0.28), rgba(249,115,22,0.20))",
                                             backdropFilter: "blur(12px)",
                                             border: "1.5px solid rgba(252,211,77,0.55)",
                                             boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 8px 18px -6px rgba(245,158,11,0.45)",
                                         }}>
                                        <div className="absolute -top-6 -right-6 text-7xl opacity-25 select-none pointer-events-none"
                                             style={{animation: "crownFloat 4s ease-in-out infinite"}}>👑</div>
                                        <div className="flex items-center justify-between gap-4 flex-wrap relative">
                                            <div className="flex items-center gap-3">
                                                <div className="relative shrink-0">
                                                    {stats.topUser.photo ? (
                                                        /* eslint-disable-next-line @next/next/no-img-element */
                                                        <img src={stats.topUser.photo} alt="" className="w-14 h-14 rounded-full ring-4 ring-amber-300/70" />
                                                    ) : (
                                                        <div className="w-14 h-14 rounded-full bg-amber-400 text-rose-900 flex items-center justify-center font-black text-lg ring-4 ring-amber-300/70">
                                                            {(stats.topUser.name || "?")[0]}
                                                        </div>
                                                    )}
                                                    <span className="absolute -top-2 -left-2 text-xl" style={{filter: "drop-shadow(0 0 6px rgba(252,211,77,0.7))"}}>👑</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-black text-amber-100 uppercase tracking-widest mb-1">本月分享之王</p>
                                                    <p className="text-lg md:text-xl font-black text-white truncate leading-tight">{stats.topUser.name}</p>
                                                    <p className="text-[11px] text-amber-200 font-bold mt-0.5">
                                                        ✨ 共分享 <AnimatedNumber value={stats.topUser.count} duration={1300} /> 篇 · 啟發大家不遺餘力
                                                    </p>
                                                </div>
                                            </div>
                                            {stats.topTool && (
                                                <div className="rounded-xl px-4 py-3 shrink-0"
                                                     style={{background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)"}}>
                                                    <p className="text-[10px] font-black text-white/70 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                                        <span>🔥</span> 最熱門工具
                                                    </p>
                                                    <p className="text-base md:text-lg font-black text-white">{stats.topTool[0]}</p>
                                                    <p className="text-[10px] text-white/70 font-bold">用過 {stats.topTool[1]} 次</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* === 雙欄：分享類型環形圖 + 工具排行條狀圖 === */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* 分享類型分布 → DonutChart */}
                            <div className="rounded-2xl p-5"
                                 style={{
                                     background: "rgba(255,255,255,0.72)",
                                     backdropFilter: "blur(20px) saturate(180%)",
                                     border: "1px solid rgba(255,255,255,0.95)",
                                     boxShadow: "0 12px 28px -12px rgba(131,24,67,0.14), inset 0 1px 0 rgba(255,255,255,0.95)",
                                 }}>
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                                         style={{background: "linear-gradient(135deg, #f0abfc, #c084fc)", color: "#fff"}}>📋</div>
                                    <h4 className="text-sm font-black text-slate-900">分享類型分布</h4>
                                    <span className="ml-auto text-[10px] font-black text-slate-500 uppercase tracking-wider px-2 py-0.5 rounded-full bg-fuchsia-50 border border-fuchsia-100">
                                        {stats.uniqueScenarios} 類
                                    </span>
                                </div>
                                {(() => {
                                    const palette = ["#ec4899", "#d946ef", "#a855f7", "#8b5cf6", "#f43f5e", "#f97316"];
                                    const donutData = stats.scenarioRanking.slice(0, 6).map(([label, value], i) => ({
                                        label, value, color: palette[i % palette.length],
                                    }));
                                    const showTotal = donutData.reduce((s, d) => s + d.value, 0);
                                    return (
                                        <div className="flex items-center gap-4">
                                            <DonutChart
                                                data={donutData}
                                                size={150}
                                                thickness={20}
                                                centerLabel={`${showTotal}`}
                                                centerSubLabel="篇"
                                            />
                                            <div className="flex-1 min-w-0 space-y-1.5">
                                                {donutData.map((seg) => {
                                                    const pct = ((seg.value / showTotal) * 100).toFixed(0);
                                                    return (
                                                        <div key={seg.label} className="flex items-center gap-2 text-xs">
                                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background: seg.color}} />
                                                            <span className="font-bold text-slate-800 truncate flex-1">#{seg.label}</span>
                                                            <span className="font-black text-slate-500 text-[11px]">{pct}%</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* 工具使用排行（條狀圖，加 0→目標動畫） */}
                            <div className="rounded-2xl p-5"
                                 style={{
                                     background: "rgba(255,255,255,0.72)",
                                     backdropFilter: "blur(20px) saturate(180%)",
                                     border: "1px solid rgba(255,255,255,0.95)",
                                     boxShadow: "0 12px 28px -12px rgba(131,24,67,0.14), inset 0 1px 0 rgba(255,255,255,0.95)",
                                 }}>
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                                         style={{background: "linear-gradient(135deg, #fb7185, #ec4899)", color: "#fff"}}>🛠️</div>
                                    <h4 className="text-sm font-black text-slate-900">最常使用的工具</h4>
                                    <span className="ml-auto text-[10px] font-black text-slate-500 uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-50 border border-rose-100">
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
                                                <div className="flex justify-between items-center mb-1.5">
                                                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                                        {medals[idx] || <span className="text-slate-400 w-4 text-center font-black">{idx + 1}</span>}
                                                        {name}
                                                    </span>
                                                    <span className="text-xs font-black text-slate-500">
                                                        {count} 次
                                                    </span>
                                                </div>
                                                <AnimatedBar
                                                    widthPct={pct}
                                                    gradient="linear-gradient(90deg, #ec4899, #d946ef, #a855f7)"
                                                    delay={idx * 90}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* === 分享之星榜 Top 5 === */}
                        {stats.userRanking.length > 1 && (
                            <div className="rounded-2xl p-5"
                                 style={{
                                     background: "rgba(255,255,255,0.72)",
                                     backdropFilter: "blur(20px) saturate(180%)",
                                     border: "1px solid rgba(255,255,255,0.95)",
                                     boxShadow: "0 12px 28px -12px rgba(131,24,67,0.14), inset 0 1px 0 rgba(255,255,255,0.95)",
                                 }}>
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                                         style={{background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#fff"}}>🏆</div>
                                    <h4 className="text-sm font-black text-slate-900">分享之星 Top 5</h4>
                                    <span className="ml-auto text-[10px] font-black text-slate-500 uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100">
                                        Leaderboard
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
                                    {stats.userRanking.slice(0, 5).map((u, idx) => {
                                        const medals = ["🥇", "🥈", "🥉"];
                                        const rankBg = idx === 0
                                            ? "linear-gradient(135deg, rgba(254,243,199,0.95), rgba(254,215,170,0.85))"
                                            : idx === 1
                                                ? "linear-gradient(135deg, rgba(243,244,246,0.95), rgba(229,231,235,0.85))"
                                                : idx === 2
                                                    ? "linear-gradient(135deg, rgba(254,226,226,0.85), rgba(254,202,202,0.75))"
                                                    : "rgba(255,255,255,0.85)";
                                        const rankBorder = idx === 0 ? "rgba(251,191,36,0.55)"
                                            : idx === 1 ? "rgba(156,163,175,0.5)"
                                                : idx === 2 ? "rgba(248,113,113,0.5)"
                                                    : "rgba(244,182,255,0.4)";
                                        const maxCount = stats.userRanking[0]?.count || 1;
                                        const barPct = (u.count / maxCount) * 100;
                                        return (
                                            <div key={u.email}
                                                 className="rounded-xl p-3 transition-all hover:-translate-y-0.5 flex flex-col items-center gap-1.5"
                                                 style={{
                                                     background: rankBg,
                                                     border: `1.5px solid ${rankBorder}`,
                                                     boxShadow: idx < 3 ? "0 6px 16px -8px rgba(245,158,11,0.35)" : "0 4px 12px -8px rgba(131,24,67,0.1)",
                                                 }}>
                                                <div className="relative">
                                                    {u.photo ? (
                                                        /* eslint-disable-next-line @next/next/no-img-element */
                                                        <img src={u.photo} alt="" className="w-12 h-12 rounded-full ring-2 ring-white" />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-white"
                                                             style={{background: "linear-gradient(135deg, #ec4899, #d946ef, #a855f7)"}}>
                                                            {(u.name || "?")[0]}
                                                        </div>
                                                    )}
                                                    <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white"
                                                          style={{
                                                              background: idx < 3
                                                                  ? "linear-gradient(135deg, #fbbf24, #f59e0b)"
                                                                  : "linear-gradient(135deg, #94a3b8, #64748b)",
                                                              border: "2px solid #fff",
                                                          }}>
                                                        {medals[idx] || idx + 1}
                                                    </span>
                                                </div>
                                                <p className="text-xs font-black text-slate-900 text-center truncate w-full mt-1">{u.name}</p>
                                                <p className="text-[10px] font-bold text-slate-500">
                                                    <AnimatedNumber value={u.count} duration={1100 + idx * 120} /> 篇
                                                </p>
                                                <div className="w-full mt-1">
                                                    <AnimatedBar
                                                        widthPct={barPct}
                                                        gradient={idx === 0
                                                            ? "linear-gradient(90deg, #fbbf24, #f59e0b)"
                                                            : "linear-gradient(90deg, #ec4899, #d946ef)"}
                                                        delay={idx * 100}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* === 最近活動時間軸 === */}
                        {stats.recentTimeline.length > 0 && (
                            <div className="rounded-2xl p-5"
                                 style={{
                                     background: "rgba(255,255,255,0.72)",
                                     backdropFilter: "blur(20px) saturate(180%)",
                                     border: "1px solid rgba(255,255,255,0.95)",
                                     boxShadow: "0 12px 28px -12px rgba(131,24,67,0.14), inset 0 1px 0 rgba(255,255,255,0.95)",
                                 }}>
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                                         style={{background: "linear-gradient(135deg, #a855f7, #7c3aed)", color: "#fff"}}>⏱️</div>
                                    <h4 className="text-sm font-black text-slate-900">最近活動</h4>
                                    <span className="ml-auto text-[10px] font-black text-slate-500 uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-50 border border-purple-100">
                                        最新 {stats.recentTimeline.length} 篇
                                    </span>
                                </div>
                                <div className="relative">
                                    {/* 時間軸線 */}
                                    <div className="absolute left-3 top-2 bottom-2 w-px"
                                         style={{background: "linear-gradient(180deg, #ec4899, #d946ef, #a855f7, transparent)"}} />
                                    <div className="space-y-3 pl-9">
                                        {stats.recentTimeline.map((p, idx) => (
                                            <div key={p.id} className="relative flex items-center gap-3 group">
                                                {/* 時間軸節點 */}
                                                <div className="absolute -left-9 w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black"
                                                     style={{
                                                         background: "linear-gradient(135deg, #ec4899, #d946ef)",
                                                         border: "2px solid rgba(255,255,255,0.95)",
                                                         boxShadow: "0 4px 10px -4px rgba(217,70,239,0.5)",
                                                     }}>
                                                    {idx + 1}
                                                </div>
                                                {/* 縮圖 */}
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={p.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover ring-1 ring-fuchsia-200 shrink-0" />
                                                {/* 內容 */}
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-black text-slate-900 truncate group-hover:text-fuchsia-700 transition-colors">
                                                        {p.caption || "（無標題）"}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-bold">{p.authorName}</span>
                                                        <span>·</span>
                                                        <span>{formatTime(p.createdAt)}</span>
                                                        {p.scenario && (
                                                            <>
                                                                <span>·</span>
                                                                <span className="px-1.5 py-0.5 rounded font-bold text-[9px]"
                                                                      style={{background: "rgba(209,250,229,0.85)", color: "#065f46", border: "1px solid rgba(110,231,183,0.5)"}}>
                                                                    #{p.scenario}
                                                                </span>
                                                            </>
                                                        )}
                                                    </p>
                                                </div>
                                                {/* 按讚數小膠囊 */}
                                                {(p.likes || 0) > 0 && (
                                                    <div className="text-[10px] font-black text-rose-600 px-2 py-0.5 rounded-full shrink-0"
                                                         style={{background: "rgba(254,226,226,0.85)", border: "1px solid rgba(251,113,133,0.4)"}}>
                                                        ❤️ {p.likes}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {/* ===== 成果人物誌 ===== */}
                {!loading && stats.userRanking.length > 0 && (
                    <section className="mb-8">
                        <div className="rounded-2xl p-5"
                             style={{
                                 background: "rgba(255,255,255,0.72)",
                                 backdropFilter: "blur(20px) saturate(180%)",
                                 border: "1px solid rgba(255,255,255,0.95)",
                                 boxShadow: "0 12px 28px -12px rgba(131,24,67,0.14), inset 0 1px 0 rgba(255,255,255,0.95)",
                             }}>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                                     style={{background: "linear-gradient(135deg, #ec4899, #a855f7)", color: "#fff"}}>🧑‍💼</div>
                                <h4 className="text-sm font-black text-slate-900">成果人物誌</h4>
                                <span className="ml-auto text-[10px] font-black text-slate-500 uppercase tracking-wider px-2 py-0.5 rounded-full bg-fuchsia-50 border border-fuchsia-100">
                                    {stats.uniqueAuthors} 位成員
                                </span>
                                {filterUser && (
                                    <button
                                        onClick={() => setFilterUser("")}
                                        className="text-[10px] font-black px-2.5 py-1 rounded-full transition-all"
                                        style={{background: "rgba(244,182,255,0.3)", color: "#86198f", border: "1px solid rgba(232,121,249,0.35)"}}>
                                        ✕ 取消篩選
                                    </button>
                                )}
                            </div>

                            {/* 成員頭像列 */}
                            <div className="flex flex-wrap gap-3">
                                {stats.userRanking.map((u) => {
                                    const isActive = filterUser === u.email;
                                    const isTop = u.email === topSharerEmail;
                                    const userPostCount = posts.filter(p => p.authorEmail === u.email).length;
                                    return (
                                        <button
                                            key={u.email}
                                            type="button"
                                            onClick={() => {
                                                setFilterUser(isActive ? "" : u.email);
                                                setFilterMine(false);
                                                setFilterScenario("");
                                            }}
                                            className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all active:scale-95"
                                            style={{
                                                background: isActive
                                                    ? "linear-gradient(135deg, rgba(253,232,255,0.95), rgba(252,231,243,0.95))"
                                                    : "rgba(255,255,255,0.6)",
                                                border: isActive
                                                    ? "1.5px solid rgba(217,70,239,0.5)"
                                                    : "1px solid rgba(226,232,240,0.8)",
                                                boxShadow: isActive
                                                    ? "0 6px 16px -6px rgba(217,70,239,0.35)"
                                                    : "none",
                                                minWidth: "64px",
                                            }}>
                                            {/* 頭像 */}
                                            <div className="relative">
                                                {u.photo ? (
                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                    <img src={u.photo} alt="" className="w-12 h-12 rounded-full"
                                                         style={{
                                                             outline: isActive ? "3px solid #d946ef" : "2px solid #e2e8f0",
                                                             outlineOffset: "1px",
                                                         }} />
                                                ) : (
                                                    <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-white text-lg"
                                                         style={{
                                                             background: isActive
                                                                 ? "linear-gradient(135deg, #ec4899, #d946ef, #a855f7)"
                                                                 : "linear-gradient(135deg, #94a3b8, #64748b)",
                                                             outline: isActive ? "3px solid #d946ef" : "2px solid #e2e8f0",
                                                             outlineOffset: "1px",
                                                         }}>
                                                        {(u.name || "?")[0]}
                                                    </div>
                                                )}
                                                {/* 皇冠 */}
                                                {isTop && (
                                                    <span className="absolute -top-2 -left-1 text-sm"
                                                          style={{filter: "drop-shadow(0 0 4px rgba(252,211,77,0.7))"}}>👑</span>
                                                )}
                                                {/* 貼文數 badge */}
                                                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                                                      style={{
                                                          background: isActive
                                                              ? "linear-gradient(135deg, #ec4899, #d946ef)"
                                                              : "linear-gradient(135deg, #94a3b8, #64748b)",
                                                          border: "2px solid #fff",
                                                      }}>
                                                    {userPostCount}
                                                </span>
                                            </div>
                                            {/* 名稱 */}
                                            <p className="text-[10px] font-black text-center leading-tight max-w-[60px] truncate"
                                               style={{color: isActive ? "#86198f" : "#475569"}}>
                                                {u.name.split(" ")[0]}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* 篩選中提示 */}
                            {filterUser && (() => {
                                const u = stats.userRanking.find(u => u.email === filterUser);
                                if (!u) return null;
                                return (
                                    <div className="mt-4 rounded-xl px-4 py-3 flex items-center gap-3"
                                         style={{
                                             background: "linear-gradient(135deg, rgba(253,232,255,0.7), rgba(252,231,243,0.7))",
                                             border: "1px solid rgba(217,70,239,0.3)",
                                         }}>
                                        <span className="text-lg">🔍</span>
                                        <div>
                                            <p className="text-xs font-black text-slate-900">
                                                目前檢視：{u.name} 的成果
                                            </p>
                                            <p className="text-[11px] text-slate-500 mt-0.5">
                                                共 {filteredPosts.length} 篇 · 點「取消篩選」返回全部
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </section>
                )}

                {/* ===== 上傳表單 ===== */}
                {showUpload && (
                    <div ref={formRef}>
                    <form onSubmit={handleSubmit}
                          className="rounded-3xl p-6 md:p-8 mb-8 space-y-5"
                          style={{
                              background: "rgba(255,255,255,0.78)",
                              backdropFilter: "blur(20px) saturate(180%)",
                              border: "1px solid rgba(255,255,255,0.95)",
                              boxShadow: "0 24px 48px -16px rgba(131,24,67,0.18), inset 0 1px 0 rgba(255,255,255,0.95)",
                          }}>
                        <div className="flex items-center gap-3 pb-2 mb-2 border-b border-fuchsia-100/60">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg shrink-0"
                                 style={{
                                     background: "linear-gradient(135deg, #ec4899 0%, #d946ef 100%)",
                                     boxShadow: "0 10px 22px -8px rgba(217,70,239,0.55), inset 0 1px 0 rgba(255,255,255,0.3)",
                                 }}>📝</div>
                            <div>
                                <h3 className="text-base md:text-lg font-black text-slate-900">發表新成果</h3>
                                <p className="text-[12px] text-slate-500">分享一個你最近用 AI 完成的小成就</p>
                            </div>
                        </div>

                        {/* 圖片（最多3張，自動壓縮） */}
                        <Field label="封面圖（最多 3 張，自動壓縮畫質）" required>
                            <div className="grid grid-cols-3 gap-2">
                                {[0, 1, 2].map((idx) => (
                                    <div key={idx} className="relative">
                                        <input
                                            ref={(el) => { fileInputRefs.current[idx] = el; }}
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => handleFileChange(e, idx)}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        {previewUrls[idx] ? (
                                            <div className="relative group">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={previewUrls[idx]} alt={`預覽 ${idx + 1}`}
                                                     className="w-full h-28 object-cover rounded-xl border-2 border-fuchsia-200" />
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                                                    className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-black z-20"
                                                    style={{background: "rgba(0,0,0,0.55)"}}>✕</button>
                                                {idx === 0 && (
                                                    <span className="absolute bottom-1 left-1 text-[9px] font-black px-1.5 py-0.5 rounded text-white"
                                                          style={{background: "linear-gradient(135deg,#ec4899,#d946ef)"}}>主圖</span>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="w-full h-28 rounded-xl border-2 border-dashed border-fuchsia-200 flex flex-col items-center justify-center gap-1 transition-all hover:border-fuchsia-400 hover:bg-fuchsia-50/40"
                                                 style={{background: "rgba(255,255,255,0.5)"}}>
                                                <span className="text-xl">{idx === 0 ? "📷" : "+"}</span>
                                                <span className="text-[10px] font-bold text-slate-400">
                                                    {idx === 0 ? "主圖（必填）" : `第 ${idx + 1} 張（選填）`}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1.5">每張最大 10 MB · JPG / PNG / WEBP · 上傳時自動壓縮畫質</p>
                        </Field>

                        {/* 標題 */}
                        <Field label="成果標題" required>
                            <input
                                type="text"
                                value={caption}
                                onChange={(e) => setCaption(e.target.value)}
                                placeholder="例如：用 n8n 自動整理每週信件摘要"
                                className="w-full px-4 py-2.5 bg-white/80 border border-fuchsia-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-fuchsia-400 focus:bg-white transition-all text-sm"
                            />
                        </Field>

                        {/* 工具標籤（多選，依類別分組） */}
                        <Field label="使用的 AI 工具（可複選）" required>
                            <div className="space-y-3">
                                {AI_TOOL_GROUPS.map((grp) => (
                                    <div key={grp.group}>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{grp.group}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {grp.tools.map((t) => {
                                                const active = tools.includes(t);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={t}
                                                        onClick={() => toggleTool(t)}
                                                        className="text-xs font-bold px-3 py-1.5 rounded-full transition-all"
                                                        style={{
                                                            background: active
                                                                ? "linear-gradient(135deg, #ec4899, #d946ef)"
                                                                : "rgba(255,255,255,0.85)",
                                                            color: active ? "#fff" : "#475569",
                                                            border: active ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(244,182,255,0.4)",
                                                            boxShadow: active ? "0 6px 14px -6px rgba(217,70,239,0.55)" : "none",
                                                        }}
                                                    >
                                                        {t}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {tools.includes("其他") && (
                                <div className="mt-3 rounded-xl p-3"
                                     style={{
                                         background: "linear-gradient(135deg, rgba(253,232,255,0.7), rgba(252,231,243,0.7))",
                                         border: "1px solid rgba(232,121,249,0.35)",
                                     }}>
                                    <label className="text-xs font-black text-fuchsia-700 uppercase tracking-wider block mb-1.5">
                                        請填寫工具名稱（多個請用逗號分隔）
                                    </label>
                                    <input
                                        type="text"
                                        value={customTools}
                                        onChange={(e) => setCustomTools(e.target.value)}
                                        placeholder="例如：Perplexity, Notion AI, Suno"
                                        className="w-full px-3 py-2 text-sm bg-white border border-fuchsia-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-400 transition-all"
                                    />
                                    <p className="text-[11px] text-slate-600 mt-1.5">
                                        填寫的工具名會顯示為標籤，方便其他人搜尋
                                    </p>
                                </div>
                            )}
                        </Field>

                        {/* 應用場景（單選） */}
                        <Field label="應用場景" required>
                            <div className="flex flex-wrap gap-2">
                                {SCENARIOS.map((s) => {
                                    const active = scenario === s;
                                    return (
                                        <button
                                            type="button"
                                            key={s}
                                            onClick={() => setScenario(s)}
                                            className="text-xs font-bold px-3 py-1.5 rounded-full transition-all"
                                            style={{
                                                background: active
                                                    ? "linear-gradient(135deg, #10b981, #0d9488)"
                                                    : "rgba(255,255,255,0.85)",
                                                color: active ? "#fff" : "#475569",
                                                border: active ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(167,243,208,0.45)",
                                                boxShadow: active ? "0 6px 14px -6px rgba(13,148,136,0.55)" : "none",
                                            }}
                                        >
                                            {s}
                                        </button>
                                    );
                                })}
                            </div>
                            {scenario === "其他" && (
                                <div className="mt-3 rounded-xl p-3"
                                     style={{
                                         background: "linear-gradient(135deg, rgba(236,253,245,0.7), rgba(204,251,241,0.7))",
                                         border: "1px solid rgba(110,231,183,0.4)",
                                     }}>
                                    <label className="text-xs font-black text-emerald-700 uppercase tracking-wider block mb-1.5">
                                        請填寫自訂場景名稱
                                    </label>
                                    <input
                                        type="text"
                                        value={customScenario}
                                        onChange={(e) => setCustomScenario(e.target.value)}
                                        placeholder="例如：財務報表自動化、社群媒體排程..."
                                        className="w-full px-3 py-2 text-sm bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all"
                                    />
                                </div>
                            )}
                        </Field>

                        {/* 應用難度 */}
                        <Field label="應用難度（選填）">
                            <div className="flex flex-wrap gap-2">
                                {DIFFICULTY_LEVELS.map((d) => {
                                    const active = difficulty === d.value;
                                    return (
                                        <button
                                            type="button"
                                            key={d.value}
                                            onClick={() => setDifficulty(active ? "" : d.value)}
                                            className="flex items-center gap-2 text-xs font-bold px-3.5 py-2 rounded-xl transition-all text-left"
                                            style={{
                                                background: active
                                                    ? "linear-gradient(135deg, #10b981, #0d9488)"
                                                    : "rgba(255,255,255,0.85)",
                                                color: active ? "#fff" : "#475569",
                                                border: active ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(167,243,208,0.45)",
                                                boxShadow: active ? "0 6px 14px -6px rgba(13,148,136,0.55)" : "none",
                                            }}
                                        >
                                            <span className="text-base leading-none">{d.emoji}</span>
                                            <div>
                                                <div className="font-black">{d.value}</div>
                                                <div className="text-[10px] opacity-70 font-normal">{d.desc}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </Field>

                        {/* ===== 結構化成果說明 ===== */}
                        <div className="rounded-2xl p-4 space-y-4"
                             style={{
                                 background: "linear-gradient(135deg, rgba(238,242,255,0.6), rgba(253,232,255,0.5))",
                                 border: "1.5px solid rgba(165,180,252,0.4)",
                             }}>
                            <p className="text-xs font-black uppercase tracking-widest flex items-center gap-1.5"
                               style={{color: "#4338ca"}}>
                                <span>📋</span> 成果說明
                            </p>

                            {/* ① 問題陳述與背景 */}
                            <Field label="① 問題陳述與背景">
                                <p className="text-[11px] text-slate-500 mb-2">描述導入前的作業痛點或待解決的核心問題</p>
                                <textarea
                                    value={problem}
                                    onChange={(e) => setProblem(e.target.value)}
                                    placeholder="例如：每週需手動整理 50 封客戶信件，耗時約 3 小時，容易遺漏重要資訊..."
                                    rows={3}
                                    className="w-full px-4 py-2.5 bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all text-sm"
                                />
                            </Field>

                            {/* ② 工具 / 工作流說明 */}
                            <Field label="② 工具 / 工作流說明">
                                <p className="text-[11px] text-slate-500 mb-2">說明工具運作方式、操作流程與應用情境，可附 Prompt</p>
                                <textarea
                                    value={workflow}
                                    onChange={(e) => setWorkflow(e.target.value)}
                                    placeholder={"例如：\n【流程】Gmail 觸發 → n8n 抓取 → GPT 分類摘要 → Notion 資料庫\n【Prompt】請將以下信件分類為「待辦/資訊/廣告」並提取關鍵行動項目..."}
                                    rows={5}
                                    className="w-full px-4 py-2.5 bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all font-mono text-sm"
                                />
                            </Field>

                            {/* ③ 執行成效 */}
                            <Field label="③ 執行成效">
                                <p className="text-[11px] text-slate-500 mb-2">以量化指標呈現，如節省時間、效率提升比例、錯誤率降低等</p>
                                <textarea
                                    value={impact}
                                    onChange={(e) => setImpact(e.target.value)}
                                    placeholder="例如：每週節省 5 小時手動作業，處理速度提升 3 倍，漏信率從 20% 降至 0%"
                                    rows={3}
                                    className="w-full px-4 py-2.5 bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all text-sm"
                                />
                            </Field>

                            {/* ④ 後續推展計畫 */}
                            <Field label="④ 後續推展計畫">
                                <p className="text-[11px] text-slate-500 mb-2">說明後續推廣對象、業務範圍或與既有流程的整合計畫</p>
                                <textarea
                                    value={futurePlan}
                                    onChange={(e) => setFuturePlan(e.target.value)}
                                    placeholder="例如：計劃推廣至客服部門 10 位同仁，並整合進每月報表產出流程..."
                                    rows={3}
                                    className="w-full px-4 py-2.5 bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all text-sm"
                                />
                            </Field>
                        </div>

                        {/* ===== 資源分享 ===== */}
                        <div className="rounded-2xl p-4 space-y-4"
                             style={{
                                 background: "linear-gradient(135deg, rgba(253,232,255,0.5), rgba(252,231,243,0.5))",
                                 border: "1.5px dashed rgba(217,70,239,0.35)",
                             }}>
                            <p className="text-xs font-black uppercase tracking-widest flex items-center gap-1.5"
                               style={{color: "#9d174d"}}>
                                <span>📦</span> 資源分享（選填）
                            </p>

                            <Field label="分享 URL（n8n.cloud / GitHub 連結等）">
                                <input
                                    type="url"
                                    value={resourceUrl}
                                    onChange={(e) => setResourceUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="w-full px-4 py-2.5 bg-white border border-fuchsia-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-fuchsia-400 transition-all text-sm"
                                />
                            </Field>

                            <Field label="上傳專案檔案（500 KB 內）">
                                <p className="text-xs text-slate-600 mb-2 leading-relaxed">
                                    接受：<b>.json</b>（n8n / Make / Zapier workflow）、<b>.md</b>（系統提示、文件）、<b>.txt</b>（prompt）、<b>.yaml / .yml</b>（設定檔）
                                </p>
                                <div className="rounded-xl p-3 mb-2 text-xs flex items-start gap-2"
                                     style={{
                                         background: "linear-gradient(135deg, rgba(254,243,199,0.85), rgba(254,215,170,0.7))",
                                         border: "1px solid rgba(251,191,36,0.4)",
                                         color: "#92400e",
                                     }}>
                                    <span className="text-base leading-none shrink-0">⚠️</span>
                                    <span>
                                        <b>上傳前請確認：</b><br/>
                                        1. 移除所有 API Key、Webhook URL、密碼、Token 等私密資訊<br/>
                                        2. <b>檔案可以讓人直接匯入工具實際試跑</b>，而非截圖或說明文件
                                    </span>
                                </div>
                                <div className="relative group">
                                    <input
                                        ref={jsonInputRef}
                                        type="file"
                                        accept=".json,.md,.txt,.yaml,.yml,application/json,text/markdown,text/plain,text/yaml,application/x-yaml"
                                        onChange={handleJsonChange}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className={`w-full px-4 py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm transition-all border-2 border-dashed ${resourceJsonName ? "border-fuchsia-400 bg-fuchsia-50/70" : "border-fuchsia-200 bg-white group-hover:border-fuchsia-400 group-hover:bg-fuchsia-50/40"}`}>
                                        <span>{resourceJsonName ? "📎" : "📄"}</span>
                                        <span className={`font-bold ${resourceJsonName ? "text-fuchsia-700" : "text-slate-500"}`}>
                                            {resourceJsonName || "點擊選擇檔案（.json / .md / .txt / .yaml / .yml）"}
                                        </span>
                                    </div>
                                </div>
                            </Field>

                            <Field label="雲端硬碟補充連結（選填）">
                                <p className="text-[11px] text-slate-500 mb-1.5">
                                    檔案超過 500 KB？貼上 Google Drive / Dropbox / OneDrive 連結，<b>請確認他人可直接開啟並下載試用</b>
                                </p>
                                <input
                                    type="url"
                                    value={driveUrl}
                                    onChange={(e) => setDriveUrl(e.target.value)}
                                    placeholder="https://drive.google.com/..."
                                    className="w-full px-4 py-2.5 bg-white border border-fuchsia-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-fuchsia-400 transition-all text-sm"
                                />
                            </Field>
                        </div>

                        {/* 操作按鈕 */}
                        <div className="flex gap-2 justify-end pt-3 border-t border-fuchsia-100/60">
                            <button
                                type="button"
                                onClick={() => { resetForm(); setShowUpload(false); }}
                                className="px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 rounded-xl transition-all"
                            >
                                取消
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-6 py-2.5 text-white rounded-xl font-black text-sm transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                                style={{
                                    background: submitting
                                        ? "linear-gradient(135deg, #94a3b8, #64748b)"
                                        : "linear-gradient(135deg, #ec4899 0%, #d946ef 50%, #a855f7 100%)",
                                    boxShadow: submitting ? "none" : "0 12px 26px -8px rgba(217,70,239,0.55), inset 0 1px 0 rgba(255,255,255,0.25)",
                                }}
                            >
                                {submitting ? (<><span className="animate-spin">↻</span>{submitStage || "處理中..."}</>) : (<><span>✨</span>發布</>)}
                            </button>
                        </div>
                    </form>
                    </div>
                )}

                {/* ===== 篩選列 ===== */}
                {!loading && posts.length > 0 && (
                    <div className="mb-6 space-y-3">
                        {/* 我的發布成果 */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => { setFilterMine((v) => !v); setFilterScenario(""); }}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-black transition-all"
                                style={{
                                    background: filterMine
                                        ? "linear-gradient(135deg, #7c3aed, #a855f7)"
                                        : "rgba(255,255,255,0.85)",
                                    color: filterMine ? "#fff" : "#475569",
                                    border: filterMine ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(196,181,253,0.5)",
                                    boxShadow: filterMine ? "0 8px 20px -6px rgba(124,58,237,0.5)" : "none",
                                }}
                            >
                                <span className="text-base leading-none">👤</span>
                                <span>我的發布成果</span>
                                {filterMine && (
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                                          style={{background: "rgba(255,255,255,0.25)"}}>
                                        {filteredPosts.length} 篇
                                    </span>
                                )}
                            </button>
                            {(filterMine || filterScenario || filterUser) && (
                                <button
                                    onClick={() => { setFilterMine(false); setFilterScenario(""); setFilterUser(""); }}
                                    className="text-[10px] font-black px-2.5 py-1 rounded-full transition-all"
                                    style={{background: "rgba(244,182,255,0.3)", color: "#86198f", border: "1px solid rgba(232,121,249,0.35)"}}>
                                    ✕ 清除篩選
                                </button>
                            )}
                        </div>

                        {/* 場景篩選 */}
                        {!filterMine && (
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">🔍 依場景篩選</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {stats.scenarioRanking.map(([sc, cnt]) => {
                                        const active = filterScenario === sc;
                                        return (
                                            <button
                                                key={sc}
                                                onClick={() => setFilterScenario(active ? "" : sc)}
                                                className="text-[11px] font-black px-3 py-1.5 rounded-full transition-all inline-flex items-center gap-1.5"
                                                style={{
                                                    background: active
                                                        ? "linear-gradient(135deg, #ec4899, #d946ef)"
                                                        : "rgba(255,255,255,0.82)",
                                                    color: active ? "#fff" : "#64748b",
                                                    border: active ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(244,182,255,0.4)",
                                                    boxShadow: active ? "0 6px 14px -6px rgba(217,70,239,0.55)" : "none",
                                                }}
                                            >
                                                <span>{sc}</span>
                                                <span className="text-[9px] font-black opacity-70">({cnt})</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ===== 貼文列表 ===== */}
                {loading ? (
                    <div className="text-center text-slate-500 py-16">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full"
                             style={{background: "rgba(255,255,255,0.7)", border: "1px solid rgba(244,182,255,0.4)"}}>
                            <span className="animate-spin">↻</span>
                            <span className="font-bold text-sm">載入中...</span>
                        </div>
                    </div>
                ) : posts.length === 0 ? (
                    <div className="text-center py-16 rounded-3xl"
                         style={{
                             background: "rgba(255,255,255,0.72)",
                             backdropFilter: "blur(20px)",
                             border: "1px solid rgba(255,255,255,0.95)",
                             boxShadow: "0 12px 32px -12px rgba(131,24,67,0.14)",
                         }}>
                        <p className="text-5xl mb-3">📭</p>
                        <p className="font-black text-slate-800">還沒有任何成果分享</p>
                        <p className="text-sm text-slate-500 mt-1">成為第一個分享的人吧！</p>
                    </div>
                ) : filteredPosts.length === 0 ? (
                    <div className="text-center py-12 rounded-3xl"
                         style={{
                             background: "rgba(255,255,255,0.72)",
                             backdropFilter: "blur(20px)",
                             border: "1px solid rgba(255,255,255,0.95)",
                         }}>
                        {filterMine ? (
                            <>
                                <p className="text-4xl mb-3">✨</p>
                                <p className="font-black text-slate-800">你還沒有發布任何成果</p>
                                <p className="text-sm text-slate-500 mt-1 mb-4">快來分享第一篇，讓同事看看你的 AI 應用！</p>
                                <button
                                    onClick={() => { setShowUpload(true); window.scrollTo({top: 0, behavior: "smooth"}); }}
                                    className="px-5 py-2.5 text-white rounded-xl font-black text-sm"
                                    style={{background: "linear-gradient(135deg, #ec4899, #d946ef)", boxShadow: "0 8px 20px -6px rgba(217,70,239,0.5)"}}>
                                    ✨ 立即發表
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-3xl mb-2">🔍</p>
                                <p className="font-black text-slate-700">沒有符合「{filterScenario}」的成果</p>
                                <button onClick={() => setFilterScenario("")} className="mt-3 text-xs font-black text-fuchsia-600 underline">清除篩選</button>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {filteredPosts.map((post) => {
                            const isMine = post.authorEmail === user?.email;
                            const liked = !!user?.email && post.likedBy?.includes(user.email);
                            const comments = commentsByPost[post.id] || [];
                            const hasDetail = !!(post.problem || post.workflow || post.keyLogic || post.promptText || post.resourceUrl || post.resourceJson || post.futurePlan);
                            const detailOpen = !!openDetails[post.id];
                            const isTopSharer = post.authorEmail === topSharerEmail;
                            const postImages = (post.imageUrls?.length ? post.imageUrls : [post.imageUrl]).filter(Boolean);
                            const currentImgIdx = selectedImg[post.id] ?? 0;

                            return (
                                <article key={post.id}
                                         className="rounded-3xl overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
                                         style={{
                                             background: "rgba(255,255,255,0.82)",
                                             backdropFilter: "blur(20px) saturate(180%)",
                                             border: isTopSharer ? "1.5px solid rgba(252,211,77,0.45)" : "1px solid rgba(255,255,255,0.95)",
                                             boxShadow: "0 16px 36px -14px rgba(131,24,67,0.15), inset 0 1px 0 rgba(255,255,255,0.95)",
                                         }}>
                                    {/* === 圖片區（支援多張切換）=== */}
                                    <div className="relative overflow-hidden">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={postImages[currentImgIdx] || postImages[0]} alt={post.caption} className="w-full"
                                             style={{background: "linear-gradient(135deg, #fdf2f8, #fae8ff)"}} />
                                        {/* 多圖切換：左右箭頭 + 圓點 */}
                                        {postImages.length > 1 && (
                                            <>
                                                {/* 左箭頭 */}
                                                {currentImgIdx > 0 && (
                                                    <button type="button"
                                                            onClick={() => setSelectedImg(p => ({...p, [post.id]: currentImgIdx - 1}))}
                                                            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center font-black text-sm transition-all active:scale-90"
                                                            style={{background: "rgba(255,255,255,0.88)", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", color: "#374151"}}>
                                                        ‹
                                                    </button>
                                                )}
                                                {/* 右箭頭 */}
                                                {currentImgIdx < postImages.length - 1 && (
                                                    <button type="button"
                                                            onClick={() => setSelectedImg(p => ({...p, [post.id]: currentImgIdx + 1}))}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center font-black text-sm transition-all active:scale-90"
                                                            style={{background: "rgba(255,255,255,0.88)", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", color: "#374151"}}>
                                                        ›
                                                    </button>
                                                )}
                                                {/* 圓點指示器 */}
                                                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5">
                                                    {postImages.map((_, i) => (
                                                        <button key={i} type="button"
                                                                onClick={() => setSelectedImg(p => ({...p, [post.id]: i}))}
                                                                className="rounded-full transition-all"
                                                                style={{
                                                                    width: i === currentImgIdx ? "16px" : "6px",
                                                                    height: "6px",
                                                                    background: i === currentImgIdx ? "#fff" : "rgba(255,255,255,0.5)",
                                                                }} />
                                                    ))}
                                                </div>
                                                {/* 張數標示 */}
                                                <div className="absolute top-2.5 right-2.5 text-[10px] font-black px-2 py-0.5 rounded-full"
                                                     style={{background: "rgba(0,0,0,0.45)", color: "#fff"}}>
                                                    {currentImgIdx + 1} / {postImages.length}
                                                </div>
                                            </>
                                        )}

                                        {/* 漸層遮罩，讓徽章看起來更立體 */}
                                        <div className="absolute inset-x-0 top-0 h-20 pointer-events-none"
                                             style={{background: "linear-gradient(180deg, rgba(0,0,0,0.25), transparent)"}} />

                                        {/* 左上：作者徽章 + 成效 chip 水平並排 */}
                                        <div className="absolute top-3 left-3 right-14 flex items-start gap-2 flex-wrap">
                                            {/* 作者徽章 */}
                                            <div className="flex items-center gap-2 px-2 py-1.5 rounded-full"
                                                 style={{
                                                     background: "rgba(255,255,255,0.85)",
                                                     backdropFilter: "blur(12px)",
                                                     border: isTopSharer ? "1.5px solid rgba(252,211,77,0.65)" : "1px solid rgba(255,255,255,0.95)",
                                                     boxShadow: "0 4px 12px -4px rgba(131,24,67,0.25)",
                                                 }}>
                                                <div className="relative shrink-0">
                                                    {post.authorPhoto ? (
                                                        /* eslint-disable-next-line @next/next/no-img-element */
                                                        <img src={post.authorPhoto} alt="" className="w-6 h-6 rounded-full" />
                                                    ) : (
                                                        <div className="w-6 h-6 rounded-full flex items-center justify-center font-black text-white text-[10px]"
                                                             style={{background: "linear-gradient(135deg, #ec4899, #d946ef, #a855f7)"}}>
                                                            {(post.authorName || "?")[0]}
                                                        </div>
                                                    )}
                                                    {isTopSharer && (
                                                        <span className="absolute -top-1.5 -right-1.5 text-[10px] leading-none"
                                                              style={{filter: "drop-shadow(0 0 3px rgba(252,211,77,0.8))"}}>👑</span>
                                                    )}
                                                </div>
                                                <span className="text-[11px] font-black text-slate-900 max-w-[120px] truncate">{post.authorName}</span>
                                                <span className="text-[10px] text-slate-500 font-bold">· {formatTime(post.createdAt)}</span>
                                            </div>

                                            {/* 成效膠囊（跟作者徽章並排） */}
                                            {post.impact && (
                                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full max-w-full"
                                                     title={post.impact}
                                                     style={{
                                                         background: "linear-gradient(135deg, rgba(254,243,199,0.96), rgba(254,215,170,0.96))",
                                                         border: "1.5px solid rgba(251,191,36,0.7)",
                                                         color: "#92400e",
                                                         backdropFilter: "blur(10px)",
                                                         boxShadow: "0 6px 16px -6px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.5)",
                                                     }}>
                                                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0"
                                                          style={{
                                                              background: "linear-gradient(135deg, #f59e0b, #ea580c)",
                                                              color: "#fff",
                                                              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
                                                          }}>⚡</span>
                                                    <span className="text-[10px] font-black uppercase tracking-widest shrink-0" style={{color: "#b45309"}}>成效</span>
                                                    <span className="text-[11px] font-black truncate">{post.impact}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* 右上：編輯 + 刪除按鈕（只有自己的貼文才有） */}
                                        {isMine && (
                                            <div className="absolute top-3 right-3 flex gap-1.5">
                                                <button
                                                    onClick={() => openEdit(post)}
                                                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-all"
                                                    style={{
                                                        background: "rgba(255,255,255,0.85)",
                                                        backdropFilter: "blur(12px)",
                                                        border: "1px solid rgba(255,255,255,0.95)",
                                                        color: "#7c3aed",
                                                        boxShadow: "0 4px 12px -4px rgba(131,24,67,0.25)",
                                                    }}
                                                    title="編輯"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(post)}
                                                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-all"
                                                    style={{
                                                        background: "rgba(255,255,255,0.85)",
                                                        backdropFilter: "blur(12px)",
                                                        border: "1px solid rgba(255,255,255,0.95)",
                                                        color: "#64748b",
                                                        boxShadow: "0 4px 12px -4px rgba(131,24,67,0.25)",
                                                    }}
                                                    title="刪除"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* === 標題區 === */}
                                    {post.caption && (
                                        <div className="px-5 pt-4">
                                            <h3 className="text-lg md:text-xl font-black text-slate-900 leading-snug">{post.caption}</h3>
                                            {post.updatedAt && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 mt-1">
                                                    <span>✏️</span> 已編輯 · {formatTime(post.updatedAt)}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* === 標籤雲（場景 + 工具 + 難度） === */}
                                    {(post.scenario || (post.tools?.length || 0) > 0 || post.difficulty) && (
                                        <div className="px-5 pt-3 flex flex-wrap items-center gap-1.5">
                                            {post.scenario && (
                                                <span className="text-[11px] font-black px-2.5 py-1 rounded-full inline-flex items-center gap-1"
                                                      style={{
                                                          background: "linear-gradient(135deg, rgba(209,250,229,0.95), rgba(204,251,241,0.95))",
                                                          color: "#065f46",
                                                          border: "1px solid rgba(110,231,183,0.55)",
                                                      }}>
                                                    <span>📂</span>{post.scenario}
                                                </span>
                                            )}
                                            {post.difficulty && (() => {
                                                const d = DIFFICULTY_LEVELS.find(d => d.value === post.difficulty);
                                                return (
                                                    <span className="text-[11px] font-black px-2.5 py-1 rounded-full inline-flex items-center gap-1"
                                                          style={{
                                                              background: "linear-gradient(135deg, rgba(209,250,229,0.95), rgba(204,251,241,0.95))",
                                                              color: "#065f46",
                                                              border: "1px solid rgba(110,231,183,0.55)",
                                                          }}>
                                                        <span>{d?.emoji || "📊"}</span>{post.difficulty}
                                                    </span>
                                                );
                                            })()}
                                            {post.tools?.slice(0, 5).map((t) => (
                                                <span key={t} className="text-[11px] font-black px-2.5 py-1 rounded-full"
                                                      style={{
                                                          background: "linear-gradient(135deg, rgba(253,232,255,0.95), rgba(252,231,243,0.95))",
                                                          color: "#86198f",
                                                          border: "1px solid rgba(232,121,249,0.45)",
                                                      }}>
                                                    {t}
                                                </span>
                                            ))}
                                            {(post.tools?.length || 0) > 5 && (
                                                <span className="text-[10px] font-black text-slate-500 px-2 py-1">
                                                    +{(post.tools?.length || 0) - 5} 個工具
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* === 結構化摘要（4大欄位預覽）=== */}
                                    {(post.problem || post.workflow || post.keyLogic || post.promptText || post.impact || post.futurePlan) && (
                                        <div className="px-5 pt-3 space-y-2">
                                            {[
                                                { icon: "🎯", label: "問題陳述", content: post.problem, color: "#4338ca" },
                                                { icon: "⚙️", label: "工具 / 工作流", content: post.workflow || [post.keyLogic, post.promptText].filter(Boolean).join("  "), color: "#0d9488" },
                                                { icon: "📈", label: "執行成效", content: post.impact, color: "#9d174d" },
                                                { icon: "🚀", label: "後續推展", content: post.futurePlan, color: "#b45309" },
                                            ].filter((s) => s.content?.trim()).map((section) => (
                                                <div key={section.label} className="rounded-xl px-3 py-2.5"
                                                     style={{background: "rgba(255,255,255,0.7)", border: "1px solid rgba(226,232,240,0.8)"}}>
                                                    <p className="text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-1"
                                                       style={{color: section.color}}>
                                                        <span>{section.icon}</span>{section.label}
                                                    </p>
                                                    <p className="text-xs text-slate-700 leading-relaxed line-clamp-2">
                                                        {section.content}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* === Mini Stats Bar：互動數字一覽 === */}
                                    <div className="px-5 pt-3 flex items-center gap-3 text-[11px] font-bold text-slate-500">
                                        <span className="inline-flex items-center gap-1">
                                            <span>❤️</span>
                                            <span className="text-slate-700 font-black">{post.likes || 0}</span>
                                            <span className="text-slate-400">愛心</span>
                                        </span>
                                        <span className="text-slate-300">·</span>
                                        <span className="inline-flex items-center gap-1">
                                            <span>💬</span>
                                            <span className="text-slate-700 font-black">{comments.length}</span>
                                            <span className="text-slate-400">留言</span>
                                        </span>
                                        {hasDetail && (
                                            <>
                                                <span className="text-slate-300">·</span>
                                                <span className="inline-flex items-center gap-1 text-fuchsia-600">
                                                    <span>📦</span>
                                                    <span className="font-black">含實作</span>
                                                </span>
                                            </>
                                        )}
                                    </div>

                                    {/* === 互動按鈕列 === */}
                                    <div className="px-5 mt-3 pb-3 flex items-center gap-2 flex-wrap">
                                        <button
                                            onClick={() => toggleLike(post)}
                                            className="flex items-center gap-1.5 text-sm font-black transition-all px-3.5 py-2 rounded-xl active:scale-[0.97]"
                                            style={{
                                                background: liked
                                                    ? "linear-gradient(135deg, #fb7185, #ec4899)"
                                                    : "rgba(255,255,255,0.7)",
                                                color: liked ? "#fff" : "#64748b",
                                                border: liked ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(244,182,255,0.4)",
                                                boxShadow: liked ? "0 8px 18px -6px rgba(244,63,94,0.5)" : "none",
                                            }}
                                        >
                                            <span className="text-base">{liked ? "❤️" : "🤍"}</span>
                                            <span>{liked ? "已愛心" : "給愛心"}</span>
                                        </button>
                                        <button
                                            onClick={() => toggleComments(post.id)}
                                            className="flex items-center gap-1.5 text-sm font-black transition-all px-3.5 py-2 rounded-xl active:scale-[0.97]"
                                            style={{
                                                background: openComments[post.id]
                                                    ? "linear-gradient(135deg, #a855f7, #7c3aed)"
                                                    : "rgba(255,255,255,0.7)",
                                                color: openComments[post.id] ? "#fff" : "#64748b",
                                                border: openComments[post.id] ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(244,182,255,0.4)",
                                                boxShadow: openComments[post.id] ? "0 8px 18px -6px rgba(168,85,247,0.5)" : "none",
                                            }}
                                        >
                                            <span className="text-base">💬</span>
                                            <span>{openComments[post.id] ? "收起留言" : "留言"}</span>
                                        </button>
                                        {hasDetail && (
                                            <button
                                                onClick={() => setOpenDetails((p) => ({ ...p, [post.id]: !detailOpen }))}
                                                className="ml-auto flex items-center gap-1.5 text-xs font-black py-2 px-3.5 rounded-xl transition-all active:scale-[0.97]"
                                                style={{
                                                    background: detailOpen
                                                        ? "linear-gradient(135deg, #ec4899, #d946ef)"
                                                        : "rgba(253,232,255,0.85)",
                                                    color: detailOpen ? "#fff" : "#86198f",
                                                    border: detailOpen ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(232,121,249,0.45)",
                                                    boxShadow: detailOpen ? "0 8px 18px -6px rgba(217,70,239,0.5)" : "none",
                                                }}
                                            >
                                                <span>{detailOpen ? "▲" : "▼"}</span>
                                                {detailOpen ? "收起詳情" : "查看實作"}
                                            </button>
                                        )}
                                    </div>

                                    {/* ===== 詳情展開區 ===== */}
                                    {detailOpen && hasDetail && (() => {
                                        const legacyWorkflow = [post.keyLogic, post.promptText].filter(Boolean).join("\n\n");
                                        const displayWorkflow = post.workflow || legacyWorkflow;
                                        return (
                                        <div className="px-5 py-5 space-y-4"
                                             style={{
                                                 background: "linear-gradient(135deg, rgba(238,242,255,0.4), rgba(253,232,255,0.4))",
                                                 borderTop: "1px solid rgba(165,180,252,0.3)",
                                             }}>
                                            {/* ① 問題背景 */}
                                            {post.problem && (
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5"
                                                       style={{color: "#4338ca"}}>
                                                        <span className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[11px]"
                                                              style={{background: "linear-gradient(135deg, #6366f1, #8b5cf6)"}}>🎯</span>
                                                        ① 問題陳述與背景
                                                    </p>
                                                    <pre className="text-xs text-slate-800 rounded-xl p-3.5 whitespace-pre-wrap font-sans leading-relaxed"
                                                         style={{background: "rgba(255,255,255,0.9)", border: "1px solid rgba(165,180,252,0.3)"}}>
{post.problem}
                                                    </pre>
                                                </div>
                                            )}

                                            {/* ② 工具/流程介紹（含舊 keyLogic + promptText） */}
                                            {displayWorkflow && (
                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
                                                           style={{color: "#0d9488"}}>
                                                            <span className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[11px]"
                                                                  style={{background: "linear-gradient(135deg, #0d9488, #0891b2)"}}>⚙️</span>
                                                            ② 工具 / 工作流說明
                                                        </p>
                                                        <button
                                                            onClick={() => { navigator.clipboard.writeText(displayWorkflow); showToast("success", "已複製"); }}
                                                            className="text-[11px] font-black py-1 px-2.5 rounded-lg transition-all"
                                                            style={{background: "rgba(255,255,255,0.95)", color: "#0d9488", border: "1px solid rgba(110,231,183,0.5)"}}>
                                                            📋 一鍵複製
                                                        </button>
                                                    </div>
                                                    <pre className="text-xs text-slate-800 rounded-xl p-3.5 whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-auto"
                                                         style={{background: "rgba(255,255,255,0.9)", border: "1px solid rgba(110,231,183,0.3)"}}>
{displayWorkflow}
                                                    </pre>
                                                </div>
                                            )}

                                            {/* ④ 後續應用規劃 */}
                                            {post.futurePlan && (
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5"
                                                       style={{color: "#b45309"}}>
                                                        <span className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[11px]"
                                                              style={{background: "linear-gradient(135deg, #f59e0b, #ef4444)"}}>🚀</span>
                                                        ④ 後續推展計畫
                                                    </p>
                                                    <pre className="text-xs text-slate-800 rounded-xl p-3.5 whitespace-pre-wrap font-sans leading-relaxed"
                                                         style={{background: "rgba(255,255,255,0.9)", border: "1px solid rgba(251,191,36,0.3)"}}>
{post.futurePlan}
                                                    </pre>
                                                </div>
                                            )}

                                            {/* 資源連結 */}
                                            {(post.resourceUrl || post.resourceJson || post.driveUrl) && (
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5"
                                                       style={{color: "#86198f"}}>
                                                        <span className="w-5 h-5 rounded-md flex items-center justify-center text-white"
                                                              style={{background: "linear-gradient(135deg, #a855f7, #7c3aed)"}}>📦</span>
                                                        資源下載
                                                    </p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {post.resourceUrl && (
                                                            <a href={post.resourceUrl} target="_blank" rel="noopener noreferrer"
                                                               className="text-xs font-black py-2 px-3 rounded-xl flex items-center gap-1.5"
                                                               style={{background: "rgba(255,255,255,0.95)", color: "#86198f", border: "1px solid rgba(232,121,249,0.45)"}}>
                                                                🔗 開啟連結
                                                            </a>
                                                        )}
                                                        {post.resourceJson && (
                                                            <button onClick={() => downloadJson(post.resourceJson, post.resourceJsonName)}
                                                                    className="text-xs font-black py-2 px-3 rounded-xl flex items-center gap-1.5"
                                                                    style={{background: "linear-gradient(135deg, #ec4899, #d946ef)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", boxShadow: "0 6px 14px -6px rgba(217,70,239,0.5)"}}>
                                                                ⬇️ 下載 {post.resourceJsonName || "resource.txt"}
                                                            </button>
                                                        )}
                                                        {post.driveUrl && (
                                                            <a href={post.driveUrl} target="_blank" rel="noopener noreferrer"
                                                               className="text-xs font-black py-2 px-3 rounded-xl flex items-center gap-1.5"
                                                               style={{background: "linear-gradient(135deg, rgba(219,234,254,0.95), rgba(191,219,254,0.95))", color: "#1d4ed8", border: "1px solid rgba(147,197,253,0.6)"}}>
                                                                ☁️ 雲端硬碟
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        );
                                    })()}

                                    {/* ===== 留言區 ===== */}
                                    {openComments[post.id] && (
                                        <div className="px-5 py-4 space-y-3"
                                             style={{
                                                 background: "linear-gradient(135deg, rgba(243,232,255,0.4), rgba(252,231,243,0.4))",
                                                 borderTop: "1px solid rgba(232,121,249,0.25)",
                                             }}>
                                            {comments.length === 0 ? (
                                                <p className="text-xs text-slate-500 italic text-center py-2">還沒有留言 · 來說點什麼吧</p>
                                            ) : (
                                                comments.map((c) => (
                                                    <div key={c.id} className="rounded-xl px-3 py-2"
                                                         style={{background: "rgba(255,255,255,0.85)", border: "1px solid rgba(232,121,249,0.18)"}}>
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="font-black text-slate-900 text-sm">{c.authorName}</span>
                                                            <span className="text-[10px] text-slate-400">{formatTime(c.createdAt)}</span>
                                                        </div>
                                                        <p className="text-sm text-slate-700 leading-relaxed mt-0.5">{c.text}</p>
                                                    </div>
                                                ))
                                            )}
                                            <div className="flex gap-2 pt-1">
                                                <input
                                                    type="text"
                                                    value={commentDrafts[post.id] || ""}
                                                    onChange={(e) => setCommentDrafts((p) => ({ ...p, [post.id]: e.target.value }))}
                                                    onKeyDown={(e) => { if (e.key === "Enter") submitComment(post.id); }}
                                                    placeholder="新增留言..."
                                                    className="flex-1 px-3.5 py-2 text-sm bg-white border border-fuchsia-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-fuchsia-400 transition-all"
                                                />
                                                <button
                                                    onClick={() => submitComment(post.id)}
                                                    className="px-4 py-2 text-white text-xs font-black rounded-xl transition-all active:scale-[0.98]"
                                                    style={{
                                                        background: "linear-gradient(135deg, #ec4899, #d946ef)",
                                                        boxShadow: "0 8px 18px -6px rgba(217,70,239,0.5)",
                                                    }}
                                                >
                                                    送出
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ===== 右下角浮動發表按鈕（FAB） ===== */}
            <button
                onClick={() => {
                    if (!showUpload) {
                        setShowUpload(true);
                        setTimeout(() => {
                            formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }, 80);
                    } else {
                        setShowUpload(false);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                }}
                className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3.5 rounded-2xl text-white font-black text-sm transition-all active:scale-[0.97]"
                style={{
                    background: showUpload
                        ? "linear-gradient(135deg, #94a3b8, #64748b)"
                        : "linear-gradient(135deg, #ec4899 0%, #d946ef 50%, #a855f7 100%)",
                    boxShadow: showUpload
                        ? "0 12px 28px -8px rgba(100,116,139,0.5)"
                        : "0 12px 28px -8px rgba(217,70,239,0.65), inset 0 1px 0 rgba(255,255,255,0.3)",
                }}
            >
                <span className="text-base leading-none">{showUpload ? "✕" : "✨"}</span>
                <span>{showUpload ? "收起表單" : "發表新成果"}</span>
            </button>

            {/* ===== 編輯 Modal ===== */}
            {editingPost && (
                <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
                     style={{background: "rgba(15,10,30,0.55)", backdropFilter: "blur(6px)"}}>
                    <form onSubmit={handleEditSubmit}
                          className="relative w-full max-w-2xl rounded-3xl p-6 md:p-8 space-y-5 my-auto"
                          style={{
                              background: "rgba(255,255,255,0.97)",
                              boxShadow: "0 32px 64px -16px rgba(131,24,67,0.35), inset 0 1px 0 rgba(255,255,255,0.95)",
                              border: "1px solid rgba(255,255,255,0.95)",
                          }}>
                        {/* 標頭 */}
                        <div className="flex items-center gap-3 pb-2 mb-2 border-b border-fuchsia-100/60">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg shrink-0"
                                 style={{background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)", boxShadow: "0 10px 22px -8px rgba(124,58,237,0.55)"}}>
                                ✏️
                            </div>
                            <div>
                                <h3 className="text-base md:text-lg font-black text-slate-900">編輯貼文</h3>
                                <p className="text-[12px] text-slate-500">修改後儲存，貼文會顯示「已編輯」標記</p>
                            </div>
                            <button type="button" onClick={closeEdit}
                                    className="ml-auto w-8 h-8 rounded-full flex items-center justify-center font-black text-slate-400 hover:text-slate-700 transition-all"
                                    style={{background: "rgba(0,0,0,0.05)"}}>✕</button>
                        </div>

                        {/* 封面圖 */}
                        <Field label="封面圖">
                            <div className="relative group">
                                <input ref={editFileInputRef} type="file" accept="image/*"
                                       onChange={handleEditFileChange}
                                       className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                {editPreviewUrl ? (
                                    <div className="relative">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={editPreviewUrl} alt="預覽" className="w-full max-h-60 object-contain rounded-2xl border-2 border-fuchsia-100"
                                             style={{background: "linear-gradient(135deg, #fdf2f8, #fae8ff)"}} />
                                        <div className="absolute inset-0 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                             style={{background: "rgba(0,0,0,0.35)"}}>
                                            <span className="text-white font-black text-sm">點擊更換圖片</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full px-4 py-8 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-fuchsia-200/80"
                                         style={{background: "rgba(255,255,255,0.5)"}}>
                                        <span className="text-2xl">📷</span>
                                        <span className="text-sm font-bold text-slate-500">點擊選擇圖片</span>
                                    </div>
                                )}
                            </div>
                        </Field>

                        {/* 標題 */}
                        <Field label="標題/說明" required>
                            <input type="text" value={editCaption} onChange={(e) => setEditCaption(e.target.value)}
                                   placeholder="例如：用 n8n 自動整理每週信件摘要"
                                   className="w-full px-4 py-2.5 bg-white/80 border border-fuchsia-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-fuchsia-400 transition-all text-sm" />
                        </Field>

                        {/* 工具（分組） */}
                        <Field label="使用的 AI 工具（可複選）" required>
                            <div className="space-y-3">
                                {AI_TOOL_GROUPS.map((grp) => (
                                    <div key={grp.group}>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{grp.group}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {grp.tools.map((t) => {
                                                const active = editTools.includes(t);
                                                return (
                                                    <button type="button" key={t} onClick={() => toggleEditTool(t)}
                                                            className="text-xs font-bold px-3 py-1.5 rounded-full transition-all"
                                                            style={{
                                                                background: active ? "linear-gradient(135deg, #ec4899, #d946ef)" : "rgba(255,255,255,0.85)",
                                                                color: active ? "#fff" : "#475569",
                                                                border: active ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(244,182,255,0.4)",
                                                                boxShadow: active ? "0 6px 14px -6px rgba(217,70,239,0.55)" : "none",
                                                            }}>
                                                        {t}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {editTools.includes("其他") && (
                                <div className="mt-3 rounded-xl p-3" style={{background: "linear-gradient(135deg, rgba(253,232,255,0.7), rgba(252,231,243,0.7))", border: "1px solid rgba(232,121,249,0.35)"}}>
                                    <label className="text-xs font-black text-fuchsia-700 uppercase tracking-wider block mb-1.5">請填寫工具名稱（多個請用逗號分隔）</label>
                                    <input type="text" value={editCustomTools} onChange={(e) => setEditCustomTools(e.target.value)}
                                           placeholder="例如：Perplexity, Notion AI, Suno"
                                           className="w-full px-3 py-2 text-sm bg-white border border-fuchsia-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-400 transition-all" />
                                </div>
                            )}
                        </Field>

                        {/* 應用場景 */}
                        <Field label="應用場景" required>
                            <div className="flex flex-wrap gap-2">
                                {SCENARIOS.map((s) => {
                                    const active = editScenario === s;
                                    return (
                                        <button type="button" key={s} onClick={() => setEditScenario(s)}
                                                className="text-xs font-bold px-3 py-1.5 rounded-full transition-all"
                                                style={{
                                                    background: active ? "linear-gradient(135deg, #10b981, #0d9488)" : "rgba(255,255,255,0.85)",
                                                    color: active ? "#fff" : "#475569",
                                                    border: active ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(167,243,208,0.45)",
                                                    boxShadow: active ? "0 6px 14px -6px rgba(13,148,136,0.55)" : "none",
                                                }}>
                                            {s}
                                        </button>
                                    );
                                })}
                            </div>
                            {editScenario === "其他" && (
                                <div className="mt-3 rounded-xl p-3" style={{background: "linear-gradient(135deg, rgba(236,253,245,0.7), rgba(204,251,241,0.7))", border: "1px solid rgba(110,231,183,0.4)"}}>
                                    <label className="text-xs font-black text-emerald-700 uppercase tracking-wider block mb-1.5">請填寫自訂場景名稱</label>
                                    <input type="text" value={editCustomScenario} onChange={(e) => setEditCustomScenario(e.target.value)}
                                           placeholder="例如：財務報表自動化、社群媒體排程..."
                                           className="w-full px-3 py-2 text-sm bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all" />
                                </div>
                            )}
                        </Field>

                        {/* 應用難度 */}
                        <Field label="應用難度（選填）">
                            <div className="flex flex-wrap gap-2">
                                {DIFFICULTY_LEVELS.map((d) => {
                                    const active = editDifficulty === d.value;
                                    return (
                                        <button type="button" key={d.value} onClick={() => setEditDifficulty(active ? "" : d.value)}
                                                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all"
                                                style={{
                                                    background: active ? "linear-gradient(135deg, #10b981, #0d9488)" : "rgba(255,255,255,0.85)",
                                                    color: active ? "#fff" : "#475569",
                                                    border: active ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(167,243,208,0.45)",
                                                    boxShadow: active ? "0 6px 14px -6px rgba(13,148,136,0.55)" : "none",
                                                }}>
                                            <span>{d.emoji}</span><span className="font-black">{d.value}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </Field>

                        {/* ===== 結構化成果說明 ===== */}
                        <div className="rounded-2xl p-4 space-y-4"
                             style={{background: "linear-gradient(135deg, rgba(238,242,255,0.6), rgba(253,232,255,0.5))", border: "1.5px solid rgba(165,180,252,0.4)"}}>
                            <p className="text-xs font-black uppercase tracking-widest flex items-center gap-1.5" style={{color: "#4338ca"}}>
                                <span>📋</span> 成果說明
                            </p>
                            <Field label="① 問題陳述與背景">
                                <textarea value={editProblem} onChange={(e) => setEditProblem(e.target.value)}
                                          placeholder="描述導入前的作業痛點或待解決的核心問題..."
                                          rows={2}
                                          className="w-full px-4 py-2.5 bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all text-sm" />
                            </Field>
                            <Field label="② 工具 / 工作流說明">
                                <textarea value={editWorkflow} onChange={(e) => setEditWorkflow(e.target.value)}
                                          placeholder={"工具運作方式、操作流程、應用情境，可附 Prompt..."}
                                          rows={4}
                                          className="w-full px-4 py-2.5 bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all font-mono text-sm" />
                            </Field>
                            <Field label="③ 執行成效">
                                <textarea value={editImpact} onChange={(e) => setEditImpact(e.target.value)}
                                          placeholder="量化指標：節省時間、效率提升比例、錯誤率降低等..."
                                          rows={2}
                                          className="w-full px-4 py-2.5 bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all text-sm" />
                            </Field>
                            <Field label="④ 後續推展計畫">
                                <textarea value={editFuturePlan} onChange={(e) => setEditFuturePlan(e.target.value)}
                                          placeholder="後續推廣對象、業務範圍或與既有流程的整合計畫..."
                                          rows={2}
                                          className="w-full px-4 py-2.5 bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all text-sm" />
                            </Field>
                        </div>

                        {/* ===== 資源分享 ===== */}
                        <div className="rounded-2xl p-4 space-y-4"
                             style={{background: "linear-gradient(135deg, rgba(253,232,255,0.5), rgba(252,231,243,0.5))", border: "1.5px dashed rgba(217,70,239,0.35)"}}>
                            <p className="text-xs font-black uppercase tracking-widest flex items-center gap-1.5" style={{color: "#9d174d"}}>
                                <span>📦</span> 資源分享（選填）
                            </p>
                            <Field label="分享 URL（n8n.cloud / GitHub 連結等）">
                                <input type="url" value={editResourceUrl} onChange={(e) => setEditResourceUrl(e.target.value)}
                                       placeholder="https://..."
                                       className="w-full px-4 py-2.5 bg-white border border-fuchsia-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-fuchsia-400 transition-all text-sm" />
                            </Field>
                            <Field label="雲端硬碟補充連結（選填）">
                                <p className="text-[11px] text-slate-500 mb-1.5">請確認他人可直接開啟並下載試用</p>
                                <input type="url" value={editDriveUrl} onChange={(e) => setEditDriveUrl(e.target.value)}
                                       placeholder="https://drive.google.com/..."
                                       className="w-full px-4 py-2.5 bg-white border border-fuchsia-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-fuchsia-400 transition-all text-sm" />
                            </Field>
                            <Field label="上傳專案檔案（500 KB 內）">
                                <div className="rounded-xl p-2.5 mb-2 text-[11px] flex items-start gap-1.5"
                                     style={{background: "rgba(254,243,199,0.7)", border: "1px solid rgba(251,191,36,0.35)", color: "#92400e"}}>
                                    <span>⚠️</span>
                                    <span>移除私密資訊後，請確認檔案可直接匯入工具試跑</span>
                                </div>
                                <div className="relative group">
                                    <input ref={editJsonInputRef} type="file"
                                           accept=".json,.md,.txt,.yaml,.yml,application/json,text/markdown,text/plain,text/yaml,application/x-yaml"
                                           onChange={handleEditJsonChange}
                                           className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                    <div className={`w-full px-4 py-3 rounded-xl flex items-center justify-center gap-2 text-sm transition-all border-2 border-dashed ${editResourceJsonName ? "border-fuchsia-400 bg-fuchsia-50/70" : "border-fuchsia-200 bg-white group-hover:border-fuchsia-400"}`}>
                                        <span>{editResourceJsonName ? "📎" : "📄"}</span>
                                        <span className={`font-bold ${editResourceJsonName ? "text-fuchsia-700" : "text-slate-500"}`}>
                                            {editResourceJsonName || "點擊選擇檔案（.json / .md / .txt / .yaml / .yml）"}
                                        </span>
                                    </div>
                                </div>
                            </Field>
                        </div>

                        {/* 操作按鈕 */}
                        <div className="flex gap-2 justify-end pt-3 border-t border-fuchsia-100/60">
                            <button type="button" onClick={closeEdit}
                                    className="px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 rounded-xl transition-all">
                                取消
                            </button>
                            <button type="submit" disabled={editSubmitting}
                                    className="px-6 py-2.5 text-white rounded-xl font-black text-sm transition-all active:scale-[0.98] disabled:opacity-60 flex items-center gap-2"
                                    style={{
                                        background: editSubmitting ? "linear-gradient(135deg, #94a3b8, #64748b)" : "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
                                        boxShadow: editSubmitting ? "none" : "0 12px 26px -8px rgba(124,58,237,0.55)",
                                    }}>
                                {editSubmitting ? (<><span className="animate-spin">↻</span>儲存中...</>) : (<><span>💾</span>儲存更新</>)}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-2xl text-sm font-bold shadow-xl z-50 flex items-center gap-2`}
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

            <style jsx>{`
                @keyframes showcasePulse {
                    0%, 100% { opacity: 0.7; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.5); box-shadow: 0 0 12px currentColor; }
                }
                @keyframes dashGlowA {
                    0%, 100% { opacity: 0.65; transform: translate(0,0) scale(1); }
                    50% { opacity: 1; transform: translate(12px,-8px) scale(1.08); }
                }
                @keyframes dashGlowB {
                    0%, 100% { opacity: 0.65; transform: translate(0,0) scale(1); }
                    50% { opacity: 1; transform: translate(-10px,6px) scale(1.1); }
                }
                @keyframes crownFloat {
                    0%, 100% { transform: rotate(12deg) translateY(0); }
                    50% { transform: rotate(18deg) translateY(-6px); }
                }
            `}</style>
        </div>
    );
}

// 小元件：表單欄位包裝
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-xs font-bold text-slate-700 block mb-2 uppercase tracking-wider">
                {label}
                {required && <span className="text-rose-500 ml-1">*</span>}
            </label>
            {children}
        </div>
    );
}

// 浮動裝飾
function ShowcaseDecor() {
    return (
        <>
            <div className="absolute top-24 left-[8%] w-2 h-2 bg-fuchsia-400 rounded-full" style={{animation: "showFloat 5s ease-in-out infinite"}} />
            <div className="absolute top-44 right-[14%] w-1.5 h-1.5 bg-pink-400 rounded-full" style={{animation: "showFloat 5s ease-in-out infinite 1.3s"}} />
            <div className="absolute bottom-44 left-[18%] w-2 h-2 bg-purple-400 rounded-full" style={{animation: "showFloat 5s ease-in-out infinite 2.4s"}} />
            <div className="absolute top-1/2 right-[6%] w-3 h-3 bg-rose-300 rounded-full" style={{animation: "showFloat 5s ease-in-out infinite 0.6s"}} />
            <svg className="absolute top-10 right-14 w-32 h-32 opacity-25 pointer-events-none" viewBox="0 0 200 200" fill="none" style={{color: "#ec4899", animation: "showSpin 22s linear infinite"}}>
                <circle cx="100" cy="100" r="60" stroke="currentColor" strokeWidth="2" strokeDasharray="4 6"/>
                <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="1" strokeDasharray="2 8"/>
                <path d="M100 60 L115 95 L150 100 L120 120 L130 155 L100 135 L70 155 L80 120 L50 100 L85 95 Z" fill="currentColor" opacity="0.5"/>
            </svg>
            <svg className="absolute bottom-20 left-10 w-24 h-24 opacity-20 pointer-events-none" viewBox="0 0 200 200" style={{color: "#d946ef", animation: "showBob 7s ease-in-out infinite"}}>
                <circle cx="60" cy="60" r="22" fill="currentColor"/>
                <circle cx="140" cy="60" r="22" fill="currentColor"/>
                <circle cx="100" cy="140" r="22" fill="currentColor"/>
            </svg>
            <style jsx>{`
                @keyframes showFloat {
                    0%, 100% { opacity: 0.55; transform: translateY(0) scale(1); }
                    50% { opacity: 1; transform: translateY(-10px) scale(1.3); }
                }
                @keyframes showSpin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes showBob {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-12px); }
                }
            `}</style>
        </>
    );
}

// ===== 動畫工具元件 =====

// 數字遞增動畫（ease-out 緩動）
function AnimatedNumber({ value, duration = 1200, suffix = "" }: { value: number; duration?: number; suffix?: string }) {
    const [display, setDisplay] = useState(0);
    const rafRef = useRef<number | null>(null);
    const startRef = useRef<number | null>(null);
    const fromRef = useRef(0);

    useEffect(() => {
        const from = fromRef.current;
        const to = value;
        startRef.current = null;

        const tick = (t: number) => {
            if (startRef.current === null) startRef.current = t;
            const elapsed = t - startRef.current;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            const current = from + (to - from) * eased;
            setDisplay(current);
            if (progress < 1) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                fromRef.current = to;
            }
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
    }, [value, duration]);

    return <>{Math.round(display).toLocaleString()}{suffix}</>;
}

// 環形圖（donut chart）— SVG 純手刻，配合線段繞行動畫
function DonutChart({
    data,
    size = 180,
    thickness = 22,
    centerLabel,
    centerSubLabel,
}: {
    data: { label: string; value: number; color: string }[];
    size?: number;
    thickness?: number;
    centerLabel?: string;
    centerSubLabel?: string;
}) {
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const id = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(id);
    }, []);

    const segments = data.reduce<{ list: Array<{ label: string; value: number; color: string; dash: number; gap: number; offset: number; fraction: number; idx: number }>; cumulative: number }>((acc, d, i) => {
        const fraction = d.value / total;
        const dash = circumference * fraction;
        const gap = circumference - dash;
        const offset = -acc.cumulative * circumference;
        acc.list.push({ ...d, dash, gap, offset, fraction, idx: i });
        return { list: acc.list, cumulative: acc.cumulative + fraction };
    }, { list: [], cumulative: 0 }).list;

    return (
        <div className="relative inline-flex" style={{width: size, height: size}}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                {/* 底圈 */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(244,182,255,0.18)"
                    strokeWidth={thickness}
                />
                {segments.map((seg, i) => (
                    <circle
                        key={i}
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={thickness}
                        strokeLinecap="round"
                        strokeDasharray={mounted ? `${seg.dash} ${seg.gap}` : `0 ${circumference}`}
                        strokeDashoffset={seg.offset}
                        style={{
                            transition: `stroke-dasharray 900ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 120}ms`,
                        }}
                    />
                ))}
            </svg>
            {/* 中央標籤 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                {centerLabel && <div className="text-2xl font-black text-slate-900 leading-none">{centerLabel}</div>}
                {centerSubLabel && <div className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">{centerSubLabel}</div>}
            </div>
        </div>
    );
}

// 條狀圖：從 0 跑到 width%（用 transition 過渡）
function AnimatedBar({ widthPct, gradient, delay = 0 }: { widthPct: number; gradient: string; delay?: number }) {
    const [w, setW] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setW(widthPct), 100 + delay);
        return () => clearTimeout(t);
    }, [widthPct, delay]);
    return (
        <div className="h-2 rounded-full overflow-hidden" style={{background: "rgba(244,182,255,0.18)"}}>
            <div
                className="h-full rounded-full"
                style={{
                    width: `${w}%`,
                    background: gradient,
                    transition: "width 1100ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
            />
        </div>
    );
}
