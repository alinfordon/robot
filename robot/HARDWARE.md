# ROBO_V1 — conectare hardware

Cablajul complet al robotului pe Raspberry Pi 5. Toate numerele de pin din cod sunt
**BCM** (numerotarea GPIO), nu poziția fizică pe conector. Tabelele de mai jos dau
ambele, ca să poți număra direct pe placă.

Sursa de adevăr rămâne [`config.py`](config.py) — dacă schimbi un fir, schimbă acolo
(sau în `.env`), nu doar în documentul ăsta.

---

## 1. Reguli de alimentare

Trei consumatori, trei alimentări separate, o singură masă:

| Consumator | Alimentare | Observații |
|---|---|---|
| Raspberry Pi 5 | sursă proprie 5V / 5A | nu alimenta Pi-ul din regulatorul L298N |
| Motoare (L298N) | acumulator 6–12V pe VMS | curentul motoarelor nu trece prin Pi |
| Servo pan & tilt (PCA9685 V+) | 5V / min. 2A separat (UBEC sau step-down) | **niciodată** din pinul 5V al Pi-ului |
| MAX98357 + difuzor | 5V (sau 3.3V) de pe Pi / rail comun | curent audio mic; GND comun obligatoriu |

Obligatoriu: **masa comună** între Pi, L298N, PCA9685 și sursa de servo. Fără GND comun,
semnalele PWM sunt flotante și servourile zvâcnesc aleator.

Recomandat: un condensator electrolitic de 470–1000 µF între V+ și GND, cât mai aproape
de PCA9685. Curentul de pornire al servourilor produce căderi de tensiune care pot
reseta placa.

---

## 2. Harta completă a pinilor

După adăugarea magistralei I2C, **toți cei 26 de GPIO** de pe conectorul de 40 de pini
sunt ocupați. Orice periferic nou trebuie legat fie pe cele 14 canale libere ale
PCA9685, fie pe I2C cu altă adresă.

| BCM | Pin fizic | Modul | Semnal |
|---|---|---|---|
| 2 | 3 | PCA9685 | SDA (I2C1) |
| 3 | 5 | PCA9685 | SCL (I2C1) |
| 4 | 7 | HC-SR04 spate | TRIG |
| 5 | 29 | HC-SR04 față | TRIG |
| 6 | 31 | HC-SR04 față | ECHO (prin divizor) |
| 7 | 26 | Display ST7789V | DC |
| 8 | 24 | Display ST7789V | CS (CE0) |
| 9 | 21 | Display ST7789V | SDO / MISO |
| 10 | 19 | Display ST7789V | SDI / MOSI |
| 11 | 23 | Display ST7789V | SCK |
| 12 | 32 | HC-SR04 stânga | ECHO (mutat; eliberează I2S LRCLK) |
| 13 | 33 | HC-SR04 stânga | TRIG |
| 14 | 8 | Display ST7789V | RESET |
| 15 | 10 | Display ST7789V | LED (backlight) |
| 16 | 36 | HC-SR04 dreapta | ECHO (mutat; eliberează I2S DIN) |
| 17 | 11 | L298N | IN1 (motor stânga) |
| 18 | 12 | MAX98357 | BCLK (I2S) — jumper pe ENA L298N |
| 19 | 35 | MAX98357 | LRC / LRCLK (I2S) |
| 20 | 38 | Encoder stânga | OUT |
| 21 | 40 | MAX98357 | DIN (I2S) |
| 22 | 15 | L298N | IN3 (motor dreapta) |
| 23 | 16 | L298N | IN4 (motor dreapta) |
| 24 | 18 | L298N | ENB (PWM dreapta) |
| 25 | 22 | HC-SR04 spate | ECHO (prin divizor) |
| 26 | 37 | HC-SR04 dreapta | TRIG |
| 27 | 13 | L298N | IN2 (motor stânga) |

Camera se leagă pe conectorul CSI (bandă flexibilă), nu pe GPIO.

**Atenție la GPIO14/GPIO15**: sunt implicit UART0 (TXD/RXD). Aici sunt folosite de
display, deci consola serială trebuie dezactivată (`raspi-config` → Interface Options →
Serial Port → login shell: No).

**MAX98357 vs pinii vechi**: I2S pe Pi e fix pe 18/19/21. Ca să le eliberăm:
ENA stânga → **jumper pe L298N** (fără fir PWM pe GPIO18); ECHO US stânga → GPIO12;
ECHO US dreapta → GPIO16; IR și encoder dreapta rămân dezactivate (`IR_ENABLED=0`,
`ENCODER_ACTIVE=left`).

---

## 3. PCA9685 — pan & tilt cameră

Modul PWM I2C cu 16 canale pe 12 biți, oscilator intern de 25 MHz. Robotul îl
programează direct în registre prin `smbus2` (vezi `actuators/pantilt.py`).

### 3.1 Legătura cu Raspberry Pi

| PCA9685 | Raspberry Pi | Pin fizic |
|---|---|---|
| VCC (logică) | 3.3V | 1 |
| GND | GND | 6 |
| SDA | GPIO2 | 3 |
| SCL | GPIO3 | 5 |
| OE | neconectat | — |

`VCC` alimentează doar logica plăcii și se ia din Pi. `OE` (output enable, activ pe
LOW) e tras la masă pe majoritatea plăcilor, deci ieșirile sunt active implicit.

### 3.2 Alimentarea servourilor

Borna cu șurub `V+` / `GND` de pe PCA9685 alimentează **exclusiv** servourile și se
leagă la sursa separată de 5V. Nu uni V+ cu pinul de 5V al Pi-ului.

```
        sursă 5V / 2A ────┬──── V+  (bornă șurub PCA9685)
                          │
                       [470µF]
                          │
        GND sursă ────────┴──── GND (bornă șurub) ──── GND Raspberry Pi
```

### 3.3 Canalele servo

Fiecare canal are trei pini, în ordinea `PWM` / `V+` / `GND` dinspre marginea plăcii.
Servourile SG90/MG90S au firele: **portocaliu = PWM**, **roșu = V+**, **maro = GND**.

| Canal | Axă | Mișcare | Config |
|---|---|---|---|
| 0 | Pan | rotire stânga–dreapta (baza) | `PANTILT_PAN_CHANNEL` |
| 1 | Tilt | înclinare sus–jos (camera) | `PANTILT_TILT_CHANNEL` |

Convenție în cod: unghiul de pan **crește spre dreapta**, tiltul **crește în sus**. Dacă
pe teren e invers, nu reface cablajul — pune `PANTILT_PAN_INVERT=1` sau
`PANTILT_TILT_INVERT=1` în `.env`.

### 3.4 Adresa I2C

Implicit `0x40`, cu toate punțile A0–A5 nelipite. Fiecare punte lipită adaugă bitul
corespunzător (A0 → `0x41`, A1 → `0x42` etc.), util dacă mai adaugi o placă pe aceeași
magistrală. Suprascrii cu `PCA9685_ADDRESS=0x41`.

### 3.5 Montaj mecanic

Lasă banda CSI a camerei cu joc suficient pe ambele axe și fixeaz-o de brațul de tilt,
nu de șasiu — altfel se întinde la capăt de cursă și se rupe conectorul. Verifică manual
cursa liberă înainte de a alimenta servourile, apoi îngustează limitele
`PANTILT_*_MIN_DEG` / `MAX_DEG` până când nimic nu se lovește.

---

## 4. L298N — motoare

| L298N | Raspberry Pi (BCM) | Pin fizic |
|---|---|---|
| IN1 | GPIO17 | 11 |
| IN2 | GPIO27 | 13 |
| ENA | GPIO18 | 12 |
| IN3 | GPIO22 | 15 |
| IN4 | GPIO23 | 16 |
| ENB | GPIO24 | 18 |
| GND | GND | 6 / 9 / 14 … |

Motorul stânga pe OUT1/OUT2, dreapta pe OUT3/OUT4. **Jumperele ENA/ENB trebuie scoase**,
altfel pinii de PWM nu au efect și motoarele merg doar la turație maximă. PWM la 1 kHz
(`MOTOR_PWM_FREQ`).

Acumulatorul se leagă pe VMS/GND. Dacă folosești regulatorul de 5V de pe modul, ține
tensiunea de intrare sub 12V și lasă jumperul de 5V pus.

---

## 5. Encodere OKY3278

Senzori optici cu furcă, ieșire digitală, câte unul per roată.

| Encoder | Semnal | BCM | Pin fizic |
|---|---|---|---|
| Stânga | OUT | GPIO20 | 38 |
| Dreapta | OUT | GPIO16 | 36 |

Alimentare 3.3V și GND de la Pi. Discul are 20 de fante (`ENCODER_PPR=20`), diametrul
roții 6.5 cm (`ENCODER_WHEEL_DIAMETER_CM`). Codul numără fronturile căzătoare
(`ENCODER_EDGE=falling`); dacă modulul tău are ieșirea inversată, treci pe `rising`.

---

## 6. HC-SR04 × 4

Senzorii lucrează la 5V, iar **ECHO scoate 5V — care ar distruge intrarea de 3.3V a
Pi-ului**. Fiecare ECHO trece printr-un divizor rezistiv:

```
   ECHO (5V) ───[ 1kΩ ]───┬─── GPIO (3.3V)
                          │
                       [ 2kΩ ]
                          │
                         GND
```

5V × 2k / (1k + 2k) = 3.33V. TRIG se leagă direct, e intrare pe senzor.

| Poziție | TRIG (BCM/fizic) | ECHO (BCM/fizic) |
|---|---|---|
| Față centru | GPIO5 / 29 | GPIO6 / 31 |
| Lateral stânga | GPIO13 / 33 | GPIO19 / 35 |
| Lateral dreapta | GPIO26 / 37 | GPIO21 / 40 |
| Spate centru | GPIO4 / 7 | GPIO25 / 22 |

VCC pe 5V, GND comun. Dacă montezi doar o parte din senzori, listează-i în
`US_ACTIVE=front,left` ca robotul să nu aștepte ecouri inexistente.

---

## 7. Display TFT 2.8" ST7789V (SPI0)

| Display | Fir | BCM | Pin fizic |
|---|---|---|---|
| VCC | roșu | 3.3V | 1 |
| GND | negru | GND | 6 |
| CS | galben | GPIO8 | 24 |
| RESET | portocaliu | GPIO14 | 8 |
| DC | verde | GPIO7 | 26 |
| SDI / MOSI | albastru | GPIO10 | 19 |
| SCK | violet | GPIO11 | 23 |
| LED | alb | GPIO15 | 10 |
| SDO / MISO | gri | GPIO9 | 21 |

SPI la 40 MHz, mod 3, rezoluție 240×320. GPIO7 (CE1) e folosit ca DC, de aceea SPI se
activează cu `dtoverlay=spi0-1cs`, nu cu `dtparam=spi=on` — altfel kernelul rezervă CE1
și DC dă „Device busy".

---

## 8. MAX98357 — DAC I2S + difuzor

Amplificator mono I2S (fără I2C). Kernel: `dtoverlay=max98357a,no-sdmode` (adăugat de
`setup/03_audio.sh`). Piper TTS redă prin `aplay -D plughw:N,0`.

### 8.1 Cablaj

| MAX98357 | Raspberry Pi | Pin fizic | Observații |
|---|---|---|---|
| VIN / VDD | 5V sau 3.3V | 2 sau 1 | multe module acceptă 2.5–5.5V; preferă 5V dacă difuzorul e 4Ω |
| GND | GND | 6 | masă comună cu Pi |
| BCLK | GPIO18 | 12 | **scoate** firul ENA de pe L298N; pune **jumper pe ENA** |
| LRC / LRCLK | GPIO19 | 35 | mută ECHO HC-SR04 stânga pe GPIO12 |
| DIN | GPIO21 | 40 | mută ECHO HC-SR04 dreapta pe GPIO16 |
| GAIN | neconectat / conform modul | — | floating ≈ 9 dB pe multe plăci |
| SD / SD_MODE | neconectat | — | `no-sdmode` ține DAC-ul activ |

Difuzorul se leagă pe bornele **+ / −** ale modulului (nu pe Pi).

### 8.2 Activare software

```bash
cd /home/robot/setup
AUDIO_OUTPUT=i2s bash 03_audio.sh
sudo reboot
aplay -l                    # trebuie să apară MAX98357 / hifiberry
venv/bin/python test_audio.py
venv/bin/python test_audio.py --tts "Salut"
```

Microfonul rămâne pe USB (dacă există); doar redarea trece pe I2S.

---

## 9. Emițător IR OKY3273

Dezactivat implicit (`IR_ENABLED=0`) cât timp GPIO12 e folosit de ECHO-ul US stânga
pentru MAX98357. Dacă renunți la US stânga, poți muta din nou IR pe GPIO12.

---

## 10. Activare magistrale și verificare

I2C, SPI și I2S (MAX98357) se activează din setup:

```bash
cd /home/robot/setup
bash 05_gpio.sh
AUDIO_OUTPUT=i2s bash 03_audio.sh
sudo reboot
```

Scriptul GPIO adaugă `dtparam=i2c_arm=on` și `dtoverlay=spi0-1cs`. Audio adaugă
`dtoverlay=max98357a,no-sdmode`. După repornire:

```bash
i2cdetect -y 1        # PCA9685 trebuie să apară la 0x40
ls /dev/spidev*       # display: spidev0.0
aplay -l              # MAX98357 / hifiberry
```

Dacă `0x40` nu apare: verifică VCC pe 3.3V, SDA/SCL să nu fie inversate și masa comună.
Plăcile PCA9685 au deja rezistențe de pull-up, nu trebuie adăugate.

---

## 11. Teste pe hardware

Rulează-le cu serviciul oprit, altfel pinii sunt deja rezervați de robot:

```bash
sudo systemctl stop robot
cd /home/robot

venv/bin/python test_pantilt.py     # pan & tilt: cursă, limite, sens
venv/bin/python test_motors.py      # fiecare motor separat
venv/bin/python test_encoders.py    # impulsuri pe roată
venv/bin/python test_us_front.py    # HC-SR04 față
venv/bin/python test_display.py     # ST7789V
venv/bin/python test_audio.py       # MAX98357 ton + optional TTS

sudo systemctl start robot
```

Fiecare script afișează la final cum se interpretează rezultatul (fir greșit, canal
inversat, alimentare insuficientă).

---

## 12. Calibrare pan & tilt

Toate se pun în `.env`, fără modificări de cod:

| Variabilă | Implicit | Când o schimbi |
|---|---|---|
| `PANTILT_PULSE_MIN_US` / `MAX_US` | 500 / 2500 | cursa e prea mică sau servo bate în capăt |
| `PANTILT_PAN_MIN_DEG` / `MAX_DEG` | 10 / 170 | camera atinge șasiul lateral |
| `PANTILT_TILT_MIN_DEG` / `MAX_DEG` | 45 / 135 | camera atinge în sus sau în jos |
| `PANTILT_PAN_INVERT` / `TILT_INVERT` | 0 | axa se mișcă în oglindă |
| `PANTILT_STEP_DEG` | 10 | pasul butoanelor din dashboard |
| `PANTILT_SPEED_DEG_PER_SEC` | 120 | mișcarea e prea bruscă sau prea lentă |
| `PANTILT_IDLE_RELEASE_SEC` | 1.0 | servo zumzăie în repaus (0 = PWM permanent) |
| `PANTILT_ENABLED` | 1 | pui `0` dacă nu ai montat capul |

Ordinea corectă de calibrare: întâi limitele mecanice (să nu forțeze), apoi lățimea
impulsului (cursa reală), la final sensul și viteza.
