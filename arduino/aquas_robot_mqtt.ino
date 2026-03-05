/**
 * AQUAS Robot - Production MQTT Sensor System
 * 
 * Hardware:
 * - ESP32
 * - SIM7000A (Cellular connectivity)
 * - Environmental sensors (pH, Temperature, DO, EC, Turbidity)
 * - GPS module
 * - SD Card (for offline data storage)
 * 
 * Architecture:
 * Robot Sensors -> ESP32 -> SIM7000A -> MQTT Broker -> FastAPI Backend -> Dashboard
 */

// Define modem type BEFORE including TinyGSM
#define TINY_GSM_MODEM_SIM7000
#define TINY_GSM_RX_BUFFER 1024

// Uncomment for debugging
// #define TINY_GSM_DEBUG Serial

#include <TinyGsmClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <SD.h>
#include <FS.h>
#include <TimeLib.h>

// ==================== CONFIGURATION ====================

// Hardware Serial Pins
#define MODEM_RX 16
#define MODEM_TX 17
#define MODEM_PWRKEY 4
#define MODEM_POWER_ON 23

// SD Card
#define SD_CS 5

// Cellular Configuration
const char apn[] = "your_apn";  // Replace with your carrier's APN
const char gprsUser[] = "";
const char gprsPass[] = "";

// MQTT Configuration
const char mqtt_server[] = "your.mqtt.broker.com";  // Replace with your MQTT broker IP/domain
const int mqtt_port = 1883;
const char mqtt_user[] = "your_mqtt_user";  // Optional: if broker requires auth
const char mqtt_pass[] = "your_mqtt_password";

// Robot Configuration
const char robot_id[] = "robot_001";  // Unique identifier for this robot
const char mqtt_topic[] = "aquas/robots/robot_001/data";
const char mqtt_status_topic[] = "aquas/robots/robot_001/status";
const char mqtt_command_topic[] = "aquas/robots/robot_001/commands";

// Timing
const unsigned long PUBLISH_INTERVAL = 60000;  // 1 minute
const unsigned long RECONNECT_INTERVAL = 5000;  // 5 seconds
const unsigned long SENSOR_READ_INTERVAL = 10000;  // 10 seconds

// Failsafe
const int MAX_OFFLINE_RECORDS = 1000;
const char offline_file[] = "/offline_data.txt";

// ==================== GLOBAL OBJECTS ====================

HardwareSerial SerialAT(1);
TinyGsm modem(SerialAT);
TinyGsmClient client(modem);
PubSubClient mqtt(client);

// ==================== STATE VARIABLES ====================

struct SensorData {
  float ph;
  float temperature;
  float dissolved_oxygen;
  float electrical_conductivity;
  float turbidity;
  float latitude;
  float longitude;
  unsigned long timestamp;
  bool gps_valid;
};

SensorData currentData;
unsigned long lastPublishTime = 0;
unsigned long lastSensorReadTime = 0;
unsigned long lastReconnectAttempt = 0;
int offlineRecordCount = 0;
bool sdCardAvailable = false;
bool modemReady = false;
bool mqttReady = false;

// ==================== SENSOR READING ====================

void readSensors() {
  // TODO: Replace these with actual sensor readings
  // For production, implement proper sensor drivers
  
  // pH Sensor (typically 0-14 range)
  currentData.ph = readPHSensor();
  
  // Temperature Sensor (Celsius)
  currentData.temperature = readTemperatureSensor();
  
  // Dissolved Oxygen (mg/L)
  currentData.dissolved_oxygen = readDOSensor();
  
  // Electrical Conductivity (µS/cm)
  currentData.electrical_conductivity = readECSensor();
  
  // Turbidity (NTU)
  currentData.turbidity = readTurbiditySensor();
  
  // GPS
  readGPS();
  
  // Timestamp
  currentData.timestamp = now();
  
  Serial.println("Sensors read successfully");
  printSensorData();
}

float readPHSensor() {
  // TODO: Implement actual pH sensor reading
  // Example: return analogRead(PH_PIN) * conversion_factor;
  return 7.2 + (random(-10, 10) / 100.0);  // Simulated data
}

float readTemperatureSensor() {
  // TODO: Implement actual temperature sensor reading
  // Example: return dht.readTemperature();
  return 18.5 + (random(-20, 20) / 10.0);  // Simulated data
}

float readDOSensor() {
  // TODO: Implement actual dissolved oxygen sensor reading
  return 8.1 + (random(-10, 10) / 100.0);  // Simulated data
}

float readECSensor() {
  // TODO: Implement actual EC sensor reading
  return 250 + random(-50, 50);  // Simulated data
}

float readTurbiditySensor() {
  // TODO: Implement actual turbidity sensor reading
  return 3.5 + (random(-10, 10) / 10.0);  // Simulated data
}

void readGPS() {
  // TODO: Implement actual GPS reading
  // Example using TinyGPS++:
  /*
  if (modem.getGPS(&currentData.latitude, &currentData.longitude)) {
    currentData.gps_valid = true;
  } else {
    currentData.gps_valid = false;
  }
  */
  
  // Simulated GPS data for testing
  currentData.latitude = 40.7128 + (random(-100, 100) / 10000.0);
  currentData.longitude = -74.0060 + (random(-100, 100) / 10000.0);
  currentData.gps_valid = true;
}

void printSensorData() {
  Serial.println("=== Current Sensor Readings ===");
  Serial.print("pH: "); Serial.println(currentData.ph, 2);
  Serial.print("Temperature: "); Serial.print(currentData.temperature, 2); Serial.println(" °C");
  Serial.print("Dissolved Oxygen: "); Serial.print(currentData.dissolved_oxygen, 2); Serial.println(" mg/L");
  Serial.print("EC: "); Serial.print(currentData.electrical_conductivity, 1); Serial.println(" µS/cm");
  Serial.print("Turbidity: "); Serial.print(currentData.turbidity, 2); Serial.println(" NTU");
  if (currentData.gps_valid) {
    Serial.print("GPS: "); Serial.print(currentData.latitude, 6); 
    Serial.print(", "); Serial.println(currentData.longitude, 6);
  } else {
    Serial.println("GPS: Not available");
  }
  Serial.println("==============================");
}

// ==================== MQTT ====================

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("]: ");
  
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);
  
  // Handle commands from backend
  if (String(topic) == mqtt_command_topic) {
    handleCommand(message);
  }
}

void handleCommand(String command) {
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, command);
  
  if (error) {
    Serial.println("Failed to parse command");
    return;
  }
  
  const char* cmd = doc["command"];
  
  if (strcmp(cmd, "read_sensors") == 0) {
    readSensors();
    publishSensorData();
  } else if (strcmp(cmd, "sync_offline") == 0) {
    uploadOfflineData();
  } else if (strcmp(cmd, "status") == 0) {
    publishStatus();
  }
}

bool connectMQTT() {
  Serial.println("Connecting to MQTT broker...");
  
  String clientId = "aquas_robot_";
  clientId += robot_id;
  
  if (mqtt.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
    Serial.println("✓ MQTT connected");
    
    // Subscribe to command topic
    mqtt.subscribe(mqtt_command_topic);
    
    // Publish online status
    publishStatus();
    
    mqttReady = true;
    return true;
  }
  
  Serial.print("✗ MQTT connection failed, rc=");
  Serial.println(mqtt.state());
  mqttReady = false;
  return false;
}

void publishSensorData() {
  StaticJsonDocument<512> doc;
  
  doc["robot_id"] = robot_id;
  doc["timestamp"] = currentData.timestamp;
  doc["ph"] = currentData.ph;
  doc["temperature"] = currentData.temperature;
  doc["dissolved_oxygen"] = currentData.dissolved_oxygen;
  doc["electrical_conductivity"] = currentData.electrical_conductivity;
  doc["turbidity"] = currentData.turbidity;
  
  if (currentData.gps_valid) {
    doc["latitude"] = currentData.latitude;
    doc["longitude"] = currentData.longitude;
  }
  
  char buffer[512];
  size_t len = serializeJson(doc, buffer);
  
  if (mqttReady && mqtt.connected()) {
    if (mqtt.publish(mqtt_topic, buffer, len)) {
      Serial.println("✓ Data published to MQTT");
      Serial.println(buffer);
      return;
    }
  }
  
  // If MQTT publish failed, save to SD card
  Serial.println("✗ MQTT publish failed, saving to SD card");
  saveToSDCard(buffer);
}

void publishStatus() {
  StaticJsonDocument<256> doc;
  
  doc["robot_id"] = robot_id;
  doc["timestamp"] = now();
  doc["modem_ready"] = modemReady;
  doc["mqtt_ready"] = mqttReady;
  doc["sd_available"] = sdCardAvailable;
  doc["signal_quality"] = modem.getSignalQuality();
  doc["offline_records"] = offlineRecordCount;
  
  char buffer[256];
  serializeJson(doc, buffer);
  
  if (mqttReady && mqtt.connected()) {
    mqtt.publish(mqtt_status_topic, buffer);
    Serial.println("✓ Status published");
  }
}

// ==================== OFFLINE STORAGE ====================

void initSDCard() {
  Serial.print("Initializing SD card...");
  
  if (!SD.begin(SD_CS)) {
    Serial.println("✗ SD card initialization failed");
    sdCardAvailable = false;
    return;
  }
  
  Serial.println("✓ SD card initialized");
  sdCardAvailable = true;
  
  // Count existing offline records
  countOfflineRecords();
}

void saveToSDCard(const char* data) {
  if (!sdCardAvailable) {
    Serial.println("✗ SD card not available, data lost!");
    return;
  }
  
  File file = SD.open(offline_file, FILE_APPEND);
  if (!file) {
    Serial.println("✗ Failed to open offline file");
    return;
  }
  
  file.println(data);
  file.close();
  offlineRecordCount++;
  
  Serial.print("✓ Data saved offline (");
  Serial.print(offlineRecordCount);
  Serial.println(" records)");
  
  // Prevent SD card from filling up
  if (offlineRecordCount > MAX_OFFLINE_RECORDS) {
    Serial.println("⚠ Max offline records reached, purging oldest data");
    purgeOldOfflineData();
  }
}

void countOfflineRecords() {
  if (!sdCardAvailable) return;
  
  File file = SD.open(offline_file, FILE_READ);
  if (!file) {
    offlineRecordCount = 0;
    return;
  }
  
  offlineRecordCount = 0;
  while (file.available()) {
    String line = file.readStringUntil('\n');
    if (line.length() > 10) {  // Valid JSON should be longer than 10 chars
      offlineRecordCount++;
    }
  }
  file.close();
  
  Serial.print("Found ");
  Serial.print(offlineRecordCount);
  Serial.println(" offline records");
}

void uploadOfflineData() {
  if (!sdCardAvailable || offlineRecordCount == 0) {
    Serial.println("No offline data to upload");
    return;
  }
  
  if (!mqttReady || !mqtt.connected()) {
    Serial.println("Cannot upload offline data: MQTT not connected");
    return;
  }
  
  Serial.println("Uploading offline data...");
  
  File file = SD.open(offline_file, FILE_READ);
  if (!file) {
    Serial.println("✗ Failed to open offline file");
    return;
  }
  
  int uploaded = 0;
  while (file.available()) {
    String line = file.readStringUntil('\n');
    
    if (line.length() > 10) {
      if (mqtt.publish(mqtt_topic, line.c_str())) {
        uploaded++;
        delay(100);  // Small delay to avoid overwhelming broker
      } else {
        Serial.println("✗ Failed to upload record, stopping");
        break;
      }
    }
  }
  file.close();
  
  if (uploaded == offlineRecordCount) {
    // Successfully uploaded all, delete file
    SD.remove(offline_file);
    offlineRecordCount = 0;
    Serial.print("✓ Successfully uploaded ");
    Serial.print(uploaded);
    Serial.println(" offline records");
  } else {
    Serial.print("⚠ Partially uploaded ");
    Serial.print(uploaded);
    Serial.print(" of ");
    Serial.print(offlineRecordCount);
    Serial.println(" records");
  }
}

void purgeOldOfflineData() {
  // Simple purge: delete oldest 20% of records
  // In production, you might want more sophisticated logic
  if (!sdCardAvailable) return;
  
  File readFile = SD.open(offline_file, FILE_READ);
  if (!readFile) return;
  
  // Create temporary file with newer records
  File writeFile = SD.open("/temp.txt", FILE_WRITE);
  if (!writeFile) {
    readFile.close();
    return;
  }
  
  int skipCount = offlineRecordCount / 5;  // Skip oldest 20%
  int currentLine = 0;
  
  while (readFile.available()) {
    String line = readFile.readStringUntil('\n');
    if (currentLine >= skipCount) {
      writeFile.println(line);
    }
    currentLine++;
  }
  
  readFile.close();
  writeFile.close();
  
  // Replace old file with new
  SD.remove(offline_file);
  SD.rename("/temp.txt", offline_file);
  
  offlineRecordCount = currentLine - skipCount;
  Serial.print("Purged old data, ");
  Serial.print(offlineRecordCount);
  Serial.println(" records remaining");
}

// ==================== MODEM INITIALIZATION ====================

void initModem() {
  Serial.println("Initializing modem...");
  
  // Power on modem
  pinMode(MODEM_PWRKEY, OUTPUT);
  pinMode(MODEM_POWER_ON, OUTPUT);
  digitalWrite(MODEM_POWER_ON, HIGH);
  
  // Pull down PWRKEY for 1 second to turn on
  digitalWrite(MODEM_PWRKEY, HIGH);
  delay(100);
  digitalWrite(MODEM_PWRKEY, LOW);
  delay(1000);
  digitalWrite(MODEM_PWRKEY, HIGH);
  
  // Start serial communication
  SerialAT.begin(9600, SERIAL_8N1, MODEM_RX, MODEM_TX);
  delay(3000);
  
  Serial.println("Waiting for modem to respond...");
  if (!modem.restart()) {
    Serial.println("✗ Failed to restart modem");
    modemReady = false;
    return;
  }
  
  Serial.print("Modem: ");
  Serial.println(modem.getModemInfo());
  
  // Wait for network registration
  Serial.println("Waiting for network...");
  if (!modem.waitForNetwork(60000L)) {
    Serial.println("✗ Network registration failed");
    modemReady = false;
    return;
  }
  Serial.println("✓ Network registered");
  
  // Check signal quality
  int signal = modem.getSignalQuality();
  Serial.print("Signal quality: ");
  Serial.println(signal);
  
  // Connect to GPRS
  Serial.print("Connecting to APN: ");
  Serial.println(apn);
  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    Serial.println("✗ GPRS connection failed");
    modemReady = false;
    return;
  }
  
  Serial.println("✓ GPRS connected");
  modemReady = true;
}

// ==================== SETUP ====================

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n=================================");
  Serial.println("   AQUAS Robot Sensor System    ");
  Serial.println("=================================\n");
  
  // Initialize SD card first
  initSDCard();
  
  // Initialize modem
  initModem();
  
  if (!modemReady) {
    Serial.println("⚠ Running in offline mode");
  } else {
    // Configure MQTT
    mqtt.setServer(mqtt_server, mqtt_port);
    mqtt.setCallback(mqttCallback);
    mqtt.setBufferSize(512);
    
    // Connect to MQTT
    connectMQTT();
  }
  
  // Initialize sensor readings
  readSensors();
  
  Serial.println("\n✓ Setup complete, starting main loop\n");
}

// ==================== MAIN LOOP ====================

void loop() {
  unsigned long currentMillis = millis();
  
  // Maintain MQTT connection
  if (modemReady && mqttReady) {
    if (!mqtt.connected()) {
      mqttReady = false;
      if (currentMillis - lastReconnectAttempt > RECONNECT_INTERVAL) {
        lastReconnectAttempt = currentMillis;
        connectMQTT();
      }
    } else {
      mqtt.loop();
    }
  }
  
  // Read sensors periodically
  if (currentMillis - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
    lastSensorReadTime = currentMillis;
    readSensors();
  }
  
  // Publish data periodically
  if (currentMillis - lastPublishTime >= PUBLISH_INTERVAL) {
    lastPublishTime = currentMillis;
    publishSensorData();
    
    // Try to upload offline data if we have connectivity
    if (mqttReady && mqtt.connected() && offlineRecordCount > 0) {
      uploadOfflineData();
    }
  }
  
  // Small delay to prevent tight looping
  delay(100);
}
