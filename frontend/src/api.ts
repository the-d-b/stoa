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
  scope: string
  createdBy: string
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
  create: (data: { name: string; color?: string; scope?: string } | string, color?: string) => {
    if (typeof data === 'string') return api.post<Tag>('/tags', { name: data, color })
    return api.post<Tag>('/tags', data)
  },
  update: (id: string, data: { name?: string; color?: string }) => api.put(`/tags/${id}`, data),
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

// ── Glyphs ───────────────────────────────────────────────────────────────────

export interface Glyph {
  id: string
  type: string
  zone: string
  position: number
  config: string
  enabled: boolean
  createdAt: string
}

export interface Ticker {
  id: string
  type: string
  zone: string
  position: number
  symbols: string
  config: string
  enabled: boolean
  createdAt: string
}

export const glyphsApi = {
  list: () => api.get<Glyph[]>('/glyphs'),
  create: (data: { type: string; zone: string; position?: number; config?: string }) =>
    api.post<{ id: string }>('/glyphs', data),
  update: (id: string, data: Partial<{ zone: string; position: number; config: string; enabled: boolean }>) =>
    api.put(`/glyphs/${id}`, data),
  delete: (id: string) => api.delete(`/glyphs/${id}`),
  getData: (id: string) => api.get<any>(`/glyphs/${id}/data`),
}

export const tickersApi = {
  list: () => api.get<Ticker[]>('/tickers'),
  create: (data: { type: string; zone: string; symbols?: string; config?: string }) =>
    api.post<{ id: string }>('/tickers', data),
  update: (id: string, data: Partial<{ zone: string; position: number; symbols: string; config: string; enabled: boolean }>) =>
    api.put(`/tickers/${id}`, data),
  delete: (id: string) => api.delete(`/tickers/${id}`),
  getData: (id: string) => api.get<any[]>(`/tickers/${id}/data`),
}

// ── Integrations ─────────────────────────────────────────────────────────────

export interface Integration {
  id: string
  name: string
  type: string
  apiUrl: string
  uiUrl: string
  secretId: string | null
  scope: string
  enabled: boolean
  createdBy: string
  createdAt: string
  groups: string[]
}

export const integrationsApi = {
  list: () => api.get<Integration[]>('/integrations'),
  create: (data: { name: string; type: string; apiUrl: string; uiUrl?: string; secretId?: string; scope?: string }) =>
    api.post<{ id: string }>('/integrations', data),
  update: (id: string, data: Partial<{ name: string; apiUrl: string; uiUrl: string; secretId: string; enabled: boolean }>) =>
    api.put(`/integrations/${id}`, data),
  delete: (id: string) => api.delete(`/integrations/${id}`),
  test: (data: { type: string; apiUrl: string; secretId?: string }) =>
    api.post<{ ok: boolean; error?: string }>('/integrations/test', data),
  setGroups: (id: string, groupIds: string[]) =>
    api.put(`/integrations/${id}/groups`, { groupIds }),
  getPanelData: (panelId: string) => api.get<any>(`/panels/${panelId}/data`),
}

// ── Preferences ──────────────────────────────────────────────────────────────

export const preferencesApi = {
  get: () => api.get<{ theme: string; avatarUrl: string; density: string }>('/preferences'),
  save: (data: { theme?: string; density?: string }) => api.put('/preferences', data),
}

// ── Profile ──────────────────────────────────────────────────────────────────

export const profileApi = {
  get: () => api.get<{
    id: string; username: string; email: string;
    role: string; authProvider: string; avatarUrl: string
  }>('/profile'),
  update: (data: { email: string }) => api.put('/profile', data),
  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('avatar', file)
    return api.post<{ avatarUrl: string }>('/profile/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
}

// ── Secrets ──────────────────────────────────────────────────────────────────

export interface Secret {
  id: string
  name: string
  scope: 'shared' | 'personal'
  createdBy: string
  createdAt: string
  groups: string[]
}

export const secretsApi = {
  list: () => api.get<Secret[]>('/secrets'),
  create: (data: { name: string; value: string; scope: 'shared' | 'personal' }) =>
    api.post<{ id: string; name: string; scope: string }>('/secrets', data),
  update: (id: string, data: { name: string; value?: string }) =>
    api.put(`/secrets/${id}`, data),
  delete: (id: string) => api.delete(`/secrets/${id}`),
  setGroups: (id: string, groupIds: string[]) =>
    api.put(`/secrets/${id}/groups`, { groupIds }),
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
  getGroups: (id: string) => api.get<string[]>(`/panels/${id}/groups`),
  setGroups: (id: string, groupIds: string[]) => api.put(`/panels/${id}/groups`, { groupIds }),
  delete: (id: string) => api.delete(`/panels/${id}`),
  addTag: (panelId: string, tagId: string) => api.post(`/panels/${panelId}/tags`, { tagId }),
  removeTag: (panelId: string, tagId: string) => api.delete(`/panels/${panelId}/tags/${tagId}`),
  updateOrder: (wallId: string | null, order: { panelId: string; position: number }[]) =>
    api.put('/panels/order', { porticoId: wallId ?? null, order }),
}

// ── Personal Panel Walls ─────────────────────────────────────────────────────

export const personalPanelPorticosApi = {
  get: (panelId: string) => api.get<string[]>(`/panels/${panelId}/porticos`),
  set: (panelId: string, porticoIds: string[]) => api.put(`/panels/${panelId}/porticos`, { porticoIds }),
}

// ── Porticos ───────────────────────────────────────────────────────────────────

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
  layout: string
  columnCount: number
  columnHeight: number
  createdAt: string
  tags: WallTag[]
}

export const porticosApi = {
  list: () => api.get<Wall[]>('/porticos'),
  create: (name: string, isDefault?: boolean) => api.post<Wall>('/porticos', { name, isDefault }),
  delete: (id: string) => api.delete(`/porticos/${id}`),
  updateOrder: (order: { porticoId: string; position: number }[]) => api.put('/porticos/order', order),
  update: (id: string, data: { layout?: string; columnCount?: number; columnHeight?: number }) =>
    api.put(`/porticos/${id}`, data),
  setTagActive: (porticoId: string, tagId: string, active: boolean) =>
    api.put(`/porticos/${porticoId}/tags/${tagId}`, { active }),
}

// ── Glyphs ───────────────────────────────────────────────────────────────────

export interface Glyph {
  id: string
  type: string
  zone: string
  position: number
  config: string
  enabled: boolean
  createdAt: string
}

export interface Ticker {
  id: string
  type: string
  zone: string
  position: number
  symbols: string
  config: string
  enabled: boolean
  createdAt: string
}


// ── Integrations ─────────────────────────────────────────────────────────────

export interface Integration {
  id: string
  name: string
  type: string
  apiUrl: string
  uiUrl: string
  secretId: string | null
  scope: string
  enabled: boolean
  createdBy: string
  createdAt: string
  groups: string[]
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
