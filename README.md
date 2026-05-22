# 高教深耕自動化管理平台

國立臺灣大學高教深耕計畫辦公室內部使用的整合管理平台，提供 AI 學習資源、成果分享、會議紀錄自動生成、人員簽到等功能。

---

## 技術棧

- **框架**：Next.js 16（App Router）+ React 19 + TypeScript 5
- **樣式**：Tailwind CSS 4
- **後端 / 資料庫**：Firebase（Auth + Firestore + Storage）
- **AI 模型**：本機 LM Studio（Gemma 27B）+ Google Generative AI（Gemini）
- **第三方整合**：Google Sheets（簽到紀錄）、Cloudinary（圖片上傳）

---

## 快速開始

### 1. 安裝相依套件

```bash
npm install
```

### 2. 設定環境變數

複製一份 `.env.local`（向專案負責人索取既有值）到專案根目錄。需要的金鑰：

| 變數 | 用途 |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*`（6 個） | Firebase Client SDK（Auth + Firestore + Storage） |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API 金鑰 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google Service Account（簽到串 Google Sheets） |
| `GOOGLE_PRIVATE_KEY` | 對應 Service Account 的私鑰，必須用雙引號完整包住 |
| `GOOGLE_SHEET_ID` | 簽到記錄寫入的 Google Sheet ID |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary 帳號名稱（成果牆圖片用） |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Cloudinary unsigned upload preset 名稱 |

### 3. 啟動開發伺服器

```bash
npm run dev
```

打開 [http://localhost:3000](http://localhost:3000)。

### 4. 其他指令

```bash
npm run build   # 產出 production build
npm run start   # 跑 production server
npm run lint    # ESLint 檢查
```

---

## 必備外部服務

### Firebase

新人需要從專案負責人那邊取得**該 Firebase 專案的存取權限**（IAM），才能在 Firebase Console 看 Firestore 資料與 Auth 設定。

需要部署的 Firestore 規則參考 `firestore.rules.showcase.txt`，套用方式：Firebase Console → Firestore Database → 規則。

### Cloudinary

成果動態牆的圖片上傳走 Cloudinary。Settings → Upload → Add upload preset → 設為 **Unsigned**，把名稱填進 `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`。

### Google Service Account

簽到功能會把資料寫入 Google Sheets。要在 Google Cloud Console 建立 Service Account、下載 JSON key，並把對應 Sheet 開「編輯權限」給 Service Account 的 email。

### LM Studio + ngrok（會議紀錄生成才需要）

「會議紀錄生成」功能會從瀏覽器直接呼叫**本機**運行的 LM Studio 服務：

1. 桌機安裝 [LM Studio](https://lmstudio.ai/)，下載 Gemma 27B 模型並載入
2. Developer → Server settings → **Enable CORS** 必開
3. 啟動 LM Studio Local Server（預設 port 1234）
4. 用 ngrok 把本機 port 1234 對外：`ngrok http 1234`
5. 把 ngrok 給的 URL 填入 `src/lib/lmStudio.ts` 的 `LM_STUDIO_BASE_URL`

注意 ngrok URL **目前是寫死在程式碼裡**，不是環境變數，更換時需要直接改原始碼。

---

## 專案結構

```
src/
├── app/
│   ├── layout.tsx              # 全站根 layout（套 AuthProvider）
│   ├── page.tsx                # 登入頁 + 角色分流
│   ├── login/page.tsx          # 獨立登入頁
│   ├── full-time/              # 全職人員主介面（功能最豐富）
│   │   ├── page.tsx            # 三個一級 tab 的容器
│   │   ├── LearnHub.tsx        # AI 學習資源 Hub 首頁（4 張主題卡）
│   │   ├── LearnTools.tsx      # AI 工具對照子頁（12 款工具）
│   │   ├── LearnEthics.tsx     # AI 倫理子頁
│   │   ├── LearnPrompts.tsx    # Prompt 資料庫子頁
│   │   └── ShowcaseFeed.tsx    # 成果動態牆（含上傳、貼文、留言、統計）
│   ├── temp-system/page.tsx    # 兼任人員簽到頁
│   ├── admin/page.tsx          # 管理員入口（目前只是連結卡）
│   └── api/
│       ├── check-in/route.ts        # 簽到寫入 Google Sheets
│       ├── generate-summary/route.ts # 會議摘要 API（伺服器端版本）
│       └── test-sheet/route.ts      # Google Sheets 連線測試
├── context/
│   └── AuthContext.tsx         # 全站 Auth Provider（含白名單檢查）
└── lib/
    ├── firebase.ts             # Firebase Client SDK
    ├── firebase-admin.ts       # Firebase Admin SDK（伺服器端）
    ├── cloudinary.ts           # Cloudinary 上傳
    ├── imageCompress.ts        # 圖片壓縮（上傳前處理）
    └── lmStudio.ts             # LM Studio 客戶端（瀏覽器端呼叫本機模型）

public/
├── n8n_guide_modified_5.html   # n8n 教學內容（由 /full-time 頁面 iframe 載入）
├── ai-ethics-v2.html           # AI 倫理舊版 HTML（已 React 化，備援用）
└── ai-tools-guide-v2.html      # AI 工具對照舊版 HTML（已 React 化，備援用）

firestore.rules.showcase.txt    # Firestore 安全規則參考
```

---

## 角色與權限

從 Firestore `whitelist` 集合管理。每位使用者文件 ID 是 email，內容包含 `role` 欄位：

| Role | 可進入的頁面 |
|---|---|
| `admin` | 全部頁面（`/admin`、`/full-time`、`/temp-system`） |
| `full-time` | `/full-time`、`/temp-system` |
| `part-time` | `/temp-system` |

登入流程：使用者 Google 登入 → `AuthContext` 用 email 去 `whitelist/{email}` 查詢 → 不在白名單就顯示「存取受限」，在白名單則依角色跳轉。

新增使用者：在 Firebase Console → Firestore → `whitelist` 集合手動新增文件，文件 ID 設為 email、加 `role` 欄位即可。

---

## Firestore 資料模型

| 集合 | 用途 | 主要欄位 |
|---|---|---|
| `whitelist` | 白名單與角色 | `email`, `role` |
| `meetings` | 會議資料 | `title`, `date`, `sourceId`, `createdBy`, `createdAt` |
| `meeting_sources` | 逐字稿原始內容 | `transcript_text`, `createdAt` |
| `meeting_generated` | AI 生成的會議紀錄 | `meetingId`, `sourceId`, `data`, `model`, `version` |
| `posts` | 成果動態牆貼文 | `authorEmail`, `caption`, `imageUrl`, `tools`, `scenario`, `likes`, `likedBy` |
| `posts/{id}/comments` | 留言（子集合） | `authorEmail`, `text`, `createdAt` |

---

## 主要功能模組

### AI 學習資源（`/full-time` → 📚 AI 學習）

Hub 首頁顯示 4 張主題卡，點進去看子頁：
- **AI 工具對照**：12 款精選 AI 工具，含分類、推薦分數、難易度
- **AI 倫理**：5 大研究使用規範，可摺疊章節
- **n8n 工作流自動化**：iframe 載入 `n8n_guide_modified_5.html`
- **Prompt 資料庫**：常用 Prompt 範本，可一鍵複製

### 成果動態牆（`/full-time` → 🌟 成果動態牆）

社群式貼文牆，使用者可上傳成果圖片 + Prompt + 邏輯說明 + 資源檔案。包含：
- 統計儀表板（最活躍使用者、熱門工具、分享類型）
- 按讚、留言、刪除
- 上傳走 Cloudinary（圖片壓縮 → 上傳 → 寫入 Firestore）

### 會議紀錄生成（`/full-time` → 📝 會議紀錄生成）

上傳逐字稿（.txt）→ 從瀏覽器直接呼叫本機 LM Studio → 生成結構化會議紀錄（議題、決議、待辦事項）→ 寫回 Firestore。需配合 LM Studio + ngrok 才能使用。

### 簽到（`/temp-system`）

兼任人員上下班簽到，透過 `/api/check-in` 寫入 Google Sheets。

---

## 已知技術債與改善方向

- **`any` 型別待整理**：`ShowcaseFeed.tsx` 與 `page.tsx` 多處用了 `any`，跑 ESLint 會看到 12 個錯誤。建議建立明確的 Firestore 文件型別。
- **`/admin` 沒有實際管理功能**：目前只是兩張連結卡，未來可以加入白名單管理、內容 CRUD、貼文審核。
- **白名單管理沒有 UI**：要新增使用者只能去 Firebase Console 手動加，建議做 admin 頁面。
- **`public/` 有舊資產**：`n8n_guide.html`、`showcase_feed.html` 已被取代，可清掉。
- **Prompt 與工具資料寫死在程式碼**：`LearnPrompts.tsx` / `LearnTools.tsx` 的內容是寫死在元件裡，未來建議搬到 Firestore 讓 admin 可以維護。
- **ngrok URL 寫死**：`src/lib/lmStudio.ts` 的 URL 應該改成環境變數。
- **API 路由有重複**：`api/generate-summary/route.ts` 跟 `lib/lmStudio.ts` 可能功能重疊，需確認哪個還在使用。

---

## 部署

目前專案結構是標準 Next.js App Router，理論上可以部署到 Vercel、Cloudflare Pages、自架 Node server 等。部署前確認：

1. 環境變數全部設定（注意 `NEXT_PUBLIC_*` 開頭的會曝露給 client）
2. Firebase 專案的 Auth 授權網域包含部署網址
3. Cloudinary upload preset 允許部署網域的 referer（如有設）
4. LM Studio 功能在 production 是否要繼續用本機跑（建議改用雲端 LLM API）

---

## 開發小撇步

- **登入後跳轉邏輯**在 `src/app/page.tsx`，要改角色分流改這裡
- **iframe 與主站訊息**：n8n 教學的圖片 lightbox 是透過 `postMessage` 觸發，邏輯在 `src/app/full-time/page.tsx` 底部
- **新增主分頁**：在 `src/app/full-time/page.tsx` 的 `tabs` 陣列加項目，把 `grid-cols-3` 改成對應數字
- **新增 AI 學習子主題**：在 `LearnHub.tsx` 的 `topics` 陣列加卡片，並在 `page.tsx` 的 learn 區塊加上對應的 `learnTopic === "..."` 條件分支
