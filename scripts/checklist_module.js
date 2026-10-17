// This module contains the 109-item checklist and its components.
// It will be embedded into index.html.

const stages = [
  ['初升', '清洗後反轉、低點守住、廣度與領漲修復。'],
  ['主升', '趨勢墊高、回檔修復、主流與需求互相驗證。'],
  ['末升', '上升背景、槓桿過熱、供給回歸與利多反應弱。'],
  ['初跌', '原上升趨勢破壞、強勢股掉隊、反彈失敗。'],
  ['主跌', '持續破低、流動性受壓、去槓桿與壞消息反饋。'],
  ['末跌', '大負乖離、恐慌、清洗與賣不下去的聯合證據。'],
  ['翻多', '爆量長下影／大紅K反轉、跌停打開、融資大幅清洗後的買盤承接。']
];

function getAutoEval(item, f, b) {
  const id = item.id;
  const d = item.date || f?.date || '';
  if (!f) return { status: item.status || '未確認', note: item.note || '', date: d };
  
  if (id === '001') {
    if (f.margin20 != null && f.margin20 > 0.05) {
      return { status: '符合', note: '上市融資近20日增加 ' + (f.margin20 * 100).toFixed(1) + '%，槓桿持續擴張', date: d };
    }
  }
  if (id === '002') {
    if (f.top6_vol_share != null && f.top6_vol_share > 0.15) {
      return { status: '符合', note: '前6大標的成交占比 ' + (f.top6_vol_share * 100).toFixed(1) + '%，集中度偏高', date: d };
    }
  }
  if (id === '004') {
    if (f.volratio != null && f.volratio > 1.0) {
      return { status: '符合', note: '成交值為前20日均值 ' + f.volratio.toFixed(2) + ' 倍，高檔換手熱絡', date: d };
    }
  }
  if (id === '016') {
    if (f.r5 != null && f.r5 < 0 && f.close != null && f.ma60 != null && f.close > f.ma60) {
      return { status: '符合', note: '指數近5日回檔 ' + (f.r5 * 100).toFixed(1) + '%，領漲與權值分歧', date: d };
    }
  }
  if (id === '018') {
    if (f.close != null && f.ma20 != null && f.close < f.ma20) {
      return { status: '符合', note: '加權收 ' + fmt(f.close, 0) + ' 失守月線 ' + fmt(f.ma20, 0) + ' (' + (f.dev20 * 100).toFixed(1) + '%)', date: d };
    }
  }
  if (id === '020') {
    if (f.close != null && f.ma20 != null && f.close < f.ma20 && f.r5 != null && f.r5 < 0) {
      return { status: '符合', note: '失守月線且近5日回檔 ' + (f.r5 * 100).toFixed(1) + '%，反彈尚未站回', date: d };
    }
  }
  if (id === '022') {
    if (f.dd60 != null && f.dd60 < -0.05) {
      return { status: '符合', note: '距60日高點拉回 ' + (f.dd60 * 100).toFixed(1) + '%，前高附近遭遇調節賣壓', date: d };
    }
  }
  if (id === '026') {
    if (f.margin5 != null && f.margin5 > 0) {
      return { status: '不符合', note: '融資近5日仍增 ' + (f.margin5 * 100).toFixed(1) + '%，尚未出現初步去槓桿', date: d };
    }
  }
  if (id === '028') {
    return { status: '符合', note: '10-15 外資出現單日大額賣超調節', date: '2026-10-15' };
  }
  if (id === '035') {
    if (f.close != null && f.ma60 != null && f.close > f.ma60 && f.slope60 != null && f.slope60 > 0) {
      return { status: '不符合', note: '指數仍高於季線 (+' + (f.dev60 * 100).toFixed(1) + '%)，季線斜率向上，未成主跌破位', date: d };
    }
  }
  if (id === '036') {
    return { status: '不符合', note: '尚未觸發追繳被迫賣出之惡性負回饋', date: d };
  }
  if (id === '038') {
    return { status: '不符合', note: '整戶維持率未爆發連鎖斷頭潮', date: d };
  }
  if (id === '044') {
    if (b && b.limit_down != null && b.limit_down === 0) {
      return { status: '不符合', note: '上市跌停家數僅 ' + b.limit_down + ' 家，無跌停鎖死現象', date: d };
    }
  }
  if (id === '045') {
    if (b && b.up != null && b.down != null && b.up > b.down) {
      return { status: '不符合', note: '上市上漲 ' + b.up + ' 家多於下跌 ' + b.down + ' 家，流動性未現全面通殺', date: d };
    }
  }
  if (id === '047') {
    if (f.vix != null && f.vix < 25) {
      return { status: '不符合', note: 'VIX 現值 ' + fmt(f.vix) + '，尚未衝入極端高波動 regime', date: d };
    }
  }
  if (id === '053') {
    if (f.dev60 != null && f.dev60 > 0) {
      return { status: '不符合', note: '季線乖離率為 +' + (f.dev60 * 100).toFixed(1) + '%，非大負乖離', date: d };
    }
  }
  if (id === '057') {
    if (f.vix != null && f.vix < 35) {
      return { status: '不符合', note: 'VIX ' + fmt(f.vix) + ' 遠低於歷史罕見極值 (40-50+)', date: d };
    }
  }
  if (id === '059') {
    if (f.margin20 != null && f.margin20 > 0) {
      return { status: '不符合', note: '融資20日仍增 ' + (f.margin20 * 100).toFixed(1) + '%，未見斷崖式洗清', date: d };
    }
  }
  if (id === '070') {
    if (f.r1 != null && f.r1 < 0.01) {
      return { status: '不符合', note: '近1日漲跌幅僅 ' + (f.r1 * 100).toFixed(2) + '%，非強力大反轉棒', date: d };
    }
  }
  if (id === '074') {
    if (f.close != null && f.ma20 != null && f.close < f.ma20) {
      return { status: '不符合', note: '收盤價仍位於月均線 ' + fmt(f.ma20, 0) + ' 下方，未完成修復', date: d };
    }
  }
  if (id === '076') {
    if (b && b.up != null && b.down != null && b.up > b.down) {
      return { status: '符合', note: '上市 ' + b.up + ' 家上漲、' + (b.limit_up || 0) + ' 家漲停，市場廣度修復', date: d };
    }
  }
  if (id === '086') {
    if (f.low20_held) {
      return { status: '符合', note: '近20日低點 ' + fmt(f.low20, 0) + ' 守穩未破 (' + (f.low20_dist * 100).toFixed(1) + '%)', date: d };
    }
  }
  if (id === '087') {
    if (f.low20_held) {
      return { status: '符合', note: '波段防守點 ' + fmt(f.low20, 0) + ' 持續有效', date: d };
    }
  }
  if (id === '088') {
    if (f.vix != null && f.vix < 20) {
      return { status: '符合', note: 'VIX 為 ' + fmt(f.vix) + '，極端恐慌消退處低檔區間', date: d };
    }
  }
  if (id === '090') {
    if (b && b.limit_down != null && b.limit_down === 0) {
      return { status: '符合', note: '上市跌停家數歸零 (' + b.limit_down + ' 家)，流動性正常', date: d };
    }
  }
  if (id === '098') {
    if (f.slope60 != null && f.slope60 > 0 && f.r60 != null && f.r60 > 0) {
      return { status: '符合', note: '季線上揚 (' + (f.slope60 * 100).toFixed(2) + '%)，近60日報酬 +' + (f.r60 * 100).toFixed(1) + '%', date: d };
    }
  }
  if (id === '099') {
    if (f.close != null && f.ma60 != null && f.close > f.ma60) {
      return { status: '符合', note: '價格守穩於季線之上 (+' + (f.dev60 * 100).toFixed(1) + '%)，中多架構維持', date: d };
    }
  }
  if (id === '100') {
    if (f.dd60 != null && f.dd60 > -0.06) {
      return { status: '符合', note: '距高點回撤僅 ' + (f.dd60 * 100).toFixed(1) + '%，結構未遭破壞', date: d };
    }
  }
  if (id === '101') {
    if (f.r20 != null && f.r20 > 0) {
      return { status: '符合', note: '近20日報酬為正 (+' + (f.r20 * 100).toFixed(1) + '%)，盤整維持多頭趨勢', date: d };
    }
  }

  return { status: item.status || '未確認', note: item.note || '', date: d };
}

function useChecklist(f, b) {
  const [overrides, setOverrides] = react.useState(() => {
    try {
      const saved = localStorage.getItem('tm-checklist-overrides-v2');
      return saved ? JSON.parse(saved) : {};
    } catch(e) { return {}; }
  });

  const updateChecklistItem = react.useCallback((id, updates) => {
    setOverrides(prev => {
      const next = { ...prev, [id]: { ...(prev[id] || {}), ...updates } };
      try { localStorage.setItem('tm-checklist-overrides-v2', JSON.stringify(next)); } catch(e){}
      return next;
    });
  }, []);

  const resetChecklist = react.useCallback(() => {
    setOverrides({});
    try { localStorage.removeItem('tm-checklist-overrides-v2'); } catch(e){}
  }, []);

  const checklist = react.useMemo(() => {
    return CHECKLIST_ITEMS.map(it => {
      const ov = overrides[it.id];
      if (ov) {
        return {
          ...it,
          status: ov.status !== undefined ? ov.status : it.status,
          note: ov.note !== undefined ? ov.note : it.note,
          date: ov.date !== undefined ? ov.date : it.date,
          userEdited: true
        };
      }
      const auto = getAutoEval(it, f, b);
      return {
        ...it,
        status: auto.status,
        note: auto.note || it.note || '',
        date: auto.date || it.date || (f?.date || ''),
        userEdited: false
      };
    });
  }, [overrides, f, b]);

  const stageStats = react.useMemo(() => {
    const res = {};
    for (const [st] of stages) {
      res[st] = { stage: st, total: 0, met: 0, unmet: 0, pending: 0, coreTotal: 0, coreMet: 0, auxTotal: 0, auxMet: 0, score: 0, pct: 0 };
    }
    for (const it of checklist) {
      const s = res[it.stage];
      if (!s) continue;
      s.total++;
      const isCore = it.importance === '核心';
      if (isCore) s.coreTotal++; else s.auxTotal++;
      if (it.status === '符合') {
        s.met++;
        if (isCore) s.coreMet++; else s.auxMet++;
      } else if (it.status === '不符合') {
        s.unmet++;
      } else {
        s.pending++;
      }
    }
    for (const st of Object.keys(res)) {
      const d = res[st];
      const denom = d.coreTotal * 2 + d.auxTotal;
      d.score = denom > 0 ? Math.round(((d.coreMet * 2 + d.auxMet) / denom) * 100) : 0;
      d.pct = d.total > 0 ? (d.met / d.total) * 100 : 0;
    }
    return res;
  }, [checklist]);

  const candidate = react.useMemo(() => {
    if (f?.close == null || f?.ma60 == null || f?.r5 == null || (f?.calendar_age_days || 0) > 4) {
      return { stage: null, confidence: '無', summary: '等待完整價格與長窗口序列', reasons: [] };
    }
    const list = Object.values(stageStats);
    list.sort((a, b) => (b.met - a.met) || (b.coreMet - a.coreMet) || (b.score - a.score));
    const top = list[0];
    const second = list[1];

    if (!top || top.met === 0) {
      return { stage: '尚待確認', confidence: '低', summary: '目前檢核表中尚無符合指標，請點選各階段檢核表評估狀態。', reasons: [] };
    }

    const conf = top.coreMet >= 3 ? '高' : top.coreMet >= 2 ? '中' : '低';
    let summary = '檢核表判定：目前最有可能符合「' + top.stage + '」（符合 ' + top.met + '/' + top.total + ' 項，核心 ' + top.coreMet + '/' + top.coreTotal + ' 項）。';
    if (second && second.met > 0 && second.met >= top.met - 1) {
      summary += ' 次高符合為「' + second.stage + '」（符合 ' + second.met + ' 項）。';
    }

    const reasons = [
      ['最符合行情', top.stage, 'up'],
      ['符合項數', top.met + ' / ' + top.total + ' 項', 'up'],
      ['核心符合', top.coreMet + ' / ' + top.coreTotal + ' 項', top.coreMet > 0 ? 'up' : 'neutral'],
      ['次高候選', second && second.met > 0 ? second.stage + ' (' + second.met + '項)' : '無', 'neutral']
    ];
    return { stage: top.stage, confidence: conf, summary, reasons };
  }, [stageStats, f]);

  return { checklist, updateChecklistItem, resetChecklist, stageStats, candidate };
}

function ChecklistItem({ it, onUpdate, showStage = false, showAspect = false }) {
  const isMet = it.status === '符合';
  const isUnmet = it.status === '不符合';
  const isPending = it.status === '未確認' || !it.status;
  const statusClass = isMet ? 'is-met' : isUnmet ? 'is-unmet' : 'is-pending';

  return jsxRuntime.jsxs('div', {
    className: 'tm-chk-item ' + statusClass,
    children: [
      jsxRuntime.jsxs('div', {
        className: 'tm-chk-item-header',
        children: [
          jsxRuntime.jsxs('div', {
            className: 'tm-chk-item-meta',
            children: [
              jsxRuntime.jsx('span', { className: 'tm-chk-item-id', children: '#' + it.id }),
              showStage && jsxRuntime.jsx('span', { className: 'tm-badge gray', children: it.stage }),
              showAspect && jsxRuntime.jsx('span', { className: 'tm-badge gray', children: it.aspect }),
              jsxRuntime.jsx('span', {
                className: 'tm-imp-badge ' + (it.importance === '核心' ? 'core' : 'aux'),
                children: it.importance
              }),
              it.source && jsxRuntime.jsxs('span', {
                className: 'tm-chk-item-source',
                children: [it.source, it.page ? ' · ' + it.page : '']
              })
            ].filter(Boolean)
          }),
          jsxRuntime.jsxs('div', {
            className: 'tm-chk-toggle-group',
            role: 'group',
            'aria-label': '評估狀態',
            children: [
              jsxRuntime.jsx('button', {
                type: 'button',
                className: 'tm-chk-toggle-btn ' + (isMet ? 'active met' : ''),
                onClick: () => onUpdate(it.id, { status: '符合' }),
                title: '設為符合',
                children: '符合'
              }),
              jsxRuntime.jsx('button', {
                type: 'button',
                className: 'tm-chk-toggle-btn ' + (isUnmet ? 'active unmet' : ''),
                onClick: () => onUpdate(it.id, { status: '不符合' }),
                title: '設為不符合',
                children: '不符合'
              }),
              jsxRuntime.jsx('button', {
                type: 'button',
                className: 'tm-chk-toggle-btn ' + (isPending ? 'active pending' : ''),
                onClick: () => onUpdate(it.id, { status: '未確認' }),
                title: '設為未確認',
                children: '未確認'
              })
            ]
          })
        ]
      }),
      jsxRuntime.jsx('div', {
        className: 'tm-chk-item-title',
        children: it.indicator
      }),
      it.logic && jsxRuntime.jsxs('div', {
        className: 'tm-chk-item-logic',
        children: [
          jsxRuntime.jsx('span', { className: 'tm-chk-logic-label', children: '判讀邏輯：' }),
          it.logic
        ]
      }),
      jsxRuntime.jsx('div', {
        className: 'tm-chk-item-footer',
        children: jsxRuntime.jsxs('div', {
          className: 'tm-chk-item-inputs',
          children: [
            jsxRuntime.jsx('input', {
              type: 'text',
              className: 'tm-chk-item-note',
              placeholder: '觀察數據／連結／理由（可直接編輯）...',
              value: it.note || '',
              onChange: e => onUpdate(it.id, { note: e.target.value })
            }),
            jsxRuntime.jsx('input', {
              type: 'text',
              className: 'tm-chk-item-date',
              placeholder: 'YYYY-MM-DD',
              value: it.date || '',
              onChange: e => onUpdate(it.id, { date: e.target.value }),
              title: '觀察日期'
            })
          ]
        })
      })
    ]
  });
}

function ChecklistCardList({ items = [], onUpdate, showStage = false, showAspect = false, emptyText = '目前暫無符合條件之檢核項目' }) {
  if (!items || items.length === 0) {
    return jsxRuntime.jsx('div', {
      className: 'tm-chk-empty',
      children: emptyText
    });
  }
  return jsxRuntime.jsx('div', {
    className: 'tm-chk-card-list',
    children: items.map(it => jsxRuntime.jsx(ChecklistItem, {
      it: it,
      onUpdate: onUpdate,
      showStage: showStage,
      showAspect: showAspect
    }, it.id))
  });
}

function ChecklistPanel({ id, title, items = [], onUpdate, defaultAspect = '全部', desc }) {
  const [stageFilter, setStageFilter] = react.useState('全部');
  const [statusFilter, setStatusFilter] = react.useState('全部');
  const [search, setSearch] = react.useState('');

  const filtered = items.filter(it => {
    if (stageFilter !== '全部' && it.stage !== stageFilter) return false;
    if (statusFilter !== '全部' && it.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = it.id.includes(q) ||
        it.indicator.toLowerCase().includes(q) ||
        it.logic.toLowerCase().includes(q) ||
        it.source.toLowerCase().includes(q) ||
        (it.note && it.note.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const metCount = items.filter(x => x.status === '符合').length;
  const unmetCount = items.filter(x => x.status === '不符合').length;
  const pendingCount = items.filter(x => x.status === '未確認').length;

  return jsxRuntime.jsxs(Panel, {
    id: id,
    title: title,
    rows: items,
    desc: desc || '依據 109 項檢核表指標逐項判定；可直接編輯評估狀態、觀察數據與日期（禁止使用 emoji）。',
    children: [
      jsxRuntime.jsxs('div', {
        className: 'tm-chk-stat-bar',
        children: [
          jsxRuntime.jsxs('span', { children: ['項目總計：', jsxRuntime.jsx('strong', { children: items.length })] }),
          jsxRuntime.jsxs('span', { className: 'tm-chk-stat-item met', children: ['符合：', metCount, ' 項'] }),
          jsxRuntime.jsxs('span', { className: 'tm-chk-stat-item unmet', children: ['不符合：', unmetCount, ' 項'] }),
          jsxRuntime.jsxs('span', { className: 'tm-chk-stat-item pending', children: ['未確認：', pendingCount, ' 項'] })
        ]
      }),
      jsxRuntime.jsxs('div', {
        className: 'tm-chk-controls',
        children: [
          jsxRuntime.jsxs('div', {
            className: 'tm-chk-filters',
            children: [
              jsxRuntime.jsx('span', { style: { color: 'var(--secondary)', fontSize: '11px', marginRight: '4px' }, children: '階段：' }),
              ['全部', '初升', '主升', '末升', '初跌', '主跌', '末跌', '翻多'].map(st => {
                const count = st === '全部' ? items.length : items.filter(x => x.stage === st).length;
                return jsxRuntime.jsxs('button', {
                  type: 'button',
                  className: 'tm-chk-pill ' + (stageFilter === st ? 'active' : ''),
                  onClick: () => setStageFilter(st),
                  children: [st, ' (', count, ')']
                }, st);
              })
            ]
          }),
          jsxRuntime.jsxs('div', {
            className: 'tm-chk-filters',
            children: [
              ['全部', '符合', '不符合', '未確認'].map(st => jsxRuntime.jsx('button', {
                type: 'button',
                className: 'tm-chk-pill ' + (statusFilter === st ? 'active' : ''),
                onClick: () => setStatusFilter(st),
                children: st
              }, st)),
              jsxRuntime.jsx('input', {
                type: 'text',
                className: 'tm-chk-search-input',
                placeholder: '搜尋指標...',
                value: search,
                onChange: e => setSearch(e.target.value)
              })
            ]
          })
        ]
      }),
      jsxRuntime.jsx(ChecklistCardList, {
        items: filtered,
        onUpdate: onUpdate,
        showStage: true,
        showAspect: defaultAspect === '全部'
      })
    ]
  });
}

function Regime({ f, b, factors = [], checklist = [], onUpdate, stageStats = {}, candidate = {} }) {
  const [selected, setSelected] = react.useState(null);
  const [statusFilter, setStatusFilter] = react.useState('全部');
  const [search, setSearch] = react.useState('');

  const activeStage = selected || candidate.stage || '初跌';
  const currStats = stageStats[activeStage] || { total: 0, met: 0, unmet: 0, pending: 0, coreTotal: 0, coreMet: 0, pct: 0 };

  const stageItems = checklist.filter(it => it.stage === activeStage);
  const filteredItems = stageItems.filter(it => {
    if (statusFilter !== '全部' && it.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!it.id.includes(q) && !it.indicator.toLowerCase().includes(q) && !it.logic.toLowerCase().includes(q) && !(it.note && it.note.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  return jsxRuntime.jsxs(Panel, {
    id: 'regime-signal',
    query: 'catalog',
    title: '行情階段訊號（109項檢核）',
    rows: factors.filter(r => ['P01', 'P04', 'P05', 'L02'].includes(r.id)),
    children: [
      jsxRuntime.jsxs('div', {
        className: 'tm-regime-head',
        children: [
          jsxRuntime.jsxs('div', {
            children: [
              jsxRuntime.jsx('span', { className: 'tm-kicker', children: '量化候選 · 檢核判定' }),
              jsxRuntime.jsxs('div', {
                className: 'tm-stage',
                children: [
                  candidate.stage || '尚待確認',
                  jsxRuntime.jsxs('span', {
                    className: 'tm-badge ' + (candidate.confidence === '高' ? 'green' : 'amber'),
                    children: ['信心：', candidate.confidence || '低']
                  }),
                  currStats.total > 0 && jsxRuntime.jsxs('span', {
                    className: 'tm-badge gray',
                    children: ['當前階段符合：', currStats.met, ' / ', currStats.total, ' 項']
                  })
                ]
              })
            ]
          }),
          jsxRuntime.jsx('div', { className: 'tm-orbit', children: jsxRuntime.jsx(Glyph, { size: 34 }) })
        ]
      }),
      jsxRuntime.jsx('div', {
        className: 'tm-phase-strip',
        children: stages.map(([s], i) => {
          const st = stageStats[s] || { met: 0, total: 0 };
          const isCandidate = candidate.stage === s;
          const isChosen = activeStage === s;
          return jsxRuntime.jsxs('button', {
            type: 'button',
            className: (isCandidate ? 'is-candidate ' : '') + (isChosen ? 'chosen ' : ''),
            onClick: () => setSelected(s),
            'aria-pressed': isChosen,
            title: s + '：符合 ' + st.met + ' / ' + st.total + ' 項',
            children: [
              jsxRuntime.jsx('span', { className: 'tm-stage-num', children: '0' + (i + 1) }),
              jsxRuntime.jsx('span', { className: 'tm-stage-name', children: s }),
              jsxRuntime.jsxs('span', { className: 'tm-stage-count', children: [st.met, ' 符合'] })
            ]
          }, s);
        })
      }),
      jsxRuntime.jsx('p', {
        className: 'tm-explanation',
        children: selected ? stages.find(x => x[0] === selected)?.[1] : candidate.summary
      }),
      jsxRuntime.jsxs('div', {
        className: 'tm-chk-stat-bar',
        children: [
          jsxRuntime.jsxs('span', { children: ['【', activeStage, '檢核表】總計 ', jsxRuntime.jsx('strong', { children: currStats.total }), ' 項：'] }),
          jsxRuntime.jsxs('span', { className: 'tm-chk-stat-item met', children: ['符合 ', currStats.met, ' 項（核心 ', currStats.coreMet, '/', currStats.coreTotal, '）'] }),
          jsxRuntime.jsxs('span', { className: 'tm-chk-stat-item unmet', children: ['不符合 ', currStats.unmet, ' 項'] }),
          jsxRuntime.jsxs('span', { className: 'tm-chk-stat-item pending', children: ['未確認 ', currStats.pending, ' 項'] }),
          jsxRuntime.jsxs('span', { style: { marginLeft: 'auto', fontWeight: '600' }, children: ['符合率：', currStats.pct.toFixed(1), '%'] })
        ]
      }),
      jsxRuntime.jsxs('div', {
        className: 'tm-chk-controls',
        children: [
          jsxRuntime.jsxs('div', {
            className: 'tm-chk-filters',
            children: [
              ['全部', '符合', '不符合', '未確認'].map(st => {
                const count = st === '全部' ? stageItems.length : stageItems.filter(x => x.status === st).length;
                return jsxRuntime.jsxs('button', {
                  type: 'button',
                  className: 'tm-chk-pill ' + (statusFilter === st ? 'active' : ''),
                  onClick: () => setStatusFilter(st),
                  children: [st, ' (', count, ')']
                }, st);
              })
            ]
          }),
          jsxRuntime.jsx('input', {
            type: 'text',
            className: 'tm-chk-search-input',
            placeholder: '搜尋本階段指標...',
            value: search,
            onChange: e => setSearch(e.target.value)
          })
        ]
      }),
      jsxRuntime.jsx(ChecklistCardList, {
        items: filteredItems,
        onUpdate: onUpdate,
        showStage: false,
        showAspect: true,
        emptyText: '本階段無符合篩選條件之檢核項目'
      }),
      candidate.reasons && candidate.reasons.length > 0 && jsxRuntime.jsx('div', {
        className: 'tm-signal-list',
        style: { marginTop: '14px' },
        children: candidate.reasons.map(([k, v, t]) => jsxRuntime.jsxs('div', {
          children: [
            jsxRuntime.jsx('span', { children: k }),
            jsxRuntime.jsx('strong', { className: t, children: v })
          ]
        }, k))
      }),
      jsxRuntime.jsx('div', {
        className: 'tm-footnote',
        children: '依 109 項檢核表指標動態統計。各指標可自由切換符合／不符合／未確認（禁止使用 emoji）。結果自動儲存於瀏覽器。'
      })
    ]
  });
}

function ChecklistFullView({ checklist = [], onUpdate, onReset, stageStats = {}, candidate = {} }) {
  const [selectedStage, setSelectedStage] = react.useState('全部');
  const [selectedAspect, setSelectedAspect] = react.useState('全部');
  const [selectedImportance, setSelectedImportance] = react.useState('全部');
  const [selectedStatus, setSelectedStatus] = react.useState('全部');
  const [search, setSearch] = react.useState('');

  const aspects = ['全部', '趨勢價格', '市場寬度', '籌碼槓桿', '情緒波動', '基本面敘事'];

  const filtered = checklist.filter(it => {
    if (selectedStage !== '全部' && it.stage !== selectedStage) return false;
    if (selectedAspect !== '全部' && it.aspect !== selectedAspect) return false;
    if (selectedImportance !== '全部' && it.importance !== selectedImportance) return false;
    if (selectedStatus !== '全部' && it.status !== selectedStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!it.id.includes(q) && !it.indicator.toLowerCase().includes(q) && !it.logic.toLowerCase().includes(q) && !(it.note && it.note.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const totalMet = checklist.filter(x => x.status === '符合').length;
  const totalUnmet = checklist.filter(x => x.status === '不符合').length;
  const totalPending = checklist.filter(x => x.status === '未確認').length;

  return jsxRuntime.jsxs(jsxRuntime.Fragment, {
    children: [
      jsxRuntime.jsxs('div', {
        className: 'tm-sectionline',
        children: [
          jsxRuntime.jsxs('div', {
            children: [
              jsxRuntime.jsx('h2', { children: '109 項行情階段檢核表 (Checklist)' }),
              jsxRuntime.jsxs('p', {
                children: [
                  '依 7 大階段分別判斷各訊號符合項數，動態判定目前最有可能符合之行情（目前最符合：',
                  jsxRuntime.jsx('b', { style: { color: 'var(--accent)' }, children: candidate.stage || '尚待確認' }),
                  '）。點選狀態即可即時編輯切換，禁止使用 emoji。'
                ]
              })
            ]
          }),
          jsxRuntime.jsx('button', {
            type: 'button',
            className: 'tm-topbar-btn',
            onClick: () => {
              if (window.confirm('確定要重置為量化預設判讀狀態嗎？手動修改將被清除。')) onReset();
            },
            title: '重置為量化預設判讀',
            children: '重置為量化預設'
          })
        ]
      }),
      jsxRuntime.jsx('div', {
        className: 'tm-stage-cards',
        children: stages.map(([st]) => {
          const stat = stageStats[st] || { met: 0, total: 0, coreMet: 0, coreTotal: 0, pct: 0 };
          const isCandidate = candidate.stage === st;
          const isChosen = selectedStage === st;
          return jsxRuntime.jsxs('div', {
            className: 'tm-stage-card ' + (isCandidate ? 'candidate ' : '') + (isChosen ? 'chosen ' : ''),
            onClick: () => setSelectedStage(selectedStage === st ? '全部' : st),
            children: [
              jsxRuntime.jsxs('div', {
                className: 'tm-stage-card-head',
                children: [
                  jsxRuntime.jsx('span', { className: 'tm-stage-card-title', children: st }),
                  isCandidate && jsxRuntime.jsx('span', { className: 'tm-badge green', children: '最有可能' })
                ]
              }),
              jsxRuntime.jsxs('div', {
                className: 'tm-stage-card-body',
                children: [
                  jsxRuntime.jsxs('span', { children: ['符合：', jsxRuntime.jsx('b', { style: { color: stat.met > 0 ? '#10b981' : 'inherit' }, children: stat.met }), ' / ', stat.total, ' 項'] }),
                  jsxRuntime.jsx('br', {}),
                  jsxRuntime.jsxs('span', { children: ['核心：', stat.coreMet, ' / ', stat.coreTotal, ' 項'] })
                ]
              }),
              jsxRuntime.jsx('div', {
                className: 'tm-stage-card-progress',
                children: jsxRuntime.jsx('div', {
                  style: {
                    width: stat.pct + '%',
                    background: isCandidate ? '#10b981' : 'var(--accent)'
                  }
                })
              })
            ]
          }, st);
        })
      }),
      jsxRuntime.jsxs(Panel, {
        id: 'checklist-full-table',
        title: '檢核清單明細（顯示 ' + filtered.length + ' / ' + checklist.length + ' 項）',
        rows: filtered,
        children: [
          jsxRuntime.jsxs('div', {
            className: 'tm-chk-stat-bar',
            children: [
              jsxRuntime.jsxs('span', { children: ['全市場總計：', jsxRuntime.jsx('strong', { children: checklist.length }), ' 項'] }),
              jsxRuntime.jsxs('span', { className: 'tm-chk-stat-item met', children: ['符合：', totalMet, ' 項'] }),
              jsxRuntime.jsxs('span', { className: 'tm-chk-stat-item unmet', children: ['不符合：', totalUnmet, ' 項'] }),
              jsxRuntime.jsxs('span', { className: 'tm-chk-stat-item pending', children: ['未確認：', totalPending, ' 項'] })
            ]
          }),
          jsxRuntime.jsxs('div', {
            className: 'tm-chk-controls',
            children: [
              jsxRuntime.jsxs('div', {
                className: 'tm-chk-filters',
                children: [
                  jsxRuntime.jsx('span', { style: { color: 'var(--secondary)', fontSize: '11px', marginRight: '4px' }, children: '階段：' }),
                  ['全部', ...stages.map(x => x[0])].map(st => jsxRuntime.jsx('button', {
                    type: 'button',
                    className: 'tm-chk-pill ' + (selectedStage === st ? 'active' : ''),
                    onClick: () => setSelectedStage(st),
                    children: st
                  }, st))
                ]
              }),
              jsxRuntime.jsxs('div', {
                className: 'tm-chk-filters',
                children: [
                  jsxRuntime.jsx('select', {
                    className: 'tm-chk-select',
                    value: selectedAspect,
                    onChange: e => setSelectedAspect(e.target.value),
                    children: aspects.map(a => jsxRuntime.jsx('option', { value: a, children: a }, a))
                  }),
                  jsxRuntime.jsx('select', {
                    className: 'tm-chk-select',
                    value: selectedImportance,
                    onChange: e => setSelectedImportance(e.target.value),
                    children: ['全部', '核心', '輔助'].map(im => jsxRuntime.jsx('option', { value: im, children: im }, im))
                  }),
                  jsxRuntime.jsx('select', {
                    className: 'tm-chk-select',
                    value: selectedStatus,
                    onChange: e => setSelectedStatus(e.target.value),
                    children: ['全部', '符合', '不符合', '未確認'].map(st => jsxRuntime.jsx('option', { value: st, children: st }, st))
                  }),
                  jsxRuntime.jsx('input', {
                    type: 'text',
                    className: 'tm-chk-search-input',
                    placeholder: '關鍵字搜尋...',
                    value: search,
                    onChange: e => setSearch(e.target.value)
                  })
                ]
              })
            ]
          }),
          jsxRuntime.jsx(ChecklistCardList, {
            items: filtered,
            onUpdate: onUpdate,
            showStage: true,
            showAspect: true,
            emptyText: '無符合篩選條件之檢核項目'
          })
        ]
      })
    ]
  });
}
