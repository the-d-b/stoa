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
	{
		version: 2,
		name:    "panels_walls_bookmarks",
		up: `
			-- Bookmark tree
			CREATE TABLE IF NOT EXISTS bookmark_nodes (
				id TEXT PRIMARY KEY,
				parent_id TEXT REFERENCES bookmark_nodes(id) ON DELETE CASCADE,
				path TEXT NOT NULL UNIQUE,
				name TEXT NOT NULL,
				type TEXT NOT NULL CHECK(type IN ('section','bookmark')),
				url TEXT,
				icon_url TEXT,
				sort_order INTEGER NOT NULL DEFAULT 0,
				scope TEXT NOT NULL DEFAULT 'shared' CHECK(scope IN ('shared','personal')),
				created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			-- Panels
			CREATE TABLE IF NOT EXISTS panels (
				id TEXT PRIMARY KEY,
				type TEXT NOT NULL DEFAULT 'bookmarks',
				title TEXT NOT NULL,
				config TEXT NOT NULL DEFAULT '{}',
				scope TEXT NOT NULL DEFAULT 'shared' CHECK(scope IN ('shared','personal')),
				created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS panel_tags (
				panel_id TEXT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
				tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
				PRIMARY KEY (panel_id, tag_id)
			);

			CREATE TABLE IF NOT EXISTS user_panel_order (
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				panel_id TEXT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
				position INTEGER NOT NULL DEFAULT 0,
				PRIMARY KEY (user_id, panel_id)
			);

			-- Walls
			CREATE TABLE IF NOT EXISTS walls (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				name TEXT NOT NULL,
				is_default INTEGER NOT NULL DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS wall_tags (
				wall_id TEXT NOT NULL REFERENCES walls(id) ON DELETE CASCADE,
				tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
				active INTEGER NOT NULL DEFAULT 1,
				PRIMARY KEY (wall_id, tag_id)
			);

			-- User preferences
			CREATE TABLE IF NOT EXISTS user_preferences (
				user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
				theme TEXT NOT NULL DEFAULT 'void',
				date_format TEXT NOT NULL DEFAULT 'long',
				avatar_url TEXT,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);
		`,
	},
	{
		version: 3,
		name:    "panel_order_per_wall",
		up: `
			-- Per-wall panel ordering: drop old table, create new with wall_id
			DROP TABLE IF EXISTS user_panel_order_v2;
			CREATE TABLE IF NOT EXISTS user_panel_order_v2 (
				id       TEXT PRIMARY KEY,
				user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				panel_id TEXT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
				wall_id  TEXT REFERENCES walls(id) ON DELETE CASCADE,
				position INTEGER NOT NULL DEFAULT 0
			);
			CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_order
				ON user_panel_order_v2(user_id, panel_id, COALESCE(wall_id, ''));
			-- Migrate existing data
			INSERT OR IGNORE INTO user_panel_order_v2 (id, user_id, panel_id, wall_id, position)
			SELECT (user_id || '-' || panel_id), user_id, panel_id, NULL, position
			FROM user_panel_order;
		`,
	},
}

func Run(db *sql.DB) error {
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
		err := db.QueryRow("SELECT COUNT(*) FROM schema_migrations WHERE version = ?", m.version).Scan(&count)
		if err != nil {
			return fmt.Errorf("failed to check migration %d: %w", m.version, err)
		}
		if count > 0 {
			continue
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
		if _, err := tx.Exec("INSERT INTO schema_migrations (version, name) VALUES (?, ?)", m.version, m.name); err != nil {
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