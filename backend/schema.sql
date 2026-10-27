-- AQUAS telemetry schema.
--
-- Every view in backend/fastapi.py reads from waterq.measurements, so this file
-- is the minimum needed to bring up an empty database:
--
--   createdb aquas
--   psql -d aquas -f backend/schema.sql
--
-- Production runs this on TimescaleDB; plain PostgreSQL is fine for local work
-- (see the hypertable section at the bottom).

CREATE SCHEMA IF NOT EXISTS waterq;

CREATE TABLE IF NOT EXISTS waterq.measurements (
    time          timestamptz      NOT NULL,  -- reading time, UTC
    longitude     double precision,           -- decimal degrees
    latitude      double precision,           -- decimal degrees
    temperature_c double precision,           -- water temperature, °C
    turbidity_ntu double precision,           -- turbidity, NTU
    ec_us_cm      double precision,           -- electrical conductivity, µS/cm
    tdo_mg_l      double precision,           -- total dissolved oxygen, mg/L
    ph            double precision            -- pH, 0-14
);

-- Every view orders by time DESC and several filter on a time window, so this
-- index is what keeps the dashboard responsive as the table grows.
CREATE INDEX IF NOT EXISTS measurements_time_desc_idx
    ON waterq.measurements (time DESC);

-- TimescaleDB only. Converts the table into a hypertable partitioned by time.
-- Safe to skip on plain PostgreSQL; the API does not depend on it.
--
--   CREATE EXTENSION IF NOT EXISTS timescaledb;
--   SELECT create_hypertable('waterq.measurements', 'time', if_not_exists => TRUE);
