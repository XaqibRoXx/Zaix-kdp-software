CREATE TABLE IF NOT EXISTS share_links (
  id CHAR(36) PRIMARY KEY,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  project_id CHAR(36) NULL,
  asset_id CHAR(36) NOT NULL,
  slug VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NULL,
  expires_at DATETIME NULL,
  allow_download TINYINT(1) NOT NULL DEFAULT 1,
  proof_mode TINYINT(1) NOT NULL DEFAULT 0,
  revoked_at DATETIME NULL,
  replaced_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_share_links_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_share_links_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_share_links_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
  INDEX idx_share_links_owner (owner_user_id),
  INDEX idx_share_links_project (project_id),
  INDEX idx_share_links_asset (asset_id),
  INDEX idx_share_links_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS share_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  share_id CHAR(36) NOT NULL,
  event_type ENUM('view','download') NOT NULL,
  ip_hash CHAR(64) NULL,
  user_agent_hash CHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_share_events_share FOREIGN KEY (share_id) REFERENCES share_links(id) ON DELETE CASCADE,
  INDEX idx_share_events_share_type_created (share_id, event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS share_comments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  share_id CHAR(36) NOT NULL,
  author_name VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('visible','hidden') NOT NULL DEFAULT 'visible',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_share_comments_share FOREIGN KEY (share_id) REFERENCES share_links(id) ON DELETE CASCADE,
  INDEX idx_share_comments_share_created (share_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
