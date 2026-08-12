(function (global) {
  'use strict';

  var WHITELIST = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:./%- ';

  var workerPromise = null;

  function getWorker(onStatus) {
    if (!workerPromise) {
      workerPromise = (async function () {
        if (!global.Tesseract) throw new Error('Library tesseract.js belum dimuat.');
        var worker = await Tesseract.createWorker('eng', 1, {
          logger: function (m) {
            if (m && m.status) {
              console.log('[tesseract]', m.status, m.progress);
              if (onStatus) {
                onStatus('Mesin OCR: ' + m.status +
                  (typeof m.progress === 'number' ? ' ' + Math.round(m.progress * 100) + '%' : ''));
              }
            }
          },
          workerPath: '/vendor/tesseract/worker.min.js',
          corePath: '/vendor/tesseract/',
          langPath: '/vendor/tesseract/',
          gzip: true
        });
        await worker.setParameters({
          tessedit_char_whitelist: WHITELIST,
          preserve_interword_spaces: '1'
        });
        return worker;
      })();
      workerPromise.catch(function () {
        workerPromise = null;
      });
    }
    return workerPromise;
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Gagal membaca gambar.')); };
      img.src = url;
    });
  }

  function otsuThreshold(gray) {
    var hist = new Array(256).fill(0);
    for (var i = 0; i < gray.length; i++) hist[gray[i] | 0]++;
    var total = gray.length;
    var sum = 0;
    for (var k = 0; k < 256; k++) sum += k * hist[k];
    var sumB = 0, wB = 0, maxVar = 0, threshold = 128;
    for (var t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      var wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      var mB = sumB / wB;
      var mF = (sum - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) { maxVar = between; threshold = t; }
    }
    return threshold;
  }

  function preprocess(img, maxW, maxH) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var scale = 1;
    if (w > maxW) scale = Math.min(scale, maxW / w);
    if (h > maxH) scale = Math.min(scale, maxH / h);
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    var imageData = ctx.getImageData(0, 0, w, h);
    var px = imageData.data;
    var n = px.length / 4;
    var gray = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    }
    var th = otsuThreshold(gray);
    for (var j = 0; j < n; j++) {
      var v = gray[j] > th ? 255 : 0;
      px[j * 4] = v;
      px[j * 4 + 1] = v;
      px[j * 4 + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  function keepSpaces(line) {
    return line.replace(/[^\x20-\x7E\u00A0\u00E9]/g, ' ').trim();
  }

  function collapse(line) {
    return keepSpaces(line).replace(/\s+/g, ' ');
  }

  var TOKEN_FIX = { 'O': '0', 'o': '0', 'D': '0', 'I': '1', 'l': '1', 'Z': '2', 'S': '5', 'B': '8', 'G': '6' };

  function fixToken(s) {
    return s.replace(/[A-Za-z]/g, function (c) { return TOKEN_FIX[c] || ''; });
  }

  function fixTarif(s) {
    return s.replace(/O/g, '0').replace(/I/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
  }

  function looksLikeName(s) {
    if (!s || s.length < 2 || s.length > 40) return false;
    if (/^\d{4,}$/.test(s)) return false;
    if (/token|struk|pln\b|prabayar/i.test(s)) return false;
    return true;
  }

  function extractFields(text) {
    var res = {
      token: '',
      noMeter: '',
      nama: '',
      daya: '',
      tarif: '',
      nominal: 0,
      admin: 0,
      kwh: null
    };
    var flat = text.replace(/\s+/g, ' ');

    // --- Token: 20 digit (boleh tanpa spasi, atau grup 4-4-4-4-4) ---
    var m = flat.match(/\d{20}/);
    if (m) {
      res.token = m[0];
    } else {
      m = flat.match(/(\d{4})[-\s](\d{4})[-\s](\d{4})[-\s](\d{4})[-\s](\d{4})/);
      if (m) {
        res.token = m.slice(1).join('');
      } else {
        m = flat.match(/([0-9OoIlZSB8G6]{4})[\s-]([0-9OoIlZSB8G6]{4})[\s-]([0-9OoIlZSB8G6]{4})[\s-]([0-9OoIlZSB8G6]{4})[\s-]([0-9OoIlZSB8G6]{4})/);
        if (m) res.token = m.slice(1).map(fixToken).join('');
      }
    }

    var pairs = text.split('\n').map(function (raw) {
      return { raw: keepSpaces(raw), line: collapse(raw) };
    }).filter(function (p) { return p.line; });
    for (var i = 0; i < pairs.length; i++) {
      var line = pairs[i].line;
      var low = line.toLowerCase();

      // --- No. Meter / ID Pelanggan ---
      if (!res.noMeter && /(no\.?\s*meter|nomor\s*meter|no\.?\s*pelanggan|id\s*pelanggan|id\s*pln|idpel)/.test(low)) {
        var dm = line.match(/(\d[\d.\s]{5,})/);
        if (dm) res.noMeter = dm[1].replace(/[^0-9]/g, '');
      }

      // --- Nama: "Nama : X", "Nama Pelanggan : X", "An. X", "NAMA<spasi spasi> X", atau label-nilai terpisah baris ---
      if (!res.nama) {
        var mAn = line.match(/^\s*an\.?\s+(.+)$/i);
        if (mAn) {
          res.nama = mAn[1].trim();
        } else {
          var mN = line.match(/^\s*(?:atas\s+nama\s*[:.]?|nama\s*pelanggan\s*[:.]?|nama\s*[:.])\s*(.+)$/i);
          if (mN) {
            res.nama = mN[1].trim();
          } else if (/^\s*nama(\s*pelanggan)?\s*[:.]?\s*$/i.test(line)) {
            var next = i + 1 < pairs.length ? pairs[i + 1].line : '';
            if (next && !/:/.test(next) && looksLikeName(next)) res.nama = next.trim();
          } else {
            // DANA: "NAMA  EV.DRS.TONNI SIREGAR" (label dan nilai dipisah minimal 2 spasi, tanpa titik dua)
            var mN2 = pairs[i].raw.match(/^\s*nama\s{2,}\s*(.+)$/i);
            if (mN2) res.nama = mN2[1].trim();
          }
        }
        if (res.nama && !looksLikeName(res.nama)) res.nama = '';
      }

      // --- Daya / Tarif ---
      if (/daya|tarif/.test(low)) {
        // format struk PLN/DANA: "TARIF/DAYA RIM/900VA" atau "R-1M/900VA"
        var t1 = line.match(/([A-Z]{1,3}\d?[A-Z]?)\s*\/\s*(\d{3,5})\s*VA/i);
        if (t1) {
          if (!res.tarif) res.tarif = fixTarif(t1[1]);
          if (!res.daya) res.daya = t1[2];
        } else {
          // format aplikasi ini: "Daya/Tarif : 1300 VA / R-1"
          var dy = line.match(/(\d{3,5})\s*VA/i);
          if (dy && !res.daya) res.daya = dy[1];
          var tf = line.match(/\/([A-Z]{1,3}\d?[A-Z]?)\s*$/i);
          if (tf && !res.tarif) res.tarif = fixTarif(tf[1]);
        }
      }

      // --- Nominal (format struk: "Nominal : Rp 50.000") ---
      if (!res.nominal && /^\s*nominal\s*[:.]/.test(low)) {
        var nm2 = line.match(/[\d.,]+/);
        if (nm2) {
          var clean = nm2[0].replace(/\./g, '').replace(',', '.');
          var num = parseFloat(clean);
          if (!isNaN(num)) res.nominal = num;
        }
      }

      // --- Biaya Admin ---
      if (!res.admin && /(biaya\s*admin|admin)/.test(low)) {
        var aM = line.match(/([\d.,]+)/);
        if (aM) {
          var aClean = aM[1].replace(/\./g, '').replace(',', '.');
          var aNum = parseFloat(aClean);
          if (!isNaN(aNum)) res.admin = aNum;
        }
      }

      // --- Jumlah kWh (min. 2 digit; nilai desimal pakai . atau , mis. "68.9") ---
      if (res.kwh === null && /(kwh|kilo\s*watt)/.test(low)) {
        var kW = line.match(/(\d{1,4}(?:[.,]\d{1,3})?)/);
        if (kW) {
          var kStr = kW[1].replace(/\s/g, '');
          var kNum = parseFloat(kStr.replace(',', '.'));
          if (!isNaN(kNum)) res.kwh = kNum;
        }
      }

      // --- Total Bayar (untuk fallback nominal = total - admin) ---
      if (!res.total && /(total\s*bayar|rp\s*bayar)/.test(low)) {
        var tM = line.match(/([\d.,]+)/);
        if (tM) {
          var tClean = tM[1].replace(/\./g, '').replace(',', '.');
          var tNum = parseFloat(tClean);
          if (!isNaN(tNum)) res.total = tNum;
        }
      }
    }

    // --- Nominal fallback: total bayar - biaya admin (struk DANA tidak memuat baris "Nominal") ---
    if (!res.nominal && res.total && res.admin && res.total > res.admin) {
      var KNOWN = [20000, 25000, 50000, 100000, 150000, 200000, 500000, 1000000];
      var derived = res.total - res.admin;
      if (KNOWN.indexOf(derived) !== -1) res.nominal = derived;
    }

    // --- Nominal fallback untuk screenshot (mis. DANA): nilai "Rp ..." yang cocok nominal token ---
    if (!res.nominal) {
      var KNOWN = [20000, 25000, 50000, 100000, 150000, 200000, 500000, 1000000];
      var rpRe = /Rp\.?\s*([\d.,]+)/gi;
      var mm;
      while ((mm = rpRe.exec(text))) {
        var num2 = parseFloat(mm[1].replace(/\./g, '').replace(',', '.'));
        if (KNOWN.indexOf(num2) !== -1) { res.nominal = num2; break; }
      }
    }

    return res;
  }

  async function tryRecognize(worker, attempts, onProgress) {
    var lastErr = null;
    for (var i = 0; i < attempts.length; i++) {
      try {
        if (onProgress) onProgress('Membaca teks... (coba ' + (i + 1) + '/' + attempts.length + ')');
        var result = await worker.recognize(attempts[i]);
        var text = result && result.data ? result.data.text : '';
        if (text && text.trim()) {
          return { text: text, fields: extractFields(text), attempt: i + 1 };
        }
        lastErr = new Error('Teks tidak terdeteksi.');
      } catch (e) {
        console.error('Recognize coba ' + (i + 1) + ' gagal:', e);
        lastErr = e;
      }
    }
    throw lastErr || new Error('OCR gagal.');
  }

  function processFile(file, onProgress) {
    return loadImage(file).then(function (img) {
      if (onProgress) onProgress('Memproses gambar...');
      var canvas = null;
      try {
        canvas = preprocess(img, 1600, 2600);
      } catch (e) {
        console.error('Preprocess gagal, pakai gambar asli:', e);
      }
      return getWorker(onProgress).then(function (worker) {
        var attempts = [];
        if (canvas) attempts.push(canvas);
        attempts.push(img);
        return tryRecognize(worker, attempts, onProgress);
      });
    });
  }

  global.Ocr = {
    processFile: processFile,
    extractFields: extractFields
  };
})(typeof window !== 'undefined' ? window : this);
