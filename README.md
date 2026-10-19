# 台股市場一覽 · TW Markets

以 TradingView Markets 的資訊層級為參考：白底、粗體標題、指數切換、大幅走勢、橫向行情卡與市場排行。所有資料整合在單一連續 panel，區塊上下無外部間距，以細分隔線區分。上方導覽只捲動到頁內位置，不切換或隱藏其他區塊。

## 內容與互動

- 台股指數／個股走勢：歷史日線、成交值、期間切換、K 線、加權均線、滑鼠觀測與拖曳區間報酬。
- 六檔焦點台股、市場廣度、均線乖離、產業與指數排行。
- 法人現貨、臺股期貨、融資拆解、Put/Call、融券與當沖。
- 美股 ETF、VIX／VIX3M／VVIX、美債與匯率。
- 公司營收與估值：搜尋、排序與分頁，涵蓋兩種來源的公司聯集。
- 公司重大訊息：搜尋、分頁與原文展開。
- 68 項研究因子：搜尋、分類、觀測狀態與來源詳情。
- 來源狀態、原始資料連結與台北時間；支援手機版與深色模式。

109 項行情階段檢核、評分、候選階段與人工覆寫功能已移除。研究因子保留原始觀測與方法說明，不執行階段推算。

## 資料與排程

純靜態 GitHub Pages 架構。GitHub Actions 產生 `data/market.json`；前端只讀取這份同站快照，不在訪客瀏覽器重新抓取各外部 API。每 60 秒檢查一次快照，可手動重新整理。資料缺漏顯示 `—`；抓取失敗的前值會標示狀態。報價、日線、籌碼、公司資料各自保留觀測日期。

| 資料 | 台北時間排程 |
| --- | --- |
| 台股盤中指數 | 交易日 09:00–13:30，每 10 分鐘 |
| 台股盤後、技術、籌碼、營收與公告 | 交易日 15:30 |
| 美股 ETF、波動率與美債 | 06:00，依工作流程平日 UTC 排程 |

GitHub 排程與部署可能延遲，來源更新成功不代表即時報價。實際排程與模式見 `.github/workflows/market-pipeline.yml`。

在 GitHub Actions 的 **Market Data Pipeline** 選擇 **Run workflow** 可手動執行 `full`、`intraday`、`daily_close` 或 `us_close`。自動更新與部署流程持續使用既有快照格式。

## 本地預覽與驗證

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

瀏覽 `http://127.0.0.1:8000`。不需要前端建置或外部套件。

```sh
node --test tests/*.test.mjs
node --check assets/market.js
```

手動抓取資料（會更新快照，需要網路）：

```sh
python3 scripts/update_market.py --mode full
```

## 檔案

`index.html` 為單頁入口；`assets/market.css` 為版型；`assets/market.js` 負責呈現與互動；`assets/model.mjs` 負責資料計算；`assets/charts.mjs` 繪製 SVG。後端維持 `scripts/update_market.py` 與 `scripts/catalog.json`。
