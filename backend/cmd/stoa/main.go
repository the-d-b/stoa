package main

import (
	"log"
	"time"
	"net/http"
	"os"

	"github.com/gorilla/mux"
	"github.com/rs/cors"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/config"
	"github.com/the-d-b/stoa/internal/db"
	"github.com/the-d-b/stoa/internal/handlers"
	"github.com/the-d-b/stoa/internal/migrations"
)

func main() {
	cfg := config.Load()

	database, err := db.Init(cfg.DBPath)
	if err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}
	defer database.Close()

	if err := migrations.Run(database); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	firstRun, err := db.IsFirstRun(database)
	if err != nil {
		log.Fatalf("failed to check first run status: %v", err)
	}

	authService := auth.New(cfg, database)

	iconsDir := cfg.IconsDir

	r := mux.NewRouter()
	api := r.PathPrefix("/api").Subrouter()

	// ── Public ────────────────────────────────────────────
	api.HandleFunc("/setup/status", handlers.SetupStatusFull(database)).Methods("GET")
	api.HandleFunc("/config/mode", handlers.GetUserMode(database)).Methods("GET")
	api.HandleFunc("/css/{filename}", handlers.ServeCSSSheet(cfg.CSSDir)).Methods("GET")
	api.HandleFunc("/auth/autologin", handlers.AutoLogin(database, authService)).Methods("POST")
	api.HandleFunc("/setup/init", handlers.SetupInit(database, cfg)).Methods("POST")
	api.HandleFunc("/auth/login", handlers.LocalLogin(authService)).Methods("POST")
	api.HandleFunc("/auth/reset-request", handlers.ResetRequest(database)).Methods("POST")
	api.HandleFunc("/auth/reset-confirm", handlers.ResetConfirm(database)).Methods("POST")
	api.HandleFunc("/auth/logout", handlers.Logout(authService)).Methods("POST")
	api.HandleFunc("/auth/oauth/login", handlers.OAuthLogin(authService)).Methods("GET")
	api.HandleFunc("/auth/oauth/callback", handlers.OAuthCallback(authService, database)).Methods("GET")
	api.HandleFunc("/auth/oauth/test", handlers.TestOAuthConfig(database)).Methods("POST")

	// Icon serving (public — icons are not sensitive)
	api.PathPrefix("/icons/").HandlerFunc(handlers.ServeIcon(iconsDir))
	api.HandleFunc("/auth/google/callback", handlers.GoogleOAuthCallback(database)).Methods("GET")

	// ── Protected (any authenticated user) ───────────────
	protected := api.PathPrefix("").Subrouter()
	protected.Use(authService.Middleware)

	protected.HandleFunc("/auth/me", handlers.Me(authService)).Methods("GET")
	protected.HandleFunc("/profile", handlers.GetProfile(database)).Methods("GET")
	protected.HandleFunc("/profile", handlers.UpdateProfile(database)).Methods("PUT")
	protected.HandleFunc("/profile/avatar", handlers.UploadAvatar(database, iconsDir)).Methods("POST")
	protected.HandleFunc("/profile/password", handlers.ChangeOwnPassword(database)).Methods("PUT")

	// Bookmarks (read)
	protected.HandleFunc("/bookmarks", handlers.ListBookmarkTree(database)).Methods("GET")
	protected.HandleFunc("/bookmarks/favicon", handlers.ScrapeFaviconHandler()).Methods("GET")
	protected.HandleFunc("/bookmarks/{id}", handlers.GetBookmarkNode(database)).Methods("GET")
	protected.HandleFunc("/bookmarks/{id}/subtree", handlers.GetSubtree(database)).Methods("GET")

	// Glyphs (per-user)
	protected.HandleFunc("/glyphs", handlers.ListGlyphs(database)).Methods("GET")
	protected.HandleFunc("/glyphs", handlers.CreateGlyph(database)).Methods("POST")
	protected.HandleFunc("/glyphs/{id}", handlers.UpdateGlyph(database)).Methods("PUT")
	protected.HandleFunc("/glyphs/{id}", handlers.DeleteGlyph(database)).Methods("DELETE")
	protected.HandleFunc("/glyphs/{id}/data", handlers.GetGlyphData(database)).Methods("GET")

	// Tickers (per-user)
	protected.HandleFunc("/tickers", handlers.ListTickers(database)).Methods("GET")
	protected.HandleFunc("/tickers", handlers.CreateTicker(database)).Methods("POST")
	protected.HandleFunc("/tickers/{id}", handlers.UpdateTicker(database)).Methods("PUT")
	protected.HandleFunc("/tickers/{id}", handlers.DeleteTicker(database)).Methods("DELETE")
	protected.HandleFunc("/tickers/{id}/data", handlers.GetTickerData(database)).Methods("GET")

	// Personal bookmarks (any authenticated user)
	protected.HandleFunc("/my/bookmarks", handlers.ListPersonalBookmarkTree(database)).Methods("GET")
	protected.HandleFunc("/my/bookmarks", handlers.CreatePersonalBookmarkNode(database, iconsDir)).Methods("POST")
	protected.HandleFunc("/my/bookmarks/{id}", handlers.UpdateBookmarkNode(database)).Methods("PUT")
	protected.HandleFunc("/my/bookmarks/{id}", handlers.DeleteBookmarkNode(database)).Methods("DELETE")
	protected.HandleFunc("/my/bookmarks/{id}/move", handlers.MoveBookmarkNode(database)).Methods("PUT")
	protected.HandleFunc("/my/bookmarks/{id}/subtree", handlers.GetSubtree(database)).Methods("GET")
	protected.HandleFunc("/my/panels", handlers.ListMyPanels(database)).Methods("GET")
	protected.HandleFunc("/my/panels", handlers.CreatePanel(database)).Methods("POST")
	protected.HandleFunc("/my/panels/{id}", handlers.DeleteMyPanel(database)).Methods("DELETE")
	protected.HandleFunc("/my/integrations", handlers.ListMyIntegrations(database)).Methods("GET")
	protected.HandleFunc("/my/integrations/{id}", handlers.UpdateMyIntegration(database)).Methods("PUT")
	protected.HandleFunc("/my/integrations/{id}", handlers.DeleteMyIntegration(database)).Methods("DELETE")
	protected.HandleFunc("/my/tags", handlers.ListMyTags(database)).Methods("GET")
	protected.HandleFunc("/my/tags", handlers.CreateMyTag(database)).Methods("POST")
	protected.HandleFunc("/my/tags/{id}", handlers.UpdateMyTag(database)).Methods("PUT")
	protected.HandleFunc("/my/tags/{id}", handlers.DeleteMyTag(database)).Methods("DELETE")
	protected.HandleFunc("/my/secrets", handlers.ListMySecrets(database)).Methods("GET")
	protected.HandleFunc("/my/panels/{id}", handlers.UpdatePanel(database)).Methods("PUT")

	// Panels (read + reorder)
	protected.HandleFunc("/panels", handlers.ListPanels(database)).Methods("GET")
	protected.HandleFunc("/panels/order", handlers.UpdatePanelOrder(database)).Methods("PUT")
	protected.HandleFunc("/panels/custom-columns", handlers.GetCustomColumns(database)).Methods("GET")

	// Sessions route registered after admin subrouter is declared (see below)

	// Chat
	protected.HandleFunc("/chat/messages", handlers.GetChatMessages(database)).Methods("GET")
	protected.HandleFunc("/chat/messages", handlers.SendChatMessage(database)).Methods("POST")
	protected.HandleFunc("/chat/presence", handlers.GetChatPresence(database)).Methods("GET")

	// RSS panel — proxy fetch with 5m cache, no integration needed
	protected.HandleFunc("/rss-panel", handlers.GetRSSPanelData).Methods("GET")

	// Notes panel CRUD
	protected.HandleFunc("/notes/{panelId}", handlers.ListNotes(database)).Methods("GET")
	protected.HandleFunc("/notes/{panelId}", handlers.CreateNote(database)).Methods("POST")
	// More specific routes first so gorilla mux doesn't swallow /activity and /read
	protected.HandleFunc("/notes/note/{id}/activity", handlers.GetNoteActivity(database)).Methods("GET")
	protected.HandleFunc("/notes/note/{id}/read", handlers.TrackNoteRead(database)).Methods("POST")
	protected.HandleFunc("/notes/note/{id}", handlers.UpdateNote(database)).Methods("PUT")
	protected.HandleFunc("/notes/note/{id}", handlers.DeleteNote(database)).Methods("DELETE")

	// Checklist panel CRUD — panel_id scoped, shared across users with panel access
	protected.HandleFunc("/checklist/{panelId}", handlers.ListChecklistItems(database)).Methods("GET")
	protected.HandleFunc("/checklist/{panelId}", handlers.CreateChecklistItem(database)).Methods("POST")
	protected.HandleFunc("/checklist/item/{id}", handlers.UpdateChecklistItem(database)).Methods("PUT")
	protected.HandleFunc("/checklist/item/{id}/toggle", handlers.ToggleChecklistItem(database)).Methods("PUT")
	protected.HandleFunc("/checklist/item/{id}", handlers.DeleteChecklistItem(database)).Methods("DELETE")
	protected.HandleFunc("/panels/custom-columns", handlers.SetCustomColumns(database)).Methods("PUT")

	// SSE — browser tab event stream (handles own auth via ?token= param)
	api.HandleFunc("/stream", handlers.SSEHandler(database, authService)).Methods("GET")

	// Porticos (per-user)
	protected.HandleFunc("/porticos", handlers.ListPorticos(database)).Methods("GET")
	protected.HandleFunc("/porticos/order", handlers.UpdatePorticoOrder(database)).Methods("PUT")
	protected.HandleFunc("/porticos", handlers.CreatePortico(database)).Methods("POST")
	protected.HandleFunc("/porticos/{id}", handlers.DeletePortico(database)).Methods("DELETE")
	protected.HandleFunc("/porticos/{id}", handlers.UpdatePortico(database)).Methods("PUT")
	protected.HandleFunc("/porticos/{id}/tags/{tagId}", handlers.SetPorticoTagActive(database)).Methods("PUT")
	protected.HandleFunc("/panels/{id}/porticos", handlers.GetPersonalPanelPorticos(database)).Methods("GET")
	protected.HandleFunc("/panels/{id}/porticos", handlers.SetPersonalPanelPorticos(database)).Methods("PUT")

	// Secrets (any authenticated user can manage their own)
	protected.HandleFunc("/secrets", handlers.ListSecrets(database)).Methods("GET")
	protected.HandleFunc("/secrets", handlers.CreateSecret(database)).Methods("POST")
	protected.HandleFunc("/secrets/{id}", handlers.UpdateSecret(database)).Methods("PUT")
	protected.HandleFunc("/secrets/{id}", handlers.DeleteSecret(database)).Methods("DELETE")

	// Preferences (per-user)
	protected.HandleFunc("/preferences", handlers.GetPreferences(database)).Methods("GET")
	protected.HandleFunc("/preferences", handlers.SavePreferences(database)).Methods("PUT")
	protected.HandleFunc("/geo", handlers.GeoLookup(database)).Methods("GET")

	// Google OAuth (non-admin routes)
	protected.HandleFunc("/auth/google/redirect", handlers.GoogleOAuthRedirect(database)).Methods("GET")
	protected.HandleFunc("/auth/google/tokens", handlers.GoogleListTokens(database)).Methods("GET")
	protected.HandleFunc("/auth/google/tokens", handlers.GoogleDeleteToken(database)).Methods("DELETE")
	protected.HandleFunc("/auth/google/calendars", handlers.GoogleListCalendars(database)).Methods("GET")

	// Users (read)
	protected.HandleFunc("/users", handlers.ListUsers(database)).Methods("GET")
	protected.HandleFunc("/users/{id}", handlers.GetUser(database)).Methods("GET")

	// ── Admin only ────────────────────────────────────────
	admin := protected.PathPrefix("").Subrouter()

	// Sessions — audit trail and presence (admin only, enforced in handler)
	admin.HandleFunc("/sessions", handlers.ListSessions(database)).Methods("GET")
	protected.HandleFunc("/sessions/toggle-user", handlers.ToggleUserEnabled(database)).Methods("PUT")
	admin.Use(authService.AdminMiddleware)

	// Mail config & session duration
	admin.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/api/admin/mail-config" || r.URL.Path == "/api/admin/session-config" {
				log.Printf("[MAIL-MW] %s %s — entering admin middleware", r.Method, r.URL.Path)
			}
			next.ServeHTTP(w, r)
		})
	})
	admin.HandleFunc("/mail-config", handlers.GetMailConfig(database)).Methods("GET")
	admin.HandleFunc("/mail-config", handlers.SaveMailConfig(database)).Methods("PUT")
	admin.HandleFunc("/mail-config/test", handlers.TestMailConfig(database)).Methods("POST")
	admin.HandleFunc("/session-config", handlers.GetSessionConfig(database)).Methods("GET")
	admin.HandleFunc("/session-config", handlers.SaveSessionConfig(database)).Methods("PUT")

	// Google OAuth admin config
	admin.HandleFunc("/google/config", handlers.GetGoogleOAuthConfig(database)).Methods("GET")
	admin.HandleFunc("/google/config", handlers.SaveGoogleOAuthConfig(database)).Methods("PUT")

	// Integrations (admin only for write, all users can read)
	protected.HandleFunc("/integrations", handlers.ListIntegrations(database)).Methods("GET")
	protected.HandleFunc("/panels/{id}/data", handlers.GetPanelData(database)).Methods("GET")
	protected.HandleFunc("/integrations", handlers.CreateIntegration(database)).Methods("POST")
	admin.HandleFunc("/integrations/{id}", handlers.UpdateIntegration(database)).Methods("PUT")
	admin.HandleFunc("/integrations/{id}", handlers.DeleteIntegration(database)).Methods("DELETE")
	protected.HandleFunc("/integrations/test", handlers.TestIntegration(database)).Methods("POST")
	protected.HandleFunc("/customapi/preview", handlers.PreviewCustomAPI(database)).Methods("POST")
	admin.HandleFunc("/integrations/{id}/groups", handlers.GetIntegrationGroups(database)).Methods("GET")
	admin.HandleFunc("/integrations/{id}/groups", handlers.SetIntegrationGroups(database)).Methods("PUT")
	admin.HandleFunc("/panels/{id}/groups", handlers.SetPanelGroups(database)).Methods("PUT")
	protected.HandleFunc("/panels/{id}/groups", handlers.GetPanelGroups(database)).Methods("GET")

	// Secrets (admin only: group assignment)
	admin.HandleFunc("/secrets/{id}/groups", handlers.SetSecretGroups(database)).Methods("PUT")

	// Users admin
	admin.HandleFunc("/users", handlers.CreateLocalUser(database)).Methods("POST")
	admin.HandleFunc("/users/{id}/role", handlers.UpdateUserRole(database)).Methods("PUT")
	admin.HandleFunc("/users/{id}/password", handlers.ResetUserPassword(database)).Methods("PUT")
	admin.HandleFunc("/users/{id}/email", handlers.UpdateUserEmail(database)).Methods("PUT")
	admin.HandleFunc("/users/{id}/send-reset", handlers.AdminSendResetLink(database)).Methods("POST")
	admin.HandleFunc("/users/{id}", handlers.DeleteUser(database)).Methods("DELETE")

	// Groups
	admin.HandleFunc("/groups", handlers.ListGroups(database)).Methods("GET")
	admin.HandleFunc("/groups", handlers.CreateGroup(database)).Methods("POST")
	admin.HandleFunc("/groups/{id}", handlers.GetGroup(database)).Methods("GET")
	admin.HandleFunc("/groups/{id}", handlers.DeleteGroup(database)).Methods("DELETE")
	admin.HandleFunc("/groups/{id}/default", handlers.SetDefaultGroup(database)).Methods("PUT")
	admin.HandleFunc("/groups/{id}/users", handlers.AddUserToGroup(database)).Methods("POST")
	admin.HandleFunc("/groups/{id}/users/{userId}", handlers.RemoveUserFromGroup(database)).Methods("DELETE")

	// Tags - list is public to all authenticated users, write ops are admin only
	protected.HandleFunc("/tags", handlers.ListTags(database)).Methods("GET")
	admin.HandleFunc("/tags", handlers.CreateTag(database)).Methods("POST")
	admin.HandleFunc("/tags/{id}", handlers.UpdateTag(database)).Methods("PUT")
	admin.HandleFunc("/tags/{id}", handlers.DeleteTag(database)).Methods("DELETE")

	// Bookmarks (write)
	admin.HandleFunc("/bookmarks", handlers.CreateBookmarkNode(database, iconsDir)).Methods("POST")
	admin.HandleFunc("/bookmarks/{id}", handlers.UpdateBookmarkNode(database)).Methods("PUT")
	admin.HandleFunc("/bookmarks/{id}", handlers.DeleteBookmarkNode(database)).Methods("DELETE")
	admin.HandleFunc("/bookmarks/{id}/move", handlers.MoveBookmarkNode(database)).Methods("PUT")
	admin.HandleFunc("/bookmarks/cache-icon", handlers.CacheIcon(iconsDir)).Methods("POST")

	// Panels (write)
	admin.HandleFunc("/panels", handlers.CreatePanel(database)).Methods("POST")
	admin.HandleFunc("/panels/{id}", handlers.UpdatePanel(database)).Methods("PUT")
	admin.HandleFunc("/panels/{id}", handlers.DeletePanel(database)).Methods("DELETE")
	protected.HandleFunc("/panels/{id}/tags", handlers.AddTagToPanel(database)).Methods("POST")
	protected.HandleFunc("/panels/{id}/tags/{tagId}", handlers.RemoveTagFromPanel(database)).Methods("DELETE")

	// Config
	admin.HandleFunc("/config/oauth", handlers.GetOAuthConfig(database)).Methods("GET")
	admin.HandleFunc("/config/mode", handlers.SetUserMode(database)).Methods("PUT")
	protected.HandleFunc("/css", handlers.ListCSSSheets(database)).Methods("GET")
	protected.HandleFunc("/css", handlers.UploadCSSSheet(database, cfg.CSSDir)).Methods("POST")
	protected.HandleFunc("/css/{id}", handlers.DeleteCSSSheet(database, cfg.CSSDir)).Methods("DELETE")
	admin.HandleFunc("/config/oauth", handlers.SaveOAuthConfig(database, cfg)).Methods("PUT")

	// Static frontend
	frontendPath := cfg.FrontendPath
	if _, err := os.Stat(frontendPath); os.IsNotExist(err) {
		frontendPath = "./frontend/dist"
	}
	r.PathPrefix("/").Handler(http.FileServer(http.Dir(frontendPath)))

	c := cors.New(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	})

	port := cfg.Port
	if port == "" {
		port = "8080"
	}

	if firstRun {
		log.Println("*** FIRST RUN DETECTED — complete setup at /setup ***")
	}

	// Worker manager — cold start, spins up on first SSE client, down after 600s idle
	handlers.NewWorkerManager(database, 600*time.Second)
	log.Printf("Stoa listening on :%s", port)
	if err := http.ListenAndServe(":"+port, c.Handler(r)); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
