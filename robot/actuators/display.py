"""RobotDisplay - TFT 2.8" ST7789V 240x320 pe Raspberry Pi 5.

Controleaza ecranul robotului Ody_V1. Tot codul ruleaza in try/except si nu
opreste niciodata robotul daca display-ul lipseste sau libraria nu e instalata.
"""

import random
import threading
import time

import config
from utils.logger import get_logger

logger = get_logger("Display")


def _cfg(name: str, default):
    """Citeste o valoare din config cu fallback (TFT poate lipsi din config)."""
    return getattr(config, name, default)


# Pinii / parametrii TFT (BCM), cu fallback la valorile cerute
TFT_CS = _cfg("TFT_CS", 8)
TFT_DC = _cfg("TFT_DC", 7)
TFT_RST = _cfg("TFT_RST", 14)
TFT_BL = _cfg("TFT_BL", 15)
TFT_WIDTH = _cfg("TFT_WIDTH", 240)
TFT_HEIGHT = _cfg("TFT_HEIGHT", 320)
TFT_SPI_SPEED = _cfg("TFT_SPI_SPEED", 40_000_000)
# Pentru 240x320 (ne-patrat) st7789 accepta DOAR 0 sau 180
TFT_ROTATION = _cfg("TFT_ROTATION", 0)
# Index hardware CE pentru spidev (NU pinul GPIO!): 0=CE0/GPIO8, 1=CE1/GPIO7
TFT_SPI_CS = _cfg("TFT_SPI_CS", 0)
# Panou ST7789V generic 240x320: SPI mode 3 (None = lasa default-ul librariei)
TFT_SPI_MODE = _cfg("TFT_SPI_MODE", 3)
# MADCTL pentru portret real 240x320 (libraria hardcodeaza 0x70 = patrat 240x240)
TFT_MADCTL = _cfg("TFT_MADCTL", 0x00)
# Panou BGR: schimba ordinea R<->B la afisare (rosu/albastru inversate)
TFT_BGR = _cfg("TFT_BGR", True)
# Inversare luminozitate (INVON). Multe panouri IPS au nevoie de True
TFT_INVERT = _cfg("TFT_INVERT", True)


# Detectie dependente, fara a opri robotul daca lipsesc
HAS_DISPLAY = False
try:
    if not config.MOCK_HARDWARE:
        import st7789  # noqa: F401
        from PIL import Image, ImageDraw, ImageFont

        HAS_DISPLAY = True
    else:
        from PIL import Image, ImageDraw, ImageFont  # render fara hardware
except ImportError as e:
    logger.warning(f"Display indisponibil (lipsa librarie): {e}")
    HAS_DISPLAY = False


class RobotDisplay:
    # --- Paleta Ody_V1 ---
    BLACK = (0, 0, 0)
    GREEN = (0, 229, 160)
    BLUE = (0, 170, 255)
    RED = (239, 68, 68)
    YELLOW = (245, 158, 11)
    WHITE = (226, 232, 240)
    GRAY = (71, 85, 105)
    DARK = (17, 20, 24)
    PURPLE = (127, 119, 221)

    # Fundaluri secundare de zona
    PANEL = (10, 14, 18)
    BAR_BG = (30, 41, 59)

    W = 240
    H = 320

    def __init__(self):
        self._lock = threading.Lock()
        self.current_screen = None
        self.disp = None
        self.img = None
        self.draw = None
        self._auto_thread = None
        self._auto_running = False
        self._alert_timer = None
        self._last_state = None

        try:
            from PIL import Image, ImageDraw, ImageFont
        except ImportError:
            logger.warning("Pillow indisponibil, display dezactivat")
            return

        # Hardware (doar daca nu suntem in mock si libraria exista)
        if HAS_DISPLAY:
            try:
                import st7789

                self.disp = st7789.ST7789(
                    port=0,
                    cs=TFT_SPI_CS,
                    dc=TFT_DC,
                    rst=TFT_RST,
                    backlight=TFT_BL,
                    width=TFT_WIDTH,
                    height=TFT_HEIGHT,
                    rotation=TFT_ROTATION,
                    spi_speed_hz=TFT_SPI_SPEED,
                    invert=TFT_INVERT,
                )
                # Panou ST7789V generic: necesita SPI mode 3 + re-init
                if TFT_SPI_MODE is not None:
                    self.disp._spi.mode = TFT_SPI_MODE
                    self.disp.reset()
                    self.disp._init()
                # Libraria st7789 hardcodeaza MADCTL=0x70 (MV=1 -> orientare patrata
                # 240x240). Suprascriem pentru portret real 240x320, altfel imaginea
                # iese patrata si informatiile se suprapun.
                if TFT_MADCTL is not None:
                    self.disp.command(0x36)  # MADCTL
                    self.disp.data(TFT_MADCTL)
                logger.info("Display ST7789V initializat")
            except Exception as e:
                logger.warning(f"Init ST7789 esuat: {e}")
                self.disp = None

        # Buffer de desenare
        self.img = Image.new("RGB", (self.W, self.H), self.BLACK)
        self.draw = ImageDraw.Draw(self.img)

        self.font_large = self._load_font(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28
        )
        self.font_medium = self._load_font(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18
        )
        self.font_small = self._load_font(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14
        )
        self.font_mono = self._load_font(
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 13
        )

    # ----------------------------------------------------------------- fonts
    def _load_font(self, path: str, size: int):
        try:
            from PIL import ImageFont

            return ImageFont.truetype(path, size)
        except Exception:
            try:
                from PIL import ImageFont

                return ImageFont.load_default()
            except Exception:
                return None

    # ------------------------------------------------------------- low level
    def _flush(self):
        """Trimite buffer-ul catre ecran (sau ignora in mock)."""
        try:
            if self.disp is not None and self.img is not None:
                img = self.img
                if TFT_BGR:
                    from PIL import Image

                    r, g, b = img.split()
                    img = Image.merge("RGB", (b, g, r))
                self.disp.display(img)
        except Exception as e:
            logger.warning(f"Flush display esuat: {e}")

    def _text_size(self, text: str, font):
        """Latime/inaltime text, robust pe versiuni PIL diferite."""
        try:
            l, t, r, b = self.draw.textbbox((0, 0), text, font=font)
            return r - l, b - t
        except Exception:
            try:
                return self.draw.textsize(text, font=font)
            except Exception:
                return (len(text) * 7, 12)

    def _text_centered(self, y: int, text: str, font, color, cx: int = None):
        cx = self.W // 2 if cx is None else cx
        w, _ = self._text_size(text, font)
        self.draw.text((cx - w // 2, y), text, font=font, fill=color)

    # --------------------------------------------------------------- helpers
    def _clear(self):
        self.draw.rectangle((0, 0, self.W, self.H), fill=self.BLACK)

    def _draw_separator(self, y: int, color=None):
        color = color or self.GREEN
        self.draw.line((0, y, self.W, y), fill=color, width=1)

    def _draw_bar(self, x, y, width, height, percent, color):
        percent = max(0, min(100, percent))
        self.draw.rectangle((x, y, x + width, y + height), fill=self.BAR_BG)
        fill_w = int(width * percent / 100)
        if fill_w > 0:
            self.draw.rectangle((x, y, x + fill_w, y + height), fill=color)

    def _wrap_text(self, text: str, chars_per_line: int):
        words = (text or "").split()
        lines = []
        cur = ""
        for w in words:
            if len(cur) + len(w) + (1 if cur else 0) <= chars_per_line:
                cur = f"{cur} {w}".strip()
            else:
                if cur:
                    lines.append(cur)
                cur = w
                while len(cur) > chars_per_line:
                    lines.append(cur[:chars_per_line])
                    cur = cur[chars_per_line:]
        if cur:
            lines.append(cur)
        return lines

    def _draw_face(self, x: int, y: int, mood: str):
        """Fata robot simplificata desenata cu PIL."""
        # Antena
        self.draw.line((x + 16, y, x + 16, y - 6), fill=self.GREEN, width=1)
        self.draw.ellipse((x + 13, y - 9, x + 19, y - 3), fill=self.GREEN)
        # Cap
        self.draw.rounded_rectangle(
            (x, y, x + 36, y + 28), radius=6, outline=self.GREEN, width=1
        )
        # Ochi (rosii doar pe alerta)
        eye_color = self.RED if mood == "alert" else self.GREEN
        self.draw.ellipse((x + 5, y + 9, x + 15, y + 19), fill=eye_color)
        self.draw.ellipse((x + 17, y + 9, x + 27, y + 19), fill=eye_color)
        # Gura
        if mood in ("happy", "talking"):
            mouth = self.GREEN
        elif mood == "thinking":
            mouth = self.YELLOW
        elif mood == "alert":
            mouth = self.RED
        else:
            mouth = self.GRAY
        self.draw.rounded_rectangle(
            (x + 9, y + 22, x + 27, y + 26), radius=2, fill=mouth
        )

    # ----------------------------------------------------------------- zones
    def _draw_header(self, state: dict):
        mood = str(state.get("mood", "idle"))
        ws_connected = bool(state.get("ws_connected", False))

        self.draw.rectangle((0, 0, self.W, 52), fill=self.DARK)
        self._draw_face(8, 10, mood)

        self.draw.text((54, 10), "ODY_V1", font=self.font_medium, fill=self.WHITE)

        mood_map = {
            "idle": ("\u2b24 STANDBY", self.GRAY),
            "thinking": ("\u2b24 GANDESC", self.PURPLE),
            "talking": ("\u2b24 VORBESC", self.GREEN),
            "listening": ("\u2b24 ASCULT", self.BLUE),
            "moving": ("\u2b24 MERG", self.GREEN),
            "alert": ("\u2b24 ALERTA", self.RED),
        }
        label, color = mood_map.get(mood, ("\u2b24 STANDBY", self.GRAY))
        self.draw.text((54, 32), label, font=self.font_small, fill=color)

        # Indicator WS dreapta sus
        ws_color = self.GREEN if ws_connected else self.RED
        self.draw.ellipse((self.W - 40, 12, self.W - 32, 20), fill=ws_color)
        self.draw.text(
            (self.W - 28, 10), "PC", font=self.font_small, fill=self.WHITE
        )

        # Semnal WiFi dreapta jos (rand 2)
        self._draw_wifi(state)

    def _draw_wifi(self, state: dict):
        wifi = state.get("wifi") or {}
        connected = bool(wifi.get("connected"))
        pct = int(wifi.get("percent", 0) or 0)

        baseline = 46
        x0 = self.W - 33
        bar_w, gap = 4, 3
        heights = (6, 10, 14, 18)

        if connected:
            active = 1 + min(3, pct // 25)
            color = self.GREEN if pct >= 60 else self.YELLOW if pct >= 30 else self.RED
        else:
            active = 0
            color = self.GRAY

        for i, h in enumerate(heights):
            x = x0 + i * (bar_w + gap)
            top = baseline - h
            fill = color if i < active else self.DARK
            self.draw.rectangle((x, top, x + bar_w, baseline), fill=fill, outline=color)

        txt = f"{pct}%" if connected else "LAN"
        tcol = color if connected else self.GRAY
        w, _ = self._text_size(txt, self.font_small)
        self.draw.text((x0 - w - 5, 34), txt, font=self.font_small, fill=tcol)

    def _draw_footer(self, state: dict):
        ip = str(state.get("ip", "—"))
        mode = str(state.get("mode", "manual"))
        uptime = str(state.get("uptime", "00:00:00"))
        ai_provider = str(state.get("ai_provider", "ollama"))

        self.draw.rectangle((0, 246, self.W, self.H), fill=self.PANEL)
        self._draw_separator(246, self.GREEN)

        ai_color = {
            "ollama": self.GREEN,
            "anthropic": self.BLUE,
            "google": self.YELLOW,
        }.get(ai_provider, self.WHITE)

        # Stanga sus: IP
        self.draw.text((8, 254), "IP", font=self.font_small, fill=self.GRAY)
        self.draw.text((34, 254), ip, font=self.font_mono, fill=self.WHITE)
        # Dreapta sus: AI
        self.draw.text((128, 254), "AI", font=self.font_small, fill=self.GRAY)
        self.draw.text(
            (154, 254), ai_provider, font=self.font_small, fill=ai_color
        )
        # Stanga jos: MOD
        self.draw.text((8, 286), "MOD", font=self.font_small, fill=self.GRAY)
        self.draw.text((44, 286), mode, font=self.font_small, fill=self.WHITE)
        # Dreapta jos: UP
        self.draw.text((128, 286), "UP", font=self.font_small, fill=self.GRAY)
        self.draw.text((154, 286), uptime, font=self.font_mono, fill=self.WHITE)

    def _draw_radar(self, sensors: dict):
        self.draw.rectangle((0, 52, self.W, 160), fill=self.PANEL)
        self.draw.text((8, 56), "SENZORI", font=self.font_small, fill=self.GRAY)

        cx, cy = 120, 113
        ring = (28, 38, 48)
        for r in (15, 30, 44):
            self.draw.ellipse(
                (cx - r, cy - r, cx + r, cy + r), outline=ring, width=1
            )
        # Robot in centru
        self.draw.rectangle((cx - 6, cy - 5, cx + 6, cy + 5), fill=self.GRAY)

        def dist_color(d):
            if d < 20:
                return self.RED
            if d <= 50:
                return self.YELLOW
            return self.GREEN

        def beam(direction, dist_cm):
            try:
                dist_cm = float(dist_cm)
            except (TypeError, ValueError):
                dist_cm = 150.0
            dpx = min(44, int(dist_cm / 150 * 44))
            col = dist_color(dist_cm)
            if direction == "front":
                ex, ey = cx, cy - dpx
                lx, ly = cx + 50, cy - 40
            elif direction == "back":
                ex, ey = cx, cy + dpx
                lx, ly = cx + 50, cy + 34
            elif direction == "left":
                ex, ey = cx - dpx, cy
                lx, ly = 6, cy - 6
            else:  # right
                ex, ey = cx + dpx, cy
                lx, ly = self.W - 60, cy - 6
            self.draw.line((cx, cy, ex, ey), fill=col, width=2)
            self.draw.ellipse((ex - 3, ey - 3, ex + 3, ey + 3), fill=col)
            short = {"front": "F", "back": "B", "left": "L", "right": "R"}[direction]
            self.draw.text(
                (lx, ly), f"{short}:{int(dist_cm)}cm", font=self.font_small, fill=self.WHITE
            )

        sensors = sensors or {}
        beam("front", sensors.get("front", 150))
        beam("back", sensors.get("back", 150))
        beam("left", sensors.get("left", 150))
        beam("right", sensors.get("right", 150))

    def _draw_metrics(self, state: dict):
        self.draw.rectangle((0, 160, self.W, 246), fill=self.DARK)
        self.draw.text((8, 166), "SISTEM", font=self.font_small, fill=self.GRAY)

        cpu = float(state.get("cpu", 0))
        ram = float(state.get("ram", 0))
        temp = float(state.get("temp", 0))
        battery = float(state.get("battery", 0))

        bx, bw, bh = 44, 148, 10
        rows_y = [186, 200, 214, 228]

        # CPU
        self.draw.text((8, rows_y[0] - 2), "CPU", font=self.font_small, fill=self.GRAY)
        self._draw_bar(bx, rows_y[0], bw, bh, cpu, self.BLUE)
        self.draw.text(
            (bx + bw + 4, rows_y[0] - 2), f"{int(cpu)}%", font=self.font_small, fill=self.WHITE
        )

        # RAM
        self.draw.text((8, rows_y[1] - 2), "RAM", font=self.font_small, fill=self.GRAY)
        self._draw_bar(bx, rows_y[1], bw, bh, ram, self.PURPLE)
        self.draw.text(
            (bx + bw + 4, rows_y[1] - 2), f"{int(ram)}%", font=self.font_small, fill=self.WHITE
        )

        # TEMP
        if temp < 60:
            temp_col = self.GREEN
        elif temp <= 75:
            temp_col = self.YELLOW
        else:
            temp_col = self.RED
        self.draw.text((8, rows_y[2] - 2), "TEMP", font=self.font_small, fill=self.GRAY)
        self._draw_bar(bx, rows_y[2], bw, bh, min(100, temp), temp_col)
        self.draw.text(
            (bx + bw + 4, rows_y[2] - 2), f"{int(temp)}\u00b0C", font=self.font_small, fill=self.WHITE
        )

        # BAT
        if battery > 50:
            bat_col = self.GREEN
        elif battery >= 20:
            bat_col = self.YELLOW
        else:
            bat_col = self.RED
        self.draw.text((8, rows_y[3] - 2), "BAT", font=self.font_small, fill=self.GRAY)
        self._draw_bar(bx, rows_y[3], bw, bh, battery, bat_col)
        self.draw.text(
            (bx + bw + 4, rows_y[3] - 2), f"{int(battery)}%", font=self.font_small, fill=self.WHITE
        )

    # ----------------------------------------------------------------- boot
    def show_boot(self):
        if self.draw is None:
            return
        with self._lock:
            self.current_screen = "boot"
            try:
                self._clear()
                self._text_centered(110, "ODY_V1", self.font_large, self.GREEN)
                w, _ = self._text_size("ODY_V1", self.font_large)
                cx = self.W // 2
                self.draw.line(
                    (cx - w // 2, 144, cx + w // 2, 144), fill=self.GREEN, width=1
                )
                self._text_centered(152, "Robot AI \u00b7 RPi 5", self.font_small, self.GRAY)
                self._text_centered(176, "Pornire sisteme...", self.font_small, self.GRAY)
                self._draw_boot_bar(0)
                self._flush()
            except Exception as e:
                logger.warning(f"show_boot esuat: {e}")

    def _draw_boot_bar(self, percent: int):
        percent = max(0, min(100, percent))
        bx, by, bw, bh = 40, 210, 160, 12
        self.draw.rectangle((bx, by, bx + bw, by + bh), outline=self.GRAY, width=1)
        fill_w = int(bw * percent / 100)
        if fill_w > 0:
            self.draw.rectangle((bx, by, bx + fill_w, by + bh), fill=self.GREEN)

    def update_boot_progress(self, percent: int):
        if self.draw is None:
            return
        with self._lock:
            try:
                self.draw.rectangle((36, 206, 206, 226), fill=self.BLACK)
                self._draw_boot_bar(percent)
                self._flush()
            except Exception as e:
                logger.warning(f"update_boot_progress esuat: {e}")

    # --------------------------------------------------------------- status
    def show_status(self, state: dict):
        if self.draw is None:
            return
        with self._lock:
            self.current_screen = "status"
            self._last_state = state
            try:
                self._clear()
                self._draw_header(state)
                self._draw_radar(state.get("sensors", {}))
                self._draw_metrics(state)
                self._draw_footer(state)
                self._flush()
            except Exception as e:
                logger.warning(f"show_status esuat: {e}")

    # --------------------------------------------------------------- speech
    def show_speech(self, text: str, is_listening: bool):
        if self.draw is None:
            return
        with self._lock:
            self.current_screen = "speech"
            state = self._last_state or {}
            try:
                self._draw_header(state)
                self.draw.rectangle((0, 52, self.W, 246), fill=self.PANEL)
                cx, cy = self.W // 2, 130

                if is_listening:
                    self.draw.ellipse(
                        (cx - 38, cy - 38, cx + 38, cy + 38), outline=self.RED, width=2
                    )
                    self.draw.ellipse(
                        (cx - 40, cy - 40, cx + 40, cy + 40), outline=self.RED, width=2
                    )
                    # Microfon simplificat
                    self.draw.rounded_rectangle(
                        (cx - 6, cy - 16, cx + 6, cy + 6), radius=6, fill=self.WHITE
                    )
                    self.draw.line((cx, cy + 6, cx, cy + 16), fill=self.WHITE, width=2)
                    self.draw.line((cx - 8, cy + 16, cx + 8, cy + 16), fill=self.WHITE, width=2)
                    self._text_centered(180, "ASCULT...", self.font_medium, self.RED)
                else:
                    # Bare audio animate
                    base_x = cx - 40
                    for i in range(5):
                        h = random.randint(10, 50)
                        x0 = base_x + i * 18
                        self.draw.rectangle(
                            (x0, cy - h // 2, x0 + 10, cy + h // 2), fill=self.GREEN
                        )
                    self._text_centered(160, "VORBESC", self.font_medium, self.GREEN)
                    lines = self._wrap_text((text or "")[:80], 22)
                    ty = 190
                    for line in lines[:3]:
                        self._text_centered(ty, line, self.font_small, self.WHITE)
                        ty += 16

                self._draw_footer(state)
                self._flush()
            except Exception as e:
                logger.warning(f"show_speech esuat: {e}")

    # ------------------------------------------------------------ ai think
    def show_ai_thinking(self, provider: str):
        if self.draw is None:
            return
        with self._lock:
            self.current_screen = "thinking"
            state = self._last_state or {}
            try:
                self._draw_header(state)
                self.draw.rectangle((0, 52, self.W, 246), fill=self.PANEL)
                cx = self.W // 2
                for i, dx in enumerate((-24, 0, 24)):
                    x = cx + dx
                    self.draw.ellipse((x - 8, 142, x + 8, 158), fill=self.PURPLE)
                self._text_centered(190, "PROCESEZ...", self.font_medium, self.PURPLE)
                self._text_centered(215, str(provider), self.font_small, self.GRAY)
                self._draw_footer(state)
                self._flush()
            except Exception as e:
                logger.warning(f"show_ai_thinking esuat: {e}")

    # ---------------------------------------------------------------- alert
    def show_alert(self, message: str, distance_cm: float):
        if self.draw is None:
            return
        with self._lock:
            self.current_screen = "alert"
            try:
                self.draw.rectangle((0, 0, self.W, self.H), fill=self.RED)
                self._text_centered(80, "\u26a0 OBSTACOL", self.font_large, self.WHITE)
                dist_txt = f"{distance_cm:.0f}cm"
                w, h = self._text_size(dist_txt, self.font_large)
                cx = self.W // 2
                self.draw.rectangle(
                    (cx - w // 2 - 8, 140, cx + w // 2 + 8, 140 + h + 8), fill=self.WHITE
                )
                self.draw.text((cx - w // 2, 144), dist_txt, font=self.font_large, fill=self.RED)
                self._text_centered(200, str(message), self.font_medium, self.WHITE)
                self._text_centered(240, "OPRESC", self.font_medium, self.WHITE)
                self._flush()
            except Exception as e:
                logger.warning(f"show_alert esuat: {e}")

        # Auto-revenire la status dupa 2s
        try:
            if self._alert_timer:
                self._alert_timer.cancel()
            self._alert_timer = threading.Timer(2.0, self._restore_status)
            self._alert_timer.daemon = True
            self._alert_timer.start()
        except Exception:
            pass

    def _restore_status(self):
        if self._last_state:
            self.show_status(self._last_state)

    # -------------------------------------------------------------- objects
    def show_objects(self, objects: list, frame_base64: str = None):
        if self.draw is None:
            return
        with self._lock:
            self.current_screen = "objects"
            state = self._last_state or {}
            try:
                self._draw_header(state)
                self.draw.rectangle((0, 52, self.W, self.H), fill=self.PANEL)
                self.draw.text((8, 58), "OBIECTE", font=self.font_small, fill=self.GRAY)

                y = 80
                for obj in (objects or [])[:6]:
                    label = str(obj.get("label", "?"))
                    conf = float(obj.get("confidence", obj.get("conf", 0)) or 0)
                    if conf <= 1:
                        conf *= 100
                    self.draw.text((8, y), label[:14], font=self.font_small, fill=self.WHITE)
                    self._draw_bar(110, y + 2, 90, 8, conf, self.GREEN)
                    self.draw.text(
                        (204, y), f"{int(conf)}", font=self.font_small, fill=self.GRAY
                    )
                    y += 22

                if frame_base64:
                    self._draw_thumbnail(frame_base64)

                self._flush()
            except Exception as e:
                logger.warning(f"show_objects esuat: {e}")

    def _draw_thumbnail(self, frame_base64: str):
        try:
            import base64
            import io

            from PIL import Image

            raw = base64.b64decode(frame_base64.split(",")[-1])
            thumb = Image.open(io.BytesIO(raw)).convert("RGB").resize((80, 60))
            self.img.paste(thumb, (self.W - 88, self.H - 68))
        except Exception as e:
            logger.warning(f"Thumbnail esuat: {e}")

    # ------------------------------------------------------------ ip / qr
    def show_ip_qr(self, ip: str):
        if self.draw is None:
            return
        with self._lock:
            self.current_screen = "ip"
            try:
                self._clear()
                self._text_centered(90, str(ip), self.font_large, self.WHITE)
                self._text_centered(
                    150, "Conecteaza-te la dashboard:", self.font_small, self.GRAY
                )
                self._text_centered(
                    180, f"http://{ip}:3000", self.font_medium, self.GREEN
                )
                self._flush()
            except Exception as e:
                logger.warning(f"show_ip_qr esuat: {e}")

    # ----------------------------------------------------------- threading
    def update(self, screen_data: dict):
        """Thread-safe: redeseneaza ecranul de status."""
        self.show_status(screen_data)

    def start_auto_update(self, get_state_func, interval: float = 0.5):
        if self.draw is None:
            return
        self._auto_running = True

        def _loop():
            while self._auto_running:
                try:
                    state = get_state_func()
                    if state:
                        self.show_status(state)
                except Exception as e:
                    logger.warning(f"Auto-update esuat: {e}")
                time.sleep(interval)

        self._auto_thread = threading.Thread(target=_loop, daemon=True)
        self._auto_thread.start()
        logger.info("Auto-update display pornit")

    def stop(self):
        self._auto_running = False
        try:
            if self._alert_timer:
                self._alert_timer.cancel()
        except Exception:
            pass
        if self._auto_thread:
            self._auto_thread.join(timeout=1.0)
