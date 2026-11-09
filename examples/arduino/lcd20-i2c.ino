#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// UNO A4/SDA -> adapter SDA, A5/SCL -> adapter SCL; 5V and GND.
// All 16 LCD header contacts connect to the corresponding adapter pads.
LiquidCrystal_I2C lcd(0x27, 20, 4);

void setup() {
  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.print("LosProfesParaVos");
  lcd.setCursor(0, 1);
  lcd.print("LCD 20x4 I2C");
  lcd.setCursor(0, 2);
  lcd.print("Arduino UNO");
  lcd.setCursor(0, 3);
  lcd.print("HD44780");
}

void loop() {
  delay(1000);
}
