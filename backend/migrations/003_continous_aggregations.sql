CREATE MATERIALIZED VIEW waterq.measurements_hourly 
WITH (timescaledb.continuous) AS 
SELECT
    time_bucket('1 hour', time) AS bucket, 
    robot_id,
    AVG(temperature_c) AS avg_temperature_c,
    AVG(turbidity_ntu) AS avg_turbidity_ntu,
    AVG(ec_us_cm)      AS avg_ec_us_cm, 
    AVG(ph)            AS avg_ph,
    AVG(tdo_mg_l)      AS avg_tdo_mg_l,
    MIN(temperature_c) AS min_temperature_c,
    MAX(temperature_c) AS max_temperature_c,
    COUNT(*)           AS sample_count
FROM waterq.measurements
GROUP BY bucket, robot_id;

SELECT add_continuous_aggregate_policy('waterq.measurements_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

