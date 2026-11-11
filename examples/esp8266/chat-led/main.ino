#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <UniversalTelegramBot.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "SIMULATED_WIFI";
const char* WIFI_PASSWORD = "SIMULATED_PASSWORD";
const char* BOT_TOKEN = "SIMULATED_TOKEN";
const String CHAT_ID = "123456";

const int LED_PIN = 14; // D5 on NodeMCU
const unsigned long INTERVALO = 500;
unsigned long ultimaConsulta = 0;

WiFiClientSecure client;
UniversalTelegramBot bot(BOT_TOKEN, client);

void procesarMensajes(int cantidad) {
  for (int i = 0; i < cantidad; i++) {
    String chatId = bot.messages[i].chat_id;
    String texto = bot.messages[i].text;

    if (chatId != CHAT_ID) {
      bot.sendMessage(chatId, "Usuario no autorizado.", "");
      continue;
    }

    if (texto == "/start") {
      bot.sendMessage(chatId, "Comandos disponibles:\n"
                              "/encender — Enciende el LED.\n"
                              "/apagar — Apaga el LED.\n"
                              "/estado — Consulta el estado del LED.", "");
    } else if (texto == "/encender") {
      digitalWrite(LED_PIN, HIGH);
      bot.sendMessage(chatId, "LED encendido.", "");
    } else if (texto == "/apagar") {
      digitalWrite(LED_PIN, LOW);
      bot.sendMessage(chatId, "LED apagado.", "");
    } else if (texto == "/estado") {
      String estado = digitalRead(LED_PIN) == HIGH ? "encendido" : "apagado";
      bot.sendMessage(chatId, "El LED está " + estado + ".", "");
    } else {
      bot.sendMessage(chatId, "Comando desconocido. Escribí /start.", "");
    }
  }
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  client.setInsecure();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(100);
  }
}

void loop() {
  if (millis() - ultimaConsulta >= INTERVALO) {
    int cantidad = bot.getUpdates(bot.last_message_received + 1);
    while (cantidad > 0) {
      procesarMensajes(cantidad);
      cantidad = bot.getUpdates(bot.last_message_received + 1);
    }
    ultimaConsulta = millis();
  }
  yield();
}
