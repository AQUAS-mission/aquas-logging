// Minimal test: verify Arduino Uno + Serial Monitor work
void setup() {
  Serial.begin(9600);
  delay(1000);
  Serial.println("Hello from Arduino Uno!");
  Serial.println("If you see this, serial works.");

  // Blink built-in LED so you know the board is running
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.println("LED ON");
  delay(1000);

  digitalWrite(LED_BUILTIN, LOW);
  Serial.println("LED OFF");
  delay(1000);
}
