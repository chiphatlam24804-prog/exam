# 中文科在線考卷 · Vercel 版（答案存在伺服器）

胡志明市 2026–2027 學年高中生資優選拔賽 · 中文科　第 1–80 題　滿分 15 分

學生打開網頁 → 作答 → 交卷 → **伺服器評分**後回傳分數與逐題檢討。
**標準答案永遠不會送到學生的瀏覽器**，翻遍原始碼、開發者工具、網路封包都找不到。

---

## 這一版跟 GitHub Pages 版差在哪

| | GitHub Pages 版 | 這一版（Vercel） |
|---|---|---|
| 答案存放位置 | 學生瀏覽器（`data/answers.json`） | 伺服器（`answers.json` 或環境變數） |
| 學生能否看到答案 | 網址後面加 `/data/answers.json` 就看得到 | 看不到 |
| 評分在哪裡跑 | 學生的瀏覽器 | `/api/grade` serverless function |
| 老師改答案 | 直接改檔案 | `#key` 頁面，需要密碼 |

---

## 檔案結構

```
answers.json          ★ 答案卡 — 在 public/ 之外，網站永遠讀不到
api/
  _lib.js               共用：讀答案、簽章、評分引擎
  start.js              /api/start   發放考試憑證
  grade.js              /api/grade   評分
  answers.js            /api/answers 老師憑密碼取得答案卡
public/               ← 只有這個資料夾會被當成網站公開
  index.html
  assets/app.js         前端：只負責出題與顯示，沒有評分邏輯也沒有答案
  assets/style.css
  data/exam.json        題目（不含答案）
  audio/listening.mp3   聽力錄音（可選）
package.json
vercel.json
```

---

## 一、部署到 Vercel

### 1. 先推到 GitHub

在 GitHub 建一個 repository。**建議選 Private** — 這樣連 `answers.json` 都不會被外人在 GitHub 上看到。Vercel 免費方案可以部署私有 repository。

把這個資料夾裡的所有東西上傳到 repository 根目錄（`answers.json`、`api/`、`public/`、`package.json`、`vercel.json`）。

### 2. 在 Vercel 匯入

1. 到 [vercel.com](https://vercel.com) 用 GitHub 帳號登入。
2. **Add New… → Project** → 找到剛才的 repository → **Import**。
3. Framework Preset 保持 **Other**，Build Command、Output Directory 全部**留空不要動** — Vercel 會自動把 `public/` 當靜態根目錄、`api/*.js` 當 serverless function。
4. 按 **Deploy**，等一分鐘左右。

完成後會拿到網址，像 `https://你的專案名.vercel.app`，直接發給學生即可。

### 3. 設定環境變數

進入 Vercel 專案 → **Settings → Environment Variables**，加入：

| 名稱 | 值 | 說明 |
|---|---|---|
| `SESSION_SECRET` | 一段隨便打的長字串 | **必填**。用來簽考試憑證，防止有人直接呼叫評分 API |
| `TEACHER_PASSWORD` | 你自己設的密碼 | 選填。設了才能用 `#key` 改答案；不設的話這個端點一律拒絕 |
| `REVEAL_ANSWERS` | `timed` / `always` / `never` | 選填，預設 `timed` |
| `MIN_MINUTES` | `20` | 選填，`timed` 模式下要作答滿幾分鐘才顯示參考答案 |
| `ANSWER_KEY` | Base64 的答案卡 | 選填，見下方「更安全的做法」 |

加完環境變數要**重新部署一次**才會生效（Deployments 分頁 → 最新那筆右邊 ⋯ → Redeploy）。

`SESSION_SECRET` 可以這樣產生一段：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 二、`REVEAL_ANSWERS` 是做什麼的

伺服器評分後，要不要順便把參考答案回傳給學生看？

- **`timed`（預設）** — 作答滿 `MIN_MINUTES` 分鐘才附上參考答案。這是為了防止有人開了考卷馬上交白卷、用回傳的答案當作弊小抄；正常考試的學生不會受影響。
- **`always`** — 一律附上。適合當作平時練習。
- **`never`** — 只給分數，不給答案。適合正式選拔考。

沒拿到參考答案時，學生仍然看得到自己每一題的得分。

---

## 三、更安全的做法：答案完全不進 repository

如果連 GitHub 上都不想留下答案，可以把答案放進環境變數：

```bash
# 產生 Base64 字串
node -e "console.log(Buffer.from(require('fs').readFileSync('answers.json')).toString('base64'))"
```

把輸出貼到 Vercel 的環境變數 `ANSWER_KEY`，然後把 repository 裡的 `answers.json` 刪掉。
伺服器會優先讀 `ANSWER_KEY`，讀不到才找 `answers.json`。我已經實測過兩種模式都能正常評分。

---

## 四、改聽力答案

1. 先設好環境變數 `TEACHER_PASSWORD` 並重新部署。
2. 打開 `https://你的專案名.vercel.app/#key`，輸入密碼。
3. 第 1–25 題會標成黃色（聽力推定答案），對照錄音稿逐題改。
4. 按 **下載 answers.json**，覆蓋 repository 根目錄那一份，推到 GitHub — Vercel 會自動重新部署。
   （若用 `ANSWER_KEY` 模式，就把新檔案轉成 Base64 更新環境變數。）

沒設 `TEACHER_PASSWORD` 時，`/api/answers` 一律回 403，學生就算知道有這個網址也拿不到東西。

---

## 五、本機測試

```bash
npm i -g vercel
vercel dev
```

然後開 `http://localhost:3000`。環境變數可以放在專案根目錄的 `.env.local`：

```
SESSION_SECRET=whatever-long-string
TEACHER_PASSWORD=hoctap2026
REVEAL_ANSWERS=always
```

> 注意：這一版**不能**用滑鼠雙擊 `public/index.html` 開啟，因為它需要後端 API。

---

## 六、答案來源與可信度

| 題號 | 來源 |
|---|---|
| 26–35、41–55、66–70 | **原始試卷附的標準答案**，可直接採用 |
| 56–65（閱讀判斷） | 依短文內容判定，可信度高 |
| 36–40、71–80 | 依題目擬定的標準答案／參考譯文 |
| **1–25（聽力）** | ⚠️ **原卷沒有附答案，也沒有錄音稿**，這些是依上下文推定的（第 22 題更是純猜測）。請務必對照錄音稿用 `#key` 修正 |

這些題目在成績單上會標「聽力·參考答案」。

---

## 七、評分方式

- **選擇題、判斷題**：對／錯，全有或全無。
- **填空題**：比對標準答案與可接受的同義詞；聽力填空另有模糊比對，接近可得半分。
- **開放題**（24、25、36–40、71–80）：**要點覆蓋率佔 65% ＋ 文字相似度佔 35%**，分成 滿分 / ¾ / ½ / ¼ / 0。越南文答案會自動去聲調再比對，沒打聲調也算數。
- **改錯句**另設病句偵測：原本的語病若還留在答案裡（例如第 37 題的「切忌不可」），分數大幅扣減並標示「病句未改正」。

成績單上每題都會顯示要點覆蓋率與相似度。

---

## 八、還有什麼是防不住的

- **學生互傳答案。** 伺服器不會發答案，但同學之間可以口耳相傳。
- **同一個人反覆作答。** 沒有帳號系統，重整就能再考一次。要防的話得加登入與資料庫。
- **`REVEAL_ANSWERS=always` 時的答案外洩。** 有人可以交白卷換取全部參考答案。正式考試請用 `timed` 或 `never`。

正式選拔考仍建議在監考的電腦教室進行。
