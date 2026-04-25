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

// Redirect to login on 401 — but not for auth endpoints (they handle their own errors)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || ''

    const is401 = err.response?.status === 401
    const isAuthEndpoint = url.includes('/auth/') || url.includes('/setup/')
    const isPublicPage = window.location.pathname === '/reset-password'
    if (is401 && !isAuthEndpoint && !isPublicPage) {
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
  isDefault?: boolean
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
  adminEmail: string
  adminPassword: string
  appUrl: string
  userMode?: 'single' | 'multi'
  autoLogin?: boolean
  initialTags?: { name: string; color: string }[]
  initialGroups?: { name: string; tagNames: string[] }[]
  defaultGroupName?: string
  oauthIssuerUrl?: string
  oauthClientId?: string
  oauthClientSecret?: string
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  setupStatus: () => api.get<{ needsSetup: boolean; userMode: string; autoLogin: boolean; oauthConfigured: boolean }>('/setup/status'),
  autoLogin: () => api.post<{ token: string; user: User }>('/auth/autologin', {}),
  setupInit: (data: SetupRequest) => api.post('/setup/init', data),
  login: (username: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<User>('/auth/me'),
  resetRequest: (email: string) => api.post('/auth/reset-request', { email }),
  resetConfirm: (token: string, password: string) => api.post('/auth/reset-confirm', { token, password }),
  meWithToken: (token: string) => api.get<User>('/auth/me', {
    headers: { Authorization: `Bearer ${token}` }
  }),
  oauthLoginUrl: () => '/api/auth/oauth/login',
}

// ── Users ─────────────────────────────────────────────────────────────────────

export const usersApi = {
  create: (data: { username: string; email?: string; password: string; role?: string }) =>
    api.post('/users', data),
  resetPassword: (id: string, password: string) =>
    api.put(`/users/${id}/password`, { password }),
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
  setDefault: (groupId: string) => api.put(`/groups/${groupId}/default`, {}),
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

export const cssApi = {
  list: () => api.get<{ id: string; name: string; filename: string; createdAt: string }[]>('/css'),
  upload: (name: string, cssText: string) => {
    const form = new FormData()
    form.append('name', name)
    form.append('css', new Blob([cssText], { type: 'text/css' }), name + '.css')
    return api.post<{ id: string; name: string; filename: string }>('/css', form)
  },
  delete: (id: string) => api.delete(`/css/${id}`),
  url: (filename: string) => `/api/css/${filename}`,
}

export const configApi = {
  getOAuth: () => api.get<OAuthConfig>('/config/oauth'),
  saveOAuth: (data: OAuthConfig) => api.put('/config/oauth', data),
  getMode: () => api.get<{ mode: string }>('/config/mode'),
  setMode: (mode: 'single' | 'multi') => api.put('/config/mode', { mode }),
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

export const googleApi = {
  getConfig: () => api.get<{ clientId: string; configured: boolean }>('/google/config'),
  saveConfig: (data: { clientId: string; clientSecret: string }) => api.put('/google/config', data),
  listTokens: (scope: string) => api.get<any[]>(`/auth/google/tokens?scope=${scope}`),
  deleteToken: (id: string) => api.delete(`/auth/google/tokens?id=${id}`),
  listCalendars: (tokenId: string) => api.get<any[]>(`/auth/google/calendars?tokenId=${tokenId}`),
  buildConnectUrl: (clientId: string, scope: string, userId: string) => {
    const redirectUri = window.location.origin + '/api/auth/google/callback'
    const state = `${scope}:${userId}`
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email',
      access_type: 'offline',
      prompt: 'consent',
      state,
    })
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString()
  },
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
  skipTls: boolean
  enabled: boolean
  refreshSecs: number
  createdBy: string
  createdAt: string
  groups: string[]
}

export const integrationsApi = {
  list: () => api.get<Integration[]>('/integrations'),
  create: (data: { name: string; type: string; apiUrl: string; uiUrl?: string; secretId?: string; skipTls?: boolean; refreshSecs?: number; scope?: string }) =>
    api.post<{ id: string }>('/integrations', data),
  update: (id: string, data: Partial<{ name: string; apiUrl: string; uiUrl: string; secretId: string; skipTls: boolean; refreshSecs: number; enabled: boolean }>) =>
    api.put(`/integrations/${id}`, data),
  delete: (id: string) => api.delete(`/integrations/${id}`),
  test: (data: { type: string; apiUrl: string; secretId?: string; skipTls?: boolean }) =>
    api.post<{ ok: boolean; error?: string }>('/integrations/test', data),
  getGroups: (id: string) => api.get<string[]>(`/integrations/${id}/groups`),
  setGroups: (id: string, groupIds: string[]) =>
    api.put(`/integrations/${id}/groups`, { groupIds }),
  getPanelData: (panelId: string, params?: Record<string, string | number>) =>
    api.get<any>(`/panels/${panelId}/data`, { params }),
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
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/profile/password', { currentPassword, newPassword }),
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
  list: () => api.get<Panel[]>('/my/panels'),
  create: (data: { type: string; title: string; config: string }) =>
    api.post<Panel>('/my/panels', { ...data, scope: 'personal' }),
  delete: (id: string) => api.delete(`/my/panels/${id}`),
  update: (id: string, data: { title: string; config: string }) =>
    api.put(`/my/panels/${id}`, data),
}

export const myIntegrationsApi = {
  list: () => api.get<Integration[]>('/my/integrations'),
  update: (id: string, data: Partial<{ name: string; apiUrl: string; uiUrl: string; secretId: string; skipTls: boolean; refreshSecs: number }>) =>
    api.put(`/my/integrations/${id}`, data),
  delete: (id: string) => api.delete(`/my/integrations/${id}`),
}

export const myTagsApi = {
  list: () => api.get<Tag[]>('/my/tags'),
  create: (data: { name: string; color: string }) => api.post<Tag>('/my/tags', data),
  update: (id: string, data: { name: string; color: string }) => api.put(`/my/tags/${id}`, data),
  delete: (id: string) => api.delete(`/my/tags/${id}`),
}

export const mySecretsApi = {
  list: () => api.get<any[]>('/my/secrets'),
}

// ── Panels ────────────────────────────────────────────────────────────────────

export interface Panel {
  id: string
  type: string
  title: string
  config: string
  scope: 'shared' | 'personal'
  createdBy: string
  tags: Tag[]
  position: number
  createdAt: string
  uiUrl?: string
}

export const panelsApi = {
  list: (porticoId?: string, scope?: string) => {
    const params = new URLSearchParams()
    if (porticoId) params.set('wall_id', porticoId)
    if (scope) params.set('scope', scope)
    const qs = params.toString()
    return api.get<Panel[]>('/panels' + (qs ? '?' + qs : ''))
  },
  create: (data: { type: string; title: string; config: string }) => api.post<Panel>('/panels', data),
  update: (id: string, data: { title: string; config: string }) => api.put(`/panels/${id}`, data),
  getGroups: (id: string) => api.get<string[]>(`/panels/${id}/groups`),
  setGroups: (id: string, groupIds: string[]) => api.put(`/panels/${id}/groups`, { groupIds }),
  delete: (id: string) => api.delete(`/panels/${id}`),
  addTag: (panelId: string, tagId: string) => api.post(`/panels/${panelId}/tags`, { tagId }),
  removeTag: (panelId: string, tagId: string) => api.delete(`/panels/${panelId}/tags/${tagId}`),
  updateOrder: (porticoId: string | null, order: { panelId: string; position: number }[]) =>
    api.put('/panels/order', { porticoId: porticoId ?? null, order }),
}

// ── Personal Panel Porticos ─────────────────────────────────────────────────

export const personalPanelPorticosApi = {
  get: (panelId: string) => api.get<string[]>(`/panels/${panelId}/porticos`),
  set: (panelId: string, porticoIds: string[]) => api.put(`/panels/${panelId}/porticos`, { porticoIds }),
}

// ── Mail config ──────────────────────────────────────────────────────────────
export interface MailConfig {
  host: string; port: string; username: string; password: string
  from: string; tlsMode: 'plain' | 'starttls' | 'tls'
}
export const mailConfigApi = {
  get: () => api.get<MailConfig>('/mail-config'),
  save: (cfg: MailConfig) => api.put('/mail-config', cfg),
  test: (to: string) => api.post('/mail-config/test', { to }),
}
export const sessionConfigApi = {
  get: () => api.get<{ sessionDurationHours: string }>('/session-config'),
  save: (hours: string) => api.put('/session-config', { sessionDurationHours: hours }),
}
export const adminUsersApi = {
  updateEmail: (id: string, email: string) => api.put(`/users/${id}/email`, { email }),
  sendReset: (id: string) => api.post(`/users/${id}/send-reset`, {}),
}

// ── Porticos ───────────────────────────────────────────────────────────────────

export interface PorticoTag {
  tagId: string
  name: string
  color: string
  active: boolean
}

export interface Portico {
  id: string
  userId: string
  name: string
  isDefault: boolean
  layout: string
  columnCount: number
  columnHeight: number
  createdAt: string
  tags: PorticoTag[]
}

export const customColumnsApi = {
  get: (porticoId: string) => api.get<Record<string,number>>(`/panels/custom-columns?portico_id=${porticoId}`),
  set: (porticoId: string, columns: Record<string,number>, order: string[]) =>
    api.put('/panels/custom-columns', { porticoId, columns, order }),
}

export const porticosApi = {
  list: () => api.get<Portico[]>('/porticos'),
  create: (name: string, isDefault?: boolean) => api.post<Portico>('/porticos', { name, isDefault }),
  delete: (id: string) => api.delete(`/porticos/${id}`),
  updateOrder: (order: { porticoId: string; position: number }[]) => api.put('/porticos/order', order),
  update: (id: string, data: { name?: string; layout?: string; columnCount?: number; columnHeight?: number }) =>
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
