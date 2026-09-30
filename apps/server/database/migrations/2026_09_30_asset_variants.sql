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
