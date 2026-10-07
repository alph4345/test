# Vendored libraries

Both are unmodified copies from npm, kept here so the app works offline and needs no build step.

| File | Package | Version | License |
|---|---|---|---|
| `jspdf.umd.min.js` | [jspdf](https://github.com/parallax/jsPDF) (`dist/jspdf.umd.min.js`) | 4.2.1 | MIT |
| `qrcode.js` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (`dist/qrcode.js`) | 2.0.4 | MIT |

jsPDF is loaded the first time you download a PDF; qrcode-generator draws the QR code for a
Square payment link on invoices. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
