// ==================== AQUAS Robot Configuration Template ====================
//
// Copy this file and rename it to: config.h
// Then update all values with your actual deployment settings
//
// IMPORTANT: Add config.h to .gitignore to avoid committing credentials!
//

#ifndef CONFIG_H
#define CONFIG_H

// ==================== HARDWARE PINS ====================

// SIM7000A Serial Communication
#define MODEM_RX 16
#define MODEM_TX 17
#define MODEM_PWRKEY 4
#define MODEM_POWER_ON 23

// SD Card
#define SD_CS 5

// Sensor Pins (Update based on your wiring)
#define PH_SENSOR_PIN 34
#define TEMP_SENSOR_PIN 35
#define DO_SENSOR_PIN 36
#define EC_SENSOR_PIN 39
#define TURBIDITY_SENSOR_PIN 32

// Optional: Status LEDs
#define LED_CONNECTED 25    // Green - Connected and publishing
#define LED_OFFLINE 26      // Yellow - Offline mode
#define LED_ERROR 27        // Red - Error state

// ==================== CELLULAR CONFIGURATION ====================

// Your cellular carrier's APN (Access Point Name)
// Common values:
//   AT&T: "broadband"
//   T-Mobile: "fast.t-mobile.com"
//   Verizon: "vzwinternet"
const char apn[] = "your_apn";

// Usually empty for most carriers
const char gprsUser[] = "";
const char gprsPass[] = "";

// ==================== MQTT BROKER CONFIGURATION ====================

// Your MQTT broker address (IP or domain)
// Examples:
//   "mqtt.example.com"
//   "192.168.1.100"
//   "your-backend-server.com"
const char mqtt_server[] = "your.mqtt.broker.com";

// MQTT Port
//   1883 = Standard MQTT (no encryption)
//   8883 = MQTT with TLS/SSL (recommended for production)
const int mqtt_port = 1883;

// MQTT Authentication (leave empty if broker doesn't require auth)
const char mqtt_user[] = "your_mqtt_username";
const char mqtt_pass[] = "your_mqtt_password";

// ==================== ROBOT IDENTIFICATION ====================

// Unique identifier for this robot
// IMPORTANT: Each robot must have a different ID!
// Format: "robot_NNN" where NNN is unique
const char robot_id[] = "robot_001";

// Optional: Location identifier
const char location[] = "site_A";

// ==================== MQTT TOPICS ====================

// Topic structure: aquas/robots/{robot_id}/{type}
// 
// Data topic - sensor readings published here
const char mqtt_topic[] = "aquas/robots/robot_001/data";

// Status topic - health/connectivity status published here  
const char mqtt_status_topic[] = "aquas/robots/robot_001/status";

// Command topic - robot subscribes to receive commands
const char mqtt_command_topic[] = "aquas/robots/robot_001/commands";

// ==================== TIMING CONFIGURATION ====================

// How often to publish sensor data (milliseconds)
// 60000 = 1 minute
// 300000 = 5 minutes
// 900000 = 15 minutes
const unsigned long PUBLISH_INTERVAL = 60000;

// How often to read sensors (milliseconds)
// Should be <= PUBLISH_INTERVAL
const unsigned long SENSOR_READ_INTERVAL = 10000;

// Delay between MQTT reconnection attempts (milliseconds)
const unsigned long RECONNECT_INTERVAL = 5000;

// ==================== FAILSAFE CONFIGURATION ====================

// Maximum number of records to store offline before purging oldest
// Each record is ~200-300 bytes
// 1000 records ≈ 250KB
const int MAX_OFFLINE_RECORDS = 1000;

// Filename for offline data storage on SD card
const char offline_file[] = "/offline_data.txt";

// ==================== SENSOR CALIBRATION ====================

// pH Sensor Calibration
#define PH_OFFSET 0.0
#define PH_SLOPE 3.5

// Temperature Sensor Calibration
#define TEMP_OFFSET 0.0

// Dissolved Oxygen Calibration (mg/L)
#define DO_CALIBRATION_VOLTAGE 1.5
#define DO_SATURATION 8.5

// EC Sensor Calibration (µS/cm)
#define EC_REFERENCE_VOLTAGE 3.3
#define EC_CALIBRATION_FACTOR 1.0

// Turbidity Sensor Calibration (NTU)
#define TURBIDITY_OFFSET 0.0
#define TURBIDITY_SLOPE 1.0

// ==================== FEATURE FLAGS ====================

// Enable/disable features
#define ENABLE_GPS true
#define ENABLE_LED_STATUS true
#define ENABLE_WATCHDOG false
#define ENABLE_DEEP_SLEEP false

// Debug settings
#define DEBUG_MODE true
#define SERIAL_BAUD_RATE 115200

// ==================== ADVANCED SETTINGS ====================

// MQTT Quality of Service (QoS)
// 0 = At most once (fire and forget)
// 1 = At least once (acknowledged delivery)
// 2 = Exactly once (assured delivery)
#define MQTT_QOS 1

// MQTT Keep Alive interval (seconds)
#define MQTT_KEEPALIVE 60

// Network registration timeout (milliseconds)
#define NETWORK_TIMEOUT 60000

// Maximum time to wait for MQTT connection (milliseconds)
#define MQTT_CONNECT_TIMEOUT 10000

// Minimum signal quality to consider connection good (0-31)
// <10 = Marginal, 10-14 = OK, 15-19 = Good, 20+ = Excellent
#define MIN_SIGNAL_QUALITY 10

// ==================== POWER MANAGEMENT ====================

// Deep sleep duration (seconds) - only used if ENABLE_DEEP_SLEEP = true
#define SLEEP_DURATION 300  // 5 minutes

// Battery voltage monitoring pin (optional)
#define BATTERY_PIN 33
#define BATTERY_LOW_VOLTAGE 3.3

#endif // CONFIG_H
