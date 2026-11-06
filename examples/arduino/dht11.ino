#include <DHT.h>
#define DHTPIN 2
#define DHTTYPE DHT11

// Joy-IT KY-015 module, grille/front view with header down, left to right:
// OUT (S/DATA) -> D2, VCC (+) -> 5V, GND (-) -> GND.
// The module includes a pull-up: only these three wires are needed.
DHT dht(DHTPIN, DHTTYPE);
void setup() {
  Serial.begin(9600);
  dht.begin();
}
void loop() {
  delay(2000);
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("DHT11: read failed");
  } else {
    Serial.print("Humidity: ");
    Serial.print(humidity, 0);
    Serial.print(" % | Temperature: ");
    Serial.print(temperature, 0);
    Serial.println(" C");
  }
}
