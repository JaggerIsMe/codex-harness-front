/** Batch deltas without dropping frames; producers cannot grow the pending queue without bound. */
export function createDeltaBuffer<T>(consume: (items: T[]) => void, delay = 50, capacity = 256) {
  let pending: T[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  function flush() {
    if (timer) clearTimeout(timer)
    timer = undefined
    if (!pending.length) return
    const batch = pending
    pending = []
    consume(batch)
  }
  function push(item: T) {
    pending.push(item)
    if (pending.length >= capacity) flush()
    else if (!timer) timer = setTimeout(flush, delay)
  }
  function clear() {
    if (timer) clearTimeout(timer)
    timer = undefined
    pending = []
  }
  return { push, flush, clear }
}
