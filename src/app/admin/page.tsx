"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminHubPage() {
    const { user, userData, loading, logout } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && (!user || userData?.role !== "admin")) {
            router.push("/");
        }
    }, [user, userData, loading, router]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="text-lg font-medium text-slate-600 animate-pulse">驗證中...</div>
            </div>
        );
    }

    if (!user || userData?.role !== "admin") return null;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
            <nav className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center shadow-sm sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-900 rounded-xl flex items-center justify-center text-white font-black text-xl">M</div>
                    <h1 className="text-xl font-black text-blue-900 tracking-tight">高教深耕自動化管理平台</h1>
                </div>
                <button onClick={logout} className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-red-500 transition-all">
                    {user.displayName} 登出
                </button>
            </nav>

            <main className="max-w-5xl mx-auto py-20 px-6">
                <header className="mb-16 border-l-8 border-blue-900 pl-8">
                    <h2 className="text-4xl font-black text-slate-800 mt-2 mb-4">管理門戶</h2>
                    <p className="text-slate-500 italic">您已通過安全驗證，請選擇子系統：</p>
                </header>

                <div className="grid gap-10 md:grid-cols-2">
                    <Link
                        href="/full-time"
                        className="group p-10 bg-white rounded-[40px] border border-slate-100 shadow-sm hover:shadow-2xl hover:border-blue-400 transition-all duration-500"
                    >
                        <div className="text-4xl mb-6">🤖</div>
                        <h3 className="text-2xl font-black text-slate-800 mb-4">AI 工具與教學介面</h3>
                        <p className="text-slate-500 text-sm leading-relaxed">n8n 教學、成果動態牆、會議紀錄生成</p>
                    </Link>
                    <Link
                        href="/temp-system"
                        className="group p-10 bg-white rounded-[40px] border border-slate-100 shadow-sm hover:shadow-2xl hover:border-green-400 transition-all duration-500"
                    >
                        <div className="text-4xl mb-6">⏱️</div>
                        <h3 className="text-2xl font-black text-slate-800 mb-4">臨時人員管理系統</h3>
                        <p className="text-slate-500 text-sm leading-relaxed">打卡記錄、出勤管理</p>
                    </Link>
                </div>
            </main>
        </div>
    );
}
