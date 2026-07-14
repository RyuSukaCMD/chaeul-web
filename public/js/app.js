;(() => {
    const D = window.CHAEUL_DATA
    const $ = (s, r = document) => r.querySelector(s)
    const $$ = (s, r = document) => [...r.querySelectorAll(s)]
    const rp = (n) => "Rp " + Number(n).toLocaleString("id-ID")

    let PLANS = {
        private: { id: "private", name: "Private Group", price: 10000, maxMembers: 3 },
        public: { id: "public", name: "Public Group", price: 15000, maxMembers: null }
    }
    let DURATIONS = [
        { months: 1, label: "1 Bulan", discount: 0 },
        { months: 3, label: "3 Bulan", discount: 0.05 },
        { months: 6, label: "6 Bulan", discount: 0.1 },
        { months: 12, label: "1 Tahun", discount: 0.2 }
    ]
    fetch("/api/durations")
        .then((r) => r.json())
        .then((d) => {
            if (Array.isArray(d) && d.length) DURATIONS = d
        })
        .catch(() => {})

    // ─── Year ───
    $("#year").textContent = new Date().getFullYear()

    // ─── Navbar scroll ───
    const nav = $("#nav")
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 30)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })

    // ─── Mobile nav ───
    const toggle = $("#navToggle")
    const links = $(".nav-links")
    toggle?.addEventListener("click", () => links.classList.toggle("open"))
    $$(".nav-links a").forEach((a) => a.addEventListener("click", () => links.classList.remove("open")))

    // ─── Reveal on scroll ───
    const io = new IntersectionObserver(
        (entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) {
                    e.target.classList.add("visible")
                    io.unobserve(e.target)
                }
            })
        },
        { threshold: 0.12 }
    )
    $$(".reveal").forEach((el) => io.observe(el))

    // ─── Render features ───
    $("#featureGrid").innerHTML = D.features
        .map(
            (f) => `
        <div class="feature-card reveal">
            <div class="feature-ico">${f.icon}</div>
            <h3>${f.title}</h3>
            <p>${f.desc}</p>
        </div>`
        )
        .join("")

    // spotlight hover on feature cards
    $$(".feature-card").forEach((card) => {
        card.addEventListener("mousemove", (e) => {
            const r = card.getBoundingClientRect()
            card.style.setProperty("--mx", `${e.clientX - r.left}px`)
            card.style.setProperty("--my", `${e.clientY - r.top}px`)
        })
    })

    // ─── Render steps ───
    $("#steps").innerHTML = D.steps
        .map(
            (s, i) => `
        <div class="step reveal">
            <div class="step-num">0${i + 1}</div>
            <h4>${s.t}</h4>
            <p>${s.d}</p>
        </div>`
        )
        .join("")

    // ─── Render pricing ───
    function renderPricing() {
        const feats = {
            private: [
                "Bot pribadi untuk 1 grup",
                "Maksimal 3 anggota grup",
                "Semua 240+ command aktif",
                "Prioritas support",
                "Uptime tinggi 24/7"
            ],
            public: [
                "Bot untuk grup publik",
                "Anggota grup tanpa batas",
                "Semua 240+ command aktif",
                "Anti-spam & antilink",
                "Uptime tinggi 24/7"
            ]
        }
        $("#priceGrid").innerHTML = Object.values(PLANS)
            .map((p) => {
                const featured = p.id === "public"
                return `
            <div class="price-card ${featured ? "featured" : ""} reveal">
                ${featured ? '<span class="price-tag">POPULER</span>' : ""}
                <div class="price-name">${p.name}</div>
                <div class="price-amount">${rp(p.price)}<small> /bulan</small></div>
                <div class="price-desc">${
                    p.id === "private"
                        ? "Cocok untuk grup kecil & privat."
                        : "Cocok untuk komunitas & grup ramai."
                }</div>
                <ul class="price-feats">
                    ${feats[p.id].map((f) => `<li><span class="check">✓</span> ${f}</li>`).join("")}
                </ul>
                <button class="btn btn-primary" data-order="${p.id}">Sewa ${p.name}</button>
            </div>`
            })
            .join("")
        // re-observe new reveals + wire order buttons
        $$("#priceGrid .reveal").forEach((el) => io.observe(el))
        $$("[data-order]").forEach((b) =>
            b.addEventListener("click", () => openOrder(b.dataset.order))
        )
    }
    renderPricing()

    // ─── Animated chat mockup ───
    const chatBody = $("#chatBody")
    let ci = 0
    function pushBubble() {
        if (ci >= D.chat.length) {
            setTimeout(() => {
                chatBody.innerHTML = ""
                ci = 0
                pushBubble()
            }, 3500)
            return
        }
        const c = D.chat[ci++]
        const b = document.createElement("div")
        b.className = `bubble ${c.side}`
        b.textContent = c.text
        chatBody.appendChild(b)
        chatBody.scrollTop = chatBody.scrollHeight
        setTimeout(pushBubble, c.side === "out" ? 700 : 1400)
    }
    pushBubble()

    // ─── Counters ───
    function animateCounter(el, target) {
        const start = Number(el.dataset.counter) || 0
        if (start === target) return
        el.dataset.counter = target
        const dur = 900
        const t0 = performance.now()
        function tick(t) {
            const p = Math.min((t - t0) / dur, 1)
            const eased = 1 - Math.pow(1 - p, 3)
            el.textContent = Math.round(start + (target - start) * eased).toLocaleString("id-ID")
            if (p < 1) requestAnimationFrame(tick)
            else {
                el.textContent = target.toLocaleString("id-ID")
                if (target > start) {
                    el.classList.add("flash")
                    setTimeout(() => el.classList.remove("flash"), 600)
                }
            }
        }
        requestAnimationFrame(tick)
    }

    // ─── Live data (SSE real-time + polling fallback) ───
    const iconFor = (name) => (name || "?").trim().charAt(0).toUpperCase() || "?"

    // User: format "62857XXXX - (Nama)"
    function renderUsers(items, total) {
        $("#liveUsersCount").textContent = total
        const ul = $("#liveUsers")
        if (!items.length) {
            ul.innerHTML = `<div class="empty">Belum ada user terdaftar.</div>`
            return
        }
        ul.innerHTML = items
            .slice(-7)
            .reverse()
            .map((u) => {
                const disp = u.display || `${u.number || "•••"} - (${u.name || "User"})`
                return `
            <li class="live-item">
                <div class="av">${iconFor(u.name)}</div>
                <div class="meta">
                    <div class="t1 mono-num">${escapeHtml(disp)}</div>
                </div>
            </li>`
            })
            .join("")
    }
    // Grup: nama grup saja
    function renderGroups(items, total) {
        $("#liveGroupsCount").textContent = total
        const ul = $("#liveGroups")
        if (!items.length) {
            ul.innerHTML = `<div class="empty">Belum ada grup ter-register.</div>`
            return
        }
        ul.innerHTML = items
            .slice(-7)
            .reverse()
            .map(
                (g) => `
            <li class="live-item">
                <div class="av">${iconFor(g.name)}</div>
                <div class="meta"><div class="t1">${escapeHtml(g.name)}</div></div>
                <span class="tag ${g.type === "public" ? "public" : "private"}">${g.type || "private"}</span>
            </li>`
            )
            .join("")
    }
    // Fishing feed
    const fishFeed = []
    function renderFishing() {
        const ul = $("#liveFishing")
        if (!ul) return
        if (!fishFeed.length) {
            ul.innerHTML = `<div class="empty">Menunggu tangkapan...</div>`
            return
        }
        ul.innerHTML = fishFeed
            .slice(-7)
            .reverse()
            .map((f) => {
                const r = (f.rarity || "common").toLowerCase()
                const val = f.value ? `+Rp ${Number(f.value).toLocaleString("id-ID")}` : ""
                return `
            <li class="fish-item">
                <span class="fi-dot r-${r}"></span>
                <div class="fi-meta">
                    <div class="fi-name">${escapeHtml(f.fish)}</div>
                    <div class="fi-who">${escapeHtml(f.name)}${f.island ? " · " + escapeHtml(f.island) : ""}</div>
                </div>
                <span class="fi-val">${val}</span>
            </li>`
            })
            .join("")
    }
    function pushFish(f) {
        fishFeed.push(f)
        while (fishFeed.length > 20) fishFeed.shift()
        renderFishing()
    }

    function applyStats(s) {
        animateCounter($("#statUsers"), s.users || 0)
        animateCounter($("#statGroups"), s.groups || 0)
        animateCounter($("#statLic"), s.activeLicenses || 0)
    }

    async function loadLists() {
        try {
            const [u, g, f] = await Promise.all([
                fetch("/api/users").then((r) => r.json()),
                fetch("/api/groups").then((r) => r.json()),
                fetch("/api/fishing").then((r) => r.json())
            ])
            renderUsers(u.items || [], u.total || 0)
            renderGroups(g.items || [], g.total || 0)
            fishFeed.length = 0
            ;(f.items || []).forEach((x) => fishFeed.push(x))
            renderFishing()
        } catch {
            renderUsers([], 0)
            renderGroups([], 0)
            renderFishing()
        }
    }

    function initLive() {
        let sseOk = false
        try {
            const es = new EventSource("/api/live")
            es.addEventListener("stats", (ev) => {
                sseOk = true
                try {
                    applyStats(JSON.parse(ev.data))
                } catch {}
            })
            es.addEventListener("lists", (ev) => {
                try {
                    const d = JSON.parse(ev.data)
                    renderUsers(d.users || [], d.userTotal || 0)
                    renderGroups(d.groups || [], d.groupTotal || 0)
                } catch {}
            })
            es.addEventListener("fishinit", (ev) => {
                try {
                    const d = JSON.parse(ev.data)
                    fishFeed.length = 0
                    ;(d.items || []).forEach((x) => fishFeed.push(x))
                    renderFishing()
                } catch {}
            })
            es.addEventListener("fishing", (ev) => {
                try {
                    pushFish(JSON.parse(ev.data))
                } catch {}
            })
            es.onerror = () => {}
        } catch {}

        // Snapshot awal + polling fallback (kalau SSE gagal)
        const poll = async () => {
            try {
                const s = await fetch("/api/stats").then((r) => r.json())
                if (!sseOk) applyStats(s)
            } catch {}
            if (!sseOk) await loadLists()
        }
        poll()
        loadLists()
        setInterval(poll, 8000)
    }
    initLive()

    // ─── Order modal ───
    const modal = $("#orderModal")
    const modalBody = $("#modalBody")

    function openModal() {
        modal.classList.add("open")
        modal.setAttribute("aria-hidden", "false")
        document.body.style.overflow = "hidden"
    }
    function closeModal() {
        modal.classList.remove("open")
        modal.setAttribute("aria-hidden", "true")
        document.body.style.overflow = ""
    }
    $$("[data-close]").forEach((el) => el.addEventListener("click", closeModal))
    document.addEventListener("keydown", (e) => e.key === "Escape" && closeModal())

    function openOrder(planId) {
        const p = PLANS[planId]
        if (!p) return
        modalBody.innerHTML = `
            <h3>Sewa ${p.name}</h3>
            <p class="modal-sub">Lengkapi data grup untuk melanjutkan.</p>
            <div class="summary">
                <div>
                    <div class="s-name">${p.name}</div>
                    <div style="color:var(--faint);font-size:.82rem">${
                        p.id === "private" ? "Maks 3 anggota" : "Tanpa batas anggota"
                    }</div>
                </div>
                <div class="s-price">${rp(p.price)}<small style="font-size:.7rem;color:var(--faint)">/bln</small></div>
            </div>
            <div class="field">
                <label>Link Grup WhatsApp</label>
                <input id="fGroup" type="url" placeholder="https://chat.whatsapp.com/..." autocomplete="off" />
                <div class="hint">${
                    p.id === "private"
                        ? "Grup akan dicek: maksimal 3 anggota."
                        : "Grup publik, anggota bebas."
                }</div>
                <div class="err" id="errGroup">Link grup tidak valid.</div>
            </div>
            <div class="field">
                <label>Nomor WhatsApp kamu (untuk konfirmasi)</label>
                <input id="fContact" type="text" placeholder="628xxxxxxxxxx" autocomplete="off" />
            </div>
            <div class="field">
                <label>Durasi Sewa</label>
                <div class="dur-grid" id="durGrid"></div>
            </div>
            <div class="field">
                <label>Kode Kupon (opsional)</label>
                <div class="coupon-row">
                    <input id="fCoupon" type="text" placeholder="KODE" autocomplete="off" style="text-transform:uppercase" />
                    <button class="btn btn-ghost btn-sm" id="applyCoupon" type="button">Pakai</button>
                </div>
                <div class="hint" id="couponMsg"></div>
            </div>
            <div class="total-row">
                <span>Total</span>
                <span class="total-amt" id="totalAmt">${rp(p.price)}</span>
            </div>
            <button class="btn btn-primary" id="submitOrder" style="width:100%;justify-content:center">
                Lanjut ke Pembayaran
                <svg viewBox="0 0 24 24" class="ico"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </button>`
        openModal()

        // Render duration options + total calculator
        let selMonths = 1
        let couponPercent = 0
        let couponCode = null
        renderDurations()
        function renderDurations() {
            $("#durGrid").innerHTML = DURATIONS.map(
                (d) => `<button type="button" class="dur-opt ${d.months === selMonths ? "active" : ""}" data-mo="${d.months}">
                    ${d.label}${d.discount ? `<span class="dur-off">-${d.discount * 100}%</span>` : ""}
                </button>`
            ).join("")
            $$("#durGrid .dur-opt").forEach((b) =>
                b.addEventListener("click", () => {
                    selMonths = Number(b.dataset.mo)
                    renderDurations()
                    calcTotal()
                })
            )
        }
        function calcTotal() {
            const dur = DURATIONS.find((d) => d.months === selMonths) || DURATIONS[0]
            let t = p.price * dur.months * (1 - dur.discount) * (1 - couponPercent / 100)
            $("#totalAmt").textContent = rp(Math.round(t))
        }
        $("#applyCoupon").addEventListener("click", async () => {
            const code = $("#fCoupon").value.trim().toUpperCase()
            if (!code) return
            const r = await fetch("/api/coupon/check", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code })
            }).then((x) => x.json())
            const msg = $("#couponMsg")
            if (r.ok) {
                couponPercent = r.coupon.percent
                couponCode = r.coupon.code
                msg.textContent = `✅ Kupon -${couponPercent}% diterapkan!`
                msg.style.color = "var(--green)"
            } else {
                couponPercent = 0
                couponCode = null
                msg.textContent = "⚠️ " + (r.error || "Kupon tidak valid.")
                msg.style.color = "#f87171"
            }
            calcTotal()
        })

        $("#submitOrder").addEventListener("click", () =>
            submitOrder(planId, selMonths, couponCode)
        )
    }

    async function submitOrder(planId, months = 1, coupon = null) {
        const groupLink = $("#fGroup").value.trim()
        const contact = $("#fContact").value.trim()
        const err = $("#errGroup")
        if (!/chat\.whatsapp\.com\//i.test(groupLink)) {
            err.style.display = "block"
            return
        }
        err.style.display = "none"
        const btn = $("#submitOrder")
        btn.disabled = true
        btn.textContent = "Memproses..."

        let data
        try {
            data = await fetch("/api/order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: planId, groupLink, contact, months, coupon })
            }).then((r) => r.json())
        } catch {
            data = { ok: false, error: "Server tidak dapat dihubungi." }
        }

        if (!data.ok) {
            btn.disabled = false
            btn.textContent = "Lanjut ke Pembayaran"
            toast("⚠️ " + (data.error || "Gagal membuat pesanan."))
            return
        }
        await showPayment(data.order)
    }

    async function showPayment(order) {
        toast("✅ Pesanan " + order.id + " dibuat!")
        // Coba buat pembayaran lewat gateway (Midtrans/Xendit) bila aktif.
        let pay = { mode: "placeholder", amount: order.price }
        try {
            pay = await fetch("/api/payment/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: order.id })
            }).then((r) => r.json())
        } catch {}

        // Xendit → redirect ke invoice
        if (pay.mode === "xendit" && pay.invoice_url) {
            modalBody.innerHTML = payShell(order, pay.amount, `
                <a class="btn btn-primary" style="width:100%;justify-content:center"
                   href="${pay.invoice_url}" target="_blank" rel="noopener">💳 Bayar Sekarang</a>`)
            return
        }

        // Midtrans → buka Snap popup bila script tersedia, else redirect_url
        if (pay.mode === "midtrans" && pay.token) {
            modalBody.innerHTML = payShell(order, pay.amount, `
                <button class="btn btn-primary" id="snapBtn" style="width:100%;justify-content:center">💳 Bayar Sekarang</button>`)
            $("#snapBtn").addEventListener("click", () => {
                if (window.snap) window.snap.pay(pay.token)
                else if (pay.redirect_url) window.open(pay.redirect_url, "_blank")
            })
            return
        }

        // Placeholder → konfirmasi manual via WhatsApp
        modalBody.innerHTML = payShell(
            order,
            pay.amount || order.price,
            `<a class="btn btn-primary" style="width:100%;justify-content:center"
                href="https://wa.me/6285800360340?text=${encodeURIComponent(
                    `Halo, saya mau bayar sewa bot.\nOrder: ${order.id}\nPaket: ${order.planName}\nGrup: ${order.groupLink}`
                )}" target="_blank" rel="noopener">💬 Konfirmasi via WhatsApp</a>`,
            pay.note || "Selesaikan pembayaran lalu konfirmasi ke owner."
        )
    }

    function payShell(order, amount, actionHtml, note) {
        return `
            <h3>Pembayaran</h3>
            <p class="modal-sub">Pesanan berhasil dibuat. Selesaikan pembayaran.</p>
            <div class="pay-box">
                <div style="color:var(--muted);font-size:.9rem">Total tagihan</div>
                <div class="big">${rp(amount)}</div>
                <div class="order-id">${order.id}</div>
                <p style="color:var(--muted);font-size:.86rem;margin-bottom:18px">
                    ${note || "Klik tombol di bawah untuk melanjutkan pembayaran."}
                </p>
                ${actionHtml}
            </div>`
    }

    // ─── Toast ───
    let toastTimer
    function toast(msg) {
        const t = $("#toast")
        t.textContent = msg
        t.classList.add("show")
        clearTimeout(toastTimer)
        toastTimer = setTimeout(() => t.classList.remove("show"), 3200)
    }

    function escapeHtml(s) {
        return String(s || "").replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
        )
    }

    // load plans from API (override defaults if available)
    fetch("/api/plans")
        .then((r) => r.json())
        .then((list) => {
            if (Array.isArray(list) && list.length) {
                PLANS = {}
                list.forEach((p) => (PLANS[p.id] = p))
                renderPricing()
            }
        })
        .catch(() => {})
})()
