package handlers

import (
	"crypto/tls"
	"log"
	"database/sql"
	"fmt"
	"net"
	"net/smtp"
	"strings"
)

// ── Mail config ───────────────────────────────────────────────────────────────

type MailConfig struct {
	Host     string `json:"host"`
	Port     string `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"` // never returned to client after save
	From     string `json:"from"`
	TLSMode  string `json:"tlsMode"` // plain | starttls | tls
}

func getMailConfig(db *sql.DB) MailConfig {
	cfg := MailConfig{Port: "587", TLSMode: "starttls"}
	rows, err := db.Query(`SELECT key, value FROM app_config WHERE key LIKE 'mail_%' OR key = 'session_duration_hours'`)
	if err != nil {
		log.Printf("[MAIL] getMailConfig query error: %v", err)
		return cfg
	}
	defer rows.Close()
	rowCount := 0
	for rows.Next() {
		var k, v string
		rows.Scan(&k, &v)
		rowCount++
		log.Printf("[MAIL] config row: key=%q value=%q", k, func() string {
			if k == "mail_password" && v != "" { return "***" }
			return v
		}())
		switch k {
		case "mail_host":
			cfg.Host = v
		case "mail_port":
			if v != "" {
				cfg.Port = v
			}
		case "mail_username":
			cfg.Username = v
		case "mail_password":
			cfg.Password = v
		case "mail_from":
			cfg.From = v
		case "mail_tls_mode":
			if v != "" {
				cfg.TLSMode = v
			}
		}
	}
	log.Printf("[MAIL] getMailConfig: loaded %d rows, host=%q", rowCount, cfg.Host)
	return cfg
}

func saveMailConfig(db *sql.DB, cfg MailConfig) error {
	pairs := map[string]string{
		"mail_host":     cfg.Host,
		"mail_port":     cfg.Port,
		"mail_username": cfg.Username,
		"mail_from":     cfg.From,
		"mail_tls_mode": cfg.TLSMode,
	}
	if cfg.Password != "" {
		pairs["mail_password"] = cfg.Password
	}
	log.Printf("[MAIL] saveMailConfig: writing %d keys", len(pairs))
	for k, v := range pairs {
		displayVal := v
		if k == "mail_password" { displayVal = "***" }
		log.Printf("[MAIL] saveMailConfig: SET %q = %q", k, displayVal)
		if _, err := db.Exec(`INSERT INTO app_config (key, value) VALUES (?, ?)
			ON CONFLICT(key) DO UPDATE SET value=excluded.value`, k, v); err != nil {
			log.Printf("[MAIL] saveMailConfig: DB error for key %q: %v", k, err)
			return err
		}
	}
	log.Printf("[MAIL] saveMailConfig: all keys written OK")
	return nil
}

// ── Send mail ─────────────────────────────────────────────────────────────────

func sendMail(db *sql.DB, to, subject, htmlBody string) error {
	log.Printf("[MAIL] sendMail: to=%q subject=%q", to, subject)
	cfg := getMailConfig(db)
	if cfg.Host == "" {
		log.Printf("[MAIL] sendMail: no host configured")
		return fmt.Errorf("mail server not configured")
	}
	log.Printf("[MAIL] sendMail: using host=%q port=%q tls=%q user=%q", cfg.Host, cfg.Port, cfg.TLSMode, cfg.Username)
	from := cfg.From
	if from == "" {
		from = "stoa@" + cfg.Host
	}

	msg := buildMIME(from, to, subject, htmlBody)
	addr := net.JoinHostPort(cfg.Host, cfg.Port)

	log.Printf("[MAIL] sendMail: dialing %s via %s", addr, cfg.TLSMode)
	switch cfg.TLSMode {
	case "tls":
		// Direct TLS (port 465)
		tlsCfg := &tls.Config{ServerName: cfg.Host}
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			log.Printf("[MAIL] TLS dial error: %v", err)
			return fmt.Errorf("TLS dial: %w", err)
		}
		client, err := smtp.NewClient(conn, cfg.Host)
		if err != nil {
			return fmt.Errorf("SMTP client: %w", err)
		}
		defer client.Close()
		if cfg.Username != "" {
			if err := client.Auth(smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)); err != nil {
				return fmt.Errorf("SMTP auth: %w", err)
			}
		}
		return sendSMTP(client, from, to, msg)

	case "starttls":
		// STARTTLS (port 587)
		client, err := smtp.Dial(addr)
		if err != nil {
			return fmt.Errorf("SMTP dial: %w", err)
		}
		defer client.Close()
		tlsCfg := &tls.Config{ServerName: cfg.Host}
		if err := client.StartTLS(tlsCfg); err != nil {
			return fmt.Errorf("STARTTLS: %w", err)
		}
		if cfg.Username != "" {
			if err := client.Auth(smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)); err != nil {
				return fmt.Errorf("SMTP auth: %w", err)
			}
		}
		return sendSMTP(client, from, to, msg)

	default:
		// Plain SMTP (port 25 or 587 without TLS)
		auth := smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)
		return smtp.SendMail(addr, auth, from, []string{to}, []byte(msg))
	}
}

func sendSMTP(client *smtp.Client, from, to, msg string) error {
	if err := client.Mail(from); err != nil {
		return err
	}
	if err := client.Rcpt(to); err != nil {
		return err
	}
	w, err := client.Data()
	if err != nil {
		return err
	}
	defer w.Close()
	_, err = w.Write([]byte(msg))
	return err
}

func buildMIME(from, to, subject, htmlBody string) string {
	var sb strings.Builder
	sb.WriteString("From: " + from + "\r\n")
	sb.WriteString("To: " + to + "\r\n")
	sb.WriteString("Subject: " + subject + "\r\n")
	sb.WriteString("MIME-Version: 1.0\r\n")
	sb.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	sb.WriteString("\r\n")
	sb.WriteString(htmlBody)
	return sb.String()
}

// ── HTML email template ───────────────────────────────────────────────────────

func resetEmailHTML(resetURL, username string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #0f1117; color: #e2e8f0; margin: 0; padding: 40px 20px; }
  .card { max-width: 480px; margin: 0 auto; background: #1a1d27;
          border: 1px solid #2a2d3a; border-radius: 12px; padding: 36px; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 8px 0; color: #f1f5f9; }
  p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 24px 0; }
  .btn { display: inline-block; background: #7c6fff; color: #fff;
         text-decoration: none; padding: 12px 28px; border-radius: 8px;
         font-size: 14px; font-weight: 600; }
  .footer { margin-top: 24px; font-size: 12px; color: #64748b; }
  .logo { font-size: 18px; font-weight: 700; color: #7c6fff; margin-bottom: 24px; }
</style></head>
<body>
<div class="card">
  <div class="logo">stoa</div>
  <h1>Reset your password</h1>
  <p>Hi %s,<br><br>
     Someone requested a password reset for your Stoa account.
     Click the button below to choose a new password.
     This link expires in 30 minutes.</p>
  <a href="%s" class="btn">Reset password</a>
  <div class="footer">
    If you didn't request this, you can safely ignore this email.<br>
    This link can only be used once.
  </div>
</div>
</body>
</html>`, username, resetURL)
}
