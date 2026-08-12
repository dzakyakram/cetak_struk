(function (global) {
  'use strict';

  var SerialPrinter = function (opts) {
    this.opts = opts || {};
    this.port = null;
  };

  SerialPrinter.prototype.isSupported = function () {
    return 'serial' in navigator;
  };

  SerialPrinter.prototype.connect = async function () {
    if (!this.isSupported()) throw new Error('Web Serial tidak didukung. Gunakan Chrome/Edge.');
    var filters = this.opts.usbVendorId ? [{ usbVendorId: this.opts.usbVendorId }] : undefined;
    this.port = await navigator.serial.requestPort({ filters: filters });
    await this.open();
    return this.getInfo();
  };

  SerialPrinter.prototype.open = async function () {
    var baud = this.opts.baudRate || 9600;
    await this.port.open({
      baudRate: baud,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none'
    });
  };

  SerialPrinter.prototype.print = async function (data) {
    if (!this.port) throw new Error('Belum terhubung');
    var writer = this.port.writable.getWriter();
    try {
      var chunk = 64;
      for (var i = 0; i < data.length; i += chunk) {
        await writer.write(data.subarray(i, i + chunk));
        await new Promise(function (r) { setTimeout(r, 5); });
      }
    } finally {
      writer.releaseLock();
    }
  };

  SerialPrinter.prototype.disconnect = async function () {
    if (this.port) {
      try {
        if (this.port.readable && this.port.readable.locked) {
          this.port.readable.getReader().releaseLock();
        }
        if (this.port.writable && this.port.writable.locked) {
          this.port.writable.getWriter().releaseLock();
        }
      } catch (e) {}
      try { await this.port.close(); } catch (e) {}
      this.port = null;
    }
  };

  SerialPrinter.prototype.reconnect = async function () {
    if (!this.isSupported()) return null;
    var ports = await navigator.serial.getPorts();
    if (ports.length > 0) {
      this.port = ports[0];
      try {
        await this.open();
        return this.getInfo();
      } catch (e) {
        this.port = null;
      }
    }
    return null;
  };

  SerialPrinter.prototype.getInfo = function () {
    var label = 'Serial / COM port';
    var vendorId = null;
    try {
      var usb = this.port.getInfo();
      vendorId = usb.usbVendorId;
      if (vendorId) label += ' (VID ' + vendorId.toString(16) + ')';
    } catch (e) {}
    return { type: 'serial', label: label, info: { vendorId: vendorId } };
  };

  var UsbPrinter = function (opts) {
    this.opts = opts || {};
    this.device = null;
    this.endpoint = null;
  };

  UsbPrinter.prototype.isSupported = function () {
    return 'usb' in navigator;
  };

  UsbPrinter.prototype.connect = async function () {
    if (!this.isSupported()) throw new Error('WebUSB tidak didukung. Gunakan Chrome/Edge.');
    this.device = await navigator.usb.requestDevice({ filters: [] });
    await this.open();
    return this.getInfo();
  };

  UsbPrinter.prototype.open = async function () {
    var d = this.device;
    await d.open();
    if (!d.configuration) {
      await d.selectConfiguration(1);
    }
    var ep = this._findOutEndpoint();
    if (!ep) {
      await this._close();
      throw new Error('Endpoint output tidak ditemukan pada printer. Mungkin printer-nya bertipe serial, coba Koneksi Serial.');
    }
    var ifaceNum = this._findInterface();
    try {
      await d.claimInterface(ifaceNum);
    } catch (e) {
      await this._close();
      throw new Error('Tidak bisa mengakses interface printer. Di Windows, driver usbprint.sys sering memblokir. Coba Koneksi Serial, atau ganti driver dengan WinUSB (lihat README).');
    }
    this.endpoint = ep;
  };

  UsbPrinter.prototype._findInterface = function () {
    var cfg = this.device.configuration;
    if (!cfg) return 0;
    for (var i = 0; i < cfg.interfaces.length; i++) {
      var iface = cfg.interfaces[i];
      var alt = iface.alternates && iface.alternates[0];
      if (alt && alt.endpoints) {
        for (var j = 0; j < alt.endpoints.length; j++) {
          var ep = alt.endpoints[j];
          if (ep.direction === 'out' && (ep.type === 'bulk' || ep.type === 'interrupt')) {
            return iface.interfaceNumber;
          }
        }
      }
    }
    return 0;
  };

  UsbPrinter.prototype._findOutEndpoint = function () {
    var cfg = this.device.configuration;
    if (!cfg) return null;
    for (var i = 0; i < cfg.interfaces.length; i++) {
      var iface = cfg.interfaces[i];
      var alt = iface.alternates && iface.alternates[0];
      if (alt && alt.endpoints) {
        for (var j = 0; j < alt.endpoints.length; j++) {
          var ep = alt.endpoints[j];
          if (ep.direction === 'out' && (ep.type === 'bulk' || ep.type === 'interrupt')) {
            return ep;
          }
        }
      }
    }
    return null;
  };

  UsbPrinter.prototype.print = async function (data) {
    if (!this.device) throw new Error('Belum terhubung');
    var chunk = 128;
    for (var i = 0; i < data.length; i += chunk) {
      await this.device.transferOut(this.endpoint.endpointNumber, data.subarray(i, i + chunk));
    }
  };

  UsbPrinter.prototype._close = async function () {
    try { await this.device.close(); } catch (e) {}
  };

  UsbPrinter.prototype.disconnect = async function () {
    if (this.device) {
      await this._close();
      this.device = null;
      this.endpoint = null;
    }
  };

  UsbPrinter.prototype.reconnect = async function () {
    if (!this.isSupported()) return null;
    var devices = await navigator.usb.getDevices();
    if (devices.length > 0) {
      this.device = devices[0];
      try {
        await this.open();
        return this.getInfo();
      } catch (e) {
        this.device = null;
      }
    }
    return null;
  };

  UsbPrinter.prototype.getInfo = function () {
    var d = this.device;
    return {
      type: 'usb',
      label: (d.productName || 'Printer USB') + ' (VID ' + d.vendorId.toString(16) + ':PID ' + d.productId.toString(16) + ')',
      info: { vendorId: d.vendorId, productId: d.productId }
    };
  };

  var BLE_SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000ffe5-0000-1000-8000-00805f9b34fb',
    '0000fff0-0000-1000-8000-00805f9b34fb',
    '0000ae30-0000-1000-8000-00805f9b34fb'
  ];

  var BlePrinter = function (opts) {
    this.opts = opts || {};
    this.device = null;
    this.server = null;
    this.char = null;
  };

  BlePrinter.prototype.isSupported = function () {
    return 'bluetooth' in navigator;
  };

  BlePrinter.prototype.connect = async function () {
    if (!this.isSupported()) throw new Error('Web Bluetooth tidak didukung. Gunakan Chrome/Edge.');
    this.device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_SERVICES
    });
    await this.open();
    return this.getInfo();
  };

  BlePrinter.prototype.open = async function () {
    var server = await this.device.gatt.connect();
    this.server = server;
    var found = null;
    for (var i = 0; i < BLE_SERVICES.length && !found; i++) {
      var service;
      try {
        service = await server.getPrimaryService(BLE_SERVICES[i]);
      } catch (e) {
        continue;
      }
      var chars = await service.getCharacteristics();
      for (var j = 0; j < chars.length; j++) {
        var c = chars[j];
        if (c.properties.write || c.properties.writeWithoutResponse) {
          found = c;
          break;
        }
      }
    }
    if (!found) {
      await this.disconnect();
      throw new Error('Service BLE printer tidak dikenali. Gunakan ble-test.html untuk cek UUID.');
    }
    this.char = found;
  };

  BlePrinter.prototype.print = async function (data) {
    if (!this.char) throw new Error('Belum terhubung');
    var chunk = 120;
    for (var i = 0; i < data.length;) {
      var part = data.subarray(i, i + chunk);
      try {
        if (this.char.properties.writeWithoutResponse) {
          await this.char.writeValueWithoutResponse(part);
        } else {
          await this.char.writeValue(part);
        }
        i += chunk;
      } catch (e) {
        if (chunk <= 20) throw new Error('Gagal kirim via Bluetooth: ' + e.message);
        chunk = Math.max(20, Math.floor(chunk / 2));
      }
      await new Promise(function (r) { setTimeout(r, 30); });
    }
  };

  BlePrinter.prototype.disconnect = async function () {
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      try { await this.device.gatt.disconnect(); } catch (e) {}
    }
    this.device = null;
    this.server = null;
    this.char = null;
  };

  BlePrinter.prototype.reconnect = async function () {
    if (!this.isSupported()) return null;
    try {
      var devices = await navigator.bluetooth.getDevices();
      if (devices.length > 0) {
        this.device = devices[0];
        await this.open();
        return this.getInfo();
      }
    } catch (e) {
      this.device = null;
    }
    return null;
  };

  BlePrinter.prototype.getInfo = function () {
    var d = this.device;
    return {
      type: 'ble',
      label: 'Bluetooth: ' + (d && d.name ? d.name : 'Printer BLE'),
      info: { id: d && d.id }
    };
  };

  var BridgePrinter = function (opts) {
    this.opts = opts || {};
    this.url = this.opts.url || 'http://localhost:3000';
    this.printerName = this.opts.printerName || 'CSC MP-58M';
    this.connected = false;
    this.printers = [];
  };

  BridgePrinter.prototype.setPrinterName = function (name) {
    this.printerName = name;
    return fetch(this.url + '/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printer: name })
    }).then(function (r) { return r.json(); });
  };

  BridgePrinter.prototype._get = function (path) {
    return fetch(this.url + path).then(function (r) {
      if (!r.ok) throw new Error('Bridge tidak merespon (' + r.status + ')');
      return r.json();
    });
  };

  BridgePrinter.prototype.isSupported = function () {
    return true;
  };

  BridgePrinter.prototype.connect = async function () {
    var info = await this._get('/');
    var resp = await this._get('/printers');
    this.printers = resp.printers || [];
    if (resp.current) this.printerName = resp.current;
    if (this.printers.length === 0) throw new Error('Tidak ada printer Windows terpasang. Jalankan install-printer.bat dulu.');
    this.connected = true;
    return this.getInfo();
  };

  BridgePrinter.prototype.getInfo = function () {
    return {
      type: 'bridge',
      label: 'Bridge Windows -> ' + this.printerName,
      info: { printer: this.printerName }
    };
  };

  BridgePrinter.prototype.print = async function (data) {
    if (!this.connected) throw new Error('Belum terhubung');
    var resp = await fetch(this.url + '/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data
    });
    var result = await resp.json();
    if (!resp.ok || !result.ok) {
      throw new Error(result.error || 'Bridge gagal mencetak.');
    }
  };

  BridgePrinter.prototype.disconnect = async function () {
    this.connected = false;
  };

  BridgePrinter.prototype.reconnect = async function () {
    try {
      var info = await this._get('/');
      var resp = await this._get('/printers');
      this.printers = resp.printers || [];
      if (resp.current) this.printerName = resp.current;
      this.connected = true;
      return this.getInfo();
    } catch (e) {
      this.connected = false;
      return null;
    }
  };

  var PrinterManager = function (opts) {
    opts = opts || {};
    this.serial = new SerialPrinter({ baudRate: opts.baudRate });
    this.usb = new UsbPrinter();
    this.ble = new BlePrinter();
    this.bridge = new BridgePrinter({ url: opts.bridgeUrl, printerName: opts.bridgePrinter });
    this.active = null;
    this.activeType = null;
  };

  PrinterManager.prototype.setBaudRate = function (baud) {
    this.serial = new SerialPrinter({ baudRate: baud });
    if (this.active && this.activeType === 'serial') {
      var old = this.active;
      this.active = null;
      old.disconnect().then(() => this.serial.reconnect());
    }
  };

  PrinterManager.prototype.connect = async function (type) {
    var info;
    if (type === 'bridge') {
      if (this.active) await this.disconnect();
      info = await this.bridge.connect();
      this.active = this.bridge;
      this.activeType = 'bridge';
    } else if (type === 'ble') {
      if (!this.ble.isSupported()) throw new Error('Web Bluetooth tidak didukung. Gunakan Chrome/Edge.');
      if (this.active) await this.disconnect();
      info = await this.ble.connect();
      this.active = this.ble;
      this.activeType = 'ble';
    } else if (type === 'usb') {
      if (!this.usb.isSupported()) throw new Error('WebUSB tidak didukung. Gunakan Chrome/Edge.');
      if (this.active) await this.disconnect();
      info = await this.usb.connect();
      this.active = this.usb;
      this.activeType = 'usb';
    } else {
      if (!this.serial.isSupported()) throw new Error('Web Serial tidak didukung. Gunakan Chrome/Edge.');
      if (this.active) await this.disconnect();
      info = await this.serial.connect();
      this.active = this.serial;
      this.activeType = 'serial';
    }
    return info;
  };

  PrinterManager.prototype.print = function (data) {
    if (!this.active) return Promise.reject(new Error('Printer belum terhubung. Klik Koneksi dulu.'));
    return this.active.print(data);
  };

  PrinterManager.prototype.disconnect = async function () {
    if (this.active) {
      await this.active.disconnect();
    }
    this.active = null;
    this.activeType = null;
  };

  PrinterManager.prototype.autoReconnect = async function (pref) {
    var i;
    if (pref === 'serial' && this.serial.isSupported()) {
      i = await this.serial.reconnect();
      if (i) { this.active = this.serial; this.activeType = 'serial'; return i; }
    } else if (pref === 'usb' && this.usb.isSupported()) {
      i = await this.usb.reconnect();
      if (i) { this.active = this.usb; this.activeType = 'usb'; return i; }
    } else if (pref === 'bridge') {
      i = await this.bridge.reconnect();
      if (i) { this.active = this.bridge; this.activeType = 'bridge'; return i; }
    } else if (pref === 'ble') {
      i = await this.ble.reconnect();
      if (i) { this.active = this.ble; this.activeType = 'ble'; return i; }
    } else if (pref === 'auto') {
      i = await this.bridge.reconnect();
      if (i) { this.active = this.bridge; this.activeType = 'bridge'; return i; }
      if (this.ble.isSupported()) {
        i = await this.ble.reconnect();
        if (i) { this.active = this.ble; this.activeType = 'ble'; return i; }
      }
      if (this.serial.isSupported()) {
        i = await this.serial.reconnect();
        if (i) { this.active = this.serial; this.activeType = 'serial'; return i; }
      }
      if (this.usb.isSupported()) {
        i = await this.usb.reconnect();
        if (i) { this.active = this.usb; this.activeType = 'usb'; return i; }
      }
    }
    return null;
  };

  global.PrinterManager = PrinterManager;
})(typeof window !== 'undefined' ? window : this);
