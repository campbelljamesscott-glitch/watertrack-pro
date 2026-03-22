#!/usr/bin/env python3
"""
WaterTrack Pro - Live Match Capture Patch
Run from: /Users/scottcampbell/watertrack-pro/
Command:  python3 /path/to/patch_live_match.py

What this does:
  1. Adds a 'Match' nav button to the top navigation bar
  2. Adds 'match' to the page render switch
  3. Injects the full live match capture screen + JS
  4. Copies the result to public/index.html for Vercel deployment
"""

import shutil, sys, os

SRC  = 'index.html'
DEST = 'public/index.html'
BAK  = 'index.html.bak2'

# ── Safety check ──────────────────────────────────────────────────────────────
if not os.path.exists(SRC):
    print(f'ERROR: {SRC} not found. Run this script from the watertrack-pro folder.')
    sys.exit(1)

with open(SRC, 'r', encoding='utf-8') as f:
    html = f.read()

# Guard: don't patch twice
if 'showPage(\'match\')' in html:
    print('Already patched — live match capture is already present.')
    sys.exit(0)

shutil.copy(SRC, BAK)
print(f'Backup saved → {BAK}')

# ── PATCH 1: Add Match nav button ─────────────────────────────────────────────
OLD_NAV = '<button class="nav-btn on" id="nav-roster" onclick="showPage(\'roster\')">Roster</button>'
NEW_NAV = (
    '<button class="nav-btn on" id="nav-roster" onclick="showPage(\'roster\')">Roster</button>\n'
    '      <button class="nav-btn" id="nav-match" onclick="showPage(\'match\')">Match</button>'
)
if OLD_NAV not in html:
    print('ERROR: Could not find nav roster button. File may have changed.')
    sys.exit(1)
html = html.replace(OLD_NAV, NEW_NAV, 1)
print('Patch 1 done: nav button added')

# ── PATCH 2: Add match to page render switch ──────────────────────────────────
OLD_RENDER = "if (state.page==='roster') main.innerHTML = renderRoster();"
NEW_RENDER = (
    "if (state.page==='roster') main.innerHTML = renderRoster();\n"
    "  if (state.page==='match') main.innerHTML = renderMatch();"
)
if OLD_RENDER not in html:
    print('ERROR: Could not find render switch.')
    sys.exit(1)
html = html.replace(OLD_RENDER, NEW_RENDER, 1)
print('Patch 2 done: render switch added')

# ── PATCH 3: Add match page nav highlight to showPage ─────────────────────────
OLD_PAGES = "['dashboard','roster','admin'].forEach(p=>{"
NEW_PAGES = "['dashboard','roster','admin','match'].forEach(p=>{"
if OLD_PAGES not in html:
    print('ERROR: Could not find pages array in showPage.')
    sys.exit(1)
html = html.replace(OLD_PAGES, NEW_PAGES, 1)
print('Patch 3 done: match added to nav highlight list')

# ── PATCH 4: Inject live match CSS + renderMatch() + JS before </script> ──────
LIVE_MATCH_CODE = r"""
// ── LIVE MATCH CAPTURE ────────────────────────────────────────────────────────

const lm = {
  opponent: '', date: '', quarter: 1,
  usScore: 0, themScore: 0,
  events: [],        // {id, quarter, player_id, cap, name, type, label, ts}
  selectedPlayer: null,
  pendingEvent: null
};

const LM_EVENTS = [
  // Offense
  {key:'goals',         label:'Goal',        cat:'offense', color:'#10b981', statKey:'goals'},
  {key:'attempts',      label:'Shot',        cat:'offense', color:'#38bdf8', statKey:'attempts'},
  {key:'missedShots',   label:'Miss',        cat:'offense', color:'#7ca0be', statKey:'missedShots'},
  {key:'assists',       label:'Assist',      cat:'offense', color:'#10b981', statKey:'assists'},
  {key:'penaltyGoals',  label:'Pen Goal',    cat:'offense', color:'#f59e0b', statKey:'penaltyGoals'},
  {key:'powerPlayGoals',label:'6v5 Goal',    cat:'offense', color:'#f59e0b', statKey:'powerPlayGoals'},
  {key:'counterAttackGoals',label:'Counter', cat:'offense', color:'#10b981', statKey:'counterAttackGoals'},
  // Defense
  {key:'steals',        label:'Steal',       cat:'defense', color:'#0284c7', statKey:'steals'},
  {key:'blocks',        label:'Block',       cat:'defense', color:'#0284c7', statKey:'blocks'},
  {key:'earnedExclusions',label:'Excl Earned',cat:'defense',color:'#f59e0b',statKey:'earnedExclusions'},
  {key:'exclusionsForced',label:'Excl Force', cat:'defense',color:'#f59e0b',statKey:'exclusionsForced'},
  {key:'goalsAllowed',  label:'Goal Allow',  cat:'defense', color:'#f43f5e', statKey:'goalsAllowed'},
  // General
  {key:'sprints',       label:'Sprint Won',  cat:'general', color:'#a78bfa', statKey:'sprints'},
  {key:'personalFouls', label:'Foul',        cat:'general', color:'#f43f5e', statKey:'personalFouls'},
  {key:'turnovers',     label:'Turnover',    cat:'general', color:'#f43f5e', statKey:'turnovers'},
];

function lmRenderScoreboard() {
  const q = ['Q1','Q2','Q3','Q4','OT'][lm.quarter-1] || 'Q'+lm.quarter;
  return `
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;color:var(--sub);text-transform:uppercase">
          vs ${lm.opponent || '—'}  ·  ${lm.date || '—'}
        </div>
        <div style="display:flex;gap:6px">
          ${[1,2,3,4].map(n=>`<button onclick="lmSetQ(${n})" style="width:36px;height:28px;border-radius:6px;border:1px solid ${lm.quarter===n?'var(--wave)':'var(--line)'};background:${lm.quarter===n?'var(--wave)':'var(--raised)'};color:${lm.quarter===n?'#fff':'var(--sub)'};font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;cursor:pointer">Q${n}</button>`).join('')}
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:20px">
        <div style="text-align:center">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;color:var(--sub);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Us</div>
          <div style="display:flex;align-items:center;gap:8px">
            <button onclick="lmAdjScore('us',-1)" style="width:32px;height:32px;border-radius:8px;background:var(--raised);border:1px solid var(--line);color:var(--sub);font-size:18px;cursor:pointer">−</button>
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:52px;font-weight:900;color:var(--mint);line-height:1">${lm.usScore}</span>
            <button onclick="lmAdjScore('us',1)" style="width:32px;height:32px;border-radius:8px;background:var(--mint);border:none;color:#fff;font-size:18px;cursor:pointer">+</button>
          </div>
        </div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:28px;color:var(--line)">:</div>
        <div style="text-align:center">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;color:var(--sub);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Them</div>
          <div style="display:flex;align-items:center;gap:8px">
            <button onclick="lmAdjScore('them',-1)" style="width:32px;height:32px;border-radius:8px;background:var(--raised);border:1px solid var(--line);color:var(--sub);font-size:18px;cursor:pointer">−</button>
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:52px;font-weight:900;color:var(--rose);line-height:1">${lm.themScore}</span>
            <button onclick="lmAdjScore('them',1)" style="width:32px;height:32px;border-radius:8px;background:var(--rose);border:none;color:#fff;font-size:18px;cursor:pointer">+</button>
          </div>
        </div>
      </div>
    </div>`;
}

function lmRenderPlayers() {
  const sorted = [...state.players].sort((a,b)=>(parseInt(a.number)||99)-(parseInt(b.number)||99));
  if (!sorted.length) return `<div style="color:var(--sub);text-align:center;padding:20px;font-size:13px">No players in roster. Add players first.</div>`;
  return `
    <div style="margin-bottom:10px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;color:var(--sub);text-transform:uppercase;margin-bottom:8px">1. Select player</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${sorted.map(p => {
          const sel = lm.selectedPlayer && lm.selectedPlayer.id === p.id;
          return `<button onclick="lmSelectPlayer('${p.id}')" style="min-width:54px;padding:8px 10px;border-radius:10px;border:2px solid ${sel?'var(--wave)':'var(--line)'};background:${sel?'var(--wave)':'var(--raised)'};cursor:pointer;text-align:center;transition:all 0.15s">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:900;color:${sel?'#fff':'var(--foam)'}">${p.number||'?'}</div>
            <div style="font-size:9px;color:${sel?'rgba(255,255,255,0.8)':'var(--sub)'};margin-top:1px;white-space:nowrap;overflow:hidden;max-width:52px;text-overflow:ellipsis">${p.name.split(' ')[0]}</div>
          </button>`;
        }).join('')}
      </div>
    </div>`;
}

function lmRenderEvents() {
  const offenseEvents = LM_EVENTS.filter(e=>e.cat==='offense');
  const defenseEvents = LM_EVENTS.filter(e=>e.cat==='defense');
  const generalEvents = LM_EVENTS.filter(e=>e.cat==='general');

  const disabled = !lm.selectedPlayer;
  const disStyle = disabled ? 'opacity:0.35;pointer-events:none' : '';

  function btnGroup(evts) {
    return evts.map(e => `
      <button onclick="lmLogEvent('${e.key}')" style="${disStyle};padding:10px 8px;border-radius:10px;border:1px solid var(--line);background:var(--raised);cursor:pointer;text-align:center;flex:1;min-width:72px;max-width:100px">
        <div style="font-size:11px;font-weight:700;color:${e.color};line-height:1.2">${e.label}</div>
      </button>`).join('');
  }

  return `
    <div style="margin-bottom:10px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;color:var(--sub);text-transform:uppercase;margin-bottom:8px">2. Tap event</div>
      <div style="font-size:10px;color:var(--sub);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Offense</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${btnGroup(offenseEvents)}</div>
      <div style="font-size:10px;color:var(--sub);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Defense</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${btnGroup(defenseEvents)}</div>
      <div style="font-size:10px;color:var(--sub);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">General</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${btnGroup(generalEvents)}</div>
    </div>`;
}

function lmRenderFeed() {
  if (!lm.events.length) return `
    <div style="color:var(--sub);text-align:center;padding:16px;font-size:12px;border:1px dashed var(--line);border-radius:10px">
      Events will appear here as you log them
    </div>`;

  const recent = [...lm.events].reverse().slice(0, 30);
  return `
    <div style="margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;color:var(--sub);text-transform:uppercase">Event log (${lm.events.length})</div>
        <button onclick="lmUndo()" style="font-size:11px;padding:4px 10px;border-radius:6px;background:var(--raised);border:1px solid var(--line);color:var(--sub);cursor:pointer">↩ Undo</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;max-height:260px;overflow-y:auto">
        ${recent.map((ev,i) => {
          const evDef = LM_EVENTS.find(e=>e.key===ev.type);
          const color = evDef ? evDef.color : 'var(--sub)';
          return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--raised);border-radius:8px;border-left:3px solid ${color}">
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:900;color:var(--foam);min-width:28px">#${ev.cap}</span>
            <span style="font-size:12px;color:var(--txt);flex:1">${ev.name.split(' ')[0]}</span>
            <span style="font-size:11px;font-weight:700;color:${color}">${ev.label}</span>
            <span style="font-size:10px;color:var(--sub)">Q${ev.quarter}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function renderMatch() {
  const hasSetup = lm.opponent && lm.date;
  return `
    <div style="padding-bottom:80px">
      ${!hasSetup ? `
        <div style="background:var(--panel);border:1px solid var(--wave);border-radius:14px;padding:16px;margin-bottom:12px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;color:var(--foam);text-transform:uppercase;margin-bottom:12px">Match Setup</div>
          <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:140px">
              <label style="font-size:11px;color:var(--sub);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px">Opponent</label>
              <input id="lm-opp" class="f-input" placeholder="Team name" style="width:100%">
            </div>
            <div style="flex:1;min-width:140px">
              <label style="font-size:11px;color:var(--sub);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px">Date</label>
              <input id="lm-date" type="date" class="f-input" value="${new Date().toISOString().slice(0,10)}" style="width:100%">
            </div>
          </div>
          <button onclick="lmStartMatch()" class="btn btn-green" style="width:100%">Start Match</button>
        </div>
      ` : `
        ${lmRenderScoreboard()}
        ${lmRenderPlayers()}
        ${lmRenderEvents()}
        ${lmRenderFeed()}
        <div style="display:flex;gap:8px;margin-top:16px">
          <button onclick="lmFinishMatch()" class="btn btn-green" style="flex:1">Finish &amp; Save</button>
          <button onclick="lmReset()" class="btn btn-ghost" style="padding:10px 16px">Reset</button>
        </div>
      `}
    </div>`;
}

function lmStartMatch() {
  const opp = document.getElementById('lm-opp')?.value?.trim();
  const date = document.getElementById('lm-date')?.value;
  if (!opp) { alert('Enter opponent name'); return; }
  lm.opponent = opp;
  lm.date = date;
  lm.events = [];
  lm.usScore = 0;
  lm.themScore = 0;
  lm.quarter = 1;
  lm.selectedPlayer = null;
  render();
}

function lmSetQ(n) { lm.quarter = n; render(); }

function lmAdjScore(side, delta) {
  if (side==='us') lm.usScore = Math.max(0, lm.usScore + delta);
  else lm.themScore = Math.max(0, lm.themScore + delta);
  render();
}

function lmSelectPlayer(pid) {
  const p = state.players.find(x=>x.id===pid);
  lm.selectedPlayer = (lm.selectedPlayer && lm.selectedPlayer.id===pid) ? null : p;
  render();
}

function lmLogEvent(eventKey) {
  if (!lm.selectedPlayer) return;
  const evDef = LM_EVENTS.find(e=>e.key===eventKey);
  if (!evDef) return;
  const p = lm.selectedPlayer;
  lm.events.push({
    id: Date.now(),
    quarter: lm.quarter,
    player_id: p.id,
    cap: p.number || '?',
    name: p.name,
    type: eventKey,
    label: evDef.label,
    statKey: evDef.statKey,
    ts: new Date().toISOString()
  });
  // Flash feedback
  const el = document.querySelector('[data-lm-player="'+p.id+'"]');
  render();
}

function lmUndo() {
  if (!lm.events.length) return;
  lm.events.pop();
  render();
}

async function lmFinishMatch() {
  if (!lm.events.length) { alert('No events logged yet.'); return; }
  if (!confirm('Save this match and post stats to all players?')) return;

  // Tally stats per player from events
  const playerStats = {};
  lm.events.forEach(ev => {
    if (!playerStats[ev.player_id]) playerStats[ev.player_id] = emptyStats();
    if (playerStats[ev.player_id][ev.statKey] !== undefined) {
      playerStats[ev.player_id][ev.statKey]++;
    }
  });

  const date = lm.date;
  const opponent = lm.opponent;
  let saved = 0;

  for (const [pid, stats] of Object.entries(playerStats)) {
    const player = state.players.find(p=>p.id===pid);
    if (!player) continue;
    const activeSeason = player.seasons[player.seasons.length-1];
    if (!activeSeason) continue;
    const g = await dbAddGame(activeSeason.id, date, opponent, stats);
    if (g) {
      activeSeason.games.push(g);
      saved++;
    }
  }

  alert('Match saved for ' + saved + ' player(s). Final: ' + lm.usScore + ' – ' + lm.themScore);
  lmReset();
  render();
}

function lmReset() {
  lm.opponent = ''; lm.date = ''; lm.quarter = 1;
  lm.usScore = 0; lm.themScore = 0;
  lm.events = []; lm.selectedPlayer = null;
  render();
}
"""

# Find the closing </script> tag to insert before
INSERT_BEFORE = '</script>\n</body>'
if INSERT_BEFORE not in html:
    # Try alternative
    INSERT_BEFORE = '</script>\n\n</body>'
if INSERT_BEFORE not in html:
    print('ERROR: Could not find script closing tag. Check index.html structure.')
    sys.exit(1)

html = html.replace(INSERT_BEFORE, LIVE_MATCH_CODE + '\n' + INSERT_BEFORE, 1)
print('Patch 4 done: live match JS injected')

# ── Write patched file ────────────────────────────────────────────────────────
with open(SRC, 'w', encoding='utf-8') as f:
    f.write(html)
print(f'Written → {SRC}')

# ── Copy to public/ for Vercel ────────────────────────────────────────────────
if os.path.exists('public'):
    shutil.copy(SRC, DEST)
    print(f'Copied  → {DEST}  (Vercel deploy target)')
else:
    print('WARNING: public/ folder not found — skipping Vercel copy')

print('\nAll done! Now run:')
print('  git add -A && git commit -m "Add live match capture" && git push')
print('\nThen open: https://watertrack-pro.vercel.app/')
print('Go to Match tab, set up a match, select a player, tap events.')
