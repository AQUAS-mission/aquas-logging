/**
 * AQUAS Robot - Production MQTT Sensor System
 *
 * Hardware:
 * - Arduino Uno
 * - SIM7000A (Cellular connectivity via SoftwareSerial)
 * - Environmental sensors (pH, Temperature, DO, EC, Turbidity)
 * - GPS module
 *
 * Architecture:
 * Robot Sensors -> Arduino Uno -> SIM7000A -> MQTT Broker -> FastAPI Backend -> Dashboard
 *
 * NOTE: Arduino Uno has only 2KB SRAM and 32KB flash.
 * The SIM7000A modem is driven via SoftwareSerial on pins 7 (RX) and 8 (TX).
 *
 * Flash-saving measures:
 * - Removed SD library (~5-8KB savings)
 * - Removed ArduinoJson - manual JSON string building (~3-5KB savings)
 * - Removed TimeLib - using millis() (~1-2KB savings)
 * - Reduced TinyGSM RX buffer from 1024 to 256
 * - Used F() macro for all Serial strings (saves SRAM)
 * - Minimized debug output
 */

// Define modem type BEFORE including TinyGSM
#define TINY_GSM_MODEM_SIM7000
#define TINY_GSM_RX_BUFFER 256

#include <SoftwareSerial.h>
#include <TinyGsmClient.h>
#include <PubSubClient.h>

// ==================== CONFIGURATION ====================

#define MODEM_RX 7
#define MODEM_TX 8
#define MODEM_PWRKEY 5
#define MODEM_POWER_ON 6

// Cellular Configuration
const char apn[] PROGMEM = "hologram";
const char gprsUser[] = "";
const char gprsPass[] = "";

// MQTT Configuration
const char mqtt_server[] = "broker.hivemq.com";
const int mqtt_port = 1883;
const char mqtt_user[] = "";
const char mqtt_pass[] = "";

// Robot Configuration
const char robot_id[] = "robot_sim_001";
const char mqtt_topic[] = "aquas/robots/robot_sim_001/data";
const char mqtt_status_topic[] = "aquas/robots/robot_sim_001/status";
const char mqtt_command_topic[] = "aquas/robots/robot_sim_001/commands";

// Timing
const unsigned long PUBLISH_INTERVAL = 60000;
const unsigned long RECONNECT_INTERVAL = 5000;
const unsigned long SENSOR_READ_INTERVAL = 10000;

// ==================== GLOBAL OBJECTS ====================

SoftwareSerial SerialAT(MODEM_RX, MODEM_TX);
TinyGsm modem(SerialAT);
TinyGsmClient client(modem);
PubSubClient mqtt_client(client);

// ==================== STATE VARIABLES ====================

struct SensorData {
  float ph;
  float temperature;
  float dissolved_oxygen;
  float electrical_conductivity;
  float turbidity;
  float latitude;
  float longitude;
  bool gps_valid;
};

SensorData currentData;
unsigned long lastPublishTime = 0;
unsigned long lastSensorReadTime = 0;
unsigned long lastReconnectAttempt = 0;
bool modemReady = false;
bool mqttReady = false;

// ==================== SENSOR READING ====================

void printSensorData() {
  char tmp[12];
  Serial.println(F("--- Sensor Readings ---"));
  Serial.print(F("pH: ")); dtostrf(currentData.ph, 1, 2, tmp); Serial.println(tmp);
  Serial.print(F("Temp: ")); dtostrf(currentData.temperature, 1, 2, tmp); Serial.print(tmp); Serial.println(F(" C"));
  Serial.print(F("DO: ")); dtostrf(currentData.dissolved_oxygen, 1, 2, tmp); Serial.print(tmp); Serial.println(F(" mg/L"));
  Serial.print(F("EC: ")); dtostrf(currentData.electrical_conductivity, 1, 1, tmp); Serial.print(tmp); Serial.println(F(" uS/cm"));
  Serial.print(F("Turb: ")); dtostrf(currentData.turbidity, 1, 2, tmp); Serial.print(tmp); Serial.println(F(" NTU"));
  if (currentData.gps_valid) {
    Serial.print(F("GPS: ")); dtostrf(currentData.latitude, 1, 6, tmp); Serial.print(tmp);
    Serial.print(F(", ")); dtostrf(currentData.longitude, 1, 6, tmp); Serial.println(tmp);
  } else {
    Serial.println(F("GPS: N/A"));
  }
  Serial.println(F("-----------------------"));
}

void readSensors() {
  // TODO: Replace with actual sensor readings
  currentData.ph = 7.2 + (random(-10, 10) / 100.0);
  currentData.temperature = 18.5 + (random(-20, 20) / 10.0);
  currentData.dissolved_oxygen = 8.1 + (random(-10, 10) / 100.0);
  currentData.electrical_conductivity = 250 + random(-50, 50);
  currentData.turbidity = 3.5 + (random(-10, 10) / 10.0);

  // TODO: Replace with actual GPS reading via modem.getGPS()
  currentData.latitude = 40.7128 + (random(-100, 100) / 10000.0);
  currentData.longitude = -74.0060 + (random(-100, 100) / 10000.0);
  currentData.gps_valid = true;

  Serial.println(F("Sensors read OK"));
  printSensorData();
}

// ==================== JSON HELPERS ====================

// Build JSON manually to avoid ArduinoJson library (~3-5KB flash savings)
// dtostrf is used because Arduino Uno's sprintf doesn't support %f

int buildSensorJson(char* buf, int bufSize) {
  char tmp[12];
  int pos = 0;

  pos += snprintf(buf + pos, bufSize - pos, "{\"robot_id\":\"%s\",", robot_id);

  pos += snprintf(buf + pos, bufSize - pos, "\"ts\":%lu,", millis());

  dtostrf(currentData.ph, 1, 2, tmp);
  pos += snprintf(buf + pos, bufSize - pos, "\"ph\":%s,", tmp);

  dtostrf(currentData.temperature, 1, 2, tmp);
  pos += snprintf(buf + pos, bufSize - pos, "\"temp\":%s,", tmp);

  dtostrf(currentData.dissolved_oxygen, 1, 2, tmp);
  pos += snprintf(buf + pos, bufSize - pos, "\"do\":%s,", tmp);

  dtostrf(currentData.electrical_conductivity, 1, 1, tmp);
  pos += snprintf(buf + pos, bufSize - pos, "\"ec\":%s,", tmp);

  dtostrf(currentData.turbidity, 1, 2, tmp);
  pos += snprintf(buf + pos, bufSize - pos, "\"turb\":%s", tmp);

  if (currentData.gps_valid) {
    dtostrf(currentData.latitude, 1, 6, tmp);
    pos += snprintf(buf + pos, bufSize - pos, ",\"lat\":%s", tmp);
    dtostrf(currentData.longitude, 1, 6, tmp);
    pos += snprintf(buf + pos, bufSize - pos, ",\"lon\":%s", tmp);
  }

  pos += snprintf(buf + pos, bufSize - pos, "}");
  return pos;
}

int buildStatusJson(char* buf, int bufSize) {
  int sig = modem.getSignalQuality();
  return snprintf(buf, bufSize,
    "{\"robot_id\":\"%s\",\"modem\":%d,\"mqtt\":%d,\"sig\":%d}",
    robot_id, modemReady ? 1 : 0, mqttReady ? 1 : 0, sig);
}

// ==================== MQTT ====================

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // Simple command parsing without ArduinoJson
  // Look for "read_sensors" or "status" in payload
  if (length > 200) return;  // ignore oversized messages

  // Check for command strings directly in payload
  bool isSensorCmd = false;
  bool isStatusCmd = false;

  for (unsigned int i = 0; i + 11 < length; i++) {
    if (memcmp(payload + i, "read_sensors", 12) == 0) { isSensorCmd = true; break; }
  }
  if (!isSensorCmd) {
    for (unsigned int i = 0; i + 5 < length; i++) {
      if (memcmp(payload + i, "status", 6) == 0) { isStatusCmd = true; break; }
    }
  }

  if (isSensorCmd) {
    readSensors();
    publishSensorData();
  } else if (isStatusCmd) {
    publishStatus();
  }
}

bool connectMQTT() {
  Serial.print(F("MQTT connecting to "));
  Serial.print(mqtt_server);
  Serial.print(F(":"));
  Serial.println(mqtt_port);

  if (mqtt_client.connect(robot_id, mqtt_user, mqtt_pass)) {
    Serial.println(F("MQTT connected OK"));
    mqtt_client.subscribe(mqtt_command_topic);
    Serial.print(F("Subscribed: "));
    Serial.println(mqtt_command_topic);
    publishStatus();
    mqttReady = true;
    return true;
  }

  Serial.print(F("MQTT FAILED rc="));
  Serial.println(mqtt_client.state());
  mqttReady = false;
  return false;
}

void publishSensorData() {
  char buffer[220];
  int len = buildSensorJson(buffer, sizeof(buffer));

  Serial.print(F("Publishing to: "));
  Serial.println(mqtt_topic);
  Serial.print(F("Payload: "));
  Serial.println(buffer);

  if (mqttReady && mqtt_client.connected()) {
    if (mqtt_client.publish(mqtt_topic, buffer, len)) {
      Serial.println(F("Publish OK"));
      return;
    }
    Serial.println(F("Publish FAILED"));
  } else {
    Serial.println(F("Not connected, skipping publish"));
  }
  // Without SD card, data is lost. Consider adding EEPROM buffering
  // or upgrading to a board with more flash to re-enable SD storage.
}

void publishStatus() {
  char buffer[100];
  buildStatusJson(buffer, sizeof(buffer));

  Serial.print(F("Status: "));
  Serial.println(buffer);

  if (mqttReady && mqtt_client.connected()) {
    mqtt_client.publish(mqtt_status_topic, buffer);
    Serial.println(F("Status published"));
  } else {
    Serial.println(F("Status not sent (offline)"));
  }
}

// ==================== MODEM INITIALIZATION ====================

void initModem() {
  Serial.println(F("Modem init..."));

  pinMode(MODEM_PWRKEY, OUTPUT);
  pinMode(MODEM_POWER_ON, OUTPUT);
  digitalWrite(MODEM_POWER_ON, HIGH);

  digitalWrite(MODEM_PWRKEY, HIGH);
  delay(100);
  digitalWrite(MODEM_PWRKEY, LOW);
  delay(1000);
  digitalWrite(MODEM_PWRKEY, HIGH);

  SerialAT.begin(9600);
  delay(3000);

  Serial.println(F("Modem restarting..."));
  if (!modem.restart()) {
    Serial.println(F("Modem restart FAILED"));
    modemReady = false;
    return;
  }
  Serial.println(F("Modem restart OK"));

  Serial.println(F("Waiting for network..."));
  if (!modem.waitForNetwork(60000L)) {
    Serial.println(F("Network fail"));
    modemReady = false;
    return;
  }
  Serial.println(F("Network OK"));

  int sig = modem.getSignalQuality();
  Serial.print(F("Signal: "));
  Serial.println(sig);

  char apnBuf[16];
  strncpy_P(apnBuf, apn, sizeof(apnBuf));
  Serial.print(F("Connecting APN: "));
  Serial.println(apnBuf);
  if (!modem.gprsConnect(apnBuf, gprsUser, gprsPass)) {
    Serial.println(F("GPRS fail"));
    modemReady = false;
    return;
  }

  Serial.println(F("GPRS OK"));
  modemReady = true;
}

// ==================== SETUP ====================

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println(F("\nAQUAS Robot Starting"));

  initModem();

  if (!modemReady) {
    Serial.println(F("Offline mode"));
  } else {
    mqtt_client.setServer(mqtt_server, mqtt_port);
    mqtt_client.setCallback(mqttCallback);
    mqtt_client.setBufferSize(300);
    connectMQTT();
  }

  readSensors();
  Serial.println(F("Ready"));
}

// ==================== MAIN LOOP ====================

void loop() {
  unsigned long currentMillis = millis();

  // Maintain MQTT connection
  if (modemReady && mqttReady) {
    if (!mqtt_client.connected()) {
      Serial.println(F("MQTT disconnected"));
      mqttReady = false;
      if (currentMillis - lastReconnectAttempt > RECONNECT_INTERVAL) {
        lastReconnectAttempt = currentMillis;
        Serial.println(F("Reconnecting MQTT..."));
        connectMQTT();
      }
    } else {
      mqtt_client.loop();
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
  }

  delay(100);
}
