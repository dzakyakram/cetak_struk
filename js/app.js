(function () {
  'use strict';

  var pm = new PrinterManager({ bridgeUrl: 'http://localhost:3000' });
  var W = 32;

  var profile = TokenStore.getProfile();
  var settings = TokenStore.getSettings();
  pm.setBaudRate(settings.baudRate);
  var currentData = null;

  function $(id) { return document.getElementById(id); }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fmtDate(d) {
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function fmtIDR(n) {
    return 'Rp ' + Math.round(n).toLocaleString('id-ID');
  }

  function repeat(ch, n) {
    var s = '';
    for (var i = 0; i < n; i++) s += ch;
    return s;
  }

  function groupToken(t) {
    t = t.replace(/[^0-9]/g, '').slice(0, 20);
    var out = [];
    for (var i = 0; i < t.length; i += 4) out.push(t.slice(i, i + 4));
    return out.join(' ');
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      var self = this;
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function buildOps(data) {
    var ops = [];
    function add(text, o) {
      var op = o || {};
      op.text = text;
      ops.push(op);
    }
    function center(text, o) {
      var op = o || {};
      op.align = 'center';
      op.text = text;
      ops.push(op);
    }
    function rule() { add(repeat('-', W)); }
    function pair(label, value) { add(label + ' : ' + value); }

    if (profile.nama) {
      center(profile.nama.toUpperCase(), { bold: true });
      if (profile.alamat) center(profile.alamat);
      if (profile.telp) center(profile.telp);
      rule();
    }

    center('STRUK TOKEN LISTRIK PLN', { bold: true });
    rule();
    pair('No. Struk', data.noStruk);
    pair('Tanggal', data.tanggal);
    rule();
    pair('No. Meter', data.noMeter);
    pair('Nama', data.nama);
    pair('Daya/Tarif', data.daya + ' VA / ' + data.tarif);
    pair('Nominal', fmtIDR(data.nominal));
    pair('Total kWh', data.kwh + ' kWh');
    pair('Biaya Admin', fmtIDR(data.admin));
    pair('Total Bayar', fmtIDR(data.total));
    rule();
    center('TOKEN LISTRIK ANDA', { bold: true });
    center(data.tokenFormatted, { bold: true, size: [1, 4] });
    rule();
    if (settings.footer) {
      settings.footer.split('\n').forEach(function (l) {
        if (l) center(l);
      });
    }
    return ops;
  }

  function renderPreview(data) {
    var ops = buildOps(data);
    var lines = [];
    ops.forEach(function (op) {
      var t = op.text;
      if (op.align === 'center') {
        var pad = Math.max(0, W - t.length);
        var l = Math.floor(pad / 2);
        t = repeat(' ', l) + t + repeat(' ', pad - l);
      } else if (op.align === 'right') {
        t = repeat(' ', Math.max(0, W - t.length)) + t;
      }
      lines.push(t);
    });
    return lines.join('\n');
  }

  function encodeBytes(data) {
    var e = new EscPos();
    e.init();
    e.codepage(2);
    buildOps(data).forEach(function (op) {
      e.align(op.align || 'left');
      e.bold(!!op.bold);
      var sz = op.size || [1, 1];
      e.size(sz[0], sz[1]);
      e.text(op.text);
      e.newline();
    });
    e.feed(4);
    e.cut(false);
    return e.encode();
  }

  function collectData() {
    var noMeter = $('noMeter').value.trim();
    var nama = $('nama').value.trim().toUpperCase();
    var daya = $('daya').value;
    var tarif = $('tarif').value.trim() || 'R-1';
    var nominal = parseInt($('nominal').value, 10) || 0;
    var admin = parseFloat($('admin').value) || 0;
    var token = $('token').value.replace(/[^0-9]/g, '');
    var totalKwh = parseFloat($('totalKwh').value);

    var kwh = totalKwh > 0 ? totalKwh : 0;
    return {
      noStruk: TokenStore.nextNoStruk(),
      tanggal: fmtDate(new Date()),
      noMeter: noMeter,
      nama: nama,
      daya: daya,
      tarif: tarif,
      nominal: nominal,
      admin: admin,
      total: nominal + admin,
      kwh: kwh.toFixed(2).replace('.', ','),
      token: token,
      tokenFormatted: groupToken(token)
    };
  }

  function dataFromItem(item) {
    return {
      noStruk: item.noStruk,
      tanggal: item.tanggal,
      noMeter: item.noMeter,
      nama: item.nama,
      daya: item.daya,
      tarif: item.tarif,
      nominal: item.nominal,
      admin: item.admin,
      total: item.total,
      kwh: item.kwh,
      token: item.token,
      tokenFormatted: groupToken(item.token)
    };
  }

  function validateData(data) {
    var errs = [];
    if (!/^\d{20}$/.test(data.token)) errs.push('- Token harus 20 digit angka.');
    if (!/^\d{6,}$/.test(data.noMeter)) errs.push('- Nomor meter minimal 6 digit.');
    if (!data.nama) errs.push('- Nama pelanggan wajib diisi.');
    if (!(data.nominal > 0)) errs.push('- Nominal token harus diisi.');
    return errs;
  }

  function setStatus(html, ok) {
    var el = $('statusText');
    el.innerHTML = html;
    el.className = 'status ' + (ok ? 'ok' : 'err');
  }

  function toast(msg, type) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (type || '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = 'toast'; }, 3500);
  }

  function updateConnectUI() {
    var connected = !!pm.active;
    $('btnUsb').disabled = connected;
    $('btnSerial').disabled = connected;
    $('btnBridge').disabled = connected;
    $('btnBle').disabled = connected;
    $('btnDisconnect').style.display = connected ? '' : 'none';
    if (connected) {
      setStatus('Terhubung: ' + pm.active.getInfo().label, true);
    } else {
      setStatus('Printer belum terhubung. Pilih "Koneksi Bridge" (rekomendasi) atau lainnya.', false);
    }
  }

  function updatePreview() {
    var data = collectData();
    currentData = data;
    $('preview').textContent = renderPreview(data);
    $('kwhInfo').textContent = 'Total kWh: ' + data.kwh + ' | Total Bayar: ' + fmtIDR(data.total);
    var errs = validateData(data);
    $('errBox').textContent = errs.join('\n');
    $('btnPrint').disabled = errs.length > 0;
  }

  function renderRiwayat() {
    var list = TokenStore.getRiwayat();
    var tbody = $('riwayatBody');
    tbody.innerHTML = '';
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">Belum ada riwayat cetak.</td></tr>';
      return;
    }
    list.forEach(function (item) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + item.noStruk + '</td>' +
        '<td>' + item.tanggal + '</td>' +
        '<td>' + item.noMeter + '</td>' +
        '<td>' + item.nama + '</td>' +
        '<td>' + fmtIDR(item.nominal) + '</td>' +
        '<td class="actions">' +
        '<button class="btn sm" data-reprint="' + item.id + '">Cetak Ulang</button>' +
        '<button class="btn sm danger" data-del="' + item.id + '">Hapus</button>' +
        '</td>';
      tbody.appendChild(tr);
    });
  }

  async function doPrint(data, save) {
    if (!pm.active) {
      toast('Hubungkan printer dulu', 'err');
      return;
    }
    var btn = $('btnPrint');
    var wasDisabled = btn.disabled;
    btn.disabled = true;
    try {
      setStatus('Mencetak...', true);
      var bytes = encodeBytes(data);
      await pm.print(bytes);
      setStatus('Struk berhasil dicetak.', true);
      toast('Struk berhasil dicetak', 'ok');
      if (save) {
        var item = dataFromItem(data);
        item.id = Date.now();
        TokenStore.addRiwayat(item);
        renderRiwayat();
      }
    } catch (err) {
      setStatus('Gagal cetak: ' + err.message, false);
      toast('Gagal mencetak: ' + err.message, 'err');
    } finally {
      btn.disabled = wasDisabled;
      updateConnectUI();
    }
  }

  async function onConnectUsb() {
    try {
      await pm.connect('usb');
      updateConnectUI();
      toast('Terhubung via USB', 'ok');
    } catch (e) {
      if (e.name !== 'NotFoundError') toast('Koneksi USB gagal: ' + e.message, 'err');
    }
  }

  async function onConnectBridge() {
    try {
      await pm.connect('bridge');
      updateConnectUI();
      fillBridgePrinters(pm.bridge.printers, pm.bridge.printerName);
      $('printerSelectWrap').style.display = '';
      toast('Terhubung via Bridge Windows', 'ok');
    } catch (e) {
      toast('Koneksi Bridge gagal: ' + e.message, 'err');
    }
  }

  function fillBridgePrinters(list, current) {
    var sel = $('printerSelect');
    sel.innerHTML = '';
    list.forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === current) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  async function onConnectSerial() {
    try {
      await pm.connect('serial');
      updateConnectUI();
      toast('Terhubung via Serial', 'ok');
    } catch (e) {
      if (e.name !== 'NotFoundError') toast('Koneksi Serial gagal: ' + e.message, 'err');
    }
  }

  async function onConnectBle() {
    try {
      await pm.connect('ble');
      updateConnectUI();
      toast('Terhubung via Bluetooth', 'ok');
    } catch (e) {
      if (e.name !== 'NotFoundError') toast('Koneksi Bluetooth gagal: ' + e.message, 'err');
    }
  }

  function fillFormFromFields(fields) {
    if (fields.token) $('token').value = groupToken(fields.token);
    if (fields.noMeter) $('noMeter').value = fields.noMeter;
    if (fields.nama) $('nama').value = fields.nama;
    if (fields.daya) {
      var dSel = $('daya');
      if ([].slice.call(dSel.options).some(function (o) { return o.value === fields.daya; })) {
        dSel.value = fields.daya;
      }
    }
    if (fields.tarif) $('tarif').value = fields.tarif;
    if (fields.nominal) {
      var nSel = $('nominal');
      if ([].slice.call(nSel.options).some(function (o) { return parseInt(o.value, 10) === fields.nominal; })) {
        nSel.value = String(fields.nominal);
      }
    }
    if (fields.admin) $('admin').value = fields.admin;
    if (fields.kwh) $('totalKwh').value = fields.kwh;
  }

  function errDetail(e) {
    if (e == null) return 'unknown';
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object') {
      return e.errorMessage || e.errorCode || e.message ||
        (function () { try { return JSON.stringify(e); } catch (_) { return String(e); } })();
    }
    return String(e);
  }

  function handleScanFile(file) {
    if (!file || !/^image\//.test(file.type)) {
      toast('Pilih file gambar (JPG/PNG).', 'err');
      return;
    }
    var url = URL.createObjectURL(file);
    var img = $('scanPreview');
    img.src = url;
    img.style.display = '';
    $('ocrRaw').textContent = '';
    var st = $('ocrStatus');
    st.style.display = '';
    st.textContent = 'Memproses OCR...';
    st.className = 'info';

    Ocr.processFile(file, function (msg) { st.textContent = msg; }).then(function (res) {
      $('ocrRaw').textContent = res.text;
      fillFormFromFields(res.fields);
      updatePreview();
      var filled = [];
      if (res.fields.token) filled.push('token');
      if (res.fields.noMeter) filled.push('no. meter');
      if (res.fields.nama) filled.push('nama');
      if (res.fields.daya) filled.push('daya');
      if (res.fields.tarif) filled.push('tarif');
      if (res.fields.nominal) filled.push('nominal');
      if (res.fields.admin) filled.push('admin');
      if (res.fields.kwh) filled.push('kWh');
      var missing = [];
      if (!res.fields.token) missing.push('token');
      if (!res.fields.noMeter) missing.push('no. meter');
      if (!res.fields.nama) missing.push('nama');
      if (!res.fields.daya) missing.push('daya');
      if (!res.fields.tarif) missing.push('tarif');
      if (!res.fields.nominal) missing.push('nominal');
      if (!res.fields.kwh) missing.push('kWh');
      st.textContent = 'OCR selesai. Terisi otomatis: ' +
        (filled.length ? filled.join(', ') : '(kosong)') +
        '. Semua bisa diedit di Form Struk sebelum cetak.' +
        (missing.length ? ' Tidak terdeteksi (isi manual): ' + missing.join(', ') : '');
      st.className = 'info';
      toast('OCR selesai. Periksa isian.', 'ok');
    }).catch(function (err) {
      console.error('OCR error:', err);
      var detail = errDetail(err);
      st.textContent = 'OCR gagal: ' + detail;
      st.className = 'error';
      $('ocrRaw').textContent = $('ocrRaw').textContent + '\n--- ERROR ---\n' + detail +
        (err && err.stack ? '\n' + err.stack : '');
      toast('OCR gagal: ' + detail, 'err');
    });
  }

  async function onDisconnect() {
    try {
      await pm.disconnect();
    } catch (e) {}
    updateConnectUI();
  }

  function onPrint() {
    updatePreview();
    doPrint(currentData, true);
  }

  function onTestPrint() {
    if (!pm.active) {
      toast('Hubungkan printer dulu', 'err');
      return;
    }
    var e = new EscPos();
    e.init();
    e.codepage(2);
    e.align('center');
    e.bold(true);
    e.size(1, 2);
    e.text('UJI CETAK PRINTER');
    e.newline();
    e.bold(false);
    e.size(1, 1);
    e.align('left');
    e.text('Baris teks biasa AaBbCc 12345');
    e.text('Aksara: e u n C c 2 3');
    e.text('Lebar 58mm, 32 kolom.');
    e.feed(3);
    e.cut(false);
    pm.print(e.encode()).then(function () {
      toast('Uji cetak berhasil', 'ok');
    }).catch(function (err) {
      toast('Gagal uji cetak: ' + err.message, 'err');
    });
  }

  function onSaveConfig() {
    profile.nama = $('tNama').value.trim();
    profile.alamat = $('tAlamat').value.trim();
    profile.telp = $('tTelp').value.trim();
    settings.footer = $('tFooter').value.trim();
    settings.baudRate = parseInt($('tBaud').value, 10) || 9600;
    settings.transport = $('tTransport').value;

    TokenStore.saveProfile(profile);
    TokenStore.saveSettings(settings);
    pm.setBaudRate(settings.baudRate);
    updatePreview();
    toast('Pengaturan disimpan', 'ok');
  }

  function init() {
    $('tNama').value = profile.nama;
    $('tAlamat').value = profile.alamat;
    $('tTelp').value = profile.telp;
    $('tFooter').value = settings.footer;
    $('tBaud').value = settings.baudRate;
    $('tTransport').value = settings.transport;

    $('btnUsb').addEventListener('click', onConnectUsb);
    $('btnSerial').addEventListener('click', onConnectSerial);
    $('btnBridge').addEventListener('click', onConnectBridge);
    $('btnBle').addEventListener('click', onConnectBle);
    $('btnDisconnect').addEventListener('click', onDisconnect);
    $('btnTest').addEventListener('click', onTestPrint);
    $('btnPrint').addEventListener('click', onPrint);
    $('btnSaveCfg').addEventListener('click', onSaveConfig);
    $('btnCamera').addEventListener('click', function () {
      var f = $('fileScan');
      f.setAttribute('capture', 'environment');
      f.value = '';
      f.click();
    });
    $('btnUpload').addEventListener('click', function () {
      var f = $('fileScan');
      f.removeAttribute('capture');
      f.value = '';
      f.click();
    });
    $('fileScan').addEventListener('change', function () {
      if (this.files && this.files[0]) handleScanFile(this.files[0]);
    });
    $('printerSelect').addEventListener('change', function () {
      var val = this.value;
      if (pm.active && pm.activeType === 'bridge') {
        pm.bridge.setPrinterName(val).then(function () {
          toast('Printer dipilih: ' + val, 'ok');
          updateConnectUI();
        });
      }
    });

    ['noMeter', 'nama', 'daya', 'nominal', 'admin', 'totalKwh', 'token'].forEach(function (id) {
      $(id).addEventListener('input', debounce(updatePreview, 250));
    });
    $('token').addEventListener('input', function () {
      this.value = groupToken(this.value);
    });

    $('riwayatBody').addEventListener('click', function (ev) {
      var t = ev.target;
      var id = parseInt(t.getAttribute('data-reprint'), 10) || parseInt(t.getAttribute('data-del'), 10);
      if (!id) return;
      var list = TokenStore.getRiwayat();
      var item = list.filter(function (x) { return x.id === id; })[0];
      if (!item) return;
      if (t.hasAttribute('data-reprint')) {
        currentData = dataFromItem(item);
        $('preview').textContent = renderPreview(currentData);
        doPrint(currentData, false);
      } else {
        TokenStore.removeRiwayat(id);
        renderRiwayat();
        toast('Riwayat dihapus', 'ok');
      }
    });

    renderRiwayat();
    updateConnectUI();
    updatePreview();

    pm.autoReconnect(settings.transport).then(function (info) {
      if (info) {
        updateConnectUI();
        toast('Printer terhubung otomatis', 'ok');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
