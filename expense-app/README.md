# Daily Expense Tracker — PWA

App pengeluaran harian dengan:
- ✅ localStorage (offline-first)
- ✅ Sync ke Supabase
- ✅ Deploy ke Vercel
- ✅ PWA — bisa diinstall di Android
- ✅ Dashboard per kategori & PIC
- ✅ Manajemen kategori, label, PIC

---

## 📁 Struktur File

```
expense-app/
├── public/
│   ├── index.html       ← App shell + UI
│   ├── app.js           ← Logic, localStorage, Supabase sync
│   ├── sw.js            ← Service Worker (PWA, offline)
│   ├── manifest.json    ← PWA manifest (Android install)
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
├── vercel.json          ← Config routing Vercel
└── supabase_setup.sql   ← SQL untuk setup database
```

---

## 🚀 Cara Deploy

### 1. Setup Supabase

1. Buka [supabase.com](https://supabase.com) → Project kamu
2. Pergi ke **SQL Editor**
3. Copy-paste isi `supabase_setup.sql` → Run
4. Pergi ke **Settings > API** → Catat:
   - `Project URL` (contoh: `https://abcd1234.supabase.co`)
   - `anon public` key

### 2. Deploy ke Vercel

**Cara A — via CLI (tercepat):**
```bash
npm i -g vercel
cd expense-app
vercel --prod
```
Jawab pertanyaan:
- Link to existing project? → **No**
- Which directory is your project root? → `./public`

**Cara B — via GitHub:**
1. Push folder ini ke GitHub repo
2. Buka [vercel.com](https://vercel.com) → New Project → Import repo
3. Set **Root Directory** = `public`
4. Deploy

### 3. Konfigurasi Supabase di App

Setelah deploy, buka app → tab **Pengaturan** → scroll ke bawah:
- Isi **Supabase URL** dari langkah 1
- Isi **Anon Key** dari langkah 1
- Klik **Simpan konfigurasi**
- Klik **Test koneksi** untuk verifikasi

---

## 📱 Install di Android (PWA)

1. Buka URL app di **Chrome Android**
2. Banner "Install sebagai app" otomatis muncul → tap **Install**
3. Atau: ketuk ⋮ menu di Chrome → **"Add to Home screen"**
4. App muncul di home screen seperti app native

**Fitur PWA:**
- Bekerja offline (data dari localStorage)
- Auto sync ke Supabase saat online
- Shortcut langsung ke "Tambah pengeluaran"
- Splash screen & fullscreen mode

---

## 🔄 Cara Kerja Sync

```
Input → localStorage (langsung) → online? → Supabase upsert
                                ↑
                            saat online kembali (auto-sync)
```

- Data **selalu tersimpan lokal dulu** (offline-first)
- Saat online → otomatis push data yang belum tersync
- Pull data dari Supabase (merge, tidak menimpa lokal)
- Tombol ⟳ di header untuk manual sync

---

## 📊 Supabase Table Schema

```sql
expenses (
  id          TEXT PRIMARY KEY,   -- generated di client
  date        DATE,
  description TEXT,
  amount      NUMERIC(15,2),
  category_id TEXT,               -- ID kategori (lokal)
  pic         TEXT,               -- nama PIC
  labels      TEXT[],             -- array ID label
  note        TEXT,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ
)
```

---

## 🛠️ Kustomisasi

**Tambah kategori/label/PIC:** via tab Pengaturan di app

**Export data:** Pengaturan → Export JSON / Export CSV

**Ganti warna tema:** Edit variabel CSS `:root` di `index.html`

---

## 📝 Catatan

- Kategori & label disimpan di **localStorage** (per device), bukan di Supabase
- Untuk multi-device dengan sinkronisasi penuh kategori, tambahkan tabel `categories` dan `labels` di Supabase
- Untuk auth multi-user, aktifkan RLS di Supabase dan tambahkan login
