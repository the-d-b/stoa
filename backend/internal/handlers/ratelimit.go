package handlers

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type rateBucket struct {
	count       int
	windowStart time.Time
}

// RateLimit returns middleware that limits each IP to max requests per window
// using a fixed-window algorithm. Old buckets are swept every window period.
func RateLimit(max int, window time.Duration) func(http.Handler) http.Handler {
	var mu sync.Mutex
	buckets := make(map[string]*rateBucket)

	// Background cleanup prevents unbounded memory growth.
	go func() {
		ticker := time.NewTicker(window)
		defer ticker.Stop()
		for range ticker.C {
			cutoff := time.Now().Add(-window)
			mu.Lock()
			for ip, b := range buckets {
				if b.windowStart.Before(cutoff) {
					delete(buckets, ip)
				}
			}
			mu.Unlock()
		}
	}()

	retryAfter := strconv.Itoa(int(window.Seconds()))

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			now := time.Now()

			mu.Lock()
			b, ok := buckets[ip]
			if !ok || now.Sub(b.windowStart) >= window {
				buckets[ip] = &rateBucket{count: 1, windowStart: now}
				mu.Unlock()
			} else {
				b.count++
				if b.count > max {
					mu.Unlock()
					w.Header().Set("Retry-After", retryAfter)
					writeError(w, http.StatusTooManyRequests, "too many requests — please wait before trying again")
					return
				}
				mu.Unlock()
			}

			next.ServeHTTP(w, r)
		})
	}
}

// clientIP extracts the real client IP, honouring X-Forwarded-For and X-Real-IP
// for deployments behind a reverse proxy.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// XFF is a comma-separated list; the leftmost entry is the original client.
		if i := strings.IndexByte(xff, ','); i >= 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}
