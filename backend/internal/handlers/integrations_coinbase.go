package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
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
	Currency      string  `json:"currency"`   // e.g. "BTC"
	CurrencyName  string  `json:"currencyName"` // e.g. "Bitcoin"
	Balance       float64 `json:"balance"`    // crypto amount
	NativeBalance float64 `json:"nativeBalance"` // USD amount
	Allocation    float64 `json:"allocation"` // 0-1 of total
}

type CoinbasePanelData struct {
	UIURL         string            `json:"uiUrl"`
	IntegrationID string            `json:"integrationId"`
	TotalUSD      float64           `json:"totalUsd"`
	AccountCount  int               `json:"accountCount"`
	Accounts      []CoinbaseAccount `json:"accounts"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func coinbaseSign(secret, timestamp, method, path string) string {
	msg := timestamp + method + path
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(msg))
	return hex.EncodeToString(mac.Sum(nil))
}

func coinbaseGet(apiKey, apiSecret, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	sig := coinbaseSign(apiSecret, ts, "GET", path)

	req, err := http.NewRequest("GET", "https://api.coinbase.com"+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("CB-ACCESS-KEY", apiKey)
	req.Header.Set("CB-ACCESS-SIGN", sig)
	req.Header.Set("CB-ACCESS-TIMESTAMP", ts)
	req.Header.Set("CB-VERSION", "2016-02-18")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed — check Coinbase API key and secret")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Coinbase", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// splitCoinbaseCreds splits "apiKey:apiSecret" on the first colon.
func splitCoinbaseCreds(creds string) (apiKey, apiSecret string, err error) {
	idx := strings.Index(creds, ":")
	if idx < 0 {
		return "", "", fmt.Errorf("API key must be in apiKey:apiSecret format — create a read-only key in Coinbase → Settings → API")
	}
	return creds[:idx], creds[idx+1:], nil
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
	apiKey, apiSecret, err := splitCoinbaseCreds(creds)
	if err != nil {
		return nil, err
	}

	out := &CoinbasePanelData{UIURL: uiURL, IntegrationID: integrationID}

	// Fetch all account pages
	type rawAccount struct {
		Name     string `json:"name"`
		Currency struct {
			Code string `json:"code"`
			Name string `json:"name"`
		} `json:"currency"`
		Balance struct {
			Amount   string `json:"amount"`
			Currency string `json:"currency"`
		} `json:"balance"`
		NativeBalance struct {
			Amount   string `json:"amount"`
			Currency string `json:"currency"`
		} `json:"native_balance"`
	}

	var allRaw []rawAccount
	nextURI := "/v2/accounts?limit=100"
	for nextURI != "" {
		body, ferr := coinbaseGet(apiKey, apiSecret, nextURI, skipTLS)
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
		nextURI = page.Pagination.NextURI
	}

	// Parse and filter zero-balance accounts
	for _, ra := range allRaw {
		bal, _ := strconv.ParseFloat(ra.Balance.Amount, 64)
		native, _ := strconv.ParseFloat(ra.NativeBalance.Amount, 64)
		if native <= 0 && bal <= 0 {
			continue
		}
		out.TotalUSD += native
		out.Accounts = append(out.Accounts, CoinbaseAccount{
			Name:          ra.Name,
			Currency:      ra.Currency.Code,
			CurrencyName:  ra.Currency.Name,
			Balance:       bal,
			NativeBalance: native,
		})
	}

	// Sort by native balance descending
	sort.Slice(out.Accounts, func(i, j int) bool {
		return out.Accounts[i].NativeBalance > out.Accounts[j].NativeBalance
	})

	// Compute allocations
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
	apiKey, apiSecret, err := splitCoinbaseCreds(creds)
	if err != nil {
		return err
	}
	body, err := coinbaseGet(apiKey, apiSecret, "/v2/user", skipTLS)
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
