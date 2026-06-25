// ── JumpKit Admin Dashboard ────────────────────────────────────────
// ── Admin Dashboard ────────────────────────────────────────────────
function adminEsc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

window.renderAdmin = async function renderAdmin() {
  const content = document.getElementById('pageContent');
  if (!content) return;

  // Gate to admin only
  if (window._supabaseProfile?.role !== 'admin') {
    content.innerHTML = '<div style="padding:32px;color:var(--text-dim)">Access denied.</div>';
    return;
  }

  content.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:300px;text-align:center;color:var(--text-muted)">
      <svg class="ti ti-loader" style="font-size:2rem;display:block;margin-bottom:12px;animation:spin 1s linear infinite"><use href="img/tabler-sprite.min.svg#tabler-loader"/></svg>
      Loading users…
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    <div id="adminDash" style="display:none;color:var(--text-dim);font-size:0.9rem;padding:0"></div>`;

  try {
    // Ensure Chart.js is loaded
    if (typeof Chart === 'undefined') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'js/chart.min.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load chart.min.js'));
        document.head.appendChild(s);
      });
    }

    const [summaryRes, usersRes, growthRes] = await Promise.all([
      supabaseClient.rpc('get_admin_summary'),
      supabaseClient.rpc('get_admin_user_stats'),
      supabaseClient.rpc('get_admin_growth_stats'),
    ]);

    if (summaryRes.error) throw new Error('get_admin_summary: ' + summaryRes.error.message);
    if (usersRes.error) throw new Error('get_admin_user_stats: ' + usersRes.error.message);
    // growth errors are non-fatal

    const s = summaryRes.data || {};
    const users = usersRes.data || [];
    const g = growthRes.data || {};
    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const fmtLaunches = (u) => {
      if ((u.subscription_tier === 'core' || u.subscription_tier === 'teams_jet') && u.subscription_status === 'active') return '∞';
      const used = u.personal_launches_total || 0;
      return `${used} / 250`;
    };

    const buildAdminRow = (u) => {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || '—';
      const isAdminU    = u.user_role === 'admin';
      const isUnlimitedU = !isAdminU && (u.subscription_tier === 'core' || u.subscription_tier === 'teams_jet') && u.subscription_status === 'active';
      const isCancelledU = !isAdminU && u.subscription_status === 'cancelled';
      const sub       = isAdminU ? 'Admin' : isUnlimitedU ? 'Unlimited' : isCancelledU ? 'Cancelled' : 'Free';
      const pillBg    = isAdminU ? 'rgba(0,194,199,0.12)' : isUnlimitedU ? 'rgba(72,187,120,0.12)' : isCancelledU ? 'rgba(229,62,62,0.12)' : 'rgba(128,128,128,0.12)';
      const pillColor = isAdminU ? '#00C2C7' : isUnlimitedU ? '#48BB78' : isCancelledU ? '#e53e3e' : 'var(--text-dim)';
      const _adminPlanLabel = u.subscription_plan === 'annual' ? 'Annual' : u.subscription_plan === 'monthly' ? 'Monthly' : u.subscription_plan === 'annual-test' ? 'Annual (test)' : u.subscription_plan === 'monthly-test' ? 'Monthly (test)' : null;
      const _adminPlanIsTest = u.subscription_plan && u.subscription_plan.includes('test');
      const planBadge = _adminPlanLabel
        ? `<span style="background:${_adminPlanIsTest ? 'rgba(245,158,11,0.12)' : 'rgba(72,187,120,0.12)'};color:${_adminPlanIsTest ? '#d97706' : '#48BB78'};font-weight:600;font-size:0.75rem;padding:3px 9px;border-radius:20px;white-space:nowrap">${_adminPlanLabel}</span>`
        : '';
      return `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-muted)">${esc(name)}</td>
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-dim)">${esc(u.email || '—')}</td>
          <td style="padding:9px 12px;font-size:0.82rem"><span style="background:${pillBg};color:${pillColor};font-weight:600;font-size:0.75rem;padding:3px 9px;border-radius:20px;white-space:nowrap">${sub}</span></td>
          <td style="padding:9px 12px;font-size:0.82rem">${planBadge}</td>
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-muted);text-align:right">${fmtLaunches(u)}</td>
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-muted);text-align:right">${u.teams_owned || 0}</td>
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-muted);text-align:right">${u.teams_joined || 0}</td>
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-muted);text-align:right">${u.total_paywall_hits || 0}</td>
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-dim)">${fmtDate(u.last_active_at)}</td>
          <td style="padding:9px 12px;font-size:0.82rem;color:var(--text-dim)">${fmtDate(u.created_at)}</td>
        </tr>`;
    };
    const userRows = users.map(buildAdminRow).join('');

    // Growth tile helper
    const growthTile = (label, data) => {
      const d = data || {};
      const total = d.total || 0;
      const tileBg = total > 0 ? 'rgba(72,187,120,0.07)' : total < 0 ? 'rgba(229,62,62,0.07)' : 'rgba(128,128,128,0.06)';
      return `<div class="stats-chart-box" style="min-height:unset;flex:1;background:${tileBg}">
        <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">${label}</div>
        <div style="font-size:1.6rem;font-weight:900;color:${total > 0 ? '#48BB78' : total < 0 ? '#e53e3e' : 'var(--text-muted)'};line-height:1">+${total.toLocaleString()}</div>
        <div style="font-size:0.72rem;color:var(--text-dim);margin-top:2px">total</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px">
          <div><div style="font-size:1rem;font-weight:700;color:#48BB78">${(d.unlimited||0).toLocaleString()}</div><div style="font-size:0.7rem;color:#48BB78">unlimited</div></div>
          <div><div style="font-size:1rem;font-weight:700;color:var(--text-dim)">${(d.free||0).toLocaleString()}</div><div style="font-size:0.7rem;color:var(--text-dim)">free</div></div>
          <div><div style="font-size:1rem;font-weight:700;color:#e53e3e">${(d.cancelled||0).toLocaleString()}</div><div style="font-size:0.7rem;color:#e53e3e">cancelled</div></div>
        </div>
      </div>`;
    };

    // Chart data
    const chartRows = Array.isArray(g.chart) ? g.chart : [];
    const chartLabels = chartRows.map(r => r.day ? r.day.slice(5) : ''); // MM-DD
    const chartData   = chartRows.map(r => r.cumulative || 0);

    const _dash = document.getElementById('adminDash');
    if (_dash) { _dash.style.display = ''; const _spin = content.querySelector('.ti-loader')?.closest('div[style*="flex-direction"]'); if (_spin) _spin.remove(); }
    document.getElementById('adminDash').innerHTML = `
      <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Total Users</div>
      <div class="stats-cards" style="grid-template-columns:repeat(5,1fr);margin-bottom:24px">
        <div class="stat-card" style="background:rgba(128,128,128,0.06)"><div class="stat-card-value" style="color:var(--text-muted)">${(s.total_users||0).toLocaleString()}</div><div class="stat-card-label" style="color:var(--text-muted)">Total Users</div></div>
        <div class="stat-card" style="background:rgba(72,187,120,0.07)"><div class="stat-card-value" style="color:#48BB78">${(s.unlimited_users||0).toLocaleString()}</div><div class="stat-card-label" style="color:#48BB78">Unlimited</div></div>
        <div class="stat-card" style="background:rgba(128,128,128,0.06)"><div class="stat-card-value" style="color:var(--text-dim)">${(s.free_users||0).toLocaleString()}</div><div class="stat-card-label" style="color:var(--text-dim)">Free</div></div>
        <div class="stat-card" style="background:rgba(229,62,62,0.07)"><div class="stat-card-value" style="color:#e53e3e">${(s.cancelled_users||0).toLocaleString()}</div><div class="stat-card-label" style="color:#e53e3e">Cancelled</div></div>
        <div class="stat-card" style="background:rgba(0,194,199,0.07)"><div class="stat-card-value" style="color:#00C2C7">${(s.admin_users||0).toLocaleString()}</div><div class="stat-card-label" style="color:#00C2C7">Admins</div></div>
      </div>
      <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Incremental Users</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:24px">
        ${growthTile('Today', g.today)}
        ${growthTile('This Week', g.week)}
        ${growthTile('This Month', g.month)}
        ${growthTile('This Year', g.year)}
      </div>
      <div class="stats-chart-box full" style="margin-bottom:24px">
        <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px">Total Users — Last 90 Days</div>
        <div style="height:180px"><canvas id="adminUserChart"></canvas></div>
      </div>
      <div class="stats-chart-box" style="min-height:unset;overflow-x:auto">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em">All Users</div>
          <div class="jump-search-wrap">
            <svg class="ti ti-search jump-search-icon"><use href="img/tabler-sprite.min.svg#tabler-search"/></svg>
            <input id="adminSearch" type="text" placeholder="Search users..." class="jump-search-input" style="width:200px" />
          </div>
        </div>
        <table id="adminUserTable" style="width:100%;border-collapse:collapse;min-width:700px">
          <thead>
            <tr style="border-bottom:2px solid var(--border)">
              <th data-col="name" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left;cursor:pointer;user-select:none">User<span class="sort-ind"> ↕</span></th>
              <th data-col="email" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left;cursor:pointer;user-select:none">Email<span class="sort-ind"> ↕</span></th>
              <th data-col="sub" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left;cursor:pointer;user-select:none">Tier<span class="sort-ind"> ↕</span></th>
              <th data-col="plan" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left">Subscription</th>
              <th data-col="personal_launches_total" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:right;cursor:pointer;user-select:none">Launches<span class="sort-ind"> ↕</span></th>
              <th data-col="teams_owned" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:right;cursor:pointer;user-select:none">Teams Owned<span class="sort-ind"> ↕</span></th>
              <th data-col="teams_joined" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:right;cursor:pointer;user-select:none">Teams Joined<span class="sort-ind"> ↕</span></th>
              <th data-col="total_paywall_hits" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:right;cursor:pointer;user-select:none">Paywall Hits<span class="sort-ind"> ↕</span></th>
              <th data-col="last_active_at" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left;cursor:pointer;user-select:none">Last Active<span class="sort-ind"> ↕</span></th>
              <th data-col="created_at" style="padding:8px 12px;font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;text-align:left;cursor:pointer;user-select:none">Joined<span class="sort-ind"> ↕</span></th>
            </tr>
          </thead>
          <tbody id="adminUserTbody">${userRows}</tbody>
        </table>
      </div>`;

    // Render chart + wire sort/search
    requestAnimationFrame(() => {
      // Chart
      if (growthRes.error) console.warn('[adminChart] growth stats error:', growthRes.error.message);
      if (typeof Chart !== 'undefined') {
        const dark = document.documentElement.dataset.theme === 'dark';
        const tc = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.50)';
        const gc = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
        const el = document.getElementById('adminUserChart');
        if (el) new Chart(el, {
          type: 'line',
          data: { labels: chartLabels, datasets: [{ data: chartData, borderColor: '#00C2C7', backgroundColor: 'rgba(0,194,199,0.08)', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { ticks: { color: tc, font: { size: 11 }, maxTicksLimit: 10 }, grid: { color: gc } }, y: { ticks: { color: tc, font: { size: 11 } }, grid: { color: gc }, beginAtZero: false } } },
        });
      }
      // Sort + search
      let _sortCol = 'created_at', _sortDir = -1, _searchQ = '';
      const _getVal = (u, col) => {
        if (col === 'name') return ([u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || '').toLowerCase();
        if (col === 'sub') return (u.user_role === 'admin' ? '0admin' : (u.subscription_tier === 'core' || u.subscription_tier === 'teams_jet') && u.subscription_status === 'active' ? '1unlimited' : u.subscription_status === 'cancelled' ? '3cancelled' : '2free');
        if (col === 'email') return (u.email || '').toLowerCase();
        return u[col] ?? '';
      };
      const _rerender = () => {
        let data = [...users];
        if (_searchQ) { const q = _searchQ.toLowerCase(); data = data.filter(u => ([u.first_name, u.last_name].filter(Boolean).join(' ') + ' ' + (u.email || '')).toLowerCase().includes(q)); }
        data.sort((a, b) => { const va = _getVal(a, _sortCol), vb = _getVal(b, _sortCol); return va < vb ? _sortDir : va > vb ? -_sortDir : 0; });
        const tbody = document.getElementById('adminUserTbody');
        if (tbody) tbody.innerHTML = data.map(buildAdminRow).join('') || `<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--text-dim)">No matches.</td></tr>`;
        document.querySelectorAll('#adminUserTable th[data-col]').forEach(th => {
          const ind = th.querySelector('.sort-ind');
          if (ind) ind.textContent = th.dataset.col === _sortCol ? (_sortDir === -1 ? ' ▼' : ' ▲') : ' ↕';
        });
      };
      document.querySelectorAll('#adminUserTable th[data-col]').forEach(th => {
        th.addEventListener('click', () => { if (_sortCol === th.dataset.col) _sortDir *= -1; else { _sortCol = th.dataset.col; _sortDir = -1; } _rerender(); });
      });
      const searchEl = document.getElementById('adminSearch');
      if (searchEl) searchEl.addEventListener('input', e => { _searchQ = e.target.value; _rerender(); });
    });

  } catch (err) {
    const dash = document.getElementById('adminDash');
    if (dash) { dash.style.display = ''; dash.innerHTML = `<div style="color:var(--text-dim);padding:16px">Failed to load admin data: ${adminEsc(err.message)}</div>`; }
    const _spin = content.querySelector('[style*="flex-direction"]');
    if (_spin && _spin.querySelector('.ti-loader')) _spin.remove();
  }
};
