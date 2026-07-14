import express from "express"
import crypto from "crypto"
import { exec } from "child_process"
import path from "path"
import { fileURLToPath } from "url"

const router = express.Router()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "..")

function secret() {
    return process.env.WEBHOOK_SECRET || ""
}

// Verifikasi signature GitHub (HMAC SHA-256) — kalau secret di-set.
function verifyGithub(req) {
    const sig = req.headers["x-hub-signature-256"]
    const s = secret()
    if (!s) return true // tanpa secret → izinkan (kurang aman, disarankan set)
    if (!sig || !req.rawBody) return false
    const expected = "sha256=" + crypto.createHmac("sha256", s).update(req.rawBody).digest("hex")
    try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    } catch {
        return false
    }
}

function runUpdate() {
    return new Promise((resolve) => {
        // git pull → install deps → restart via pm2 (bila ada)
        const cmd =
            "git pull --ff-only && npm install --no-audit --no-fund --omit=dev && (pm2 restart chaeul-web || true)"
        exec(cmd, { cwd: ROOT, timeout: 120000 }, (err, stdout, stderr) => {
            resolve({ ok: !err, stdout: String(stdout).slice(-2000), stderr: String(stderr).slice(-1000) })
        })
    })
}

// ─── Webhook GitHub (push event) ───
router.post("/webhook", async (req, res) => {
    if (!verifyGithub(req)) return res.status(401).json({ ok: false, error: "Bad signature" })

    const event = req.headers["x-github-event"]
    // Hanya proses push ke branch utama
    if (event && event !== "push") return res.json({ ok: true, skipped: event })

    const ref = req.body?.ref || ""
    if (ref && !/refs\/heads\/(main|master)$/.test(ref)) {
        return res.json({ ok: true, skipped: "non-main branch" })
    }

    // Balas cepat lalu update di background (git pull bisa lama)
    res.json({ ok: true, updating: true })
    runUpdate().then((r) => {
        console.log("[auto-update]", r.ok ? "✅ berhasil" : "❌ gagal")
        if (r.stdout) console.log(r.stdout)
        if (!r.ok && r.stderr) console.error(r.stderr)
    })
})

// ─── Trigger manual (butuh admin token) ───
router.post("/pull", async (req, res) => {
    const token = req.headers["x-admin-token"] || req.query.token
    if (token !== (process.env.ADMIN_TOKEN || "chaeul-admin-secret")) {
        return res.status(401).json({ ok: false, error: "Unauthorized" })
    }
    const r = await runUpdate()
    res.json(r)
})

// Info versi (commit) saat ini
router.get("/version", (req, res) => {
    exec("git rev-parse --short HEAD", { cwd: ROOT }, (err, stdout) => {
        res.json({ ok: !err, commit: String(stdout).trim() || "unknown" })
    })
})

export default router
