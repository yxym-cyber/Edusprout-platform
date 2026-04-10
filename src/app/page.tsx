"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const { user, userData, isWhitelisted, loading, loginWithGoogle, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      // 核心安全攔截：如果登入後發現不在白名單，不執行任何跳轉
      if (isWhitelisted === false) return;

      // 角色分流跳轉
      if (userData?.role === "part-time") {
        router.push("/temp-system");
      } else if (userData?.role === "admin" || userData?.role === "full-time") {
        router.push("/admin");
      }
    }
  }, [user, userData, isWhitelisted, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-lg font-medium text-slate-600 animate-pulse">身分驗證中...</div>
      </div>
    );
  }

  // --- 狀態 1：完全未登入時的起始畫面 ---
  if (!user) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-blue-900 rounded-3xl flex items-center justify-center text-white text-4xl font-black mx-auto mb-8 shadow-2xl shadow-blue-200">
            M
          </div>
          <h1 className="text-3xl font-black text-slate-800 mb-4 tracking-tight">高教深耕自動化管理平台</h1>
          <p className="text-slate-500 mb-10 leading-relaxed">國立臺灣大學 | 高教深耕計畫辦公室</p>
          <button
            onClick={loginWithGoogle}
            className="w-full py-4 px-6 bg-white border-2 border-slate-100 rounded-2xl font-bold text-slate-700 flex items-center justify-center gap-4 hover:bg-slate-50 hover:border-blue-200 transition-all shadow-sm"
          >
            <img src="https://www.gstatic.com/images/branding/product/1x/gsa_64dp.png" className="w-6 h-6" alt="Google" />
            使用 Google 帳號登入
          </button>
        </div>
      </div>
    );
  }

  // --- 狀態 2：已登入但「不在白名單」 (此處是安全關鍵) ---
  if (isWhitelisted === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
        <div className="bg-white p-10 rounded-[40px] shadow-xl text-center max-w-sm border border-gray-100">
          <div className="text-amber-400 text-6xl mb-6">⚠️</div>
          <h2 className="text-2xl font-black text-slate-800 mb-4 tracking-tight">存取受限</h2>
          <p className="text-slate-500 mb-10 leading-relaxed">
            您的帳號 <span className="font-bold text-blue-600">({user.email})</span> 未在授權名單中。<br />
            請聯繫管理員開通權限。
          </p>
          <button
            onClick={async () => {
              await logout();
              router.push("/");
            }}
            className="w-full py-4 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-100"
          >
            登出並重新登入
          </button>
        </div>
      </div>
    );
  }

  // --- 狀態 3：已登入且通過驗證，等待跳轉中 ---
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="text-lg font-medium text-slate-600 animate-pulse">跳轉中...</div>
    </div>
  );
}