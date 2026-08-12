(function (global) {
  'use strict';

  var KEY_PROFIL = 'tokenStruk.profil';
  var KEY_SETTINGS = 'tokenStruk.pengaturan';
  var KEY_RIWAYAT = 'tokenStruk.riwayat';
  var KEY_COUNTER = 'tokenStruk.counter.';

  var defaults = {
    profil: { nama: '', alamat: '', telp: '', footer: 'Simpan struk ini sebagai bukti pembayaran yang sah.' },
    pengaturan: { baudRate: 9600, transport: 'auto' }
  };

  function read(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function merge(base, extra) {
    var out = {};
    for (var k in base) out[k] = base[k];
    if (extra) {
      for (var j in extra) out[j] = extra[j];
    }
    return out;
  }

  var api = {
    getProfile: function () {
      return merge(defaults.profil, read(KEY_PROFIL, null));
    },
    saveProfile: function (p) {
      write(KEY_PROFIL, p);
    },
    getSettings: function () {
      return merge(defaults.pengaturan, read(KEY_SETTINGS, null));
    },
    saveSettings: function (s) {
      write(KEY_SETTINGS, s);
    },
    getRiwayat: function () {
      return read(KEY_RIWAYAT, []);
    },
    saveRiwayat: function (list) {
      write(KEY_RIWAYAT, list);
    },
    addRiwayat: function (item) {
      var l = this.getRiwayat();
      l.unshift(item);
      if (l.length > 500) l.length = 500;
      this.saveRiwayat(l);
    },
    removeRiwayat: function (id) {
      this.saveRiwayat(this.getRiwayat().filter(function (x) { return x.id !== id; }));
    },
    nextNoStruk: function () {
      var now = new Date();
      var d = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
      var key = KEY_COUNTER + d;
      var n = read(key, 0) + 1;
      write(key, n);
      var pad = String(n);
      while (pad.length < 4) pad = '0' + pad;
      return d + '-' + pad;
    }
  };

  global.TokenStore = api;
})(typeof window !== 'undefined' ? window : this);
