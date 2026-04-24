"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function detectInAppBrowser(): boolean {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    return /Line\/|FBAN|FBAV|Instagram|MicroMessenger|WeChat|TwitterAndroid|LinkedInApp/i.test(ua)
        || (/iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua) && /AppleWebKit/.test(ua));
}

export default function LoginPage() {
    const { user, loginWithGoogle, isWhitelisted, loading } = useAuth();
    const router = useRouter();
    const [isInApp, setIsInApp] = useState(false);

    useEffect(() => {
        setIsInApp(detectInAppBrowser());
    }, []);

    useEffect(() => {
        if (user && isWhitelisted) {
            router.push("/");
        }
    }, [user, isWhitelisted, router]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-800">
                <div className="text-lg font-medium">載入中...</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900 px-6">
            <div className="w-full max-w-md p-10 bg-white shadow-xl rounded-lg border border-slate-200">
                <header className="mb-10 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-blue-900 mb-2">
                        學術會議平台
                    </h1>
                    <p className="text-slate-500 font-medium">請登入以繼續訪問系統資源</p>
                </header>

                <main className="flex flex-col gap-6">
                    {isInApp ? (
                        <div className="p-5 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-900 space-y-3">
                            <p className="font-bold text-base">請使用瀏覽器開啟</p>
                            <p>目前偵測到您使用的是 App 內建瀏覽器（如 Line、Instagram 等），Google 登入在此環境下不被允許。</p>
                            <p className="font-semibold">請複製網址，改用 <span className="underline">Safari</span> 或 <span className="underline">Chrome</span> 開啟後再登入。</p>
                            <button
                                onClick={() => {
                                    navigator.clipboard?.writeText(window.location.href);
                                }}
                                className="w-full py-2.5 bg-amber-600 text-white rounded-md font-semibold hover:bg-amber-700 transition-all"
                            >
                                複製網址
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={loginWithGoogle}
                            className="flex items-center justify-center gap-3 w-full py-3.5 px-4 bg-blue-900 text-white rounded-md font-semibold hover:bg-blue-800 transition-all shadow-md active:transform active:scale-[0.98]"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            使用 Google 帳號登入
                        </button>
                    )}

                    {user && isWhitelisted === false && (
                        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm text-center font-medium">
                            抱歉，您的帳號不在授權白名單內。<br />請聯繫系統管理員。
                        </div>
                    )}
                </main>

                <footer className="mt-12 text-center text-slate-400 text-xs">
                    © 2026 學術會議管理系統 | 正式與嚴謹的學術交流環境
                </footer>
            </div>
        </div>
    );
}
