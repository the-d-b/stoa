package main

import (
	"log"
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
	api.HandleFunc("/setup/status", handlers.SetupStatus(database)).Methods("GET")
	api.HandleFunc("/setup/init", handlers.SetupInit(database, cfg)).Methods("POST")
	api.HandleFunc("/auth/login", handlers.LocalLogin(authService)).Methods("POST")
	api.HandleFunc("/auth/logout", handlers.Logout(authService)).Methods("POST")
	api.HandleFunc("/auth/oauth/login", handlers.OAuthLogin(authService)).Methods("GET")
	api.HandleFunc("/auth/oauth/callback", handlers.OAuthCallback(authService, database)).Methods("GET")
	api.HandleFunc("/auth/oauth/test", handlers.TestOAuthConfig(database)).Methods("POST")

	// Icon serving (public — icons are not sensitive)
	api.PathPrefix("/icons/").HandlerFunc(handlers.ServeIcon(iconsDir))

	// ── Protected (any authenticated user) ───────────────
	protected := api.PathPrefix("").Subrouter()
	protected.Use(authService.Middleware)

	protected.HandleFunc("/auth/me", handlers.Me(authService)).Methods("GET")

	// Bookmarks (read)
	protected.HandleFunc("/bookmarks", handlers.ListBookmarkTree(database)).Methods("GET")
	protected.HandleFunc("/bookmarks/favicon", handlers.ScrapeFaviconHandler()).Methods("GET")
	protected.HandleFunc("/bookmarks/{id}", handlers.GetBookmarkNode(database)).Methods("GET")
	protected.HandleFunc("/bookmarks/{id}/subtree", handlers.GetSubtree(database)).Methods("GET")

	// Panels (read + reorder)
	protected.HandleFunc("/panels", handlers.ListPanels(database)).Methods("GET")
	protected.HandleFunc("/panels/order", handlers.UpdatePanelOrder(database)).Methods("PUT")

	// Walls (per-user)
	protected.HandleFunc("/walls", handlers.ListWalls(database)).Methods("GET")
	protected.HandleFunc("/walls", handlers.CreateWall(database)).Methods("POST")
	protected.HandleFunc("/walls/{id}", handlers.DeleteWall(database)).Methods("DELETE")
	protected.HandleFunc("/walls/{id}/tags/{tagId}", handlers.SetWallTagActive(database)).Methods("PUT")

	// Preferences (per-user)
	protected.HandleFunc("/preferences", handlers.GetPreferences(database)).Methods("GET")
	protected.HandleFunc("/preferences", handlers.SavePreferences(database)).Methods("PUT")

	// Users (read)
	protected.HandleFunc("/users", handlers.ListUsers(database)).Methods("GET")
	protected.HandleFunc("/users/{id}", handlers.GetUser(database)).Methods("GET")

	// ── Admin only ────────────────────────────────────────
	admin := protected.PathPrefix("").Subrouter()
	admin.Use(authService.AdminMiddleware)

	// Users admin
	admin.HandleFunc("/users/{id}/role", handlers.UpdateUserRole(database)).Methods("PUT")
	admin.HandleFunc("/users/{id}", handlers.DeleteUser(database)).Methods("DELETE")

	// Groups
	admin.HandleFunc("/groups", handlers.ListGroups(database)).Methods("GET")
	admin.HandleFunc("/groups", handlers.CreateGroup(database)).Methods("POST")
	admin.HandleFunc("/groups/{id}", handlers.GetGroup(database)).Methods("GET")
	admin.HandleFunc("/groups/{id}", handlers.DeleteGroup(database)).Methods("DELETE")
	admin.HandleFunc("/groups/{id}/users", handlers.AddUserToGroup(database)).Methods("POST")
	admin.HandleFunc("/groups/{id}/users/{userId}", handlers.RemoveUserFromGroup(database)).Methods("DELETE")
	admin.HandleFunc("/groups/{id}/tags", handlers.AddTagToGroup(database)).Methods("POST")
	admin.HandleFunc("/groups/{id}/tags/{tagId}", handlers.RemoveTagFromGroup(database)).Methods("DELETE")

	// Tags - list is public to all authenticated users, write ops are admin only
	protected.HandleFunc("/tags", handlers.ListTags(database)).Methods("GET")
	admin.HandleFunc("/tags", handlers.CreateTag(database)).Methods("POST")
	admin.HandleFunc("/tags/{id}", handlers.UpdateTag(database)).Methods("PUT")
	admin.HandleFunc("/tags/{id}", handlers.DeleteTag(database)).Methods("DELETE")

	// Bookmarks (write)
	admin.HandleFunc("/bookmarks", handlers.CreateBookmarkNode(database)).Methods("POST")
	admin.HandleFunc("/bookmarks/{id}", handlers.UpdateBookmarkNode(database)).Methods("PUT")
	admin.HandleFunc("/bookmarks/{id}", handlers.DeleteBookmarkNode(database)).Methods("DELETE")
	admin.HandleFunc("/bookmarks/{id}/move", handlers.MoveBookmarkNode(database)).Methods("PUT")
	admin.HandleFunc("/bookmarks/cache-icon", handlers.CacheIcon(iconsDir)).Methods("POST")

	// Panels (write)
	admin.HandleFunc("/panels", handlers.CreatePanel(database)).Methods("POST")
	admin.HandleFunc("/panels/{id}", handlers.UpdatePanel(database)).Methods("PUT")
	admin.HandleFunc("/panels/{id}", handlers.DeletePanel(database)).Methods("DELETE")
	admin.HandleFunc("/panels/{id}/tags", handlers.AddTagToPanel(database)).Methods("POST")
	admin.HandleFunc("/panels/{id}/tags/{tagId}", handlers.RemoveTagFromPanel(database)).Methods("DELETE")

	// Config
	admin.HandleFunc("/config/oauth", handlers.GetOAuthConfig(database)).Methods("GET")
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

	log.Printf("Stoa listening on :%s", port)
	if err := http.ListenAndServe(":"+port, c.Handler(r)); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
