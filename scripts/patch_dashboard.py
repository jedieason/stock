import json
import re

def build_patch():
    # Load checklist items
    with open('data/checklist.json', 'r', encoding='utf-8') as f:
        checklist_items = json.load(f)

    # 1. CSS to add
    css_to_add = """
/* === 行情階段 109 項檢核表樣式 (嚴禁任何 emoji) === */
.tm-chk-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  letter-spacing: 0.5px;
}
.tm-chk-tag.met {
  color: #10b981 !important;
  background: rgba(16, 185, 129, 0.12) !important;
  border: 1px solid rgba(16, 185, 129, 0.35) !important;
}
.tm-chk-tag.unmet {
  color: #ef4444 !important;
  background: rgba(239, 68, 68, 0.12) !important;
  border: 1px solid rgba(239, 68, 68, 0.35) !important;
}
.tm-chk-tag.pending {
  color: var(--secondary) !important;
  background: rgba(132, 147, 170, 0.1) !important;
  border: 1px solid rgba(132, 147, 170, 0.25) !important;
}
html[data-theme="light"] .tm-chk-tag.met {
  background: #ecfdf5 !important;
  color: #059669 !important;
  border-color: #a7f3d0 !important;
}
html[data-theme="light"] .tm-chk-tag.unmet {
  background: #fef2f2 !important;
  color: #dc2626 !important;
  border-color: #fecaca !important;
}
html[data-theme="light"] .tm-chk-tag.pending {
  background: #f1f5f9 !important;
  color: #64748b !important;
  border-color: #cbd5e1 !important;
}

.tm-chk-btn-group {
  display: inline-flex;
  align-items: center;
  background: var(--control);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px;
  gap: 2px;
}
.tm-chk-btn {
  padding: 3px 7px;
  font-size: 11px;
  border-radius: 3px;
  border: none;
  background: transparent;
  color: var(--secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
}
.tm-chk-btn:hover {
  color: var(--text);
  background: var(--control-hover);
}
.tm-chk-btn.active.met {
  background: rgba(16, 185, 129, 0.22) !important;
  color: #10b981 !important;
  font-weight: 700 !important;
}
.tm-chk-btn.active.unmet {
  background: rgba(239, 68, 68, 0.22) !important;
  color: #ef4444 !important;
  font-weight: 700 !important;
}
.tm-chk-btn.active.pending {
  background: rgba(132, 147, 170, 0.22) !important;
  color: var(--text) !important;
  font-weight: 700 !important;
}
html[data-theme="light"] .tm-chk-btn-group {
  background: #f8fafc;
  border-color: #e2e8f0;
}
html[data-theme="light"] .tm-chk-btn:hover {
  background: #f1f5f9;
}
html[data-theme="light"] .tm-chk-btn.active.met {
  background: #d1fae5 !important;
  color: #065f46 !important;
}
html[data-theme="light"] .tm-chk-btn.active.unmet {
  background: #fee2e2 !important;
  color: #991b1b !important;
}
html[data-theme="light"] .tm-chk-btn.active.pending {
  background: #e2e8f0 !important;
  color: #1e293b !important;
}

.tm-chk-input {
  width: 100%;
  min-width: 140px;
  padding: 4px 8px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--text);
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.15s ease;
}
.tm-chk-input:focus {
  outline: none;
  border-color: var(--accent);
}
.tm-chk-date {
  width: 90px;
  padding: 4px 6px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--text);
  box-sizing: border-box;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
}
.tm-chk-date:focus {
  outline: none;
  border-color: var(--accent);
}
html[data-theme="light"] .tm-chk-input, html[data-theme="light"] .tm-chk-date {
  background: #ffffff !important;
  border-color: #cbd5e1 !important;
  color: #0f172a !important;
}

.tm-imp-badge {
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 3px;
  font-weight: 600;
  display: inline-block;
  white-space: nowrap;
}
.tm-imp-badge.core {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
  border: 1px solid rgba(234, 179, 8, 0.35);
}
.tm-imp-badge.aux {
  background: rgba(132, 147, 170, 0.1);
  color: var(--secondary);
  border: 1px solid var(--border);
}
html[data-theme="light"] .tm-imp-badge.core {
  background: #fef9c3;
  color: #854d0e;
  border-color: #fde047;
}

.tm-chk-table-wrap {
  width: 100%;
  overflow-x: auto;
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  max-height: 480px;
}
.tm-chk-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  line-height: 1.5;
}
.tm-chk-table th {
  text-align: left;
  padding: 8px 10px;
  font-weight: 600;
  color: var(--secondary);
  border-bottom: 1px solid var(--border-strong);
  background: var(--surface);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 2;
}
.tm-chk-table td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.tm-chk-table tr:last-child td {
  border-bottom: none;
}
.tm-chk-table tr:hover {
  background: var(--control-hover);
}
.tm-chk-table tr.is-met {
  background: rgba(16, 185, 129, 0.04);
}
.tm-chk-table tr.is-unmet {
  background: rgba(239, 68, 68, 0.04);
}

.tm-chk-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  margin-bottom: 8px;
}
.tm-chk-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.tm-chk-pill {
  padding: 3px 8px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}
.tm-chk-pill:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.tm-chk-pill.active {
  background: var(--surface-raised);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
html[data-theme="light"] .tm-chk-pill.active {
  background: #f0fdf4;
  border-color: #0284c7;
  color: #0284c7;
}

.tm-chk-stat-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  background: var(--control);
  border-radius: 6px;
  font-size: 11px;
  color: var(--secondary);
  margin-top: 8px;
}
.tm-chk-stat-bar strong {
  color: var(--text);
  font-size: 12px;
}
.tm-chk-stat-item.met { color: #10b981; font-weight: 600; }
.tm-chk-stat-item.unmet { color: #ef4444; font-weight: 600; }
.tm-chk-stat-item.pending { color: var(--secondary); }

.tm-stage-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.tm-stage-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}
.tm-stage-card:hover {
  border-color: var(--border-strong);
  background: var(--surface-raised);
}
.tm-stage-card.chosen {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.tm-stage-card.candidate {
  border-left: 3px solid #10b981;
}
.tm-stage-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.tm-stage-card-title {
  font-size: 13px;
  font-weight: 600;
}
.tm-stage-card-body {
  font-size: 11px;
  color: var(--secondary);
}
.tm-stage-card-progress {
  height: 4px;
  border-radius: 2px;
  background: var(--muted);
  overflow: hidden;
  margin-top: 6px;
  display: flex;
}
.tm-stage-card-progress > div {
  height: 100%;
}
.tm-phase-strip button.candidate-stage {
  border-bottom: 2px solid #10b981;
}
.tm-phase-strip button small {
  display: block;
  font-size: 9px;
  opacity: 0.85;
}
"""

    return css_to_add

if __name__ == '__main__':
    print('Testing CSS syntax...')
    css = build_patch()
    print('CSS length:', len(css))
