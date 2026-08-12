# Cetak Struk Token PLN - Printer Thermal 58mm

Aplikasi web untuk mencetak struk token listrik PLN prabayar ke printer thermal 58mm
(contoh: CSC MP-58M / GEZHI). Mencetak via **Bridge Windows** (spooler RAW) sehingga
tidak butuh WebUSB/WebSerial dan bekerja di browser mana pun.

Fitur tambahan:
- **Bluetooth (BLE)** untuk printer thermal yang mendukung BLE (mis. **Rongta RPP02N**):
  dari Chrome/Edge (PC atau Android), tanpa kabel.
- **Scan Struk (OCR)** — foto struk/screenshot token, isian terisi otomatis. Mesin OCR
  (tesseract.js) sudah dibundle lokal jadi **bisa offline**.
- **PWA** — aplikasi bisa "Install" di Android dari Chrome dan bekerja offline.

## Cara Menjalankan (sekali saja)

1. **Pasang printer sebagai printer Windows** (cukup sekali):
   - Klik dua kali `install-printer.bat` → klik **Ya** pada jendela UAC.
   - Ini membuat printer `CSC MP-58M` pada port `USB002` (driver Generic / Text Only).
   - Verifikasi hasilnya di `install-log.txt` (berisi `OK CSC MP-58M USB002 ...`).

2. **Jalankan server + bridge**:
   - Klik dua kali `start.ps1`, atau dari terminal:
     ```powershell
     powershell -ExecutionPolicy Bypass -File .\start.ps1
     ```
   - Akan terbuka 2 hal: **web server** di `http://localhost:8000` dan **bridge cetak** di
     `http://localhost:3000`.

3. **Buka aplikasi**: `http://localhost:8000` di browser (Chrome/Edge/Firefox semuanya bisa).

4. **Koneksi printer**: klik **"Koneksi Bridge"** → status menjadi *Terhubung*.
   Jika ada beberapa printer, pilih `CSC MP-58M` dari dropdown.

5. Isi form token, klik **"Cetak Struk"**.

> Jendela yang terbuka dari `start.ps1` jangan ditutup selama aplikasi dipakai.

## Cetak via Bluetooth (printer BLE, mis. RPP02N)

Printer thermal 58mm banyak yang pakai **Bluetooth BLE** (bisa dikenali karena muncul
sebagai perangkat "Bluetooth 4.0"). Caranya:

1. Nyalakan printer, buka aplikasi di Chrome/Edge.
2. Klik **Koneksi Bluetooth** → pilih printer (mis. `RPP02N`) di dialog.
3. Klik **Uji Cetak Printer** atau isi form lalu **Cetak Struk**.

> Printer yang TIDAK muncul di dialog BLE biasanya memakai **SPP (Bluetooth Classic)**
> — tidak bisa dari browser, butuh aplikasi Android native. Untuk pengecekan, buka
> `ble-test.html`.

## Pakai dari HP Android (PWA)

Web Bluetooth hanya jalan pada **HTTPS** (atau localhost). Dari HP:

**Opsi A — tunnel cloudflared (paling mudah, HTTPS publik):**
1. Unduh `cloudflared.exe` dari https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Jalankan server lokal dulu (`start.ps1`), lalu di terminal:
   ```
   cloudflared.exe tunnel --url http://localhost:8000
   ```
3. Buka URL `https://xxxx.trycloudflare.com` di Chrome HP → ketuk ikon menu → **"Tambahkan ke layar utama"** (Install PWA). Bluetooth & offline langsung jalan.

**Opsi B — HTTPS LAN (self-signed):**
1. Jalankan `start-phone.ps1` (membuat `server.pfx` otomatis).
2. Di HP buka `https://<IP-PC>:8443` → **Advanced → Proceed**.
   > Catatan: beberapa versi Chrome Android tetap menolak Web Bluetooth pada sertifikat
   > self-signed. Kalau tombol Bluetooth tidak berfungsi, gunakan Opsi A.

## Scan Struk / OCR

Di halaman aplikasi ada kartu **"Scan Struk (Foto / Gambar)"**:
- **Scan Kamera** → kamera belakang HP langsung.
- **Pilih Gambar** → dari galeri/file.
- Isian (token, No. Meter, Nama, Daya, Tarif, Nominal) terisi otomatis setelah OCR.
  Selalu **periksa kembali** sebelum mencetak. Hasil mentah tersedia di bagian "Hasil OCR mentah".

## Cara Kerja

```
Halaman web (localhost:8000)
        │  kirim byte ESC/POS
        ▼
Bridge (localhost:3000, bridge.js)
        │  RAW spooler (bridge.ps1 / WritePrinter)
        ▼
Printer Windows "CSC MP-58M" (port USB002)
        ▼
Printer thermal 58mm
```

Bridge mengirim data **RAW** (tanpa rendering) lewat spooler Windows, jadi perintah
ESC/POS (besar kecil font, bold, potong kertas) dikirim apa adanya.

## Troubleshooting

| Masalah | Solusi |
|---|---|
| "Tidak ada printer Windows terpasang" | Jalankan `install-printer.bat` (UAC, klik Ya). |
| Bridge tidak merespon | Pastikan Node.js terinstal & `start.ps1` tidak ditutup. |
| Kertas keluar tapi kosong | Periksa pemasangan kertas thermal (sisi terang menghadap kepala cetak). |
| Kertas tidak terpotong | Printer tanpa pemotong (normal untuk 58mm murah); aplikasi memberi jarak setelah cetak. |
| Karakter aneh | Periksa di Pengaturan → harga per kWh, dan pastikan printer terhubung via Bridge. |
| Bluetooth tidak muncul di browser | Pastikan halaman dibuka via **HTTPS** (atau localhost) dan Chrome/Edge terbaru. |
| Printer tidak terlihat di dialog Bluetooth | Coba `ble-test.html`. Kalau tetap tidak muncul → printer pakai SPP (butuh APK native). |
| OCR tidak jalan saat offline | Pastikan aplikasi pernah dimuat sekali dengan internet (aset OCR tersimpan otomatis). |

## Catatan

- Printer muncul di Device Manager sebagai "GEZHI micro-printer" (USB printer class,
  VID_28E9:PID_0289). Karena itu WebUSB Windows diblokir `usbprint.sys` dan tidak ada
  COM port — jalur Bridge adalah yang paling andal.
- Data (profil toko, riwayat, pengaturan) tersimpan di `localStorage` browser.
- No. struk otomatis: `YYYYMMDD-0001`.
- Aset OCR (tesseract.js, wasm, data bahasa ~10MB) tersimpan di `vendor/tesseract/`
  dan di-cache oleh `sw.js` untuk mode offline.
