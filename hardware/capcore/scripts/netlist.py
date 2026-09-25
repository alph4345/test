"""CapCore circuit definition -- the single source of truth.

Every other script (symbol library, schematic, PCB, BOM) is generated from
the parts and nets below, so the schematic and the board cannot drift apart.

Net names in UPPER_CASE are the ones worth knowing:
  VBUS      5 V from USB-C (or the VBUS header pin)
  VCAP      the supercapacitor itself; only the charger and Q1 touch it
  VAON      "always on" rail behind the master switch Q1 (supervisor, RTC, wake logic)
  VSYS      switched rail feeding the 3.3 V regulator (on only while the gadget runs)
  3V3       regulated output for your microcontroller and peripherals
"""

from dataclasses import dataclass, field


@dataclass
class Part:
    ref: str
    symbol: str            # "Lib:Name" in CapCore.kicad_sym
    value: str
    footprint: str
    pins: dict             # pin number -> net name ("NC" = no connect)
    lcsc: str = ""
    mpn: str = ""
    desc: str = ""
    in_bom: bool = True    # False for parts the user supplies (headers, the capacitor)
    edlc: dict = field(default_factory=dict)  # overrides for the EDLC build variant


R0402 = "Resistor_SMD:R_0402_1005Metric"
C0402 = "Capacitor_SMD:C_0402_1005Metric"
C0603 = "Capacitor_SMD:C_0603_1608Metric"
C0805 = "Capacitor_SMD:C_0805_2012Metric"
SOT23 = "Package_TO_SOT_SMD:SOT-23"
SOD323 = "Diode_SMD:D_SOD-323"


def R(ref, value, a, b, lcsc, mpn, desc="", **kw):
    return Part(ref, "CapCore:R", value, R0402, {"1": a, "2": b}, lcsc, mpn, desc, **kw)


def C(ref, value, a, b, lcsc, mpn, fp=C0402, desc="", **kw):
    return Part(ref, "CapCore:C", value, fp, {"1": a, "2": b}, lcsc, mpn, desc, **kw)


def NFET(ref, g, s, d, desc):
    return Part(ref, "CapCore:AO3400A", "AO3400A", SOT23, {"1": g, "2": s, "3": d},
                "C20917", "AO3400A", desc)


def PFET(ref, g, s, d, desc):
    return Part(ref, "CapCore:AO3401A", "AO3401A", SOT23, {"1": g, "2": s, "3": d},
                "C15127", "AO3401A", desc)


def DIODE(ref, anode, cathode, desc):
    return Part(ref, "CapCore:1N4148WS", "1N4148WS", SOD323, {"1": cathode, "2": anode},
                "C2128", "1N4148WS", desc)


PARTS = [
    # ---------------------------------------------------------------- USB-C
    Part("J1", "CapCore:USB_C_Receptacle_USB2.0_16P", "USB-C",
         "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12",
         {"A1": "GND", "A12": "GND", "B1": "GND", "B12": "GND",
          "A4": "VBUS", "A9": "VBUS", "B4": "VBUS", "B9": "VBUS",
          "A5": "CC1", "B5": "CC2", "A6": "DP", "B6": "DP", "A7": "DM", "B7": "DM",
          "A8": "NC", "B8": "NC", "S1": "GND"},
         "C165948", "TYPE-C-31-M-12", "USB-C receptacle, USB 2.0, 16 pin"),
    R("R1", "5.1k", "CC1", "GND", "C25905", "0402WGF5101TCE", "CC1 sink pull-down"),
    R("R2", "5.1k", "CC2", "GND", "C25905", "0402WGF5101TCE", "CC2 sink pull-down"),
    Part("U1", "CapCore:USBLC6-2SC6", "USBLC6-2SC6", "Package_TO_SOT_SMD:SOT-23-6",
         {"1": "DP", "2": "GND", "3": "DM", "4": "DM", "5": "VBUS", "6": "DP"},
         "C7519", "USBLC6-2SC6", "USB ESD protection"),

    # ------------------------------------------------------------- charger
    Part("U2", "CapCore:BQ25173DSG", "BQ25173DSGR",
         "CapCore:WSON-8-1EP_2x2mm_P0.5mm_EP0.9x1.6mm_Vias0.3",
         {"1": "VBUS", "2": "ISET", "3": "GND", "4": "GND", "5": "STAT",
          "6": "PG_N", "7": "FB", "8": "VCAP", "9": "GND"},
         "C2942216", "BQ25173DSGR", "800 mA linear supercapacitor charger"),
    C("C1", "4.7uF", "VBUS", "GND", "C1779", "CL21A475KAQNNNE", C0805, "charger input"),
    R("R3", "1k", "ISET", "GND", "C11702", "0402WGF1001TCE",
      "charge current = 300 V / R3 = 300 mA"),
    R("R4", "120k", "VCAP", "FB", "C25750", "0402WGF1203TCE",
      "charge voltage = 0.8 V x (1 + R4/R5) = 3.71 V",
      edlc={"value": "75k", "lcsc": "C25798", "mpn": "0402WGF7502TCE",
            "desc": "charge voltage = 0.8 V x (1 + R4/R5) = 2.62 V"}),
    R("R5", "33k", "FB", "PG_N", "C25779", "0402WGF3302TCE",
      "returned to /PG so the divider cannot drain the capacitor without USB"),
    C("C2", "10uF", "VCAP", "GND", "C19702", "CL10A106KP8NNNC", C0603, "charger output"),
    R("R6", "1k", "VBUS", "LED_A", "C11702", "0402WGF1001TCE", "charge LED current"),
    Part("D1", "CapCore:LED", "RED", "LED_SMD:LED_0603_1608Metric",
         {"1": "STAT", "2": "LED_A"}, "C2286", "KT-0603R", "on while charging, off when full"),
    DIODE("D4", "CHG", "STAT", "lets the MCU read the charge status without back-feeding"),

    # ------------------------------------------------------ energy storage
    Part("BT1", "CapCore:Supercap", "LIC 3.8V", "CapCore:Supercap_Pads",
         {"1": "VCAP", "2": "GND"}, desc="your lithium-ion capacitor (not assembled)",
         in_bom=False, edlc={"value": "EDLC 2.7V"}),

    # ------------------------------------------- master switch + supervisor
    PFET("Q1", "QA_G", "VCAP", "VAON", "master switch: opens below 2.6 V or in ship mode"),
    R("R7", "10M", "VCAP", "QA_G", "C26082", "0402WGF1005TCE", "Q1 off by default"),
    NFET("Q2", "VBUS_G", "GND", "QA_G", "USB power turns Q1 on (wakes from cut-off)"),
    R("R8", "10k", "VBUS", "VBUS_G", "C25744", "0402WGF1002TCE", ""),
    R("R9", "100k", "VBUS_G", "GND", "C25741", "0402WGF1003TCE", ""),
    NFET("Q3", "UVLO_OK", "GND", "QA_G", "keeps Q1 on while the capacitor is healthy"),
    Part("U3", "CapCore:TPS3808G01DBV", "TPS3808G01DBVR", "Package_TO_SOT_SMD:SOT-23-6",
         {"1": "UVLO_OK", "2": "GND", "3": "MR_N", "4": "VAON", "5": "SENSE", "6": "VAON"},
         "C19653", "TPS3808G01DBVR", "under-voltage supervisor, 0.405 V SENSE threshold"),
    C("C5", "100nF", "VAON", "GND", "C1525", "CL05B104KO5NNNC", desc="U3 supply"),
    C("C6", "1uF", "VAON", "GND", "C52923", "CL05A105KA5NQNC", desc="VAON bulk"),
    R("R10", "1M", "VAON", "UV_A", "C26083", "0402WGF1004TCE", "UVLO divider top (1/3)"),
    R("R11", "470k", "UV_A", "UV_B", "C25790", "0402WGF4703TCE", "UVLO divider top (2/3)"),
    R("R12", "330k", "UV_B", "SENSE", "C25778", "0402WGF3303TCE", "UVLO divider top (3/3)"),
    R("R13", "330k", "SENSE", "GND", "C25778", "0402WGF3303TCE",
      "cut-off = 0.405 V x (1 + 1.8M/R13) = 2.61 V",
      edlc={"value": "470k", "lcsc": "C25790", "mpn": "0402WGF4703TCE",
            "desc": "cut-off = 0.405 V x (1 + 1.8M/R13) = 1.96 V"}),
    C("C3", "10nF", "SENSE", "GND", "C15195", "CL05B103KB5NNNC",
      desc="ignores millisecond dips from load steps"),
    R("R14", "1M", "VAON", "UVLO_OK", "C26083", "0402WGF1004TCE", "RESET pull-up"),
    NFET("Q4", "SHIP", "GND", "MR_N", "SHIP high forces a cut-off (storage mode)"),
    R("R15", "1M", "SHIP", "GND", "C26083", "0402WGF1004TCE", "SHIP idles low"),

    # --------------------------------------------------- load switch + wake
    PFET("Q5", "Q5_G", "VAON", "VSYS", "load switch with soft start"),
    R("R16", "1M", "VAON", "Q5_G", "C26083", "0402WGF1004TCE", "Q5 off by default"),
    C("C7", "10nF", "VAON", "Q5_G", "C15195", "CL05B103KB5NNNC", desc="soft start"),
    R("R17", "100k", "Q5_G", "Q6_D", "C25741", "0402WGF1003TCE", "soft start"),
    NFET("Q6", "EN_SYS", "Q6_S", "Q6_D", "turns the gadget on"),
    NFET("Q8", "UVLO_OK", "GND", "Q6_S",
         "in series with Q6: nothing turns the gadget on below the cut-off, not even USB"),
    R("R18", "1M", "EN_SYS", "GND", "C26083", "0402WGF1004TCE", "hold-up discharge"),
    C("C8", "2.2uF", "EN_SYS", "GND", "C23630", "CL10A225KO8NNNC", C0603,
      desc="keeps power on ~2 s after a button press so firmware can raise HOLD"),
    R("R20", "100k", "HOLD", "EN_SYS", "C25741", "0402WGF1003TCE", "firmware keeps power on"),
    PFET("Q7", "WAKE_N", "VAON", "WAKE_D", "button / RTC alarm turns the gadget on"),
    R("R21", "10k", "WAKE_D", "EN_SYS", "C25744", "0402WGF1002TCE", ""),
    DIODE("D2", "VBUS", "USBON_K", "USB power turns the gadget on"),
    R("R22", "10k", "USBON_K", "USBON_J", "C25744", "0402WGF1002TCE", ""),
    Part("JP1", "CapCore:SolderJumper_2_Bridged", "USB-ON",
         "Jumper:SolderJumper-2_P1.3mm_Bridged_RoundedPad1.0x1.5mm",
         {"1": "USBON_J", "2": "EN_SYS"}, desc="cut to stop USB from turning the gadget on",
         in_bom=False),
    Part("JP2", "CapCore:SolderJumper_2_Open", "ALWAYS-ON",
         "Jumper:SolderJumper-2_P1.3mm_Open_RoundedPad1.0x1.5mm",
         {"1": "VAON", "2": "AON_J"}, desc="bridge for always-on (no power button)",
         in_bom=False),
    R("R23", "100k", "AON_J", "EN_SYS", "C25741", "0402WGF1003TCE", ""),
    R("R24", "1M", "VAON", "WAKE_N", "C26083", "0402WGF1004TCE", "WAKE idles high"),
    Part("SW1", "CapCore:SW_Push_Dual", "POWER", "CapCore:SW_TS-1187A_5.1x5.1mm",
         {"1": "WAKE_N", "2": "NC", "3": "NC", "4": "GND"},
         "C318884", "TS-1187A-B-A-B",
         "power / wake button; diagonal pads 1+4 work whichever pairs are internally joined"),
    R("R25", "1k", "WAKE", "WAKE_N", "C11702", "0402WGF1001TCE", "external wake input"),
    DIODE("D3", "BTN", "WAKE_N", "lets the MCU read the button"),

    # --------------------------------------------------- 3.3 V buck-boost
    Part("U4", "CapCore:TPS63031DSK", "TPS63031DSKR",
         "CapCore:WSON-10-1EP_2.5x2.5mm_P0.5mm_EP1.2x2mm_Vias0.3",
         {"1": "3V3", "2": "LX2", "3": "GND", "4": "LX1", "5": "VSYS", "6": "VSYS",
          "7": "GND", "8": "VSYS", "9": "GND", "10": "3V3", "11": "GND"},
         "C15516", "TPS63031DSKR", "3.3 V buck-boost, 1.8-5.5 V in"),
    Part("L1", "CapCore:L", "1.5uH", "CapCore:L_3015_Universal", {"1": "LX1", "2": "LX2"},
         "C7497056", "ANR3015T1R5N", "1.5 uH 3x3 mm shielded, Isat >= 1.5 A"),
    C("C9", "10uF", "VSYS", "GND", "C15850", "CL21A106KAYNNNE", C0805, desc="regulator input"),
    C("C10", "100nF", "VSYS", "GND", "C1525", "CL05B104KO5NNNC", desc="VINA bypass"),
    C("C11", "10uF", "3V3", "GND", "C15850", "CL21A106KAYNNNE", C0805, desc="regulator output"),
    C("C12", "10uF", "3V3", "GND", "C15850", "CL21A106KAYNNNE", C0805, desc="regulator output"),
    C("C13", "100nF", "3V3", "GND", "C1525", "CL05B104KO5NNNC", desc="output HF bypass"),
    R("R26", "1M", "VSYS", "VSENSE", "C26083", "0402WGF1004TCE", "capacitor voltage / 2"),
    R("R27", "1M", "VSENSE", "GND", "C26083", "0402WGF1004TCE", "capacitor voltage / 2"),
    C("C14", "100nF", "VSENSE", "GND", "C1525", "CL05B104KO5NNNC", desc="ADC sample charge"),

    # ------------------------------------------------------------ RTC
    Part("U5", "CapCore:PCF8563T", "PCF8563T", "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm",
         {"1": "OSCI", "2": "OSCO", "3": "WAKE_N", "4": "GND", "5": "SDA", "6": "SCL",
          "7": "NC", "8": "VAON"},
         "C7440", "PCF8563T/5,518", "real-time clock, alarm wakes the gadget"),
    Part("Y1", "CapCore:Crystal", "32.768kHz", "Crystal:Crystal_SMD_3215-2Pin_3.2x1.5mm",
         {"1": "OSCI", "2": "OSCO"}, "C32346", "Q13FC1350000400", "12.5 pF, 20 ppm"),
    C("C15", "100nF", "VAON", "GND", "C1525", "CL05B104KO5NNNC", desc="RTC supply"),
    R("R28", "4.7k", "3V3", "SDA", "C25900", "0402WGF4701TCE", "I2C pull-up"),
    R("R29", "4.7k", "3V3", "SCL", "C25900", "0402WGF4701TCE", "I2C pull-up"),

    # -------------------------------------------------------- headers
    Part("J2", "CapCore:Conn_01x08", "LEFT", "Connector_PinHeader_2.54mm:PinHeader_1x08_P2.54mm_Vertical",
         {"1": "VBUS", "2": "GND", "3": "3V3", "4": "HOLD", "5": "WAKE", "6": "BTN",
          "7": "SHIP", "8": "GND"}, desc="0.1 in header (solder your own pins)", in_bom=False),
    Part("J3", "CapCore:Conn_01x08", "RIGHT", "Connector_PinHeader_2.54mm:PinHeader_1x08_P2.54mm_Vertical",
         {"1": "DP", "2": "DM", "3": "SDA", "4": "SCL", "5": "VSENSE", "6": "CHG",
          "7": "3V3", "8": "GND"}, desc="0.1 in header (solder your own pins)", in_bom=False),
]

# Nets that are pure power rails get PWR_FLAGs in the schematic.
POWER_FLAGS = ["VBUS", "GND", "VCAP", "VAON", "VSYS"]


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
    """Return (value, lcsc, mpn, desc) for the 'lic' or 'edlc' build."""
    o = part.edlc if name == "edlc" else {}
    return (o.get("value", part.value), o.get("lcsc", part.lcsc),
            o.get("mpn", part.mpn), o.get("desc", part.desc))


if __name__ == "__main__":
    for net, conns in sorted(nets().items()):
        print(f"{net:10} {' '.join(r + '.' + p for r, p in conns)}")
    singles = [n for n, c in nets().items() if len(c) < 2]
    print("single-connection nets:", singles)
