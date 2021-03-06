/*jslint plusplus: true, vars: true, indent: 2 */

(function (global) {
  "use strict";

  // BigInteger.js
  // Available under Public Domain
  // https://github.com/Yaffle/BigInteger/

  // For implementation details, see "The Handbook of Applied Cryptography"
  // http://www.cacr.math.uwaterloo.ca/hac/about/chap14.pdf

  var parseInteger = function (s, from, to, radix) {
    var i = from - 1;
    var n = 0;
    var y = radix < 10 ? radix : 10;
    while (++i < to) {
      var code = s.charCodeAt(i);
      var v = code - 48;
      if (v < 0 || y <= v) {
        v = 10 - 65 + code;
        if (v < 10 || radix <= v) {
          v = 10 - 97 + code;
          if (v < 10 || radix <= v) {
            throw new RangeError();
          }
        }
      }
      n = n * radix + v;
    }
    return n;
  };

  var createArray = function (length) {
    var x = new Array(length);
    var i = -1;
    while (++i < length) {
      x[i] = 0;
    }
    return x;
  };

  // count >= 1
/*  var pow = function (x, count) {
    var accumulator = 1;
    var v = x;
    var c = count;
    while (c > 1) {
      var q = Math.floor(c / 2);
      if (q * 2 !== c) {
        accumulator *= v;
      }
      v *= v;
      c = q;
    }
    return accumulator * v;
  };
*/
  var epsilon = 2 / (9007199254740991 + 1);
  while (1 + epsilon / 2 !== 1) {
    epsilon /= 2;
  }
  var BASE = 2 / epsilon;
  var s = 134217728;
  while (s * s < 2 / epsilon) {
    s *= 2;
  }
  var SPLIT = s + 1;

  // Veltkamp-Dekker's algorithm
  // see http://web.mit.edu/tabbott/Public/quaddouble-debian/qd-2.3.4-old/docs/qd.pdf
  var fma = function (a, b, product) {
    var at = SPLIT * a;
    var ahi = at - (at - a);
    var alo = a - ahi;
    var bt = SPLIT * b;
    var bhi = bt - (bt - b);
    var blo = b - bhi;
    var error = ((ahi * bhi + product) + ahi * blo + alo * bhi) + alo * blo;
    return error;
  };

  var fastTrunc = function (x) {
    var v = (x - BASE) + BASE;
    return v > x ? v - 1 : v;
  };

  var performMultiplication = function (carry, a, b) {
    var product = a * b;
    var error = fma(a, b, -product);

    var hi = fastTrunc(product / BASE);
    var lo = product - hi * BASE + error;

    if (lo < 0) {
      lo += BASE;
      hi -= 1;
    }

    lo += carry - BASE;
    if (lo < 0) {
      lo += BASE;
    } else {
      hi += 1;
    }

    return {lo: lo, hi: hi};
  };

  var performDivision = function (a, b, divisor) {
    if (a >= divisor) {
      throw new RangeError();
    }
    var p = a * BASE;
    var q = fastTrunc(p / divisor);

    var r = 0 - fma(q, divisor, -p);
    if (r < 0) {
      q -= 1;
      r += divisor;
    }

    r += b - divisor;
    if (r < 0) {
      r += divisor;
    } else {
      q += 1;
    }
    var y = fastTrunc(r / divisor);
    r -= y * divisor;
    q += y;
    return {q: q, r: r};
  };

  function BigIntegerInternal(sign, magnitude, length, value) {
    this.sign = sign;
    this.magnitude = magnitude;
    this.length = length;
    this.value = value;
  }

  var createBigInteger = function (sign, magnitude, length, value) {
    return new BigIntegerInternal(sign, magnitude, length, value);
  };

  BigIntegerInternal.parseInt = function (s, radix) {
    if (radix == undefined) {
      radix = 10;
    }
    if (radix !== 10 && (radix < 2 || radix > 36 || radix !== Math.floor(radix))) {
      throw new RangeError("radix argument must be an integer between 2 and 36");
    }
    var length = s.length;
    if (length === 0) {
      throw new RangeError();
    }
    var sign = 0;
    var signCharCode = s.charCodeAt(0);
    var from = 0;
    if (signCharCode === 43) { // "+"
      from = 1;
    }
    if (signCharCode === 45) { // "-"
      from = 1;
      sign = 1;
    }

    length -= from;
    if (length === 0) {
      throw new RangeError();
    }
    if (pow(radix, length) <= BASE) {
      var value = parseInteger(s, from, from + length, radix);
      return createBigInteger(value === 0 ? 0 : sign, undefined, value === 0 ? 0 : 1, value);
    }
    var groupLength = 0;
    var groupRadix = 1;
    var limit = fastTrunc(BASE / radix);
    while (groupRadix <= limit) {
      groupLength += 1;
      groupRadix *= radix;
    }
    var size = Math.floor((length - 1) / groupLength) + 1;

    var magnitude = createArray(size);
    var k = size;
    var i = length;
    while (i > 0) {
      k -= 1;
      magnitude[k] = parseInteger(s, from + (i > groupLength ? i - groupLength : 0), from + i, radix);
      i -= groupLength;
    }

    var j = -1;
    while (++j < size) {
      var c = magnitude[j];
      var l = -1;
      while (++l < j) {
        var tmp = performMultiplication(c, magnitude[l], groupRadix);
        var lo = tmp.lo;
        var hi = tmp.hi;
        magnitude[l] = lo;
        c = hi;
      }
      magnitude[j] = c;
    }

    while (size > 0 && magnitude[size - 1] === 0) {
      size -= 1;
    }

    return createBigInteger(size === 0 ? 0 : sign, magnitude, size, magnitude[0]);
  };

  var compareMagnitude = function (a, b) {
    if (a.length !== b.length) {
      return a.length < b.length ? -1 : +1;
    }
    var i = a.length;
    while (--i >= 0) {
      if ((a.magnitude == undefined ? a.value : a.magnitude[i]) !== (b.magnitude == undefined ? b.value : b.magnitude[i])) {
        return (a.magnitude == undefined ? a.value : a.magnitude[i]) < (b.magnitude == undefined ? b.value : b.magnitude[i]) ? -1 : +1;
      }
    }
    return 0;
  };

  BigIntegerInternal.prototype.compareTo = function (b) {
    var a = this;
    var c = a.sign === b.sign ? compareMagnitude(a, b) : 1;
    return a.sign === 1 ? 0 - c : c; // positive zero will be returned for c === 0
  };

  BigIntegerInternal.prototype.addAndSubtract = function (b, isSubtraction) {
    var a = this;
    var z = compareMagnitude(a, b);
    var resultSign = z < 0 ? (isSubtraction !== 0 ? 1 - b.sign : b.sign) : a.sign;
    var min = z < 0 ? a : b;
    var max = z < 0 ? b : a;
    // |a| <= |b|
    if (min.length === 0) {
      return createBigInteger(resultSign, max.magnitude, max.length, max.value);
    }
    var subtract = 0;
    var resultLength = max.length;
    if (a.sign !== (isSubtraction !== 0 ? 1 - b.sign : b.sign)) {
      subtract = 1;
      if (min.length === resultLength) {
        while (resultLength > 0 && (min.magnitude == undefined ? min.value : min.magnitude[resultLength - 1]) === (max.magnitude == undefined ? max.value : max.magnitude[resultLength - 1])) {
          resultLength -= 1;
        }
      }
      if (resultLength === 0) { // a === (-b)
        return createBigInteger(0, createArray(0), 0, 0);
      }
    }
    // result !== 0
    var result = createArray(resultLength + (1 - subtract));
    var i = -1;
    var c = 0;
    while (++i < resultLength) {
      var aDigit = i < min.length ? (min.magnitude == undefined ? min.value : min.magnitude[i]) : 0;
      c += (max.magnitude == undefined ? max.value : max.magnitude[i]) + (subtract !== 0 ? 0 - aDigit : aDigit - BASE);
      if (c < 0) {
        result[i] = BASE + c;
        c = 0 - subtract;
      } else {
        result[i] = c;
        c = 1 - subtract;
      }
    }
    if (c !== 0) {
      result[resultLength] = c;
      resultLength += 1;
    }
    while (resultLength > 0 && result[resultLength - 1] === 0) {
      resultLength -= 1;
    }
    return createBigInteger(resultSign, result, resultLength, result[0]);
  };

  BigIntegerInternal.prototype.add = function (b) {
    return this.addAndSubtract(b, 0);
  };

  BigIntegerInternal.prototype.subtract = function (b) {
    return this.addAndSubtract(b, 1);
  };

  BigIntegerInternal.prototype.multiply = function (b) {
    var a = this;
    if (a.length === 0 || b.length === 0) {
      return createBigInteger(0, createArray(0), 0, 0);
    }
    var resultSign = a.sign === 1 ? 1 - b.sign : b.sign;
    if (a.length === 1 && (a.magnitude == undefined ? a.value : a.magnitude[0]) === 1) {
      return createBigInteger(resultSign, b.magnitude, b.length, b.value);
    }
    if (b.length === 1 && (b.magnitude == undefined ? b.value : b.magnitude[0]) === 1) {
      return createBigInteger(resultSign, a.magnitude, a.length, a.value);
    }
    var resultLength = a.length + b.length;
    var result = createArray(resultLength);
    var i = -1;
    while (++i < b.length) {
      var c = 0;
      var j = -1;
      while (++j < a.length) {
        var carry = 0;
        c += result[j + i] - BASE;
        if (c >= 0) {
          carry = 1;
        } else {
          c += BASE;
        }
        var tmp = performMultiplication(c, a.magnitude == undefined ? a.value : a.magnitude[j], b.magnitude == undefined ? b.value : b.magnitude[i]);
        var lo = tmp.lo;
        var hi = tmp.hi;
        result[j + i] = lo;
        c = hi + carry;
      }
      result[a.length + i] = c;
    }
    while (resultLength > 0 && result[resultLength - 1] === 0) {
      resultLength -= 1;
    }
    return createBigInteger(resultSign, result, resultLength, result[0]);
  };

  BigIntegerInternal.prototype.pow = function (b) {
    var a = BigIntegerInternal.fromNumber(1);
    for(var i = 0; i < b; i++){
      a = a.multiply(this);
    }
    return a;
  };

  BigIntegerInternal.prototype.log = function (b) {
    var a = createBigInteger(this.sign, this.magnitude, this.length, this.value);
    var comp = 1;
    for(var i = 0; BigInteger.compareTo(a, comp) > 0; i++){
      comp = BigInteger.multiply(comp, b);
    }
    return i - 1;
  };

  BigIntegerInternal.prototype.divideAndRemainder = function (b, isDivision) {
    var a = this;
    if (b.length === 0) {
      throw new RangeError();
    }
    if (a.length === 0) {
      return createBigInteger(0, createArray(0), 0, 0);
    }
    var quotientSign = a.sign === 1 ? 1 - b.sign : b.sign;
    if (b.length === 1 && (b.magnitude == undefined ? b.value : b.magnitude[0]) === 1) {
      if (isDivision !== 0) {
        return createBigInteger(quotientSign, a.magnitude, a.length, a.value);
      }
      return createBigInteger(0, createArray(0), 0, 0);
    }

    var divisorOffset = a.length + 1; // `+ 1` for extra digit in case of normalization
    var divisorAndRemainder = createArray(divisorOffset + b.length + 1); // `+ 1` to avoid `index < length` checks
    var divisor = divisorAndRemainder;
    var remainder = divisorAndRemainder;
    var n = -1;
    while (++n < a.length) {
      remainder[n] = a.magnitude == undefined ? a.value : a.magnitude[n];
    }
    var m = -1;
    while (++m < b.length) {
      divisor[divisorOffset + m] = b.magnitude == undefined ? b.value : b.magnitude[m];
    }

    var top = divisor[divisorOffset + b.length - 1];

    // normalization
    var lambda = 1;
    if (b.length > 1) {
      lambda = fastTrunc(BASE / (top + 1));
      if (lambda > 1) {
        var carry = 0;
        var l = -1;
        while (++l < divisorOffset + b.length) {
          var tmp = performMultiplication(carry, divisorAndRemainder[l], lambda);
          var lo = tmp.lo;
          var hi = tmp.hi;
          divisorAndRemainder[l] = lo;
          carry = hi;
        }
        divisorAndRemainder[divisorOffset + b.length] = carry;
        top = divisor[divisorOffset + b.length - 1];
      }
      // assertion
      if (top < fastTrunc(BASE / 2)) {
        throw new RangeError();
      }
    }

    var shift = a.length - b.length + 1;
    if (shift < 0) {
      shift = 0;
    }
    var quotient = null;
    var quotientLength = 0;

    var i = shift;
    while (--i >= 0) {
      var t = b.length + i;
      var q = BASE - 1;
      if (remainder[t] !== top) {
        var tmp2 = performDivision(remainder[t], remainder[t - 1], top);
        var q2 = tmp2.q;
        //var r2 = tmp2.r;
        q = q2;
      }

      var ax = 0;
      var bx = 0;
      var j = i - 1;
      while (++j <= t) {
        var rj = remainder[j];
        var tmp3 = performMultiplication(bx, q, divisor[divisorOffset + j - i]);
        var lo3 = tmp3.lo;
        var hi3 = tmp3.hi;
        remainder[j] = lo3;
        bx = hi3;
        ax += rj - remainder[j];
        if (ax < 0) {
          remainder[j] = BASE + ax;
          ax = -1;
        } else {
          remainder[j] = ax;
          ax = 0;
        }
      }
      while (ax !== 0) {
        q -= 1;
        var c = 0;
        var k = i - 1;
        while (++k <= t) {
          c += remainder[k] - BASE + divisor[divisorOffset + k - i];
          if (c < 0) {
            remainder[k] = BASE + c;
            c = 0;
          } else {
            remainder[k] = c;
            c = +1;
          }
        }
        ax += c;
      }
      if (isDivision !== 0 && q !== 0) {
        if (quotientLength === 0) {
          quotientLength = i + 1;
          quotient = createArray(quotientLength);
        }
        quotient[i] = q;
      }
    }

    if (isDivision !== 0) {
      if (quotientLength === 0) {
        return createBigInteger(0, createArray(0), 0, 0);
      }
      return createBigInteger(quotientSign, quotient, quotientLength, quotient[0]);
    }

    var remainderLength = a.length + 1;
    if (lambda > 1) {
      var r = 0;
      var p = remainderLength;
      while (--p >= 0) {
        var tmp4 = performDivision(r, remainder[p], lambda);
        var q4 = tmp4.q;
        var r4 = tmp4.r;
        remainder[p] = q4;
        r = r4;
      }
      if (r !== 0) {
        // assertion
        throw new RangeError();
      }
    }
    while (remainderLength > 0 && remainder[remainderLength - 1] === 0) {
      remainderLength -= 1;
    }
    if (remainderLength === 0) {
      return createBigInteger(0, createArray(0), 0, 0);
    }
    var result = createArray(remainderLength);
    var o = -1;
    while (++o < remainderLength) {
      result[o] = remainder[o];
    }
    return createBigInteger(a.sign, result, remainderLength, result[0]);
  };

  BigIntegerInternal.prototype.divide = function (b) {
    return this.divideAndRemainder(b, 1);
  };

  BigIntegerInternal.prototype.remainder = function (b) {
    return this.divideAndRemainder(b, 0);
  };

  BigIntegerInternal.prototype.negate = function () {
    var a = this;
    return createBigInteger(a.length === 0 ? a.sign : 1 - a.sign, a.magnitude, a.length, a.value);
  };

  BigIntegerInternal.prototype.toString = function (radix) {
    if (radix == undefined) {
      radix = 10;
    }
    if (radix !== 10 && (radix < 2 || radix > 36 || radix !== Math.floor(radix))) {
      throw new RangeError("radix argument must be an integer between 2 and 36");
    }

    var a = this;
    var result = a.sign === 1 ? "-" : "";

    var remainderLength = a.length;
    if (remainderLength === 0) {
      return "0";
    }
    if (remainderLength === 1) {
      result += (a.magnitude == undefined ? a.value : a.magnitude[0]).toString(radix);
      return result;
    }
    var groupLength = 0;
    var groupRadix = 1;
    var limit = fastTrunc(BASE / radix);
    while (groupRadix <= limit) {
      groupLength += 1;
      groupRadix *= radix;
    }
    // assertion
    if (groupRadix * radix <= BASE) {
      throw new RangeError();
    }
    var size = remainderLength + Math.floor((remainderLength - 1) / groupLength) + 1;
    var remainder = createArray(size);
    var n = -1;
    while (++n < remainderLength) {
      remainder[n] = (a.magnitude == undefined ? a.value : a.magnitude[n]);
    }

    var k = size;
    while (remainderLength !== 0) {
      var groupDigit = 0;
      var i = remainderLength;
      while (--i >= 0) {
        var tmp = performDivision(groupDigit, remainder[i], groupRadix);
        var q = tmp.q;
        var r = tmp.r;
        remainder[i] = q;
        groupDigit = r;
      }
      while (remainderLength > 0 && remainder[remainderLength - 1] === 0) {
        remainderLength -= 1;
      }
      k -= 1;
      remainder[k] = groupDigit;
    }
    result += remainder[k].toString(radix);
    while (++k < size) {
      var t = remainder[k].toString(radix);
      var j = groupLength - t.length;
      while (--j >= 0) {
        result += "0";
      }
      result += t;
    }
    return result;
  };

  BigIntegerInternal.fromNumber = function (x) {
    return createBigInteger(x < 0 ? 1 : 0, undefined, x === 0 ? 0 : 1, x < 0 ? 0 - x : 0 + x);
  };

  BigIntegerInternal.prototype.toNumber = function () {
    return this.length === 0 ? 0 : (this.length === 1 ? (this.sign === 1 ? 0 - this.value : this.value) : this);
  };

  // noinline
  var parseInt = function (string, radix) {
    try {} catch (e) {}
    return BigIntegerInternal.parseInt(string, radix);
  };
  var valueOf = function (x) {
    if (typeof x === "number") {
      return BigIntegerInternal.fromNumber(x);
    }
    return x;
  };
  var compareTo = function (x, y) {
    try {} catch (e) {}
    var a = valueOf(x);
    var b = valueOf(y);
    return a.compareTo(b);
  };
  var toResult = function (x) {
    return x.toNumber();
  };
  var add = function (x, y) {
    try {} catch (e) {}
    var a = valueOf(x);
    var b = valueOf(y);
    return toResult(a.add(b));
  };
  var subtract = function (x, y) {
    try {} catch (e) {}
    var a = valueOf(x);
    var b = valueOf(y);
    return toResult(a.subtract(b));
  };
  var multiply = function (x, y) {
    try {} catch (e) {}
    var a = valueOf(x);
    var b = valueOf(y);
    return toResult(a.multiply(b));
  };
  var pow = function (x, y) {
    try {} catch (e) {}
    var a = valueOf(x);
    var b = valueOf(y);
    return toResult(a.pow(b));
  };
  var log = function (x, y) {
    try {} catch (e) {}
    var a = valueOf(x);
    var b = valueOf(y);
    return a.log(b);
  };
  var divide = function (x, y) {
    try {} catch (e) {}
    var a = valueOf(x);
    var b = valueOf(y);
    return toResult(a.divide(b));
  };
  var remainder = function (x, y) {
    try {} catch (e) {}
    var a = valueOf(x);
    var b = valueOf(y);
    return toResult(a.remainder(b));
  };
  var negate = function (x) {
    try {} catch (e) {}
    var a = valueOf(x);
    return toResult(a.negate());
  };

  function BigInteger() {
  }
  BigInteger.parseInt = function (string, radix) {
    if (typeof string === "string" && typeof radix === "number") {
      var value = 0 + Number.parseInt(string, radix);
      if (value >= -9007199254740991 && value <= +9007199254740991) {
        return value;
      }
    }
    return parseInt(string, radix);
  };
  BigInteger.compareTo = function (x, y) {
    if (typeof x === "number" && typeof y === "number") {
      return x < y ? -1 : (y < x ? +1 : 0);
    }
    return compareTo(x, y);
  };
  BigInteger.add = function (x, y) {
    if (typeof x === "number" && typeof y === "number") {
      var value = x + y;
      if (value >= -9007199254740991 && value <= +9007199254740991) {
        return value;
      }
    }
    return add(x, y);
  };
  BigInteger.subtract = function (x, y) {
    if (typeof x === "number" && typeof y === "number") {
      var value = x - y;
      if (value >= -9007199254740991 && value <= +9007199254740991) {
        return value;
      }
    }
    return subtract(x, y);
  };
  BigInteger.multiply = function (x, y) {
    if (typeof x === "number" && typeof y === "number") {
      var value = 0 + x * y;
      if (value >= -9007199254740991 && value <= +9007199254740991) {
        return value;
      }
    }
    return multiply(x, y);
  };
  BigInteger.pow = function (x, y) {
    if (typeof x === "number" && typeof y === "number") {
      var value = 0 + pow(x, y);
      if (value >= -9007199254740991 && value <= +9007199254740991) {
        return value;
      }
    }
    return pow(x, y);
  };
  BigInteger.log = function (x, y) {
    if (typeof x === "number" && typeof y === "number") {
      var value = 0 + Math.log(x, y);
      if (value >= -9007199254740991 && value <= +9007199254740991) {
        return value;
      }
    }
    return log(x, y);
  };
  BigInteger.divide = function (x, y) {
    if (typeof x === "number" && typeof y === "number") {
      if (y !== 0) {
        return x === 0 ? 0 : (x > 0 && y > 0) || (x < 0 && y < 0) ? 0 + Math.floor(x / y) : 0 - Math.floor((0 - x) / y);
      }
    }
    return divide(x, y);
  };
  BigInteger.remainder = function (x, y) {
    if (typeof x === "number" && typeof y === "number") {
      if (y !== 0) {
        return 0 + x % y;
      }
    }
    return remainder(x, y);
  };
  BigInteger.negate = function (x) {
    if (typeof x === "number") {
      return 0 - x;
    }
    return negate(x);
  };

  global.BigInteger = BigInteger;

}(this));
