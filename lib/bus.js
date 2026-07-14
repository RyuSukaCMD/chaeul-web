import { EventEmitter } from "events"

// Event bus terpusat untuk push real-time (SSE).
// Event: "update" (stats/list berubah), "fishing" (tangkapan baru).
const bus = new EventEmitter()
bus.setMaxListeners(0)

export default bus
