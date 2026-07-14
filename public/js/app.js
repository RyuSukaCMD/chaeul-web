;(() => {
    const D = window.CHAEUL_DATA
    const $ = (s, r = document) => r.querySelector(s)
    const $$ = (s, r = document) => [...r.querySelectorAll(s)]
    const rp = (n) => "Rp " + Number(n).toLocaleString("id-ID")

    let PLANS = {
        private: { id: "private", name: "Private Group", price: 10000, maxMembers: 3 },
        public: { id: "public", name: "Public Group", price: 15000, maxMembers: null }
    }

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

    // ─── Live data (SSE + polling fallback) ───
    const iconFor = (name) => (name || "?").trim().charAt(0).toUpperCase() || "?"

    function renderUsers(items, total) {
        $("#liveUsersCount").textContent = total
        const ul = $("#liveUsers")
        if (!items.length) {
            ul.innerHTML = `<div class="empty">Belum ada user terdaftar.</div>`
            return
        }
        ul.innerHTML = items
            .slice(-6)
            .reverse()
            .map(
                (u) => `
            <li class="live-item">
                <div class="av">${iconFor(u.name)}</div>
                <div class="meta">
                    <div class="t1">${escapeHtml(u.name)}</div>
                    <div class="t2">${u.number || "•••"}</div>
                </div>
            </li>`
            )
            .join("")
    }
    function renderGroups(items, total) {
        $("#liveGroupsCount").textContent = total
        const ul = $("#liveGroups")
        if (!items.length) {
            ul.innerHTML = `<div class="empty">Belum ada grup ter-register.</div>`
            return
        }
        ul.innerHTML = items
            .slice(-6)
            .reverse()
            .map(
                (g) => `
            <li class="live-item">
                <div class="av">${iconFor(g.name)}</div>
                <div class="meta">
                    <div class="t1">${escapeHtml(g.name)}</div>
                    <div class="t2">${g.members != null ? g.members + " anggota" : "grup"}</div>
                </div>
                <span class="tag ${g.type === "public" ? "public" : "private"}">${g.type || "private"}</span>
            </li>`
            )
            .join("")
    }

    function applyStats(s) {
        animateCounter($("#statUsers"), s.users || 0)
        animateCounter($("#statGroups"), s.groups || 0)
        animateCounter($("#statLic"), s.activeLicenses || 0)
    }

    async function loadLists() {
        try {
            const [u, g] = await Promise.all([
                fetch("/api/users").then((r) => r.json()),
                fetch("/api/groups").then((r) => r.json())
            ])
            renderUsers(u.items || [], u.total || 0)
            renderGroups(g.items || [], g.total || 0)
        } catch {
            // Demo fallback bila backend belum jalan (mis. preview statis)
            renderUsers([], 0)
            renderGroups([], 0)
        }
    }

    function initLive() {
        // Coba SSE dulu
        let sseOk = false
        try {
            const es = new EventSource("/api/live")
            es.addEventListener("stats", (ev) => {
                sseOk = true
                try {
                    applyStats(JSON.parse(ev.data))
                } catch {}
            })
            es.onerror = () => {
                /* fallback polling tetap jalan */
            }
        } catch {}

        // Snapshot awal + polling ringan (juga sebagai fallback SSE)
        const poll = async () => {
            try {
                const s = await fetch("/api/stats").then((r) => r.json())
                if (!sseOk) applyStats(s)
            } catch {}
            await loadLists()
        }
        poll()
        setInterval(poll, 6000)
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
            <button class="btn btn-primary" id="submitOrder" style="width:100%;justify-content:center">
                Lanjut ke Pembayaran
                <svg viewBox="0 0 24 24" class="ico"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </button>`
        openModal()
        $("#submitOrder").addEventListener("click", () => submitOrder(planId))
    }

    async function submitOrder(planId) {
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
                body: JSON.stringify({ plan: planId, groupLink, contact })
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
        showPayment(data.order, data.payment)
    }

    function showPayment(order, payment) {
        modalBody.innerHTML = `
            <h3>Pembayaran</h3>
            <p class="modal-sub">Pesanan berhasil dibuat. Selesaikan pembayaran.</p>
            <div class="pay-box">
                <div style="color:var(--muted);font-size:.9rem">Total tagihan</div>
                <div class="big">${rp(payment.amount)}</div>
                <div class="order-id">${order.id}</div>
                <p style="color:var(--muted);font-size:.86rem;margin-bottom:18px">
                    ${payment.note}
                </p>
                <a class="btn btn-primary" style="width:100%;justify-content:center"
                   href="https://wa.me/6285800360340?text=${encodeURIComponent(
                       `Halo, saya mau bayar sewa bot.\nOrder: ${order.id}\nPaket: ${order.planName}\nGrup: ${order.groupLink}`
                   )}" target="_blank" rel="noopener">
                    💬 Konfirmasi via WhatsApp
                </a>
            </div>`
        toast("✅ Pesanan " + order.id + " dibuat!")
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
