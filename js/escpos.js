(function (global) {
  'use strict';

  var ESC = 0x1b;
  var GS = 0x1d;

  var CP850 =
    'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»' +
    '░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■\u00a0';

  var cpMap = {};
  for (var i = 0; i < CP850.length; i++) {
    cpMap[CP850.charCodeAt(i)] = 0x80 + i;
  }

  function encodeText(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c === 0x2013 || c === 0x2014) {
        out.push(0x2d);
      } else if (c === 0x00d7) {
        out.push(0x78);
      } else if (cpMap[c] !== undefined) {
        out.push(cpMap[c]);
      } else {
        out.push(0x3f);
      }
    }
    return out;
  }

  function EscPos() {
    this.bytes = [];
  }

  EscPos.prototype._add = function (arr) {
    for (var i = 0; i < arr.length; i++) this.bytes.push(arr[i]);
    return this;
  };

  EscPos.prototype._addText = function (str) {
    this._add(encodeText(str));
    return this;
  };

  EscPos.prototype.init = function () {
    this._add([ESC, 0x40]);
    this.align('left');
    this.size(1, 1);
    this.bold(false);
    this.lineSpacing(30);
    return this;
  };

  EscPos.prototype.align = function (a) {
    var m = { left: 0, center: 1, right: 2 };
    this._add([ESC, 0x61, m[a] !== undefined ? m[a] : 0]);
    return this;
  };

  EscPos.prototype.size = function (w, h) {
    w = Math.max(1, Math.min(8, w | 0));
    h = Math.max(1, Math.min(8, h | 0));
    var n = ((w - 1) << 4) | (h - 1);
    this._add([GS, 0x21, n]);
    return this;
  };

  EscPos.prototype.bold = function (on) {
    this._add([ESC, 0x45, on ? 1 : 0]);
    return this;
  };

  EscPos.prototype.lineSpacing = function (n) {
    this._add([ESC, 0x33, n & 0xff]);
    return this;
  };

  EscPos.prototype.codepage = function (n) {
    this._add([ESC, 0x74, n & 0xff]);
    return this;
  };

  EscPos.prototype.text = function (str) {
    this._addText(String(str));
    return this;
  };

  EscPos.prototype.newline = function () {
    this._add([0x0a]);
    return this;
  };

  EscPos.prototype.feed = function (n) {
    this._add([ESC, 0x64, n & 0xff]);
    return this;
  };

  EscPos.prototype.cut = function (partial) {
    this._add([GS, 0x56, partial ? 1 : 0]);
    return this;
  };

  EscPos.prototype.encode = function () {
    return new Uint8Array(this.bytes);
  };

  global.EscPos = EscPos;
})(typeof window !== 'undefined' ? window : this);
