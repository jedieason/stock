def build_patch():
    css = """
/* === 行情階段 109 項檢核表樣式 (Google 極簡優雅風 · 無內嵌捲動 · 嚴禁 emoji) === */
.tm-chk-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 14px;
  white-space: nowrap;
  letter-spacing: 0.3px;
}
.tm-chk-tag.met {
  color: #10b981 !important;
  background: rgba(16, 185, 129, 0.12) !important;
  border: 1px solid rgba(16, 185, 129, 0.3) !important;
}
.tm-chk-tag.unmet {
  color: #ef4444 !important;
  background: rgba(239, 68, 68, 0.12) !important;
  border: 1px solid rgba(239, 68, 68, 0.3) !important;
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

/* Phase Strip: Google Material 3 Segmented Control / Cards */
.tm-phase-strip {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  margin: 14px 0 10px 0;
}
@media (max-width: 900px) {
  .tm-phase-strip {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 520px) {
  .tm-phase-strip {
    grid-template-columns: repeat(2, 1fr);
  }
}
.tm-phase-strip button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 4px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 8px;
  color: var(--secondary);
  cursor: pointer;
  transition: all 0.16s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  min-height: 56px;
  user-select: none;
  text-align: center;
  border-bottom: 1px solid var(--border) !important;
}
.tm-phase-strip button:hover {
  background: var(--surface-raised);
  border-color: var(--border-strong);
  color: var(--text);
}
.tm-phase-strip button .tm-stage-num {
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--secondary);
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}
.tm-phase-strip button .tm-stage-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.2;
}
.tm-phase-strip button .tm-stage-count {
  font-size: 10px;
  color: var(--secondary);
  margin-top: 3px;
  font-weight: 500;
}
.tm-phase-strip button.chosen {
  border-color: var(--accent) !important;
  background: var(--surface-raised) !important;
  box-shadow: 0 0 0 1px var(--accent) !important;
}
.tm-phase-strip button.chosen .tm-stage-name {
  color: var(--accent) !important;
}
.tm-phase-strip button.is-candidate {
  border-color: rgba(16, 185, 129, 0.6) !important;
}
.tm-phase-strip button.is-candidate::after {
  content: '';
  position: absolute;
  top: 6px;
  right: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.25);
}
.tm-phase-strip button.is-candidate .tm-stage-count {
  color: #10b981;
  font-weight: 600;
}
html[data-theme="light"] .tm-phase-strip button {
  background: #ffffff;
  border-color: #e2e8f0;
}
html[data-theme="light"] .tm-phase-strip button:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}
html[data-theme="light"] .tm-phase-strip button.chosen {
  background: #f0f9ff !important;
  border-color: #0284c7 !important;
  box-shadow: 0 0 0 1px #0284c7 !important;
}
html[data-theme="light"] .tm-phase-strip button.chosen .tm-stage-name {
  color: #0284c7 !important;
}

/* Checklist Stat Bar */
.tm-chk-stat-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 14px;
  background: var(--control);
  border-radius: 8px;
  font-size: 11px;
  color: var(--secondary);
  margin-top: 10px;
  border: 1px solid var(--border);
}
.tm-chk-stat-bar strong {
  color: var(--text);
  font-size: 12px;
}
.tm-chk-stat-item.met { color: #10b981; font-weight: 600; }
.tm-chk-stat-item.unmet { color: #ef4444; font-weight: 600; }
.tm-chk-stat-item.pending { color: var(--secondary); }
html[data-theme="light"] .tm-chk-stat-bar {
  background: #f8fafc;
  border-color: #e2e8f0;
}

/* Material 3 Filter Chips & Inputs */
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
  gap: 6px;
  align-items: center;
}
.tm-chk-pill {
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}
.tm-chk-pill:hover {
  border-color: var(--border-strong);
  color: var(--text);
  background: var(--control-hover);
}
.tm-chk-pill.active {
  background: var(--surface-raised);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
html[data-theme="light"] .tm-chk-pill {
  background: #ffffff;
  border-color: #e2e8f0;
}
html[data-theme="light"] .tm-chk-pill:hover {
  background: #f1f5f9;
}
html[data-theme="light"] .tm-chk-pill.active {
  background: #f0f9ff;
  border-color: #0284c7;
  color: #0284c7;
}

.tm-chk-search-input {
  width: 140px;
  padding: 5px 12px;
  font-size: 11px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--control);
  color: var(--text);
  outline: none;
  transition: all 0.15s ease;
}
.tm-chk-search-input:focus {
  border-color: var(--accent);
  background: var(--surface-raised);
  width: 180px;
}
html[data-theme="light"] .tm-chk-search-input {
  background: #ffffff;
  border-color: #e2e8f0;
}
html[data-theme="light"] .tm-chk-search-input:focus {
  border-color: #0284c7;
}

.tm-chk-select {
  padding: 4px 10px;
  font-size: 11px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--control);
  color: var(--text);
  outline: none;
}
html[data-theme="light"] .tm-chk-select {
  background: #ffffff;
  border-color: #e2e8f0;
}

/* Material 3 Checklist Cards (No Inner Scroll Container) */
.tm-chk-card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
  max-height: none !important;
  overflow: visible !important;
}
.tm-chk-item {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
  position: relative;
}
.tm-chk-item:hover {
  border-color: var(--border-strong);
  background: var(--surface-raised);
}
.tm-chk-item.is-met {
  border-left: 3px solid #10b981;
}
.tm-chk-item.is-unmet {
  border-left: 3px solid #ef4444;
}
.tm-chk-item.is-pending {
  border-left: 3px solid var(--border-strong);
}
html[data-theme="light"] .tm-chk-item {
  background: #ffffff;
  border-color: #e2e8f0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}
html[data-theme="light"] .tm-chk-item:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.tm-chk-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.tm-chk-item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tm-chk-item-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--secondary);
  font-weight: 600;
  letter-spacing: 0.5px;
}
.tm-chk-item-source {
  font-size: 11px;
  color: var(--secondary);
}

.tm-imp-badge {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 12px;
  font-weight: 600;
  display: inline-block;
  white-space: nowrap;
  letter-spacing: 0.3px;
}
.tm-imp-badge.core {
  background: rgba(234, 179, 8, 0.14);
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

.tm-chk-item-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.45;
  margin-bottom: 5px;
}
.tm-chk-item-logic {
  font-size: 11.5px;
  color: var(--secondary);
  line-height: 1.55;
  margin-bottom: 12px;
}
.tm-chk-logic-label {
  color: var(--secondary);
  font-weight: 500;
  opacity: 0.85;
}

.tm-chk-item-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
html[data-theme="light"] .tm-chk-item-footer {
  border-top-color: #f1f5f9;
}

/* Material 3 Segmented Toggle Group */
.tm-chk-toggle-group {
  display: inline-flex;
  align-items: center;
  background: var(--control);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 2px;
  gap: 2px;
}
.tm-chk-toggle-btn {
  padding: 3px 12px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 16px;
  border: none;
  background: transparent;
  color: var(--secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1.35;
  user-select: none;
}
.tm-chk-toggle-btn:hover {
  color: var(--text);
  background: var(--control-hover);
}
.tm-chk-toggle-btn.active.met {
  background: #10b981 !important;
  color: #ffffff !important;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(16, 185, 129, 0.35);
}
.tm-chk-toggle-btn.active.unmet {
  background: #ef4444 !important;
  color: #ffffff !important;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(239, 68, 68, 0.35);
}
.tm-chk-toggle-btn.active.pending {
  background: var(--surface-raised) !important;
  color: var(--text) !important;
  font-weight: 600;
}
html[data-theme="light"] .tm-chk-toggle-group {
  background: #f1f5f9;
  border-color: #e2e8f0;
}
html[data-theme="light"] .tm-chk-toggle-btn.active.pending {
  background: #ffffff !important;
  color: #0f172a !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.tm-chk-item-inputs {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.tm-chk-item-note {
  flex: 1;
  min-width: 160px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  padding: 4px 6px;
  font-size: 11.5px;
  color: var(--text);
  font-family: inherit;
  transition: border-color 0.15s ease;
}
.tm-chk-item-note:focus {
  outline: none;
  border-bottom-color: var(--accent);
}
.tm-chk-item-date {
  width: 88px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  padding: 4px 4px;
  font-size: 11px;
  color: var(--secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  transition: border-color 0.15s ease;
  text-align: center;
}
.tm-chk-item-date:focus {
  outline: none;
  border-bottom-color: var(--accent);
}
html[data-theme="light"] .tm-chk-item-note, html[data-theme="light"] .tm-chk-item-date {
  border-bottom-color: #cbd5e1;
}
html[data-theme="light"] .tm-chk-item-note:focus, html[data-theme="light"] .tm-chk-item-date:focus {
  border-bottom-color: #0284c7;
}

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
  padding: 12px 14px;
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
  margin-bottom: 6px;
}
.tm-stage-card-title {
  font-size: 14px;
  font-weight: 600;
}
.tm-stage-card-body {
  font-size: 11px;
  color: var(--secondary);
  line-height: 1.6;
}
.tm-stage-card-progress {
  height: 4px;
  border-radius: 2px;
  background: var(--muted);
  overflow: hidden;
  margin-top: 8px;
  display: flex;
}
.tm-stage-card-progress > div {
  height: 100%;
}
html[data-theme="light"] .tm-stage-card {
  background: #ffffff;
  border-color: #e2e8f0;
}
html[data-theme="light"] .tm-stage-card:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}
html[data-theme="light"] .tm-stage-card.chosen {
  background: #f0f9ff;
  border-color: #0284c7;
  box-shadow: 0 0 0 1px #0284c7;
}

.tm-chk-empty {
  text-align: center;
  padding: 32px 16px;
  color: var(--secondary);
  font-size: 12px;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: 8px;
  margin-top: 10px;
}
"""
    return css

if __name__ == '__main__':
    print('Length:', len(build_patch()))
