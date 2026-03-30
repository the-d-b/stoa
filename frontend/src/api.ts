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
  initialTags?: { name: string; color: string }[]
  initialGroups?: { name: string; tagNames: string[] }[]
  defaultGroupName?: string
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
  updateColor: (id: string, color: string) => api.put(`/tags/${id}`, { color }),
  delete: (id: string) => api.delete(`/tags/${id}`),
}

// ── Config ────────────────────────────────────────────────────────────────────

export const configApi = {
  getOAuth: () => api.get<OAuthConfig>('/config/oauth'),
  saveOAuth: (data: OAuthConfig) => api.put('/config/oauth', data),
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────

export interface BookmarkNode {
  id: string
  parentId?: string
  path: string
  name: string
  type: 'section' | 'bookmark'
  url?: string
  iconUrl?: string
  sortOrder: number
  scope: 'shared' | 'personal'
  createdAt: string
  children?: BookmarkNode[]
}

export const bookmarksApi = {
  tree: () => api.get<BookmarkNode[]>('/bookmarks'),
  subtree: (id: string) => api.get<BookmarkNode>(`/bookmarks/${id}/subtree`),
  create: (data: { parentId?: string; name: string; type: 'section' | 'bookmark'; url?: string; iconUrl?: string }) =>
    api.post<BookmarkNode>('/bookmarks', data),
  update: (id: string, data: { name: string; url?: string; iconUrl?: string; sortOrder?: number }) =>
    api.put(`/bookmarks/${id}`, data),
  delete: (id: string) => api.delete(`/bookmarks/${id}`),
  scrapeFavicon: (url: string) => api.get<{ iconUrl: string }>(`/bookmarks/favicon?url=${encodeURIComponent(url)}`),
  move: (id: string, newParentId: string | null) =>
    api.put(`/bookmarks/${id}/move`, { newParentId: newParentId || '' }),
  cacheIcon: (url: string) =>
    api.post<{ iconUrl: string }>('/bookmarks/cache-icon', { url }),
}

// ── Personal Bookmarks ───────────────────────────────────────────────────────

export const myBookmarksApi = {
  tree: () => api.get<BookmarkNode[]>('/my/bookmarks'),
  create: (data: { parentId?: string; name: string; type: 'section' | 'bookmark'; url?: string }) =>
    api.post<BookmarkNode>('/my/bookmarks', data),
  update: (id: string, data: { name: string; url?: string; iconUrl?: string; sortOrder?: number }) =>
    api.put(`/my/bookmarks/${id}`, data),
  delete: (id: string) => api.delete(`/my/bookmarks/${id}`),
  move: (id: string, newParentId: string | null) =>
    api.put(`/my/bookmarks/${id}/move`, { newParentId: newParentId || '' }),
  subtree: (id: string) => api.get<BookmarkNode>(`/my/bookmarks/${id}/subtree`),
}

export const myPanelsApi = {
  create: (data: { type: string; title: string; config: string }) =>
    api.post<Panel>('/my/panels', { ...data, scope: 'personal' }),
  delete: (id: string) => api.delete(`/my/panels/${id}`),
  update: (id: string, data: { title: string; config: string }) =>
    api.put(`/my/panels/${id}`, data),
}

// ── Panels ────────────────────────────────────────────────────────────────────

export interface Panel {
  id: string
  type: string
  title: string
  config: string
  scope: 'shared' | 'personal'
  tags: Tag[]
  position: number
  createdAt: string
}

export const panelsApi = {
  list: (wallId?: string) => api.get<Panel[]>('/panels' + (wallId ? `?wall_id=${wallId}` : '')),  
  create: (data: { type: string; title: string; config: string }) => api.post<Panel>('/panels', data),
  update: (id: string, data: { title: string; config: string }) => api.put(`/panels/${id}`, data),
  delete: (id: string) => api.delete(`/panels/${id}`),
  addTag: (panelId: string, tagId: string) => api.post(`/panels/${panelId}/tags`, { tagId }),
  removeTag: (panelId: string, tagId: string) => api.delete(`/panels/${panelId}/tags/${tagId}`),
  updateOrder: (wallId: string | null, order: { panelId: string; position: number }[]) =>
    api.put('/panels/order', { wallId: wallId || '', order }),
}

// ── Walls ─────────────────────────────────────────────────────────────────────

export interface WallTag {
  tagId: string
  name: string
  color: string
  active: boolean
}

export interface Wall {
  id: string
  userId: string
  name: string
  isDefault: boolean
  createdAt: string
  tags: WallTag[]
}

export const wallsApi = {
  list: () => api.get<Wall[]>('/walls'),
  create: (name: string, isDefault?: boolean) => api.post<Wall>('/walls', { name, isDefault }),
  delete: (id: string) => api.delete(`/walls/${id}`),
  setTagActive: (wallId: string, tagId: string, active: boolean) =>
    api.put(`/walls/${wallId}/tags/${tagId}`, { active }),
}

// ── Preferences ───────────────────────────────────────────────────────────────

export interface UserPreferences {
  userId: string
  theme: string
  dateFormat: string
  avatarUrl?: string
}

export const prefsApi = {
  get: () => api.get<UserPreferences>('/preferences'),
  save: (data: Partial<UserPreferences>) => api.put('/preferences', data),
}

// ── OAuth test ────────────────────────────────────────────────────────────────

export const oauthTestApi = {
  test: (issuerUrl: string) => api.post<{ ok: boolean; error?: string; issuer?: string; authURL?: string }>(
    '/auth/oauth/test', { issuerUrl }
  ),
}
