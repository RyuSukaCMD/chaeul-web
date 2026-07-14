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
        name: u.name || "User",
        number: maskNumber(u.number),
        joinedAt: u.joinedAt || null
    }))
    res.json({ total: users.length, items: safe })
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

// ─── Buat pesanan sewa (placeholder payment) ───
// body: { plan, groupLink, contact }
router.post("/order", (req, res) => {
    const { plan, groupLink, contact } = req.body || {}
    const p = PLANS[plan]
    if (!p) return res.status(400).json({ ok: false, error: "Paket tidak valid." })
    if (!groupLink || !/chat\.whatsapp\.com\//i.test(groupLink)) {
        return res.status(400).json({ ok: false, error: "Link grup WhatsApp tidak valid." })
    }

    const order = {
        id: "ORD-" + nanoid(8).toUpperCase(),
        plan: p.id,
        planName: p.name,
        price: p.price,
        groupLink,
        contact: contact || null,
        status: "pending", // pending → paid → provisioned
        createdAt: Date.now()
    }
    update("orders", (list) => {
        list.push(order)
        return list
    })

    res.json({
        ok: true,
        order,
        // Info untuk halaman payment placeholder
        payment: {
            method: "placeholder",
            amount: p.price,
            note: "Integrasi payment gateway menyusul. Sementara, hubungi owner untuk konfirmasi."
        }
    })
})

function maskNumber(n = "") {
    const s = String(n).replace(/[^0-9]/g, "")
    if (s.length < 6) return s.replace(/\d/g, "•")
    return s.slice(0, 4) + "••••" + s.slice(-3)
}

export default router
