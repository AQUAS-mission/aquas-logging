"""
AQUAS Robot MQTT Simulator

This script simulates the Arduino robot publishing sensor data to MQTT.
Use this to test your backend integration without physical hardware.

Requirements:
    pip install paho-mqtt

Usage:
    python mqtt_simulator.py
"""

import json
import time
import random
from datetime import datetime
import paho.mqtt.client as mqtt

# ==================== CONFIGURATION ====================

MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
MQTT_USER = None  # Set if your broker requires auth
MQTT_PASS = None

ROBOT_ID = "robot_sim_001"
LOCATION = "test_site"

# Topics
TOPIC_DATA = f"aquas/robots/{ROBOT_ID}/data"
TOPIC_STATUS = f"aquas/robots/{ROBOT_ID}/status"
TOPIC_COMMANDS = f"aquas/robots/{ROBOT_ID}/commands"

# Timing
PUBLISH_INTERVAL = 5  # seconds (faster for testing)

# ==================== SENSOR SIMULATION ====================

class SensorSimulator:
    """Simulates realistic water quality sensor readings"""
    
    def __init__(self):
        # Base values with realistic ranges
        self.ph_base = 7.2
        self.temp_base = 18.5
        self.do_base = 8.1
        self.ec_base = 250
        self.turbidity_base = 3.5
        
        # GPS coordinates (New York Harbor example)
        self.lat_base = 40.7128
        self.lon_base = -74.0060
        
    def read_ph(self):
        """pH sensor (0-14 range, typically 6-9 for natural water)"""
        return round(self.ph_base + random.uniform(-0.5, 0.5), 2)
    
    def read_temperature(self):
        """Temperature sensor in Celsius"""
        return round(self.temp_base + random.uniform(-2.0, 2.0), 2)
    
    def read_dissolved_oxygen(self):
        """Dissolved oxygen in mg/L (typically 5-14 for healthy water)"""
        return round(self.do_base + random.uniform(-1.0, 1.0), 2)
    
    def read_electrical_conductivity(self):
        """EC in µS/cm (0-2000 typical for freshwater)"""
        return round(self.ec_base + random.uniform(-50, 50), 1)
    
    def read_turbidity(self):
        """Turbidity in NTU (0-40 typical, <1 is very clear)"""
        return round(max(0, self.turbidity_base + random.uniform(-1.0, 1.0)), 2)
    
    def read_gps(self):
        """Simulate GPS with small drift"""
        lat = self.lat_base + random.uniform(-0.001, 0.001)
        lon = self.lon_base + random.uniform(-0.001, 0.001)
        return round(lat, 6), round(lon, 6)
    
    def get_all_readings(self):
        """Get complete sensor payload"""
        lat, lon = self.read_gps()
        
        return {
            "robot_id": ROBOT_ID,
            "timestamp": int(time.time()),
            "location": LOCATION,
            "ph": self.read_ph(),
            "temperature": self.read_temperature(),
            "dissolved_oxygen": self.read_dissolved_oxygen(),
            "electrical_conductivity": self.read_electrical_conductivity(),
            "turbidity": self.read_turbidity(),
            "latitude": lat,
            "longitude": lon
        }

# ==================== MQTT CLIENT ====================

class RobotMQTTClient:
    """MQTT client simulating the Arduino robot"""
    
    def __init__(self):
        self.client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2, client_id=f"aquas_{ROBOT_ID}")
        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect
        self.client.on_message = self.on_message
        
        if MQTT_USER and MQTT_PASS:
            self.client.username_pw_set(MQTT_USER, MQTT_PASS)
        
        self.connected = False
        self.sensors = SensorSimulator()
        
    def on_connect(self, client, userdata, flags, reason_code, properties):
        """Callback when connected to broker"""
        if reason_code == 0:
            print(f"✓ Connected to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}")
            self.connected = True
            
            # Subscribe to command topic
            client.subscribe(TOPIC_COMMANDS)
            print(f"✓ Subscribed to {TOPIC_COMMANDS}")
            
            # Publish initial status
            self.publish_status()
        else:
            print(f"✗ Connection failed with code {reason_code}")
            self.connected = False
    
    def on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties):
        """Callback when disconnected from broker"""
        self.connected = False
        if reason_code != 0:
            print(f"⚠ Unexpected disconnection (code {reason_code})")
    
    def on_message(self, client, userdata, msg):
        """Callback when message received"""
        try:
            command = json.loads(msg.payload.decode())
            print(f"\n📨 Received command: {command}")
            self.handle_command(command)
        except Exception as e:
            print(f"✗ Error processing command: {e}")
    
    def handle_command(self, command):
        """Handle commands from backend"""
        cmd = command.get("command")
        
        if cmd == "read_sensors":
            print("   → Reading sensors immediately")
            self.publish_sensor_data()
        elif cmd == "status":
            print("   → Publishing status")
            self.publish_status()
        elif cmd == "sync_offline":
            print("   → No offline data (simulator)")
        else:
            print(f"   → Unknown command: {cmd}")
    
    def connect(self):
        """Connect to MQTT broker"""
        try:
            print(f"Connecting to MQTT broker {MQTT_BROKER}:{MQTT_PORT}...")
            self.client.connect(MQTT_BROKER, MQTT_PORT, 60)
            self.client.loop_start()
        except Exception as e:
            print(f"✗ Failed to connect: {e}")
            return False
        return True
    
    def publish_sensor_data(self):
        """Publish sensor readings"""
        if not self.connected:
            print("⚠ Not connected to broker")
            return
        
        data = self.sensors.get_all_readings()
        payload = json.dumps(data)
        
        result = self.client.publish(TOPIC_DATA, payload, qos=1)
        
        if result.rc == mqtt.MQTT_ERR_SUCCESS:
            print(f"\n📤 Published sensor data:")
            print(f"   pH: {data['ph']}")
            print(f"   Temperature: {data['temperature']}°C")
            print(f"   DO: {data['dissolved_oxygen']} mg/L")
            print(f"   EC: {data['electrical_conductivity']} µS/cm")
            print(f"   Turbidity: {data['turbidity']} NTU")
            print(f"   GPS: {data['latitude']}, {data['longitude']}")
        else:
            print(f"✗ Publish failed: {result.rc}")
    
    def publish_status(self):
        """Publish robot status"""
        if not self.connected:
            return
        
        status = {
            "robot_id": ROBOT_ID,
            "timestamp": int(time.time()),
            "status": "online",
            "simulator": True,
            "mqtt_ready": self.connected,
            "signal_quality": random.randint(15, 25)
        }
        
        payload = json.dumps(status)
        self.client.publish(TOPIC_STATUS, payload, qos=1)
        print(f"✓ Published status")
    
    def disconnect(self):
        """Disconnect from broker"""
        self.client.loop_stop()
        self.client.disconnect()

# ==================== MAIN ====================

def main():
    print("=" * 50)
    print("   AQUAS Robot MQTT Simulator")
    print("=" * 50)
    print()
    print(f"Robot ID: {ROBOT_ID}")
    print(f"Data Topic: {TOPIC_DATA}")
    print(f"Publish Interval: {PUBLISH_INTERVAL}s")
    print()
    
    robot = RobotMQTTClient()
    
    if not robot.connect():
        print("Failed to connect. Check your MQTT broker settings.")
        return
    
    # Wait for connection
    time.sleep(2)
    
    if not robot.connected:
        print("Connection timeout.")
        return
    
    print()
    print("=" * 50)
    print("Simulator running. Press Ctrl+C to stop.")
    print("=" * 50)
    print()
    
    try:
        while True:
            robot.publish_sensor_data()
            time.sleep(PUBLISH_INTERVAL)
            
    except KeyboardInterrupt:
        print("\n\n⏹ Stopping simulator...")
        robot.disconnect()
        print("✓ Disconnected")

if __name__ == "__main__":
    main()
