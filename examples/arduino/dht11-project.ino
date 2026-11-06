#include <DHT.h>

#define DHTPIN 2
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(9600);
  dht.begin();
}

void loop() {
  delay(2000);

  float hum = dht.readHumidity();
  float temp = dht.readTemperature();

  if (isnan(hum) || isnan(temp)) {
    Serial.println("Fallo al leer del sensor DHT11");
    return;
  }

  Serial.print("Humedad: ");
  Serial.print(hum);
  Serial.print(" %  |  ");
  Serial.print("Temperatura: ");
  Serial.print(temp);
  Serial.println(" °C");
}
