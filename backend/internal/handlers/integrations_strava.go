package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

// ── API types (private) ───────────────────────────────────────────────────────

type stravaActivityRaw struct {
	Name           string  `json:"name"`
	Type           string  `json:"type"`
	SportType      string  `json:"sport_type"`
	StartDateLocal string  `json:"start_date_local"`
	Distance       float64 `json:"distance"`
	MovingTime     int     `json:"moving_time"`
	ElapsedTime    int     `json:"elapsed_time"`
	ElevationGain  float64 `json:"total_elevation_gain"`
	AverageSpeed   float64 `json:"average_speed"`
	KudosCount     int     `json:"kudos_count"`
	PRCount        int     `json:"pr_count"`
	HasHeartrate   bool    `json:"has_heartrate"`
	AverageHR      float64 `json:"average_heartrate"`
}

type stravaAthleteRaw struct {
	ID                    int64  `json:"id"`
	FirstName             string `json:"firstname"`
	LastName              string `json:"lastname"`
	ProfileMedium         string `json:"profile_medium"`
	City                  string `json:"city"`
	Country               string `json:"country"`
	FollowerCount         int    `json:"follower_count"`
	FriendCount           int    `json:"friend_count"`
	MeasurementPreference string `json:"measurement_preference"`
}

type stravaTotalsRaw struct {
	Count         int     `json:"count"`
	Distance      float64 `json:"distance"`
	MovingTime    int     `json:"moving_time"`
	ElevationGain float64 `json:"elevation_gain"`
}

type stravaStatsRaw struct {
	RecentRunTotals  stravaTotalsRaw `json:"recent_run_totals"`
	RecentRideTotals stravaTotalsRaw `json:"recent_ride_totals"`
	RecentSwimTotals stravaTotalsRaw `json:"recent_swim_totals"`
	YTDRunTotals     stravaTotalsRaw `json:"ytd_run_totals"`
	YTDRideTotals    stravaTotalsRaw `json:"ytd_ride_totals"`
	YTDSwimTotals    stravaTotalsRaw `json:"ytd_swim_totals"`
	AllRunTotals     stravaTotalsRaw `json:"all_run_totals"`
	AllRideTotals    stravaTotalsRaw `json:"all_ride_totals"`
	AllSwimTotals    stravaTotalsRaw `json:"all_swim_totals"`
}

// ── Output types ──────────────────────────────────────────────────────────────

type StravaActivity struct {
	Name          string  `json:"name"`
	Type          string  `json:"type"`
	Date          string  `json:"date"`
	Distance      float64 `json:"distance"`
	MovingTime    int     `json:"movingTime"`
	ElevationGain float64 `json:"elevationGain"`
	AverageSpeed  float64 `json:"averageSpeed"`
	KudosCount    int     `json:"kudosCount"`
	PRCount       int     `json:"prCount"`
	AverageHR     float64 `json:"averageHR"`
	HasHeartrate  bool    `json:"hasHeartrate"`
}

type StravaTotals struct {
	Count         int     `json:"count"`
	Distance      float64 `json:"distance"`
	MovingTime    int     `json:"movingTime"`
	ElevationGain float64 `json:"elevationGain"`
}

type StravaWeek struct {
	Label string  `json:"label"`
	RunM  float64 `json:"runM"`
	RideM float64 `json:"rideM"`
	SwimM float64 `json:"swimM"`
}

type StravaPanelData struct {
	AthleteName      string          `json:"athleteName"`
	ProfileURL       string          `json:"profileUrl"`
	City             string          `json:"city"`
	Country          string          `json:"country"`
	MeasurementPref  string          `json:"measurementPref"`
	RecentRunTotals  StravaTotals    `json:"recentRunTotals"`
	RecentRideTotals StravaTotals    `json:"recentRideTotals"`
	RecentSwimTotals StravaTotals    `json:"recentSwimTotals"`
	YTDRunTotals     StravaTotals    `json:"ytdRunTotals"`
	YTDRideTotals    StravaTotals    `json:"ytdRideTotals"`
	YTDSwimTotals    StravaTotals    `json:"ytdSwimTotals"`
	AllRunTotals     StravaTotals    `json:"allRunTotals"`
	AllRideTotals    StravaTotals    `json:"allRideTotals"`
	AllSwimTotals    StravaTotals    `json:"allSwimTotals"`
	Activities       []StravaActivity `json:"activities"`
	WeeklyData       []StravaWeek    `json:"weeklyData"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func stravaGet(accessToken, path string) ([]byte, error) {
	req, err := http.NewRequest("GET", "https://www.strava.com/api/v3"+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("strava: HTTP %d", resp.StatusCode)
	}
	return b, nil
}

// ── Sport helpers ─────────────────────────────────────────────────────────────

func stravaIsRun(t string) bool {
	return t == "Run" || t == "VirtualRun" || t == "TrailRun"
}

func stravaIsRide(t string) bool {
	switch t {
	case "Ride", "VirtualRide", "EBikeRide", "GravelRide", "MountainBikeRide":
		return true
	}
	return false
}

func stravaIsSwim(t string) bool {
	return t == "Swim"
}

// stravaWeekStart returns the Monday (00:00 UTC) of the week containing t.
func stravaWeekStart(t time.Time) time.Time {
	d := int(t.Weekday())
	if d == 0 {
		d = 7
	}
	return time.Date(t.Year(), t.Month(), t.Day()-d+1, 0, 0, 0, 0, time.UTC)
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

func fetchStravaPanelData(db *sql.DB, config map[string]interface{}) (*StravaPanelData, error) {
	integrationID, _ := config["integrationId"].(string)
	if integrationID == "" {
		return nil, fmt.Errorf("strava: integrationId not found in panel config")
	}

	accessToken, err := stravaGetValidToken(db, integrationID)
	if err != nil {
		return nil, err
	}

	// Athlete profile
	athleteB, err := stravaGet(accessToken, "/athlete")
	if err != nil {
		return nil, err
	}
	var athlete stravaAthleteRaw
	json.Unmarshal(athleteB, &athlete)

	// Athlete stats
	statsB, err := stravaGet(accessToken, fmt.Sprintf("/athletes/%d/stats", athlete.ID))
	if err != nil {
		return nil, err
	}
	var stats stravaStatsRaw
	json.Unmarshal(statsB, &stats)

	// Activities for last 8 weeks (up to 200)
	eightWeeksAgo := time.Now().Add(-8 * 7 * 24 * time.Hour).Unix()
	activitiesB, err := stravaGet(accessToken,
		fmt.Sprintf("/athlete/activities?per_page=200&after=%d", eightWeeksAgo))
	if err != nil {
		return nil, err
	}
	var rawActs []stravaActivityRaw
	json.Unmarshal(activitiesB, &rawActs)

	// ── Weekly bar chart data ─────────────────────────────────────────────────
	now := time.Now().UTC()
	thisWeekMon := stravaWeekStart(now)
	weekBuckets := make([]StravaWeek, 8)
	weekStarts := make([]time.Time, 8)
	for i := range weekBuckets {
		ws := thisWeekMon.Add(-time.Duration(7-i) * 7 * 24 * time.Hour)
		weekStarts[i] = ws
		label := ws.Format("Jan 2")
		if i == 7 {
			label = "This wk"
		}
		weekBuckets[i] = StravaWeek{Label: label}
	}

	for _, a := range rawActs {
		dateStr := a.StartDateLocal
		if len(dateStr) > 10 {
			dateStr = dateStr[:10]
		}
		actDate, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			continue
		}
		actWeekMon := stravaWeekStart(actDate)
		// Find bucket index (0 = oldest, 7 = this week)
		diffWeeks := int(thisWeekMon.Sub(actWeekMon).Hours() / (24 * 7))
		bucketIdx := 7 - diffWeeks
		if bucketIdx < 0 || bucketIdx > 7 {
			continue
		}
		sportType := a.SportType
		if sportType == "" {
			sportType = a.Type
		}
		switch {
		case stravaIsRun(sportType):
			weekBuckets[bucketIdx].RunM += a.Distance
		case stravaIsRide(sportType):
			weekBuckets[bucketIdx].RideM += a.Distance
		case stravaIsSwim(sportType):
			weekBuckets[bucketIdx].SwimM += a.Distance
		}
	}

	// ── Recent activity list (sorted newest first, max 15) ────────────────────
	sort.Slice(rawActs, func(i, j int) bool {
		return rawActs[i].StartDateLocal > rawActs[j].StartDateLocal
	})
	activities := make([]StravaActivity, 0, 15)
	for _, a := range rawActs {
		if len(activities) >= 15 {
			break
		}
		date := a.StartDateLocal
		if len(date) > 10 {
			date = date[:10]
		}
		sportType := a.SportType
		if sportType == "" {
			sportType = a.Type
		}
		activities = append(activities, StravaActivity{
			Name:          a.Name,
			Type:          sportType,
			Date:          date,
			Distance:      a.Distance,
			MovingTime:    a.MovingTime,
			ElevationGain: a.ElevationGain,
			AverageSpeed:  a.AverageSpeed,
			KudosCount:    a.KudosCount,
			PRCount:       a.PRCount,
			AverageHR:     a.AverageHR,
			HasHeartrate:  a.HasHeartrate,
		})
	}

	toTotals := func(r stravaTotalsRaw) StravaTotals {
		return StravaTotals{
			Count:         r.Count,
			Distance:      r.Distance,
			MovingTime:    r.MovingTime,
			ElevationGain: r.ElevationGain,
		}
	}

	name := strings.TrimSpace(athlete.FirstName + " " + athlete.LastName)
	return &StravaPanelData{
		AthleteName:      name,
		ProfileURL:       athlete.ProfileMedium,
		City:             athlete.City,
		Country:          athlete.Country,
		MeasurementPref:  athlete.MeasurementPreference,
		RecentRunTotals:  toTotals(stats.RecentRunTotals),
		RecentRideTotals: toTotals(stats.RecentRideTotals),
		RecentSwimTotals: toTotals(stats.RecentSwimTotals),
		YTDRunTotals:     toTotals(stats.YTDRunTotals),
		YTDRideTotals:    toTotals(stats.YTDRideTotals),
		YTDSwimTotals:    toTotals(stats.YTDSwimTotals),
		AllRunTotals:     toTotals(stats.AllRunTotals),
		AllRideTotals:    toTotals(stats.AllRideTotals),
		AllSwimTotals:    toTotals(stats.AllSwimTotals),
		Activities:       activities,
		WeeklyData:       weekBuckets,
	}, nil
}
