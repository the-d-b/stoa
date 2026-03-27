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

type User struct {
	ID           string       `json:"id"`
	Username     string       `json:"username"`
	Email        string       `json:"email,omitempty"`
	Role         Role         `json:"role"`
	AuthProvider AuthProvider `json:"authProvider"`
	CreatedAt    time.Time    `json:"createdAt"`
	LastLogin    *time.Time   `json:"lastLogin,omitempty"`
}

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
	CreatedAt time.Time `json:"createdAt"`
}

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
	AdminUsername string `json:"adminUsername"`
	AdminPassword string `json:"adminPassword"`
	AppURL        string `json:"appUrl"`
	SessionSecret string `json:"sessionSecret,omitempty"`
}

type Claims struct {
	UserID   string `json:"userId"`
	Username string `json:"username"`
	Role     Role   `json:"role"`
}
