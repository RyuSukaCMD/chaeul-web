import express from "express"
import { read, update } from "../lib/db.js"
import { nanoid } from "nanoid"

const router = express.Router()

// Paket sewa (harga dalam Rupiah / bulan)
export const PLANS = {
    private: { id: "private", name: "Private Group", price: 10000, maxMembers: 3 },
    public: { id: "public", name: "Public Group", price: 15000, maxMembers: null }
}

// ─── Statistik live (user terdaftar & grup ter-register) ───
router.get("/stats", (req, res) => {
    const users = read("users")
    const groups = read("groups")
    const licenses = read("licenses")
    res.json({
        users: users.length,
        groups: groups.length,
        activeLicenses: licenses.filter((l) => l.status === "active").length,
        // ringkasan grup per tipe
        privateGroups: groups.filter((g) => g.type === "private").length,
        publicGroups: groups.filter((g) => g.type === "public").length,
        updatedAt: Date.now()
    })
})

// ─── Daftar user terdaftar (data aman: nama + nomor disamarkan) ───
router.get("/users", (req, res) => {
    const users = read("users")
    const safe = users.slice(-100).map((u) => ({
        // Format tampilan: "62857XXXX - (Nama)"
        display: `${maskNumber(u.number)} - (${u.name || u.username || "User"})`,
        name: u.name || u.username || "User",
        number: maskNumber(u.number),
        joinedAt: u.joinedAt || null
    }))
    res.json({ total: users.length, items: safe })
})

// ─── Fishing broadcast feed (real-time) ───
router.get("/fishing", (req, res) => {
    const feed = read("fishing")
    res.json({ total: feed.length, items: feed.slice(-30) })
})

// ─── Daftar grup ter-register ───
router.get("/groups", (req, res) => {
    const groups = read("groups")
    const safe = groups.slice(-100).map((g) => ({
        name: g.name || "Grup",
        type: g.type || "private",
        members: g.members ?? null,
        registeredAt: g.registeredAt || null
    }))
    res.json({ total: groups.length, items: safe })
})

// ─── Daftar paket ───
router.get("/plans", (req, res) => res.json(Object.values(PLANS)))

// Diskon durasi (bayar lebih lama, lebih hemat)
export const DURATIONS = [
    { months: 1, label: "1 Bulan", discount: 0 },
    { months: 3, label: "3 Bulan", discount: 0.05 },
    { months: 6, label: "6 Bulan", discount: 0.1 },
    { months: 12, label: "1 Tahun", discount: 0.2 }
]
router.get("/durations", (req, res) => res.json(DURATIONS))

// Cek kupon (tanpa membuat order)
// body: { code }
router.post("/coupon/check", (req, res) => {
    const code = (req.body?.code || "").trim().toUpperCase()
    const c = read("coupons").find((x) => x.code === code && x.active !== false)
    if (!c) return res.json({ ok: false, error: "Kupon tidak valid." })
    if (c.expiresAt && Date.now() > c.expiresAt) return res.json({ ok: false, error: "Kupon kadaluarsa." })
    if (c.maxUse && (c.used || 0) >= c.maxUse) return res.json({ ok: false, error: "Kupon habis." })
    res.json({ ok: true, coupon: { code: c.code, percent: c.percent || 0 } })
})

function priceFor(plan, months, couponPercent = 0) {
    const dur = DURATIONS.find((d) => d.months === months) || DURATIONS[0]
    let total = plan.price * dur.months
    total = total * (1 - dur.discount) // diskon durasi
    total = total * (1 - couponPercent / 100) // diskon kupon
    return Math.round(total)
}

// ─── Buat pesanan sewa ───
// body: { plan, groupLink, contact, months?, coupon? }
router.post("/order", (req, res) => {
    const { plan, groupLink, contact, months, coupon } = req.body || {}
    const p = PLANS[plan]
    if (!p) return res.status(400).json({ ok: false, error: "Paket tidak valid." })
    if (!groupLink || !/chat\.whatsapp\.com\//i.test(groupLink)) {
        return res.status(400).json({ ok: false, error: "Link grup WhatsApp tidak valid." })
    }
    const mo = DURATIONS.find((d) => d.months === Number(months)) ? Number(months) : 1

    // Validasi kupon
    let couponCode = null
    let couponPercent = 0
    if (coupon) {
        const code = String(coupon).trim().toUpperCase()
        const c = read("coupons").find((x) => x.code === code && x.active !== false)
        if (c && (!c.expiresAt || Date.now() <= c.expiresAt) && (!c.maxUse || (c.used || 0) < c.maxUse)) {
            couponCode = c.code
            couponPercent = c.percent || 0
            update("coupons", (list) =>
                list.map((x) => (x.code === c.code ? { ...x, used: (x.used || 0) + 1 } : x))
            )
        }
    }

    const price = priceFor(p, mo, couponPercent)
    const order = {
        id: "ORD-" + nanoid(8).toUpperCase(),
        plan: p.id,
        planName: p.name,
        months: mo,
        price,
        coupon: couponCode,
        couponPercent,
        groupLink,
        contact: contact || null,
        status: "pending",
        createdAt: Date.now()
    }
    update("orders", (list) => {
        list.push(order)
        return list
    })

    res.json({ ok: true, order })
})

// Format "62857XXXX": tampilkan 5 digit awal, sisanya disamarkan jadi X.
function maskNumber(n = "") {
    const s = String(n).replace(/[^0-9]/g, "")
    if (s.length <= 5) return s
    return s.slice(0, 5) + "X".repeat(Math.max(4, s.length - 5))
}

export default router
