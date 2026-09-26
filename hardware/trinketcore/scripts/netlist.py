"""TrinketCore circuit definition -- the single source of truth.

TrinketCore is CapCore's supercapacitor power chain (USB-C charger, cut-off,
soft power switch, wake-up clock, 3.3 V buck-boost) plus everything a small
gadget needs on one board: an RP2040 with 16 MB of flash, display connectors,
an I2S speaker amplifier, charge LEDs, buttons, and pads for two capacitors.

Every other script (symbols, schematic, PCB, BOMs) is generated from the parts
and nets below, so the schematic and the board cannot drift apart.

Net names worth knowing:
  VBUS      5 V from USB-C
  VCAP      the capacitors (BT1 and BT2 in parallel); only the charger and Q1 touch it
  VAON      "always on" rail behind the master switch Q1 (supervisor, RTC, wake logic)
  VSYS      switched rail, on only while the gadget runs
  3V3       regulated 3.3 V for the RP2040, flash, display and amplifier
  1V1       RP2040 core supply from its internal regulator
"""

from dataclasses import dataclass, field


@dataclass
class Part:
    ref: str
    symbol: str            # "Lib:Name" in TrinketCore.kicad_sym
    value: str
    footprint: str
    pins: dict             # pin number -> net name ("NC" = no connect)
    mfr: str = ""          # manufacturer
    mpn: str = ""          # manufacturer part number (what PCBWay buys)
    desc: str = ""
    lcsc: str = ""         # LCSC number, for JLCPCB or as a sourcing hint
    assembled: bool = True  # False for parts you fit yourself (capacitors, headers)
    edlc: dict = field(default_factory=dict)  # overrides for the EDLC build variant


R0402 = "Resistor_SMD:R_0402_1005Metric"
C0402 = "Capacitor_SMD:C_0402_1005Metric"
C0603 = "Capacitor_SMD:C_0603_1608Metric"
C0805 = "Capacitor_SMD:C_0805_2012Metric"
LED0603 = "LED_SMD:LED_0603_1608Metric"
SOT23 = "Package_TO_SOT_SMD:SOT-23"
SOD323 = "Diode_SMD:D_SOD-323"

# Yageo RC0402FR-07xxxL codes for the resistor values used here.
_YAGEO = {"27": "27R", "100": "100R", "1k": "1K", "4.7k": "4K7", "5.1k": "5K1", "10k": "10K",
          "33k": "33K", "75k": "75K", "100k": "100K", "120k": "120K", "330k": "330K",
          "470k": "470K", "1M": "1M", "10M": "10M"}
_RES_LCSC = {"1k": "C11702", "4.7k": "C25900", "5.1k": "C25905", "10k": "C25744", "33k": "C25779",
             "75k": "C25798", "100k": "C25741", "120k": "C25750", "330k": "C25778",
             "470k": "C25790", "1M": "C26083", "10M": "C26082"}
# Samsung MLCCs: (value, footprint) -> (MPN, LCSC)
_CAPS = {
    ("15pF", C0402): ("CL05C150JB5NNNC", "C1548"),
    ("10nF", C0402): ("CL05B103KB5NNNC", "C15195"),
    ("100nF", C0402): ("CL05B104KO5NNNC", "C1525"),
    ("1uF", C0402): ("CL05A105KA5NQNC", "C52923"),
    ("4.7uF", C0603): ("CL10A475KO8NNNC", "C19666"),
    ("10uF", C0603): ("CL10A106KP8NNNC", "C19702"),
    ("4.7uF", C0805): ("CL21A475KAQNNNE", "C1779"),
    ("10uF", C0805): ("CL21A106KAYNNNE", "C15850"),
}


def R(ref, value, a, b, desc="", **kw):
    ohms = value.replace("R", "") if value.endswith("R") else value
    part = Part(ref, "TrinketCore:R", value, R0402, {"1": a, "2": b}, "Yageo",
                f"RC0402FR-07{_YAGEO[ohms]}L", desc, _RES_LCSC.get(ohms, ""), **kw)
    return part


def C(ref, value, a, b, fp=C0402, desc="", **kw):
    mpn, lcsc = _CAPS[(value, fp)]
    return Part(ref, "TrinketCore:C", value, fp, {"1": a, "2": b}, "Samsung Electro-Mechanics",
                mpn, desc, lcsc, **kw)


def NFET(ref, g, s, d, desc):
    return Part(ref, "TrinketCore:AO3400A", "AO3400A", SOT23, {"1": g, "2": s, "3": d},
                "Alpha & Omega Semiconductor", "AO3400A", desc, "C20917")


def PFET(ref, g, s, d, desc):
    return Part(ref, "TrinketCore:AO3401A", "AO3401A", SOT23, {"1": g, "2": s, "3": d},
                "Alpha & Omega Semiconductor", "AO3401A", desc, "C15127")


def DIODE(ref, anode, cathode, desc):
    return Part(ref, "TrinketCore:1N4148WS", "1N4148WS", SOD323, {"1": cathode, "2": anode},
                "Diodes Incorporated", "1N4148WS-7-F", desc, "C2128")


def LED(ref, colour, anode, cathode, mpn, desc):
    return Part(ref, "TrinketCore:LED", colour, LED0603, {"1": cathode, "2": anode},
                "Lite-On", mpn, desc)


def CAPACITOR(ref):
    return Part(ref, "TrinketCore:Supercap", "LIC 3.8V", "TrinketCore:Supercap_Pads",
                {"1": "VCAP", "2": "GND"},
                desc="your lithium-ion capacitor; lies flat on the back (not assembled)",
                assembled=False, edlc={"value": "EDLC 2.7V"})


def HEADER(ref, n, value, pins, socket, desc):
    fp = (f"Connector_PinSocket_2.54mm:PinSocket_1x{n:02d}_P2.54mm_Vertical" if socket else
          f"Connector_PinHeader_2.54mm:PinHeader_1x{n:02d}_P2.54mm_Vertical")
    return Part(ref, f"TrinketCore:Conn_01x{n:02d}", value, fp,
                {str(i + 1): net for i, net in enumerate(pins)}, desc=desc, assembled=False)


# RP2040 pin -> net. GPIO use is listed in the README pinout table. The order follows
# where each signal goes on the board, so the tracks leave the chip without crossing:
# the bottom-row pins that head left come first, J6 takes GP7..GP0 top to bottom.
RP2040_PINS = {
    "1": "3V3", "2": "GP0", "3": "GP1", "4": "GP2", "5": "GP3", "6": "GP4", "7": "GP5",
    "8": "GP6", "9": "GP7", "10": "3V3", "11": "TFT_CS", "12": "TFT_DC", "13": "TFT_SCK",
    "14": "TFT_MOSI", "15": "TFT_RST", "16": "TFT_BLG", "17": "BTN_B", "18": "SHIP",
    "19": "GND", "20": "XIN", "21": "XOUT", "22": "3V3", "23": "1V1", "24": "SWCLK",
    "25": "SWDIO", "26": "RUN", "27": "SDA", "28": "SCL", "29": "I2S_DIN", "30": "I2S_BCLK",
    "31": "I2S_LRCLK", "32": "AMP_EN", "33": "3V3", "34": "CHG", "35": "BTN", "36": "USB_DET",
    "37": "USER_LED", "38": "HOLD", "39": "VSENSE", "40": "GP28", "41": "GP29", "42": "3V3",
    "43": "3V3", "44": "3V3", "45": "1V1", "46": "USB_DM", "47": "USB_DP", "48": "3V3",
    "49": "3V3", "50": "1V1", "51": "QSPI_SD3", "52": "QSPI_SCLK", "53": "QSPI_SD0",
    "54": "QSPI_SD2", "55": "QSPI_SD1", "56": "QSPI_SS", "57": "GND",
}

PARTS = [
    # ---------------------------------------------------------------- USB-C
    Part("J1", "TrinketCore:USB_C_Receptacle_USB2.0_16P", "USB-C",
         "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12",
         {"A1": "GND", "A12": "GND", "B1": "GND", "B12": "GND",
          "A4": "VBUS", "A9": "VBUS", "B4": "VBUS", "B9": "VBUS",
          "A5": "CC1", "B5": "CC2", "A6": "DP", "B6": "DP", "A7": "DM", "B7": "DM",
          "A8": "NC", "B8": "NC", "S1": "GND"},
         "Korean Hroparts Elec", "TYPE-C-31-M-12", "USB-C receptacle, USB 2.0, 16 pin", "C165948"),
    R("R1", "5.1k", "CC1", "GND", "CC1 sink pull-down"),
    R("R2", "5.1k", "CC2", "GND", "CC2 sink pull-down"),
    Part("U1", "TrinketCore:USBLC6-2SC6", "USBLC6-2SC6", "Package_TO_SOT_SMD:SOT-23-6",
         {"1": "DP", "2": "GND", "3": "DM", "4": "DM", "5": "VBUS", "6": "DP"},
         "STMicroelectronics", "USBLC6-2SC6", "USB ESD protection", "C7519"),
    R("R32", "27", "DP", "USB_DP", "USB D+ series resistor"),
    R("R33", "27", "DM", "USB_DM", "USB D- series resistor"),

    # ------------------------------------------------------------- charger
    Part("U2", "TrinketCore:BQ25173DSG", "BQ25173DSGR",
         "TrinketCore:WSON-8-1EP_2x2mm_P0.5mm_EP0.9x1.6mm_Vias0.3",
         {"1": "VBUS", "2": "ISET", "3": "GND", "4": "GND", "5": "STAT",
          "6": "PG_N", "7": "FB", "8": "VCAP", "9": "GND"},
         "Texas Instruments", "BQ25173DSGR", "800 mA linear supercapacitor charger", "C2942216"),
    C("C1", "4.7uF", "VBUS", "GND", C0805, "charger input"),
    R("R3", "1k", "ISET", "GND", "charge current = 300 V / R3 = 300 mA"),
    R("R4", "120k", "VCAP", "FB", "charge voltage = 0.8 V x (1 + R4/R5) = 3.71 V",
      edlc={"value": "75k", "mpn": "RC0402FR-0775KL", "lcsc": "C25798",
            "desc": "charge voltage = 0.8 V x (1 + R4/R5) = 2.62 V"}),
    R("R5", "33k", "FB", "PG_N",
      "returned to /PG so the divider cannot drain the capacitor without USB"),
    C("C2", "10uF", "VCAP", "GND", C0603, "charger output"),
    R("R6", "1k", "VBUS", "LED_A", "charging LED current"),
    LED("D1", "RED", "LED_A", "STAT", "LTST-C191KRKT", "CHG: on while charging"),
    DIODE("D4", "CHG", "STAT", "lets the RP2040 read the charge status without back-feeding"),
    R("R30", "1k", "VBUS", "LED_GA", "full LED current"),
    LED("D5", "GREEN", "LED_GA", "LED_GK", "LTST-C191KGKT", "FULL: on when charged (USB plugged in)"),
    NFET("Q9", "STAT", "GND", "LED_GK", "lights FULL when the charger releases STAT"),
    DIODE("D6", "USB_DET", "PG_N", "lets the RP2040 see USB power (reads low when plugged in)"),

    # ------------------------------------------------------ energy storage
    CAPACITOR("BT1"),
    CAPACITOR("BT2"),

    # ------------------------------------------- master switch + supervisor
    PFET("Q1", "QA_G", "VCAP", "VAON", "master switch: opens below 2.6 V or in ship mode"),
    R("R7", "10M", "VCAP", "QA_G", "Q1 off by default"),
    NFET("Q2", "VBUS_G", "GND", "QA_G", "USB power turns Q1 on (wakes from cut-off)"),
    R("R8", "10k", "VBUS", "VBUS_G"),
    R("R9", "100k", "VBUS_G", "GND"),
    NFET("Q3", "UVLO_OK", "GND", "QA_G", "keeps Q1 on while the capacitor is healthy"),
    Part("U3", "TrinketCore:TPS3808G01DBV", "TPS3808G01DBVR", "Package_TO_SOT_SMD:SOT-23-6",
         {"1": "UVLO_OK", "2": "GND", "3": "MR_N", "4": "VAON", "5": "SENSE", "6": "VAON"},
         "Texas Instruments", "TPS3808G01DBVR", "under-voltage supervisor, 0.405 V SENSE threshold",
         "C19653"),
    C("C5", "100nF", "VAON", "GND", desc="U3 supply"),
    C("C6", "1uF", "VAON", "GND", desc="VAON bulk"),
    R("R10", "1M", "VAON", "UV_A", "UVLO divider top (1/3)"),
    R("R11", "470k", "UV_A", "UV_B", "UVLO divider top (2/3)"),
    R("R12", "330k", "UV_B", "SENSE", "UVLO divider top (3/3)"),
    R("R13", "330k", "SENSE", "GND", "cut-off = 0.405 V x (1 + 1.8M/R13) = 2.61 V",
      edlc={"value": "470k", "mpn": "RC0402FR-07470KL", "lcsc": "C25790",
            "desc": "cut-off = 0.405 V x (1 + 1.8M/R13) = 1.96 V"}),
    C("C3", "10nF", "SENSE", "GND", desc="ignores millisecond dips from load steps"),
    R("R14", "1M", "VAON", "UVLO_OK", "RESET pull-up"),
    NFET("Q4", "SHIP", "GND", "MR_N", "SHIP high forces a cut-off (storage mode)"),
    R("R15", "1M", "SHIP", "GND", "SHIP idles low"),

    # --------------------------------------------------- load switch + wake
    PFET("Q5", "Q5_G", "VAON", "VSYS", "load switch with soft start"),
    R("R16", "1M", "VAON", "Q5_G", "Q5 off by default"),
    C("C7", "10nF", "VAON", "Q5_G", desc="soft start"),
    R("R17", "100k", "Q5_G", "Q6_D", "soft start"),
    NFET("Q6", "EN_SYS", "Q6_S", "Q6_D", "turns the gadget on"),
    NFET("Q8", "UVLO_OK", "GND", "Q6_S",
         "in series with Q6: nothing turns the gadget on below the cut-off, not even USB"),
    R("R18", "1M", "EN_SYS", "GND", "hold-up discharge"),
    C("C8", "4.7uF", "EN_SYS", "GND", C0603,
      desc="keeps power on ~4-6 s after a button press so firmware can raise HOLD"),
    R("R20", "100k", "HOLD", "EN_SYS", "firmware keeps power on"),
    PFET("Q7", "WAKE_N", "VAON", "WAKE_D", "button / RTC alarm turns the gadget on"),
    R("R21", "10k", "WAKE_D", "EN_SYS"),
    DIODE("D2", "VBUS", "USBON_K", "USB power turns the gadget on"),
    R("R22", "10k", "USBON_K", "USBON_J"),
    Part("JP1", "TrinketCore:SolderJumper_2_Bridged", "USB-ON",
         "Jumper:SolderJumper-2_P1.3mm_Bridged_RoundedPad1.0x1.5mm",
         {"1": "USBON_J", "2": "EN_SYS"}, desc="cut to stop USB from turning the gadget on",
         assembled=False),
    Part("JP2", "TrinketCore:SolderJumper_2_Open", "ALWAYS-ON",
         "Jumper:SolderJumper-2_P1.3mm_Open_RoundedPad1.0x1.5mm",
         {"1": "VAON", "2": "AON_J"}, desc="bridge for always-on (no power button)",
         assembled=False),
    R("R23", "100k", "AON_J", "EN_SYS"),
    R("R24", "1M", "VAON", "WAKE_N", "WAKE idles high"),
    Part("SW1", "TrinketCore:SW_Push_Dual", "POWER/A", "TrinketCore:SW_TS-1187A_5.1x5.1mm",
         {"1": "WAKE_N", "2": "NC", "3": "NC", "4": "GND"},
         "XKB Connectivity", "TS-1187A-B-A-B",
         "power / wake button, also readable as BTN; diagonal pads 1+4", "C318884"),
    R("R25", "1k", "WAKE", "WAKE_N", "external wake input (lid, tilt or reed switch to GND)"),
    DIODE("D3", "BTN", "WAKE_N", "lets the RP2040 read the power button"),

    # --------------------------------------------------- 3.3 V buck-boost
    Part("U4", "TrinketCore:TPS63031DSK", "TPS63031DSKR",
         "TrinketCore:WSON-10-1EP_2.5x2.5mm_P0.5mm_EP1.2x2mm_Vias0.3",
         {"1": "3V3", "2": "LX2", "3": "GND", "4": "LX1", "5": "VSYS", "6": "VSYS",
          "7": "GND", "8": "VSYS", "9": "GND", "10": "3V3", "11": "GND"},
         "Texas Instruments", "TPS63031DSKR", "3.3 V buck-boost, 1.8-5.5 V in", "C15516"),
    Part("L1", "TrinketCore:L", "1.5uH", "TrinketCore:L_3015_Universal", {"1": "LX1", "2": "LX2"},
         "Taiyo Yuden", "NR3015T1R5N", "1.5 uH, 3 x 3 mm shielded, Isat >= 1.5 A", "C7497056"),
    C("C9", "10uF", "VSYS", "GND", C0805, desc="regulator input"),
    C("C10", "100nF", "VSYS", "GND", desc="VINA bypass"),
    C("C11", "10uF", "3V3", "GND", C0805, desc="regulator output"),
    C("C12", "10uF", "3V3", "GND", C0805, desc="regulator output"),
    C("C13", "100nF", "3V3", "GND", desc="output HF bypass"),
    R("R26", "100k", "VSYS", "VSENSE", "capacitor voltage / 2"),
    R("R27", "100k", "VSENSE", "GND", "capacitor voltage / 2"),
    C("C14", "100nF", "VSENSE", "GND", desc="ADC sample charge"),

    # ------------------------------------------------------------ RTC
    Part("U5", "TrinketCore:PCF8563T", "PCF8563T", "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm",
         {"1": "OSCI", "2": "OSCO", "3": "WAKE_N", "4": "GND", "5": "SDA", "6": "SCL",
          "7": "NC", "8": "VAON"},
         "NXP", "PCF8563T/5,518", "real-time clock; its alarm wakes the gadget", "C7440"),
    Part("Y1", "TrinketCore:Crystal", "32.768kHz", "Crystal:Crystal_SMD_3215-2Pin_3.2x1.5mm",
         {"1": "OSCI", "2": "OSCO"}, "Epson", "Q13FC1350000400", "32.768 kHz, 12.5 pF, 20 ppm",
         "C32346"),
    C("C15", "100nF", "VAON", "GND", desc="RTC supply"),
    R("R28", "4.7k", "3V3", "SDA", "I2C pull-up"),
    R("R29", "4.7k", "3V3", "SCL", "I2C pull-up"),

    # ------------------------------------------------------------ RP2040
    Part("U6", "TrinketCore:RP2040", "RP2040",
         "TrinketCore:QFN-56-1EP_7x7mm_P0.4mm_EP3.2x3.2mm_Vias0.3", RP2040_PINS,
         "Raspberry Pi", "RP2040", "dual Cortex-M0+ microcontroller", "C2040"),
    Part("U7", "TrinketCore:W25Q128JVS", "W25Q128JVS", "Package_SO:SOIC-8_5.23x5.23mm_P1.27mm",
         {"1": "QSPI_SS", "2": "QSPI_SD1", "3": "QSPI_SD2", "4": "GND", "5": "QSPI_SD0",
          "6": "QSPI_SCLK", "7": "QSPI_SD3", "8": "3V3"},
         "Winbond", "W25Q128JVSIQ", "16 MB QSPI flash (program, sounds, images)", "C97521"),
    Part("Y2", "TrinketCore:Crystal_GND24", "12MHz", "Crystal:Crystal_SMD_3225-4Pin_3.2x2.5mm",
         {"1": "XIN", "2": "GND", "3": "XO", "4": "GND"},
         "Abracon", "ABM8-272-T3", "12 MHz, 10 pF (the RP2040 reference crystal)"),
    R("R31", "1k", "XOUT", "XO", "crystal drive limit"),
    C("C16", "15pF", "XIN", "GND", desc="crystal load"),
    C("C17", "15pF", "XO", "GND", desc="crystal load"),
    R("R34", "1k", "QSPI_SS", "BOOT_N", "BOOT button"),
    Part("SW3", "TrinketCore:SW_Push", "BOOT", "Button_Switch_SMD:SW_SPST_B3U-1000P",
         {"1": "BOOT_N", "2": "GND"}, "Omron", "B3U-1000P",
         "hold while pressing RESET for the USB bootloader"),
    R("R35", "10k", "3V3", "RUN", "RUN pull-up"),
    Part("SW4", "TrinketCore:SW_Push", "RESET", "Button_Switch_SMD:SW_SPST_B3U-1000P",
         {"1": "RUN", "2": "GND"}, "Omron", "B3U-1000P", "reset (also forces power-off after ~5 s)"),
    C("C18", "100nF", "3V3", "GND", desc="IOVDD pin 1"),
    C("C19", "100nF", "3V3", "GND", desc="IOVDD pin 10"),
    C("C20", "100nF", "3V3", "GND", desc="IOVDD pin 22"),
    C("C21", "100nF", "3V3", "GND", desc="IOVDD pin 33"),
    C("C22", "100nF", "3V3", "GND", desc="IOVDD pin 42"),
    C("C23", "100nF", "3V3", "GND", desc="IOVDD pin 49"),
    C("C24", "100nF", "3V3", "GND", desc="USB_VDD"),
    C("C25", "100nF", "3V3", "GND", desc="ADC_AVDD"),
    C("C26", "1uF", "3V3", "GND", desc="VREG_IN"),
    C("C27", "1uF", "1V1", "GND", desc="VREG_VOUT"),
    C("C28", "100nF", "1V1", "GND", desc="DVDD pin 23"),
    C("C29", "100nF", "1V1", "GND", desc="DVDD pin 50"),
    C("C30", "10uF", "3V3", "GND", C0805, desc="3V3 bulk at the RP2040"),
    C("C31", "100nF", "3V3", "GND", desc="flash supply"),
    Part("TP1", "TrinketCore:TestPoint", "SWCLK", "TestPoint:TestPoint_Pad_D1.0mm",
         {"1": "SWCLK"}, desc="SWD debug clock", assembled=False),
    Part("TP2", "TrinketCore:TestPoint", "SWDIO", "TestPoint:TestPoint_Pad_D1.0mm",
         {"1": "SWDIO"}, desc="SWD debug data", assembled=False),

    # --------------------------------------------------------- user I/O
    Part("SW2", "TrinketCore:SW_Push_Dual", "B", "TrinketCore:SW_TS-1187A_5.1x5.1mm",
         {"1": "BTN_B", "2": "NC", "3": "NC", "4": "GND"},
         "XKB Connectivity", "TS-1187A-B-A-B", "second button (GP14)", "C318884"),
    R("R37", "100", "USER_LED", "ULED_A", "user LED current"),
    LED("D7", "BLUE", "ULED_A", "GND", "LTST-C191TBKT", "user LED (GP25, like a Pico)"),

    # ------------------------------------------------------------ audio
    Part("U8", "TrinketCore:MAX98357A", "MAX98357A",
         "TrinketCore:TQFN-16-1EP_3x3mm_P0.5mm_EP1.23x1.23mm_Vias0.3",
         {"1": "I2S_DIN", "2": "NC", "3": "GND", "4": "AMP_SD", "5": "NC", "6": "NC",
          "7": "3V3", "8": "3V3", "9": "SPK_P", "10": "SPK_N", "11": "GND", "12": "NC",
          "13": "NC", "14": "I2S_LRCLK", "15": "GND", "16": "I2S_BCLK", "17": "GND"},
         "Analog Devices", "MAX98357AETE+T", "I2S class-D speaker amplifier, 9 dB gain"),
    R("R36", "1M", "AMP_EN", "AMP_SD", "AMP_EN high = on, (L+R)/2 mix; low = shut down"),
    C("C32", "10uF", "3V3", "GND", C0805, desc="amplifier supply"),
    C("C33", "100nF", "3V3", "GND", desc="amplifier supply"),
    Part("J7", "TrinketCore:Conn_01x02", "SPEAKER",
         "Connector_JST:JST_PH_B2B-PH-K_1x02_P2.00mm_Vertical",
         {"1": "SPK_P", "2": "SPK_N"}, "JST", "B2B-PH-K-S(LF)(SN)",
         "speaker, 8 ohm (JST PH 2.0 mm, or solder the wires)", assembled=False),

    # ------------------------------------------------------- connectors
    R("R38", "100", "TFT_BLG", "TFT_BL", "backlight drive (PWM on GP13)"),
    HEADER("J4", 8, "DISPLAY",
           ["GND", "3V3", "TFT_SCK", "TFT_MOSI", "TFT_RST", "TFT_DC", "TFT_CS", "TFT_BL"],
           True, "SPI TFT/OLED module socket: GND VCC SCL SDA RES DC CS BLK"),
    HEADER("J5", 4, "I2C OLED", ["GND", "3V3", "SCL", "SDA"], True,
           "I2C OLED module socket: GND VCC SCL SDA"),
    HEADER("J6", 14, "EXPANSION",
           ["GP7", "GP6", "GP5", "GP4", "GP3", "GP2", "GP1", "GP0", "GP29", "GP28", "WAKE",
            "VSYS", "3V3", "GND"], False, "expansion header: LEDs, buttons, sensors, lid switch"),
    Part("J8", "TrinketCore:Conn_01x04", "QWIIC",
         "Connector_JST:JST_SH_SM04B-SRSS-TB_1x04-1MP_P1.00mm_Horizontal",
         {"1": "GND", "2": "3V3", "3": "SDA", "4": "SCL"}, "JST", "SM04B-SRSS-TB(LF)(SN)",
         "Qwiic / STEMMA QT I2C connector"),
]

# Nets that are pure power rails get PWR_FLAGs in the schematic.
POWER_FLAGS = ["VBUS", "GND", "VCAP", "VAON", "VSYS", "3V3", "1V1"]
POWER_NETS = {"GND", "VBUS", "VCAP", "VAON", "VSYS", "3V3", "1V1"}


def parts_by_ref():
    return {p.ref: p for p in PARTS}


def nets():
    """net name -> list of (ref, pin)."""
    out = {}
    for p in PARTS:
        for pin, net in p.pins.items():
            if net == "NC":
                continue
            out.setdefault(net, []).append((p.ref, pin))
    return out


def variant(part, name):
    """Return (value, mpn, lcsc, desc) for the 'lic' or 'edlc' build."""
    o = part.edlc if name == "edlc" else {}
    return (o.get("value", part.value), o.get("mpn", part.mpn),
            o.get("lcsc", part.lcsc), o.get("desc", part.desc))


if __name__ == "__main__":
    refs = [p.ref for p in PARTS]
    assert len(refs) == len(set(refs)), "duplicate reference"
    for net, conns in sorted(nets().items()):
        print(f"{net:10} {' '.join(r + '.' + p for r, p in conns)}")
    singles = [n for n, c in nets().items() if len(c) < 2]
    print("single-connection nets:", singles)
    print(len(PARTS), "parts,", sum(len(p.pins) for p in PARTS), "pins")
