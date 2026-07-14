import express from "express"
import cors from "cors"
import path from "path"
import { fileURLToPath } from "url"
import { read } from "./lib/db.js"
import publicRoutes from "./routes/public.js"
import licenseRoutes from "./routes/license.js"
import syncRoutes from "./routes/sync.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: "2mb" }))

// API
app.use("/api", publicRoutes)
app.use("/api/license", licenseRoutes)
app.use("/api/sync", syncRoutes)

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
    // Kirim snapshot awal
    sendStats(res)
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

function sendStats(res) {
    try {
        res.write(`event: stats\ndata: ${JSON.stringify(currentStats())}\n\n`)
    } catch {}
}

// Broadcast stats tiap 5 detik (ringan; hanya bila ada client)
let lastPayload = ""
setInterval(() => {
    if (!clients.size) return
    const payload = JSON.stringify(currentStats())
    // Kirim juga heartbeat SSE agar koneksi tetap hidup
    for (const res of clients) {
        try {
            res.write(`event: stats\ndata: ${payload}\n\n`)
        } catch {
            clients.delete(res)
        }
    }
    lastPayload = payload
}, 5000)

// Static frontend
app.use(express.static(path.join(__dirname, "public")))
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"))
})

app.listen(PORT, () => {
    console.log(`\n  ✦ Chaeul Web berjalan di http://localhost:${PORT}`)
    console.log(`  ✦ API: /api/stats  /api/live(SSE)  /api/license/verify  /api/sync/all\n`)
})
