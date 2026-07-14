import express from "express"
import { write, read, update } from "../lib/db.js"
import bus from "../lib/bus.js"

const router = express.Router()
const FISH_FEED_MAX = 40 // simpan 40 tangkapan terakhir

function syncToken() {
    return process.env.SYNC_TOKEN || "chaeul-sync-secret"
}

function requireSync(req, res, next) {
    const token = req.headers["x-sync-token"] || req.query.token
    if (token !== syncToken()) return res.status(401).json({ ok: false, error: "Unauthorized" })
    next()
}

const norm = (n = "") => String(n).replace(/[^0-9]/g, "")

// ─── FULL SYNC: bot kirim seluruh daftar (saat start) ───
router.post("/users", requireSync, (req, res) => {
    const users = Array.isArray(req.body?.users) ? req.body.users : []
    write("users", users)
    bus.emit("update")
    res.json({ ok: true, count: users.length })
})

router.post("/groups", requireSync, (req, res) => {
    const groups = Array.isArray(req.body?.groups) ? req.body.groups : []
    write("groups", groups)
    bus.emit("update")
    res.json({ ok: true, count: groups.length })
})

router.post("/all", requireSync, (req, res) => {
    if (Array.isArray(req.body?.users)) write("users", req.body.users)
    if (Array.isArray(req.body?.groups)) write("groups", req.body.groups)
    bus.emit("update")
    res.json({ ok: true, users: read("users").length, groups: read("groups").length })
})

// ─── INCREMENTAL: user baru terdaftar (real-time) ───
// body: { number, name }
router.post("/user", requireSync, (req, res) => {
    const number = norm(req.body?.number)
    const name = (req.body?.name || "User").toString().slice(0, 40)
    if (!number) return res.status(400).json({ ok: false, error: "number wajib" })

    let added = false
    update("users", (list) => {
        const idx = list.findIndex((u) => norm(u.number) === number)
        if (idx >= 0) {
            list[idx].name = name
        } else {
            list.push({ number, name, joinedAt: Date.now() })
            added = true
        }
        return list
    })
    bus.emit("update")
    if (added) bus.emit("newuser", { number, name })
    res.json({ ok: true, added })
})

// ─── INCREMENTAL: grup baru ter-register (real-time) ───
// body: { jid, name, type?, members? }
router.post("/group", requireSync, (req, res) => {
    const jid = req.body?.jid
    const name = (req.body?.name || "Grup").toString().slice(0, 60)
    if (!jid) return res.status(400).json({ ok: false, error: "jid wajib" })

    let added = false
    update("groups", (list) => {
        const idx = list.findIndex((g) => g.jid === jid)
        const entry = {
            jid,
            name,
            type: req.body?.type || "private",
            members: req.body?.members ?? null,
            registeredAt: Date.now()
        }
        if (idx >= 0) list[idx] = { ...list[idx], ...entry, registeredAt: list[idx].registeredAt }
        else {
            list.push(entry)
            added = true
        }
        return list
    })
    bus.emit("update")
    if (added) bus.emit("newgroup", { jid, name })
    res.json({ ok: true, added })
})

// ─── FISHING BROADCAST: tangkapan ikan (real-time feed) ───
// body: { name, fish, rarity, value, island }
router.post("/fishing", requireSync, (req, res) => {
    const b = req.body || {}
    const entry = {
        name: (b.name || "Seseorang").toString().slice(0, 40),
        fish: (b.fish || "ikan").toString().slice(0, 60),
        rarity: (b.rarity || "common").toString().slice(0, 20),
        value: Number(b.value) || 0,
        island: (b.island || "").toString().slice(0, 40),
        at: Date.now()
    }
    update("fishing", (list) => {
        list.push(entry)
        // batasi jumlah entri
        while (list.length > FISH_FEED_MAX) list.shift()
        return list
    })
    bus.emit("fishing", entry)
    res.json({ ok: true })
})

export default router
