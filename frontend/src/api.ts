import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('stoa_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Redirect to login on 401 — but only for protected API calls, not auth/me itself
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || ''
    const is401 = err.response?.status === 401
    const isAuthMe = url.includes('/auth/me')
    if (is401 && !isAuthMe) {
      localStorage.removeItem('stoa_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// ── Types ─────────────────────────────────────────────────────────────────────

export type Role = 'admin' | 'user'
export type AuthProvider = 'local' | 'oauth'

export interface User {
  id: string
  username: string
  email?: string
  role: Role
  authProvider: AuthProvider
  createdAt: string
  lastLogin?: string
}

export interface Group {
  id: string
  name: string
  description?: string
  createdAt: string
  users?: User[]
  tags?: Tag[]
}

export interface Tag {
  id: string
  name: string
  color: string
  createdAt: string
}

export interface OAuthConfig {
  clientId: string
  clientSecret?: string
  issuerUrl: string
  redirectUrl: string
}

export interface SetupRequest {
  adminUsername: string
  adminPassword: string
  appUrl: string
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  setupStatus: () => api.get<{ needsSetup: boolean }>('/setup/status'),
  setupInit: (data: SetupRequest) => api.post('/setup/init', data),
  login: (username: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<User>('/auth/me'),
  meWithToken: (token: string) => api.get<User>('/auth/me', {
    headers: { Authorization: `Bearer ${token}` }
  }),
  oauthLoginUrl: () => '/api/auth/oauth/login',
}

// ── Users ─────────────────────────────────────────────────────────────────────

export const usersApi = {
  list: () => api.get<User[]>('/users'),
  get: (id: string) => api.get<User>(`/users/${id}`),
  updateRole: (id: string, role: Role) => api.put(`/users/${id}/role`, { role }),
  delete: (id: string) => api.delete(`/users/${id}`),
}

// ── Groups ────────────────────────────────────────────────────────────────────

export const groupsApi = {
  list: () => api.get<Group[]>('/groups'),
  get: (id: string) => api.get<Group>(`/groups/${id}`),
  create: (name: string, description?: string) =>
    api.post<Group>('/groups', { name, description }),
  delete: (id: string) => api.delete(`/groups/${id}`),
  addUser: (groupId: string, userId: string) =>
    api.post(`/groups/${groupId}/users`, { userId }),
  removeUser: (groupId: string, userId: string) =>
    api.delete(`/groups/${groupId}/users/${userId}`),
  addTag: (groupId: string, tagId: string) =>
    api.post(`/groups/${groupId}/tags`, { tagId }),
  removeTag: (groupId: string, tagId: string) =>
    api.delete(`/groups/${groupId}/tags/${tagId}`),
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export const tagsApi = {
  list: () => api.get<Tag[]>('/tags'),
  create: (name: string, color?: string) => api.post<Tag>('/tags', { name, color }),
  delete: (id: string) => api.delete(`/tags/${id}`),
}

// ── Config ────────────────────────────────────────────────────────────────────

export const configApi = {
  getOAuth: () => api.get<OAuthConfig>('/config/oauth'),
  saveOAuth: (data: OAuthConfig) => api.put('/config/oauth', data),
}
