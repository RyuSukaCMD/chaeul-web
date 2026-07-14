import express from "express"
import { read, update } from "../lib/db.js"
import { createLicense } from "../lib/license.js"

const router = express.Router()
const SYNC_TOKEN = process.env.SYNC_TOKEN || "chaeul-sync-secret"

function requireSync(req, res, next) {
    const token = req.headers["x-sync-token"] || req.query.token || req.body?.token
    if (token !== SYNC_TOKEN) return res.status(401).json({ ok: false, error: "Unauthorized" })
    next()
}

// ─── Bot mengambil notifikasi untuk owner (order baru, lisensi hampir expired) ───
router.get("/notifications", requireSync, (req, res) => {
    const notifs = []
    const orders = read("orders")
    // Order baru (pending) yang belum dinotifikasi
    for (const o of orders) {
        if (o.status === "pending" && !o.notified) {
            notifs.push({
                type: "new_order",
                text:
                    `🧾 *Order Baru!*\n` +
                    `ID: ${o.id}\n` +
                    `Paket: ${o.planName}${o.months ? ` (${o.months} bln)` : ""}\n` +
                    `Harga: Rp ${Number(o.price).toLocaleString("id-ID")}\n` +
                    `Kontak: ${o.contact || "-"}\n` +
                    `Grup: ${o.groupLink}`,
                orderId: o.id
            })
        }
    }
    // Lisensi hampir kadaluarsa (< 3 hari) belum dinotifikasi
    const licenses = read("licenses")
    for (const l of licenses) {
        if (l.status === "active" && l.expiresAt) {
            const left = l.expiresAt - Date.now()
            if (left > 0 && left < 3 * 86400000 && !l.expNotified) {
                notifs.push({
                    type: "expiring",
                    text:
                        `⏰ *Lisensi Hampir Habis!*\n` +
                        `${l.key} (${l.plan})\n` +
                        `Sisa: ${Math.ceil(left / 86400000)} hari\n` +
                        `Owner: ${l.ownerNumber || "-"}`,
                    key: l.key
                })
            }
        }
    }
    res.json({ ok: true, notifications: notifs })
})

// ─── Bot menandai notifikasi sudah dikirim ───
// body: { orderIds:[], licenseKeys:[] }
router.post("/notifications/ack", requireSync, (req, res) => {
    const orderIds = req.body?.orderIds || []
    const licenseKeys = req.body?.licenseKeys || []
    if (orderIds.length) {
        update("orders", (list) =>
            list.map((o) => (orderIds.includes(o.id) ? { ...o, notified: true } : o))
        )
    }
    if (licenseKeys.length) {
        update("licenses", (list) =>
            list.map((l) => (licenseKeys.includes(l.key) ? { ...l, expNotified: true } : l))
        )
    }
    res.json({ ok: true })
})

// ─── Bot mengambil job provisioning ───
// Job = order berstatus "paid" atau "approved" yang belum di-provision.
router.get("/jobs", requireSync, (req, res) => {
    const orders = read("orders")
    const jobs = orders
        .filter((o) => (o.status === "paid" || o.status === "approved") && !o.provisioning)
        .map((o) => ({
            id: o.id,
            plan: o.plan,
            groupLink: o.groupLink,
            contact: o.contact,
            maxMembers: o.plan === "private" ? 3 : null
        }))
    res.json({ ok: true, jobs })
})

// ─── Bot melaporkan hasil provisioning ───
// body: { id, success, groupJid?, groupName?, members?, reason?, ownerNumber? }
router.post("/report", requireSync, (req, res) => {
    const { id, success, groupJid, groupName, members, reason, ownerNumber, days } = req.body || {}
    const orders = read("orders")
    const order = orders.find((o) => o.id === id)
    if (!order) return res.status(404).json({ ok: false, error: "Order tidak ditemukan." })

    if (!success) {
        // Provisioning gagal (mis. member > 3 untuk private)
        update("orders", (list) =>
            list.map((o) => {
                if (o.id === id) {
                    o.status = "failed"
                    o.failReason = reason || "Provisioning gagal."
                    o.updatedAt = Date.now()
                }
                return o
            })
        )
        return res.json({ ok: true, status: "failed" })
    }

    // Sukses → terbitkan lisensi (bila belum) + tandai provisioned
    let license = null
    if (!order.licenseKey) {
        license = createLicense({
            plan: order.plan,
            days: Number(days) || 30,
            ownerNumber: ownerNumber || order.contact || "",
            groupJid: groupJid || null,
            groupName: groupName || null,
            note: `Auto-provision order ${order.id}`
        })
    }

    update("orders", (list) =>
        list.map((o) => {
            if (o.id === id) {
                o.status = "provisioned"
                o.provisioning = true
                o.groupJid = groupJid || o.groupJid
                o.groupName = groupName || o.groupName
                o.members = members ?? o.members
                if (license) o.licenseKey = license.key
                o.updatedAt = Date.now()
            }
            return o
        })
    )

    res.json({ ok: true, status: "provisioned", license })
})

export default router
