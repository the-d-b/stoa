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
	// Load config from environment / database
	cfg := config.Load()

	// Initialize database
	database, err := db.Init(cfg.DBPath)
	if err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}
	defer database.Close()

	// Run migrations
	if err := migrations.Run(database); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	// Check if this is a first-run (no users exist)
	firstRun, err := db.IsFirstRun(database)
	if err != nil {
		log.Fatalf("failed to check first run status: %v", err)
	}

	// Initialize auth
	authService := auth.New(cfg, database)

	// Set up router
	r := mux.NewRouter()

	// API routes
	api := r.PathPrefix("/api").Subrouter()

	// Setup / installer routes (always available)
	api.HandleFunc("/setup/status", handlers.SetupStatus(database)).Methods("GET")
	api.HandleFunc("/setup/init", handlers.SetupInit(database, cfg)).Methods("POST")

	// Auth routes
	api.HandleFunc("/auth/login", handlers.LocalLogin(authService)).Methods("POST")
	api.HandleFunc("/auth/logout", handlers.Logout(authService)).Methods("POST")
	api.HandleFunc("/auth/oauth/login", handlers.OAuthLogin(authService)).Methods("GET")
	api.HandleFunc("/auth/oauth/callback", handlers.OAuthCallback(authService, database)).Methods("GET")
	api.HandleFunc("/auth/me", handlers.Me(authService)).Methods("GET")

	// Protected routes - require authentication
	protected := api.PathPrefix("").Subrouter()
	protected.Use(authService.Middleware)

	// User routes
	protected.HandleFunc("/users", handlers.ListUsers(database)).Methods("GET")
	protected.HandleFunc("/users/{id}", handlers.GetUser(database)).Methods("GET")

	// Admin-only routes
	admin := protected.PathPrefix("").Subrouter()
	admin.Use(authService.AdminMiddleware)

	admin.HandleFunc("/users/{id}/role", handlers.UpdateUserRole(database)).Methods("PUT")
	admin.HandleFunc("/users/{id}", handlers.DeleteUser(database)).Methods("DELETE")

	admin.HandleFunc("/groups", handlers.ListGroups(database)).Methods("GET")
	admin.HandleFunc("/groups", handlers.CreateGroup(database)).Methods("POST")
	admin.HandleFunc("/groups/{id}", handlers.GetGroup(database)).Methods("GET")
	admin.HandleFunc("/groups/{id}", handlers.DeleteGroup(database)).Methods("DELETE")
	admin.HandleFunc("/groups/{id}/users", handlers.AddUserToGroup(database)).Methods("POST")
	admin.HandleFunc("/groups/{id}/users/{userId}", handlers.RemoveUserFromGroup(database)).Methods("DELETE")
	admin.HandleFunc("/groups/{id}/tags", handlers.AddTagToGroup(database)).Methods("POST")
	admin.HandleFunc("/groups/{id}/tags/{tagId}", handlers.RemoveTagFromGroup(database)).Methods("DELETE")

	admin.HandleFunc("/tags", handlers.ListTags(database)).Methods("GET")
	admin.HandleFunc("/tags", handlers.CreateTag(database)).Methods("POST")
	admin.HandleFunc("/tags/{id}", handlers.DeleteTag(database)).Methods("DELETE")

	admin.HandleFunc("/config/oauth", handlers.GetOAuthConfig(database)).Methods("GET")
	admin.HandleFunc("/config/oauth", handlers.SaveOAuthConfig(database, cfg)).Methods("PUT")

	// Serve frontend static files
	frontendPath := cfg.FrontendPath
	if _, err := os.Stat(frontendPath); os.IsNotExist(err) {
		frontendPath = "./frontend/dist"
	}
	r.PathPrefix("/").Handler(http.FileServer(http.Dir(frontendPath)))

	// CORS
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
