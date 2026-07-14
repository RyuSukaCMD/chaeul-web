;(() => {
    const $ = (s, r = document) => r.querySelector(s)
    const $$ = (s, r = document) => [...r.querySelectorAll(s)]
    const rp = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID")
    let TOKEN = sessionStorage.getItem("chaeul_admin") || ""
    let DATA = { stats: {}, licenses: [], orders: [] }

    // ─── API helper ───
    async function api(path, method = "GET", body) {
        const opt = { method, headers: { "x-admin-token": TOKEN } }
        if (body) {
            opt.headers["Content-Type"] = "application/json"
            opt.body = JSON.stringify(body)
        }
        const r = await fetch(path, opt)
        return r.json()
    }

    // ─── Login ───
    async function tryLogin(token) {
        const r = await fetch("/api/admin/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token })
        }).then((x) => x.json())
        return r.ok
    }

    $("#loginBtn").addEventListener("click", async () => {
        const t = $("#tokenInput").value.trim()
        const ok = await tryLogin(t)
        if (!ok) {
            $("#loginErr").style.display = "block"
            return
        }
        TOKEN = t
        sessionStorage.setItem("chaeul_admin", t)
        enterDash()
    })
    $("#tokenInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter") $("#loginBtn").click()
    })

    function enterDash() {
        $("#loginScreen").style.display = "none"
        $("#dash").style.display = "grid"
        loadAll()
        clearInterval(window.__poll)
        window.__poll = setInterval(loadAll, 8000)
    }

    $("#logoutBtn").addEventListener("click", () => {
        sessionStorage.removeItem("chaeul_admin")
        location.reload()
    })

    // ─── Tabs ───
    const TAB_INFO = {
        overview: ["Overview", "Ringkasan real-time bot & lisensi."],
        licenses: ["Lisensi", "Kelola semua lisensi bot."],
        orders: ["Pesanan", "Pesanan sewa masuk dari website."],
        coupons: ["Kupon", "Kelola kode diskon."]
    }
    $$(".side-link[data-tab]").forEach((b) =>
        b.addEventListener("click", () => {
            $$(".side-link").forEach((x) => x.classList.remove("active"))
            b.classList.add("active")
            const tab = b.dataset.tab
            $$(".tab").forEach((t) => (t.style.display = "none"))
            $("#tab-" + tab).style.display = "block"
            $("#tabTitle").textContent = TAB_INFO[tab][0]
            $("#tabSub").textContent = TAB_INFO[tab][1]
        })
    )
    $("#refreshBtn").addEventListener("click", loadAll)

    // ─── Load & render ───
    async function loadAll() {
        const r = await api("/api/admin/overview")
        if (!r.ok) {
            if (r.error === "Unauthorized") {
                sessionStorage.removeItem("chaeul_admin")
                location.reload()
            }
            return
        }
        DATA = r
        renderKPI(r.stats)
        renderCharts(r.history || [])
        renderBots(r.licenses)
        renderLicenses(r.licenses)
        renderOrders(r.orders)
        loadCoupons()
    }

    // ─── Coupons ───
    async function loadCoupons() {
        const r = await api("/api/admin/coupons")
        if (!r.ok) return
        renderCoupons(r.items || [])
    }
    function renderCoupons(items) {
        const body = $("#cpnBody")
        if (!body) return
        if (!items.length) {
            body.innerHTML = `<tr><td colspan="5" class="empty-tbl">Belum ada kupon.</td></tr>`
            return
        }
        body.innerHTML = items
            .map((c) => {
                const exp = c.expiresAt ? fmtDate(c.expiresAt) : "Tak terbatas"
                const use = c.maxUse ? `${c.used || 0}/${c.maxUse}` : `${c.used || 0}/∞`
                return `<tr>
                <td class="mono">${c.code}</td>
                <td>${c.percent}%</td>
                <td>${use}</td>
                <td style="font-size:.82rem;color:var(--muted)">${exp}</td>
                <td><div class="row-actions">
                    <button class="mini-btn danger" data-cpn-del="${c.code}">Hapus</button>
                </div></td>
            </tr>`
            })
            .join("")
        $$("[data-cpn-del]").forEach((b) =>
            b.addEventListener("click", async () => {
                if (!confirm("Hapus kupon " + b.dataset.cpnDel + "?")) return
                await api("/api/admin/coupon/delete", "POST", { code: b.dataset.cpnDel })
                toast("🗑️ Kupon dihapus")
                loadCoupons()
            })
        )
    }

    // ─── SVG Charts (no dependency) ───
    function lineChart(el, series, opts = {}) {
        const W = 500,
            H = 170,
            pad = 8
        if (!series.length || series.every((s) => !s.data.some((v) => v > 0))) {
            el.innerHTML = `<div class="chart-empty">Belum ada data.</div>`
            return
        }
        const n = series[0].data.length
        const allVals = series.flatMap((s) => s.data)
        const max = Math.max(...allVals, 1)
        const xStep = n > 1 ? (W - pad * 2) / (n - 1) : 0
        const y = (v) => H - pad - (v / max) * (H - pad * 2)
        const x = (i) => pad + i * xStep

        let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`
        // gridlines
        for (let g = 0; g <= 3; g++) {
            const gy = pad + (g / 3) * (H - pad * 2)
            svg += `<line x1="${pad}" y1="${gy}" x2="${W - pad}" y2="${gy}" stroke="rgba(255,255,255,.06)" stroke-width="1"/>`
        }
        series.forEach((s) => {
            const pts = s.data.map((v, i) => `${x(i)},${y(v)}`).join(" ")
            // area fill
            const area = `${pad},${H - pad} ${pts} ${x(n - 1)},${H - pad}`
            svg += `<polygon points="${area}" fill="${s.color}" opacity="0.08"/>`
            svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
            // last point dot
            const li = n - 1
            svg += `<circle cx="${x(li)}" cy="${y(s.data[li])}" r="4" fill="${s.color}"/>`
        })
        svg += `</svg>`
        el.innerHTML = svg
    }

    function renderCharts(history) {
        // Pastikan minimal 2 titik biar garisnya kelihatan
        const h = history.length === 1 ? [{ ...history[0] }, history[0]] : history
        const users = h.map((x) => x.users || 0)
        const groups = h.map((x) => x.groups || 0)
        const rev = h.map((x) => x.revenue || 0)

        lineChart($("#growthChart"), [
            { data: users, color: "#7c9cff" },
            { data: groups, color: "#5eead4" }
        ])
        lineChart($("#revenueChart"), [{ data: rev, color: "#b98cff" }])
    }

    function renderKPI(s) {
        const cards = [
            { ic: "👥", n: s.users, l: "User Terdaftar" },
            { ic: "💬", n: s.groups, l: "Grup Aktif" },
            { ic: "🔑", n: s.activeLicenses, l: "Lisensi Aktif" },
            { ic: "🟢", n: s.onlineBots, l: "Bot Online" },
            { ic: "🧾", n: s.orders, l: "Total Pesanan" },
            { ic: "⏳", n: s.pendingOrders, l: "Pesanan Pending" },
            { ic: "💰", n: rp(s.revenue), l: "Pendapatan", raw: true },
            { ic: "📦", n: s.licenses, l: "Total Lisensi" }
        ]
        $("#kpiGrid").innerHTML = cards
            .map(
                (c) => `
            <div class="kpi">
                <div class="kpi-ico">${c.ic}</div>
                <div class="kpi-num">${c.raw ? c.n : Number(c.n || 0).toLocaleString("id-ID")}</div>
                <div class="kpi-label">${c.l}</div>
            </div>`
            )
            .join("")
    }

    function renderBots(licenses) {
        const el = $("#botStatus")
        const active = licenses.filter((l) => l.status === "active")
        if (!active.length) {
            el.innerHTML = `<div class="empty-tbl">Belum ada bot aktif.</div>`
            return
        }
        el.innerHTML = active
            .map((l) => {
                const hb = l.lastHeartbeat
                    ? "Heartbeat: " + timeAgo(l.lastHeartbeat)
                    : "Belum ada heartbeat"
                return `<div class="mini-row">
                <span class="stat-dot ${l.online ? "on" : "off"}"></span>
                <span class="mono">${l.key}</span>
                <span style="color:var(--faint)">·</span>
                <span>${l.plan}</span>
                <span style="margin-left:auto;color:var(--faint);font-size:.82rem">${hb}</span>
            </div>`
            })
            .join("")
    }

    function renderLicenses(licenses) {
        const body = $("#licBody")
        if (!licenses.length) {
            body.innerHTML = `<tr><td colspan="7" class="empty-tbl">Belum ada lisensi.</td></tr>`
            return
        }
        body.innerHTML = licenses
            .map((l) => {
                return `<tr>
                <td><span class="mono copy-key" data-copy="${l.key}" title="Klik untuk salin">${l.key}</span></td>
                <td>${l.plan}</td>
                <td class="mono">${l.ownerNumber || "-"}</td>
                <td><span class="st ${l.status}">${l.status}</span></td>
                <td><span class="stat-dot ${l.online ? "on" : "off"}"></span></td>
                <td style="font-size:.82rem;color:var(--muted)">${l.expiresAt ? fmtDate(l.expiresAt) : "-"}</td>
                <td>
                    <div class="row-actions">
                        <button class="mini-btn" data-lic-extend="${l.key}">+30h</button>
                        ${
                            l.status === "active"
                                ? `<button class="mini-btn" data-lic-suspend="${l.key}">Suspend</button>`
                                : `<button class="mini-btn ok" data-lic-activate="${l.key}">Aktifkan</button>`
                        }
                        <button class="mini-btn danger" data-lic-revoke="${l.key}">Revoke</button>
                    </div>
                </td>
            </tr>`
            })
            .join("")
        wireLicenseActions()
    }

    function renderOrders(orders) {
        const body = $("#ordBody")
        if (!orders.length) {
            body.innerHTML = `<tr><td colspan="7" class="empty-tbl">Belum ada pesanan.</td></tr>`
            return
        }
        body.innerHTML = orders
            .map((o) => {
                const link = o.groupLink
                    ? `<a href="${o.groupLink}" target="_blank" style="color:var(--brand)">link ↗</a>`
                    : "-"
                return `<tr>
                <td class="mono">${o.id}</td>
                <td>${o.planName || o.plan}</td>
                <td>${link}</td>
                <td class="mono">${o.contact || "-"}</td>
                <td>${rp(o.price)}</td>
                <td><span class="st ${o.status}">${o.status}</span>${
                    o.licenseKey ? `<div class="mono" style="font-size:.72rem;color:var(--faint);margin-top:4px">${o.licenseKey}</div>` : ""
                }</td>
                <td>
                    <div class="row-actions">
                        ${
                            o.status === "pending"
                                ? `<button class="mini-btn" data-ord-paid="${o.id}">Tandai Bayar</button>
                                   <button class="mini-btn ok" data-ord-approve="${o.id}">Terbitkan</button>
                                   <button class="mini-btn" data-ord-queue="${o.id}">Auto-Provision</button>`
                                : o.status === "paid"
                                  ? `<button class="mini-btn ok" data-ord-approve="${o.id}">Terbitkan Lisensi</button>
                                     <button class="mini-btn" data-ord-queue="${o.id}">Auto-Provision</button>`
                                  : o.status === "approved"
                                    ? `<span style="color:var(--faint);font-size:.78rem">⏳ menunggu bot...</span>`
                                    : o.status === "failed"
                                      ? `<button class="mini-btn" data-ord-queue="${o.id}">Coba Lagi</button>`
                                      : ""
                        }
                        <button class="mini-btn danger" data-ord-del="${o.id}">Hapus</button>
                    </div>
                </td>
            </tr>`
            })
            .join("")
        wireOrderActions()
    }

    // ─── Actions ───
    function wireLicenseActions() {
        $$("[data-copy]").forEach((el) =>
            el.addEventListener("click", () => {
                navigator.clipboard?.writeText(el.dataset.copy)
                toast("🔑 Key disalin!")
            })
        )
        $$("[data-lic-extend]").forEach((b) =>
            b.addEventListener("click", async () => {
                await fetch("/api/license/extend", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-admin-token": TOKEN },
                    body: JSON.stringify({ key: b.dataset.licExtend, days: 30 })
                })
                toast("✅ Diperpanjang 30 hari")
                loadAll()
            })
        )
        $$("[data-lic-suspend]").forEach((b) =>
            b.addEventListener("click", () => setLicStatus(b.dataset.licSuspend, "suspended"))
        )
        $$("[data-lic-activate]").forEach((b) =>
            b.addEventListener("click", () => setLicStatus(b.dataset.licActivate, "active"))
        )
        $$("[data-lic-revoke]").forEach((b) =>
            b.addEventListener("click", async () => {
                if (!confirm("Revoke lisensi ini? Bot akan berhenti.")) return
                await fetch("/api/license/revoke", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-admin-token": TOKEN },
                    body: JSON.stringify({ key: b.dataset.licRevoke })
                })
                toast("🚫 Lisensi dicabut")
                loadAll()
            })
        )
    }
    async function setLicStatus(key, status) {
        await fetch("/api/license/status", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-token": TOKEN },
            body: JSON.stringify({ key, status })
        })
        toast("✅ Status: " + status)
        loadAll()
    }

    function wireOrderActions() {
        $$("[data-ord-paid]").forEach((b) =>
            b.addEventListener("click", async () => {
                await api("/api/admin/order/status", "POST", { id: b.dataset.ordPaid, status: "paid" })
                toast("💰 Ditandai sudah bayar")
                loadAll()
            })
        )
        $$("[data-ord-approve]").forEach((b) =>
            b.addEventListener("click", async () => {
                const r = await api("/api/admin/order/approve", "POST", { id: b.dataset.ordApprove, days: 30 })
                if (r.ok) toast("🔑 Lisensi terbit: " + r.license.key)
                else toast("⚠️ " + (r.error || "Gagal"))
                loadAll()
            })
        )
        $$("[data-ord-queue]").forEach((b) =>
            b.addEventListener("click", async () => {
                const r = await api("/api/admin/order/queue", "POST", { id: b.dataset.ordQueue })
                if (r.ok) toast("🤖 Diantre — bot akan join grup & terbitkan lisensi")
                else toast("⚠️ Gagal")
                loadAll()
            })
        )
        $$("[data-ord-del]").forEach((b) =>
            b.addEventListener("click", async () => {
                if (!confirm("Hapus pesanan ini?")) return
                await api("/api/admin/order/delete", "POST", { id: b.dataset.ordDel })
                toast("🗑️ Pesanan dihapus")
                loadAll()
            })
        )
    }

    // ─── New license modal ───
    // ─── New coupon modal ───
    $("#newCouponBtn").addEventListener("click", () => {
        $("#modalBody").innerHTML = `
            <h3>Buat Kupon</h3>
            <p class="modal-sub">Kode diskon untuk pelanggan.</p>
            <div class="field">
                <label>Kode Kupon</label>
                <input id="ncCode" placeholder="HEMAT20" style="text-transform:uppercase" />
            </div>
            <div class="field">
                <label>Diskon (%)</label>
                <input id="ncPercent" type="number" value="10" min="0" max="100" />
            </div>
            <div class="field">
                <label>Maks Pemakaian (0 = tak terbatas)</label>
                <input id="ncMax" type="number" value="0" min="0" />
            </div>
            <div class="field">
                <label>Berlaku (hari, 0 = selamanya)</label>
                <input id="ncDays" type="number" value="0" min="0" />
            </div>
            <button class="btn btn-primary" id="ncSubmit" style="width:100%;justify-content:center">Buat Kupon</button>`
        openModal()
        $("#ncSubmit").addEventListener("click", async () => {
            const code = $("#ncCode").value.trim().toUpperCase()
            if (!code) return toast("⚠️ Kode wajib diisi")
            const r = await api("/api/admin/coupon/create", "POST", {
                code,
                percent: parseInt($("#ncPercent").value, 10) || 0,
                maxUse: parseInt($("#ncMax").value, 10) || 0,
                days: parseInt($("#ncDays").value, 10) || 0
            })
            if (r.ok) {
                closeModal()
                toast("🎟️ Kupon " + code + " dibuat")
                loadCoupons()
            } else toast("⚠️ " + (r.error || "Gagal"))
        })
    })

    $("#newLicBtn").addEventListener("click", () => {
        $("#modalBody").innerHTML = `
            <h3>Buat Lisensi</h3>
            <p class="modal-sub">Terbitkan lisensi baru untuk bot.</p>
            <div class="field">
                <label>Paket</label>
                <select id="nlPlan">
                    <option value="private">Private Group (maks 3)</option>
                    <option value="public">Public Group</option>
                </select>
            </div>
            <div class="field">
                <label>Nomor Owner (WA)</label>
                <input id="nlOwner" placeholder="628xxxxxxxxxx" />
            </div>
            <div class="field">
                <label>Durasi (hari)</label>
                <input id="nlDays" type="number" value="30" />
            </div>
            <div class="field">
                <label>Grup JID (opsional, kunci ke grup)</label>
                <input id="nlGroup" placeholder="1203xxxx@g.us" />
            </div>
            <button class="btn btn-primary" id="nlSubmit" style="width:100%;justify-content:center">Buat Lisensi</button>`
        openModal()
        $("#nlSubmit").addEventListener("click", async () => {
            const body = {
                plan: $("#nlPlan").value,
                ownerNumber: $("#nlOwner").value.trim(),
                days: parseInt($("#nlDays").value, 10) || 30,
                groupJid: $("#nlGroup").value.trim() || null
            }
            const r = await fetch("/api/license/create", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-token": TOKEN },
                body: JSON.stringify(body)
            }).then((x) => x.json())
            if (r.ok) {
                closeModal()
                toast("🔑 Lisensi dibuat: " + r.license.key)
                loadAll()
            } else toast("⚠️ Gagal membuat lisensi")
        })
    })

    // ─── Modal + toast ───
    const modal = $("#modal")
    function openModal() {
        modal.classList.add("open")
        document.body.style.overflow = "hidden"
    }
    function closeModal() {
        modal.classList.remove("open")
        document.body.style.overflow = ""
    }
    $$("[data-close]").forEach((el) => el.addEventListener("click", closeModal))
    document.addEventListener("keydown", (e) => e.key === "Escape" && closeModal())

    let toastTimer
    function toast(msg) {
        const t = $("#toast")
        t.textContent = msg
        t.classList.add("show")
        clearTimeout(toastTimer)
        toastTimer = setTimeout(() => t.classList.remove("show"), 3000)
    }

    // ─── Helpers ───
    function fmtDate(ts) {
        return new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
    }
    function timeAgo(ts) {
        const s = Math.floor((Date.now() - ts) / 1000)
        if (s < 60) return s + " dtk lalu"
        if (s < 3600) return Math.floor(s / 60) + " mnt lalu"
        if (s < 86400) return Math.floor(s / 3600) + " jam lalu"
        return Math.floor(s / 86400) + " hari lalu"
    }

    // Auto-login bila token tersimpan
    if (TOKEN) {
        tryLogin(TOKEN).then((ok) => {
            if (ok) enterDash()
            else sessionStorage.removeItem("chaeul_admin")
        })
    }
})()
