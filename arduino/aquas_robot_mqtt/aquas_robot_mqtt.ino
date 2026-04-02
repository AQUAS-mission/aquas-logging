/**
 * AQUAS Robot - MQTT Sensor System
 *
 * Hardware: Arduino Uno + SIM7000A + Environmental Sensors
 *
 * BUILD MODES:
 * - Default: Sensors only (no modem) - fits on Uno for testing
 * - Define ENABLE_MODEM: Full build with TinyGSM + MQTT (requires >32KB,
 *   use Arduino Mega/ESP32, or verify it fits after stripping features)
 */

// *** UNCOMMENT TO ENABLE MODEM + MQTT (may exceed Uno flash) ***
#define ENABLE_MODEM

#ifdef ENABLE_MODEM
  #define TINY_GSM_MODEM_SIM7000
  #define TINY_GSM_RX_BUFFER 256
  #include <SoftwareSerial.h>
  #include <TinyGsmClient.h>
  #include <PubSubClient.h>
#endif

// ==================== CONFIGURATION ====================

#define MODEM_RX 7
#define MODEM_TX 8
#define MODEM_PWRKEY 5
#define MODEM_POWER_ON 6

const char apn[] = "hologram";
const char gprsUser[] = "";
const char gprsPass[] = "";

const char mqtt_server[] = "broker.hivemq.com";
const int mqtt_port = 1883;
const char mqtt_user[] = "";
const char mqtt_pass[] = "";

const char robot_id[] = "robot_sim_001";
const char mqtt_topic[] = "aquas/robots/robot_sim_001/data";
const char mqtt_status_topic[] = "aquas/robots/robot_sim_001/status";
const char mqtt_command_topic[] = "aquas/robots/robot_sim_001/commands";

const unsigned long PUBLISH_INTERVAL = 60000;
const unsigned long RECONNECT_INTERVAL = 5000;
const unsigned long SENSOR_READ_INTERVAL = 10000;

// ==================== GLOBAL OBJECTS ====================

#ifdef ENABLE_MODEM
  SoftwareSerial SerialAT(MODEM_RX, MODEM_TX);
  TinyGsm modem(SerialAT);
  TinyGsmClient client(modem);
  PubSubClient mqtt_client(client);
#endif

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
  Serial.print(F("pH:   ")); dtostrf(currentData.ph, 1, 2, tmp); Serial.println(tmp);
  Serial.print(F("Temp: ")); dtostrf(currentData.temperature, 1, 2, tmp); Serial.print(tmp); Serial.println(F(" C"));
  Serial.print(F("DO:   ")); dtostrf(currentData.dissolved_oxygen, 1, 2, tmp); Serial.print(tmp); Serial.println(F(" mg/L"));
  Serial.print(F("EC:   ")); dtostrf(currentData.electrical_conductivity, 1, 1, tmp); Serial.print(tmp); Serial.println(F(" uS/cm"));
  Serial.print(F("Turb: ")); dtostrf(currentData.turbidity, 1, 2, tmp); Serial.print(tmp); Serial.println(F(" NTU"));
  if (currentData.gps_valid) {
    Serial.print(F("GPS:  "));
    dtostrf(currentData.latitude, 1, 6, tmp); Serial.print(tmp);
    Serial.print(F(", "));
    dtostrf(currentData.longitude, 1, 6, tmp); Serial.println(tmp);
  } else {
    Serial.println(F("GPS:  N/A"));
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

  // TODO: Replace with actual GPS reading
  currentData.latitude = 40.7128 + (random(-100, 100) / 10000.0);
  currentData.longitude = -74.0060 + (random(-100, 100) / 10000.0);
  currentData.gps_valid = true;

  Serial.println(F("Sensors read OK"));
  printSensorData();
}

// ==================== JSON HELPERS ====================

int buildSensorJson(char* buf, int bufSize) {
  char tmp[12];
  int pos = 0;

  pos += snprintf(buf + pos, bufSize - pos, "{\"robot_id\":\"%s\",", robot_id);
  pos += snprintf(buf + pos, bufSize - pos, "\"ts\":%lu,", millis());

  dtostrf(currentData.ph, 1, 2, tmp);
  pos += snprintf(buf + pos, bufSize - pos, "\"ph\":%s,", tmp);

  dtostrf(currentData.temperature, 1, 2, tmp);
  pos += snprintf(buf + pos, bufSize - pos, "\"temperature\":%s,", tmp);

  dtostrf(currentData.dissolved_oxygen, 1, 2, tmp);
  pos += snprintf(buf + pos, bufSize - pos, "\"dissolved_oxygen\":%s,", tmp);

  dtostrf(currentData.electrical_conductivity, 1, 1, tmp);
  pos += snprintf(buf + pos, bufSize - pos, "\"electrical_conductivity\":%s,", tmp);

  dtostrf(currentData.turbidity, 1, 2, tmp);
  pos += snprintf(buf + pos, bufSize - pos, "\"turbidity\":%s", tmp);

  if (currentData.gps_valid) {
    dtostrf(currentData.latitude, 1, 6, tmp);
    pos += snprintf(buf + pos, bufSize - pos, ",\"lat\":%s", tmp);
    dtostrf(currentData.longitude, 1, 6, tmp);
    pos += snprintf(buf + pos, bufSize - pos, ",\"lon\":%s", tmp);
  }

  pos += snprintf(buf + pos, bufSize - pos, "}");
  return pos;
}

// ==================== MQTT (only when modem enabled) ====================

#ifdef ENABLE_MODEM

int buildStatusJson(char* buf, int bufSize) {
  int sig = modem.getSignalQuality();
  return snprintf(buf, bufSize,
    "{\"robot_id\":\"%s\",\"modem\":%d,\"mqtt\":%d,\"sig\":%d}",
    robot_id, modemReady ? 1 : 0, mqttReady ? 1 : 0, sig);
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  if (length > 200) return;

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

void publishStatus() {
  char buffer[100];
  buildStatusJson(buffer, sizeof(buffer));
  Serial.print(F("Status: "));
  Serial.println(buffer);

  if (mqttReady && mqtt_client.connected()) {
    mqtt_client.publish(mqtt_status_topic, buffer);
    Serial.println(F("Status published"));
  }
}

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

  // Use init() instead of restart() — restart() does a full chip reset
  // which often times out on Uno's slower SoftwareSerial.
  // init() just confirms AT communication is working.
  Serial.println(F("Modem init (AT check)..."));
  if (!modem.init()) {
    Serial.println(F("Modem init FAILED - check LiPo battery on BAT pin and RX/TX wiring"));
    modemReady = false;
    return;
  }
  Serial.println(F("Modem init OK"));

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

  Serial.print(F("Connecting APN: "));
  Serial.println(apn);
  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    Serial.println(F("GPRS fail"));
    modemReady = false;
    return;
  }

  Serial.println(F("GPRS OK"));
  modemReady = true;
}

#endif // ENABLE_MODEM

// ==================== PUBLISH (works in both modes) ====================

void publishSensorData() {
  char buffer[220];
  int len = buildSensorJson(buffer, sizeof(buffer));

  Serial.print(F("JSON: "));
  Serial.println(buffer);

#ifdef ENABLE_MODEM
  if (mqttReady && mqtt_client.connected()) {
    if (mqtt_client.publish(mqtt_topic, buffer, len)) {
      Serial.println(F("MQTT publish OK"));
      return;
    }
    Serial.println(F("MQTT publish FAILED"));
  } else {
    Serial.println(F("Not connected, data not sent"));
  }
#else
  Serial.println(F("(No modem - would publish above JSON)"));
#endif
}

// ==================== SETUP ====================

void setup() {
  Serial.begin(9600);
  delay(2000);

  Serial.println(F("=== AQUAS Robot ==="));

#ifdef ENABLE_MODEM
  Serial.println(F("Mode: FULL (modem+MQTT)"));
  initModem();
  if (modemReady) {
    mqtt_client.setServer(mqtt_server, mqtt_port);
    mqtt_client.setCallback(mqttCallback);
    mqtt_client.setBufferSize(300);
    connectMQTT();
  } else {
    Serial.println(F("Modem failed, offline"));
  }
#else
  Serial.println(F("Mode: SENSORS ONLY (no modem)"));
  Serial.println(F("To enable modem, uncomment #define ENABLE_MODEM"));
#endif

  readSensors();
  Serial.println(F("Ready!\n"));
}

// ==================== MAIN LOOP ====================

void loop() {
  unsigned long currentMillis = millis();

#ifdef ENABLE_MODEM
  if (modemReady && mqttReady) {
    if (!mqtt_client.connected()) {
      Serial.println(F("MQTT disconnected"));
      mqttReady = false;
      if (currentMillis - lastReconnectAttempt > RECONNECT_INTERVAL) {
        lastReconnectAttempt = currentMillis;
        connectMQTT();
      }
    } else {
      mqtt_client.loop();
    }
  }
#endif

  if (currentMillis - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
    lastSensorReadTime = currentMillis;
    readSensors();
  }

  if (currentMillis - lastPublishTime >= PUBLISH_INTERVAL) {
    lastPublishTime = currentMillis;
    publishSensorData();
  }

  delay(100);
}
