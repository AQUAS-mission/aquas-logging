CREATE TABLE IF NOT EXISTS waterq.robots (
    robot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NULL REFERENCES waterq.users(id),
    name TEXT NOT NULL,
    serial_number TEXT UNIQUE NOT NULL,
    last_seen_at TIMESTAMPTZ NULL,
    last_longitude DOUBLE PRECISION NULL,
    last_latitude DOUBLE PRECISION NULL,
    is_active BOOLEAN default TRUE,
    created_at TIMESTAMPTZ default now()
);

CREATE INDEX IF NOT EXISTS robot_to_user_id_idx ON waterq.robots USING btree (user_id DESC);
CREATE INDEX IF NOT EXISTS robot_serial_number ON waterq.robots USING btree (serial_number DESC);
ALTER TABLE waterq.robots OWNER TO postgres;

-- add later MQTT Columns mqtt_username, mqtt_password until ingestion pipeline is built