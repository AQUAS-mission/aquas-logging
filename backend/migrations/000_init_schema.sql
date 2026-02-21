
CREATE SCHEMA IF NOT EXISTS waterq;

ALTER SCHEMA waterq OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE IF NOT EXISTS waterq.measurements (
    "time" timestamp with time zone NOT NULL,
    longitude double precision NOT NULL,
    latitude double precision NOT NULL,
    temperature_c double precision,
    turbidity_ntu double precision,
    ec_us_cm double precision,
    tdo_mg_l double precision,
    ph double precision,
    CONSTRAINT chk_ec CHECK (((ec_us_cm IS NULL) OR (ec_us_cm >= (0)::double precision))),
    CONSTRAINT chk_lat CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))),
    CONSTRAINT chk_lon CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))),
    CONSTRAINT chk_tdo CHECK (((tdo_mg_l IS NULL) OR (tdo_mg_l >= (0)::double precision))),
    CONSTRAINT chk_temp CHECK (((temperature_c IS NULL) OR ((temperature_c >= ('-5'::integer)::double precision) AND (temperature_c <= (80)::double precision)))),
    CONSTRAINT chk_turb CHECK (((turbidity_ntu IS NULL) OR (turbidity_ntu >= (0)::double precision))),
    CONSTRAINT measurements_ph_check CHECK (((ph >= (0)::double precision) AND (ph <= (14)::double precision)))
);

ALTER TABLE waterq.measurements OWNER TO postgres;

DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'measurements_pk'
            AND conrelid = 'waterq.measurements'::regclass
    ) THEN 
        ALTER TABLE ONLY waterq.measurements
            ADD CONSTRAINT measurements_pk PRIMARY KEY (longitude, latitude, "time");
    END IF; 
END $$;

CREATE INDEX IF NOT EXISTS measurements_longitude_latitude_time_idx ON waterq.measurements USING btree (longitude, latitude, "time" DESC);

CREATE INDEX IF NOT EXISTS measurements_time_idx ON waterq.measurements USING btree ("time" DESC);

-- Convert to hypertable
SELECT create_hypertable('waterq.measurements', 'time', 
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);