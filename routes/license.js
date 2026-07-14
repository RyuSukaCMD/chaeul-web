import express from "express"
import {
    createLicense,
    verifyLicense,
    listLicenses,
    getLicense,
    setStatus,
    extendLicense,
    revokeLicense,
    deleteLicense,
    isOnline
} from "../lib/license.js"

const router = express.Router()

// Token admin untuk endpoint manajemen (set via env ADMIN_TOKEN).
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "chaeul-admin-secret"

function requireAdmin(req, res, next) {
    const token = req.headers["x-admin-token"] || req.query.token
    if (token !== ADMIN_TOKEN) return res.status(401).json({ ok: false, error: "Unauthorized" })
    next()
}

// ─── HEARTBEAT / VERIFY (dipanggil bot) ───
// body: { key, groupJid?, version?, owner? }
router.post("/verify", (req, res) => {
    const { key, groupJid, version } = req.body || {}
    if (!key) return res.status(400).json({ valid: false, reason: "Key wajib diisi." })
    const result = verifyLicense(key, { groupJid, version })
    if (!result.valid) return res.status(200).json({ valid: false, reason: result.reason })

    const lic = result.license
    // Kirim data yang bot butuhkan (mis. owner otomatis dapat fitur owner)
    res.json({
        valid: true,
        license: {
            key: lic.key,
            plan: lic.plan,
            ownerNumber: lic.ownerNumber,
            groupJid: lic.groupJid,
            maxMembers: lic.maxMembers,
            expiresAt: lic.expiresAt,
            status: lic.status
        },
        // interval heartbeat berikutnya (acak 2-6 jam, dalam ms) — bot mengikuti ini
        nextHeartbeat: (2 + Math.random() * 4) * 3600000
    })
})

// ─── ADMIN: buat lisensi (dipakai bot owner via API) ───
router.post("/create", requireAdmin, (req, res) => {
    const lic = createLicense(req.body || {})
    res.json({ ok: true, license: lic })
})

// ─── ADMIN: daftar semua lisensi ───
router.get("/list", requireAdmin, (req, res) => {
    const items = listLicenses().map((l) => ({ ...l, online: isOnline(l) }))
    res.json({ ok: true, total: items.length, items })
})

// ─── ADMIN: detail 1 lisensi ───
router.get("/get/:key", requireAdmin, (req, res) => {
    const lic = getLicense(req.params.key)
    if (!lic) return res.status(404).json({ ok: false, error: "Not found" })
    res.json({ ok: true, license: { ...lic, online: isOnline(lic) } })
})

// ─── ADMIN: suspend / activate ───
router.post("/status", requireAdmin, (req, res) => {
    const { key, status } = req.body || {}
    const lic = setStatus(key, status)
    res.json({ ok: !!lic, license: lic })
})

// ─── ADMIN: perpanjang ───
router.post("/extend", requireAdmin, (req, res) => {
    const { key, days } = req.body || {}
    const lic = extendLicense(key, days)
    res.json({ ok: !!lic, license: lic })
})

// ─── ADMIN: revoke ───
router.post("/revoke", requireAdmin, (req, res) => {
    const { key } = req.body || {}
    const lic = revokeLicense(key)
    res.json({ ok: !!lic, license: lic })
})

// ─── ADMIN: hapus ───
router.post("/delete", requireAdmin, (req, res) => {
    const ok = deleteLicense((req.body || {}).key)
    res.json({ ok })
})

export default router
