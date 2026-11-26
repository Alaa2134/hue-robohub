(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,94070,72301,e=>{"use strict";let t,i,n,s,l,r,o,a,d,h,u,c,p,g,f,b,m,v,w,y,S,D,k,T,M,O={tp:10,tn:20,a:50,b:60,c:70,d:80,e:90,f:120,g:130,h:140,i:150,j:160,bn:190,bp:200};function E(e){let t=e.match(/^(tp|tn|bp|bn|[a-j])(\d+)$/);return[10+10*Number(t[2]),-260+O[t[1]]]}let L={};["SCL","SDA","AREF","GND1","D13","D12","D11","D10","D9","D8"].forEach((e,t)=>L[e]=[100+10*t,10]),["D7","D6","D5","D4","D3","D2","D1","D0"].forEach((e,t)=>L[e]=[200+10*t,10]),["IOREF","RESET","3V3","5V","GND2","GND3","VIN"].forEach((e,t)=>L[e]=[100+10*t,200]),["A0","A1","A2","A3","A4","A5"].forEach((e,t)=>L[e]=[180+10*t,200]);let x=0,N=(e,t,i={},n=0)=>({id:`${e}-${++x}`,type:e,x:t[0],y:t[1],rot:n,props:i}),P=()=>({id:"uno",type:"arduino-uno",x:0,y:0,rot:0,props:{}}),R=()=>({id:"bb",type:"breadboard-half",x:0,y:-260,rot:0,props:{}}),I=(e,t,i,n=[])=>({id:`w${++x}`,a:{part:e[0],pin:e[1]},b:{part:t[0],pin:t[1]},pts:n,color:i}),U=(e,t,i,n=-30)=>{let[s]=L[e],[l]=E(t);return I(["uno",e],["bb",t],i,s===l?[]:[[s,n],[l,n]])},W=(e,t,i,n,s)=>{let[l,r]=L[e],[,o]=E(t);return I(["uno",e],["bb",t],i,[[l,r+n],[s,r+n],[s,o]])},A=(e,t,i,n,s=350)=>{let[l,r]=L[e],[,o]=E(t);return I(["uno",e],["bb",t],i,[[l,r+n],[s,r+n],[s,o]])},G=(e,t,i)=>I(["bb",e],["bb",t],i);function H(e,t,i,n,s,l=220){return{parts:[N("resistor",E(`h${e}`),{r:l}),N("led",E(`f${e+4}`),{color:i})],wires:[U(t,`j${e}`,n,s),G(`i${e+5}`,`bn${e+5}`,"#2b2b2b")]}}let B=(e,t,i)=>({v:1,parts:e,wires:t,files:[{name:"sketch.ino",text:i.trim()+"\n"}],main:"sketch.ino"}),C={blink:`
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
}`},z=(x=0,t=(e,t)=>({en:e,ar:t}),i=[],n=H(13,"D13","red","#e5484d",-30),i.push({slug:"blink",title:t("Blink","ليد بيرمش"),description:t("The classic first circuit: an LED on pin 13 through a 220 Ω resistor.","أول دايرة لأي حد: ليد على بن 13 مع مقاومة 220 أوم."),tags:["led","digital"],level:1,doc:B([P(),R(),...n.parts],[U("GND1","bn12","#2b2b2b"),I(["uno","D13"],["bb","j13"],"#e5484d"),...n.wires.slice(1)],C.blink)}),s=H(2,"D13","green","#30a46c",-30),l=N("pushbutton",E("e20")),i.push({slug:"button-led",title:t("Button LED","زرار وليد"),description:t("Read a push button with the internal pull-up and light an LED while it's pressed.","اقرا زرار بالـ pull-up الداخلي ونوّر ليد طول ما هو مضغوط."),tags:["button","input","led"],level:1,doc:B([P(),R(),...s.parts,l],[U("GND1","bn12","#2b2b2b"),...s.wires,G("j20","bn20","#2b2b2b"),U("D2","j22","#f5d90a",-40)],C.button)}),r=H(2,"D13","red","#e5484d",-26),o=H(9,"D12","yellow","#f5d90a",-36),a=H(16,"D11","green","#30a46c",-46),i.push({slug:"traffic-light",title:t("Traffic light","إشارة مرور"),description:t("Three LEDs on pins 13, 12 and 11 cycle like a real traffic light.","تلات ليدات على بن 13 و12 و11 بيشتغلوا زي إشارة المرور."),tags:["led","timing"],level:1,doc:B([P(),R(),...r.parts,...o.parts,...a.parts],[U("GND1","bn12","#2b2b2b"),...r.wires,...o.wires,...a.wires],C.traffic)}),d=H(2,"D9","blue","#3e63dd",-30,330),h=N("potentiometer",E("e24"),{r:1e4,pos:.5}),i.push({slug:"potentiometer-dimmer",title:t("Potentiometer dimmer","تحكم في الإضاءة ببوتنشوميتر"),description:t("analogRead() a knob on A0 and set an LED's brightness with PWM on pin 9.","اقرا البوتنشوميتر على A0 وغيّر إضاءة ليد بالـ PWM على بن 9."),tags:["analog","pwm","potentiometer"],level:2,doc:B([P(),R(),...d.parts,h],[U("GND1","bn12","#2b2b2b"),...d.wires,G("a24","tn24","#2b2b2b"),G("a26","tp26","#e5484d"),W("5V","tp1","#e5484d",30,-20),W("GND2","tn1","#2b2b2b",40,-30),A("A0","b25","#f76b15",30)],C.pot)}),u=H(13,"D9","green","#30a46c",-30),i.push({slug:"pwm-fade",title:t("PWM fade","ليد بيتنفّس (PWM)"),description:t("analogWrite() changes the duty cycle; the simulator dims the LED by the real average current.","analogWrite() بيغيّر نسبة التشغيل؛ والمحاكي بيوطّي الإضاءة على حسب التيار الحقيقي."),tags:["pwm","led"],level:1,doc:B([P(),R(),...u.parts],[U("GND1","bn12","#2b2b2b"),...u.wires],C.fade)}),i.push({slug:"serial-hello",title:t("Serial hello","أهلًا بالسيريال"),description:t("Print to the serial monitor and echo back what you type.","اطبع على السيريال مونيتور ورجّع اللي بتكتبه."),tags:["serial"],level:1,doc:B([P()],[],C.serial)}),c=N("servo",[330,120]),i.push({slug:"servo-sweep",title:t("Servo sweep","سيرفو بيلف"),description:t("The Servo library drives an SG90 on pin 9; the angle comes from the measured pulse width.","مكتبة Servo بتحرك SG90 على بن 9؛ والزاوية من عرض النبضة المقاس."),tags:["servo","library","motor"],level:2,doc:B([P(),c],[I(["uno","GND2"],[c.id,"GND"],"#2b2b2b",[[140,225],[330,225]]),I(["uno","5V"],[c.id,"V+"],"#e5484d",[[130,235],[340,235]]),I(["uno","D9"],[c.id,"SIG"],"#f76b15",[[180,-15],[400,-15],[400,215],[350,215]])],C.servo)}),p=N("hc-sr04",[330,120],{cm:42}),i.push({slug:"ultrasonic-ruler",title:t("Ultrasonic ruler","مسطرة ألتراسونيك"),description:t("Measure distance with an HC-SR04 and pulseIn(); change the distance while it runs.","قيس المسافة بـ HC-SR04 و pulseIn()؛ وغيّر المسافة وهي شغالة."),tags:["sensor","distance","timing"],level:2,doc:B([P(),p],[I(["uno","5V"],[p.id,"VCC"],"#e5484d",[[130,235],[330,235]]),I(["uno","D9"],[p.id,"TRIG"],"#3e63dd",[[180,-15],[410,-15],[410,215],[340,215]]),I(["uno","D10"],[p.id,"ECHO"],"#30a46c",[[170,-25],[420,-25],[420,205],[350,205]]),I(["uno","GND2"],[p.id,"GND"],"#2b2b2b",[[140,245],[360,245]])],C.sonar)}),g=H(2,"D9","white","#ffffff",-30),f=N("ldr",E("e23"),{lux:300}),b=N("resistor",E("d24"),{r:1e4}),i.push({slug:"night-light",title:t("Night light","نور الليل"),description:t("A light sensor in a voltage divider: when it gets dark, the LED turns on.","حساس ضوء في مقسّم جهد: لما الدنيا تضلم الليد بينور."),tags:["sensor","analog","led"],level:2,doc:B([P(),R(),...g.parts,f,b],[U("GND1","bn12","#2b2b2b"),...g.wires,G("a23","tp23","#e5484d"),G("a28","tn28","#2b2b2b"),W("5V","tp1","#e5484d",30,-20),W("GND2","tn1","#2b2b2b",40,-30),A("A0","b24","#f76b15",30)],C.night)}),m=N("buzzer",E("f20"),{active:!1}),i.push({slug:"buzzer-melody",title:t("Buzzer melody","لحن بالبازر"),description:t("tone() on a passive buzzer: the simulator measures the frequency your code produces and plays it.","tone() على بازر باسيف: المحاكي بيقيس التردد اللي الكود بيطلعه وبيشغّله."),tags:["sound","tone"],level:1,doc:B([P(),R(),m],[U("GND1","bn12","#2b2b2b"),U("D8","j20","#8e4ec6",-30),G("j22","bn22","#2b2b2b")],C.melody)}),v=N("npn",E("f10"),{beta:150}),w=N("resistor",E("h7"),{r:1e3}),y=N("dc-motor",[420,-150],{rated:9}),S=N("battery-9v",[420,0],{},90),i.push({slug:"transistor-motor",title:t("Transistor motor driver","تشغيل موتور بترانزستور"),description:t("A pin can't power a motor: it switches an NPN that does, from a 9 V battery. PWM sets the speed.","البن مايقدرش يشغّل موتور: بيشغّل ترانزستور NPN هو اللي بيشغّله من بطارية 9 فولت. والـ PWM بيحدد السرعة."),tags:["transistor","motor","pwm"],level:3,doc:B([P(),R(),v,w,y,S],[U("GND1","bn12","#2b2b2b"),U("D3","j7","#f76b15",-30),G("j10","bn10","#2b2b2b"),I(["bb","j12"],[y.id,"-"],"#3e63dd",[[130,-85],[440,-85]]),I([S.id,"+"],[y.id,"+"],"#e5484d"),I([S.id,"-"],["bb","bn30"],"#2b2b2b",[[340,20],[340,-70]])],C.motor)}),D=N("seg7",E("c20"),{common:"cathode",color:"red"}),T=[(k=e=>N("resistor",E(e),{r:330}))("a16"),k("b17"),k("b23"),k("a24"),k("i16"),k("j17"),k("i23")],i.push({slug:"seven-segment-counter",title:t("7-segment counter","عداد 7 سيجمنت"),description:t("Count 0 to 9 on a 7-segment digit: seven pins, each segment through its own 330 Ω resistor.","عدّ من 0 لـ 9 على شاشة 7 سيجمنت: سبع بنات، وكل سيجمنت بمقاومة 330 أوم لوحده."),tags:["display","digital","arrays"],level:2,doc:B([P(),R(),D,...T],[U("GND1","bn12","#2b2b2b"),G("h22","bn22","#2b2b2b"),...[["D2","e27","#e5484d",-26],["D3","e28","#f76b15",-30],["D4","f27","#f5d90a",-34],["D5","f17","#30a46c",-38],["D6","f16","#3e63dd",-42],["D7","e17","#8e4ec6",-46],["D8","e16","#e93d82",-50]].map(([e,t,i,n])=>U(e,t,i,n))],C.counter)}),M=N("oled-ssd1306",[380,30]),i.push({slug:"oled-hello",title:t("OLED display","شاشة OLED"),description:t("Text, a counter and a progress bar on a 128×64 SSD1306 over I2C, drawn by the real Adafruit library.","نص وعدّاد وشريط تقدّم على شاشة SSD1306 ‏128×64 عن طريق I2C، بترسمهم مكتبة Adafruit الحقيقية."),tags:["display","i2c","library"],level:2,doc:B([P(),M],[I([M.id,"GND"],["uno","GND1"],"#2b2b2b",[[380,-10],[130,-10]]),I([M.id,"SCL"],["uno","SCL"],"#f5d90a",[[400,-20],[100,-20]]),I([M.id,"SDA"],["uno","SDA"],"#3e63dd",[[410,-30],[110,-30]]),I([M.id,"VCC"],["uno","5V"],"#e5484d",[[390,-40],[310,-40],[310,230],[130,230]])],C.oled)}),i),$=e=>z.find(t=>t.slug===e);e.s(["s",0,C,"p",0,[{key:"blink",title:{en:"Blink",ar:"ليد بيرمش"}},{key:"button",title:{en:"Button LED",ar:"زرار وليد"}},{key:"traffic",title:{en:"Traffic light",ar:"إشارة مرور"}},{key:"pot",title:{en:"Potentiometer",ar:"بوتنشوميتر"}},{key:"fade",title:{en:"PWM fade",ar:"PWM"}},{key:"serial",title:{en:"Serial hello",ar:"السيريال"}},{key:"servo",title:{en:"Servo",ar:"سيرفو"}},{key:"sonar",title:{en:"Ultrasonic",ar:"ألتراسونيك"}},{key:"melody",title:{en:"Melody",ar:"لحن"}},{key:"oled",title:{en:"OLED display",ar:"شاشة OLED"}},{key:"counter",title:{en:"7-segment counter",ar:"عداد 7 سيجمنت"}}],"v",0,z,"t",0,$],72301);var j=e.i(81011);let _=(e,t)=>({en:e,ar:t}),V=e=>Math.round(10*e)/10,q=e=>`${Math.round(100*e)}%`,Z=(e,t)=>({label:t,ok:e}),F=[{slug:"blink-2hz",level:1,title:_("Faster blink","ليد بيرمش أسرع"),goal:_("Make the LED blink twice a second: 250 ms on, 250 ms off.","خلّي الليد يرمش مرتين في الثانية: 250 مللي ثانية منوّر و250 مطفي."),hints:[_("pinMode(13, OUTPUT) in setup().","pinMode(13, OUTPUT) جوه setup()."),_("digitalWrite then delay(250), twice.","digitalWrite وبعدها delay(250)، مرتين.")],base:"blink",starter:`
// Faster blink: the LED on pin 13 should blink twice a second (250 ms on, 250 ms off).
void setup() {
  // Set pin 13 as an output.
}

void loop() {
  // Turn it on, wait, turn it off, wait.
}`,check(e){let t=e.ids("led")[0];if(!t)return[Z(!1,_("There's an LED in the circuit","فيه ليد في الدايرة"))];let i=function(e,t,i=.3){let n=e.map(e=>(e.parts[t]?.i??0)>.005),s=Math.round(i/.01),l=[];for(let e=Math.max(1,s);e<n.length;e++)n[e]&&!n[e-1]&&l.push(.01*e);let r=(n.length-s)*.01,o=n.slice(s).filter(Boolean).length/Math.max(1,n.length-s),a=l.length>=2?(l.length-1)/(l.at(-1)-l[0]):0;return{any:n.some(Boolean),freq:a,duty:o,span:r}}(e.run(3.3,.01),t);return[{label:_("The LED lights up","الليد بينوّر"),ok:i.any},{label:_("Blinks 2 times a second","بيرمش مرتين في الثانية"),ok:.2>=Math.abs(i.freq-2),got:`${V(i.freq)} Hz`},{label:_("On half the time","منوّر نص الوقت"),ok:i.duty>.4&&i.duty<.6,got:q(i.duty)}]}},{slug:"button-hold",level:1,title:_("Hold to light","دوس ونوّر"),goal:_("The LED is on only while the button is held down.","الليد ينوّر بس طول ما الزرار مضغوط."),hints:[_("The button pulls pin 2 to GND: use INPUT_PULLUP, pressed reads LOW.","الزرار بيوصّل بن 2 بالأرضي: استخدم INPUT_PULLUP، والضغط بيقرا LOW.")],base:"button-led",starter:`
// Hold to light: the LED on pin 13 is on only while the button on pin 2 is pressed.
const int BUTTON = 2;
const int LED = 13;

void setup() {
  // Button with the internal pull-up, LED as an output.
}

void loop() {
  // Read the button and set the LED.
}`,check(e){let t=e.ids("led")[0],i=e.ids("pushbutton")[0];if(!t||!i)return[Z(!1,_("There's a button and an LED","فيه زرار وليد"))];let n=()=>(e.run(.3).at(-1)?.parts[t]?.i??0)>.005,s=n();e.sim.setLive(i,"pressed",!0);let l=n();e.sim.setLive(i,"pressed",!1);let r=n();return[{label:_("Off before pressing","مطفي قبل الضغط"),ok:!s},{label:_("On while pressed","منوّر وهو مضغوط"),ok:l},{label:_("Off again after letting go","يطفي تاني لما تسيبه"),ok:!r}]}},{slug:"traffic-cycle",level:2,title:_("Traffic light","إشارة مرور"),goal:_("Red 2 s → green 2 s → yellow 1 s, over and over. Never two lights at once.","أحمر ثانيتين ← أخضر ثانيتين ← أصفر ثانية، وتعيد. عمر ما نورين يولّعوا مع بعض."),hints:[_("A helper show(r, y, g, ms) keeps loop() short.","دالة show(r, y, g, ms) بتخلّي loop() قصيرة.")],base:"traffic-light",starter:`
// Traffic light: red 2 s, then green 2 s, then yellow 1 s, repeating.
const int RED = 13, YELLOW = 12, GREEN = 11;

void setup() {
  // All three pins are outputs.
}

void loop() {
  // One light at a time.
}`,check(e){let t,i,n=t=>e.ids("led",e=>e.props.color===t)[0],[s,l,r]=[n("red"),n("yellow"),n("green")];if(!s||!l||!r)return[Z(!1,_("Red, yellow and green LEDs","ليد أحمر وأصفر وأخضر"))];let o=e.run(10.2,.05).map(e=>[s,r,l].map(t=>(e.parts[t]?.i??0)>.005)),a=o.slice(1).some(e=>e.filter(Boolean).length>1),d=[];for(let e of o){let t=e.indexOf(!0);t>=0&&1===e.filter(Boolean).length&&d.at(-1)!==t&&d.push(t)}let h=d.length>=3&&d.every((e,t)=>0===t||e===(d[t-1]+1)%3),u=(t=[],i=-1,o.forEach((e,n)=>{let s=e[0]&&1===e.filter(Boolean).length;s&&i<0&&(i=n),!s&&i>=0&&(i>1&&t.push((n-i)*.05),i=-1)}),t),c=u.length?u[0]:0;return[{label:_("Never two lights at once","عمر ما نورين مع بعض"),ok:!a},{label:_("All three light up","التلاتة بينوّروا"),ok:3===new Set(d).size},{label:_("Order: red → green → yellow","الترتيب: أحمر ← أخضر ← أصفر"),ok:h},{label:_("Red stays about 2 s","الأحمر بيفضل حوالي ثانيتين"),ok:.2>=Math.abs(c-2),got:`${V(c)} s`}]}},{slug:"dimmer-knob",level:2,title:_("Knob dimmer","تحكم في الإضاءة بالبوتنشوميتر"),goal:_("Turn the knob and the LED's brightness follows: knob at zero = LED off.","لف البوتنشوميتر وإضاءة الليد تمشي معاه: عند الصفر الليد مطفي."),hints:[_("analogRead(A0) gives 0–1023, analogWrite(9, …) takes 0–255.","analogRead(A0) بيدي 0–1023، وanalogWrite(9, …) بياخد 0–255.")],base:"potentiometer-dimmer",starter:`
// Knob dimmer: the LED on pin 9 gets brighter as the knob on A0 turns up.
void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  // Read A0, scale it, write it to pin 9.
}`,check(e){let t=e.ids("led")[0],i=e.ids("potentiometer")[0];if(!t||!i)return[Z(!1,_("A potentiometer and an LED","بوتنشوميتر وليد"))];let n=n=>(e.sim.setLive(i,"pos",n),e.run(.5),(e.run(.2).at(-1)?.parts[t]?.i??0)*1e3),s=n(0),l=n(.25),r=n(.5),o=n(.9),a=o>0?r/o:0;return[{label:_("Off with the knob at zero","مطفي والبوتنشوميتر على الصفر"),ok:s<.3,got:`${V(s)} mA`},{label:_("Brighter as the knob turns up","بيزيد كل ما تلف"),ok:l>.3&&r>1.3*l&&o>1.3*r,got:`${V(l)} → ${V(r)} → ${V(o)} mA`},{label:_("Halfway is about half as bright","في النص نص الإضاءة تقريبًا"),ok:a>.35&&a<.75,got:q(a)}]}},{slug:"serial-echo",level:1,title:_("Talk over serial","اتكلم على السيريال"),goal:_('Print "Hello BuildX" once at the start, then answer every line you receive with "Got: " and the line.','اطبع "Hello BuildX" مرة في الأول، وبعدها رد على كل سطر يوصلك بـ "Got: " والسطر.'),hints:[_("Serial.begin(9600) first; Serial.readStringUntil('\\n') reads a line.","Serial.begin(9600) الأول؛ Serial.readStringUntil('\\n') بيقرا سطر.")],base:"serial-hello",starter:`
// Talk over serial: greet once, then answer each line with "Got: <line>".
void setup() {
  // Start serial at 9600 and greet.
}

void loop() {
  // When a line arrives, answer it.
}`,check(e){e.run(.4);let t=e.serial().includes("Hello BuildX");e.sim.serialWrite("robot\n"),e.run(1.2);let i=/Got: robot/.test(e.serial());return[{label:_('Says "Hello BuildX"','بيقول "Hello BuildX"'),ok:t},{label:_('Answers "robot" with "Got: robot"','بيرد على "robot" بـ "Got: robot"'),ok:i}]}},{slug:"night-light",level:2,title:_("Night light","نور الليل"),goal:_("The LED turns on when it's dark and off when it's bright.","الليد ينوّر لما الدنيا تضلّم ويطفي لما تنوّر."),hints:[_("Darker = lower analogRead(A0). Pick a threshold around 400.","كل ما تضلّم analogRead(A0) بيقل. اختار حد حوالي 400.")],base:"night-light",starter:`
// Night light: the LED on pin 9 turns on in the dark (light sensor on A0).
void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  // Read the light level and switch the LED.
}`,check(e){let t=e.ids("led")[0],i=e.ids("ldr")[0];if(!t||!i)return[Z(!1,_("A light sensor and an LED","حساس ضوء وليد"))];let n=n=>(e.sim.setLive(i,"lux",n),(e.run(.6).at(-1)?.parts[t]?.i??0)>.005),s=n(500),l=n(1),r=n(500);return[{label:_("Off in bright light","مطفي في النور"),ok:!s&&!r},{label:_("On in the dark","منوّر في الضلمة"),ok:l}]}},{slug:"servo-sweep",level:2,title:_("Servo sweep","سيرفو بيلف"),goal:_("Sweep the servo from 0° to 180° and back, smoothly.","لف السيرفو من 0° لـ 180° وارجع، بهدوء."),hints:[_("#include <Servo.h>, attach(9), then write(angle) in a for loop with a short delay.","#include <Servo.h>، وattach(9)، وبعدها write(angle) في for loop مع delay صغير.")],base:"servo-sweep",starter:`
// Servo sweep: 0\xb0 → 180\xb0 and back on pin 9.
#include <Servo.h>

Servo arm;

void setup() {
  // Attach the servo.
}

void loop() {
  // Sweep up, then down.
}`,check(e){let t=e.ids("servo")[0];if(!t)return[Z(!1,_("There's a servo","فيه سيرفو"))];let i=e.run(4,.05).map(e=>e.parts[t]?.angle??-1).filter(e=>e>=0),n=i.length?Math.min(...i):0,s=i.length?Math.max(...i):0,l=0;for(let e=2;e<i.length;e++)(i[e]-i[e-1])*(i[e-1]-i[e-2])<0&&l++;return[{label:_("Covers 0° to 180°","بيغطي من 0° لـ 180°"),ok:n<=10&&s>=170,got:`${Math.round(n)}\xb0–${Math.round(s)}\xb0`},{label:_("Goes back and forth","بيروح ويرجع"),ok:l>=1}]}},{slug:"buzzer-a4",level:2,title:_("Tuning note","نغمة الضبط"),goal:_("Beep the note A (440 Hz) for half a second, then half a second of silence, repeating.","شغّل نغمة لا (440 هرتز) نص ثانية، وسكوت نص ثانية، وتعيد."),hints:[_("tone(8, 440) starts it, noTone(8) stops it.","tone(8, 440) بتشغّلها، وnoTone(8) بتوقفها.")],base:"buzzer-melody",starter:`
// Tuning note: 440 Hz for 0.5 s, silence for 0.5 s, on the buzzer on pin 8.
const int BUZZER = 8;

void setup() {}

void loop() {
  // Beep, then rest.
}`,check(e){let t=e.ids("buzzer")[0];if(!t)return[Z(!1,_("There's a buzzer","فيه بازر"))];let i=e.run(3,.05).map(e=>e.parts[t]?.freq??0),n=i.filter(e=>e>0),s=n.length?n.reduce((e,t)=>e+t,0)/n.length:0,l=n.length/Math.max(1,i.length);return[{label:_("Plays 440 Hz","بيشغّل 440 هرتز"),ok:15>=Math.abs(s-440),got:`${Math.round(s)} Hz`},{label:_("Sound half the time, silence half","صوت نص الوقت وسكوت نصه"),ok:l>.35&&l<.65,got:q(l)}]}},{slug:"seg7-seven",level:3,title:_("Show a 7","اعرض رقم 7"),goal:_("Show the digit 7 on the 7-segment display (segments a, b and c lit, nothing else).","اعرض رقم 7 على شاشة السبع أجزاء (الأجزاء a وb وc بس منوّرين)."),hints:[_("Segments a…g are on pins 2…8. A 7 is a, b and c.","الأجزاء a…g على البنات 2…8. رقم 7 هو a وb وc.")],base:"seven-segment-counter",starter:`
// Show a 7: segments a..g are on pins 2..8 (common cathode: HIGH = lit).
const int SEG[7] = {2, 3, 4, 5, 6, 7, 8};

void setup() {
  // Outputs, then light the segments of a 7.
}

void loop() {}`,check(e){let t=e.ids("seg7")[0];if(!t)return[Z(!1,_("There's a 7-segment display","فيه شاشة سبع أجزاء"))];let i=e.run(.6).at(-1),n=["a","b","c","d","e","f","g"].filter(e=>(i?.parts[t]?.[`i_${e}`]??0)>.003).join("");return[{label:_("Shows 7 (a, b, c)","بيعرض 7 (a وb وc)"),ok:"abc"===n,got:n||"—"}]}}];function K(e,t){let i=new j.p(e,t),n=[];return{doc:e,sim:i,run(e,t=.05){let s=[];for(let l=0;l<e-1e-9;l+=t){i.run(Math.round(t*j.R));let e=i.frame(t);s.push(e),n.push(e)}return s},serial:()=>n.map(e=>e.serial).join(""),ids:(t,i)=>e.parts.filter(e=>e.type===t&&(!i||i(e))).map(e=>e.id)}}e.s(["CHALLENGES",0,F,"challengeBySlug",0,e=>F.find(t=>t.slug===e),"makeProbe",0,K,"runChallenge",0,function(e,t,i){try{let n=K(t,i),s=n.sim.diagnostics.filter(e=>"error"===e.level),l=[...s.length?[{label:_("No wiring errors","مفيش أخطاء توصيل"),ok:!1,got:s.map(e=>e.code).join(", ")}]:[],...e.check(n)];return{slug:e.slug,passed:l.length>0&&l.every(e=>e.ok),checks:l,seconds:Math.round(10*n.sim.now())/10}}catch(t){return{slug:e.slug,passed:!1,checks:[{label:_("The simulation ran","المحاكاة اشتغلت"),ok:!1,got:String(t?.message??t).slice(0,120)}],seconds:0}}},"starterDoc",0,function(e){let t=structuredClone($(e.base).doc);return t.files=[{name:"sketch.ino",text:`${e.starter.trim()}
`}],t.main="sketch.ino",t}],94070)},40911,e=>{e.q("/_next/static/media/check-worker.3ju9alx03hlmg.ts")},24587,e=>{"use strict";let t={"blink-2hz":{points:10,title:{en:"Faster blink",ar:"ليد بيرمش أسرع"},skill:"programming"},"button-hold":{points:10,title:{en:"Hold to light",ar:"دوس ونوّر"},skill:"electronics"},"serial-echo":{points:10,title:{en:"Talk over serial",ar:"اتكلم على السيريال"},skill:"programming"},"traffic-cycle":{points:20,title:{en:"Traffic light",ar:"إشارة مرور"},skill:"programming"},"dimmer-knob":{points:20,title:{en:"Knob dimmer",ar:"تحكم في الإضاءة بالبوتنشوميتر"},skill:"electronics"},"night-light":{points:20,title:{en:"Night light",ar:"نور الليل"},skill:"electronics"},"servo-sweep":{points:20,title:{en:"Servo sweep",ar:"سيرفو بيلف"},skill:"robotics"},"buzzer-a4":{points:20,title:{en:"Tuning note",ar:"نغمة الضبط"},skill:"programming"},"seg7-seven":{points:30,title:{en:"Show a 7",ar:"اعرض رقم 7"},skill:"electronics"},"robot-oval":{points:20,title:{en:"Robot lap — Oval",ar:"لفة الروبوت — بيضاوي"},skill:"robotics"},"robot-rounded":{points:30,title:{en:"Robot lap — Tight corners",ar:"لفة الروبوت — زوايا ضيقة"},skill:"robotics"},"robot-wavy":{points:30,title:{en:"Robot lap — S-bends",ar:"لفة الروبوت — منحنيات S"},skill:"robotics"}},i=Object.fromEntries(Object.entries(t).map(([e,t])=>[e,t.points]));e.s(["P",0,t,"Y",0,i])},22512,e=>{"use strict";let t=new Set(["if","else","while","for","switch","do","return","sizeof","case","catch","new","delete"]);function i(e){let t="",i=0;for(;i<e.length;){let n=e[i],s=e[i+1];if("/"===n&&"/"===s)for(;i<e.length&&"\n"!==e[i];)t+=" ",i++;else if("/"===n&&"*"===s){for(t+="  ",i+=2;i<e.length&&("*"!==e[i]||"/"!==e[i+1]);)t+="\n"===e[i]?"\n":" ",i++;i<e.length&&(t+="  ",i+=2)}else if('"'===n||"'"===n){for(t+=n,i++;i<e.length&&e[i]!==n&&"\n"!==e[i];)"\\"===e[i]&&(t+=" ",i++),i<e.length&&(t+=" ",i++);i<e.length&&(t+=e[i],i++)}else t+=n,i++}return t}function n(e){let n=i(e),s=[],l=0,r=0,o=0;for(let e=0;e<n.length;e++){let i=n[e];if("#"===i&&0===l&&/(^|\n)[ \t]*$/.test(n.slice(Math.max(0,e-80),e))){for(;e<n.length&&("\n"!==n[e]||"\\"===n[e-1]);)e++;o=e+1;continue}if("("===i)r++;else if(")"===i)r=Math.max(0,r-1);else if("{"===i){if(0===l&&0===r){let i=n.slice(o,e),l=i.replace(/\s+/g," ").trim(),r=l.match(/^((?:[\w:<>,*&]+\s+|[*&]\s*)+?)([A-Za-z_]\w*)\s*\(([^()]*)\)\s*(const\s*)?$/);if(r&&!/^(?:class|struct|enum|union|namespace|typedef|template|extern|using)\b/.test(l)&&!t.has(r[2])&&!/[=;]/.test(r[1])&&!r[1].trim().split(/\s+/).some(e=>t.has(e))){let e=i.length-i.trimStart().length;s.push({header:l,name:r[2],start:o+e})}}l++}else"}"===i?0===(l=Math.max(0,l-1))&&(o=e+1):";"===i&&0===l&&0===r&&(o=e+1)}return s}let s=(e,t)=>e.slice(0,t).split("\n").length,l=/^(?:\/build\/src\/)?([^\s:][^:\n]*):(\d+):(\d+): (fatal error|error|warning|note): (.*)$/,r=/^(?:\/build\/src\/)?([^\s:][^:\n]*):(\d+): (fatal error|error|warning|note): (.*)$/;e.s(["t",0,/^[A-Za-z_][\w-]{0,40}\.(ino|h|hpp|cpp|c)$/,"v",0,function(e){let t=new Set;for(let n of e)for(let e of i(n.text).matchAll(/^[ \t]*#[ \t]*include[ \t]*[<"]([^>"\n]+)[>"]/gm))t.add(e[1].trim());for(let i of e)for(let e of i.text.matchAll(/^[ \t]*#[ \t]*include[ \t]*"([^"\n]+)"/gm))t.add(e[1].trim());return t},"o",0,function(e){let t=[],i=[];for(let n of e){let e=n.replace(/^\[[\w-]+\] /,""),s=e.match(l)??e.match(r);if(s){let e=6===s.length,i=e?s[4]:s[3];t.push({file:s[1].replace(/^\/build\/(?:src\/)?/,""),line:Number(s[2]),col:e?Number(s[3]):1,severity:"fatal error"===i?"error":i,message:e?s[5]:s[4]});continue}let o=e.match(/undefined reference to [`'‘]([^'’]+)['’]/);if(o){t.push({file:"",line:0,col:0,severity:"error",message:`undefined reference to '${o[1]}' (declared but never defined, or a library that isn't available)`});continue}if(/region [`'‘]?text['’]? overflowed|section .* will not fit/.test(e)){t.push({file:"",line:0,col:0,severity:"error",message:"The program is too big for the ATmega328P's 32 KB of flash."});continue}e.trim()&&i.push(e)}return{diagnostics:t,rest:i}},"A",0,function(e,t){let l=e.filter(e=>e.name.endsWith(".ino"));if(!l.length)return null;l.sort((e,i)=>e.name===t?-1:i.name===t?1:e.name.localeCompare(i.name));let r=!1,o=["#include <Arduino.h>"],a=l.flatMap(e=>n(e.text).map(t=>({...t,file:e})));for(let e of l){let t=e.text;if(!r){let o=n(t);if(o.length||a.length){let n=i(l.map(e=>e.text).join("\n"));for(let e="";e!==n;)e=n,n=n.replace(/\{[^{}]*\}/g,"\x01");let d=[...new Set(a.filter(e=>!/=/.test(e.header.slice(e.header.indexOf("(")))).filter(e=>!RegExp(`\\b${e.name}\\s*\\([^(){};]*\\)\\s*(?:const\\s*)?;`).test(n)).map(e=>`${e.header};`))],h=o.length?o[0].start:t.length,u=s(t,h),c=t.lastIndexOf("\n",h-1)+1;d.length&&(t=`${t.slice(0,c)}${d.join("\n")}
#line ${u} "${e.name}"
${t.slice(c)}`),r=!0}}o.push(`#line 1 "${e.name}"`,t)}return o.join("\n")+"\n"}])},26384,e=>{e.q("/_next/static/media/worker.2ui1f6jehc74l.ts")},9033,10352,e=>{"use strict";function t(e,t,i){let n,s,l,r,o=(n=Math.max(0,e.vBattery-e.vDriverDrop),s=e.stallTorque/e.vNominal,l=e.stallTorque/e.noLoadSpeed,r=t.en*t.a*(1-t.b),r*(s*n-l*i)+t.en*t.b*(1-t.a)*(-s*n-l*i)+-l*i*(t.en*t.a*t.b));return Math.abs(i)>.05?o-Math.sign(i)*e.gearFriction:Math.abs(o)<=e.gearFriction?0:o-Math.sign(o)*e.gearFriction}function i(e,t){let i=e.points,n=e.closed?i.length:i.length-1,s={d:1/0,along:0},l=0,r=[];for(let e=0;e<n;e++){let t=i[e],n=i[(e+1)%i.length];r.push(Math.hypot(n.x-t.x,n.y-t.y)),l+=r[e]}let o=0;for(let e=0;e<n;e++){let n=function(e,t,i){let n=i.x-t.x,s=i.y-t.y,l=Math.max(0,Math.min(1,((e.x-t.x)*n+(e.y-t.y)*s)/(n*n+s*s||1e-12)));return{d:Math.hypot(e.x-(t.x+l*n),e.y-(t.y+l*s)),t:l}}(t,i[e],i[(e+1)%i.length]);n.d<s.d&&(s={d:n.d,along:(o+n.t*r[e])/l}),o+=r[e]}return s}e.s(["W",0,{mass:.55,inertia:.0021,wheelRadius:.033,track:.13,vBattery:7.4,vDriverDrop:1.4,vNominal:6,noLoadSpeed:400*Math.PI/60,stallTorque:.078,gearFriction:.008,rollingResistance:.8,turnResistance:.004,sensors:[{name:"L",ahead:.075,side:.022},{name:"C",ahead:.075,side:0},{name:"R",ahead:.075,side:-.022}]},"Z",0,i,"A",0,(e,t)=>i(e,t).d<=e.width/2,"K",0,function(e,t){let i=Math.cos(e.heading),n=Math.sin(e.heading);return{x:e.x+t.ahead*i-t.side*n,y:e.y+t.ahead*n+t.side*i}},"i",0,(e,t)=>({x:e.x,y:e.y,heading:t,v:0,w:0,wl:0,wr:0}),"S",0,function(e,i,n,s,l){let r=e.track/2,o=(i.v-i.w*r)/e.wheelRadius,a=(i.v+i.w*r)/e.wheelRadius,d=t(e,n,o)/e.wheelRadius,h=t(e,s,a)/e.wheelRadius,u=(d+h-e.rollingResistance*i.v)/e.mass,c=((h-d)*r-e.turnResistance*i.w)/e.inertia,p=i.v+u*l,g=i.w+c*l,f=i.heading+g*l;return{x:i.x+p*Math.cos(f)*l,y:i.y+p*Math.sin(f)*l,heading:f,v:p,w:g,wl:o,wr:a}}],9033),e.i(68129);var n=e.i(90918),s=e.i(54192),l=e.i(53249),r=e.i(5387),o=e.i(7534),a=e.i(81011);function d(e){return e<=7?["D",e]:e<=13?["B",e-8]:["C",e-14]}e.s(["f",0,class{cpu;ports;watched;high=new Map;windowStart=0;serial="";constructor(e,t){for(let i of(this.cpu=new r.f((0,a.a)(e)),new s.l(this.cpu,s.c),new s.l(this.cpu,s.K),new s.l(this.cpu,s.V),this.ports={B:new n.r(this.cpu,n.s),C:new n.r(this.cpu,n.S),D:new n.r(this.cpu,n.V)},new l.f(this.cpu,l.q,a.R).onByteTransmit=e=>{this.serial+=String.fromCharCode(e),this.serial.length>4e3&&(this.serial=this.serial.slice(-3e3))},this.watched=t,t))this.high.set(i,{on:!1,since:0,acc:0});for(let e of Object.values(this.ports))e.addListener(()=>this.onPins())}level(e){let[t,i]=d(e);return this.ports[t].pinState(i)===n.J.High}onPins(){let e=this.cpu.cycles;for(let t of this.watched){let i=this.high.get(t),n=this.level(t);n!==i.on&&(i.on&&(i.acc+=e-Math.max(i.since,this.windowStart)),i.on=n,i.since=e)}}setInput(e,t){let[i,n]=d(e);this.ports[i].setPin(n,t)}run(e){let t=this.cpu.cycles+e;for(;this.cpu.cycles<t;)(0,o.f)(this.cpu),this.cpu.tick()}duties(){let e=this.cpu.cycles,t=Math.max(1,e-this.windowStart),i={};for(let n of this.watched){let s=this.high.get(n),l=s.acc+(s.on?e-Math.max(s.since,this.windowStart):0);i[n]=Math.min(1,l/t),s.acc=0}return this.windowStart=e,i}get seconds(){return this.cpu.cycles/a.R}}],10352)},13446,e=>{"use strict";var t=e.i(81011),i=e.i(10352),n=e.i(9033),s=e.i(47419);e.s(["i",0,.06,"m",0,class{track;params;mcu;state;t;progress;offSeconds;longestOff;offRun;lastAlong;trail;last;constructor(e,t,l=n.W){this.track=t,this.params=l,this.t=0,this.progress=0,this.offSeconds=0,this.longestOff=0,this.offRun=0,this.trail=[],this.mcu=new i.f(e,[s.O.ena,s.O.in1,s.O.in2,s.O.enb,s.O.in3,s.O.in4]),this.state=(0,n.i)(t.start,t.heading),this.lastAlong=(0,n.Z)(t,t.start).along,this.last=this.frame({},0,0,!1)}sensors(){let e={};for(let t of this.params.sensors){let i=(0,n.A)(this.track,(0,n.K)(this.state,t));e[t.name]=i;let l=s.O.sensors[t.name];void 0!==l&&this.mcu.setInput(l,i)}return e}frame(e,t,i,n){return{t:this.t,state:this.state,sensors:e,laps:Math.floor(Math.max(0,this.progress)),along:this.progress,off:n,offSeconds:this.offSeconds,leftDuty:t,rightDuty:i}}run(e){let i=Math.max(1,Math.round(e/.002)),l=this.last;for(let e=0;e<i;e++){let i=this.sensors();this.mcu.run(Math.round(.002*t.R));let r=this.mcu.duties(),o={en:r[s.O.ena],a:r[s.O.in1],b:r[s.O.in2]},a={en:r[s.O.enb],a:r[s.O.in3],b:r[s.O.in4]};for(let e=0;e<4;e++)this.state=(0,n.S)(this.params,this.state,o,a,5e-4);this.t+=.002;let d=(0,n.Z)(this.track,this.state),h=d.along-this.lastAlong;h<-.5&&(h+=1),h>.5&&(h-=1),this.progress+=h,this.lastAlong=d.along;let u=d.d>.06;u?(this.offSeconds+=.002,this.offRun+=.002,this.longestOff=Math.max(this.longestOff,this.offRun)):this.offRun=0,e%10==0&&(this.trail.push({x:this.state.x,y:this.state.y}),this.trail.length>3e3&&this.trail.splice(0,500)),l=this.frame(i,o.en*(o.a-o.b),a.en*(a.a-a.b),u)}return this.last=l,l}},"z",0,function(e,t=60,i){for(;e.t<t&&e.progress<1;)e.run(.1),i?.(e);let n=e.progress>=1;return{passed:n&&e.longestOff<=.5,lapTime:n?Math.round(10*e.t)/10:null,longestOff:Math.round(100*e.longestOff)/100}}])},47419,e=>{"use strict";function t(e,t,i,n,s,l){let r=[];for(let o=0;o<=l;o++){let a=n+(s-n)*o/l;r.push({x:e+i*Math.cos(a),y:t+i*Math.sin(a)})}return r}let i=[{id:"oval",name:{en:"Oval",ar:"بيضاوي"},points:[{x:.4,y:.5},{x:1.2,y:.5},...t(1.2,.8,.3,-Math.PI/2,Math.PI/2,24).slice(1),{x:.4,y:1.1},...t(.4,.8,.3,Math.PI/2,3*Math.PI/2,24).slice(1,-1)],closed:!0,width:.019,start:{x:.6,y:.5},heading:0,size:{w:1.6,h:1.6}},{id:"rounded",name:{en:"Tight corners",ar:"زوايا ضيقة"},points:function(){let[e,i,n,s]=[.3,.3,1.7,1.3];return[...t(n-.15,i+.15,.15,-Math.PI/2,0,10),...t(n-.15,s-.15,.15,0,Math.PI/2,10),...t(e+.15,s-.15,.15,Math.PI/2,Math.PI,10),...t(e+.15,i+.15,.15,Math.PI,3*Math.PI/2,10)]}(),closed:!0,width:.019,start:{x:.8,y:.3},heading:0,size:{w:2,h:1.6}},{id:"wavy",name:{en:"S-bends",ar:"منحنيات S"},points:function(){let e=[];for(let t=0;t<120;t++){let i=t/120*2*Math.PI,n=.75+.08*Math.sin(3*i),s=.45+.06*Math.cos(5*i);e.push({x:1+n*Math.cos(i),y:.8+s*Math.sin(i)})}return e}(),closed:!0,width:.019,start:{x:1.75,y:.8},heading:Math.PI/2,size:{w:2,h:1.6}}],n=`// Line follower: L298N on D5/D7/D8 (left) and D6/D9/D10 (right).
// IR sensors: left D2, centre D3, right D4 — HIGH means "I see the black line".
const int ENA = 5, IN1 = 7, IN2 = 8;   // left motor
const int ENB = 6, IN3 = 9, IN4 = 10;  // right motor
const int SL = 2, SC = 3, SR = 4;      // sensors

void drive(int left, int right) {      // -255..255 each
  digitalWrite(IN1, left >= 0);  digitalWrite(IN2, left < 0);
  digitalWrite(IN3, right >= 0); digitalWrite(IN4, right < 0);
  analogWrite(ENA, abs(left));
  analogWrite(ENB, abs(right));
}

void setup() {
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  pinMode(SL, INPUT); pinMode(SC, INPUT); pinMode(SR, INPUT);
}

int lastSide = 0;                       // -1 = line was last on the left, 1 = right

void loop() {
  bool l = digitalRead(SL), c = digitalRead(SC), r = digitalRead(SR);
  if (l) lastSide = -1;
  if (r) lastSide = 1;
  if (c && !l && !r) drive(130, 130);    // on the line: straight
  else if (l) drive(20, 150);            // line to the left: turn left
  else if (r) drive(150, 20);            // line to the right: turn right
  else if (lastSide < 0) drive(-60, 140); // lost: spin back towards where it was
  else if (lastSide > 0) drive(140, -60);
  else drive(100, 100);
}
`;e.s(["O",0,{ena:5,in1:7,in2:8,enb:6,in3:9,in4:10,sensors:{L:2,C:3,R:4}},"l",0,n,"e",0,i,"D",0,e=>i.find(t=>t.id===e)??i[0]])},79243,e=>{e.q("/_next/static/media/worker.1csdwbwwsipdx.ts")},54933,e=>{e.q("/_next/static/media/worker.2jh4itabqft5i.ts")}]);