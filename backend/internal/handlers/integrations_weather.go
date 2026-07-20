package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ── WMO weather code → description + emoji ────────────────────────────────────

type weatherDesc struct {
	Label string
	Icon  string
}

var wmoDesc = map[int]weatherDesc{
	0:  {"Clear sky", "☀️"},
	1:  {"Mainly clear", "🌤️"},
	2:  {"Partly cloudy", "⛅"},
	3:  {"Overcast", "☁️"},
	45: {"Fog", "🌫️"},
	48: {"Icy fog", "🌫️"},
	51: {"Light drizzle", "🌦️"},
	53: {"Drizzle", "🌦️"},
	55: {"Heavy drizzle", "🌧️"},
	61: {"Light rain", "🌧️"},
	63: {"Rain", "🌧️"},
	65: {"Heavy rain", "🌧️"},
	71: {"Light snow", "🌨️"},
	73: {"Snow", "❄️"},
	75: {"Heavy snow", "❄️"},
	77: {"Snow grains", "🌨️"},
	80: {"Showers", "🌦️"},
	81: {"Rain showers", "🌧️"},
	82: {"Violent showers", "⛈️"},
	85: {"Snow showers", "🌨️"},
	86: {"Heavy snow showers", "❄️"},
	95: {"Thunderstorm", "⛈️"},
	96: {"Thunderstorm w/ hail", "⛈️"},
	99: {"Thunderstorm w/ hail", "⛈️"},
}

func wmoLabel(code int) string {
	if d, ok := wmoDesc[code]; ok {
		return d.Label
	}
	return "Unknown"
}

func wmoIcon(code int) string {
	if d, ok := wmoDesc[code]; ok {
		return d.Icon
	}
	return "🌡️"
}

// ── Wind direction ────────────────────────────────────────────────────────────

func windDir(deg float64) string {
	dirs := []string{"N", "NE", "E", "SE", "S", "SW", "W", "NW"}
	idx := int((deg+22.5)/45) % 8
	return dirs[idx]
}

// ── Open-Meteo types ──────────────────────────────────────────────────────────

type WeatherCurrent struct {
	TempC       float64 `json:"tempC"`
	TempF       float64 `json:"tempF"`
	FeelsLikeC  float64 `json:"feelsLikeC"`
	FeelsLikeF  float64 `json:"feelsLikeF"`
	Humidity    float64 `json:"humidity"`
	WindKph     float64 `json:"windKph"`
	WindMph     float64 `json:"windMph"`
	WindDir     string  `json:"windDir"`
	PrecipMm    float64 `json:"precipMm"`
	WeatherCode int     `json:"weatherCode"`
	Icon        string  `json:"icon"`
	Label       string  `json:"label"`
	IsDay       int     `json:"isDay"`
}

type WeatherDay struct {
	Date        string  `json:"date"`
	MaxC        float64 `json:"maxC"`
	MaxF        float64 `json:"maxF"`
	MinC        float64 `json:"minC"`
	MinF        float64 `json:"minF"`
	PrecipMm    float64 `json:"precipMm"`
	WeatherCode int     `json:"weatherCode"`
	Icon        string  `json:"icon"`
	Label       string  `json:"label"`
}

type WeatherHour struct {
	Time        string  `json:"time"`
	TempC       float64 `json:"tempC"`
	TempF       float64 `json:"tempF"`
	WeatherCode int     `json:"weatherCode"`
	Icon        string  `json:"icon"`
	PrecipMm    float64 `json:"precipMm"`
}

type WeatherPanelData struct {
	City    string         `json:"city"`
	Unit    string         `json:"unit"` // "c" or "f"
	Current WeatherCurrent `json:"current"`
	Daily   []WeatherDay   `json:"daily"`
	Hourly  []WeatherHour  `json:"hourly"` // next 24h
}

// ── Geocoding ─────────────────────────────────────────────────────────────────

type GeoResult struct {
	Name    string  `json:"name"`
	Lat     float64 `json:"latitude"`
	Lon     float64 `json:"longitude"`
	Country string  `json:"country"`
	Admin1  string  `json:"admin1"`
}

// GeocodeLookup handles GET /api/weather/geocode?q=city
func GeocodeLookup(db interface{}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		if q == "" {
			writeError(w, http.StatusBadRequest, "q required")
			return
		}
		apiURL := fmt.Sprintf("https://geocoding-api.open-meteo.com/v1/search?name=%s&count=5&language=en&format=json",
			url.QueryEscape(q))
		resp, err := http.Get(apiURL)
		if err != nil {
			writeError(w, http.StatusBadGateway, "geocode fetch failed")
			return
		}
		defer resp.Body.Close()
		var result struct {
			Results []GeoResult `json:"results"`
		}
		body, _ := io.ReadAll(resp.Body)
		json.Unmarshal(body, &result)
		if result.Results == nil {
			result.Results = []GeoResult{}
		}
		writeJSON(w, http.StatusOK, result.Results)
	}
}

// ── Weather fetcher ───────────────────────────────────────────────────────────

func fetchWeatherPanel(config map[string]interface{}) (*WeatherPanelData, error) {
	lat, _ := config["lat"].(string)
	lon, _ := config["lon"].(string)
	city, _ := config["city"].(string)
	unit, _ := config["unit"].(string)
	if unit == "" {
		unit = "c"
	}
	if lat == "" || lon == "" {
		return nil, fmt.Errorf("lat/lon not configured")
	}

	apiURL := fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s"+
			"&current=temperature_2m,apparent_temperature,relative_humidity_2m,"+
			"wind_speed_10m,wind_direction_10m,precipitation,weather_code,is_day"+
			"&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum"+
			"&hourly=temperature_2m,weather_code,precipitation"+
			"&forecast_days=7&timezone=auto&temperature_unit=celsius&wind_speed_unit=kmh",
		lat, lon)

	resp, err := http.Get(apiURL)
	if err != nil {
		return nil, fmt.Errorf("weather fetch failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var raw map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("weather parse failed: %w", err)
	}

	data := &WeatherPanelData{City: city, Unit: unit}

	// ── Current ──────────────────────────────────────────────────────────────
	if cur, ok := raw["current"].(map[string]interface{}); ok {
		tc := floatVal(cur, "temperature_2m")
		fl := floatVal(cur, "apparent_temperature")
		wd := floatVal(cur, "wind_direction_10m")
		wc := int(floatVal(cur, "weather_code"))
		data.Current = WeatherCurrent{
			TempC:       round1(tc),
			TempF:       round1(cToF(tc)),
			FeelsLikeC:  round1(fl),
			FeelsLikeF:  round1(cToF(fl)),
			Humidity:    floatVal(cur, "relative_humidity_2m"),
			WindKph:     round1(floatVal(cur, "wind_speed_10m")),
			WindMph:     round1(floatVal(cur, "wind_speed_10m") * 0.621371),
			WindDir:     windDir(wd),
			PrecipMm:    floatVal(cur, "precipitation"),
			WeatherCode: wc,
			Icon:        wmoIcon(wc),
			Label:       wmoLabel(wc),
			IsDay:       int(floatVal(cur, "is_day")),
		}
	}

	// ── Daily ─────────────────────────────────────────────────────────────────
	if daily, ok := raw["daily"].(map[string]interface{}); ok {
		dates, _ := daily["time"].([]interface{})
		codes, _ := daily["weather_code"].([]interface{})
		maxC, _ := daily["temperature_2m_max"].([]interface{})
		minC, _ := daily["temperature_2m_min"].([]interface{})
		precip, _ := daily["precipitation_sum"].([]interface{})
		for i := range dates {
			wc := 0
			if i < len(codes) {
				wc = int(toFloat(codes[i]))
			}
			mx, mn, pp := 0.0, 0.0, 0.0
			if i < len(maxC) {
				mx = toFloat(maxC[i])
			}
			if i < len(minC) {
				mn = toFloat(minC[i])
			}
			if i < len(precip) {
				pp = toFloat(precip[i])
			}
			dateStr, _ := dates[i].(string)
			data.Daily = append(data.Daily, WeatherDay{
				Date: dateStr,
				MaxC: round1(mx), MaxF: round1(cToF(mx)),
				MinC: round1(mn), MinF: round1(cToF(mn)),
				PrecipMm:    round1(pp),
				WeatherCode: wc,
				Icon:        wmoIcon(wc),
				Label:       wmoLabel(wc),
			})
		}
	}

	// ── Hourly — next 24h only ────────────────────────────────────────────────
	if hourly, ok := raw["hourly"].(map[string]interface{}); ok {
		times, _ := hourly["time"].([]interface{})
		temps, _ := hourly["temperature_2m"].([]interface{})
		codes, _ := hourly["weather_code"].([]interface{})
		precips, _ := hourly["precipitation"].([]interface{})
		now := time.Now()
		count := 0
		for i := range times {
			if count >= 24 {
				break
			}
			ts, _ := times[i].(string)
			t, err := time.Parse("2006-01-02T15:04", ts)
			if err != nil || t.Before(now) {
				continue
			}
			tc := 0.0
			if i < len(temps) {
				tc = toFloat(temps[i])
			}
			wc := 0
			if i < len(codes) {
				wc = int(toFloat(codes[i]))
			}
			pp := 0.0
			if i < len(precips) {
				pp = toFloat(precips[i])
			}
			data.Hourly = append(data.Hourly, WeatherHour{
				Time: ts, TempC: round1(tc), TempF: round1(cToF(tc)),
				WeatherCode: wc, Icon: wmoIcon(wc), PrecipMm: round1(pp),
			})
			count++
		}
	}

	logDebugf("WEATHER", "fetched for %s (lat=%s lon=%s)", city, lat, lon)
	return data, nil
}

// ── Integration-based fetcher — reads lat/lon/city/unit from integration config ─

func FetchWeatherForIntegration(db *sql.DB, config map[string]interface{}) (interface{}, error) {
	integrationID, _ := config["integrationId"].(string)
	if integrationID == "" {
		return nil, fmt.Errorf("no integrationId in config")
	}

	var apiURL, cfgJSON string
	db.QueryRow(`SELECT COALESCE(api_url,''), COALESCE(config,'{}') FROM integrations WHERE id=? AND enabled=1`,
		integrationID).Scan(&apiURL, &cfgJSON)

	wConfig := map[string]interface{}{"city": "", "unit": "f"}

	// New format: config column holds {"lat":"...","lon":"...","city":"...","unit":"..."}
	if cfgJSON != "{}" && cfgJSON != "" {
		var parsed map[string]interface{}
		if json.Unmarshal([]byte(cfgJSON), &parsed) == nil {
			if lat, ok := parsed["lat"].(string); ok && lat != "" {
				wConfig["lat"] = lat
				wConfig["lon"] = parsed["lon"]
				wConfig["city"] = parsed["city"]
				wConfig["unit"] = parsed["unit"]
			}
		}
	}

	// Legacy fallback: api_url stores "lat|lon|city|unit" (pipe-delimited)
	if wConfig["lat"] == nil && apiURL != "" {
		delim := "|"
		if !strings.Contains(apiURL, "|") {
			delim = ","
		}
		var parts []string
		if delim == "|" {
			parts = strings.Split(apiURL, "|")
		} else {
			commaparts := strings.SplitN(apiURL, ",", 3)
			if len(commaparts) >= 2 {
				parts = []string{commaparts[0], commaparts[1]}
				if len(commaparts) == 3 {
					rest := commaparts[2]
					lastComma := strings.LastIndex(rest, ",")
					if lastComma >= 0 {
						parts = append(parts, strings.TrimSpace(rest[:lastComma]))
						parts = append(parts, strings.TrimSpace(rest[lastComma+1:]))
					} else {
						parts = append(parts, rest)
					}
				}
			}
		}
		if len(parts) >= 2 {
			wConfig["lat"] = strings.TrimSpace(parts[0])
			wConfig["lon"] = strings.TrimSpace(parts[1])
			if len(parts) >= 3 {
				wConfig["city"] = strings.TrimSpace(parts[2])
			}
			if len(parts) >= 4 {
				wConfig["unit"] = strings.TrimSpace(parts[3])
			}
		}
	}

	if wConfig["lat"] == nil {
		return nil, fmt.Errorf("weather integration not configured")
	}
	return fetchWeatherPanel(wConfig)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func cToF(c float64) float64   { return c*9/5 + 32 }
func round1(f float64) float64 { return math.Round(f*10) / 10 }
func floatVal(m map[string]interface{}, k string) float64 {
	v, _ := m[k].(float64)
	return v
}
func toFloat(v interface{}) float64 {
	f, _ := v.(float64)
	return f
}
