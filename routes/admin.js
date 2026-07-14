import express from "express"
import { read, update, write } from "../lib/db.js"
import { listLicenses, isOnline, createLicense } from "../lib/license.js"

const router = express.Router()
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "chaeul-admin-secret"

function requireAdmin(req, res, next) {
    const token = req.headers["x-admin-token"] || req.query.token || req.body?.token
    if (token !== ADMIN_TOKEN) return res.status(401).json({ ok: false, error: "Unauthorized" })
    next()
}

// ─── Cek token (untuk login dashboard) ───
router.post("/auth", (req, res) => {
    const token = req.body?.token
    res.json({ ok: token === ADMIN_TOKEN })
})

// ─── Ringkasan dashboard ───
router.get("/overview", requireAdmin, (req, res) => {
    const users = read("users")
    const groups = read("groups")
    const licenses = listLicenses().map((l) => ({ ...l, online: isOnline(l) }))
    const orders = read("orders")

    const revenue = orders
        .filter((o) => o.status === "paid" || o.status === "provisioned")
        .reduce((s, o) => s + (o.price || 0), 0)

    res.json({
        ok: true,
        stats: {
            users: users.length,
            groups: groups.length,
            licenses: licenses.length,
            activeLicenses: licenses.filter((l) => l.status === "active").length,
            onlineBots: licenses.filter((l) => l.online).length,
            orders: orders.length,
            pendingOrders: orders.filter((o) => o.status === "pending").length,
            revenue
        },
        licenses: licenses.sort((a, b) => b.createdAt - a.createdAt),
        orders: orders.sort((a, b) => b.createdAt - a.createdAt),
        updatedAt: Date.now()
    })
})

// ─── Orders: ubah status ───
// body: { id, status }  (pending|paid|provisioned|cancelled)
router.post("/order/status", requireAdmin, (req, res) => {
    const { id, status } = req.body || {}
    let found = null
    update("orders", (list) =>
        list.map((o) => {
            if (o.id === id) {
                o.status = status
                o.updatedAt = Date.now()
                found = o
            }
            return o
        })
    )
    res.json({ ok: !!found, order: found })
})

// ─── Orders: approve → buat lisensi otomatis dari order ───
// body: { id, days? }
router.post("/order/approve", requireAdmin, (req, res) => {
    const { id, days } = req.body || {}
    const orders = read("orders")
    const order = orders.find((o) => o.id === id)
    if (!order) return res.status(404).json({ ok: false, error: "Order tidak ditemukan." })

    const lic = createLicense({
        plan: order.plan,
        days: Number(days) || 30,
        ownerNumber: order.contact || "",
        note: `Dari order ${order.id}`
    })

    let updated = null
    update("orders", (list) =>
        list.map((o) => {
            if (o.id === id) {
                o.status = "provisioned"
                o.licenseKey = lic.key
                o.updatedAt = Date.now()
                updated = o
            }
            return o
        })
    )

    res.json({ ok: true, license: lic, order: updated || order })
})

// ─── Orders: antre auto-provision (bot yang join grup & terbitkan lisensi) ───
router.post("/order/queue", requireAdmin, (req, res) => {
    const { id } = req.body || {}
    let found = null
    update("orders", (list) =>
        list.map((o) => {
            if (o.id === id) {
                o.status = "approved" // bot akan memprosesnya
                o.provisioning = false
                o.updatedAt = Date.now()
                found = o
            }
            return o
        })
    )
    res.json({ ok: !!found, order: found })
})

// ─── Orders: hapus ───
router.post("/order/delete", requireAdmin, (req, res) => {
    const { id } = req.body || {}
    let ok = false
    update("orders", (list) => {
        const next = list.filter((o) => o.id !== id)
        ok = next.length !== list.length
        return next
    })
    res.json({ ok })
})

export default router
