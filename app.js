/* How To Be A Millionaire — personal money tracker (v1)
 * All data is stored on this device only (localStorage). Nothing is uploaded.
 */
(function () {
  'use strict';

  // ---------- Constants ----------
  const STORE_KEY = 'htbam.v1';
  const UP = '📈⬆️💰';
  const DOWN = '⚠️📉⬇️💸';

  const CATS = {
    expense: [
      { id: 'fnb', n: 'F&B', e: '🍜' },
      { id: 'groceries', n: 'Groceries', e: '🛒' },
      { id: 'entertainment', n: 'Entertainment', e: '🎮' },
      { id: 'transport', n: 'Transport', e: '🚗' },
      { id: 'shopping', n: 'Shopping', e: '🛍️' },
      { id: 'education', n: 'Education', e: '📚' },
      { id: 'commitments', n: 'Commitments', e: '📄' },
      { id: 'betting', n: 'Betting', e: '🎲' },
      { id: 'others', n: 'Others', e: '📦' }
    ],
    income: [
      { id: 'allowance', n: 'Allowance', e: '👨‍👩‍👦' },
      { id: 'invreturn', n: 'Investment returns', e: '📈' },
      { id: 'bettingwin', n: 'Betting win', e: '🎲' },
      { id: 'otherincome', n: 'Other', e: '💵' }
    ],
    transfer: [
      { id: 'savings', n: 'Savings', e: '🏦' },
      { id: 'investment', n: 'Investment', e: '📊' }
    ]
  };
  const CAT_INDEX = {};
  Object.keys(CATS).forEach(t => CATS[t].forEach(c => { CAT_INDEX[c.id] = c; }));

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // ---------- Date helpers (local time, never UTC) ----------
  const pad = n => String(n).padStart(2, '0');
  const ds = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayStr = () => ds(new Date());
  const dim = (y, m) => new Date(y, m + 1, 0).getDate();
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ds(d); };
  const monthKey = s => s.slice(0, 7);
  const prettyDate = s => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

  // ---------- Money helpers ----------
  const r2 = n => Math.round(n * 100) / 100;
  const fmt = n => 'RM ' + Math.abs(r2(n)).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtS = n => (r2(n) > 0 ? '+' : r2(n) < 0 ? '−' : '') + fmt(n);
  const fmtShort = n => {
    const a = Math.abs(n);
    const s = a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1) + 'k' : a.toFixed(0);
    return (n > 0.004 ? '+' : n < -0.004 ? '−' : '') + s;
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- State ----------
  const defaultState = () => ({
    settings: {
      setupDone: false,
      startDate: todayStr(),
      startBalance: 0,
      startSavings: 0,
      startInvestment: 0,
      monthlyAllowance: 0,
      nextAllowance: '',
      dailyBudget: 0,
      monthlyTarget: 0,
      yearlyTarget: 0
    },
    tx: [],
    commitments: []
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      const d = defaultState();
      return { settings: Object.assign(d.settings, s.settings || {}), tx: s.tx || [], commitments: s.commitments || [] };
    } catch (e) {
      return defaultState();
    }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('⚠️ Could not save — storage full or blocked'); }
  }

  // ---------- Recurring commitments ----------
  function commitmentDate(c, y, m) {
    return `${y}-${pad(m + 1)}-${pad(Math.min(c.day, dim(y, m)))}`;
  }
  function autoLogCommitments() {
    const t = todayStr();
    let added = 0;
    state.commitments.forEach(c => {
      let [y, m] = (c.from || monthKey(t)).split('-').map(Number); m -= 1;
      const [ty, tm] = [parse(t).getFullYear(), parse(t).getMonth()];
      let guard = 0;
      while ((y < ty || (y === ty && m <= tm)) && guard++ < 240) {
        const date = commitmentDate(c, y, m);
        const mk = date.slice(0, 7);
        if (date <= t && date >= state.settings.startDate &&
            !state.tx.some(x => x.auto === c.id && monthKey(x.date) === mk)) {
          state.tx.push({ id: uid(), date, type: 'expense', cat: 'commitments', amount: c.amount, note: c.name + ' (auto)', auto: c.id });
          added++;
        }
        m++; if (m > 11) { m = 0; y++; }
      }
    });
    if (added) save();
    return added;
  }

  // ---------- Calculations ----------
  function sumRange(from, to) {
    const r = { inc: 0, exp: 0, disc: 0, allowance: 0, toSav: 0, fromSav: 0, toInv: 0, fromInv: 0, byCat: {}, count: 0, bettingLoss: 0, bettingWin: 0 };
    for (const x of state.tx) {
      if (x.date < from || x.date > to) continue;
      r.count++;
      const a = Number(x.amount) || 0;
      if (x.type === 'income') {
        r.inc += a;
        if (x.cat === 'allowance') r.allowance += a;
        if (x.cat === 'bettingwin') r.bettingWin += a;
      } else if (x.type === 'expense') {
        r.exp += a;
        if (x.cat !== 'commitments') r.disc += a;
        if (x.cat === 'betting') r.bettingLoss += a;
      } else if (x.type === 'transfer') {
        const out = x.dir !== 'from';
        if (x.cat === 'savings') out ? r.toSav += a : r.fromSav += a;
        else out ? r.toInv += a : r.fromInv += a;
      }
      r.byCat[x.cat] = (r.byCat[x.cat] || 0) + a;
    }
    r.net = r.inc - r.exp;
    return r;
  }

  function balances() {
    const s = state.settings;
    const all = sumRange('0000-00-00', '9999-12-31');
    const cash = s.startBalance + all.inc - all.exp - all.toSav + all.fromSav - all.toInv + all.fromInv;
    const savings = s.startSavings + all.toSav - all.fromSav;
    const investment = s.startInvestment + all.toInv - all.fromInv;
    return { cash, savings, investment, worth: cash + savings + investment };
  }

  function commitmentsTotal() { return state.commitments.reduce((a, c) => a + Number(c.amount || 0), 0); }

  function recommended() {
    const s = state.settings;
    const M = Number(s.monthlyAllowance) || 0;
    const T = r2(M * 0.2);                       // 50/30/20 → 20% saved
    const C = commitmentsTotal();
    const daily = r2(Math.max(0, (M - T - C) / 30));
    const now = new Date();
    const start = parse(s.startDate);
    const monthsThisYear = start.getFullYear() === now.getFullYear() ? 12 - start.getMonth() : 12;
    return { daily, monthly: T, yearly: r2(T * monthsThisYear), monthsThisYear };
  }

  // Commitments not yet logged, due on/after `from` and strictly before `until`
  function commitmentsDueBetween(from, until) {
    let total = 0;
    state.commitments.forEach(c => {
      let d = parse(from); let y = d.getFullYear(), m = d.getMonth();
      for (let i = 0; i < 14; i++) {
        const date = commitmentDate(c, y, m);
        if (date >= until) break;
        if (date >= from && !state.tx.some(x => x.auto === c.id && monthKey(x.date) === date.slice(0, 7))) total += Number(c.amount) || 0;
        m++; if (m > 11) { m = 0; y++; }
      }
    });
    return total;
  }

  function avgDailyDiscretionary(t) {
    const s = state.settings;
    let from = addDays(t, -29);
    if (from < s.startDate) from = s.startDate;
    const days = Math.max(1, diffDays(from, t) + 1);
    const r = sumRange(from, t);
    if (r.count === 0) return { avg: Number(s.dailyBudget) || 0, days, guessed: true };
    return { avg: r.disc / days, days, guessed: false };
  }

  function analyse() {
    const s = state.settings;
    const t = todayStr();
    const td = parse(t);
    const y = td.getFullYear(), m = td.getMonth(), day = td.getDate();
    const D = dim(y, m);
    const M = Number(s.monthlyAllowance) || 0;
    const budget = Number(s.dailyBudget) || 0;

    const today = sumRange(t, t);
    const monthStart = `${y}-${pad(m + 1)}-01`;
    const monthEnd = `${y}-${pad(m + 1)}-${pad(D)}`;
    const yearStart = `${y}-01-01`;
    const yearEnd = `${y}-12-31`;
    const mo = sumRange(monthStart, t);
    const yr = sumRange(yearStart, t);
    const bal = balances();
    const avg = avgDailyDiscretionary(t);

    const daysAfterToday = D - day;
    const remCommitMonth = commitmentsDueBetween(addDays(t, 1), addDays(monthEnd, 1));
    // If tracking started part-way through this month, only expect the share of allowance for the days tracked
    const sd = parse(s.startDate);
    const startedThisMonth = sd.getFullYear() === y && sd.getMonth() === m;
    const allowanceThisMonth = startedThisMonth ? M * (D - sd.getDate() + 1) / D : M;
    const expRemIncomeMonth = Math.max(0, allowanceThisMonth - mo.allowance);

    // --- Month projection
    const monthProj = mo.inc + expRemIncomeMonth - mo.exp - avg.avg * daysAfterToday - remCommitMonth;
    const monthPerDayForTarget = (mo.inc + expRemIncomeMonth - (mo.exp - today.disc) - remCommitMonth - s.monthlyTarget) / (daysAfterToday + 1);

    // --- Year projection
    const monthsLeftAfterThis = 11 - m;
    const daysLeftYear = diffDays(t, yearEnd);
    const C = commitmentsTotal();
    const yearProj = yr.inc + expRemIncomeMonth + M * monthsLeftAfterThis - yr.exp - avg.avg * daysLeftYear - remCommitMonth - C * monthsLeftAfterThis;

    // --- Safe to spend today
    const cashStartToday = bal.cash + today.disc;
    let until, untilLabel;
    if (s.nextAllowance && s.nextAllowance > t) {
      until = s.nextAllowance; untilLabel = 'next allowance (' + prettyDate(s.nextAllowance) + ')';
    } else {
      until = addDays(monthEnd, 1); untilLabel = 'end of month';
    }
    const daysUntil = Math.max(1, diffDays(t, until));
    const commitBeforeUntil = commitmentsDueBetween(t, until);
    const cashPerDay = (cashStartToday - commitBeforeUntil) / daysUntil;
    const candidates = [{ v: cashPerDay, why: `your cash spread over ${daysUntil} day${daysUntil > 1 ? 's' : ''} until ${untilLabel}` }];
    if (s.monthlyTarget > 0) candidates.push({ v: monthPerDayForTarget, why: `what still lets you hit your monthly target of ${fmt(s.monthlyTarget)}` });
    if (budget > 0) candidates.push({ v: budget, why: 'your daily budget' });
    candidates.sort((a, b) => a.v - b.v);
    const safe = Math.max(0, candidates[0].v);
    const leftToday = safe - today.disc;

    return {
      t, y, m, day, D, budget, today, mo, yr, bal, avg,
      daysAfterToday, daysLeftYear, remCommitMonth, expRemIncomeMonth, monthsLeftAfterThis,
      monthProj, monthPerDayForTarget, yearProj,
      safe, leftToday, safeWhy: candidates[0].why, cashPerDay, daysUntil, untilLabel, commitBeforeUntil, cashStartToday,
      dayLeft: budget - today.disc
    };
  }

  // ---------- UI helpers ----------
  const $ = sel => document.querySelector(sel);
  const view = $('#view');
  let currentTab = 'home';
  let calMode = 'day';
  let calCursor = (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();
  let statsMonth = monthKey(todayStr());

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 1900);
  }

  function projBox(value, title, sub, words) {
    const pos = value >= 0;
    const label = words ? (pos ? fmt(value) + ' ' + words[0] : fmt(value) + ' ' + words[1]) : (pos ? 'Gain ' : 'Lose ') + fmt(value);
    return `<div class="proj ${pos ? 'pos' : 'neg'}">
      <div class="emoji">${pos ? UP : DOWN}</div>
      <div><div class="t">${title}</div><div class="v">${label}</div>${sub ? `<div class="t">${sub}</div>` : ''}</div>
    </div>`;
  }

  function txRow(x, withDate) {
    const c = CAT_INDEX[x.cat] || { n: x.cat, e: '•' };
    let amt, cls;
    if (x.type === 'income') { amt = '+' + fmt(x.amount); cls = 'pos'; }
    else if (x.type === 'expense') { amt = '−' + fmt(x.amount); cls = 'neg'; }
    else { amt = (x.dir === 'from' ? '← ' : '→ ') + fmt(x.amount); cls = ''; }
    const label = x.type === 'transfer' ? (x.dir === 'from' ? 'From ' : 'To ') + c.n : c.n;
    const sub = [withDate ? prettyDate(x.date) : '', x.note || ''].filter(Boolean).join(' · ');
    return `<div class="tx">
      <div class="ic">${c.e}</div>
      <div class="info"><div class="n">${esc(label)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</div>
      <div class="amt ${cls}" style="${x.type === 'transfer' ? 'color:var(--blue)' : ''}">${amt}</div>
      <button class="del" data-del="${x.id}" aria-label="Delete">×</button>
    </div>`;
  }

  // ---------- Views ----------
  function renderHome() {
    const a = analyse();
    const s = state.settings;
    const usedPct = a.safe > 0 ? Math.min(100, (a.today.disc / a.safe) * 100) : (a.today.disc > 0 ? 100 : 0);
    const recent = [...state.tx].sort((p, q) => q.date.localeCompare(p.date) || (q.id > p.id ? 1 : -1)).slice(0, 8);

    view.innerHTML = `
      <div class="card hero">
        <div class="label">Cash you can use</div>
        <div class="big ${a.bal.cash < 0 ? 'neg' : ''}">${a.bal.cash < 0 ? '−' : ''}${fmt(a.bal.cash)}</div>
        <div class="small muted">Net worth ${fmt(a.bal.worth)}</div>
        <div class="pots">
          <div class="pot"><div class="v">${fmt(a.bal.savings)}</div><div class="l">🏦 Savings</div></div>
          <div class="pot"><div class="v">${fmt(a.bal.investment)}</div><div class="l">📊 Investment</div></div>
          <div class="pot"><div class="v ${a.mo.net >= 0 ? 'pos' : 'neg'}">${fmtS(a.mo.net)}</div><div class="l">This month</div></div>
        </div>
      </div>

      <div class="card">
        <h3>Safe to spend today</h3>
        <div class="row"><div class="big ${a.leftToday < 0 ? 'neg' : 'pos'}">${a.leftToday < 0 ? '−' : ''}${fmt(a.leftToday)}</div><div class="small muted" style="text-align:right">left of ${fmt(a.safe)}<br>spent ${fmt(a.today.disc)}</div></div>
        <div class="bar"><i style="width:${usedPct}%;background:${a.leftToday < 0 ? 'var(--red)' : usedPct > 80 ? 'var(--amber)' : 'var(--green)'}"></i></div>
        <div class="hint">Limited by ${esc(a.safeWhy)}. This is the strictest of your daily budget, your cash left and your monthly target.</div>
        ${a.leftToday < 0 ? `<div class="hint neg">⚠️ You're over by ${fmt(-a.leftToday)} today.</div>` : ''}
      </div>

      <div class="card">
        <h3>Where you're heading</h3>
        ${s.dailyBudget > 0 ? projBox(a.dayLeft, `Today vs daily budget ${fmt(a.budget)}`, '', ['under budget', 'over budget']) : ''}
        ${projBox(a.monthProj, `End of ${MONTHS_FULL[a.m]} (estimate)`, s.monthlyTarget > 0 ? targetLine(a.monthProj, s.monthlyTarget) : '')}
        ${projBox(a.yearProj, `End of ${a.y} (estimate)`, s.yearlyTarget > 0 ? targetLine(a.yearProj, s.yearlyTarget) : '')}
        <div class="hint">Estimates use your average daily spending (${fmt(a.avg.avg)}/day${a.avg.guessed ? ', from your budget until you log more' : ''}) and your expected allowance.</div>
      </div>

      <div class="card">
        <div class="row"><h3 style="margin:0">Recent</h3><button class="linkbtn" data-goto="calendar">See calendar →</button></div>
        ${recent.length ? recent.map(x => txRow(x, true)).join('') : `<div class="empty">No entries yet. Tap <b>+</b> to add your first one.</div>`}
      </div>
    `;
  }

  function targetLine(proj, target) {
    const gap = proj - target;
    return gap >= 0 ? `✅ Beats target ${fmt(target)} by ${fmt(gap)}` : `🎯 ${fmt(-gap)} short of target ${fmt(target)}`;
  }

  function dayStatus(date, budget, t) {
    if (date > t || date < state.settings.startDate) return null;
    const r = sumRange(date, date);
    if (!r.count) return null;
    const left = budget - r.disc;
    return { r, left, pos: left >= 0 };
  }

  function renderCalendar() {
    const t = todayStr();
    const s = state.settings;
    let body = '';

    if (calMode === 'day') {
      const { y, m } = calCursor;
      const first = new Date(y, m, 1).getDay(); // 0 = Sun
      const offset = (first + 6) % 7;           // Monday first
      const D = dim(y, m);
      let cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="cal-dow">${d}</div>`).join('');
      for (let i = 0; i < offset; i++) cells += `<div class="cal-day blank"></div>`;
      for (let d = 1; d <= D; d++) {
        const date = `${y}-${pad(m + 1)}-${pad(d)}`;
        const st = dayStatus(date, s.dailyBudget, t);
        const cls = ['cal-day', st ? (st.pos ? 'pos' : 'neg') : '', date === t ? 'today' : '', date > t ? 'future' : ''].join(' ');
        cells += `<div class="${cls}" data-day="${date}"><div class="d">${d}</div><div class="a">${st ? fmtShort(st.left) : ''}</div></div>`;
      }
      const mo = sumRange(`${y}-${pad(m + 1)}-01`, `${y}-${pad(m + 1)}-${pad(D)}`);
      body = `
        <div class="card">
          <div class="cal-head"><button data-cal="-1">‹</button><div class="t">${MONTHS_FULL[m]} ${y}</div><button data-cal="1">›</button></div>
          <div class="cal-grid">${cells}</div>
          <div class="legend"><span><i style="background:var(--green)"></i>Under budget</span><span><i style="background:var(--red)"></i>Over budget</span></div>
          <div class="hint" style="text-align:center">Number = RM left (+) or over (−) vs your daily budget of ${fmt(s.dailyBudget)}</div>
        </div>
        <div class="card">
          <h3>${MONTHS_FULL[m]} summary</h3>
          <div class="row"><span>Money in</span><b class="pos">${fmt(mo.inc)}</b></div>
          <div class="row"><span>Money out</span><b class="neg">${fmt(mo.exp)}</b></div>
          <div class="row"><span>Moved to savings / investment</span><b style="color:var(--blue)">${fmt(mo.toSav + mo.toInv - mo.fromSav - mo.fromInv)}</b></div>
          <div class="row"><span><b>Net flow</b></span><b class="${mo.net >= 0 ? 'pos' : 'neg'}">${fmtS(mo.net)} ${mo.net >= 0 ? '📈' : '📉'}</b></div>
          ${s.monthlyTarget > 0 ? `<div class="row"><span>Target</span><span class="pill ${mo.net >= s.monthlyTarget ? 'pos' : 'neg'}">${mo.net >= s.monthlyTarget ? '✅ hit' : '🎯 ' + fmt(s.monthlyTarget - mo.net) + ' to go'}</span></div>` : ''}
        </div>`;
    } else if (calMode === 'month') {
      const y = calCursor.y;
      let tiles = '';
      for (let m = 0; m < 12; m++) {
        const from = `${y}-${pad(m + 1)}-01`, to = `${y}-${pad(m + 1)}-${pad(dim(y, m))}`;
        const r = sumRange(from, to);
        const has = r.count > 0;
        const hit = has && s.monthlyTarget > 0 && r.net >= s.monthlyTarget;
        tiles += `<div class="tile ${has ? (r.net >= 0 ? 'pos' : 'neg') : ''}" data-month="${y}-${m}">
          <div class="n">${MONTHS[m]}</div><div class="v">${has ? fmtShort(r.net) : '—'}</div><div class="h">${hit ? '✅' : has && s.monthlyTarget > 0 ? '🎯' : '&nbsp;'}</div></div>`;
      }
      const yr = sumRange(`${y}-01-01`, `${y}-12-31`);
      body = `
        <div class="card">
          <div class="cal-head"><button data-caly="-1">‹</button><div class="t">${y}</div><button data-caly="1">›</button></div>
          <div class="tiles">${tiles}</div>
          <div class="legend"><span><i style="background:var(--green)"></i>Positive month</span><span><i style="background:var(--red)"></i>Negative month</span></div>
          <div class="hint" style="text-align:center">✅ = hit monthly target · tap a month to open it</div>
        </div>
        <div class="card">
          <h3>${y} so far</h3>
          <div class="row"><span>Money in</span><b class="pos">${fmt(yr.inc)}</b></div>
          <div class="row"><span>Money out</span><b class="neg">${fmt(yr.exp)}</b></div>
          <div class="row"><span><b>Net flow</b></span><b class="${yr.net >= 0 ? 'pos' : 'neg'}">${fmtS(yr.net)}</b></div>
          ${s.yearlyTarget > 0 ? `<div class="row"><span>Yearly target</span><span class="pill ${yr.net >= s.yearlyTarget ? 'pos' : ''}">${yr.net >= s.yearlyTarget ? '✅ hit' : fmt(s.yearlyTarget - yr.net) + ' to go'}</span></div>` : ''}
        </div>`;
    } else {
      const years = new Set([parse(s.startDate).getFullYear(), new Date().getFullYear()]);
      state.tx.forEach(x => years.add(Number(x.date.slice(0, 4))));
      const list = [...years].sort((a, b) => b - a);
      body = `<div class="card"><h3>By year</h3><div class="tiles">${list.map(y => {
        const r = sumRange(`${y}-01-01`, `${y}-12-31`);
        const has = r.count > 0;
        return `<div class="tile ${has ? (r.net >= 0 ? 'pos' : 'neg') : ''}" data-year="${y}"><div class="n">${y}</div><div class="v">${has ? fmtShort(r.net) : '—'}</div><div class="h">${has ? (r.net >= 0 ? '📈' : '📉') : '&nbsp;'}</div></div>`;
      }).join('')}</div>
      <div class="legend"><span><i style="background:var(--green)"></i>Positive year</span><span><i style="background:var(--red)"></i>Negative year</span></div></div>`;
    }

    view.innerHTML = `
      <div class="seg">
        <button data-calmode="day" class="${calMode === 'day' ? 'active' : ''}">Days</button>
        <button data-calmode="month" class="${calMode === 'month' ? 'active' : ''}">Months</button>
        <button data-calmode="year" class="${calMode === 'year' ? 'active' : ''}">Years</button>
      </div>${body}`;
  }

  function renderCalc() {
    const a = analyse();
    const s = state.settings;
    const wi = renderCalc.whatIf != null ? renderCalc.whatIf : r2(Math.max(0, a.avg.avg));
    const view0 = renderCalc.period || 'month';

    let detail = '';
    if (view0 === 'day') {
      detail = `
        ${projBox(a.dayLeft, `Today vs your daily budget (${fmt(a.budget)})`, '', ['under budget', 'over budget'])}
        <div class="row"><span>Spent today (excl. commitments)</span><b>${fmt(a.today.disc)}</b></div>
        <div class="row"><span>Money in today</span><b class="pos">${fmt(a.today.inc)}</b></div>
        <div class="row"><span>Net flow today</span><b class="${a.today.net >= 0 ? 'pos' : 'neg'}">${fmtS(a.today.net)}</b></div>
        <div class="row"><span>Safe to spend today</span><b>${fmt(a.safe)}</b></div>
        <div class="hint">Cash lasts at ${fmt(a.cashPerDay)}/day for ${a.daysUntil} day(s) until ${esc(a.untilLabel)}${a.commitBeforeUntil ? `, after ${fmt(a.commitBeforeUntil)} of commitments` : ''}.</div>`;
    } else if (view0 === 'month') {
      detail = `
        ${projBox(a.monthProj, `End of ${MONTHS_FULL[a.m]} at your current pace`, s.monthlyTarget > 0 ? targetLine(a.monthProj, s.monthlyTarget) : '')}
        <div class="row"><span>In so far</span><b class="pos">${fmt(a.mo.inc)}</b></div>
        <div class="row"><span>Allowance still expected</span><b class="pos">${fmt(a.expRemIncomeMonth)}</b></div>
        <div class="row"><span>Out so far</span><b class="neg">${fmt(a.mo.exp)}</b></div>
        <div class="row"><span>Est. spending, ${a.daysAfterToday} days left × ${fmt(a.avg.avg)}</span><b class="neg">${fmt(a.avg.avg * a.daysAfterToday)}</b></div>
        <div class="row"><span>Commitments still due</span><b class="neg">${fmt(a.remCommitMonth)}</b></div>
        ${s.monthlyTarget > 0 ? `<div class="row"><span><b>Max spend/day to hit target</b></span><b class="${a.monthPerDayForTarget >= 0 ? 'pos' : 'neg'}">${a.monthPerDayForTarget >= 0 ? fmt(a.monthPerDayForTarget) : 'Target out of reach ⚠️'}</b></div>` : ''}`;
    } else {
      detail = `
        ${projBox(a.yearProj, `End of ${a.y} at your current pace`, s.yearlyTarget > 0 ? targetLine(a.yearProj, s.yearlyTarget) : '')}
        <div class="row"><span>In so far this year</span><b class="pos">${fmt(a.yr.inc)}</b></div>
        <div class="row"><span>Allowance still expected</span><b class="pos">${fmt(a.expRemIncomeMonth + (Number(s.monthlyAllowance) || 0) * a.monthsLeftAfterThis)}</b></div>
        <div class="row"><span>Out so far this year</span><b class="neg">${fmt(a.yr.exp)}</b></div>
        <div class="row"><span>Est. spending, ${a.daysLeftYear} days left</span><b class="neg">${fmt(a.avg.avg * a.daysLeftYear)}</b></div>
        <div class="row"><span>Commitments still due</span><b class="neg">${fmt(a.remCommitMonth + commitmentsTotal() * a.monthsLeftAfterThis)}</b></div>`;
    }

    // What-if
    const wiMonth = a.mo.inc + a.expRemIncomeMonth - (a.mo.exp - a.today.disc) - wi * (a.daysAfterToday + 1) - a.remCommitMonth;
    const M = Number(s.monthlyAllowance) || 0;
    const wiYear = a.yr.inc + a.expRemIncomeMonth + M * a.monthsLeftAfterThis - (a.yr.exp - a.today.disc) - wi * (a.daysLeftYear + 1) - a.remCommitMonth - commitmentsTotal() * a.monthsLeftAfterThis;
    const cashDays = wi > 0 ? (a.cashStartToday - a.commitBeforeUntil) / wi : Infinity;
    const runsOut = cashDays < a.daysUntil;

    view.innerHTML = `
      <div class="seg">
        <button data-period="day" class="${view0 === 'day' ? 'active' : ''}">Day</button>
        <button data-period="month" class="${view0 === 'month' ? 'active' : ''}">Month</button>
        <button data-period="year" class="${view0 === 'year' ? 'active' : ''}">Year</button>
      </div>
      <div class="card"><h3>Projection</h3>${detail}</div>

      <div class="card">
        <h3>What-if calculator</h3>
        <label class="f"><span>If I spend this much per day (RM, excl. commitments)</span>
          <input type="number" inputmode="decimal" id="whatIf" value="${wi}" min="0" step="1"></label>
        <div id="wiOut">
          ${projBox(wiMonth, `End of ${MONTHS_FULL[a.m]}`, s.monthlyTarget > 0 ? targetLine(wiMonth, s.monthlyTarget) : '')}
          ${projBox(wiYear, `End of ${a.y}`, s.yearlyTarget > 0 ? targetLine(wiYear, s.yearlyTarget) : '')}
          <div class="hint ${runsOut ? 'neg' : ''}">${runsOut
            ? `⚠️ At this pace your cash runs out in about ${Math.max(0, Math.floor(cashDays))} day(s), before ${esc(a.untilLabel)}.`
            : `✅ Your cash lasts until ${esc(a.untilLabel)} at this pace.`}</div>
        </div>
      </div>`;
  }

  function renderStats() {
    const [y, m] = statsMonth.split('-').map(Number);
    const from = `${statsMonth}-01`, to = `${statsMonth}-${pad(dim(y, m - 1))}`;
    const r = sumRange(from, to);
    const exp = CATS.expense.map(c => ({ c, v: r.byCat[c.id] || 0 })).filter(o => o.v > 0).sort((a, b) => b.v - a.v);
    const inc = CATS.income.map(c => ({ c, v: r.byCat[c.id] || 0 })).filter(o => o.v > 0).sort((a, b) => b.v - a.v);
    const max = exp.length ? exp[0].v : 1;
    const bettingNet = r.bettingWin - r.bettingLoss;

    // 12-month bars for this year
    const nets = [];
    for (let i = 0; i < 12; i++) {
      const rr = sumRange(`${y}-${pad(i + 1)}-01`, `${y}-${pad(i + 1)}-${pad(dim(y, i))}`);
      nets.push(rr.count ? rr.net : null);
    }
    const maxAbs = Math.max(1, ...nets.filter(v => v != null).map(Math.abs));

    view.innerHTML = `
      <div class="card">
        <div class="cal-head"><button data-sm="-1">‹</button><div class="t">${MONTHS_FULL[m - 1]} ${y}</div><button data-sm="1">›</button></div>
        <div class="row"><span>Money in</span><b class="pos">${fmt(r.inc)}</b></div>
        <div class="row"><span>Money out</span><b class="neg">${fmt(r.exp)}</b></div>
        <div class="row"><span><b>Net flow</b></span><b class="${r.net >= 0 ? 'pos' : 'neg'}">${fmtS(r.net)}</b></div>
      </div>

      <div class="card">
        <h3>Spending by category</h3>
        ${exp.length ? exp.map(o => `<div class="catrow"><div class="row"><span>${o.c.e} ${o.c.n}</span><span><b>${fmt(o.v)}</b> <span class="muted small">${((o.v / r.exp) * 100).toFixed(0)}%</span></span></div>
          <div class="bar"><i style="width:${(o.v / max) * 100}%;background:var(--red)"></i></div></div>`).join('') : '<div class="empty">No spending this month</div>'}
      </div>

      <div class="card">
        <h3>Money in by type</h3>
        ${inc.length ? inc.map(o => `<div class="row"><span>${o.c.e} ${o.c.n}</span><b class="pos">${fmt(o.v)}</b></div>`).join('') : '<div class="empty">No income this month</div>'}
      </div>

      <div class="card">
        <h3>Saved & invested</h3>
        <div class="row"><span>🏦 Into savings</span><b style="color:var(--blue)">${fmtS(r.toSav - r.fromSav)}</b></div>
        <div class="row"><span>📊 Into investment</span><b style="color:var(--blue)">${fmtS(r.toInv - r.fromInv)}</b></div>
        <div class="hint">Moving money to savings or investment isn't spending, so it never turns a day red.</div>
      </div>

      ${(r.bettingWin || r.bettingLoss) ? `<div class="card">
        <h3>🎲 Betting this month</h3>
        <div class="row"><span>Stakes / losses</span><b class="neg">${fmt(r.bettingLoss)}</b></div>
        <div class="row"><span>Winnings</span><b class="pos">${fmt(r.bettingWin)}</b></div>
        <div class="row"><span><b>Betting net</b></span><b class="${bettingNet >= 0 ? 'pos' : 'neg'}">${fmtS(bettingNet)} ${bettingNet >= 0 ? UP : DOWN}</b></div>
      </div>` : ''}

      <div class="card">
        <h3>${y} month by month</h3>
        <div class="mbars">${nets.map(v => `<div class="col"><i class="${v == null ? 'none' : v >= 0 ? 'pos' : 'neg'}" style="height:${v == null ? 2 : Math.max(3, (Math.abs(v) / maxAbs) * 100)}%"></i></div>`).join('')}</div>
        <div class="mlabels">${MONTHS.map(n => `<span>${n[0]}</span>`).join('')}</div>
        <div class="legend"><span><i style="background:var(--green)"></i>Net positive</span><span><i style="background:var(--red)"></i>Net negative</span></div>
      </div>`;
  }

  function renderSettings() {
    const s = state.settings;
    const rec = recommended();
    view.innerHTML = `
      <div class="card">
        <h3>Starting point</h3>
        <label class="f"><span>Start date</span><input type="date" id="s_startDate" value="${s.startDate}"></label>
        <label class="f"><span>Cash on hand at start (RM)</span><input type="number" inputmode="decimal" id="s_startBalance" value="${s.startBalance}"></label>
        <label class="f"><span>Savings at start (RM)</span><input type="number" inputmode="decimal" id="s_startSavings" value="${s.startSavings}"></label>
        <label class="f"><span>Investments at start (RM)</span><input type="number" inputmode="decimal" id="s_startInvestment" value="${s.startInvestment}"></label>
      </div>

      <div class="card">
        <h3>Allowance</h3>
        <label class="f"><span>About how much allowance per month in total (RM)</span><input type="number" inputmode="decimal" id="s_monthlyAllowance" value="${s.monthlyAllowance}">
          <div class="hint">If it comes weekly, add up roughly 4 weeks.</div></label>
        <label class="f"><span>Next allowance expected on</span><input type="date" id="s_nextAllowance" value="${s.nextAllowance}"></label>
      </div>

      <div class="card">
        <h3>Targets</h3>
        <label class="f"><span>Daily spending budget (RM)</span><input type="number" inputmode="decimal" id="s_dailyBudget" value="${s.dailyBudget}">
          <div class="hint">Recommended: ${fmt(rec.daily)}/day</div></label>
        <label class="f"><span>Monthly target — money left over at month end (RM)</span><input type="number" inputmode="decimal" id="s_monthlyTarget" value="${s.monthlyTarget}">
          <div class="hint">Recommended: ${fmt(rec.monthly)} (20% of allowance)</div></label>
        <label class="f"><span>Yearly target (RM)</span><input type="number" inputmode="decimal" id="s_yearlyTarget" value="${s.yearlyTarget}">
          <div class="hint">Recommended: ${fmt(rec.yearly)} (${rec.monthsThisYear} month${rec.monthsThisYear > 1 ? 's' : ''} × monthly target)</div></label>
        <button class="btn secondary" id="useRec">Use recommended targets</button>
        <div class="hint">Recommended = 50/30/20 rule: save 20% of your allowance, take out fixed commitments, and split the rest across 30 days.</div>
      </div>

      <div class="card">
        <h3>Fixed commitments (auto-logged monthly)</h3>
        ${state.commitments.length ? state.commitments.map(c => `<div class="commit-item"><div class="grow"><b>${esc(c.name)}</b><div class="small muted">Every month on day ${c.day}</div></div><b class="neg">${fmt(c.amount)}</b><button class="del" data-delc="${c.id}">×</button></div>`).join('') : '<div class="empty">None yet — e.g. phone bill, subscription, hostel fee</div>'}
        <div class="btn-row" style="margin-top:8px">
          <input type="text" id="c_name" placeholder="Name" style="flex:2">
          <input type="number" inputmode="decimal" id="c_amount" placeholder="RM" style="flex:1">
          <input type="number" inputmode="numeric" id="c_day" placeholder="Day" min="1" max="31" style="flex:1">
        </div>
        <button class="btn secondary" id="addCommit">Add commitment</button>
      </div>

      <button class="btn" id="saveSettings">Save settings</button>

      <div class="card" style="margin-top:14px">
        <h3>Backup</h3>
        <div class="hint" style="margin-bottom:8px">Your data lives only on this phone. Clearing your browser data deletes it, so back up now and then.</div>
        <div class="btn-row">
          <button class="btn secondary" id="exportBtn">Export backup</button>
          <button class="btn secondary" id="importBtn">Import backup</button>
        </div>
        <input type="file" id="importFile" accept="application/json,.json" style="display:none">
        <button class="btn danger" id="resetBtn" style="margin-top:10px">Erase everything</button>
      </div>
      <div class="hint" style="text-align:center;margin-top:8px">v1.0 · ${state.tx.length} entries</div>
    `;
  }

  function render() {
    $('#todayLabel').textContent = prettyDate(todayStr());
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === currentTab));
    if (currentTab === 'home') renderHome();
    else if (currentTab === 'calendar') renderCalendar();
    else if (currentTab === 'calc') renderCalc();
    else if (currentTab === 'stats') renderStats();
    else renderSettings();
  }

  // ---------- Sheet (bottom drawer) ----------
  const sheet = $('#sheet'), backdrop = $('#backdrop');
  let sheetLocked = false;
  function openSheet(html, locked) {
    sheetLocked = !!locked;
    sheet.innerHTML = `<div class="grab"></div>` + html;
    sheet.scrollTop = 0;
    backdrop.classList.add('show'); sheet.classList.add('show');
  }
  function closeSheet() {
    if (sheetLocked) return;
    backdrop.classList.remove('show'); sheet.classList.remove('show');
  }
  backdrop.addEventListener('click', closeSheet);

  function confirmSheet(msg, yesLabel, onYes) {
    openSheet(`<h2>${msg}</h2><div class="btn-row"><button class="btn secondary" id="cNo">Cancel</button><button class="btn danger" id="cYes">${yesLabel}</button></div>`);
    $('#cNo').onclick = closeSheet;
    $('#cYes').onclick = () => { closeSheet(); onYes(); };
  }

  // ---------- Add entry ----------
  let draft = null;
  function openAdd(presetDate) {
    draft = { type: 'expense', cat: 'fnb', dir: 'to', date: presetDate || todayStr() };
    drawAdd();
    setTimeout(() => { const el = $('#amt'); if (el) el.focus(); }, 280);
  }
  function drawAdd(keepAmount) {
    const amt = keepAmount != null ? keepAmount : '';
    const note = keepAmount != null && $('#note') ? $('#note').value : '';
    const cats = CATS[draft.type];
    if (!cats.some(c => c.id === draft.cat)) draft.cat = cats[0].id;
    const showNext = draft.type === 'income' && draft.cat === 'allowance';
    openSheet(`
      <h2>Add entry</h2>
      <div class="seg type-seg">
        <button data-type="expense" class="t-expense ${draft.type === 'expense' ? 'active' : ''}">− Spent</button>
        <button data-type="income" class="t-income ${draft.type === 'income' ? 'active' : ''}">+ Got</button>
        <button data-type="transfer" class="t-transfer ${draft.type === 'transfer' ? 'active' : ''}">⇄ Save/Invest</button>
      </div>
      <input class="amount-input" type="number" inputmode="decimal" id="amt" placeholder="RM 0.00" value="${amt}" step="0.01" min="0">
      <div style="height:10px"></div>
      ${draft.type === 'transfer' ? `<div class="seg">
        <button data-dir="to" class="${draft.dir !== 'from' ? 'active' : ''}">Put in</button>
        <button data-dir="from" class="${draft.dir === 'from' ? 'active' : ''}">Take out</button></div>` : ''}
      <div class="chips">${cats.map(c => `<button class="chip ${c.id === draft.cat ? 'active' : ''}" data-cat="${c.id}">${c.e} ${c.n}</button>`).join('')}</div>
      ${showNext ? `<label class="f"><span>Next allowance expected on</span><input type="date" id="nextA" value="${state.settings.nextAllowance > draft.date ? state.settings.nextAllowance : addDays(draft.date, 30)}"></label>
        <div class="quick"><button data-next="7">+1 week</button><button data-next="14">+2 weeks</button><button data-next="30">+1 month</button></div>` : ''}
      <label class="f"><span>Date</span><input type="date" id="date" value="${draft.date}" min="${state.settings.startDate}" max="${todayStr()}"></label>
      <label class="f"><span>Note (optional)</span><input type="text" id="note" value="${esc(note)}" placeholder="e.g. nasi lemak"></label>
      <button class="btn" id="saveTx">Save</button>
    `);
  }

  sheet.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !draft || !$('#amt')) return;
    const amt = $('#amt').value;
    if (b.dataset.type) { draft.type = b.dataset.type; draft.date = $('#date').value; drawAdd(amt); }
    else if (b.dataset.cat) { draft.cat = b.dataset.cat; draft.date = $('#date').value; drawAdd(amt); }
    else if (b.dataset.dir) { draft.dir = b.dataset.dir; draft.date = $('#date').value; drawAdd(amt); }
    else if (b.dataset.next) { $('#nextA').value = addDays($('#date').value || todayStr(), Number(b.dataset.next)); }
    else if (b.id === 'saveTx') {
      const a = parseFloat(amt);
      if (!(a > 0)) { toast('Enter an amount first'); $('#amt').focus(); return; }
      const date = $('#date').value || todayStr();
      if (date > todayStr()) { toast("Can't log a future date"); return; }
      if (date < state.settings.startDate) { toast('Date is before your start date — change it in Settings'); return; }
      const tx = { id: uid(), date, type: draft.type, cat: draft.cat, amount: r2(a), note: $('#note').value.trim() };
      if (draft.type === 'transfer') tx.dir = draft.dir;
      state.tx.push(tx);
      if (draft.type === 'income' && draft.cat === 'allowance' && $('#nextA') && $('#nextA').value) {
        state.settings.nextAllowance = $('#nextA').value;
      }
      save(); draft = null; closeSheet(); render();
      const a2 = analyse();
      if (tx.type === 'expense' && a2.leftToday < 0) toast(`⚠️📉 Over today's safe amount by ${fmt(-a2.leftToday)}`);
      else if (tx.type === 'income') toast(`📈💰 +${fmt(tx.amount)} added`);
      else if (tx.type === 'transfer') toast(tx.dir === 'from' ? `Moved ${fmt(tx.amount)} back to cash` : `🏦 ${fmt(tx.amount)} put away — nice`);
      else toast(`Saved · ${fmt(Math.max(0, a2.leftToday))} left today`);
    }
  });

  // ---------- Onboarding ----------
  function openSetup() {
    openSheet(`
      <h2>👋 Let's set your starting point</h2>
      <div class="hint" style="margin:-6px 0 12px">You can change all of this later in Settings.</div>
      <label class="f"><span>Cash you have right now (RM)</span><input type="number" inputmode="decimal" id="o_cash" placeholder="e.g. 350"></label>
      <label class="f"><span>Savings you already have (RM, optional)</span><input type="number" inputmode="decimal" id="o_sav" placeholder="0"></label>
      <label class="f"><span>Investments you already have (RM, optional)</span><input type="number" inputmode="decimal" id="o_inv" placeholder="0"></label>
      <label class="f"><span>About how much allowance per month in total (RM)</span><input type="number" inputmode="decimal" id="o_allow" placeholder="e.g. 800">
        <div class="hint">If it's weekly, add up roughly 4 weeks.</div></label>
      <label class="f"><span>When is your next allowance?</span><input type="date" id="o_next" value="${addDays(todayStr(), 7)}"></label>
      <button class="btn" id="o_done">Start tracking 🚀</button>
    `, true);
    $('#o_done').onclick = () => {
      const n = id => parseFloat($(id).value) || 0;
      const s = state.settings;
      s.startDate = todayStr();
      s.startBalance = n('#o_cash'); s.startSavings = n('#o_sav'); s.startInvestment = n('#o_inv');
      s.monthlyAllowance = n('#o_allow');
      s.nextAllowance = $('#o_next').value || '';
      const rec = recommended();
      s.dailyBudget = rec.daily; s.monthlyTarget = rec.monthly; s.yearlyTarget = rec.yearly;
      s.setupDone = true;
      save(); sheetLocked = false; closeSheet(); render();
      toast(rec.daily > 0 ? `Daily budget set to ${fmt(rec.daily)} 💪` : 'All set — add your first entry');
    };
  }

  // ---------- Global events ----------
  document.querySelector('.tabbar').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    currentTab = b.dataset.tab; window.scrollTo(0, 0); render();
  });
  $('#fab').addEventListener('click', () => openAdd(currentTab === 'calendar' && renderCalendar.selected ? renderCalendar.selected : undefined));

  view.addEventListener('click', e => {
    const el = e.target.closest('[data-del],[data-goto],[data-calmode],[data-cal],[data-caly],[data-day],[data-month],[data-year],[data-period],[data-sm],[data-delc],#useRec,#addCommit,#saveSettings,#exportBtn,#importBtn,#resetBtn');
    if (!el) return;
    const d = el.dataset;
    if (d.del) {
      const x = state.tx.find(t => t.id === d.del);
      confirmSheet(`Delete this ${x && x.type === 'income' ? 'income' : 'entry'} of ${x ? fmt(x.amount) : ''}?`, 'Delete', () => {
        state.tx = state.tx.filter(t => t.id !== d.del); save(); render(); toast('Deleted');
      });
    } else if (d.goto) { currentTab = d.goto; render(); }
    else if (d.calmode) { calMode = d.calmode; render(); }
    else if (d.cal) { calCursor.m += Number(d.cal); if (calCursor.m < 0) { calCursor.m = 11; calCursor.y--; } if (calCursor.m > 11) { calCursor.m = 0; calCursor.y++; } render(); }
    else if (d.caly) { calCursor.y += Number(d.caly); render(); }
    else if (d.month) { const [y, m] = d.month.split('-').map(Number); calCursor = { y, m }; calMode = 'day'; render(); }
    else if (d.year) { calCursor.y = Number(d.year); calMode = 'month'; render(); }
    else if (d.day) { showDay(d.day); }
    else if (d.period) { renderCalc.period = d.period; render(); }
    else if (d.sm) { let [y, m] = statsMonth.split('-').map(Number); m += Number(d.sm); if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } statsMonth = `${y}-${pad(m)}`; render(); }
    else if (d.delc) {
      confirmSheet('Remove this commitment? (Past entries stay.)', 'Remove', () => {
        state.commitments = state.commitments.filter(c => c.id !== d.delc); save(); render();
      });
    }
    else if (el.id === 'useRec') {
      readSettingsForm();
      const r = recommended();
      $('#s_dailyBudget').value = r.daily; $('#s_monthlyTarget').value = r.monthly; $('#s_yearlyTarget').value = r.yearly;
      toast('Filled in — tap Save settings');
    }
    else if (el.id === 'addCommit') {
      const name = $('#c_name').value.trim(), amount = parseFloat($('#c_amount').value), day = parseInt($('#c_day').value, 10);
      if (!name || !(amount > 0) || !(day >= 1 && day <= 31)) { toast('Fill in name, amount and day (1–31)'); return; }
      readSettingsForm();
      state.commitments.push({ id: uid(), name, amount: r2(amount), day, from: monthKey(todayStr()) });
      save(); autoLogCommitments(); render(); toast('Commitment added');
    }
    else if (el.id === 'saveSettings') { readSettingsForm(); save(); autoLogCommitments(); render(); toast('Settings saved ✅'); }
    else if (el.id === 'exportBtn') exportData();
    else if (el.id === 'importBtn') $('#importFile').click();
    else if (el.id === 'resetBtn') {
      confirmSheet('Erase ALL data on this phone? This cannot be undone.', 'Erase', () => {
        state = defaultState(); save(); currentTab = 'home'; render(); openSetup();
      });
    }
  });

  view.addEventListener('input', e => {
    if (e.target.id === 'whatIf') {
      renderCalc.whatIf = parseFloat(e.target.value) || 0;
      const pos = e.target.selectionStart;
      renderCalc();
      const el = $('#whatIf'); el.focus(); try { el.setSelectionRange(pos, pos); } catch (_) { /* number inputs */ }
    }
  });

  view.addEventListener('change', e => {
    if (e.target.id === 'importFile' && e.target.files[0]) {
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const s = JSON.parse(fr.result);
          if (!s.settings || !Array.isArray(s.tx)) throw new Error('bad');
          confirmSheet(`Replace current data with backup (${s.tx.length} entries)?`, 'Replace', () => {
            const d = defaultState();
            state = { settings: Object.assign(d.settings, s.settings), tx: s.tx, commitments: s.commitments || [] };
            save(); render(); toast('Backup restored ✅');
          });
        } catch (_) { toast('That file is not a valid backup'); }
      };
      fr.readAsText(e.target.files[0]);
    }
  });

  function readSettingsForm() {
    const s = state.settings;
    const num = id => { const el = $(id); return el ? (parseFloat(el.value) || 0) : null; };
    const set = (k, v) => { if (v !== null) s[k] = v; };
    if ($('#s_startDate') && $('#s_startDate').value) s.startDate = $('#s_startDate').value;
    set('startBalance', num('#s_startBalance'));
    set('startSavings', num('#s_startSavings'));
    set('startInvestment', num('#s_startInvestment'));
    set('monthlyAllowance', num('#s_monthlyAllowance'));
    if ($('#s_nextAllowance')) s.nextAllowance = $('#s_nextAllowance').value;
    set('dailyBudget', num('#s_dailyBudget'));
    set('monthlyTarget', num('#s_monthlyTarget'));
    set('yearlyTarget', num('#s_yearlyTarget'));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `millionaire-backup-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Backup downloaded');
  }

  function showDay(date) {
    renderCalendar.selected = date;
    const items = state.tx.filter(x => x.date === date);
    const r = sumRange(date, date);
    const budget = state.settings.dailyBudget;
    const left = budget - r.disc;
    openSheet(`
      <h2>${prettyDate(date)}</h2>
      ${items.length ? `
        <div class="row"><span>Spent (excl. commitments)</span><b class="neg">${fmt(r.disc)}</b></div>
        <div class="row"><span>Money in</span><b class="pos">${fmt(r.inc)}</b></div>
        <div class="row"><span>vs daily budget ${fmt(budget)}</span><b class="${left >= 0 ? 'pos' : 'neg'}">${left >= 0 ? fmt(left) + ' under ' + UP : fmt(-left) + ' over ' + DOWN}</b></div>
        <div style="margin-top:8px">${items.map(x => txRow(x, false)).join('')}</div>` : '<div class="empty">Nothing logged this day</div>'}
      ${date <= todayStr() ? `<button class="btn" id="addOnDay">+ Add entry for this day</button>` : ''}
    `);
    const btn = $('#addOnDay'); if (btn) btn.onclick = () => openAdd(date);
    sheet.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      state.tx = state.tx.filter(t => t.id !== b.dataset.del); save(); render(); showDay(date); toast('Deleted');
    });
  }

  // Re-render when the day rolls over or the app comes back to the foreground
  let lastDay = todayStr();
  function tick() {
    if (todayStr() !== lastDay) { lastDay = todayStr(); autoLogCommitments(); render(); }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { autoLogCommitments(); tick(); render(); } });
  setInterval(tick, 60 * 1000);

  // ---------- Boot ----------
  autoLogCommitments();
  render();
  if (!state.settings.setupDone) openSetup();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Expose for testing only
  window.__htbam = { analyse, sumRange, balances, recommended, get state() { return state; }, set state(v) { state = v; } };
})();
