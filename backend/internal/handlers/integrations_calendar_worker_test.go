package handlers

import "testing"

func TestCalEventsGetOrCompute(t *testing.T) {
	key := "test-integration-id"
	calEventsDelete(key) // ensure clean slate regardless of test order

	calls := 0
	compute := func() ([]map[string]interface{}, error) {
		calls++
		return []map[string]interface{}{{"date": "2026-08-01", "title": "computed"}}, nil
	}

	// Cold start: cache miss triggers exactly one compute call and warms the cache
	ev := calEventsGetOrCompute(key, compute)
	if calls != 1 {
		t.Fatalf("expected 1 compute call on cache miss, got %d", calls)
	}
	if len(ev) != 1 || ev[0]["title"] != "computed" {
		t.Fatalf("unexpected events from cold compute: %v", ev)
	}

	// Warm path: subsequent calls must not invoke compute again
	ev2 := calEventsGetOrCompute(key, compute)
	if calls != 1 {
		t.Fatalf("expected compute NOT called again on warm cache, got %d total calls", calls)
	}
	if len(ev2) != 1 {
		t.Fatalf("expected cached events returned, got %v", ev2)
	}

	// A worker tick (calEventsSet) overwrites the cached value directly
	calEventsSet(key, []map[string]interface{}{{"date": "2026-08-02", "title": "worker-refreshed"}})
	ev3, ok := calEventsGet(key)
	if !ok || len(ev3) != 1 || ev3[0]["title"] != "worker-refreshed" {
		t.Fatalf("expected worker-set value to be visible immediately, got %v", ev3)
	}

	// Busting the cache (e.g. after a write) forces the next read to recompute
	calEventsDelete(key)
	if _, ok := calEventsGet(key); ok {
		t.Fatalf("expected cache miss after calEventsDelete")
	}
	calls = 0
	calEventsGetOrCompute(key, compute)
	if calls != 1 {
		t.Fatalf("expected recompute after cache bust, got %d calls", calls)
	}
}

func TestCalEventsGetOrComputeErrorDoesNotCache(t *testing.T) {
	key := "test-integration-error"
	calEventsDelete(key)

	calls := 0
	failThenSucceed := func() ([]map[string]interface{}, error) {
		calls++
		if calls == 1 {
			return nil, errTestCompute
		}
		return []map[string]interface{}{{"date": "2026-08-01", "title": "ok"}}, nil
	}

	ev := calEventsGetOrCompute(key, failThenSucceed)
	if ev != nil {
		t.Fatalf("expected nil events on compute error, got %v", ev)
	}
	if _, ok := calEventsGet(key); ok {
		t.Fatalf("a failed compute must not populate the cache")
	}

	// Next call retries (since nothing was cached) and succeeds
	ev2 := calEventsGetOrCompute(key, failThenSucceed)
	if calls != 2 {
		t.Fatalf("expected retry after prior failure, got %d calls", calls)
	}
	if len(ev2) != 1 || ev2[0]["title"] != "ok" {
		t.Fatalf("unexpected events after retry: %v", ev2)
	}
}

var errTestCompute = &testComputeError{"simulated fetch failure"}

type testComputeError struct{ msg string }

func (e *testComputeError) Error() string { return e.msg }
