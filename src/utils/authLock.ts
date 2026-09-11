export const AUTH_LOCK_UNAVAILABLE =
  '当前环境无法安全管理登录，请使用 HTTPS 或 localhost，并使用支持 Web Locks 的新版浏览器。'
export function supportsAuthLock() {
  return Boolean(navigator.locks?.request)
}

export async function withAuthLock<T>(operation: () => Promise<T>): Promise<T> {
  if (!supportsAuthLock()) throw new Error(AUTH_LOCK_UNAVAILABLE)
  return await navigator.locks.request('harness-auth-session', operation)
}
