package handlers

import (
	"crypto/sha256"
	"database/sql"
	"sync"
)

// secretEncKey is the 32-byte AES-256 key derived from the session secret.
// Zero-length means setup hasn't run yet — encryptSecret falls back to legacy format.
var (
	secretEncKey   []byte
	secretEncKeyMu sync.RWMutex
)

// InitSecretKey derives the AES encryption key from the session_secret stored
// in app_config and caches it for the process lifetime. Safe to call multiple
// times (idempotent). Call once after migrations complete.
func InitSecretKey(db *sql.DB) {
	var secret string
	if err := db.QueryRow("SELECT value FROM app_config WHERE key='session_secret'").Scan(&secret); err != nil || secret == "" {
		// Setup not yet complete — no secrets exist at this point, key will be
		// initialised on the next startup after setup.
		logDebugf("SECRETS", "session_secret not found — encryption key deferred until after setup")
		return
	}
	h := sha256.Sum256([]byte(secret))
	secretEncKeyMu.Lock()
	secretEncKey = h[:]
	secretEncKeyMu.Unlock()
	logDebugf("SECRETS", "AES-256 encryption key initialised")
}

// ReencryptLegacySecrets upgrades any plaintext-prefixed ("enc:") secrets to
// real AES-256-GCM ciphertext. No-op if the key is not initialised yet.
// Call once after InitSecretKey, before serving requests.
func ReencryptLegacySecrets(db *sql.DB) {
	secretEncKeyMu.RLock()
	ready := len(secretEncKey) > 0
	secretEncKeyMu.RUnlock()
	if !ready {
		return
	}

	rows, err := db.Query("SELECT id, value FROM secrets WHERE value LIKE 'enc:%'")
	if err != nil {
		logErrorf("SECRETS", "re-encrypt query error: %v", err)
		return
	}
	type kv struct{ id, val string }
	var stale []kv
	for rows.Next() {
		var s kv
		rows.Scan(&s.id, &s.val)
		stale = append(stale, s)
	}
	rows.Close()

	count := 0
	for _, s := range stale {
		plaintext := s.val[4:] // strip "enc:"
		encrypted, err := encryptSecret(plaintext)
		if err != nil {
			logErrorf("SECRETS", "re-encrypt error for id=%s: %v", s.id, err)
			continue
		}
		db.Exec("UPDATE secrets SET value=? WHERE id=?", encrypted, s.id)
		count++
	}
	if count > 0 {
		logDebugf("SECRETS", "re-encrypted %d legacy secret(s) with AES-256-GCM", count)
	}
}
