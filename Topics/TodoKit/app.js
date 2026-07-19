/* ===========================
   Todo Kit — app.js
   =========================== */

const DEFAULT_CATEGORIES = ['Bug', 'New Feature', 'Marketing'];
const DATA_API_URL = '/api/state';

const ICONS = {
  pencil: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  trash:  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="m19 6-.867 13.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  urgent: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z"/><path d="M8 12h8"/></svg>`,
  chevronsUp: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/></svg>`,
  minus: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h12"/></svg>`,
  chevronsDown: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m7 6 5 5 5-5"/><path d="m7 13 5 5 5-5"/></svg>`,
  progress: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/></svg>`,
  x:      `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
};

// ===========================
// Category Colors
// ===========================

const CATEGORY_COLORS_LIGHT = [
  { bg: '#fee2e2', text: '#b91c1c' },  // red
  { bg: '#dbeafe', text: '#1d4ed8' },  // blue
  { bg: '#dcfce7', text: '#3d754e' },  // green
  { bg: '#fef9c3', text: '#854d0e' },  // yellow
  { bg: '#ffedd5', text: '#c2410c' },  // orange
  { bg: '#ede9fe', text: '#6d28d9' },  // purple
  { bg: '#fce7f3', text: '#be185d' },  // pink
  { bg: '#e0f2fe', text: '#0369a1' },  // sky
  { bg: '#d1fae5', text: '#065f46' },  // teal
  { bg: '#fdf4ff', text: '#7e22ce' },  // violet
  { bg: '#fff7ed', text: '#9a3412' },  // warm orange
  { bg: '#f0fdf4', text: '#166534' },  // light green
];

const CATEGORY_COLORS_DARK = [
  { bg: '#3b1414', text: '#f87171' },  // red
  { bg: '#14203b', text: '#60a5fa' },  // blue
  { bg: '#102018', text: '#4ade80' },  // green
  { bg: '#3b3210', text: '#fbbf24' },  // yellow
  { bg: '#3b2410', text: '#fb923c' },  // orange
  { bg: '#1e1530', text: '#a78bfa' },  // purple
  { bg: '#3b1828', text: '#f472b6' },  // pink
  { bg: '#0d2030', text: '#38bdf8' },  // sky
  { bg: '#0d2a1e', text: '#34d399' },  // teal
  { bg: '#2a1838', text: '#c084fc' },  // violet
  { bg: '#3b2010', text: '#fb923c' },  // warm orange
  { bg: '#0d2014', text: '#4ade80' },  // light green
];

function CATEGORY_COLORS() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? CATEGORY_COLORS_DARK : CATEGORY_COLORS_LIGHT;
}

function defaultCategorySeed(index) {
  return CATEGORY_COLORS()[index % CATEGORY_COLORS().length].text;
}

function normalizeCategorySeed(seed, fallback = '#4a8a5e') {
  const rgb = hexToRgb(seed);
  return rgb ? rgbToHex(rgb) : fallback;
}

function ensureProjectCategories(project) {
  if (!project) return [];
  const existing = Array.isArray(project.categories) ? project.categories : [];
  const seen = new Set();
  const categories = [];

  DEFAULT_CATEGORIES.forEach((name, index) => {
    const match = existing.find(c => c.isDefault && (c.originalName === name || c.name === name)) ||
      existing.find(c => c.name === name);
    const cat = match || {
      id: `default-${index}`,
      name,
      originalName: name,
      color: project.categoryColors?.[name] || defaultCategorySeed(index),
      isDefault: true,
    };
    cat.id = cat.id || `default-${index}`;
    cat.originalName = cat.originalName || name;
    cat.name = cat.name || name;
    cat.color = normalizeCategorySeed(cat.color || project.categoryColors?.[cat.name] || defaultCategorySeed(index), defaultCategorySeed(index));
    cat.isDefault = true;
    const key = cat.name.toLowerCase();
    if (!seen.has(key)) { categories.push(cat); seen.add(key); }
  });

  (project.customCategories || []).forEach((name, index) => {
    const key = String(name).toLowerCase();
    if (seen.has(key)) return;
    const match = existing.find(c => !c.isDefault && c.name === name);
    const cat = match || {
      id: `custom-${index}-${slugify(name)}`,
      name,
      color: project.categoryColors?.[name] || '#4a8a5e',
      isDefault: false,
    };
    cat.id = cat.id || `custom-${index}-${slugify(name)}`;
    cat.name = cat.name || name;
    cat.color = normalizeCategorySeed(cat.color || project.categoryColors?.[cat.name] || '#4a8a5e');
    cat.isDefault = false;
    categories.push(cat);
    seen.add(key);
  });

  existing.forEach((cat, index) => {
    if (!cat?.name) return;
    const key = cat.name.toLowerCase();
    if (seen.has(key)) return;
    cat.id = cat.id || `cat-${index}-${slugify(cat.name)}`;
    cat.color = normalizeCategorySeed(cat.color || project.categoryColors?.[cat.name] || '#4a8a5e');
    cat.isDefault = Boolean(cat.isDefault);
    categories.push(cat);
    seen.add(key);
  });

  project.categories = categories;
  project.customCategories = categories.filter(c => !c.isDefault).map(c => c.name);
  project.categoryColors = Object.fromEntries(categories.map(c => [c.name, c.color]));
  return project.categories;
}

function getCategoryColor(name, project = getProject(activeProjectId)) {
  const categories = ensureProjectCategories(project);
  const match = categories.find(c => c.name === name);
  if (match?.color) return colorFromSeed(match.color);

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CATEGORY_COLORS()[Math.abs(hash) % CATEGORY_COLORS().length];
}

function colorFromSeed(seed) {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const rgb = hexToRgb(seed);
  if (!rgb) return dark ? { bg: '#1a2a20', text: '#4ade80' } : { bg: '#e8f5ee', text: '#3d754e' };
  if (dark) {
    return {
      bg: rgbToHex(mixRgb(rgb, { r: 15, g: 17, b: 23 }, 0.82)),
      text: rgbToHex(mixRgb(rgb, { r: 255, g: 255, b: 255 }, 0.35)),
    };
  }
  return {
    bg: rgbToHex(mixRgb(rgb, { r: 255, g: 255, b: 255 }, 0.82)),
    text: rgbToHex(mixRgb(rgb, { r: 0, g: 0, b: 0 }, 0.18)),
  };
}

function hexToRgb(hex) {
  const match = String(hex || '').trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

function mixRgb(a, b, weightB) {
  const weightA = 1 - weightB;
  return {
    r: Math.round(a.r * weightA + b.r * weightB),
    g: Math.round(a.g * weightA + b.g * weightB),
    b: Math.round(a.b * weightA + b.b * weightB),
  };
}

function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';
}

// ===========================
// State
// ===========================

let state = {
  projects: [],  // [{id, name, description, users:[], categories:[{id,name,color,isDefault}]}]
  tasks: [],     // [{id, projectId, title, priority, plannedStart, description, responsible, comments, status, category}]
};

let activeProjectId = null;
let editingTaskId = null;
let editingProjectId = null;
let modalComments = [];
let editingCommentId = null;

const filters = {
  search: '',
  status: '',
  priority: '',
  category: '',
  responsible: '',
};

let sort = { col: null, dir: 'asc', cols: [] }; // cols: [{col, dir}, ...] for multi-sort

const PRIORITY_ORDER = { Low: 0, Med: 1, Medium: 1, High: 2, Urgent: 3 };
const STATUS_ORDER   = { Cancelled: 0, Completed: 1, 'To Do': 2, 'In Progress': 3, 'To Test': 4 };
let draggedTaskId = null;

function normalizeStatus(status) {
  return status === 'Started' ? 'In Progress' : (status || 'To Do');
}

// ===========================
// Storage
// ===========================

async function loadState() {
  try {
    const response = await fetch(DATA_API_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state = await response.json();
  } catch (e) {
    console.warn('TodoKit: failed to load JSON state. Start with `node server.js` instead of opening index.html directly.', e);
    state = { projects: [], tasks: [] };
  }
  normalizeState();
}

function normalizeState() {
  if (!state.projects) state.projects = [];
  if (!state.tasks) state.tasks = [];
  state.projects.forEach(project => {
    if (!project.description) project.description = '';
    ensureProjectCategories(project);
  });
  state.tasks.forEach(normalizeTaskRecord);
  normalizeTaskExecutionOrders();
}

function normalizeTaskRecord(task) {
  task.status = normalizeStatus(task.status);
  if (!Array.isArray(task.comments)) task.comments = [];
  if (task.completionNotes && !task.comments.some(c => c.legacyCompletionNotes)) {
    task.comments.push({
      id: genId(),
      author: task.responsible || 'TodoKit',
      html: escapeHtml(task.completionNotes).replace(/\n/g, '<br>'),
      createdAt: new Date().toISOString(),
      updatedAt: null,
      legacyCompletionNotes: true,
    });
  }
  task.comments = task.comments.map(comment => ({
    id: comment.id || genId(),
    author: comment.author || task.responsible || 'TodoKit',
    html: sanitizeCommentHtml(comment.html || comment.text || ''),
    createdAt: comment.createdAt || new Date().toISOString(),
    updatedAt: comment.updatedAt || null,
    legacyCompletionNotes: Boolean(comment.legacyCompletionNotes),
  })).filter(comment => stripHtml(comment.html).trim());
  task.completionNotes = '';
}

let saveStatePromise = Promise.resolve();
let saveStateErrorShown = false;

function saveState() {
  normalizeState();
  const payload = JSON.stringify({ projects: state.projects, tasks: state.tasks });
  saveStatePromise = saveStatePromise
    .catch(() => {})
    .then(async () => {
      const response = await fetch(DATA_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    })
    .catch(e => {
      console.error('TodoKit: failed to save JSON state. Make sure `node server.js` is running.', e);
      if (!saveStateErrorShown) {
        saveStateErrorShown = true;
        alert('TodoKit could not save to todokit-data.json. Make sure you opened it through node server.js.');
      }
    });
  return saveStatePromise;
}

// ===========================
// Helpers
// ===========================

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getProject(id) {
  return state.projects.find(p => p.id === id);
}

function getTask(id) {
  return state.tasks.find(t => t.id === id);
}

function getProjectTasks(projectId) {
  return state.tasks.filter(t => t.projectId === projectId);
}

function normalizeTaskExecutionOrders() {
  const byProject = new Map();
  state.tasks.forEach((task, idx) => {
    if (!byProject.has(task.projectId)) byProject.set(task.projectId, []);
    byProject.get(task.projectId).push({ task, idx });
  });

  byProject.forEach(items => {
    items
      .sort((a, b) => {
        const ao = Number(a.task.executionOrder);
        const bo = Number(b.task.executionOrder);
        if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
        if (Number.isFinite(ao)) return -1;
        if (Number.isFinite(bo)) return 1;
        return a.idx - b.idx;
      })
      .forEach((item, i) => { item.task.executionOrder = i + 1; });
  });
}

function getNextExecutionOrder(projectId) {
  const nums = getProjectTasks(projectId)
    .map(t => Number(t.executionOrder))
    .filter(Number.isFinite);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function getProjectCategories(project) {
  return ensureProjectCategories(project).map(c => c.name);
}

function simpleTaskId(task) {
  const order = Number(task?.executionOrder);
  return Number.isFinite(order) && order > 0 ? String(order) : '—';
}

function latestCommentText(task) {
  const comments = Array.isArray(task?.comments) ? task.comments : [];
  if (!comments.length) return '';
  const latest = [...comments].sort((a, b) => {
    const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bt - at;
  })[0];
  return stripHtml(latest?.html || '').replace(/\s+/g, ' ').trim();
}

// ── Tag helpers ────────────────────────────────────────────────────────────
let _modalTags = [];

function initTagInput(tags) {
  _modalTags = Array.isArray(tags) ? [...tags] : [];
  renderModalTagPills();
  const input = document.getElementById('tag-text-input');
  if (input) input.value = '';
}

function renderModalTagPills() {
  const area = document.getElementById('tag-input-area');
  if (!area) return;
  const input = document.getElementById('tag-text-input');
  // Remove existing pills (keep the input)
  Array.from(area.querySelectorAll('.tag-pill')).forEach(p => p.remove());
  // Insert pills before input
  _modalTags.forEach((tag, i) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `${escapeHtml(tag)}<button class="tag-pill-remove" type="button" data-tag-idx="${i}" aria-label="Remove tag">&#x00D7;</button>`;
    area.insertBefore(pill, input);
  });
}

function getModalTags() {
  return [..._modalTags];
}

function addModalTag(raw) {
  const tag = raw.trim().replace(/,+$/, '').trim();
  if (!tag || _modalTags.includes(tag)) return;
  _modalTags.push(tag);
  renderModalTagPills();
}

function renderTableTags(tags) {
  if (!tags || !tags.length) return '<span style="color:var(--text-muted);font-size:11px">—</span>';
  return `<div class="table-tags">${tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}</div>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}

function priorityBadge(priority) {
  const map = {
    Urgent: { cls: 'urgent', icon: ICONS.urgent },
    High:   { cls: 'high',   icon: ICONS.chevronsUp },
    Med:    { cls: 'med',    icon: ICONS.minus },
    Low:    { cls: 'low',    icon: ICONS.chevronsDown },
  };
  const item = map[priority] || map.Low;
  return `<span class="badge priority-icon-badge badge-${item.cls}" title="${escapeHtml(priority)}" aria-label="${escapeHtml(priority)} priority">${item.icon}</span>`;
}

function statusBadge(status) {
  const map = { 'To Do': 'todo', 'In Progress': 'in-progress', 'To Test': 'to-test', 'Completed': 'completed', 'Cancelled': 'cancelled' };
  const cls = map[status] || 'todo';
  return `<span class="badge badge-${cls}">${status}</span>`;
}

function categoryBadge(cat, project = getProject(activeProjectId)) {
  if (!cat) return '—';
  const color = getCategoryColor(cat, project);
  return `<span class="badge" style="background:${color.bg};color:${color.text}">${escapeHtml(cat)}</span>`;
}

// ===========================
// Render: Sidebar
// ===========================

function renderSidebar() {
  const list = document.getElementById('project-list');
  if (state.projects.length === 0) {
    list.innerHTML = `<li style="padding:8px 16px;color:var(--sidebar-text-muted);font-size:12.5px;font-style:italic;">No projects yet</li>`;
    return;
  }
  list.innerHTML = state.projects.map(p => `
    <li data-id="${p.id}" class="${p.id === activeProjectId ? 'active' : ''}" draggable="true" onclick="selectProject('${p.id}')">
      <span class="proj-drag-handle" title="Drag to reorder">⠇</span>
      <span class="proj-dot"></span>
      ${escapeHtml(p.name)}
    </li>
  `).join('');
  initSidebarProjectDrag(list);
}

function initSidebarProjectDrag(list) {
  let dragSrc = null;

  list.querySelectorAll('li[draggable]').forEach(li => {
    li.addEventListener('dragstart', (e) => {
      dragSrc = li;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', li.dataset.id);
      setTimeout(() => li.classList.add('proj-dragging'), 0);
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('proj-dragging');
      list.querySelectorAll('li').forEach(el => el.classList.remove('proj-drag-over'));
      dragSrc = null;
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragSrc && li !== dragSrc) {
        list.querySelectorAll('li').forEach(el => el.classList.remove('proj-drag-over'));
        li.classList.add('proj-drag-over');
      }
    });
    li.addEventListener('dragleave', () => li.classList.remove('proj-drag-over'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      li.classList.remove('proj-drag-over');
      if (!dragSrc || dragSrc === li) return;

      const srcId  = dragSrc.dataset.id;
      const destId = li.dataset.id;
      const srcIdx  = state.projects.findIndex(p => p.id === srcId);
      const destIdx = state.projects.findIndex(p => p.id === destId);
      if (srcIdx === -1 || destIdx === -1) return;

      // Reorder projects array
      const [moved] = state.projects.splice(srcIdx, 1);
      state.projects.splice(destIdx, 0, moved);
      saveState();
      renderSidebar();
    });
  });
}

// ===========================
// Render: Project View
// ===========================

let _mfLastProjectId = null;

function renderProjectView() {
  const project = getProject(activeProjectId);
  if (!project) {
    document.getElementById('empty-state').style.display = '';
    document.getElementById('project-view').style.display = 'none';
    return;
  }

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('project-view').style.display = '';

  document.getElementById('project-name-heading').textContent = project.name;
  const descEl = document.getElementById('project-description-heading');
  descEl.textContent = project.description || '';
  descEl.style.display = project.description ? '' : 'none';

  // Auto-apply default filter when switching projects
  if (activeProjectId !== _mfLastProjectId) {
    _mfLastProjectId       = activeProjectId;
    _mfActiveId            = null;
    _mfAppliedMultiFilters = null;
    filters.status = filters.priority = filters.category = filters.responsible = filters.search = '';
    sort.col = null; sort.dir = 'asc'; sort.cols = [];
    const defaultF = _mfGetList(activeProjectId).find(f => f.isDefault);
    if (defaultF) _mfApplyFilter(defaultF);
  }

  const projectTasks = state.tasks.filter(t => t.projectId === activeProjectId);
  document.getElementById('task-count').textContent = `${projectTasks.length} task${projectTasks.length !== 1 ? 's' : ''}`;

  populateFilterDropdowns(project);
  _mfUpdateDropdown();
  renderTaskTable(project, projectTasks);
}

function populateFilterDropdowns(project) {
  const cats = getProjectCategories(project);

  const catSelect = document.getElementById('filter-category');
  const currentCat = filters.category || catSelect.value;
  catSelect.innerHTML = `<option value="">All Categories</option>` +
    cats.map(c => `<option value="${escapeHtml(c)}" ${c === currentCat ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');

  const users = project.users || [];
  const respSelect = document.getElementById('filter-responsible');
  const currentResp = filters.responsible || respSelect.value;
  respSelect.innerHTML = `<option value="">All Responsible</option>` +
    users.map(u => `<option value="${escapeHtml(u)}" ${u === currentResp ? 'selected' : ''}>${escapeHtml(u)}</option>`).join('');

  FILTER_SELECTS.forEach(syncCustomSelect);
}

function getVisibleTasks(projectTasks) {
  let tasks = projectTasks;

  // Apply filters
  if (filters.search) {
    const q = filters.search.toLowerCase();
    tasks = tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    );
  }
  // If a saved multi-filter is active, use it; otherwise fall back to single-select filters
  if (_mfAppliedMultiFilters) {
    const mf = _mfAppliedMultiFilters;
    if (mf.status?.length)      tasks = tasks.filter(t => mf.status.includes(t.status));
    if (mf.priority?.length)    tasks = tasks.filter(t => mf.priority.includes(t.priority));
    if (mf.category?.length)    tasks = tasks.filter(t => mf.category.includes(t.category));
    if (mf.responsible?.length) tasks = tasks.filter(t => mf.responsible.includes(t.responsible));
  } else {
    if (filters.status)      tasks = tasks.filter(t => t.status === filters.status);
    if (filters.priority)    tasks = tasks.filter(t => t.priority === filters.priority);
    if (filters.category)    tasks = tasks.filter(t => t.category === filters.category);
    if (filters.responsible) tasks = tasks.filter(t => t.responsible === filters.responsible);
  }

  // Apply sorting
  if (sort.cols.length > 0 || sort.col) {
    tasks = [...tasks].sort(compareTasksForCurrentSort);
  }

  return tasks;
}

function _compareBySortEntry(a, b, col, dir) {
  const d = dir === 'asc' ? 1 : -1;
  let av, bv;

  if (col === 'priority') {
    av = PRIORITY_ORDER[a.priority] ?? 99;
    bv = PRIORITY_ORDER[b.priority] ?? 99;
    return (av - bv) * d; // asc = Low→High, desc = High→Low (matches original)
  }
  if (col === 'status') {
    av = STATUS_ORDER[a.status] ?? 99;
    bv = STATUS_ORDER[b.status] ?? 99;
    return (av - bv) * d;
  }
  if (col === 'executionOrder') {
    av = Number.isFinite(Number(a.executionOrder)) ? Number(a.executionOrder) : Number.MAX_SAFE_INTEGER;
    bv = Number.isFinite(Number(b.executionOrder)) ? Number(b.executionOrder) : Number.MAX_SAFE_INTEGER;
    return (av - bv) * d;
  }
  if (col === 'plannedStart') {
    av = a.plannedStart || '9999-12-31';
    bv = b.plannedStart || '9999-12-31';
  } else {
    av = String(a[col] || '').toLowerCase();
    bv = String(b[col] || '').toLowerCase();
  }
  if (av < bv) return -1 * d;
  if (av > bv) return  1 * d;
  return 0;
}

function compareTasksForCurrentSort(a, b) {
  // Use full multi-sort cols array if available, fall back to legacy single sort.col
  const sortCols = sort.cols.length > 0
    ? sort.cols
    : (sort.col ? [{ col: sort.col, dir: sort.dir }] : []);

  for (const s of sortCols) {
    const result = _compareBySortEntry(a, b, s.col, s.dir);
    if (result !== 0) return result;
  }
  return tieBreakTasks(a, b, 0);
}

function tieBreakTasks(a, b, result) {
  if (result !== 0) return result;
  const ao = Number(a.executionOrder) || 0;
  const bo = Number(b.executionOrder) || 0;
  if (ao !== bo) return ao - bo;
  return String(a.title || '').localeCompare(String(b.title || ''));
}

function isDragSortActive() {
  return sort.col === 'plannedStart' || sort.col === 'executionOrder';
}

function renderTaskTable(project, projectTasks) {
  const tasks = getVisibleTasks(projectTasks);
  const dragEnabled = isDragSortActive();

  // Update sort indicators in header
  document.querySelectorAll('.th-sortable').forEach(th => {
    th.classList.remove('sort-active');
    const existing = th.querySelector('.sort-indicator');
    if (existing) existing.remove();
    if (th.dataset.sort === sort.col) {
      th.classList.add('sort-active');
      const span = document.createElement('span');
      span.className = 'sort-indicator';
      span.textContent = sort.dir === 'asc' ? '↑' : '↓';
      th.appendChild(span);
    }
  });

  const tbody = document.getElementById('task-tbody');
  const noTasks = document.getElementById('no-tasks');

  if (tasks.length === 0) {
    tbody.innerHTML = '';
    noTasks.style.display = '';
    return;
  }
  noTasks.style.display = 'none';

  tbody.innerHTML = tasks.map(t => `
    <tr data-id="${t.id}" class="${dragEnabled ? 'row-draggable' : ''}" draggable="${dragEnabled}" onclick="openTaskDetailModal('${t.id}')">
      <td class="order-cell">
        <span class="order-pill" title="Task #${simpleTaskId(t)}">#${simpleTaskId(t)}</span>
        ${dragEnabled ? '<span class="drag-grip" title="Drag to reorder">⋮⋮</span>' : ''}
      </td>
      <td class="task-title-cell">
        <span class="task-title-text">${escapeHtml(t.title)}</span>
        <span class="task-latest-comment" title="${escapeHtml(latestCommentText(t) || 'No comments yet')}">${escapeHtml(latestCommentText(t) || 'No comments yet')}</span>
      </td>
      <td class="col-tags">${renderTableTags(t.tags)}</td>
      <td>${categoryBadge(t.category)}</td>
      <td>${priorityBadge(t.priority)}</td>
      <td>${statusBadge(t.status)}</td>
      <td>${escapeHtml(t.responsible || '—')}</td>
      <td>${formatDate(t.plannedStart)}</td>
      <td class="col-actions">
        <div class="row-actions" onclick="event.stopPropagation()">
          <button class="btn-icon-sm btn-icon-edit" onclick="openTaskDetailModal('${t.id}')" title="View details">${ICONS.pencil}</button>
          <button class="btn-icon-sm btn-icon-danger" onclick="deleteTask('${t.id}')" title="Delete">${ICONS.trash}</button>
        </div>
      </td>
    </tr>
  `).join('');

  attachTaskDragHandlers();
}

function attachTaskDragHandlers() {
  const tbody = document.getElementById('task-tbody');
  tbody.querySelectorAll('tr[draggable="true"]').forEach(row => {
    row.addEventListener('dragstart', handleTaskDragStart);
    row.addEventListener('dragover', handleTaskDragOver);
    row.addEventListener('dragleave', handleTaskDragLeave);
    row.addEventListener('drop', handleTaskDrop);
    row.addEventListener('dragend', handleTaskDragEnd);
  });
}

function handleTaskDragStart(event) {
  draggedTaskId = event.currentTarget.dataset.id;
  event.currentTarget.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedTaskId);
}

function handleTaskDragOver(event) {
  if (!draggedTaskId || !isDragSortActive()) return;
  event.preventDefault();
  const row = event.currentTarget;
  if (row.dataset.id === draggedTaskId) return;
  row.classList.toggle('drop-before', isDropBefore(event, row));
  row.classList.toggle('drop-after', !isDropBefore(event, row));
}

function handleTaskDragLeave(event) {
  event.currentTarget.classList.remove('drop-before', 'drop-after');
}

function handleTaskDrop(event) {
  if (!draggedTaskId || !isDragSortActive()) return;
  event.preventDefault();
  event.stopPropagation();

  const targetRow = event.currentTarget;
  const targetTaskId = targetRow.dataset.id;
  targetRow.classList.remove('drop-before', 'drop-after');
  if (!targetTaskId || targetTaskId === draggedTaskId) return;

  reorderTasksByDrop(draggedTaskId, targetTaskId, !isDropBefore(event, targetRow));
  draggedTaskId = null;
}

function handleTaskDragEnd() {
  document.querySelectorAll('#task-tbody tr').forEach(row => {
    row.classList.remove('dragging', 'drop-before', 'drop-after');
  });
  draggedTaskId = null;
}

function isDropBefore(event, row) {
  const rect = row.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2;
}

function reorderTasksByDrop(sourceId, targetId, placeAfterTarget) {
  const projectTasks = getProjectTasks(activeProjectId);
  const displayedIds = getVisibleTasks(projectTasks).map(t => t.id);
  const fromIndex = displayedIds.indexOf(sourceId);
  const targetIndex = displayedIds.indexOf(targetId);
  if (fromIndex === -1 || targetIndex === -1) return;

  const [movedId] = displayedIds.splice(fromIndex, 1);
  let insertIndex = displayedIds.indexOf(targetId);
  if (placeAfterTarget) insertIndex += 1;
  displayedIds.splice(insertIndex, 0, movedId);

  applyDisplayedTaskOrder(displayedIds, movedId, targetId);
  saveState();
  renderProjectView();
}

function applyDisplayedTaskOrder(displayedIds, movedId, targetId) {
  const movedTask = getTask(movedId);
  const targetTask = getTask(targetId);
  if (!movedTask) return;

  // Match the destination slot's date first. If that row has no date, use the nearest dated neighbor.
  const destinationDate = targetTask?.plannedStart || nearestPlannedStart(displayedIds, displayedIds.indexOf(movedId));
  if (destinationDate) movedTask.plannedStart = destinationDate;

  // Re-number the whole project while preserving any currently hidden rows in their relative sorted slots.
  // This avoids duplicate order values when the user is working with active filters.
  const visibleSet = new Set(displayedIds);
  let visibleIndex = 0;
  const allSortedIds = [...getProjectTasks(activeProjectId)]
    .sort(compareTasksForCurrentSort)
    .map(task => visibleSet.has(task.id) ? displayedIds[visibleIndex++] : task.id);

  const count = allSortedIds.length;
  allSortedIds.forEach((id, index) => {
    const task = getTask(id);
    if (!task) return;
    task.executionOrder = sort.dir === 'desc' ? count - index : index + 1;
  });
}

function nearestPlannedStart(ids, index) {
  for (let offset = 1; offset < ids.length; offset++) {
    const prev = ids[index - offset] ? getTask(ids[index - offset]) : null;
    if (prev?.plannedStart) return prev.plannedStart;
    const next = ids[index + offset] ? getTask(ids[index + offset]) : null;
    if (next?.plannedStart) return next.plannedStart;
  }
  return '';
}

// ===========================
// Project actions
// ===========================

function selectProject(id) {
  activeProjectId = id;
  // Reset filters and sort on project switch
  filters.search = '';
  filters.status = '';
  filters.priority = '';
  filters.category = '';
  filters.responsible = '';
  sort.col = null;
  sort.dir = 'asc';
  sort.cols = [];
  document.getElementById('global-search').value = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-priority').value = '';
  document.getElementById('filter-category').value = '';
  document.getElementById('filter-responsible').value = '';

  renderSidebar();
  renderProjectView();
}

function openNewProjectModal() {
  editingProjectId = null;
  document.getElementById('modal-project-title').textContent = 'New Project';
  document.getElementById('project-name-input').value = '';
  showModal('modal-project');
  setTimeout(() => document.getElementById('project-name-input').focus(), 100);
}

function saveProject() {
  const name = document.getElementById('project-name-input').value.trim();
  if (!name) {
    document.getElementById('project-name-input').focus();
    return;
  }

  if (editingProjectId) {
    const proj = getProject(editingProjectId);
    if (proj) proj.name = name;
  } else {
    const newProj = {
      id: genId(),
      name,
      description: '',
      users: [],
      customCategories: [],
      categoryColors: {},
      categories: DEFAULT_CATEGORIES.map((catName, index) => ({
        id: `default-${index}`,
        name: catName,
        originalName: catName,
        color: defaultCategorySeed(index),
        isDefault: true,
      })),
    };
    state.projects.push(newProj);
    activeProjectId = newProj.id;
  }

  saveState();
  hideModal('modal-project');
  renderSidebar();
  renderProjectView();
}

function deleteProject(id) {
  if (!confirm(`Delete project "${getProject(id)?.name}"? All tasks will be permanently removed.`)) return;
  state.projects = state.projects.filter(p => p.id !== id);
  state.tasks = state.tasks.filter(t => t.projectId !== id);
  if (activeProjectId === id) activeProjectId = null;
  saveState();
  hideModal('modal-settings');
  renderSidebar();
  renderProjectView();
}

// ===========================
// Task actions
// ===========================

// ===========================
// Task Detail Modal (read-only)
// ===========================
let detailTaskId = null;
let _detailChanges = {};        // pending field edits { field: value }
let _detailPendingComments = []; // pending comments not yet saved
let _detailDirty = false;
let _detailEditingCommentId = null; // id of comment being edited in editor

function _resetDetailDraft() {
  _detailChanges = {};
  _detailPendingComments = [];
  _detailDirty = false;
  _detailEditingCommentId = null;
}

function _markDetailDirty() {
  _detailDirty = true;
  const btn = document.getElementById('btn-close-detail-modal');
  if (btn) {
    btn.textContent = 'Save & Close';
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-primary');
  }
  const cancelBtn = document.getElementById('btn-cancel-detail-modal');
  if (cancelBtn) cancelBtn.style.display = '';
}

function cancelAndCloseDetail() {
  _resetDetailDraft();
  // Reset close button back to default state
  const btn = document.getElementById('btn-close-detail-modal');
  if (btn) {
    btn.textContent = 'Close';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-secondary');
  }
  const cancelBtn = document.getElementById('btn-cancel-detail-modal');
  if (cancelBtn) cancelBtn.style.display = 'none';
  hideModal('modal-task-detail');
}

function _onDetailCommentInput() {
  // Mark dirty as soon as the user starts typing a comment
  _markDetailDirty();
}

function _detailCommentAuthor() {
  const project = getProject(activeProjectId);
  const users = Array.from(new Set(['Jeff', ...(project?.users || [])].filter(Boolean)));
  return users[0] || 'Jeff';
}

function _stageEditorComment() {
  // If the editor has content, stage it (new or edit) before flushing
  const editor = document.getElementById('detail-comment-editor');
  if (!editor) return;
  const html = sanitizeCommentHtml(editor.innerHTML || '');
  if (!html.trim() || html === '<p></p>' || html === '<br>') return;

  if (_detailEditingCommentId) {
    // Update existing comment in pending list or task
    const pending = _detailPendingComments.find(c => c.id === _detailEditingCommentId);
    if (pending) {
      pending.html = html;
    } else {
      // It's a saved comment — queue an edit via _detailChanges keyed by comment id
      if (!_detailChanges._commentEdits) _detailChanges._commentEdits = {};
      _detailChanges._commentEdits[_detailEditingCommentId] = html;
    }
    _detailEditingCommentId = null;
  } else {
    // New comment
    _detailPendingComments.push({
      id: genId(),
      author: _detailCommentAuthor(),
      html,
      createdAt: new Date().toISOString(),
    });
  }
  editor.innerHTML = '';
  const form = document.getElementById('detail-comment-form');
  if (form) form.style.display = 'none';
  const addBtn = document.querySelector('#task-detail-body .btn-ghost.btn-sm');
  if (addBtn) addBtn.style.display = '';
}

function _flushDetailDraft() {
  // Stage any in-progress comment from the editor first
  _stageEditorComment();
  // Apply all pending changes to the real task object and save
  const task = getTask(detailTaskId);
  if (!task) return;
  const commentEdits = _detailChanges._commentEdits || {};
  const commentDeletes = new Set(_detailChanges._commentDeletes || []);
  Object.entries(_detailChanges).forEach(([field, value]) => {
    if (field === '_commentEdits' || field === '_commentDeletes') return;
    if (field === 'status') {
      applyStatusChange(task, value);
    } else if (field === 'title') {
      if (value) task[field] = value;
    } else {
      task[field] = value;
    }
  });
  if (!task.comments) task.comments = [];
  // Apply edits to saved comments
  task.comments.forEach(c => { if (commentEdits[c.id]) c.html = commentEdits[c.id]; });
  // Apply deletes to saved comments
  task.comments = task.comments.filter(c => !commentDeletes.has(c.id));
  // Append new pending comments (filter out deleted pending ones too)
  _detailPendingComments.filter(c => !commentDeletes.has(c.id)).forEach(c => task.comments.push(c));
  if (_detailDirty) {
    saveState();
    renderProjectView();
  }
  _resetDetailDraft();
}

function saveAndCloseDetail() {
  _flushDetailDraft();
  hideModal('modal-task-detail');
}

// Returns the rendered display HTML for a given field value (for in-place updates)
function _renderDetailFieldDisplay(field, value, task, project) {
  if (field === 'status')      return statusBadge(value);
  if (field === 'priority')    return priorityBadge(value);
  if (field === 'category')    return categoryBadge(value, project);
  if (field === 'responsible') return escapeHtml(value || '—');
  if (field === 'plannedStart') return formatDate(value);
  if (field === 'title')       return escapeHtml(value);
  if (field === 'description') return value ? escapeHtml(value) : '<span class="detail-empty">Click to add description…</span>';
  return escapeHtml(String(value || ''));
}

function openTaskDetailModal(taskId) {
  // If opening a different task while dirty, flush current draft first
  if (_detailDirty && detailTaskId && taskId !== detailTaskId) _flushDetailDraft();
  // Reset draft for fresh open
  if (taskId !== detailTaskId) _resetDetailDraft();
  detailTaskId = taskId;
  const task = getTask(taskId);
  if (!task) return;

  const body = document.getElementById('task-detail-body');
  const project = getProject(activeProjectId);

  const commentsHtml = (task.comments || []).map(c => {
    const ts = c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '';
    return _buildDetailCommentHtml(c, ts);
  }).join('') || '<div class="detail-empty">No comments</div>';

  body.innerHTML = `
    <div class="detail-title-row">
      <span class="detail-task-id">#${simpleTaskId(task)}</span>
      <div class="detail-title detail-editable" title="Click to edit" onclick="detailInlineEdit(this,'title')">${escapeHtml(task.title)}</div>
    </div>
    <div class="detail-meta-row">
      <div class="detail-meta-item"><span class="detail-label-inline">Category</span><span class="detail-value-inline detail-editable" title="Click to edit" onclick="detailInlineEdit(this,'category')">${categoryBadge(task.category, project)}</span></div>
      <div class="detail-meta-item"><span class="detail-label-inline">Status</span><span class="detail-value-inline detail-editable" title="Click to edit" onclick="detailInlineEdit(this,'status')">${statusBadge(task.status)}</span></div>
      <div class="detail-meta-item"><span class="detail-label-inline">Priority</span><span class="detail-value-inline detail-editable" title="Click to edit" onclick="detailInlineEdit(this,'priority')">${priorityBadge(task.priority)}</span></div>
      <div class="detail-meta-item"><span class="detail-label-inline">Responsible</span><span class="detail-value-inline detail-editable" title="Click to edit" onclick="detailInlineEdit(this,'responsible')">${escapeHtml(task.responsible || '—')}</span></div>
      <div class="detail-meta-item"><span class="detail-label-inline">Planned Start</span><span class="detail-value-inline detail-editable" title="Click to edit" onclick="detailInlineEdit(this,'plannedStart')">${formatDate(task.plannedStart)}</span></div>
      ${task.closedAt ? `<div class="detail-meta-item"><span class="detail-label-inline">Closed</span><span class="detail-value-inline" style="font-size:0.82rem;color:var(--text-light)">${new Date(task.closedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span></div>` : ''}
      ${(task.tags && task.tags.length) ? `<div class="detail-meta-item" style="flex-basis:100%"><span class="detail-label-inline">Tags</span><span class="detail-value-inline"><div class="detail-tags-row">${task.tags.map(tag => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')}</div></span></div>` : ''}
    </div>
    <div class="detail-section">
      <div class="detail-label">Description</div>
      <div class="detail-text detail-editable" title="Click to edit" onclick="detailInlineEdit(this,'description')">${task.description ? escapeHtml(task.description) : '<span class="detail-empty">Click to add description…</span>'}</div>
    </div>
    <div class="detail-section">
      <div class="detail-label">Comments (${(task.comments || []).length})</div>
      <div class="detail-comments-list">${commentsHtml}</div>
      <div id="detail-comment-form" style="display:none;margin-top:10px">
        <div class="comment-editor-card">
          <div class="wysiwyg-toolbar" aria-label="Comment formatting toolbar">
            <button type="button" class="btn-editor" onclick="detailCommentCmd('bold')" title="Bold"><strong>B</strong></button>
            <button type="button" class="btn-editor" onclick="detailCommentCmd('italic')" title="Italic"><em>I</em></button>
            <button type="button" class="btn-editor" onclick="detailCommentCmd('underline')" title="Underline"><u>U</u></button>
            <button type="button" class="btn-editor" onclick="detailCommentCmd('insertUnorderedList')" title="Bullet list">• List</button>
            <button type="button" class="btn-editor" onclick="detailCommentCmd('insertOrderedList')" title="Numbered list">1. List</button>
          </div>
          <div class="comment-editor form-input" id="detail-comment-editor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Add a comment…" style="min-height:64px" oninput="_onDetailCommentInput()"></div>
        </div>
        <p style="font-size:11px;color:var(--text-muted);margin:5px 0 0;">ℹ️ Click <strong>Save &amp; Close</strong> to save this comment.</p>
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="document.getElementById('detail-comment-form').style.display='block';document.getElementById('detail-comment-editor').focus()">+ Add Comment</button>
    </div>
  `;

  updateTaskDetailNavButtons();

  // Show action buttons (same as edit modal — always visible for existing task)
  document.getElementById('btn-delete-task-detail').style.display = '';
  document.getElementById('btn-mark-task-progress-detail').style.display = '';
  document.getElementById('btn-mark-task-done-detail').style.display = '';

  // Sync close/cancel button state with dirty flag
  const _closeBtn = document.getElementById('btn-close-detail-modal');
  const _cancelBtn = document.getElementById('btn-cancel-detail-modal');
  if (_closeBtn) {
    if (_detailDirty) {
      _closeBtn.textContent = 'Save & Close';
      _closeBtn.classList.remove('btn-secondary');
      _closeBtn.classList.add('btn-primary');
    } else {
      _closeBtn.textContent = 'Close';
      _closeBtn.classList.remove('btn-primary');
      _closeBtn.classList.add('btn-secondary');
    }
  }
  if (_cancelBtn) _cancelBtn.style.display = _detailDirty ? '' : 'none';

  showModal('modal-task-detail');
}

// ===========================
// Inline editing in detail modal
// ===========================
function detailInlineEdit(el, field) {
  if (el.dataset.editing) return; // already active
  el.dataset.editing = '1';

  const task = getTask(detailTaskId);
  const project = getProject(activeProjectId);
  if (!task) return;

  const SELECT_FIELDS = {
    status:      ['To Do','In Progress','To Test','Completed','Cancelled'],
    priority:    ['Urgent','High','Med','Low'],
    category:    getProjectCategories(project),
    responsible: ['', ...Array.from(new Set(['Jeff', ...(project.users || [])].filter(Boolean)))],
  };

  const commit = (value) => {
    const v = (typeof value === 'string') ? value.trim() : value;
    // Store in draft (don't save yet)
    _detailChanges[field] = (field === 'plannedStart') ? (v || '') : v;
    _markDetailDirty();
    // Update display in-place so user sees the new value
    delete el.dataset.editing;
    el.style.cursor = '';
    el.innerHTML = _renderDetailFieldDisplay(field, v, task, project);
  };

  if (field in SELECT_FIELDS) {
    const opts = SELECT_FIELDS[field];
    const currentVal = task[field] || '';

    // Build custom select matching the rest of the app
    const wrapper  = document.createElement('div');
    wrapper.className = 'custom-select-wrapper detail-inline-custom-select';

    const trigger  = document.createElement('div');
    trigger.className = 'custom-select-trigger form-input';
    trigger.tabIndex = 0;
    const triggerLabel = document.createElement('span');
    triggerLabel.textContent = currentVal || '—';
    const chevron = document.createElement('span');
    chevron.className = 'custom-select-chevron';
    chevron.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
    trigger.appendChild(triggerLabel);
    trigger.appendChild(chevron);

    const dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown';

    opts.forEach(o => {
      const item = document.createElement('div');
      item.className = 'custom-select-option' + (o === currentVal ? ' selected' : '');
      item.textContent = o || '—';
      item.dataset.value = o;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // prevent blur on trigger before click registers
        triggerLabel.textContent = o || '—';
        dropdown.classList.remove('open');
        trigger.classList.remove('open');
        commit(o);
      });
      dropdown.appendChild(item);
    });

    wrapper.appendChild(trigger);
    wrapper.appendChild(dropdown);

    el.innerHTML = '';
    el.style.cursor = 'default';
    el.appendChild(wrapper);

    // Open dropdown immediately
    dropdown.classList.add('open');
    trigger.classList.add('open');
    trigger.focus();

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      closeAllCustomSelects();
      if (!isOpen) { dropdown.classList.add('open'); trigger.classList.add('open'); }
    });
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeAllCustomSelects(); openTaskDetailModal(detailTaskId); }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger.click(); }
    });
    trigger.addEventListener('blur', (e) => {
      // Only close if focus left the whole wrapper
      setTimeout(() => {
        if (!wrapper.contains(document.activeElement)) {
          closeAllCustomSelects();
          openTaskDetailModal(detailTaskId);
        }
      }, 150);
    });

  } else if (field === 'plannedStart') {
    const inp = document.createElement('input');
    inp.type = 'date';
    inp.className = 'detail-inline-input';
    inp.value = task.plannedStart || '';
    el.innerHTML = '';
    el.style.cursor = 'default';
    el.appendChild(inp);
    inp.focus();
    inp.showPicker?.();
    const done = () => commit(inp.value);
    inp.addEventListener('blur', done);
    inp.addEventListener('change', done);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { inp.blur(); } else if (e.key === 'Escape') openTaskDetailModal(detailTaskId); });

  } else if (field === 'description') {
    const ta = document.createElement('textarea');
    ta.className = 'detail-inline-textarea';
    ta.value = task.description || '';
    ta.rows = Math.max(3, (task.description || '').split('\n').length + 1);
    el.innerHTML = '';
    el.style.cursor = 'default';
    el.appendChild(ta);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    ta.addEventListener('blur', () => commit(ta.value));
    ta.addEventListener('keydown', e => {
      if (e.key === 'Escape') openTaskDetailModal(detailTaskId);
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ta.blur();
    });

  } else { // title or other text
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'detail-inline-input detail-inline-title';
    inp.value = task[field] || '';
    el.innerHTML = '';
    el.style.cursor = 'default';
    el.appendChild(inp);
    inp.focus();
    inp.select();
    const done = () => commit(inp.value);
    inp.addEventListener('blur', done);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') inp.blur();
      if (e.key === 'Escape') openTaskDetailModal(detailTaskId);
    });
  }
}

function _buildDetailCommentHtml(c, ts) {
  const iconEdit = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>`;
  const iconDel  = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="m19 6-.867 13.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
  return `<div class="detail-comment" data-comment-id="${escapeHtml(c.id)}">
    <div class="detail-comment-meta">
      <span><strong>${escapeHtml(c.author || '—')}</strong> · <span class="detail-comment-date">${ts}</span></span>
      <span class="detail-comment-actions">
        <button class="btn-icon-sm" title="Edit comment" onclick="detailCommentEdit('${escapeHtml(c.id)}')">${iconEdit}</button>
        <button class="btn-icon-sm btn-icon-danger" title="Delete comment" onclick="detailCommentDelete('${escapeHtml(c.id)}')">${iconDel}</button>
      </span>
    </div>
    <div class="detail-comment-html">${c.html || ''}</div>
  </div>`;
}

function detailCommentEdit(commentId) {
  const task = getTask(detailTaskId);
  if (!task) return;
  // Find comment in saved or pending
  const c = (task.comments || []).find(x => x.id === commentId) ||
             _detailPendingComments.find(x => x.id === commentId);
  if (!c) return;
  _detailEditingCommentId = commentId;
  const form = document.getElementById('detail-comment-form');
  const editor = document.getElementById('detail-comment-editor');
  if (form) form.style.display = 'block';
  if (editor) { editor.innerHTML = c.html || ''; editor.focus(); }
  _markDetailDirty();
  // Hide the Add Comment button while editing
  const addBtn = document.querySelector('#task-detail-body .btn-ghost.btn-sm');
  if (addBtn) addBtn.style.display = 'none';
}

function detailCommentDelete(commentId) {
  const task = getTask(detailTaskId);
  if (!task) return;
  // Check if it's a pending comment
  const pendingIdx = _detailPendingComments.findIndex(c => c.id === commentId);
  if (pendingIdx >= 0) {
    _detailPendingComments.splice(pendingIdx, 1);
  } else {
    // Queue delete for saved comment
    if (!_detailChanges._commentDeletes) _detailChanges._commentDeletes = [];
    if (!_detailChanges._commentDeletes.includes(commentId)) _detailChanges._commentDeletes.push(commentId);
  }
  // Remove from DOM
  const el = document.querySelector(`.detail-comment[data-comment-id="${commentId}"]`);
  if (el) el.remove();
  // Update count
  const deletedSaved = (_detailChanges._commentDeletes || []).length;
  const allComments = (task.comments || []).length - deletedSaved + _detailPendingComments.length;
  const countEl = document.querySelector('.detail-section .detail-label');
  if (countEl && countEl.textContent.includes('Comments')) countEl.textContent = `Comments (${Math.max(0, allComments)})`;
  // Show 'no comments' if empty
  const list = document.querySelector('.detail-comments-list');
  if (list && !list.querySelector('.detail-comment')) list.innerHTML = '<div class="detail-empty">No comments</div>';
  _markDetailDirty();
}

function detailCommentCmd(command) {
  const editor = document.getElementById('detail-comment-editor');
  if (!editor) return;
  editor.focus();
  document.execCommand(command, false, null);
}

function saveDetailComment() {
  const task = getTask(detailTaskId);
  if (!task) return;
  const editor = document.getElementById('detail-comment-editor');
  const html = sanitizeCommentHtml(editor?.innerHTML || '');
  if (!html.trim() || html === '<p></p>' || html === '<br>') return;

  const author = _detailCommentAuthor();
  const commentId = _detailEditingCommentId || genId();
  const isEdit = !!_detailEditingCommentId;

  if (isEdit) {
    // Update existing comment display in-place
    const el = document.querySelector(`.detail-comment[data-comment-id="${commentId}"] .detail-comment-html`);
    if (el) el.innerHTML = html;
    const pending = _detailPendingComments.find(c => c.id === commentId);
    if (pending) { pending.html = html; }
    else {
      if (!_detailChanges._commentEdits) _detailChanges._commentEdits = {};
      _detailChanges._commentEdits[commentId] = html;
    }
    _detailEditingCommentId = null;
  } else {
    const newComment = { id: commentId, author, html, createdAt: new Date().toISOString() };
    _detailPendingComments.push(newComment);
    const ts = new Date(newComment.createdAt).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'});
    const commentHtml = _buildDetailCommentHtml(newComment, ts);
    const list = document.querySelector('.detail-comments-list');
    if (list) {
      const empty = list.querySelector('.detail-empty');
      if (empty) empty.remove();
      list.insertAdjacentHTML('beforeend', commentHtml);
    }
  }

  _markDetailDirty();
  // Update comment count label
  const allComments = (task.comments || []).length + _detailPendingComments.length;
  const countEl = document.querySelector('.detail-section .detail-label');
  if (countEl && countEl.textContent.includes('Comments')) countEl.textContent = `Comments (${allComments})`;

  const form = document.getElementById('detail-comment-form');
  if (form) form.style.display = 'none';
  if (editor) editor.innerHTML = '';
  const addBtn = document.querySelector('#task-detail-body .btn-ghost.btn-sm');
  if (addBtn) addBtn.style.display = '';
}

function updateTaskDetailNavButtons() {
  const prev = document.getElementById('btn-prev-task-detail');
  const next = document.getElementById('btn-next-task-detail');
  if (!prev || !next) return;

  // Reuse the same navigation logic as edit modal
  const savedEditingId = editingTaskId;
  editingTaskId = detailTaskId;
  prev.disabled = !getAdjacentTaskId(-1);
  next.disabled = !getAdjacentTaskId(1);
  editingTaskId = savedEditingId;
}

function navigateTaskDetail(direction) {
  if (_detailDirty) _flushDetailDraft(); // save pending changes before navigating
  const savedEditingId = editingTaskId;
  editingTaskId = detailTaskId;
  const nextTaskId = getAdjacentTaskId(direction);
  editingTaskId = savedEditingId;
  if (!nextTaskId) return;
  openTaskDetailModal(nextTaskId);
}

function openTaskModal(taskId) {
  const project = getProject(activeProjectId);
  if (!project) return;

  const task = taskId ? getTask(taskId) : null;
  editingTaskId = taskId || null;

  document.getElementById('modal-task-title').textContent = task ? 'Edit Task' : 'New Task';

  // Populate category dropdown
  const cats = getProjectCategories(project);
  const catSelect = document.getElementById('task-category');
  catSelect.innerHTML = cats.map(c =>
    `<option value="${escapeHtml(c)}" ${task?.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`
  ).join('');

  // Populate responsible dropdown
  const respSelect = document.getElementById('task-responsible');
  const projectUsers = Array.from(new Set(['Jeff', ...(project.users || [])].filter(Boolean)));
  // Default blank/new task responsible to Jeff; preserve an existing assignee when present.
  const defaultResp = task?.responsible || (projectUsers.includes('Jeff') ? 'Jeff' : (projectUsers[0] || ''));
  respSelect.innerHTML = `<option value="">Unassigned</option>` +
    projectUsers.map(u =>
      `<option value="${escapeHtml(u)}" ${u === defaultResp ? 'selected' : ''}>${escapeHtml(u)}</option>`
    ).join('');

  // Fill fields
  document.getElementById('task-title').value            = task?.title || '';
  document.getElementById('task-priority').value         = task?.priority || 'Med';
  document.getElementById('task-status').value           = task?.status || 'To Do';
  document.getElementById('task-start-date').value       = task?.plannedStart || '';
  document.getElementById('task-description').value      = task?.description || '';
  initTagInput(task?.tags || []);
  modalComments = cloneComments(task?.comments || []);
  editingCommentId = null;
  populateCommentAuthorDropdown(project, task);
  resetCommentEditor();
  renderTaskComments();
  if (!task?.category && cats.length > 0) catSelect.value = cats[0];

  // Sync custom selects with updated native values
  TASK_MODAL_SELECTS.forEach(syncCustomSelect);

  // Show/hide edit-only controls
  document.getElementById('btn-delete-task').style.display = task ? '' : 'none';
  document.getElementById('btn-mark-task-progress').style.display = task ? '' : 'none';
  document.getElementById('btn-mark-task-done').style.display = task ? '' : 'none';
  updateTaskNavButtons();

  updateTaskModalStatusButtons();

  showModal('modal-task');
  setTimeout(() => document.getElementById('task-title').focus(), 100);
}

function updateTaskModalStatusButtons() {
  updateMarkDoneButton();
}

function updateMarkDoneButton() {
  const doneBtn = document.getElementById('btn-mark-task-done');
  const progressBtn = document.getElementById('btn-mark-task-progress');
  const status = document.getElementById('task-status').value;
  if (doneBtn) doneBtn.disabled = !editingTaskId || status === 'Completed';
  if (progressBtn) progressBtn.disabled = !editingTaskId || status === 'In Progress';
}

function cloneComments(comments) {
  return (comments || []).map(comment => ({
    id: comment.id || genId(),
    author: comment.author || 'TodoKit',
    html: sanitizeCommentHtml(comment.html || ''),
    createdAt: comment.createdAt || new Date().toISOString(),
    updatedAt: comment.updatedAt || null,
    legacyCompletionNotes: Boolean(comment.legacyCompletionNotes),
  })).filter(comment => stripHtml(comment.html).trim());
}

function populateCommentAuthorDropdown(project, task) {
  const select = document.getElementById('comment-author');
  if (!select) return;
  const users = Array.from(new Set(['Jeff', task?.responsible, ...(project?.users || []), 'Maximus'].filter(Boolean)));
  select.innerHTML = users.map(user => `<option value="${escapeHtml(user)}">${escapeHtml(user)}</option>`).join('');
  // Default to Jeff if present, else task responsible, else first user
  select.value = users.includes('Jeff') ? 'Jeff' : (task?.responsible || users[0] || 'Maximus');
  syncCustomSelect('comment-author');
}

function resetCommentEditor() {
  editingCommentId = null;
  const editor = document.getElementById('comment-editor');
  const addBtn = document.getElementById('btn-add-comment');
  const cancelBtn = document.getElementById('btn-cancel-comment-edit');
  const label = document.getElementById('comment-editing-label');
  if (editor) editor.innerHTML = '';
  if (addBtn) addBtn.innerHTML = `<span class="btn-icon-glyph"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg></span> Add Comment`;
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (label) label.style.display = 'none';
}

function renderTaskComments() {
  const list = document.getElementById('task-comments-list');
  if (!list) return;
  if (!modalComments.length) {
    list.innerHTML = '<div class="comments-empty">No comments yet.</div>';
    return;
  }
  list.innerHTML = modalComments.map(comment => `
    <article class="comment-item" data-comment-id="${escapeHtml(comment.id)}">
      <div class="comment-meta">
        <strong>${escapeHtml(comment.author)}</strong>
        <div class="comment-meta-right">
          <span>${formatTimestamp(comment.createdAt)}${comment.updatedAt ? ` · edited ${formatTimestamp(comment.updatedAt)}` : ''}</span>
          <button type="button" class="btn-icon-sm btn-icon-edit" onclick="editComment('${comment.id}')" title="Edit comment">${ICONS.pencil}</button>
          <button type="button" class="btn-icon-sm btn-icon-danger" onclick="deleteComment('${comment.id}')" title="Delete comment">${ICONS.trash}</button>
        </div>
      </div>
      <div class="comment-body">${sanitizeCommentHtml(comment.html)}</div>
    </article>
  `).join('');
}

function addOrUpdateComment() {
  const editor = document.getElementById('comment-editor');
  const author = document.getElementById('comment-author')?.value || 'Maximus';
  const html = sanitizeCommentHtml(editor?.innerHTML || '');
  if (!stripHtml(html).trim()) {
    editor?.focus();
    return;
  }
  const now = new Date().toISOString();
  if (editingCommentId) {
    const comment = modalComments.find(c => c.id === editingCommentId);
    if (comment) {
      comment.author = author;
      comment.html = html;
      comment.updatedAt = now;
    }
  } else {
    modalComments.push({ id: genId(), author, html, createdAt: now, updatedAt: null });
  }
  resetCommentEditor();
  renderTaskComments();
}

function editComment(id) {
  const comment = modalComments.find(c => c.id === id);
  if (!comment) return;
  editingCommentId = id;
  document.getElementById('comment-author').value = comment.author;
  syncCustomSelect('comment-author');
  document.getElementById('comment-editor').innerHTML = sanitizeCommentHtml(comment.html);
  document.getElementById('btn-add-comment').innerHTML = `${ICONS.pencil} Update Comment`;
  document.getElementById('btn-cancel-comment-edit').style.display = '';
  document.getElementById('comment-editing-label').style.display = '';
  document.getElementById('comment-editor').focus();
}

function deleteComment(id) {
  const comment = modalComments.find(c => c.id === id);
  if (!comment) return;
  if (!confirm('Delete this comment?')) return;
  modalComments = modalComments.filter(c => c.id !== id);
  if (editingCommentId === id) resetCommentEditor();
  renderTaskComments();
}

function runCommentCommand(command) {
  const editor = document.getElementById('comment-editor');
  if (!editor) return;
  editor.focus();
  document.execCommand(command, false, null);
}

function sanitizeCommentHtml(html) {
  if (!html) return '';
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'P', 'DIV', 'SPAN']);
  const template = document.createElement('template');
  template.innerHTML = String(html);
  template.content.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attr => node.removeAttribute(attr.name));
    if (!allowed.has(node.tagName)) node.replaceWith(...node.childNodes);
  });
  return template.innerHTML.trim();
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = String(html || '');
  return div.textContent || div.innerText || '';
}

function formatTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getTaskFormData() {
  const title = document.getElementById('task-title').value.trim();
  if (!title) {
    document.getElementById('task-title').focus();
    return null;
  }

  return {
    projectId:       activeProjectId,
    title,
    priority:        document.getElementById('task-priority').value,
    status:          document.getElementById('task-status').value,
    category:        document.getElementById('task-category').value,
    responsible:     document.getElementById('task-responsible').value,
    plannedStart:    document.getElementById('task-start-date').value,
    description:     document.getElementById('task-description').value.trim(),
    comments:        cloneComments(modalComments),
    completionNotes: '',
    tags:            getModalTags(),
  };
}

function saveTask() {
  const taskData = getTaskFormData();
  if (!taskData) return false;

  if (editingTaskId) {
    const task = getTask(editingTaskId);
    if (task) { Object.assign(task, taskData); applyStatusChange(task, taskData.status); }
  } else {
    const newTask = { id: genId(), executionOrder: getNextExecutionOrder(activeProjectId), ...taskData };
    applyStatusChange(newTask, taskData.status);
    state.tasks.push(newTask);
  }

  saveState();
  hideModal('modal-task');
  renderProjectView();
  return true;
}

function saveCurrentEditingTaskFromModal() {
  if (!editingTaskId) return false;
  const taskData = getTaskFormData();
  if (!taskData) return false;
  const task = getTask(editingTaskId);
  if (!task) return false;
  Object.assign(task, taskData);
  saveState();
  renderProjectView();
  return true;
}

function getTaskNavigationIds() {
  const projectTasks = getProjectTasks(activeProjectId);
  let tasks = getVisibleTasks(projectTasks);
  if (!tasks.some(t => t.id === editingTaskId)) tasks = projectTasks;
  return tasks.map(t => t.id);
}

function getAdjacentTaskId(direction) {
  if (!editingTaskId) return null;
  const ids = getTaskNavigationIds();
  const index = ids.indexOf(editingTaskId);
  if (index === -1) return null;
  return ids[index + direction] || null;
}

function updateTaskNavButtons() {
  const nav = document.getElementById('task-nav-actions');
  const prev = document.getElementById('btn-prev-task');
  const next = document.getElementById('btn-next-task');
  if (!nav || !prev || !next) return;

  if (!editingTaskId) {
    nav.style.display = 'none';
    return;
  }

  nav.style.display = '';
  prev.disabled = !getAdjacentTaskId(-1);
  next.disabled = !getAdjacentTaskId(1);
}

function navigateTask(direction) {
  const nextTaskId = getAdjacentTaskId(direction);
  if (!nextTaskId) return;
  if (!saveCurrentEditingTaskFromModal()) return;
  if (returnToDetailOnClose) detailTaskId = nextTaskId;
  openTaskModal(nextTaskId);
}

// ===========================
// closedAt tracking
// ===========================
const CLOSED_STATUSES = new Set(['Completed', 'Cancelled']);

function applyStatusChange(task, newStatus) {
  task.status = newStatus;
  if (CLOSED_STATUSES.has(newStatus)) {
    if (!task.closedAt) task.closedAt = new Date().toISOString();
  } else {
    delete task.closedAt;
  }
}

function markCurrentTaskStatus(status) {
  if (!editingTaskId) return;
  const taskData = getTaskFormData();
  if (!taskData) return;
  const task = getTask(editingTaskId);
  if (!task) return;
  Object.assign(task, taskData);
  applyStatusChange(task, status);
  saveState();
  hideModal('modal-task');
  renderProjectView();
}

function markCurrentTaskInProgress() {
  markCurrentTaskStatus('In Progress');
}

function markCurrentTaskDone() {
  markCurrentTaskStatus('Completed');
}

function deleteTask(id) {
  const task = getTask(id);
  if (!task) return;
  if (!confirm(`Delete task "${task.title}"?`)) return;
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveState();
  hideModal('modal-task');
  renderProjectView();
}

// ===========================
// Settings Modal
// ===========================

function openSettingsModal() {
  const project = getProject(activeProjectId);
  if (!project) return;
  ensureProjectCategories(project);
  document.getElementById('settings-project-name').value = project.name || '';
  document.getElementById('settings-project-description').value = project.description || '';
  renderSettingsUsers(project);
  renderSettingsCategories(project);
  // Reset to project tab
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.settings-panel').forEach(p => p.style.display = 'none');
  document.querySelector('[data-tab="project"]').classList.add('active');
  document.getElementById('tab-project').style.display = '';
  showModal('modal-settings');
}

function renderSettingsUsers(project) {
  const list = document.getElementById('users-list');
  const users = project.users || [];
  list.innerHTML = users.length === 0
    ? `<li style="color:var(--text-muted);font-style:italic;border:none;background:transparent">No users added yet.</li>`
    : users.map(u => `
        <li>
          <span class="item-label">${escapeHtml(u)}</span>
          <button class="btn-icon-sm btn-icon-danger" onclick="removeUser('${escapeHtml(u)}')" title="Remove">${ICONS.x}</button>
        </li>
      `).join('');
}

function renderSettingsCategories(project) {
  const list = document.getElementById('categories-list');
  const categories = ensureProjectCategories(project);
  list.innerHTML = categories.map((cat, index) => `
    <li class="category-edit-item">
      <input type="text" class="form-input category-name-input" id="category-name-${index}" value="${escapeHtml(cat.name)}" aria-label="Category name">
      <label class="category-row-color-picker" title="Category color seed">
        <span class="category-color-swatch" style="background:${escapeHtml(cat.color)}"></span>
        <input type="color" id="category-color-${index}" value="${escapeHtml(cat.color)}" aria-label="Category color seed">
      </label>
      <button class="btn btn-secondary btn-category-save" onclick="updateCategory(${index})">Save</button>
      ${cat.isDefault ? '<span class="default-tag" title="Default category (cannot be removed)">•</span>' : `<button class="btn-icon-sm btn-icon-danger" onclick="removeCategory(${index})" title="Remove">${ICONS.x}</button>`}
    </li>
  `).join('');
}

function saveProjectDetails() {
  const project = getProject(activeProjectId);
  if (!project) return;
  const nameInput = document.getElementById('settings-project-name');
  const descInput = document.getElementById('settings-project-description');
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  project.name = name;
  project.description = descInput.value.trim();
  saveState();
  renderSidebar();
  renderProjectView();
  hideModal('modal-settings');
}

function addUser() {
  const input = document.getElementById('new-user-input');
  const name = input.value.trim();
  if (!name) return;
  const project = getProject(activeProjectId);
  if (!project) return;
  if (!project.users) project.users = [];
  if (project.users.includes(name)) { input.value = ''; return; }
  project.users.push(name);
  saveState();
  input.value = '';
  renderSettingsUsers(project);
}

function removeUser(name) {
  const project = getProject(activeProjectId);
  if (!project) return;
  project.users = (project.users || []).filter(u => u !== name);
  saveState();
  renderSettingsUsers(project);
}

function addCategory() {
  const input = document.getElementById('new-category-input');
  const name = input.value.trim();
  if (!name) return;
  const project = getProject(activeProjectId);
  if (!project) return;
  const categories = ensureProjectCategories(project);
  if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) { input.value = ''; return; }
  const colorInput = document.getElementById('new-category-color');
  categories.push({
    id: `custom-${Date.now().toString(36)}-${slugify(name)}`,
    name,
    color: normalizeCategorySeed(colorInput?.value || '#4a8a5e'),
    isDefault: false,
  });
  syncProjectCategoryLegacyFields(project);
  saveState();
  input.value = '';
  if (colorInput) colorInput.value = '#4a8a5e';
  renderSettingsCategories(project);
  populateFilterDropdowns(project);
}

function updateCategory(index) {
  const project = getProject(activeProjectId);
  if (!project) return;
  const categories = ensureProjectCategories(project);
  const category = categories[index];
  if (!category) return;
  const nameInput = document.getElementById(`category-name-${index}`);
  const colorInput = document.getElementById(`category-color-${index}`);
  const nextName = nameInput.value.trim();
  if (!nextName) { nameInput.focus(); return; }
  const duplicate = categories.some((c, i) => i !== index && c.name.toLowerCase() === nextName.toLowerCase());
  if (duplicate) { nameInput.focus(); return; }

  const oldName = category.name;
  category.name = nextName;
  category.color = normalizeCategorySeed(colorInput.value || category.color || '#4a8a5e');
  if (oldName !== nextName) {
    state.tasks.forEach(task => {
      if (task.projectId === activeProjectId && task.category === oldName) task.category = nextName;
    });
    if (filters.category === oldName) filters.category = nextName;
  }
  syncProjectCategoryLegacyFields(project);
  saveState();
  renderSettingsCategories(project);
  populateFilterDropdowns(project);
  renderProjectView();
}

function removeCategory(index) {
  const project = getProject(activeProjectId);
  if (!project) return;
  const categories = ensureProjectCategories(project);
  const category = categories[index];
  if (!category || category.isDefault) return;
  project.categories = categories.filter((_, i) => i !== index);
  state.tasks.forEach(task => {
    if (task.projectId === activeProjectId && task.category === category.name) task.category = '';
  });
  if (filters.category === category.name) filters.category = '';
  syncProjectCategoryLegacyFields(project);
  saveState();
  renderSettingsCategories(project);
  populateFilterDropdowns(project);
  renderProjectView();
}

function syncProjectCategoryLegacyFields(project) {
  project.customCategories = (project.categories || []).filter(c => !c.isDefault).map(c => c.name);
  project.categoryColors = Object.fromEntries((project.categories || []).map(c => [c.name, c.color]));
}

// ===========================
// Modal helpers
// ===========================

let returnToDetailOnClose = false;

function showModal(id) {
  const el = document.getElementById(id);
  el.style.display = 'flex';
  el.classList.remove('modal-closing');
}

function hideModal(id) {
  const el = document.getElementById(id);
  el.classList.add('modal-closing');
  setTimeout(() => {
    el.style.display = 'none';
    el.classList.remove('modal-closing');
    if (id === 'modal-task' && returnToDetailOnClose) {
      returnToDetailOnClose = false;
      if (detailTaskId) setTimeout(() => openTaskDetailModal(detailTaskId), 120);
    }
  }, 130);
}

// ===========================
// Security helper
// ===========================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// ===========================
// Custom Select Component
// ===========================

const TASK_MODAL_SELECTS = ['task-priority', 'task-status', 'task-category', 'task-responsible'];
const FILTER_SELECTS = ['filter-status', 'filter-priority', 'filter-category', 'filter-responsible'];
const COMMENT_SELECTS = ['comment-author'];
const MF_SORT_SELECTS = ['mf-sort-col-0','mf-sort-dir-0','mf-sort-col-1','mf-sort-dir-1','mf-sort-col-2','mf-sort-dir-2'];
const CUSTOM_SELECTS = [...TASK_MODAL_SELECTS, ...FILTER_SELECTS, ...COMMENT_SELECTS, ...MF_SORT_SELECTS, 'saved-filter-select'];

function buildCustomSelect(nativeId) {
  const native = document.getElementById(nativeId);
  if (!native) return;

  native.style.display = 'none';

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select-wrapper';
  if (native.classList.contains('filter-select')) wrapper.classList.add('filter-custom-select');
  native.parentNode.insertBefore(wrapper, native);
  wrapper.appendChild(native);

  const trigger = document.createElement('div');
  trigger.className = 'custom-select-trigger form-input';
  trigger.tabIndex = 0;
  wrapper.appendChild(trigger);

  const dropdown = document.createElement('div');
  dropdown.className = 'custom-select-dropdown';
  wrapper.appendChild(dropdown);

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    closeAllCustomSelects();
    if (!isOpen) {
      dropdown.classList.add('open');
      trigger.classList.add('open');
    }
  });

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger.click(); }
    if (e.key === 'Escape') closeAllCustomSelects();
  });
}

function closeAllCustomSelects() {
  document.querySelectorAll('.custom-select-dropdown.open').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.custom-select-trigger.open').forEach(t => t.classList.remove('open'));
}

function syncCustomSelect(nativeId) {
  const native = document.getElementById(nativeId);
  if (!native) return;
  const wrapper = native.closest('.custom-select-wrapper');
  if (!wrapper) return;
  const trigger = wrapper.querySelector('.custom-select-trigger');
  const dropdown = wrapper.querySelector('.custom-select-dropdown');
  if (!trigger || !dropdown) return;

  // Rebuild options
  dropdown.innerHTML = '';
  Array.from(native.options).forEach(opt => {
    const item = document.createElement('div');
    item.className = 'custom-select-option' + (opt.value === native.value ? ' selected' : '');
    item.textContent = opt.textContent;
    item.dataset.value = opt.value;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      native.value = opt.value;
      native.dispatchEvent(new Event('change'));
      syncCustomSelect(nativeId);
      closeAllCustomSelects();
    });
    dropdown.appendChild(item);
  });

  // Update trigger label
  const selectedOpt = native.options[native.selectedIndex];
  trigger.innerHTML = '';
  const label = document.createElement('span');
  label.textContent = selectedOpt ? selectedOpt.textContent : '';
  trigger.appendChild(label);
  const chevron = document.createElement('span');
  chevron.className = 'custom-select-chevron';
  chevron.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
  trigger.appendChild(chevron);
}

// ===========================
// Event listeners
// ===========================

function initEventListeners() {
  // Sidebar new project buttons
  document.getElementById('btn-new-project').addEventListener('click', openNewProjectModal);
  document.getElementById('btn-new-project-empty').addEventListener('click', openNewProjectModal);

  // Save project
  document.getElementById('btn-save-project').addEventListener('click', saveProject);
  document.getElementById('project-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveProject();
  });

  // Project view actions
  document.getElementById('btn-new-task').addEventListener('click', () => openTaskModal(null));
  document.getElementById('btn-manage-filters').addEventListener('click', openManageFiltersModal);
  document.getElementById('mf-btn-save').addEventListener('click', _mfDoSave);
  document.getElementById('mf-btn-delete').addEventListener('click', _mfDoDelete);
  document.getElementById('mf-btn-edit').addEventListener('click', _mfDoEdit);
  document.getElementById('saved-filter-select').addEventListener('change', e => {
    if (!activeProjectId) return;
    if (!e.target.value) { _mfClearActiveFilter(); return; }
    const f = _mfGetList(activeProjectId).find(x => x.id === e.target.value);
    if (f) _mfApplyFilter(f);
  });
  document.getElementById('btn-project-settings').addEventListener('click', openSettingsModal);
  document.getElementById('btn-save-project-details').addEventListener('click', saveProjectDetails);
  document.getElementById('settings-project-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveProjectDetails(); });

  // Save task
  document.getElementById('btn-save-task').addEventListener('click', saveTask);
  document.getElementById('btn-delete-task').addEventListener('click', () => deleteTask(editingTaskId));
  document.getElementById('btn-mark-task-progress').addEventListener('click', markCurrentTaskInProgress);
  document.getElementById('btn-mark-task-done').addEventListener('click', markCurrentTaskDone);
  document.getElementById('btn-prev-task').addEventListener('click', () => navigateTask(-1));
  document.getElementById('btn-next-task').addEventListener('click', () => navigateTask(1));
  // Detail modal navigation
  document.getElementById('btn-prev-task-detail').addEventListener('click', () => navigateTaskDetail(-1));
  document.getElementById('btn-next-task-detail').addEventListener('click', () => navigateTaskDetail(1));
  // Detail modal action buttons
  document.getElementById('btn-delete-task-detail').addEventListener('click', () => {
    if (!detailTaskId) return;
    deleteTask(detailTaskId);
    hideModal('modal-task-detail');
  });
  document.getElementById('btn-mark-task-progress-detail').addEventListener('click', () => {
    if (!detailTaskId) return;
    if (_detailDirty) _flushDetailDraft();
    const task = getTask(detailTaskId);
    if (task) { applyStatusChange(task, 'In Progress'); saveState(); renderProjectView(); openTaskDetailModal(detailTaskId); }
  });
  document.getElementById('btn-mark-task-done-detail').addEventListener('click', () => {
    if (!detailTaskId) return;
    if (_detailDirty) _flushDetailDraft();
    const task = getTask(detailTaskId);
    if (task) { applyStatusChange(task, 'Completed'); saveState(); renderProjectView(); openTaskDetailModal(detailTaskId); }
  });

  // Status/comment controls
  document.getElementById('task-status').addEventListener('change', updateTaskModalStatusButtons);
  document.getElementById('btn-add-comment').addEventListener('click', addOrUpdateComment);

  // Tag input: Enter or comma adds a tag
  document.getElementById('tag-text-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.target.value;
      if (val.trim()) { addModalTag(val); e.target.value = ''; }
    } else if (e.key === 'Backspace' && !e.target.value && _modalTags.length) {
      _modalTags.pop();
      renderModalTagPills();
    }
  });
  document.getElementById('tag-text-input').addEventListener('blur', e => {
    if (e.target.value.trim()) { addModalTag(e.target.value); e.target.value = ''; }
  });
  // Remove tag via pill × button (delegated)
  document.getElementById('tag-input-area').addEventListener('click', e => {
    const btn = e.target.closest('.tag-pill-remove');
    if (!btn) return;
    const idx = parseInt(btn.dataset.tagIdx, 10);
    if (!isNaN(idx)) { _modalTags.splice(idx, 1); renderModalTagPills(); }
  });
  // Click anywhere in tag area focuses input
  document.getElementById('tag-input-area').addEventListener('click', e => {
    if (!e.target.closest('.tag-pill-remove')) document.getElementById('tag-text-input').focus();
  });
  document.getElementById('btn-cancel-comment-edit').addEventListener('click', resetCommentEditor);
  document.querySelectorAll('.btn-editor').forEach(btn => {
    btn.addEventListener('click', () => runCommentCommand(btn.dataset.command));
  });

  // Delete project
  document.getElementById('btn-delete-project').addEventListener('click', () => deleteProject(activeProjectId));

  // Settings users/categories
  document.getElementById('btn-add-user').addEventListener('click', addUser);
  document.getElementById('new-user-input').addEventListener('keydown', e => { if (e.key === 'Enter') addUser(); });
  document.getElementById('btn-add-category').addEventListener('click', addCategory);
  document.getElementById('new-category-input').addEventListener('keydown', e => { if (e.key === 'Enter') addCategory(); });

  // Settings tabs
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.settings-panel').forEach(p => p.style.display = 'none');
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).style.display = '';
    });
  });

  // Modal close buttons (data-modal attribute)
  document.querySelectorAll('[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => hideModal(btn.dataset.modal));
  });

  // Close custom selects on outside click
  document.addEventListener('click', closeAllCustomSelects);

  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) hideModal(overlay.id);
    });
  });

  // Close modal on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(overlay => {
        if (overlay.style.display !== 'none') hideModal(overlay.id);
      });
    }
  });

  // Sortable column headers
  document.querySelectorAll('.th-sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sort.col === col) {
        sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sort.col = col;
        sort.dir = 'asc';
      }
      renderTaskTable(getProject(activeProjectId), state.tasks.filter(t => t.projectId === activeProjectId));
    });
  });

  // Filters
  document.getElementById('global-search').addEventListener('input', e => {
    filters.search = e.target.value;
    renderTaskTable(getProject(activeProjectId), state.tasks.filter(t => t.projectId === activeProjectId));
  });

  document.getElementById('filter-status').addEventListener('change', e => {
    filters.status = e.target.value;
    renderTaskTable(getProject(activeProjectId), state.tasks.filter(t => t.projectId === activeProjectId));
  });

  document.getElementById('filter-priority').addEventListener('change', e => {
    filters.priority = e.target.value;
    renderTaskTable(getProject(activeProjectId), state.tasks.filter(t => t.projectId === activeProjectId));
  });

  document.getElementById('filter-category').addEventListener('change', e => {
    filters.category = e.target.value;
    renderTaskTable(getProject(activeProjectId), state.tasks.filter(t => t.projectId === activeProjectId));
  });

  document.getElementById('filter-responsible').addEventListener('change', e => {
    filters.responsible = e.target.value;
    renderTaskTable(getProject(activeProjectId), state.tasks.filter(t => t.projectId === activeProjectId));
  });

  // btn-clear-filters removed from UI; clearing handled via active-filter dropdown
}

// ===========================
// Manage Filters
// ===========================

const MF_STORAGE_KEY = 'todokit-filters-v2';

let _mfSelectedId        = null;  // id of row selected in modal list
let _mfEditingId         = null;  // id of filter loaded into builder for editing
let _mfActiveId          = null;  // id of currently applied filter
let _mfAppliedMultiFilters = null; // { status:[], priority:[], category:[], responsible:[] }

// ── Multi-select builder ────────────────────────────────────────────────────

const MF_MULTI_CONFIGS = {
  'mf-multi-status':      { label: 'Status',      opts: ['To Do','In Progress','To Test','Completed','Cancelled'] },
  'mf-multi-priority':    { label: 'Priority',     opts: ['Urgent','High','Med','Low'] },
  'mf-multi-category':    { label: 'Category',     opts: [] },   // dynamic
  'mf-multi-responsible': { label: 'Responsible',  opts: [] },   // dynamic
};

function _mfBuildMultiSelect(containerId, opts, selected = []) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const cfg = MF_MULTI_CONFIGS[containerId];
  const label = cfg ? cfg.label : 'Select';

  // Destroy existing
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select-wrapper mf-multi-wrapper';
  container.appendChild(wrapper);

  // Hidden data store (array of selected values)
  wrapper._selectedValues = [...selected];

  // Trigger (matches .custom-select-trigger.form-input)
  const trigger = document.createElement('div');
  trigger.className = 'custom-select-trigger form-input';
  trigger.tabIndex = 0;
  wrapper.appendChild(trigger);

  // Dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'custom-select-dropdown mf-multi-dropdown';
  wrapper.appendChild(dropdown);

  const refresh = () => {
    // Rebuild dropdown options
    dropdown.innerHTML = '';
    opts.forEach(opt => {
      const isChecked = wrapper._selectedValues.includes(opt);
      const item = document.createElement('div');
      item.className = 'custom-select-option mf-multi-option' + (isChecked ? ' selected' : '');
      item.innerHTML = `<span class="mf-check-icon">${isChecked ? '✓' : ''}</span>${escapeHtml(opt)}`;
      item.addEventListener('click', e => {
        e.stopPropagation();
        if (wrapper._selectedValues.includes(opt)) {
          wrapper._selectedValues = wrapper._selectedValues.filter(v => v !== opt);
        } else {
          wrapper._selectedValues.push(opt);
        }
        refresh();
      });
      dropdown.appendChild(item);
    });

    // Update trigger label
    const vals = wrapper._selectedValues;
    trigger.innerHTML = '';
    const lbl = document.createElement('span');
    lbl.textContent = vals.length === 0 ? `Any ${label}` : vals.join(', ');
    lbl.style.overflow = 'hidden';
    lbl.style.textOverflow = 'ellipsis';
    lbl.style.whiteSpace = 'nowrap';
    trigger.appendChild(lbl);
    const chevron = document.createElement('span');
    chevron.className = 'custom-select-chevron';
    chevron.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
    trigger.appendChild(chevron);
  };

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    closeAllCustomSelects();
    if (!isOpen) { dropdown.classList.add('open'); trigger.classList.add('open'); }
  });
  trigger.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger.click(); }
    if (e.key === 'Escape') closeAllCustomSelects();
  });

  refresh();
}

function _mfGetMultiValues(containerId) {
  const wrapper = document.querySelector(`#${containerId} .mf-multi-wrapper`);
  return wrapper?._selectedValues ? [...wrapper._selectedValues] : [];
}

function _mfSetMultiValues(containerId, values) {
  const wrapper = document.querySelector(`#${containerId} .mf-multi-wrapper`);
  if (!wrapper) return;
  wrapper._selectedValues = Array.isArray(values) ? [...values] : [];
  // Re-render by rebuilding the dropdown items
  const dropdown = wrapper.querySelector('.custom-select-dropdown');
  if (!dropdown) return;
  dropdown.querySelectorAll('.mf-multi-option').forEach(item => {
    const text = item.textContent.trim();
    const isChecked = wrapper._selectedValues.includes(text);
    item.classList.toggle('selected', isChecked);
    const icon = item.querySelector('.mf-check-icon');
    if (icon) icon.textContent = isChecked ? '✓' : '';
  });
  // Update trigger
  const trigger = wrapper.querySelector('.custom-select-trigger');
  if (trigger) {
    const lbl = trigger.querySelector('span:first-child');
    if (lbl) lbl.textContent = wrapper._selectedValues.length === 0
      ? `Any ${MF_MULTI_CONFIGS[containerId]?.label || 'value'}`
      : wrapper._selectedValues.join(', ');
  }
}

// ── Storage helpers ──────────────────────────────────────────────────────────

function _mfLoad() {
  try { return JSON.parse(localStorage.getItem(MF_STORAGE_KEY) || '{}'); } catch { return {}; }
}
function _mfSave(data) { localStorage.setItem(MF_STORAGE_KEY, JSON.stringify(data)); }
function _mfGetList(projectId) { return _mfLoad()[projectId] || []; }
function _mfSetList(projectId, list) { const all = _mfLoad(); all[projectId] = list; _mfSave(all); }

// ── Summary text for saved filter ────────────────────────────────────────────

function _mfSummary(f) {
  const parts = [];
  const fv = f.filters || {};
  const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
  if (arr(fv.status).length)      parts.push(arr(fv.status).join('/'));
  if (arr(fv.priority).length)    parts.push(arr(fv.priority).join('/'));
  if (arr(fv.category).length)    parts.push(arr(fv.category).join('/'));
  if (arr(fv.responsible).length) parts.push(arr(fv.responsible).join('/'));
  const sortLabels = { priority:'Priority', status:'Status', title:'Title', responsible:'Responsible', plannedStart:'Date', category:'Category', executionOrder:'ID' };
  const sortParts  = (f.sorts || []).filter(s => s.col).map(s => `${sortLabels[s.col]||s.col} ${s.dir==='desc'?'↓':'↑'}`);
  if (sortParts.length) parts.push(`Sort: ${sortParts.join(' › ')}`);
  return parts.length ? parts.join(' · ') : 'No criteria';
}

// ── Render saved-filter list in modal ─────────────────────────────────────────

function _mfRenderList() {
  const list = activeProjectId ? _mfGetList(activeProjectId) : [];
  const el = document.getElementById('mf-saved-list');
  if (!el) return;

  el.innerHTML = list.length === 0
    ? '<div class="mf-empty">No saved filters yet — create one below.</div>'
    : list.map(f => {
        const isActive   = f.id === _mfActiveId;
        const isSelected = f.id === _mfSelectedId;
        const activePill  = isActive   ? `<span class="mf-active-pill">Active</span>` : '';
        const defaultPill = f.isDefault ? `<span class="mf-default-pill">★ Default</span>` : '';
        const pill = activePill + defaultPill;
        return `
          <div class="mf-saved-item ${isSelected ? 'mf-selected' : ''}" data-mf-row="${f.id}" title="Click to edit · Double-click to apply">
            <div class="mf-saved-item-name">${escapeHtml(f.name)}${pill}</div>
            <div class="mf-saved-item-meta">${escapeHtml(_mfSummary(f))}</div>
          </div>`;
      }).join('');

  el.querySelectorAll('[data-mf-row]').forEach(row => {
    row.addEventListener('click',    () => _mfSelectRow(row.dataset.mfRow));
    row.addEventListener('dblclick', () => {
      const f = _mfGetList(activeProjectId).find(x => x.id === row.dataset.mfRow);
      if (f) { _mfApplyFilter(f); }
    });
  });

  _mfSyncFooterButtons();
}

function _mfSelectRow(id) {
  _mfSelectedId = id;
  _mfRenderList();
  // Immediately load into builder — no separate Edit click needed
  const f = _mfGetList(activeProjectId).find(x => x.id === id);
  if (f) _mfLoadIntoBuilder(f);
}

function _mfSyncFooterButtons() {
  const has = !!_mfSelectedId;
  const del  = document.getElementById('mf-btn-delete');
  const edit = document.getElementById('mf-btn-edit');
  if (del)  { del.disabled  = !has; del.title  = has ? '' : 'Select a filter first'; }
  if (edit) { edit.disabled = !has; edit.title = has ? '' : 'Select a filter first'; }
  const save = document.getElementById('mf-btn-save');
  if (save) save.textContent = _mfEditingId ? 'Update Filter' : 'Save Filter';
}

// ── Build/refresh the project-specific dynamic multi-selects ─────────────────

function _mfPopulateBuilderDropdowns(categoryValues, responsibleValues) {
  _mfBuildMultiSelect('mf-multi-status',
    MF_MULTI_CONFIGS['mf-multi-status'].opts);
  _mfBuildMultiSelect('mf-multi-priority',
    MF_MULTI_CONFIGS['mf-multi-priority'].opts);
  _mfBuildMultiSelect('mf-multi-category', categoryValues || []);
  _mfBuildMultiSelect('mf-multi-responsible', responsibleValues || []);
}

// ── Load filter into builder ──────────────────────────────────────────────────

function _mfLoadIntoBuilder(f) {
  _mfEditingId = f.id;
  document.getElementById('mf-builder-label').textContent = `Edit: ${f.name}`;
  document.getElementById('mf-filter-name').value = f.name || '';
  const defCb = document.getElementById('mf-is-default');
  if (defCb) defCb.checked = !!f.isDefault;

  const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
  _mfSetMultiValues('mf-multi-status',      arr(f.filters?.status));
  _mfSetMultiValues('mf-multi-priority',    arr(f.filters?.priority));
  _mfSetMultiValues('mf-multi-category',    arr(f.filters?.category));
  _mfSetMultiValues('mf-multi-responsible', arr(f.filters?.responsible));

  const sorts = f.sorts || [];
  for (let i = 0; i < 3; i++) {
    const col = document.getElementById(`mf-sort-col-${i}`);
    const dir = document.getElementById(`mf-sort-dir-${i}`);
    if (col) { col.value = sorts[i]?.col || ''; syncCustomSelect(`mf-sort-col-${i}`); }
    if (dir) { dir.value = sorts[i]?.dir || 'asc'; syncCustomSelect(`mf-sort-dir-${i}`); }
  }
  _mfSyncFooterButtons();
}

// ── Reset builder to "New Filter" ─────────────────────────────────────────────

function _mfResetBuilder() {
  _mfEditingId  = null;
  _mfSelectedId = null;
  const lbl = document.getElementById('mf-builder-label');
  if (lbl) lbl.textContent = 'New Filter';
  const nameEl = document.getElementById('mf-filter-name');
  if (nameEl) nameEl.value = '';
  const defCb = document.getElementById('mf-is-default');
  if (defCb) defCb.checked = false;

  ['mf-multi-status','mf-multi-priority','mf-multi-category','mf-multi-responsible'].forEach(id => _mfSetMultiValues(id, []));

  for (let i = 0; i < 3; i++) {
    const col = document.getElementById(`mf-sort-col-${i}`);
    const dir = document.getElementById(`mf-sort-dir-${i}`);
    if (col) { col.value = ''; syncCustomSelect(`mf-sort-col-${i}`); }
    if (dir) { dir.value = 'asc'; syncCustomSelect(`mf-sort-dir-${i}`); }
  }
  _mfRenderList();
}

// ── Save / Update filter ──────────────────────────────────────────────────────

function _mfDoSave() {
  if (!activeProjectId) return;
  const name = (document.getElementById('mf-filter-name')?.value || '').trim();
  if (!name) { document.getElementById('mf-filter-name')?.focus(); return; }

  const filterData = {
    status:      _mfGetMultiValues('mf-multi-status'),
    priority:    _mfGetMultiValues('mf-multi-priority'),
    category:    _mfGetMultiValues('mf-multi-category'),
    responsible: _mfGetMultiValues('mf-multi-responsible'),
    search: '',
  };

  const sorts = [];
  for (let i = 0; i < 3; i++) {
    const col = document.getElementById(`mf-sort-col-${i}`)?.value || '';
    const dir = document.getElementById(`mf-sort-dir-${i}`)?.value || 'asc';
    if (col) sorts.push({ col, dir });
  }

  const isDefault = !!(document.getElementById('mf-is-default')?.checked);
  const list = _mfGetList(activeProjectId);

  // Enforce only-one-default: clear others if this one is default
  if (isDefault) list.forEach(f => { f.isDefault = false; });

  if (_mfEditingId) {
    const idx = list.findIndex(x => x.id === _mfEditingId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], name, filters: filterData, sorts, isDefault };
      if (_mfActiveId === _mfEditingId) _mfApplyFilter(list[idx]);
    }
  } else {
    list.push({ id: `mf-${Date.now()}`, name, filters: filterData, sorts, isDefault });
  }
  _mfSetList(activeProjectId, list);
  _mfResetBuilder();
  _mfUpdateDropdown();
}

// ── Delete selected filter ────────────────────────────────────────────────────

function _mfDoDelete() {
  if (!_mfSelectedId || !activeProjectId) return;
  const list = _mfGetList(activeProjectId);
  const f = list.find(x => x.id === _mfSelectedId);
  if (!f || !confirm(`Delete filter "${f.name}"?`)) return;

  _mfSetList(activeProjectId, list.filter(x => x.id !== _mfSelectedId));
  if (_mfActiveId === _mfSelectedId) { _mfActiveId = null; _mfAppliedMultiFilters = null; }
  if (_mfEditingId === _mfSelectedId) _mfEditingId = null;
  _mfSelectedId = null;
  _mfRenderList();
  _mfUpdateDropdown();
  renderTaskTable(getProject(activeProjectId), state.tasks.filter(t => t.projectId === activeProjectId));
}

// ── Edit selected filter ──────────────────────────────────────────────────────

function _mfDoEdit() {
  if (!_mfSelectedId || !activeProjectId) return;
  const f = _mfGetList(activeProjectId).find(x => x.id === _mfSelectedId);
  if (f) _mfLoadIntoBuilder(f);
}

// ── Apply filter ──────────────────────────────────────────────────────────────

function _mfApplyFilter(f) {
  _mfActiveId = f.id;
  const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
  _mfAppliedMultiFilters = {
    status:      arr(f.filters?.status),
    priority:    arr(f.filters?.priority),
    category:    arr(f.filters?.category),
    responsible: arr(f.filters?.responsible),
  };
  filters.search = f.filters?.search || '';

  // Apply all sort columns (multi-sort support)
  const allSorts = (f.sorts || []).filter(s => s.col);
  sort.cols = allSorts;
  const firstSort = allSorts[0];
  if (firstSort) { sort.col = firstSort.col; sort.dir = firstSort.dir; }
  else           { sort.col = null; sort.dir = 'asc'; }

  // Sync main dropdowns to first value (for visual feedback)
  const first = arr => arr.length ? arr[0] : '';
  const syncSel = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  syncSel('filter-status',      first(_mfAppliedMultiFilters.status));
  syncSel('filter-priority',    first(_mfAppliedMultiFilters.priority));
  syncSel('filter-category',    first(_mfAppliedMultiFilters.category));
  syncSel('filter-responsible', first(_mfAppliedMultiFilters.responsible));
  syncSel('global-search',      filters.search);
  FILTER_SELECTS.forEach(syncCustomSelect);

  _mfUpdateDropdown();
  renderTaskTable(getProject(activeProjectId), state.tasks.filter(t => t.projectId === activeProjectId));
}

// ── Clear active filter ───────────────────────────────────────────────────────

function _mfClearActiveFilter() {
  _mfActiveId = null;
  _mfAppliedMultiFilters = null;
  filters.status = filters.priority = filters.category = filters.responsible = filters.search = '';
  sort.col = null; sort.dir = 'asc'; sort.cols = [];
  ['filter-status','filter-priority','filter-category','filter-responsible','global-search'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  FILTER_SELECTS.forEach(syncCustomSelect);
  _mfUpdateDropdown();
  renderTaskTable(getProject(activeProjectId), state.tasks.filter(t => t.projectId === activeProjectId));
}

// ── Apply-filter dropdown on project page ─────────────────────────────────────

function _mfUpdateDropdown() {
  const list = activeProjectId ? _mfGetList(activeProjectId) : [];
  const wrap = document.getElementById('saved-filter-wrap');
  const sel  = document.getElementById('saved-filter-select');
  if (!sel || !wrap) return;

  if (list.length === 0) { wrap.style.display = 'none'; syncCustomSelect('saved-filter-select'); return; }
  wrap.style.display = '';
  const noneSelected = !_mfActiveId || !list.find(f => f.id === _mfActiveId);
  sel.innerHTML =
    `<option value="" ${noneSelected?'selected':''}>— No Active Filter —</option>` +
    list.map(f => {
      const star = f.isDefault ? ' ★' : '';
      return `<option value="${escapeHtml(f.id)}" ${f.id===_mfActiveId?'selected':''}>${escapeHtml(f.name)}${star}</option>`;
    }).join('');
  syncCustomSelect('saved-filter-select');
}

// ── Open modal ───────────────────────────────────────────────────────────────

function openManageFiltersModal() {
  _mfSelectedId = null;
  _mfEditingId  = null;
  const lbl = document.getElementById('mf-builder-label');
  if (lbl) lbl.textContent = 'New Filter';
  const nameEl = document.getElementById('mf-filter-name');
  if (nameEl) nameEl.value = '';

  // Build/refresh multi-selects with current project data
  const project = getProject(activeProjectId);
  const cats  = project ? getProjectCategories(project) : [];
  const users = project?.users || [];
  _mfPopulateBuilderDropdowns(cats, users);

  // Reset sort selects
  for (let i = 0; i < 3; i++) {
    const col = document.getElementById(`mf-sort-col-${i}`);
    const dir = document.getElementById(`mf-sort-dir-${i}`);
    if (col) { col.value = ''; syncCustomSelect(`mf-sort-col-${i}`); }
    if (dir) { dir.value = 'asc'; syncCustomSelect(`mf-sort-dir-${i}`); }
  }

  _mfRenderList();
  showModal('modal-manage-filters');
}

// ===========================
// Init
// ===========================

async function init() {
  initTheme();
  await loadState();
  initEventListeners();
  CUSTOM_SELECTS.forEach(buildCustomSelect);
  renderSidebar();
  renderProjectView();
}

function initTheme() {
  const saved = localStorage.getItem('todokit-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('todokit-theme', next);
      renderProjectView();
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
