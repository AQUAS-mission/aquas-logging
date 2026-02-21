 -- Enable compression on chunks older than 7 days                                                                                                                                                      
  ALTER TABLE waterq.measurements SET (                                                                                                                                                                  
      timescaledb.compress,
      timescaledb.compress_orderby = 'time DESC',
      timescaledb.compress_segmentby = 'robot_id'
  );

  SELECT add_compression_policy('waterq.measurements', INTERVAL '7 days');