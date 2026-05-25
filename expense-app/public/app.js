// ─── STATE ───────────────────────────────────────────────
const STORAGE_KEY = 'expense_app_v1';
let selectedLabels = [];
let deferredInstallPrompt = null;
let filterCat = '';

const DEFAULT_DATA = {
  categories: [
    { id: 'c1', name: 'Operasional', color: '#38bdf8' },
    { id: 'c2', name: 'Marketing', color: '#34d399' },
    { id: 'c3', name: 'SDM', color: '#f87171' },
    { id: 'c4', name: 'Transportasi', color: '#fbbf24' },
    { id: 'c5', name: 'Lain-lain', color: '#94a3b8' },
  ],
  labels: [
    { id: 'l1', name: 'Rutin', color: '#38bdf8' },
    { id: 'l2', name: 'Prioritas', color: '#f87171' },
    { id: 'l3', name: 'Ad-hoc', color: '#fbbf24' },
    { id: 'l4', name: 'Reimburse', color: '#34d399' },
  ],
  pics: ['Budi', 'Sari', 'Andi', 'Dewi'],
  expenses: [],
  supabase: { url: '', key: '' },
  lastSync: null,
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_DATA, ...JSON.parse(raw) };
  } catch (_) {}
  return { ...DEFAULT_DATA };
}

function save(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

let DB = load();

// ─── UTILS ───────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function fmt(n) {
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

function fmtShort(n) {
  if (n >= 1_000_000) return 'Rp ' + (n / 1_000_000).toFixed(1) + 'jt';
  if (n >= 1_000) return 'Rp ' + (n / 1_000).toFixed(0) + 'rb';
  return 'Rp ' + n;
}

function nowMonth() { return new Date().toISOString().slice(0, 7); }

function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--text)';
  t.style.color = type === 'error' || type === 'success' ? '#0f172a' : 'var(--bg)';
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}

function getCat(id) { return DB.categories.find(c => c.id === id); }
function getLabel(id) { return DB.labels.find(l => l.id === id); }

function avatarEl(name, color) {
  const initials = name.slice(0, 2).toUpperCase();
  return `<div class="exp-avatar" style="background:${color}22;color:${color}">${initials}</div>`;
}

// ─── NAVIGATION ──────────────────────────────────────────
function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  btn.classList.add('active');
  if (id === 'dashboard') renderDashboard();
  if (id === 'add') initAddForm();
  if (id === 'list') renderList();
  if (id === 'settings') renderSettings();
}

// ─── DASHBOARD ───────────────────────────────────────────
function renderDashboard() {
  const month = nowMonth();
  const prev = new Date();
  prev.setMonth(prev.getMonth() - 1);
  const prevMonth = prev.toISOString().slice(0, 7);

  const thisM = DB.expenses.filter(e => e.date.startsWith(month));
  const prevM = DB.expenses.filter(e => e.date.startsWith(prevMonth));

  const total = thisM.reduce((a, b) => a + Number(b.amount), 0);
  const prevTotal = prevM.reduce((a, b) => a + Number(b.amount), 0);
  const avg = thisM.length ? Math.round(total / thisM.length) : 0;
  const diff = prevTotal ? ((total - prevTotal) / prevTotal * 100).toFixed(0) : null;
  const diffClass = diff > 0 ? 'up' : 'down';
  const diffText = diff !== null ? (diff > 0 ? '▲' : '▼') + Math.abs(diff) + '% vs bln lalu' : '—';

  document.getElementById('metrics').innerHTML = `
    <div class="metric">
      <div class="metric-label">Total bulan ini</div>
      <div class="metric-value small">${fmtShort(total)}</div>
      <div class="metric-change ${diffClass}">${diffText}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Transaksi</div>
      <div class="metric-value">${thisM.length}</div>
      <div class="metric-change" style="color:var(--text3)">${prevM.length} bln lalu</div>
    </div>
    <div class="metric">
      <div class="metric-label">Rata-rata</div>
      <div class="metric-value small">${fmtShort(avg)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Bln lalu</div>
      <div class="metric-value small">${fmtShort(prevTotal)}</div>
    </div>
  `;

  // Category chart
  const catMap = {};
  thisM.forEach(e => { catMap[e.cat] = (catMap[e.cat] || 0) + Number(e.amount); });
  const maxCat = Math.max(...Object.values(catMap), 1);
  document.getElementById('chart-cat').innerHTML = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([cid, amt]) => {
      const c = getCat(cid);
      if (!c) return '';
      const pct = Math.round(amt / maxCat * 100);
      return `<div class="bar-row">
        <div class="bar-name">${c.name}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%;background:${c.color}">
            <span class="bar-val">${fmtShort(amt)}</span>
          </div>
        </div>
      </div>`;
    }).join('') || '<div class="empty"><div class="empty-text">Belum ada data</div></div>';

  // PIC chart
  const picMap = {};
  thisM.forEach(e => { picMap[e.pic] = (picMap[e.pic] || 0) + Number(e.amount); });
  const picColors = ['#38bdf8', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#fb923c'];
  const maxPic = Math.max(...Object.values(picMap), 1);
  document.getElementById('chart-pic').innerHTML = Object.entries(picMap)
    .sort((a, b) => b[1] - a[1])
    .map(([pic, amt], i) => {
      const pct = Math.round(amt / maxPic * 100);
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

  // Recent
  const recent = DB.expenses.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  document.getElementById('recent').innerHTML = recent.map(expItemHTML).join('')
    || '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">Belum ada pengeluaran</div></div>';
}

function expItemHTML(e) {
  const c = getCat(e.cat) || { name: '?', color: '#64748b' };
  const lbls = (e.labels || []).map(l => getLabel(l)).filter(Boolean);
  return `<div class="exp-item">
    ${avatarEl(e.pic, c.color)}
    <div class="exp-body">
      <div class="exp-title">${e.desc}</div>
      <div class="exp-meta">
        <span style="color:${c.color}">${c.name}</span>
        <span>·</span><span>${e.pic}</span>
        ${lbls.map(l => `<span class="badge" style="background:${l.color}22;color:${l.color}">${l.name}</span>`).join('')}
        ${e.note ? `<span style="font-style:italic">· ${e.note}</span>` : ''}
      </div>
    </div>
    <div class="exp-right">
      <div class="exp-amount">${fmt(e.amount)}</div>
      <div class="exp-date">${e.date}</div>
    </div>
  </div>`;
}

// ─── ADD FORM ────────────────────────────────────────────
function initAddForm() {
  document.getElementById('f-cat').innerHTML = DB.categories.map(c =>
    `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('f-pic').innerHTML = DB.pics.map(p =>
    `<option>${p}</option>`).join('');
  document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
  selectedLabels = [];
  renderLabelTags();
}

function renderLabelTags() {
  document.getElementById('f-labels').innerHTML = DB.labels.map(l => {
    const on = selectedLabels.includes(l.id);
    return `<button class="tag${on ? ' on' : ''}"
      style="${on ? `background:${l.color};border-color:${l.color}` : `border-color:${l.color};color:${l.color}`}"
      onclick="toggleLabel('${l.id}')">${l.name}</button>`;
  }).join('');
}

function toggleLabel(id) {
  const i = selectedLabels.indexOf(id);
  if (i >= 0) selectedLabels.splice(i, 1); else selectedLabels.push(id);
  renderLabelTags();
}

function saveExpense() {
  const date = document.getElementById('f-date').value;
  const desc = document.getElementById('f-desc').value.trim();
  const amount = parseFloat(document.getElementById('f-amount').value);
  const cat = document.getElementById('f-cat').value;
  const pic = document.getElementById('f-pic').value;
  const note = document.getElementById('f-note').value.trim();

  if (!date || !desc || !amount || amount <= 0) {
    toast('Lengkapi tanggal, deskripsi, dan jumlah', 'error');
    return;
  }

  const expense = { id: uid(), date, desc, amount, cat, pic, labels: [...selectedLabels], note, synced: false };
  DB.expenses.push(expense);
  save(DB);

  document.getElementById('f-desc').value = '';
  document.getElementById('f-amount').value = '';
  document.getElementById('f-note').value = '';
  selectedLabels = [];
  renderLabelTags();
  toast('Tersimpan ✓', 'success');

  // Auto-sync if online
  if (navigator.onLine && DB.supabase.url) syncNow(true);
}

// ─── LIST ────────────────────────────────────────────────
function renderList() {
  // Build filter chips
  const cats = [{ id: '', name: 'Semua', color: '#94a3b8' }, ...DB.categories];
  document.getElementById('filter-cats').innerHTML = cats.map(c =>
    `<button class="filter-chip${filterCat === c.id ? ' on' : ''}" onclick="setFilterCat('${c.id}')">${c.name}</button>`
  ).join('');

  let data = DB.expenses.slice().sort((a, b) => b.date.localeCompare(a.date));
  if (filterCat) data = data.filter(e => e.cat === filterCat);

  document.getElementById('expense-list').innerHTML = data.length
    ? data.map(e => `
      <div class="card" style="padding:12px">
        ${expItemHTML(e)}
        <div style="display:flex;justify-content:flex-end;margin-top:8px">
          <button class="btn-danger-ghost" onclick="deleteExpense('${e.id}')">Hapus</button>
        </div>
      </div>`).join('')
    : '<div class="empty"><div class="empty-icon">🗂️</div><div class="empty-text">Tidak ada data</div></div>';
}

function setFilterCat(id) {
  filterCat = id;
  renderList();
}

function deleteExpense(id) {
  if (!confirm('Hapus pengeluaran ini?')) return;
  DB.expenses = DB.expenses.filter(e => e.id !== id);
  save(DB);
  renderList();
  toast('Dihapus');
}

// ─── SETTINGS ────────────────────────────────────────────
function renderSettings() {
  document.getElementById('cat-settings').innerHTML = DB.categories.map(c => `
    <div class="setting-row">
      <div class="setting-name"><span class="color-dot" style="background:${c.color}"></span>${c.name}</div>
      <button class="btn-danger-ghost" onclick="deleteCategory('${c.id}')">Hapus</button>
    </div>`).join('');

  document.getElementById('label-settings').innerHTML = DB.labels.map(l => `
    <div class="setting-row">
      <div class="setting-name"><span class="color-dot" style="background:${l.color}"></span>${l.name}</div>
      <button class="btn-danger-ghost" onclick="deleteLabel('${l.id}')">Hapus</button>
    </div>`).join('');

  document.getElementById('pic-settings').innerHTML = DB.pics.map(p => `
    <div class="setting-row">
      <div class="setting-name">👤 ${p}</div>
      <button class="btn-danger-ghost" onclick="deletePIC('${p}')">Hapus</button>
    </div>`).join('');

  document.getElementById('sb-url').value = DB.supabase?.url || '';
  document.getElementById('sb-key').value = DB.supabase?.key || '';
}

function addCategory() {
  const name = document.getElementById('new-cat').value.trim();
  const color = document.getElementById('new-cat-color').value;
  if (!name) return;
  DB.categories.push({ id: uid(), name, color });
  document.getElementById('new-cat').value = '';
  save(DB);
  renderSettings();
  toast('Kategori ditambahkan');
}
function deleteCategory(id) {
  DB.categories = DB.categories.filter(c => c.id !== id);
  save(DB);
  renderSettings();
  toast('Dihapus');
}
function addLabel() {
  const name = document.getElementById('new-label').value.trim();
  const color = document.getElementById('new-label-color').value;
  if (!name) return;
  DB.labels.push({ id: uid(), name, color });
  document.getElementById('new-label').value = '';
  save(DB);
  renderSettings();
  toast('Label ditambahkan');
}
function deleteLabel(id) {
  DB.labels = DB.labels.filter(l => l.id !== id);
  save(DB);
  renderSettings();
  toast('Dihapus');
}
function addPIC() {
  const name = document.getElementById('new-pic').value.trim();
  if (!name || DB.pics.includes(name)) return;
  DB.pics.push(name);
  document.getElementById('new-pic').value = '';
  save(DB);
  renderSettings();
  toast('PIC ditambahkan');
}
function deletePIC(name) {
  DB.pics = DB.pics.filter(p => p !== name);
  save(DB);
  renderSettings();
  toast('Dihapus');
}

function saveSupabaseConfig() {
  DB.supabase = {
    url: document.getElementById('sb-url').value.trim(),
    key: document.getElementById('sb-key').value.trim(),
  };
  save(DB);
  toast('Konfigurasi Supabase tersimpan', 'success');
}

async function testSupabase() {
  if (!DB.supabase?.url) { toast('Isi URL Supabase dulu', 'error'); return; }
  try {
    const res = await fetch(`${DB.supabase.url}/rest/v1/expenses?limit=1`, {
      headers: {
        apikey: DB.supabase.key,
        Authorization: `Bearer ${DB.supabase.key}`,
      }
    });
    if (res.ok || res.status === 401) {
      toast(res.ok ? 'Koneksi berhasil ✓' : 'URL benar tapi cek anon key', res.ok ? 'success' : 'error');
    } else {
      toast('Koneksi gagal: ' + res.status, 'error');
    }
  } catch (e) {
    toast('Tidak bisa terhubung ke Supabase', 'error');
  }
}

// ─── SUPABASE SYNC ────────────────────────────────────────
async function syncNow(silent = false) {
  if (!DB.supabase?.url || !DB.supabase?.key) {
    if (!silent) toast('Konfigurasi Supabase belum diisi', 'error');
    return;
  }
  if (!navigator.onLine) { if (!silent) toast('Offline — tidak bisa sync'); return; }

  const btn = document.getElementById('sync-btn');
  btn.classList.add('spinning');
  setSyncStatus('loading');

  try {
    const unsynced = DB.expenses.filter(e => !e.synced);

    // Upsert expenses ke Supabase
    if (unsynced.length > 0) {
      const payload = unsynced.map(e => ({
        id: e.id,
        date: e.date,
        description: e.desc,
        amount: e.amount,
        category_id: e.cat,
        pic: e.pic,
        labels: e.labels,
        note: e.note,
      }));

      const res = await fetch(`${DB.supabase.url}/rest/v1/expenses`, {
        method: 'POST',
        headers: {
          apikey: DB.supabase.key,
          Authorization: `Bearer ${DB.supabase.key}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        DB.expenses = DB.expenses.map(e =>
          unsynced.find(u => u.id === e.id) ? { ...e, synced: true } : e
        );
        DB.lastSync = new Date().toISOString();
        save(DB);
        setSyncStatus('ok');
        if (!silent) toast(`${unsynced.length} data tersync ✓`, 'success');
      } else {
        const err = await res.text();
        throw new Error(err);
      }
    } else {
      if (!silent) toast('Semua data sudah tersync ✓', 'success');
      setSyncStatus('ok');
    }

    // Fetch dari Supabase (pull)
    await pullFromSupabase();

  } catch (e) {
    console.error('Sync error:', e);
    setSyncStatus('error');
    if (!silent) toast('Sync gagal: ' + e.message, 'error');
  } finally {
    btn.classList.remove('spinning');
  }
}

async function pullFromSupabase() {
  try {
    const res = await fetch(`${DB.supabase.url}/rest/v1/expenses?order=date.desc`, {
      headers: {
        apikey: DB.supabase.key,
        Authorization: `Bearer ${DB.supabase.key}`,
      }
    });
    if (!res.ok) return;
    const remote = await res.json();
    remote.forEach(r => {
      const exists = DB.expenses.find(e => e.id === r.id);
      if (!exists) {
        DB.expenses.push({
          id: r.id,
          date: r.date,
          desc: r.description,
          amount: r.amount,
          cat: r.category_id,
          pic: r.pic,
          labels: r.labels || [],
          note: r.note || '',
          synced: true,
        });
      }
    });
    save(DB);
  } catch (_) {}
}

function setSyncStatus(status) {
  const dot = document.getElementById('sync-dot');
  const sub = document.getElementById('header-sub');
  dot.className = 'sync-dot' + (status === 'error' ? ' error' : status === 'loading' ? ' offline' : '');
  if (status === 'ok') sub.textContent = DB.lastSync ? 'Sync: ' + new Date(DB.lastSync).toLocaleTimeString('id-ID') : 'Siap';
  if (status === 'error') sub.textContent = 'Sync gagal';
  if (status === 'loading') sub.textContent = 'Menyinkronkan...';
}

// ─── EXPORT ──────────────────────────────────────────────
function exportJSON() {
  const blob = new Blob([JSON.stringify(DB.expenses, null, 2)], { type: 'application/json' });
  dlBlob(blob, `expenses-${nowMonth()}.json`);
}

function exportCSV() {
  const rows = [['ID', 'Tanggal', 'Deskripsi', 'Jumlah', 'Kategori', 'PIC', 'Label', 'Catatan']];
  DB.expenses.forEach(e => {
    const c = getCat(e.cat);
    const lbls = (e.labels || []).map(l => getLabel(l)?.name).filter(Boolean).join(';');
    rows.push([e.id, e.date, e.desc, e.amount, c?.name || '', e.pic, lbls, e.note]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  dlBlob(new Blob([csv], { type: 'text/csv' }), `expenses-${nowMonth()}.csv`);
}

function dlBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  toast('File diunduh');
}

// ─── ONLINE / OFFLINE ────────────────────────────────────
function updateOnlineStatus() {
  const banner = document.getElementById('offline-banner');
  if (navigator.onLine) {
    banner.classList.remove('show');
    setSyncStatus('ok');
    if (DB.supabase?.url) syncNow(true);
  } else {
    banner.classList.add('show');
    setSyncStatus('error');
  }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ─── PWA INSTALL ─────────────────────────────────────────
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const banner = document.getElementById('install-banner');
  banner.classList.add('show');
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

// ─── INIT ────────────────────────────────────────────────
updateOnlineStatus();
renderDashboard();
