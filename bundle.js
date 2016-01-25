(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('is-array')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var kMaxLength = 0x3fffffff
var rootParent = {}

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Note:
 *
 * - Implementation must support adding new properties to `Uint8Array` instances.
 *   Firefox 4-29 lacked support, fixed in Firefox 30+.
 *   See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *  - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *  - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *    incorrect length in some situations.
 *
 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they will
 * get the Object implementation, which is slower but will work correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = (function () {
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return arr.foo() === 42 && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        new Uint8Array(1).subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (arg) {
  if (!(this instanceof Buffer)) {
    // Avoid going through an ArgumentsAdaptorTrampoline in the common case.
    if (arguments.length > 1) return new Buffer(arg, arguments[1])
    return new Buffer(arg)
  }

  this.length = 0
  this.parent = undefined

  // Common case.
  if (typeof arg === 'number') {
    return fromNumber(this, arg)
  }

  // Slightly less common case.
  if (typeof arg === 'string') {
    return fromString(this, arg, arguments.length > 1 ? arguments[1] : 'utf8')
  }

  // Unusual.
  return fromObject(this, arg)
}

function fromNumber (that, length) {
  that = allocate(that, length < 0 ? 0 : checked(length) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < length; i++) {
      that[i] = 0
    }
  }
  return that
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') encoding = 'utf8'

  // Assumption: byteLength() return value is always < kMaxLength.
  var length = byteLength(string, encoding) | 0
  that = allocate(that, length)

  that.write(string, encoding)
  return that
}

function fromObject (that, object) {
  if (Buffer.isBuffer(object)) return fromBuffer(that, object)

  if (isArray(object)) return fromArray(that, object)

  if (object == null) {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (typeof ArrayBuffer !== 'undefined' && object.buffer instanceof ArrayBuffer) {
    return fromTypedArray(that, object)
  }

  if (object.length) return fromArrayLike(that, object)

  return fromJsonObject(that, object)
}

function fromBuffer (that, buffer) {
  var length = checked(buffer.length) | 0
  that = allocate(that, length)
  buffer.copy(that, 0, 0, length)
  return that
}

function fromArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Duplicate of fromArray() to keep fromArray() monomorphic.
function fromTypedArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  // Truncating the elements is probably not what people expect from typed
  // arrays with BYTES_PER_ELEMENT > 1 but it's compatible with the behavior
  // of the old Buffer constructor.
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Deserialize { type: 'Buffer', data: [1,2,3,...] } into a Buffer object.
// Returns a zero-length buffer for inputs that don't conform to the spec.
function fromJsonObject (that, object) {
  var array
  var length = 0

  if (object.type === 'Buffer' && isArray(object.data)) {
    array = object.data
    length = checked(array.length) | 0
  }
  that = allocate(that, length)

  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function allocate (that, length) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return an object instance of the Buffer class
    that.length = length
    that._isBuffer = true
  }

  var fromPool = length !== 0 && length <= Buffer.poolSize >>> 1
  if (fromPool) that.parent = rootParent

  return that
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (subject, encoding) {
  if (!(this instanceof SlowBuffer)) return new SlowBuffer(subject, encoding)

  var buf = new Buffer(subject, encoding)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  var i = 0
  var len = Math.min(x, y)
  while (i < len) {
    if (a[i] !== b[i]) break

    ++i
  }

  if (i !== len) {
    x = a[i]
    y = b[i]
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) throw new TypeError('list argument must be an Array of Buffers.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; i++) {
      length += list[i].length
    }
  }

  var buf = new Buffer(length)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

function byteLength (string, encoding) {
  if (typeof string !== 'string') string = String(string)

  if (string.length === 0) return 0

  switch (encoding || 'utf8') {
    case 'ascii':
    case 'binary':
    case 'raw':
      return string.length
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return string.length * 2
    case 'hex':
      return string.length >>> 1
    case 'utf8':
    case 'utf-8':
      return utf8ToBytes(string).length
    case 'base64':
      return base64ToBytes(string).length
    default:
      return string.length
  }
}
Buffer.byteLength = byteLength

// pre-set for values that may exist in the future
Buffer.prototype.length = undefined
Buffer.prototype.parent = undefined

// toString(encoding, start=0, end=buffer.length)
Buffer.prototype.toString = function toString (encoding, start, end) {
  var loweredCase = false

  start = start | 0
  end = end === undefined || end === Infinity ? this.length : end | 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return 0
  return Buffer.compare(this, b)
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset) {
  if (byteOffset > 0x7fffffff) byteOffset = 0x7fffffff
  else if (byteOffset < -0x80000000) byteOffset = -0x80000000
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    if (val.length === 0) return -1 // special case: looking for empty string always fails
    return String.prototype.indexOf.call(this, val, byteOffset)
  }
  if (Buffer.isBuffer(val)) {
    return arrayIndexOf(this, val, byteOffset)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset)
  }

  function arrayIndexOf (arr, val, byteOffset) {
    var foundIndex = -1
    for (var i = 0; byteOffset + i < arr.length; i++) {
      if (arr[byteOffset + i] === val[foundIndex === -1 ? 0 : i - foundIndex]) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === val.length) return byteOffset + foundIndex
      } else {
        foundIndex = -1
      }
    }
    return -1
  }

  throw new TypeError('val must be string, number or Buffer')
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function get (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function set (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) throw new Error('Invalid hex string')
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    var swap = encoding
    encoding = offset
    offset = length | 0
    length = swap
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'binary':
        return binaryWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length) newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = value
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = value
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = value
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), targetStart)
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function toArrayBuffer () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function _augment (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array set method before overwriting
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.indexOf = BP.indexOf
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUIntLE = BP.readUIntLE
  arr.readUIntBE = BP.readUIntBE
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readIntLE = BP.readIntLE
  arr.readIntBE = BP.readIntBE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUIntLE = BP.writeUIntLE
  arr.writeUIntBE = BP.writeUIntBE
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeIntLE = BP.writeIntLE
  arr.writeIntBE = BP.writeIntBE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-z\-]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []
  var i = 0

  for (; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (leadSurrogate) {
        // 2 leads in a row
        if (codePoint < 0xDC00) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          leadSurrogate = codePoint
          continue
        } else {
          // valid surrogate pair
          codePoint = leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00 | 0x10000
          leadSurrogate = null
        }
      } else {
        // no lead yet

        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else {
          // valid lead
          leadSurrogate = codePoint
          continue
        }
      }
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
      leadSurrogate = null
    }

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x200000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

},{"base64-js":2,"ieee754":3,"is-array":4}],2:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],3:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],4:[function(require,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}],5:[function(require,module,exports){
var img = require('./img.js')
module.exports = {
    "earth" : img(7)
    ,"earthGRASS" : img(8)
    ,"background" : img(10)
    ,"flag" : img(23)
    ,"cupobstacle" : img(15)
   ,"clouds" : img(9)
}
},{"./img.js":8}],6:[function(require,module,exports){
var img = require('./img.js')
module.exports = {
    "guyjl": img(0)
    ,"guyjr" : img(1)
    ,"guywl" : img(2)
    ,"guywr" : img(3)
    ,"guyl" : img(4)
    ,"guyr" : img(5)
    ,"sweatleft": img(28)
    ,"sweatright": img(27)
    ,"health" : img(21)
    ,"hydration" : img(22)
    ,"youwin" : img(26)
    ,"vitaman" : img(29)
}
},{"./img.js":8}],7:[function(require,module,exports){
module.exports = [
  "art/sprites/guyjumpleft.png"
  ,"art/sprites/guyjumpright.png"
  ,"art/sprites/guywalkleft.png"
  ,"art/sprites/guywalkright.png"
  ,"art/sprites/guyleft.png"
  ,"art/sprites/guyright.png"
  ,"art/sprites/sweatleft.png"
  
  ,"art/sprites/earth.png"
  ,"art/sprites/earthGRASS.png"
  ,"art/sprites/clouds.png"
  ,"art/sprites/background64.png"

  ,"art/sprites/apple.png"
  ,"art/sprites/brocoli.png"
  ,"art/sprites/candy.png"
  ,"art/sprites/carrot.png"
  ,"art/sprites/cupobstacle.png"
  ,"art/sprites/icecream.png"
  ,"art/sprites/orange.png"
  ,"art/sprites/strawberry.png"
  ,"art/sprites/water.png"
  ,"art/sprites/watermelon.png"
  
  ,"art/sprites/hydrationbar.png"
  ,"art/sprites/healthbar.png"
  ,"art/sprites/flag.png"
  ,"art/sprites/chocolate.png"
  ,"art/sprites/banana.png"
  ,"art/sprites/YouWin.png"
  ,"art/sprites/sweatleft.png"
  ,"art/sprites/sweatright.png"
  ,"art/sprites/VITAMAN.png"
]
},{}],8:[function(require,module,exports){
var imgsrc = require("./img-src.js")

module.exports = function(index) {
  var image = new Image()
      image.src = imgsrc[index]
  return image
}
},{"./img-src.js":7}],9:[function(require,module,exports){
var img = require('./img.js')
module.exports = {
  "apple" : img(11)
  ,"banana" : img(25)
  ,"brocoli" : img(12)
  ,"candy" : img(13)
  ,"carrot" : img(14)
  ,"chocolate" : img(24)
  ,"icecream" : img(16)
  ,"orange" : img(17)
  ,"strawberry" : img(18)
  ,"water" : img(19)
  ,"watermelon" : img(20)
}
},{"./img.js":8}],10:[function(require,module,exports){
var intersect = require('box-intersect')
function Level(images, items){
    this.images = images
    this.items = items
    this.itemTypes = ["apple", "banana", "brocoli", "candy", "carrot", "chocolate", "icecream", "orange", "strawberry", "water", "watermelon"]
    this.size = 64
    this.ground = [[0,0,64,64]]
    this.groundDirt = []
    this.sky = []
    this.foods = []
    this.foodsNames = []
}

Level.prototype.draw = function(ctx){
    for (var i = 0; i < this.foods.length; i++){
        this.foods[i][1] += this.animate()
        this.foods[i][3] += this.animate()
    }
    for (var i = 0; i < this.ground.length; i++){
        ctx.drawImage( this.images["earthGRASS"], this.ground[i][0], this.ground[i][1], this.ground[i][2] - this.ground[i][0], this.ground[i][3] - this.ground[i][1] )
    }
    for (var i = 0; i < this.groundDirt.length; i++){
        ctx.drawImage( this.images["earth"], this.groundDirt[i][0], this.groundDirt[i][1], this.groundDirt[i][2] - this.groundDirt[i][0], this.groundDirt[i][3] - this.groundDirt[i][1] )
    }
    for (var i = 0; i < this.foods.length; i++){
        ctx.drawImage( this.items[this.foodsNames[i]], this.foods[i][0], this.foods[i][1], this.foods[i][2] - this.foods[i][0], this.foods[i][3] - this.foods[i][1] )
    }
    var i = this.ground.length - 1
    ctx.drawImage( this.images.flag, this.ground[i][0], this.ground[i][1]-this.size, this.ground[i][2] - this.ground[i][0], this.ground[i][3] - this.ground[i][1])
}

Level.prototype.animate = function(){
    return 0.1*Math.cos(performance.now()/200)
}

Level.prototype.drawClouds = function(ctx){
    for (var i = 0; i < this.sky.length; i++){
        ctx.drawImage( this.images["clouds"], this.sky[i][0], this.sky[i][1], this.sky[i][2] - this.sky[i][0], this.sky[i][3] - this.sky[i][1] )
    }
}

Level.prototype.makeCloud = function(canvas){
    var s = Math.floor(Math.random()*128+64)
    var rx1 = Math.floor(Math.random()*(canvas.width-s))
    var rx2 = rx1 + s
    var ry1 = Math.floor(Math.random()*(canvas.height-s))
    var ry2 = ry1 + s
    var arr = [rx1, ry1, rx2, ry2]
    return intersect(this.sky, [arr]).length > 0 ? this.makeCloud(canvas) : arr
}

Level.prototype.makeGround = function(n){
    var arr = []
    for(var i = 0; i < n; i++){
        arr[i] = Math.random() < 0.2 ? 0 : 1
        if(arr[i] == 0){
            arr[i+1] = 1
            i++
        }
    }
    
    for(var i = 1; i < arr.length; i++){
        if (arr[i] === 1){
            this.ground.push([i*this.size, 0,  (i+1)*this.size, this.size])
            if(Math.random() < 0.4 && i < arr.length - 2){
                this.foods.push([i*this.size+this.size*1/4, -this.size+this.size*2/4,  (i+1)*this.size - this.size*1/4, 0])
                this.foodsNames.push(this.itemTypes[Math.floor(Math.random()*this.itemTypes.length)])
            }
            if(Math.random() < 0.4){
                this.groundDirt.push([i*this.size, this.size,  (i+1)*this.size, this.size*2])
                if(Math.random() < 0.4)
                    this.groundDirt.push([i*this.size, this.size*2,  (i+1)*this.size, this.size*3])
            }
        }
    }
}

Level.prototype.makeSky = function(canvas, n){
    for (var i = 0; i < n; i++){
        this.sky.push(this.makeCloud(canvas))
    }
}

Level.prototype.collision = function(box){
    return intersect(this.ground, [box]).length > 0
}

Level.prototype.collection = function(box){
    for (var i = 0; i < this.foods.length; i++) {
        if(intersect([this.foods[i]], [box]).length > 0){
            this.foods.splice(i, 1)
            return this.foodsNames.splice(i, 1)
        }
    }
}

Level.prototype.victory = function(box){
    return intersect([this.ground[this.ground.length-1]], [box]).length > 0
}

module.exports = Level
},{"box-intersect":11}],11:[function(require,module,exports){
'use strict'

module.exports = boxIntersectWrapper

var pool = require('typedarray-pool')
var sweep = require('./lib/sweep')
var boxIntersectIter = require('./lib/intersect')

function boxEmpty(d, box) {
  for(var j=0; j<d; ++j) {
    if(!(box[j] <= box[j+d])) {
      return true
    }
  }
  return false
}

//Unpack boxes into a flat typed array, remove empty boxes
function convertBoxes(boxes, d, data, ids) {
  var ptr = 0
  var count = 0
  for(var i=0, n=boxes.length; i<n; ++i) {
    var b = boxes[i]
    if(boxEmpty(d, b)) {
      continue
    }
    for(var j=0; j<2*d; ++j) {
      data[ptr++] = b[j]
    }
    ids[count++] = i
  }
  return count
}

//Perform type conversions, check bounds
function boxIntersect(red, blue, visit, full) {
  var n = red.length
  var m = blue.length

  //If either array is empty, then we can skip this whole thing
  if(n <= 0 || m <= 0) {
    return
  }

  //Compute dimension, if it is 0 then we skip
  var d = (red[0].length)>>>1
  if(d <= 0) {
    return
  }

  var retval

  //Convert red boxes
  var redList  = pool.mallocDouble(2*d*n)
  var redIds   = pool.mallocInt32(n)
  n = convertBoxes(red, d, redList, redIds)

  if(n > 0) {
    if(d === 1 && full) {
      //Special case: 1d complete
      sweep.init(n)
      retval = sweep.sweepComplete(
        d, visit, 
        0, n, redList, redIds,
        0, n, redList, redIds)
    } else {

      //Convert blue boxes
      var blueList = pool.mallocDouble(2*d*m)
      var blueIds  = pool.mallocInt32(m)
      m = convertBoxes(blue, d, blueList, blueIds)

      if(m > 0) {
        sweep.init(n+m)

        if(d === 1) {
          //Special case: 1d bipartite
          retval = sweep.sweepBipartite(
            d, visit, 
            0, n, redList,  redIds,
            0, m, blueList, blueIds)
        } else {
          //General case:  d>1
          retval = boxIntersectIter(
            d, visit,    full,
            n, redList,  redIds,
            m, blueList, blueIds)
        }

        pool.free(blueList)
        pool.free(blueIds)
      }
    }

    pool.free(redList)
    pool.free(redIds)
  }

  return retval
}


var RESULT

function appendItem(i,j) {
  RESULT.push([i,j])
}

function intersectFullArray(x) {
  RESULT = []
  boxIntersect(x, x, appendItem, true)
  return RESULT
}

function intersectBipartiteArray(x, y) {
  RESULT = []
  boxIntersect(x, y, appendItem, false)
  return RESULT
}

//User-friendly wrapper, handle full input and no-visitor cases
function boxIntersectWrapper(arg0, arg1, arg2) {
  var result
  switch(arguments.length) {
    case 1:
      return intersectFullArray(arg0)
    case 2:
      if(typeof arg1 === 'function') {
        return boxIntersect(arg0, arg0, arg1, true)
      } else {
        return intersectBipartiteArray(arg0, arg1)
      }
    case 3:
      return boxIntersect(arg0, arg1, arg2, false)
    default:
      throw new Error('box-intersect: Invalid arguments')
  }
}
},{"./lib/intersect":13,"./lib/sweep":17,"typedarray-pool":20}],12:[function(require,module,exports){
'use strict'

var DIMENSION   = 'd'
var AXIS        = 'ax'
var VISIT       = 'vv'
var FLIP        = 'fp'

var ELEM_SIZE   = 'es'

var RED_START   = 'rs'
var RED_END     = 're'
var RED_BOXES   = 'rb'
var RED_INDEX   = 'ri'
var RED_PTR     = 'rp'

var BLUE_START  = 'bs'
var BLUE_END    = 'be'
var BLUE_BOXES  = 'bb'
var BLUE_INDEX  = 'bi'
var BLUE_PTR    = 'bp'

var RETVAL      = 'rv'

var INNER_LABEL = 'Q'

var ARGS = [
  DIMENSION,
  AXIS,
  VISIT,
  RED_START,
  RED_END,
  RED_BOXES,
  RED_INDEX,
  BLUE_START,
  BLUE_END,
  BLUE_BOXES,
  BLUE_INDEX
]

function generateBruteForce(redMajor, flip, full) {
  var funcName = 'bruteForce' + 
    (redMajor ? 'Red' : 'Blue') + 
    (flip ? 'Flip' : '') +
    (full ? 'Full' : '')

  var code = ['function ', funcName, '(', ARGS.join(), '){',
    'var ', ELEM_SIZE, '=2*', DIMENSION, ';']

  var redLoop = 
    'for(var i=' + RED_START + ',' + RED_PTR + '=' + ELEM_SIZE + '*' + RED_START + ';' +
        'i<' + RED_END +';' +
        '++i,' + RED_PTR + '+=' + ELEM_SIZE + '){' +
        'var x0=' + RED_BOXES + '[' + AXIS + '+' + RED_PTR + '],' +
            'x1=' + RED_BOXES + '[' + AXIS + '+' + RED_PTR + '+' + DIMENSION + '],' +
            'xi=' + RED_INDEX + '[i];'

  var blueLoop = 
    'for(var j=' + BLUE_START + ',' + BLUE_PTR + '=' + ELEM_SIZE + '*' + BLUE_START + ';' +
        'j<' + BLUE_END + ';' +
        '++j,' + BLUE_PTR + '+=' + ELEM_SIZE + '){' +
        'var y0=' + BLUE_BOXES + '[' + AXIS + '+' + BLUE_PTR + '],' +
            (full ? 'y1=' + BLUE_BOXES + '[' + AXIS + '+' + BLUE_PTR + '+' + DIMENSION + '],' : '') +
            'yi=' + BLUE_INDEX + '[j];'

  if(redMajor) {
    code.push(redLoop, INNER_LABEL, ':', blueLoop)
  } else {
    code.push(blueLoop, INNER_LABEL, ':', redLoop)
  }

  if(full) {
    code.push('if(y1<x0||x1<y0)continue;')
  } else if(flip) {
    code.push('if(y0<=x0||x1<y0)continue;')
  } else {
    code.push('if(y0<x0||x1<y0)continue;')
  }

  code.push('for(var k='+AXIS+'+1;k<'+DIMENSION+';++k){'+
    'var r0='+RED_BOXES+'[k+'+RED_PTR+'],'+
        'r1='+RED_BOXES+'[k+'+DIMENSION+'+'+RED_PTR+'],'+
        'b0='+BLUE_BOXES+'[k+'+BLUE_PTR+'],'+
        'b1='+BLUE_BOXES+'[k+'+DIMENSION+'+'+BLUE_PTR+'];'+
      'if(r1<b0||b1<r0)continue ' + INNER_LABEL + ';}' +
      'var ' + RETVAL + '=' + VISIT + '(')

  if(flip) {
    code.push('yi,xi')
  } else {
    code.push('xi,yi')
  }

  code.push(');if(' + RETVAL + '!==void 0)return ' + RETVAL + ';}}}')

  return {
    name: funcName, 
    code: code.join('')
  }
}

function bruteForcePlanner(full) {
  var funcName = 'bruteForce' + (full ? 'Full' : 'Partial')
  var prefix = []
  var fargs = ARGS.slice()
  if(!full) {
    fargs.splice(3, 0, FLIP)
  }

  var code = ['function ' + funcName + '(' + fargs.join() + '){']

  function invoke(redMajor, flip) {
    var res = generateBruteForce(redMajor, flip, full)
    prefix.push(res.code)
    code.push('return ' + res.name + '(' + ARGS.join() + ');')
  }

  code.push('if(' + RED_END + '-' + RED_START + '>' +
                    BLUE_END + '-' + BLUE_START + '){')

  if(full) {
    invoke(true, false)
    code.push('}else{')
    invoke(false, false)
  } else {
    code.push('if(' + FLIP + '){')
    invoke(true, true)
    code.push('}else{')
    invoke(true, false)
    code.push('}}else{if(' + FLIP + '){')
    invoke(false, true)
    code.push('}else{')
    invoke(false, false)
    code.push('}')
  }
  code.push('}}return ' + funcName)

  var codeStr = prefix.join('') + code.join('')
  var proc = new Function(codeStr)
  return proc()
}


exports.partial = bruteForcePlanner(false)
exports.full    = bruteForcePlanner(true)
},{}],13:[function(require,module,exports){
'use strict'

module.exports = boxIntersectIter

var pool = require('typedarray-pool')
var bits = require('bit-twiddle')
var bruteForce = require('./brute')
var bruteForcePartial = bruteForce.partial
var bruteForceFull = bruteForce.full
var sweep = require('./sweep')
var findMedian = require('./median')
var genPartition = require('./partition')

//Twiddle parameters
var BRUTE_FORCE_CUTOFF    = 128       //Cut off for brute force search
var SCAN_CUTOFF           = (1<<22)   //Cut off for two way scan
var SCAN_COMPLETE_CUTOFF  = (1<<22)  

//Partition functions
var partitionInteriorContainsInterval = genPartition(
  '!(lo>=p0)&&!(p1>=hi)', 
  ['p0', 'p1'])

var partitionStartEqual = genPartition(
  'lo===p0',
  ['p0'])

var partitionStartLessThan = genPartition(
  'lo<p0',
  ['p0'])

var partitionEndLessThanEqual = genPartition(
  'hi<=p0',
  ['p0'])

var partitionContainsPoint = genPartition(
  'lo<=p0&&p0<=hi',
  ['p0'])

var partitionContainsPointProper = genPartition(
  'lo<p0&&p0<=hi',
  ['p0'])

//Frame size for iterative loop
var IFRAME_SIZE = 6
var DFRAME_SIZE = 2

//Data for box statck
var INIT_CAPACITY = 1024
var BOX_ISTACK  = pool.mallocInt32(INIT_CAPACITY)
var BOX_DSTACK  = pool.mallocDouble(INIT_CAPACITY)

//Initialize iterative loop queue
function iterInit(d, count) {
  var levels = (8 * bits.log2(count+1) * (d+1))|0
  var maxInts = bits.nextPow2(IFRAME_SIZE*levels)
  if(BOX_ISTACK.length < maxInts) {
    pool.free(BOX_ISTACK)
    BOX_ISTACK = pool.mallocInt32(maxInts)
  }
  var maxDoubles = bits.nextPow2(DFRAME_SIZE*levels)
  if(BOX_DSTACK < maxDoubles) {
    pool.free(BOX_DSTACK)
    BOX_DSTACK = pool.mallocDouble(maxDoubles)
  }
}

//Append item to queue
function iterPush(ptr,
  axis, 
  redStart, redEnd, 
  blueStart, blueEnd, 
  state, 
  lo, hi) {

  var iptr = IFRAME_SIZE * ptr
  BOX_ISTACK[iptr]   = axis
  BOX_ISTACK[iptr+1] = redStart
  BOX_ISTACK[iptr+2] = redEnd
  BOX_ISTACK[iptr+3] = blueStart
  BOX_ISTACK[iptr+4] = blueEnd
  BOX_ISTACK[iptr+5] = state

  var dptr = DFRAME_SIZE * ptr
  BOX_DSTACK[dptr]   = lo
  BOX_DSTACK[dptr+1] = hi
}

//Special case:  Intersect single point with list of intervals
function onePointPartial(
  d, axis, visit, flip,
  redStart, redEnd, red, redIndex,
  blueOffset, blue, blueId) {

  var elemSize = 2 * d
  var bluePtr  = blueOffset * elemSize
  var blueX    = blue[bluePtr + axis]

red_loop:
  for(var i=redStart, redPtr=redStart*elemSize; i<redEnd; ++i, redPtr+=elemSize) {
    var r0 = red[redPtr+axis]
    var r1 = red[redPtr+axis+d]
    if(blueX < r0 || r1 < blueX) {
      continue
    }
    if(flip && blueX === r0) {
      continue
    }
    var redId = redIndex[i]
    for(var j=axis+1; j<d; ++j) {
      var r0 = red[redPtr+j]
      var r1 = red[redPtr+j+d]
      var b0 = blue[bluePtr+j]
      var b1 = blue[bluePtr+j+d]
      if(r1 < b0 || b1 < r0) {
        continue red_loop
      }
    }
    var retval
    if(flip) {
      retval = visit(blueId, redId)
    } else {
      retval = visit(redId, blueId)
    }
    if(retval !== void 0) {
      return retval
    }
  }
}

//Special case:  Intersect one point with list of intervals
function onePointFull(
  d, axis, visit,
  redStart, redEnd, red, redIndex,
  blueOffset, blue, blueId) {

  var elemSize = 2 * d
  var bluePtr  = blueOffset * elemSize
  var blueX    = blue[bluePtr + axis]

red_loop:
  for(var i=redStart, redPtr=redStart*elemSize; i<redEnd; ++i, redPtr+=elemSize) {
    var redId = redIndex[i]
    if(redId === blueId) {
      continue
    }
    var r0 = red[redPtr+axis]
    var r1 = red[redPtr+axis+d]
    if(blueX < r0 || r1 < blueX) {
      continue
    }
    for(var j=axis+1; j<d; ++j) {
      var r0 = red[redPtr+j]
      var r1 = red[redPtr+j+d]
      var b0 = blue[bluePtr+j]
      var b1 = blue[bluePtr+j+d]
      if(r1 < b0 || b1 < r0) {
        continue red_loop
      }
    }
    var retval = visit(redId, blueId)
    if(retval !== void 0) {
      return retval
    }
  }
}

//The main box intersection routine
function boxIntersectIter(
  d, visit, initFull,
  xSize, xBoxes, xIndex,
  ySize, yBoxes, yIndex) {

  //Reserve memory for stack
  iterInit(d, xSize + ySize)

  var top  = 0
  var elemSize = 2 * d
  var retval

  iterPush(top++,
      0,
      0, xSize,
      0, ySize,
      initFull ? 16 : 0, 
      -Infinity, Infinity)
  if(!initFull) {
    iterPush(top++,
      0,
      0, ySize,
      0, xSize,
      1, 
      -Infinity, Infinity)
  }

  while(top > 0) {
    top  -= 1

    var iptr = top * IFRAME_SIZE
    var axis      = BOX_ISTACK[iptr]
    var redStart  = BOX_ISTACK[iptr+1]
    var redEnd    = BOX_ISTACK[iptr+2]
    var blueStart = BOX_ISTACK[iptr+3]
    var blueEnd   = BOX_ISTACK[iptr+4]
    var state     = BOX_ISTACK[iptr+5]

    var dptr = top * DFRAME_SIZE
    var lo        = BOX_DSTACK[dptr]
    var hi        = BOX_DSTACK[dptr+1]

    //Unpack state info
    var flip      = (state & 1)
    var full      = !!(state & 16)

    //Unpack indices
    var red       = xBoxes
    var redIndex  = xIndex
    var blue      = yBoxes
    var blueIndex = yIndex
    if(flip) {
      red         = yBoxes
      redIndex    = yIndex
      blue        = xBoxes
      blueIndex   = xIndex
    }

    if(state & 2) {
      redEnd = partitionStartLessThan(
        d, axis,
        redStart, redEnd, red, redIndex,
        hi)
      if(redStart >= redEnd) {
        continue
      }
    }
    if(state & 4) {
      redStart = partitionEndLessThanEqual(
        d, axis,
        redStart, redEnd, red, redIndex,
        lo)
      if(redStart >= redEnd) {
        continue
      }
    }
    
    var redCount  = redEnd  - redStart
    var blueCount = blueEnd - blueStart

    if(full) {
      if(d * redCount * (redCount + blueCount) < SCAN_COMPLETE_CUTOFF) {
        retval = sweep.scanComplete(
          d, axis, visit, 
          redStart, redEnd, red, redIndex,
          blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
        continue
      }
    } else {
      if(d * Math.min(redCount, blueCount) < BRUTE_FORCE_CUTOFF) {
        //If input small, then use brute force
        retval = bruteForcePartial(
            d, axis, visit, flip,
            redStart,  redEnd,  red,  redIndex,
            blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
        continue
      } else if(d * redCount * blueCount < SCAN_CUTOFF) {
        //If input medium sized, then use sweep and prune
        retval = sweep.scanBipartite(
          d, axis, visit, flip, 
          redStart, redEnd, red, redIndex,
          blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
        continue
      }
    }
    
    //First, find all red intervals whose interior contains (lo,hi)
    var red0 = partitionInteriorContainsInterval(
      d, axis, 
      redStart, redEnd, red, redIndex,
      lo, hi)

    //Lower dimensional case
    if(redStart < red0) {

      if(d * (red0 - redStart) < BRUTE_FORCE_CUTOFF) {
        //Special case for small inputs: use brute force
        retval = bruteForceFull(
          d, axis+1, visit,
          redStart, red0, red, redIndex,
          blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
      } else if(axis === d-2) {
        if(flip) {
          retval = sweep.sweepBipartite(
            d, visit,
            blueStart, blueEnd, blue, blueIndex,
            redStart, red0, red, redIndex)
        } else {
          retval = sweep.sweepBipartite(
            d, visit,
            redStart, red0, red, redIndex,
            blueStart, blueEnd, blue, blueIndex)
        }
        if(retval !== void 0) {
          return retval
        }
      } else {
        iterPush(top++,
          axis+1,
          redStart, red0,
          blueStart, blueEnd,
          flip,
          -Infinity, Infinity)
        iterPush(top++,
          axis+1,
          blueStart, blueEnd,
          redStart, red0,
          flip^1,
          -Infinity, Infinity)
      }
    }

    //Divide and conquer phase
    if(red0 < redEnd) {

      //Cut blue into 3 parts:
      //
      //  Points < mid point
      //  Points = mid point
      //  Points > mid point
      //
      var blue0 = findMedian(
        d, axis, 
        blueStart, blueEnd, blue, blueIndex)
      var mid = blue[elemSize * blue0 + axis]
      var blue1 = partitionStartEqual(
        d, axis,
        blue0, blueEnd, blue, blueIndex,
        mid)

      //Right case
      if(blue1 < blueEnd) {
        iterPush(top++,
          axis,
          red0, redEnd,
          blue1, blueEnd,
          (flip|4) + (full ? 16 : 0),
          mid, hi)
      }

      //Left case
      if(blueStart < blue0) {
        iterPush(top++,
          axis,
          red0, redEnd,
          blueStart, blue0,
          (flip|2) + (full ? 16 : 0),
          lo, mid)
      }

      //Center case (the hard part)
      if(blue0 + 1 === blue1) {
        //Optimization: Range with exactly 1 point, use a brute force scan
        if(full) {
          retval = onePointFull(
            d, axis, visit,
            red0, redEnd, red, redIndex,
            blue0, blue, blueIndex[blue0])
        } else {
          retval = onePointPartial(
            d, axis, visit, flip,
            red0, redEnd, red, redIndex,
            blue0, blue, blueIndex[blue0])
        }
        if(retval !== void 0) {
          return retval
        }
      } else if(blue0 < blue1) {
        var red1
        if(full) {
          //If full intersection, need to handle special case
          red1 = partitionContainsPoint(
            d, axis,
            red0, redEnd, red, redIndex,
            mid)
          if(red0 < red1) {
            var redX = partitionStartEqual(
              d, axis,
              red0, red1, red, redIndex,
              mid)
            if(axis === d-2) {
              //Degenerate sweep intersection:
              //  [red0, redX] with [blue0, blue1]
              if(red0 < redX) {
                retval = sweep.sweepComplete(
                  d, visit,
                  red0, redX, red, redIndex,
                  blue0, blue1, blue, blueIndex)
                if(retval !== void 0) {
                  return retval
                }
              }

              //Normal sweep intersection:
              //  [redX, red1] with [blue0, blue1]
              if(redX < red1) {
                retval = sweep.sweepBipartite(
                  d, visit,
                  redX, red1, red, redIndex,
                  blue0, blue1, blue, blueIndex)
                if(retval !== void 0) {
                  return retval
                }
              }
            } else {
              if(red0 < redX) {
                iterPush(top++,
                  axis+1,
                  red0, redX,
                  blue0, blue1,
                  16,
                  -Infinity, Infinity)
              }
              if(redX < red1) {
                iterPush(top++,
                  axis+1,
                  redX, red1,
                  blue0, blue1,
                  0,
                  -Infinity, Infinity)
                iterPush(top++,
                  axis+1,
                  blue0, blue1,
                  redX, red1,
                  1,
                  -Infinity, Infinity)
              }
            }
          }
        } else {
          if(flip) {
            red1 = partitionContainsPointProper(
              d, axis,
              red0, redEnd, red, redIndex,
              mid)
          } else {
            red1 = partitionContainsPoint(
              d, axis,
              red0, redEnd, red, redIndex,
              mid)
          }
          if(red0 < red1) {
            if(axis === d-2) {
              if(flip) {
                retval = sweep.sweepBipartite(
                  d, visit,
                  blue0, blue1, blue, blueIndex,
                  red0, red1, red, redIndex)
              } else {
                retval = sweep.sweepBipartite(
                  d, visit,
                  red0, red1, red, redIndex,
                  blue0, blue1, blue, blueIndex)
              }
            } else {
              iterPush(top++,
                axis+1,
                red0, red1,
                blue0, blue1,
                flip,
                -Infinity, Infinity)
              iterPush(top++,
                axis+1,
                blue0, blue1,
                red0, red1,
                flip^1,
                -Infinity, Infinity)
            }
          }
        }
      }
    }
  }
}
},{"./brute":12,"./median":14,"./partition":15,"./sweep":17,"bit-twiddle":18,"typedarray-pool":20}],14:[function(require,module,exports){
'use strict'

module.exports = findMedian

var genPartition = require('./partition')

var partitionStartLessThan = genPartition('lo<p0', ['p0'])

var PARTITION_THRESHOLD = 8   //Cut off for using insertion sort in findMedian

//Base case for median finding:  Use insertion sort
function insertionSort(d, axis, start, end, boxes, ids) {
  var elemSize = 2 * d
  var boxPtr = elemSize * (start+1) + axis
  for(var i=start+1; i<end; ++i, boxPtr+=elemSize) {
    var x = boxes[boxPtr]
    for(var j=i, ptr=elemSize*(i-1); 
        j>start && boxes[ptr+axis] > x; 
        --j, ptr-=elemSize) {
      //Swap
      var aPtr = ptr
      var bPtr = ptr+elemSize
      for(var k=0; k<elemSize; ++k, ++aPtr, ++bPtr) {
        var y = boxes[aPtr]
        boxes[aPtr] = boxes[bPtr]
        boxes[bPtr] = y
      }
      var tmp = ids[j]
      ids[j] = ids[j-1]
      ids[j-1] = tmp
    }
  }
}

//Find median using quick select algorithm
//  takes O(n) time with high probability
function findMedian(d, axis, start, end, boxes, ids) {
  if(end <= start+1) {
    return start
  }

  var lo       = start
  var hi       = end
  var mid      = ((end + start) >>> 1)
  var elemSize = 2*d
  var pivot    = mid
  var value    = boxes[elemSize*mid+axis]
  
  while(lo < hi) {
    if(hi - lo < PARTITION_THRESHOLD) {
      insertionSort(d, axis, lo, hi, boxes, ids)
      value = boxes[elemSize*mid+axis]
      break
    }
    
    //Select pivot using median-of-3
    var count  = hi - lo
    var pivot0 = (Math.random()*count+lo)|0
    var value0 = boxes[elemSize*pivot0 + axis]
    var pivot1 = (Math.random()*count+lo)|0
    var value1 = boxes[elemSize*pivot1 + axis]
    var pivot2 = (Math.random()*count+lo)|0
    var value2 = boxes[elemSize*pivot2 + axis]
    if(value0 <= value1) {
      if(value2 >= value1) {
        pivot = pivot1
        value = value1
      } else if(value0 >= value2) {
        pivot = pivot0
        value = value0
      } else {
        pivot = pivot2
        value = value2
      }
    } else {
      if(value1 >= value2) {
        pivot = pivot1
        value = value1
      } else if(value2 >= value0) {
        pivot = pivot0
        value = value0
      } else {
        pivot = pivot2
        value = value2
      }
    }

    //Swap pivot to end of array
    var aPtr = elemSize * (hi-1)
    var bPtr = elemSize * pivot
    for(var i=0; i<elemSize; ++i, ++aPtr, ++bPtr) {
      var x = boxes[aPtr]
      boxes[aPtr] = boxes[bPtr]
      boxes[bPtr] = x
    }
    var y = ids[hi-1]
    ids[hi-1] = ids[pivot]
    ids[pivot] = y

    //Partition using pivot
    pivot = partitionStartLessThan(
      d, axis, 
      lo, hi-1, boxes, ids,
      value)

    //Swap pivot back
    var aPtr = elemSize * (hi-1)
    var bPtr = elemSize * pivot
    for(var i=0; i<elemSize; ++i, ++aPtr, ++bPtr) {
      var x = boxes[aPtr]
      boxes[aPtr] = boxes[bPtr]
      boxes[bPtr] = x
    }
    var y = ids[hi-1]
    ids[hi-1] = ids[pivot]
    ids[pivot] = y

    //Swap pivot to last pivot
    if(mid < pivot) {
      hi = pivot-1
      while(lo < hi && 
        boxes[elemSize*(hi-1)+axis] === value) {
        hi -= 1
      }
      hi += 1
    } else if(pivot < mid) {
      lo = pivot + 1
      while(lo < hi &&
        boxes[elemSize*lo+axis] === value) {
        lo += 1
      }
    } else {
      break
    }
  }

  //Make sure pivot is at start
  return partitionStartLessThan(
    d, axis, 
    start, mid, boxes, ids,
    boxes[elemSize*mid+axis])
}
},{"./partition":15}],15:[function(require,module,exports){
'use strict'

module.exports = genPartition

var code = 'for(var j=2*a,k=j*c,l=k,m=c,n=b,o=a+b,p=c;d>p;++p,k+=j){var _;if($)if(m===p)m+=1,l+=j;else{for(var s=0;j>s;++s){var t=e[k+s];e[k+s]=e[l],e[l++]=t}var u=f[p];f[p]=f[m],f[m++]=u}}return m'

function genPartition(predicate, args) {
  var fargs ='abcdef'.split('').concat(args)
  var reads = []
  if(predicate.indexOf('lo') >= 0) {
    reads.push('lo=e[k+n]')
  }
  if(predicate.indexOf('hi') >= 0) {
    reads.push('hi=e[k+o]')
  }
  fargs.push(
    code.replace('_', reads.join())
        .replace('$', predicate))
  return Function.apply(void 0, fargs)
}
},{}],16:[function(require,module,exports){
'use strict';

//This code is extracted from ndarray-sort
//It is inlined here as a temporary workaround

module.exports = wrapper;

var INSERT_SORT_CUTOFF = 32

function wrapper(data, n0) {
  if (n0 <= 4*INSERT_SORT_CUTOFF) {
    insertionSort(0, n0 - 1, data);
  } else {
    quickSort(0, n0 - 1, data);
  }
}

function insertionSort(left, right, data) {
  var ptr = 2*(left+1)
  for(var i=left+1; i<=right; ++i) {
    var a = data[ptr++]
    var b = data[ptr++]
    var j = i
    var jptr = ptr-2
    while(j-- > left) {
      var x = data[jptr-2]
      var y = data[jptr-1]
      if(x < a) {
        break
      } else if(x === a && y < b) {
        break
      }
      data[jptr]   = x
      data[jptr+1] = y
      jptr -= 2
    }
    data[jptr]   = a
    data[jptr+1] = b
  }
}

function swap(i, j, data) {
  i *= 2
  j *= 2
  var x = data[i]
  var y = data[i+1]
  data[i] = data[j]
  data[i+1] = data[j+1]
  data[j] = x
  data[j+1] = y
}

function move(i, j, data) {
  i *= 2
  j *= 2
  data[i] = data[j]
  data[i+1] = data[j+1]
}

function rotate(i, j, k, data) {
  i *= 2
  j *= 2
  k *= 2
  var x = data[i]
  var y = data[i+1]
  data[i] = data[j]
  data[i+1] = data[j+1]
  data[j] = data[k]
  data[j+1] = data[k+1]
  data[k] = x
  data[k+1] = y
}

function shufflePivot(i, j, px, py, data) {
  i *= 2
  j *= 2
  data[i] = data[j]
  data[j] = px
  data[i+1] = data[j+1]
  data[j+1] = py
}

function compare(i, j, data) {
  i *= 2
  j *= 2
  var x = data[i],
      y = data[j]
  if(x < y) {
    return false
  } else if(x === y) {
    return data[i+1] > data[j+1]
  }
  return true
}

function comparePivot(i, y, b, data) {
  i *= 2
  var x = data[i]
  if(x < y) {
    return true
  } else if(x === y) {
    return data[i+1] < b
  }
  return false
}

function quickSort(left, right, data) {
  var sixth = (right - left + 1) / 6 | 0, 
      index1 = left + sixth, 
      index5 = right - sixth, 
      index3 = left + right >> 1, 
      index2 = index3 - sixth, 
      index4 = index3 + sixth, 
      el1 = index1, 
      el2 = index2, 
      el3 = index3, 
      el4 = index4, 
      el5 = index5, 
      less = left + 1, 
      great = right - 1, 
      tmp = 0
  if(compare(el1, el2, data)) {
    tmp = el1
    el1 = el2
    el2 = tmp
  }
  if(compare(el4, el5, data)) {
    tmp = el4
    el4 = el5
    el5 = tmp
  }
  if(compare(el1, el3, data)) {
    tmp = el1
    el1 = el3
    el3 = tmp
  }
  if(compare(el2, el3, data)) {
    tmp = el2
    el2 = el3
    el3 = tmp
  }
  if(compare(el1, el4, data)) {
    tmp = el1
    el1 = el4
    el4 = tmp
  }
  if(compare(el3, el4, data)) {
    tmp = el3
    el3 = el4
    el4 = tmp
  }
  if(compare(el2, el5, data)) {
    tmp = el2
    el2 = el5
    el5 = tmp
  }
  if(compare(el2, el3, data)) {
    tmp = el2
    el2 = el3
    el3 = tmp
  }
  if(compare(el4, el5, data)) {
    tmp = el4
    el4 = el5
    el5 = tmp
  }

  var pivot1X = data[2*el2]
  var pivot1Y = data[2*el2+1]
  var pivot2X = data[2*el4]
  var pivot2Y = data[2*el4+1]

  var ptr0 = 2 * el1;
  var ptr2 = 2 * el3;
  var ptr4 = 2 * el5;
  var ptr5 = 2 * index1;
  var ptr6 = 2 * index3;
  var ptr7 = 2 * index5;
  for (var i1 = 0; i1 < 2; ++i1) {
    var x = data[ptr0+i1];
    var y = data[ptr2+i1];
    var z = data[ptr4+i1];
    data[ptr5+i1] = x;
    data[ptr6+i1] = y;
    data[ptr7+i1] = z;
  }

  move(index2, left, data)
  move(index4, right, data)
  for (var k = less; k <= great; ++k) {
    if (comparePivot(k, pivot1X, pivot1Y, data)) {
      if (k !== less) {
        swap(k, less, data)
      }
      ++less;
    } else {
      if (!comparePivot(k, pivot2X, pivot2Y, data)) {
        while (true) {
          if (!comparePivot(great, pivot2X, pivot2Y, data)) {
            if (--great < k) {
              break;
            }
            continue;
          } else {
            if (comparePivot(great, pivot1X, pivot1Y, data)) {
              rotate(k, less, great, data)
              ++less;
              --great;
            } else {
              swap(k, great, data)
              --great;
            }
            break;
          }
        }
      }
    }
  }
  shufflePivot(left, less-1, pivot1X, pivot1Y, data)
  shufflePivot(right, great+1, pivot2X, pivot2Y, data)
  if (less - 2 - left <= INSERT_SORT_CUTOFF) {
    insertionSort(left, less - 2, data);
  } else {
    quickSort(left, less - 2, data);
  }
  if (right - (great + 2) <= INSERT_SORT_CUTOFF) {
    insertionSort(great + 2, right, data);
  } else {
    quickSort(great + 2, right, data);
  }
  if (great - less <= INSERT_SORT_CUTOFF) {
    insertionSort(less, great, data);
  } else {
    quickSort(less, great, data);
  }
}
},{}],17:[function(require,module,exports){
'use strict'

module.exports = {
  init:           sqInit,
  sweepBipartite: sweepBipartite,
  sweepComplete:  sweepComplete,
  scanBipartite:  scanBipartite,
  scanComplete:   scanComplete
}

var pool  = require('typedarray-pool')
var bits  = require('bit-twiddle')
var isort = require('./sort')

//Flag for blue
var BLUE_FLAG = (1<<28)

//1D sweep event queue stuff (use pool to save space)
var INIT_CAPACITY      = 1024
var RED_SWEEP_QUEUE    = pool.mallocInt32(INIT_CAPACITY)
var RED_SWEEP_INDEX    = pool.mallocInt32(INIT_CAPACITY)
var BLUE_SWEEP_QUEUE   = pool.mallocInt32(INIT_CAPACITY)
var BLUE_SWEEP_INDEX   = pool.mallocInt32(INIT_CAPACITY)
var COMMON_SWEEP_QUEUE = pool.mallocInt32(INIT_CAPACITY)
var COMMON_SWEEP_INDEX = pool.mallocInt32(INIT_CAPACITY)
var SWEEP_EVENTS       = pool.mallocDouble(INIT_CAPACITY * 8)

//Reserves memory for the 1D sweep data structures
function sqInit(count) {
  var rcount = bits.nextPow2(count)
  if(RED_SWEEP_QUEUE.length < rcount) {
    pool.free(RED_SWEEP_QUEUE)
    RED_SWEEP_QUEUE = pool.mallocInt32(rcount)
  }
  if(RED_SWEEP_INDEX.length < rcount) {
    pool.free(RED_SWEEP_INDEX)
    RED_SWEEP_INDEX = pool.mallocInt32(rcount)
  }
  if(BLUE_SWEEP_QUEUE.length < rcount) {
    pool.free(BLUE_SWEEP_QUEUE)
    BLUE_SWEEP_QUEUE = pool.mallocInt32(rcount)
  }
  if(BLUE_SWEEP_INDEX.length < rcount) {
    pool.free(BLUE_SWEEP_INDEX)
    BLUE_SWEEP_INDEX = pool.mallocInt32(rcount)
  }
  if(COMMON_SWEEP_QUEUE.length < rcount) {
    pool.free(COMMON_SWEEP_QUEUE)
    COMMON_SWEEP_QUEUE = pool.mallocInt32(rcount)
  }
  if(COMMON_SWEEP_INDEX.length < rcount) {
    pool.free(COMMON_SWEEP_INDEX)
    COMMON_SWEEP_INDEX = pool.mallocInt32(rcount)
  }
  var eventLength = 8 * rcount
  if(SWEEP_EVENTS.length < eventLength) {
    pool.free(SWEEP_EVENTS)
    SWEEP_EVENTS = pool.mallocDouble(eventLength)
  }
}

//Remove an item from the active queue in O(1)
function sqPop(queue, index, count, item) {
  var idx = index[item]
  var top = queue[count-1]
  queue[idx] = top
  index[top] = idx
}

//Insert an item into the active queue in O(1)
function sqPush(queue, index, count, item) {
  queue[count] = item
  index[item]  = count
}

//Recursion base case: use 1D sweep algorithm
function sweepBipartite(
    d, visit,
    redStart,  redEnd, red, redIndex,
    blueStart, blueEnd, blue, blueIndex) {

  //store events as pairs [coordinate, idx]
  //
  //  red create:  -(idx+1)
  //  red destroy: idx
  //  blue create: -(idx+BLUE_FLAG)
  //  blue destroy: idx+BLUE_FLAG
  //
  var ptr      = 0
  var elemSize = 2*d
  var istart   = d-1
  var iend     = elemSize-1

  for(var i=redStart; i<redEnd; ++i) {
    var idx = redIndex[i]
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -(idx+1)
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }

  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = blueIndex[i]+BLUE_FLAG
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = blue[blueOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)
  
  var redActive  = 0
  var blueActive = 0
  for(var i=0; i<n; ++i) {
    var e = SWEEP_EVENTS[2*i+1]|0
    if(e >= BLUE_FLAG) {
      //blue destroy event
      e = (e-BLUE_FLAG)|0
      sqPop(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive--, e)
    } else if(e >= 0) {
      //red destroy event
      sqPop(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive--, e)
    } else if(e <= -BLUE_FLAG) {
      //blue create event
      e = (-e-BLUE_FLAG)|0
      for(var j=0; j<redActive; ++j) {
        var retval = visit(RED_SWEEP_QUEUE[j], e)
        if(retval !== void 0) {
          return retval
        }
      }
      sqPush(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive++, e)
    } else {
      //red create event
      e = (-e-1)|0
      for(var j=0; j<blueActive; ++j) {
        var retval = visit(e, BLUE_SWEEP_QUEUE[j])
        if(retval !== void 0) {
          return retval
        }
      }
      sqPush(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive++, e)
    }
  }
}

//Complete sweep
function sweepComplete(d, visit, 
  redStart, redEnd, red, redIndex,
  blueStart, blueEnd, blue, blueIndex) {

  var ptr      = 0
  var elemSize = 2*d
  var istart   = d-1
  var iend     = elemSize-1

  for(var i=redStart; i<redEnd; ++i) {
    var idx = (redIndex[i]+1)<<1
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }

  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = (blueIndex[i]+1)<<1
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = (-idx)|1
    SWEEP_EVENTS[ptr++] = blue[blueOffset+iend]
    SWEEP_EVENTS[ptr++] = idx|1
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)
  
  var redActive    = 0
  var blueActive   = 0
  var commonActive = 0
  for(var i=0; i<n; ++i) {
    var e     = SWEEP_EVENTS[2*i+1]|0
    var color = e&1
    if(i < n-1 && (e>>1) === (SWEEP_EVENTS[2*i+3]>>1)) {
      color = 2
      i += 1
    }
    
    if(e < 0) {
      //Create event
      var id = -(e>>1) - 1

      //Intersect with common
      for(var j=0; j<commonActive; ++j) {
        var retval = visit(COMMON_SWEEP_QUEUE[j], id)
        if(retval !== void 0) {
          return retval
        }
      }

      if(color !== 0) {
        //Intersect with red
        for(var j=0; j<redActive; ++j) {
          var retval = visit(RED_SWEEP_QUEUE[j], id)
          if(retval !== void 0) {
            return retval
          }
        }
      }

      if(color !== 1) {
        //Intersect with blue
        for(var j=0; j<blueActive; ++j) {
          var retval = visit(BLUE_SWEEP_QUEUE[j], id)
          if(retval !== void 0) {
            return retval
          }
        }
      }

      if(color === 0) {
        //Red
        sqPush(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive++, id)
      } else if(color === 1) {
        //Blue
        sqPush(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive++, id)
      } else if(color === 2) {
        //Both
        sqPush(COMMON_SWEEP_QUEUE, COMMON_SWEEP_INDEX, commonActive++, id)
      }
    } else {
      //Destroy event
      var id = (e>>1) - 1
      if(color === 0) {
        //Red
        sqPop(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive--, id)
      } else if(color === 1) {
        //Blue
        sqPop(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive--, id)
      } else if(color === 2) {
        //Both
        sqPop(COMMON_SWEEP_QUEUE, COMMON_SWEEP_INDEX, commonActive--, id)
      }
    }
  }
}

//Sweep and prune/scanline algorithm:
//  Scan along axis, detect intersections
//  Brute force all boxes along axis
function scanBipartite(
  d, axis, visit, flip,
  redStart,  redEnd, red, redIndex,
  blueStart, blueEnd, blue, blueIndex) {
  
  var ptr      = 0
  var elemSize = 2*d
  var istart   = axis
  var iend     = axis+d

  var redShift  = 1
  var blueShift = 1
  if(flip) {
    blueShift = BLUE_FLAG
  } else {
    redShift  = BLUE_FLAG
  }

  for(var i=redStart; i<redEnd; ++i) {
    var idx = i + redShift
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }
  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = i + blueShift
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)
  
  var redActive    = 0
  for(var i=0; i<n; ++i) {
    var e = SWEEP_EVENTS[2*i+1]|0
    if(e < 0) {
      var idx   = -e
      var isRed = false
      if(idx >= BLUE_FLAG) {
        isRed = !flip
        idx -= BLUE_FLAG 
      } else {
        isRed = !!flip
        idx -= 1
      }
      if(isRed) {
        sqPush(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive++, idx)
      } else {
        var blueId  = blueIndex[idx]
        var bluePtr = elemSize * idx
        
        var b0 = blue[bluePtr+axis+1]
        var b1 = blue[bluePtr+axis+1+d]

red_loop:
        for(var j=0; j<redActive; ++j) {
          var oidx   = RED_SWEEP_QUEUE[j]
          var redPtr = elemSize * oidx

          if(b1 < red[redPtr+axis+1] || 
             red[redPtr+axis+1+d] < b0) {
            continue
          }

          for(var k=axis+2; k<d; ++k) {
            if(blue[bluePtr + k + d] < red[redPtr + k] || 
               red[redPtr + k + d] < blue[bluePtr + k]) {
              continue red_loop
            }
          }

          var redId  = redIndex[oidx]
          var retval
          if(flip) {
            retval = visit(blueId, redId)
          } else {
            retval = visit(redId, blueId)
          }
          if(retval !== void 0) {
            return retval 
          }
        }
      }
    } else {
      sqPop(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive--, e - redShift)
    }
  }
}

function scanComplete(
  d, axis, visit,
  redStart,  redEnd, red, redIndex,
  blueStart, blueEnd, blue, blueIndex) {

  var ptr      = 0
  var elemSize = 2*d
  var istart   = axis
  var iend     = axis+d

  for(var i=redStart; i<redEnd; ++i) {
    var idx = i + BLUE_FLAG
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }
  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = i + 1
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)
  
  var redActive    = 0
  for(var i=0; i<n; ++i) {
    var e = SWEEP_EVENTS[2*i+1]|0
    if(e < 0) {
      var idx   = -e
      if(idx >= BLUE_FLAG) {
        RED_SWEEP_QUEUE[redActive++] = idx - BLUE_FLAG
      } else {
        idx -= 1
        var blueId  = blueIndex[idx]
        var bluePtr = elemSize * idx

        var b0 = blue[bluePtr+axis+1]
        var b1 = blue[bluePtr+axis+1+d]

red_loop:
        for(var j=0; j<redActive; ++j) {
          var oidx   = RED_SWEEP_QUEUE[j]
          var redId  = redIndex[oidx]

          if(redId === blueId) {
            break
          }

          var redPtr = elemSize * oidx
          if(b1 < red[redPtr+axis+1] || 
            red[redPtr+axis+1+d] < b0) {
            continue
          }
          for(var k=axis+2; k<d; ++k) {
            if(blue[bluePtr + k + d] < red[redPtr + k] || 
               red[redPtr + k + d]   < blue[bluePtr + k]) {
              continue red_loop
            }
          }

          var retval = visit(redId, blueId)
          if(retval !== void 0) {
            return retval 
          }
        }
      }
    } else {
      var idx = e - BLUE_FLAG
      for(var j=redActive-1; j>=0; --j) {
        if(RED_SWEEP_QUEUE[j] === idx) {
          for(var k=j+1; k<redActive; ++k) {
            RED_SWEEP_QUEUE[k-1] = RED_SWEEP_QUEUE[k]
          }
          break
        }
      }
      --redActive
    }
  }
}
},{"./sort":16,"bit-twiddle":18,"typedarray-pool":20}],18:[function(require,module,exports){
/**
 * Bit twiddling hacks for JavaScript.
 *
 * Author: Mikola Lysenko
 *
 * Ported from Stanford bit twiddling hack library:
 *    http://graphics.stanford.edu/~seander/bithacks.html
 */

"use strict"; "use restrict";

//Number of bits in an integer
var INT_BITS = 32;

//Constants
exports.INT_BITS  = INT_BITS;
exports.INT_MAX   =  0x7fffffff;
exports.INT_MIN   = -1<<(INT_BITS-1);

//Returns -1, 0, +1 depending on sign of x
exports.sign = function(v) {
  return (v > 0) - (v < 0);
}

//Computes absolute value of integer
exports.abs = function(v) {
  var mask = v >> (INT_BITS-1);
  return (v ^ mask) - mask;
}

//Computes minimum of integers x and y
exports.min = function(x, y) {
  return y ^ ((x ^ y) & -(x < y));
}

//Computes maximum of integers x and y
exports.max = function(x, y) {
  return x ^ ((x ^ y) & -(x < y));
}

//Checks if a number is a power of two
exports.isPow2 = function(v) {
  return !(v & (v-1)) && (!!v);
}

//Computes log base 2 of v
exports.log2 = function(v) {
  var r, shift;
  r =     (v > 0xFFFF) << 4; v >>>= r;
  shift = (v > 0xFF  ) << 3; v >>>= shift; r |= shift;
  shift = (v > 0xF   ) << 2; v >>>= shift; r |= shift;
  shift = (v > 0x3   ) << 1; v >>>= shift; r |= shift;
  return r | (v >> 1);
}

//Computes log base 10 of v
exports.log10 = function(v) {
  return  (v >= 1000000000) ? 9 : (v >= 100000000) ? 8 : (v >= 10000000) ? 7 :
          (v >= 1000000) ? 6 : (v >= 100000) ? 5 : (v >= 10000) ? 4 :
          (v >= 1000) ? 3 : (v >= 100) ? 2 : (v >= 10) ? 1 : 0;
}

//Counts number of bits
exports.popCount = function(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return ((v + (v >>> 4) & 0xF0F0F0F) * 0x1010101) >>> 24;
}

//Counts number of trailing zeros
function countTrailingZeros(v) {
  var c = 32;
  v &= -v;
  if (v) c--;
  if (v & 0x0000FFFF) c -= 16;
  if (v & 0x00FF00FF) c -= 8;
  if (v & 0x0F0F0F0F) c -= 4;
  if (v & 0x33333333) c -= 2;
  if (v & 0x55555555) c -= 1;
  return c;
}
exports.countTrailingZeros = countTrailingZeros;

//Rounds to next power of 2
exports.nextPow2 = function(v) {
  v += v === 0;
  --v;
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return v + 1;
}

//Rounds down to previous power of 2
exports.prevPow2 = function(v) {
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return v - (v>>>1);
}

//Computes parity of word
exports.parity = function(v) {
  v ^= v >>> 16;
  v ^= v >>> 8;
  v ^= v >>> 4;
  v &= 0xf;
  return (0x6996 >>> v) & 1;
}

var REVERSE_TABLE = new Array(256);

(function(tab) {
  for(var i=0; i<256; ++i) {
    var v = i, r = i, s = 7;
    for (v >>>= 1; v; v >>>= 1) {
      r <<= 1;
      r |= v & 1;
      --s;
    }
    tab[i] = (r << s) & 0xff;
  }
})(REVERSE_TABLE);

//Reverse bits in a 32 bit word
exports.reverse = function(v) {
  return  (REVERSE_TABLE[ v         & 0xff] << 24) |
          (REVERSE_TABLE[(v >>> 8)  & 0xff] << 16) |
          (REVERSE_TABLE[(v >>> 16) & 0xff] << 8)  |
           REVERSE_TABLE[(v >>> 24) & 0xff];
}

//Interleave bits of 2 coordinates with 16 bits.  Useful for fast quadtree codes
exports.interleave2 = function(x, y) {
  x &= 0xFFFF;
  x = (x | (x << 8)) & 0x00FF00FF;
  x = (x | (x << 4)) & 0x0F0F0F0F;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;

  y &= 0xFFFF;
  y = (y | (y << 8)) & 0x00FF00FF;
  y = (y | (y << 4)) & 0x0F0F0F0F;
  y = (y | (y << 2)) & 0x33333333;
  y = (y | (y << 1)) & 0x55555555;

  return x | (y << 1);
}

//Extracts the nth interleaved component
exports.deinterleave2 = function(v, n) {
  v = (v >>> n) & 0x55555555;
  v = (v | (v >>> 1))  & 0x33333333;
  v = (v | (v >>> 2))  & 0x0F0F0F0F;
  v = (v | (v >>> 4))  & 0x00FF00FF;
  v = (v | (v >>> 16)) & 0x000FFFF;
  return (v << 16) >> 16;
}


//Interleave bits of 3 coordinates, each with 10 bits.  Useful for fast octree codes
exports.interleave3 = function(x, y, z) {
  x &= 0x3FF;
  x  = (x | (x<<16)) & 4278190335;
  x  = (x | (x<<8))  & 251719695;
  x  = (x | (x<<4))  & 3272356035;
  x  = (x | (x<<2))  & 1227133513;

  y &= 0x3FF;
  y  = (y | (y<<16)) & 4278190335;
  y  = (y | (y<<8))  & 251719695;
  y  = (y | (y<<4))  & 3272356035;
  y  = (y | (y<<2))  & 1227133513;
  x |= (y << 1);
  
  z &= 0x3FF;
  z  = (z | (z<<16)) & 4278190335;
  z  = (z | (z<<8))  & 251719695;
  z  = (z | (z<<4))  & 3272356035;
  z  = (z | (z<<2))  & 1227133513;
  
  return x | (z << 2);
}

//Extracts nth interleaved component of a 3-tuple
exports.deinterleave3 = function(v, n) {
  v = (v >>> n)       & 1227133513;
  v = (v | (v>>>2))   & 3272356035;
  v = (v | (v>>>4))   & 251719695;
  v = (v | (v>>>8))   & 4278190335;
  v = (v | (v>>>16))  & 0x3FF;
  return (v<<22)>>22;
}

//Computes next combination in colexicographic order (this is mistakenly called nextPermutation on the bit twiddling hacks page)
exports.nextCombination = function(v) {
  var t = v | (v - 1);
  return (t + 1) | (((~t & -~t) - 1) >>> (countTrailingZeros(v) + 1));
}


},{}],19:[function(require,module,exports){
"use strict"

function dupe_array(count, value, i) {
  var c = count[i]|0
  if(c <= 0) {
    return []
  }
  var result = new Array(c), j
  if(i === count.length-1) {
    for(j=0; j<c; ++j) {
      result[j] = value
    }
  } else {
    for(j=0; j<c; ++j) {
      result[j] = dupe_array(count, value, i+1)
    }
  }
  return result
}

function dupe_number(count, value) {
  var result, i
  result = new Array(count)
  for(i=0; i<count; ++i) {
    result[i] = value
  }
  return result
}

function dupe(count, value) {
  if(typeof value === "undefined") {
    value = 0
  }
  switch(typeof count) {
    case "number":
      if(count > 0) {
        return dupe_number(count|0, value)
      }
    break
    case "object":
      if(typeof (count.length) === "number") {
        return dupe_array(count, value, 0)
      }
    break
  }
  return []
}

module.exports = dupe
},{}],20:[function(require,module,exports){
(function (global,Buffer){
'use strict'

var bits = require('bit-twiddle')
var dup = require('dup')

//Legacy pool support
if(!global.__TYPEDARRAY_POOL) {
  global.__TYPEDARRAY_POOL = {
      UINT8   : dup([32, 0])
    , UINT16  : dup([32, 0])
    , UINT32  : dup([32, 0])
    , INT8    : dup([32, 0])
    , INT16   : dup([32, 0])
    , INT32   : dup([32, 0])
    , FLOAT   : dup([32, 0])
    , DOUBLE  : dup([32, 0])
    , DATA    : dup([32, 0])
    , UINT8C  : dup([32, 0])
    , BUFFER  : dup([32, 0])
  }
}

var hasUint8C = (typeof Uint8ClampedArray) !== 'undefined'
var POOL = global.__TYPEDARRAY_POOL

//Upgrade pool
if(!POOL.UINT8C) {
  POOL.UINT8C = dup([32, 0])
}
if(!POOL.BUFFER) {
  POOL.BUFFER = dup([32, 0])
}

//New technique: Only allocate from ArrayBufferView and Buffer
var DATA    = POOL.DATA
  , BUFFER  = POOL.BUFFER

exports.free = function free(array) {
  if(Buffer.isBuffer(array)) {
    BUFFER[bits.log2(array.length)].push(array)
  } else {
    if(Object.prototype.toString.call(array) !== '[object ArrayBuffer]') {
      array = array.buffer
    }
    if(!array) {
      return
    }
    var n = array.length || array.byteLength
    var log_n = bits.log2(n)|0
    DATA[log_n].push(array)
  }
}

function freeArrayBuffer(buffer) {
  if(!buffer) {
    return
  }
  var n = buffer.length || buffer.byteLength
  var log_n = bits.log2(n)
  DATA[log_n].push(buffer)
}

function freeTypedArray(array) {
  freeArrayBuffer(array.buffer)
}

exports.freeUint8 =
exports.freeUint16 =
exports.freeUint32 =
exports.freeInt8 =
exports.freeInt16 =
exports.freeInt32 =
exports.freeFloat32 = 
exports.freeFloat =
exports.freeFloat64 = 
exports.freeDouble = 
exports.freeUint8Clamped = 
exports.freeDataView = freeTypedArray

exports.freeArrayBuffer = freeArrayBuffer

exports.freeBuffer = function freeBuffer(array) {
  BUFFER[bits.log2(array.length)].push(array)
}

exports.malloc = function malloc(n, dtype) {
  if(dtype === undefined || dtype === 'arraybuffer') {
    return mallocArrayBuffer(n)
  } else {
    switch(dtype) {
      case 'uint8':
        return mallocUint8(n)
      case 'uint16':
        return mallocUint16(n)
      case 'uint32':
        return mallocUint32(n)
      case 'int8':
        return mallocInt8(n)
      case 'int16':
        return mallocInt16(n)
      case 'int32':
        return mallocInt32(n)
      case 'float':
      case 'float32':
        return mallocFloat(n)
      case 'double':
      case 'float64':
        return mallocDouble(n)
      case 'uint8_clamped':
        return mallocUint8Clamped(n)
      case 'buffer':
        return mallocBuffer(n)
      case 'data':
      case 'dataview':
        return mallocDataView(n)

      default:
        return null
    }
  }
  return null
}

function mallocArrayBuffer(n) {
  var n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var d = DATA[log_n]
  if(d.length > 0) {
    return d.pop()
  }
  return new ArrayBuffer(n)
}
exports.mallocArrayBuffer = mallocArrayBuffer

function mallocUint8(n) {
  return new Uint8Array(mallocArrayBuffer(n), 0, n)
}
exports.mallocUint8 = mallocUint8

function mallocUint16(n) {
  return new Uint16Array(mallocArrayBuffer(2*n), 0, n)
}
exports.mallocUint16 = mallocUint16

function mallocUint32(n) {
  return new Uint32Array(mallocArrayBuffer(4*n), 0, n)
}
exports.mallocUint32 = mallocUint32

function mallocInt8(n) {
  return new Int8Array(mallocArrayBuffer(n), 0, n)
}
exports.mallocInt8 = mallocInt8

function mallocInt16(n) {
  return new Int16Array(mallocArrayBuffer(2*n), 0, n)
}
exports.mallocInt16 = mallocInt16

function mallocInt32(n) {
  return new Int32Array(mallocArrayBuffer(4*n), 0, n)
}
exports.mallocInt32 = mallocInt32

function mallocFloat(n) {
  return new Float32Array(mallocArrayBuffer(4*n), 0, n)
}
exports.mallocFloat32 = exports.mallocFloat = mallocFloat

function mallocDouble(n) {
  return new Float64Array(mallocArrayBuffer(8*n), 0, n)
}
exports.mallocFloat64 = exports.mallocDouble = mallocDouble

function mallocUint8Clamped(n) {
  if(hasUint8C) {
    return new Uint8ClampedArray(mallocArrayBuffer(n), 0, n)
  } else {
    return mallocUint8(n)
  }
}
exports.mallocUint8Clamped = mallocUint8Clamped

function mallocDataView(n) {
  return new DataView(mallocArrayBuffer(n), 0, n)
}
exports.mallocDataView = mallocDataView

function mallocBuffer(n) {
  n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var cache = BUFFER[log_n]
  if(cache.length > 0) {
    return cache.pop()
  }
  return new Buffer(n)
}
exports.mallocBuffer = mallocBuffer

exports.clearCache = function clearCache() {
  for(var i=0; i<32; ++i) {
    POOL.UINT8[i].length = 0
    POOL.UINT16[i].length = 0
    POOL.UINT32[i].length = 0
    POOL.INT8[i].length = 0
    POOL.INT16[i].length = 0
    POOL.INT32[i].length = 0
    POOL.FLOAT[i].length = 0
    POOL.DOUBLE[i].length = 0
    POOL.UINT8C[i].length = 0
    DATA[i].length = 0
    BUFFER[i].length = 0
  }
}
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer)
},{"bit-twiddle":18,"buffer":1,"dup":19}],21:[function(require,module,exports){
var size = require('element-size')

module.exports = fit

var scratch = new Float32Array(2)

function fit(canvas, parent, scale) {
  var isSVG = canvas.nodeName.toUpperCase() === 'SVG'

  canvas.style.position = canvas.style.position || 'absolute'
  canvas.style.top = 0
  canvas.style.left = 0

  resize.scale  = parseFloat(scale || 1)
  resize.parent = parent

  return resize()

  function resize() {
    var p = resize.parent || canvas.parentNode
    if (typeof p === 'function') {
      var dims   = p(scratch) || scratch
      var width  = dims[0]
      var height = dims[1]
    } else
    if (p && p !== document.body) {
      var psize  = size(p)
      var width  = psize[0]|0
      var height = psize[1]|0
    } else {
      var width  = window.innerWidth
      var height = window.innerHeight
    }

    if (isSVG) {
      canvas.setAttribute('width', width * resize.scale + 'px')
      canvas.setAttribute('height', height * resize.scale + 'px')
    } else {
      canvas.width = width * resize.scale
      canvas.height = height * resize.scale
    }

    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'

    return resize
  }
}

},{"element-size":22}],22:[function(require,module,exports){
module.exports = getSize

function getSize(element) {
  // Handle cases where the element is not already
  // attached to the DOM by briefly appending it
  // to document.body, and removing it again later.
  if (element === window || element === document.body) {
    return [window.innerWidth, window.innerHeight]
  }

  if (!element.parentNode) {
    var temporary = true
    document.body.appendChild(element)
  }

  var bounds = element.getBoundingClientRect()
  var styles = getComputedStyle(element)
  var height = (bounds.height|0)
    + parse(styles.getPropertyValue('margin-top'))
    + parse(styles.getPropertyValue('margin-bottom'))
  var width  = (bounds.width|0)
    + parse(styles.getPropertyValue('margin-left'))
    + parse(styles.getPropertyValue('margin-right'))

  if (temporary) {
    document.body.removeChild(element)
  }

  return [width, height]
}

function parse(prop) {
  return parseFloat(prop) || 0
}

},{}],23:[function(require,module,exports){
//You should really never do this with the audioContext
var AudioContext = window.AudioContext || window.webkitAudioContext;
var audioContext = new AudioContext();
var die = function(){ var input = audioContext.createGain();  var feedback = audioContext.createGain();  var delay = audioContext.createDelay();  ;  var output = audioContext.createGain();  ;  delay.delayTime.value = 0.2;  feedback.gain.value = 0.6;  input.connect(delay);  ;  output.connect(audioContext.destination);  input.connect(output);  input.connect(delay);  delay.connect(feedback);  feedback.connect(delay);  feedback.connect(output);  ;  play(0, -3, 0.05);  play(0.05, 2, 0.05);  play(0.1, 9, 0.05);  play(0.15, 14, 0.05);  play(0.2, 9, 0.05);  play(0.25, 2, 0.05);  play(0.3, -3, 0.05);  play(0.35, 7, 0.05);  play(0.4, 14, 0.05);  play(0.45, 18, 0.05);  play(0.5, 9, 0.05);  play(0.55, 2, 0.05);  ;  function play (startAfter, pitch, duration) {;    var time = audioContext.currentTime + startAfter;  ;    var oscillator = audioContext.createOscillator();    oscillator.connect(input) ;  oscillator.type = 'square';    oscillator.detune.value = pitch * 100;  ;    oscillator.start(time);    oscillator.stop(time + duration);  };};//
var junksound = function(){var filter = audioContext.createBiquadFilter() ;  filter.connect(audioContext.destination) ;  filter.type = 'lowpass' ;  filter.frequency.value = 10000 ;   ;  play(0, 14, 0.12) ;   ;  function play (delay, pitch, duration) { ;    var startTime = audioContext.currentTime + delay ;    var endTime = startTime + duration ;   ;   ;    var oscillator = audioContext.createOscillator() ;    oscillator.connect(filter) ;   ;   ;    oscillator.type = 'sawtooth' ;    oscillator.detune.value = pitch * 100 ;   ;   ;    oscillator.start(startTime) ;    oscillator.stop(endTime) ;  };}
var foodsound = function(){ var filter = audioContext.createBiquadFilter() ;filter.connect(audioContext.destination) ;filter.type = 'lowpass' ;filter.frequency.value = 10000 ; ;play(0, 15, 0.12) ; ;function play (delay, pitch, duration) { ;  var startTime = audioContext.currentTime + delay ;  var endTime = startTime + duration ; ; ;  var oscillator = audioContext.createOscillator() ;  oscillator.connect(filter) ; ; ;  oscillator.type = 'sawtooth' ;  oscillator.detune.value = pitch * 100 ; ; ;  oscillator.start(startTime) ;  oscillator.stop(endTime);} }
var fanfare = function(){ var filter = audioContext.createBiquadFilter() ;filter.connect(audioContext.destination) ;filter.type = 'lowpass' ;filter.frequency.value = 10000 ; ;play(0, 0, 0.1) ;play(0.2, 5, 0.1) ;play(0.32, 10, 1); ; ;function play (delay, pitch, duration) { ;  var startTime = audioContext.currentTime + delay ;  var endTime = startTime + duration ; ; ;  var oscillator = audioContext.createOscillator() ;  oscillator.connect(filter) ; ; ;  oscillator.type = 'sawtooth' ;  oscillator.detune.value = pitch * 100 ; ; ;  oscillator.start(startTime) ;  oscillator.stop(endTime) ;} }
var dangerSound = function(){;  var filter = audioContext.createBiquadFilter() ;  filter.connect(audioContext.destination) ;  filter.type = 'lowpass' ;  filter.frequency.value = 10000 ;   ;  play(0, -5, 0.2) ;  play(0.2, -10, 0.2) ;   ;  function play (delay, pitch, duration) { ;    var startTime = audioContext.currentTime + delay ;    var endTime = startTime + duration ;   ;   ;    var oscillator = audioContext.createOscillator() ;    oscillator.connect(filter) ;   ;   ;    oscillator.type = 'sawtooth' ;    oscillator.detune.value = pitch * 100 ;   ;   ;    oscillator.start(startTime) ;    oscillator.stop(endTime) ;  } ;}

function Player(pos, images){
    this.pos = pos
    this.images = images
    this.image = images.guyr
    this.sizebox = [24,44]
    this.offset = [20,19]
    this.size = 64
    this.dir = "right"
    this.moving = true
    this.lastFrame = Date.now()
    this.speed = 3
    this.jumping = false
    this.jumpHeight = 30
    this.jumptime = this.jumpHeight
    this.health = 1
    this.hydration = 1
    this.craving = 0.002
    this.end = false
    this.dangerSoundDelay = 50
    this.title = false
}

Player.prototype.setImage = function(keysDown, time){
    this.lastFrame = this.lastFrame + 50 < time ? time : this.lastFrame
    var walking = this.lastFrame == time && (keysDown[37] || keysDown[39])
    this.moving = walking ? !this.moving : this.moving

    if(keysDown[37]){
        this.dir = "left"
    } else if (keysDown[39]){
        this.dir = "right"
    }

    if (this.dir === "left"){
        this.image = this.moving && keysDown[37] ? this.images.guywl : this.images.guyl
        this.image = this.jumping ? this.images.guyjl : this.image
    } else if(this.dir === "right"){
        this.image = this.moving && keysDown[39] ? this.images.guywr : this.images.guyr
        this.image = this.jumping ? this.images.guyjr : this.image
    }
}

Player.prototype.tryMove = function(keysDown, level, dx, dy){
    return !level.collision([this.pos[0]+this.offset[0]+dx, this.pos[1]+this.offset[1] + dy,
        this.pos[0]+this.offset[0]+this.sizebox[0]+dx, this.pos[1]+this.offset[1]+this.sizebox[1] + dy])
}

Player.prototype.move = function(keysDown, level){
    if(keysDown[37]){
        this.pos[0] = this.tryMove(keysDown, level, -this.speed, 0) ? this.pos[0] - this.speed : this.pos[0]
    } else if(keysDown[39]){
        this.pos[0] = this.tryMove(keysDown, level, this.speed, 0) ? this.pos[0] + this.speed : this.pos[0]
    }

    if(keysDown[32] && this.jumptime > 0){
        this.jumping = true
        this.pos[1] = this.tryMove(keysDown, level, 0, -this.speed*1.2) ? this.pos[1] - this.speed*1.2 : this.pos[1]
        this.jumptime--
    } else {
        this.jumping = false
        this.jumptime = 0
        if(this.tryMove(keysDown, level, 0, this.speed*1.2)){
            this.pos[1] += this.speed*1.2
        } else {
            this.jumptime = this.jumpHeight
        }
    }
}

Player.prototype.collect = function(level){
    var item = level.collection([this.pos[0]+this.offset[0], this.pos[1]+this.offset[1],
        this.pos[0]+this.offset[0]+this.sizebox[0], this.pos[1]+this.offset[1]+this.sizebox[1]])
    if (item){
        switch(item[0]){
            case "apple" :
            case "banana" :
            case "brocoli" :
            case "carrot" :
            case "orange" :
            case "strawberry" :
            case "watermelon" :
                this.health += 0.2
                this.hydration += 0.1
                foodsound()
                break
            case "water" :
                this.hydration += 0.5
                foodsound()
                break
            case "candy" :
            case "chocolate" :
            case "icecream" :
                this.health -= 0.1
                this.hydration -= 0.2
                junksound()
        }
    }
    this.hydration = Math.max(0, Math.min(this.hydration, 1))
    this.health = Math.max(0, Math.min(this.health, 1))
}

Player.prototype.victory = function(level){
    var dy = 16
    var win = level.victory([this.pos[0] + this.offset[0], this.pos[1] + this.offset[1] + dy,
        this.pos[0] + this.offset[0] + this.sizebox[0], this.pos[1] + this.offset[1] + this.sizebox[1] + dy])
    if (win){
        if (this.end === false ){
            fanfare()
        }
        this.end = true
    }
}

Player.prototype.dead = function(canvas){
    if(this.pos[1] > canvas.height/2 || this.health <= 0){
        die()
        return true
    } else {
        return false
    }
}

Player.prototype.update = function(canvas, ctx, keysDown, time, level){
    this.move(keysDown, level)

    this.setImage(keysDown, time)
    this.draw(canvas, ctx)
    this.collect(level)
    this.victory(level)


    if (!this.title){
        if(this.hydration > 0 && !this.end){
            this.hydration -= this.craving
        }
        if(this.health > 0 && this.hydration <= 0 && !this.end){
            this.health -= this.craving
        }

        if(this.health < 0.5 && this.dangerSoundDelay < 0){
            dangerSound()
            this.dangerSoundDelay = 50
        }
        this.dangerSoundDelay--
    }
}

Player.prototype.draw = function(canvas, ctx){
    ctx.drawImage(this.image, this.pos[0], this.pos[1], this.size, this.size )
    if (this.hydration < 0.5){
        var s = Math.cos(performance.now()/100)
        ctx.drawImage(this.images.sweatright, this.pos[0] + this.size/2 - 40, this.pos[1]  + 20, this.size/4 + 5*s, this.size/4 + 5*s )
        ctx.drawImage(this.images.sweatleft, this.pos[0] + this.size/2 + 20, this.pos[1]  + 20, this.size/4 + 5*s, this.size/4 + 5*s )
    }
}

Player.prototype.drawWin = function(canvas, ctx){
    if(this.end){
        if(!this.title){
            this.win(canvas, ctx, this.images.youwin)
        } else {
            this.win(canvas, ctx, this.images.vitaman)
        }
    }
}

Player.prototype.win = function(canvas, ctx, image){
    ctx.drawImage(image, canvas.width/4+20, canvas.height/4-20, canvas.width/2, canvas.height/2)
}

Player.prototype.drawbars = function(canvas, ctx){
    ctx.fillStyle = "#666"
    ctx.fillRect(canvas.width*2/8+10, 40, 270, 12)
    ctx.fillRect(canvas.width*4/8+10, 40, 270, 12)
    ctx.fillStyle = "#ffaaaa"
    ctx.fillRect(canvas.width*2/8+10, 40, 270*this.health, 12)
    ctx.fillStyle = "#aaaaff"
    ctx.fillRect(canvas.width*4/8+10, 40, 270*this.hydration, 12)
    ctx.drawImage(this.images.health,    canvas.width*4/8, 0, 200*1.5, this.size*1.5)
    ctx.drawImage(this.images.hydration, canvas.width*2/8, 0, 200*1.5, this.size*1.5)
}

module.exports = Player

},{}],24:[function(require,module,exports){
document.title = "NutritionGame"
var fit = require('canvas-fit')
  var canvas = document.body.appendChild(document.createElement('canvas'))
  window.addEventListener('resize', fit(canvas), false)
  var ctx = canvas.getContext('2d')

var audio = new Audio('./audio/songs/gravity.ogg')
    audio.loop = true
    audio.play()

var guyart = require("./art/js/guy.js")
var blockart = require("./art/js/blocks.js")
var itemart = require("./art/js/items.js")

var Level = require('./levels/level1.js')
var level = new Level(blockart, itemart)
  level.makeSky(canvas, 20)
  level.makeGround(3)

var Player = require('./player/player.js')
var player = new Player([0,-64], guyart)
  player.title = true

var keysDown = {}
document.addEventListener("keydown", function(e){
  keysDown[e.keyCode] = true
  e.preventDefault();
})
document.addEventListener('keyup', function(e){
  delete keysDown[e.keyCode]
})

var startTitle = false
var reset = function(){
  level = new Level(blockart, itemart)
  level.makeSky(canvas, 40)
  level.makeGround(100)
  player = new Player([0,-64], guyart)
  startTitle = false
}

function render(){
  ctx.clearRect(0,0, canvas.width, canvas.height)
  ctx.drawImage(blockart.background, 0, 0, canvas.width, canvas.height)

    level.drawClouds(ctx)
    player.drawbars(canvas, ctx)

  ctx.save()
    ctx.translate(-player.pos[0]+canvas.width/4, canvas.height/2)
    level.draw(ctx)
    player.update(canvas, ctx, keysDown, Date.now(), level)
  ctx.restore()

  if (player.end){
    if (!startTitle){
      startTitle = true
      window.setTimeout(reset, 7000)
    }
    player.drawWin(canvas, ctx)
  }
  if (player.dead(canvas)){
    reset()
  }
  window.requestAnimationFrame(render)
}
render()

},{"./art/js/blocks.js":5,"./art/js/guy.js":6,"./art/js/items.js":9,"./levels/level1.js":10,"./player/player.js":23,"canvas-fit":21}]},{},[24]);
