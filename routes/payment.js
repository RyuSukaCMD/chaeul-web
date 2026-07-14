import express from "express"
import crypto from "crypto"
import { read, update } from "../lib/db.js"

const router = express.Router()

// ═══════════════════════════════════════════════════════════
//  PAYMENT — mendukung Midtrans (Snap) & Xendit (Invoice).
//  Aktif otomatis bila env key di-set; jika tidak → mode placeholder.
//    MIDTRANS_SERVER_KEY=...   (mode midtrans)
//    XENDIT_SECRET_KEY=...     (mode xendit)
//    PAYMENT_MODE=midtrans|xendit|placeholder (opsional, auto-deteksi)
// ═══════════════════════════════════════════════════════════

function mode() {
    if (process.env.PAYMENT_MODE) return process.env.PAYMENT_MODE
    if (process.env.MIDTRANS_SERVER_KEY) return "midtrans"
    if (process.env.XENDIT_SECRET_KEY) return "xendit"
    return "placeholder"
}

// ─── Buat pembayaran untuk sebuah order ───
// body: { orderId }
router.post("/create", async (req, res) => {
    const { orderId } = req.body || {}
    const order = read("orders").find((o) => o.id === orderId)
    if (!order) return res.status(404).json({ ok: false, error: "Order tidak ditemukan." })

    const m = mode()
    try {
        if (m === "midtrans") return res.json(await midtransSnap(order))
        if (m === "xendit") return res.json(await xenditInvoice(order))
        // placeholder
        return res.json({
            ok: true,
            mode: "placeholder",
            amount: order.price,
            orderId: order.id,
            note: "Payment gateway belum dikonfigurasi. Hubungi owner untuk konfirmasi manual."
        })
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message })
    }
})

// ─── Midtrans Snap ───
async function midtransSnap(order) {
    const serverKey = process.env.MIDTRANS_SERVER_KEY
    const isProd = process.env.MIDTRANS_PRODUCTION === "true"
    const url = isProd
        ? "https://app.midtrans.com/snap/v1/transactions"
        : "https://app.sandbox.midtrans.com/snap/v1/transactions"
    const auth = Buffer.from(serverKey + ":").toString("base64")
    const r = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Basic ${auth}`
        },
        body: JSON.stringify({
            transaction_details: { order_id: order.id, gross_amount: order.price },
            item_details: [{ id: order.plan, price: order.price, quantity: 1, name: order.planName }],
            customer_details: { phone: order.contact || "" }
        })
    })
    const data = await r.json()
    if (!data.token) throw new Error(data.error_messages?.join(", ") || "Gagal membuat transaksi Midtrans.")
    return { ok: true, mode: "midtrans", token: data.token, redirect_url: data.redirect_url, amount: order.price }
}

// ─── Xendit Invoice ───
async function xenditInvoice(order) {
    const key = process.env.XENDIT_SECRET_KEY
    const auth = Buffer.from(key + ":").toString("base64")
    const r = await fetch("https://api.xendit.co/v2/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
        body: JSON.stringify({
            external_id: order.id,
            amount: order.price,
            description: `Sewa ${order.planName}`,
            success_redirect_url: (process.env.PUBLIC_URL || "") + "/?paid=" + order.id
        })
    })
    const data = await r.json()
    if (!data.invoice_url) throw new Error(data.message || "Gagal membuat invoice Xendit.")
    return { ok: true, mode: "xendit", invoice_url: data.invoice_url, amount: order.price }
}

// ─── WEBHOOK Midtrans ───
router.post("/webhook/midtrans", (req, res) => {
    const b = req.body || {}
    const serverKey = process.env.MIDTRANS_SERVER_KEY || ""
    // Verifikasi signature
    const expected = crypto
        .createHash("sha512")
        .update(`${b.order_id}${b.status_code}${b.gross_amount}${serverKey}`)
        .digest("hex")
    if (serverKey && b.signature_key && b.signature_key !== expected) {
        return res.status(403).json({ ok: false, error: "Signature invalid" })
    }
    const paid = ["capture", "settlement"].includes(b.transaction_status)
    if (paid) markPaid(b.order_id)
    res.json({ ok: true })
})

// ─── WEBHOOK Xendit ───
router.post("/webhook/xendit", (req, res) => {
    const token = req.headers["x-callback-token"]
    if (process.env.XENDIT_CALLBACK_TOKEN && token !== process.env.XENDIT_CALLBACK_TOKEN) {
        return res.status(403).json({ ok: false, error: "Token invalid" })
    }
    const b = req.body || {}
    if (b.status === "PAID") markPaid(b.external_id)
    res.json({ ok: true })
})

function markPaid(orderId) {
    update("orders", (list) =>
        list.map((o) => {
            if (o.id === orderId && o.status === "pending") {
                o.status = "paid"
                o.paidAt = Date.now()
                o.updatedAt = Date.now()
            }
            return o
        })
    )
}

// Info mode aktif (untuk frontend)
router.get("/mode", (req, res) => res.json({ mode: mode() }))

export default router
