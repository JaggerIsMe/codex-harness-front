export const passwordHint = '12–64 字符，包含字母和数字，UTF-8 不超过 72 字节。'
export function passwordError(password: string, confirmation: string): string {
  if (password !== confirmation) return '两次输入的密码不一致'
  if (
    password.length < 12 ||
    password.length > 64 ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    new TextEncoder().encode(password).length > 72
  )
    return passwordHint
  return ''
}
