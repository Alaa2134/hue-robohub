(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,94070,72301,e=>{"use strict";let t,i,s,n,r,o,l,a,h,d,p,u,c,b,g,m,f,v,w,D,y,S,k,T,L,E={tp:10,tn:20,a:50,b:60,c:70,d:80,e:90,f:120,g:130,h:140,i:150,j:160,bn:190,bp:200};function O(e){let t=e.match(/^(tp|tn|bp|bn|[a-j])(\d+)$/);return[10+10*Number(t[2]),-260+E[t[1]]]}let M={};["SCL","SDA","AREF","GND1","D13","D12","D11","D10","D9","D8"].forEach((e,t)=>M[e]=[100+10*t,10]),["D7","D6","D5","D4","D3","D2","D1","D0"].forEach((e,t)=>M[e]=[200+10*t,10]),["IOREF","RESET","3V3","5V","GND2","GND3","VIN"].forEach((e,t)=>M[e]=[100+10*t,200]),["A0","A1","A2","A3","A4","A5"].forEach((e,t)=>M[e]=[180+10*t,200]);let U=0,A=(e,t,i={},s=0)=>({id:`${e}-${++U}`,type:e,x:t[0],y:t[1],rot:s,props:i}),N=()=>({id:"uno",type:"arduino-uno",x:0,y:0,rot:0,props:{}}),P=()=>({id:"bb",type:"breadboard-half",x:0,y:-260,rot:0,props:{}}),R=(e,t,i,s=[])=>({id:`w${++U}`,a:{part:e[0],pin:e[1]},b:{part:t[0],pin:t[1]},pts:s,color:i}),G=(e,t,i,s=-30)=>{let[n]=M[e],[r]=O(t);return R(["uno",e],["bb",t],i,n===r?[]:[[n,s],[r,s]])},W=(e,t,i,s,n)=>{let[r,o]=M[e],[,l]=O(t);return R(["uno",e],["bb",t],i,[[r,o+s],[n,o+s],[n,l]])},C=(e,t,i,s,n=350)=>{let[r,o]=M[e],[,l]=O(t);return R(["uno",e],["bb",t],i,[[r,o+s],[n,o+s],[n,l]])},x=(e,t,i)=>R(["bb",e],["bb",t],i);function H(e,t,i,s,n,r=220){return{parts:[A("resistor",O(`h${e}`),{r:r}),A("led",O(`f${e+4}`),{color:i})],wires:[G(t,`j${e}`,s,n),x(`i${e+5}`,`bn${e+5}`,"#2b2b2b")]}}let B=(e,t,i)=>({v:1,parts:e,wires:t,files:[{name:"sketch.ino",text:i.trim()+"\n"}],main:"sketch.ino"}),I={blink:`
// Blink: the LED on pin 13 turns on for half a second, then off for half a second.
void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}`,button:`
// Button LED: the LED lights while the button is held down.
// The button pulls pin 2 to GND; the internal pull-up keeps it HIGH otherwise.
const int BUTTON = 2;
const int LED = 13;

void setup() {
  pinMode(BUTTON, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  bool pressed = digitalRead(BUTTON) == LOW;
  digitalWrite(LED, pressed ? HIGH : LOW);
  static bool last = false;
  if (pressed != last) {
    Serial.println(pressed ? "pressed" : "released");
    last = pressed;
  }
}`,traffic:`
// Traffic light: red → green → yellow → red.
const int RED = 13, YELLOW = 12, GREEN = 11;

void show(int r, int y, int g, int ms) {
  digitalWrite(RED, r);
  digitalWrite(YELLOW, y);
  digitalWrite(GREEN, g);
  delay(ms);
}

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(YELLOW, OUTPUT);
  pinMode(GREEN, OUTPUT);
}

void loop() {
  show(HIGH, LOW, LOW, 3000);
  show(LOW, LOW, HIGH, 3000);
  show(LOW, HIGH, LOW, 1000);
}`,pot:`
// Potentiometer dimmer: turn the knob, the LED's brightness follows.
void setup() {
  pinMode(9, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(A0);          // 0..1023
  int level = map(raw, 0, 1023, 0, 255);
  analogWrite(9, level);              // PWM on pin 9
  Serial.print("A0 = ");
  Serial.print(raw);
  Serial.print("  PWM = ");
  Serial.println(level);
  delay(200);
}`,fade:`
// PWM fade: the LED breathes in and out with analogWrite().
int level = 0;
int step = 5;

void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  analogWrite(9, level);
  level += step;
  if (level <= 0 || level >= 255) step = -step;
  delay(20);
}`,serial:`
// Serial Hello: prints a greeting, then echoes back whatever you send.
void setup() {
  Serial.begin(9600);
  Serial.println("Hello from BuildX Lab!");
  Serial.println("Type something and press Send.");
}

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\\n');
    Serial.print("You said: ");
    Serial.println(line);
  }
}`,servo:`
// Servo sweep: 0\xb0 → 180\xb0 and back.
#include <Servo.h>

Servo arm;

void setup() {
  arm.attach(9);
}

void loop() {
  for (int a = 0; a <= 180; a += 2) {
    arm.write(a);
    delay(15);
  }
  for (int a = 180; a >= 0; a -= 2) {
    arm.write(a);
    delay(15);
  }
}`,sonar:`
// Ultrasonic ruler: HC-SR04 distance in centimetres on the serial monitor.
const int TRIG = 9, ECHO = 10;

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long us = pulseIn(ECHO, HIGH, 30000);
  Serial.print("Distance: ");
  Serial.print(us / 58);
  Serial.println(" cm");
  delay(250);
}`,night:`
// Night light: the LED turns on when the light sensor says it's dark.
// The LDR and the 10k resistor make a divider into A0: darker = lower reading.
void setup() {
  pinMode(9, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int light = analogRead(A0);
  digitalWrite(9, light < 400 ? HIGH : LOW);
  Serial.println(light);
  delay(200);
}`,melody:`
// Melody: plays a short tune on a passive buzzer with tone().
const int BUZZER = 8;
int notes[] = {262, 294, 330, 349, 392, 440, 494, 523};

void setup() {}

void loop() {
  for (int i = 0; i < 8; i++) {
    tone(BUZZER, notes[i]);
    delay(250);
  }
  noTone(BUZZER);
  delay(1000);
}`,motor:`
// Transistor motor driver: pin 3 switches an NPN that powers a DC motor from a 9V battery.
void setup() {
  pinMode(3, OUTPUT);
}

void loop() {
  for (int s = 0; s <= 255; s += 5) {
    analogWrite(3, s);
    delay(30);
  }
  delay(1000);
  analogWrite(3, 0);
  delay(1000);
}`,oled:`
// OLED: text, a seconds counter and a progress bar on a 128x64 SSD1306 over I2C (SDA = A4, SCL = A5).
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
}

void loop() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(4, 4);
  display.print("BuildX");
  display.setTextSize(1);
  display.setCursor(4, 28);
  display.print("Seconds: ");
  display.print(millis() / 1000);
  int w = (millis() / 20) % 121;
  display.drawRect(4, 44, 120, 12, SSD1306_WHITE);
  display.fillRect(4, 44, w, 12, SSD1306_WHITE);
  display.display();
}`,counter:`
// 7-segment counter: counts 0 to 9 on a common-cathode digit, one segment per pin (a = 2 … g = 8).
const int SEG[7] = {2, 3, 4, 5, 6, 7, 8};
// Which segments (a b c d e f g) are on for each digit.
const byte DIGITS[10] = {
  0b1111110, 0b0110000, 0b1101101, 0b1111001, 0b0110011,
  0b1011011, 0b1011111, 0b1110000, 0b1111111, 0b1111011,
};

void show(int d) {
  for (int i = 0; i < 7; i++) {
    digitalWrite(SEG[i], (DIGITS[d] >> (6 - i)) & 1);
  }
}

void setup() {
  for (int i = 0; i < 7; i++) pinMode(SEG[i], OUTPUT);
}

void loop() {
  for (int d = 0; d < 10; d++) {
    show(d);
    delay(700);
  }
}`},$=(U=0,t=(e,t)=>({en:e,ar:t}),i=[],s=H(13,"D13","red","#e5484d",-30),i.push({slug:"blink",title:t("Blink","ليد بيرمش"),description:t("The classic first circuit: an LED on pin 13 through a 220 Ω resistor.","أول دايرة لأي حد: ليد على بن 13 مع مقاومة 220 أوم."),tags:["led","digital"],level:1,doc:B([N(),P(),...s.parts],[G("GND1","bn12","#2b2b2b"),R(["uno","D13"],["bb","j13"],"#e5484d"),...s.wires.slice(1)],I.blink)}),n=H(2,"D13","green","#30a46c",-30),r=A("pushbutton",O("e20")),i.push({slug:"button-led",title:t("Button LED","زرار وليد"),description:t("Read a push button with the internal pull-up and light an LED while it's pressed.","اقرا زرار بالـ pull-up الداخلي ونوّر ليد طول ما هو مضغوط."),tags:["button","input","led"],level:1,doc:B([N(),P(),...n.parts,r],[G("GND1","bn12","#2b2b2b"),...n.wires,x("j20","bn20","#2b2b2b"),G("D2","j22","#f5d90a",-40)],I.button)}),o=H(2,"D13","red","#e5484d",-26),l=H(9,"D12","yellow","#f5d90a",-36),a=H(16,"D11","green","#30a46c",-46),i.push({slug:"traffic-light",title:t("Traffic light","إشارة مرور"),description:t("Three LEDs on pins 13, 12 and 11 cycle like a real traffic light.","تلات ليدات على بن 13 و12 و11 بيشتغلوا زي إشارة المرور."),tags:["led","timing"],level:1,doc:B([N(),P(),...o.parts,...l.parts,...a.parts],[G("GND1","bn12","#2b2b2b"),...o.wires,...l.wires,...a.wires],I.traffic)}),h=H(2,"D9","blue","#3e63dd",-30,330),d=A("potentiometer",O("e24"),{r:1e4,pos:.5}),i.push({slug:"potentiometer-dimmer",title:t("Potentiometer dimmer","تحكم في الإضاءة ببوتنشوميتر"),description:t("analogRead() a knob on A0 and set an LED's brightness with PWM on pin 9.","اقرا البوتنشوميتر على A0 وغيّر إضاءة ليد بالـ PWM على بن 9."),tags:["analog","pwm","potentiometer"],level:2,doc:B([N(),P(),...h.parts,d],[G("GND1","bn12","#2b2b2b"),...h.wires,x("a24","tn24","#2b2b2b"),x("a26","tp26","#e5484d"),W("5V","tp1","#e5484d",30,-20),W("GND2","tn1","#2b2b2b",40,-30),C("A0","b25","#f76b15",30)],I.pot)}),p=H(13,"D9","green","#30a46c",-30),i.push({slug:"pwm-fade",title:t("PWM fade","ليد بيتنفّس (PWM)"),description:t("analogWrite() changes the duty cycle; the simulator dims the LED by the real average current.","analogWrite() بيغيّر نسبة التشغيل؛ والمحاكي بيوطّي الإضاءة على حسب التيار الحقيقي."),tags:["pwm","led"],level:1,doc:B([N(),P(),...p.parts],[G("GND1","bn12","#2b2b2b"),...p.wires],I.fade)}),i.push({slug:"serial-hello",title:t("Serial hello","أهلًا بالسيريال"),description:t("Print to the serial monitor and echo back what you type.","اطبع على السيريال مونيتور ورجّع اللي بتكتبه."),tags:["serial"],level:1,doc:B([N()],[],I.serial)}),u=A("servo",[330,120]),i.push({slug:"servo-sweep",title:t("Servo sweep","سيرفو بيلف"),description:t("The Servo library drives an SG90 on pin 9; the angle comes from the measured pulse width.","مكتبة Servo بتحرك SG90 على بن 9؛ والزاوية من عرض النبضة المقاس."),tags:["servo","library","motor"],level:2,doc:B([N(),u],[R(["uno","GND2"],[u.id,"GND"],"#2b2b2b",[[140,225],[330,225]]),R(["uno","5V"],[u.id,"V+"],"#e5484d",[[130,235],[340,235]]),R(["uno","D9"],[u.id,"SIG"],"#f76b15",[[180,-15],[400,-15],[400,215],[350,215]])],I.servo)}),c=A("hc-sr04",[330,120],{cm:42}),i.push({slug:"ultrasonic-ruler",title:t("Ultrasonic ruler","مسطرة ألتراسونيك"),description:t("Measure distance with an HC-SR04 and pulseIn(); change the distance while it runs.","قيس المسافة بـ HC-SR04 و pulseIn()؛ وغيّر المسافة وهي شغالة."),tags:["sensor","distance","timing"],level:2,doc:B([N(),c],[R(["uno","5V"],[c.id,"VCC"],"#e5484d",[[130,235],[330,235]]),R(["uno","D9"],[c.id,"TRIG"],"#3e63dd",[[180,-15],[410,-15],[410,215],[340,215]]),R(["uno","D10"],[c.id,"ECHO"],"#30a46c",[[170,-25],[420,-25],[420,205],[350,205]]),R(["uno","GND2"],[c.id,"GND"],"#2b2b2b",[[140,245],[360,245]])],I.sonar)}),b=H(2,"D9","white","#ffffff",-30),g=A("ldr",O("e23"),{lux:300}),m=A("resistor",O("d24"),{r:1e4}),i.push({slug:"night-light",title:t("Night light","نور الليل"),description:t("A light sensor in a voltage divider: when it gets dark, the LED turns on.","حساس ضوء في مقسّم جهد: لما الدنيا تضلم الليد بينور."),tags:["sensor","analog","led"],level:2,doc:B([N(),P(),...b.parts,g,m],[G("GND1","bn12","#2b2b2b"),...b.wires,x("a23","tp23","#e5484d"),x("a28","tn28","#2b2b2b"),W("5V","tp1","#e5484d",30,-20),W("GND2","tn1","#2b2b2b",40,-30),C("A0","b24","#f76b15",30)],I.night)}),f=A("buzzer",O("f20"),{active:!1}),i.push({slug:"buzzer-melody",title:t("Buzzer melody","لحن بالبازر"),description:t("tone() on a passive buzzer: the simulator measures the frequency your code produces and plays it.","tone() على بازر باسيف: المحاكي بيقيس التردد اللي الكود بيطلعه وبيشغّله."),tags:["sound","tone"],level:1,doc:B([N(),P(),f],[G("GND1","bn12","#2b2b2b"),G("D8","j20","#8e4ec6",-30),x("j22","bn22","#2b2b2b")],I.melody)}),v=A("npn",O("f10"),{beta:150}),w=A("resistor",O("h7"),{r:1e3}),D=A("dc-motor",[420,-150],{rated:9}),y=A("battery-9v",[420,0],{},90),i.push({slug:"transistor-motor",title:t("Transistor motor driver","تشغيل موتور بترانزستور"),description:t("A pin can't power a motor: it switches an NPN that does, from a 9 V battery. PWM sets the speed.","البن مايقدرش يشغّل موتور: بيشغّل ترانزستور NPN هو اللي بيشغّله من بطارية 9 فولت. والـ PWM بيحدد السرعة."),tags:["transistor","motor","pwm"],level:3,doc:B([N(),P(),v,w,D,y],[G("GND1","bn12","#2b2b2b"),G("D3","j7","#f76b15",-30),x("j10","bn10","#2b2b2b"),R(["bb","j12"],[D.id,"-"],"#3e63dd",[[130,-85],[440,-85]]),R([y.id,"+"],[D.id,"+"],"#e5484d"),R([y.id,"-"],["bb","bn30"],"#2b2b2b",[[340,20],[340,-70]])],I.motor)}),S=A("seg7",O("c20"),{common:"cathode",color:"red"}),T=[(k=e=>A("resistor",O(e),{r:330}))("a16"),k("b17"),k("b23"),k("a24"),k("i16"),k("j17"),k("i23")],i.push({slug:"seven-segment-counter",title:t("7-segment counter","عداد 7 سيجمنت"),description:t("Count 0 to 9 on a 7-segment digit: seven pins, each segment through its own 330 Ω resistor.","عدّ من 0 لـ 9 على شاشة 7 سيجمنت: سبع بنات، وكل سيجمنت بمقاومة 330 أوم لوحده."),tags:["display","digital","arrays"],level:2,doc:B([N(),P(),S,...T],[G("GND1","bn12","#2b2b2b"),x("h22","bn22","#2b2b2b"),...[["D2","e27","#e5484d",-26],["D3","e28","#f76b15",-30],["D4","f27","#f5d90a",-34],["D5","f17","#30a46c",-38],["D6","f16","#3e63dd",-42],["D7","e17","#8e4ec6",-46],["D8","e16","#e93d82",-50]].map(([e,t,i,s])=>G(e,t,i,s))],I.counter)}),L=A("oled-ssd1306",[380,30]),i.push({slug:"oled-hello",title:t("OLED display","شاشة OLED"),description:t("Text, a counter and a progress bar on a 128×64 SSD1306 over I2C, drawn by the real Adafruit library.","نص وعدّاد وشريط تقدّم على شاشة SSD1306 ‏128×64 عن طريق I2C، بترسمهم مكتبة Adafruit الحقيقية."),tags:["display","i2c","library"],level:2,doc:B([N(),L],[R([L.id,"GND"],["uno","GND1"],"#2b2b2b",[[380,-10],[130,-10]]),R([L.id,"SCL"],["uno","SCL"],"#f5d90a",[[400,-20],[100,-20]]),R([L.id,"SDA"],["uno","SDA"],"#3e63dd",[[410,-30],[110,-30]]),R([L.id,"VCC"],["uno","5V"],"#e5484d",[[390,-40],[310,-40],[310,230],[130,230]])],I.oled)}),i),z=e=>$.find(t=>t.slug===e);e.s(["CODE",0,I,"CODE_EXAMPLES",0,[{key:"blink",title:{en:"Blink",ar:"ليد بيرمش"}},{key:"button",title:{en:"Button LED",ar:"زرار وليد"}},{key:"traffic",title:{en:"Traffic light",ar:"إشارة مرور"}},{key:"pot",title:{en:"Potentiometer",ar:"بوتنشوميتر"}},{key:"fade",title:{en:"PWM fade",ar:"PWM"}},{key:"serial",title:{en:"Serial hello",ar:"السيريال"}},{key:"servo",title:{en:"Servo",ar:"سيرفو"}},{key:"sonar",title:{en:"Ultrasonic",ar:"ألتراسونيك"}},{key:"melody",title:{en:"Melody",ar:"لحن"}},{key:"oled",title:{en:"OLED display",ar:"شاشة OLED"}},{key:"counter",title:{en:"7-segment counter",ar:"عداد 7 سيجمنت"}}],"EXAMPLES",0,$,"exampleBySlug",0,z],72301);var V=e.i(81011);let j=(e,t)=>({en:e,ar:t}),_=e=>Math.round(10*e)/10,X=e=>`${Math.round(100*e)}%`,Y=(e,t)=>({label:t,ok:e}),F=[{slug:"blink-2hz",level:1,title:j("Faster blink","ليد بيرمش أسرع"),goal:j("Make the LED blink twice a second: 250 ms on, 250 ms off.","خلّي الليد يرمش مرتين في الثانية: 250 مللي ثانية منوّر و250 مطفي."),hints:[j("pinMode(13, OUTPUT) in setup().","pinMode(13, OUTPUT) جوه setup()."),j("digitalWrite then delay(250), twice.","digitalWrite وبعدها delay(250)، مرتين.")],base:"blink",starter:`
// Faster blink: the LED on pin 13 should blink twice a second (250 ms on, 250 ms off).
void setup() {
  // Set pin 13 as an output.
}

void loop() {
  // Turn it on, wait, turn it off, wait.
}`,check(e){let t=e.ids("led")[0];if(!t)return[Y(!1,j("There's an LED in the circuit","فيه ليد في الدايرة"))];let i=function(e,t,i=.3){let s=e.map(e=>(e.parts[t]?.i??0)>.005),n=Math.round(i/.01),r=[];for(let e=Math.max(1,n);e<s.length;e++)s[e]&&!s[e-1]&&r.push(.01*e);let o=(s.length-n)*.01,l=s.slice(n).filter(Boolean).length/Math.max(1,s.length-n),a=r.length>=2?(r.length-1)/(r.at(-1)-r[0]):0;return{any:s.some(Boolean),freq:a,duty:l,span:o}}(e.run(3.3,.01),t);return[{label:j("The LED lights up","الليد بينوّر"),ok:i.any},{label:j("Blinks 2 times a second","بيرمش مرتين في الثانية"),ok:.2>=Math.abs(i.freq-2),got:`${_(i.freq)} Hz`},{label:j("On half the time","منوّر نص الوقت"),ok:i.duty>.4&&i.duty<.6,got:X(i.duty)}]}},{slug:"button-hold",level:1,title:j("Hold to light","دوس ونوّر"),goal:j("The LED is on only while the button is held down.","الليد ينوّر بس طول ما الزرار مضغوط."),hints:[j("The button pulls pin 2 to GND: use INPUT_PULLUP, pressed reads LOW.","الزرار بيوصّل بن 2 بالأرضي: استخدم INPUT_PULLUP، والضغط بيقرا LOW.")],base:"button-led",starter:`
// Hold to light: the LED on pin 13 is on only while the button on pin 2 is pressed.
const int BUTTON = 2;
const int LED = 13;

void setup() {
  // Button with the internal pull-up, LED as an output.
}

void loop() {
  // Read the button and set the LED.
}`,check(e){let t=e.ids("led")[0],i=e.ids("pushbutton")[0];if(!t||!i)return[Y(!1,j("There's a button and an LED","فيه زرار وليد"))];let s=()=>(e.run(.3).at(-1)?.parts[t]?.i??0)>.005,n=s();e.sim.setLive(i,"pressed",!0);let r=s();e.sim.setLive(i,"pressed",!1);let o=s();return[{label:j("Off before pressing","مطفي قبل الضغط"),ok:!n},{label:j("On while pressed","منوّر وهو مضغوط"),ok:r},{label:j("Off again after letting go","يطفي تاني لما تسيبه"),ok:!o}]}},{slug:"traffic-cycle",level:2,title:j("Traffic light","إشارة مرور"),goal:j("Red 2 s → green 2 s → yellow 1 s, over and over. Never two lights at once.","أحمر ثانيتين ← أخضر ثانيتين ← أصفر ثانية، وتعيد. عمر ما نورين يولّعوا مع بعض."),hints:[j("A helper show(r, y, g, ms) keeps loop() short.","دالة show(r, y, g, ms) بتخلّي loop() قصيرة.")],base:"traffic-light",starter:`
// Traffic light: red 2 s, then green 2 s, then yellow 1 s, repeating.
const int RED = 13, YELLOW = 12, GREEN = 11;

void setup() {
  // All three pins are outputs.
}

void loop() {
  // One light at a time.
}`,check(e){let t,i,s=t=>e.ids("led",e=>e.props.color===t)[0],[n,r,o]=[s("red"),s("yellow"),s("green")];if(!n||!r||!o)return[Y(!1,j("Red, yellow and green LEDs","ليد أحمر وأصفر وأخضر"))];let l=e.run(10.2,.05).map(e=>[n,o,r].map(t=>(e.parts[t]?.i??0)>.005)),a=l.slice(1).some(e=>e.filter(Boolean).length>1),h=[];for(let e of l){let t=e.indexOf(!0);t>=0&&1===e.filter(Boolean).length&&h.at(-1)!==t&&h.push(t)}let d=h.length>=3&&h.every((e,t)=>0===t||e===(h[t-1]+1)%3),p=(t=[],i=-1,l.forEach((e,s)=>{let n=e[0]&&1===e.filter(Boolean).length;n&&i<0&&(i=s),!n&&i>=0&&(i>1&&t.push((s-i)*.05),i=-1)}),t),u=p.length?p[0]:0;return[{label:j("Never two lights at once","عمر ما نورين مع بعض"),ok:!a},{label:j("All three light up","التلاتة بينوّروا"),ok:3===new Set(h).size},{label:j("Order: red → green → yellow","الترتيب: أحمر ← أخضر ← أصفر"),ok:d},{label:j("Red stays about 2 s","الأحمر بيفضل حوالي ثانيتين"),ok:.2>=Math.abs(u-2),got:`${_(u)} s`}]}},{slug:"dimmer-knob",level:2,title:j("Knob dimmer","تحكم في الإضاءة بالبوتنشوميتر"),goal:j("Turn the knob and the LED's brightness follows: knob at zero = LED off.","لف البوتنشوميتر وإضاءة الليد تمشي معاه: عند الصفر الليد مطفي."),hints:[j("analogRead(A0) gives 0–1023, analogWrite(9, …) takes 0–255.","analogRead(A0) بيدي 0–1023، وanalogWrite(9, …) بياخد 0–255.")],base:"potentiometer-dimmer",starter:`
// Knob dimmer: the LED on pin 9 gets brighter as the knob on A0 turns up.
void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  // Read A0, scale it, write it to pin 9.
}`,check(e){let t=e.ids("led")[0],i=e.ids("potentiometer")[0];if(!t||!i)return[Y(!1,j("A potentiometer and an LED","بوتنشوميتر وليد"))];let s=s=>(e.sim.setLive(i,"pos",s),e.run(.5),(e.run(.2).at(-1)?.parts[t]?.i??0)*1e3),n=s(0),r=s(.25),o=s(.5),l=s(.9),a=l>0?o/l:0;return[{label:j("Off with the knob at zero","مطفي والبوتنشوميتر على الصفر"),ok:n<.3,got:`${_(n)} mA`},{label:j("Brighter as the knob turns up","بيزيد كل ما تلف"),ok:r>.3&&o>1.3*r&&l>1.3*o,got:`${_(r)} → ${_(o)} → ${_(l)} mA`},{label:j("Halfway is about half as bright","في النص نص الإضاءة تقريبًا"),ok:a>.35&&a<.75,got:X(a)}]}},{slug:"serial-echo",level:1,title:j("Talk over serial","اتكلم على السيريال"),goal:j('Print "Hello BuildX" once at the start, then answer every line you receive with "Got: " and the line.','اطبع "Hello BuildX" مرة في الأول، وبعدها رد على كل سطر يوصلك بـ "Got: " والسطر.'),hints:[j("Serial.begin(9600) first; Serial.readStringUntil('\\n') reads a line.","Serial.begin(9600) الأول؛ Serial.readStringUntil('\\n') بيقرا سطر.")],base:"serial-hello",starter:`
// Talk over serial: greet once, then answer each line with "Got: <line>".
void setup() {
  // Start serial at 9600 and greet.
}

void loop() {
  // When a line arrives, answer it.
}`,check(e){e.run(.4);let t=e.serial().includes("Hello BuildX");e.sim.serialWrite("robot\n"),e.run(1.2);let i=/Got: robot/.test(e.serial());return[{label:j('Says "Hello BuildX"','بيقول "Hello BuildX"'),ok:t},{label:j('Answers "robot" with "Got: robot"','بيرد على "robot" بـ "Got: robot"'),ok:i}]}},{slug:"night-light",level:2,title:j("Night light","نور الليل"),goal:j("The LED turns on when it's dark and off when it's bright.","الليد ينوّر لما الدنيا تضلّم ويطفي لما تنوّر."),hints:[j("Darker = lower analogRead(A0). Pick a threshold around 400.","كل ما تضلّم analogRead(A0) بيقل. اختار حد حوالي 400.")],base:"night-light",starter:`
// Night light: the LED on pin 9 turns on in the dark (light sensor on A0).
void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  // Read the light level and switch the LED.
}`,check(e){let t=e.ids("led")[0],i=e.ids("ldr")[0];if(!t||!i)return[Y(!1,j("A light sensor and an LED","حساس ضوء وليد"))];let s=s=>(e.sim.setLive(i,"lux",s),(e.run(.6).at(-1)?.parts[t]?.i??0)>.005),n=s(500),r=s(1),o=s(500);return[{label:j("Off in bright light","مطفي في النور"),ok:!n&&!o},{label:j("On in the dark","منوّر في الضلمة"),ok:r}]}},{slug:"servo-sweep",level:2,title:j("Servo sweep","سيرفو بيلف"),goal:j("Sweep the servo from 0° to 180° and back, smoothly.","لف السيرفو من 0° لـ 180° وارجع، بهدوء."),hints:[j("#include <Servo.h>, attach(9), then write(angle) in a for loop with a short delay.","#include <Servo.h>، وattach(9)، وبعدها write(angle) في for loop مع delay صغير.")],base:"servo-sweep",starter:`
// Servo sweep: 0\xb0 → 180\xb0 and back on pin 9.
#include <Servo.h>

Servo arm;

void setup() {
  // Attach the servo.
}

void loop() {
  // Sweep up, then down.
}`,check(e){let t=e.ids("servo")[0];if(!t)return[Y(!1,j("There's a servo","فيه سيرفو"))];let i=e.run(4,.05).map(e=>e.parts[t]?.angle??-1).filter(e=>e>=0),s=i.length?Math.min(...i):0,n=i.length?Math.max(...i):0,r=0;for(let e=2;e<i.length;e++)(i[e]-i[e-1])*(i[e-1]-i[e-2])<0&&r++;return[{label:j("Covers 0° to 180°","بيغطي من 0° لـ 180°"),ok:s<=10&&n>=170,got:`${Math.round(s)}\xb0–${Math.round(n)}\xb0`},{label:j("Goes back and forth","بيروح ويرجع"),ok:r>=1}]}},{slug:"buzzer-a4",level:2,title:j("Tuning note","نغمة الضبط"),goal:j("Beep the note A (440 Hz) for half a second, then half a second of silence, repeating.","شغّل نغمة لا (440 هرتز) نص ثانية، وسكوت نص ثانية، وتعيد."),hints:[j("tone(8, 440) starts it, noTone(8) stops it.","tone(8, 440) بتشغّلها، وnoTone(8) بتوقفها.")],base:"buzzer-melody",starter:`
// Tuning note: 440 Hz for 0.5 s, silence for 0.5 s, on the buzzer on pin 8.
const int BUZZER = 8;

void setup() {}

void loop() {
  // Beep, then rest.
}`,check(e){let t=e.ids("buzzer")[0];if(!t)return[Y(!1,j("There's a buzzer","فيه بازر"))];let i=e.run(3,.05).map(e=>e.parts[t]?.freq??0),s=i.filter(e=>e>0),n=s.length?s.reduce((e,t)=>e+t,0)/s.length:0,r=s.length/Math.max(1,i.length);return[{label:j("Plays 440 Hz","بيشغّل 440 هرتز"),ok:15>=Math.abs(n-440),got:`${Math.round(n)} Hz`},{label:j("Sound half the time, silence half","صوت نص الوقت وسكوت نصه"),ok:r>.35&&r<.65,got:X(r)}]}},{slug:"seg7-seven",level:3,title:j("Show a 7","اعرض رقم 7"),goal:j("Show the digit 7 on the 7-segment display (segments a, b and c lit, nothing else).","اعرض رقم 7 على شاشة السبع أجزاء (الأجزاء a وb وc بس منوّرين)."),hints:[j("Segments a…g are on pins 2…8. A 7 is a, b and c.","الأجزاء a…g على البنات 2…8. رقم 7 هو a وb وc.")],base:"seven-segment-counter",starter:`
// Show a 7: segments a..g are on pins 2..8 (common cathode: HIGH = lit).
const int SEG[7] = {2, 3, 4, 5, 6, 7, 8};

void setup() {
  // Outputs, then light the segments of a 7.
}

void loop() {}`,check(e){let t=e.ids("seg7")[0];if(!t)return[Y(!1,j("There's a 7-segment display","فيه شاشة سبع أجزاء"))];let i=e.run(.6).at(-1),s=["a","b","c","d","e","f","g"].filter(e=>(i?.parts[t]?.[`i_${e}`]??0)>.003).join("");return[{label:j("Shows 7 (a, b, c)","بيعرض 7 (a وb وc)"),ok:"abc"===s,got:s||"—"}]}}];function Z(e,t){let i=new V.Simulation(e,t),s=[];return{doc:e,sim:i,run(e,t=.05){let n=[];for(let r=0;r<e-1e-9;r+=t){i.run(Math.round(t*V.F_CPU));let e=i.frame(t);n.push(e),s.push(e)}return n},serial:()=>s.map(e=>e.serial).join(""),ids:(t,i)=>e.parts.filter(e=>e.type===t&&(!i||i(e))).map(e=>e.id)}}e.s(["CHALLENGES",0,F,"challengeBySlug",0,e=>F.find(t=>t.slug===e),"makeProbe",0,Z,"runChallenge",0,function(e,t,i){try{let s=Z(t,i),n=s.sim.diagnostics.filter(e=>"error"===e.level),r=[...n.length?[{label:j("No wiring errors","مفيش أخطاء توصيل"),ok:!1,got:n.map(e=>e.code).join(", ")}]:[],...e.check(s)];return{slug:e.slug,passed:r.length>0&&r.every(e=>e.ok),checks:r,seconds:Math.round(10*s.sim.now())/10}}catch(t){return{slug:e.slug,passed:!1,checks:[{label:j("The simulation ran","المحاكاة اشتغلت"),ok:!1,got:String(t?.message??t).slice(0,120)}],seconds:0}}},"starterDoc",0,function(e){let t=structuredClone(z(e.base).doc);return t.files=[{name:"sketch.ino",text:`${e.starter.trim()}
`}],t.main="sketch.ino",t}],94070)},6880,43671,45787,42822,e=>{"use strict";var t=e.i(3961);class i{part;sim;constructor(e){this.part=e}attach(e){this.sim=e}adopt(e){return e}}e.s(["DeviceLogic",0,i],43671);class s extends i{address;sda;scl;power;vmin;vcc;constructor(e,t,i,s,n,r=3){super(e),this.address=t,this.sda=i,this.scl=s,this.power=n,this.vmin=r,this.vcc=0}get powered(){return this.vcc>=this.vmin}onSolve(e){this.vcc=this.power(e)}}e.s(["I2CBus",0,class{twi;devices;after;current;constructor(e,t,i){this.twi=e,this.devices=t,this.after=i,this.current=null}bits(e){return e/Math.max(1e3,this.twi.sclFrequency)}start(){this.current?.end(),this.current=null,this.after(this.bits(1),()=>this.twi.completeStart())}stop(){this.current?.end(),this.current=null,this.after(this.bits(1),()=>this.twi.completeStop())}connectToSlave(e,t){let i=this.devices().find(t=>t.address===e)??null;this.current=i,i?.begin(t),this.after(this.bits(9),()=>this.twi.completeConnect(!!i))}writeByte(e){let t=this.current?.write(e)??!1;this.after(this.bits(9),()=>this.twi.completeWrite(t))}readByte(){let e=this.current?.read()??255;this.after(this.bits(9),()=>this.twi.completeRead(e))}},"I2CDevice",0,s],45787);let n={32:1,33:2,34:2,38:6,39:6,41:5,42:5,129:1,141:1,163:2,168:1,211:1,213:1,214:1,217:1,218:1,219:1},r=["ram","mode","colStart","colEnd","pageStart","pageEnd","col","page","on","pump","invert","allOn","segRemap","comDec","startLine","offset","contrast","bytes","version","shown","expect","data","cmd","vcc"];class o extends s{ram=new Uint8Array(1024);mode=2;colStart=0;colEnd=127;pageStart=0;pageEnd=7;col=0;page=0;on=!1;pump=!1;invert=!1;allOn=!1;segRemap=!1;comDec=!1;startLine=0;offset=0;contrast=127;bytes=0;version=0;expect="ctrl";data=!1;cmd=[];constructor(e,t,i,s,n){super(e,t,i,s,n)}adopt(e){for(let t of r)e[t]=this[t];return e}begin(){this.expect="ctrl"}end(){this.expect="ctrl"}read(){return 64*!this.on}write(e){return(this.bytes++,"ctrl"===this.expect)?(this.data=(64&e)!=0,this.expect=128&e?"single":"stream"):(this.data?this.dataByte(e):this.commandByte(e),"single"===this.expect&&(this.expect="ctrl")),!0}dataByte(e){this.ram[128*this.page+this.col]=e,this.version++,0===this.mode?++this.col>this.colEnd&&(this.col=this.colStart,++this.page>this.pageEnd&&(this.page=this.pageStart)):1===this.mode?++this.page>this.pageEnd&&(this.page=this.pageStart,++this.col>this.colEnd&&(this.col=this.colStart)):++this.col>127&&(this.col=0)}commandByte(e){this.cmd.push(e);let t=this.cmd[0];if(this.cmd.length<=(n[t]??0))return;let i=this.cmd.slice(1);this.cmd=[],this.version++,t<=15?this.col=240&this.col|t:t<=31?this.col=(15&t)<<4|15&this.col:32===t?this.mode=3&i[0]:33===t?(this.colStart=127&i[0],this.colEnd=127&i[1],this.col=this.colStart):34===t?(this.pageStart=7&i[0],this.pageEnd=7&i[1],this.page=this.pageStart):t>=64&&t<=127?this.startLine=63&t:129===t?this.contrast=i[0]:141===t?this.pump=(4&i[0])!=0:160===t||161===t?this.segRemap=161===t:164===t||165===t?this.allOn=165===t:166===t||167===t?this.invert=167===t:174===t||175===t?this.on=175===t:t>=176&&t<=183?this.page=7&t:192===t||200===t?this.comDec=200===t:211===t&&(this.offset=63&i[0])}get lit(){return this.on&&this.pump&&this.powered}picture(){let e=new Uint8Array(1024);if(!this.lit)return e;for(let t=0;t<64;t++){let i=this.comDec?t+this.startLine+this.offset&63:63-t+this.startLine+this.offset&63;for(let s=0;s<128;s++){let n=this.segRemap?s:127-s,r=this.allOn||(this.ram[(i>>3)*128+n]>>(7&i)&1)==1;this.invert&&(r=!r),r&&(e[(t>>3)*128+s]|=1<<(7&t))}}return e}shown=-1;screen(){let e=2*this.version+ +!!this.lit;return e===this.shown?null:(this.shown=e,this.picture())}reading(){let e=this.bytes;return this.bytes=0,{on:+!!this.lit,contrast:this.contrast,bytes:e}}}e.s(["Ssd1306Logic",0,o],42822);let l={red:1.9,green:2.1,yellow:2,blue:3,white:3},a=["a","b","c","d","e","f","g","dp"],h={"74hc08":{gates:[[1,2,3],[4,5,6],[10,9,8],[13,12,11]],fn:(e,t)=>e&&t,label:"AND"},"74hc32":{gates:[[1,2,3],[4,5,6],[10,9,8],[13,12,11]],fn:(e,t)=>e||t,label:"OR"},"74hc00":{gates:[[1,2,3],[4,5,6],[10,9,8],[13,12,11]],fn:(e,t)=>!(e&&t),label:"NAND"},"74hc86":{gates:[[1,2,3],[4,5,6],[10,9,8],[13,12,11]],fn:(e,t)=>e!==t,label:"XOR"},"74hc04":{gates:[[1,2],[3,4],[5,6],[9,8],[11,10],[13,12]],fn:e=>!e,label:"NOT"}};class d extends i{power;input;low;on;want;pending;clicks;constructor(e,t,i,s,n){super(e),this.power=t,this.input=i,this.low=s,this.on=n,this.pending=!1,this.clicks=0,this.want=n}adopt(e){return Object.assign(e,{pending:this.pending,clicks:this.clicks}),e}onSolve(e){let t=this.power(e)>3.5,i=this.input(e),s=t&&(this.low?this.power(e)-i>2.5:i>2.5);this.want=s,s===this.on||this.pending||(this.pending=!0,this.sim.after(s?.01:.005,()=>{this.pending=!1,this.want!==this.on&&(this.clicks++,this.sim.setLive(this.part,"on",this.want))}))}reading(){let e=this.clicks;return this.clicks=0,{clicks:e}}}class p extends i{power;motion;hold;high;gen;constructor(e,t,i,s){super(e),this.power=t,this.motion=i,this.hold=s,this.high=!1,this.gen=0}adopt(e){return Object.assign(e,{high:this.high,gen:this.gen}),e}onSolve(e){let t=this.power(e)>4.5&&this.motion();if(t&&!this.high)this.high=!0,this.gen++,this.sim.after(1e-6,()=>this.sim.setDrive(`${this.part}:OUT`,{v:3.3,r:100}));else if(!t&&this.high){let e=++this.gen;this.sim.after(Math.max(.3,this.hold),()=>{e===this.gen&&(this.high=!1,this.sim.setDrive(`${this.part}:OUT`,{v:0,r:100}))})}else t&&this.gen++}reading(){return{motion:+!!this.motion(),out:+!!this.high}}}class u extends i{key;power;frac;r;last;constructor(e,t,i,s,n){super(e),this.key=t,this.power=i,this.frac=s,this.r=n,this.last=-1}onSolve(e){let t=Math.max(0,this.power(e))*this.frac;.001>Math.abs(t-this.last)||(this.last=t,this.sim.after(1e-6,()=>this.sim.setDrive(this.key,{v:t,r:this.r})))}reading(){return{}}}class c extends i{chip;pin;power;out;constructor(e,t,i,s){super(e),this.chip=t,this.pin=i,this.power=s,this.out=new Map}adopt(e){return Object.assign(e,{out:this.out}),e}onSolve(e){let t=this.power(e);for(let i of this.chip.gates){let s,n=i[i.length-1];if(t<2)s=null;else{let r=i=>{let s=this.pin(i)(e);return s>=.7*t||!(s<=.3*t)&&null},o=r(i[0]),l=i.length>2&&r(i[1]);s=null===o||null===l?this.out.get(n)??!1:this.chip.fn(o,l)}this.out.get(n)!==s&&(this.out.set(n,s),this.sim.after(1e-8,()=>this.sim.setDrive(`${this.part}:${n}`,null===s?null:{v:s?t:0,r:25})))}}reading(){let e={};for(let[t,i]of this.out)e[`o${t}`]=null===i?-1:+!!i;return e}}class b extends i{model;data;power;temp;hum;low;fell;busy;reads;constructor(e,t,i,s,n,r){super(e),this.model=t,this.data=i,this.power=s,this.temp=n,this.hum=r,this.low=!1,this.fell=0,this.busy=!1,this.reads=0}adopt(e){return Object.assign(e,{low:this.low,fell:this.fell,busy:this.busy,reads:this.reads}),e}onSolve(e,t){if(this.busy)return;let i=this.data(e),s=this.power(e),n=i<.3*Math.max(3,s);n&&!this.low&&(this.fell=t),!n&&this.low&&s>3&&t-this.fell>=(11===this.model?.018:.001)&&this.respond(),this.low=n}frame(){let e,t=this.temp(),i=Math.min(100,Math.max(0,this.hum()));if(11===this.model){let s=Math.min(50,Math.max(0,t));e=[Math.round(i),0,Math.floor(s),Math.round(s%1*10)%10]}else{let s=Math.round(10*i),n=Math.round(10*Math.min(80,Math.max(-40,t))),r=Math.abs(n);e=[s>>8,255&s,r>>8&127|128*(n<0),255&r]}return e.push(e[0]+e[1]+e[2]+e[3]&255),e.flatMap(e=>[7,6,5,4,3,2,1,0].map(t=>e>>t&1))}respond(){this.busy=!0,this.reads++;let e=`${this.part}:DATA`,t=[[3e-5,{v:0,r:60}],[8e-5,null],[8e-5,{v:0,r:60}]];for(let e of this.frame())t.push([5e-5,null],[e?7e-5:27e-6,{v:0,r:60}]);t.push([5e-5,null]);let i=0,s=()=>{if(i>=t.length)return void(this.busy=!1);let[n,r]=t[i++];this.sim.after(n,()=>{this.sim.setDrive(e,r),s()})};s()}reading(){let e=this.reads;return this.reads=0,{reads:e,temp:this.temp(),humidity:this.hum()}}}e.s(["GATES",0,h,"SEGMENTS",0,a,"buildModule",0,function(e,i){let s=(0,t.propsOf)(e),n=(e,t)=>Number.isFinite(Number(s[e]))?Number(s[e]):t,r=(e,t)=>{let n=i.live(e)??s[e];return Number.isFinite(Number(n))?Number(n):t},g=(e,t)=>i=>i.v[e]-i.v[t];switch(e.type){case"seg7":{let e="anode"===s.common,t=i.n("COM1"),n=l[String(s.color)]??1.9;for(let s of a){let r=i.n(s),o=i.add(s,e?{t:"D",a:t,k:r,vf:n,ron:12}:{t:"D",a:r,k:t,vf:n,ron:12});i.probe(`i_${s}`,e=>Math.max(0,e.i[o]))}break}case"relay":{let t=i.n("VCC"),n=i.n("GND"),r=i.n("IN"),o="low"===s.trigger;i.add("IN",o?{t:"D",a:t,k:r,vf:1.2,ron:1e3}:{t:"R",a:r,b:n,r:4700});let l=!!i.live("on"),a=i.add("COIL",{t:"R",a:t,b:n,r:l?70:1e9});i.add("CONTACT",{t:"R",a:i.n("COM"),b:i.n(l?"NO":"NC"),r:.05}),i.probe("on",()=>+!!l),i.probe("i_coil",e=>Math.max(0,e.i[a])),i.device(new d(e.id,g(t,n),g(r,n),o,l));break}case"joystick":{let e=i.n("+5V"),t=i.n("GND");for(let[s,n]of[["x","VRx"],["y","VRy"]]){let o=Math.min(1,Math.max(0,r(s,.5))),l=i.n(n);i.add(`${s}1`,{t:"R",a:e,b:l,r:Math.max(1,1e4*(1-o))}),i.add(`${s}2`,{t:"R",a:l,b:t,r:Math.max(1,1e4*o)}),i.probe(`v_${s}`,e=>e.v[l]-e.v[t])}i.add("SW",{t:"R",a:i.n("SW"),b:t,r:i.live("pressed")?.05:1e10});break}case"pir":{let t=i.n("VCC"),r=i.n("GND");i.add("SUPPLY",{t:"R",a:t,b:r,r:5e4}),i.add("OUT",{t:"X",a:i.n("OUT"),b:r,key:`${e.id}:OUT`}),i.initDrive("OUT",{v:0,r:100}),i.probe("out",e=>e.v[i.n("OUT")]-e.v[r]),i.device(new p(e.id,g(t,r),()=>!!(i.live("motion")??s.motion),n("hold",3)));break}case"ir-obstacle":{let e=i.n("VCC"),t=i.n("GND");i.add("SUPPLY",{t:"R",a:e,b:t,r:250});let n=!!(i.live("obstacle")??s.obstacle);i.add("PULLUP",{t:"R",a:e,b:i.n("OUT"),r:1e4}),i.add("OUT",{t:"R",a:i.n("OUT"),b:t,r:n?30:1e10}),i.probe("out",e=>e.v[i.n("OUT")]-e.v[t]),i.probe("obstacle",()=>+!!n);break}case"line-sensor":case"soil":{let t=i.n("VCC"),s=i.n("GND");i.add("SUPPLY",{t:"R",a:t,b:s,r:400});let o="soil"===e.type?Math.min(100,Math.max(0,r("moisture",30)))/100:Math.min(1,Math.max(0,r("dark",0))),l="soil"===e.type?.95-.65*o:.1+.85*o;i.add("A0",{t:"X",a:i.n("A0"),b:s,key:`${e.id}:A0`}),i.initDrive("A0",null),i.device(new u(e.id,`${e.id}:A0`,g(t,s),l,1e3));let a=Math.min(1,Math.max(0,n("threshold",.5))),h="soil"===e.type?o>a:o<=a;i.add("PULLUP",{t:"R",a:t,b:i.n("D0"),r:1e4}),i.add("D0",{t:"R",a:i.n("D0"),b:s,r:h?30:1e10}),i.probe("a0",e=>e.v[i.n("A0")]-e.v[s]),i.probe("d0",e=>e.v[i.n("D0")]-e.v[s]);break}case"dht11":case"dht22":{let t=i.n("VCC"),s=i.n("GND");i.add("SUPPLY",{t:"R",a:t,b:s,r:3300}),i.add("DATA",{t:"X",a:i.n("DATA"),b:s,key:`${e.id}:DATA`}),i.initDrive("DATA",null),i.device(new b(e.id,"dht11"===e.type?11:22,g(i.n("DATA"),s),g(t,s),()=>r("temp",24),()=>r("humidity",45)));break}case"oled-ssd1306":{let t=i.n("VCC"),n=i.n("GND");i.add("SUPPLY",{t:"R",a:t,b:n,r:1e3}),i.add("PU_SDA",{t:"R",a:i.n("SDA"),b:t,r:4700}),i.add("PU_SCL",{t:"R",a:i.n("SCL"),b:t,r:4700}),i.device(new o(e.id,"0x3D"===s.address?61:60,i.n("SDA"),i.n("SCL"),g(t,n)));break}default:{let t=h[e.type];if(!t)break;let s=i.n("14"),n=i.n("7");for(let r of(i.add("SUPPLY",{t:"R",a:s,b:n,r:2e5}),t.gates)){let t=String(r[r.length-1]);i.add(`OUT${t}`,{t:"X",a:i.n(t),b:n,key:`${e.id}:${t}`}),i.initDrive(t,null)}i.device(new c(e.id,t,e=>t=>t.v[i.n(String(e))]-t.v[n],g(s,n)))}}}],6880)}]);