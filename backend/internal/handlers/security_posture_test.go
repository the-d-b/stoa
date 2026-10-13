package handlers

import "testing"

func TestCveCheckVersion(t *testing.T) {
	cases := []struct {
		name    string
		ranges  []cveVersionRange
		running string
		want    cveApplicability
	}{
		{"in range", []cveVersionRange{{startIncluding: "1.0", endExcluding: "2.0"}}, "1.5.3", cveApplies},
		{"past fix", []cveVersionRange{{endExcluding: "1.40"}}, "1.43.4.10903-e5521b8dc", cveExcluded},
		{"exact match", []cveVersionRange{{exact: "24.7.1"}}, "24.7.1", cveApplies},
		{"exact miss", []cveVersionRange{{exact: "24.7.1"}}, "26.1.8_5", cveExcluded},
		{"unbounded", []cveVersionRange{{unbounded: true}}, "1.0", cveApplies},
		{"no ranges", nil, "1.0", cveApplies},
		{"unknown version", []cveVersionRange{{endExcluding: "1.0"}}, "", cveApplies},
		// CVE-2020-5742: NVD recorded Plex's fix boundary as a date.
		{"date bound", []cveVersionRange{{endExcluding: "2020-06-15"}}, "1.43.4.10903-e5521b8dc", cveUnverifiable},
		{"date bound but comparable range applies", []cveVersionRange{
			{endExcluding: "2020-06-15"}, {startIncluding: "1.0", endIncluding: "1.50"},
		}, "1.43.4", cveApplies},
		{"date bound and comparable range excludes", []cveVersionRange{
			{endExcluding: "2020-06-15"}, {endExcluding: "1.20"},
		}, "1.43.4", cveUnverifiable},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := cveCheckVersion(CVEItem{ranges: tc.ranges}, tc.running)
			if got != tc.want {
				t.Errorf("cveCheckVersion = %d, want %d", got, tc.want)
			}
		})
	}
}
