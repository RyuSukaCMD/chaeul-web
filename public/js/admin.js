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
        orders: ["Pesanan", "Pesanan sewa masuk dari website."]
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
        renderBots(r.licenses)
        renderLicenses(r.licenses)
        renderOrders(r.orders)
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
