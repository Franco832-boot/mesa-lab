#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// UNO A4/SDA -> adapter SDA, A5/SCL -> adapter SCL; 5V and GND.
// All 16 LCD header contacts connect to the corresponding adapter pads.
LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.print("Los Profes");
  lcd.setCursor(0, 1);
  lcd.print("Para Vos");
}

void loop() {
  delay(1000);
}
