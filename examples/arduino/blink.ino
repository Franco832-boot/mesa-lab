// Arduino UNO: connect D13 -> 330 ohm resistor -> red LED -> GND.
const int ledPin = LED_BUILTIN;
void setup() {
  pinMode(ledPin, OUTPUT);
}
void loop() {
  digitalWrite(ledPin, HIGH);
  delay(1000);
  digitalWrite(ledPin, LOW);
  delay(1000);
}
