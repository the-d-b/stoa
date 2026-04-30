package main

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/crypto/bcrypt"
)

const defaultDBPath = "/data/db/stoa.db"

func main() {
	args := os.Args[1:]
	if len(args) == 0 {
		printUsage()
		os.Exit(0)
	}

	// Extract --db flag from anywhere in args
	dbPath := os.Getenv("STOA_DB_PATH")
	if dbPath == "" {
		dbPath = defaultDBPath
	}
	var filtered []string
	for i := 0; i < len(args); i++ {
		if args[i] == "--db" && i+1 < len(args) {
			dbPath = args[i+1]
			i++
		} else if strings.HasPrefix(args[i], "--db=") {
			dbPath = strings.TrimPrefix(args[i], "--db=")
		} else {
			filtered = append(filtered, args[i])
		}
	}
	args = filtered

	if len(args) == 0 {
		printUsage()
		os.Exit(0)
	}

	group := args[0]
	sub := ""
	if len(args) > 1 {
		sub = args[1]
	}
	rest := []string{}
	if len(args) > 2 {
		rest = args[2:]
	}

	switch group {
	case "user":
		runUser(dbPath, sub, rest)
	case "config":
		runConfig(dbPath, sub, rest)
	case "geo":
		runGeo(dbPath, sub, rest)
	case "storage":
		runStorage(dbPath, sub, rest)
	case "db":
		runDB(dbPath, sub, rest)
	case "bookmarks":
		runBookmarks(dbPath, sub, rest)
	default:
		fatalf("unknown command group: %s\n", group)
	}
}

// ── DB helpers ────────────────────────────────────────────────────────────────

func openDB(path string) *sql.DB {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		fatalf("database not found: %s\n", path)
	}
	db, err := sql.Open("sqlite3", path+"?_foreign_keys=on")
	if err != nil {
		fatalf("failed to open database: %v\n", err)
	}
	if err := db.Ping(); err != nil {
		fatalf("failed to connect to database: %v\n", err)
	}
	return db
}

func fatalf(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "error: "+format, args...)
	os.Exit(1)
}

func confirm(prompt string) bool {
	fmt.Print(prompt + " [y/N] ")
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Scan()
	return strings.ToLower(strings.TrimSpace(scanner.Text())) == "y"
}

func prompt(label string, secret bool) string {
	fmt.Print(label + ": ")
	if secret {
		// Read without echo isn't trivial cross-platform without a dep;
		// for a CLI tool running in docker exec this is acceptable
		fmt.Println("(input will be visible)")
	}
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Scan()
	return strings.TrimSpace(scanner.Text())
}

func randID() string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	b := make([]byte, 16)
	for i := range b {
		b[i] = chars[r.Intn(len(chars))]
	}
	return string(b)
}

// ── user ─────────────────────────────────────────────────────────────────────

func runUser(dbPath, sub string, args []string) {
	switch sub {
	case "list":
		userList(dbPath)
	case "create":
		userCreate(dbPath, args)
	case "reset-password":
		userResetPassword(dbPath, args)
	default:
		fatalf("unknown user command: %s\nAvailable: list, create, reset-password\n", sub)
	}
}

func userList(dbPath string) {
	db := openDB(dbPath)
	defer db.Close()

	rows, err := db.Query(`
		SELECT id, username, role, created_at,
		       COALESCE(last_login, 'never') as last_login
		FROM users ORDER BY role DESC, username`)
	if err != nil {
		fatalf("query failed: %v\n", err)
	}
	defer rows.Close()

	fmt.Printf("%-20s %-12s %-10s %-20s %s\n", "USERNAME", "ROLE", "ID", "CREATED", "LAST LOGIN")
	fmt.Println(strings.Repeat("─", 80))
	for rows.Next() {
		var id, username, role, createdAt, lastLogin string
		rows.Scan(&id, &username, &role, &createdAt, &lastLogin)
		shortID := id
		if len(id) > 8 { shortID = id[:8]+"..." }
		createdDate := createdAt
		if len(createdAt) > 10 { createdDate = createdAt[:10] }
		fmt.Printf("%-20s %-12s %-10s %-20s %s\n", username, role, shortID, createdDate, lastLogin)
	}
}

func userCreate(dbPath string, args []string) {
	db := openDB(dbPath)
	defer db.Close()

	username := ""
	if len(args) > 0 {
		username = args[0]
	} else {
		username = prompt("Username", false)
	}
	if username == "" {
		fatalf("username is required\n")
	}

	// Check exists
	var count int
	db.QueryRow("SELECT COUNT(*) FROM users WHERE username=?", username).Scan(&count)
	if count > 0 {
		fatalf("user '%s' already exists\n", username)
	}

	password := prompt("Password", true)
	if len(password) < 8 {
		fatalf("password must be at least 8 characters\n")
	}

	roleInput := prompt("Role (admin/user) [user]", false)
	role := "user"
	if roleInput == "admin" {
		role = "admin"
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		fatalf("failed to hash password: %v\n", err)
	}

	id := randID()
	_, err = db.Exec(
		`INSERT INTO users (id, username, password_hash, role, auth_provider, created_at)
		 VALUES (?, ?, ?, ?, 'local', datetime('now'))`,
		id, username, string(hash), role,
	)
	if err != nil {
		fatalf("failed to create user: %v\n", err)
	}
	fmt.Printf("✓ User '%s' created with role '%s'\n", username, role)
}

func userResetPassword(dbPath string, args []string) {
	db := openDB(dbPath)
	defer db.Close()

	username := ""
	if len(args) > 0 {
		username = args[0]
	} else {
		username = prompt("Username", false)
	}
	if username == "" {
		fatalf("username is required\n")
	}

	var id string
	err := db.QueryRow("SELECT id FROM users WHERE username=?", username).Scan(&id)
	if err == sql.ErrNoRows {
		fatalf("user '%s' not found\n", username)
	}

	password := prompt("New password", true)
	if len(password) < 8 {
		fatalf("password must be at least 8 characters\n")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		fatalf("failed to hash password: %v\n", err)
	}

	db.Exec("UPDATE users SET password_hash=? WHERE id=?", string(hash), id)
	fmt.Printf("✓ Password reset for '%s'\n", username)
}

// ── config ────────────────────────────────────────────────────────────────────

func runConfig(dbPath, sub string, args []string) {
	switch sub {
	case "set-mode":
		configSetMode(dbPath, args)
	case "show":
		configShow(dbPath)
	default:
		fatalf("unknown config command: %s\nAvailable: set-mode, show\n", sub)
	}
}

func configSetMode(dbPath string, args []string) {
	db := openDB(dbPath)
	defer db.Close()

	if len(args) == 0 {
		fatalf("Usage: stoa-cli config set-mode <single|multi> [--user <username>] [--no-auth]\n")
	}
	mode := args[0]
	if mode != "single" && mode != "multi" {
		fatalf("mode must be 'single' or 'multi'\n")
	}

	if mode == "multi" {
		// Re-enable all users
		db.Exec("UPDATE users SET enabled=1 WHERE id != 'SYSTEM'")
		db.Exec("DELETE FROM app_config WHERE key='auto_login_user_id'")
		db.Exec(`INSERT INTO app_config (key, value) VALUES ('user_mode', 'multi')
			ON CONFLICT(key) DO UPDATE SET value='multi'`)
		fmt.Println("✓ Switched to multi-user mode")
		fmt.Println("  All user accounts re-enabled")
		return
	}

	// Single mode — require --user
	username := ""
	noAuth := false
	for i := 1; i < len(args); i++ {
		switch args[i] {
		case "--user":
			if i+1 >= len(args) { fatalf("--user requires a username\n") }
			i++
			username = args[i]
		case "--no-auth":
			noAuth = true
		}
	}
	if username == "" {
		fatalf("single mode requires --user <username>\nUsage: stoa-cli config set-mode single --user <username> [--no-auth]\n")
	}

	// Validate user exists
	var userID, role string
	err := db.QueryRow("SELECT id, role FROM users WHERE username=? AND id != 'SYSTEM'", username).Scan(&userID, &role)
	if err != nil {
		fatalf("user %q not found\n", username)
	}

	// Count other users
	var otherCount int
	db.QueryRow("SELECT COUNT(*) FROM users WHERE id != 'SYSTEM' AND id != ?", userID).Scan(&otherCount)

	// Confirm
	authDesc := "login required"
	if noAuth { authDesc = "no login required (auto-login)" }
	fmt.Printf("\nSwitching to single-user mode:\n")
	fmt.Printf("  Single user : %s (role: %s)\n", username, role)
	fmt.Printf("  Auth        : %s\n", authDesc)
	if otherCount > 0 {
		fmt.Printf("  Other users : %d account(s) will be disabled (data preserved)\n", otherCount)
	}
	fmt.Printf("\nProceed? [y/N] ")
	var confirm string
	fmt.Scanln(&confirm)
	if confirm != "y" && confirm != "Y" {
		fmt.Println("Aborted.")
		return
	}

	// Apply
	db.Exec(`INSERT INTO app_config (key, value) VALUES ('user_mode', 'single')
		ON CONFLICT(key) DO UPDATE SET value='single'`)

	if noAuth {
		db.Exec(`INSERT INTO app_config (key, value) VALUES ('auto_login_user_id', ?)
			ON CONFLICT(key) DO UPDATE SET value=excluded.value`, userID)
	} else {
		db.Exec("DELETE FROM app_config WHERE key='auto_login_user_id'")
	}

	// Disable other users
	if otherCount > 0 {
		db.Exec("UPDATE users SET enabled=0 WHERE id != 'SYSTEM' AND id != ?", userID)
	}
	// Ensure designated user is enabled
	db.Exec("UPDATE users SET enabled=1 WHERE id=?", userID)

	fmt.Printf("\n✓ Switched to single-user mode (user: %s)\n", username)
	if noAuth {
		fmt.Println("  Auto-login enabled — no password required")
	} else {
		fmt.Println("  Login required — use your existing password")
	}
	if otherCount > 0 {
		fmt.Printf("  %d other account(s) disabled (re-enable with: stoa-cli config set-mode multi)\n", otherCount)
	}
}

func configShow(dbPath string) {
	db := openDB(dbPath)
	defer db.Close()

	rows, err := db.Query("SELECT key, value FROM app_config ORDER BY key")
	if err != nil {
		fatalf("query failed: %v\n", err)
	}
	defer rows.Close()
	fmt.Printf("%-30s %s\n", "KEY", "VALUE")
	fmt.Println(strings.Repeat("─", 50))
	for rows.Next() {
		var k, v string
		rows.Scan(&k, &v)
		fmt.Printf("%-30s %s\n", k, v)
	}
}

// ── geo ───────────────────────────────────────────────────────────────────────

func runGeo(dbPath, sub string, args []string) {
	switch sub {
	case "prune":
		geoPrune(dbPath, args)
	case "stats":
		geoStats(dbPath)
	default:
		fatalf("unknown geo command: %s\nAvailable: prune, stats\n", sub)
	}
}

func geoPrune(dbPath string, args []string) {
	db := openDB(dbPath)
	defer db.Close()

	days := 90
	for _, a := range args {
		if strings.HasPrefix(a, "--older-than=") {
			val := strings.TrimPrefix(a, "--older-than=")
			val = strings.TrimSuffix(val, "d")
			if n, err := strconv.Atoi(val); err == nil {
				days = n
			}
		} else if a == "--older-than" {
			// handled below if next arg exists
		}
	}
	for i, a := range args {
		if a == "--older-than" && i+1 < len(args) {
			val := strings.TrimSuffix(args[i+1], "d")
			if n, err := strconv.Atoi(val); err == nil {
				days = n
			}
		}
	}

	var count int
	db.QueryRow(
		"SELECT COUNT(*) FROM geo_ip_cache WHERE cached_at < datetime('now', ?)",
		fmt.Sprintf("-%d days", days),
	).Scan(&count)

	if count == 0 {
		fmt.Printf("No geo-IP entries older than %d days found.\n", days)
		return
	}

	if !confirm(fmt.Sprintf("Delete %d geo-IP cache entries older than %d days?", count, days)) {
		fmt.Println("Aborted.")
		return
	}

	res, err := db.Exec(
		"DELETE FROM geo_ip_cache WHERE cached_at < datetime('now', ?)",
		fmt.Sprintf("-%d days", days),
	)
	if err != nil {
		fatalf("delete failed: %v\n", err)
	}
	n, _ := res.RowsAffected()
	fmt.Printf("✓ Deleted %d geo-IP cache entries\n", n)
}

func geoStats(dbPath string) {
	db := openDB(dbPath)
	defer db.Close()

	var total, week, month int
	db.QueryRow("SELECT COUNT(*) FROM geo_ip_cache").Scan(&total)
	db.QueryRow("SELECT COUNT(*) FROM geo_ip_cache WHERE cached_at > datetime('now', '-7 days')").Scan(&week)
	db.QueryRow("SELECT COUNT(*) FROM geo_ip_cache WHERE cached_at > datetime('now', '-30 days')").Scan(&month)
	fmt.Printf("Total cached IPs:        %d\n", total)
	fmt.Printf("Cached in last 7 days:   %d\n", week)
	fmt.Printf("Cached in last 30 days:  %d\n", month)
	fmt.Printf("Older than 30 days:      %d\n", total-month)
}

// ── storage ───────────────────────────────────────────────────────────────────

func runStorage(dbPath, sub string, args []string) {
	switch sub {
	case "prune":
		storagePrune(dbPath, args)
	default:
		fatalf("unknown storage command: %s\nAvailable: prune\n", sub)
	}
}

func storagePrune(dbPath string, args []string) {
	db := openDB(dbPath)
	defer db.Close()

	baseDir := filepath.Dir(filepath.Dir(dbPath))
	uploadsDir := filepath.Join(baseDir, "uploads")
	iconsDir := filepath.Join(baseDir, "icons")

	dryRun := false
	for _, a := range args {
		if a == "--dry-run" {
			dryRun = true
		}
	}

	// Collect all referenced filenames from DB
	referenced := map[string]bool{}

	// Bookmark icon_url references
	rows, _ := db.Query("SELECT icon_url FROM bookmark_nodes WHERE icon_url IS NOT NULL AND icon_url != ''")
	for rows.Next() {
		var icon string
		rows.Scan(&icon)
		referenced[filepath.Base(icon)] = true
	}
	rows.Close()

	// User avatars (stored in user_preferences.avatar_url)
	rows, _ = db.Query("SELECT avatar_url FROM user_preferences WHERE avatar_url IS NOT NULL AND avatar_url != ''")
	for rows.Next() {
		var avatar string
		rows.Scan(&avatar)
		referenced[filepath.Base(avatar)] = true
	}
	rows.Close()

	// Glyph icons referenced in glyphs table
	rows, _ = db.Query("SELECT icon_path FROM glyphs WHERE icon_path IS NOT NULL AND icon_path != ''")
	for rows.Next() {
		var icon string
		rows.Scan(&icon)
		referenced[filepath.Base(icon)] = true
	}
	rows.Close()

	var orphans []string
	var totalSize int64

	scanDir := func(dir string) {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			return
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			fmt.Printf("warning: could not read %s: %v\n", dir, err)
			return
		}
		for _, e := range entries {
			if e.IsDir() { continue }
			if !referenced[e.Name()] {
				info, _ := e.Info()
				totalSize += info.Size()
				orphans = append(orphans, filepath.Join(dir, e.Name()))
			}
		}
	}

	scanDir(uploadsDir)
	scanDir(iconsDir)

	if len(orphans) == 0 {
		fmt.Println("No orphaned files found.")
		return
	}

	fmt.Printf("Found %d orphaned file(s) totalling %.1f KB\n", len(orphans), float64(totalSize)/1024)
	for _, f := range orphans {
		fmt.Printf("  %s\n", f)
	}

	if dryRun {
		fmt.Println("\n(dry run — no files deleted)")
		return
	}

	if !confirm(fmt.Sprintf("\nDelete %d orphaned file(s)?", len(orphans))) {
		fmt.Println("Aborted.")
		return
	}

	deleted := 0
	for _, f := range orphans {
		if err := os.Remove(f); err == nil {
			deleted++
		} else {
			fmt.Printf("  warning: could not delete %s: %v\n", filepath.Base(f), err)
		}
	}
	fmt.Printf("✓ Deleted %d orphaned file(s)\n", deleted)
}

// ── db ────────────────────────────────────────────────────────────────────────

func runDB(dbPath, sub string, args []string) {
	switch sub {
	case "check":
		dbCheck(dbPath)
	case "backup":
		dbBackup(dbPath, args)
	default:
		fatalf("unknown db command: %s\nAvailable: check, backup\n", sub)
	}
}

func dbCheck(dbPath string) {
	db := openDB(dbPath)
	defer db.Close()

	fmt.Print("Running integrity check... ")
	rows, err := db.Query("PRAGMA integrity_check")
	if err != nil {
		fatalf("integrity check failed: %v\n", err)
	}
	defer rows.Close()

	var results []string
	for rows.Next() {
		var result string
		rows.Scan(&result)
		results = append(results, result)
	}

	if len(results) == 1 && results[0] == "ok" {
		fmt.Println("✓ OK")
	} else {
		fmt.Println("✗ Issues found:")
		for _, r := range results {
			fmt.Printf("  %s\n", r)
		}
		os.Exit(1)
	}

	// Also check foreign keys
	fmt.Print("Running foreign key check... ")
	rows2, _ := db.Query("PRAGMA foreign_key_check")
	defer rows2.Close()
	var fkIssues []string
	for rows2.Next() {
		var table, rowid, parent, fkid string
		rows2.Scan(&table, &rowid, &parent, &fkid)
		fkIssues = append(fkIssues, fmt.Sprintf("%s row %s references missing %s", table, rowid, parent))
	}
	if len(fkIssues) == 0 {
		fmt.Println("✓ OK")
	} else {
		fmt.Printf("✗ %d foreign key violation(s):\n", len(fkIssues))
		for _, issue := range fkIssues {
			fmt.Printf("  %s\n", issue)
		}
	}

	// Print DB size
	info, _ := os.Stat(dbPath)
	fmt.Printf("Database size: %.2f MB\n", float64(info.Size())/1048576)
}

func dbBackup(dbPath string, args []string) {
	if len(args) == 0 {
		fatalf("usage: stoa-cli db backup <output-path>\n")
	}
	dest := args[0]

	src, err := os.Open(dbPath)
	if err != nil {
		fatalf("failed to open source database: %v\n", err)
	}
	defer src.Close()

	dst, err := os.Create(dest)
	if err != nil {
		fatalf("failed to create backup file: %v\n", err)
	}
	defer dst.Close()

	n, err := io.Copy(dst, src)
	if err != nil {
		fatalf("backup failed: %v\n", err)
	}
	fmt.Printf("✓ Backup written to %s (%.2f MB)\n", dest, float64(n)/1048576)
}

// ── bookmarks ────────────────────────────────────────────────────────────────

type BookmarkNode struct {
	Title    string         `json:"title"`
	Type     string         `json:"type"`
	URL      string         `json:"url,omitempty"`
	Icon     string         `json:"icon,omitempty"`
	SortOrder int           `json:"sort_order"`
	Children []BookmarkNode `json:"children,omitempty"`
}

type BookmarkExport struct {
	ExportedAt string         `json:"exported_at"`
	Version    int            `json:"version"`
	Nodes      []BookmarkNode `json:"nodes"`
}

func runBookmarks(dbPath, sub string, args []string) {
	switch sub {
	case "export":
		bookmarksExport(dbPath, args)
	case "import":
		bookmarksImport(dbPath, args)
	default:
		fatalf("unknown bookmarks command: %s\nAvailable: export, import\n", sub)
	}
}

func bookmarksExport(dbPath string, args []string) {
	if len(args) == 0 {
		fatalf("usage: stoa-cli bookmarks export <output.json>\n")
	}
	outPath := args[0]

	db := openDB(dbPath)
	defer db.Close()

	nodes := loadBookmarkTree(db, nil)

	export := BookmarkExport{
		ExportedAt: time.Now().Format(time.RFC3339),
		Version:    1,
		Nodes:      nodes,
	}

	data, err := json.MarshalIndent(export, "", "  ")
	if err != nil {
		fatalf("failed to marshal bookmarks: %v\n", err)
	}

	if err := os.WriteFile(outPath, data, 0644); err != nil {
		fatalf("failed to write file: %v\n", err)
	}

	count := countNodes(nodes)
	fmt.Printf("✓ Exported %d bookmark node(s) to %s\n", count, outPath)
}

func loadBookmarkTree(db *sql.DB, parentID interface{}) []BookmarkNode {
	var rows *sql.Rows
	var err error
	if parentID == nil {
		rows, err = db.Query(`
			SELECT name, type, COALESCE(url,''), COALESCE(icon_url,''), sort_order, id
			FROM bookmark_nodes
			WHERE parent_id IS NULL AND scope = 'shared'
			ORDER BY sort_order, name`)
	} else {
		rows, err = db.Query(`
			SELECT name, type, COALESCE(url,''), COALESCE(icon_url,''), sort_order, id
			FROM bookmark_nodes
			WHERE parent_id=?
			ORDER BY sort_order, name`, parentID)
	}
	if err != nil {
		return nil
	}
	defer rows.Close()

	var nodes []BookmarkNode
	for rows.Next() {
		var n BookmarkNode
		var id string
		rows.Scan(&n.Title, &n.Type, &n.URL, &n.Icon, &n.SortOrder, &id)
		n.Children = loadBookmarkTree(db, id)
		nodes = append(nodes, n)
	}
	return nodes
}

func countNodes(nodes []BookmarkNode) int {
	count := len(nodes)
	for _, n := range nodes {
		count += countNodes(n.Children)
	}
	return count
}

func bookmarksImport(dbPath string, args []string) {
	replace := false
	var inPath string
	for _, a := range args {
		if a == "--replace" {
			replace = true
		} else {
			inPath = a
		}
	}
	if inPath == "" {
		fatalf("usage: stoa-cli bookmarks import <input.json> [--replace]\n")
	}

	data, err := os.ReadFile(inPath)
	if err != nil {
		fatalf("failed to read file: %v\n", err)
	}

	var export BookmarkExport
	if err := json.Unmarshal(data, &export); err != nil {
		fatalf("failed to parse JSON: %v\n", err)
	}

	db := openDB(dbPath)
	defer db.Close()

	if replace {
		// Count what we're replacing
		var existing int
		db.QueryRow(`SELECT COUNT(*) FROM bookmark_nodes WHERE parent_id IS NULL
			AND (created_by IS NULL OR created_by IN (SELECT id FROM users WHERE role='admin'))`).Scan(&existing)
		if existing > 0 {
			if !confirm(fmt.Sprintf("Replace %d existing system bookmark root node(s)?", existing)) {
				fmt.Println("Aborted.")
				return
			}
			// Delete all system bookmarks (cascades to children)
			db.Exec(`DELETE FROM bookmark_nodes WHERE scope = 'shared'`)
		}
	}

	tx, err := db.Begin()
	if err != nil {
		fatalf("failed to begin transaction: %v\n", err)
	}

	count := 0
	insertNodes(tx, export.Nodes, nil, &count)

	if err := tx.Commit(); err != nil {
		tx.Rollback()
		fatalf("import failed: %v\n", err)
	}

	fmt.Printf("✓ Imported %d bookmark node(s) from %s\n", count, inPath)
}

func nullStrCLI(s string) interface{} {
	if s == "" { return nil }
	return s
}

func insertNodes(tx *sql.Tx, nodes []BookmarkNode, parentID interface{}, count *int) {
	for i, n := range nodes {
		id := randID()
		sortOrder := n.SortOrder
		if sortOrder == 0 {
			sortOrder = i
		}
		// Build path: parent path + "/" + name, or just name for root
		path := n.Title
		if parentID != nil {
			var parentPath string
			tx.QueryRow("SELECT path FROM bookmark_nodes WHERE id=?", parentID).Scan(&parentPath)
			path = parentPath + "/" + n.Title
		}
		var err error
		_, err = tx.Exec(`
			INSERT OR REPLACE INTO bookmark_nodes (id, parent_id, path, name, type, url, icon_url, sort_order, scope)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'shared')`,
			id, parentID, path, n.Title, n.Type, nullStrCLI(n.URL), nullStrCLI(n.Icon), sortOrder)
		if err != nil {
			tx.Rollback()
			fatalf("failed to insert node '%s': %v\n", n.Title, err)
		}
		*count++
		if len(n.Children) > 0 {
			insertNodes(tx, n.Children, id, count)
		}
	}
}

// ── usage ─────────────────────────────────────────────────────────────────────

func printUsage() {
	fmt.Println(`stoa-cli — Stoa management CLI

Usage: stoa-cli [--db <path>] <command> [args]

  --db <path>    Path to SQLite database (default: $STOA_DB_PATH or /data/db/stoa.db)

User commands:
  user list                        List all users
  user create [username]           Create a new user (interactive)
  user reset-password [username]   Reset a user's password

Config commands:
  config show                      Show all app config values
  config set-mode single --user <username> [--no-auth]   Switch to single-user mode
  config set-mode multi                                  Switch to multi-user mode

Geo-IP commands:
  geo stats                        Show geo-IP cache statistics
  geo prune [--older-than <Nd>]    Delete stale geo-IP cache entries (default: 90d)

Storage commands:
  storage prune [--dry-run]        Delete orphaned uploaded files

Database commands:
  db check                         Run integrity and foreign key checks
  db backup <output.db>            Copy database to backup file

Bookmark commands:
  bookmarks export <output.json>   Export system bookmarks to JSON
  bookmarks import <input.json>    Import system bookmarks from JSON
    [--replace]                    Replace existing system bookmarks

Examples:
  stoa-cli user list
  stoa-cli user reset-password admin
  stoa-cli config set-mode single --user admin
  stoa-cli config set-mode single --user admin --no-auth
  stoa-cli config set-mode multi
  stoa-cli geo prune --older-than 90d
  stoa-cli db backup /data/backup-2026.db
  stoa-cli bookmarks export /data/bookmarks.json
  stoa-cli bookmarks import /data/bookmarks.json --replace
  stoa-cli --db /custom/path/stoa.db user list
`)
}
