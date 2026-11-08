#include <ESP8266WiFi.h>
#include "Funciones.h"
#include "Servidor.h"

const char* ssid = "MiCasa";
const char* password = "carlos";

void setup() {
  Serial.begin(115200);
  Serial.println("Iniciando ESP8266...");
  iniciarLed();
  Serial.print("Conectando a ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi conectado");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    iniciarServidor();
  } else {
    Serial.println("WiFi: SSID o clave vacios / empty SSID or password");
  }
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) atenderServidor();
}
