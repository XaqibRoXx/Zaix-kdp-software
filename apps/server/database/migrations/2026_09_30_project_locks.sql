CREATE TABLE IF NOT EXISTS project_locks (
  project_id CHAR(36) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  client_id VARCHAR(120) NOT NULL,
  client_name VARCHAR(190) NOT NULL DEFAULT 'Windows Desktop',
  acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_project_locks_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_locks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_project_locks_expiry (expires_at),
  INDEX idx_project_locks_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
