# Edusprout 平台更新 SOP

## 一、平常更新內容流程

### 1. 打開專案資料夾
```bash
cd /Users/hsiniyang/Desktop/meeting-platform
```

### 2. 先確認目前狀態
```bash
git status
```

### 3. 修改程式內容
可用 VS Code / Cursor 直接修改檔案。

### 4. 清除殘留 lock 檔（如果有的話）

若 `git add` 出現 `fatal: Unable to create '...index.lock': File exists` 的錯誤，先執行這行再繼續：

```bash
rm -f /Users/hsiniyang/Desktop/meeting-platform/.git/index.lock
```

> 這個 lock 檔是 git 異常中斷時留下的，刪掉不影響任何程式碼。

### 5. 存檔後，送出更新
```bash
git add .
git commit -m "更新內容"
git push
```

---

## 二、更新後確認有沒有成功

1. **GitHub**：確認最新 commit 有上去
2. **Vercel**：確認最新 deployment 狀態變成 `Ready`，Source 是最新 commit
3. **正式網址測試**：

```
https://edusprout-platform.vercel.app/
```

> 不要用每次部署都不同的長網址（`edusprout-platform-xxxx.vercel.app`）

---

## 三、如果 git push 失敗

常見原因：GitHub token 過期、token 權限不足、輸入錯誤

當終端機出現：
```
Username for 'https://github.com':
```
輸入：`yxym-cyber`

當終端機出現：
```
Password for 'https://yxym-cyber@github.com':
```
貼上 **GitHub Personal Access Token**（不是一般密碼）

---

## 四、如果 Token 過期，重新申請

路徑：右上角頭像 → Settings → Developer settings → Personal access tokens → Fine-grained tokens

建議設定：
- Repository access：Only select repositories → 勾選 `Edusprout-platform`
- Permissions：
  - Contents → **Read and write**
  - Metadata → Read-only

建立後複製 token，回終端機重新 `git push`。

---

## 五、如果 Vercel 部署後登入失敗

**檢查 Firebase：**

1. Firebase Console → Authentication → Sign-in method → 確認 Google 是 **Enabled**
2. Firebase Console → Authentication → Settings → Authorized domains → 加入：
   ```
   edusprout-platform.vercel.app
   ```
   （不加 `https://`，不加結尾 `/`）

---

## 六、如果打卡失敗

**檢查 1：** Google Sheet 是否分享給 service account（`GOOGLE_SERVICE_ACCOUNT_EMAIL`），權限為**編輯者**

**檢查 2：** Vercel Logs → 看 `/api/check-in` 是否有錯誤訊息

若出現：
```
error:1E08010C:DECODER routines::unsupported
```
表示 `GOOGLE_PRIVATE_KEY` 格式有問題 → 見第七點

---

## 七、Google 私鑰格式修正

若程式裡有：
```ts
process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
```

改成：
```ts
process.env.GOOGLE_PRIVATE_KEY?.replace(/^"|"$/g, '').replace(/\\n/g, '\n')
```

用途：去掉前後多餘雙引號 + 把 `\n` 轉成真正換行

---

## 八、建議習慣

1. 每次改完先本機測試
2. `git add`、`git commit`、`git push`
3. 看 Vercel 是否 `Ready`
4. 用正式網址測試功能
5. 若有 API 問題，先看 Vercel Logs

---

## 最短版口訣

```bash
cd /Users/hsiniyang/Desktop/meeting-platform
rm -f .git/index.lock        # 若出現 lock 錯誤才需要
git status
git add .
git commit -m "更新內容"
git push
```

然後：去 Vercel 確認部署成功 → 用正式網址測試
