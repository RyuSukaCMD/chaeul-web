import express from "express"
import { write, read } from "../lib/db.js"

const router = express.Router()

// Token sinkronisasi (bot → website). Set via env SYNC_TOKEN.
const SYNC_TOKEN = process.env.SYNC_TOKEN || "chaeul-sync-secret"

function requireSync(req, res, next) {
    const token = req.headers["x-sync-token"] || req.query.token
    if (token !== SYNC_TOKEN) return res.status(401).json({ ok: false, error: "Unauthorized" })
    next()
}

// ─── Bot mengirim daftar user terdaftar ───
// body: { users: [{ number, name, joinedAt }] }
router.post("/users", requireSync, (req, res) => {
    const users = Array.isArray(req.body?.users) ? req.body.users : []
    write("users", users)
    res.json({ ok: true, count: users.length })
})

// ─── Bot mengirim daftar grup ter-register ───
// body: { groups: [{ jid, name, type, members, registeredAt }] }
router.post("/groups", requireSync, (req, res) => {
    const groups = Array.isArray(req.body?.groups) ? req.body.groups : []
    write("groups", groups)
    res.json({ ok: true, count: groups.length })
})

// ─── Bot push gabungan (users + groups sekaligus) ───
router.post("/all", requireSync, (req, res) => {
    if (Array.isArray(req.body?.users)) write("users", req.body.users)
    if (Array.isArray(req.body?.groups)) write("groups", req.body.groups)
    res.json({
        ok: true,
        users: read("users").length,
        groups: read("groups").length
    })
})

export default router
