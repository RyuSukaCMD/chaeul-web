import crypto from "crypto"
import { read, write, update } from "./db.js"

// ═══════════════════════════════════════════════════════════
//  SISTEM LISENSI BOT
//  Struktur license:
//   {
//     key, ownerNumber, plan ("private"|"public"),
//     groupJid, groupName, maxMembers,
//     status ("active"|"suspended"|"expired"|"revoked"),
//     createdAt, expiresAt, lastHeartbeat, heartbeatCount, note
//   }
// ═══════════════════════════════════════════════════════════

const norm = (n = "") => String(n).replace(/[^0-9]/g, "")

/** Buat kunci lisensi format CHAEUL-XXXX-XXXX-XXXX. */
export function genKey() {
    const seg = () => crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 4)
    return `CHAEUL-${seg()}-${seg()}-${seg()}`
}

/**
 * Buat lisensi baru (dipanggil owner lewat bot / API admin).
 * @param {object} opt { ownerNumber, plan, groupJid, groupName, days, maxMembers, note }
 */
export function createLicense(opt = {}) {
    const key = genKey()
    const now = Date.now()
    const days = Number(opt.days) || 30
    const lic = {
        key,
        ownerNumber: norm(opt.ownerNumber),
        plan: opt.plan === "public" ? "public" : "private",
        groupJid: opt.groupJid || null,
        groupName: opt.groupName || null,
        maxMembers: opt.plan === "public" ? null : Number(opt.maxMembers) || 3,
        status: "active",
        createdAt: now,
        expiresAt: now + days * 86400000,
        lastHeartbeat: null,
        heartbeatCount: 0,
        note: opt.note || ""
    }
    update("licenses", (list) => {
        list.push(lic)
        return list
    })
    return lic
}

export function getLicense(key) {
    return read("licenses").find((l) => l.key === key) || null
}

export function listLicenses() {
    return read("licenses")
}

/** Auto-expire bila lewat tanggal. */
function withExpiry(lic) {
    if (!lic) return null
    if (lic.status === "active" && lic.expiresAt && Date.now() > lic.expiresAt) {
        lic.status = "expired"
        update("licenses", (list) => list.map((l) => (l.key === lic.key ? lic : l)))
    }
    return lic
}

/**
 * Verifikasi lisensi (dipakai bot saat start & heartbeat).
 * @returns {{ valid, license, reason }}
 */
export function verifyLicense(key, meta = {}) {
    let lic = withExpiry(getLicense(key))
    if (!lic) return { valid: false, reason: "Lisensi tidak ditemukan." }
    if (lic.status !== "active")
        return { valid: false, reason: `Lisensi ${lic.status}.`, license: lic }

    // Opsional: kunci lisensi ke grup tertentu
    if (lic.groupJid && meta.groupJid && lic.groupJid !== meta.groupJid) {
        return { valid: false, reason: "Lisensi tidak cocok untuk grup ini.", license: lic }
    }

    // Catat heartbeat
    lic.lastHeartbeat = Date.now()
    lic.heartbeatCount = (lic.heartbeatCount || 0) + 1
    if (meta.version) lic.botVersion = meta.version
    update("licenses", (list) => list.map((l) => (l.key === lic.key ? lic : l)))

    return { valid: true, license: lic }
}

export function setStatus(key, status) {
    let found = null
    update("licenses", (list) =>
        list.map((l) => {
            if (l.key === key) {
                l.status = status
                found = l
            }
            return l
        })
    )
    return found
}

export function extendLicense(key, days) {
    let found = null
    update("licenses", (list) =>
        list.map((l) => {
            if (l.key === key) {
                const base = Math.max(l.expiresAt || Date.now(), Date.now())
                l.expiresAt = base + Number(days) * 86400000
                if (l.status === "expired") l.status = "active"
                found = l
            }
            return l
        })
    )
    return found
}

export function revokeLicense(key) {
    return setStatus(key, "revoked")
}

export function deleteLicense(key) {
    let ok = false
    update("licenses", (list) => {
        const next = list.filter((l) => l.key !== key)
        ok = next.length !== list.length
        return next
    })
    return ok
}

/** Status heartbeat: online bila heartbeat terakhir < 8 jam lalu. */
export function isOnline(lic) {
    if (!lic?.lastHeartbeat) return false
    return Date.now() - lic.lastHeartbeat < 8 * 3600000
}

export default {
    genKey,
    createLicense,
    getLicense,
    listLicenses,
    verifyLicense,
    setStatus,
    extendLicense,
    revokeLicense,
    deleteLicense,
    isOnline
}
