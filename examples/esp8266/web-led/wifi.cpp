#include <ESP8266WiFi.h>
#include "wifi.h"

// Fictional credentials for the network built into Los Profes Para Vos. No real radio is used.
const char* ssid = "MiCasa";
const char* password = "carlos";
const unsigned long WIFI_TIMEOUT_MS = 5000UL;

bool wifiConectado() {
  return WiFi.status() == WL_CONNECTED;
}

void conectarWiFi() {
  Serial.print("Conectando a ");
  Serial.println(ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  const unsigned long inicio = millis();
  while (!wifiConectado() && WiFi.status() != WL_CONNECT_FAILED && millis() - inicio < WIFI_TIMEOUT_MS) {
    delay(100);
  }
  if (wifiConectado()) {
    Serial.println("WiFi conectado");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    if (WiFi.status() != WL_CONNECT_FAILED) WiFi.disconnect();
    Serial.println("WiFi: error o tiempo agotado / connection failed or timed out");
  }
}
