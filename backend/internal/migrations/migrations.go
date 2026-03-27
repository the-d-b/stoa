package migrations

import (
	"database/sql"
	"fmt"
	"log"
)

type migration struct {
	version int
	name    string
	up      string
}

// All migrations in order. Never edit existing ones — only append new ones.
var migrations = []migration{
	{
		version: 1,
		name:    "initial_schema",
		up: `
			CREATE TABLE IF NOT EXISTS schema_migrations (
				version INTEGER PRIMARY KEY,
				name TEXT NOT NULL,
				applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS app_config (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS users (
				id TEXT PRIMARY KEY,
				username TEXT UNIQUE NOT NULL,
				email TEXT UNIQUE,
				password_hash TEXT,
				role TEXT NOT NULL DEFAULT 'user',
				auth_provider TEXT NOT NULL DEFAULT 'local',
				oauth_subject TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				last_login DATETIME
			);

			CREATE TABLE IF NOT EXISTS groups (
				id TEXT PRIMARY KEY,
				name TEXT UNIQUE NOT NULL,
				description TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS user_groups (
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
				PRIMARY KEY (user_id, group_id)
			);

			CREATE TABLE IF NOT EXISTS tags (
				id TEXT PRIMARY KEY,
				name TEXT UNIQUE NOT NULL,
				color TEXT DEFAULT '#6366f1',
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS group_tags (
				group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
				tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
				PRIMARY KEY (group_id, tag_id)
			);
		`,
	},
}

func Run(db *sql.DB) error {
	// Ensure migrations table exists
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	for _, m := range migrations {
		var count int
		err := db.QueryRow(
			"SELECT COUNT(*) FROM schema_migrations WHERE version = ?", m.version,
		).Scan(&count)
		if err != nil {
			return fmt.Errorf("failed to check migration %d: %w", m.version, err)
		}

		if count > 0 {
			continue // already applied
		}

		log.Printf("Applying migration %d: %s", m.version, m.name)

		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("failed to begin transaction for migration %d: %w", m.version, err)
		}

		if _, err := tx.Exec(m.up); err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to apply migration %d: %w", m.version, err)
		}

		if _, err := tx.Exec(
			"INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
			m.version, m.name,
		); err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to record migration %d: %w", m.version, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit migration %d: %w", m.version, err)
		}

		log.Printf("Migration %d applied successfully", m.version)
	}

	return nil
}
