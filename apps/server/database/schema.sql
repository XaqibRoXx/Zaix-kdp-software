CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  name VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL DEFAULT 'Desktop',
  token_hash CHAR(64) NOT NULL UNIQUE,
  last_used_at DATETIME NULL,
  expires_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_api_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_api_tokens_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pairing_codes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  code_hash CHAR(64) NOT NULL UNIQUE,
  label VARCHAR(120) NOT NULL DEFAULT 'Windows Desktop',
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pairing_codes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_pairing_codes_user (user_id),
  INDEX idx_pairing_codes_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
  id CHAR(36) PRIMARY KEY,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  mode ENUM('kdp','graphic-design') NOT NULL DEFAULT 'kdp',
  current_revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  CONSTRAINT fk_projects_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_projects_owner_updated (owner_user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS project_snapshots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  revision_number BIGINT UNSIGNED NOT NULL,
  label VARCHAR(255) NULL,
  snapshot_json LONGTEXT NOT NULL,
  snapshot_hash CHAR(64) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_snapshots_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_snapshots_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_project_revision (project_id, revision_number),
  INDEX idx_snapshots_project_created (project_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  client_event_id VARCHAR(120) NOT NULL,
  base_revision BIGINT UNSIGNED NOT NULL,
  resulting_revision BIGINT UNSIGNED NOT NULL,
  payload_json LONGTEXT NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sync_events_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_sync_events_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_project_client_event (project_id, client_event_id),
  INDEX idx_sync_project_revision (project_id, resulting_revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assets (
  id CHAR(36) PRIMARY KEY,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  project_id CHAR(36) NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sha256 CHAR(64) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  CONSTRAINT fk_assets_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_assets_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  INDEX idx_assets_owner (owner_user_id),
  INDEX idx_assets_project (project_id),
  INDEX idx_assets_sha (sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_variants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_id CHAR(36) NOT NULL,
  variant_type ENUM('proxy','thumbnail') NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  width_px INT UNSIGNED NULL,
  height_px INT UNSIGNED NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  storage_key VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_asset_variants_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  UNIQUE KEY uq_asset_variant (asset_id, variant_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


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
