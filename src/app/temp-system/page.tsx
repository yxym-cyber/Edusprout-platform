"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function AttendancePage() {
    // 1. 初始化 Hook
    const { user, userData, loading: authLoading, logout } = useAuth();
    const router = useRouter();

    const [now, setNow] = useState(new Date());
    const [status, setStatus] = useState({ checkIn: '--:--:--', checkOut: '--:--:--' });
    const [actionLoading, setActionLoading] = useState(false);

    // 每秒更新時鐘
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // 2. 身分驗證載入中
    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <p className="text-gray-500 animate-pulse">身分驗證中...</p>
            </div>
        );
    }

    // 3. 權限不足或未登入畫面
    if (!userData || (userData.role !== 'admin' && userData.role !== 'full-time' && userData.role !== 'part-time')) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
                <div className="bg-white p-10 rounded-[40px] shadow-xl text-center max-w-sm border border-gray-50">
                    <div className="text-amber-400 text-6xl mb-6">⚠️</div>
                    <h2 className="text-2xl font-black text-slate-800 mb-4 tracking-tight">權限不足</h2>
                    <p className="text-slate-500 mb-10 leading-relaxed">
                        您目前尚未登入，身分為<span className="font-bold text-red-500 mx-1">訪客</span>，<br />
                        請重新登入或連繫系統管理員。
                    </p>
                    <button
                        onClick={async () => {
                            try {
                                await logout();
                                router.push("/");
                            } catch (error) {
                                window.location.href = "/";
                            }
                        }}
                        className="w-full py-4 bg-blue-900 text-white rounded-2xl font-bold hover:bg-blue-800 transition-all shadow-lg shadow-blue-100 active:scale-95"
                    >
                        返回首頁並重新登入
                    </button>
                </div>
            </div>
        );
    }

    // 4. 簽到/簽退 邏輯
    const handleAction = async (action: 'check-in' | 'check-out') => {
        if (!user) return;
        setActionLoading(true);
        try {
            const res = await fetch('/api/check-in', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    user: `${user.displayName || user.email} (${userData.role})`
                }),
            });

            const data = await res.json();
            if (data.success) {
                alert(`${action === 'check-in' ? '簽到' : '簽退'}成功！`);
                const timeString = new Date().toLocaleTimeString('en-GB', { hour12: false });
                if (action === 'check-in') {
                    setStatus(prev => ({ ...prev, checkIn: timeString }));
                } else {
                    setStatus(prev => ({ ...prev, checkOut: timeString }));
                }
            } else {
                alert("操作失敗：" + data.error);
            }
        } catch (error) {
            alert("網路連線異常");
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans text-slate-900">
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8 text-center border border-gray-100">
                <h1 className="text-xl font-black text-blue-900 mb-1">高教深耕計畫</h1>
                <p className="text-blue-600 text-xs font-bold mb-6 tracking-widest uppercase">臨時人員管理系統</p>

                <div className="bg-slate-50 rounded-3xl p-8 mb-8 border border-slate-100">
                    <p className="text-slate-400 text-sm mb-2">{now.toLocaleDateString('zh-TW')}</p>
                    <p className="text-5xl font-mono font-black text-slate-800 tracking-tighter">
                        {now.toLocaleTimeString('en-GB', { hour12: false })}
                    </p>
                </div>

                <div className="border-2 border-slate-50 rounded-2xl p-4 flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center overflow-hidden">
                        {user?.photoURL ? <img src={user.photoURL} alt="avatar" /> : "👤"}
                    </div>
                    <div className="text-left flex-1">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Current User</p>
                        <p className="font-bold text-slate-700">
                            {user?.displayName || "使用者"}
                            <span className="text-blue-500 font-normal ml-2 text-xs">({userData.role})</span>
                        </p>
                    </div>
                    <button onClick={logout} className="text-[10px] font-bold text-red-400 hover:text-red-600 underline">登出</button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50">
                        <p className="text-[10px] text-blue-600 font-black mb-1">簽到時間</p>
                        <p className="text-slate-600 font-mono font-bold text-lg">{status.checkIn}</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <p className="text-[10px] text-slate-500 font-black mb-1">簽退時間</p>
                        <p className="text-slate-600 font-mono font-bold text-lg">{status.checkOut}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <button
                        onClick={() => handleAction('check-in')}
                        disabled={actionLoading}
                        className="w-full bg-blue-700 text-white py-4 rounded-2xl font-black hover:bg-blue-800 transition-all shadow-lg shadow-blue-100 active:scale-95 disabled:bg-slate-200"
                    >
                        ➜ 立即簽到
                    </button>
                    <button
                        onClick={() => handleAction('check-out')}
                        disabled={actionLoading}
                        className="w-full bg-slate-600 text-white py-4 rounded-2xl font-black hover:bg-slate-700 transition-all active:scale-95 disabled:bg-slate-200"
                    >
                        ↪ 簽退 (可多次)
                    </button>
                </div>

                <p className="mt-10 text-[10px] text-slate-400 font-medium italic">國立臺灣大學 | 您的上班時間 09:00 ~ 18:00</p>
            </div>
        </div>
    );
}