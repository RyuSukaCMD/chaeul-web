import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, "..", "data")

// Struktur file JSON yang dikelola:
//   users.json    → daftar user terdaftar (dari bot)      [{ number, name, ... }]
//   groups.json   → daftar grup ter-register (dari bot)   [{ jid, name, type, ... }]
//   licenses.json → lisensi bot                            [{ key, ... }]
//   orders.json   → pesanan sewa dari website             [{ id, ... }]
const FILES = {
    users: "users.json",
    groups: "groups.json",
    licenses: "licenses.json",
    orders: "orders.json",
    fishing: "fishing.json",
    history: "history.json",
    coupons: "coupons.json"
}

function ensureDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function filePath(name) {
    return path.join(DATA_DIR, FILES[name] || name)
}

/** Baca koleksi JSON (default array). */
export function read(name, fallback = []) {
    ensureDir()
    const fp = filePath(name)
    try {
        if (!fs.existsSync(fp)) {
            fs.writeFileSync(fp, JSON.stringify(fallback, null, 2))
            return fallback
        }
        const raw = fs.readFileSync(fp, "utf8")
        return raw ? JSON.parse(raw) : fallback
    } catch {
        return fallback
    }
}

/** Tulis koleksi JSON secara atomik (tulis ke .tmp lalu rename). */
export function write(name, data) {
    ensureDir()
    const fp = filePath(name)
    const tmp = fp + ".tmp"
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
    fs.renameSync(tmp, fp)
    return data
}

/** Update koleksi dengan fungsi mutator, kembalikan hasilnya. */
export function update(name, fn, fallback = []) {
    const data = read(name, fallback)
    const next = fn(data) ?? data
    write(name, next)
    return next
}

export default { read, write, update, DATA_DIR }
