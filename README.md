# ✦ Chaeul Web — Sewa Bot WhatsApp + Sistem Lisensi

Website landing untuk **sewa bot WhatsApp Chaeul** dengan sistem lisensi terintegrasi.
Frontend elegan (HTML/CSS/JS murni, animasi kelas enterprise) + backend ringan
(Express + JSON DB) yang jadi jembatan antara **website** dan **bot**.

## ✨ Fitur

- **Landing page** elegan & soft dengan animasi (aurora background, reveal on scroll,
  counter animasi, chat mockup, spotlight card, dll).
- **Paket sewa**: Private Group (10K/bln, maks 3 anggota) & Public Group (15K/bln).
- **Order flow**: pilih paket → input link grup → checkout (payment placeholder).
- **Live update** (SSE): jumlah user terdaftar & grup ter-register real-time.
- **Sistem Lisensi**: buat / verifikasi / heartbeat / revoke lisensi bot.
- **Sinkronisasi**: bot push data user & grup ke website.

## 🚀 Menjalankan (VPS)

```bash
npm install
cp .env.example .env      # lalu isi ADMIN_TOKEN & SYNC_TOKEN
npm start                 # default http://localhost:3000
```

Untuk produksi, jalankan di belakang reverse proxy (nginx/caddy) + pakai `pm2`:

```bash
npm i -g pm2
pm2 start server.js --name chaeul-web
pm2 save && pm2 startup
```

## 📡 API

### Publik
| Method | Endpoint          | Fungsi                                  |
| ------ | ----------------- | --------------------------------------- |
| GET    | `/api/stats`      | Statistik (user, grup, lisensi aktif)   |
| GET    | `/api/live`       | SSE — stats real-time                   |
| GET    | `/api/users`      | Daftar user (nomor disamarkan)          |
| GET    | `/api/groups`     | Daftar grup ter-register                |
| GET    | `/api/plans`      | Daftar paket                            |
| POST   | `/api/order`      | Buat pesanan sewa                       |

### Lisensi (bot)
| Method | Endpoint                | Header               | Fungsi                    |
| ------ | ----------------------- | -------------------- | ------------------------- |
| POST   | `/api/license/verify`   | —                    | Verifikasi + heartbeat    |
| POST   | `/api/license/create`   | `x-admin-token`      | Buat lisensi              |
| GET    | `/api/license/list`     | `x-admin-token`      | Daftar lisensi            |
| POST   | `/api/license/extend`   | `x-admin-token`      | Perpanjang                |
| POST   | `/api/license/status`   | `x-admin-token`      | Suspend/aktifkan          |
| POST   | `/api/license/revoke`   | `x-admin-token`      | Cabut lisensi             |

### Sinkronisasi (bot → web)
| Method | Endpoint         | Header          | Fungsi                       |
| ------ | ---------------- | --------------- | ---------------------------- |
| POST   | `/api/sync/all`  | `x-sync-token`  | Push daftar user & grup      |

## 🔗 Integrasi dengan Bot

Di `config.js` bot, atur:

```js
global.license = {
  enable: true,
  key: process.env.CHAEUL_LICENSE,        // key lisensi
  apiUrl: "https://web-kamu.com",          // URL website ini
  adminToken: process.env.CHAEUL_ADMIN_TOKEN, // = ADMIN_TOKEN web
  syncToken: process.env.CHAEUL_SYNC_TOKEN    // = SYNC_TOKEN web
}
```

Owner membuat lisensi lewat bot: `.license create public 30`
Bot akan memverifikasi lisensi saat start & heartbeat setiap **2–6 jam**.
Owner lisensi **otomatis mendapat fitur owner** di bot.

## 📁 Struktur

```
chaeul-web/
├── server.js           # Express: API + serve static + SSE
├── lib/
│   ├── db.js           # JSON DB (atomic write)
│   └── license.js      # logika lisensi
├── routes/
│   ├── public.js       # stats, users, groups, order
│   ├── license.js      # verify + admin
│   └── sync.js         # sinkronisasi dari bot
├── public/             # frontend (index.html, css, js)
└── data/               # JSON DB (auto-generated, di-gitignore)
```

© Chaeul
