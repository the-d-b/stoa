import axios from 'axios'

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('stoa_token')
  return token ? { 'Authorization': `Bearer ${token}` } : {}
}

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
  enabled?: boolean
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
  toggleEnabled: (userId: string, enabled: boolean) =>
    api.put('/sessions/toggle-user', { userId, enabled }),
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
  config: string
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
  create: (data: { name: string; type: string; apiUrl: string; uiUrl?: string; config?: string; secretId?: string; skipTls?: boolean; refreshSecs?: number; scope?: string }) =>
    api.post<{ id: string }>('/integrations', data),
  update: (id: string, data: Partial<{ name: string; apiUrl: string; uiUrl: string; config: string; secretId: string; skipTls: boolean; refreshSecs: number; enabled: boolean }>) =>
    api.put(`/integrations/${id}`, data),
  delete: (id: string) => api.delete(`/integrations/${id}`),
  test: (data: { type: string; apiUrl: string; secretId?: string; skipTls?: boolean }) =>
    api.post<{ ok: boolean; error?: string }>('/integrations/test', data),
  getGroups: (id: string) => api.get<string[]>(`/integrations/${id}/groups`),
  setGroups: (id: string, groupIds: string[]) =>
    api.put(`/integrations/${id}/groups`, { groupIds }),
  getPanelData: (panelId: string, params?: Record<string, string | number>) =>
    api.get<any>(`/panels/${panelId}/data`, { params }),
  panelAction: (panelId: string, data: { action: string; tmdbId?: number; tvdbId?: number; title?: string; mbid?: string }) =>
    api.post<{ status: string }>(`/panels/${panelId}/action`, data),
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
  update: (data: { email?: string; username?: string }) => api.put('/profile', data),
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
  update: (id: string, data: Partial<{ name: string; apiUrl: string; uiUrl: string; config: string; secretId: string; skipTls: boolean; refreshSecs: number }>) =>
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
  getOrder: (porticoId?: string) =>
    api.get<Record<string,number>>(`/panels/order${porticoId ? `?portico_id=${porticoId}` : ''}`),
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
  test: (to: string, cfg?: MailConfig) => api.post('/mail-config/test', { to, cfg }),
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
  dynamicHeight: boolean
  createdAt: string
  tags: PorticoTag[]
}

export interface ChecklistItem {
  id: string; panelId: string; text: string
  dueDate?: string; completed: boolean
  completedAt?: string; createdBy?: string; createdAt: string
}

export interface Note {
  id: string; panelId: string; title: string; body: string
  createdAt: string; updatedAt: string
}

export interface NoteActivityUser {
  userId: string; username: string; avatarUrl?: string
  lastReadAt?: string; lastEditAt?: string
}

export interface SessionRow {
  id: string; userId: string; username: string; avatarUrl?: string
  role: string; enabled: boolean; ip: string; userAgent: string
  issuedAt: string; expiresAt?: string; lastSeenAt: string; online: boolean
}

export interface ChatAttachment {
  id: string; originalName: string; mimeType: string
  size: number; source: string; sourceUrl?: string; url: string
}
export interface ChatMessage {
  id: string; userId: string; username: string; avatarUrl?: string
  text: string; createdAt: string; own?: boolean
  attachment?: ChatAttachment
}
export type PresenceStatus = 'available' | 'away' | 'busy' | 'dnd'
export interface PresenceUser {
  userId: string; username: string; avatarUrl?: string; online: boolean
  status: PresenceStatus
}
export const presenceApi = {
  setStatus: (status: PresenceStatus, expiresAt?: string) =>
    api.put('/presence/status', { status, expiresAt }),
}

export const chatApi = {
  messages: (beforeId?: string) => api.get<ChatMessage[]>(`/chat/messages${beforeId ? '?before='+beforeId : ''}`),
  send: (text: string, attachmentId?: string) =>
    api.post<ChatMessage>('/chat/messages', { text, attachmentId }),
  unreadCount: () => api.get<{ count: number }>('/chat/unread'),
  typing: (typing: boolean) => api.post('/chat/typing', { typing }),
  markRead: (lastMessageId: string) => api.put('/chat/read', { lastMessageId }),
  presence: () => api.get<PresenceUser[]>('/chat/presence'),
  uploadAttachment: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<ChatAttachment>('/chat/attachments', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  fetchAttachment: (url: string) =>
    api.post<ChatAttachment>('/chat/attachments/fetch', { url }),
  deleteAttachment: (id: string) => api.delete(`/chat/attachments/${id}`),
}

export interface DMMessage {
  id: string
  conversationId: string
  senderId: string
  senderUsername: string
  senderAvatarUrl?: string
  text: string
  attachment?: ChatAttachment
  createdAt: string
  own?: boolean
}

export interface DMConversation {
  id: string
  otherUserId: string
  otherUsername: string
  otherAvatarUrl?: string
  otherOnline: boolean
  otherStatus: PresenceStatus
  lastMessage?: DMMessage
  unreadCount: number
  createdAt: string
}

export const dmApi = {
  getOrCreate: (userId: string) =>
    api.post<{ conversationId: string }>('/dm/conversations', { userId }),
  list: () => api.get<DMConversation[]>('/dm/conversations'),
  messages: (conversationId: string, beforeId?: string) =>
    api.get<DMMessage[]>(`/dm/conversations/${conversationId}/messages${beforeId ? '?before=' + beforeId : ''}`),
  send: (conversationId: string, text: string, attachmentId?: string) =>
    api.post<DMMessage>(`/dm/conversations/${conversationId}/messages`, { text, attachmentId }),
  markRead: (conversationId: string) =>
    api.put(`/dm/conversations/${conversationId}/read`, {}),
  unreadTotal: () => api.get<{ count: number }>('/dm/unread'),
}

export const attachmentConfigApi = {
  get: () => api.get<{ maxMB: number }>('/attachment-config'),
  save: (maxMB: number) => api.put<{ maxMB: number }>('/attachment-config', { maxMB }),
}

export const appIconApi = {
  get: () => api.get<{ url: string | null }>('/config/app-icon'),
  upload: (file: File) => {
    const form = new FormData()
    form.append('icon', file)
    return api.post<{ url: string }>('/config/app-icon', form)
  },
  remove: () => api.delete('/config/app-icon'),
  uploadProfile: (file: File) => {
    const form = new FormData()
    form.append('icon', file)
    return api.post<{ url: string }>('/profile/app-icon', form)
  },
  removeProfile: () => api.delete('/profile/app-icon'),
}

export const sessionsApi = {
  list: (days?: '1'|'7'|'30') =>
    api.get<SessionRow[]>(`/sessions${days ? `?days=${days}` : ''}`),
  toggleUser: (userId: string, enabled: boolean) =>
    api.put('/sessions/toggle-user', { userId, enabled }),
}

export const aiApi = {
  providers: () => api.get<{ claude: boolean; gemini: boolean }>('/ai/providers'),
  history: (provider: string) =>
    api.get<{ id: string; role: string; content: string; createdAt: string }[]>(`/ai/history?provider=${provider}`),
  clear: (provider: string) => api.delete(`/ai/clear?provider=${provider}`),
  // Streaming chat — returns a Response for manual SSE handling
  chat: (message: string, provider: string) => fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ message, provider }),
  }),
}

export const searchApi = {
  query: (q: string) => api.get<{
    type: string; id: string; title: string
    excerpt?: string; url?: string; iconUrl?: string
    panelId?: string; path?: string
  }[]>(`/search?q=${encodeURIComponent(q)}`),
}

export const steamApi = {
  panel: (panelId: string) => api.get<any>(`/steam/panel?panelId=${panelId}`),
  resolveVanity: (vanity: string, key: string) =>
    api.get<{ steamId: string }>(`/steam/resolve-vanity?vanity=${encodeURIComponent(vanity)}&key=${encodeURIComponent(key)}`),
}

export const weatherApi = {
  fetch: (config: { lat: string; lon: string; city: string; unit: string }) =>
    api.post<any>('/weather', config),
  geocode: (q: string) =>
    api.get<{ name: string; latitude: number; longitude: number; country: string; admin1: string }[]>(
      `/weather/geocode?q=${encodeURIComponent(q)}`
    ),
}

export const notesApi = {
  get:      (id: string) => api.get<Note & { lockedBy?: string; lockedByName?: string }>(`/notes/note/${id}`),
  list:     (panelId: string, sort?: 'asc'|'desc') =>
    api.get<Note[]>(`/notes/${panelId}?sort=${sort || 'desc'}`),
  create:   (panelId: string) => api.post<{id: string}>(`/notes/${panelId}`, {}),
  update:   (id: string, title: string, body: string) =>
    api.put(`/notes/note/${id}`, { title, body }),
  delete:   (id: string) => api.delete(`/notes/note/${id}`),
  activity: (id: string) => api.get<NoteActivityUser[]>(`/notes/note/${id}/activity`),
  lock:     (id: string) => api.post(`/notes/note/${id}/lock`, {}),
  unlock:   (id: string) => api.delete(`/notes/note/${id}/lock`),
  trackRead:(id: string) => api.post(`/notes/note/${id}/read`, {}),
}

export const checklistApi = {
  list:   (panelId: string) => api.get<ChecklistItem[]>(`/checklist/${panelId}`),
  create: (panelId: string, text: string, dueDate?: string) =>
    api.post<{id: string}>(`/checklist/${panelId}`, { text, dueDate }),
  update: (id: string, text: string, dueDate?: string) =>
    api.put(`/checklist/item/${id}`, { text, dueDate }),
  toggle: (id: string, completed: boolean) =>
    api.put(`/checklist/item/${id}/toggle`, { completed }),
  delete: (id: string) => api.delete(`/checklist/item/${id}`),
}

export interface KanbanBoard {
  id: string; panelId: string; name: string; sortOrder: number; createdAt: string
  cardCount: number; dueSoon: number; overdue: number
}

export interface KanbanCard {
  id: string; boardId: string; title: string; status: string
  dueDate?: string; notes?: string; sortOrder: number; createdAt: string; updatedAt: string
}

export const kanbanApi = {
  listBoards: (panelId: string) =>
    api.get<KanbanBoard[]>(`/kanban/boards?panelId=${panelId}`),
  createBoard: (panelId: string, name: string) =>
    api.post<KanbanBoard>('/kanban/boards', { panelId, name }),
  updateBoard: (id: string, name: string, sortOrder?: number) =>
    api.put(`/kanban/boards/${id}`, { name, sortOrder }),
  deleteBoard: (id: string) =>
    api.delete(`/kanban/boards/${id}`),
  listCards: (boardId: string) =>
    api.get<KanbanCard[]>(`/kanban/boards/${boardId}/cards`),
  createCard: (boardId: string, data: { title: string; status?: string; dueDate?: string; notes?: string }) =>
    api.post<KanbanCard>(`/kanban/boards/${boardId}/cards`, data),
  updateCard: (id: string, data: { title: string; status: string; dueDate?: string; notes?: string; sortOrder?: number }) =>
    api.put(`/kanban/cards/${id}`, data),
  deleteCard: (id: string) =>
    api.delete(`/kanban/cards/${id}`),
  reorderCards: (boardId: string, cards: { id: string; sortOrder: number; status: string }[]) =>
    api.put(`/kanban/boards/${boardId}/cards/reorder`, { cards }),
  search: (q: string) =>
    api.get(`/kanban/search?q=${encodeURIComponent(q)}`),
}

export const porticoConfigApi = {
  panels: (porticoId: string) =>
    api.get<{ id: string; type: string; title: string; config: string; scope: string; position: number; customColumn: number }[]>(
      `/panels/portico-config?portico_id=${porticoId}`
    ),
}

export const porticoPanelsApi = {
  list: (porticoId: string) =>
    api.get<{ id: string; type: string; title: string; config: string; position: number; customColumn: number }[]>(
      `/panels/portico-panels?portico_id=${porticoId}`
    ),
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
  update: (id: string, data: { name?: string; layout?: string; columnCount?: number; columnHeight?: number; dynamicHeight?: boolean }) =>
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

export const expressSetupApi = {
  status: () => api.get<{ existingTypes: string[] }>('/express-setup/status'),
  run: (data: {
    panelHeight: number
    services: {
      type: string
      label: string
      secretName: string
      apiKey: string
      apiUrl: string
      needsKey: boolean
      needsUrl: boolean
      createPanel: boolean
    }[]
  }) => api.post<{ results: { type: string; created: boolean; skipped: boolean; error?: string }[] }>(
    '/express-setup', data
  ),
}

export const pushApi = {
  getVapidPublicKey: () => api.get<{ publicKey: string }>('/push/vapid-public-key'),
  subscribe: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    api.post('/push/subscribe', sub),
  unsubscribe: (endpoint?: string) =>
    api.delete('/push/subscribe', { data: endpoint ? { endpoint } : {} }),
}

// ── Integration Health ────────────────────────────────────────────────────────

export interface IntegrationHealthItem {
  integrationId: string
  integrationName: string
  integrationType: string
  status: 'healthy' | 'error' | 'pending'
  consecutiveErrors: number
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastError: string
  errorCategory: string  // "auth" | "rate_limit" | "connection" | "tls" | "unknown" | ""
}

export const integrationHealthApi = {
  list: () => api.get<IntegrationHealthItem[]>('/integration-health'),
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string
  actorId: string | null
  actorName: string
  action: string
  targetId: string | null
  targetName: string
  metadata: string | null  // raw JSON string, parsed client-side
  createdAt: string
}

export const auditApi = {
  list: (action?: string) =>
    api.get<AuditEntry[]>(`/audit-log${action ? `?action=${encodeURIComponent(action)}` : ''}`),
}

// ── Chat Audit (admin) ────────────────────────────────────────────────────────

export interface DMAuditConversation {
  id: string
  userAId: string
  userAUsername: string
  userBId: string
  userBUsername: string
  messageCount: number
  lastMessageAt: string | null
  createdAt: string
}

export interface AIAuditUser {
  userId: string
  username: string
  provider: string
  messageCount: number
  lastMessageAt: string | null
}

export interface AdminIntegrationRow {
  id: string
  name: string
  type: string
  enabled: boolean
  scope: 'shared' | 'personal'
  ownerName: string
  createdAt: string
}

export const adminIntegrationsApi = {
  listAll: () => api.get<AdminIntegrationRow[]>('/integrations/all'),
}

export const chatAuditApi = {
  dmConversations: () =>
    api.get<DMAuditConversation[]>('/audit/dm/conversations'),
  downloadDM: (id: string) =>
    api.get<Blob>(`/audit/dm/conversations/${id}/download`, { responseType: 'blob' }),
  aiUsers: () =>
    api.get<AIAuditUser[]>('/audit/ai/users'),
  downloadAI: (userId: string, provider: string) =>
    api.get<Blob>(`/audit/ai/download?userId=${encodeURIComponent(userId)}&provider=${encodeURIComponent(provider)}`, { responseType: 'blob' }),
}

// ── Docker ────────────────────────────────────────────────────────────────────

export interface DockerHostRow {
  id: string
  name: string
  type: 'local' | 'remote'
  url: string
  enabled: boolean
}

export interface DockerContainer {
  id: string
  name: string
  image: string
  state: string
  status: string
  cpu: number
  memUsed: number
  memLimit: number
  memPct: number
}

export interface DockerHostData extends DockerHostRow {
  containers: DockerContainer[]
  error?: string
}

export interface DockerConfig {
  enabled: boolean
  groupIds: string[]
  groups: Group[]
  hosts: DockerHostRow[]
}

export const dockerApi = {
  getConfig: () => api.get<DockerConfig>('/docker/config'),
  saveConfig: (data: { enabled: boolean; groupIds: string[] }) => api.put('/docker/config', data),
  listHosts: () => api.get<DockerHostRow[]>('/docker/hosts'),
  createHost: (data: { name: string; type: string; url: string }) => api.post<DockerHostRow>('/docker/hosts', data),
  updateHost: (id: string, data: Partial<DockerHostRow>) => api.put(`/docker/hosts/${id}`, data),
  deleteHost: (id: string) => api.delete(`/docker/hosts/${id}`),
  testHost: (data: { id?: string; type?: string; url?: string }) =>
    api.post<{ ok: boolean; error?: string; version?: string }>('/docker/test', data),
  getAccess: () => api.get<{ hasAccess: boolean }>('/docker/access'),
  getContainers: () => api.get<DockerHostData[]>('/docker/containers'),
  containerAction: (hostId: string, containerId: string, action: 'start' | 'stop' | 'restart') =>
    api.post(`/docker/${hostId}/containers/${containerId}/${action}`, {}),
}
