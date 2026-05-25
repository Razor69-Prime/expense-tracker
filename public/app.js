// ═══════════════════════════════════════════════════════
//  DAILY EXPENSE — Full Supabase Mode + History Log
//  Semua data baca/tulis langsung ke Supabase
//  localStorage hanya untuk: config supabase + settings
// ═══════════════════════════════════════════════════════

// ─── SUPABASE CONFIG ─────────────────────────────────
// Ganti dengan URL dan key kamu:
const SB_URL = 'https://pfxfgfzhivcisgpayvyx.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmeGZnZnpoaXZjaXNncGF5dnl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NzMzOTAsImV4cCI6MjA5NTI0OTM5MH0.1ZPIR5_fPSzJRxK22VKha_IsReiWqlEoXEFH1kqUzrk';

// ─── RUNTIME STATE ───────────────────────────────────
let CFG = loadConfig();   // settings (kategori, label, PIC, supabase)
let expenses  = [];       // data dari Supabase
let logs      = [];       // history log dari Supabase
let selectedLabels = [];
let deferredInstallPrompt = null;
let filterCat = '';
let filterPIC = '';
let filterMonth = nowMonth();
let isLoading = false;

// ─── CONFIG (localStorage) ───────────────────────────
const CFG_KEY = 'expense_cfg_v2';

const DEFAULT_CFG = {
  categories: [
    { id: 'c1', name: 'Operasional',   color: '#38bdf8' },
    { id: 'c2', name: 'Marketing',     color: '#34d399' },
    { id: 'c3', name: 'SDM',           color: '#f87171' },
    { id: 'c4', name: 'Transportasi',  color: '#fbbf24' },
    { id: 'c5', name: 'Lain-lain',     color: '#94a3b8' },
  ],
  labels: [
    { id: 'l1', name: 'Rutin',      color: '#38bdf8' },
    { id: 'l2', name: 'Prioritas',  color: '#f87171' },
    { id: 'l3', name: 'Ad-hoc',     color: '#fbbf24' },
    { id: 'l4', name: 'Reimburse',  color: '#34d399' },
  ],
  pics: ['Budi', 'Sari', 'Andi', 'Dewi'],
  supabase: { url: SB_URL, key: SB_KEY },
};

function loadConfig() {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) return { ...DEFAULT_CFG, ...JSON.parse(raw) };
  } catch (_) {}
  return { ...DEFAULT_CFG };
}
function saveConfig() {
  localStorage.setItem(CFG_KEY, JSON.stringify(CFG));
}

// ─── UTILS ───────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function fmt(n)      { return 'Rp ' + Number(n).toLocaleString('id-ID'); }
function fmtShort(n) {
  if (n >= 1_000_000) return 'Rp ' + (n/1_000_000).toFixed(1) + 'jt';
  if (n >= 1_000)     return 'Rp ' + (n/1_000).toFixed(0) + 'rb';
  return 'Rp ' + n;
}
function nowMonth()  { return new Date().toISOString().slice(0,7); }
function tsNow()     { return new Date().toISOString(); }
function getCat(id)  { return CFG.categories.find(c => c.id === id); }
function getLabel(id){ return CFG.labels.find(l => l.id === id); }

function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = type==='error' ? 'var(--danger)' : type==='success' ? 'var(--success)' : 'var(--text)';
  t.style.color = (type==='error'||type==='success') ? '#0f172a' : 'var(--bg)';
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

function setLoading(on, msg = 'Memuat...') {
  isLoading = on;
  const el = document.getElementById('loading-overlay');
  if (el) { el.style.display = on ? 'flex' : 'none'; el.querySelector('span').textContent = msg; }
}

function avatarEl(name, color) {
  const i = (name||'?').slice(0,2).toUpperCase();
  return `<div class="exp-avatar" style="background:${color}22;color:${color}">${i}</div>`;
}

// ─── SUPABASE API HELPERS ────────────────────────────
function sbHeaders(extra = {}) {
  const url = CFG.supabase?.url || SB_URL;
  const key = CFG.supabase?.key || SB_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}
function sbUrl(path) { return (CFG.supabase?.url || SB_URL) + path; }

async function sbGet(path) {
  const res = await fetch(sbUrl(path), { headers: sbHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbPost(path, body, prefer = '') {
  const res = await fetch(sbUrl(path), {
    method: 'POST',
    headers: sbHeaders(prefer ? { Prefer: prefer } : {}),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res;
}

async function sbPatch(path, body) {
  const res = await fetch(sbUrl(path), {
    method: 'PATCH',
    headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res;
}

async function sbDelete(path) {
  const res = await fetch(sbUrl(path), {
    method: 'DELETE',
    headers: sbHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res;
}

// ─── HISTORY LOG ─────────────────────────────────────
async function writeLog(action, data = {}) {
  try {
    await sbPost('/rest/v1/activity_logs', {
      id: uid(),
      action,
      data,
      created_at: tsNow(),
    });
  } catch (e) {
    console.warn('Log error:', e.message);
  }
}

async function fetchLogs() {
  try {
    logs = await sbGet('/rest/v1/activity_logs?order=created_at.desc&limit=100');
  } catch (e) {
    logs = [];
    console.warn('Fetch logs error:', e.message);
  }
}

// ─── NAVIGATION ──────────────────────────────────────
function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  btn.classList.add('active');
  if (id === 'dashboard') renderDashboard();
  if (id === 'add')       initAddForm();
  if (id === 'list')      renderList();
  if (id === 'log')       renderLog();
  if (id === 'settings')  renderSettings();
}

// ─── LOAD DATA FROM SUPABASE ─────────────────────────
async function loadExpenses() {
  setLoading(true, 'Mengambil data...');
  try {
    expenses = await sbGet('/rest/v1/expenses?order=date.desc,created_at.desc');
    setSyncStatus('ok');
  } catch (e) {
    setSyncStatus('error');
    toast('Gagal mengambil data: ' + e.message, 'error');
    expenses = [];
  } finally {
    setLoading(false);
  }
}

// ─── DASHBOARD ───────────────────────────────────────
function renderDashboard() {
  const month = nowMonth();
  const prev  = new Date(); prev.setMonth(prev.getMonth()-1);
  const prevM = prev.toISOString().slice(0,7);

  const thisM  = expenses.filter(e => e.date.startsWith(month));
  const prevME = expenses.filter(e => e.date.startsWith(prevM));

  const total     = thisM.reduce((a,b) => a + Number(b.amount), 0);
  const prevTotal = prevME.reduce((a,b) => a + Number(b.amount), 0);
  const avg       = thisM.length ? Math.round(total/thisM.length) : 0;
  const diff      = prevTotal ? ((total-prevTotal)/prevTotal*100).toFixed(0) : null;
  const diffClass = diff > 0 ? 'up' : 'down';
  const diffText  = diff !== null ? (diff>0?'▲':'▼')+Math.abs(diff)+'% vs bln lalu' : '—';

  document.getElementById('metrics').innerHTML = `
    <div class="metric">
      <div class="metric-label">Total bulan ini</div>
      <div class="metric-value small">${fmtShort(total)}</div>
      <div class="metric-change ${diffClass}">${diffText}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Transaksi</div>
      <div class="metric-value">${thisM.length}</div>
      <div class="metric-change" style="color:var(--text3)">${prevME.length} bln lalu</div>
    </div>
    <div class="metric">
      <div class="metric-label">Rata-rata</div>
      <div class="metric-value small">${fmtShort(avg)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Bln lalu</div>
      <div class="metric-value small">${fmtShort(prevTotal)}</div>
    </div>`;

  // Chart per kategori
  const catMap = {};
  thisM.forEach(e => { catMap[e.category_id] = (catMap[e.category_id]||0) + Number(e.amount); });
  const maxCat = Math.max(...Object.values(catMap), 1);
  document.getElementById('chart-cat').innerHTML = Object.entries(catMap)
    .sort((a,b) => b[1]-a[1])
    .map(([cid, amt]) => {
      const c = getCat(cid); if (!c) return '';
      const pct = Math.round(amt/maxCat*100);
      return `<div class="bar-row">
        <div class="bar-name">${c.name}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%;background:${c.color}">
            <span class="bar-val">${fmtShort(amt)}</span>
          </div>
        </div>
      </div>`;
    }).join('') || '<div class="empty"><div class="empty-text">Belum ada data</div></div>';

  // Chart per PIC
  const picMap = {};
  thisM.forEach(e => { picMap[e.pic] = (picMap[e.pic]||0) + Number(e.amount); });
  const picColors = ['#38bdf8','#34d399','#f87171','#fbbf24','#a78bfa','#fb923c'];
  const maxPic = Math.max(...Object.values(picMap), 1);
  document.getElementById('chart-pic').innerHTML = Object.entries(picMap)
    .sort((a,b) => b[1]-a[1])
    .map(([pic, amt], i) => {
      const pct = Math.round(amt/maxPic*100);
      const col = picColors[i % picColors.length];
      return `<div class="bar-row">
        <div class="bar-name">${pic}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%;background:${col}">
            <span class="bar-val">${fmtShort(amt)}</span>
          </div>
        </div>
      </div>`;
    }).join('') || '<div class="empty"><div class="empty-text">Belum ada data</div></div>';

  // Recent 6
  document.getElementById('recent').innerHTML =
    expenses.slice(0,6).map(expItemHTML).join('') ||
    '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">Belum ada pengeluaran</div></div>';
}

function expItemHTML(e, showDelete = false) {
  const c    = getCat(e.category_id) || { name:'?', color:'#64748b' };
  const lbls = (e.labels||[]).map(l => getLabel(l)).filter(Boolean);
  return `<div class="exp-item">
    ${avatarEl(e.pic, c.color)}
    <div class="exp-body">
      <div class="exp-title">${e.description}</div>
      <div class="exp-meta">
        <span style="color:${c.color}">${c.name}</span>
        <span>·</span><span>${e.pic}</span>
        ${lbls.map(l=>`<span class="badge" style="background:${l.color}22;color:${l.color}">${l.name}</span>`).join('')}
        ${e.note ? `<span style="font-style:italic">· ${e.note}</span>` : ''}
      </div>
    </div>
    <div class="exp-right">
      <div class="exp-amount">${fmt(e.amount)}</div>
      <div class="exp-date">${e.date}</div>
      ${showDelete ? `<button class="btn-danger-ghost" style="margin-top:4px" onclick="deleteExpense('${e.id}','${e.description.replace(/'/g,"\\'")}')">Hapus</button>` : ''}
    </div>
  </div>`;
}

// ─── ADD FORM ────────────────────────────────────────
function initAddForm() {
  document.getElementById('f-cat').innerHTML = CFG.categories.map(c =>
    `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('f-pic').innerHTML = CFG.pics.map(p =>
    `<option>${p}</option>`).join('');
  document.getElementById('f-date').value = new Date().toISOString().slice(0,10);
  selectedLabels = [];
  renderLabelTags();
}

function renderLabelTags() {
  document.getElementById('f-labels').innerHTML = CFG.labels.map(l => {
    const on = selectedLabels.includes(l.id);
    return `<button class="tag${on?' on':''}"
      style="${on?`background:${l.color};border-color:${l.color}`:`border-color:${l.color};color:${l.color}`}"
      onclick="toggleLabel('${l.id}')">${l.name}</button>`;
  }).join('');
}

function toggleLabel(id) {
  const i = selectedLabels.indexOf(id);
  if (i>=0) selectedLabels.splice(i,1); else selectedLabels.push(id);
  renderLabelTags();
}

async function saveExpense() {
  const date   = document.getElementById('f-date').value;
  const desc   = document.getElementById('f-desc').value.trim();
  const amount = parseFloat(document.getElementById('f-amount').value);
  const cat    = document.getElementById('f-cat').value;
  const pic    = document.getElementById('f-pic').value;
  const note   = document.getElementById('f-note').value.trim();

  if (!date || !desc || !amount || amount <= 0) {
    toast('Lengkapi tanggal, deskripsi, dan jumlah', 'error'); return;
  }
  if (!CFG.supabase?.url) { toast('Konfigurasi Supabase belum diisi', 'error'); return; }

  const btn = document.querySelector('#page-add .btn-primary');
  btn.disabled = true; btn.textContent = 'Menyimpan...';

  const payload = {
    id: uid(), date,
    description: desc,
    amount,
    category_id: cat,
    pic,
    labels: [...selectedLabels],
    note,
    created_at: tsNow(),
  };

  try {
    await sbPost('/rest/v1/expenses', payload, 'return=minimal');
    await writeLog('CREATE_EXPENSE', {
      description: desc, amount, category: getCat(cat)?.name, pic, date
    });

    // reset form
    document.getElementById('f-desc').value   = '';
    document.getElementById('f-amount').value = '';
    document.getElementById('f-note').value   = '';
    selectedLabels = [];
    renderLabelTags();

    // tambahkan ke state lokal
    expenses.unshift(payload);
    toast('Tersimpan ke database ✓', 'success');
  } catch (e) {
    toast('Gagal simpan: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Simpan pengeluaran';
  }
}

// ─── LIST ────────────────────────────────────────────
function renderList() {
  // Filter chips kategori
  const cats = [{ id:'', name:'Semua', color:'#94a3b8' }, ...CFG.categories];
  document.getElementById('filter-cats').innerHTML = cats.map(c =>
    `<button class="filter-chip${filterCat===c.id?' on':''}" onclick="setFilterCat('${c.id}')">${c.name}</button>`
  ).join('');

  // Filter chips PIC
  const pics = ['Semua', ...CFG.pics];
  document.getElementById('filter-pics').innerHTML = pics.map(p =>
    `<button class="filter-chip${filterPIC===(p==='Semua'?'':p)?' on':''}" onclick="setFilterPIC('${p==='Semua'?'':p}')">${p}</button>`
  ).join('');

  // Month select
  const months = [...new Set(expenses.map(e=>e.date.slice(0,7)))].sort().reverse();
  const mSel = document.getElementById('filter-month-sel');
  mSel.innerHTML = `<option value="">Semua bulan</option>` +
    months.map(m => `<option value="${m}"${filterMonth===m?' selected':''}>${m}</option>`).join('');

  let data = expenses.slice();
  if (filterCat)   data = data.filter(e => e.category_id === filterCat);
  if (filterPIC)   data = data.filter(e => e.pic === filterPIC);
  if (filterMonth) data = data.filter(e => e.date.startsWith(filterMonth));

  // Total filtered
  const total = data.reduce((a,b) => a+Number(b.amount), 0);
  document.getElementById('list-total').textContent = data.length
    ? `${data.length} transaksi · ${fmt(total)}` : '';

  document.getElementById('expense-list').innerHTML = data.length
    ? data.map(e => `<div class="card" style="padding:12px">${expItemHTML(e, true)}</div>`).join('')
    : '<div class="empty"><div class="empty-icon">🗂️</div><div class="empty-text">Tidak ada data</div></div>';
}

function setFilterCat(id) { filterCat = id; renderList(); }
function setFilterPIC(p)  { filterPIC = p;  renderList(); }
function setFilterMonth(v){ filterMonth = v; renderList(); }

async function deleteExpense(id, desc) {
  if (!confirm(`Hapus "${desc}"?\n\nTindakan ini tidak bisa dibatalkan.`)) return;
  try {
    await sbDelete(`/rest/v1/expenses?id=eq.${id}`);
    await writeLog('DELETE_EXPENSE', { id, description: desc });
    expenses = expenses.filter(e => e.id !== id);
    renderList();
    toast('Dihapus dari database');
  } catch (e) {
    toast('Gagal hapus: ' + e.message, 'error');
  }
}

// ─── HISTORY LOG ─────────────────────────────────────
async function renderLog() {
  document.getElementById('log-list').innerHTML =
    '<div class="empty"><div class="empty-text">Memuat log...</div></div>';
  await fetchLogs();

  const actionLabel = {
    'CREATE_EXPENSE': { icon:'➕', label:'Tambah', color:'var(--success)' },
    'DELETE_EXPENSE': { icon:'🗑️', label:'Hapus',  color:'var(--danger)'  },
    'ADD_CATEGORY':   { icon:'🏷️', label:'Kategori baru', color:'var(--accent)' },
    'DEL_CATEGORY':   { icon:'🏷️', label:'Hapus kategori', color:'var(--text3)' },
    'ADD_LABEL':      { icon:'🔖', label:'Label baru',  color:'var(--accent)' },
    'DEL_LABEL':      { icon:'🔖', label:'Hapus label', color:'var(--text3)' },
    'ADD_PIC':        { icon:'👤', label:'PIC baru',   color:'var(--accent)' },
    'DEL_PIC':        { icon:'👤', label:'Hapus PIC',  color:'var(--text3)' },
  };

  if (!logs.length) {
    document.getElementById('log-list').innerHTML =
      '<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">Belum ada aktivitas</div></div>';
    return;
  }

  document.getElementById('log-list').innerHTML = logs.map(log => {
    const info = actionLabel[log.action] || { icon:'📝', label: log.action, color:'var(--text2)' };
    const d    = log.data || {};
    const dt   = new Date(log.created_at);
    const dtStr = dt.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) +
                  ' · ' + dt.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    let detail = '';
    if (d.description) detail += d.description;
    if (d.amount)      detail += ` · ${fmt(d.amount)}`;
    if (d.pic)         detail += ` · ${d.pic}`;
    if (d.category)    detail += ` · ${d.category}`;
    if (d.name)        detail += d.name;

    return `<div class="log-item">
      <div class="log-icon" style="background:${info.color}22;color:${info.color}">${info.icon}</div>
      <div class="log-body">
        <div class="log-action" style="color:${info.color}">${info.label}</div>
        <div class="log-detail">${detail}</div>
        <div class="log-time">${dtStr}</div>
      </div>
    </div>`;
  }).join('');
}

// ─── SETTINGS ────────────────────────────────────────
function renderSettings() {
  document.getElementById('cat-settings').innerHTML = CFG.categories.map(c => `
    <div class="setting-row">
      <div class="setting-name"><span class="color-dot" style="background:${c.color}"></span>${c.name}</div>
      <button class="btn-danger-ghost" onclick="deleteCategory('${c.id}','${c.name}')">Hapus</button>
    </div>`).join('');

  document.getElementById('label-settings').innerHTML = CFG.labels.map(l => `
    <div class="setting-row">
      <div class="setting-name"><span class="color-dot" style="background:${l.color}"></span>${l.name}</div>
      <button class="btn-danger-ghost" onclick="deleteLabel('${l.id}','${l.name}')">Hapus</button>
    </div>`).join('');

  document.getElementById('pic-settings').innerHTML = CFG.pics.map(p => `
    <div class="setting-row">
      <div class="setting-name">👤 ${p}</div>
      <button class="btn-danger-ghost" onclick="deletePIC('${p}')">Hapus</button>
    </div>`).join('');

  document.getElementById('sb-url').value = CFG.supabase?.url || '';
  document.getElementById('sb-key').value = CFG.supabase?.key || '';
}

async function addCategory() {
  const name  = document.getElementById('new-cat').value.trim();
  const color = document.getElementById('new-cat-color').value;
  if (!name) return;
  CFG.categories.push({ id: uid(), name, color });
  document.getElementById('new-cat').value = '';
  saveConfig(); renderSettings();
  await writeLog('ADD_CATEGORY', { name, color });
  toast('Kategori ditambahkan');
}
async function deleteCategory(id, name) {
  CFG.categories = CFG.categories.filter(c => c.id !== id);
  saveConfig(); renderSettings();
  await writeLog('DEL_CATEGORY', { name });
  toast('Kategori dihapus');
}
async function addLabel() {
  const name  = document.getElementById('new-label').value.trim();
  const color = document.getElementById('new-label-color').value;
  if (!name) return;
  CFG.labels.push({ id: uid(), name, color });
  document.getElementById('new-label').value = '';
  saveConfig(); renderSettings();
  await writeLog('ADD_LABEL', { name, color });
  toast('Label ditambahkan');
}
async function deleteLabel(id, name) {
  CFG.labels = CFG.labels.filter(l => l.id !== id);
  saveConfig(); renderSettings();
  await writeLog('DEL_LABEL', { name });
  toast('Label dihapus');
}
async function addPIC() {
  const name = document.getElementById('new-pic').value.trim();
  if (!name || CFG.pics.includes(name)) return;
  CFG.pics.push(name);
  document.getElementById('new-pic').value = '';
  saveConfig(); renderSettings();
  await writeLog('ADD_PIC', { name });
  toast('PIC ditambahkan');
}
async function deletePIC(name) {
  CFG.pics = CFG.pics.filter(p => p !== name);
  saveConfig(); renderSettings();
  await writeLog('DEL_PIC', { name });
  toast('PIC dihapus');
}

function saveSupabaseConfig() {
  CFG.supabase = {
    url: document.getElementById('sb-url').value.trim(),
    key: document.getElementById('sb-key').value.trim(),
  };
  saveConfig();
  toast('Konfigurasi tersimpan — memuat ulang data...', 'success');
  setTimeout(() => initApp(), 800);
}

async function testSupabase() {
  if (!CFG.supabase?.url) { toast('Isi URL Supabase dulu', 'error'); return; }
  try {
    const res = await fetch(`${CFG.supabase.url}/rest/v1/expenses?limit=1`, {
      headers: { apikey: CFG.supabase.key, Authorization: `Bearer ${CFG.supabase.key}` }
    });
    toast(res.ok ? 'Koneksi berhasil ✓' : 'Cek anon key (status '+res.status+')',
          res.ok ? 'success' : 'error');
  } catch (e) {
    toast('Tidak bisa terhubung: ' + e.message, 'error');
  }
}

// ─── SYNC STATUS ─────────────────────────────────────
function setSyncStatus(status) {
  const dot = document.getElementById('sync-dot');
  const sub = document.getElementById('header-sub');
  dot.className = 'sync-dot' + (status==='error' ? ' error' : status==='loading' ? ' offline' : '');
  const now = new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
  if (status==='ok')      sub.textContent = 'Live · ' + now;
  if (status==='error')   sub.textContent = 'Offline / Error';
  if (status==='loading') sub.textContent = 'Menghubungkan...';
}

async function syncNow() {
  const btn = document.getElementById('sync-btn');
  btn.classList.add('spinning');
  setSyncStatus('loading');
  await loadExpenses();
  renderDashboard();
  btn.classList.remove('spinning');
}

// ─── EXPORT ──────────────────────────────────────────
function exportJSON() {
  const blob = new Blob([JSON.stringify(expenses, null, 2)], { type:'application/json' });
  dlBlob(blob, `expenses-${nowMonth()}.json`);
}
function exportCSV() {
  const rows = [['ID','Tanggal','Deskripsi','Jumlah','Kategori','PIC','Label','Catatan','Dibuat']];
  expenses.forEach(e => {
    const c    = getCat(e.category_id);
    const lbls = (e.labels||[]).map(l => getLabel(l)?.name).filter(Boolean).join(';');
    rows.push([e.id, e.date, e.description, e.amount, c?.name||'', e.pic, lbls, e.note||'', e.created_at||'']);
  });
  const csv = rows.map(r => r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  dlBlob(new Blob([csv],{type:'text/csv'}), `expenses-${nowMonth()}.csv`);
}
function dlBlob(blob, name) {
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  toast('File diunduh');
}

// ─── ONLINE / OFFLINE ────────────────────────────────
function updateOnlineStatus() {
  const banner = document.getElementById('offline-banner');
  if (navigator.onLine) {
    banner.classList.remove('show');
    if (CFG.supabase?.url) loadExpenses().then(renderDashboard);
  } else {
    banner.classList.add('show');
    setSyncStatus('error');
  }
}
window.addEventListener('online',  updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ─── PWA INSTALL ─────────────────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstallPrompt = e;
  document.getElementById('install-banner').classList.add('show');
});
document.getElementById('install-btn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') {
    document.getElementById('install-banner').classList.remove('show');
    toast('App berhasil diinstall 🎉', 'success');
  }
  deferredInstallPrompt = null;
});
document.getElementById('install-dismiss').addEventListener('click', () => {
  document.getElementById('install-banner').classList.remove('show');
});
window.addEventListener('appinstalled', () => {
  document.getElementById('install-banner').classList.remove('show');
  toast('App terinstall ✓', 'success');
});

// ─── INIT ────────────────────────────────────────────
async function initApp() {
  setSyncStatus('loading');
  if (!CFG.supabase?.url) {
    setSyncStatus('error');
    document.getElementById('header-sub').textContent = 'Belum dikonfigurasi';
    toast('Isi konfigurasi Supabase di tab Pengaturan', 'error');
    return;
  }
  await loadExpenses();
  renderDashboard();
}

initApp();
