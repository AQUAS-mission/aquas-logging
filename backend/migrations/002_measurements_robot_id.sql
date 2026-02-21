ALTER TABLE waterq.measurements ADD COLUMN robot_id UUID;

CREATE INDEX IF NOT EXISTS robot_id_on_measurements_idx ON waterq.measurements USING btree (robot_id, time DESC);
-- this is for per-robot timeseries queries :3

