// UNO: D8 -> EN1,2; D9 -> IN1; D10 -> IN2.
// UNO 5V -> VCC1. Battery +9V -> VCC2. All GNDs share the return.
// OUT1/OUT2 -> motor. Never connect the battery to the UNO 5V pin.
// 3 seconds forward, 1 second brake, 3 seconds reverse, then repeat.
const int enablePin = 8;
const int input1 = 9;
const int input2 = 10;
unsigned long previousMillis = 0;
int phase = 0;

void setup() {
  pinMode(enablePin, OUTPUT);
  pinMode(input1, OUTPUT);
  pinMode(input2, OUTPUT);
  digitalWrite(input1, HIGH);
  digitalWrite(input2, LOW);
  digitalWrite(enablePin, HIGH);
}

void loop() {
  unsigned long now = millis();
  unsigned long elapsed = now - previousMillis;
  if (phase == 0 && elapsed >= 3000UL) {
    digitalWrite(input1, LOW);
    digitalWrite(input2, LOW);
    phase = 1;
    previousMillis = now;
  } else if (phase == 1 && elapsed >= 1000UL) {
    digitalWrite(input1, LOW);
    digitalWrite(input2, HIGH);
    phase = 2;
    previousMillis = now;
  } else if (phase == 2 && elapsed >= 3000UL) {
    digitalWrite(input1, HIGH);
    digitalWrite(input2, LOW);
    phase = 0;
    previousMillis = now;
  }
}
