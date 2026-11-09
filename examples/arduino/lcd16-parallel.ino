#include <LiquidCrystal.h>

// RS=D12, E=D11, D4=D5, D5=D4, D6=D3, D7=D2; RW=GND.
// VO=10k potentiometer wiper; A=5V through 220 ohms; K=GND.
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

void setup() {
  lcd.begin(16, 2);
  lcd.print("LosProfesParaVos");
  lcd.setCursor(0, 1);
  lcd.print("LCD 16x2");
}

void loop() {
  delay(1000);
}
