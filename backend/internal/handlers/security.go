package handlers

import "net/http"

// SecurityHeaders is a middleware that attaches standard security headers to
// every response. Apply it at the root router so all routes — including static
// file serving — receive the headers.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()

		// Content-Security-Policy
		//  • script-src 'self'           — no inline scripts; all JS served from same origin
		//  • style-src 'unsafe-inline'   — React inline style props compile to style="" attrs
		//  • img-src https:              — favicons, avatars from external origins
		//  • frame-src *                 — users may embed any URL in an iframe panel
		//  • frame-ancestors 'none'      — prevent this app being framed (clickjacking)
		//  • object-src 'none'           — no plugins
		h.Set("Content-Security-Policy",
			"default-src 'self'; "+
				"script-src 'self'; "+
				"style-src 'self' 'unsafe-inline'; "+
				"img-src 'self' data: blob: https:; "+
				"connect-src 'self'; "+
				"font-src 'self' data:; "+
				"frame-src *; "+
				"frame-ancestors 'none'; "+
				"object-src 'none'; "+
				"base-uri 'self'")

		h.Set("X-Frame-Options", "DENY")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

		next.ServeHTTP(w, r)
	})
}
