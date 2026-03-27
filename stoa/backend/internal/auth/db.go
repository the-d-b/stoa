package auth

import "database/sql"

// DB returns the underlying database for use in handlers
func (s *Service) DB() *sql.DB {
	return s.db
}
