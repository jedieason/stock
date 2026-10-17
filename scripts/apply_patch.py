import json
import subprocess
import os

# 1. Load checklist items
with open('data/checklist.json', 'r', encoding='utf-8') as f:
    checklist_items = json.load(f)

print(f"Loaded {len(checklist_items)} checklist items.")

# 2. Read index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 3. Read CSS from patch_dashboard.py
from patch_dashboard import build_patch
css_to_add = build_patch()

# Check </style>
if css_to_add not in html:
    html = html.replace('</style>', css_to_add + '\n</style>', 1)
    print("Added CSS to <style>")
else:
    print("CSS already present")

# 4. Read checklist_module.js
with open('scripts/checklist_module.js', 'r', encoding='utf-8') as f:
    module_code = f.read()

checklist_json_str = json.dumps(checklist_items, ensure_ascii=False)
full_js_block = f"const CHECKLIST_ITEMS = {checklist_json_str};\n\n" + module_code

# 5. Update tabs array
old_tabs = "const tabs=[{id:'overview',label:'市場總覽'},{id:'technical',label:'價格・廣度'},{id:'leverage',label:'籌碼・槓桿'},{id:'global',label:'全球・波動'},{id:'fundamentals',label:'產業・事件'},{id:'factors',label:'68 因子研究庫'},{id:'sources',label:'資料連線'}];"
new_tabs = "const tabs=[{id:'overview',label:'市場總覽'},{id:'checklist',label:'109項檢核表'},{id:'technical',label:'價格・廣度'},{id:'leverage',label:'籌碼・槓桿'},{id:'global',label:'全球・波動'},{id:'fundamentals',label:'產業・事件'},{id:'factors',label:'68 因子研究庫'},{id:'sources',label:'資料連線'}];"

if old_tabs in html:
    html = html.replace(old_tabs, new_tabs, 1)
    print("Updated tabs array.")
elif new_tabs in html:
    print("Tabs array already updated.")
else:
    print("Warning: old_tabs not found.")

# 6. Replace candidate, stages, Regime definitions
target_start = "function candidate(f,b){if(f.close==null||f.ma60==null||f.r5==null||f.calendar_age_days>4)return {stage:null,summary:'等待完整價格與長窗口序列',reasons:[]};"
target_end = "function Candle({allRows=[],symbol='taiex',source,large=false}){"

idx_start = html.find(target_start)
idx_end = html.find(target_end)

if idx_start != -1 and idx_end != -1:
    html = html[:idx_start] + full_js_block + '\n' + html[idx_end:]
    print("Replaced candidate, stages, and Regime with new Checklist & Regime components.")
elif "const CHECKLIST_ITEMS =" in html:
    print("Checklist module already injected, updating module section...")
    c_start = html.find("const CHECKLIST_ITEMS =")
    c_end = html.find(target_end)
    html = html[:c_start] + full_js_block + '\n' + html[c_end:]
    print("Updated Checklist module section.")
else:
    print(f"Error finding candidate/stages slice: idx_start={idx_start}, idx_end={idx_end}")

# 7. Update DashboardContent
target_dc_hook = "const {activeTabId}=dataApp.useDashboardTabs(tabs);const tab=activeTabId||'overview';const data=packet?.data||{},f=packet?.features||{},sources=packet?.sources||[],factors=packet?.factors||[];"
replacement_dc_hook = target_dc_hook + "const { checklist, updateChecklistItem, resetChecklist, stageStats, candidate: chkCandidate } = useChecklist(f, b);"

if target_dc_hook in html and "useChecklist(f, b)" not in html:
    html = html.replace(target_dc_hook, replacement_dc_hook, 1)
    print("Added useChecklist hook to DashboardContent.")
else:
    print("useChecklist hook already present or target not found.")

# Update Regime call in overview tab:
old_regime_call = "jsxRuntime.jsx(Regime, { f: f, b: b, factors: factors,})"
new_regime_call = "jsxRuntime.jsx(Regime, { f: f, b: b, factors: factors, checklist: checklist, onUpdate: updateChecklistItem, stageStats: stageStats, candidate: chkCandidate })"
if old_regime_call in html:
    html = html.replace(old_regime_call, new_regime_call, 1)
    print("Updated Regime call in Overview tab.")
else:
    print("Regime call already updated or not found.")

# Add tab==='checklist' rendering:
target_tab_overview = ", tab==='overview'&&"
new_tab_checklist = ", tab==='checklist'&&jsxRuntime.jsx(ChecklistFullView, { checklist: checklist, onUpdate: updateChecklistItem, onReset: resetChecklist, stageStats: stageStats, candidate: chkCandidate })"
if "tab==='checklist'&&" not in html:
    html = html.replace(target_tab_overview, new_tab_checklist + "\n" + target_tab_overview, 1)
    print("Added checklist tab rendering.")
else:
    print("Checklist tab rendering already present.")

# Add checklist to technical tab:
target_tech_end = 'jsxRuntime.jsx(\'div\', { className: "tm-footnote", children: "完整日線收盤價報酬，非含息總報酬。不同尺度可呈現相反訊號。"})]})]})]})'
tech_chk_addition = ', jsxRuntime.jsx(ChecklistPanel, { id: "tech-checklist", title: "行情階段檢核表 · 價格與市場寬度面向 (34項)", items: checklist.filter(x=>[\'趨勢價格\',\'市場寬度\'].includes(x.aspect)), onUpdate: updateChecklistItem })'
if "id: \"tech-checklist\"" not in html and target_tech_end in html:
    html = html.replace(target_tech_end, target_tech_end[:-3] + tech_chk_addition + ']})', 1)
    print("Added checklist to Technical tab.")
else:
    print("Technical tab checklist already present or target not found.")

# Add checklist to leverage tab:
old_lev = ", tab==='leverage'&&jsxRuntime.jsx(Leverage, { data: data, f: f,})"
new_lev = ''', tab==='leverage'&&jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [jsxRuntime.jsx(Leverage, { data: data, f: f,}), jsxRuntime.jsx(ChecklistPanel, { id: "lev-checklist", title: "行情階段檢核表 · 籌碼與槓桿面向 (17項)", items: checklist.filter(x=>x.aspect==='籌碼槓桿'), onUpdate: updateChecklistItem, defaultAspect: '籌碼槓桿' })] })'''
if old_lev in html:
    html = html.replace(old_lev, new_lev, 1)
    print("Added checklist to Leverage tab.")
else:
    print("Leverage tab already updated or not found.")

# Add checklist to global tab:
old_global = ", tab==='global'&&jsxRuntime.jsx(Global, { data: data, f: f, sources: sources,})"
new_global = ''', tab==='global'&&jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [jsxRuntime.jsx(Global, { data: data, f: f, sources: sources,}), jsxRuntime.jsx(ChecklistPanel, { id: "global-checklist", title: "行情階段檢核表 · 情緒與波動面向 (14項)", items: checklist.filter(x=>x.aspect==='情緒波動'), onUpdate: updateChecklistItem, defaultAspect: '情緒波動' })] })'''
if old_global in html:
    html = html.replace(old_global, new_global, 1)
    print("Added checklist to Global tab.")
else:
    print("Global tab already updated or not found.")

# Add checklist to fundamentals tab:
old_fund = ", tab==='fundamentals'&&jsxRuntime.jsx(Fundamentals, { data: data,})"
new_fund = ''', tab==='fundamentals'&&jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [jsxRuntime.jsx(Fundamentals, { data: data,}), jsxRuntime.jsx(ChecklistPanel, { id: "fund-checklist", title: "行情階段檢核表 · 基本面與敘事面向 (21項)", items: checklist.filter(x=>x.aspect==='基本面敘事'), onUpdate: updateChecklistItem, defaultAspect: '基本面敘事' })] })'''
if old_fund in html:
    html = html.replace(old_fund, new_fund, 1)
    print("Added checklist to Fundamentals tab.")
else:
    print("Fundamentals tab already updated or not found.")

# Write to index.html
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Successfully updated index.html!")
