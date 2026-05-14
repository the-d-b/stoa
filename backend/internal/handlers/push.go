package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// getOrCreateVAPIDKeys returns the VAPID key pair from app_config,
// generating and persisting a new pair if absent.
func getOrCreateVAPIDKeys(db *sql.DB) (privateKey, publicKey string, err error) {
	err = db.QueryRow(`SELECT value FROM app_config WHERE key = 'vapid_private_key'`).Scan(&privateKey)
	if err == nil && privateKey != "" {
		db.QueryRow(`SELECT value FROM app_config WHERE key = 'vapid_public_key'`).Scan(&publicKey)
		if publicKey != "" {
			return privateKey, publicKey, nil
		}
	}
	privateKey, publicKey, err = webpush.GenerateVAPIDKeys()
	if err != nil {
		return "", "", err
	}
	db.Exec(`INSERT INTO app_config (key, value) VALUES ('vapid_private_key', ?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value`, privateKey)
	db.Exec(`INSERT INTO app_config (key, value) VALUES ('vapid_public_key', ?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value`, publicKey)
	log.Printf("[PUSH] generated new VAPID key pair")
	return privateKey, publicKey, nil
}

// GetVapidPublicKey returns the VAPID public key for push subscription setup.
func GetVapidPublicKey(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, publicKey, err := getOrCreateVAPIDKeys(db)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get VAPID keys")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"publicKey": publicKey})
	}
}

// SubscribePush saves a browser push subscription for the current user.
func SubscribePush(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct {
			Endpoint string `json:"endpoint"`
			Keys     struct {
				P256dh string `json:"p256dh"`
				Auth   string `json:"auth"`
			} `json:"keys"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Endpoint == "" {
			writeError(w, http.StatusBadRequest, "invalid subscription")
			return
		}
		id := generateID()
		_, err := db.Exec(`
			INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth
		`, id, claims.UserID, req.Endpoint, req.Keys.P256dh, req.Keys.Auth,
			time.Now().UTC().Format(time.RFC3339))
		if err != nil {
			log.Printf("[PUSH] subscribe error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to save subscription")
			return
		}
		log.Printf("[PUSH] user=%s subscribed endpoint=%s", claims.UserID, req.Endpoint[:min(40, len(req.Endpoint))])
		w.WriteHeader(http.StatusNoContent)
	}
}

// UnsubscribePush removes a push subscription (or all subscriptions) for the current user.
func UnsubscribePush(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		var req struct{ Endpoint string `json:"endpoint"` }
		json.NewDecoder(r.Body).Decode(&req)
		if req.Endpoint != "" {
			db.Exec(`DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`,
				claims.UserID, req.Endpoint)
		} else {
			db.Exec(`DELETE FROM push_subscriptions WHERE user_id = ?`, claims.UserID)
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// SendPushToOfflineUsers sends push notifications for a chat message to all users
// who have push subscriptions and are not currently connected via SSE.
// Called in a goroutine from SendChatMessage.
func SendPushToOfflineUsers(db *sql.DB, senderID, title, body string) {
	privateKey, publicKey, err := getOrCreateVAPIDKeys(db)
	if err != nil {
		log.Printf("[PUSH] VAPID key error: %v", err)
		return
	}

	rows, err := db.Query(`
		SELECT user_id, endpoint, p256dh, auth
		FROM push_subscriptions
		WHERE user_id != ?
	`, senderID)
	if err != nil {
		log.Printf("[PUSH] query error: %v", err)
		return
	}
	defer rows.Close()

	type sub struct{ userID, endpoint, p256dh, auth string }
	var subs []sub
	for rows.Next() {
		var s sub
		rows.Scan(&s.userID, &s.endpoint, &s.p256dh, &s.auth)
		subs = append(subs, s)
	}

	payload, _ := json.Marshal(map[string]string{"title": title, "body": body})

	for _, s := range subs {
		if IsUserOnline(s.userID) {
			continue // user has an active SSE connection — skip push
		}
		go func(s sub) {
			resp, err := webpush.SendNotification(payload, &webpush.Subscription{
				Endpoint: s.endpoint,
				Keys: webpush.Keys{
					P256dh: s.p256dh,
					Auth:   s.auth,
				},
			}, &webpush.Options{
				VAPIDPublicKey:  publicKey,
				VAPIDPrivateKey: privateKey,
				Subscriber:      "mailto:admin@stoa.local",
				TTL:             60,
			})
			if err != nil {
				log.Printf("[PUSH] send error user=%s: %v", s.userID, err)
				if resp != nil && (resp.StatusCode == 410 || resp.StatusCode == 404) {
					db.Exec(`DELETE FROM push_subscriptions WHERE endpoint = ?`, s.endpoint)
				}
				return
			}
			resp.Body.Close()
			log.Printf("[PUSH] sent to user=%s status=%d", s.userID, resp.StatusCode)
		}(s)
	}
}
