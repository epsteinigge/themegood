-- Additive migration: existing gallery rows remain available as single-photo albums.
ALTER TABLE gallery_items
  ADD COLUMN IF NOT EXISTS photos JSONB,
  ADD COLUMN IF NOT EXISTS event_date DATE,
  ADD COLUMN IF NOT EXISTS location VARCHAR(200) NOT NULL DEFAULT '';
