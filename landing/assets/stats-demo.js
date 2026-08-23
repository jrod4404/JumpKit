/* JumpKit landing — live statistics dashboard demo (static sample data).
   Faithful port of the app's statistics page UI (Summary / Daily / Weekly /
   Monthly / Yearly tabs, stat cards, bar + doughnut charts, Top 10 list).
   Export button intentionally omitted. Data: 10s saved per jump, $50/hr,
   92 jumps in the current week. Deterministic (seeded) sample log. */
(function () {
  'use strict';

  /* ── Seeded RNG (mulberry32) ─────────────────────────────────── */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(20260823);

  /* ── Sample data ─────────────────────────────────────────────── */
  const SAMPLE_COLUMNS = [
    { id: 'c-work',  name: 'Work',     visible: true, order: 1 },
    { id: 'c-sales', name: 'Sales',    visible: true, order: 2 },
    { id: 'c-dev',   name: 'Dev',      visible: true, order: 3 },
    { id: 'c-per',   name: 'Personal', visible: true, order: 4 },
  ];
  const SAMPLE_JUMPS = [
    { id: 'j1',  name: 'Outlook Mail',   columnId: 'c-work',  timeSaved: 10, favorite: true  },
    { id: 'j2',  name: 'ERP Portal',     columnId: 'c-work',  timeSaved: 10, favorite: false },
    { id: 'j3',  name: 'Salesforce',     columnId: 'c-sales', timeSaved: 10, favorite: true  },
    { id: 'j4',  name: 'Team Drive',     columnId: 'c-work',  timeSaved: 10, favorite: false },
    { id: 'j5',  name: 'SharePoint',     columnId: 'c-work',  timeSaved: 10, favorite: false },
    { id: 'j6',  name: 'Jira',           columnId: 'c-dev',   timeSaved: 10, favorite: false },
    { id: 'j7',  name: 'Confluence',     columnId: 'c-dev',   timeSaved: 10, favorite: false },
    { id: 'j8',  name: 'Design Assets',  columnId: 'c-work',  timeSaved: 10, favorite: false },
    { id: 'j9',  name: 'Time Tracking',  columnId: 'c-work',  timeSaved: 10, favorite: false },
    { id: 'j10', name: 'HR Portal',      columnId: 'c-per',   timeSaved: 10, favorite: false },
    { id: 'j11', name: 'GitHub',         columnId: 'c-dev',   timeSaved: 10, favorite: true  },
    { id: 'j12', name: 'Internal Wiki',  columnId: 'c-work',  timeSaved: 10, favorite: false },
  ];
  const JUMP_WEIGHTS = [20, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2]; // sums to 100
  const WEEKDAY_WEIGHTS = [0.55, 1.25, 1.30, 1.25, 1.15, 0.80, 0.35]; // Sun..Sat
  const THIS_WEEK_DAILY = [15, 19, 21, 16, 11, 6, 4]; // Mon..Sun, sums to 92

  /* ── Build deterministic click log (260 weeks back) ──────────── */
  const LOG = [];
  const now = new Date();
  const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const WEEK_MS = 7 * 86400000;
  const curWeekStart = (() => { const d = dayStart(now); d.setDate(d.getDate() - d.getDay()); return d; })();

  function pickJump() {
    let r = rng() * 100;
    for (let i = 0; i < JUMP_WEIGHTS.length; i++) { r -= JUMP_WEIGHTS[i]; if (r <= 0) return SAMPLE_JUMPS[i]; }
    return SAMPLE_JUMPS[0];
  }

  for (let w = 0; w < 260; w++) {
    let daily;
    if (w === 0) {
      daily = THIS_WEEK_DAILY.slice(); // current week = exactly 92 jumps
    } else {
      const base = Math.round(92 * (0.30 + 0.70 * (1 - w / 260)) * (0.75 + 0.5 * rng()));
      const tot = WEEKDAY_WEIGHTS.reduce((a, b) => a + b, 0);
      daily = WEEKDAY_WEIGHTS.map(x => Math.max(0, Math.round((base * x) / tot)));
    }
    daily.forEach((count, di) => {
      const day = new Date(curWeekStart.getTime() - w * WEEK_MS + di * 86400000);
      for (let c = 0; c < count; c++) {
        const jump = pickJump();
        const ts = day.getTime() + (8 + rng() * 10) * 3600000 + rng() * 3600000; // 8am–6pm
        LOG.push({ ts, jumpId: jump.id, jumpName: jump.name });
      }
    });
  }
  LOG.sort((a, b) => a.ts - b.ts);

  /* ── App-faithful rendering ──────────────────────────────────── */
  const PREFS = { timePerClick: 10, dollarsPerHour: 50 };
  const STAT_VIEWS = ['summary', 'daily', 'weekly', 'monthly', 'yearly'];
  const STAT_LABELS = { summary: 'Summary', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
  const doughColors = ['#00C2C7', '#1A4FD6', '#2B9ED8', '#ff7a45', '#faad14', '#a0d911', '#9254de', '#eb2f96', '#69c0ff', '#389e0d'];
  const barClr = 'rgba(0,194,199,0.75)';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let currentStatView = 'summary';
  const charts = [];

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtUSD = v => '$' + parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const destroyCharts = () => { while (charts.length) charts.pop().destroy(); };

  function posStatsPill() {
    const bar = document.getElementById('statsBarDemo');
    const pill = document.getElementById('statsPillDemo');
    if (!bar || !pill) return;
    const active = bar.querySelector('.jfb-tab.active');
    if (!active) return;
    pill.style.left = active.offsetLeft + 'px';
    pill.style.width = active.offsetWidth + 'px';
  }

  function themeColors() {
    const dark = document.documentElement.dataset.theme === 'dark';
    return {
      dark,
      tc: dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.50)',
      gc: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    };
  }

  function renderStatsDash() {
    const dash = document.getElementById('statsDashDemo');
    if (!dash) return;
    const { tc, gc } = themeColors();

    function startOf(unit) {
      const d = new Date();
      if (unit === 'day')   { d.setHours(0, 0, 0, 0); }
      if (unit === 'week')  { d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); }
      if (unit === 'month') { d.setDate(1); d.setHours(0, 0, 0, 0); }
      if (unit === 'year')  { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); }
      return d.getTime();
    }
    const ranges = {
      summary: [0, Infinity],
      daily:   [startOf('day') - 6 * 86400000, startOf('day') + 86400000],
      weekly:  [startOf('week') - 51 * 7 * 86400000, startOf('week') + 7 * 86400000],
      monthly: [startOf('year'), new Date(new Date().getFullYear() + 1, 0, 1).getTime()],
      yearly:  [new Date(new Date().getFullYear() - 4, 0, 1).getTime(), new Date(new Date().getFullYear() + 1, 0, 1).getTime()],
    };
    const [s, e] = ranges[currentStatView];
    const clicks = LOG.filter(x => x.ts >= s && x.ts < e);
    const n = clicks.length;
    const totalSecondsSaved = clicks.reduce((sum, c) => {
      const jump = SAMPLE_JUMPS.find(j => j.id === c.jumpId);
      return sum + (jump && jump.timeSaved != null ? jump.timeSaved : PREFS.timePerClick);
    }, 0);
    const hours = (totalSecondsSaved / 3600).toFixed(1);
    const dollars = ((totalSecondsSaved / 3600) * PREFS.dollarsPerHour).toFixed(2);

    const chartOpts = extra => Object.assign({
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tc, font: { size: 11 } }, grid: { color: gc } },
        y: { ticks: { color: tc, font: { size: 11 } }, grid: { color: gc }, beginAtZero: true },
      },
    }, extra || {});

    function mkChart(id, type, data, opts) {
      if (typeof Chart === 'undefined') return;
      const el = document.getElementById(id);
      if (!el) return;
      charts.push(new Chart(el, { type, data, options: chartOpts(opts) }));
    }

    function topRowsFor(logSlice) {
      const byJump = {};
      logSlice.forEach(x => { byJump[x.jumpId] = (byJump[x.jumpId] || 0) + 1; });
      const top10 = Object.entries(byJump).sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([id, ct]) => ({ name: SAMPLE_JUMPS.find(j => j.id === id)?.name || 'Removed', removed: !SAMPLE_JUMPS.find(j => j.id === id), ct }));
      return top10.map((j, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;${i < top10.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}font-size:0.84rem">
          <span style="color:var(--text-dim);min-width:18px;font-size:0.75rem">${i + 1}</span>
          <span style="flex:1;color:${j.removed ? 'var(--text-dim)' : 'var(--text-muted)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:${j.removed ? 'italic' : 'normal'}">${esc(j.name)}</span>
          <span style="font-weight:700;color:var(--hover-accent)">${j.ct}</span>
        </div>`).join('');
    }

    function byColFor(logSlice) {
      const byCol = {};
      logSlice.forEach(x => {
        const j = SAMPLE_JUMPS.find(j => j.id === x.jumpId);
        const name = j ? (SAMPLE_COLUMNS.find(c => c.id === j.columnId)?.name || 'Unknown') : 'Unknown';
        byCol[name] = (byCol[name] || 0) + 1;
      });
      return Object.entries(byCol);
    }

    function mkDoughnut(id, entries) {
      mkChart(id, 'doughnut',
        { labels: entries.map(x => x[0]), datasets: [{ data: entries.map(x => x[1]), backgroundColor: doughColors.slice(0, entries.length), borderWidth: 0 }] },
        { scales: {}, plugins: { legend: { display: true, position: 'bottom', labels: { color: tc, boxWidth: 10, font: { size: 11 }, padding: 10 } } } });
    }

    /* ── Summary view ─────────────────────────────────────────── */
    if (currentStatView === 'summary') {
      const colEntries = byColFor(LOG);
      const labels30 = [], data30 = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        labels30.push(i === 0 ? 'Today' : i % 5 === 0 ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
        data30.push(LOG.filter(x => new Date(x.ts).toISOString().slice(0, 10) === key).length);
      }
      dash.innerHTML = `
        <div class="stats-cards stats-cards-4">
          <div class="stat-card"><div class="stat-card-value">${n.toLocaleString()}</div><div class="stat-card-label">Total Launches</div></div>
          <div class="stat-card"><div class="stat-card-value">${hours} hrs</div><div class="stat-card-label">Time Saved</div></div>
          <div class="stat-card"><div class="stat-card-value">${fmtUSD(dollars)}</div><div class="stat-card-label">Dollars Saved</div></div>
          <div class="stat-card"><div class="stat-card-value">${SAMPLE_JUMPS.length}</div><div class="stat-card-label">Active Jumps</div></div>
        </div>
        <div class="stats-chart-row">
          <div class="stats-chart-box full"><div class="stats-chart-title">Last 30 Days</div><div style="height:190px"><canvas id="chLine"></canvas></div></div>
        </div>
        <div class="stats-chart-row">
          <div class="stats-chart-box">
            <div class="stats-chart-title">Top 10 Jumps</div>
            <div>${topRowsFor(LOG)}</div>
          </div>
          <div class="stats-chart-box">
            <div class="stats-chart-title">Launches by Column</div>
            <div style="height:310px"><canvas id="chCol"></canvas></div>
          </div>
        </div>`;
      requestAnimationFrame(() => {
        mkChart('chLine', 'bar', { labels: labels30, datasets: [{ data: data30, backgroundColor: barClr, borderRadius: 3 }] });
        mkDoughnut('chCol', colEntries);
      });
      return;
    }

    /* ── Period views ─────────────────────────────────────────── */
    let chartLabels = [], chartData = [], chartTitle = '', chartColors = [];
    if (currentStatView === 'daily') {
      chartTitle = 'Launches by Day - Last 7 Days';
      for (let i = 6; i >= 0; i--) {
        const ds = startOf('day') - i * 86400000;
        const de = ds + 86400000;
        const d = new Date(ds);
        chartLabels.push(i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
        chartData.push(clicks.filter(x => x.ts >= ds && x.ts < de).length);
      }
    } else if (currentStatView === 'weekly') {
      chartTitle = 'Launches by Week - Last 52 Weeks';
      const weekStart = startOf('week') - 51 * 7 * 86400000;
      for (let w = 0; w < 52; w++) {
        const ws = weekStart + w * 7 * 86400000;
        const we = ws + 7 * 86400000;
        chartLabels.push(w % 4 === 0 ? new Date(ws).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
        chartData.push(LOG.filter(x => x.ts >= ws && x.ts < we).length);
      }
    } else if (currentStatView === 'monthly') {
      const yr = new Date().getFullYear();
      chartTitle = `Launches by Month - ${yr}`;
      MONTHS.forEach((_, i) => {
        const ms = new Date(yr, i, 1).getTime();
        const me = new Date(yr, i + 1, 1).getTime();
        chartLabels.push(MONTHS[i]);
        if (i >= 8) {
          // Sep–Dec: same period last year (amber) so the view isn't empty
          const lms = new Date(yr - 1, i, 1).getTime();
          const lme = new Date(yr - 1, i + 1, 1).getTime();
          chartData.push(LOG.filter(x => x.ts >= lms && x.ts < lme).length);
          chartColors.push('rgba(245,158,11,0.85)');
        } else {
          chartData.push(LOG.filter(x => x.ts >= ms && x.ts < me).length);
          chartColors.push(barClr);
        }
      });
    } else if (currentStatView === 'yearly') {
      chartTitle = `Launches by Year - ${new Date().getFullYear() - 4} to ${new Date().getFullYear()}`;
      for (let yr = new Date().getFullYear() - 4; yr <= new Date().getFullYear(); yr++) {
        const ys = new Date(yr, 0, 1).getTime();
        const ye = new Date(yr + 1, 0, 1).getTime();
        chartLabels.push(yr === new Date().getFullYear() ? `${yr} YTD` : `${yr}`);
        chartData.push(LOG.filter(x => x.ts >= ys && x.ts < ye).length);
      }
    }
    const colEntriesP = byColFor(clicks).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Upper-left stat card: average jumps per bucket for the active period
    const avgMap = {
      daily:   { label: 'Avg Jumps / Day',   denom: 7  },
      weekly:  { label: 'Avg Jumps / Week',  denom: 52 },
      monthly: { label: 'Avg Jumps / Month', denom: 12 },
      yearly:  { label: 'Avg Jumps / Year',  denom: 5  },
    };
    const avg = avgMap[currentStatView];
    const avgVal = (n / avg.denom).toFixed(1);

    dash.innerHTML = `
      <div class="stats-cards">
        <div class="stat-card"><div class="stat-card-value">${avgVal}</div><div class="stat-card-label">${avg.label}</div></div>
        <div class="stat-card"><div class="stat-card-value">${hours} hrs</div><div class="stat-card-label">Time Saved</div></div>
        <div class="stat-card"><div class="stat-card-value">${fmtUSD(dollars)}</div><div class="stat-card-label">Dollars Saved</div></div>
      </div>
      <div class="stats-chart-row">
        <div class="stats-chart-box full"><div class="stats-chart-title">${chartTitle}</div><div style="height:220px"><canvas id="chPeriod"></canvas></div>${currentStatView === 'monthly' ? '<div style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:0.72rem;color:var(--text-muted)"><span style="width:10px;height:10px;border-radius:2px;background:rgba(0,194,199,0.75)"></span> This year<span style="width:10px;height:10px;border-radius:2px;background:rgba(245,158,11,0.85);margin-left:14px"></span> Same period last year (Sep\u2013Dec)</div>' : ''}</div>
      </div>
      <div class="stats-chart-row">
        <div class="stats-chart-box">
          <div class="stats-chart-title">Top 10 Jumps</div>
          ${topRowsFor(clicks)}
        </div>
        <div class="stats-chart-box">
          <div class="stats-chart-title">Launches by Column</div>
          <div style="height:310px"><canvas id="chColP"></canvas></div>
        </div>
      </div>`;

    requestAnimationFrame(() => {
      mkChart('chPeriod', 'bar', { labels: chartLabels, datasets: [{ data: chartData, backgroundColor: chartColors.length ? chartColors : barClr, borderRadius: 3 }] });
      mkDoughnut('chColP', colEntriesP);
    });
  }

  function setView(sv) {
    currentStatView = sv;
    document.querySelectorAll('#statsBarDemo .jfb-tab').forEach(b => b.classList.toggle('active', b.dataset.sv === sv));
    destroyCharts();
    posStatsPill();
    renderStatsDash();
  }

  function init() {
    const bar = document.getElementById('statsBarDemo');
    if (!bar) return;
    bar.addEventListener('click', e => {
      const tab = e.target.closest('.jfb-tab');
      if (!tab) return;
      setView(tab.dataset.sv);
    });
    const p = new URLSearchParams(location.search);
    if (p.get('tab') && STAT_VIEWS.includes(p.get('tab'))) currentStatView = p.get('tab');
    bar.querySelectorAll('.jfb-tab').forEach(b => b.classList.toggle('active', b.dataset.sv === currentStatView));
    requestAnimationFrame(() => { posStatsPill(); renderStatsDash(); });
    // re-render charts when theme changes or viewport resizes
    new MutationObserver(() => { destroyCharts(); renderStatsDash(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', () => { destroyCharts(); renderStatsDash(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
