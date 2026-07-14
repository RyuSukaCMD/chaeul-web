import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

// Loader .env sederhana tanpa dependency.
// Membaca file .env di root project & mengisi process.env
// (variabel yang SUDAH ada di process.env tidak ditimpa).
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.join(__dirname, "..", ".env")

export function loadEnv() {
    try {
        if (!fs.existsSync(ENV_PATH)) return
        const raw = fs.readFileSync(ENV_PATH, "utf8")
        for (let line of raw.split(/\r?\n/)) {
            line = line.trim()
            if (!line || line.startsWith("#")) continue
            const eq = line.indexOf("=")
            if (eq === -1) continue
            const key = line.slice(0, eq).trim()
            let val = line.slice(eq + 1).trim()
            // buang quote pembungkus
            if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
            ) {
                val = val.slice(1, -1)
            }
            if (key && process.env[key] === undefined) {
                process.env[key] = val
            }
        }
    } catch (e) {
        console.error("Gagal memuat .env:", e.message)
    }
}

export default { loadEnv }
