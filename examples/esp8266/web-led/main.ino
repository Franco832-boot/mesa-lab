#include "funciones.h"
#include "wifi.h"
#include "servidor.h"

void setup() {
  Serial.begin(115200);
  Serial.println("Iniciando ESP8266...");
  iniciarLed();
  conectarWiFi();
  if (wifiConectado()) iniciarServidor();
}

void loop() {
  if (wifiConectado()) atenderServidor();
}
