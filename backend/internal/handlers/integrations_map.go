package handlers

import (
	"database/sql"
)

// mapMarker is the generic, source-agnostic shape the Map panel renders —
// one entry per tracked person/device, regardless of which source produced
// it. Mirrors how fetchCalendarData normalizes every source into a common
// event shape.
type mapMarker struct {
	Source     string  `json:"source"` // source integration type, e.g. "life360" — filter-pill grouping
	ID         string  `json:"id"`     // stable per-person key across refreshes
	Name       string  `json:"name"`
	Lat        float64 `json:"lat"`
	Lng        float64 `json:"lng"`
	Accuracy   int     `json:"accuracy,omitempty"` // meters
	Battery    int     `json:"battery,omitempty"`  // percent, 0 = unknown
	Charging   bool    `json:"charging,omitempty"`
	IsDriving  bool    `json:"isDriving,omitempty"`
	Address    string  `json:"address,omitempty"`
	UpdatedAt  string  `json:"updatedAt,omitempty"`
	GroupLabel string  `json:"groupLabel,omitempty"` // e.g. Life360 circle name
}

func fetchMapData(db *sql.DB, config map[string]interface{}) (map[string]interface{}, error) {
	sources, _ := config["sources"].([]interface{})
	logDebugf("MAP", "fetchMapData: %d sources", len(sources))

	markers := []mapMarker{}

	for _, src := range sources {
		source, _ := src.(map[string]interface{})
		if source == nil {
			continue
		}
		srcType := stringVal(source, "type")
		integrationID := stringVal(source, "integrationId")
		if integrationID == "" {
			continue
		}

		switch srcType {
		case "life360":
			data, err := getLife360Data(db, integrationID)
			if err != nil {
				logErrorf("MAP", "life360 source %s: %v", integrationID, err)
				continue
			}
			for _, m := range data.Members {
				markers = append(markers, mapMarker{
					Source:     "life360",
					ID:         m.ID,
					Name:       m.Name,
					Lat:        m.Latitude,
					Lng:        m.Longitude,
					Accuracy:   m.Accuracy,
					Battery:    m.Battery,
					Charging:   m.Charging,
					IsDriving:  m.IsDriving,
					Address:    m.Address,
					UpdatedAt:  m.UpdatedAt,
					GroupLabel: m.CircleName,
				})
			}
		}
	}

	logDebugf("MAP", "fetchMapData: returning %d total markers", len(markers))
	return map[string]interface{}{"markers": markers}, nil
}
