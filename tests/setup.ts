// jsdom has no Web Locks; model the browser's exclusive asynchronous lock for integration tests.
let pending: Promise<unknown> = Promise.resolve()
Object.defineProperty(navigator, 'locks', {
  configurable: true,
  value: {
    request(_name: string, operation: () => Promise<unknown>) {
      const result = pending.then(operation, operation)
      pending = result.catch(() => {})
      return result
    },
  },
})
