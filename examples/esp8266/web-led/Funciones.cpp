#include <Arduino.h>
#include "Funciones.h"

void iniciarLed() {
  pinMode(D5, OUTPUT);
  digitalWrite(D5, LOW);
}
void encenderLed() {
  digitalWrite(D5, HIGH);
}
void apagarLed() {
  digitalWrite(D5, LOW);
}
