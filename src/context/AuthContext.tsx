"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
    onAuthStateChanged,
    User,
    signInWithPopup,
    signInWithRedirect,
    GoogleAuthProvider,
    signOut
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

// 定義從 Firestore whitelist 集合中抓取的資料結構
interface UserData {
    email: string;
    role: string; // 例如: 'admin', 'part-time', 'full-time'
}

// 定義 Context 提供給全站使用的狀態
interface AuthContextType {
    user: User | null;         // Firebase 原生使用者資訊 (DisplayName, PhotoURL 等)
    userData: UserData | null; // 我們自定義的資料 (Role)
    loading: boolean;          // 是否正在載入中
    isWhitelisted: boolean | null; // 是否在白名單內
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null);

    // 關鍵功能：前往 Firestore 檢查該 Email 是否在 whitelist 集合中
    const fetchUserData = async (email: string) => {
        console.log("Fetching user data for:", email);
        try {
            const docRef = doc(db, "whitelist", email);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data() as UserData;
                console.log("User data found:", data);
                setUserData(data);
                setIsWhitelisted(true);
            } else {
                console.warn("User not found in whitelist:", email);
                setUserData(null);
                setIsWhitelisted(false);
            }
        } catch (error) {
            console.error("Error fetching user data for", email, ":", error);
            setIsWhitelisted(false);
        }
    };

    useEffect(() => {
        // 監聽 Firebase Auth 狀態
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            console.log("Auth state changed:", currentUser?.email);
            setUser(currentUser);
            if (currentUser?.email) {
                // 如果有人登入，立刻去檢查白名單
                await fetchUserData(currentUser.email);
            } else {
                console.log("No user logged in");
                setUserData(null);
                setIsWhitelisted(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const loginWithGoogle = async () => {
        const provider = new GoogleAuthProvider();
        try {
            console.log("Starting Google login popup...");
            await signInWithPopup(auth, provider);
            console.log("Login popup successful");
        } catch (error: any) {
            console.error("Login popup failed:", error);
            if (error.code === "auth/popup-closed-by-user" || error.code === "auth/internal-error") {
                console.warn("Popup blocked or closed. Falling back to redirect...");
                try {
                    await signInWithRedirect(auth, provider);
                } catch (redirectError) {
                    console.error("Redirect login failed:", redirectError);
                }
            }
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, userData, loading, isWhitelisted, loginWithGoogle, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

// 導出 Hook，讓其他頁面可以輕鬆使用：const { user, userData } = useAuth();
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};