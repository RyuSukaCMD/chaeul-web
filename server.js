import express from "express"
import cors from "cors"
import path from "path"
import { fileURLToPath } from "url"
import { read } from "./lib/db.js"
import bus from "./lib/bus.js"
import publicRoutes from "./routes/public.js"
import licenseRoutes from "./routes/license.js"
import syncRoutes from "./routes/sync.js"
import adminRoutes from "./routes/admin.js"
import provisionRoutes from "./routes/provision.js"
import paymentRoutes from "./routes/payment.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: "2mb" }))

// API
app.use("/api", publicRoutes)
app.use("/api/license", licenseRoutes)
app.use("/api/sync", syncRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/provision", provisionRoutes)
app.use("/api/payment", paymentRoutes)

// ─── Live updates via Server-Sent Events ───
// Frontend subscribe /api/live untuk menerima stats real-time.
const clients = new Set()
app.get("/api/live", (req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*"
    })
    res.write("retry: 5000\n\n")
    clients.add(res)
    // Kirim snapshot awal (stats + list + fishing feed)
    sendEvent(res, "stats", currentStats())
    sendEvent(res, "lists", currentLists())
    sendEvent(res, "fishinit", { items: read("fishing").slice(-15) })
    req.on("close", () => clients.delete(res))
})

function currentStats() {
    const users = read("users")
    const groups = read("groups")
    const licenses = read("licenses")
    return {
        users: users.length,
        groups: groups.length,
        activeLicenses: licenses.filter((l) => l.status === "active").length,
        privateGroups: groups.filter((g) => g.type === "private").length,
        publicGroups: groups.filter((g) => g.type === "public").length,
        updatedAt: Date.now()
    }
}

// Daftar user & grup untuk feed live (format siap tampil).
function currentLists() {
    const mask = (n = "") => {
        const s = String(n).replace(/[^0-9]/g, "")
        return s.length <= 5 ? s : s.slice(0, 5) + "X".repeat(Math.max(4, s.length - 5))
    }
    const users = read("users")
    const groups = read("groups")
    return {
        userTotal: users.length,
        groupTotal: groups.length,
        users: users.slice(-8).map((u) => ({
            display: `${mask(u.number)} - (${u.name || "User"})`
        })),
        groups: groups.slice(-8).map((g) => ({ name: g.name || "Grup", type: g.type || "private" }))
    }
}

function sendEvent(res, event, data) {
    try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    } catch {}
}

function broadcast(event, data) {
    for (const res of clients) {
        try {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        } catch {
            clients.delete(res)
        }
    }
}

// ── Push real-time dari event bus ──
bus.on("update", () => {
    if (!clients.size) return
    broadcast("stats", currentStats())
    broadcast("lists", currentLists())
})
bus.on("fishing", (entry) => {
    if (!clients.size) return
    broadcast("fishing", entry)
    broadcast("stats", currentStats())
})

// Keep-alive SSE (comment ping) tiap 20 detik
setInterval(() => {
    for (const res of clients) {
        try {
            res.write(`: ping\n\n`)
        } catch {
            clients.delete(res)
        }
    }
}, 20000)

// Static frontend
app.use(express.static(path.join(__dirname, "public")))
// Halaman admin dashboard
app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"))
})
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"))
})

app.listen(PORT, () => {
    console.log(`\n  ✦ Chaeul Web berjalan di http://localhost:${PORT}`)
    console.log(`  ✦ API: /api/stats  /api/live(SSE)  /api/license/verify  /api/sync/all\n`)
})
