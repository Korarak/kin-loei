const TOKEN_KEY = 'kinloei_token'
const USER_KEY  = 'kinloei_user'

export const getToken = () => localStorage.getItem(TOKEN_KEY)

export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') }
  catch { return null }
}

export function isLoggedIn() {
  const t = getToken()
  if (!t) return false
  try {
    const { exp } = JSON.parse(atob(t.split('.')[1]))
    return exp * 1000 > Date.now()
  } catch { return false }
}

export const authHeader = () => {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

// อัพบาง field ของ user ใน localStorage โดยไม่ต้องรู้ token
export function patchUser(fields) {
  const u = getUser()
  if (!u) return
  localStorage.setItem(USER_KEY, JSON.stringify({ ...u, ...fields }))
}
