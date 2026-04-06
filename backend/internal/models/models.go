package models

import "time"

type Role string
const (
	RoleAdmin Role = "admin"
	RoleUser  Role = "user"
)

type AuthProvider string
const (
	AuthProviderLocal AuthProvider = "local"
	AuthProviderOAuth AuthProvider = "oauth"
)

type NodeType string
const (
	NodeSection  NodeType = "section"
	NodeBookmark NodeType = "bookmark"
)

type Scope string
const (
	ScopeShared   Scope = "shared"
	ScopePersonal Scope = "personal"
)

// ── Users ─────────────────────────────────────────────────────────────────────

type User struct {
	ID           string       `json:"id"`
	Username     string       `json:"username"`
	Email        string       `json:"email,omitempty"`
	Role         Role         `json:"role"`
	AuthProvider AuthProvider `json:"authProvider"`
	CreatedAt    time.Time    `json:"createdAt"`
	LastLogin    *time.Time   `json:"lastLogin,omitempty"`
}

type UserPreferences struct {
	UserID     string `json:"userId"`
	Theme      string `json:"theme"`
	DateFormat string `json:"dateFormat"`
	AvatarURL  string `json:"avatarUrl,omitempty"`
}

// ── Groups / Tags ─────────────────────────────────────────────────────────────

type Group struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	Users       []User    `json:"users,omitempty"`
	Tags        []Tag     `json:"tags,omitempty"`
}

type Tag struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	Scope     string    `json:"scope"`
	CreatedBy string    `json:"createdBy"`
	CreatedAt time.Time `json:"createdAt"`
}

// ── Bookmark tree ─────────────────────────────────────────────────────────────

type BookmarkNode struct {
	ID        string          `json:"id"`
	ParentID  string          `json:"parentId,omitempty"`
	Path      string          `json:"path"`
	Name      string          `json:"name"`
	Type      NodeType        `json:"type"`
	URL       string          `json:"url,omitempty"`
	IconURL   string          `json:"iconUrl,omitempty"`
	SortOrder int             `json:"sortOrder"`
	Scope     Scope           `json:"scope"`
	CreatedBy string          `json:"createdBy,omitempty"`
	CreatedAt time.Time       `json:"createdAt"`
	Children  []*BookmarkNode `json:"children,omitempty"`
}

type CreateNodeRequest struct {
	ParentID string   `json:"parentId"`
	Name     string   `json:"name"`
	Type     NodeType `json:"type"`
	URL      string   `json:"url"`
	IconURL  string   `json:"iconUrl"`
}

type UpdateNodeRequest struct {
	Name      string `json:"name"`
	URL       string `json:"url"`
	IconURL   string `json:"iconUrl"`
	SortOrder int    `json:"sortOrder"`
}

// ── Panels ────────────────────────────────────────────────────────────────────

type Panel struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Title     string    `json:"title"`
	Config    string    `json:"config"`
	Scope     Scope     `json:"scope"`
	CreatedBy string    `json:"createdBy,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	Tags      []Tag     `json:"tags,omitempty"`
	Position  int       `json:"position,omitempty"`
}

type CreatePanelRequest struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Config string `json:"config"`
	Scope  string `json:"scope"`
}

// ── Walls ─────────────────────────────────────────────────────────────────────

type Wall struct {
	ID           string    `json:"id"`
	UserID       string    `json:"userId"`
	Name         string    `json:"name"`
	IsDefault    bool      `json:"isDefault"`
	Layout       string    `json:"layout"`
	ColumnCount  int       `json:"columnCount"`
	ColumnHeight int       `json:"columnHeight"`
	CreatedAt    time.Time `json:"createdAt"`
	Tags         []WallTag `json:"tags,omitempty"`
}

type WallTag struct {
	TagID  string `json:"tagId"`
	Name   string `json:"name"`
	Color  string `json:"color"`
	Active bool   `json:"active"`
}

// ── Config ────────────────────────────────────────────────────────────────────

type AppConfig struct {
	Key       string    `json:"key"`
	Value     string    `json:"value"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type OAuthConfig struct {
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret,omitempty"`
	IssuerURL    string `json:"issuerUrl"`
	RedirectURL  string `json:"redirectUrl"`
}

type SetupRequest struct {
	AdminUsername    string `json:"adminUsername"`
	AdminPassword    string `json:"adminPassword"`
	AppURL           string `json:"appUrl"`
	SessionSecret    string `json:"sessionSecret,omitempty"`
	UserMode         string `json:"userMode,omitempty"`         // "single" or "multi"
	AutoLogin        bool   `json:"autoLogin,omitempty"`        // single-user: skip login screen
	InitialTags      []SetupTag   `json:"initialTags,omitempty"`
	InitialGroups    []SetupGroup `json:"initialGroups,omitempty"`
	DefaultGroupName string `json:"defaultGroupName,omitempty"`
}

type SetupTag struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type SetupGroup struct {
	Name    string   `json:"name"`
	TagNames []string `json:"tagNames"`
}

type Claims struct {
	UserID   string `json:"userId"`
	Username string `json:"username"`
	Role     Role   `json:"role"`
}

type UpdateTagRequest struct {
	Color string `json:"color"`
}
