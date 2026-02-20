import { useState, useEffect, useMemo, useCallback } from "react";

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const STORE_KEY = "wpt_v2";
const persist = async (data) => {
  try { await window.storage.set(STORE_KEY, JSON.stringify(data)); } catch (e) { console.warn("Storage write failed", e); }
};
const hydrate = async () => {
  try {
    const r = await window.storage.get(STORE_KEY);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
};

// ─── DATA MODELS ──────────────────────────────────────────────────────────────
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const POSITIONS = ["Goalkeeper", "Center", "Driver", "Wing", "Utility", "Point"];
const SWIM_EVENTS = ["50 Free", "100 Free", "50 Breast", "50 Back"];

const STAT_FIELDS = [
  { key: "goals",              label: "Goals",              cat: "offense" },
  { key: "attempts",           label: "Attempts",           cat: "offense" },
  { key: "missedShots",        label: "Missed Shots",       cat: "offense" },
  { key: "penaltyGoals",       label: "Penalty Goals",      cat: "offense" },
  { key: "powerPlayGoals",     label: "Power Play Goals",   cat: "offense" },
  { key: "counterAttackGoals", label: "Counter-Attack G",   cat: "offense" },
  { key: "assists",            label: "Assists",            cat: "offense" },
  { key: "blocks",             label: "Blocks",             cat: "defense" },
  { key: "steals",             label: "Steals",             cat: "defense" },
  { key: "goalsAllowed",       label: "Goals Allowed",      cat: "defense" },
  { key: "earnedExclusions",   label: "Earned Exclusions",  cat: "defense" },
  { key: "exclusionsForced",   label: "Exclusions Forced",  cat: "defense" },
  { key: "sprints",            label: "Sprints Won",        cat: "general" },
  { key: "personalFouls",      label: "Personal Fouls",     cat: "general" },
  { key: "turnovers",          label: "Turnovers",          cat: "general" },
];

const emptyGameStats = () =>
  Object.fromEntries(STAT_FIELDS.map((f) => [f.key, 0]));

const newSeason = (label, type = "standard") => ({
  id: uid(),
  label,          // e.g. "2024-25 Season"
  type,           // "junior" | "senior" | "professional" | "standard"
  startDate: "",
  endDate: "",
  games: [],      // [{ id, date, opponent, stats }]
  swimTimes: Object.fromEntries(SWIM_EVENTS.map((e) => [e, []])), // [{ id, date, time }]
  notes: "",
});

const newPlayer = (name, number, position) => ({
  id: uid(),
  name,
  number,
  position,
  seasons: [],
});

// ─── KPI ENGINE ───────────────────────────────────────────────────────────────
function aggregateGames(games) {
  const totals = emptyGameStats();
  games.forEach((g) => {
    STAT_FIELDS.forEach(({ key }) => {
      totals[key] += g.stats[key] || 0;
    });
  });
  return totals;
}

function calcKPIs(games) {
  const t = aggregateGames(games);
  const gp = games.length;
  const shootPct = t.attempts > 0 ? ((t.goals / t.attempts) * 100).toFixed(1) : "—";
  const savePct =
    t.blocks + t.goalsAllowed > 0
      ? ((t.blocks / (t.blocks + t.goalsAllowed)) * 100).toFixed(1)
      : "—";
  // API: balanced performance per game
  const apiRaw =
    gp > 0
      ? (
          (t.goals * 3 + t.assists * 2 + t.steals * 2 + t.blocks * 2 +
            t.earnedExclusions - t.turnovers - t.personalFouls) /
          gp
        ).toFixed(2)
      : "—";
  // OPI: offensive output per game
  const opiRaw =
    gp > 0
      ? (
          (t.goals * 4 + t.assists * 2 + t.powerPlayGoals * 1.5 +
            t.counterAttackGoals * 1.5 - t.missedShots * 0.5 - t.turnovers) /
          gp
        ).toFixed(2)
      : "—";
  // DPI: defensive impact per game
  const dpiRaw =
    gp > 0
      ? (
          (t.blocks * 3 + t.steals * 2 + t.earnedExclusions * 1.5 +
            t.exclusionsForced - t.goalsAllowed * 0.5 - t.personalFouls) /
          gp
        ).toFixed(2)
      : "—";

  return { totals: t, gp, shootPct, savePct, api: apiRaw, opi: opiRaw, dpi: dpiRaw };
}

function bestSwimTime(entries) {
  if (!entries || entries.length === 0) return null;
  return Math.min(...entries.map((e) => e.time));
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=Karla:wght@300;400;500;700&display=swap');

:root {
  --ink:    #07111e;
  --deep:   #0b1a2d;
  --panel:  #0f2239;
  --raised: #162c44;
  --line:   #1e3a58;
  --wave:   #0284c7;
  --foam:   #38bdf8;
  --mint:   #10b981;
  --gold:   #f59e0b;
  --rose:   #f43f5e;
  --txt:    #e0eaf4;
  --sub:    #7ca0be;
  --mute:   #3d6080;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html {
  scroll-behavior: smooth;
  overflow-x: hidden;
  max-width: 100vw;
  background: #07111e;
}
body {
  background: #07111e;
  color: var(--txt);
  font-family: 'Karla', sans-serif; font-size: 14px; line-height: 1.5;
  overflow-x: hidden;
  max-width: 100vw;
  width: 100%;
  position: relative;
  padding-bottom: env(safe-area-inset-bottom);
}

/* ── SCROLLBAR ── */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: var(--deep); }
::-webkit-scrollbar-thumb { background: var(--line); border-radius: 3px; }

/* ── APP SHELL ── */
.shell {
  display: flex; flex-direction: column;
  min-height: 100vh; min-height: -webkit-fill-available;
  width: 100%; max-width: 100vw;
  overflow: hidden;
  background: var(--ink);
}

/* ── TOPBAR ── */
.topbar {
  background: linear-gradient(90deg, var(--deep) 0%, #0a1f35 100%);
  border-bottom: 2px solid var(--wave);
  padding: 10px 16px;
  padding-top: calc(10px + env(safe-area-inset-top));
  display: flex; align-items: center; gap: 10px;
  position: sticky; top: 0; z-index: 200;
  box-shadow: 0 4px 40px rgba(2,132,199,.2);
  width: 100%; max-width: 100vw;
  overflow: hidden;
}
.logo {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 19px; font-weight: 900; letter-spacing: 1.5px;
  color: var(--foam); text-transform: uppercase;
  white-space: nowrap; flex-shrink: 1; min-width: 0;
}
.logo span { color: var(--mint); }
.topbar-nav { display: flex; gap: 3px; margin-left: auto; flex-shrink: 0; }
.tnav {
  padding: 6px 10px; border-radius: 6px; border: none; cursor: pointer;
  font-family: 'Karla', sans-serif; font-size: 11px; font-weight: 700;
  color: var(--sub); background: transparent; text-transform: uppercase; letter-spacing: .5px;
  transition: all .18s; white-space: nowrap;
}
.tnav:active { color: var(--txt); background: var(--raised); }
.tnav.on { background: var(--wave); color: #fff; }

/* ── MAIN ── */
.main {
  flex: 1; padding: 14px;
  width: 100%; max-width: 100vw;
  overflow-x: hidden;
  overflow-y: auto;
}
@media (min-width: 768px) { .main { padding: 24px; max-width: 1440px; margin: 0 auto; } }

/* ── SIDEBAR LAYOUT ── */
/* Mobile: single column stack */
.sidebar-layout { display: flex; flex-direction: column; gap: 16px; width: 100%; }
/* Desktop: side by side */
@media (min-width: 900px) {
  .sidebar-layout { display: grid; grid-template-columns: 280px 1fr; gap: 20px; }
}

/* ── PANEL ── */
.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px;
  width: 100%;
}
@media (min-width: 768px) { .panel { padding: 18px; } }
.panel + .panel { margin-top: 12px; }
.panel-title {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 14px; font-weight: 700; letter-spacing: 2px;
  color: var(--foam); text-transform: uppercase;
  margin-bottom: 12px;
  display: flex; align-items: center; justify-content: space-between;
}

/* ── KPI ROW ── */
/* Mobile: 2 per row minimum */
.kpi-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; width: 100%; }
@media (min-width: 480px) { .kpi-row { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 768px) { .kpi-row { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; } }
.kpi {
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 10px; padding: 12px 8px; text-align: center;
  position: relative; overflow: hidden;
}
.kpi::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: var(--accent, var(--wave));
}
.kpi-val {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 28px; font-weight: 900; line-height: 1;
  color: var(--accent, var(--foam));
}
@media (min-width: 768px) { .kpi-val { font-size: 34px; } }
.kpi-label { font-size: 9px; color: var(--sub); text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }

/* ── STAT GRID ── */
/* Mobile: 2 per row */
.stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; width: 100%; }
@media (min-width: 480px) { .stat-grid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 768px) { .stat-grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; } }
.stat {
  background: var(--raised); border: 1px solid var(--line); border-radius: 8px;
  padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;
  min-width: 0;
}
.stat-label { font-size: 10px; color: var(--sub); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 4px; }
.stat-val { font-family: 'Barlow Condensed', sans-serif; font-size: 20px; font-weight: 700; color: var(--txt); flex-shrink: 0; }

/* ── PLAYER LIST ── */
.p-list { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.p-row {
  background: var(--raised); border: 1px solid var(--line); border-radius: 10px;
  padding: 10px 12px; cursor: pointer; display: flex; align-items: center; gap: 10px;
  transition: border-color .15s; width: 100%; min-width: 0;
}
.p-row:active { border-color: var(--foam); }
.p-row.sel { border-color: var(--wave); background: #0e2540; }
.p-num { font-family: 'Barlow Condensed', sans-serif; font-size: 26px; font-weight: 900; color: var(--wave); width: 30px; text-align: center; line-height: 1; flex-shrink: 0; }
.p-name { font-weight: 700; font-size: 14px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-pos  { font-size: 10px; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; }

/* ── SEASON PILLS ── */
.s-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.s-pill {
  padding: 5px 10px; border-radius: 20px; font-size: 10px; font-weight: 700;
  letter-spacing: .6px; text-transform: uppercase; cursor: pointer;
  border: 1px solid var(--line); background: var(--raised); color: var(--sub);
  transition: all .15s; white-space: nowrap;
}
.s-pill:active { border-color: var(--foam); color: var(--foam); }
.s-pill.on { background: var(--wave); border-color: var(--wave); color: #fff; box-shadow: 0 2px 10px rgba(2,132,199,.3); }
.type-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 4px; background: var(--sub); }
.type-dot.junior       { background: var(--sub); }
.type-dot.senior       { background: var(--mint); }
.type-dot.professional { background: var(--gold); }
.type-dot.standard     { background: var(--foam); }

/* ── TABS ── */
.tab-bar { display: flex; gap: 3px; background: var(--raised); padding: 4px; border-radius: 9px; width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.tb {
  padding: 7px 12px; border-radius: 6px; border: none; cursor: pointer;
  font-family: 'Karla', sans-serif; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px;
  color: var(--sub); background: transparent; transition: all .15s; white-space: nowrap; flex: 1;
}
.tb.on { background: var(--wave); color: #fff; }

/* ── BUTTONS ── */
.btn {
  padding: 8px 14px; border-radius: 7px; border: none; cursor: pointer;
  font-family: 'Karla', sans-serif; font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .8px; transition: all .15s;
  white-space: nowrap; -webkit-tap-highlight-color: transparent;
}
.btn-wave  { background: var(--wave); color: #fff; }
.btn-wave:active  { background: var(--foam); color: var(--ink); }
.btn-mint  { background: var(--mint); color: var(--ink); }
.btn-mint:active  { background: #34d399; }
.btn-ghost { background: transparent; color: var(--sub); border: 1px solid var(--line); }
.btn-ghost:active { color: var(--txt); border-color: var(--sub); }
.btn-rose  { background: transparent; color: var(--rose); border: 1px solid var(--rose); }
.btn-rose:active  { background: var(--rose); color: #fff; }
.btn-gold  { background: var(--gold); color: var(--ink); }
.btn-sm { padding: 5px 12px; font-size: 11px; }
.btn-xs { padding: 3px 8px; font-size: 10px; }

/* ── FORMS ── */
.f-group { display: flex; flex-direction: column; gap: 5px; }
.f-label { font-size: 10px; color: var(--sub); text-transform: uppercase; letter-spacing: 1px; }
.f-input {
  background: var(--raised); border: 1px solid var(--line); color: var(--txt);
  border-radius: 7px; padding: 10px 12px; font-family: 'Karla', sans-serif; font-size: 16px;
  transition: border-color .15s; width: 100%;
  /* Prevents iOS zoom on focus - must be 16px */
  -webkit-appearance: none;
}
.f-input:focus { outline: none; border-color: var(--wave); }
.f-input option { background: var(--deep); }
.f-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 480px) { .f-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); } }
.f-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.f-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }

/* ── MODAL ── */
.overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.8);
  display: flex; align-items: flex-end; justify-content: center;
  z-index: 999; padding: 0;
}
@media (min-width: 640px) {
  .overlay { align-items: center; padding: 16px; }
}
.modal {
  background: var(--deep); border: 1px solid var(--line);
  border-radius: 20px 20px 0 0;
  padding: 20px 16px;
  padding-bottom: calc(20px + env(safe-area-inset-bottom));
  width: 100%; max-height: 92vh; overflow-y: auto; -webkit-overflow-scrolling: touch;
  box-shadow: 0 -10px 60px rgba(0,0,0,.6);
  animation: slideUp .25s ease;
}
@media (min-width: 640px) {
  .modal { border-radius: 18px; padding: 26px; max-width: 680px; }
  .modal-sm { max-width: 440px; }
}
@keyframes slideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
.modal-title { font-family: 'Barlow Condensed', sans-serif; font-size: 20px; font-weight: 900; letter-spacing: 2px; color: var(--foam); text-transform: uppercase; margin-bottom: 16px; }

/* ── DIVIDER ── */
.div { height: 1px; background: var(--line); margin: 14px 0; }

/* ── TABLE ── */
.tbl { width: 100%; border-collapse: collapse; }
.tbl th { font-size: 10px; color: var(--sub); text-transform: uppercase; letter-spacing: 1px; padding: 7px 8px; text-align: left; border-bottom: 1px solid var(--line); white-space: nowrap; }
.tbl td { padding: 8px 8px; font-size: 13px; border-bottom: 1px solid rgba(30,58,88,.4); }
.tbl tr:last-child td { border-bottom: none; }
.tbl .hi { color: var(--mint); font-weight: 700; }
.tbl .gold { color: var(--gold); font-weight: 700; }

/* ── GAME LOG ── */
.g-entry { background: var(--raised); border: 1px solid var(--line); border-radius: 10px; padding: 12px; margin-bottom: 8px; }
.g-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 6px; }
.g-opp { font-weight: 700; font-size: 15px; }
.g-date { font-size: 11px; color: var(--sub); }

/* ── SEASON HEADER ── */
.s-header {
  background: linear-gradient(135deg, var(--raised) 0%, #102237 100%);
  border: 1px solid var(--line); border-radius: 12px;
  padding: 12px 14px; margin-bottom: 14px;
  display: flex; flex-direction: column; gap: 10px;
}
@media (min-width: 640px) {
  .s-header { flex-direction: row; align-items: center; gap: 16px; flex-wrap: wrap; }
}
.s-title { font-family: 'Barlow Condensed', sans-serif; font-size: 20px; font-weight: 900; letter-spacing: 1px; }
.s-actions { display: flex; gap: 6px; flex-wrap: wrap; }

/* ── CATEGORY BADGES ── */
.cat-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; }
.cat-offense { background: rgba(2,132,199,.15); color: var(--foam); }
.cat-defense { background: rgba(16,185,129,.15); color: var(--mint); }
.cat-general { background: rgba(245,158,11,.15); color: var(--gold); }

/* ── CAREER BANNER ── */
.career-banner {
  background: linear-gradient(135deg, #0a1e33 0%, #071629 60%, #0b2240 100%);
  border: 1px solid var(--wave); border-radius: 14px; padding: 14px 16px;
  margin-bottom: 16px; position: relative; overflow: hidden; width: 100%;
}
@media (min-width: 768px) { .career-banner { padding: 18px 22px; margin-bottom: 18px; } }
.career-banner::after {
  content: ''; position: absolute; top: -30px; right: -30px;
  width: 120px; height: 120px; border-radius: 50%;
  background: radial-gradient(circle, rgba(2,132,199,.12) 0%, transparent 70%);
}

/* ── SWIM BEST ── */
.swim-best { color: var(--mint); font-weight: 700; font-family: 'Barlow Condensed', sans-serif; font-size: 18px; }

/* ── EMPTY ── */
.empty { text-align: center; padding: 32px 16px; color: var(--sub); }
.empty-icon { font-size: 40px; margin-bottom: 10px; }

/* ── CHIPS ── */
.chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; }
.chip-wave { background: rgba(2,132,199,.15); color: var(--foam); border: 1px solid rgba(2,132,199,.25); }
.chip-mint { background: rgba(16,185,129,.15); color: var(--mint); border: 1px solid rgba(16,185,129,.25); }
.chip-gold { background: rgba(245,158,11,.15); color: var(--gold); border: 1px solid rgba(245,158,11,.25); }
.chip-rose { background: rgba(244,63,94,.15); color: var(--rose); border: 1px solid rgba(244,63,94,.25); }
.chip-sub  { background: rgba(124,160,190,.1); color: var(--sub); border: 1px solid rgba(124,160,190,.2); }

/* ── TWO COL ── */
.two-col { display: grid; grid-template-columns: 1fr; gap: 12px; width: 100%; }
@media (min-width: 700px) { .two-col { grid-template-columns: 1fr 1fr; gap: 16px; } }

/* ── SCROLL X (tables on mobile) ── */
.scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; width: 100%; }
.scroll-x table { min-width: 500px; }

/* ── PLAYER HEADER (detail page) ── */
.player-header { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
@media (min-width: 480px) { .player-header { flex-direction: row; align-items: center; flex-wrap: wrap; } }

/* ── UTILS ── */
.flex { display: flex; }
.flex-col { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.justify-between { justify-content: space-between; }
.justify-end { justify-content: flex-end; }
.gap-1 { gap: 4px; }
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
.gap-4 { gap: 16px; }
.gap-5 { gap: 20px; }
.mb-1 { margin-bottom: 4px; }
.mb-2 { margin-bottom: 8px; }
.mb-3 { margin-bottom: 12px; }
.mb-4 { margin-bottom: 16px; }
.mb-5 { margin-bottom: 20px; }
.mt-2 { margin-top: 8px; }
.mt-3 { margin-top: 12px; }
.ml-auto { margin-left: auto; }
.text-sm { font-size: 12px; }
.text-xs { font-size: 11px; }
.text-sub { color: var(--sub); }
.text-mint { color: var(--mint); }
.text-foam { color: var(--foam); }
.text-gold { color: var(--gold); }
.text-rose { color: var(--rose); }
.text-bold { font-weight: 700; }
.w-full { width: 100%; }
.min-w-0 { min-width: 0; }
.spinner { display: inline-block; width: 22px; height: 22px; border: 2px solid var(--line); border-top-color: var(--wave); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.load-screen { min-height: 100vh; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 14px; color: var(--sub); }
.section-label { font-family: 'Barlow Condensed', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--sub); margin-bottom: 8px; }
`;

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────

const TypeBadge = ({ type }) => {
  const map = { junior: ["sub", "JR"], senior: ["mint", "SR"], professional: ["gold", "PRO"], standard: ["foam", "STD"] };
  const [col, lbl] = map[type] || map.standard;
  return <span className={`chip chip-${col === "foam" ? "wave" : col}`}>{lbl}</span>;
};

const KPI = ({ label, val, accent = "var(--foam)" }) => (
  <div className="kpi" style={{ "--accent": accent }}>
    <div className="kpi-val">{val}</div>
    <div className="kpi-label">{label}</div>
  </div>
);

const Stat = ({ label, val }) => (
  <div className="stat">
    <span className="stat-label">{label}</span>
    <span className="stat-val">{val}</span>
  </div>
);

// ─── MODALS ───────────────────────────────────────────────────────────────────

function PlayerModal({ editing, onSave, onClose }) {
  const [f, setF] = useState(editing
    ? { name: editing.name, number: editing.number, position: editing.position }
    : { name: "", number: "", position: "Driver" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const ok = () => { if (f.name.trim()) onSave(f); };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{editing ? "Edit Player" : "Add Player"}</div>
        <div className="f-grid mb-4">
          <div className="f-group">
            <label className="f-label">Full Name</label>
            <input className="f-input" value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Jordan Smith" autoFocus />
          </div>
          <div className="f-group">
            <label className="f-label">Cap #</label>
            <input className="f-input" type="number" value={f.number} onChange={e => set("number", e.target.value)} placeholder="#" />
          </div>
          <div className="f-group">
            <label className="f-label">Position</label>
            <select className="f-input" value={f.position} onChange={e => set("position", e.target.value)}>
              {POSITIONS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-wave" onClick={ok}>{editing ? "Save" : "Add Player"}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function SeasonModal({ onSave, onClose, editing }) {
  const curYear = new Date().getFullYear();
  const [f, setF] = useState(editing || {
    label: `${curYear}-${String(curYear + 1).slice(2)} Season`,
    type: "standard", startDate: "", endDate: "", notes: "",
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const ok = () => { if (f.label.trim()) onSave(f); };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{editing ? "Edit Season" : "Add Season"}</div>
        <div className="flex flex-col gap-3 mb-4">
          <div className="f-group">
            <label className="f-label">Season Label</label>
            <input className="f-input" value={f.label} onChange={e => set("label", e.target.value)} placeholder="e.g. 2024-25 Club Season" autoFocus />
          </div>
          <div className="f-group">
            <label className="f-label">Season Type</label>
            <select className="f-input" value={f.type} onChange={e => set("type", e.target.value)}>
              <option value="junior">Junior (development)</option>
              <option value="senior">Senior</option>
              <option value="professional">Professional</option>
              <option value="standard">Standard</option>
            </select>
          </div>
          <div className="f-grid-2">
            <div className="f-group">
              <label className="f-label">Start Date</label>
              <input type="date" className="f-input" value={f.startDate} onChange={e => set("startDate", e.target.value)} />
            </div>
            <div className="f-group">
              <label className="f-label">End Date</label>
              <input type="date" className="f-input" value={f.endDate} onChange={e => set("endDate", e.target.value)} />
            </div>
          </div>
          <div className="f-group">
            <label className="f-label">Notes (optional)</label>
            <input className="f-input" value={f.notes} onChange={e => set("notes", e.target.value)} placeholder="e.g. National Championship year" />
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-wave" onClick={ok}>{editing ? "Save" : "Create Season"}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function LogGameModal({ season, onSave, onClose }) {
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), opponent: "", stats: emptyGameStats() });
  const setStat = (k, v) => setF(p => ({ ...p, stats: { ...p.stats, [k]: parseInt(v) || 0 } }));
  const ok = () => { if (f.opponent.trim()) onSave({ ...f, id: uid() }); };

  const cats = ["offense", "defense", "general"];
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Log Game — {season.label}</div>
        <div className="f-grid mb-3">
          <div className="f-group">
            <label className="f-label">Date</label>
            <input type="date" className="f-input" value={f.date} onChange={e => setF(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div className="f-group">
            <label className="f-label">Opponent</label>
            <input className="f-input" value={f.opponent} onChange={e => setF(p => ({ ...p, opponent: e.target.value }))} placeholder="Opponent team name" />
          </div>
        </div>
        <div className="div" />
        {cats.map(cat => (
          <div key={cat} className="mb-3">
            <div className="section-label">
              <span className={`cat-badge cat-${cat}`}>{cat}</span>
            </div>
            <div className="stat-grid">
              {STAT_FIELDS.filter(sf => sf.cat === cat).map(sf => (
                <div key={sf.key} className="f-group">
                  <label className="f-label">{sf.label}</label>
                  <input type="number" min="0" className="f-input" value={f.stats[sf.key]}
                    onChange={e => setStat(sf.key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="flex gap-2 mt-3">
          <button className="btn btn-mint" onClick={ok}>Save Game</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function SwimModal({ season, onSave, onClose }) {
  const [f, setF] = useState({ event: "50 Free", time: "", date: new Date().toISOString().slice(0, 10) });
  const ok = () => {
    const t = parseFloat(f.time);
    if (!isNaN(t) && t > 0) onSave({ ...f, time: t, id: uid() });
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Log Swim Time</div>
        <div className="flex flex-col gap-3 mb-4">
          <div className="f-group">
            <label className="f-label">Event</label>
            <select className="f-input" value={f.event} onChange={e => setF(p => ({ ...p, event: e.target.value }))}>
              {SWIM_EVENTS.map(ev => <option key={ev}>{ev}</option>)}
            </select>
          </div>
          <div className="f-group">
            <label className="f-label">Time (seconds, e.g. 24.85)</label>
            <input type="number" step="0.01" min="0" className="f-input" value={f.time}
              onChange={e => setF(p => ({ ...p, time: e.target.value }))} placeholder="0.00" autoFocus />
          </div>
          <div className="f-group">
            <label className="f-label">Date</label>
            <input type="date" className="f-input" value={f.date} onChange={e => setF(p => ({ ...p, date: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-mint" onClick={ok}>Save Time</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── SEASON VIEW ──────────────────────────────────────────────────────────────
function SeasonView({ season, onUpdateSeason, onDeleteSeason }) {
  const [tab, setTab] = useState("overview");
  const [logGame, setLogGame] = useState(false);
  const [logSwim, setLogSwim] = useState(false);

  const kpis = useMemo(() => calcKPIs(season.games), [season.games]);
  const { totals } = kpis;

  const handleGame = (game) => {
    onUpdateSeason({ ...season, games: [...season.games, game] });
    setLogGame(false);
  };
  const handleSwim = ({ event, time, date, id }) => {
    const updated = { ...season, swimTimes: { ...season.swimTimes, [event]: [...(season.swimTimes[event] || []), { time, date, id }] } };
    onUpdateSeason(updated);
    setLogSwim(false);
  };
  const deleteGame = (id) => onUpdateSeason({ ...season, games: season.games.filter(g => g.id !== id) });
  const deleteSwim = (event, id) => {
    const updated = { ...season, swimTimes: { ...season.swimTimes, [event]: season.swimTimes[event].filter(t => t.id !== id) } };
    onUpdateSeason(updated);
  };

  return (
    <div>
      {/* Season header */}
      <div className="s-header mb-4">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2 mb-1" style={{ flexWrap: "wrap" }}>
            <span className="s-title">{season.label}</span>
            <TypeBadge type={season.type} />
          </div>
          <div className="text-xs text-sub">
            {season.startDate && season.endDate ? `${season.startDate} → ${season.endDate}` : season.startDate || "No dates set"}
            {season.notes && <span style={{ marginLeft: 8 }}>· {season.notes}</span>}
          </div>
        </div>
        <div className="s-actions">
          <button className="btn btn-wave btn-sm" onClick={() => setLogGame(true)}>+ Game</button>
          <button className="btn btn-mint btn-sm" onClick={() => setLogSwim(true)}>+ Swim</button>
          <button className="btn btn-rose btn-sm" onClick={() => { if (window.confirm("Delete this season and all its data?")) onDeleteSeason(); }}>Delete</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-row mb-4">
        <KPI label="Games Played" val={kpis.gp} accent="var(--wave)" />
        <KPI label="Goals" val={totals.goals} accent="var(--mint)" />
        <KPI label="Shooting %" val={kpis.shootPct === "—" ? "—" : `${kpis.shootPct}%`} accent="var(--mint)" />
        <KPI label="Assists" val={totals.assists} accent="var(--foam)" />
        <KPI label="Blocks" val={totals.blocks} accent="var(--foam)" />
        <KPI label="Steals" val={totals.steals} accent="var(--gold)" />
        <KPI label="API" val={kpis.api} accent="var(--gold)" />
        <KPI label="OPI" val={kpis.opi} accent="var(--wave)" />
        <KPI label="DPI" val={kpis.dpi} accent="var(--mint)" />
        {season.type === "Goalkeeper" || totals.goalsAllowed > 0
          ? <KPI label="Save %" val={kpis.savePct === "—" ? "—" : `${kpis.savePct}%`} accent="var(--rose)" />
          : null}
      </div>

      {/* Sub-tabs */}
      <div className="tab-bar mb-4">
        {["overview", "stats", "swim", "games"].map(t => (
          <button key={t} className={`tb ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
            {t === "overview" ? "Overview" : t === "stats" ? "All Stats" : t === "swim" ? "Swim Times" : "Game Log"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="two-col">
          <div className="panel">
            <div className="panel-title">Offense</div>
            <div className="stat-grid">
              {STAT_FIELDS.filter(f => f.cat === "offense").map(f => <Stat key={f.key} label={f.label} val={totals[f.key]} />)}
              <Stat label="Shooting %" val={kpis.shootPct === "—" ? "—" : `${kpis.shootPct}%`} />
            </div>
          </div>
          <div className="panel">
            <div className="panel-title">Defense</div>
            <div className="stat-grid">
              {STAT_FIELDS.filter(f => f.cat === "defense").map(f => <Stat key={f.key} label={f.label} val={totals[f.key]} />)}
              <Stat label="Save %" val={kpis.savePct === "—" ? "—" : `${kpis.savePct}%`} />
            </div>
          </div>
        </div>
      )}

      {tab === "stats" && (
        <div className="panel">
          <div className="panel-title">Full Season Stats</div>
          <div className="stat-grid">
            {STAT_FIELDS.map(f => <Stat key={f.key} label={f.label} val={totals[f.key]} />)}
            <Stat label="Shooting %" val={kpis.shootPct === "—" ? "—" : `${kpis.shootPct}%`} />
            <Stat label="Save %" val={kpis.savePct === "—" ? "—" : `${kpis.savePct}%`} />
            <Stat label="API Score" val={kpis.api} />
            <Stat label="OPI Score" val={kpis.opi} />
            <Stat label="DPI Score" val={kpis.dpi} />
          </div>
        </div>
      )}

      {tab === "swim" && (
        <div className="panel">
          <div className="panel-title">Swim Times</div>
          <table className="tbl">
            <thead>
              <tr><th>Event</th><th>Best</th><th>Entries</th><th>History (newest first)</th></tr>
            </thead>
            <tbody>
              {SWIM_EVENTS.map(ev => {
                const entries = season.swimTimes[ev] || [];
                const best = bestSwimTime(entries);
                const sorted = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
                return (
                  <tr key={ev}>
                    <td style={{ fontWeight: 700 }}>{ev}</td>
                    <td>{best ? <span className="swim-best">{best.toFixed(2)}s</span> : <span className="text-sub">—</span>}</td>
                    <td>{entries.length}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {sorted.map(e => (
                          <span key={e.id} className={`chip ${e.time === best ? "chip-mint" : "chip-sub"}`}
                            title={e.date} style={{ cursor: "pointer" }}
                            onClick={() => { if (window.confirm(`Delete ${e.time}s from ${e.date}?`)) deleteSwim(ev, e.id); }}>
                            {e.time.toFixed(2)}s
                          </span>
                        ))}
                        {entries.length === 0 && <span className="text-sub text-xs">No times yet</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "games" && (
        <div>
          {season.games.length === 0 ? (
            <div className="empty"><div className="empty-icon">🏊</div><p>No games logged. Hit + Game to start.</p></div>
          ) : [...season.games].reverse().map(g => {
            const gk = calcKPIs([g]);
            return (
              <div key={g.id} className="g-entry">
                <div className="g-header">
                  <div>
                    <span className="g-opp">vs {g.opponent}</span>
                    <span className="g-date" style={{ marginLeft: 10 }}>{g.date}</span>
                  </div>
                  <button className="btn btn-rose btn-xs" onClick={() => deleteGame(g.id)}>Remove</button>
                </div>
                <div className="stat-grid">
                  {STAT_FIELDS.slice(0, 12).map(f => <Stat key={f.key} label={f.label} val={g.stats[f.key]} />)}
                  <Stat label="Shooting %" val={gk.shootPct === "—" ? "—" : `${gk.shootPct}%`} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {logGame && <LogGameModal season={season} onSave={handleGame} onClose={() => setLogGame(false)} />}
      {logSwim && <SwimModal season={season} onSave={handleSwim} onClose={() => setLogSwim(false)} />}
    </div>
  );
}

// ─── CAREER VIEW ──────────────────────────────────────────────────────────────
function CareerView({ player }) {
  const [selected, setSelected] = useState(() => new Set(player.seasons.map(s => s.id)));

  // Keep set synced if seasons change
  useEffect(() => {
    setSelected(prev => {
      const next = new Set(prev);
      player.seasons.forEach(s => { if (!next.has(s.id)) next.add(s.id); }); // add new
      return new Set([...next].filter(id => player.seasons.some(s => s.id === id))); // remove deleted
    });
  }, [player.seasons]);

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => selected.size === player.seasons.length
    ? setSelected(new Set()) : setSelected(new Set(player.seasons.map(s => s.id)));

  const activeSeason = player.seasons.filter(s => selected.has(s.id));
  const allGames = activeSeason.flatMap(s => s.games);
  const kpis = useMemo(() => calcKPIs(allGames), [allGames]);
  const { totals } = kpis;

  // Swim bests across selected seasons
  const careerSwimBests = useMemo(() => {
    const bests = {};
    SWIM_EVENTS.forEach(ev => {
      const all = activeSeason.flatMap(s => s.swimTimes[ev] || []);
      bests[ev] = bestSwimTime(all);
    });
    return bests;
  }, [activeSeason]);

  // Season-by-season breakdown table
  const seasonBreakdown = activeSeason.map(s => {
    const k = calcKPIs(s.games);
    return { s, k };
  });

  if (player.seasons.length === 0) {
    return <div className="empty"><div className="empty-icon">📅</div><p>No seasons yet. Add a season to start tracking.</p></div>;
  }

  return (
    <div>
      {/* Career banner */}
      <div className="career-banner mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 900, letterSpacing: 2, color: "var(--foam)" }}>
              CAREER STATS
            </div>
            <div className="text-xs text-sub">{activeSeason.length} of {player.seasons.length} seasons · {allGames.length} games</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={toggleAll}>
            {selected.size === player.seasons.length ? "Deselect All" : "Select All"}
          </button>
        </div>

        {/* Season toggles */}
        <div className="s-pills">
          {player.seasons.map(s => (
            <button key={s.id} className={`s-pill ${selected.has(s.id) ? "on" : ""}`} onClick={() => toggle(s.id)}>
              <span className={`type-dot ${s.type}`} />
              {s.label}
              <span className="text-xs" style={{ marginLeft: 5, opacity: .7 }}>({s.games.length}G)</span>
            </button>
          ))}
        </div>
      </div>

      {activeSeason.length === 0 ? (
        <div className="empty"><p>Select at least one season to view career stats.</p></div>
      ) : (
        <>
          {/* Career KPIs */}
          <div className="kpi-row mb-4">
            <KPI label="Games Played" val={kpis.gp} accent="var(--wave)" />
            <KPI label="Career Goals" val={totals.goals} accent="var(--mint)" />
            <KPI label="Career Assists" val={totals.assists} accent="var(--foam)" />
            <KPI label="Shooting %" val={kpis.shootPct === "—" ? "—" : `${kpis.shootPct}%`} accent="var(--mint)" />
            <KPI label="Career Steals" val={totals.steals} accent="var(--gold)" />
            <KPI label="Career Blocks" val={totals.blocks} accent="var(--foam)" />
            <KPI label="Avg API" val={kpis.api} accent="var(--gold)" />
            <KPI label="Avg OPI" val={kpis.opi} accent="var(--wave)" />
            <KPI label="Avg DPI" val={kpis.dpi} accent="var(--mint)" />
            <KPI label="Save %" val={kpis.savePct === "—" ? "—" : `${kpis.savePct}%`} accent="var(--rose)" />
          </div>

          {/* Season comparison table */}
          <div className="panel mb-4">
            <div className="panel-title">Season-by-Season Breakdown</div>
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Season</th><th>Type</th><th>GP</th><th>Goals</th><th>Ast</th>
                    <th>Shoot%</th><th>Steals</th><th>Blocks</th><th>API</th><th>OPI</th><th>DPI</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonBreakdown.map(({ s, k }) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 700 }}>{s.label}</td>
                      <td><TypeBadge type={s.type} /></td>
                      <td>{k.gp}</td>
                      <td className="hi">{k.totals.goals}</td>
                      <td>{k.totals.assists}</td>
                      <td>{k.shootPct === "—" ? "—" : `${k.shootPct}%`}</td>
                      <td>{k.totals.steals}</td>
                      <td>{k.totals.blocks}</td>
                      <td className="gold">{k.api}</td>
                      <td>{k.opi}</td>
                      <td>{k.dpi}</td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr style={{ borderTop: "2px solid var(--wave)", background: "rgba(2,132,199,.05)" }}>
                    <td style={{ fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1 }}>CAREER TOTAL</td>
                    <td></td>
                    <td style={{ fontWeight: 700 }}>{kpis.gp}</td>
                    <td className="hi" style={{ fontWeight: 900 }}>{totals.goals}</td>
                    <td style={{ fontWeight: 700 }}>{totals.assists}</td>
                    <td style={{ fontWeight: 700 }}>{kpis.shootPct === "—" ? "—" : `${kpis.shootPct}%`}</td>
                    <td style={{ fontWeight: 700 }}>{totals.steals}</td>
                    <td style={{ fontWeight: 700 }}>{totals.blocks}</td>
                    <td className="gold" style={{ fontWeight: 900 }}>{kpis.api}</td>
                    <td style={{ fontWeight: 700 }}>{kpis.opi}</td>
                    <td style={{ fontWeight: 700 }}>{kpis.dpi}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Career swim bests */}
          <div className="panel mb-4">
            <div className="panel-title">Career Swim Bests (selected seasons)</div>
            <table className="tbl">
              <thead><tr><th>Event</th><th>Career Best</th>{activeSeason.map(s => <th key={s.id}>{s.label}</th>)}</tr></thead>
              <tbody>
                {SWIM_EVENTS.map(ev => (
                  <tr key={ev}>
                    <td style={{ fontWeight: 700 }}>{ev}</td>
                    <td>{careerSwimBests[ev] ? <span className="swim-best">{careerSwimBests[ev].toFixed(2)}s</span> : <span className="text-sub">—</span>}</td>
                    {activeSeason.map(s => {
                      const b = bestSwimTime(s.swimTimes[ev] || []);
                      const isCareerBest = b && b === careerSwimBests[ev];
                      return <td key={s.id}>{b ? <span className={isCareerBest ? "swim-best" : ""}>{b.toFixed(2)}s</span> : <span className="text-sub">—</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Career full stats */}
          <div className="panel">
            <div className="panel-title">Career Full Stat Totals</div>
            <div className="stat-grid">
              {STAT_FIELDS.map(f => <Stat key={f.key} label={f.label} val={totals[f.key]} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── PLAYER DETAIL ────────────────────────────────────────────────────────────
function PlayerDetail({ player, onBack, onUpdate }) {
  const [view, setView] = useState("career"); // "career" | seasonId
  const [addSeason, setAddSeason] = useState(false);
  const [editSeason, setEditSeason] = useState(null);

  const activeSeason = player.seasons.find(s => s.id === view);

  const handleAddSeason = (f) => {
    const s = { ...newSeason(f.label, f.type), startDate: f.startDate, endDate: f.endDate, notes: f.notes };
    onUpdate({ ...player, seasons: [...player.seasons, s] });
    setAddSeason(false);
    setView(s.id);
  };
  const handleEditSeason = (f) => {
    onUpdate({ ...player, seasons: player.seasons.map(s => s.id === editSeason.id ? { ...s, ...f } : s) });
    setEditSeason(null);
  };
  const handleUpdateSeason = (updated) => {
    onUpdate({ ...player, seasons: player.seasons.map(s => s.id === updated.id ? updated : s) });
  };
  const handleDeleteSeason = (id) => {
    onUpdate({ ...player, seasons: player.seasons.filter(s => s.id !== id) });
    setView("career");
  };

  return (
    <div>
      {/* Player header */}
      <div className="player-header mb-4">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Roster</button>
        <div className="flex items-center gap-3" style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 40, fontWeight: 900, color: "var(--wave)", lineHeight: 1, flexShrink: 0 }}>
            #{player.number || "?"}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</div>
            <div className="text-xs text-sub" style={{ textTransform: "uppercase", letterSpacing: 1 }}>{player.position}</div>
          </div>
        </div>
        <button className="btn btn-wave btn-sm" onClick={() => setAddSeason(true)}>+ Season</button>
      </div>

      {/* Season selector */}
      <div className="panel mb-4">
        <div className="panel-title" style={{ marginBottom: 10 }}>Seasons</div>
        <div className="flex flex-wrap gap-2 items-center">
          {/* Career button */}
          <button className={`s-pill ${view === "career" ? "on" : ""}`} onClick={() => setView("career")}>
            🏆 Career
          </button>
          {player.seasons.length === 0 && <span className="text-xs text-sub">No seasons yet — add one to start tracking.</span>}
          {player.seasons.map(s => (
            <div key={s.id} className="flex items-center gap-1">
              <button className={`s-pill ${view === s.id ? "on" : ""}`} onClick={() => setView(s.id)}>
                <span className={`type-dot ${s.type}`} />
                {s.label}
              </button>
              {view === s.id && (
                <button className="btn btn-ghost btn-xs" onClick={() => setEditSeason(s)}>✏️</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      {view === "career" ? (
        <CareerView player={player} />
      ) : activeSeason ? (
        <SeasonView
          season={activeSeason}
          onUpdateSeason={handleUpdateSeason}
          onDeleteSeason={() => handleDeleteSeason(activeSeason.id)}
        />
      ) : null}

      {addSeason && <SeasonModal onSave={handleAddSeason} onClose={() => setAddSeason(false)} />}
      {editSeason && <SeasonModal editing={editSeason} onSave={handleEditSeason} onClose={() => setEditSeason(null)} />}
    </div>
  );
}

// ─── TEAM DASHBOARD ───────────────────────────────────────────────────────────
function TeamDashboard({ players }) {
  const stats = useMemo(() => players.map(p => {
    const allGames = p.seasons.flatMap(s => s.games);
    const k = calcKPIs(allGames);
    return { p, k };
  }), [players]);

  const sorted = {
    goals: [...stats].sort((a, b) => b.k.totals.goals - a.k.totals.goals),
    api:   [...stats].sort((a, b) => parseFloat(b.k.api) - parseFloat(a.k.api)).filter(x => x.k.gp > 0),
    steals:[...stats].sort((a, b) => b.k.totals.steals - a.k.totals.steals),
  };

  const teamTotals = useMemo(() => {
    const allGames = players.flatMap(p => p.seasons.flatMap(s => s.games));
    return calcKPIs(allGames);
  }, [players]);

  const { totals, gp, shootPct } = teamTotals;

  return (
    <div>
      <div className="career-banner mb-4">
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 900, letterSpacing: 2, color: "var(--foam)", marginBottom: 12 }}>
          TEAM OVERVIEW
        </div>
        <div className="kpi-row">
          <KPI label="Players" val={players.length} accent="var(--wave)" />
          <KPI label="Total Games" val={gp} accent="var(--foam)" />
          <KPI label="Total Goals" val={totals.goals} accent="var(--mint)" />
          <KPI label="Team Shoot%" val={shootPct === "—" ? "—" : `${shootPct}%`} accent="var(--mint)" />
          <KPI label="Total Assists" val={totals.assists} accent="var(--gold)" />
          <KPI label="Total Steals" val={totals.steals} accent="var(--gold)" />
          <KPI label="Total Blocks" val={totals.blocks} accent="var(--foam)" />
          <KPI label="Avg API" val={teamTotals.api} accent="var(--wave)" />
        </div>
      </div>

      {players.length === 0 ? (
        <div className="empty"><div className="empty-icon">🤽</div><p>Add players to the roster to see team stats.</p></div>
      ) : (
        <div className="two-col">
          {/* Top scorers */}
          <div className="panel">
            <div className="panel-title">Top Goal Scorers</div>
            {sorted.goals.slice(0, 8).map(({ p, k }, i) => (
              <div key={p.id} className="flex items-center gap-2 mb-2">
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, color: i === 0 ? "var(--gold)" : "var(--mute)", width: 24 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <div className="text-bold">{p.name}</div>
                  <div className="text-xs text-sub">{p.position} · {k.gp} GP</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, color: "var(--mint)" }}>{k.totals.goals}</div>
                  <div className="text-xs text-sub">{k.shootPct === "—" ? "" : `${k.shootPct}%`}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Top API */}
          <div className="panel">
            <div className="panel-title">Top API Performers</div>
            {sorted.api.slice(0, 8).map(({ p, k }, i) => (
              <div key={p.id} className="flex items-center gap-2 mb-2">
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, color: i === 0 ? "var(--gold)" : "var(--mute)", width: 24 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <div className="text-bold">{p.name}</div>
                  <div className="text-xs text-sub">{p.position} · {k.gp} GP</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, color: "var(--gold)" }}>{k.api}</div>
                  <div className="text-xs text-sub">API</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("roster");  // "roster" | "dashboard"
  const [addPlayer, setAddPlayer] = useState(false);
  const [editPlayer, setEditPlayer] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // Hydrate on mount
  useEffect(() => {
    hydrate().then(d => {
      if (d?.players) setPlayers(d.players);
      setLoading(false);
    });
  }, []);

  // Persist on every change
  useEffect(() => {
    if (!loading) persist({ players });
  }, [players, loading]);

  const selected = players.find(p => p.id === selectedId);

  const handleAddPlayer = (f) => {
    const p = newPlayer(f.name, f.number, f.position);
    setPlayers(ps => [...ps, p]);
    setAddPlayer(false);
  };
  const handleEditPlayer = (f) => {
    setPlayers(ps => ps.map(p => p.id === editPlayer.id ? { ...p, ...f } : p));
    setEditPlayer(null);
  };
  const handleUpdatePlayer = useCallback((updated) => {
    setPlayers(ps => ps.map(p => p.id === updated.id ? updated : p));
    setSelectedId(updated.id);
  }, []);
  const handleDeletePlayer = (id) => {
    if (window.confirm("Delete this player and all their data?")) {
      setPlayers(ps => ps.filter(p => p.id !== id));
      if (selectedId === id) setSelectedId(null);
    }
  };

  if (loading) {
    return (
      <div className="load-screen">
        <style>{STYLES}</style>
        <div className="spinner" />
        <div className="text-sub text-sm">Loading your data...</div>
      </div>
    );
  }

  return (
    <div className="shell">
      <style>{STYLES}</style>

      <header className="topbar">
        <div>
          <div className="logo">Water<span>Track</span></div>
          <div style={{ fontSize: 10, color: "var(--mute)", letterSpacing: 2, textTransform: "uppercase" }}>Pro Performance Tracker</div>
        </div>
        {!selected && (
          <nav className="topbar-nav">
            <button className={`tnav ${page === "dashboard" ? "on" : ""}`} onClick={() => setPage("dashboard")}>Dashboard</button>
            <button className={`tnav ${page === "roster" ? "on" : ""}`} onClick={() => setPage("roster")}>Roster</button>
          </nav>
        )}
      </header>

      <main className="main">
        {selected ? (
          <PlayerDetail
            player={selected}
            onBack={() => setSelectedId(null)}
            onUpdate={handleUpdatePlayer}
          />
        ) : page === "roster" ? (
          <div className="sidebar-layout">
            {/* Sidebar: player list */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: 2, color: "var(--foam)", textTransform: "uppercase" }}>
                  Roster ({players.length})
                </span>
                <button className="btn btn-wave btn-sm" onClick={() => setAddPlayer(true)}>+ Player</button>
              </div>
              {players.length === 0 ? (
                <div className="panel">
                  <div className="empty"><div className="empty-icon">👤</div><p>No players yet.<br />Add your first player.</p></div>
                </div>
              ) : (
                <div className="p-list">
                  {[...players].sort((a, b) => (parseInt(a.number) || 99) - (parseInt(b.number) || 99)).map(p => {
                    const allGames = p.seasons.flatMap(s => s.games);
                    const { gp } = calcKPIs(allGames);
                    return (
                      <div key={p.id} className={`p-row ${selectedId === p.id ? "sel" : ""}`} onClick={() => { setSelectedId(p.id); }}>
                        <div className="p-num">#{p.number || "?"}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="p-name">{p.name}</div>
                          <div className="p-pos">{p.position}</div>
                        </div>
                        <div className="flex flex-col items-center" style={{ gap: 2, flexShrink: 0 }}>
                          <span className="chip chip-wave">{p.seasons.length}S</span>
                          <span className="chip chip-sub">{gp}G</span>
                        </div>
                        <div className="flex gap-1" style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          <button className="btn btn-ghost btn-xs" onClick={() => setEditPlayer(p)}>✏️</button>
                          <button className="btn btn-rose btn-xs" onClick={() => handleDeletePlayer(p.id)}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick snapshot — hidden on mobile to avoid clutter, shown on desktop */}
            <div>
              <div className="panel">
                <div className="panel-title">Quick Snapshot</div>
                {players.length === 0 ? (
                  <div className="empty" style={{ padding: "24px" }}><p>Add players to see stats here.</p></div>
                ) : (
                  <div className="scroll-x">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>#</th><th>Name</th><th>Pos</th><th>S</th><th>GP</th>
                          <th>G</th><th>Ast</th><th>Sh%</th><th>Stl</th><th>Blk</th><th>API</th>
                          <th>50Fr Best</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...players].sort((a, b) => (parseInt(a.number) || 99) - (parseInt(b.number) || 99)).map(p => {
                          const allGames = p.seasons.flatMap(s => s.games);
                          const { gp, totals, shootPct, api } = calcKPIs(allGames);
                          const best50 = bestSwimTime(p.seasons.flatMap(s => s.swimTimes["50 Free"] || []));
                          return (
                            <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(p.id)}>
                              <td style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, color: "var(--wave)" }}>#{p.number}</td>
                              <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{p.name}</td>
                              <td className="text-sub">{p.position}</td>
                              <td>{p.seasons.length}</td>
                              <td>{gp}</td>
                              <td className="hi">{totals.goals}</td>
                              <td>{totals.assists}</td>
                              <td>{shootPct === "—" ? "—" : `${shootPct}%`}</td>
                              <td>{totals.steals}</td>
                              <td>{totals.blocks}</td>
                              <td className="gold">{api}</td>
                              <td>{best50 ? <span className="swim-best">{best50.toFixed(2)}s</span> : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <TeamDashboard players={players} />
        )}
      </main>

      {addPlayer && <PlayerModal onSave={handleAddPlayer} onClose={() => setAddPlayer(false)} />}
      {editPlayer && <PlayerModal editing={editPlayer} onSave={handleEditPlayer} onClose={() => setEditPlayer(null)} />}
    </div>
  );
}
