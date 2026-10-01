ALTER TABLE assets
  ADD COLUMN source_asset_id CHAR(36) NULL AFTER version,
  ADD COLUMN process_kind VARCHAR(80) NULL AFTER source_asset_id,
  ADD CONSTRAINT fk_assets_source FOREIGN KEY (source_asset_id) REFERENCES assets(id) ON DELETE SET NULL;
