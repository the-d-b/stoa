package handlers

import (
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type CoinbaseAccount struct {
	Name          string  `json:"name"`
	Currency      string  `json:"currency"`
	CurrencyName  string  `json:"currencyName"`
	Balance       float64 `json:"balance"`
	NativeBalance float64 `json:"nativeBalance"`
	Allocation    float64 `json:"allocation"`
}

type CoinbasePanelData struct {
	UIURL         string            `json:"uiUrl"`
	IntegrationID string            `json:"integrationId"`
	TotalUSD      float64           `json:"totalUsd"`
	AccountCount  int               `json:"accountCount"`
	Accounts      []CoinbaseAccount `json:"accounts"`
}

// ── Credential parsing ────────────────────────────────────────────────────────

// splitCoinbaseCreds splits "keyName:privateKeyPEM" on the first colon.
// keyName is e.g. "organizations/abc/apiKeys/def"; privateKeyPEM is the EC key
// PEM block (newlines can be literal \n escapes — both forms are accepted).
func splitCoinbaseCreds(creds string) (keyName, privateKeyPEM string, err error) {
	idx := strings.Index(creds, ":")
	if idx < 0 {
		return "", "", fmt.Errorf("API key must be in keyName:privateKey format — create a CDP key at coinbase.com/developer-platform")
	}
	keyName = creds[:idx]
	privateKeyPEM = strings.ReplaceAll(creds[idx+1:], `\n`, "\n")
	return keyName, privateKeyPEM, nil
}

// ── JWT (ES256) ───────────────────────────────────────────────────────────────

// normalizePEM reconstructs a standard PEM block when newlines have been
// stripped (e.g., by a browser password input field on paste).
func normalizePEM(input string) string {
	input = strings.TrimSpace(input)
	if b, _ := pem.Decode([]byte(input)); b != nil {
		return input // already valid
	}

	beginMarker := "-----BEGIN "
	endMarker := "-----END "

	beginIdx := strings.Index(input, beginMarker)
	if beginIdx < 0 {
		return input
	}
	afterBegin := input[beginIdx+len(beginMarker):]
	typeEnd := strings.Index(afterBegin, "-----")
	if typeEnd < 0 {
		return input
	}
	pemType := strings.TrimSpace(afterBegin[:typeEnd])

	endIdx := strings.Index(input, endMarker)
	if endIdx < 0 {
		return input
	}

	// Extract base64 content between markers, strip all whitespace
	raw := input[beginIdx+len(beginMarker)+typeEnd+5 : endIdx]
	raw = strings.Map(func(r rune) rune {
		if r == ' ' || r == '\t' || r == '\r' || r == '\n' {
			return -1
		}
		return r
	}, raw)

	var sb strings.Builder
	sb.WriteString("-----BEGIN " + pemType + "-----\n")
	for len(raw) > 64 {
		sb.WriteString(raw[:64] + "\n")
		raw = raw[64:]
	}
	if raw != "" {
		sb.WriteString(raw + "\n")
	}
	sb.WriteString("-----END " + pemType + "-----\n")
	return sb.String()
}

// coinbaseKey holds a parsed CDP private key and the JWT algorithm it requires.
// Coinbase CDP issues EC P-256 keys (ES256) or Ed25519 keys (EdDSA) depending
// on the portal; the newer cdp.coinbase.com portal issues Ed25519.
type coinbaseKey struct {
	alg   string
	ecKey *ecdsa.PrivateKey
	edKey ed25519.PrivateKey
}

// parseCoinbaseKey accepts the secret portion of the Coinbase CDP credential
// in any format the portal may provide:
//   - PEM with -----BEGIN EC PRIVATE KEY----- or -----BEGIN PRIVATE KEY----- headers
//   - PEM with newlines stripped (browser password input field behaviour)
//   - Raw base64 of DER bytes without headers
//   - Raw base64 of 32-byte Ed25519 seed or 64-byte Ed25519 private key
func parseCoinbaseKey(secret string) (*coinbaseKey, error) {
	secret = strings.TrimSpace(secret)

	if strings.Contains(secret, "-----") {
		block, _ := pem.Decode([]byte(normalizePEM(secret)))
		if block == nil {
			return nil, fmt.Errorf("invalid PEM block — check your Coinbase CDP key")
		}
		switch block.Type {
		case "EC PRIVATE KEY":
			k, err := x509.ParseECPrivateKey(block.Bytes)
			if err != nil {
				return nil, err
			}
			return &coinbaseKey{alg: "ES256", ecKey: k}, nil
		case "PRIVATE KEY":
			k, err := x509.ParsePKCS8PrivateKey(block.Bytes)
			if err != nil {
				return nil, err
			}
			switch kt := k.(type) {
			case *ecdsa.PrivateKey:
				return &coinbaseKey{alg: "ES256", ecKey: kt}, nil
			case ed25519.PrivateKey:
				return &coinbaseKey{alg: "EdDSA", edKey: kt}, nil
			default:
				return nil, fmt.Errorf("unsupported PKCS8 key type: %T", k)
			}
		default:
			return nil, fmt.Errorf("unsupported PEM type: %s", block.Type)
		}
	}

	// No PEM headers — the newer CDP portal gives raw base64 of the key bytes.
	keyBytes, err := base64.StdEncoding.DecodeString(secret)
	if err != nil {
		keyBytes, err = base64.RawStdEncoding.DecodeString(secret)
		if err != nil {
			return nil, fmt.Errorf("private key is neither valid PEM nor base64 — check your Coinbase CDP key")
		}
	}

	// Try DER formats first (PKCS8 covers both EC and Ed25519 when wrapped)
	if k, e := x509.ParsePKCS8PrivateKey(keyBytes); e == nil {
		switch kt := k.(type) {
		case *ecdsa.PrivateKey:
			return &coinbaseKey{alg: "ES256", ecKey: kt}, nil
		case ed25519.PrivateKey:
			return &coinbaseKey{alg: "EdDSA", edKey: kt}, nil
		}
	}
	if k, e := x509.ParseECPrivateKey(keyBytes); e == nil {
		return &coinbaseKey{alg: "ES256", ecKey: k}, nil
	}

	// Raw Ed25519 bytes — 32-byte seed or 64-byte private key (seed+public).
	// The newer cdp.coinbase.com portal provides keys in this form.
	switch len(keyBytes) {
	case ed25519.SeedSize: // 32 bytes
		k := ed25519.NewKeyFromSeed(keyBytes)
		return &coinbaseKey{alg: "EdDSA", edKey: k}, nil
	case ed25519.PrivateKeySize: // 64 bytes
		return &coinbaseKey{alg: "EdDSA", edKey: ed25519.PrivateKey(keyBytes)}, nil
	}

	return nil, fmt.Errorf("private key format not recognized — paste the privateKey value from the JSON file Coinbase gave you")
}

func coinbaseMakeJWT(keyName, privateKeyPEM, method, path string) (string, error) {
	ck, err := parseCoinbaseKey(privateKeyPEM)
	if err != nil {
		return "", err
	}

	nonceBytes := make([]byte, 16)
	if _, err := rand.Read(nonceBytes); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %v", err)
	}

	headerJSON, _ := json.Marshal(map[string]string{
		"alg":   ck.alg,
		"typ":   "JWT",
		"kid":   keyName,
		"nonce": hex.EncodeToString(nonceBytes),
	})
	header := base64.RawURLEncoding.EncodeToString(headerJSON)

	// Strip query string from URI — Coinbase validates path only, not query params
	uriPath := path
	if i := strings.IndexByte(path, '?'); i >= 0 {
		uriPath = path[:i]
	}

	now := time.Now().Unix()
	payloadJSON, _ := json.Marshal(map[string]interface{}{
		"sub": keyName,
		"iss": "cdp",
		"aud": []string{"cdp_service"},
		"nbf": now,
		"exp": now + 120,
		"uri": method + " api.coinbase.com" + uriPath,
	})
	payload := base64.RawURLEncoding.EncodeToString(payloadJSON)

	signingInput := header + "." + payload

	var sigBytes []byte
	switch {
	case ck.ecKey != nil:
		hash := sha256.Sum256([]byte(signingInput))
		r, s, err := ecdsa.Sign(rand.Reader, ck.ecKey, hash[:])
		if err != nil {
			return "", fmt.Errorf("failed to sign JWT: %v", err)
		}
		// ES256: r||s, each zero-padded to 32 bytes
		sig := make([]byte, 64)
		rBytes, sBytes := r.Bytes(), s.Bytes()
		copy(sig[32-len(rBytes):32], rBytes)
		copy(sig[64-len(sBytes):64], sBytes)
		sigBytes = sig
	case ck.edKey != nil:
		// EdDSA: raw 64-byte Ed25519 signature
		sigBytes = ed25519.Sign(ck.edKey, []byte(signingInput))
	default:
		return "", fmt.Errorf("no usable key")
	}

	return signingInput + "." + base64.RawURLEncoding.EncodeToString(sigBytes), nil
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func coinbaseGet(keyName, privateKeyPEM, path string, skipTLS bool) ([]byte, error) {
	jwt, err := coinbaseMakeJWT(keyName, privateKeyPEM, "GET", path)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("GET", "https://api.coinbase.com"+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+jwt)
	req.Header.Set("CB-VERSION", "2016-02-18")
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed — check Coinbase CDP key name and private key")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Coinbase", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Spot price helper ─────────────────────────────────────────────────────────

// coinbaseSpotPrice fetches the current USD spot price for a currency.
// Returns 1.0 for USD; 0 on error so the account is shown but not valued.
func coinbaseSpotPrice(keyName, privateKeyPEM, currency string, skipTLS bool) (float64, error) {
	if currency == "USD" {
		return 1.0, nil
	}
	body, err := coinbaseGet(keyName, privateKeyPEM, "/v2/prices/"+currency+"-USD/spot", skipTLS)
	if err != nil {
		return 0, err
	}
	var r struct {
		Data struct {
			Amount string `json:"amount"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &r); err != nil {
		return 0, err
	}
	return strconv.ParseFloat(r.Data.Amount, 64)
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchCoinbasePanelData(db *sql.DB, config map[string]interface{}) (*CoinbasePanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("integrationId required")
	}
	_, uiURL, creds, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = "https://coinbase.com"
	}
	keyName, privateKeyPEM, err := splitCoinbaseCreds(creds)
	if err != nil {
		return nil, err
	}

	out := &CoinbasePanelData{UIURL: uiURL, IntegrationID: integrationID}

	type rawAccount struct {
		Name     string `json:"name"`
		Currency struct {
			Code string `json:"code"`
			Name string `json:"name"`
		} `json:"currency"`
		Balance struct {
			Amount string `json:"amount"`
		} `json:"balance"`
	}

	// Paginate through all accounts
	var allRaw []rawAccount
	nextPath := "/v2/accounts?limit=100"
	for nextPath != "" {
		body, ferr := coinbaseGet(keyName, privateKeyPEM, nextPath, skipTLS)
		if ferr != nil {
			return nil, ferr
		}
		var page struct {
			Data       []rawAccount `json:"data"`
			Pagination struct {
				NextURI string `json:"next_uri"`
			} `json:"pagination"`
		}
		if jerr := json.Unmarshal(body, &page); jerr != nil {
			return nil, fmt.Errorf("unexpected response from Coinbase")
		}
		allRaw = append(allRaw, page.Data...)
		nextPath = page.Pagination.NextURI
	}

	// Fetch spot prices for each unique currency that has a non-zero balance.
	// The v2 API native_balance field is unreliable with CDP JWT auth, so we
	// calculate USD values ourselves using /v2/prices/{code}-USD/spot.
	spotPrices := make(map[string]float64)
	for _, ra := range allRaw {
		bal, _ := strconv.ParseFloat(ra.Balance.Amount, 64)
		if bal <= 0 {
			continue
		}
		code := ra.Currency.Code
		if code == "" {
			continue
		}
		if _, seen := spotPrices[code]; seen {
			continue
		}
		price, _ := coinbaseSpotPrice(keyName, privateKeyPEM, code, skipTLS)
		spotPrices[code] = price
	}

	for _, ra := range allRaw {
		bal, _ := strconv.ParseFloat(ra.Balance.Amount, 64)
		if bal <= 0 {
			continue
		}
		code := ra.Currency.Code
		native := bal * spotPrices[code]
		out.TotalUSD += native
		out.Accounts = append(out.Accounts, CoinbaseAccount{
			Name:          ra.Name,
			Currency:      code,
			CurrencyName:  ra.Currency.Name,
			Balance:       bal,
			NativeBalance: native,
		})
	}

	sort.Slice(out.Accounts, func(i, j int) bool {
		return out.Accounts[i].NativeBalance > out.Accounts[j].NativeBalance
	})

	if out.TotalUSD > 0 {
		for i := range out.Accounts {
			out.Accounts[i].Allocation = out.Accounts[i].NativeBalance / out.TotalUSD
		}
	}

	out.AccountCount = len(out.Accounts)
	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testCoinbaseConnection(baseURL, creds string, skipTLS bool) error {
	keyName, privateKeyPEM, err := splitCoinbaseCreds(creds)
	if err != nil {
		return err
	}
	body, err := coinbaseGet(keyName, privateKeyPEM, "/v2/user", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if json.Unmarshal(body, &r) != nil || r.Data.ID == "" {
		return fmt.Errorf("unexpected response from Coinbase")
	}
	return nil
}
