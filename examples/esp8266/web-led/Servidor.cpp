#include <Arduino.h>
#include <ESP8266WebServer.h>
#include <LittleFS.h>
#include "Funciones.h"
#include "Servidor.h"

ESP8266WebServer servidor(80);

void responderEstado() {
  if (digitalRead(D5) == HIGH) {
    servidor.send(200, "text/plain", "ON");
  } else {
    servidor.send(200, "text/plain", "OFF");
  }
}
void rutaEncender() {
  encenderLed();
  responderEstado();
}
void rutaApagar() {
  apagarLed();
  responderEstado();
}
void paginaPrincipal() {
  servidor.streamFile(LittleFS.open("/index.html", "r"), "text/html");
}
void iniciarServidor() {
  LittleFS.begin();
  servidor.on("/", paginaPrincipal);
  servidor.serveStatic("/style.css", LittleFS, "/style.css");
  servidor.serveStatic("/app.js", LittleFS, "/app.js");
  servidor.on("/led/on", HTTP_GET, rutaEncender);
  servidor.on("/led/off", HTTP_GET, rutaApagar);
  servidor.on("/led/state", HTTP_GET, responderEstado);
  servidor.begin();
  Serial.println("Servidor HTTP iniciado");
}
void atenderServidor() {
  servidor.handleClient();
}
