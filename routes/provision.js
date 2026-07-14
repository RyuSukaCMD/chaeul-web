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
