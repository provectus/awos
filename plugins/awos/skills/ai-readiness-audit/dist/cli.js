#!/usr/bin/env node
import { createRequire as __createRequire } from "node:module";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { dirname as __dirname2 } from "node:path";
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname2(__filename);
const require = __createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/web-tree-sitter/tree-sitter.js
var require_tree_sitter = __commonJS({
  "node_modules/web-tree-sitter/tree-sitter.js"(exports, module) {
    var Module = typeof Module != "undefined" ? Module : {};
    var ENVIRONMENT_IS_WEB = typeof window == "object";
    var ENVIRONMENT_IS_WORKER = typeof importScripts == "function";
    var ENVIRONMENT_IS_NODE = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string";
    if (ENVIRONMENT_IS_NODE) {
    }
    var TreeSitter = (function() {
      var initPromise;
      var document = typeof window == "object" ? {
        currentScript: window.document.currentScript
      } : null;
      class Parser {
        constructor() {
          this.initialize();
        }
        initialize() {
          throw new Error("cannot construct a Parser before calling `init()`");
        }
        static init(moduleOptions) {
          if (initPromise) return initPromise;
          Module = Object.assign({}, Module, moduleOptions);
          return initPromise = new Promise((resolveInitPromise) => {
            var moduleOverrides = Object.assign({}, Module);
            var arguments_ = [];
            var thisProgram = "./this.program";
            var quit_ = (status, toThrow) => {
              throw toThrow;
            };
            var scriptDirectory = "";
            function locateFile(path) {
              if (Module["locateFile"]) {
                return Module["locateFile"](path, scriptDirectory);
              }
              return scriptDirectory + path;
            }
            var readAsync, readBinary;
            if (ENVIRONMENT_IS_NODE) {
              var fs = __require("fs");
              var nodePath = __require("path");
              scriptDirectory = __dirname + "/";
              readBinary = (filename) => {
                filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
                var ret = fs.readFileSync(filename);
                return ret;
              };
              readAsync = (filename, binary2 = true) => {
                filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
                return new Promise((resolve, reject) => {
                  fs.readFile(filename, binary2 ? void 0 : "utf8", (err2, data) => {
                    if (err2) reject(err2);
                    else resolve(binary2 ? data.buffer : data);
                  });
                });
              };
              if (!Module["thisProgram"] && process.argv.length > 1) {
                thisProgram = process.argv[1].replace(/\\/g, "/");
              }
              arguments_ = process.argv.slice(2);
              if (typeof module != "undefined") {
                module["exports"] = Module;
              }
              quit_ = (status, toThrow) => {
                process.exitCode = status;
                throw toThrow;
              };
            } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
              if (ENVIRONMENT_IS_WORKER) {
                scriptDirectory = self.location.href;
              } else if (typeof document != "undefined" && document.currentScript) {
                scriptDirectory = document.currentScript.src;
              }
              if (scriptDirectory.startsWith("blob:")) {
                scriptDirectory = "";
              } else {
                scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1);
              }
              {
                if (ENVIRONMENT_IS_WORKER) {
                  readBinary = (url) => {
                    var xhr = new XMLHttpRequest();
                    xhr.open("GET", url, false);
                    xhr.responseType = "arraybuffer";
                    xhr.send(null);
                    return new Uint8Array(
                      /** @type{!ArrayBuffer} */
                      xhr.response
                    );
                  };
                }
                readAsync = (url) => {
                  if (isFileURI(url)) {
                    return new Promise((reject, resolve) => {
                      var xhr = new XMLHttpRequest();
                      xhr.open("GET", url, true);
                      xhr.responseType = "arraybuffer";
                      xhr.onload = () => {
                        if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                          resolve(xhr.response);
                        }
                        reject(xhr.status);
                      };
                      xhr.onerror = reject;
                      xhr.send(null);
                    });
                  }
                  return fetch(url, {
                    credentials: "same-origin"
                  }).then((response) => {
                    if (response.ok) {
                      return response.arrayBuffer();
                    }
                    return Promise.reject(new Error(response.status + " : " + response.url));
                  });
                };
              }
            } else {
            }
            var out = Module["print"] || console.log.bind(console);
            var err = Module["printErr"] || console.error.bind(console);
            Object.assign(Module, moduleOverrides);
            moduleOverrides = null;
            if (Module["arguments"]) arguments_ = Module["arguments"];
            if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
            if (Module["quit"]) quit_ = Module["quit"];
            var dynamicLibraries = Module["dynamicLibraries"] || [];
            var wasmBinary;
            if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
            var wasmMemory;
            var ABORT = false;
            var EXITSTATUS;
            var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
            var HEAP_DATA_VIEW;
            function updateMemoryViews() {
              var b = wasmMemory.buffer;
              Module["HEAP_DATA_VIEW"] = HEAP_DATA_VIEW = new DataView(b);
              Module["HEAP8"] = HEAP8 = new Int8Array(b);
              Module["HEAP16"] = HEAP16 = new Int16Array(b);
              Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
              Module["HEAPU16"] = HEAPU16 = new Uint16Array(b);
              Module["HEAP32"] = HEAP32 = new Int32Array(b);
              Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
              Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
              Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
            }
            if (Module["wasmMemory"]) {
              wasmMemory = Module["wasmMemory"];
            } else {
              var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 33554432;
              wasmMemory = new WebAssembly.Memory({
                "initial": INITIAL_MEMORY / 65536,
                // In theory we should not need to emit the maximum if we want "unlimited"
                // or 4GB of memory, but VMs error on that atm, see
                // https://github.com/emscripten-core/emscripten/issues/14130
                // And in the pthreads case we definitely need to emit a maximum. So
                // always emit one.
                "maximum": 2147483648 / 65536
              });
            }
            updateMemoryViews();
            var __ATPRERUN__ = [];
            var __ATINIT__ = [];
            var __ATMAIN__ = [];
            var __ATPOSTRUN__ = [];
            var __RELOC_FUNCS__ = [];
            var runtimeInitialized = false;
            function preRun() {
              if (Module["preRun"]) {
                if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
                while (Module["preRun"].length) {
                  addOnPreRun(Module["preRun"].shift());
                }
              }
              callRuntimeCallbacks(__ATPRERUN__);
            }
            function initRuntime() {
              runtimeInitialized = true;
              callRuntimeCallbacks(__RELOC_FUNCS__);
              callRuntimeCallbacks(__ATINIT__);
            }
            function preMain() {
              callRuntimeCallbacks(__ATMAIN__);
            }
            function postRun() {
              if (Module["postRun"]) {
                if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
                while (Module["postRun"].length) {
                  addOnPostRun(Module["postRun"].shift());
                }
              }
              callRuntimeCallbacks(__ATPOSTRUN__);
            }
            function addOnPreRun(cb) {
              __ATPRERUN__.unshift(cb);
            }
            function addOnInit(cb) {
              __ATINIT__.unshift(cb);
            }
            function addOnPostRun(cb) {
              __ATPOSTRUN__.unshift(cb);
            }
            var runDependencies = 0;
            var runDependencyWatcher = null;
            var dependenciesFulfilled = null;
            function getUniqueRunDependency(id) {
              return id;
            }
            function addRunDependency(id) {
              runDependencies++;
              Module["monitorRunDependencies"]?.(runDependencies);
            }
            function removeRunDependency(id) {
              runDependencies--;
              Module["monitorRunDependencies"]?.(runDependencies);
              if (runDependencies == 0) {
                if (runDependencyWatcher !== null) {
                  clearInterval(runDependencyWatcher);
                  runDependencyWatcher = null;
                }
                if (dependenciesFulfilled) {
                  var callback = dependenciesFulfilled;
                  dependenciesFulfilled = null;
                  callback();
                }
              }
            }
            function abort(what) {
              Module["onAbort"]?.(what);
              what = "Aborted(" + what + ")";
              err(what);
              ABORT = true;
              EXITSTATUS = 1;
              what += ". Build with -sASSERTIONS for more info.";
              var e = new WebAssembly.RuntimeError(what);
              throw e;
            }
            var dataURIPrefix = "data:application/octet-stream;base64,";
            var isDataURI = (filename) => filename.startsWith(dataURIPrefix);
            var isFileURI = (filename) => filename.startsWith("file://");
            function findWasmBinary() {
              var f = "tree-sitter.wasm";
              if (!isDataURI(f)) {
                return locateFile(f);
              }
              return f;
            }
            var wasmBinaryFile;
            function getBinarySync(file) {
              if (file == wasmBinaryFile && wasmBinary) {
                return new Uint8Array(wasmBinary);
              }
              if (readBinary) {
                return readBinary(file);
              }
              throw "both async and sync fetching of the wasm failed";
            }
            function getBinaryPromise(binaryFile) {
              if (!wasmBinary) {
                return readAsync(binaryFile).then(
                  (response) => new Uint8Array(
                    /** @type{!ArrayBuffer} */
                    response
                  ),
                  // Fall back to getBinarySync if readAsync fails
                  () => getBinarySync(binaryFile)
                );
              }
              return Promise.resolve().then(() => getBinarySync(binaryFile));
            }
            function instantiateArrayBuffer(binaryFile, imports, receiver) {
              return getBinaryPromise(binaryFile).then((binary2) => WebAssembly.instantiate(binary2, imports)).then(receiver, (reason) => {
                err(`failed to asynchronously prepare wasm: ${reason}`);
                abort(reason);
              });
            }
            function instantiateAsync(binary2, binaryFile, imports, callback) {
              if (!binary2 && typeof WebAssembly.instantiateStreaming == "function" && !isDataURI(binaryFile) && // Don't use streaming for file:// delivered objects in a webview, fetch them synchronously.
              !isFileURI(binaryFile) && // Avoid instantiateStreaming() on Node.js environment for now, as while
              // Node.js v18.1.0 implements it, it does not have a full fetch()
              // implementation yet.
              // Reference:
              //   https://github.com/emscripten-core/emscripten/pull/16917
              !ENVIRONMENT_IS_NODE && typeof fetch == "function") {
                return fetch(binaryFile, {
                  credentials: "same-origin"
                }).then((response) => {
                  var result = WebAssembly.instantiateStreaming(response, imports);
                  return result.then(callback, function(reason) {
                    err(`wasm streaming compile failed: ${reason}`);
                    err("falling back to ArrayBuffer instantiation");
                    return instantiateArrayBuffer(binaryFile, imports, callback);
                  });
                });
              }
              return instantiateArrayBuffer(binaryFile, imports, callback);
            }
            function getWasmImports() {
              return {
                "env": wasmImports,
                "wasi_snapshot_preview1": wasmImports,
                "GOT.mem": new Proxy(wasmImports, GOTHandler),
                "GOT.func": new Proxy(wasmImports, GOTHandler)
              };
            }
            function createWasm() {
              var info2 = getWasmImports();
              function receiveInstance(instance2, module2) {
                wasmExports = instance2.exports;
                wasmExports = relocateExports(wasmExports, 1024);
                var metadata2 = getDylinkMetadata(module2);
                if (metadata2.neededDynlibs) {
                  dynamicLibraries = metadata2.neededDynlibs.concat(dynamicLibraries);
                }
                mergeLibSymbols(wasmExports, "main");
                LDSO.init();
                loadDylibs();
                addOnInit(wasmExports["__wasm_call_ctors"]);
                __RELOC_FUNCS__.push(wasmExports["__wasm_apply_data_relocs"]);
                removeRunDependency("wasm-instantiate");
                return wasmExports;
              }
              addRunDependency("wasm-instantiate");
              function receiveInstantiationResult(result) {
                receiveInstance(result["instance"], result["module"]);
              }
              if (Module["instantiateWasm"]) {
                try {
                  return Module["instantiateWasm"](info2, receiveInstance);
                } catch (e) {
                  err(`Module.instantiateWasm callback failed with error: ${e}`);
                  return false;
                }
              }
              if (!wasmBinaryFile) wasmBinaryFile = findWasmBinary();
              instantiateAsync(wasmBinary, wasmBinaryFile, info2, receiveInstantiationResult);
              return {};
            }
            var ASM_CONSTS = {};
            function ExitStatus(status) {
              this.name = "ExitStatus";
              this.message = `Program terminated with exit(${status})`;
              this.status = status;
            }
            var GOT = {};
            var currentModuleWeakSymbols = /* @__PURE__ */ new Set([]);
            var GOTHandler = {
              get(obj, symName) {
                var rtn = GOT[symName];
                if (!rtn) {
                  rtn = GOT[symName] = new WebAssembly.Global({
                    "value": "i32",
                    "mutable": true
                  });
                }
                if (!currentModuleWeakSymbols.has(symName)) {
                  rtn.required = true;
                }
                return rtn;
              }
            };
            var LE_HEAP_LOAD_F32 = (byteOffset) => HEAP_DATA_VIEW.getFloat32(byteOffset, true);
            var LE_HEAP_LOAD_F64 = (byteOffset) => HEAP_DATA_VIEW.getFloat64(byteOffset, true);
            var LE_HEAP_LOAD_I16 = (byteOffset) => HEAP_DATA_VIEW.getInt16(byteOffset, true);
            var LE_HEAP_LOAD_I32 = (byteOffset) => HEAP_DATA_VIEW.getInt32(byteOffset, true);
            var LE_HEAP_LOAD_U32 = (byteOffset) => HEAP_DATA_VIEW.getUint32(byteOffset, true);
            var LE_HEAP_STORE_F32 = (byteOffset, value) => HEAP_DATA_VIEW.setFloat32(byteOffset, value, true);
            var LE_HEAP_STORE_F64 = (byteOffset, value) => HEAP_DATA_VIEW.setFloat64(byteOffset, value, true);
            var LE_HEAP_STORE_I16 = (byteOffset, value) => HEAP_DATA_VIEW.setInt16(byteOffset, value, true);
            var LE_HEAP_STORE_I32 = (byteOffset, value) => HEAP_DATA_VIEW.setInt32(byteOffset, value, true);
            var LE_HEAP_STORE_U32 = (byteOffset, value) => HEAP_DATA_VIEW.setUint32(byteOffset, value, true);
            var callRuntimeCallbacks = (callbacks) => {
              while (callbacks.length > 0) {
                callbacks.shift()(Module);
              }
            };
            var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder() : void 0;
            var UTF8ArrayToString = (heapOrArray, idx, maxBytesToRead) => {
              var endIdx = idx + maxBytesToRead;
              var endPtr = idx;
              while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
              if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
                return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
              }
              var str = "";
              while (idx < endPtr) {
                var u0 = heapOrArray[idx++];
                if (!(u0 & 128)) {
                  str += String.fromCharCode(u0);
                  continue;
                }
                var u1 = heapOrArray[idx++] & 63;
                if ((u0 & 224) == 192) {
                  str += String.fromCharCode((u0 & 31) << 6 | u1);
                  continue;
                }
                var u2 = heapOrArray[idx++] & 63;
                if ((u0 & 240) == 224) {
                  u0 = (u0 & 15) << 12 | u1 << 6 | u2;
                } else {
                  u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
                }
                if (u0 < 65536) {
                  str += String.fromCharCode(u0);
                } else {
                  var ch = u0 - 65536;
                  str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
                }
              }
              return str;
            };
            var getDylinkMetadata = (binary2) => {
              var offset = 0;
              var end = 0;
              function getU8() {
                return binary2[offset++];
              }
              function getLEB() {
                var ret = 0;
                var mul = 1;
                while (1) {
                  var byte = binary2[offset++];
                  ret += (byte & 127) * mul;
                  mul *= 128;
                  if (!(byte & 128)) break;
                }
                return ret;
              }
              function getString() {
                var len = getLEB();
                offset += len;
                return UTF8ArrayToString(binary2, offset - len, len);
              }
              function failIf(condition, message) {
                if (condition) throw new Error(message);
              }
              var name2 = "dylink.0";
              if (binary2 instanceof WebAssembly.Module) {
                var dylinkSection = WebAssembly.Module.customSections(binary2, name2);
                if (dylinkSection.length === 0) {
                  name2 = "dylink";
                  dylinkSection = WebAssembly.Module.customSections(binary2, name2);
                }
                failIf(dylinkSection.length === 0, "need dylink section");
                binary2 = new Uint8Array(dylinkSection[0]);
                end = binary2.length;
              } else {
                var int32View = new Uint32Array(new Uint8Array(binary2.subarray(0, 24)).buffer);
                var magicNumberFound = int32View[0] == 1836278016 || int32View[0] == 6386541;
                failIf(!magicNumberFound, "need to see wasm magic number");
                failIf(binary2[8] !== 0, "need the dylink section to be first");
                offset = 9;
                var section_size = getLEB();
                end = offset + section_size;
                name2 = getString();
              }
              var customSection = {
                neededDynlibs: [],
                tlsExports: /* @__PURE__ */ new Set(),
                weakImports: /* @__PURE__ */ new Set()
              };
              if (name2 == "dylink") {
                customSection.memorySize = getLEB();
                customSection.memoryAlign = getLEB();
                customSection.tableSize = getLEB();
                customSection.tableAlign = getLEB();
                var neededDynlibsCount = getLEB();
                for (var i2 = 0; i2 < neededDynlibsCount; ++i2) {
                  var libname = getString();
                  customSection.neededDynlibs.push(libname);
                }
              } else {
                failIf(name2 !== "dylink.0");
                var WASM_DYLINK_MEM_INFO = 1;
                var WASM_DYLINK_NEEDED = 2;
                var WASM_DYLINK_EXPORT_INFO = 3;
                var WASM_DYLINK_IMPORT_INFO = 4;
                var WASM_SYMBOL_TLS = 256;
                var WASM_SYMBOL_BINDING_MASK = 3;
                var WASM_SYMBOL_BINDING_WEAK = 1;
                while (offset < end) {
                  var subsectionType = getU8();
                  var subsectionSize = getLEB();
                  if (subsectionType === WASM_DYLINK_MEM_INFO) {
                    customSection.memorySize = getLEB();
                    customSection.memoryAlign = getLEB();
                    customSection.tableSize = getLEB();
                    customSection.tableAlign = getLEB();
                  } else if (subsectionType === WASM_DYLINK_NEEDED) {
                    var neededDynlibsCount = getLEB();
                    for (var i2 = 0; i2 < neededDynlibsCount; ++i2) {
                      libname = getString();
                      customSection.neededDynlibs.push(libname);
                    }
                  } else if (subsectionType === WASM_DYLINK_EXPORT_INFO) {
                    var count = getLEB();
                    while (count--) {
                      var symname = getString();
                      var flags2 = getLEB();
                      if (flags2 & WASM_SYMBOL_TLS) {
                        customSection.tlsExports.add(symname);
                      }
                    }
                  } else if (subsectionType === WASM_DYLINK_IMPORT_INFO) {
                    var count = getLEB();
                    while (count--) {
                      var modname = getString();
                      var symname = getString();
                      var flags2 = getLEB();
                      if ((flags2 & WASM_SYMBOL_BINDING_MASK) == WASM_SYMBOL_BINDING_WEAK) {
                        customSection.weakImports.add(symname);
                      }
                    }
                  } else {
                    offset += subsectionSize;
                  }
                }
              }
              return customSection;
            };
            function getValue(ptr, type = "i8") {
              if (type.endsWith("*")) type = "*";
              switch (type) {
                case "i1":
                  return HEAP8[ptr];
                case "i8":
                  return HEAP8[ptr];
                case "i16":
                  return LE_HEAP_LOAD_I16((ptr >> 1) * 2);
                case "i32":
                  return LE_HEAP_LOAD_I32((ptr >> 2) * 4);
                case "i64":
                  abort("to do getValue(i64) use WASM_BIGINT");
                case "float":
                  return LE_HEAP_LOAD_F32((ptr >> 2) * 4);
                case "double":
                  return LE_HEAP_LOAD_F64((ptr >> 3) * 8);
                case "*":
                  return LE_HEAP_LOAD_U32((ptr >> 2) * 4);
                default:
                  abort(`invalid type for getValue: ${type}`);
              }
            }
            var newDSO = (name2, handle2, syms) => {
              var dso = {
                refcount: Infinity,
                name: name2,
                exports: syms,
                global: true
              };
              LDSO.loadedLibsByName[name2] = dso;
              if (handle2 != void 0) {
                LDSO.loadedLibsByHandle[handle2] = dso;
              }
              return dso;
            };
            var LDSO = {
              loadedLibsByName: {},
              loadedLibsByHandle: {},
              init() {
                newDSO("__main__", 0, wasmImports);
              }
            };
            var ___heap_base = 78112;
            var zeroMemory = (address, size) => {
              HEAPU8.fill(0, address, address + size);
              return address;
            };
            var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;
            var getMemory = (size) => {
              if (runtimeInitialized) {
                return zeroMemory(_malloc(size), size);
              }
              var ret = ___heap_base;
              var end = ret + alignMemory(size, 16);
              ___heap_base = end;
              GOT["__heap_base"].value = end;
              return ret;
            };
            var isInternalSym = (symName) => ["__cpp_exception", "__c_longjmp", "__wasm_apply_data_relocs", "__dso_handle", "__tls_size", "__tls_align", "__set_stack_limits", "_emscripten_tls_init", "__wasm_init_tls", "__wasm_call_ctors", "__start_em_asm", "__stop_em_asm", "__start_em_js", "__stop_em_js"].includes(symName) || symName.startsWith("__em_js__");
            var uleb128Encode = (n, target) => {
              if (n < 128) {
                target.push(n);
              } else {
                target.push(n % 128 | 128, n >> 7);
              }
            };
            var sigToWasmTypes = (sig) => {
              var typeNames = {
                "i": "i32",
                "j": "i64",
                "f": "f32",
                "d": "f64",
                "e": "externref",
                "p": "i32"
              };
              var type = {
                parameters: [],
                results: sig[0] == "v" ? [] : [typeNames[sig[0]]]
              };
              for (var i2 = 1; i2 < sig.length; ++i2) {
                type.parameters.push(typeNames[sig[i2]]);
              }
              return type;
            };
            var generateFuncType = (sig, target) => {
              var sigRet = sig.slice(0, 1);
              var sigParam = sig.slice(1);
              var typeCodes = {
                "i": 127,
                // i32
                "p": 127,
                // i32
                "j": 126,
                // i64
                "f": 125,
                // f32
                "d": 124,
                // f64
                "e": 111
              };
              target.push(96);
              uleb128Encode(sigParam.length, target);
              for (var i2 = 0; i2 < sigParam.length; ++i2) {
                target.push(typeCodes[sigParam[i2]]);
              }
              if (sigRet == "v") {
                target.push(0);
              } else {
                target.push(1, typeCodes[sigRet]);
              }
            };
            var convertJsFunctionToWasm = (func2, sig) => {
              if (typeof WebAssembly.Function == "function") {
                return new WebAssembly.Function(sigToWasmTypes(sig), func2);
              }
              var typeSectionBody = [1];
              generateFuncType(sig, typeSectionBody);
              var bytes = [
                0,
                97,
                115,
                109,
                // magic ("\0asm")
                1,
                0,
                0,
                0,
                // version: 1
                1
              ];
              uleb128Encode(typeSectionBody.length, bytes);
              bytes.push(...typeSectionBody);
              bytes.push(
                2,
                7,
                // import section
                // (import "e" "f" (func 0 (type 0)))
                1,
                1,
                101,
                1,
                102,
                0,
                0,
                7,
                5,
                // export section
                // (export "f" (func 0 (type 0)))
                1,
                1,
                102,
                0,
                0
              );
              var module2 = new WebAssembly.Module(new Uint8Array(bytes));
              var instance2 = new WebAssembly.Instance(module2, {
                "e": {
                  "f": func2
                }
              });
              var wrappedFunc = instance2.exports["f"];
              return wrappedFunc;
            };
            var wasmTableMirror = [];
            var wasmTable = new WebAssembly.Table({
              "initial": 28,
              "element": "anyfunc"
            });
            var getWasmTableEntry = (funcPtr) => {
              var func2 = wasmTableMirror[funcPtr];
              if (!func2) {
                if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
                wasmTableMirror[funcPtr] = func2 = wasmTable.get(funcPtr);
              }
              return func2;
            };
            var updateTableMap = (offset, count) => {
              if (functionsInTableMap) {
                for (var i2 = offset; i2 < offset + count; i2++) {
                  var item = getWasmTableEntry(i2);
                  if (item) {
                    functionsInTableMap.set(item, i2);
                  }
                }
              }
            };
            var functionsInTableMap;
            var getFunctionAddress = (func2) => {
              if (!functionsInTableMap) {
                functionsInTableMap = /* @__PURE__ */ new WeakMap();
                updateTableMap(0, wasmTable.length);
              }
              return functionsInTableMap.get(func2) || 0;
            };
            var freeTableIndexes = [];
            var getEmptyTableSlot = () => {
              if (freeTableIndexes.length) {
                return freeTableIndexes.pop();
              }
              try {
                wasmTable.grow(1);
              } catch (err2) {
                if (!(err2 instanceof RangeError)) {
                  throw err2;
                }
                throw "Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.";
              }
              return wasmTable.length - 1;
            };
            var setWasmTableEntry = (idx, func2) => {
              wasmTable.set(idx, func2);
              wasmTableMirror[idx] = wasmTable.get(idx);
            };
            var addFunction = (func2, sig) => {
              var rtn = getFunctionAddress(func2);
              if (rtn) {
                return rtn;
              }
              var ret = getEmptyTableSlot();
              try {
                setWasmTableEntry(ret, func2);
              } catch (err2) {
                if (!(err2 instanceof TypeError)) {
                  throw err2;
                }
                var wrapped = convertJsFunctionToWasm(func2, sig);
                setWasmTableEntry(ret, wrapped);
              }
              functionsInTableMap.set(func2, ret);
              return ret;
            };
            var updateGOT = (exports2, replace) => {
              for (var symName in exports2) {
                if (isInternalSym(symName)) {
                  continue;
                }
                var value = exports2[symName];
                if (symName.startsWith("orig$")) {
                  symName = symName.split("$")[1];
                  replace = true;
                }
                GOT[symName] ||= new WebAssembly.Global({
                  "value": "i32",
                  "mutable": true
                });
                if (replace || GOT[symName].value == 0) {
                  if (typeof value == "function") {
                    GOT[symName].value = addFunction(value);
                  } else if (typeof value == "number") {
                    GOT[symName].value = value;
                  } else {
                    err(`unhandled export type for '${symName}': ${typeof value}`);
                  }
                }
              }
            };
            var relocateExports = (exports2, memoryBase2, replace) => {
              var relocated = {};
              for (var e in exports2) {
                var value = exports2[e];
                if (typeof value == "object") {
                  value = value.value;
                }
                if (typeof value == "number") {
                  value += memoryBase2;
                }
                relocated[e] = value;
              }
              updateGOT(relocated, replace);
              return relocated;
            };
            var isSymbolDefined = (symName) => {
              var existing = wasmImports[symName];
              if (!existing || existing.stub) {
                return false;
              }
              return true;
            };
            var dynCallLegacy = (sig, ptr, args2) => {
              sig = sig.replace(/p/g, "i");
              var f = Module["dynCall_" + sig];
              return f(ptr, ...args2);
            };
            var dynCall = (sig, ptr, args2 = []) => {
              if (sig.includes("j")) {
                return dynCallLegacy(sig, ptr, args2);
              }
              var rtn = getWasmTableEntry(ptr)(...args2);
              return rtn;
            };
            var stackSave = () => _emscripten_stack_get_current();
            var stackRestore = (val) => __emscripten_stack_restore(val);
            var createInvokeFunction = (sig) => (ptr, ...args2) => {
              var sp = stackSave();
              try {
                return dynCall(sig, ptr, args2);
              } catch (e) {
                stackRestore(sp);
                if (e !== e + 0) throw e;
                _setThrew(1, 0);
              }
            };
            var resolveGlobalSymbol = (symName, direct = false) => {
              var sym;
              if (direct && "orig$" + symName in wasmImports) {
                symName = "orig$" + symName;
              }
              if (isSymbolDefined(symName)) {
                sym = wasmImports[symName];
              } else if (symName.startsWith("invoke_")) {
                sym = wasmImports[symName] = createInvokeFunction(symName.split("_")[1]);
              }
              return {
                sym,
                name: symName
              };
            };
            var UTF8ToString = (ptr, maxBytesToRead) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
            var loadWebAssemblyModule = (binary, flags, libName, localScope, handle) => {
              var metadata = getDylinkMetadata(binary);
              currentModuleWeakSymbols = metadata.weakImports;
              function loadModule() {
                var firstLoad = !handle || !HEAP8[handle + 8];
                if (firstLoad) {
                  var memAlign = Math.pow(2, metadata.memoryAlign);
                  var memoryBase = metadata.memorySize ? alignMemory(getMemory(metadata.memorySize + memAlign), memAlign) : 0;
                  var tableBase = metadata.tableSize ? wasmTable.length : 0;
                  if (handle) {
                    HEAP8[handle + 8] = 1;
                    LE_HEAP_STORE_U32((handle + 12 >> 2) * 4, memoryBase);
                    LE_HEAP_STORE_I32((handle + 16 >> 2) * 4, metadata.memorySize);
                    LE_HEAP_STORE_U32((handle + 20 >> 2) * 4, tableBase);
                    LE_HEAP_STORE_I32((handle + 24 >> 2) * 4, metadata.tableSize);
                  }
                } else {
                  memoryBase = LE_HEAP_LOAD_U32((handle + 12 >> 2) * 4);
                  tableBase = LE_HEAP_LOAD_U32((handle + 20 >> 2) * 4);
                }
                var tableGrowthNeeded = tableBase + metadata.tableSize - wasmTable.length;
                if (tableGrowthNeeded > 0) {
                  wasmTable.grow(tableGrowthNeeded);
                }
                var moduleExports;
                function resolveSymbol(sym) {
                  var resolved = resolveGlobalSymbol(sym).sym;
                  if (!resolved && localScope) {
                    resolved = localScope[sym];
                  }
                  if (!resolved) {
                    resolved = moduleExports[sym];
                  }
                  return resolved;
                }
                var proxyHandler = {
                  get(stubs, prop) {
                    switch (prop) {
                      case "__memory_base":
                        return memoryBase;
                      case "__table_base":
                        return tableBase;
                    }
                    if (prop in wasmImports && !wasmImports[prop].stub) {
                      return wasmImports[prop];
                    }
                    if (!(prop in stubs)) {
                      var resolved;
                      stubs[prop] = (...args2) => {
                        resolved ||= resolveSymbol(prop);
                        return resolved(...args2);
                      };
                    }
                    return stubs[prop];
                  }
                };
                var proxy = new Proxy({}, proxyHandler);
                var info = {
                  "GOT.mem": new Proxy({}, GOTHandler),
                  "GOT.func": new Proxy({}, GOTHandler),
                  "env": proxy,
                  "wasi_snapshot_preview1": proxy
                };
                function postInstantiation(module, instance) {
                  updateTableMap(tableBase, metadata.tableSize);
                  moduleExports = relocateExports(instance.exports, memoryBase);
                  if (!flags.allowUndefined) {
                    reportUndefinedSymbols();
                  }
                  function addEmAsm(addr, body) {
                    var args = [];
                    var arity = 0;
                    for (; arity < 16; arity++) {
                      if (body.indexOf("$" + arity) != -1) {
                        args.push("$" + arity);
                      } else {
                        break;
                      }
                    }
                    args = args.join(",");
                    var func = `(${args}) => { ${body} };`;
                    ASM_CONSTS[start] = eval(func);
                  }
                  if ("__start_em_asm" in moduleExports) {
                    var start = moduleExports["__start_em_asm"];
                    var stop = moduleExports["__stop_em_asm"];
                    while (start < stop) {
                      var jsString = UTF8ToString(start);
                      addEmAsm(start, jsString);
                      start = HEAPU8.indexOf(0, start) + 1;
                    }
                  }
                  function addEmJs(name, cSig, body) {
                    var jsArgs = [];
                    cSig = cSig.slice(1, -1);
                    if (cSig != "void") {
                      cSig = cSig.split(",");
                      for (var i in cSig) {
                        var jsArg = cSig[i].split(" ").pop();
                        jsArgs.push(jsArg.replace("*", ""));
                      }
                    }
                    var func = `(${jsArgs}) => ${body};`;
                    moduleExports[name] = eval(func);
                  }
                  for (var name in moduleExports) {
                    if (name.startsWith("__em_js__")) {
                      var start = moduleExports[name];
                      var jsString = UTF8ToString(start);
                      var parts = jsString.split("<::>");
                      addEmJs(name.replace("__em_js__", ""), parts[0], parts[1]);
                      delete moduleExports[name];
                    }
                  }
                  var applyRelocs = moduleExports["__wasm_apply_data_relocs"];
                  if (applyRelocs) {
                    if (runtimeInitialized) {
                      applyRelocs();
                    } else {
                      __RELOC_FUNCS__.push(applyRelocs);
                    }
                  }
                  var init = moduleExports["__wasm_call_ctors"];
                  if (init) {
                    if (runtimeInitialized) {
                      init();
                    } else {
                      __ATINIT__.push(init);
                    }
                  }
                  return moduleExports;
                }
                if (flags.loadAsync) {
                  if (binary instanceof WebAssembly.Module) {
                    var instance = new WebAssembly.Instance(binary, info);
                    return Promise.resolve(postInstantiation(binary, instance));
                  }
                  return WebAssembly.instantiate(binary, info).then((result) => postInstantiation(result.module, result.instance));
                }
                var module = binary instanceof WebAssembly.Module ? binary : new WebAssembly.Module(binary);
                var instance = new WebAssembly.Instance(module, info);
                return postInstantiation(module, instance);
              }
              if (flags.loadAsync) {
                return metadata.neededDynlibs.reduce((chain, dynNeeded) => chain.then(() => loadDynamicLibrary(dynNeeded, flags, localScope)), Promise.resolve()).then(loadModule);
              }
              metadata.neededDynlibs.forEach((needed) => loadDynamicLibrary(needed, flags, localScope));
              return loadModule();
            };
            var mergeLibSymbols = (exports2, libName2) => {
              for (var [sym, exp] of Object.entries(exports2)) {
                const setImport = (target) => {
                  if (!isSymbolDefined(target)) {
                    wasmImports[target] = exp;
                  }
                };
                setImport(sym);
                const main_alias = "__main_argc_argv";
                if (sym == "main") {
                  setImport(main_alias);
                }
                if (sym == main_alias) {
                  setImport("main");
                }
                if (sym.startsWith("dynCall_") && !Module.hasOwnProperty(sym)) {
                  Module[sym] = exp;
                }
              }
            };
            var asyncLoad = (url, onload, onerror, noRunDep) => {
              var dep = !noRunDep ? getUniqueRunDependency(`al ${url}`) : "";
              readAsync(url).then((arrayBuffer) => {
                onload(new Uint8Array(arrayBuffer));
                if (dep) removeRunDependency(dep);
              }, (err2) => {
                if (onerror) {
                  onerror();
                } else {
                  throw `Loading data file "${url}" failed.`;
                }
              });
              if (dep) addRunDependency(dep);
            };
            function loadDynamicLibrary(libName2, flags2 = {
              global: true,
              nodelete: true
            }, localScope2, handle2) {
              var dso = LDSO.loadedLibsByName[libName2];
              if (dso) {
                if (!flags2.global) {
                  if (localScope2) {
                    Object.assign(localScope2, dso.exports);
                  }
                } else if (!dso.global) {
                  dso.global = true;
                  mergeLibSymbols(dso.exports, libName2);
                }
                if (flags2.nodelete && dso.refcount !== Infinity) {
                  dso.refcount = Infinity;
                }
                dso.refcount++;
                if (handle2) {
                  LDSO.loadedLibsByHandle[handle2] = dso;
                }
                return flags2.loadAsync ? Promise.resolve(true) : true;
              }
              dso = newDSO(libName2, handle2, "loading");
              dso.refcount = flags2.nodelete ? Infinity : 1;
              dso.global = flags2.global;
              function loadLibData() {
                if (handle2) {
                  var data = LE_HEAP_LOAD_U32((handle2 + 28 >> 2) * 4);
                  var dataSize = LE_HEAP_LOAD_U32((handle2 + 32 >> 2) * 4);
                  if (data && dataSize) {
                    var libData = HEAP8.slice(data, data + dataSize);
                    return flags2.loadAsync ? Promise.resolve(libData) : libData;
                  }
                }
                var libFile = locateFile(libName2);
                if (flags2.loadAsync) {
                  return new Promise(function(resolve, reject) {
                    asyncLoad(libFile, resolve, reject);
                  });
                }
                if (!readBinary) {
                  throw new Error(`${libFile}: file not found, and synchronous loading of external files is not available`);
                }
                return readBinary(libFile);
              }
              function getExports() {
                if (flags2.loadAsync) {
                  return loadLibData().then((libData) => loadWebAssemblyModule(libData, flags2, libName2, localScope2, handle2));
                }
                return loadWebAssemblyModule(loadLibData(), flags2, libName2, localScope2, handle2);
              }
              function moduleLoaded(exports2) {
                if (dso.global) {
                  mergeLibSymbols(exports2, libName2);
                } else if (localScope2) {
                  Object.assign(localScope2, exports2);
                }
                dso.exports = exports2;
              }
              if (flags2.loadAsync) {
                return getExports().then((exports2) => {
                  moduleLoaded(exports2);
                  return true;
                });
              }
              moduleLoaded(getExports());
              return true;
            }
            var reportUndefinedSymbols = () => {
              for (var [symName, entry] of Object.entries(GOT)) {
                if (entry.value == 0) {
                  var value = resolveGlobalSymbol(symName, true).sym;
                  if (!value && !entry.required) {
                    continue;
                  }
                  if (typeof value == "function") {
                    entry.value = addFunction(value, value.sig);
                  } else if (typeof value == "number") {
                    entry.value = value;
                  } else {
                    throw new Error(`bad export type for '${symName}': ${typeof value}`);
                  }
                }
              }
            };
            var loadDylibs = () => {
              if (!dynamicLibraries.length) {
                reportUndefinedSymbols();
                return;
              }
              addRunDependency("loadDylibs");
              dynamicLibraries.reduce((chain, lib) => chain.then(() => loadDynamicLibrary(lib, {
                loadAsync: true,
                global: true,
                nodelete: true,
                allowUndefined: true
              })), Promise.resolve()).then(() => {
                reportUndefinedSymbols();
                removeRunDependency("loadDylibs");
              });
            };
            var noExitRuntime = Module["noExitRuntime"] || true;
            function setValue(ptr, value, type = "i8") {
              if (type.endsWith("*")) type = "*";
              switch (type) {
                case "i1":
                  HEAP8[ptr] = value;
                  break;
                case "i8":
                  HEAP8[ptr] = value;
                  break;
                case "i16":
                  LE_HEAP_STORE_I16((ptr >> 1) * 2, value);
                  break;
                case "i32":
                  LE_HEAP_STORE_I32((ptr >> 2) * 4, value);
                  break;
                case "i64":
                  abort("to do setValue(i64) use WASM_BIGINT");
                case "float":
                  LE_HEAP_STORE_F32((ptr >> 2) * 4, value);
                  break;
                case "double":
                  LE_HEAP_STORE_F64((ptr >> 3) * 8, value);
                  break;
                case "*":
                  LE_HEAP_STORE_U32((ptr >> 2) * 4, value);
                  break;
                default:
                  abort(`invalid type for setValue: ${type}`);
              }
            }
            var ___memory_base = new WebAssembly.Global({
              "value": "i32",
              "mutable": false
            }, 1024);
            var ___stack_pointer = new WebAssembly.Global({
              "value": "i32",
              "mutable": true
            }, 78112);
            var ___table_base = new WebAssembly.Global({
              "value": "i32",
              "mutable": false
            }, 1);
            var __abort_js = () => {
              abort("");
            };
            __abort_js.sig = "v";
            var nowIsMonotonic = 1;
            var __emscripten_get_now_is_monotonic = () => nowIsMonotonic;
            __emscripten_get_now_is_monotonic.sig = "i";
            var __emscripten_memcpy_js = (dest, src, num) => HEAPU8.copyWithin(dest, src, src + num);
            __emscripten_memcpy_js.sig = "vppp";
            var _emscripten_date_now = () => Date.now();
            _emscripten_date_now.sig = "d";
            var _emscripten_get_now;
            _emscripten_get_now = () => performance.now();
            _emscripten_get_now.sig = "d";
            var getHeapMax = () => (
              // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
              // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
              // for any code that deals with heap sizes, which would require special
              // casing all heap size related code to treat 0 specially.
              2147483648
            );
            var growMemory = (size) => {
              var b = wasmMemory.buffer;
              var pages = (size - b.byteLength + 65535) / 65536;
              try {
                wasmMemory.grow(pages);
                updateMemoryViews();
                return 1;
              } catch (e) {
              }
            };
            var _emscripten_resize_heap = (requestedSize) => {
              var oldSize = HEAPU8.length;
              requestedSize >>>= 0;
              var maxHeapSize = getHeapMax();
              if (requestedSize > maxHeapSize) {
                return false;
              }
              var alignUp = (x, multiple) => x + (multiple - x % multiple) % multiple;
              for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
                var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
                overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
                var newSize = Math.min(maxHeapSize, alignUp(Math.max(requestedSize, overGrownHeapSize), 65536));
                var replacement = growMemory(newSize);
                if (replacement) {
                  return true;
                }
              }
              return false;
            };
            _emscripten_resize_heap.sig = "ip";
            var _fd_close = (fd) => 52;
            _fd_close.sig = "ii";
            var convertI32PairToI53Checked = (lo, hi) => hi + 2097152 >>> 0 < 4194305 - !!lo ? (lo >>> 0) + hi * 4294967296 : NaN;
            function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
              var offset = convertI32PairToI53Checked(offset_low, offset_high);
              return 70;
            }
            _fd_seek.sig = "iiiiip";
            var printCharBuffers = [null, [], []];
            var printChar = (stream, curr) => {
              var buffer = printCharBuffers[stream];
              if (curr === 0 || curr === 10) {
                (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
                buffer.length = 0;
              } else {
                buffer.push(curr);
              }
            };
            var _fd_write = (fd, iov, iovcnt, pnum) => {
              var num = 0;
              for (var i2 = 0; i2 < iovcnt; i2++) {
                var ptr = LE_HEAP_LOAD_U32((iov >> 2) * 4);
                var len = LE_HEAP_LOAD_U32((iov + 4 >> 2) * 4);
                iov += 8;
                for (var j = 0; j < len; j++) {
                  printChar(fd, HEAPU8[ptr + j]);
                }
                num += len;
              }
              LE_HEAP_STORE_U32((pnum >> 2) * 4, num);
              return 0;
            };
            _fd_write.sig = "iippp";
            function _tree_sitter_log_callback(isLexMessage, messageAddress) {
              if (currentLogCallback) {
                const message = UTF8ToString(messageAddress);
                currentLogCallback(message, isLexMessage !== 0);
              }
            }
            function _tree_sitter_parse_callback(inputBufferAddress, index, row, column, lengthAddress) {
              const INPUT_BUFFER_SIZE = 10 * 1024;
              const string = currentParseCallback(index, {
                row,
                column
              });
              if (typeof string === "string") {
                setValue(lengthAddress, string.length, "i32");
                stringToUTF16(string, inputBufferAddress, INPUT_BUFFER_SIZE);
              } else {
                setValue(lengthAddress, 0, "i32");
              }
            }
            var runtimeKeepaliveCounter = 0;
            var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
            var _proc_exit = (code) => {
              EXITSTATUS = code;
              if (!keepRuntimeAlive()) {
                Module["onExit"]?.(code);
                ABORT = true;
              }
              quit_(code, new ExitStatus(code));
            };
            _proc_exit.sig = "vi";
            var exitJS = (status, implicit) => {
              EXITSTATUS = status;
              _proc_exit(status);
            };
            var handleException = (e) => {
              if (e instanceof ExitStatus || e == "unwind") {
                return EXITSTATUS;
              }
              quit_(1, e);
            };
            var lengthBytesUTF8 = (str) => {
              var len = 0;
              for (var i2 = 0; i2 < str.length; ++i2) {
                var c = str.charCodeAt(i2);
                if (c <= 127) {
                  len++;
                } else if (c <= 2047) {
                  len += 2;
                } else if (c >= 55296 && c <= 57343) {
                  len += 4;
                  ++i2;
                } else {
                  len += 3;
                }
              }
              return len;
            };
            var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
              if (!(maxBytesToWrite > 0)) return 0;
              var startIdx = outIdx;
              var endIdx = outIdx + maxBytesToWrite - 1;
              for (var i2 = 0; i2 < str.length; ++i2) {
                var u = str.charCodeAt(i2);
                if (u >= 55296 && u <= 57343) {
                  var u1 = str.charCodeAt(++i2);
                  u = 65536 + ((u & 1023) << 10) | u1 & 1023;
                }
                if (u <= 127) {
                  if (outIdx >= endIdx) break;
                  heap[outIdx++] = u;
                } else if (u <= 2047) {
                  if (outIdx + 1 >= endIdx) break;
                  heap[outIdx++] = 192 | u >> 6;
                  heap[outIdx++] = 128 | u & 63;
                } else if (u <= 65535) {
                  if (outIdx + 2 >= endIdx) break;
                  heap[outIdx++] = 224 | u >> 12;
                  heap[outIdx++] = 128 | u >> 6 & 63;
                  heap[outIdx++] = 128 | u & 63;
                } else {
                  if (outIdx + 3 >= endIdx) break;
                  heap[outIdx++] = 240 | u >> 18;
                  heap[outIdx++] = 128 | u >> 12 & 63;
                  heap[outIdx++] = 128 | u >> 6 & 63;
                  heap[outIdx++] = 128 | u & 63;
                }
              }
              heap[outIdx] = 0;
              return outIdx - startIdx;
            };
            var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
            var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
            var stringToUTF8OnStack = (str) => {
              var size = lengthBytesUTF8(str) + 1;
              var ret = stackAlloc(size);
              stringToUTF8(str, ret, size);
              return ret;
            };
            var stringToUTF16 = (str, outPtr, maxBytesToWrite) => {
              maxBytesToWrite ??= 2147483647;
              if (maxBytesToWrite < 2) return 0;
              maxBytesToWrite -= 2;
              var startPtr = outPtr;
              var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
              for (var i2 = 0; i2 < numCharsToWrite; ++i2) {
                var codeUnit = str.charCodeAt(i2);
                LE_HEAP_STORE_I16((outPtr >> 1) * 2, codeUnit);
                outPtr += 2;
              }
              LE_HEAP_STORE_I16((outPtr >> 1) * 2, 0);
              return outPtr - startPtr;
            };
            var AsciiToString = (ptr) => {
              var str = "";
              while (1) {
                var ch = HEAPU8[ptr++];
                if (!ch) return str;
                str += String.fromCharCode(ch);
              }
            };
            var wasmImports = {
              /** @export */
              __heap_base: ___heap_base,
              /** @export */
              __indirect_function_table: wasmTable,
              /** @export */
              __memory_base: ___memory_base,
              /** @export */
              __stack_pointer: ___stack_pointer,
              /** @export */
              __table_base: ___table_base,
              /** @export */
              _abort_js: __abort_js,
              /** @export */
              _emscripten_get_now_is_monotonic: __emscripten_get_now_is_monotonic,
              /** @export */
              _emscripten_memcpy_js: __emscripten_memcpy_js,
              /** @export */
              emscripten_get_now: _emscripten_get_now,
              /** @export */
              emscripten_resize_heap: _emscripten_resize_heap,
              /** @export */
              fd_close: _fd_close,
              /** @export */
              fd_seek: _fd_seek,
              /** @export */
              fd_write: _fd_write,
              /** @export */
              memory: wasmMemory,
              /** @export */
              tree_sitter_log_callback: _tree_sitter_log_callback,
              /** @export */
              tree_sitter_parse_callback: _tree_sitter_parse_callback
            };
            var wasmExports = createWasm();
            var ___wasm_call_ctors = () => (___wasm_call_ctors = wasmExports["__wasm_call_ctors"])();
            var ___wasm_apply_data_relocs = () => (___wasm_apply_data_relocs = wasmExports["__wasm_apply_data_relocs"])();
            var _malloc = Module["_malloc"] = (a0) => (_malloc = Module["_malloc"] = wasmExports["malloc"])(a0);
            var _calloc = Module["_calloc"] = (a0, a1) => (_calloc = Module["_calloc"] = wasmExports["calloc"])(a0, a1);
            var _realloc = Module["_realloc"] = (a0, a1) => (_realloc = Module["_realloc"] = wasmExports["realloc"])(a0, a1);
            var _free = Module["_free"] = (a0) => (_free = Module["_free"] = wasmExports["free"])(a0);
            var _ts_language_symbol_count = Module["_ts_language_symbol_count"] = (a0) => (_ts_language_symbol_count = Module["_ts_language_symbol_count"] = wasmExports["ts_language_symbol_count"])(a0);
            var _ts_language_state_count = Module["_ts_language_state_count"] = (a0) => (_ts_language_state_count = Module["_ts_language_state_count"] = wasmExports["ts_language_state_count"])(a0);
            var _ts_language_version = Module["_ts_language_version"] = (a0) => (_ts_language_version = Module["_ts_language_version"] = wasmExports["ts_language_version"])(a0);
            var _ts_language_field_count = Module["_ts_language_field_count"] = (a0) => (_ts_language_field_count = Module["_ts_language_field_count"] = wasmExports["ts_language_field_count"])(a0);
            var _ts_language_next_state = Module["_ts_language_next_state"] = (a0, a1, a2) => (_ts_language_next_state = Module["_ts_language_next_state"] = wasmExports["ts_language_next_state"])(a0, a1, a2);
            var _ts_language_symbol_name = Module["_ts_language_symbol_name"] = (a0, a1) => (_ts_language_symbol_name = Module["_ts_language_symbol_name"] = wasmExports["ts_language_symbol_name"])(a0, a1);
            var _ts_language_symbol_for_name = Module["_ts_language_symbol_for_name"] = (a0, a1, a2, a3) => (_ts_language_symbol_for_name = Module["_ts_language_symbol_for_name"] = wasmExports["ts_language_symbol_for_name"])(a0, a1, a2, a3);
            var _strncmp = Module["_strncmp"] = (a0, a1, a2) => (_strncmp = Module["_strncmp"] = wasmExports["strncmp"])(a0, a1, a2);
            var _ts_language_symbol_type = Module["_ts_language_symbol_type"] = (a0, a1) => (_ts_language_symbol_type = Module["_ts_language_symbol_type"] = wasmExports["ts_language_symbol_type"])(a0, a1);
            var _ts_language_field_name_for_id = Module["_ts_language_field_name_for_id"] = (a0, a1) => (_ts_language_field_name_for_id = Module["_ts_language_field_name_for_id"] = wasmExports["ts_language_field_name_for_id"])(a0, a1);
            var _ts_lookahead_iterator_new = Module["_ts_lookahead_iterator_new"] = (a0, a1) => (_ts_lookahead_iterator_new = Module["_ts_lookahead_iterator_new"] = wasmExports["ts_lookahead_iterator_new"])(a0, a1);
            var _ts_lookahead_iterator_delete = Module["_ts_lookahead_iterator_delete"] = (a0) => (_ts_lookahead_iterator_delete = Module["_ts_lookahead_iterator_delete"] = wasmExports["ts_lookahead_iterator_delete"])(a0);
            var _ts_lookahead_iterator_reset_state = Module["_ts_lookahead_iterator_reset_state"] = (a0, a1) => (_ts_lookahead_iterator_reset_state = Module["_ts_lookahead_iterator_reset_state"] = wasmExports["ts_lookahead_iterator_reset_state"])(a0, a1);
            var _ts_lookahead_iterator_reset = Module["_ts_lookahead_iterator_reset"] = (a0, a1, a2) => (_ts_lookahead_iterator_reset = Module["_ts_lookahead_iterator_reset"] = wasmExports["ts_lookahead_iterator_reset"])(a0, a1, a2);
            var _ts_lookahead_iterator_next = Module["_ts_lookahead_iterator_next"] = (a0) => (_ts_lookahead_iterator_next = Module["_ts_lookahead_iterator_next"] = wasmExports["ts_lookahead_iterator_next"])(a0);
            var _ts_lookahead_iterator_current_symbol = Module["_ts_lookahead_iterator_current_symbol"] = (a0) => (_ts_lookahead_iterator_current_symbol = Module["_ts_lookahead_iterator_current_symbol"] = wasmExports["ts_lookahead_iterator_current_symbol"])(a0);
            var _memset = Module["_memset"] = (a0, a1, a2) => (_memset = Module["_memset"] = wasmExports["memset"])(a0, a1, a2);
            var _memcpy = Module["_memcpy"] = (a0, a1, a2) => (_memcpy = Module["_memcpy"] = wasmExports["memcpy"])(a0, a1, a2);
            var _ts_parser_delete = Module["_ts_parser_delete"] = (a0) => (_ts_parser_delete = Module["_ts_parser_delete"] = wasmExports["ts_parser_delete"])(a0);
            var _ts_parser_reset = Module["_ts_parser_reset"] = (a0) => (_ts_parser_reset = Module["_ts_parser_reset"] = wasmExports["ts_parser_reset"])(a0);
            var _ts_parser_set_language = Module["_ts_parser_set_language"] = (a0, a1) => (_ts_parser_set_language = Module["_ts_parser_set_language"] = wasmExports["ts_parser_set_language"])(a0, a1);
            var _ts_parser_timeout_micros = Module["_ts_parser_timeout_micros"] = (a0) => (_ts_parser_timeout_micros = Module["_ts_parser_timeout_micros"] = wasmExports["ts_parser_timeout_micros"])(a0);
            var _ts_parser_set_timeout_micros = Module["_ts_parser_set_timeout_micros"] = (a0, a1, a2) => (_ts_parser_set_timeout_micros = Module["_ts_parser_set_timeout_micros"] = wasmExports["ts_parser_set_timeout_micros"])(a0, a1, a2);
            var _ts_parser_set_included_ranges = Module["_ts_parser_set_included_ranges"] = (a0, a1, a2) => (_ts_parser_set_included_ranges = Module["_ts_parser_set_included_ranges"] = wasmExports["ts_parser_set_included_ranges"])(a0, a1, a2);
            var _memmove = Module["_memmove"] = (a0, a1, a2) => (_memmove = Module["_memmove"] = wasmExports["memmove"])(a0, a1, a2);
            var _memcmp = Module["_memcmp"] = (a0, a1, a2) => (_memcmp = Module["_memcmp"] = wasmExports["memcmp"])(a0, a1, a2);
            var _ts_query_new = Module["_ts_query_new"] = (a0, a1, a2, a3, a4) => (_ts_query_new = Module["_ts_query_new"] = wasmExports["ts_query_new"])(a0, a1, a2, a3, a4);
            var _ts_query_delete = Module["_ts_query_delete"] = (a0) => (_ts_query_delete = Module["_ts_query_delete"] = wasmExports["ts_query_delete"])(a0);
            var _iswspace = Module["_iswspace"] = (a0) => (_iswspace = Module["_iswspace"] = wasmExports["iswspace"])(a0);
            var _iswalnum = Module["_iswalnum"] = (a0) => (_iswalnum = Module["_iswalnum"] = wasmExports["iswalnum"])(a0);
            var _ts_query_pattern_count = Module["_ts_query_pattern_count"] = (a0) => (_ts_query_pattern_count = Module["_ts_query_pattern_count"] = wasmExports["ts_query_pattern_count"])(a0);
            var _ts_query_capture_count = Module["_ts_query_capture_count"] = (a0) => (_ts_query_capture_count = Module["_ts_query_capture_count"] = wasmExports["ts_query_capture_count"])(a0);
            var _ts_query_string_count = Module["_ts_query_string_count"] = (a0) => (_ts_query_string_count = Module["_ts_query_string_count"] = wasmExports["ts_query_string_count"])(a0);
            var _ts_query_capture_name_for_id = Module["_ts_query_capture_name_for_id"] = (a0, a1, a2) => (_ts_query_capture_name_for_id = Module["_ts_query_capture_name_for_id"] = wasmExports["ts_query_capture_name_for_id"])(a0, a1, a2);
            var _ts_query_string_value_for_id = Module["_ts_query_string_value_for_id"] = (a0, a1, a2) => (_ts_query_string_value_for_id = Module["_ts_query_string_value_for_id"] = wasmExports["ts_query_string_value_for_id"])(a0, a1, a2);
            var _ts_query_predicates_for_pattern = Module["_ts_query_predicates_for_pattern"] = (a0, a1, a2) => (_ts_query_predicates_for_pattern = Module["_ts_query_predicates_for_pattern"] = wasmExports["ts_query_predicates_for_pattern"])(a0, a1, a2);
            var _ts_query_disable_capture = Module["_ts_query_disable_capture"] = (a0, a1, a2) => (_ts_query_disable_capture = Module["_ts_query_disable_capture"] = wasmExports["ts_query_disable_capture"])(a0, a1, a2);
            var _ts_tree_copy = Module["_ts_tree_copy"] = (a0) => (_ts_tree_copy = Module["_ts_tree_copy"] = wasmExports["ts_tree_copy"])(a0);
            var _ts_tree_delete = Module["_ts_tree_delete"] = (a0) => (_ts_tree_delete = Module["_ts_tree_delete"] = wasmExports["ts_tree_delete"])(a0);
            var _ts_init = Module["_ts_init"] = () => (_ts_init = Module["_ts_init"] = wasmExports["ts_init"])();
            var _ts_parser_new_wasm = Module["_ts_parser_new_wasm"] = () => (_ts_parser_new_wasm = Module["_ts_parser_new_wasm"] = wasmExports["ts_parser_new_wasm"])();
            var _ts_parser_enable_logger_wasm = Module["_ts_parser_enable_logger_wasm"] = (a0, a1) => (_ts_parser_enable_logger_wasm = Module["_ts_parser_enable_logger_wasm"] = wasmExports["ts_parser_enable_logger_wasm"])(a0, a1);
            var _ts_parser_parse_wasm = Module["_ts_parser_parse_wasm"] = (a0, a1, a2, a3, a4) => (_ts_parser_parse_wasm = Module["_ts_parser_parse_wasm"] = wasmExports["ts_parser_parse_wasm"])(a0, a1, a2, a3, a4);
            var _ts_parser_included_ranges_wasm = Module["_ts_parser_included_ranges_wasm"] = (a0) => (_ts_parser_included_ranges_wasm = Module["_ts_parser_included_ranges_wasm"] = wasmExports["ts_parser_included_ranges_wasm"])(a0);
            var _ts_language_type_is_named_wasm = Module["_ts_language_type_is_named_wasm"] = (a0, a1) => (_ts_language_type_is_named_wasm = Module["_ts_language_type_is_named_wasm"] = wasmExports["ts_language_type_is_named_wasm"])(a0, a1);
            var _ts_language_type_is_visible_wasm = Module["_ts_language_type_is_visible_wasm"] = (a0, a1) => (_ts_language_type_is_visible_wasm = Module["_ts_language_type_is_visible_wasm"] = wasmExports["ts_language_type_is_visible_wasm"])(a0, a1);
            var _ts_tree_root_node_wasm = Module["_ts_tree_root_node_wasm"] = (a0) => (_ts_tree_root_node_wasm = Module["_ts_tree_root_node_wasm"] = wasmExports["ts_tree_root_node_wasm"])(a0);
            var _ts_tree_root_node_with_offset_wasm = Module["_ts_tree_root_node_with_offset_wasm"] = (a0) => (_ts_tree_root_node_with_offset_wasm = Module["_ts_tree_root_node_with_offset_wasm"] = wasmExports["ts_tree_root_node_with_offset_wasm"])(a0);
            var _ts_tree_edit_wasm = Module["_ts_tree_edit_wasm"] = (a0) => (_ts_tree_edit_wasm = Module["_ts_tree_edit_wasm"] = wasmExports["ts_tree_edit_wasm"])(a0);
            var _ts_tree_included_ranges_wasm = Module["_ts_tree_included_ranges_wasm"] = (a0) => (_ts_tree_included_ranges_wasm = Module["_ts_tree_included_ranges_wasm"] = wasmExports["ts_tree_included_ranges_wasm"])(a0);
            var _ts_tree_get_changed_ranges_wasm = Module["_ts_tree_get_changed_ranges_wasm"] = (a0, a1) => (_ts_tree_get_changed_ranges_wasm = Module["_ts_tree_get_changed_ranges_wasm"] = wasmExports["ts_tree_get_changed_ranges_wasm"])(a0, a1);
            var _ts_tree_cursor_new_wasm = Module["_ts_tree_cursor_new_wasm"] = (a0) => (_ts_tree_cursor_new_wasm = Module["_ts_tree_cursor_new_wasm"] = wasmExports["ts_tree_cursor_new_wasm"])(a0);
            var _ts_tree_cursor_delete_wasm = Module["_ts_tree_cursor_delete_wasm"] = (a0) => (_ts_tree_cursor_delete_wasm = Module["_ts_tree_cursor_delete_wasm"] = wasmExports["ts_tree_cursor_delete_wasm"])(a0);
            var _ts_tree_cursor_reset_wasm = Module["_ts_tree_cursor_reset_wasm"] = (a0) => (_ts_tree_cursor_reset_wasm = Module["_ts_tree_cursor_reset_wasm"] = wasmExports["ts_tree_cursor_reset_wasm"])(a0);
            var _ts_tree_cursor_reset_to_wasm = Module["_ts_tree_cursor_reset_to_wasm"] = (a0, a1) => (_ts_tree_cursor_reset_to_wasm = Module["_ts_tree_cursor_reset_to_wasm"] = wasmExports["ts_tree_cursor_reset_to_wasm"])(a0, a1);
            var _ts_tree_cursor_goto_first_child_wasm = Module["_ts_tree_cursor_goto_first_child_wasm"] = (a0) => (_ts_tree_cursor_goto_first_child_wasm = Module["_ts_tree_cursor_goto_first_child_wasm"] = wasmExports["ts_tree_cursor_goto_first_child_wasm"])(a0);
            var _ts_tree_cursor_goto_last_child_wasm = Module["_ts_tree_cursor_goto_last_child_wasm"] = (a0) => (_ts_tree_cursor_goto_last_child_wasm = Module["_ts_tree_cursor_goto_last_child_wasm"] = wasmExports["ts_tree_cursor_goto_last_child_wasm"])(a0);
            var _ts_tree_cursor_goto_first_child_for_index_wasm = Module["_ts_tree_cursor_goto_first_child_for_index_wasm"] = (a0) => (_ts_tree_cursor_goto_first_child_for_index_wasm = Module["_ts_tree_cursor_goto_first_child_for_index_wasm"] = wasmExports["ts_tree_cursor_goto_first_child_for_index_wasm"])(a0);
            var _ts_tree_cursor_goto_first_child_for_position_wasm = Module["_ts_tree_cursor_goto_first_child_for_position_wasm"] = (a0) => (_ts_tree_cursor_goto_first_child_for_position_wasm = Module["_ts_tree_cursor_goto_first_child_for_position_wasm"] = wasmExports["ts_tree_cursor_goto_first_child_for_position_wasm"])(a0);
            var _ts_tree_cursor_goto_next_sibling_wasm = Module["_ts_tree_cursor_goto_next_sibling_wasm"] = (a0) => (_ts_tree_cursor_goto_next_sibling_wasm = Module["_ts_tree_cursor_goto_next_sibling_wasm"] = wasmExports["ts_tree_cursor_goto_next_sibling_wasm"])(a0);
            var _ts_tree_cursor_goto_previous_sibling_wasm = Module["_ts_tree_cursor_goto_previous_sibling_wasm"] = (a0) => (_ts_tree_cursor_goto_previous_sibling_wasm = Module["_ts_tree_cursor_goto_previous_sibling_wasm"] = wasmExports["ts_tree_cursor_goto_previous_sibling_wasm"])(a0);
            var _ts_tree_cursor_goto_descendant_wasm = Module["_ts_tree_cursor_goto_descendant_wasm"] = (a0, a1) => (_ts_tree_cursor_goto_descendant_wasm = Module["_ts_tree_cursor_goto_descendant_wasm"] = wasmExports["ts_tree_cursor_goto_descendant_wasm"])(a0, a1);
            var _ts_tree_cursor_goto_parent_wasm = Module["_ts_tree_cursor_goto_parent_wasm"] = (a0) => (_ts_tree_cursor_goto_parent_wasm = Module["_ts_tree_cursor_goto_parent_wasm"] = wasmExports["ts_tree_cursor_goto_parent_wasm"])(a0);
            var _ts_tree_cursor_current_node_type_id_wasm = Module["_ts_tree_cursor_current_node_type_id_wasm"] = (a0) => (_ts_tree_cursor_current_node_type_id_wasm = Module["_ts_tree_cursor_current_node_type_id_wasm"] = wasmExports["ts_tree_cursor_current_node_type_id_wasm"])(a0);
            var _ts_tree_cursor_current_node_state_id_wasm = Module["_ts_tree_cursor_current_node_state_id_wasm"] = (a0) => (_ts_tree_cursor_current_node_state_id_wasm = Module["_ts_tree_cursor_current_node_state_id_wasm"] = wasmExports["ts_tree_cursor_current_node_state_id_wasm"])(a0);
            var _ts_tree_cursor_current_node_is_named_wasm = Module["_ts_tree_cursor_current_node_is_named_wasm"] = (a0) => (_ts_tree_cursor_current_node_is_named_wasm = Module["_ts_tree_cursor_current_node_is_named_wasm"] = wasmExports["ts_tree_cursor_current_node_is_named_wasm"])(a0);
            var _ts_tree_cursor_current_node_is_missing_wasm = Module["_ts_tree_cursor_current_node_is_missing_wasm"] = (a0) => (_ts_tree_cursor_current_node_is_missing_wasm = Module["_ts_tree_cursor_current_node_is_missing_wasm"] = wasmExports["ts_tree_cursor_current_node_is_missing_wasm"])(a0);
            var _ts_tree_cursor_current_node_id_wasm = Module["_ts_tree_cursor_current_node_id_wasm"] = (a0) => (_ts_tree_cursor_current_node_id_wasm = Module["_ts_tree_cursor_current_node_id_wasm"] = wasmExports["ts_tree_cursor_current_node_id_wasm"])(a0);
            var _ts_tree_cursor_start_position_wasm = Module["_ts_tree_cursor_start_position_wasm"] = (a0) => (_ts_tree_cursor_start_position_wasm = Module["_ts_tree_cursor_start_position_wasm"] = wasmExports["ts_tree_cursor_start_position_wasm"])(a0);
            var _ts_tree_cursor_end_position_wasm = Module["_ts_tree_cursor_end_position_wasm"] = (a0) => (_ts_tree_cursor_end_position_wasm = Module["_ts_tree_cursor_end_position_wasm"] = wasmExports["ts_tree_cursor_end_position_wasm"])(a0);
            var _ts_tree_cursor_start_index_wasm = Module["_ts_tree_cursor_start_index_wasm"] = (a0) => (_ts_tree_cursor_start_index_wasm = Module["_ts_tree_cursor_start_index_wasm"] = wasmExports["ts_tree_cursor_start_index_wasm"])(a0);
            var _ts_tree_cursor_end_index_wasm = Module["_ts_tree_cursor_end_index_wasm"] = (a0) => (_ts_tree_cursor_end_index_wasm = Module["_ts_tree_cursor_end_index_wasm"] = wasmExports["ts_tree_cursor_end_index_wasm"])(a0);
            var _ts_tree_cursor_current_field_id_wasm = Module["_ts_tree_cursor_current_field_id_wasm"] = (a0) => (_ts_tree_cursor_current_field_id_wasm = Module["_ts_tree_cursor_current_field_id_wasm"] = wasmExports["ts_tree_cursor_current_field_id_wasm"])(a0);
            var _ts_tree_cursor_current_depth_wasm = Module["_ts_tree_cursor_current_depth_wasm"] = (a0) => (_ts_tree_cursor_current_depth_wasm = Module["_ts_tree_cursor_current_depth_wasm"] = wasmExports["ts_tree_cursor_current_depth_wasm"])(a0);
            var _ts_tree_cursor_current_descendant_index_wasm = Module["_ts_tree_cursor_current_descendant_index_wasm"] = (a0) => (_ts_tree_cursor_current_descendant_index_wasm = Module["_ts_tree_cursor_current_descendant_index_wasm"] = wasmExports["ts_tree_cursor_current_descendant_index_wasm"])(a0);
            var _ts_tree_cursor_current_node_wasm = Module["_ts_tree_cursor_current_node_wasm"] = (a0) => (_ts_tree_cursor_current_node_wasm = Module["_ts_tree_cursor_current_node_wasm"] = wasmExports["ts_tree_cursor_current_node_wasm"])(a0);
            var _ts_node_symbol_wasm = Module["_ts_node_symbol_wasm"] = (a0) => (_ts_node_symbol_wasm = Module["_ts_node_symbol_wasm"] = wasmExports["ts_node_symbol_wasm"])(a0);
            var _ts_node_field_name_for_child_wasm = Module["_ts_node_field_name_for_child_wasm"] = (a0, a1) => (_ts_node_field_name_for_child_wasm = Module["_ts_node_field_name_for_child_wasm"] = wasmExports["ts_node_field_name_for_child_wasm"])(a0, a1);
            var _ts_node_children_by_field_id_wasm = Module["_ts_node_children_by_field_id_wasm"] = (a0, a1) => (_ts_node_children_by_field_id_wasm = Module["_ts_node_children_by_field_id_wasm"] = wasmExports["ts_node_children_by_field_id_wasm"])(a0, a1);
            var _ts_node_first_child_for_byte_wasm = Module["_ts_node_first_child_for_byte_wasm"] = (a0) => (_ts_node_first_child_for_byte_wasm = Module["_ts_node_first_child_for_byte_wasm"] = wasmExports["ts_node_first_child_for_byte_wasm"])(a0);
            var _ts_node_first_named_child_for_byte_wasm = Module["_ts_node_first_named_child_for_byte_wasm"] = (a0) => (_ts_node_first_named_child_for_byte_wasm = Module["_ts_node_first_named_child_for_byte_wasm"] = wasmExports["ts_node_first_named_child_for_byte_wasm"])(a0);
            var _ts_node_grammar_symbol_wasm = Module["_ts_node_grammar_symbol_wasm"] = (a0) => (_ts_node_grammar_symbol_wasm = Module["_ts_node_grammar_symbol_wasm"] = wasmExports["ts_node_grammar_symbol_wasm"])(a0);
            var _ts_node_child_count_wasm = Module["_ts_node_child_count_wasm"] = (a0) => (_ts_node_child_count_wasm = Module["_ts_node_child_count_wasm"] = wasmExports["ts_node_child_count_wasm"])(a0);
            var _ts_node_named_child_count_wasm = Module["_ts_node_named_child_count_wasm"] = (a0) => (_ts_node_named_child_count_wasm = Module["_ts_node_named_child_count_wasm"] = wasmExports["ts_node_named_child_count_wasm"])(a0);
            var _ts_node_child_wasm = Module["_ts_node_child_wasm"] = (a0, a1) => (_ts_node_child_wasm = Module["_ts_node_child_wasm"] = wasmExports["ts_node_child_wasm"])(a0, a1);
            var _ts_node_named_child_wasm = Module["_ts_node_named_child_wasm"] = (a0, a1) => (_ts_node_named_child_wasm = Module["_ts_node_named_child_wasm"] = wasmExports["ts_node_named_child_wasm"])(a0, a1);
            var _ts_node_child_by_field_id_wasm = Module["_ts_node_child_by_field_id_wasm"] = (a0, a1) => (_ts_node_child_by_field_id_wasm = Module["_ts_node_child_by_field_id_wasm"] = wasmExports["ts_node_child_by_field_id_wasm"])(a0, a1);
            var _ts_node_next_sibling_wasm = Module["_ts_node_next_sibling_wasm"] = (a0) => (_ts_node_next_sibling_wasm = Module["_ts_node_next_sibling_wasm"] = wasmExports["ts_node_next_sibling_wasm"])(a0);
            var _ts_node_prev_sibling_wasm = Module["_ts_node_prev_sibling_wasm"] = (a0) => (_ts_node_prev_sibling_wasm = Module["_ts_node_prev_sibling_wasm"] = wasmExports["ts_node_prev_sibling_wasm"])(a0);
            var _ts_node_next_named_sibling_wasm = Module["_ts_node_next_named_sibling_wasm"] = (a0) => (_ts_node_next_named_sibling_wasm = Module["_ts_node_next_named_sibling_wasm"] = wasmExports["ts_node_next_named_sibling_wasm"])(a0);
            var _ts_node_prev_named_sibling_wasm = Module["_ts_node_prev_named_sibling_wasm"] = (a0) => (_ts_node_prev_named_sibling_wasm = Module["_ts_node_prev_named_sibling_wasm"] = wasmExports["ts_node_prev_named_sibling_wasm"])(a0);
            var _ts_node_descendant_count_wasm = Module["_ts_node_descendant_count_wasm"] = (a0) => (_ts_node_descendant_count_wasm = Module["_ts_node_descendant_count_wasm"] = wasmExports["ts_node_descendant_count_wasm"])(a0);
            var _ts_node_parent_wasm = Module["_ts_node_parent_wasm"] = (a0) => (_ts_node_parent_wasm = Module["_ts_node_parent_wasm"] = wasmExports["ts_node_parent_wasm"])(a0);
            var _ts_node_descendant_for_index_wasm = Module["_ts_node_descendant_for_index_wasm"] = (a0) => (_ts_node_descendant_for_index_wasm = Module["_ts_node_descendant_for_index_wasm"] = wasmExports["ts_node_descendant_for_index_wasm"])(a0);
            var _ts_node_named_descendant_for_index_wasm = Module["_ts_node_named_descendant_for_index_wasm"] = (a0) => (_ts_node_named_descendant_for_index_wasm = Module["_ts_node_named_descendant_for_index_wasm"] = wasmExports["ts_node_named_descendant_for_index_wasm"])(a0);
            var _ts_node_descendant_for_position_wasm = Module["_ts_node_descendant_for_position_wasm"] = (a0) => (_ts_node_descendant_for_position_wasm = Module["_ts_node_descendant_for_position_wasm"] = wasmExports["ts_node_descendant_for_position_wasm"])(a0);
            var _ts_node_named_descendant_for_position_wasm = Module["_ts_node_named_descendant_for_position_wasm"] = (a0) => (_ts_node_named_descendant_for_position_wasm = Module["_ts_node_named_descendant_for_position_wasm"] = wasmExports["ts_node_named_descendant_for_position_wasm"])(a0);
            var _ts_node_start_point_wasm = Module["_ts_node_start_point_wasm"] = (a0) => (_ts_node_start_point_wasm = Module["_ts_node_start_point_wasm"] = wasmExports["ts_node_start_point_wasm"])(a0);
            var _ts_node_end_point_wasm = Module["_ts_node_end_point_wasm"] = (a0) => (_ts_node_end_point_wasm = Module["_ts_node_end_point_wasm"] = wasmExports["ts_node_end_point_wasm"])(a0);
            var _ts_node_start_index_wasm = Module["_ts_node_start_index_wasm"] = (a0) => (_ts_node_start_index_wasm = Module["_ts_node_start_index_wasm"] = wasmExports["ts_node_start_index_wasm"])(a0);
            var _ts_node_end_index_wasm = Module["_ts_node_end_index_wasm"] = (a0) => (_ts_node_end_index_wasm = Module["_ts_node_end_index_wasm"] = wasmExports["ts_node_end_index_wasm"])(a0);
            var _ts_node_to_string_wasm = Module["_ts_node_to_string_wasm"] = (a0) => (_ts_node_to_string_wasm = Module["_ts_node_to_string_wasm"] = wasmExports["ts_node_to_string_wasm"])(a0);
            var _ts_node_children_wasm = Module["_ts_node_children_wasm"] = (a0) => (_ts_node_children_wasm = Module["_ts_node_children_wasm"] = wasmExports["ts_node_children_wasm"])(a0);
            var _ts_node_named_children_wasm = Module["_ts_node_named_children_wasm"] = (a0) => (_ts_node_named_children_wasm = Module["_ts_node_named_children_wasm"] = wasmExports["ts_node_named_children_wasm"])(a0);
            var _ts_node_descendants_of_type_wasm = Module["_ts_node_descendants_of_type_wasm"] = (a0, a1, a2, a3, a4, a5, a6) => (_ts_node_descendants_of_type_wasm = Module["_ts_node_descendants_of_type_wasm"] = wasmExports["ts_node_descendants_of_type_wasm"])(a0, a1, a2, a3, a4, a5, a6);
            var _ts_node_is_named_wasm = Module["_ts_node_is_named_wasm"] = (a0) => (_ts_node_is_named_wasm = Module["_ts_node_is_named_wasm"] = wasmExports["ts_node_is_named_wasm"])(a0);
            var _ts_node_has_changes_wasm = Module["_ts_node_has_changes_wasm"] = (a0) => (_ts_node_has_changes_wasm = Module["_ts_node_has_changes_wasm"] = wasmExports["ts_node_has_changes_wasm"])(a0);
            var _ts_node_has_error_wasm = Module["_ts_node_has_error_wasm"] = (a0) => (_ts_node_has_error_wasm = Module["_ts_node_has_error_wasm"] = wasmExports["ts_node_has_error_wasm"])(a0);
            var _ts_node_is_error_wasm = Module["_ts_node_is_error_wasm"] = (a0) => (_ts_node_is_error_wasm = Module["_ts_node_is_error_wasm"] = wasmExports["ts_node_is_error_wasm"])(a0);
            var _ts_node_is_missing_wasm = Module["_ts_node_is_missing_wasm"] = (a0) => (_ts_node_is_missing_wasm = Module["_ts_node_is_missing_wasm"] = wasmExports["ts_node_is_missing_wasm"])(a0);
            var _ts_node_is_extra_wasm = Module["_ts_node_is_extra_wasm"] = (a0) => (_ts_node_is_extra_wasm = Module["_ts_node_is_extra_wasm"] = wasmExports["ts_node_is_extra_wasm"])(a0);
            var _ts_node_parse_state_wasm = Module["_ts_node_parse_state_wasm"] = (a0) => (_ts_node_parse_state_wasm = Module["_ts_node_parse_state_wasm"] = wasmExports["ts_node_parse_state_wasm"])(a0);
            var _ts_node_next_parse_state_wasm = Module["_ts_node_next_parse_state_wasm"] = (a0) => (_ts_node_next_parse_state_wasm = Module["_ts_node_next_parse_state_wasm"] = wasmExports["ts_node_next_parse_state_wasm"])(a0);
            var _ts_query_matches_wasm = Module["_ts_query_matches_wasm"] = (a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) => (_ts_query_matches_wasm = Module["_ts_query_matches_wasm"] = wasmExports["ts_query_matches_wasm"])(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10);
            var _ts_query_captures_wasm = Module["_ts_query_captures_wasm"] = (a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) => (_ts_query_captures_wasm = Module["_ts_query_captures_wasm"] = wasmExports["ts_query_captures_wasm"])(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10);
            var _iswalpha = Module["_iswalpha"] = (a0) => (_iswalpha = Module["_iswalpha"] = wasmExports["iswalpha"])(a0);
            var _iswblank = Module["_iswblank"] = (a0) => (_iswblank = Module["_iswblank"] = wasmExports["iswblank"])(a0);
            var _iswdigit = Module["_iswdigit"] = (a0) => (_iswdigit = Module["_iswdigit"] = wasmExports["iswdigit"])(a0);
            var _iswlower = Module["_iswlower"] = (a0) => (_iswlower = Module["_iswlower"] = wasmExports["iswlower"])(a0);
            var _iswupper = Module["_iswupper"] = (a0) => (_iswupper = Module["_iswupper"] = wasmExports["iswupper"])(a0);
            var _iswxdigit = Module["_iswxdigit"] = (a0) => (_iswxdigit = Module["_iswxdigit"] = wasmExports["iswxdigit"])(a0);
            var _memchr = Module["_memchr"] = (a0, a1, a2) => (_memchr = Module["_memchr"] = wasmExports["memchr"])(a0, a1, a2);
            var _strlen = Module["_strlen"] = (a0) => (_strlen = Module["_strlen"] = wasmExports["strlen"])(a0);
            var _strcmp = Module["_strcmp"] = (a0, a1) => (_strcmp = Module["_strcmp"] = wasmExports["strcmp"])(a0, a1);
            var _strncat = Module["_strncat"] = (a0, a1, a2) => (_strncat = Module["_strncat"] = wasmExports["strncat"])(a0, a1, a2);
            var _strncpy = Module["_strncpy"] = (a0, a1, a2) => (_strncpy = Module["_strncpy"] = wasmExports["strncpy"])(a0, a1, a2);
            var _towlower = Module["_towlower"] = (a0) => (_towlower = Module["_towlower"] = wasmExports["towlower"])(a0);
            var _towupper = Module["_towupper"] = (a0) => (_towupper = Module["_towupper"] = wasmExports["towupper"])(a0);
            var _setThrew = (a0, a1) => (_setThrew = wasmExports["setThrew"])(a0, a1);
            var __emscripten_stack_restore = (a0) => (__emscripten_stack_restore = wasmExports["_emscripten_stack_restore"])(a0);
            var __emscripten_stack_alloc = (a0) => (__emscripten_stack_alloc = wasmExports["_emscripten_stack_alloc"])(a0);
            var _emscripten_stack_get_current = () => (_emscripten_stack_get_current = wasmExports["emscripten_stack_get_current"])();
            var dynCall_jiji = Module["dynCall_jiji"] = (a0, a1, a2, a3, a4) => (dynCall_jiji = Module["dynCall_jiji"] = wasmExports["dynCall_jiji"])(a0, a1, a2, a3, a4);
            var _orig$ts_parser_timeout_micros = Module["_orig$ts_parser_timeout_micros"] = (a0) => (_orig$ts_parser_timeout_micros = Module["_orig$ts_parser_timeout_micros"] = wasmExports["orig$ts_parser_timeout_micros"])(a0);
            var _orig$ts_parser_set_timeout_micros = Module["_orig$ts_parser_set_timeout_micros"] = (a0, a1) => (_orig$ts_parser_set_timeout_micros = Module["_orig$ts_parser_set_timeout_micros"] = wasmExports["orig$ts_parser_set_timeout_micros"])(a0, a1);
            Module["AsciiToString"] = AsciiToString;
            Module["stringToUTF16"] = stringToUTF16;
            var calledRun;
            dependenciesFulfilled = function runCaller() {
              if (!calledRun) run();
              if (!calledRun) dependenciesFulfilled = runCaller;
            };
            function callMain(args2 = []) {
              var entryFunction = resolveGlobalSymbol("main").sym;
              if (!entryFunction) return;
              args2.unshift(thisProgram);
              var argc = args2.length;
              var argv = stackAlloc((argc + 1) * 4);
              var argv_ptr = argv;
              args2.forEach((arg) => {
                LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, stringToUTF8OnStack(arg));
                argv_ptr += 4;
              });
              LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, 0);
              try {
                var ret = entryFunction(argc, argv);
                exitJS(
                  ret,
                  /* implicit = */
                  true
                );
                return ret;
              } catch (e) {
                return handleException(e);
              }
            }
            function run(args2 = arguments_) {
              if (runDependencies > 0) {
                return;
              }
              preRun();
              if (runDependencies > 0) {
                return;
              }
              function doRun() {
                if (calledRun) return;
                calledRun = true;
                Module["calledRun"] = true;
                if (ABORT) return;
                initRuntime();
                preMain();
                Module["onRuntimeInitialized"]?.();
                if (shouldRunNow) callMain(args2);
                postRun();
              }
              if (Module["setStatus"]) {
                Module["setStatus"]("Running...");
                setTimeout(function() {
                  setTimeout(function() {
                    Module["setStatus"]("");
                  }, 1);
                  doRun();
                }, 1);
              } else {
                doRun();
              }
            }
            if (Module["preInit"]) {
              if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
              while (Module["preInit"].length > 0) {
                Module["preInit"].pop()();
              }
            }
            var shouldRunNow = true;
            if (Module["noInitialRun"]) shouldRunNow = false;
            run();
            const C = Module;
            const INTERNAL = {};
            const SIZE_OF_INT = 4;
            const SIZE_OF_CURSOR = 4 * SIZE_OF_INT;
            const SIZE_OF_NODE = 5 * SIZE_OF_INT;
            const SIZE_OF_POINT = 2 * SIZE_OF_INT;
            const SIZE_OF_RANGE = 2 * SIZE_OF_INT + 2 * SIZE_OF_POINT;
            const ZERO_POINT = {
              row: 0,
              column: 0
            };
            const QUERY_WORD_REGEX = /[\w-.]*/g;
            const PREDICATE_STEP_TYPE_CAPTURE = 1;
            const PREDICATE_STEP_TYPE_STRING = 2;
            const LANGUAGE_FUNCTION_REGEX = /^_?tree_sitter_\w+/;
            let VERSION;
            let MIN_COMPATIBLE_VERSION;
            let TRANSFER_BUFFER;
            let currentParseCallback;
            let currentLogCallback;
            class ParserImpl {
              static init() {
                TRANSFER_BUFFER = C._ts_init();
                VERSION = getValue(TRANSFER_BUFFER, "i32");
                MIN_COMPATIBLE_VERSION = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
              }
              initialize() {
                C._ts_parser_new_wasm();
                this[0] = getValue(TRANSFER_BUFFER, "i32");
                this[1] = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
              }
              delete() {
                C._ts_parser_delete(this[0]);
                C._free(this[1]);
                this[0] = 0;
                this[1] = 0;
              }
              setLanguage(language) {
                let address;
                if (!language) {
                  address = 0;
                  language = null;
                } else if (language.constructor === Language) {
                  address = language[0];
                  const version = C._ts_language_version(address);
                  if (version < MIN_COMPATIBLE_VERSION || VERSION < version) {
                    throw new Error(`Incompatible language version ${version}. Compatibility range ${MIN_COMPATIBLE_VERSION} through ${VERSION}.`);
                  }
                } else {
                  throw new Error("Argument must be a Language");
                }
                this.language = language;
                C._ts_parser_set_language(this[0], address);
                return this;
              }
              getLanguage() {
                return this.language;
              }
              parse(callback, oldTree, options) {
                if (typeof callback === "string") {
                  currentParseCallback = (index, _) => callback.slice(index);
                } else if (typeof callback === "function") {
                  currentParseCallback = callback;
                } else {
                  throw new Error("Argument must be a string or a function");
                }
                if (this.logCallback) {
                  currentLogCallback = this.logCallback;
                  C._ts_parser_enable_logger_wasm(this[0], 1);
                } else {
                  currentLogCallback = null;
                  C._ts_parser_enable_logger_wasm(this[0], 0);
                }
                let rangeCount = 0;
                let rangeAddress = 0;
                if (options?.includedRanges) {
                  rangeCount = options.includedRanges.length;
                  rangeAddress = C._calloc(rangeCount, SIZE_OF_RANGE);
                  let address = rangeAddress;
                  for (let i2 = 0; i2 < rangeCount; i2++) {
                    marshalRange(address, options.includedRanges[i2]);
                    address += SIZE_OF_RANGE;
                  }
                }
                const treeAddress = C._ts_parser_parse_wasm(this[0], this[1], oldTree ? oldTree[0] : 0, rangeAddress, rangeCount);
                if (!treeAddress) {
                  currentParseCallback = null;
                  currentLogCallback = null;
                  throw new Error("Parsing failed");
                }
                const result = new Tree(INTERNAL, treeAddress, this.language, currentParseCallback);
                currentParseCallback = null;
                currentLogCallback = null;
                return result;
              }
              reset() {
                C._ts_parser_reset(this[0]);
              }
              getIncludedRanges() {
                C._ts_parser_included_ranges_wasm(this[0]);
                const count = getValue(TRANSFER_BUFFER, "i32");
                const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const result = new Array(count);
                if (count > 0) {
                  let address = buffer;
                  for (let i2 = 0; i2 < count; i2++) {
                    result[i2] = unmarshalRange(address);
                    address += SIZE_OF_RANGE;
                  }
                  C._free(buffer);
                }
                return result;
              }
              getTimeoutMicros() {
                return C._ts_parser_timeout_micros(this[0]);
              }
              setTimeoutMicros(timeout) {
                C._ts_parser_set_timeout_micros(this[0], timeout);
              }
              setLogger(callback) {
                if (!callback) {
                  callback = null;
                } else if (typeof callback !== "function") {
                  throw new Error("Logger callback must be a function");
                }
                this.logCallback = callback;
                return this;
              }
              getLogger() {
                return this.logCallback;
              }
            }
            class Tree {
              constructor(internal, address, language, textCallback) {
                assertInternal(internal);
                this[0] = address;
                this.language = language;
                this.textCallback = textCallback;
              }
              copy() {
                const address = C._ts_tree_copy(this[0]);
                return new Tree(INTERNAL, address, this.language, this.textCallback);
              }
              delete() {
                C._ts_tree_delete(this[0]);
                this[0] = 0;
              }
              edit(edit) {
                marshalEdit(edit);
                C._ts_tree_edit_wasm(this[0]);
              }
              get rootNode() {
                C._ts_tree_root_node_wasm(this[0]);
                return unmarshalNode(this);
              }
              rootNodeWithOffset(offsetBytes, offsetExtent) {
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                setValue(address, offsetBytes, "i32");
                marshalPoint(address + SIZE_OF_INT, offsetExtent);
                C._ts_tree_root_node_with_offset_wasm(this[0]);
                return unmarshalNode(this);
              }
              getLanguage() {
                return this.language;
              }
              walk() {
                return this.rootNode.walk();
              }
              getChangedRanges(other) {
                if (other.constructor !== Tree) {
                  throw new TypeError("Argument must be a Tree");
                }
                C._ts_tree_get_changed_ranges_wasm(this[0], other[0]);
                const count = getValue(TRANSFER_BUFFER, "i32");
                const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const result = new Array(count);
                if (count > 0) {
                  let address = buffer;
                  for (let i2 = 0; i2 < count; i2++) {
                    result[i2] = unmarshalRange(address);
                    address += SIZE_OF_RANGE;
                  }
                  C._free(buffer);
                }
                return result;
              }
              getIncludedRanges() {
                C._ts_tree_included_ranges_wasm(this[0]);
                const count = getValue(TRANSFER_BUFFER, "i32");
                const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const result = new Array(count);
                if (count > 0) {
                  let address = buffer;
                  for (let i2 = 0; i2 < count; i2++) {
                    result[i2] = unmarshalRange(address);
                    address += SIZE_OF_RANGE;
                  }
                  C._free(buffer);
                }
                return result;
              }
            }
            class Node {
              constructor(internal, tree) {
                assertInternal(internal);
                this.tree = tree;
              }
              get typeId() {
                marshalNode(this);
                return C._ts_node_symbol_wasm(this.tree[0]);
              }
              get grammarId() {
                marshalNode(this);
                return C._ts_node_grammar_symbol_wasm(this.tree[0]);
              }
              get type() {
                return this.tree.language.types[this.typeId] || "ERROR";
              }
              get grammarType() {
                return this.tree.language.types[this.grammarId] || "ERROR";
              }
              get endPosition() {
                marshalNode(this);
                C._ts_node_end_point_wasm(this.tree[0]);
                return unmarshalPoint(TRANSFER_BUFFER);
              }
              get endIndex() {
                marshalNode(this);
                return C._ts_node_end_index_wasm(this.tree[0]);
              }
              get text() {
                return getText(this.tree, this.startIndex, this.endIndex);
              }
              get parseState() {
                marshalNode(this);
                return C._ts_node_parse_state_wasm(this.tree[0]);
              }
              get nextParseState() {
                marshalNode(this);
                return C._ts_node_next_parse_state_wasm(this.tree[0]);
              }
              get isNamed() {
                marshalNode(this);
                return C._ts_node_is_named_wasm(this.tree[0]) === 1;
              }
              get hasError() {
                marshalNode(this);
                return C._ts_node_has_error_wasm(this.tree[0]) === 1;
              }
              get hasChanges() {
                marshalNode(this);
                return C._ts_node_has_changes_wasm(this.tree[0]) === 1;
              }
              get isError() {
                marshalNode(this);
                return C._ts_node_is_error_wasm(this.tree[0]) === 1;
              }
              get isMissing() {
                marshalNode(this);
                return C._ts_node_is_missing_wasm(this.tree[0]) === 1;
              }
              get isExtra() {
                marshalNode(this);
                return C._ts_node_is_extra_wasm(this.tree[0]) === 1;
              }
              equals(other) {
                return this.id === other.id;
              }
              child(index) {
                marshalNode(this);
                C._ts_node_child_wasm(this.tree[0], index);
                return unmarshalNode(this.tree);
              }
              namedChild(index) {
                marshalNode(this);
                C._ts_node_named_child_wasm(this.tree[0], index);
                return unmarshalNode(this.tree);
              }
              childForFieldId(fieldId) {
                marshalNode(this);
                C._ts_node_child_by_field_id_wasm(this.tree[0], fieldId);
                return unmarshalNode(this.tree);
              }
              childForFieldName(fieldName) {
                const fieldId = this.tree.language.fields.indexOf(fieldName);
                if (fieldId !== -1) return this.childForFieldId(fieldId);
                return null;
              }
              fieldNameForChild(index) {
                marshalNode(this);
                const address = C._ts_node_field_name_for_child_wasm(this.tree[0], index);
                if (!address) {
                  return null;
                }
                const result = AsciiToString(address);
                return result;
              }
              childrenForFieldName(fieldName) {
                const fieldId = this.tree.language.fields.indexOf(fieldName);
                if (fieldId !== -1 && fieldId !== 0) return this.childrenForFieldId(fieldId);
                return [];
              }
              childrenForFieldId(fieldId) {
                marshalNode(this);
                C._ts_node_children_by_field_id_wasm(this.tree[0], fieldId);
                const count = getValue(TRANSFER_BUFFER, "i32");
                const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const result = new Array(count);
                if (count > 0) {
                  let address = buffer;
                  for (let i2 = 0; i2 < count; i2++) {
                    result[i2] = unmarshalNode(this.tree, address);
                    address += SIZE_OF_NODE;
                  }
                  C._free(buffer);
                }
                return result;
              }
              firstChildForIndex(index) {
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                setValue(address, index, "i32");
                C._ts_node_first_child_for_byte_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              firstNamedChildForIndex(index) {
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                setValue(address, index, "i32");
                C._ts_node_first_named_child_for_byte_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get childCount() {
                marshalNode(this);
                return C._ts_node_child_count_wasm(this.tree[0]);
              }
              get namedChildCount() {
                marshalNode(this);
                return C._ts_node_named_child_count_wasm(this.tree[0]);
              }
              get firstChild() {
                return this.child(0);
              }
              get firstNamedChild() {
                return this.namedChild(0);
              }
              get lastChild() {
                return this.child(this.childCount - 1);
              }
              get lastNamedChild() {
                return this.namedChild(this.namedChildCount - 1);
              }
              get children() {
                if (!this._children) {
                  marshalNode(this);
                  C._ts_node_children_wasm(this.tree[0]);
                  const count = getValue(TRANSFER_BUFFER, "i32");
                  const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                  this._children = new Array(count);
                  if (count > 0) {
                    let address = buffer;
                    for (let i2 = 0; i2 < count; i2++) {
                      this._children[i2] = unmarshalNode(this.tree, address);
                      address += SIZE_OF_NODE;
                    }
                    C._free(buffer);
                  }
                }
                return this._children;
              }
              get namedChildren() {
                if (!this._namedChildren) {
                  marshalNode(this);
                  C._ts_node_named_children_wasm(this.tree[0]);
                  const count = getValue(TRANSFER_BUFFER, "i32");
                  const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                  this._namedChildren = new Array(count);
                  if (count > 0) {
                    let address = buffer;
                    for (let i2 = 0; i2 < count; i2++) {
                      this._namedChildren[i2] = unmarshalNode(this.tree, address);
                      address += SIZE_OF_NODE;
                    }
                    C._free(buffer);
                  }
                }
                return this._namedChildren;
              }
              descendantsOfType(types, startPosition, endPosition) {
                if (!Array.isArray(types)) types = [types];
                if (!startPosition) startPosition = ZERO_POINT;
                if (!endPosition) endPosition = ZERO_POINT;
                const symbols = [];
                const typesBySymbol = this.tree.language.types;
                for (let i2 = 0, n = typesBySymbol.length; i2 < n; i2++) {
                  if (types.includes(typesBySymbol[i2])) {
                    symbols.push(i2);
                  }
                }
                const symbolsAddress = C._malloc(SIZE_OF_INT * symbols.length);
                for (let i2 = 0, n = symbols.length; i2 < n; i2++) {
                  setValue(symbolsAddress + i2 * SIZE_OF_INT, symbols[i2], "i32");
                }
                marshalNode(this);
                C._ts_node_descendants_of_type_wasm(this.tree[0], symbolsAddress, symbols.length, startPosition.row, startPosition.column, endPosition.row, endPosition.column);
                const descendantCount = getValue(TRANSFER_BUFFER, "i32");
                const descendantAddress = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const result = new Array(descendantCount);
                if (descendantCount > 0) {
                  let address = descendantAddress;
                  for (let i2 = 0; i2 < descendantCount; i2++) {
                    result[i2] = unmarshalNode(this.tree, address);
                    address += SIZE_OF_NODE;
                  }
                }
                C._free(descendantAddress);
                C._free(symbolsAddress);
                return result;
              }
              get nextSibling() {
                marshalNode(this);
                C._ts_node_next_sibling_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get previousSibling() {
                marshalNode(this);
                C._ts_node_prev_sibling_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get nextNamedSibling() {
                marshalNode(this);
                C._ts_node_next_named_sibling_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get previousNamedSibling() {
                marshalNode(this);
                C._ts_node_prev_named_sibling_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get descendantCount() {
                marshalNode(this);
                return C._ts_node_descendant_count_wasm(this.tree[0]);
              }
              get parent() {
                marshalNode(this);
                C._ts_node_parent_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              descendantForIndex(start2, end = start2) {
                if (typeof start2 !== "number" || typeof end !== "number") {
                  throw new Error("Arguments must be numbers");
                }
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                setValue(address, start2, "i32");
                setValue(address + SIZE_OF_INT, end, "i32");
                C._ts_node_descendant_for_index_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              namedDescendantForIndex(start2, end = start2) {
                if (typeof start2 !== "number" || typeof end !== "number") {
                  throw new Error("Arguments must be numbers");
                }
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                setValue(address, start2, "i32");
                setValue(address + SIZE_OF_INT, end, "i32");
                C._ts_node_named_descendant_for_index_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              descendantForPosition(start2, end = start2) {
                if (!isPoint(start2) || !isPoint(end)) {
                  throw new Error("Arguments must be {row, column} objects");
                }
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                marshalPoint(address, start2);
                marshalPoint(address + SIZE_OF_POINT, end);
                C._ts_node_descendant_for_position_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              namedDescendantForPosition(start2, end = start2) {
                if (!isPoint(start2) || !isPoint(end)) {
                  throw new Error("Arguments must be {row, column} objects");
                }
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                marshalPoint(address, start2);
                marshalPoint(address + SIZE_OF_POINT, end);
                C._ts_node_named_descendant_for_position_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              walk() {
                marshalNode(this);
                C._ts_tree_cursor_new_wasm(this.tree[0]);
                return new TreeCursor(INTERNAL, this.tree);
              }
              toString() {
                marshalNode(this);
                const address = C._ts_node_to_string_wasm(this.tree[0]);
                const result = AsciiToString(address);
                C._free(address);
                return result;
              }
            }
            class TreeCursor {
              constructor(internal, tree) {
                assertInternal(internal);
                this.tree = tree;
                unmarshalTreeCursor(this);
              }
              delete() {
                marshalTreeCursor(this);
                C._ts_tree_cursor_delete_wasm(this.tree[0]);
                this[0] = this[1] = this[2] = 0;
              }
              reset(node) {
                marshalNode(node);
                marshalTreeCursor(this, TRANSFER_BUFFER + SIZE_OF_NODE);
                C._ts_tree_cursor_reset_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
              }
              resetTo(cursor) {
                marshalTreeCursor(this, TRANSFER_BUFFER);
                marshalTreeCursor(cursor, TRANSFER_BUFFER + SIZE_OF_CURSOR);
                C._ts_tree_cursor_reset_to_wasm(this.tree[0], cursor.tree[0]);
                unmarshalTreeCursor(this);
              }
              get nodeType() {
                return this.tree.language.types[this.nodeTypeId] || "ERROR";
              }
              get nodeTypeId() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_node_type_id_wasm(this.tree[0]);
              }
              get nodeStateId() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_node_state_id_wasm(this.tree[0]);
              }
              get nodeId() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_node_id_wasm(this.tree[0]);
              }
              get nodeIsNamed() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_node_is_named_wasm(this.tree[0]) === 1;
              }
              get nodeIsMissing() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_node_is_missing_wasm(this.tree[0]) === 1;
              }
              get nodeText() {
                marshalTreeCursor(this);
                const startIndex = C._ts_tree_cursor_start_index_wasm(this.tree[0]);
                const endIndex = C._ts_tree_cursor_end_index_wasm(this.tree[0]);
                return getText(this.tree, startIndex, endIndex);
              }
              get startPosition() {
                marshalTreeCursor(this);
                C._ts_tree_cursor_start_position_wasm(this.tree[0]);
                return unmarshalPoint(TRANSFER_BUFFER);
              }
              get endPosition() {
                marshalTreeCursor(this);
                C._ts_tree_cursor_end_position_wasm(this.tree[0]);
                return unmarshalPoint(TRANSFER_BUFFER);
              }
              get startIndex() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_start_index_wasm(this.tree[0]);
              }
              get endIndex() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_end_index_wasm(this.tree[0]);
              }
              get currentNode() {
                marshalTreeCursor(this);
                C._ts_tree_cursor_current_node_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get currentFieldId() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_field_id_wasm(this.tree[0]);
              }
              get currentFieldName() {
                return this.tree.language.fields[this.currentFieldId];
              }
              get currentDepth() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_depth_wasm(this.tree[0]);
              }
              get currentDescendantIndex() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_descendant_index_wasm(this.tree[0]);
              }
              gotoFirstChild() {
                marshalTreeCursor(this);
                const result = C._ts_tree_cursor_goto_first_child_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoLastChild() {
                marshalTreeCursor(this);
                const result = C._ts_tree_cursor_goto_last_child_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoFirstChildForIndex(goalIndex) {
                marshalTreeCursor(this);
                setValue(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalIndex, "i32");
                const result = C._ts_tree_cursor_goto_first_child_for_index_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoFirstChildForPosition(goalPosition) {
                marshalTreeCursor(this);
                marshalPoint(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalPosition);
                const result = C._ts_tree_cursor_goto_first_child_for_position_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoNextSibling() {
                marshalTreeCursor(this);
                const result = C._ts_tree_cursor_goto_next_sibling_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoPreviousSibling() {
                marshalTreeCursor(this);
                const result = C._ts_tree_cursor_goto_previous_sibling_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoDescendant(goalDescendantindex) {
                marshalTreeCursor(this);
                C._ts_tree_cursor_goto_descendant_wasm(this.tree[0], goalDescendantindex);
                unmarshalTreeCursor(this);
              }
              gotoParent() {
                marshalTreeCursor(this);
                const result = C._ts_tree_cursor_goto_parent_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
            }
            class Language {
              constructor(internal, address) {
                assertInternal(internal);
                this[0] = address;
                this.types = new Array(C._ts_language_symbol_count(this[0]));
                for (let i2 = 0, n = this.types.length; i2 < n; i2++) {
                  if (C._ts_language_symbol_type(this[0], i2) < 2) {
                    this.types[i2] = UTF8ToString(C._ts_language_symbol_name(this[0], i2));
                  }
                }
                this.fields = new Array(C._ts_language_field_count(this[0]) + 1);
                for (let i2 = 0, n = this.fields.length; i2 < n; i2++) {
                  const fieldName = C._ts_language_field_name_for_id(this[0], i2);
                  if (fieldName !== 0) {
                    this.fields[i2] = UTF8ToString(fieldName);
                  } else {
                    this.fields[i2] = null;
                  }
                }
              }
              get version() {
                return C._ts_language_version(this[0]);
              }
              get fieldCount() {
                return this.fields.length - 1;
              }
              get stateCount() {
                return C._ts_language_state_count(this[0]);
              }
              fieldIdForName(fieldName) {
                const result = this.fields.indexOf(fieldName);
                if (result !== -1) {
                  return result;
                } else {
                  return null;
                }
              }
              fieldNameForId(fieldId) {
                return this.fields[fieldId] || null;
              }
              idForNodeType(type, named) {
                const typeLength = lengthBytesUTF8(type);
                const typeAddress = C._malloc(typeLength + 1);
                stringToUTF8(type, typeAddress, typeLength + 1);
                const result = C._ts_language_symbol_for_name(this[0], typeAddress, typeLength, named);
                C._free(typeAddress);
                return result || null;
              }
              get nodeTypeCount() {
                return C._ts_language_symbol_count(this[0]);
              }
              nodeTypeForId(typeId) {
                const name2 = C._ts_language_symbol_name(this[0], typeId);
                return name2 ? UTF8ToString(name2) : null;
              }
              nodeTypeIsNamed(typeId) {
                return C._ts_language_type_is_named_wasm(this[0], typeId) ? true : false;
              }
              nodeTypeIsVisible(typeId) {
                return C._ts_language_type_is_visible_wasm(this[0], typeId) ? true : false;
              }
              nextState(stateId, typeId) {
                return C._ts_language_next_state(this[0], stateId, typeId);
              }
              lookaheadIterator(stateId) {
                const address = C._ts_lookahead_iterator_new(this[0], stateId);
                if (address) return new LookaheadIterable(INTERNAL, address, this);
                return null;
              }
              query(source) {
                const sourceLength = lengthBytesUTF8(source);
                const sourceAddress = C._malloc(sourceLength + 1);
                stringToUTF8(source, sourceAddress, sourceLength + 1);
                const address = C._ts_query_new(this[0], sourceAddress, sourceLength, TRANSFER_BUFFER, TRANSFER_BUFFER + SIZE_OF_INT);
                if (!address) {
                  const errorId = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                  const errorByte = getValue(TRANSFER_BUFFER, "i32");
                  const errorIndex = UTF8ToString(sourceAddress, errorByte).length;
                  const suffix = source.substr(errorIndex, 100).split("\n")[0];
                  let word = suffix.match(QUERY_WORD_REGEX)[0];
                  let error;
                  switch (errorId) {
                    case 2:
                      error = new RangeError(`Bad node name '${word}'`);
                      break;
                    case 3:
                      error = new RangeError(`Bad field name '${word}'`);
                      break;
                    case 4:
                      error = new RangeError(`Bad capture name @${word}`);
                      break;
                    case 5:
                      error = new TypeError(`Bad pattern structure at offset ${errorIndex}: '${suffix}'...`);
                      word = "";
                      break;
                    default:
                      error = new SyntaxError(`Bad syntax at offset ${errorIndex}: '${suffix}'...`);
                      word = "";
                      break;
                  }
                  error.index = errorIndex;
                  error.length = word.length;
                  C._free(sourceAddress);
                  throw error;
                }
                const stringCount = C._ts_query_string_count(address);
                const captureCount = C._ts_query_capture_count(address);
                const patternCount = C._ts_query_pattern_count(address);
                const captureNames = new Array(captureCount);
                const stringValues = new Array(stringCount);
                for (let i2 = 0; i2 < captureCount; i2++) {
                  const nameAddress = C._ts_query_capture_name_for_id(address, i2, TRANSFER_BUFFER);
                  const nameLength = getValue(TRANSFER_BUFFER, "i32");
                  captureNames[i2] = UTF8ToString(nameAddress, nameLength);
                }
                for (let i2 = 0; i2 < stringCount; i2++) {
                  const valueAddress = C._ts_query_string_value_for_id(address, i2, TRANSFER_BUFFER);
                  const nameLength = getValue(TRANSFER_BUFFER, "i32");
                  stringValues[i2] = UTF8ToString(valueAddress, nameLength);
                }
                const setProperties = new Array(patternCount);
                const assertedProperties = new Array(patternCount);
                const refutedProperties = new Array(patternCount);
                const predicates = new Array(patternCount);
                const textPredicates = new Array(patternCount);
                for (let i2 = 0; i2 < patternCount; i2++) {
                  const predicatesAddress = C._ts_query_predicates_for_pattern(address, i2, TRANSFER_BUFFER);
                  const stepCount = getValue(TRANSFER_BUFFER, "i32");
                  predicates[i2] = [];
                  textPredicates[i2] = [];
                  const steps = [];
                  let stepAddress = predicatesAddress;
                  for (let j = 0; j < stepCount; j++) {
                    const stepType = getValue(stepAddress, "i32");
                    stepAddress += SIZE_OF_INT;
                    const stepValueId = getValue(stepAddress, "i32");
                    stepAddress += SIZE_OF_INT;
                    if (stepType === PREDICATE_STEP_TYPE_CAPTURE) {
                      steps.push({
                        type: "capture",
                        name: captureNames[stepValueId]
                      });
                    } else if (stepType === PREDICATE_STEP_TYPE_STRING) {
                      steps.push({
                        type: "string",
                        value: stringValues[stepValueId]
                      });
                    } else if (steps.length > 0) {
                      if (steps[0].type !== "string") {
                        throw new Error("Predicates must begin with a literal value");
                      }
                      const operator = steps[0].value;
                      let isPositive = true;
                      let matchAll = true;
                      let captureName;
                      switch (operator) {
                        case "any-not-eq?":
                        case "not-eq?":
                          isPositive = false;
                        case "any-eq?":
                        case "eq?":
                          if (steps.length !== 3) {
                            throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}`);
                          }
                          if (steps[1].type !== "capture") {
                            throw new Error(`First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}"`);
                          }
                          matchAll = !operator.startsWith("any-");
                          if (steps[2].type === "capture") {
                            const captureName1 = steps[1].name;
                            const captureName2 = steps[2].name;
                            textPredicates[i2].push((captures) => {
                              const nodes1 = [];
                              const nodes2 = [];
                              for (const c of captures) {
                                if (c.name === captureName1) nodes1.push(c.node);
                                if (c.name === captureName2) nodes2.push(c.node);
                              }
                              const compare = (n1, n2, positive) => positive ? n1.text === n2.text : n1.text !== n2.text;
                              return matchAll ? nodes1.every((n1) => nodes2.some((n2) => compare(n1, n2, isPositive))) : nodes1.some((n1) => nodes2.some((n2) => compare(n1, n2, isPositive)));
                            });
                          } else {
                            captureName = steps[1].name;
                            const stringValue = steps[2].value;
                            const matches = (n) => n.text === stringValue;
                            const doesNotMatch = (n) => n.text !== stringValue;
                            textPredicates[i2].push((captures) => {
                              const nodes = [];
                              for (const c of captures) {
                                if (c.name === captureName) nodes.push(c.node);
                              }
                              const test = isPositive ? matches : doesNotMatch;
                              return matchAll ? nodes.every(test) : nodes.some(test);
                            });
                          }
                          break;
                        case "any-not-match?":
                        case "not-match?":
                          isPositive = false;
                        case "any-match?":
                        case "match?":
                          if (steps.length !== 3) {
                            throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}.`);
                          }
                          if (steps[1].type !== "capture") {
                            throw new Error(`First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`);
                          }
                          if (steps[2].type !== "string") {
                            throw new Error(`Second argument of \`#${operator}\` predicate must be a string. Got @${steps[2].value}.`);
                          }
                          captureName = steps[1].name;
                          const regex = new RegExp(steps[2].value);
                          matchAll = !operator.startsWith("any-");
                          textPredicates[i2].push((captures) => {
                            const nodes = [];
                            for (const c of captures) {
                              if (c.name === captureName) nodes.push(c.node.text);
                            }
                            const test = (text, positive) => positive ? regex.test(text) : !regex.test(text);
                            if (nodes.length === 0) return !isPositive;
                            return matchAll ? nodes.every((text) => test(text, isPositive)) : nodes.some((text) => test(text, isPositive));
                          });
                          break;
                        case "set!":
                          if (steps.length < 2 || steps.length > 3) {
                            throw new Error(`Wrong number of arguments to \`#set!\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`);
                          }
                          if (steps.some((s) => s.type !== "string")) {
                            throw new Error(`Arguments to \`#set!\` predicate must be a strings.".`);
                          }
                          if (!setProperties[i2]) setProperties[i2] = {};
                          setProperties[i2][steps[1].value] = steps[2] ? steps[2].value : null;
                          break;
                        case "is?":
                        case "is-not?":
                          if (steps.length < 2 || steps.length > 3) {
                            throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`);
                          }
                          if (steps.some((s) => s.type !== "string")) {
                            throw new Error(`Arguments to \`#${operator}\` predicate must be a strings.".`);
                          }
                          const properties = operator === "is?" ? assertedProperties : refutedProperties;
                          if (!properties[i2]) properties[i2] = {};
                          properties[i2][steps[1].value] = steps[2] ? steps[2].value : null;
                          break;
                        case "not-any-of?":
                          isPositive = false;
                        case "any-of?":
                          if (steps.length < 2) {
                            throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected at least 1. Got ${steps.length - 1}.`);
                          }
                          if (steps[1].type !== "capture") {
                            throw new Error(`First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`);
                          }
                          for (let i3 = 2; i3 < steps.length; i3++) {
                            if (steps[i3].type !== "string") {
                              throw new Error(`Arguments to \`#${operator}\` predicate must be a strings.".`);
                            }
                          }
                          captureName = steps[1].name;
                          const values = steps.slice(2).map((s) => s.value);
                          textPredicates[i2].push((captures) => {
                            const nodes = [];
                            for (const c of captures) {
                              if (c.name === captureName) nodes.push(c.node.text);
                            }
                            if (nodes.length === 0) return !isPositive;
                            return nodes.every((text) => values.includes(text)) === isPositive;
                          });
                          break;
                        default:
                          predicates[i2].push({
                            operator,
                            operands: steps.slice(1)
                          });
                      }
                      steps.length = 0;
                    }
                  }
                  Object.freeze(setProperties[i2]);
                  Object.freeze(assertedProperties[i2]);
                  Object.freeze(refutedProperties[i2]);
                }
                C._free(sourceAddress);
                return new Query(INTERNAL, address, captureNames, textPredicates, predicates, Object.freeze(setProperties), Object.freeze(assertedProperties), Object.freeze(refutedProperties));
              }
              static load(input) {
                let bytes;
                if (input instanceof Uint8Array) {
                  bytes = Promise.resolve(input);
                } else {
                  const url = input;
                  if (typeof process !== "undefined" && process.versions && process.versions.node) {
                    const fs2 = __require("fs");
                    bytes = Promise.resolve(fs2.readFileSync(url));
                  } else {
                    bytes = fetch(url).then((response) => response.arrayBuffer().then((buffer) => {
                      if (response.ok) {
                        return new Uint8Array(buffer);
                      } else {
                        const body2 = new TextDecoder("utf-8").decode(buffer);
                        throw new Error(`Language.load failed with status ${response.status}.

${body2}`);
                      }
                    }));
                  }
                }
                return bytes.then((bytes2) => loadWebAssemblyModule(bytes2, {
                  loadAsync: true
                })).then((mod) => {
                  const symbolNames = Object.keys(mod);
                  const functionName = symbolNames.find((key) => LANGUAGE_FUNCTION_REGEX.test(key) && !key.includes("external_scanner_"));
                  if (!functionName) {
                    console.log(`Couldn't find language function in WASM file. Symbols:
${JSON.stringify(symbolNames, null, 2)}`);
                  }
                  const languageAddress = mod[functionName]();
                  return new Language(INTERNAL, languageAddress);
                });
              }
            }
            class LookaheadIterable {
              constructor(internal, address, language) {
                assertInternal(internal);
                this[0] = address;
                this.language = language;
              }
              get currentTypeId() {
                return C._ts_lookahead_iterator_current_symbol(this[0]);
              }
              get currentType() {
                return this.language.types[this.currentTypeId] || "ERROR";
              }
              delete() {
                C._ts_lookahead_iterator_delete(this[0]);
                this[0] = 0;
              }
              resetState(stateId) {
                return C._ts_lookahead_iterator_reset_state(this[0], stateId);
              }
              reset(language, stateId) {
                if (C._ts_lookahead_iterator_reset(this[0], language[0], stateId)) {
                  this.language = language;
                  return true;
                }
                return false;
              }
              [Symbol.iterator]() {
                const self2 = this;
                return {
                  next() {
                    if (C._ts_lookahead_iterator_next(self2[0])) {
                      return {
                        done: false,
                        value: self2.currentType
                      };
                    }
                    return {
                      done: true,
                      value: ""
                    };
                  }
                };
              }
            }
            class Query {
              constructor(internal, address, captureNames, textPredicates, predicates, setProperties, assertedProperties, refutedProperties) {
                assertInternal(internal);
                this[0] = address;
                this.captureNames = captureNames;
                this.textPredicates = textPredicates;
                this.predicates = predicates;
                this.setProperties = setProperties;
                this.assertedProperties = assertedProperties;
                this.refutedProperties = refutedProperties;
                this.exceededMatchLimit = false;
              }
              delete() {
                C._ts_query_delete(this[0]);
                this[0] = 0;
              }
              matches(node, { startPosition = ZERO_POINT, endPosition = ZERO_POINT, startIndex = 0, endIndex = 0, matchLimit = 4294967295, maxStartDepth = 4294967295, timeoutMicros = 0 } = {}) {
                if (typeof matchLimit !== "number") {
                  throw new Error("Arguments must be numbers");
                }
                marshalNode(node);
                C._ts_query_matches_wasm(this[0], node.tree[0], startPosition.row, startPosition.column, endPosition.row, endPosition.column, startIndex, endIndex, matchLimit, maxStartDepth, timeoutMicros);
                const rawCount = getValue(TRANSFER_BUFFER, "i32");
                const startAddress = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const didExceedMatchLimit = getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
                const result = new Array(rawCount);
                this.exceededMatchLimit = Boolean(didExceedMatchLimit);
                let filteredCount = 0;
                let address = startAddress;
                for (let i2 = 0; i2 < rawCount; i2++) {
                  const pattern = getValue(address, "i32");
                  address += SIZE_OF_INT;
                  const captureCount = getValue(address, "i32");
                  address += SIZE_OF_INT;
                  const captures = new Array(captureCount);
                  address = unmarshalCaptures(this, node.tree, address, captures);
                  if (this.textPredicates[pattern].every((p) => p(captures))) {
                    result[filteredCount] = {
                      pattern,
                      captures
                    };
                    const setProperties = this.setProperties[pattern];
                    if (setProperties) result[filteredCount].setProperties = setProperties;
                    const assertedProperties = this.assertedProperties[pattern];
                    if (assertedProperties) result[filteredCount].assertedProperties = assertedProperties;
                    const refutedProperties = this.refutedProperties[pattern];
                    if (refutedProperties) result[filteredCount].refutedProperties = refutedProperties;
                    filteredCount++;
                  }
                }
                result.length = filteredCount;
                C._free(startAddress);
                return result;
              }
              captures(node, { startPosition = ZERO_POINT, endPosition = ZERO_POINT, startIndex = 0, endIndex = 0, matchLimit = 4294967295, maxStartDepth = 4294967295, timeoutMicros = 0 } = {}) {
                if (typeof matchLimit !== "number") {
                  throw new Error("Arguments must be numbers");
                }
                marshalNode(node);
                C._ts_query_captures_wasm(this[0], node.tree[0], startPosition.row, startPosition.column, endPosition.row, endPosition.column, startIndex, endIndex, matchLimit, maxStartDepth, timeoutMicros);
                const count = getValue(TRANSFER_BUFFER, "i32");
                const startAddress = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const didExceedMatchLimit = getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
                const result = [];
                this.exceededMatchLimit = Boolean(didExceedMatchLimit);
                const captures = [];
                let address = startAddress;
                for (let i2 = 0; i2 < count; i2++) {
                  const pattern = getValue(address, "i32");
                  address += SIZE_OF_INT;
                  const captureCount = getValue(address, "i32");
                  address += SIZE_OF_INT;
                  const captureIndex = getValue(address, "i32");
                  address += SIZE_OF_INT;
                  captures.length = captureCount;
                  address = unmarshalCaptures(this, node.tree, address, captures);
                  if (this.textPredicates[pattern].every((p) => p(captures))) {
                    const capture = captures[captureIndex];
                    const setProperties = this.setProperties[pattern];
                    if (setProperties) capture.setProperties = setProperties;
                    const assertedProperties = this.assertedProperties[pattern];
                    if (assertedProperties) capture.assertedProperties = assertedProperties;
                    const refutedProperties = this.refutedProperties[pattern];
                    if (refutedProperties) capture.refutedProperties = refutedProperties;
                    result.push(capture);
                  }
                }
                C._free(startAddress);
                return result;
              }
              predicatesForPattern(patternIndex) {
                return this.predicates[patternIndex];
              }
              disableCapture(captureName) {
                const captureNameLength = lengthBytesUTF8(captureName);
                const captureNameAddress = C._malloc(captureNameLength + 1);
                stringToUTF8(captureName, captureNameAddress, captureNameLength + 1);
                C._ts_query_disable_capture(this[0], captureNameAddress, captureNameLength);
                C._free(captureNameAddress);
              }
              didExceedMatchLimit() {
                return this.exceededMatchLimit;
              }
            }
            function getText(tree, startIndex, endIndex) {
              const length = endIndex - startIndex;
              let result = tree.textCallback(startIndex, null, endIndex);
              startIndex += result.length;
              while (startIndex < endIndex) {
                const string = tree.textCallback(startIndex, null, endIndex);
                if (string && string.length > 0) {
                  startIndex += string.length;
                  result += string;
                } else {
                  break;
                }
              }
              if (startIndex > endIndex) {
                result = result.slice(0, length);
              }
              return result;
            }
            function unmarshalCaptures(query, tree, address, result) {
              for (let i2 = 0, n = result.length; i2 < n; i2++) {
                const captureIndex = getValue(address, "i32");
                address += SIZE_OF_INT;
                const node = unmarshalNode(tree, address);
                address += SIZE_OF_NODE;
                result[i2] = {
                  name: query.captureNames[captureIndex],
                  node
                };
              }
              return address;
            }
            function assertInternal(x) {
              if (x !== INTERNAL) throw new Error("Illegal constructor");
            }
            function isPoint(point) {
              return point && typeof point.row === "number" && typeof point.column === "number";
            }
            function marshalNode(node) {
              let address = TRANSFER_BUFFER;
              setValue(address, node.id, "i32");
              address += SIZE_OF_INT;
              setValue(address, node.startIndex, "i32");
              address += SIZE_OF_INT;
              setValue(address, node.startPosition.row, "i32");
              address += SIZE_OF_INT;
              setValue(address, node.startPosition.column, "i32");
              address += SIZE_OF_INT;
              setValue(address, node[0], "i32");
            }
            function unmarshalNode(tree, address = TRANSFER_BUFFER) {
              const id = getValue(address, "i32");
              address += SIZE_OF_INT;
              if (id === 0) return null;
              const index = getValue(address, "i32");
              address += SIZE_OF_INT;
              const row = getValue(address, "i32");
              address += SIZE_OF_INT;
              const column = getValue(address, "i32");
              address += SIZE_OF_INT;
              const other = getValue(address, "i32");
              const result = new Node(INTERNAL, tree);
              result.id = id;
              result.startIndex = index;
              result.startPosition = {
                row,
                column
              };
              result[0] = other;
              return result;
            }
            function marshalTreeCursor(cursor, address = TRANSFER_BUFFER) {
              setValue(address + 0 * SIZE_OF_INT, cursor[0], "i32");
              setValue(address + 1 * SIZE_OF_INT, cursor[1], "i32");
              setValue(address + 2 * SIZE_OF_INT, cursor[2], "i32");
              setValue(address + 3 * SIZE_OF_INT, cursor[3], "i32");
            }
            function unmarshalTreeCursor(cursor) {
              cursor[0] = getValue(TRANSFER_BUFFER + 0 * SIZE_OF_INT, "i32");
              cursor[1] = getValue(TRANSFER_BUFFER + 1 * SIZE_OF_INT, "i32");
              cursor[2] = getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
              cursor[3] = getValue(TRANSFER_BUFFER + 3 * SIZE_OF_INT, "i32");
            }
            function marshalPoint(address, point) {
              setValue(address, point.row, "i32");
              setValue(address + SIZE_OF_INT, point.column, "i32");
            }
            function unmarshalPoint(address) {
              const result = {
                row: getValue(address, "i32") >>> 0,
                column: getValue(address + SIZE_OF_INT, "i32") >>> 0
              };
              return result;
            }
            function marshalRange(address, range) {
              marshalPoint(address, range.startPosition);
              address += SIZE_OF_POINT;
              marshalPoint(address, range.endPosition);
              address += SIZE_OF_POINT;
              setValue(address, range.startIndex, "i32");
              address += SIZE_OF_INT;
              setValue(address, range.endIndex, "i32");
              address += SIZE_OF_INT;
            }
            function unmarshalRange(address) {
              const result = {};
              result.startPosition = unmarshalPoint(address);
              address += SIZE_OF_POINT;
              result.endPosition = unmarshalPoint(address);
              address += SIZE_OF_POINT;
              result.startIndex = getValue(address, "i32") >>> 0;
              address += SIZE_OF_INT;
              result.endIndex = getValue(address, "i32") >>> 0;
              return result;
            }
            function marshalEdit(edit) {
              let address = TRANSFER_BUFFER;
              marshalPoint(address, edit.startPosition);
              address += SIZE_OF_POINT;
              marshalPoint(address, edit.oldEndPosition);
              address += SIZE_OF_POINT;
              marshalPoint(address, edit.newEndPosition);
              address += SIZE_OF_POINT;
              setValue(address, edit.startIndex, "i32");
              address += SIZE_OF_INT;
              setValue(address, edit.oldEndIndex, "i32");
              address += SIZE_OF_INT;
              setValue(address, edit.newEndIndex, "i32");
              address += SIZE_OF_INT;
            }
            for (const name2 of Object.getOwnPropertyNames(ParserImpl.prototype)) {
              Object.defineProperty(Parser.prototype, name2, {
                value: ParserImpl.prototype[name2],
                enumerable: false,
                writable: false
              });
            }
            Parser.Language = Language;
            Module.onRuntimeInitialized = () => {
              ParserImpl.init();
              resolveInitPromise();
            };
          });
        }
      }
      return Parser;
    })();
    if (typeof exports === "object") {
      module.exports = TreeSitter;
    }
  }
});

// node_modules/smol-toml/dist/date.js
var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|[-+]\d{2}:\d{2})?$/i;
var TomlDate = class _TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    if (typeof date === "string") {
      let match = date.match(DATE_TIME_RE);
      if (match) {
        if (!match[1]) {
          hasDate = false;
          date = `0000-01-01T${date}`;
        }
        hasTime = !!match[2];
        hasTime && date[10] === " " && (date = date.replace(" ", "T"));
        if (match[2] && +match[2] > 23) {
          date = "";
        } else {
          offset = match[3] || null;
          date = date.toUpperCase();
          if (!offset && hasTime)
            date += "Z";
        }
      } else {
        date = "";
      }
    }
    super(date);
    if (!isNaN(this.getTime())) {
      this.#hasDate = hasDate;
      this.#hasTime = hasTime;
      this.#offset = offset;
    }
  }
  isDateTime() {
    return this.#hasDate && this.#hasTime;
  }
  isLocal() {
    return !this.#hasDate || !this.#hasTime || !this.#offset;
  }
  isDate() {
    return this.#hasDate && !this.#hasTime;
  }
  isTime() {
    return this.#hasTime && !this.#hasDate;
  }
  isValid() {
    return this.#hasDate || this.#hasTime;
  }
  toISOString() {
    let iso = super.toISOString();
    if (this.isDate())
      return iso.slice(0, 10);
    if (this.isTime())
      return iso.slice(11, 23);
    if (this.#offset === null)
      return iso.slice(0, -1);
    if (this.#offset === "Z")
      return iso;
    let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
    offset = this.#offset[0] === "-" ? offset : -offset;
    let offsetDate = new Date(this.getTime() - offset * 6e4);
    return offsetDate.toISOString().slice(0, -1) + this.#offset;
  }
  static wrapAsOffsetDateTime(jsDate, offset = "Z") {
    let date = new _TomlDate(jsDate);
    date.#offset = offset;
    return date;
  }
  static wrapAsLocalDateTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#offset = null;
    return date;
  }
  static wrapAsLocalDate(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasTime = false;
    date.#offset = null;
    return date;
  }
  static wrapAsLocalTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasDate = false;
    date.#offset = null;
    return date;
  }
};

// node_modules/smol-toml/dist/error.js
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r\n|\n|\r/g);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r\n|\n|\r/g);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i2 = line - 1; i2 <= line + 1; i2++) {
    let l = lines[i2 - 1];
    if (!l)
      continue;
    codeblock += i2.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += "\n";
    if (i2 === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += "^\n";
    }
  }
  return codeblock;
}
var TomlError = class extends Error {
  line;
  column;
  codeblock;
  constructor(message, options) {
    const [line, column] = getLineColFromPtr(options.toml, options.ptr);
    const codeblock = makeCodeBlock(options.toml, line, column);
    super(`Invalid TOML document: ${message}

${codeblock}`, options);
    this.line = line;
    this.column = column;
    this.codeblock = codeblock;
  }
};

// node_modules/smol-toml/dist/primitive.js
var INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
var FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
var LEADING_ZERO = /^[+-]?0[0-9_]/;
function parseString(str, ptr) {
  let c = str[ptr++];
  let first = c;
  let isLiteral = c === "'";
  let isMultiline = c === str[ptr] && c === str[ptr + 1];
  if (isMultiline) {
    if (str[ptr += 2] === "\n")
      ptr++;
    else if (str[ptr] === "\r" && str[ptr + 1] === "\n")
      ptr += 2;
  }
  let parsed = "";
  let sliceStart = ptr;
  let state = 0;
  for (let i2 = ptr; i2 < str.length; i2++) {
    c = str[i2];
    if (isMultiline && (c === "\n" || c === "\r" && str[i2 + 1] === "\n")) {
      state = state && 3;
    } else if (c < " " && c !== "	" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in strings", {
        toml: str,
        ptr: i2
      });
    } else if ((!state || state === 3) && c === first && (!isMultiline || str[i2 + 1] === first && str[i2 + 2] === first)) {
      if (isMultiline) {
        if (str[i2 + 3] === first)
          i2++;
        if (str[i2 + 3] === first)
          i2++;
      }
      return [
        // If we're in a newline escape still, then there's nothing to add.
        // Also try to avoid concat if there's nothing to add to parsed, or nothing has been added to parsed.
        state ? parsed : parsed + str.slice(sliceStart, i2),
        i2 + (isMultiline ? 3 : 1)
      ];
    } else if (!state) {
      if (!isLiteral && c === "\\") {
        parsed += str.slice(sliceStart, sliceStart = i2);
        state = 1;
      }
    } else if (state === 1) {
      if (c === "x" || c === "u" || c === "U") {
        let value = 0;
        let len = c === "x" ? 2 : c === "u" ? 4 : 8;
        for (let j = 0; j < len; j++, i2++) {
          let hex = str.charCodeAt(i2 + 1);
          let digit = (
            /* 0-9 */
            hex >= 48 && hex <= 57 ? hex - 48 : (
              /* A-F */
              hex >= 65 && hex <= 70 ? hex - 65 + 10 : (
                /* a-f */
                hex >= 97 && hex <= 102 ? hex - 97 + 10 : -1
              )
            )
          );
          if (digit < 0)
            throw new TomlError("invalid non-hex character in unicode escape", { toml: str, ptr: i2 + 1 });
          value = value << 4 | digit;
        }
        if (value < 0 || value > 1114111 || value >= 55296 && value <= 57343) {
          throw new TomlError("invalid unicode escape", { toml: str, ptr: i2 });
        }
        parsed += String.fromCodePoint(value);
        sliceStart = i2 + 1;
        state = 0;
      } else if (c === " " || c === "	") {
        state = 2;
      } else {
        if (c === "b")
          parsed += "\b";
        else if (c === "t")
          parsed += "	";
        else if (c === "n")
          parsed += "\n";
        else if (c === "f")
          parsed += "\f";
        else if (c === "r")
          parsed += "\r";
        else if (c === "e")
          parsed += "\x1B";
        else if (c === '"')
          parsed += '"';
        else if (c === "\\")
          parsed += "\\";
        else
          throw new TomlError("unrecognized escape sequence", { toml: str, ptr: i2 });
        sliceStart = i2 + 1;
        state = 0;
      }
    } else if (c !== " " && c !== "	") {
      if (state === 2) {
        throw new TomlError("invalid escape: only line-ending whitespace may be escaped", {
          toml: str,
          ptr: sliceStart
        });
      }
      state = !isLiteral && c === "\\" ? 1 : 0;
      sliceStart = i2;
    }
  }
  throw new TomlError("unfinished string", { toml: str, ptr });
}
function parseValue(value, toml, ptr, integersAsBigInt) {
  if (value === "true")
    return true;
  if (value === "false")
    return false;
  if (value === "-inf")
    return -Infinity;
  if (value === "inf" || value === "+inf")
    return Infinity;
  if (value === "nan" || value === "+nan" || value === "-nan")
    return NaN;
  if (value === "-0")
    return integersAsBigInt ? 0n : 0;
  let isInt = INT_REGEX.test(value);
  if (isInt || FLOAT_REGEX.test(value)) {
    if (LEADING_ZERO.test(value)) {
      throw new TomlError("leading zeroes are not allowed", {
        toml,
        ptr
      });
    }
    value = value.replace(/_/g, "");
    let numeric = +value;
    if (isNaN(numeric)) {
      throw new TomlError("invalid number", {
        toml,
        ptr
      });
    }
    if (isInt) {
      if ((isInt = !Number.isSafeInteger(numeric)) && !integersAsBigInt) {
        throw new TomlError("integer value cannot be represented losslessly", {
          toml,
          ptr
        });
      }
      if (isInt || integersAsBigInt === true)
        numeric = BigInt(value);
    }
    return numeric;
  }
  const date = new TomlDate(value);
  if (!date.isValid()) {
    throw new TomlError("invalid value", {
      toml,
      ptr
    });
  }
  return date;
}

// node_modules/smol-toml/dist/util.js
function indexOfNewline(str, start2 = 0, end = str.length) {
  let idx = str.indexOf("\n", start2);
  if (str[idx - 1] === "\r")
    idx--;
  return idx <= end ? idx : -1;
}
function skipComment(str, ptr) {
  for (let i2 = ptr; i2 < str.length; i2++) {
    let c = str[i2];
    if (c === "\n")
      return i2;
    if (c === "\r" && str[i2 + 1] === "\n")
      return i2 + 1;
    if (c < " " && c !== "	" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in comments", {
        toml: str,
        ptr
      });
    }
  }
  return str.length;
}
function skipVoid(str, ptr, banNewLines, banComments) {
  let c;
  while (1) {
    while ((c = str[ptr]) === " " || c === "	" || !banNewLines && (c === "\n" || c === "\r" && str[ptr + 1] === "\n"))
      ptr++;
    if (banComments || c !== "#")
      break;
    ptr = skipComment(str, ptr);
  }
  return ptr;
}
function skipUntil(str, ptr, sep, end, banNewLines = false) {
  if (!end) {
    ptr = indexOfNewline(str, ptr);
    return ptr < 0 ? str.length : ptr;
  }
  for (let i2 = ptr; i2 < str.length; i2++) {
    let c = str[i2];
    if (c === "#") {
      i2 = indexOfNewline(str, i2);
    } else if (c === sep) {
      return i2 + 1;
    } else if (c === end || banNewLines && (c === "\n" || c === "\r" && str[i2 + 1] === "\n")) {
      return i2;
    }
  }
  throw new TomlError("cannot find end of structure", {
    toml: str,
    ptr
  });
}

// node_modules/smol-toml/dist/extract.js
function sliceAndTrimEndOf(str, startPtr, endPtr) {
  let value = str.slice(startPtr, endPtr);
  let commentIdx = value.indexOf("#");
  if (commentIdx > -1) {
    skipComment(str, commentIdx);
    value = value.slice(0, commentIdx);
  }
  return [value.trimEnd(), commentIdx];
}
function extractValue(str, ptr, end, depth, integersAsBigInt) {
  if (depth === 0) {
    throw new TomlError("document contains excessively nested structures. aborting.", {
      toml: str,
      ptr
    });
  }
  let c = str[ptr];
  if (c === "[" || c === "{") {
    let [value, endPtr2] = c === "[" ? parseArray(str, ptr, depth, integersAsBigInt) : parseInlineTable(str, ptr, depth, integersAsBigInt);
    if (end) {
      endPtr2 = skipVoid(str, endPtr2);
      if (str[endPtr2] === ",")
        endPtr2++;
      else if (str[endPtr2] !== end) {
        throw new TomlError("expected comma or end of structure", {
          toml: str,
          ptr: endPtr2
        });
      }
    }
    return [value, endPtr2];
  }
  if (c === '"' || c === "'") {
    let [parsed, endPtr2] = parseString(str, ptr);
    if (end) {
      endPtr2 = skipVoid(str, endPtr2);
      if (str[endPtr2] && str[endPtr2] !== "," && str[endPtr2] !== end && str[endPtr2] !== "\n" && str[endPtr2] !== "\r") {
        throw new TomlError("unexpected character encountered", {
          toml: str,
          ptr: endPtr2
        });
      }
      if (str[endPtr2] === ",")
        endPtr2++;
    }
    return [parsed, endPtr2];
  }
  let endPtr = skipUntil(str, ptr, ",", end);
  let slice = sliceAndTrimEndOf(str, ptr, endPtr - (str[endPtr - 1] === "," ? 1 : 0));
  if (!slice[0]) {
    throw new TomlError("incomplete key-value declaration: no value specified", {
      toml: str,
      ptr
    });
  }
  if (end && slice[1] > -1) {
    endPtr = skipVoid(str, ptr + slice[1]);
    if (str[endPtr] === ",")
      endPtr++;
  }
  return [
    parseValue(slice[0], str, ptr, integersAsBigInt),
    endPtr
  ];
}

// node_modules/smol-toml/dist/struct.js
var KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
function parseKey(str, ptr, end = "=") {
  let dot = ptr - 1;
  let parsed = [];
  let endPtr = str.indexOf(end, ptr);
  if (endPtr < 0) {
    throw new TomlError("incomplete key-value: cannot find end of key", {
      toml: str,
      ptr
    });
  }
  do {
    let c = str[ptr = ++dot];
    if (c !== " " && c !== "	") {
      if (c === '"' || c === "'") {
        if (c === str[ptr + 1] && c === str[ptr + 2]) {
          throw new TomlError("multiline strings are not allowed in keys", {
            toml: str,
            ptr
          });
        }
        let [part, eos] = parseString(str, ptr);
        dot = str.indexOf(".", eos);
        let strEnd = str.slice(eos, dot < 0 || dot > endPtr ? endPtr : dot);
        let newLine = indexOfNewline(strEnd);
        if (newLine > -1) {
          throw new TomlError("newlines are not allowed in keys", {
            toml: str,
            ptr: ptr + dot + newLine
          });
        }
        if (strEnd.trimStart()) {
          throw new TomlError("found extra tokens after the string part", {
            toml: str,
            ptr: eos
          });
        }
        if (endPtr < eos) {
          endPtr = str.indexOf(end, eos);
          if (endPtr < 0) {
            throw new TomlError("incomplete key-value: cannot find end of key", {
              toml: str,
              ptr
            });
          }
        }
        parsed.push(part);
      } else {
        dot = str.indexOf(".", ptr);
        let part = str.slice(ptr, dot < 0 || dot > endPtr ? endPtr : dot);
        if (!KEY_PART_RE.test(part)) {
          throw new TomlError("only letter, numbers, dashes and underscores are allowed in keys", {
            toml: str,
            ptr
          });
        }
        parsed.push(part.trimEnd());
      }
    }
  } while (dot + 1 && dot < endPtr);
  return [parsed, skipVoid(str, endPtr + 1, true, true)];
}
function parseInlineTable(str, ptr, depth, integersAsBigInt) {
  let res = {};
  let seen = /* @__PURE__ */ new Set();
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "}" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "	" && c !== "\n" && c !== "\r") {
      let k;
      let t = res;
      let hasOwn = false;
      let [key, keyEndPtr] = parseKey(str, ptr - 1);
      for (let i2 = 0; i2 < key.length; i2++) {
        if (i2)
          t = hasOwn ? t[k] : t[k] = {};
        k = key[i2];
        if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
          throw new TomlError("trying to redefine an already defined value", {
            toml: str,
            ptr
          });
        }
        if (!hasOwn && k === "__proto__") {
          Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        }
      }
      if (hasOwn) {
        throw new TomlError("trying to redefine an already defined value", {
          toml: str,
          ptr
        });
      }
      let [value, valueEndPtr] = extractValue(str, keyEndPtr, "}", depth - 1, integersAsBigInt);
      seen.add(value);
      t[k] = value;
      ptr = valueEndPtr;
    }
  }
  if (!c) {
    throw new TomlError("unfinished table encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}
function parseArray(str, ptr, depth, integersAsBigInt) {
  let res = [];
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "]" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "	" && c !== "\n" && c !== "\r") {
      let e = extractValue(str, ptr - 1, "]", depth - 1, integersAsBigInt);
      res.push(e[0]);
      ptr = e[1];
    }
  }
  if (!c) {
    throw new TomlError("unfinished array encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}

// node_modules/smol-toml/dist/parse.js
function peekTable(key, table, meta, type) {
  let t = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i2 = 0; i2 < key.length; i2++) {
    if (i2) {
      t = hasOwn ? t[k] : t[k] = {};
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t.length - 1;
        t = t[l];
        m = m[l].c;
      }
    }
    k = key[i2];
    if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      if (k === "__proto__") {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i2 < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: {}
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t[k] = [];
    }
    t[k].push(t = {});
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: {} };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = {};
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function parse(toml, { maxDepth = 1e3, integersAsBigInt } = {}) {
  let res = {};
  let meta = {};
  let tbl = res;
  let m = meta;
  for (let ptr = skipVoid(toml, 0); ptr < toml.length; ) {
    if (toml[ptr] === "[") {
      let isTableArray = toml[++ptr] === "[";
      let k = parseKey(toml, ptr += +isTableArray, "]");
      if (isTableArray) {
        if (toml[k[1] - 1] !== "]") {
          throw new TomlError("expected end of table declaration", {
            toml,
            ptr: k[1] - 1
          });
        }
        k[1]++;
      }
      let p = peekTable(
        k[0],
        res,
        meta,
        isTableArray ? 2 : 1
        /* Type.EXPLICIT */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      m = p[2];
      tbl = p[1];
      ptr = k[1];
    } else {
      let k = parseKey(toml, ptr);
      let p = peekTable(
        k[0],
        tbl,
        m,
        0
        /* Type.DOTTED */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      let v = extractValue(toml, k[1], void 0, maxDepth, integersAsBigInt);
      p[1][p[0]] = v[0];
      ptr = v[1];
    }
    ptr = skipVoid(toml, ptr, true);
    if (toml[ptr] && toml[ptr] !== "\n" && toml[ptr] !== "\r") {
      throw new TomlError("each key-value declaration must be followed by an end-of-line", {
        toml,
        ptr
      });
    }
    ptr = skipVoid(toml, ptr);
  }
  return res;
}

// plugins/awos/skills/ai-readiness-audit/cli.ts
import { readFileSync as readFileSync34, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as join34, dirname as dirname5 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// plugins/awos/skills/ai-readiness-audit/collectors/git.ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join as join2 } from "node:path";

// plugins/awos/skills/ai-readiness-audit/collectors/_base.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
function makeArtifact(source, available, reasonIfAbsent, period, raw) {
  return {
    source,
    available: Boolean(available),
    reason_if_absent: reasonIfAbsent,
    period: {
      bucket_days: period.bucket_days,
      lookback_days: period.lookback_days,
      history_available_days: period.history_available_days
    },
    raw
  };
}
function writeArtifact(artifact, outDir) {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${artifact.source}.json`);
  writeFileSync(path, JSON.stringify(artifact, null, 2));
  return path;
}

// plugins/awos/skills/ai-readiness-audit/collectors/git.ts
function run2(args2, cwd) {
  try {
    return execFileSync("git", args2, { cwd, encoding: "utf8" });
  } catch {
    return "";
  }
}
function parseDate(s) {
  return new Date(s.trim());
}
function daysBetween(d1, d2) {
  return Math.round((d2.getTime() - d1.getTime()) / 864e5);
}
function getDefaultBranch(cwd) {
  const out2 = run2(["symbolic-ref", "--short", "HEAD"], cwd).trim();
  return out2 || "main";
}
function getTotalCommits(cwd) {
  const out2 = run2(["rev-list", "--count", "HEAD"], cwd).trim();
  const n = parseInt(out2, 10);
  return isNaN(n) ? 0 : n;
}
function getAiMarkedCommits(cwd) {
  const patterns = [
    "Co-authored-by: Claude",
    "Co-authored-by:.*[Aa]ssistant",
    "Co-authored-by:.*claude@anthropic"
  ];
  const matchedSHAs = /* @__PURE__ */ new Set();
  for (const pat of patterns) {
    const out2 = run2(
      [
        "log",
        "--all-match",
        "--regexp-ignore-case",
        `--grep=${pat}`,
        "--format=%H"
      ],
      cwd
    );
    for (const sha of out2.trim().split("\n").filter(Boolean)) {
      matchedSHAs.add(sha);
    }
  }
  return matchedSHAs.size;
}
var TOOLING_CANDIDATES = [
  "CLAUDE.md",
  "AGENTS.md",
  ".claude/skills",
  ".claude/commands",
  ".claude/hooks",
  ".mcp.json"
];
function getToolingPaths(repoPath) {
  return TOOLING_CANDIDATES.filter((p) => existsSync(join2(repoPath, p)));
}
function getMergeStats(cwd) {
  const allMerges = run2(
    ["log", "--first-parent", "--merges", "--format=%H"],
    cwd
  ).trim().split("\n").filter(Boolean);
  const total_merges = allMerges.length;
  const revertOut = run2(
    [
      "log",
      "--first-parent",
      "--merges",
      "--grep=^Revert\\|hotfix\\|rollback",
      "--format=%H"
    ],
    cwd
  ).trim().split("\n").filter(Boolean);
  const revert_merges = revertOut.length;
  return { total_merges, revert_merges };
}
function getMergeRecords(cwd) {
  const mergeOut = run2(
    ["log", "--first-parent", "--merges", "--format=%H %cI"],
    cwd
  ).trim().split("\n").filter(Boolean);
  const records = [];
  for (const line of mergeOut) {
    const [sha, mergedAt] = line.split(" ");
    if (!sha || !mergedAt) continue;
    const sideOut = run2(["log", "--format=%cI", `${sha}^1..${sha}^2`], cwd).trim().split("\n").filter(Boolean);
    if (sideOut.length === 0) continue;
    const dates = sideOut.map((d) => new Date(d)).filter((d) => !isNaN(d.getTime()));
    if (dates.length === 0) continue;
    const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
    records.push({
      merged_at: mergedAt,
      branch_first_commit_at: earliest.toISOString()
    });
  }
  return records;
}
function buildMonthlyBuckets(cwd, period) {
  const latestDateStr = run2(
    ["log", "--all", "--format=%cI", "--max-count=1"],
    cwd
  ).trim();
  if (!latestDateStr) return [];
  const latestCommitDate = parseDate(latestDateStr);
  if (isNaN(latestCommitDate.getTime())) return [];
  const lookback = period.lookback_days;
  const since = new Date(
    latestCommitDate.getTime() - lookback * 864e5
  ).toISOString();
  const logOut = run2(
    ["log", "--all", `--since=${since}`, "--format=%H	%aN	%cI	%P"],
    cwd
  ).trim().split("\n").filter(Boolean);
  if (logOut.length === 0) return [];
  const rows = [];
  for (const line of logOut) {
    const parts2 = line.split("	");
    const [sha, author, dateStr, parents = ""] = parts2;
    if (!sha || !author || !dateStr) continue;
    const date = parseDate(dateStr);
    if (isNaN(date.getTime())) continue;
    rows.push({
      sha,
      author,
      date,
      isMerge: parents.trim().split(" ").length > 1
    });
  }
  if (rows.length === 0) return [];
  const newest = new Date(Math.max(...rows.map((r) => r.date.getTime())));
  const oldest = new Date(Math.min(...rows.map((r) => r.date.getTime())));
  const bucketMs = period.bucket_days * 864e5;
  const buckets = [];
  let bucketEnd = newest;
  while (bucketEnd >= oldest) {
    const bucketStart = new Date(bucketEnd.getTime() - bucketMs);
    const inBucket = rows.filter(
      (r) => r.date > bucketStart && r.date <= bucketEnd
    );
    if (inBucket.length > 0) {
      const authors = new Set(inBucket.map((r) => r.author)).size;
      buckets.push({
        bucket_start: bucketStart.toISOString(),
        authors,
        commits: inBucket.length,
        merges: inBucket.filter((r) => r.isMerge).length
      });
    }
    bucketEnd = bucketStart;
  }
  return buckets.reverse();
}
function getNumstatTotals(cwd) {
  const out2 = run2(["log", "--numstat", "--format="], cwd);
  let added = 0;
  let deleted = 0;
  for (const line of out2.split("\n")) {
    const m = line.match(/^(\d+)\s+(\d+)\s+/);
    if (m) {
      added += parseInt(m[1], 10);
      deleted += parseInt(m[2], 10);
    }
  }
  return { added, deleted };
}
function getHistoryAvailableDays(cwd) {
  const allDates = run2(["log", "--all", "--format=%cI"], cwd).trim().split("\n").filter(Boolean).map((s) => parseDate(s)).filter((d) => !isNaN(d.getTime()));
  if (allDates.length < 2) return 0;
  const ts = allDates.map((d) => d.getTime());
  const earliest = new Date(Math.min(...ts));
  const latest = new Date(Math.max(...ts));
  return Math.max(0, daysBetween(earliest, latest));
}
function collect(repoPath, period) {
  const default_branch = getDefaultBranch(repoPath);
  const total_commits = getTotalCommits(repoPath);
  const ai_marked_commits = getAiMarkedCommits(repoPath);
  const tooling_paths = getToolingPaths(repoPath);
  const { total_merges, revert_merges } = getMergeStats(repoPath);
  const merge_records = getMergeRecords(repoPath);
  const monthly_buckets = buildMonthlyBuckets(repoPath, period);
  const numstat_totals = getNumstatTotals(repoPath);
  const history_available_days = getHistoryAvailableDays(repoPath);
  const raw = {
    default_branch,
    total_commits,
    ai_marked_commits,
    total_merges,
    revert_merges,
    tooling_paths,
    merge_records,
    monthly_buckets,
    numstat_totals
  };
  return makeArtifact(
    "git",
    true,
    null,
    { ...period, history_available_days },
    raw
  );
}

// plugins/awos/skills/ai-readiness-audit/ci_platforms.ts
import { existsSync as existsSync2, readdirSync } from "node:fs";
import { join as join3 } from "node:path";
var CI_DIRS = [
  ".github/workflows",
  // GitHub Actions
  ".circleci",
  // CircleCI
  ".azure-pipelines",
  // Azure Pipelines / Azure DevOps
  ".buildkite",
  // Buildkite
  ".drone",
  // Drone (directory variant)
  ".teamcity"
  // TeamCity
];
var CI_FILES = [
  ".gitlab-ci.yml",
  // GitLab CI
  ".gitlab-ci.yaml",
  "Jenkinsfile",
  // Jenkins
  "azure-pipelines.yml",
  // Azure Pipelines (root-file convention)
  "azure-pipelines.yaml",
  ".travis.yml",
  // Travis CI
  ".travis.yaml",
  "bitbucket-pipelines.yml",
  // Bitbucket Pipelines
  "bitbucket-pipelines.yaml",
  ".drone.yml",
  // Drone (single-file variant)
  ".drone.yaml"
];
var CI_CONFIG_CANDIDATES = [...CI_DIRS, ...CI_FILES];
function detectCiConfigPath(repoPath) {
  for (const candidate of CI_CONFIG_CANDIDATES) {
    if (existsSync2(join3(repoPath, candidate))) return candidate;
  }
  const pipelines = join3(repoPath, "pipelines");
  try {
    if (existsSync2(pipelines) && readdirSync(pipelines).some(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml")
    )) {
      return "pipelines/";
    }
  } catch {
  }
  return null;
}
function isCiWorkflowPath(rel) {
  return CI_DIRS.some(
    (dir) => rel.startsWith(`${dir}/`) || rel.startsWith(`${dir}\\`)
  );
}

// plugins/awos/skills/ai-readiness-audit/collectors/ci.ts
function collect2(repoPath, period, connector) {
  const configPath = detectCiConfigPath(repoPath);
  const hasConfig = configPath !== null;
  const hasConnector = connector !== void 0 && connector !== null;
  if (!hasConfig && !hasConnector) {
    return makeArtifact(
      "ci",
      false,
      "no CI config (GitHub Actions, GitLab, Jenkins, CircleCI, Azure Pipelines, Buildkite, Drone, TeamCity, Travis, Bitbucket) or connector found",
      { ...period, history_available_days: period.history_available_days },
      {}
    );
  }
  const runs = connector?.runs ?? [];
  const raw = {
    config_detected: hasConfig,
    config_path: configPath,
    runs
  };
  return makeArtifact("ci", true, null, period, raw);
}

// plugins/awos/skills/ai-readiness-audit/collectors/tracker.ts
function buildTypeCounts(tickets) {
  const counts = {};
  for (const t of tickets) {
    const key = (t.type ?? "unknown").toLowerCase();
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
function countResolved(tickets) {
  return tickets.filter(
    (t) => t.status?.toLowerCase() === "done" || t.resolved_at != null
  ).length;
}
function collect3(_repoPath, period, connector) {
  if (connector === void 0 || connector === null) {
    return makeArtifact(
      "tracker",
      false,
      "no tracker connector provided; supply a Jira/Linear/GitHub Issues connector to enable work-mix and throughput metrics",
      { ...period, history_available_days: period.history_available_days },
      {}
    );
  }
  const tickets = connector.tickets ?? [];
  const incident_source = connector.incident_source ?? null;
  const raw = {
    tickets,
    type_counts: buildTypeCounts(tickets),
    resolved_count: countResolved(tickets),
    incident_source
  };
  return makeArtifact("tracker", true, null, period, raw);
}

// plugins/awos/skills/ai-readiness-audit/collectors/docs.ts
function countRecentlyUpdated(pages, lookbackDays) {
  const cutoff = new Date(Date.now() - lookbackDays * 864e5);
  return pages.filter((p) => {
    if (!p.updated_at) return false;
    const d = new Date(p.updated_at);
    return !isNaN(d.getTime()) && d >= cutoff;
  }).length;
}
function collect4(_repoPath, period, connector) {
  if (connector === void 0 || connector === null) {
    return makeArtifact(
      "docs",
      false,
      "no docs connector provided; supply a Confluence/Notion/GitBook connector to enable documentation coverage metrics",
      { ...period, history_available_days: period.history_available_days },
      {}
    );
  }
  const pages = connector.pages ?? [];
  const recently_updated_count = countRecentlyUpdated(
    pages,
    period.lookback_days
  );
  const raw = {
    pages,
    page_count: pages.length,
    recently_updated_count
  };
  return makeArtifact("docs", true, null, period, raw);
}

// plugins/awos/skills/ai-readiness-audit/detectors/_base.ts
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { execFileSync as execFileSync2 } from "node:child_process";
var VALID_STATUS = /* @__PURE__ */ new Set(["PASS", "WARN", "FAIL", "SKIP"]);
var DEFAULT_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  ".next",
  "target"
];
function makeResult(status, value, evidence, method = "detected") {
  if (!VALID_STATUS.has(status)) {
    throw new Error(
      `status must be one of ${[...VALID_STATUS].sort()}, got ${status}`
    );
  }
  return { status, value, evidence: [...evidence], method };
}
function iterFiles(repoPath, globs, ignore = DEFAULT_IGNORE) {
  const pruneArgs = ignore.flatMap((d) => ["-name", d, "-prune", "-o"]);
  const nameArgs = globs.flatMap((g, i2) => {
    const bare = g.replace(/^\*\*\//, "");
    return i2 === 0 ? ["-name", bare] : ["-o", "-name", bare];
  });
  const out2 = execFileSync2(
    "find",
    [repoPath, ...pruneArgs, "(", ...nameArgs, ")", "-type", "f", "-print"],
    { encoding: "utf8" }
  );
  return out2.split("\n").filter(Boolean).sort();
}
function grep(repoPath, pattern, globs, flags2 = "") {
  const hits = [];
  const rx = new RegExp(pattern.source, pattern.flags || flags2);
  for (const p of iterFiles(repoPath, globs)) {
    let text;
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    text.split("\n").forEach((line, i2) => {
      if (rx.test(line))
        hits.push({
          file: relative(repoPath, p),
          line: i2 + 1,
          text: line.trim()
        });
    });
  }
  return hits.sort(
    (a, b) => a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1
  );
}

// plugins/awos/skills/ai-readiness-audit/detectors/software_best_practices.ts
import { basename, relative as relative2 } from "node:path";
import { readFileSync as readFileSync2 } from "node:fs";
var LINTER_CONFIGS = [
  // JavaScript / TypeScript
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.yaml",
  ".eslintrc.yml",
  ".eslintrc.json",
  "tslint.json",
  // Python
  ".flake8",
  ".pylintrc",
  "pylintrc",
  // Ruby
  ".rubocop.yml",
  // Go
  ".golangci.yml",
  ".golangci.yaml",
  ".golangci.toml"
];
var PYPROJECT_LINTER_RX = /^\[tool\.(ruff|pylint|flake8)\]/m;
function detectLinting(repoPath, _params) {
  const found = iterFiles(repoPath, LINTER_CONFIGS).map((p) => basename(p));
  if (found.length) {
    const uniq = [...new Set(found)].sort();
    return makeResult(
      "PASS",
      uniq.length,
      uniq.map((n) => `linter config found: ${n}`)
    );
  }
  const pyprojects = iterFiles(repoPath, ["pyproject.toml"]);
  for (const p of pyprojects) {
    try {
      const content = readFileSync2(p, "utf8");
      if (PYPROJECT_LINTER_RX.test(content)) {
        return makeResult("PASS", 1, [
          `linter config found in ${relative2(repoPath, p)} ([tool.ruff] or [tool.pylint])`
        ]);
      }
    } catch {
    }
  }
  return makeResult("FAIL", 0, ["no linter configuration found"]);
}
var FORMATTER_CONFIGS = [
  // Prettier
  ".prettierrc",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  ".prettierrc.json",
  ".prettierrc.json5",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  ".prettierrc.toml",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
  "prettier.config.ts",
  // Rust
  "rustfmt.toml",
  ".rustfmt.toml"
];
var PYPROJECT_FORMATTER_RX = /^\[tool\.(black|ruff\.format)\]/m;
var PRECOMMIT_FORMATTER_RX = /\b(prettier|black|ruff|gofmt|rustfmt|clang-format|autopep8|isort)\b/;
function detectFormatting(repoPath, _params) {
  const found = iterFiles(repoPath, FORMATTER_CONFIGS).map((p) => basename(p));
  if (found.length) {
    const uniq = [...new Set(found)].sort();
    return makeResult(
      "PASS",
      uniq.length,
      uniq.map((n) => `formatter config found: ${n}`)
    );
  }
  const pyprojects = iterFiles(repoPath, ["pyproject.toml"]);
  for (const p of pyprojects) {
    try {
      const content = readFileSync2(p, "utf8");
      if (PYPROJECT_FORMATTER_RX.test(content)) {
        return makeResult("PASS", 1, [
          `formatter config found in ${relative2(repoPath, p)} ([tool.black] or [tool.ruff.format])`
        ]);
      }
    } catch {
    }
  }
  const precommit = iterFiles(repoPath, [".pre-commit-config.yaml"]);
  for (const p of precommit) {
    try {
      const content = readFileSync2(p, "utf8");
      if (PRECOMMIT_FORMATTER_RX.test(content)) {
        return makeResult("PASS", 1, [
          `formatting hook found in ${relative2(repoPath, p)}`
        ]);
      }
    } catch {
    }
  }
  return makeResult("FAIL", 0, ["no formatter configuration found"]);
}
var TYPE_SAFETY_CONFIGS = [
  "mypy.ini",
  ".mypy.ini",
  "pyrightconfig.json",
  "sorbet"
];
var TSCONFIG_STRICT_RX = /"strict"\s*:\s*true|"noImplicitAny"\s*:\s*true/;
var PY_DEF_RX = /^\s*(?:async\s+)?def\s+\w+\s*\(/;
var PY_DEF_ANNOTATED_RX = /^\s*(?:async\s+)?def\s+\w+\s*\(.*\)\s*->/;
function samplePythonAnnotationRatio(repoPath) {
  const pyFiles = iterFiles(repoPath, ["*.py"]).slice(0, 20);
  if (pyFiles.length === 0) return null;
  let totalDefs = 0;
  let annotatedDefs = 0;
  for (const f of pyFiles) {
    try {
      const lines = readFileSync2(f, "utf8").split("\n");
      for (const line of lines) {
        if (PY_DEF_RX.test(line)) {
          totalDefs++;
          if (PY_DEF_ANNOTATED_RX.test(line)) annotatedDefs++;
        }
      }
    } catch {
    }
  }
  if (totalDefs === 0) return null;
  return annotatedDefs / totalDefs;
}
function detectTypeSafety(repoPath, _params) {
  const pyTyping = iterFiles(repoPath, TYPE_SAFETY_CONFIGS);
  if (pyTyping.length) {
    const names = pyTyping.map((p) => basename(p)).sort();
    return makeResult(
      "PASS",
      names.length,
      names.map((n) => `type-safety config found: ${n}`)
    );
  }
  const pyprojects = iterFiles(repoPath, ["pyproject.toml"]);
  for (const p of pyprojects) {
    try {
      const content = readFileSync2(p, "utf8");
      if (/^\[tool\.mypy\]/m.test(content)) {
        return makeResult("PASS", 1, [
          `type-safety config found in ${relative2(repoPath, p)} ([tool.mypy])`
        ]);
      }
    } catch {
    }
  }
  const pyTypedFiles = iterFiles(repoPath, ["py.typed"]);
  if (pyTypedFiles.length) {
    return makeResult("PASS", pyTypedFiles.length, [
      `py.typed marker found (PEP 561 typed package): ${pyTypedFiles.map((p) => relative2(repoPath, p)).join(", ")}`
    ]);
  }
  const tsconfigs = iterFiles(repoPath, ["tsconfig.json", "tsconfig.*.json"]);
  if (tsconfigs.length) {
    const strictConfigs = [];
    for (const p of tsconfigs) {
      try {
        const content = readFileSync2(p, "utf8");
        if (TSCONFIG_STRICT_RX.test(content)) {
          strictConfigs.push(relative2(repoPath, p));
        }
      } catch {
      }
    }
    if (strictConfigs.length) {
      return makeResult(
        "PASS",
        strictConfigs.length,
        strictConfigs.map((n) => `strict TypeScript config: ${n}`)
      );
    }
    return makeResult("WARN", 0, [
      `tsconfig.json found but strict / noImplicitAny not enabled (${tsconfigs.map((p) => relative2(repoPath, p)).join(", ")})`
    ]);
  }
  const ratio = samplePythonAnnotationRatio(repoPath);
  if (ratio !== null) {
    const pct2 = Math.round(ratio * 100);
    if (ratio >= 0.6) {
      return makeResult("PASS", pct2, [
        `${pct2}% of Python function signatures carry return-type annotations (no mypy/pyright config, but well-typed)`
      ]);
    }
    if (ratio >= 0.25) {
      return makeResult("WARN", pct2, [
        `${pct2}% of Python function signatures carry return-type annotations \u2014 some typing present but not enforced by a type checker`
      ]);
    }
    return makeResult("FAIL", pct2, [
      `${pct2}% of Python function signatures carry return-type annotations \u2014 project appears essentially untyped`
    ]);
  }
  return makeResult("FAIL", 0, ["no type-safety configuration found"]);
}
var CICD_SUBDIR_FILENAMES = ["*.yml", "*.yaml"];
function detectCiCd(repoPath, _params) {
  const found = iterFiles(repoPath, CI_FILES);
  if (found.length) {
    const names = [...new Set(found.map((p) => relative2(repoPath, p)))].sort();
    return makeResult(
      "PASS",
      names.length,
      names.map((n) => `CI/CD config found: ${n}`)
    );
  }
  const yamlFiles = iterFiles(repoPath, CICD_SUBDIR_FILENAMES);
  const ciFiles = yamlFiles.filter((p) => {
    const rel = relative2(repoPath, p);
    return isCiWorkflowPath(rel) || rel.startsWith("pipelines/") || rel.startsWith("pipelines\\");
  });
  if (ciFiles.length) {
    const names = ciFiles.map((p) => relative2(repoPath, p)).sort();
    return makeResult(
      "PASS",
      names.length,
      names.map((n) => `CI/CD workflow found: ${n}`)
    );
  }
  return makeResult("FAIL", 0, ["no CI/CD pipeline configuration found"]);
}
var PY2_EXCEPT = /except\s+[A-Za-z_][\w.]*(\s*,\s*[A-Za-z_][\w.]*)+\s*:/;
function detectExceptClauseDefect(repoPath, _params) {
  const hits = grep(repoPath, PY2_EXCEPT, ["**/*.py"]);
  const realHits = hits.filter((h) => !/^\s*#/.test(h.text));
  if (realHits.length) {
    const ev = realHits.map((h) => `${h.file}:${h.line} ${h.text}`);
    return makeResult("FAIL", realHits.length, ev);
  }
  return makeResult("PASS", 0, ["no Python-2 except-clause syntax found"]);
}
var LOCKFILES = [
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "gradle.lockfile",
  "poetry.lock",
  "uv.lock",
  "Cargo.lock",
  "go.sum"
];
function detectLockfiles(repoPath, _params) {
  const found = iterFiles(repoPath, LOCKFILES).map((p) => basename(p));
  if (found.length) {
    const uniq = [...new Set(found)].sort();
    return makeResult(
      "PASS",
      uniq.length,
      uniq.map((n) => `lock file present: ${n}`)
    );
  }
  return makeResult("FAIL", 0, ["no dependency lock file found"]);
}
var HANDLED_RX = /\b(log|logger|logging|print|console\.(log|warn|error|debug)|raise|throw|re-?raise|return|traceback|sys\.exit|abort|panic)\b/i;
var EXCEPT_OPENER_RX = /^\s*(except\b|catch\s*\(|catch\s*$)/;
var EMPTY_BODY_RX = /^\s*(pass|}\s*$|{\s*}\s*)$/;
function analyseFile(repoPath, filePath) {
  let src;
  try {
    src = readFileSync2(filePath, "utf8");
  } catch {
    return [];
  }
  const lines = src.split("\n");
  const samples = [];
  const rel = relative2(repoPath, filePath);
  for (let i2 = 0; i2 < lines.length; i2++) {
    if (!EXCEPT_OPENER_RX.test(lines[i2])) continue;
    const body2 = lines.slice(i2 + 1, i2 + 5).join("\n");
    const isEmptyFirst = lines[i2 + 1] !== void 0 && EMPTY_BODY_RX.test(lines[i2 + 1]);
    const hasHandled = HANDLED_RX.test(body2);
    const bad = isEmptyFirst || !hasHandled;
    samples.push({ file: rel, line: i2 + 1, bad });
  }
  return samples;
}
var SOURCE_GLOBS = [
  "*.py",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.java",
  "*.kt"
];
function detectErrorHandling(repoPath, _params) {
  const files = iterFiles(repoPath, SOURCE_GLOBS);
  const allSamples = files.flatMap(
    (f) => analyseFile(repoPath, f)
  );
  if (allSamples.length === 0) {
    return makeResult("PASS", 0, [
      "no catch/except blocks found \u2014 nothing to assess"
    ]);
  }
  const badSamples = allSamples.filter((s) => s.bad);
  const badRatio = badSamples.length / allSamples.length;
  const evidence = badSamples.slice(0, 10).map((s) => `${s.file}:${s.line} empty or unhandled catch/except block`);
  if (badRatio >= 0.5) {
    return makeResult("FAIL", badSamples.length, [
      `${badSamples.length}/${allSamples.length} catch/except blocks are empty or unhandled (${Math.round(badRatio * 100)}%)`,
      ...evidence
    ]);
  }
  if (badRatio >= 0.1) {
    return makeResult("WARN", badSamples.length, [
      `${badSamples.length}/${allSamples.length} catch/except blocks are empty or unhandled (${Math.round(badRatio * 100)}%) \u2014 mixed patterns`,
      ...evidence
    ]);
  }
  return makeResult("PASS", allSamples.length - badSamples.length, [
    `${allSamples.length - badSamples.length}/${allSamples.length} catch/except blocks are properly handled`
  ]);
}
var DETECTORS = {
  2700: detectLinting,
  // SBP-01 linting configured
  2701: detectFormatting,
  // SBP-02 formatting automated
  2702: detectTypeSafety,
  // SBP-03 type safety enforced
  2703: detectCiCd,
  // SBP-05 CI/CD pipeline exists
  2704: detectErrorHandling,
  // SBP-06 error-handling consistency
  2705: detectLockfiles,
  // SBP-07 dependency lockfiles
  2706: detectExceptClauseDefect
  // SBP-06 sibling: Python-2 except-clause syntax
};

// plugins/awos/skills/ai-readiness-audit/detectors/code_architecture.ts
import { readFileSync as readFileSync3 } from "node:fs";
import { basename as basename2, dirname, relative as relative3 } from "node:path";
import { execFileSync as execFileSync3 } from "node:child_process";
var ARCH_DOC_PATTERNS = [
  "ARCHITECTURE.md",
  "ARCHITECTURE.rst",
  "architecture.md",
  "architecture.rst"
];
var LAYERED_DIRS = [
  "routes",
  "controllers",
  "handlers",
  "services",
  "repositories",
  "models",
  "domain",
  "infra",
  "infrastructure",
  "application",
  "api",
  "lib",
  "core",
  "adapters",
  "ports",
  "usecases"
];
function detectArchPattern(repoPath, _params) {
  const archDocs = iterFiles(repoPath, ARCH_DOC_PATTERNS);
  if (archDocs.length > 0) {
    const found = archDocs.map((p) => relative3(repoPath, p));
    return makeResult("PASS", archDocs.length, [
      `architecture documentation found: ${found.join(", ")}`
    ]);
  }
  let out2;
  try {
    out2 = execFileSync3(
      "find",
      [repoPath, "-maxdepth", "3", "-type", "d", "-print"],
      { encoding: "utf8" }
    );
  } catch {
    out2 = "";
  }
  const dirs = out2.split("\n").filter(Boolean).map((d) => basename2(d).toLowerCase());
  const layeredMatches = LAYERED_DIRS.filter((layer) => dirs.includes(layer));
  if (layeredMatches.length >= 3) {
    return makeResult("WARN", layeredMatches.length, [
      `recognizable layered directory structure detected (${layeredMatches.length} canonical dirs: ${layeredMatches.join(", ")}) but no explicit architecture document`
    ]);
  }
  return makeResult("FAIL", 0, [
    "no architecture documentation or recognizable layered directory structure found"
  ]);
}
var LAYER_TIERS = {
  models: 0,
  model: 0,
  domain: 0,
  entities: 0,
  entity: 0,
  repositories: 1,
  repository: 1,
  repos: 1,
  repo: 1,
  services: 2,
  service: 2,
  usecases: 2,
  usecase: 2,
  controllers: 3,
  controller: 3,
  handlers: 4,
  handler: 4,
  routes: 5,
  route: 5,
  api: 5
};
var IMPORT_RX = /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)|from\s+([^\s]+)\s+import)/;
var SOURCE_GLOBS2 = ["*.ts", "*.tsx", "*.js", "*.jsx", "*.py"];
function getLayerTier(dir) {
  const lower = dir.toLowerCase();
  for (const [key, tier] of Object.entries(LAYER_TIERS)) {
    if (lower === key) return tier;
  }
  for (const [key, tier] of Object.entries(LAYER_TIERS)) {
    if (lower.startsWith(key)) return tier;
  }
  return void 0;
}
function detectImportGraph(repoPath, _params) {
  const files = iterFiles(repoPath, SOURCE_GLOBS2);
  if (files.length === 0) {
    return makeResult("PASS", 0, [
      "no source files found \u2014 no import violations possible"
    ]);
  }
  const violations = [];
  for (const filePath of files) {
    const relPath = relative3(repoPath, filePath);
    const fileDir = basename2(dirname(relPath)).toLowerCase();
    const sourceTier = getLayerTier(fileDir);
    if (sourceTier === void 0) continue;
    let src;
    try {
      src = readFileSync3(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = src.split("\n");
    for (let i2 = 0; i2 < lines.length; i2++) {
      const line = lines[i2];
      const m = IMPORT_RX.exec(line);
      if (!m) continue;
      const importPath = (m[1] || m[2] || m[3] || "").trim();
      if (!importPath) continue;
      const parts2 = importPath.replace(/^(?:\.\.\/)+/, "").replace(/^\.\//, "").split("/");
      const targetDir = parts2[0].toLowerCase();
      const targetTier = getLayerTier(targetDir);
      if (targetTier !== void 0 && targetTier > sourceTier) {
        violations.push({
          file: relPath,
          line: i2 + 1,
          importPath,
          sourceLayer: fileDir,
          targetLayer: targetDir
        });
      }
    }
  }
  if (violations.length === 0) {
    return makeResult("PASS", 0, ["no import layer violations detected"]);
  }
  const evidence = violations.slice(0, 10).map(
    (v) => `${v.file}:${v.line} layer violation: ${v.sourceLayer}/ imports from ${v.targetLayer}/ (${v.importPath})`
  );
  return makeResult("FAIL", violations.length, [
    `${violations.length} import layer violation(s) detected`,
    ...evidence
  ]);
}
var PRESENTATION_DIRS = [
  "routes",
  "route",
  "controllers",
  "controller",
  "handlers",
  "handler",
  "views",
  "view",
  "templates",
  "template",
  "pages",
  "page"
];
var DATA_ACCESS_RX = /\b(?:db|conn|cursor|session|repository|repo)\s*\.\s*(?:query|execute|find|findOne|findAll|filter|get|update|delete|insert|save|add|commit|remove|all|fetchone|fetchall|fetch_one|fetch_all|run)\s*\(/i;
var ORM_STATIC_RX = /\b\w+\s*\.\s*(?:objects\s*\.\s*(?:filter|get|all|exclude|create|update|delete)\s*\(|find(?:One|All|By\w+)\s*\()/i;
var RAW_SQL_RX = /(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP)\s+\w+/i;
function countDataAccessCalls(content) {
  const lines = content.split("\n");
  let count = 0;
  for (const line of lines) {
    if (/^\s*(?:#|\/\/|\/\*)/.test(line)) continue;
    if (DATA_ACCESS_RX.test(line) || ORM_STATIC_RX.test(line) || RAW_SQL_RX.test(line)) {
      count++;
    }
  }
  return count;
}
function detectSeparationOfConcerns(repoPath, _params) {
  const files = iterFiles(repoPath, SOURCE_GLOBS2);
  const presentationFiles = files.filter((f) => {
    const dir = basename2(dirname(relative3(repoPath, f))).toLowerCase();
    return PRESENTATION_DIRS.some((pd) => dir === pd || dir.startsWith(pd));
  });
  if (presentationFiles.length === 0) {
    return makeResult("PASS", 0, [
      "no route/controller/handler files found \u2014 separation of concerns not checkable"
    ]);
  }
  const failFiles = [];
  const warnFiles = [];
  for (const filePath of presentationFiles) {
    const relPath = relative3(repoPath, filePath);
    let content;
    try {
      content = readFileSync3(filePath, "utf8");
    } catch {
      continue;
    }
    const count = countDataAccessCalls(content);
    if (count >= 3) {
      failFiles.push({ file: relPath, count });
    } else if (count >= 1) {
      warnFiles.push({ file: relPath, count });
    }
  }
  if (failFiles.length > 0) {
    const evidence = failFiles.map(
      (f) => `${f.file}: ${f.count} inline data-access call(s) in presentation layer`
    );
    return makeResult("FAIL", failFiles.length, [
      `${failFiles.length} presentation-layer file(s) have >= 3 inline data-access calls`,
      ...evidence
    ]);
  }
  if (warnFiles.length > 0) {
    const evidence = warnFiles.map(
      (f) => `${f.file}: ${f.count} inline data-access call(s) in presentation layer`
    );
    return makeResult("WARN", warnFiles.length, [
      `${warnFiles.length} presentation-layer file(s) have 1-2 inline data-access calls`,
      ...evidence
    ]);
  }
  return makeResult("PASS", presentationFiles.length, [
    `${presentationFiles.length} presentation-layer file(s) checked \u2014 no inline data-access calls found`
  ]);
}
function classifyName(name2) {
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name2)) return "snake_case";
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name2)) return "kebab-case";
  if (/^[A-Z][A-Za-z0-9]*$/.test(name2)) return "PascalCase";
  if (/^[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*$/.test(name2)) return "camelCase";
  return "other";
}
var NAMING_SOURCE_GLOBS = [
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.py",
  "*.java",
  "*.kt",
  "*.go",
  "*.rb"
];
function detectNamingConventions(repoPath, _params) {
  const files = iterFiles(repoPath, NAMING_SOURCE_GLOBS);
  const relevantFiles = files.filter((f) => {
    const base = basename2(f).replace(/\.[^.]+$/, "");
    return !["index", "__init__", "main", "app", "setup", "config"].includes(
      base
    );
  });
  if (relevantFiles.length === 0) {
    return makeResult("PASS", 0, [
      "no source files found \u2014 naming convention check skipped"
    ]);
  }
  const counts = {
    snake_case: 0,
    "kebab-case": 0,
    camelCase: 0,
    PascalCase: 0,
    other: 0
  };
  for (const f of relevantFiles) {
    const base = basename2(f).replace(/\.[^.]+$/, "");
    counts[classifyName(base)]++;
  }
  const total = relevantFiles.length;
  const conventions = [
    "snake_case",
    "kebab-case",
    "camelCase",
    "PascalCase"
  ];
  const dominant = conventions.reduce(
    (best, c) => counts[c] > counts[best] ? c : best,
    conventions[0]
  );
  const dominantCount = counts[dominant];
  const ratio = dominantCount / total;
  const evidence = [
    `dominant convention: ${dominant} (${dominantCount}/${total} = ${Math.round(ratio * 100)}%)`,
    ...conventions.filter((c) => counts[c] > 0).map((c) => `  ${c}: ${counts[c]} file(s)`)
  ];
  if (ratio >= 0.9) {
    return makeResult("PASS", ratio, evidence);
  }
  if (ratio >= 0.7) {
    return makeResult("WARN", ratio, [
      `inconsistent file naming: dominant convention ${dominant} at ${Math.round(ratio * 100)}% (below 90% threshold)`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", ratio, [
    `inconsistent file naming: dominant convention ${dominant} at only ${Math.round(ratio * 100)}% (below 70% threshold)`,
    ...evidence
  ]);
}
var FILE_SIZE_GLOBS = [
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.py",
  "*.java",
  "*.kt",
  "*.go",
  "*.rb",
  "*.cs"
];
var LOC_THRESHOLD = 300;
function countLines(filePath) {
  try {
    const content = readFileSync3(filePath, "utf8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}
function detectFileSizes(repoPath, _params) {
  const files = iterFiles(repoPath, FILE_SIZE_GLOBS);
  if (files.length === 0) {
    return makeResult(
      "PASS",
      0,
      ["no source files found \u2014 file-size check skipped"],
      "computed"
    );
  }
  const oversized = [];
  for (const filePath of files) {
    const lines = countLines(filePath);
    if (lines > LOC_THRESHOLD) {
      oversized.push({ file: relative3(repoPath, filePath), lines });
    }
  }
  const total = files.length;
  const ratio = Math.round(oversized.length / total * 1e10) / 1e10;
  const evidence = [
    `${oversized.length}/${total} source files exceed ${LOC_THRESHOLD} lines`,
    ...oversized.slice(0, 10).map((f) => `${f.file}: ${f.lines} lines`)
  ];
  if (ratio > 0.3) {
    return makeResult(
      "FAIL",
      ratio,
      [
        `${Math.round(ratio * 100)}% of source files exceed ${LOC_THRESHOLD} lines (threshold: 30%)`,
        ...evidence
      ],
      "computed"
    );
  }
  if (ratio > 0.1) {
    return makeResult(
      "WARN",
      ratio,
      [
        `${Math.round(ratio * 100)}% of source files exceed ${LOC_THRESHOLD} lines (threshold: 10%)`,
        ...evidence
      ],
      "computed"
    );
  }
  return makeResult(
    "PASS",
    ratio,
    [
      `${Math.round(ratio * 100)}% of source files exceed ${LOC_THRESHOLD} lines \u2014 within threshold`,
      ...evidence
    ],
    "computed"
  );
}
var DETECTORS2 = {
  2100: detectArchPattern,
  // ARCH-01 declared/recognizable pattern
  2101: detectImportGraph,
  // ARCH-02 import direction / no tangled cross-imports
  // 2102 intentionally omitted — ARCH-03 is method=judgment
  2103: detectSeparationOfConcerns,
  // ARCH-04 separation of concerns
  2104: detectNamingConventions,
  // ARCH-05 consistent naming conventions
  2105: detectFileSizes
  // ARCH-06 file sizes (computed)
};

// plugins/awos/skills/ai-readiness-audit/detectors/spec_driven_development.ts
import { readFileSync as readFileSync4, existsSync as existsSync3, readdirSync as readdirSync2, statSync } from "node:fs";
import { join as join5, relative as relative4 } from "node:path";
import { execFileSync as execFileSync4 } from "node:child_process";
function detectAwosInstalled(repoPath, _params) {
  const hasAwos = existsSync3(join5(repoPath, ".awos"));
  const hasContext = existsSync3(join5(repoPath, "context"));
  if (hasAwos && hasContext) {
    return makeResult("PASS", 2, [
      ".awos/ directory present \u2014 AWOS framework installed",
      "context/ directory present \u2014 spec workspace initialised"
    ]);
  }
  if (hasAwos) {
    return makeResult("WARN", 1, [
      ".awos/ directory present but context/ is missing \u2014 AWOS installed but workspace not initialised"
    ]);
  }
  if (hasContext) {
    return makeResult("WARN", 1, [
      "context/ directory present but .awos/ is missing \u2014 workspace exists but AWOS framework not installed"
    ]);
  }
  return makeResult("FAIL", 0, [
    "neither .awos/ nor context/ found \u2014 AWOS framework is not installed"
  ]);
}
var MIN_SUBSTANTIVE_LINES = 5;
function isSubstantive(filePath) {
  try {
    const content = readFileSync4(filePath, "utf8");
    const nonBlankLines = content.split("\n").filter((l) => l.trim().length > 0);
    return nonBlankLines.length > MIN_SUBSTANTIVE_LINES;
  } catch {
    return false;
  }
}
var FOUNDATIONAL_DOC_CANDIDATES = [
  ["context/product/product-definition.md"],
  ["context/product/roadmap.md"],
  ["context/architecture/architecture.md", "context/product/architecture.md"]
];
function detectProductContextDocs(repoPath, _params) {
  const found = [];
  const missing = [];
  for (const candidates of FOUNDATIONAL_DOC_CANDIDATES) {
    let matched = false;
    for (const candidate of candidates) {
      const fullPath = join5(repoPath, candidate);
      if (existsSync3(fullPath) && isSubstantive(fullPath)) {
        found.push(candidate);
        matched = true;
        break;
      }
    }
    if (!matched) {
      missing.push(candidates[0]);
    }
  }
  const count = found.length;
  const evidence = [
    ...found.map((f) => `present and substantive: ${f}`),
    ...missing.map((m) => `missing or trivial: ${m}`)
  ];
  if (count === 3) {
    return makeResult("PASS", count, [
      "all 3 foundational AWOS documents present with substantive content",
      ...evidence
    ]);
  }
  if (count === 2) {
    return makeResult("WARN", count, [
      "2 of 3 foundational AWOS documents present",
      ...evidence
    ]);
  }
  return makeResult("FAIL", count, [
    `only ${count} of 3 foundational AWOS documents present`,
    ...evidence
  ]);
}
var TECH_SIGNALS = [
  {
    name: "typescript",
    detect: (r) => iterFiles(r, ["*.ts", "*.tsx", "tsconfig.json"]).length > 0
  },
  {
    name: "python",
    detect: (r) => iterFiles(r, ["*.py"]).length > 0
  },
  {
    name: "django",
    detect: (r) => iterFiles(r, ["manage.py", "settings.py", "urls.py"]).length > 0
  },
  {
    name: "react",
    detect: (r) => iterFiles(r, ["*.tsx", "*.jsx"]).length > 0 || (() => {
      const pkg = join5(r, "package.json");
      if (!existsSync3(pkg)) return false;
      try {
        return readFileSync4(pkg, "utf8").includes('"react"');
      } catch {
        return false;
      }
    })()
  },
  {
    name: "node",
    detect: (r) => existsSync3(join5(r, "package.json")) || iterFiles(r, ["*.js"]).length > 0
  },
  {
    name: "javascript",
    detect: (r) => iterFiles(r, ["*.js", "*.jsx"]).length > 0
  },
  {
    name: "postgresql",
    detect: (r) => iterFiles(r, ["*.sql"]).length > 0 || (() => {
      try {
        const out2 = execFileSync4(
          "grep",
          [
            "-rl",
            "--include=*.py",
            "--include=*.ts",
            "--include=*.js",
            "psycopg2",
            r
          ],
          { encoding: "utf8" }
        );
        return out2.trim().length > 0;
      } catch {
        return false;
      }
    })()
  },
  {
    name: "postgres",
    detect: (r) => iterFiles(r, ["*.sql"]).length > 0 || (() => {
      try {
        const out2 = execFileSync4(
          "grep",
          [
            "-rl",
            "--include=*.py",
            "--include=*.ts",
            "--include=*.js",
            "psycopg",
            r
          ],
          { encoding: "utf8" }
        );
        return out2.trim().length > 0;
      } catch {
        return false;
      }
    })()
  },
  {
    name: "go",
    detect: (r) => iterFiles(r, ["*.go", "go.mod"]).length > 0
  },
  {
    name: "java",
    detect: (r) => iterFiles(r, ["*.java"]).length > 0
  },
  {
    name: "docker",
    detect: (r) => iterFiles(r, ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"]).length > 0
  },
  {
    name: "terraform",
    detect: (r) => iterFiles(r, ["*.tf"]).length > 0
  },
  {
    name: "cloudformation",
    detect: (r) => {
      if (iterFiles(r, ["*.template.yaml", "*.template.yml", "*.template.json"]).length > 0)
        return true;
      try {
        return execFileSync4(
          "grep",
          [
            "-rl",
            "--include=*.yaml",
            "--include=*.yml",
            "--include=*.json",
            "AWSTemplateFormatVersion",
            r
          ],
          { encoding: "utf8" }
        ).trim().length > 0;
      } catch {
        return false;
      }
    }
  },
  { name: "bicep", detect: (r) => iterFiles(r, ["*.bicep"]).length > 0 },
  {
    name: "arm",
    detect: (r) => iterFiles(r, ["azuredeploy.json", "azuredeploy.parameters.json"]).length > 0
  },
  {
    name: "pulumi",
    detect: (r) => iterFiles(r, ["Pulumi.yaml", "Pulumi.yml"]).length > 0
  },
  { name: "cdk", detect: (r) => iterFiles(r, ["cdk.json"]).length > 0 },
  {
    name: "ansible",
    detect: (r) => iterFiles(r, ["ansible.cfg", "playbook.yml", "playbook.yaml", "site.yml"]).length > 0
  },
  {
    name: "kustomize",
    detect: (r) => iterFiles(r, ["kustomization.yaml", "kustomization.yml"]).length > 0
  },
  {
    name: "serverless",
    detect: (r) => iterFiles(r, ["serverless.yml", "serverless.yaml"]).length > 0
  },
  { name: "helm", detect: (r) => iterFiles(r, ["Chart.yaml"]).length > 0 },
  {
    name: "kubernetes",
    detect: (r) => {
      try {
        const out2 = execFileSync4(
          "grep",
          ["-rl", "--include=*.yaml", "--include=*.yml", "apiVersion:", r],
          { encoding: "utf8" }
        );
        return out2.trim().length > 0;
      } catch {
        return false;
      }
    }
  }
];
function findArchDoc(repoPath) {
  for (const candidate of [
    join5(repoPath, "context", "architecture", "architecture.md"),
    join5(repoPath, "context", "product", "architecture.md"),
    join5(repoPath, "ARCHITECTURE.md")
  ]) {
    if (existsSync3(candidate)) return candidate;
  }
  return null;
}
function detectArchTechMatch(repoPath, _params) {
  const archDoc = findArchDoc(repoPath);
  if (!archDoc) {
    return makeResult("PASS", 0, [
      "no architecture document found \u2014 tech-match check skipped"
    ]);
  }
  let content;
  try {
    content = readFileSync4(archDoc, "utf8").toLowerCase();
  } catch {
    return makeResult("PASS", 0, ["could not read architecture document"]);
  }
  const unverified = [];
  const verified = [];
  for (const signal of TECH_SIGNALS) {
    if (!content.includes(signal.name.toLowerCase())) continue;
    if (signal.detect(repoPath)) {
      verified.push(signal.name);
    } else {
      unverified.push(signal.name);
    }
  }
  const evidence = [
    `architecture document: ${relative4(repoPath, archDoc)}`,
    ...verified.map((t) => `verified in codebase: ${t}`),
    ...unverified.map((t) => `mentioned but not evidenced in codebase: ${t}`)
  ];
  if (unverified.length >= 3) {
    return makeResult("FAIL", unverified.length, [
      `${unverified.length} technology mention(s) in architecture doc not evidenced in codebase`,
      ...evidence
    ]);
  }
  if (unverified.length >= 1) {
    return makeResult("WARN", unverified.length, [
      `${unverified.length} technology mention(s) in architecture doc not evidenced in codebase`,
      ...evidence
    ]);
  }
  return makeResult("PASS", 0, [
    "all technology mentions in architecture doc are evidenced in the codebase",
    ...evidence
  ]);
}
var TRUNK_BRANCHES = /* @__PURE__ */ new Set(["main", "master", "develop", "development"]);
function detectTrunk(repoPath) {
  for (const candidate of ["main", "master", "develop", "development"]) {
    try {
      execFileSync4("git", ["rev-parse", "--verify", candidate], {
        cwd: repoPath,
        encoding: "utf8"
      });
      return candidate;
    } catch {
    }
  }
  return "main";
}
function listLocalBranches(repoPath) {
  try {
    const out2 = execFileSync4("git", ["branch", "--format=%(refname:short)"], {
      cwd: repoPath,
      encoding: "utf8"
    });
    return out2.split("\n").map((b) => b.trim()).filter((b) => b.length > 0 && !TRUNK_BRANCHES.has(b));
  } catch {
    return [];
  }
}
function branchTouchedSpec(repoPath, branch, trunk) {
  try {
    const out2 = execFileSync4(
      "git",
      [
        "log",
        branch,
        "--not",
        trunk,
        "--name-only",
        "--format=",
        "--diff-filter=ACDMR"
      ],
      { cwd: repoPath, encoding: "utf8" }
    );
    return out2.split("\n").some((line) => line.startsWith("context/spec/"));
  } catch {
    return false;
  }
}
function detectBranchSpecRatio(repoPath, _params) {
  const branches = listLocalBranches(repoPath);
  if (branches.length === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no feature branches found \u2014 branch\u2192spec ratio not computable"],
      "computed"
    );
  }
  const trunk = detectTrunk(repoPath);
  const specBranches = [];
  const plainBranches = [];
  for (const branch of branches) {
    if (branchTouchedSpec(repoPath, branch, trunk)) {
      specBranches.push(branch);
    } else {
      plainBranches.push(branch);
    }
  }
  const total = branches.length;
  const ratio = Math.round(specBranches.length / total * 1e10) / 1e10;
  const evidence = [
    `${specBranches.length}/${total} feature branches touched context/spec/ (ratio: ${Math.round(ratio * 100)}%)`,
    ...specBranches.slice(0, 10).map((b) => `spec branch: ${b}`),
    ...plainBranches.slice(0, 10).map((b) => `plain branch: ${b}`)
  ];
  if (ratio >= 0.7) {
    return makeResult(
      "PASS",
      ratio,
      [
        `${Math.round(ratio * 100)}% of feature branches used spec workflow (threshold: 70%)`,
        ...evidence
      ],
      "computed"
    );
  }
  if (ratio >= 0.4) {
    return makeResult(
      "WARN",
      ratio,
      [
        `${Math.round(ratio * 100)}% of feature branches used spec workflow (below 70% threshold)`,
        ...evidence
      ],
      "computed"
    );
  }
  return makeResult(
    "FAIL",
    ratio,
    [
      `only ${Math.round(ratio * 100)}% of feature branches used spec workflow (threshold: 70%)`,
      ...evidence
    ],
    "computed"
  );
}
var SPEC_TRIAD = [
  "functional-spec.md",
  "technical-considerations.md",
  "tasks.md"
];
function listSpecDirs(repoPath) {
  const specBase = join5(repoPath, "context", "spec");
  if (!existsSync3(specBase)) return [];
  try {
    return readdirSync2(specBase).filter((name2) => /^\d{3}-/.test(name2)).sort().map((name2) => join5(specBase, name2)).filter((p) => {
      try {
        return statSync(p).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}
function detectSpecTriadComplete(repoPath, _params) {
  const specDirs = listSpecDirs(repoPath);
  if (specDirs.length === 0) {
    return makeResult("PASS", 0, [
      "no spec directories found \u2014 triad check skipped"
    ]);
  }
  const statuses = [];
  for (const dir of specDirs) {
    const present = SPEC_TRIAD.filter((f) => existsSync3(join5(dir, f)));
    const missing = SPEC_TRIAD.filter((f) => !existsSync3(join5(dir, f)));
    statuses.push({ dir: relative4(repoPath, dir), present, missing });
  }
  const empty = statuses.filter((s) => s.present.length === 0);
  const incomplete = statuses.filter(
    (s) => s.present.length > 0 && s.missing.length > 0
  );
  const complete = statuses.filter((s) => s.missing.length === 0);
  const evidence = [
    `${complete.length}/${specDirs.length} spec dirs have all 3 files`,
    ...incomplete.map(
      (s) => `incomplete: ${s.dir} \u2014 missing: ${s.missing.join(", ")}`
    ),
    ...empty.map((s) => `empty: ${s.dir} \u2014 has none of the 3 required files`)
  ];
  if (empty.length > 0) {
    return makeResult("FAIL", empty.length, [
      `${empty.length} spec dir(s) have none of the 3 required files`,
      ...evidence
    ]);
  }
  if (incomplete.length > 0) {
    return makeResult("WARN", incomplete.length, [
      `${incomplete.length} spec dir(s) are incomplete (have some but not all 3 files)`,
      ...evidence
    ]);
  }
  return makeResult("PASS", specDirs.length, [
    `all ${specDirs.length} spec dir(s) have the complete triad`,
    ...evidence
  ]);
}
var TASK_LINE_RX = /^\s*-\s*\[[ xX]\]/m;
var UNCHECKED_RX = /^\s*-\s*\[ \]/m;
function detectStaleSpecs(repoPath, _params) {
  const specDirs = listSpecDirs(repoPath);
  if (specDirs.length === 0) {
    return makeResult("PASS", 0, [
      "no spec directories found \u2014 stale-spec check skipped"
    ]);
  }
  const stale = [];
  const active = [];
  const done = [];
  for (const dir of specDirs) {
    const tasksPath = join5(dir, "tasks.md");
    if (!existsSync3(tasksPath)) continue;
    let content;
    try {
      content = readFileSync4(tasksPath, "utf8");
    } catch {
      continue;
    }
    const hasTasks = TASK_LINE_RX.test(content);
    if (!hasTasks) {
      stale.push(relative4(repoPath, dir));
    } else if (UNCHECKED_RX.test(content)) {
      active.push(relative4(repoPath, dir));
    } else {
      done.push(relative4(repoPath, dir));
    }
  }
  const evidence = [
    ...active.map((d) => `active (has open tasks): ${d}`),
    ...done.map((d) => `done (all tasks complete): ${d}`),
    ...stale.map((d) => `stale (tasks.md has no task items): ${d}`)
  ];
  if (stale.length === 0) {
    return makeResult("PASS", 0, ["no stale specs found", ...evidence]);
  }
  if (stale.length === 1) {
    return makeResult("WARN", stale.length, [
      `1 stale spec detected (tasks.md is an empty stub)`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", stale.length, [
    `${stale.length} stale specs detected (tasks.md empty stubs)`,
    ...evidence
  ]);
}
var TASK_CHECKBOX_RX = /^\s*-\s*\[[ xX]\]/;
var AGENT_ANNOTATION_RX = /\*\*\[Agent:\s*[^\]]+\]\*\*/;
function detectAgentAnnotations(repoPath, _params) {
  const specDirs = listSpecDirs(repoPath);
  let totalTasks = 0;
  let annotatedTasks = 0;
  for (const dir of specDirs) {
    const tasksPath = join5(dir, "tasks.md");
    if (!existsSync3(tasksPath)) continue;
    let content;
    try {
      content = readFileSync4(tasksPath, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      if (TASK_CHECKBOX_RX.test(line)) {
        totalTasks++;
        if (AGENT_ANNOTATION_RX.test(line)) {
          annotatedTasks++;
        }
      }
    }
  }
  if (totalTasks === 0) {
    return makeResult("SKIP", null, [
      "no task checkbox lines found in any tasks.md \u2014 agent-annotation check skipped"
    ]);
  }
  const ratio = Math.round(annotatedTasks / totalTasks * 1e10) / 1e10;
  const evidence = [
    `${annotatedTasks}/${totalTasks} task lines have **[Agent: ...]** annotations (${Math.round(ratio * 100)}%)`
  ];
  if (ratio >= 0.7) {
    return makeResult("PASS", ratio, [
      `${Math.round(ratio * 100)}% of tasks annotated with agent assignments (threshold: 70%)`,
      ...evidence
    ]);
  }
  if (ratio >= 0.4) {
    return makeResult("WARN", ratio, [
      `only ${Math.round(ratio * 100)}% of tasks annotated with agent assignments (below 70%)`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", ratio, [
    `only ${Math.round(ratio * 100)}% of tasks annotated with agent assignments (threshold: 70%)`,
    ...evidence
  ]);
}
var DETECTORS3 = {
  2800: detectAwosInstalled,
  // SDD-01 AWOS installed
  2801: detectProductContextDocs,
  // SDD-02 foundational product docs
  2802: detectArchTechMatch,
  // SDD-03 tech choices match codebase
  2803: detectBranchSpecRatio,
  // SDD-04 branch→spec ratio (computed)
  2804: detectSpecTriadComplete,
  // SDD-05 spec triad completeness
  2805: detectStaleSpecs,
  // SDD-06 no stale specs
  2806: detectAgentAnnotations
  // SDD-07 agent annotations in tasks.md
};

// plugins/awos/skills/ai-readiness-audit/detectors/ai_development_tooling.ts
import {
  existsSync as existsSync4,
  readFileSync as readFileSync5,
  lstatSync,
  readdirSync as readdirSync3,
  realpathSync
} from "node:fs";
import { join as join6, relative as relative5 } from "node:path";
function detectCustomCommands(repoPath, _params) {
  const commandsDir = join6(repoPath, ".claude", "commands");
  if (!existsSync4(commandsDir)) {
    return makeResult("FAIL", 0, [
      "no .claude/commands/ directory found \u2014 no custom slash commands defined"
    ]);
  }
  const files = iterFiles(commandsDir, ["*.md"]);
  if (files.length > 0) {
    const names = files.map((p) => relative5(repoPath, p));
    return makeResult("PASS", files.length, [
      `${files.length} custom command file(s) found under .claude/commands/`,
      ...names.slice(0, 10).map((n) => `command: ${n}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no custom command files found in .claude/commands/ \u2014 define slash commands for common workflows"
  ]);
}
function tryRealpath(p) {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}
function detectClaudeSkills(repoPath, _params) {
  const skillsRoot = join6(repoPath, ".claude", "skills");
  if (!existsSync4(skillsRoot)) {
    return makeResult("FAIL", 0, [
      "no .claude/skills/ directory found \u2014 no Claude Code skills configured"
    ]);
  }
  const realSkillsRoot = tryRealpath(skillsRoot) ?? skillsRoot;
  const scanTargets = /* @__PURE__ */ new Set([realSkillsRoot]);
  try {
    for (const entry of readdirSync3(realSkillsRoot)) {
      const entryPath = join6(realSkillsRoot, entry);
      let stat;
      try {
        stat = lstatSync(entryPath);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) {
        const resolved = tryRealpath(entryPath);
        if (resolved) scanTargets.add(resolved);
      }
    }
  } catch {
  }
  const allFiles = [];
  for (const target of scanTargets) {
    for (const f of iterFiles(target, ["SKILL.md"])) {
      allFiles.push(f);
    }
  }
  if (allFiles.length > 0) {
    const names = allFiles.map((p) => {
      try {
        return relative5(repoPath, p);
      } catch {
        return p;
      }
    });
    return makeResult("PASS", allFiles.length, [
      `${allFiles.length} SKILL.md file(s) found under .claude/skills/`,
      ...names.slice(0, 10).map((n) => `skill: ${n}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no SKILL.md files found under .claude/skills/ \u2014 no Claude Code skills configured"
  ]);
}
var MCP_CONFIG_PATHS = [".mcp.json", ".claude/mcp.json"];
function detectMcpConfig(repoPath, _params) {
  const found = [];
  for (const relPath of MCP_CONFIG_PATHS) {
    if (existsSync4(join6(repoPath, relPath))) {
      found.push(relPath);
    }
  }
  if (found.length > 0) {
    return makeResult("PASS", found.length, [
      `MCP configuration found: ${found.join(", ")}`,
      ...found.map((f) => `MCP config: ${f}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no MCP configuration found (.mcp.json or .claude/mcp.json) \u2014 no MCP servers configured"
  ]);
}
function detectClaudeHooks(repoPath, _params) {
  const hooksDir = join6(repoPath, ".claude", "hooks");
  if (existsSync4(hooksDir)) {
    const hookFiles = iterFiles(hooksDir, [
      "*.sh",
      "*.js",
      "*.ts",
      "*.py",
      "*.bash"
    ]);
    if (hookFiles.length > 0) {
      const names = hookFiles.map((p) => relative5(repoPath, p));
      return makeResult("PASS", hookFiles.length, [
        `${hookFiles.length} hook file(s) found in .claude/hooks/`,
        ...names.slice(0, 10).map((n) => `hook file: ${n}`)
      ]);
    }
  }
  const settingsFiles = [
    join6(repoPath, ".claude", "settings.json"),
    join6(repoPath, ".claude", "settings.local.json")
  ];
  for (const settingsPath of settingsFiles) {
    if (!existsSync4(settingsPath)) continue;
    let content;
    try {
      content = readFileSync5(settingsPath, "utf8");
    } catch {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      if (/"hooks"\s*:/.test(content)) {
        return makeResult("PASS", 1, [
          `"hooks" key found in ${relative5(repoPath, settingsPath)}`
        ]);
      }
      continue;
    }
    if (parsed !== null && typeof parsed === "object" && "hooks" in parsed) {
      return makeResult("PASS", 1, [
        `"hooks" key configured in ${relative5(repoPath, settingsPath)}`
      ]);
    }
  }
  return makeResult("FAIL", 0, [
    'no Claude Code hooks found \u2014 neither .claude/hooks/ files nor "hooks" key in settings'
  ]);
}
var ROOT_RUN_FILES = [
  "Makefile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "run.sh",
  "start.sh",
  "justfile",
  "Justfile",
  "Taskfile.yml",
  "Taskfile.yaml"
];
function hasPackageJsonRunScript(repoPath) {
  const pkgPath = join6(repoPath, "package.json");
  if (!existsSync4(pkgPath)) return false;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync5(pkgPath, "utf8"));
  } catch {
    return false;
  }
  if (pkg === null || typeof pkg !== "object") return false;
  const scripts = pkg.scripts;
  if (scripts === null || typeof scripts !== "object") return false;
  return "start" in scripts || "dev" in scripts;
}
function detectCanRunApp(repoPath, _params) {
  const found = [];
  for (const f of ROOT_RUN_FILES) {
    if (existsSync4(join6(repoPath, f))) {
      found.push(f);
    }
  }
  if (hasPackageJsonRunScript(repoPath)) {
    found.push("package.json (start/dev script)");
  }
  if (found.length > 0) {
    return makeResult("PASS", found.length, [
      `run mechanism(s) found: ${found.join(", ")}`,
      ...found.map((f) => `run signal: ${f}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no run mechanism found \u2014 no Makefile, docker-compose, or package.json start script; Claude Code cannot run the application without human involvement"
  ]);
}
var DETECTORS4 = {
  2001: detectCustomCommands,
  // AI-02 custom slash commands
  2002: detectClaudeSkills,
  // AI-03 Claude Code skills
  2003: detectMcpConfig,
  // AI-04 MCP server config
  2004: detectClaudeHooks,
  // AI-05 Claude Code hooks
  2006: detectCanRunApp
  // AI-07 agent can run/observe app
};

// plugins/awos/skills/ai-readiness-audit/detectors/end_to_end_delivery.ts
import { existsSync as existsSync5, readFileSync as readFileSync6, statSync as statSync2 } from "node:fs";
import { join as join7, relative as relative6 } from "node:path";
import { execFileSync as execFileSync5 } from "node:child_process";
var TRUNK_NAMES = /* @__PURE__ */ new Set(["main", "master", "develop", "development"]);
var LAYER_PATTERNS = [
  {
    name: "api/backend",
    patterns: /\/(api|backend|server|services?|routes?|controllers?|handlers?|endpoints?)\//i
  },
  {
    name: "frontend/ui",
    patterns: /\/(frontend|ui|web|client|app|pages?|components?|views?)\//i
  },
  {
    name: "database",
    patterns: /\/(db|database|migrations?|schemas?|sql|models?)\//i
  },
  {
    name: "infra",
    patterns: /\/(infra|infrastructure|terraform|k8s|kubernetes|helm|deploy)\//i
  }
];
function detectTrunk2(repoPath) {
  for (const candidate of ["main", "master", "develop", "development"]) {
    try {
      execFileSync5("git", ["rev-parse", "--verify", candidate], {
        cwd: repoPath,
        encoding: "utf8"
      });
      return candidate;
    } catch {
    }
  }
  return "main";
}
function listFeatureBranches(repoPath) {
  try {
    const out2 = execFileSync5("git", ["branch", "--format=%(refname:short)"], {
      cwd: repoPath,
      encoding: "utf8"
    });
    return out2.split("\n").map((b) => b.trim()).filter((b) => b.length > 0 && !TRUNK_NAMES.has(b));
  } catch {
    return [];
  }
}
function branchLayerCount(repoPath, branch, trunk) {
  let paths;
  try {
    const out2 = execFileSync5(
      "git",
      [
        "log",
        branch,
        "--not",
        trunk,
        "--name-only",
        "--format=",
        "--diff-filter=ACDMR"
      ],
      { cwd: repoPath, encoding: "utf8" }
    );
    paths = out2.split("\n").filter(Boolean);
  } catch {
    return 0;
  }
  const layers = /* @__PURE__ */ new Set();
  for (const p of paths) {
    const withSlash = "/" + p;
    for (const { name: name2, patterns } of LAYER_PATTERNS) {
      if (patterns.test(withSlash)) {
        layers.add(name2);
        break;
      }
    }
  }
  return layers.size;
}
function detectVerticalDelivery(repoPath, _params) {
  const branches = listFeatureBranches(repoPath);
  if (branches.length === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no feature branches found \u2014 vertical delivery ratio not computable"],
      "computed"
    );
  }
  const trunk = detectTrunk2(repoPath);
  const verticalBranches = [];
  const singleLayerBranches = [];
  for (const branch of branches) {
    const layerCount = branchLayerCount(repoPath, branch, trunk);
    if (layerCount >= 2) {
      verticalBranches.push(branch);
    } else {
      singleLayerBranches.push(branch);
    }
  }
  const total = branches.length;
  const ratio = Math.round(verticalBranches.length / total * 1e10) / 1e10;
  const evidence = [
    `${verticalBranches.length}/${total} feature branches touch \u2265 2 layers (ratio: ${Math.round(ratio * 100)}%)`,
    ...verticalBranches.slice(0, 10).map((b) => `vertical branch: ${b}`),
    ...singleLayerBranches.slice(0, 5).map((b) => `single-layer branch: ${b}`)
  ];
  if (ratio >= 0.5) {
    return makeResult(
      "PASS",
      ratio,
      [
        `${Math.round(ratio * 100)}% of feature branches touch multiple layers (threshold: 50%)`,
        ...evidence
      ],
      "computed"
    );
  }
  if (ratio >= 0.25) {
    return makeResult(
      "WARN",
      ratio,
      [
        `only ${Math.round(ratio * 100)}% of feature branches touch multiple layers (below 50%)`,
        ...evidence
      ],
      "computed"
    );
  }
  return makeResult(
    "FAIL",
    ratio,
    [
      `only ${Math.round(ratio * 100)}% of feature branches touch multiple layers (threshold: 50%)`,
      ...evidence
    ],
    "computed"
  );
}
var BACKEND_RX = /-backend$|[-_]api$|[-_]server$/i;
var FRONTEND_RX = /-frontend$|[-_]ui$|[-_]client$|[-_]web$/i;
function stripLayerSuffix(name2) {
  return name2.replace(
    /-backend$|-frontend$|[-_]api$|[-_]server$|[-_]ui$|[-_]client$|[-_]web$/i,
    ""
  ).toLowerCase();
}
function detectNoLayerSplit(repoPath, _params) {
  let branches;
  try {
    const out2 = execFileSync5("git", ["branch", "--format=%(refname:short)"], {
      cwd: repoPath,
      encoding: "utf8"
    });
    branches = out2.split("\n").map((b) => b.trim()).filter((b) => b.length > 0 && !TRUNK_NAMES.has(b));
  } catch {
    return makeResult("SKIP", null, [
      "no git branches available \u2014 layer-split detection skipped"
    ]);
  }
  if (branches.length === 0) {
    return makeResult("SKIP", null, [
      "no feature branches found \u2014 layer-split detection skipped"
    ]);
  }
  const backendBranches = branches.filter((b) => BACKEND_RX.test(b));
  const frontendBranches = branches.filter((b) => FRONTEND_RX.test(b));
  const pairedRoots = [];
  for (const b of backendBranches) {
    const root = stripLayerSuffix(b);
    const hasFrontendPair = frontendBranches.some(
      (f) => stripLayerSuffix(f) === root
    );
    if (hasFrontendPair) {
      pairedRoots.push(root);
    }
  }
  if (pairedRoots.length === 0) {
    return makeResult("PASS", 0, [
      "no paired backend/frontend branch split patterns detected",
      `${branches.length} feature branch(es) inspected`
    ]);
  }
  const evidence = [
    `${pairedRoots.length} paired layer-split branch pattern(s) detected`,
    ...pairedRoots.slice(0, 10).map((r) => `split pattern root: ${r}`)
  ];
  if (pairedRoots.length >= 3) {
    return makeResult("FAIL", pairedRoots.length, [
      `${pairedRoots.length} feature(s) split into separate backend/frontend branches \u2014 vertical delivery anti-pattern`,
      ...evidence
    ]);
  }
  return makeResult("WARN", pairedRoots.length, [
    `${pairedRoots.length} feature(s) split into separate backend/frontend branches`,
    ...evidence
  ]);
}
var IMPL_PATH_RX = /\b(src|app|lib|packages?)\//i;
var SPEC_REF_RX = /context\/spec\/\d{3}-|(?<!\/)spec\/\d{3}-/;
function detectBidirectionalLinks(repoPath, _params) {
  const specBase = join7(repoPath, "context", "spec");
  if (!existsSync5(specBase)) {
    return makeResult("FAIL", 0, [
      "no context/spec/ directory found \u2014 spec\u2194impl bidirectional links not possible"
    ]);
  }
  let specFiles = [];
  try {
    specFiles = iterFiles(specBase, ["*.md"]);
  } catch {
    specFiles = [];
  }
  if (specFiles.length === 0) {
    return makeResult("FAIL", 0, [
      "no spec markdown files found \u2014 bidirectional links not detectable"
    ]);
  }
  let specRefsImpl = false;
  const specImplEvidence = [];
  for (const f of specFiles) {
    let content;
    try {
      content = readFileSync6(f, "utf8");
    } catch {
      continue;
    }
    if (IMPL_PATH_RX.test(content)) {
      specRefsImpl = true;
      specImplEvidence.push(`spec\u2192impl reference in: ${relative6(repoPath, f)}`);
      if (specImplEvidence.length >= 3) break;
    }
  }
  const SOURCE_GLOBS3 = [
    "*.ts",
    "*.tsx",
    "*.js",
    "*.jsx",
    "*.py",
    "*.go",
    "*.java",
    "*.kt"
  ];
  let implRefsSpec = false;
  const implSpecEvidence = [];
  let sourceFiles = [];
  try {
    sourceFiles = iterFiles(repoPath, SOURCE_GLOBS3);
  } catch {
    sourceFiles = [];
  }
  for (const f of sourceFiles) {
    let content;
    try {
      content = readFileSync6(f, "utf8");
    } catch {
      continue;
    }
    if (SPEC_REF_RX.test(content)) {
      implRefsSpec = true;
      implSpecEvidence.push(`impl\u2192spec reference in: ${relative6(repoPath, f)}`);
      if (implSpecEvidence.length >= 3) break;
    }
  }
  const evidence = [...specImplEvidence, ...implSpecEvidence];
  if (specRefsImpl && implRefsSpec) {
    return makeResult("PASS", 2, [
      "bidirectional spec\u2194impl cross-references detected",
      ...evidence
    ]);
  }
  if (specRefsImpl || implRefsSpec) {
    return makeResult("WARN", 1, [
      "only one direction of spec\u2194impl cross-references found",
      specRefsImpl ? "spec files reference implementation paths" : "no spec files reference implementation paths",
      implRefsSpec ? "implementation files reference spec directories" : "no implementation files reference spec directories",
      ...evidence
    ]);
  }
  return makeResult("FAIL", 0, [
    "no bidirectional spec\u2194impl cross-references found",
    `${specFiles.length} spec file(s) found but none reference implementation paths`,
    `${sourceFiles.length} source file(s) found but none reference context/spec/`
  ]);
}
var API_DIRS = [
  "api",
  "routes",
  "server",
  "backend",
  "controllers",
  "handlers",
  "endpoints"
];
var UI_DIRS = ["frontend", "ui", "web", "client"];
var DB_FILES_GLOBS = ["*.sql", "schema.prisma", "*.prisma"];
var DB_DIRS = ["migrations", "db", "database", "models"];
function hasAnyDir(repoPath, dirs) {
  for (const d of dirs) {
    if (existsSync5(join7(repoPath, d)) && statSync2(join7(repoPath, d)).isDirectory()) {
      return d;
    }
  }
  return null;
}
function detectLayerCoverage(repoPath, _params) {
  const apiDir = hasAnyDir(repoPath, API_DIRS);
  const hasApi = apiDir !== null;
  const uiDir = hasAnyDir(repoPath, UI_DIRS);
  let hasUi = uiDir !== null;
  let uiSignal = uiDir ? `directory: ${uiDir}/` : null;
  if (!hasUi) {
    let uiFiles = [];
    try {
      uiFiles = iterFiles(repoPath, ["*.tsx", "*.jsx"]);
    } catch {
      uiFiles = [];
    }
    if (uiFiles.length > 0) {
      hasUi = true;
      uiSignal = `${uiFiles.length} .tsx/.jsx file(s)`;
    }
  }
  const dbDir = hasAnyDir(repoPath, DB_DIRS);
  let hasDb = dbDir !== null;
  let dbSignal = dbDir ? `directory: ${dbDir}/` : null;
  if (!hasDb) {
    let dbFiles = [];
    try {
      dbFiles = iterFiles(repoPath, DB_FILES_GLOBS);
    } catch {
      dbFiles = [];
    }
    if (dbFiles.length > 0) {
      hasDb = true;
      dbSignal = `${dbFiles.length} schema/SQL file(s)`;
    }
  }
  const layerCount = [hasApi, hasUi, hasDb].filter(Boolean).length;
  if (layerCount < 2) {
    return makeResult("SKIP", layerCount, [
      "fewer than 2 distinct layers detected \u2014 single-layer project, E2E-04 not applicable",
      hasApi ? `API layer: ${apiDir}/` : "API layer: not detected",
      hasUi ? `UI layer: ${uiSignal}` : "UI layer: not detected",
      hasDb ? `DB layer: ${dbSignal}` : "DB layer: not detected"
    ]);
  }
  const evidence = [
    hasApi ? `API layer: ${apiDir}/` : "API layer: not detected",
    hasUi ? `UI layer: ${uiSignal}` : "UI layer: not detected",
    hasDb ? `DB layer: ${dbSignal}` : "DB layer: not detected"
  ];
  if (layerCount === 3) {
    return makeResult("PASS", layerCount, [
      "API, UI, and DB layers all detected \u2014 full vertical coverage",
      ...evidence
    ]);
  }
  return makeResult("WARN", layerCount, [
    `only ${layerCount} of 3 layers detected \u2014 partial vertical coverage`,
    ...evidence
  ]);
}
var ROOT_TOOLING_FILES = [
  "Makefile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Taskfile.yml",
  "Taskfile.yaml",
  "justfile",
  "Justfile",
  ".gitlab-ci.yml",
  ".gitlab-ci.yaml"
];
function detectCrossLayerTooling(repoPath, _params) {
  const found = [];
  for (const f of ROOT_TOOLING_FILES) {
    if (existsSync5(join7(repoPath, f))) {
      found.push(f);
    }
  }
  for (const ciDir of CI_DIRS) {
    const ciDirPath = join7(repoPath, ciDir);
    if (!existsSync5(ciDirPath)) continue;
    let ciFiles = [];
    try {
      ciFiles = iterFiles(ciDirPath, ["*.yml", "*.yaml"]);
    } catch {
      ciFiles = [];
    }
    if (ciFiles.length > 0) {
      found.push(`${ciDir}/ (${ciFiles.length} workflow file(s))`);
    }
  }
  if (found.length > 0) {
    return makeResult("PASS", found.length, [
      `cross-layer tooling found: ${found.join(", ")}`,
      ...found.map((f) => `tooling: ${f}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no cross-layer tooling found \u2014 no Makefile, docker-compose, or shared CI config at repo root"
  ]);
}
var DETECTORS5 = {
  2300: detectVerticalDelivery,
  // E2E-01 vertical delivery (computed)
  2301: detectNoLayerSplit,
  // E2E-02 no paired layer-split branches
  2302: detectBidirectionalLinks,
  // E2E-03 spec↔impl bidirectional links
  2303: detectLayerCoverage,
  // E2E-04 API + UI + DB layer coverage
  2304: detectCrossLayerTooling
  // E2E-05 cross-layer unified tooling
};

// plugins/awos/skills/ai-readiness-audit/detectors/security.ts
import { readFileSync as readFileSync7, existsSync as existsSync6 } from "node:fs";
import { join as join8, relative as relative7 } from "node:path";
var ENV_GITIGNORE_RX = /^\s*(\.env(\.\*)?|\*\.env|\*\*\/\.env|\/\.env)\s*(?:#.*)?$/m;
function detectEnvGitignored(repoPath, _params) {
  const gitignorePath = join8(repoPath, ".gitignore");
  if (!existsSync6(gitignorePath)) {
    return makeResult("FAIL", 0, [
      "no .gitignore file found \u2014 .env files are not excluded from version control"
    ]);
  }
  let content;
  try {
    content = readFileSync7(gitignorePath, "utf8");
  } catch {
    return makeResult("FAIL", 0, [".gitignore could not be read"]);
  }
  if (ENV_GITIGNORE_RX.test(content)) {
    return makeResult("PASS", 1, [
      ".gitignore covers .env files \u2014 environment secrets excluded from version control"
    ]);
  }
  return makeResult("FAIL", 0, [
    ".gitignore exists but does not cover .env files \u2014 add .env or .env.* to .gitignore"
  ]);
}
var HOOK_FILES_GLOBS = ["*.sh", "*.js", "*.ts", "*.py", "*.bash"];
var HOOK_SENSITIVE_RX = /\.env|secret|credential|\.pem|\.key/i;
function detectAgentSafetyHooks(repoPath, _params) {
  const settingsPaths = [
    join8(repoPath, ".claude", "settings.json"),
    join8(repoPath, ".claude", "settings.local.json")
  ];
  for (const sp of settingsPaths) {
    if (!existsSync6(sp)) continue;
    let content;
    try {
      content = readFileSync7(sp, "utf8");
    } catch {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      if (/"hooks"\s*:/.test(content)) {
        return makeResult("PASS", 1, [
          `hooks key found in ${relative7(repoPath, sp)} \u2014 agent reads guarded by pre-tool hooks`
        ]);
      }
      continue;
    }
    if (parsed !== null && typeof parsed === "object" && "hooks" in parsed) {
      return makeResult("PASS", 1, [
        `hooks configured in ${relative7(repoPath, sp)} \u2014 agent file-read actions can be controlled`
      ]);
    }
  }
  const hooksDir = join8(repoPath, ".claude", "hooks");
  if (existsSync6(hooksDir)) {
    const hookFiles = iterFiles(hooksDir, HOOK_FILES_GLOBS);
    for (const f of hookFiles) {
      let src;
      try {
        src = readFileSync7(f, "utf8");
      } catch {
        continue;
      }
      if (HOOK_SENSITIVE_RX.test(src)) {
        return makeResult("PASS", 1, [
          `hook script references sensitive file patterns: ${relative7(repoPath, f)}`
        ]);
      }
    }
    if (hookFiles.length > 0) {
      return makeResult("WARN", hookFiles.length, [
        `${hookFiles.length} hook file(s) found but none explicitly reference .env/secret patterns`,
        ...hookFiles.slice(0, 5).map((f) => `hook: ${relative7(repoPath, f)}`)
      ]);
    }
  }
  return makeResult("FAIL", 0, [
    "no Claude Code hooks configured \u2014 AI agents are not blocked from reading sensitive files"
  ]);
}
var ENV_EXAMPLE_GLOBS = [
  ".env.example",
  ".env.template",
  ".env.sample",
  ".env.dist",
  "env.example",
  "env.template"
];
function detectEnvExample(repoPath, _params) {
  const found = [];
  for (const name2 of ENV_EXAMPLE_GLOBS) {
    const full = join8(repoPath, name2);
    if (existsSync6(full)) {
      found.push(name2);
    }
  }
  if (found.length > 0) {
    return makeResult("PASS", found.length, [
      `environment template file(s) found: ${found.join(", ")}`,
      ...found.map((f) => `env template: ${f}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no .env.example or .env.template file found \u2014 developers have no reference for required environment variables"
  ]);
}
var SECRET_PATTERNS = [
  // AWS access/secret keys (long alphanumeric tokens)
  /AKIA[0-9A-Z]{16}/,
  // Generic assignment: key/secret/token/password/credential = "non-trivial-value"
  /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|credential|private[_-]?key)\s*[:=]\s*["']([A-Za-z0-9/+\-_.]{12,})["']/i
];
var PLACEHOLDER_RX = /test|fake|example|dummy|xxx|your[_-]|placeholder|changeme|replace|<[^>]+>|\$\{[^}]+\}|env\(|process\.env|os\.environ|getenv/i;
var SOURCE_GLOBS_SEC = [
  "*.py",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.java",
  "*.kt",
  "*.go",
  "*.rb",
  "*.php",
  "*.env",
  "*.yaml",
  "*.yml",
  "*.json",
  "*.toml",
  "*.ini",
  "*.cfg",
  "*.conf"
];
var SEC_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  ".next",
  "target",
  "vendor",
  "fixtures",
  "testdata",
  "__tests__",
  "test",
  "tests"
];
function detectNoSecretsCommitted(repoPath, _params) {
  const files = iterFiles(repoPath, SOURCE_GLOBS_SEC, SEC_IGNORE);
  const hits = [];
  for (const filePath of files) {
    let content;
    try {
      content = readFileSync7(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i2 = 0; i2 < lines.length; i2++) {
      const line = lines[i2];
      if (/^\s*(#|\/\/|\/\*)/.test(line)) continue;
      for (const pat of SECRET_PATTERNS) {
        if (!pat.test(line)) continue;
        if (PLACEHOLDER_RX.test(line)) continue;
        hits.push({
          file: relative7(repoPath, filePath),
          line: i2 + 1,
          pattern: pat.source.slice(0, 40)
        });
        break;
      }
    }
    if (hits.length >= 20) break;
  }
  if (hits.length === 0) {
    return makeResult("PASS", 0, [
      "no hardcoded secret patterns found in tracked source files"
    ]);
  }
  const evidence = hits.slice(0, 10).map((h) => `${h.file}:${h.line} possible secret (pattern: ${h.pattern})`);
  if (hits.length <= 2) {
    return makeResult("WARN", hits.length, [
      `${hits.length} possible secret pattern(s) found \u2014 review manually`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", hits.length, [
    `${hits.length} possible hardcoded secret pattern(s) found in committed files`,
    ...evidence
  ]);
}
var SENSITIVE_PATTERNS = [
  { name: "*.pem", rx: /^\s*\*\.pem\s*(?:#.*)?$/m },
  { name: "*.key", rx: /^\s*\*\.key\s*(?:#.*)?$/m },
  { name: "*.p12", rx: /^\s*\*\.p12\s*(?:#.*)?$/m },
  { name: "*.pfx", rx: /^\s*\*\.pfx\s*(?:#.*)?$/m },
  { name: "*.jks", rx: /^\s*\*\.jks\s*(?:#.*)?$/m },
  { name: "*.keystore", rx: /^\s*\*\.keystore\s*(?:#.*)?$/m },
  { name: "credentials.json", rx: /^\s*credentials\.json\s*(?:#.*)?$/m },
  { name: "secrets.yaml", rx: /^\s*(secrets\.yaml|secrets\.yml)\s*(?:#.*)?$/m },
  { name: "kubeconfig", rx: /^\s*kubeconfig\s*(?:#.*)?$/m }
];
function detectSensitiveFilesGitignored(repoPath, _params) {
  const gitignorePath = join8(repoPath, ".gitignore");
  if (!existsSync6(gitignorePath)) {
    return makeResult("FAIL", 0, [
      "no .gitignore file found \u2014 sensitive file types are not excluded from version control"
    ]);
  }
  let content;
  try {
    content = readFileSync7(gitignorePath, "utf8");
  } catch {
    return makeResult("FAIL", 0, [".gitignore could not be read"]);
  }
  const covered = SENSITIVE_PATTERNS.filter(({ rx }) => rx.test(content));
  if (covered.length >= 3) {
    return makeResult("PASS", covered.length, [
      `${covered.length} sensitive file type pattern(s) covered in .gitignore`,
      ...covered.map(({ name: name2 }) => `gitignored: ${name2}`)
    ]);
  }
  if (covered.length >= 1) {
    const missing = SENSITIVE_PATTERNS.filter(({ rx }) => !rx.test(content));
    return makeResult("WARN", covered.length, [
      `only ${covered.length} sensitive pattern(s) covered \u2014 add *.pem, *.key, *.p12, *.pfx to .gitignore`,
      ...covered.map(({ name: name2 }) => `covered: ${name2}`),
      ...missing.slice(0, 5).map(({ name: name2 }) => `not covered: ${name2}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no sensitive file type patterns (*.pem, *.key, *.p12, *.pfx \u2026) found in .gitignore"
  ]);
}
var DETECTORS6 = {
  2600: detectEnvGitignored,
  // SEC-01 .env gitignored
  2601: detectAgentSafetyHooks,
  // SEC-02 agent safety hooks
  2602: detectEnvExample,
  // SEC-03 .env.example present
  2603: detectNoSecretsCommitted,
  // SEC-04 no secrets committed
  2604: detectSensitiveFilesGitignored
  // SEC-05 sensitive file types gitignored
};

// plugins/awos/skills/ai-readiness-audit/detectors/supply_chain_security.ts
import { readFileSync as readFileSync8, existsSync as existsSync7 } from "node:fs";
import { join as join9, relative as relative8, basename as basename4 } from "node:path";
var LOCKFILES2 = [
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "gradle.lockfile",
  "poetry.lock",
  "uv.lock",
  "Cargo.lock",
  "go.sum",
  "Gemfile.lock",
  "composer.lock",
  "mix.lock",
  "pdm.lock",
  "requirements.txt",
  // pip freeze output commonly committed as lockfile
  "pip.lock"
];
function detectScsLockfiles(repoPath, _params) {
  const found = iterFiles(repoPath, LOCKFILES2).map((p) => basename4(p));
  if (found.length > 0) {
    const uniq = [...new Set(found)].sort();
    return makeResult(
      "PASS",
      uniq.length,
      uniq.map((n) => `lockfile present: ${n}`)
    );
  }
  return makeResult("FAIL", 0, ["no dependency lockfile found"]);
}
var LOCKFILE_INTEGRITY_CHECKS = [
  {
    name: /package-lock\.json$/,
    integrityRx: /"integrity"\s*:\s*"sha\d+-/
  },
  {
    name: /pnpm-lock\.yaml$/,
    integrityRx: /^\s*integrity:\s*sha\d+-/m
  },
  {
    name: /yarn\.lock$/,
    integrityRx: /^\s+(checksum|integrity):\s/m
  },
  {
    name: /poetry\.lock$/,
    integrityRx: /hash\s*=\s*"sha256:/m
  },
  {
    name: /Cargo\.lock$/,
    integrityRx: /^checksum\s*=\s*"/m
  },
  {
    name: /uv\.lock$/,
    integrityRx: /hash\s*=\s*"sha256:/m
  },
  {
    name: /go\.sum$/,
    // go.sum lines are always hashes — the file is the integrity manifest.
    integrityRx: /\s+h1:/
  },
  {
    name: /Gemfile\.lock$/,
    integrityRx: /^\s+[A-Za-z0-9+/]+=$/m
  }
];
function detectLockfileIntegrity(repoPath, _params) {
  const lockfileNames = LOCKFILES2.filter((n) => !n.includes("requirements"));
  const presentLockfiles = iterFiles(repoPath, lockfileNames);
  if (presentLockfiles.length === 0) {
    return makeResult("SKIP", 0, [
      "no lockfiles found \u2014 lockfile integrity check skipped"
    ]);
  }
  const withHashes = [];
  const withoutHashes = [];
  for (const filePath of presentLockfiles) {
    const name2 = basename4(filePath);
    const check = LOCKFILE_INTEGRITY_CHECKS.find(
      ({ name: rx }) => rx.test(name2)
    );
    if (!check) continue;
    let content;
    try {
      content = readFileSync8(filePath, "utf8");
    } catch {
      continue;
    }
    if (check.integrityRx.test(content)) {
      withHashes.push(name2);
    } else {
      withoutHashes.push(name2);
    }
  }
  if (withHashes.length > 0) {
    return makeResult("PASS", withHashes.length, [
      `${withHashes.length} lockfile(s) include cryptographic integrity hashes`,
      ...withHashes.map((n) => `lockfile with hashes: ${n}`),
      ...withoutHashes.map((n) => `lockfile without hashes: ${n}`)
    ]);
  }
  if (withoutHashes.length > 0) {
    return makeResult("WARN", 0, [
      `${withoutHashes.length} lockfile(s) found but none include integrity hashes`,
      ...withoutHashes.map((n) => `lockfile without hashes: ${n}`)
    ]);
  }
  return makeResult("SKIP", 0, [
    "lockfiles present but none matched known integrity-check format \u2014 skipped"
  ]);
}
function parsePyprojectDeps(content) {
  const deps = [];
  function extractInlineArray(text, start2) {
    const items = [];
    let i2 = start2 + 1;
    while (i2 < text.length && text[i2] !== "]") {
      if (/[\s,]/.test(text[i2])) {
        i2++;
        continue;
      }
      if (text[i2] === '"' || text[i2] === "'") {
        const quote = text[i2];
        let j2 = i2 + 1;
        while (j2 < text.length && text[j2] !== quote) j2++;
        items.push(text.slice(i2 + 1, j2));
        i2 = j2 + 1;
        continue;
      }
      let j = i2;
      while (j < text.length && text[j] !== "," && text[j] !== "]") j++;
      const raw = text.slice(i2, j).trim();
      if (raw) items.push(raw);
      i2 = j;
    }
    return items;
  }
  const lines = content.split("\n");
  let section = null;
  let accumulating = false;
  let accumBuf = "";
  function flushAccum() {
    if (!accumBuf) return;
    const closeIdx = accumBuf.indexOf("]");
    if (closeIdx !== -1) {
      const full = accumBuf.slice(0, closeIdx + 1);
      const openIdx = full.indexOf("[");
      if (openIdx !== -1) {
        deps.push(...extractInlineArray(full, openIdx));
      }
      accumBuf = "";
      accumulating = false;
    }
  }
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const line = raw.trimEnd();
    if (accumulating) {
      accumBuf += line + "\n";
      flushAccum();
      continue;
    }
    const secMatch = line.match(/^\s*\[([^\]]+)\]/);
    if (secMatch) {
      const hdr = secMatch[1].trim();
      if (hdr === "project") {
        section = "project";
      } else if (hdr === "project.optional-dependencies" || hdr === "tool.uv.optional-dependencies") {
        section = "project.optional-dependencies";
      } else if (hdr === "dependency-groups" || hdr === "tool.uv") {
        section = "dependency-groups";
      } else if (hdr.startsWith("tool.") || hdr.startsWith("[")) {
        section = null;
      } else {
        section = null;
      }
      continue;
    }
    if (section === null) continue;
    if (section === "project") {
      const m = line.match(/^\s*dependencies\s*=\s*(\[.*)/);
      if (m) {
        const rest = m[1];
        if (rest.includes("]")) {
          deps.push(...extractInlineArray(rest, 0));
        } else {
          accumBuf = rest + "\n";
          accumulating = true;
        }
      }
    } else if (section === "project.optional-dependencies") {
      const m = line.match(/^\s*[a-zA-Z0-9_-]+\s*=\s*(\[.*)/);
      if (m) {
        const rest = m[1];
        if (rest.includes("]")) {
          deps.push(...extractInlineArray(rest, 0));
        } else {
          accumBuf = rest + "\n";
          accumulating = true;
        }
      }
    } else if (section === "dependency-groups") {
      const m = line.match(/^\s*[a-zA-Z0-9_-]+\s*=\s*(\[.*)/);
      if (m) {
        const rest = m[1];
        if (rest.includes("]")) {
          deps.push(...extractInlineArray(rest, 0));
        } else {
          accumBuf = rest + "\n";
          accumulating = true;
        }
      }
    }
  }
  return deps;
}
function isPep508Ranged(spec) {
  const versionPart = spec.replace(/^[^;]+;.*$/, "$1").split(";")[0];
  if (/==\s*[\d]/.test(versionPart)) return false;
  return true;
}
function countPackageJsonRanges(content) {
  let pkg;
  try {
    pkg = JSON.parse(content);
  } catch {
    return { total: 0, ranged: 0 };
  }
  if (pkg === null || typeof pkg !== "object") return { total: 0, ranged: 0 };
  const rec = pkg;
  const depGroups = [
    rec["dependencies"],
    rec["devDependencies"],
    rec["peerDependencies"],
    rec["optionalDependencies"]
  ].filter(
    (g) => g !== null && typeof g === "object"
  );
  let total = 0;
  let ranged = 0;
  for (const group of depGroups) {
    for (const ver of Object.values(group)) {
      if (typeof ver !== "string") continue;
      total++;
      if (/^\^|^~|^>=|^>|^\*|^x$/.test(ver.trim())) ranged++;
    }
  }
  return { total, ranged };
}
function countRequirementsTxtRanges(content) {
  const lines = content.split("\n").filter((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith("#") && !t.startsWith("-");
  });
  let total = 0;
  let ranged = 0;
  for (const line of lines) {
    if (!/[A-Za-z]/.test(line)) continue;
    total++;
    if (!/==\s*[\d]/.test(line)) ranged++;
  }
  return { total, ranged };
}
function detectPinnedVersions(repoPath, _params) {
  let totalDeps = 0;
  let rangedDeps = 0;
  const evidence = [];
  const pkgJsonFiles = iterFiles(repoPath, ["package.json"]);
  for (const f of pkgJsonFiles) {
    if (f.includes("node_modules")) continue;
    let content;
    try {
      content = readFileSync8(f, "utf8");
    } catch {
      continue;
    }
    const counts = countPackageJsonRanges(content);
    totalDeps += counts.total;
    rangedDeps += counts.ranged;
    if (counts.ranged > 0) {
      evidence.push(
        `${relative8(repoPath, f)}: ${counts.ranged}/${counts.total} ranged deps`
      );
    }
  }
  const reqFiles = iterFiles(repoPath, [
    "requirements.txt",
    "requirements*.txt"
  ]);
  for (const f of reqFiles) {
    let content;
    try {
      content = readFileSync8(f, "utf8");
    } catch {
      continue;
    }
    const counts = countRequirementsTxtRanges(content);
    totalDeps += counts.total;
    rangedDeps += counts.ranged;
    if (counts.ranged > 0) {
      evidence.push(
        `${relative8(repoPath, f)}: ${counts.ranged}/${counts.total} unpinned deps`
      );
    }
  }
  const pyprojectFiles = iterFiles(repoPath, ["pyproject.toml"]);
  for (const f of pyprojectFiles) {
    let content;
    try {
      content = readFileSync8(f, "utf8");
    } catch {
      continue;
    }
    const specifiers = parsePyprojectDeps(content);
    if (specifiers.length === 0) continue;
    const ranged = specifiers.filter(isPep508Ranged).length;
    totalDeps += specifiers.length;
    rangedDeps += ranged;
    if (ranged > 0) {
      evidence.push(
        `${relative8(repoPath, f)}: ${ranged}/${specifiers.length} unpinned deps`
      );
    }
  }
  if (totalDeps === 0) {
    return makeResult("SKIP", 0, [
      "no package manifests found \u2014 pinned-version check skipped"
    ]);
  }
  const ratio = rangedDeps / totalDeps;
  if (ratio >= 0.3) {
    return makeResult(
      "FAIL",
      rangedDeps,
      [
        `${rangedDeps}/${totalDeps} dependencies use open-ended version ranges (${Math.round(ratio * 100)}%)`,
        ...evidence
      ],
      "detected"
    );
  }
  if (ratio >= 0.1) {
    return makeResult(
      "WARN",
      rangedDeps,
      [
        `${rangedDeps}/${totalDeps} dependencies use open-ended version ranges (${Math.round(ratio * 100)}%)`,
        ...evidence
      ],
      "detected"
    );
  }
  return makeResult(
    "PASS",
    totalDeps - rangedDeps,
    [
      `${totalDeps - rangedDeps}/${totalDeps} dependencies are pinned to exact versions`,
      ...evidence
    ],
    "detected"
  );
}
function detectScsQuarantineAge(repoPath, _params) {
  return makeResult(
    "SKIP",
    null,
    [
      "SCS-04 (quarantine-age) requires live registry API calls to resolve per-version publish timestamps",
      "This check is non-deterministic offline \u2014 it is intentionally skipped by the static detector",
      "To evaluate: query npm/PyPI/crates.io registry APIs and verify each pinned version is \u22657 days old"
    ],
    "computed"
  );
}
var DEPENDABOT_PATHS = [".github/dependabot.yml", ".github/dependabot.yaml"];
var RENOVATE_PATHS = [
  "renovate.json",
  "renovate.json5",
  ".renovaterc",
  ".renovaterc.json",
  ".github/renovate.json"
];
var AUTOMERGE_ENABLED_RX = /"automerge"\s*:\s*true|automerge:\s*true/;
function detectDependencyAutomationReview(repoPath, _params) {
  const foundFiles = [];
  let automergeEnabled = false;
  for (const relPath of [...DEPENDABOT_PATHS, ...RENOVATE_PATHS]) {
    const full = join9(repoPath, relPath);
    if (!existsSync7(full)) continue;
    foundFiles.push(relPath);
    let content;
    try {
      content = readFileSync8(full, "utf8");
    } catch {
      continue;
    }
    if (AUTOMERGE_ENABLED_RX.test(content)) {
      automergeEnabled = true;
    }
  }
  if (foundFiles.length === 0) {
    return makeResult("FAIL", 0, [
      "no dependency automation configuration found (Dependabot or Renovate) \u2014 automated dependency review not configured"
    ]);
  }
  if (automergeEnabled) {
    return makeResult("WARN", foundFiles.length, [
      "dependency automation configured but automerge is enabled \u2014 updates may merge without human review",
      ...foundFiles.map((f) => `config: ${f}`)
    ]);
  }
  return makeResult("PASS", foundFiles.length, [
    `dependency automation configured with review required: ${foundFiles.join(", ")}`,
    ...foundFiles.map((f) => `config: ${f}`)
  ]);
}
var CI_WORKFLOW_GLOBS = ["*.yml", "*.yaml"];
var VULN_SCANNER_RX = /\b(pip-audit|safety\s|snyk|trivy|grype|osv-scanner|dependency-check|dependabot|audit\s+--json|npm\s+audit|yarn\s+audit|pnpm\s+audit)\b/i;
function detectVulnerabilityScanning(repoPath, _params) {
  const scanners = [];
  for (const ciDir of CI_DIRS) {
    const ciDirPath = join9(repoPath, ciDir);
    if (!existsSync7(ciDirPath)) continue;
    let files = [];
    try {
      files = iterFiles(ciDirPath, CI_WORKFLOW_GLOBS);
    } catch {
      continue;
    }
    for (const f of files) {
      let content;
      try {
        content = readFileSync8(f, "utf8");
      } catch {
        continue;
      }
      const match = content.match(VULN_SCANNER_RX);
      if (match) {
        scanners.push(`${relative8(repoPath, f)} (${match[1]})`);
      }
    }
  }
  for (const p of DEPENDABOT_PATHS) {
    const full = join9(repoPath, p);
    if (!existsSync7(full)) continue;
    let content;
    try {
      content = readFileSync8(full, "utf8");
    } catch {
      continue;
    }
    if (/package-ecosystem/i.test(content)) {
      scanners.push(`${p} (Dependabot security-updates)`);
    }
  }
  if (scanners.length > 0) {
    return makeResult("PASS", scanners.length, [
      `vulnerability scanning configured in ${scanners.length} location(s)`,
      ...scanners.slice(0, 10).map((s) => `scanner: ${s}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no vulnerability scanning found in CI workflows \u2014 add pip-audit, Snyk, Trivy, or Grype to your CI pipeline"
  ]);
}
var OVERRIDE_PACKAGE_JSON_RX = /"(resolutions|overrides)"\s*:/;
var PNPM_OVERRIDES_RX = /"pnpm"\s*:\s*\{[^}]*"overrides"\s*:/s;
function detectDependencyOverrides(repoPath, _params) {
  const foundOverrides = [];
  const pkgJsonFiles = iterFiles(repoPath, ["package.json"]);
  for (const f of pkgJsonFiles) {
    if (f.includes("node_modules")) continue;
    let content;
    try {
      content = readFileSync8(f, "utf8");
    } catch {
      continue;
    }
    if (OVERRIDE_PACKAGE_JSON_RX.test(content) || PNPM_OVERRIDES_RX.test(content)) {
      foundOverrides.push(`${relative8(repoPath, f)}: overrides/resolutions`);
    }
  }
  const cargoFiles = iterFiles(repoPath, ["Cargo.toml"]);
  for (const f of cargoFiles) {
    let content;
    try {
      content = readFileSync8(f, "utf8");
    } catch {
      continue;
    }
    if (/^\[patch\s*\./m.test(content)) {
      foundOverrides.push(`${relative8(repoPath, f)}: [patch.*] section`);
    }
  }
  if (foundOverrides.length === 0) {
    return makeResult("PASS", 0, [
      "no dependency overrides/resolutions/patches found \u2014 clean dependency tree"
    ]);
  }
  return makeResult("WARN", foundOverrides.length, [
    `${foundOverrides.length} dependency override(s) found \u2014 review for suspicious or recently-published pins`,
    ...foundOverrides
  ]);
}
function countPackageJsonDeps(content) {
  let pkg;
  try {
    pkg = JSON.parse(content);
  } catch {
    return 0;
  }
  if (pkg === null || typeof pkg !== "object") return 0;
  const rec = pkg;
  const deps = rec["dependencies"];
  const devDeps = rec["devDependencies"];
  const depCount = deps !== null && typeof deps === "object" ? Object.keys(deps).length : 0;
  const devCount = devDeps !== null && typeof devDeps === "object" ? Object.keys(devDeps).length : 0;
  return depCount + devCount;
}
function countRequirementsDeps(content) {
  return content.split("\n").filter((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith("#") && !t.startsWith("-");
  }).length;
}
function detectDependencyAttackSurface(repoPath, _params) {
  let totalDeps = 0;
  const sources = [];
  const pkgJsonFiles = iterFiles(repoPath, ["package.json"]);
  for (const f of pkgJsonFiles) {
    if (f.includes("node_modules")) continue;
    let content;
    try {
      content = readFileSync8(f, "utf8");
    } catch {
      continue;
    }
    const count = countPackageJsonDeps(content);
    if (count > 0) {
      totalDeps += count;
      sources.push(`${relative8(repoPath, f)}: ${count} deps`);
    }
  }
  const reqFiles = iterFiles(repoPath, ["requirements.txt"]);
  for (const f of reqFiles) {
    let content;
    try {
      content = readFileSync8(f, "utf8");
    } catch {
      continue;
    }
    const count = countRequirementsDeps(content);
    if (count > 0) {
      totalDeps += count;
      sources.push(`${relative8(repoPath, f)}: ${count} entries`);
    }
  }
  const pyprojectFiles2 = iterFiles(repoPath, ["pyproject.toml"]);
  for (const f of pyprojectFiles2) {
    if (sources.some((s) => s.startsWith(relative8(repoPath, f)))) continue;
    let content;
    try {
      content = readFileSync8(f, "utf8");
    } catch {
      continue;
    }
    const specifiers = parsePyprojectDeps(content);
    if (specifiers.length > 0) {
      totalDeps += specifiers.length;
      sources.push(`${relative8(repoPath, f)}: ${specifiers.length} deps`);
    }
  }
  if (totalDeps === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no package manifests found \u2014 dependency attack surface check skipped"],
      "computed"
    );
  }
  if (totalDeps <= 100) {
    return makeResult(
      "PASS",
      totalDeps,
      [
        `${totalDeps} total direct dependencies \u2014 within healthy range (\u2264 100)`,
        ...sources
      ],
      "computed"
    );
  }
  if (totalDeps <= 200) {
    return makeResult(
      "WARN",
      totalDeps,
      [
        `${totalDeps} total direct dependencies \u2014 large attack surface (101\u2013200); review for unused deps`,
        ...sources
      ],
      "computed"
    );
  }
  return makeResult(
    "FAIL",
    totalDeps,
    [
      `${totalDeps} total direct dependencies \u2014 excessive attack surface (> 200); audit and prune`,
      ...sources
    ],
    "computed"
  );
}
var DETECTORS7 = {
  2900: detectScsLockfiles,
  // SCS-01 lockfiles committed
  2901: detectLockfileIntegrity,
  // SCS-02 lockfile integrity hashes
  2902: detectPinnedVersions,
  // SCS-03 pinned dependency versions (detected)
  2903: detectScsQuarantineAge,
  // SCS-04 quarantine age (SKIP — requires live registry)
  2904: detectDependencyAutomationReview,
  // SCS-05 dependency automation with review
  2905: detectVulnerabilityScanning,
  // SCS-06 vulnerability scanning in CI
  2906: detectDependencyOverrides,
  // SCS-07 dependency overrides/patches
  2907: detectDependencyAttackSurface
  // SCS-08 dependency attack surface (computed)
};

// plugins/awos/skills/ai-readiness-audit/detectors/prompt_agent_integrity.ts
import { readFileSync as readFileSync9, existsSync as existsSync8 } from "node:fs";
import { join as join10, relative as relative9 } from "node:path";
import { execFileSync as execFileSync6 } from "node:child_process";
function isInvisibleCodePoint(cp) {
  return cp >= 8203 && cp <= 8207 || cp >= 8232 && cp <= 8238 || cp >= 8288 && cp <= 8303 || cp === 173 || cp === 65279 || cp >= 917504 && cp <= 917631;
}
function countInvisible(content) {
  let count = 0;
  for (const ch of content) {
    const cp = ch.codePointAt(0);
    if (cp !== void 0 && isInvisibleCodePoint(cp)) count++;
  }
  return count;
}
var AGENT_FILE_GLOBS = [
  "CLAUDE.md",
  "AGENTS.md",
  "*.md",
  "*.json",
  "*.sh",
  "*.ts",
  "*.js",
  "*.bash",
  "*.py"
];
function listAgentFiles(repoPath) {
  const results = [];
  for (const name2 of ["CLAUDE.md", "AGENTS.md", ".mcp.json"]) {
    const full = join10(repoPath, name2);
    if (existsSync8(full)) results.push(full);
  }
  const claudeDir = join10(repoPath, ".claude");
  if (existsSync8(claudeDir)) {
    try {
      const files = iterFiles(claudeDir, AGENT_FILE_GLOBS);
      results.push(...files);
    } catch {
    }
  }
  return [...new Set(results)].sort();
}
function detectInvisibleUnicode(repoPath, _params) {
  const agentFiles = listAgentFiles(repoPath);
  if (agentFiles.length === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no AI agent instruction files found \u2014 PAI-01 not applicable"],
      "detected"
    );
  }
  const hitFiles = [];
  for (const filePath of agentFiles) {
    let content;
    try {
      content = readFileSync9(filePath, "utf8");
    } catch {
      continue;
    }
    const count = countInvisible(content);
    if (count > 0) {
      hitFiles.push({ file: relative9(repoPath, filePath), count });
    }
  }
  if (hitFiles.length === 0) {
    return makeResult("PASS", 0, [
      `${agentFiles.length} AI agent file(s) scanned \u2014 no invisible Unicode characters found`
    ]);
  }
  const maxCount = Math.max(...hitFiles.map((h) => h.count));
  const evidence = hitFiles.map(
    (h) => `${h.file}: ${h.count} invisible Unicode code point(s) (U+200B/U+200D/U+FEFF/tag range)`
  );
  if (hitFiles.length >= 3 || maxCount >= 5) {
    return makeResult("FAIL", hitFiles.length, [
      `${hitFiles.length} agent file(s) contain invisible Unicode characters \u2014 potential hidden-instruction attack`,
      ...evidence
    ]);
  }
  return makeResult("WARN", hitFiles.length, [
    `${hitFiles.length} agent file(s) contain invisible Unicode characters \u2014 review for hidden content`,
    ...evidence
  ]);
}
var INJECTION_PATTERNS = [
  {
    name: "override-instructions",
    rx: /ignore\s+(previous|above|all)\s+(instructions?|rules?|guidelines?)/i
  },
  {
    name: "new-instructions-override",
    rx: /^#+ new instructions:|^new system prompt:|^override:\s/im
  },
  {
    name: "exfiltrate-curl",
    rx: /\bcurl\s+https?:\/\/(?!localhost|127\.0\.0\.1)/i
  },
  {
    name: "exfiltrate-post",
    rx: /\b(?:POST|fetch|axios\.post|requests\.post)\s*\(\s*["']https?:\/\/(?!localhost|127\.0\.0\.1)/i
  },
  {
    name: "jailbreak-dan",
    rx: /\b(?:DAN\s+mode|act\s+as\s+DAN|you\s+are\s+now\s+(?:DAN|an\s+AI\s+without))/i
  },
  {
    name: "hidden-html-instruction",
    rx: /<!--\s*(?:ignore|system|override|instruction)/i
  }
];
function detectPromptInjection(repoPath, _params) {
  const agentFiles = listAgentFiles(repoPath);
  if (agentFiles.length === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no AI agent instruction files found \u2014 PAI-02 not applicable"],
      "detected"
    );
  }
  const hits = [];
  for (const filePath of agentFiles) {
    let content;
    try {
      content = readFileSync9(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i2 = 0; i2 < lines.length; i2++) {
      const line = lines[i2];
      for (const { name: name2, rx } of INJECTION_PATTERNS) {
        if (rx.test(line)) {
          hits.push({
            file: relative9(repoPath, filePath),
            line: i2 + 1,
            pattern: name2
          });
          break;
        }
      }
    }
    if (hits.length >= 20) break;
  }
  if (hits.length === 0) {
    return makeResult("PASS", 0, [
      `${agentFiles.length} agent file(s) scanned \u2014 no prompt injection patterns found`
    ]);
  }
  const evidence = hits.slice(0, 10).map((h) => `${h.file}:${h.line} [${h.pattern}]`);
  if (hits.length >= 3) {
    return makeResult("FAIL", hits.length, [
      `${hits.length} prompt injection pattern(s) found in agent instruction files`,
      ...evidence
    ]);
  }
  return makeResult("WARN", hits.length, [
    `${hits.length} possible prompt injection pattern(s) found \u2014 review manually`,
    ...evidence
  ]);
}
var HOOK_RED_FLAGS = [
  {
    name: "exfiltrate-curl-wget",
    rx: /\b(curl|wget)\s+(?:-[a-zA-Z]+\s+)*https?:\/\/(?!localhost|127\.0\.0\.1)/
  },
  {
    name: "eval-exec-dynamic",
    rx: /\beval\s+["'`]?\s*\$[({]/
  },
  {
    name: "base64-pipe-shell",
    rx: /base64\s+(?:-[a-zA-Z]+\s+)?(?:\S+\s+)?[|]\s*(?:sh|bash|zsh|exec)\b/i
  },
  {
    name: "netcat-exfiltration",
    rx: /\b(nc|ncat)\s+(?!-[lL])\S+\s+\d{2,5}/
  },
  {
    name: "download-execute",
    rx: /(?:curl|wget)\s+[^|]*\|\s*(?:sh|bash|zsh|python|node|ruby)/i
  }
];
var HOOK_SCRIPT_GLOBS = ["*.sh", "*.bash", "*.js", "*.ts", "*.py"];
function detectHookScriptSafety(repoPath, _params) {
  const hooksDir = join10(repoPath, ".claude", "hooks");
  if (!existsSync8(hooksDir)) {
    return makeResult(
      "SKIP",
      null,
      ["no .claude/hooks/ directory found \u2014 PAI-03 not applicable"],
      "detected"
    );
  }
  let hookFiles = [];
  try {
    hookFiles = iterFiles(hooksDir, HOOK_SCRIPT_GLOBS);
  } catch {
    hookFiles = [];
  }
  if (hookFiles.length === 0) {
    return makeResult("PASS", 0, [
      "no hook scripts found in .claude/hooks/ \u2014 PAI-03 not applicable"
    ]);
  }
  const flaggedFiles = [];
  for (const filePath of hookFiles) {
    let content;
    try {
      content = readFileSync9(filePath, "utf8");
    } catch {
      continue;
    }
    const flags2 = [];
    for (const { name: name2, rx } of HOOK_RED_FLAGS) {
      if (rx.test(content)) flags2.push(name2);
    }
    if (flags2.length > 0) {
      flaggedFiles.push({ file: relative9(repoPath, filePath), flags: flags2 });
    }
  }
  if (flaggedFiles.length === 0) {
    return makeResult("PASS", hookFiles.length, [
      `${hookFiles.length} hook script(s) scanned \u2014 no exfiltration or obfuscation patterns found`
    ]);
  }
  const evidence = flaggedFiles.map(
    (f) => `${f.file}: suspicious patterns [${f.flags.join(", ")}]`
  );
  if (flaggedFiles.length >= 3) {
    return makeResult("FAIL", flaggedFiles.length, [
      `${flaggedFiles.length} hook script(s) contain exfiltration or obfuscation patterns`,
      ...evidence
    ]);
  }
  return makeResult("WARN", flaggedFiles.length, [
    `${flaggedFiles.length} hook script(s) contain suspicious patterns \u2014 review manually`,
    ...evidence
  ]);
}
var BARE_IP_RX = /https?:\/\/(?!localhost|127\.0\.0\.1)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;
var HTTP_REMOTE_RX = /http:\/\/(?!localhost|127\.0\.0\.1)/;
var EMBEDDED_CRED_RX = /https?:\/\/[^@\s]{3,}:[^@\s]{3,}@/;
var API_KEY_IN_URL_RX = /[?&](?:api_?key|token|secret|password)=[A-Za-z0-9]{8,}/i;
function detectMcpEndpointSafety(repoPath, _params) {
  const mcpPath = join10(repoPath, ".mcp.json");
  if (!existsSync8(mcpPath)) {
    return makeResult("SKIP", null, [
      "no .mcp.json found \u2014 PAI-04 not applicable"
    ]);
  }
  let content;
  try {
    content = readFileSync9(mcpPath, "utf8");
  } catch {
    return makeResult("SKIP", null, [
      ".mcp.json could not be read \u2014 PAI-04 skipped"
    ]);
  }
  const issues = [];
  if (BARE_IP_RX.test(content)) {
    issues.push(
      "bare IP address found in MCP endpoint URL \u2014 use hostname instead"
    );
  }
  if (HTTP_REMOTE_RX.test(content)) {
    issues.push(
      "HTTP (non-HTTPS) remote endpoint found in .mcp.json \u2014 use HTTPS for remote servers"
    );
  }
  if (EMBEDDED_CRED_RX.test(content)) {
    issues.push(
      "embedded credentials (user:pass@host) found in MCP URL \u2014 use environment variables instead"
    );
  }
  if (API_KEY_IN_URL_RX.test(content)) {
    issues.push(
      "API key or token embedded in MCP URL query string \u2014 use environment variables instead"
    );
  }
  if (issues.length === 0) {
    return makeResult("PASS", 1, [
      ".mcp.json uses safe endpoints (HTTPS or localhost only, no embedded credentials)"
    ]);
  }
  return makeResult("FAIL", issues.length, [
    `${issues.length} MCP endpoint safety issue(s) found in .mcp.json`,
    ...issues
  ]);
}
function isGitTracked(repoPath, filePath) {
  try {
    execFileSync6("git", ["ls-files", "--error-unmatch", filePath], {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return true;
  } catch {
    return false;
  }
}
function detectAgentFilesTracked(repoPath, _params) {
  const agentFiles = listAgentFiles(repoPath);
  if (agentFiles.length === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no AI agent instruction files found \u2014 PAI-05 not applicable"],
      "detected"
    );
  }
  try {
    execFileSync6("git", ["rev-parse", "--git-dir"], {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return makeResult("SKIP", null, [
      "not a git repository \u2014 git provenance check (PAI-05) skipped"
    ]);
  }
  const untracked = [];
  const tracked = [];
  for (const filePath of agentFiles) {
    if (isGitTracked(repoPath, filePath)) {
      tracked.push(relative9(repoPath, filePath));
    } else {
      untracked.push(relative9(repoPath, filePath));
    }
  }
  if (untracked.length === 0) {
    return makeResult("PASS", tracked.length, [
      `all ${tracked.length} AI agent file(s) are tracked in git \u2014 auditable change history`
    ]);
  }
  const evidence = untracked.map((f) => `untracked: ${f}`);
  if (untracked.length >= 3) {
    return makeResult("FAIL", untracked.length, [
      `${untracked.length} AI agent file(s) are not tracked in git \u2014 changes bypass code review`,
      ...evidence
    ]);
  }
  return makeResult("WARN", untracked.length, [
    `${untracked.length} AI agent file(s) are not tracked in git \u2014 add to git for auditability`,
    ...evidence
  ]);
}
var BYPASS_PATTERNS = [
  {
    name: "bypass-security",
    rx: /\b(?:bypass|skip|disable|circumvent)\s+(?:security|auth|authentication|authorization|ssl|tls|https?)\b/i
  },
  {
    name: "read-env-secrets",
    rx: /\b(?:cat|read|open|access)\s+\.env\b|read\s+(?:secrets?|credentials?)\b/i
  },
  {
    name: "chmod-world-writable",
    rx: /chmod\s+(?:0?777|a\+rwx|ugo\+rwx)/
  },
  {
    name: "git-no-verify",
    rx: /git\s+commit\s+.*--no-verify|git\s+push\s+.*--no-verify/
  },
  {
    name: "rm-root-destructive",
    rx: /rm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+\/(?:\s|$)|rm\s+-rf\s+\//
  },
  {
    name: "disable-ssl-verify",
    rx: /--no-check-certificate|ssl_verify\s*=\s*false|verify\s*=\s*false|insecure\s+https?/i
  }
];
var COMMAND_SKILL_GLOBS = ["*.md", "*.sh", "*.ts", "*.js", "*.py", "*.bash"];
function detectNoSecurityBypass(repoPath, _params) {
  const commandsDir = join10(repoPath, ".claude", "commands");
  const skillsDir = join10(repoPath, ".claude", "skills");
  const hasCmds = existsSync8(commandsDir);
  const hasSkills = existsSync8(skillsDir);
  if (!hasCmds && !hasSkills) {
    return makeResult(
      "SKIP",
      null,
      [
        "no .claude/commands/ or .claude/skills/ directories found \u2014 PAI-06 not applicable"
      ],
      "detected"
    );
  }
  const allFiles = [];
  for (const dir of [commandsDir, skillsDir]) {
    if (!existsSync8(dir)) continue;
    try {
      allFiles.push(...iterFiles(dir, COMMAND_SKILL_GLOBS));
    } catch {
    }
  }
  const hits = [];
  for (const filePath of allFiles) {
    let content;
    try {
      content = readFileSync9(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i2 = 0; i2 < lines.length; i2++) {
      const line = lines[i2];
      if (/^\s*(#|\/\/|<!--)/.test(line)) continue;
      for (const { name: name2, rx } of BYPASS_PATTERNS) {
        if (rx.test(line)) {
          hits.push({
            file: relative9(repoPath, filePath),
            line: i2 + 1,
            pattern: name2
          });
          break;
        }
      }
    }
    if (hits.length >= 20) break;
  }
  if (hits.length === 0) {
    return makeResult("PASS", allFiles.length, [
      `${allFiles.length} command/skill file(s) scanned \u2014 no security bypass instructions found`
    ]);
  }
  const evidence = hits.slice(0, 10).map((h) => `${h.file}:${h.line} [${h.pattern}]`);
  if (hits.length >= 3) {
    return makeResult("FAIL", hits.length, [
      `${hits.length} security bypass pattern(s) found in command/skill files`,
      ...evidence
    ]);
  }
  return makeResult("WARN", hits.length, [
    `${hits.length} possible security bypass pattern(s) found \u2014 review manually`,
    ...evidence
  ]);
}
var DETECTORS8 = {
  2400: detectInvisibleUnicode,
  // PAI-01 no invisible Unicode in agent files
  2401: detectPromptInjection,
  // PAI-02 no prompt injection patterns
  2402: detectHookScriptSafety,
  // PAI-03 hook script safety (SKIP if no hooks)
  2403: detectMcpEndpointSafety,
  // PAI-04 MCP endpoint safety (SKIP if no .mcp.json)
  2404: detectAgentFilesTracked,
  // PAI-05 agent files tracked in git
  2405: detectNoSecurityBypass
  // PAI-06 no security bypass in commands/skills
};

// plugins/awos/skills/ai-readiness-audit/detectors/quality_assurance.ts
import { readFileSync as readFileSync10, existsSync as existsSync9 } from "node:fs";
import { join as join11, relative as relative10, basename as basename5 } from "node:path";
var TEST_FILE_GLOBS = [
  "*.test.ts",
  "*.test.tsx",
  "*.test.js",
  "*.test.jsx",
  "*.spec.ts",
  "*.spec.tsx",
  "*.spec.js",
  "*.spec.jsx",
  "test_*.py",
  "*_test.py",
  "*_test.go",
  "*_test.java",
  "*Test.java",
  "*Test.kt",
  "*Spec.kt"
];
var SOURCE_FILE_GLOBS = [
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.py",
  "*.go",
  "*.java",
  "*.kt",
  "*.rb",
  "*.php"
];
var SOURCE_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  ".next",
  "target",
  "vendor",
  ".tox"
];
var INTEGRATION_DIR_RX = /\/(integration(?:[_-]?tests?)?|e2e[_-]?tests?|system[_-]?tests?|functional[_-]?tests?)\//i;
var INTEGRATION_FILE_RX = /[_.-](integration|contract|integration_test|it)[._-]/i;
var E2E_CONTENT_RX = /\b(playwright|cypress|puppeteer|selenium|webdriver|nightwatch|testcafe|detox|appium|supertest)\b/i;
var E2E_GLOBS = [
  "playwright.config.ts",
  "playwright.config.js",
  "cypress.json",
  "cypress.config.ts",
  "cypress.config.js",
  "nightwatch.conf.js",
  "wdio.conf.ts",
  "wdio.conf.js",
  "testcafe.config.js"
];
function detectTestInfrastructure(repoPath, _params) {
  let testFiles = [];
  try {
    testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    testFiles = [];
  }
  let allSourceFiles = [];
  try {
    allSourceFiles = iterFiles(repoPath, SOURCE_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    allSourceFiles = [];
  }
  const testFileSet = new Set(testFiles);
  const pureSourceFiles = allSourceFiles.filter((f) => !testFileSet.has(f));
  const testCount = testFiles.length;
  const sourceCount = pureSourceFiles.length;
  if (sourceCount === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no source files found \u2014 test infrastructure check skipped"],
      "computed"
    );
  }
  const ratio = testCount / sourceCount;
  const pct2 = Math.round(ratio * 100);
  const evidence = [
    `${testCount} test file(s) found for ${sourceCount} source module(s) (${pct2}% ratio)`,
    ...testFiles.slice(0, 5).map((f) => `test file: ${relative10(repoPath, f)}`)
  ];
  if (ratio >= 0.6) {
    return makeResult(
      "PASS",
      ratio,
      [
        `test coverage proxy: ${pct2}% \u2014 meaningful tests covering \u2265 60% of source modules`,
        ...evidence
      ],
      "computed"
    );
  }
  if (ratio >= 0.3) {
    return makeResult(
      "WARN",
      ratio,
      [
        `test coverage proxy: ${pct2}% \u2014 partial test coverage (below 60% threshold)`,
        ...evidence
      ],
      "computed"
    );
  }
  return makeResult(
    "FAIL",
    ratio,
    [
      `test coverage proxy: ${pct2}% \u2014 insufficient test coverage (below 30% threshold)`,
      ...evidence
    ],
    "computed"
  );
}
var UNIT_DIR_RX = /\/(unit[_-]?tests?|__tests?__|spec)\//i;
var MOCK_CONTENT_RX = /\b(mock|stub|spy|jest\.fn|MagicMock|unittest\.mock|double|sinon|vitest\.fn)\b/i;
function detectUnitTests(repoPath, _params) {
  let testFiles = [];
  try {
    testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    testFiles = [];
  }
  if (testFiles.length === 0) {
    return makeResult("FAIL", 0, [
      "no test files found \u2014 unit tests not detected"
    ]);
  }
  const unitSignals = [];
  for (const f of testFiles.slice(0, 50)) {
    const rel = relative10(repoPath, f);
    if (UNIT_DIR_RX.test("/" + rel)) {
      unitSignals.push(`unit dir: ${rel}`);
      continue;
    }
    let content;
    try {
      content = readFileSync10(f, "utf8");
    } catch {
      continue;
    }
    if (MOCK_CONTENT_RX.test(content)) {
      unitSignals.push(`mock/stub patterns in: ${rel}`);
    }
  }
  const evidence = unitSignals.length > 0 ? unitSignals.slice(0, 10) : testFiles.slice(0, 5).map((f) => `test file: ${relative10(repoPath, f)}`);
  return makeResult("PASS", testFiles.length, [
    `${testFiles.length} test file(s) found \u2014 unit test tier detected`,
    ...evidence
  ]);
}
var INTEGRATION_CONTENT_RX = /(?:\bimport\s+(?:httpx|asyncpg|psycopg(?:2)?|testcontainers)\b|\bfrom\s+(?:httpx|asyncpg|psycopg(?:2)?|sqlalchemy|testcontainers|fastapi\.testclient|starlette\.testclient)\s+import\b|\b(?:TestContainers?|testcontainers|DatabaseTestCase|IntegrationTest|@SpringBootTest|@DataJpaTest|httptest\.NewServer|requests\.get|requests\.post|httpx\.get|httpx\.post|httpx\.AsyncClient|httpx\.Client|asyncpg\.connect|asyncpg\.create_pool|psycopg2?\.connect|create_engine|sessionmaker|AsyncSession|TestClient|ASGITransport|supertest|axios\.get|fetch\()\b)/i;
var INTEGRATION_FILE_NAME_RX = /integration|contract|system[_-]test/i;
var TEST_DOCKER_GLOBS = ["docker-compose*.yml", "docker-compose*.yaml"];
function detectIntegrationTests(repoPath, _params) {
  const signals = [];
  let allTestFiles = [];
  try {
    allTestFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    allTestFiles = [];
  }
  for (const f of allTestFiles) {
    const rel = relative10(repoPath, f);
    if (INTEGRATION_DIR_RX.test("/" + rel)) {
      signals.push(`integration dir: ${rel}`);
    }
    if (INTEGRATION_FILE_NAME_RX.test(basename5(f))) {
      signals.push(`integration file name: ${rel}`);
    }
    if (signals.length >= 5) break;
  }
  if (signals.length < 5) {
    for (const f of allTestFiles.slice(0, 100)) {
      let content;
      try {
        content = readFileSync10(f, "utf8");
      } catch {
        continue;
      }
      if (INTEGRATION_CONTENT_RX.test(content)) {
        signals.push(`integration patterns in: ${relative10(repoPath, f)}`);
        if (signals.length >= 5) break;
      }
    }
  }
  if (signals.length < 5) {
    let confFiles = [];
    try {
      confFiles = iterFiles(repoPath, ["conftest.py"], SOURCE_IGNORE);
    } catch {
      confFiles = [];
    }
    for (const f of confFiles.slice(0, 20)) {
      let content;
      try {
        content = readFileSync10(f, "utf8");
      } catch {
        continue;
      }
      if (INTEGRATION_CONTENT_RX.test(content)) {
        signals.push(`integration patterns in: ${relative10(repoPath, f)}`);
        if (signals.length >= 5) break;
      }
    }
  }
  const testsDir = join11(repoPath, "tests");
  const testDir2 = join11(repoPath, "test");
  for (const tDir of [testsDir, testDir2]) {
    if (!existsSync9(tDir)) continue;
    let dcFiles = [];
    try {
      dcFiles = iterFiles(tDir, TEST_DOCKER_GLOBS);
    } catch {
      dcFiles = [];
    }
    if (dcFiles.length > 0) {
      signals.push(
        `docker-compose in tests dir: ${relative10(repoPath, dcFiles[0])}`
      );
    }
  }
  if (signals.length === 0) {
    return makeResult("FAIL", 0, [
      "no integration test signals found \u2014 add tests that exercise real databases, HTTP calls, or message queues"
    ]);
  }
  return makeResult("PASS", signals.length, [
    `integration test tier detected (${signals.length} signal(s))`,
    ...signals.slice(0, 10)
  ]);
}
var E2E_DIR_RX = /\/(e2e[_-]?tests?|acceptance[_-]?tests?|ui[_-]?tests?)\//i;
function detectE2ETests(repoPath, _params) {
  const signals = [];
  for (const glob of E2E_GLOBS) {
    const matches = iterFiles(repoPath, [glob]);
    if (matches.length > 0) {
      signals.push(`E2E config: ${relative10(repoPath, matches[0])}`);
    }
  }
  let testFiles = [];
  try {
    testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    testFiles = [];
  }
  for (const f of testFiles) {
    const rel = relative10(repoPath, f);
    if (E2E_DIR_RX.test("/" + rel)) {
      signals.push(`e2e dir: ${rel}`);
      if (signals.length >= 5) break;
    }
  }
  if (signals.length < 5) {
    for (const f of testFiles.slice(0, 100)) {
      let content;
      try {
        content = readFileSync10(f, "utf8");
      } catch {
        continue;
      }
      if (E2E_CONTENT_RX.test(content)) {
        signals.push(`E2E framework in: ${relative10(repoPath, f)}`);
        if (signals.length >= 5) break;
      }
    }
  }
  if (signals.length === 0) {
    return makeResult("FAIL", 0, [
      "no end-to-end test signals found \u2014 add E2E tests with Playwright, Cypress, or similar"
    ]);
  }
  return makeResult("PASS", signals.length, [
    `E2E test tier detected (${signals.length} signal(s))`,
    ...signals.slice(0, 10)
  ]);
}
function detectTestPyramid(repoPath, _params) {
  let testFiles = [];
  try {
    testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    testFiles = [];
  }
  if (testFiles.length === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no test files found \u2014 pyramid shape not computable"],
      "computed"
    );
  }
  let unitCount = 0;
  let integrationCount = 0;
  let e2eCount = 0;
  for (const f of testFiles) {
    const rel = "/" + relative10(repoPath, f);
    if (E2E_DIR_RX.test(rel)) {
      e2eCount++;
      continue;
    }
    if (INTEGRATION_DIR_RX.test(rel) || INTEGRATION_FILE_RX.test(basename5(f))) {
      integrationCount++;
      continue;
    }
    let isE2E = false;
    try {
      const content = readFileSync10(f, "utf8");
      isE2E = E2E_CONTENT_RX.test(content);
    } catch {
    }
    if (isE2E) {
      e2eCount++;
    } else {
      unitCount++;
    }
  }
  const evidence = [
    `unit: ${unitCount} | integration: ${integrationCount} | e2e: ${e2eCount}`
  ];
  const unitDominates = unitCount > integrationCount;
  const e2eSmallest = e2eCount === 0 || integrationCount >= e2eCount;
  if (unitDominates && e2eSmallest) {
    return makeResult(
      "PASS",
      unitCount,
      [`test pyramid shape is healthy`, ...evidence],
      "computed"
    );
  }
  if (!unitDominates && unitCount > 0) {
    return makeResult(
      "WARN",
      integrationCount,
      [
        `test pyramid may be inverted \u2014 integration (${integrationCount}) meets or exceeds unit (${unitCount})`,
        ...evidence
      ],
      "computed"
    );
  }
  return makeResult(
    "FAIL",
    0,
    [
      `test pyramid is inverted \u2014 unit (${unitCount}) is not the largest tier`,
      ...evidence
    ],
    "computed"
  );
}
var COVERAGE_CONFIG_FILES = [
  ".nycrc",
  ".nycrc.json",
  ".c8rc",
  ".coveragerc",
  "codecov.yml",
  ".codecov.yml",
  "jest.config.ts",
  "jest.config.js",
  "jest.config.json",
  "vitest.config.ts",
  "vitest.config.js"
];
var COVERAGE_CONTENT_RX = /coverageThreshold|coverage[_-]?report|coverage[_-]?min|(?:\[tool\.coverage)|codecov|nyc|c8\b|--coverage\b/i;
function detectCoverageConfig(repoPath, _params) {
  const signals = [];
  for (const name2 of COVERAGE_CONFIG_FILES) {
    const full = join11(repoPath, name2);
    if (existsSync9(full)) {
      signals.push(`coverage config: ${name2}`);
    }
  }
  const pkgJson = join11(repoPath, "package.json");
  if (existsSync9(pkgJson)) {
    let content;
    try {
      content = readFileSync10(pkgJson, "utf8");
    } catch {
      content = "";
    }
    if (COVERAGE_CONTENT_RX.test(content)) {
      signals.push("coverage settings in package.json");
    }
  }
  for (const name2 of ["pyproject.toml", "setup.cfg"]) {
    const full = join11(repoPath, name2);
    if (!existsSync9(full)) continue;
    let content;
    try {
      content = readFileSync10(full, "utf8");
    } catch {
      continue;
    }
    if (/\[tool\.coverage|coverage_report|coveragerc/i.test(content)) {
      signals.push(`coverage config in ${name2}`);
    }
  }
  if (signals.length > 0) {
    return makeResult("PASS", signals.length, [
      `coverage measurement configured (${signals.length} signal(s))`,
      ...signals
    ]);
  }
  return makeResult("FAIL", 0, [
    "no test coverage configuration found \u2014 add jest/vitest coverage, .coveragerc, or codecov"
  ]);
}
var FIXTURE_DIR_NAMES = [
  "fixtures",
  "testdata",
  "test-data",
  "test_data",
  "__fixtures__",
  "factories",
  "factory"
];
var FACTORY_CONTENT_RX = /\b(factory_boy|FactoryGirl|FactoryBot|faker|Faker|TestDataBuilder|test[_-]?factory|data[_-]?builder|use_factory|create_factory|generate_fake)\b/i;
var CONFTEST_GLOBS = ["conftest.py", "test_helpers.*", "test-helpers.*"];
function detectTestDataManagement(repoPath, _params) {
  const signals = [];
  for (const name2 of FIXTURE_DIR_NAMES) {
    const full = join11(repoPath, name2);
    if (existsSync9(full)) {
      signals.push(`fixture directory: ${name2}/`);
      break;
    }
    for (const testRoot of ["test", "tests", "__tests__"]) {
      const nested = join11(repoPath, testRoot, name2);
      if (existsSync9(nested)) {
        signals.push(`fixture directory: ${testRoot}/${name2}/`);
        break;
      }
    }
    if (signals.length > 0) break;
  }
  let testFiles = [];
  try {
    testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    testFiles = [];
  }
  for (const f of testFiles.slice(0, 80)) {
    let content;
    try {
      content = readFileSync10(f, "utf8");
    } catch {
      continue;
    }
    if (FACTORY_CONTENT_RX.test(content)) {
      signals.push(`factory/faker patterns in: ${relative10(repoPath, f)}`);
      if (signals.length >= 3) break;
    }
  }
  const confFiles = iterFiles(repoPath, CONFTEST_GLOBS, SOURCE_IGNORE);
  if (confFiles.length > 0) {
    signals.push(`test setup/helper file: ${relative10(repoPath, confFiles[0])}`);
  }
  if (signals.length > 0) {
    return makeResult("PASS", signals.length, [
      `structured test data management detected (${signals.length} signal(s))`,
      ...signals
    ]);
  }
  return makeResult("FAIL", 0, [
    "no structured test data management found \u2014 add fixtures/ directory, factory patterns, or conftest.py"
  ]);
}
var MOCK_IMPORT_RX = /\b(?:jest\.mock|vi\.mock|sinon|mockery|unittest\.mock|from\s+unittest\s+import\s+mock|from\s+unittest\.mock|pytest[_-]mock|testify\/mock|mockito|EasyMock|Mockery|mocker\.patch|mock\.patch|@MockBean|@Mock\b)\b/i;
function detectMockingIsolation(repoPath, _params) {
  let testFiles = [];
  try {
    testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    testFiles = [];
  }
  if (testFiles.length === 0) {
    return makeResult("FAIL", 0, [
      "no test files found \u2014 mocking/isolation not detectable"
    ]);
  }
  const signals = [];
  for (const f of testFiles.slice(0, 100)) {
    let content;
    try {
      content = readFileSync10(f, "utf8");
    } catch {
      continue;
    }
    if (MOCK_IMPORT_RX.test(content)) {
      signals.push(`mock/stub usage in: ${relative10(repoPath, f)}`);
      if (signals.length >= 5) break;
    }
  }
  if (signals.length > 0) {
    return makeResult("PASS", signals.length, [
      `mocking/stubbing patterns detected in ${signals.length} test file(s)`,
      ...signals
    ]);
  }
  return makeResult("FAIL", 0, [
    "no mocking/stubbing patterns found in test files \u2014 tests may have real I/O dependencies"
  ]);
}
var CONTRACT_CONFIG_GLOBS = ["pact.config.*", "*.pact.ts", "*.pact.js"];
var CONTRACT_DIR_NAMES = ["pacts", "contracts", "contract-tests"];
var CONTRACT_CONTENT_RX = /\b(?:Pact|pact|PactV[23]|InteractionBuilder|spring[_-]cloud[_-]contract|provider[_-]?verification|consumer[_-]?contract|@PactTestFor|@Provider|messageProvider)\b/i;
function detectContractTests(repoPath, _params) {
  const signals = [];
  const contractConfigs = iterFiles(
    repoPath,
    CONTRACT_CONFIG_GLOBS,
    SOURCE_IGNORE
  );
  if (contractConfigs.length > 0) {
    signals.push(`contract config: ${relative10(repoPath, contractConfigs[0])}`);
  }
  for (const name2 of CONTRACT_DIR_NAMES) {
    if (existsSync9(join11(repoPath, name2))) {
      signals.push(`contract directory: ${name2}/`);
      break;
    }
  }
  if (signals.length < 3) {
    let testFiles = [];
    try {
      testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
    } catch {
      testFiles = [];
    }
    for (const f of testFiles.slice(0, 100)) {
      let content;
      try {
        content = readFileSync10(f, "utf8");
      } catch {
        continue;
      }
      if (CONTRACT_CONTENT_RX.test(content)) {
        signals.push(`Pact/contract patterns in: ${relative10(repoPath, f)}`);
        if (signals.length >= 3) break;
      }
    }
  }
  if (signals.length > 0) {
    return makeResult("PASS", signals.length, [
      `contract testing detected (${signals.length} signal(s))`,
      ...signals
    ]);
  }
  return makeResult("FAIL", 0, [
    "no consumer-driven contract test signals found \u2014 add Pact or Spring Cloud Contract for multi-service verification"
  ]);
}
var ML_SOURCE_RX = /\b(?:sklearn|torch|tensorflow|keras|transformers|xgboost|lightgbm|catboost|mlflow|pandas|numpy)\b/i;
var ML_TEST_CONTENT_RX = /\b(?:assert.*(?:accuracy|f1[_-]score|precision|recall|rmse|mae|auc|roc_auc)|evidently|deepchecks|great_expectations|mlflow\.evaluate|ModelCard|alibi|check_model|model_performance)\b/i;
var ML_TEST_FILE_RX = /(?:test[_-]model|model[_-]test|test[_-]ml|ml[_-]test|test[_-]metrics)/i;
function detectMlIterationTests(repoPath, _params) {
  let hasML = false;
  const sourceSample = iterFiles(
    repoPath,
    ["*.py", "*.ipynb"],
    SOURCE_IGNORE
  ).slice(0, 50);
  for (const f of sourceSample) {
    let content;
    try {
      content = readFileSync10(f, "utf8");
    } catch {
      continue;
    }
    if (ML_SOURCE_RX.test(content)) {
      hasML = true;
      break;
    }
  }
  if (!hasML) {
    return makeResult(
      "SKIP",
      null,
      ["no ML framework usage detected \u2014 QA-10 not applicable"],
      "detected"
    );
  }
  const signals = [];
  let testFiles = [];
  try {
    testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
  } catch {
    testFiles = [];
  }
  for (const f of testFiles.slice(0, 100)) {
    const rel = relative10(repoPath, f);
    if (ML_TEST_FILE_RX.test(basename5(f))) {
      signals.push(`ML test file: ${rel}`);
      if (signals.length >= 5) break;
    }
    let content;
    try {
      content = readFileSync10(f, "utf8");
    } catch {
      continue;
    }
    if (ML_TEST_CONTENT_RX.test(content)) {
      signals.push(`ML quality assertions in: ${rel}`);
      if (signals.length >= 5) break;
    }
  }
  if (signals.length > 0) {
    return makeResult("PASS", signals.length, [
      `ML iteration testing detected (${signals.length} signal(s))`,
      ...signals
    ]);
  }
  return makeResult("FAIL", 0, [
    "ML framework detected but no quality metric testing found \u2014 add evidently, deepchecks, or assert metric thresholds"
  ]);
}
var DETECTORS9 = {
  2500: detectTestInfrastructure,
  // QA-01 test infrastructure + coverage proxy (computed)
  2501: detectUnitTests,
  // QA-02 unit test tier (detected)
  2502: detectIntegrationTests,
  // QA-03 integration test tier (detected)
  2503: detectE2ETests,
  // QA-04 E2E test tier (detected)
  2504: detectTestPyramid,
  // QA-05 pyramid shape (computed)
  2505: detectCoverageConfig,
  // QA-06 coverage reporting config (detected)
  2506: detectTestDataManagement,
  // QA-07 test data management (detected)
  2507: detectMockingIsolation,
  // QA-08 test isolation/mocking (detected)
  2508: detectContractTests,
  // QA-09 contract testing (detected)
  2509: detectMlIterationTests
  // QA-10 ML iteration testing (detected)
};

// plugins/awos/skills/ai-readiness-audit/detectors/documentation.ts
import { readFileSync as readFileSync11, existsSync as existsSync10, readdirSync as readdirSync5 } from "node:fs";
import { join as join12, relative as relative11, dirname as dirname2 } from "node:path";
var README_NAMES = [
  "README.md",
  "README.rst",
  "README.txt",
  "Readme.md",
  "readme.md"
];
var SETUP_CONTENT_RX = /\b(install|setup|usage|getting[_\s-]started|quick[_\s-]start|run|build|deploy|prerequisite|requirement)\b/i;
var HEADING_RX = /^#+ |\n#+ |^[=\-~^"'`]+\s*$/m;
function detectRootReadme(repoPath, _params) {
  let readmePath = null;
  for (const name2 of README_NAMES) {
    const full = join12(repoPath, name2);
    if (existsSync10(full)) {
      readmePath = full;
      break;
    }
  }
  if (!readmePath) {
    return makeResult("FAIL", 0, [
      "no README file found at repository root \u2014 a new developer has no entry point"
    ]);
  }
  let content;
  try {
    content = readFileSync11(readmePath, "utf8");
  } catch {
    return makeResult("WARN", 0, [
      `README found but could not be read: ${relative11(repoPath, readmePath)}`
    ]);
  }
  const relPath = relative11(repoPath, readmePath);
  if (content.length <= 200) {
    return makeResult("WARN", content.length, [
      `${relPath} is too short (${content.length} bytes) \u2014 missing setup instructions`
    ]);
  }
  if (!SETUP_CONTENT_RX.test(content)) {
    return makeResult("WARN", content.length, [
      `${relPath} exists but contains no setup/install/usage instructions`
    ]);
  }
  if (!HEADING_RX.test(content)) {
    return makeResult("WARN", content.length, [
      `${relPath} lacks a Markdown heading structure \u2014 may not be well-organised`
    ]);
  }
  return makeResult("PASS", content.length, [
    `${relPath} present with headings and setup instructions (${content.length} bytes)`
  ]);
}
var SKIP_DIRS = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  ".next",
  "target",
  "vendor",
  ".github",
  ".claude",
  ".awos",
  "docs",
  "doc",
  "assets",
  "static",
  "public",
  "resources"
]);
var SERVICE_SOURCE_GLOBS = [
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.py",
  "*.go",
  "*.java",
  "*.kt"
];
function detectServiceReadmes(repoPath, _params) {
  let topDirs = [];
  try {
    const entries = readdirSync5(repoPath, { withFileTypes: true });
    topDirs = entries.filter(
      (e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith(".")
    ).map((e) => e.name).sort();
  } catch {
    topDirs = [];
  }
  if (topDirs.length === 0) {
    return makeResult("SKIP", null, [
      "no top-level service directories found \u2014 single-service project, DOC-02 not applicable"
    ]);
  }
  const serviceDirs = [];
  for (const dirName of topDirs) {
    const dirPath = join12(repoPath, dirName);
    let srcFiles = [];
    try {
      srcFiles = iterFiles(dirPath, SERVICE_SOURCE_GLOBS, [
        "node_modules",
        ".venv",
        "__pycache__",
        "dist",
        "build",
        "target"
      ]);
    } catch {
      srcFiles = [];
    }
    if (srcFiles.length < 5) continue;
    const hasReadme = existsSync10(join12(dirPath, "README.md"));
    serviceDirs.push({ path: dirPath, name: dirName, hasReadme });
  }
  if (serviceDirs.length === 0) {
    return makeResult("SKIP", null, [
      "no multi-service directory structure detected \u2014 DOC-02 not applicable"
    ]);
  }
  const withReadme = serviceDirs.filter((d) => d.hasReadme);
  const ratio = withReadme.length / serviceDirs.length;
  const evidence = [
    `${withReadme.length}/${serviceDirs.length} service directories have README.md`,
    ...serviceDirs.map(
      (d) => `${d.name}/: ${d.hasReadme ? "README present" : "README MISSING"}`
    )
  ];
  if (ratio >= 0.8) {
    return makeResult("PASS", withReadme.length, evidence);
  }
  if (ratio >= 0.5) {
    return makeResult("WARN", withReadme.length, [
      `only ${withReadme.length}/${serviceDirs.length} service directories have README.md`,
      ...evidence.slice(1)
    ]);
  }
  return makeResult("FAIL", withReadme.length, [
    `only ${withReadme.length}/${serviceDirs.length} service directories have README.md \u2014 most are missing docs`,
    ...evidence.slice(1)
  ]);
}
var API_DOC_GLOBS = [
  "openapi.yaml",
  "openapi.yml",
  "openapi.json",
  "swagger.yaml",
  "swagger.yml",
  "swagger.json",
  "asyncapi.yaml",
  "asyncapi.yml",
  "api-docs.yaml",
  "api-docs.json"
];
var API_SOURCE_RX = /\b(@RestController|@app\.route|@router\.|router\.get|router\.post|app\.get|app\.post|FastAPI\(|express\(\)|flask\.Flask\(|gin\.Default\(|chi\.NewRouter|http\.HandleFunc)\b/i;
var AUTO_DOCS_RX = /FastAPI\(|app\s*=\s*FastAPI\(|springdoc|springfox/i;
function detectApiDocs(repoPath, _params) {
  const apiSourceFiles = iterFiles(
    repoPath,
    ["*.py", "*.ts", "*.js", "*.java", "*.kt", "*.go"],
    [
      "node_modules",
      ".venv",
      "__pycache__",
      "dist",
      "build",
      "target",
      "tests",
      "test"
    ]
  );
  let hasApiSource = false;
  for (const f of apiSourceFiles.slice(0, 100)) {
    let content;
    try {
      content = readFileSync11(f, "utf8");
    } catch {
      continue;
    }
    if (API_SOURCE_RX.test(content)) {
      hasApiSource = true;
      break;
    }
  }
  if (!hasApiSource) {
    return makeResult("SKIP", null, [
      "no API source patterns detected \u2014 DOC-03 not applicable"
    ]);
  }
  const signals = [];
  const apiDocFiles = iterFiles(repoPath, API_DOC_GLOBS);
  if (apiDocFiles.length > 0) {
    signals.push(
      ...apiDocFiles.slice(0, 5).map((f) => `API spec: ${relative11(repoPath, f)}`)
    );
  }
  for (const f of apiSourceFiles.slice(0, 50)) {
    let content;
    try {
      content = readFileSync11(f, "utf8");
    } catch {
      continue;
    }
    if (AUTO_DOCS_RX.test(content)) {
      signals.push(`auto-docs framework in: ${relative11(repoPath, f)}`);
      break;
    }
  }
  if (signals.length > 0) {
    return makeResult("PASS", signals.length, [
      `API documentation present (${signals.length} signal(s))`,
      ...signals
    ]);
  }
  return makeResult("FAIL", 0, [
    "API source detected but no API documentation found \u2014 add OpenAPI/Swagger spec or use FastAPI auto-docs"
  ]);
}
var MAKE_TARGET_RX = /`make\s+([a-zA-Z0-9_-]+)`|\bmake\s+([a-zA-Z0-9_-]+)\b/g;
var MAKEFILE_TARGET_RX = /^([a-zA-Z0-9_-][a-zA-Z0-9_.-]*):/gm;
var LOCAL_LINK_RX = /\[(?:[^\]]+)\]\((?!https?:\/\/)(?!#)([^)]+)\)/g;
var BACKTICK_PATH_RX = /`((?:\.\/|\.\.\/|\/)[^`\s]+)`/g;
function extractMakeTargets(readmeContent) {
  const targets = /* @__PURE__ */ new Set();
  let m;
  MAKE_TARGET_RX.lastIndex = 0;
  while ((m = MAKE_TARGET_RX.exec(readmeContent)) !== null) {
    const target = m[1] ?? m[2];
    if (target && target !== "install" && target.length > 0) {
      targets.add(target);
    }
  }
  return [...targets].sort();
}
function loadMakefileTargets(repoPath) {
  const makefileNames = ["Makefile", "makefile", "GNUmakefile"];
  for (const name2 of makefileNames) {
    const full = join12(repoPath, name2);
    if (!existsSync10(full)) continue;
    let content;
    try {
      content = readFileSync11(full, "utf8");
    } catch {
      continue;
    }
    const targets = /* @__PURE__ */ new Set();
    let m;
    MAKEFILE_TARGET_RX.lastIndex = 0;
    while ((m = MAKEFILE_TARGET_RX.exec(content)) !== null) {
      targets.add(m[1]);
    }
    return targets;
  }
  return /* @__PURE__ */ new Set();
}
function extractLocalLinks(readmeContent) {
  const links = [];
  let m;
  LOCAL_LINK_RX.lastIndex = 0;
  while ((m = LOCAL_LINK_RX.exec(readmeContent)) !== null) {
    const target = m[1].split("#")[0].trim();
    if (target.length > 0) links.push(target);
  }
  BACKTICK_PATH_RX.lastIndex = 0;
  while ((m = BACKTICK_PATH_RX.exec(readmeContent)) !== null) {
    const p = m[1].trim();
    if (p.length > 0) links.push(p);
  }
  return [...new Set(links)].sort();
}
function detectDocsAccuracy(repoPath, _params) {
  const readmePath = join12(repoPath, "README.md");
  if (!existsSync10(readmePath)) {
    return makeResult("SKIP", null, [
      "no README.md found \u2014 docs accuracy check (DOC-04) skipped"
    ]);
  }
  let readmeContent;
  try {
    readmeContent = readFileSync11(readmePath, "utf8");
  } catch {
    return makeResult("SKIP", null, [
      "README.md could not be read \u2014 DOC-04 skipped"
    ]);
  }
  const missing = [];
  const present = [];
  const makeTargetsInReadme = extractMakeTargets(readmeContent);
  if (makeTargetsInReadme.length > 0) {
    const makefileTargets = loadMakefileTargets(repoPath);
    const hasMakefile = existsSync10(join12(repoPath, "Makefile")) || existsSync10(join12(repoPath, "makefile")) || existsSync10(join12(repoPath, "GNUmakefile"));
    for (const target of makeTargetsInReadme) {
      if (!hasMakefile) {
        missing.push({ kind: "make-target", ref: `make ${target}` });
      } else if (!makefileTargets.has(target)) {
        missing.push({ kind: "make-target", ref: `make ${target}` });
      } else {
        present.push({ kind: "make-target", ref: `make ${target}` });
      }
    }
  }
  const localLinks = extractLocalLinks(readmeContent);
  for (const link of localLinks) {
    const readmeDir = dirname2(readmePath);
    const resolved = join12(readmeDir, link);
    if (existsSync10(resolved)) {
      present.push({ kind: "path", ref: link });
    } else {
      missing.push({ kind: "path", ref: link });
    }
  }
  if (missing.length === 0) {
    return makeResult("PASS", present.length, [
      `${present.length} README reference(s) verified \u2014 all referenced items exist`,
      ...present.slice(0, 10).map((r) => `verified: ${r.ref}`)
    ]);
  }
  const evidence = missing.map((r) => `missing: ${r.ref} (${r.kind})`);
  if (missing.length <= 2) {
    return makeResult("WARN", missing.length, [
      `${missing.length} README reference(s) point to non-existent items \u2014 docs may be stale`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", missing.length, [
    `${missing.length} README reference(s) point to non-existent items \u2014 documentation is out of date`,
    ...evidence
  ]);
}
var DETECTORS10 = {
  2200: detectRootReadme,
  // DOC-01 root README with substance (detected)
  2201: detectServiceReadmes,
  // DOC-02 service-level READMEs (detected)
  2202: detectApiDocs,
  // DOC-03 API documentation (detected)
  2203: detectDocsAccuracy
  // DOC-04 docs accuracy via referenced path existence
};

// plugins/awos/skills/ai-readiness-audit/detectors/application_security.ts
import { readFileSync as readFileSync12 } from "node:fs";
import { relative as relative12 } from "node:path";
var TLS_CONFIG_GLOBS = [
  "*.env",
  "*.env.*",
  "*.yaml",
  "*.yml",
  "*.toml",
  "*.ini",
  "*.cfg",
  "*.conf",
  "*.json"
];
var PLAIN_HTTP_STRICT_RX = /http:\/\/((?!localhost|127\.|0\.0\.0\.0|::1)[a-zA-Z0-9\-._]+)/i;
var TLS_CONFIG_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  ".next",
  "target",
  "fixtures",
  "testdata",
  "__tests__",
  "test",
  "tests",
  "docs",
  "vendor"
];
function detectTlsEnforced(repoPath, _params) {
  const plainHttpHits = [];
  const files = iterFiles(repoPath, TLS_CONFIG_GLOBS, TLS_CONFIG_IGNORE);
  for (const filePath of files) {
    let content;
    try {
      content = readFileSync12(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i2 = 0; i2 < lines.length; i2++) {
      const line = lines[i2];
      if (/^\s*(#|\/\/|\/\*|<!--)/.test(line)) continue;
      if (/example|template|placeholder|localhost|127\.|your[_-]/i.test(line))
        continue;
      if (PLAIN_HTTP_STRICT_RX.test(line)) {
        plainHttpHits.push({
          file: relative12(repoPath, filePath),
          line: i2 + 1,
          text: line.trim().slice(0, 100)
        });
      }
    }
    if (plainHttpHits.length >= 10) break;
  }
  if (plainHttpHits.length === 0) {
    return makeResult("PASS", 1, [
      "no plain-HTTP (http://) service URLs found in config files \u2014 TLS appears enforced"
    ]);
  }
  const evidence = plainHttpHits.map(
    (h) => `${h.file}:${h.line} plain-HTTP URL: ${h.text}`
  );
  if (plainHttpHits.length <= 2) {
    return makeResult("WARN", plainHttpHits.length, [
      `${plainHttpHits.length} plain-HTTP URL(s) found \u2014 review whether they are production service URLs`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", plainHttpHits.length, [
    `${plainHttpHits.length} plain-HTTP service URL(s) found \u2014 enforce HTTPS for all non-local origins`,
    ...evidence
  ]);
}
var HEADER_GLOBS = [
  "*.py",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.go",
  "*.java",
  "*.kt",
  "*.rb",
  "*.php",
  "*.conf",
  "*.yaml",
  "*.yml",
  "*.toml",
  "*.nginx",
  "*.htaccess",
  "Caddyfile"
];
var SECURITY_HEADERS = [
  {
    name: "X-Content-Type-Options",
    rx: /x[_-]?content[_-]?type[_-]?options/i
  },
  { name: "X-Frame-Options", rx: /x[_-]?frame[_-]?options/i },
  {
    name: "Strict-Transport-Security",
    rx: /strict[_-]?transport[_-]?security|HSTS/i
  }
];
function detectSecurityHeaders(repoPath, _params) {
  const found = [];
  for (const { name: name2, rx } of SECURITY_HEADERS) {
    const hits = grep(repoPath, rx, HEADER_GLOBS);
    if (hits.length > 0) {
      found.push(name2);
    }
  }
  if (found.length >= 2) {
    return makeResult("PASS", found.length, [
      `${found.length} of ${SECURITY_HEADERS.length} security headers configured: ${found.join(", ")}`,
      ...found.map((h) => `header configured: ${h}`)
    ]);
  }
  if (found.length === 1) {
    const missing = SECURITY_HEADERS.filter((h) => !found.includes(h.name)).map(
      (h) => h.name
    );
    return makeResult("WARN", found.length, [
      `only ${found.length} security header found (${found[0]}) \u2014 add ${missing.join(", ")}`,
      ...missing.map((h) => `missing header: ${h}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    `no HTTP security headers (${SECURITY_HEADERS.map((h) => h.name).join(", ")}) found in source \u2014 configure them in your framework middleware or reverse proxy`
  ]);
}
var CORS_GLOBS = [
  "*.py",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.go",
  "*.java",
  "*.kt",
  "*.rb",
  "*.php",
  "*.conf",
  "*.yaml",
  "*.yml",
  "*.toml",
  "*.json"
];
var CORS_WILDCARD_RX = /(?:cors[_-]?(?:allowed[_-]?)?origins?|origins?|allow(?:ed)?[_-]?origins?|access.control.allow.origin)[^=\n]{0,30}=\s*\[?\s*['"]?\s*\*\s*['"]?\s*\]?/i;
var CORS_SCOPED_RX = /(?:origins?|allow(?:ed)?_origins?|access.control.allow.origin|cors)[^=\n]{0,30}=\s*['"\[{]?\s*https?:\/\//i;
function detectCorsNotWildcard(repoPath, _params) {
  const wildcardHits = [];
  const scopedHits = [];
  const files = iterFiles(repoPath, CORS_GLOBS);
  for (const filePath of files) {
    let content;
    try {
      content = readFileSync12(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i2 = 0; i2 < lines.length; i2++) {
      const line = lines[i2];
      if (/^\s*(#|\/\/|\/\*)/.test(line)) continue;
      if (CORS_WILDCARD_RX.test(line)) {
        wildcardHits.push({
          file: relative12(repoPath, filePath),
          line: i2 + 1,
          text: line.trim().slice(0, 120)
        });
      } else if (CORS_SCOPED_RX.test(line)) {
        scopedHits.push({
          file: relative12(repoPath, filePath),
          line: i2 + 1,
          text: line.trim().slice(0, 120)
        });
      }
    }
  }
  if (wildcardHits.length > 0) {
    return makeResult("FAIL", wildcardHits.length, [
      `${wildcardHits.length} wildcard CORS origin ('*') found \u2014 restrict to specific allowed origins`,
      ...wildcardHits.slice(0, 5).map((h) => `${h.file}:${h.line} ${h.text}`)
    ]);
  }
  if (scopedHits.length > 0) {
    return makeResult("PASS", scopedHits.length, [
      `CORS is configured with scoped origins (not '*')`,
      ...scopedHits.slice(0, 3).map((h) => `${h.file}:${h.line} ${h.text}`)
    ]);
  }
  return makeResult("PASS", 0, [
    "no CORS wildcard origin found \u2014 either CORS is not configured or origins are restricted"
  ]);
}
var SQL_GLOBS = [
  "*.py",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.go",
  "*.java",
  "*.kt",
  "*.rb",
  "*.php"
];
var STRING_SQL_PATTERNS = [
  // Python: cursor.execute("..." + var) or cursor.execute("..." % var)
  /(?:execute|query)\s*\(\s*["'].*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)[^"']*["']\s*\+/i,
  // Python: f-string SQL with variable interpolation
  /(?:execute|query)\s*\(\s*f["'].*(?:SELECT|INSERT|UPDATE|DELETE|WHERE).*\{[^}]+\}/i,
  // JavaScript/TypeScript: db.query("..." + var)
  /(?:db|pool|conn|client|connection)\.(?:query|execute|run)\s*\(\s*["'`].*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)[^"'`]*["'`]\s*\+/i,
  // Template literal SQL with interpolation
  /(?:db|pool|conn|client|connection)\.(?:query|execute|run)\s*\(\s*`.*(?:SELECT|INSERT|UPDATE|DELETE|WHERE).*\$\{[^}]+\}/i,
  // Generic: "SELECT * FROM ... WHERE id=" + variable
  /["']SELECT[^"']*WHERE[^"']*=["']\s*\+/i
];
function detectParameterizedSql(repoPath, _params) {
  const hits = [];
  const files = iterFiles(repoPath, SQL_GLOBS);
  for (const filePath of files) {
    let content;
    try {
      content = readFileSync12(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i2 = 0; i2 < lines.length; i2++) {
      const line = lines[i2];
      if (/^\s*(#|\/\/|\/\*)/.test(line)) continue;
      if (/test|spec|mock|fixture|fake/i.test(
        relative12(repoPath, filePath).toLowerCase()
      ))
        continue;
      for (const pat of STRING_SQL_PATTERNS) {
        if (pat.test(line)) {
          hits.push({
            file: relative12(repoPath, filePath),
            line: i2 + 1,
            text: line.trim().slice(0, 120)
          });
          break;
        }
      }
      if (hits.length >= 15) break;
    }
    if (hits.length >= 15) break;
  }
  if (hits.length === 0) {
    return makeResult("PASS", 0, [
      "no string-concatenated SQL query patterns found \u2014 parameterized queries appear to be used"
    ]);
  }
  const evidence = hits.slice(0, 8).map((h) => `${h.file}:${h.line} possible string-built SQL: ${h.text}`);
  if (hits.length <= 2) {
    return makeResult("WARN", hits.length, [
      `${hits.length} possible string-built SQL pattern(s) found \u2014 review for injection risk`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", hits.length, [
    `${hits.length} string-concatenated SQL query pattern(s) found \u2014 use parameterized queries or an ORM`,
    ...evidence
  ]);
}
var APPSEC_SOURCE_GLOBS = [
  "*.py",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.go",
  "*.java",
  "*.kt",
  "*.rb",
  "*.php",
  "*.yaml",
  "*.yml",
  "*.toml",
  "*.ini",
  "*.cfg",
  "*.conf",
  "*.json"
];
var APPSEC_SECRET_PATTERNS = [
  // AWS access keys
  /AKIA[0-9A-Z]{16}/,
  // Generic key/secret/token/password assignments with non-trivial values
  /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|credential|private[_-]?key|client[_-]?secret)\s*[:=]\s*["']([A-Za-z0-9/+\-_.@]{12,})["']/i,
  // JWT secrets
  /jwt[_-]?secret\s*[:=]\s*["'][^"']{8,}["']/i,
  // Database connection strings with embedded passwords
  /(?:postgresql|mysql|mongodb|redis):\/\/[^:]+:[^@]{6,}@/i
];
var APPSEC_PLACEHOLDER_RX = /test|fake|example|dummy|xxx|your[_-]|placeholder|changeme|replace|<[^>]+>|\$\{[^}]+\}|env\(|process\.env|os\.environ|getenv|ENV\[|config\[/i;
var APPSEC_SECRET_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  ".next",
  "target",
  "vendor",
  "fixtures",
  "testdata",
  "__tests__",
  "test",
  "tests"
];
function detectNoHardcodedSecrets(repoPath, _params) {
  const files = iterFiles(repoPath, APPSEC_SOURCE_GLOBS, APPSEC_SECRET_IGNORE);
  const hits = [];
  for (const filePath of files) {
    let content;
    try {
      content = readFileSync12(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i2 = 0; i2 < lines.length; i2++) {
      const line = lines[i2];
      if (/^\s*(#|\/\/|\/\*)/.test(line)) continue;
      if (APPSEC_PLACEHOLDER_RX.test(line)) continue;
      for (const pat of APPSEC_SECRET_PATTERNS) {
        if (!pat.test(line)) continue;
        hits.push({
          file: relative12(repoPath, filePath),
          line: i2 + 1,
          pattern: pat.source.slice(0, 40)
        });
        break;
      }
    }
    if (hits.length >= 20) break;
  }
  if (hits.length === 0) {
    return makeResult("PASS", 0, [
      "no hardcoded secret patterns found in source files"
    ]);
  }
  const evidence = hits.slice(0, 8).map((h) => `${h.file}:${h.line} possible secret (pattern: ${h.pattern})`);
  if (hits.length <= 2) {
    return makeResult("WARN", hits.length, [
      `${hits.length} possible hardcoded secret(s) found \u2014 review manually`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", hits.length, [
    `${hits.length} possible hardcoded secret(s) found in committed files`,
    ...evidence
  ]);
}
var ROUTE_GLOBS = [
  "*.py",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.go",
  "*.rb",
  "*.java",
  "*.kt",
  "*.php"
];
var MUTATION_ROUTE_RX = /(?:@(?:app|router|blueprint|api)\.(?:post|put|patch|delete)|router\.(?:post|put|patch|delete)|app\.(?:post|put|patch|delete)|Route\("(?:POST|PUT|PATCH|DELETE)"|\[HttpPost\]|\[HttpPut\]|\[HttpPatch\]|\[HttpDelete\]|\.post\s*\(|\.put\s*\(|\.patch\s*\(|\.delete\s*\()/i;
var AUTH_DECORATOR_RX = /(?:@(?:login_required|auth_required|requires_auth|authenticated|jwt_required|permission_required|IsAuthenticated|Authorize|AuthGuard|UseGuards|Protected|authenticate|require_login|authenticate_user)|authenticate\s*\(|auth\.required|isAuthenticated|requireAuth|authMiddleware|bearerAuth|apiKeyAuth|jwt\.verify|verifyToken|checkAuth)/i;
function detectAuthOnMutations(repoPath, _params) {
  const filesWithMutations = [];
  const filesWithAuth = [];
  const files = iterFiles(repoPath, ROUTE_GLOBS);
  for (const filePath of files) {
    const rel = relative12(repoPath, filePath);
    if (/test|spec|mock|fixture/i.test(rel.toLowerCase())) continue;
    let content;
    try {
      content = readFileSync12(filePath, "utf8");
    } catch {
      continue;
    }
    const hasMutation = MUTATION_ROUTE_RX.test(content);
    const hasAuth = AUTH_DECORATOR_RX.test(content);
    if (hasMutation) filesWithMutations.push(rel);
    if (hasMutation && hasAuth) filesWithAuth.push(rel);
  }
  if (filesWithMutations.length === 0) {
    return makeResult("SKIP", 0, [
      "no mutation route definitions (POST/PUT/PATCH/DELETE) found \u2014 auth-on-mutations check skipped"
    ]);
  }
  const coverage = filesWithAuth.length / filesWithMutations.length;
  if (coverage >= 0.7) {
    return makeResult("PASS", filesWithAuth.length, [
      `auth decorators/middleware found in ${filesWithAuth.length}/${filesWithMutations.length} files with mutation routes`,
      ...filesWithAuth.slice(0, 5).map((f) => `auth + mutations: ${f}`)
    ]);
  }
  if (coverage >= 0.3) {
    return makeResult("WARN", filesWithAuth.length, [
      `auth found in only ${filesWithAuth.length}/${filesWithMutations.length} mutation route files \u2014 some endpoints may be unprotected`,
      ...filesWithMutations.filter((f) => !filesWithAuth.includes(f)).slice(0, 5).map((f) => `mutation routes without auth: ${f}`)
    ]);
  }
  return makeResult("FAIL", filesWithAuth.length, [
    `auth decorators/middleware absent from ${filesWithMutations.length - filesWithAuth.length}/${filesWithMutations.length} files with mutation routes`,
    ...filesWithMutations.filter((f) => !filesWithAuth.includes(f)).slice(0, 8).map((f) => `no auth detected: ${f}`)
  ]);
}
var AUTH_GLOBS = [
  "*.py",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.go",
  "*.java",
  "*.kt",
  "*.rb",
  "*.php"
];
var STRONG_HASH_RX = /\b(?:bcrypt|argon2|scrypt|passlib|ph\.hash)\b/i;
var WEAK_HASH_RX = /\b(?:pbkdf2|sha256|sha512)\b.{0,40}(?:password|passwd|hash)/i;
var INSECURE_HASH_RX = /\b(?:md5|sha1)\b.{0,40}(?:password|passwd|hash)/i;
var SESSION_CSPRNG_RX = /(?:secrets\.token|os\.urandom|crypto\.randomBytes|SecureRandom|rand\.Read|Random\.new)/i;
function detectPasswordSessionHygiene(repoPath, _params) {
  let strongHashFound = false;
  let weakHashFound = false;
  let insecureHashFound = false;
  let csprngFound = false;
  const evidence = [];
  const files = iterFiles(repoPath, AUTH_GLOBS);
  for (const filePath of files) {
    const rel = relative12(repoPath, filePath);
    if (/test|spec|mock|fixture/i.test(rel.toLowerCase())) continue;
    let content;
    try {
      content = readFileSync12(filePath, "utf8");
    } catch {
      continue;
    }
    if (STRONG_HASH_RX.test(content)) {
      strongHashFound = true;
      evidence.push(`strong hash algorithm: ${rel}`);
    }
    if (WEAK_HASH_RX.test(content)) {
      weakHashFound = true;
      evidence.push(`weaker hash algorithm: ${rel}`);
    }
    if (INSECURE_HASH_RX.test(content)) {
      insecureHashFound = true;
      evidence.push(`insecure hash for password: ${rel}`);
    }
    if (SESSION_CSPRNG_RX.test(content)) {
      csprngFound = true;
      evidence.push(`CSPRNG session token: ${rel}`);
    }
  }
  const hasAnySignal = strongHashFound || weakHashFound || insecureHashFound || csprngFound;
  if (!hasAnySignal) {
    return makeResult("SKIP", 0, [
      "no password-hashing or session-token patterns found \u2014 hygiene check skipped (may not apply to this project)"
    ]);
  }
  if (insecureHashFound) {
    return makeResult("FAIL", 0, [
      "MD5 or SHA1 used for password hashing \u2014 use bcrypt, argon2, or scrypt",
      ...evidence.filter((e) => e.startsWith("insecure"))
    ]);
  }
  if (strongHashFound) {
    return makeResult("PASS", 1, [
      "strong password hashing algorithm (bcrypt/argon2/scrypt) found",
      ...evidence.slice(0, 5)
    ]);
  }
  return makeResult("WARN", 0, [
    "only weaker hashing algorithms found \u2014 prefer bcrypt, argon2, or scrypt over pbkdf2/sha256 for passwords",
    ...evidence.slice(0, 5)
  ]);
}
var HANDLER_GLOBS = [
  "*.py",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.go",
  "*.java",
  "*.kt",
  "*.rb",
  "*.php"
];
var VALIDATION_LIBRARY_RX = /\b(?:pydantic|marshmallow|cerberus|voluptuous|wtforms|validator\.js|joi|yup|zod|class-validator|validate\.js|express-validator|@IsString|@IsInt|@IsEmail|@Min|@Max|@Length|@NotNull|@Valid|@Validated|javax\.validation|jakarta\.validation|ActiveRecord::Base\.validates|validates\s*:|govalidator|ozzo-validation)\b/i;
var MANUAL_VALIDATION_RX = /(?:isinstance\s*\(|typeof\s+\w+\s*===|request\.args\.get|request\.form\.get|req\.body\.|params\[|sanitize|escape\s*\()/i;
function detectInputValidation(repoPath, _params) {
  let libraryFound = false;
  let manualFound = false;
  const evidence = [];
  const files = iterFiles(repoPath, HANDLER_GLOBS);
  for (const filePath of files) {
    const rel = relative12(repoPath, filePath);
    if (/test|spec|mock|fixture/i.test(rel.toLowerCase())) continue;
    let content;
    try {
      content = readFileSync12(filePath, "utf8");
    } catch {
      continue;
    }
    if (VALIDATION_LIBRARY_RX.test(content)) {
      libraryFound = true;
      evidence.push(`validation library: ${rel}`);
    } else if (MANUAL_VALIDATION_RX.test(content)) {
      manualFound = true;
    }
  }
  if (!libraryFound && !manualFound) {
    return makeResult("SKIP", 0, [
      "no input-validation patterns found \u2014 check skipped (may be handled at infrastructure level)"
    ]);
  }
  if (libraryFound) {
    return makeResult("PASS", 1, [
      "input validation library or decorator found",
      ...evidence.slice(0, 5)
    ]);
  }
  return makeResult("WARN", 0, [
    "only manual input validation signals found \u2014 consider using a validation library (Pydantic, Zod, class-validator, etc.)"
  ]);
}
var RATE_LIMIT_RX = /\b(?:rate[_-]?limit|throttle|slowDown|express-rate-limit|django[_-]?ratelimit|flask[_-]?limiter|Limiter|ratelimiter|redis[_-]?throttle|@Throttle|@RateLimit|Throttling|UserRateThrottle|AnonRateThrottle)\b/i;
var RATE_CONFIG_GLOBS = [
  "*.py",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.go",
  "*.yaml",
  "*.yml",
  "*.toml",
  "*.conf"
];
function detectRateLimiting(repoPath, _params) {
  const hits = grep(repoPath, RATE_LIMIT_RX, RATE_CONFIG_GLOBS);
  if (hits.length > 0) {
    return makeResult("PASS", hits.length, [
      `rate-limiting configuration found in ${hits.length} location(s)`,
      ...hits.slice(0, 5).map((h) => `${h.file}:${h.line} ${h.text}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no rate-limiting library or configuration found \u2014 add rate limiting to authentication and public endpoints"
  ]);
}
var DETECTORS11 = {
  3e3: detectTlsEnforced,
  // AS-01 TLS enforced
  3001: detectSecurityHeaders,
  // AS-02 security headers present
  3002: detectCorsNotWildcard,
  // AS-03 CORS not wildcard
  3003: detectParameterizedSql,
  // AS-04 parameterized SQL
  3004: detectNoHardcodedSecrets,
  // AS-05 no hardcoded secrets
  3005: detectAuthOnMutations,
  // AS-06 auth on state-changing endpoints
  3006: detectPasswordSessionHygiene,
  // AS-07 password/session hygiene
  3007: detectInputValidation,
  // AS-08 input validation present
  3008: detectRateLimiting
  // AS-09 rate limiting
  // 3009: judgment — authorization correctness (no detector)
  // 3010: judgment — insecure design review (no detector)
};

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g1_tooling_depth.ts
import { readFileSync as readFileSync14, existsSync as existsSync12 } from "node:fs";
import { join as join14 } from "node:path";

// plugins/awos/skills/ai-readiness-audit/metrics/_base.ts
import { readFileSync as readFileSync13 } from "node:fs";
function loadStandards(path) {
  return parse(readFileSync13(path, "utf8"));
}
function computeReliability(defaultTag, sourcesUsed, sourcesMissing) {
  if (sourcesMissing.length === 0) {
    return { tag: defaultTag, confidence: "HIGH", note: null };
  }
  if (sourcesUsed.length > 0) {
    return {
      tag: defaultTag,
      confidence: "MED",
      note: `missing sources: ${sourcesMissing.join(", ")}`
    };
  }
  return {
    tag: defaultTag,
    confidence: "LOW",
    note: `missing sources: ${sourcesMissing.join(", ")}`
  };
}
function makeMetricResult(metric, value, kind, categoriesAwarded, reliability, sourcesUsed, sourcesMissing, band = null, valueSeries) {
  const result = {
    metric,
    value,
    kind,
    band,
    categories_awarded: [...categoriesAwarded],
    reliability,
    sources_used: [...sourcesUsed],
    sources_missing: [...sourcesMissing],
    status: sourcesUsed.length === 0 ? "SKIP" : "OK"
  };
  if (valueSeries !== void 0) {
    result.value_series = valueSeries;
  }
  return result;
}
function capBucketsByHistory(buckets, maxDays, bucketDays) {
  if (maxDays <= 0 || bucketDays <= 0) return buckets;
  const maxBuckets = Math.floor(maxDays / bucketDays);
  if (maxBuckets <= 0) return [];
  if (buckets.length <= maxBuckets) return buckets;
  return buckets.slice(buckets.length - maxBuckets);
}
function awardCategories(standards, metricName, predicateCtx) {
  const categoryTable = standards["category"];
  if (!categoryTable) return [];
  const awarded = [];
  for (const cat of Object.values(categoryTable)) {
    if (cat["metric"] !== metricName) continue;
    const appliesWhen = cat["applies_when"];
    if (!appliesWhen || appliesWhen === "always") {
      awarded.push(cat["code"]);
      continue;
    }
    const topologyMatch = appliesWhen.match(/^topology\.(.+)$/);
    if (topologyMatch) {
      const flag = topologyMatch[1];
      if (predicateCtx[flag]) {
        awarded.push(cat["code"]);
      }
    }
  }
  return awarded;
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g1_tooling_depth.ts
var TOOLING_MAP = [
  { paths: ["CLAUDE.md", "AGENTS.md"], code: 101 },
  { paths: [".claude/skills"], code: 102 },
  { paths: [".claude/commands"], code: 103 },
  { paths: [".claude/hooks"], code: 104 },
  { paths: [".mcp.json"], code: 105 },
  // Code 106: spec signals — context/, .awos/, or scripts/ in tooling_paths
  // (git collector does not include these but we detect them via the paths list)
  {
    paths: ["context/", ".awos/", "scripts/", "context", ".awos", "scripts"],
    code: 106
  }
];
var ALL_CODES = TOOLING_MAP.map((e) => e.code);
function compute(collectedDir, _standards, _topology) {
  const gitPath = join14(collectedDir, "git.json");
  if (!existsSync12(gitPath)) {
    return makeMetricResult(
      "adp_g1_tooling_depth",
      null,
      "coverage",
      [],
      computeReliability("maximal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync14(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || !Array.isArray(raw.tooling_paths)) {
    return makeMetricResult(
      "adp_g1_tooling_depth",
      null,
      "coverage",
      [],
      computeReliability("maximal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const toolingPaths = raw.tooling_paths;
  const awarded = [];
  for (const entry of TOOLING_MAP) {
    const present = entry.paths.some(
      (p) => toolingPaths.some((tp) => tp === p || tp.startsWith(p.replace(/\/$/, "")))
    );
    if (present) {
      awarded.push(entry.code);
    }
  }
  const coverage = ALL_CODES.length > 0 ? awarded.length / ALL_CODES.length : 0;
  const reliability = computeReliability("maximal", ["git"], []);
  return makeMetricResult(
    "adp_g1_tooling_depth",
    coverage,
    "coverage",
    awarded,
    reliability,
    ["git"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g2_contributors.ts
import { readFileSync as readFileSync15, existsSync as existsSync13 } from "node:fs";
import { join as join15 } from "node:path";
function compute2(collectedDir, _standards, _topology) {
  const gitPath = join15(collectedDir, "git.json");
  if (!existsSync13(gitPath)) {
    return makeMetricResult(
      "adp_g2_contributors",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync15(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || !Array.isArray(raw.monthly_buckets) || raw.monthly_buckets.length === 0) {
    return makeMetricResult(
      "adp_g2_contributors",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const historyAvailableDays = artifact?.period?.history_available_days ?? 0;
  const bucketDays = artifact?.period?.bucket_days ?? 30;
  const allBuckets = raw.monthly_buckets;
  const buckets = capBucketsByHistory(
    allBuckets,
    historyAvailableDays,
    bucketDays
  );
  const avg = buckets.reduce((sum, b) => sum + (b.authors ?? 0), 0) / buckets.length;
  const value_series = buckets.map((b) => ({
    bucket_start: b.bucket_start,
    value: b.authors ?? null
  }));
  const reliability = computeReliability("not-reliable", ["git"], []);
  return makeMetricResult(
    "adp_g2_contributors",
    avg,
    "computed",
    [201],
    reliability,
    ["git"],
    [],
    null,
    value_series
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g3_deploy_frequency.ts
import { readFileSync as readFileSync16, existsSync as existsSync14 } from "node:fs";
import { join as join16 } from "node:path";
function doraDeployBand(mergesPerWeek) {
  if (mergesPerWeek >= 7) return "elite";
  if (mergesPerWeek >= 1) return "high";
  if (mergesPerWeek >= 0.25) return "medium";
  return "low";
}
function compute3(collectedDir, _standards, _topology) {
  const gitPath = join16(collectedDir, "git.json");
  if (!existsSync14(gitPath)) {
    return makeMetricResult(
      "adp_g3_deploy_frequency",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync16(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || !Array.isArray(raw.monthly_buckets) || raw.monthly_buckets.length === 0) {
    return makeMetricResult(
      "adp_g3_deploy_frequency",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const bucketDays = artifact?.period?.bucket_days ?? 30;
  const historyAvailableDays = artifact?.period?.history_available_days ?? 0;
  const allBuckets = raw.monthly_buckets;
  const buckets = capBucketsByHistory(
    allBuckets,
    historyAvailableDays,
    bucketDays
  );
  const totalMerges = buckets.reduce((sum, b) => sum + (b.merges ?? 0), 0);
  const totalDays = buckets.length * bucketDays;
  const totalWeeks = totalDays / 7;
  const mergesPerWeek = totalWeeks > 0 ? totalMerges / totalWeeks : 0;
  const band = doraDeployBand(mergesPerWeek);
  const reliability = computeReliability("not-reliable", ["git"], []);
  const bucketWeeks = bucketDays / 7;
  const value_series = buckets.map((b) => ({
    bucket_start: b.bucket_start,
    value: bucketWeeks > 0 ? (b.merges ?? 0) / bucketWeeks : null
  }));
  return makeMetricResult(
    "adp_g3_deploy_frequency",
    mergesPerWeek,
    "banded",
    [301],
    reliability,
    ["git"],
    [],
    band,
    value_series
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g4_lead_time.ts
import { readFileSync as readFileSync17, existsSync as existsSync15 } from "node:fs";
import { join as join17 } from "node:path";
function median(sorted) {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}
function doraLeadTimeBand(hours) {
  if (hours < 24) return "elite";
  if (hours < 168) return "high";
  if (hours < 720) return "medium";
  return "low";
}
function compute4(collectedDir, _standards, _topology) {
  const gitPath = join17(collectedDir, "git.json");
  if (!existsSync15(gitPath)) {
    return makeMetricResult(
      "adp_g4_lead_time",
      null,
      "banded",
      [],
      computeReliability("minimal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync17(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || !Array.isArray(raw.merge_records) || raw.merge_records.length === 0) {
    return makeMetricResult(
      "adp_g4_lead_time",
      null,
      "banded",
      [],
      computeReliability("minimal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const records = raw.merge_records;
  const leadTimesHours = [];
  for (const r of records) {
    const mergedAt = new Date(r.merged_at).getTime();
    const firstCommit = new Date(r.branch_first_commit_at).getTime();
    if (isNaN(mergedAt) || isNaN(firstCommit)) continue;
    const diffHours = (mergedAt - firstCommit) / 36e5;
    if (diffHours >= 0) {
      leadTimesHours.push(diffHours);
    }
  }
  if (leadTimesHours.length === 0) {
    return makeMetricResult(
      "adp_g4_lead_time",
      null,
      "banded",
      [],
      computeReliability("minimal", [], ["git"]),
      [],
      ["git"]
    );
  }
  leadTimesHours.sort((a, b) => a - b);
  const medianHours = median(leadTimesHours);
  const band = doraLeadTimeBand(medianHours);
  const reliability = computeReliability("minimal", ["git"], []);
  const historyAvailableDays = artifact?.period?.history_available_days ?? 0;
  const bucketDays = artifact?.period?.bucket_days ?? 30;
  const bucketMs = bucketDays * 864e5;
  const value_series = [];
  if (Array.isArray(raw.monthly_buckets) && raw.monthly_buckets.length > 0) {
    const allBuckets = raw.monthly_buckets;
    const cappedBuckets = capBucketsByHistory(
      allBuckets,
      historyAvailableDays,
      bucketDays
    );
    for (const bucket of cappedBuckets) {
      const bucketStart = new Date(bucket.bucket_start).getTime();
      const bucketEnd = bucketStart + bucketMs;
      const bucketLeadTimes = [];
      for (const r of records) {
        const mergedAt = new Date(r.merged_at).getTime();
        if (isNaN(mergedAt) || mergedAt <= bucketStart || mergedAt > bucketEnd)
          continue;
        const firstCommit = new Date(r.branch_first_commit_at).getTime();
        if (isNaN(firstCommit)) continue;
        const diffHours = (mergedAt - firstCommit) / 36e5;
        if (diffHours >= 0) bucketLeadTimes.push(diffHours);
      }
      bucketLeadTimes.sort((a, b) => a - b);
      value_series.push({
        bucket_start: bucket.bucket_start,
        value: bucketLeadTimes.length > 0 ? median(bucketLeadTimes) : null
      });
    }
  }
  return makeMetricResult(
    "adp_g4_lead_time",
    medianHours,
    "banded",
    [401],
    reliability,
    ["git"],
    [],
    band,
    value_series.length > 0 ? value_series : void 0
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g5_pr_cycle_time.ts
import { readFileSync as readFileSync18, existsSync as existsSync16 } from "node:fs";
import { join as join18 } from "node:path";
function median2(sorted) {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}
function doraCycleTimeBand(hours) {
  if (hours < 24) return "elite";
  if (hours < 168) return "high";
  if (hours < 720) return "medium";
  return "low";
}
function compute5(collectedDir, _standards, _topology) {
  const gitPath = join18(collectedDir, "git.json");
  if (!existsSync16(gitPath)) {
    return makeMetricResult(
      "adp_g5_pr_cycle_time",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync18(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || !Array.isArray(raw.merge_records) || raw.merge_records.length === 0) {
    return makeMetricResult(
      "adp_g5_pr_cycle_time",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const records = raw.merge_records;
  const cycleTimesHours = [];
  for (const r of records) {
    const mergedAt = new Date(r.merged_at).getTime();
    const firstCommit = new Date(r.branch_first_commit_at).getTime();
    if (isNaN(mergedAt) || isNaN(firstCommit)) continue;
    const diffHours = (mergedAt - firstCommit) / 36e5;
    if (diffHours >= 0) {
      cycleTimesHours.push(diffHours);
    }
  }
  if (cycleTimesHours.length === 0) {
    return makeMetricResult(
      "adp_g5_pr_cycle_time",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  cycleTimesHours.sort((a, b) => a - b);
  const medianHours = median2(cycleTimesHours);
  const band = doraCycleTimeBand(medianHours);
  const reliability = computeReliability("not-reliable", ["git"], []);
  const historyAvailableDays = artifact?.period?.history_available_days ?? 0;
  const bucketDays = artifact?.period?.bucket_days ?? 30;
  const bucketMs = bucketDays * 864e5;
  const value_series = [];
  if (Array.isArray(raw.monthly_buckets) && raw.monthly_buckets.length > 0) {
    const allBuckets = raw.monthly_buckets;
    const cappedBuckets = capBucketsByHistory(
      allBuckets,
      historyAvailableDays,
      bucketDays
    );
    for (const bucket of cappedBuckets) {
      const bucketStart = new Date(bucket.bucket_start).getTime();
      const bucketEnd = bucketStart + bucketMs;
      const bucketCycleTimes = [];
      for (const r of records) {
        const mergedAt = new Date(r.merged_at).getTime();
        if (isNaN(mergedAt) || mergedAt <= bucketStart || mergedAt > bucketEnd)
          continue;
        const firstCommit = new Date(r.branch_first_commit_at).getTime();
        if (isNaN(firstCommit)) continue;
        const diffHours = (mergedAt - firstCommit) / 36e5;
        if (diffHours >= 0) bucketCycleTimes.push(diffHours);
      }
      bucketCycleTimes.sort((a, b) => a - b);
      value_series.push({
        bucket_start: bucket.bucket_start,
        value: bucketCycleTimes.length > 0 ? median2(bucketCycleTimes) : null
      });
    }
  }
  return makeMetricResult(
    "adp_g5_pr_cycle_time",
    medianHours,
    "banded",
    [501],
    reliability,
    ["git"],
    [],
    band,
    value_series.length > 0 ? value_series : void 0
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g6_churn.ts
import { readFileSync as readFileSync19, existsSync as existsSync17 } from "node:fs";
import { join as join19 } from "node:path";
function compute6(collectedDir, _standards, _topology) {
  const gitPath = join19(collectedDir, "git.json");
  if (!existsSync17(gitPath)) {
    return makeMetricResult(
      "adp_g6_churn",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync19(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || typeof raw.numstat_totals !== "object" || raw.numstat_totals === null) {
    return makeMetricResult(
      "adp_g6_churn",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const { added, deleted } = raw.numstat_totals;
  const totalChurn = (added ?? 0) + (deleted ?? 0);
  const reliability = computeReliability("not-reliable", ["git"], []);
  return makeMetricResult(
    "adp_g6_churn",
    totalChurn,
    "computed",
    [601],
    reliability,
    ["git"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g7_change_fail_rate.ts
import { readFileSync as readFileSync20, existsSync as existsSync18 } from "node:fs";
import { join as join20 } from "node:path";
function doraChangeFailBand(rate) {
  if (rate < 0.05) return "elite";
  if (rate < 0.1) return "high";
  if (rate < 0.15) return "medium";
  return "low";
}
function compute7(collectedDir, _standards, _topology) {
  const gitPath = join20(collectedDir, "git.json");
  if (!existsSync18(gitPath)) {
    return makeMetricResult(
      "adp_g7_change_fail_rate",
      null,
      "banded",
      [],
      computeReliability("minimal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync20(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || typeof raw.total_merges !== "number" || raw.total_merges === 0) {
    return makeMetricResult(
      "adp_g7_change_fail_rate",
      null,
      "banded",
      [],
      computeReliability("minimal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const totalMerges = raw.total_merges;
  const revertMerges = raw.revert_merges ?? 0;
  const rate = revertMerges / totalMerges;
  const band = doraChangeFailBand(rate);
  const reliability = computeReliability("minimal", ["git"], []);
  return makeMetricResult(
    "adp_g7_change_fail_rate",
    rate,
    "banded",
    [701],
    reliability,
    ["git"],
    [],
    band
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g8_review_rework.ts
import { readFileSync as readFileSync21, existsSync as existsSync19 } from "node:fs";
import { join as join21 } from "node:path";
function compute8(collectedDir, _standards, _topology) {
  const gitPath = join21(collectedDir, "git.json");
  if (!existsSync19(gitPath)) {
    return makeMetricResult(
      "adp_g8_review_rework",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync21(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || !Array.isArray(raw.merge_records) || raw.merge_records.length === 0) {
    return makeMetricResult(
      "adp_g8_review_rework",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["git"]),
      [],
      ["git"]
    );
  }
  const totalMerges = raw.merge_records.length;
  const totalCommits = raw.total_commits ?? 0;
  const commitsPerPr = totalMerges > 0 ? totalCommits / totalMerges : 0;
  const reworkProxy = Math.max(0, commitsPerPr - 1);
  const reliability = computeReliability("not-reliable", ["git"], []);
  return makeMetricResult(
    "adp_g8_review_rework",
    reworkProxy,
    "computed",
    [801],
    reliability,
    ["git"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g9_ai_attribution.ts
import { readFileSync as readFileSync22, existsSync as existsSync20 } from "node:fs";
import { join as join22 } from "node:path";
function compute9(collectedDir, _standards, _topology) {
  const gitPath = join22(collectedDir, "git.json");
  if (!existsSync20(gitPath)) {
    return makeMetricResult(
      "adp_g9_ai_attribution",
      null,
      "computed",
      [],
      computeReliability("minimal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const artifact = JSON.parse(readFileSync22(gitPath, "utf8"));
  const raw = artifact?.raw;
  if (!raw || typeof raw.total_commits !== "number" || raw.total_commits === 0) {
    return makeMetricResult(
      "adp_g9_ai_attribution",
      null,
      "computed",
      [],
      computeReliability("minimal", [], ["git"]),
      [],
      ["git"]
    );
  }
  const totalCommits = raw.total_commits;
  const aiMarkedCommits = raw.ai_marked_commits ?? 0;
  const attributionRate = aiMarkedCommits / totalCommits;
  const reliability = computeReliability("minimal", ["git"], []);
  return makeMetricResult(
    "adp_g9_ai_attribution",
    attributionRate,
    "computed",
    [901],
    reliability,
    ["git"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_c1_ci_pass_rate.ts
import { readFileSync as readFileSync23, existsSync as existsSync21 } from "node:fs";
import { join as join23 } from "node:path";
function ciPassBand(rate) {
  if (rate >= 0.99) return "elite";
  if (rate >= 0.95) return "high";
  if (rate >= 0.9) return "medium";
  return "low";
}
function countSuccessful(runs) {
  return runs.filter((r) => {
    const rec = r;
    return rec["conclusion"] === "success";
  }).length;
}
function compute10(collectedDir, standards, topology) {
  const ciPath = join23(collectedDir, "ci.json");
  if (!existsSync21(ciPath)) {
    return makeMetricResult(
      "adp_c1_ci_pass_rate",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["ci"]),
      [],
      ["ci"]
    );
  }
  const artifact = JSON.parse(readFileSync23(ciPath, "utf8"));
  if (!artifact?.available) {
    return makeMetricResult(
      "adp_c1_ci_pass_rate",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["ci"]),
      [],
      ["ci"]
    );
  }
  const raw = artifact?.raw ?? {};
  const runs = Array.isArray(raw.runs) ? raw.runs : [];
  const configDetected = Boolean(raw.config_detected);
  if (runs.length === 0) {
    const categories2 = awardCategories(
      standards,
      "adp_c1_ci_pass_rate",
      topology
    );
    const reliability2 = computeReliability("not-reliable", ["ci"], []);
    const partialReliability = {
      tag: reliability2.tag,
      confidence: "MED",
      note: configDetected ? "CI config detected but no run data available; pass rate cannot be computed" : "CI source available but no run data available; pass rate cannot be computed"
    };
    return makeMetricResult(
      "adp_c1_ci_pass_rate",
      null,
      "banded",
      categories2,
      partialReliability,
      ["ci"],
      []
    );
  }
  const successful = countSuccessful(runs);
  const rate = successful / runs.length;
  const band = ciPassBand(rate);
  const categories = awardCategories(
    standards,
    "adp_c1_ci_pass_rate",
    topology
  );
  const reliability = computeReliability("not-reliable", ["ci"], []);
  return makeMetricResult(
    "adp_c1_ci_pass_rate",
    rate,
    "banded",
    categories,
    reliability,
    ["ci"],
    [],
    band
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_c2_pipeline_duration.ts
import { readFileSync as readFileSync24, existsSync as existsSync22 } from "node:fs";
import { join as join24 } from "node:path";
function averageDuration(runs) {
  const durations = runs.map((r) => {
    const rec = r;
    const d = rec["duration_seconds"];
    return typeof d === "number" && isFinite(d) ? d : null;
  }).filter((d) => d !== null);
  if (durations.length === 0) return null;
  return durations.reduce((sum, d) => sum + d, 0) / durations.length;
}
function compute11(collectedDir, standards, topology) {
  const ciPath = join24(collectedDir, "ci.json");
  if (!existsSync22(ciPath)) {
    return makeMetricResult(
      "adp_c2_pipeline_duration",
      null,
      "duration_seconds",
      [],
      computeReliability("not-reliable", [], ["ci"]),
      [],
      ["ci"]
    );
  }
  const artifact = JSON.parse(readFileSync24(ciPath, "utf8"));
  if (!artifact?.available) {
    return makeMetricResult(
      "adp_c2_pipeline_duration",
      null,
      "duration_seconds",
      [],
      computeReliability("not-reliable", [], ["ci"]),
      [],
      ["ci"]
    );
  }
  const raw = artifact?.raw ?? {};
  const runs = Array.isArray(raw.runs) ? raw.runs : [];
  const configDetected = Boolean(raw.config_detected);
  if (runs.length === 0) {
    const categories2 = awardCategories(
      standards,
      "adp_c2_pipeline_duration",
      topology
    );
    const partialReliability = {
      tag: "not-reliable",
      confidence: "MED",
      note: configDetected ? "CI config detected but no run data available; pipeline duration cannot be computed" : "CI source available but no run data available; pipeline duration cannot be computed"
    };
    return makeMetricResult(
      "adp_c2_pipeline_duration",
      null,
      "duration_seconds",
      categories2,
      partialReliability,
      ["ci"],
      []
    );
  }
  const avgDuration = averageDuration(runs);
  const categories = awardCategories(
    standards,
    "adp_c2_pipeline_duration",
    topology
  );
  const reliability = computeReliability("not-reliable", ["ci"], []);
  return makeMetricResult(
    "adp_c2_pipeline_duration",
    avgDuration,
    "duration_seconds",
    categories,
    reliability,
    ["ci"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_d1_spec_coverage.ts
import { readFileSync as readFileSync25, existsSync as existsSync23 } from "node:fs";
import { join as join25 } from "node:path";
function compute12(collectedDir, standards, topology) {
  const docsPath = join25(collectedDir, "docs.json");
  if (!existsSync23(docsPath)) {
    return makeMetricResult(
      "adp_d1_spec_coverage",
      null,
      "coverage",
      [],
      computeReliability("not-reliable", [], ["docs"]),
      [],
      ["docs"]
    );
  }
  const artifact = JSON.parse(readFileSync25(docsPath, "utf8"));
  if (!artifact?.available) {
    return makeMetricResult(
      "adp_d1_spec_coverage",
      null,
      "coverage",
      [],
      computeReliability("not-reliable", [], ["docs"]),
      [],
      ["docs"]
    );
  }
  const raw = artifact?.raw ?? {};
  const pageCount = typeof raw.page_count === "number" ? raw.page_count : 0;
  const recentlyUpdatedCount = typeof raw.recently_updated_count === "number" ? raw.recently_updated_count : 0;
  const coverage = pageCount > 0 ? recentlyUpdatedCount / pageCount : 0;
  const categories = awardCategories(
    standards,
    "adp_d1_spec_coverage",
    topology
  );
  const reliability = computeReliability("not-reliable", ["docs"], []);
  return makeMetricResult(
    "adp_d1_spec_coverage",
    coverage,
    "coverage",
    categories,
    reliability,
    ["docs"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_i1_work_mix.ts
import { readFileSync as readFileSync26, existsSync as existsSync24 } from "node:fs";
import { join as join26 } from "node:path";
var GROWTH_TYPES = /* @__PURE__ */ new Set([
  "feature",
  "story",
  "enhancement",
  "task",
  "improvement"
]);
function workMixBand(growthFrac) {
  if (growthFrac >= 0.6) return "elite";
  if (growthFrac >= 0.45) return "high";
  if (growthFrac >= 0.3) return "medium";
  return "low";
}
function compute13(collectedDir, standards, topology) {
  const trackerPath = join26(collectedDir, "tracker.json");
  if (!existsSync24(trackerPath)) {
    return makeMetricResult(
      "adp_i1_work_mix",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["tracker"]),
      [],
      ["tracker"]
    );
  }
  const artifact = JSON.parse(readFileSync26(trackerPath, "utf8"));
  if (!artifact?.available) {
    return makeMetricResult(
      "adp_i1_work_mix",
      null,
      "banded",
      [],
      computeReliability("not-reliable", [], ["tracker"]),
      [],
      ["tracker"]
    );
  }
  const raw = artifact?.raw ?? {};
  const typeCounts = typeof raw.type_counts === "object" && raw.type_counts !== null ? raw.type_counts : {};
  const total = Object.values(typeCounts).reduce(
    (sum, n) => sum + n,
    0
  );
  if (total === 0) {
    const categories2 = awardCategories(standards, "adp_i1_work_mix", topology);
    const reliability2 = computeReliability("not-reliable", ["tracker"], []);
    return makeMetricResult(
      "adp_i1_work_mix",
      null,
      "banded",
      categories2,
      reliability2,
      ["tracker"],
      []
    );
  }
  const growthCount = Object.entries(typeCounts).filter(([type]) => GROWTH_TYPES.has(type.toLowerCase())).reduce((sum, [, n]) => sum + n, 0);
  const growthFrac = growthCount / total;
  const band = workMixBand(growthFrac);
  const categories = awardCategories(standards, "adp_i1_work_mix", topology);
  const reliability = computeReliability("not-reliable", ["tracker"], []);
  return makeMetricResult(
    "adp_i1_work_mix",
    growthFrac,
    "banded",
    categories,
    reliability,
    ["tracker"],
    [],
    band
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_i2_throughput.ts
import { readFileSync as readFileSync27, existsSync as existsSync25 } from "node:fs";
import { join as join27 } from "node:path";
function compute14(collectedDir, standards, topology) {
  const trackerPath = join27(collectedDir, "tracker.json");
  if (!existsSync25(trackerPath)) {
    return makeMetricResult(
      "adp_i2_throughput",
      null,
      "rate",
      [],
      computeReliability("not-reliable", [], ["tracker"]),
      [],
      ["tracker"]
    );
  }
  const artifact = JSON.parse(readFileSync27(trackerPath, "utf8"));
  if (!artifact?.available) {
    return makeMetricResult(
      "adp_i2_throughput",
      null,
      "rate",
      [],
      computeReliability("not-reliable", [], ["tracker"]),
      [],
      ["tracker"]
    );
  }
  const raw = artifact?.raw ?? {};
  const resolvedCount = typeof raw.resolved_count === "number" ? raw.resolved_count : 0;
  const categories = awardCategories(standards, "adp_i2_throughput", topology);
  const reliability = computeReliability("not-reliable", ["tracker"], []);
  return makeMetricResult(
    "adp_i2_throughput",
    resolvedCount,
    "rate",
    categories,
    reliability,
    ["tracker"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_i3_mttr.ts
import { readFileSync as readFileSync28, existsSync as existsSync26 } from "node:fs";
import { join as join28 } from "node:path";
function mtttrBand(medianHours) {
  if (medianHours < 1) return "elite";
  if (medianHours < 24) return "high";
  if (medianHours < 168) return "medium";
  return "low";
}
function median3(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}
function computeGitProxyIntervals(mergeRecords) {
  const intervals = [];
  for (const rec of mergeRecords) {
    const mergedAt = new Date(rec.merged_at);
    const firstCommit = new Date(rec.branch_first_commit_at);
    if (isNaN(mergedAt.getTime()) || isNaN(firstCommit.getTime())) continue;
    const diffMs = mergedAt.getTime() - firstCommit.getTime();
    if (diffMs < 0) continue;
    intervals.push(diffMs / 36e5);
  }
  return intervals;
}
function compute15(collectedDir, standards, topology) {
  const gitPath = join28(collectedDir, "git.json");
  const trackerPath = join28(collectedDir, "tracker.json");
  let incidentSource = null;
  if (existsSync26(trackerPath)) {
    try {
      const trackerArtifact = JSON.parse(readFileSync28(trackerPath, "utf8"));
      if (trackerArtifact?.available && trackerArtifact?.raw?.incident_source) {
        incidentSource = trackerArtifact.raw.incident_source;
      }
    } catch {
    }
  }
  if (!existsSync26(gitPath)) {
    if (incidentSource) {
      const categories2 = awardCategories(standards, "adp_i3_mttr", topology);
      const reliability3 = {
        tag: "not-reliable",
        confidence: "HIGH",
        note: null
      };
      return makeMetricResult(
        "adp_i3_mttr",
        null,
        "banded",
        categories2,
        reliability3,
        ["tracker"],
        ["git"]
      );
    }
    const reliability2 = {
      tag: "not-reliable",
      confidence: "LOW",
      note: "git-proxy, true value may differ; no git history found"
    };
    return makeMetricResult(
      "adp_i3_mttr",
      null,
      "banded",
      [],
      reliability2,
      ["git"],
      []
    );
  }
  const gitArtifact = JSON.parse(readFileSync28(gitPath, "utf8"));
  const raw = gitArtifact?.raw ?? {};
  const mergeRecords = Array.isArray(raw.merge_records) ? raw.merge_records : [];
  const allIntervals = computeGitProxyIntervals(mergeRecords);
  const medianHours = median3(allIntervals);
  let reliability;
  if (incidentSource) {
    reliability = {
      tag: "not-reliable",
      confidence: "HIGH",
      note: null
    };
  } else {
    reliability = {
      tag: "not-reliable",
      confidence: allIntervals.length > 0 ? "MED" : "LOW",
      note: "git-proxy, true value may differ"
    };
  }
  const band = medianHours !== null ? mtttrBand(medianHours) : null;
  const categories = awardCategories(standards, "adp_i3_mttr", topology);
  const sourcesUsed = incidentSource ? ["git", "tracker"] : ["git"];
  const sourcesMissing = [];
  return makeMetricResult(
    "adp_i3_mttr",
    medianHours,
    "banded",
    categories,
    reliability,
    sourcesUsed,
    sourcesMissing,
    band
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g10_complexity.ts
import { readFileSync as readFileSync29, existsSync as existsSync27, readdirSync as readdirSync6 } from "node:fs";
import { join as join29, extname, dirname as dirname3 } from "node:path";
import { fileURLToPath } from "node:url";
var import_web_tree_sitter = __toESM(require_tree_sitter());
var CCN_THRESHOLD = 10;
var MAX_FILE_BYTES = 512 * 1024;
var EXT_TO_GRAMMAR = {
  ".js": "tree-sitter-javascript.wasm",
  ".mjs": "tree-sitter-javascript.wasm",
  ".cjs": "tree-sitter-javascript.wasm",
  ".jsx": "tree-sitter-javascript.wasm",
  ".ts": "tree-sitter-typescript.wasm",
  ".mts": "tree-sitter-typescript.wasm",
  ".cts": "tree-sitter-typescript.wasm",
  ".tsx": "tree-sitter-tsx.wasm",
  ".py": "tree-sitter-python.wasm",
  ".go": "tree-sitter-go.wasm",
  ".java": "tree-sitter-java.wasm",
  ".rb": "tree-sitter-ruby.wasm",
  ".cs": "tree-sitter-c_sharp.wasm",
  ".c": "tree-sitter-c.wasm",
  ".cpp": "tree-sitter-cpp.wasm",
  ".cc": "tree-sitter-cpp.wasm",
  ".cxx": "tree-sitter-cpp.wasm",
  ".rs": "tree-sitter-rust.wasm",
  ".php": "tree-sitter-php.wasm",
  ".kt": "tree-sitter-kotlin.wasm",
  ".kts": "tree-sitter-kotlin.wasm"
};
var DECISION_NODE_TYPES = /* @__PURE__ */ new Set([
  "if_statement",
  "elif_clause",
  // Python
  "elsif_clause",
  // Ruby
  "else_if_clause",
  // Kotlin
  "for_statement",
  "for_in_statement",
  "for_of_statement",
  "foreach_statement",
  // C#
  "while_statement",
  "do_statement",
  "switch_case",
  "catch_clause",
  "conditional_expression",
  // ternary ?:
  "when_expression"
  // Kotlin when
]);
var FUNCTION_BOUNDARY_TYPES = /* @__PURE__ */ new Set([
  "function_declaration",
  "function_definition",
  "function_expression",
  // JS: const f = function() {}
  "arrow_function",
  "method_definition",
  "method_declaration",
  "constructor_declaration",
  "function_item",
  // Rust fn
  "lambda_expression",
  "closure_expression"
  // Rust |...| {}
]);
var PRUNE_DIRS = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  ".next",
  "target",
  "vendor",
  ".cache",
  "coverage"
]);
function resolveGrammarsDir() {
  const metricsDir = dirname3(fileURLToPath(import.meta.url));
  const distGrammars = join29(metricsDir, "grammars");
  if (existsSync27(distGrammars)) return distGrammars;
  const candidates = [
    join29(
      metricsDir,
      "..",
      "..",
      "..",
      "..",
      "..",
      "node_modules",
      "tree-sitter-wasms",
      "out"
    ),
    join29(
      metricsDir,
      "..",
      "..",
      "..",
      "..",
      "node_modules",
      "tree-sitter-wasms",
      "out"
    ),
    join29(
      metricsDir,
      "..",
      "..",
      "..",
      "node_modules",
      "tree-sitter-wasms",
      "out"
    )
  ];
  for (const c of candidates) {
    if (existsSync27(c)) return c;
  }
  return distGrammars;
}
function resolveCoreWasm() {
  const metricsDir = dirname3(fileURLToPath(import.meta.url));
  const distWasm = join29(metricsDir, "tree-sitter.wasm");
  if (existsSync27(distWasm)) return distWasm;
  const candidates = [
    join29(
      metricsDir,
      "..",
      "..",
      "..",
      "..",
      "..",
      "node_modules",
      "web-tree-sitter",
      "tree-sitter.wasm"
    ),
    join29(
      metricsDir,
      "..",
      "..",
      "..",
      "..",
      "node_modules",
      "web-tree-sitter",
      "tree-sitter.wasm"
    ),
    join29(
      metricsDir,
      "..",
      "..",
      "..",
      "node_modules",
      "web-tree-sitter",
      "tree-sitter.wasm"
    )
  ];
  for (const c of candidates) {
    if (existsSync27(c)) return c;
  }
  return distWasm;
}
function walkDir(dir, cb) {
  let entries;
  try {
    entries = readdirSync6(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (PRUNE_DIRS.has(entry.name)) continue;
      walkDir(join29(dir, entry.name), cb);
    } else if (entry.isFile()) {
      cb(join29(dir, entry.name));
    }
  }
}
function countDecisions(node) {
  let count = 0;
  function visit(n) {
    if (DECISION_NODE_TYPES.has(n.type)) count++;
    if (n.type === "binary_expression") {
      for (let i2 = 0; i2 < n.childCount; i2++) {
        const child = n.child(i2);
        if (child && (child.type === "&&" || child.type === "||" || child.type === "and" || child.type === "or")) {
          count++;
        }
      }
    }
    for (let i2 = 0; i2 < n.childCount; i2++) {
      const child = n.child(i2);
      if (!child) continue;
      if (FUNCTION_BOUNDARY_TYPES.has(child.type) && child.isNamed) continue;
      visit(child);
    }
  }
  visit(node);
  return count;
}
function collectFunctions(node, out2) {
  if (FUNCTION_BOUNDARY_TYPES.has(node.type) && node.isNamed) {
    out2.push(node);
  }
  for (let i2 = 0; i2 < node.childCount; i2++) {
    const child = node.child(i2);
    if (child) collectFunctions(child, out2);
  }
}
function bandFromAvg(avg) {
  if (avg <= 5) return "elite";
  if (avg <= 10) return "high";
  if (avg <= 15) return "medium";
  return "low";
}
function makeSkip() {
  return makeMetricResult(
    "adp_g10_complexity",
    null,
    "computed",
    [],
    computeReliability("not-reliable", [], ["scale"]),
    [],
    ["scale"]
  );
}
async function compute16(_collectedDir, _standards, _topology, repoPathOverride) {
  const repoPath = repoPathOverride ?? _collectedDir;
  if (!existsSync27(repoPath)) return makeSkip();
  const grammarsDir = resolveGrammarsDir();
  const coreWasmPath = resolveCoreWasm();
  const Parser2 = import_web_tree_sitter.default;
  if (!Parser2 || typeof Parser2.init !== "function") return makeSkip();
  try {
    if (!existsSync27(coreWasmPath)) return makeSkip();
    const wasmBinary2 = readFileSync29(coreWasmPath);
    await Parser2.init({
      wasmBinary: wasmBinary2,
      locateFile: () => coreWasmPath
    });
  } catch {
    return makeSkip();
  }
  const languageCache = /* @__PURE__ */ new Map();
  async function loadLanguage(grammarFile) {
    if (languageCache.has(grammarFile)) return languageCache.get(grammarFile);
    const grammarPath = join29(grammarsDir, grammarFile);
    if (!existsSync27(grammarPath)) {
      languageCache.set(grammarFile, null);
      return null;
    }
    try {
      const grammarBytes = readFileSync29(grammarPath);
      const lang = await Parser2.Language.load(new Uint8Array(grammarBytes));
      languageCache.set(grammarFile, lang);
      return lang;
    } catch {
      languageCache.set(grammarFile, null);
      return null;
    }
  }
  const filePaths = [];
  walkDir(repoPath, (p) => {
    if (EXT_TO_GRAMMAR[extname(p).toLowerCase()]) filePaths.push(p);
  });
  if (filePaths.length === 0) return makeSkip();
  const parser = new Parser2();
  let totalCcn = 0;
  let maxCcn = 0;
  let hotspotCount = 0;
  let functionsAnalysed = 0;
  let filesAnalysed = 0;
  let filesSkipped = 0;
  for (const filePath of filePaths) {
    const ext = extname(filePath).toLowerCase();
    const grammarFile = EXT_TO_GRAMMAR[ext];
    if (!grammarFile) {
      filesSkipped++;
      continue;
    }
    const lang = await loadLanguage(grammarFile);
    if (!lang) {
      filesSkipped++;
      continue;
    }
    let source;
    try {
      const buf = readFileSync29(filePath);
      if (buf.length > MAX_FILE_BYTES) {
        filesSkipped++;
        continue;
      }
      source = buf.toString("utf8");
    } catch {
      filesSkipped++;
      continue;
    }
    try {
      parser.setLanguage(lang);
      const tree = parser.parse(source);
      if (!tree) {
        filesSkipped++;
        continue;
      }
      const fns = [];
      collectFunctions(tree.rootNode, fns);
      filesAnalysed++;
      if (fns.length === 0) {
        const ccn = 1 + countDecisions(tree.rootNode);
        totalCcn += ccn;
        functionsAnalysed++;
        if (ccn > maxCcn) maxCcn = ccn;
        if (ccn > CCN_THRESHOLD) hotspotCount++;
      } else {
        for (const fn of fns) {
          const ccn = 1 + countDecisions(fn);
          totalCcn += ccn;
          functionsAnalysed++;
          if (ccn > maxCcn) maxCcn = ccn;
          if (ccn > CCN_THRESHOLD) hotspotCount++;
        }
      }
      tree.delete();
    } catch {
      filesSkipped++;
    }
  }
  parser.delete();
  if (functionsAnalysed === 0) return makeSkip();
  const avgCcn = totalCcn / functionsAnalysed;
  const band = bandFromAvg(avgCcn);
  const value = {
    avg_ccn: Math.round(avgCcn * 100) / 100,
    max_ccn: maxCcn,
    hotspot_count: hotspotCount,
    functions_analysed: functionsAnalysed,
    files_analysed: filesAnalysed,
    files_skipped: filesSkipped,
    band
  };
  return makeMetricResult(
    "adp_g10_complexity",
    value,
    "computed",
    [1301],
    computeReliability("not-reliable", ["scale"], []),
    ["scale"],
    [],
    band
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g11_scale.ts
import { readFileSync as readFileSync30, existsSync as existsSync28, readdirSync as readdirSync7 } from "node:fs";
import { join as join30, extname as extname2 } from "node:path";
var EXT_TO_LANG = {
  ".js": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".ts": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".tsx": "TSX",
  ".jsx": "JSX",
  ".py": "Python",
  ".go": "Go",
  ".java": "Java",
  ".rb": "Ruby",
  ".cs": "C#",
  ".c": "C",
  ".cpp": "C++",
  ".cc": "C++",
  ".cxx": "C++",
  ".rs": "Rust",
  ".php": "PHP",
  ".kt": "Kotlin",
  ".kts": "Kotlin"
};
var PRUNE_DIRS2 = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  ".next",
  "target",
  "vendor",
  ".cache",
  "coverage"
]);
function countLines2(content) {
  return content.split("\n").filter((l) => l.trim().length > 0).length;
}
function walkDir2(dir, cb) {
  let entries;
  try {
    entries = readdirSync7(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (PRUNE_DIRS2.has(entry.name)) continue;
      walkDir2(join30(dir, entry.name), cb);
    } else if (entry.isFile()) {
      cb(join30(dir, entry.name));
    }
  }
}
function compute17(_collectedDir, _standards, _topology, repoPathOverride) {
  const repoPath = repoPathOverride ?? _collectedDir;
  if (!existsSync28(repoPath)) {
    return makeMetricResult(
      "adp_g11_scale",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["scale"]),
      [],
      ["scale"]
    );
  }
  const byLanguage = {};
  let totalLoc = 0;
  let fileCount = 0;
  walkDir2(repoPath, (filePath) => {
    const ext = extname2(filePath).toLowerCase();
    const lang = EXT_TO_LANG[ext];
    if (!lang) return;
    let content;
    try {
      content = readFileSync30(filePath, "utf8");
    } catch {
      return;
    }
    const loc = countLines2(content);
    totalLoc += loc;
    fileCount += 1;
    if (!byLanguage[lang]) {
      byLanguage[lang] = { files: 0, loc: 0 };
    }
    byLanguage[lang].files += 1;
    byLanguage[lang].loc += loc;
  });
  if (fileCount === 0) {
    return makeMetricResult(
      "adp_g11_scale",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["scale"]),
      [],
      ["scale"]
    );
  }
  const value = {
    total_loc: totalLoc,
    file_count: fileCount,
    by_language: byLanguage
  };
  const reliability = computeReliability("not-reliable", ["scale"], []);
  return makeMetricResult(
    "adp_g11_scale",
    value,
    "computed",
    [1302],
    reliability,
    ["scale"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/adp_g12_deps.ts
import { readFileSync as readFileSync31, existsSync as existsSync29, readdirSync as readdirSync8 } from "node:fs";
import { join as join31, basename as basename7 } from "node:path";
var PRUNE_DIRS3 = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  ".next",
  "target",
  "vendor",
  ".cache",
  "coverage"
]);
var MANIFEST_NAMES = /* @__PURE__ */ new Set([
  "package.json",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "requirements.txt"
]);
function findManifests(dir, depth = 0) {
  if (depth > 3) return [];
  const found = [];
  let entries;
  try {
    entries = readdirSync8(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (PRUNE_DIRS3.has(entry.name)) continue;
      found.push(...findManifests(join31(dir, entry.name), depth + 1));
    } else if (entry.isFile() && MANIFEST_NAMES.has(entry.name)) {
      found.push(join31(dir, entry.name));
    }
  }
  return found;
}
function parsePackageJson(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return 0;
  }
  const deps = Object.keys(
    parsed.dependencies ?? {}
  );
  const devDeps = Object.keys(
    parsed.devDependencies ?? {}
  );
  return deps.length + devDeps.length;
}
function parsePyprojectToml(content) {
  const lines = content.split("\n");
  let inDepsSection = false;
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      inDepsSection = trimmed === "[project.dependencies]" || trimmed === "[tool.poetry.dependencies]" || trimmed === "[tool.poetry.dev-dependencies]" || trimmed === "[project.optional-dependencies]";
      continue;
    }
    if (!inDepsSection) continue;
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
      count++;
    } else if (trimmed.includes("=") && !trimmed.startsWith("[")) {
      count++;
    }
  }
  return count;
}
function parseGoMod(content) {
  let count = 0;
  let inRequireBlock = false;
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line === "require (") {
      inRequireBlock = true;
      continue;
    }
    if (inRequireBlock && line === ")") {
      inRequireBlock = false;
      continue;
    }
    if (inRequireBlock) {
      if (!line || line.startsWith("//")) continue;
      if (!line.includes("// indirect")) count++;
    } else if (line.startsWith("require ") && !line.startsWith("require (")) {
      const rest = line.slice("require ".length).trim();
      if (rest && !rest.includes("// indirect")) count++;
    }
  }
  return count;
}
function parseCargoToml(content) {
  const lines = content.split("\n");
  let inDeps = false;
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      inDeps = trimmed === "[dependencies]" || trimmed === "[dev-dependencies]";
      continue;
    }
    if (!inDeps) continue;
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.includes("=")) count++;
  }
  return count;
}
function parseRequirementsTxt(content) {
  return content.split("\n").filter((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith("#") && !t.startsWith("-r ");
  }).length;
}
function parseManifest(filePath, content) {
  const name2 = basename7(filePath);
  switch (name2) {
    case "package.json":
      return parsePackageJson(content);
    case "pyproject.toml":
      return parsePyprojectToml(content);
    case "go.mod":
      return parseGoMod(content);
    case "Cargo.toml":
      return parseCargoToml(content);
    case "requirements.txt":
      return parseRequirementsTxt(content);
    default:
      return 0;
  }
}
function compute18(_collectedDir, _standards, _topology, repoPathOverride) {
  const repoPath = repoPathOverride ?? _collectedDir;
  if (!existsSync29(repoPath)) {
    return makeMetricResult(
      "adp_g12_deps",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["scale"]),
      [],
      ["scale"]
    );
  }
  const manifests = findManifests(repoPath);
  if (manifests.length === 0) {
    return makeMetricResult(
      "adp_g12_deps",
      null,
      "computed",
      [],
      computeReliability("not-reliable", [], ["scale"]),
      [],
      ["scale"]
    );
  }
  const byManifest = {};
  let total = 0;
  for (const manifest of manifests) {
    let content;
    try {
      content = readFileSync31(manifest, "utf8");
    } catch {
      continue;
    }
    const count = parseManifest(manifest, content);
    byManifest[manifest] = count;
    total += count;
  }
  const value = { total_direct_deps: total, by_manifest: byManifest };
  const reliability = computeReliability("not-reliable", ["scale"], []);
  return makeMetricResult(
    "adp_g12_deps",
    value,
    "computed",
    [1303],
    reliability,
    ["scale"],
    []
  );
}

// plugins/awos/skills/ai-readiness-audit/metrics/org_rollup.ts
function rollup(perRepoResults, _standards) {
  if (perRepoResults.length === 0) {
    return {
      portfolio_metrics: [
        makeMetric("org_ai_tooling_coverage", 0, false, 0),
        makeMetric("org_capability_score", 0, false, 0),
        makeMetric("org_measurement_coverage", 0, false, 0)
      ],
      per_repo: []
    };
  }
  const repos = perRepoResults.map((r) => ({
    repo: r.repo,
    contributors: r.contributors ?? null,
    awarded_weight: r.awarded_weight ?? 0,
    sources_reachable: r.sources_reachable ?? [],
    has_ai_tooling: r.has_ai_tooling ?? false
  }));
  const allHaveContributors = repos.every(
    (r) => r.contributors !== null && r.contributors > 0
  );
  const weight = (r) => allHaveContributors && r.contributors !== null ? r.contributors : 1;
  const totalWeight = repos.reduce((s, r) => s + weight(r), 0);
  const toolingNumerator = repos.filter((r) => r.has_ai_tooling).reduce((s, r) => s + weight(r), 0);
  const toolingCoverage = totalWeight > 0 ? toolingNumerator / totalWeight : 0;
  const totalAwarded = repos.reduce((s, r) => s + r.awarded_weight, 0);
  const capabilityScore = repos.length > 0 ? totalAwarded / repos.length : 0;
  const measuredNumerator = repos.filter((r) => r.sources_reachable.length > 0).reduce((s, r) => s + weight(r), 0);
  const measurementCoverage = totalWeight > 0 ? measuredNumerator / totalWeight : 0;
  const portfolio_metrics = [
    {
      metric: "org_ai_tooling_coverage",
      value: round4(toolingCoverage),
      description: "Fraction of portfolio repos with any AI tooling present" + (allHaveContributors ? " (contributor-weighted)" : " (equal-weighted)"),
      contributor_weighted: allHaveContributors,
      repos_counted: repos.length
    },
    {
      metric: "org_capability_score",
      value: round4(capabilityScore),
      description: "Average awarded category-weight score across portfolio repos",
      contributor_weighted: false,
      repos_counted: repos.length
    },
    {
      metric: "org_measurement_coverage",
      value: round4(measurementCoverage),
      description: "Fraction of portfolio repos with \u22651 reachable data-source collector" + (allHaveContributors ? " (contributor-weighted)" : " (equal-weighted)"),
      contributor_weighted: allHaveContributors,
      repos_counted: repos.length
    }
  ];
  return { portfolio_metrics, per_repo: repos };
}
function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}
function makeMetric(metric, value, contributor_weighted, repos_counted) {
  const descriptions = {
    org_ai_tooling_coverage: "Fraction of portfolio repos with any AI tooling present",
    org_capability_score: "Average awarded category-weight score across portfolio repos",
    org_measurement_coverage: "Fraction of portfolio repos with \u22651 reachable data-source collector"
  };
  return {
    metric,
    value,
    description: descriptions[metric] ?? metric,
    contributor_weighted,
    repos_counted
  };
}

// plugins/awos/skills/ai-readiness-audit/render.ts
function pct(ratio) {
  return (ratio * 100).toFixed(1) + "%";
}
function titleLabel(dim) {
  return labelize(dim.dimension);
}
function labelize(slug) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
function dimKey(dim) {
  return dim.dimension;
}
function metricLabel(metric) {
  const labels = {
    org_ai_tooling_coverage: "AI-tooling coverage",
    org_capability_score: "Capability score",
    org_measurement_coverage: "Measurement coverage"
  };
  return labels[metric] ?? metric;
}
function statusCounts(dim) {
  let fail = 0, warn = 0, pass = 0, skip = 0;
  for (const c of dim.checks) {
    if (c.status === "FAIL") fail++;
    else if (c.status === "WARN") warn++;
    else if (c.status === "PASS") pass++;
    else skip++;
  }
  return { fail, warn, pass, skip };
}
function plainLead(c) {
  return c.plain && c.plain.trim().length > 0 ? c.plain : c.definition;
}
function sparkline(series) {
  const bars = ["\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"];
  const values = series.map((e) => e.value).filter((v) => v !== null);
  if (values.length === 0) return "(no data)";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  return series.map((e) => {
    if (e.value === null) return "\xB7";
    if (range === 0) return bars[3];
    const idx = Math.round((e.value - min) / range * (bars.length - 1));
    return bars[Math.max(0, Math.min(bars.length - 1, idx))];
  }).join("");
}
function derivedRecommendations(audit) {
  const recs = [];
  let id = 1;
  const fails = [];
  const warns = [];
  for (const dim of audit.dimensions) {
    for (const c of dim.checks) {
      if (c.status === "FAIL") fails.push({ dim, c });
      else if (c.status === "WARN") warns.push({ dim, c });
    }
  }
  for (const { dim, c } of fails.slice(0, 10)) {
    recs.push({
      id: id++,
      priority: "P0",
      title: plainLead(c),
      dimension: titleLabel(dim),
      check_id: c.check_id,
      effort: "\u2014",
      detail: c.hint
    });
  }
  for (const { dim, c } of warns.slice(0, Math.max(0, 10 - fails.length))) {
    recs.push({
      id: id++,
      priority: "P1",
      title: plainLead(c),
      dimension: titleLabel(dim),
      check_id: c.check_id,
      effort: "\u2014",
      detail: c.hint
    });
  }
  return recs;
}
function renderMarkdown(audit) {
  const lines = [];
  const isOrg = Array.isArray(audit.portfolio_metrics) && audit.portfolio_metrics.length > 0;
  lines.push("# AI-SDLC Readiness Audit Report");
  lines.push("");
  lines.push(`**Date:** ${audit.date}`);
  lines.push(`**Project:** ${audit.project}`);
  if (isOrg) {
    lines.push(`**Mode:** Organization (${audit.per_repo?.length ?? 0} repos)`);
  }
  lines.push(`**Audit Total:** ${audit.audit_total} pts`);
  lines.push(
    `**Coverage Ratio:** ${pct(audit.coverage)} rel. today's standard`
  );
  lines.push("");
  if (audit.headline) {
    const h = audit.headline;
    if (h.delivery && h.delivery.length > 0) {
      lines.push("## Delivery");
      lines.push("");
      lines.push("| Metric | Value | Band |");
      lines.push("| ------ | ----- | ---- |");
      for (const d of h.delivery) {
        lines.push(`| ${d.label} | ${d.display_value} | ${d.band ?? "\u2014"} |`);
      }
      lines.push("");
    }
    if (h.scale && h.scale.length > 0) {
      lines.push("## Code Scale & Complexity");
      lines.push("");
      for (const s of h.scale) {
        lines.push(`- **${s.label}:** ${s.display_value}`);
      }
      lines.push("");
    }
    if (h.reach && (h.reach.ai_tooling || h.reach.contributors)) {
      lines.push("## Reach");
      lines.push("");
      if (h.reach.ai_tooling) lines.push(`- ${h.reach.ai_tooling}`);
      if (h.reach.contributors) lines.push(`- ${h.reach.contributors}`);
      lines.push("");
    }
  }
  if (isOrg && audit.portfolio_metrics) {
    lines.push("## Portfolio Metrics (Org)");
    lines.push("");
    lines.push("| Metric | Value | Description | Repos Counted | Weighted |");
    lines.push("| ------ | ----- | ----------- | ------------- | -------- |");
    for (const m of audit.portfolio_metrics) {
      const val = m.metric === "org_capability_score" ? m.value.toFixed(2) + " pts" : pct(m.value);
      lines.push(
        `| ${metricLabel(m.metric)} | ${val} | ${m.description} | ${m.repos_counted} | ${m.contributor_weighted ? "contributor-weighted" : "equal-weighted"} |`
      );
    }
    lines.push("");
  }
  if (audit.insights && audit.insights.length > 0) {
    lines.push("## Top Insights");
    lines.push("");
    for (const ins of audit.insights) {
      const sev = ins.severity.toUpperCase();
      lines.push(`### ${ins.theme} (${sev})`);
      lines.push("");
      lines.push(`- **What this means:** ${ins.so_what}`);
      lines.push(`- **What improves if fixed:** ${ins.improves}`);
      if (ins.weak_areas.length > 0) {
        lines.push(`- **Weak areas:** ${ins.weak_areas.join(", ")}`);
      }
      lines.push("");
    }
  }
  lines.push("## Summary");
  lines.push("");
  lines.push(
    "| # | Dimension | Points | Coverage | FAIL | WARN | PASS | SKIP |"
  );
  lines.push(
    "| - | --------- | ------ | -------- | ---- | ---- | ---- | ---- |"
  );
  let rowNum = 1;
  for (const dim of audit.dimensions) {
    const counts = statusCounts(dim);
    lines.push(
      `| ${rowNum++} | ${titleLabel(dim)} | ${dim.score} | ${pct(dim.coverage)} | ${counts.fail} | ${counts.warn} | ${counts.pass} | ${counts.skip} |`
    );
  }
  lines.push("");
  const recs = audit.recommendations && audit.recommendations.length > 0 ? audit.recommendations : derivedRecommendations(audit);
  lines.push("## Recommendations");
  lines.push("");
  if (recs.length === 0) {
    lines.push("No failing or warning checks. Audit is fully green.");
  } else {
    lines.push("| # | Priority | Dimension | Check | Effort | What to do |");
    lines.push("| - | -------- | --------- | ----- | ------ | ---------- |");
    for (const r of recs) {
      lines.push(
        `| ${r.id} | ${r.priority} | ${r.dimension} | ${r.check_id} | ${r.effort} | ${r.title} |`
      );
    }
    lines.push("");
    if (audit.recommendations && audit.recommendations.length > 0) {
      for (const r of audit.recommendations) {
        lines.push(
          `**${r.priority} \xB7 ${r.id}. ${r.title}** (${r.dimension} \xB7 ${r.check_id} \xB7 effort ${r.effort})`
        );
        lines.push("");
        lines.push(r.detail);
        lines.push("");
      }
    }
  }
  for (const dim of audit.dimensions) {
    lines.push(`## Dimension: ${titleLabel(dim)}`);
    lines.push("");
    lines.push(
      `**Score:** ${dim.score} pts (coverage ${pct(dim.coverage)} rel. today's standard)`
    );
    lines.push("");
    lines.push(
      "| # | Check ID | Method | Weight Awarded | Weight Max | Status | Reliability | Value | Hint |"
    );
    lines.push(
      "| - | -------- | ------ | -------------- | ---------- | ------ | ----------- | ----- | ---- |"
    );
    let checkNum = 1;
    let hasMinimal = false;
    for (const c of dim.checks) {
      const reliabilityStr = c.applies ? `${c.reliability.tag} (${c.reliability.confidence})${c.reliability.tag === "minimal" ? " *" : ""}` : "\u2014";
      if (c.reliability.tag === "minimal" && c.applies) hasMinimal = true;
      const valueStr = c.value !== null && c.value !== void 0 ? String(c.value) : "\u2014";
      const seriesStr = c.value_series && c.value_series.length > 0 ? ` \\[${sparkline(c.value_series)}\\]` : "";
      const hint = c.hint ?? "\u2014";
      lines.push(
        `| ${checkNum++} | ${c.check_id} | ${c.method} | ${c.weight_awarded} | ${c.weight_max} | ${c.status} | ${reliabilityStr} | ${valueStr}${seriesStr} | ${hint} |`
      );
    }
    lines.push("");
    if (hasMinimal) {
      lines.push("`*` lower-bound measurement (reliability tag: `minimal`).");
      lines.push("");
    }
  }
  if (isOrg && audit.per_repo && audit.per_repo.length > 0) {
    lines.push("## Repositories & Connections");
    lines.push("");
    lines.push(
      "| Repo | Contributors | Awarded Weight | Sources Reachable | AI Tooling |"
    );
    lines.push(
      "| ---- | ------------ | -------------- | ----------------- | ---------- |"
    );
    for (const r of audit.per_repo) {
      const contributors = r.contributors !== null ? String(r.contributors) : "\u2014";
      const sources = r.sources_reachable.length > 0 ? r.sources_reachable.join(", ") : "(none)";
      lines.push(
        `| ${r.repo} | ${contributors} | ${r.awarded_weight} | ${sources} | ${r.has_ai_tooling ? "yes" : "no"} |`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function tip(value, plain, meta = "") {
  const metaHtml = meta ? `<span class="tipmeta">${esc(meta)}</span>` : "";
  return `<span class="tip" tabindex="0">${esc(value)}<span class="tipbox"><b>${esc(plain)}</b>${metaHtml}</span></span>`;
}
function sparklineSvg(series) {
  const w = 4;
  const gap = 1;
  const maxH = 20;
  const values = series.map((e) => e.value).filter((v) => v !== null);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const range = max - min;
  const svgW = series.length * (w + gap) - gap;
  const rects = series.map((e, i2) => {
    const h = e.value === null ? 2 : range === 0 ? maxH / 2 : Math.max(
      4,
      Math.round((e.value - min) / range * (maxH - 4)) + 4
    );
    const x = i2 * (w + gap);
    const y = maxH - h;
    const fill = e.value === null ? "#d1d5db" : "#6366f1";
    const label = `${e.bucket_start}: ${e.value !== null ? String(e.value) : "n/a"}`;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"><title>${esc(label)}</title></rect>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${maxH}" style="vertical-align:middle;margin-left:4px" aria-label="sparkline">${rects}</svg>`;
}
function statusBadge(status) {
  const colors = {
    PASS: "#22c55e",
    WARN: "#eab308",
    FAIL: "#ef4444",
    SKIP: "#9ca3af"
  };
  const bg = colors[status] ?? "#9ca3af";
  return `<span class="badge" style="background:${bg};color:#fff;padding:1px 6px;border-radius:3px;font-size:.75em;font-weight:600">${esc(status)}</span>`;
}
var STATUS_COLOR = {
  PASS: "#f0fdf4",
  WARN: "#fefce8",
  FAIL: "#fef2f2",
  SKIP: "#f9fafb"
};
var BAND_COLOR = {
  elite: "#16a34a",
  high: "#22c55e",
  medium: "#eab308",
  low: "#ef4444"
};
var SEVERITY_COLOR = {
  high: "#ef4444",
  medium: "#eab308",
  low: "#6366f1"
};
var PRIORITY_COLOR = {
  P0: "#ef4444",
  P1: "#eab308",
  P2: "#6366f1"
};
function renderHtml(audit) {
  const isOrg = Array.isArray(audit.portfolio_metrics) && audit.portfolio_metrics.length > 0;
  const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;color:#1e293b;font-size:14px;line-height:1.5}
.container{max-width:980px;margin:0 auto;padding:24px}
h1{font-size:1.5rem;font-weight:700;margin-bottom:4px}
h2{font-size:1.15rem;font-weight:600;margin:24px 0 10px}
h3{font-size:.95rem;font-weight:600;margin:0 0 6px;color:#475569}
.meta{color:#64748b;font-size:.85rem;margin-bottom:8px}
.meta span{margin-right:16px}
a{color:#4f46e5;text-decoration:none}
a:hover{text-decoration:underline}
/* executive band */
.exec{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:20px}
.cap-score{font-size:2.2rem;font-weight:800;color:#4f46e5;line-height:1.1}
.cap-cov{font-size:.95rem;color:#64748b;margin-top:2px}
.exec-blocks{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;margin-top:16px}
.exec-col{border-top:1px solid #eef2f7;padding-top:12px}
.kv{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:3px 0;font-size:.85rem}
.kv .k{color:#475569}
.kv .v{font-weight:600;text-align:right}
.band{display:inline-block;color:#fff;font-size:.68rem;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:6px;vertical-align:middle}
/* metric cards (org) */
.metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:12px 0}
.metric-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px}
.metric-card .metric-val{font-size:1.6rem;font-weight:700;color:#4f46e5;margin:4px 0}
.metric-card .metric-desc{font-size:.78rem;color:#64748b}
/* insights */
.insights{display:grid;gap:12px;margin-bottom:8px}
.insight{background:#fff;border:1px solid #e2e8f0;border-left-width:4px;border-radius:8px;padding:12px 16px}
.insight .theme{font-weight:700;margin-bottom:4px}
.insight .so{margin-bottom:4px}
.insight .improves{color:#475569}
.insight .areas{font-size:.78rem;color:#94a3b8;margin-top:6px}
/* recommendations */
.rec{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:8px}
.rec .rec-head{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}
.rec .prio{color:#fff;font-size:.7rem;font-weight:700;padding:1px 7px;border-radius:4px}
.rec .rec-title{font-weight:600}
.rec .rec-where{font-size:.75rem;color:#94a3b8}
.rec .rec-detail{font-size:.85rem;color:#475569;margin-top:6px}
/* tables */
table{width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:16px}
th{background:#f1f5f9;text-align:left;padding:6px 8px;border-bottom:2px solid #e2e8f0;font-weight:600}
td{padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top}
tr[data-status='PASS'] td{background:#f0fdf4}
tr[data-status='WARN'] td{background:#fefce8}
tr[data-status='FAIL'] td{background:#fef2f2}
tr[data-status='SKIP'] td{background:#f9fafb}
tr.low-cov td{background:#fff7ed}
/* dimension summary rows are clickable */
tr.dim-row{cursor:pointer}
tr.dim-row:hover td{background:#eef2ff}
/* check table: fixed layout so Evidence gets the room it needs */
table.checks{table-layout:fixed}
table.checks td.evidence{font-size:.78rem;white-space:normal;overflow-wrap:anywhere;word-break:break-word;color:#334155}
table.checks td.check b{font-size:.82rem}
table.checks td.check .plain{display:block;font-size:.75rem;color:#64748b;margin-top:2px}
/* issues-only filter */
body.issues-only tr[data-status='PASS'],body.issues-only tr[data-status='SKIP']{display:none}
.toolbar{display:flex;gap:8px;align-items:center;margin-bottom:12px}
.toolbar button{padding:5px 12px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;font-size:.8rem}
.toolbar button.active{background:#4f46e5;color:#fff;border-color:#4f46e5}
.backlink{display:inline-block;margin-bottom:10px;font-size:.85rem}
.dim-head{font-size:.9rem;color:#64748b;margin-bottom:12px}
/* reliability colours */
.rel-minimal{color:#d97706}
.rel-not-reliable{color:#dc2626}
/* instant plain-first tooltip */
.tip{position:relative;cursor:help;border-bottom:1px dotted #94a3b8;outline:none}
.tip>.tipbox{display:none;position:absolute;left:0;top:calc(100% + 4px);z-index:60;width:max-content;max-width:320px;background:#1e293b;color:#f8fafc;padding:8px 10px;border-radius:6px;font-size:.75rem;font-weight:400;line-height:1.45;white-space:normal;box-shadow:0 6px 18px rgba(0,0,0,.22)}
.tip:hover>.tipbox,.tip:focus>.tipbox,.tip:focus-within>.tipbox{display:block}
.tipbox b{display:block;margin-bottom:4px;font-weight:700}
.tipbox .tipmeta{color:#cbd5e1;font-size:.7rem}
.badge{display:inline-block}
.dim-page{display:none}
/* print: show everything, drop interactive chrome */
@media print{
  .toolbar{display:none}
  .backlink{display:none}
  .dim-page{display:block!important}
  #overview{display:block!important}
  .tip>.tipbox{display:none!important}
}
`;
  function execBand() {
    const rows = [];
    rows.push('<div class="exec">');
    if (isOrg && audit.portfolio_metrics) {
      rows.push('<div class="metric-grid">');
      for (const m of audit.portfolio_metrics) {
        const val = m.metric === "org_capability_score" ? m.value.toFixed(2) + " pts" : pct(m.value);
        rows.push(`<div class="metric-card">
  <div class="metric-name">${esc(metricLabel(m.metric))}</div>
  <div class="metric-val">${tip(val, m.description, `${m.repos_counted} repos \xB7 ${m.contributor_weighted ? "contributor-weighted" : "equal-weighted"}`)}</div>
  <div class="metric-desc">${esc(m.description)}</div>
</div>`);
      }
      rows.push("</div>");
    } else {
      rows.push(
        `<div class="cap-score">${tip(String(audit.audit_total) + " pts", "Total AI-SDLC capability \u2014 the sum of all capabilities the project has in place. It is uncapped and rises as the standard grows; it is not a grade out of 100.", "\u03A3 awarded category weights across all dimensions \xB7 standards.toml")}</div>`
      );
      rows.push(
        `<div class="cap-cov">Coverage ${tip(pct(audit.coverage), "How much of today's expected capability is in place. Read it as 'we have X% of what the current standard asks for', not as a school grade.", "score \xF7 \u03A3 applicable category weights \xB7 standards.toml")}</div>`
      );
    }
    const h = audit.headline;
    const blocks = [];
    if (h?.delivery && h.delivery.length > 0) {
      const items = h.delivery.map((d) => {
        const bandHtml = d.band ? `<span class="band" style="background:${BAND_COLOR[d.band.toLowerCase()] ?? "#94a3b8"}">${esc(d.band)}</span>` : "";
        return `<div class="kv"><span class="k">${esc(d.label)}</span><span class="v">${esc(d.display_value)}${bandHtml}</span></div>`;
      }).join("");
      blocks.push(
        `<div class="exec-col"><h3>Delivery (vs DORA bands)</h3>${items}</div>`
      );
    }
    if (h?.scale && h.scale.length > 0) {
      const items = h.scale.map(
        (s) => `<div class="kv"><span class="k">${esc(s.label)}</span><span class="v">${esc(s.display_value)}</span></div>`
      ).join("");
      blocks.push(
        `<div class="exec-col"><h3>Code scale &amp; complexity</h3>${items}</div>`
      );
    }
    const reachItems = [];
    if (h?.reach?.ai_tooling)
      reachItems.push(
        `<div class="kv"><span class="k">AI tooling</span><span class="v">${esc(h.reach.ai_tooling)}</span></div>`
      );
    if (h?.reach?.contributors)
      reachItems.push(
        `<div class="kv"><span class="k">Contributors</span><span class="v">${esc(h.reach.contributors)}</span></div>`
      );
    if (isOrg && audit.per_repo && audit.per_repo.length > 0) {
      const withTooling = audit.per_repo.filter((r) => r.has_ai_tooling).length;
      reachItems.push(
        `<div class="kv"><span class="k">Repos with AI tooling</span><span class="v">${withTooling} / ${audit.per_repo.length}</span></div>`
      );
    }
    if (reachItems.length > 0) {
      blocks.push(
        `<div class="exec-col"><h3>Reach</h3>${reachItems.join("")}</div>`
      );
    }
    if (blocks.length > 0) {
      rows.push(`<div class="exec-blocks">${blocks.join("")}</div>`);
    }
    rows.push("</div>");
    return rows.join("\n");
  }
  function insightsSection() {
    if (!audit.insights || audit.insights.length === 0) return "";
    const rows = ["<h2>Top insights</h2>", '<div class="insights">'];
    for (const ins of audit.insights) {
      const color = SEVERITY_COLOR[ins.severity] ?? "#6366f1";
      const areas = ins.weak_areas.length > 0 ? `<div class="areas">Weak: ${esc(ins.weak_areas.join(", "))}</div>` : "";
      rows.push(`<div class="insight" style="border-left-color:${color}">
  <div class="theme">${esc(ins.theme)}</div>
  <div class="so">${esc(ins.so_what)}</div>
  <div class="improves">\u2192 ${esc(ins.improves)}</div>
  ${areas}
</div>`);
    }
    rows.push("</div>");
    return rows.join("\n");
  }
  function recommendationsSection() {
    const recs = audit.recommendations && audit.recommendations.length > 0 ? audit.recommendations : derivedRecommendations(audit);
    if (recs.length === 0) {
      return "<h2>What to improve</h2><p>No failing or warning checks. Audit is fully green.</p>";
    }
    const rows = ["<h2>What to improve</h2>"];
    for (const r of recs) {
      const prioColor = PRIORITY_COLOR[r.priority] ?? "#6366f1";
      const detail = r.detail ? `<div class="rec-detail">${esc(r.detail)}</div>` : "";
      rows.push(`<div class="rec">
  <div class="rec-head">
    <span class="prio" style="background:${prioColor}">${esc(r.priority)}</span>
    <span class="rec-title">${esc(r.title)}</span>
    <span class="rec-where">${esc(r.dimension)} \xB7 ${esc(r.check_id)} \xB7 effort ${esc(r.effort)}</span>
  </div>
  ${detail}
</div>`);
    }
    return rows.join("\n");
  }
  function dimensionSummary() {
    const rows = ["<h2>Dimensions</h2>"];
    rows.push(
      "<table><thead><tr><th>#</th><th>Dimension</th><th>Points</th><th>Coverage</th><th>Reliability</th><th>FAIL</th><th>WARN</th><th>PASS</th><th>SKIP</th></tr></thead><tbody>"
    );
    let n = 1;
    for (const dim of audit.dimensions) {
      const counts = statusCounts(dim);
      const covPct = pct(dim.coverage);
      const lowCov = dim.coverage < 0.4 ? " low-cov" : "";
      const anyMinimal = dim.checks.some(
        (c) => c.applies && c.reliability.tag === "minimal"
      );
      const relStr = anyMinimal ? "minimal *" : "maximal";
      const key = dimKey(dim);
      const href = `#dim/${esc(key)}`;
      rows.push(`<tr class="dim-row${lowCov}" onclick="location.hash='dim/${esc(key)}'">
  <td>${n++}</td>
  <td><a href="${href}"><strong>${esc(titleLabel(dim))}</strong></a></td>
  <td>${tip(String(dim.score) + " pts", `Capability earned in this area: ${dim.score} points.`, `coverage ${covPct} \xB7 ${esc(dim.dimension)} \xB7 standards.toml`)}</td>
  <td>${tip(covPct, `Share of this area's expected capability that is in place.`, `score \xF7 \u03A3 applicable weights \xB7 ${esc(dim.dimension)}`)}</td>
  <td>${tip(relStr, anyMinimal ? "Some numbers here are lower bounds \u2014 the true value may be higher." : "Numbers here are upper-bound reliable for what was reachable.", "")}</td>
  <td>${counts.fail > 0 ? `<span style="color:#ef4444;font-weight:600">${counts.fail}</span>` : counts.fail}</td>
  <td>${counts.warn > 0 ? `<span style="color:#eab308;font-weight:600">${counts.warn}</span>` : counts.warn}</td>
  <td>${counts.pass}</td>
  <td>${counts.skip}</td>
</tr>`);
    }
    rows.push("</tbody></table>");
    return rows.join("\n");
  }
  function dimensionPage(dim) {
    const key = dimKey(dim);
    const counts = statusCounts(dim);
    const covPct = pct(dim.coverage);
    const rows = [];
    rows.push(`<section class="dim-page" id="page-${esc(key)}">`);
    rows.push('<a class="backlink" href="#">\u2190 Back to overview</a>');
    rows.push(`<h2>${esc(titleLabel(dim))}</h2>`);
    rows.push(
      `<div class="dim-head">${tip(String(dim.score) + " pts", `Capability earned in this area: ${dim.score} points.`, "\u03A3 awarded weights \xB7 standards.toml")} \xB7 coverage ${tip(covPct, `Share of this area's expected capability that is in place.`, "score \xF7 \u03A3 applicable weights")} \xB7 FAIL ${counts.fail} \xB7 WARN ${counts.warn} \xB7 PASS ${counts.pass} \xB7 SKIP ${counts.skip}</div>`
    );
    const dimLabel = titleLabel(dim);
    const dimRecs = (audit.recommendations ?? []).filter(
      (r) => r.dimension === dimLabel || r.dimension === dim.dimension
    );
    if (dimRecs.length > 0) {
      rows.push("<h3>What to improve here</h3>");
      for (const r of dimRecs) {
        const prioColor = PRIORITY_COLOR[r.priority] ?? "#6366f1";
        rows.push(`<div class="rec">
  <div class="rec-head"><span class="prio" style="background:${prioColor}">${esc(r.priority)}</span><span class="rec-title">${esc(r.title)}</span><span class="rec-where">${esc(r.check_id)} \xB7 effort ${esc(r.effort)}</span></div>
  ${r.detail ? `<div class="rec-detail">${esc(r.detail)}</div>` : ""}
</div>`);
      }
    }
    rows.push(
      '<div class="toolbar"><button onclick="toggleIssues(this)">Show issues only</button></div>'
    );
    rows.push(
      '<table class="checks"><colgroup><col style="width:3%"><col style="width:24%"><col style="width:8%"><col style="width:7%"><col style="width:10%"><col style="width:13%"><col style="width:35%"></colgroup>'
    );
    rows.push(
      "<thead><tr><th>#</th><th>Check</th><th>Status</th><th>Wt</th><th>Reliability</th><th>Value</th><th>Evidence</th></tr></thead><tbody>"
    );
    let ckn = 1;
    let hasMinimal = false;
    for (const c of dim.checks) {
      const rowBg = STATUS_COLOR[c.status] ?? "#fff";
      const relClass = c.reliability.tag === "minimal" ? "rel-minimal" : c.reliability.tag === "not-reliable" ? "rel-not-reliable" : "";
      if (c.reliability.tag === "minimal" && c.applies) hasMinimal = true;
      const relLabel = c.applies ? `${c.reliability.tag} (${c.reliability.confidence})${c.reliability.tag === "minimal" ? " *" : ""}` : "\u2014";
      const relTipPlain = c.reliability.tag === "minimal" ? "This is a lower bound \u2014 the real value may be higher." : c.reliability.tag === "not-reliable" ? "A rough proxy \u2014 treat as indicative, not exact." : "Reliable for what was reachable.";
      const valueStr = c.value !== null && c.value !== void 0 ? String(c.value) : "\u2014";
      const seriesSvg = c.value_series && c.value_series.length > 0 ? sparklineSvg(c.value_series) : "";
      const evidence = c.evidence.length > 0 ? c.evidence.map(esc).join("<br>") : "\u2014";
      const codeStr = c.code && c.code.length > 0 ? c.code.join(", ") : "\u2014";
      const checkMeta = `${esc(c.definition)} \u2014 source: ${esc(c.source || "\u2014")} \xB7 method: ${esc(c.method)} \xB7 category ${esc(codeStr)}`;
      rows.push(`<tr data-status="${esc(c.status)}" style="background:${rowBg}">
  <td>${ckn++}</td>
  <td class="check"><span class="tip" tabindex="0"><b>${esc(c.check_id)}</b><span class="tipbox"><b>${esc(plainLead(c))}</b><span class="tipmeta">${checkMeta}</span></span></span><span class="plain">${esc(plainLead(c))}</span></td>
  <td>${statusBadge(c.status)}</td>
  <td>${tip(String(c.weight_awarded) + "/" + String(c.weight_max), `Earned ${c.weight_awarded} of a possible ${c.weight_max} points for this check.`, "")}</td>
  <td class="${relClass}">${tip(relLabel, relTipPlain, c.reliability.note ?? "")}</td>
  <td>${valueStr}${seriesSvg}</td>
  <td class="evidence">${evidence}</td>
</tr>`);
    }
    rows.push("</tbody></table>");
    if (hasMinimal) {
      rows.push(
        '<p style="font-size:.78rem;color:#64748b">* lower-bound measurement (reliability tag: minimal).</p>'
      );
    }
    rows.push("</section>");
    return rows.join("\n");
  }
  function reposSection() {
    const rows = ["<h2>Repositories &amp; Connections</h2>"];
    if (isOrg && audit.per_repo && audit.per_repo.length > 0) {
      rows.push(
        "<table><thead><tr><th>Repo</th><th>Contributors</th><th>Sources</th><th>AI Tooling</th><th>Awarded Weight</th></tr></thead><tbody>"
      );
      for (const r of audit.per_repo) {
        const sources = r.sources_reachable.length > 0 ? r.sources_reachable.map(esc).join(", ") : "<em>none detected</em>";
        rows.push(`<tr>
  <td>${esc(r.repo)}</td>
  <td>${r.contributors !== null ? tip(String(r.contributors), "Aggregate active-contributor count \u2014 no per-person data.", "") : "\u2014"}</td>
  <td>${sources}</td>
  <td>${r.has_ai_tooling ? "\u2713 yes" : "\u2717 no"}</td>
  <td>${tip(String(r.awarded_weight), `Capability points earned by this repo: ${r.awarded_weight}.`, "")}</td>
</tr>`);
      }
      rows.push("</tbody></table>");
    } else {
      rows.push(
        `<p>Single-repo audit. Project: <strong>${esc(audit.project)}</strong>. ${audit.dimensions.length} dimension(s) evaluated.</p>`
      );
    }
    return rows.join("\n");
  }
  const inlineJs = `
function route(){
  var h=location.hash.replace(/^#/,'');
  var isDim=h.indexOf('dim/')===0;
  var ov=document.getElementById('overview');
  document.querySelectorAll('.dim-page').forEach(function(p){p.style.display='none'});
  if(isDim){
    var el=document.getElementById('page-'+h.slice(4));
    if(el){ov.style.display='none';el.style.display='block';window.scrollTo(0,0);return;}
  }
  ov.style.display='block';
}
function toggleIssues(btn){
  var active=document.body.classList.toggle('issues-only');
  btn.textContent=active?'Show all':'Show issues only';
  btn.classList.toggle('active',active);
}
window.addEventListener('hashchange',route);
route();
`;
  const dimPages = audit.dimensions.map((d) => dimensionPage(d)).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AI-SDLC Audit \u2014 ${esc(audit.project)} \u2014 ${esc(audit.date)}</title>
<style>${css}</style>
</head>
<body>
<div class="container">
<h1>AI-SDLC Readiness Audit</h1>
<div class="meta">
  <span><strong>Date:</strong> ${esc(audit.date)}</span>
  <span><strong>Project:</strong> ${esc(audit.project)}</span>
  ${isOrg ? `<span><strong>Mode:</strong> Organization (${audit.per_repo?.length ?? 0} repos)</span>` : ""}
</div>

<div id="overview">
${execBand()}
${insightsSection()}
${recommendationsSection()}
${dimensionSummary()}
${reposSection()}
</div>

${dimPages}

</div>
<script>${inlineJs}</script>
</body>
</html>`;
}

// plugins/awos/skills/ai-readiness-audit/progress.ts
function progress(input) {
  const { elapsed_seconds, done, total } = input;
  const pct2 = total > 0 ? done / total : 0;
  let eta_seconds;
  if (done === 0) {
    eta_seconds = null;
  } else if (done >= total) {
    eta_seconds = 0;
  } else {
    eta_seconds = elapsed_seconds / done * (total - done);
  }
  return { pct: pct2, eta_seconds, elapsed_seconds };
}

// plugins/awos/skills/ai-readiness-audit/audit_core.ts
import { mkdirSync as mkdirSync2, writeFileSync as writeFileSync2, readFileSync as readFileSync33, readdirSync as readdirSync9 } from "node:fs";
import { join as join33, basename as basename8, dirname as dirname4 } from "node:path";

// plugins/awos/skills/ai-readiness-audit/topology.ts
import { existsSync as existsSync30, readFileSync as readFileSync32 } from "node:fs";
import { join as join32 } from "node:path";
function anyPath(repoPath, names) {
  return names.some((n) => existsSync30(join32(repoPath, n)));
}
var CODE_GLOBS = [
  "*.py",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.go",
  "*.java",
  "*.rb",
  "*.cs",
  "*.php",
  "*.kt"
];
function codeMatches(repoPath, pattern) {
  try {
    return grep(repoPath, pattern, CODE_GLOBS).length > 0;
  } catch {
    return false;
  }
}
function anyGlob(repoPath, globs) {
  try {
    return iterFiles(repoPath, globs).length > 0;
  } catch {
    return false;
  }
}
function readIfExists(repoPath, rel) {
  try {
    return readFileSync32(join32(repoPath, rel), "utf8");
  } catch {
    return "";
  }
}
var PKG_MANIFESTS = [
  "package.json",
  "pyproject.toml",
  "setup.py",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "Gemfile"
];
var LOCKFILES3 = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "poetry.lock",
  "uv.lock",
  "Gemfile.lock",
  "go.sum",
  "composer.lock"
];
function computeTopology(repoPath, connectors) {
  const settings = readIfExists(repoPath, ".claude/settings.json");
  const hasPackageEcosystem = anyPath(repoPath, PKG_MANIFESTS);
  const hasHttpApi = codeMatches(
    repoPath,
    /\b(fastapi|flask|django|express|@nestjs|gin-gonic|fiber|spring(framework|boot)?|sinatra|rails|actix_web|axum|aiohttp|starlette)\b/i
  );
  const hasApi = hasHttpApi || anyGlob(repoPath, ["openapi.json", "openapi.yaml", "swagger.json"]) || codeMatches(repoPath, /\b(graphql|grpc|@grpc|protobuf|router\.(get|post|put))\b/i);
  const manifestHits = (() => {
    try {
      return iterFiles(repoPath, [
        "package.json",
        "pyproject.toml",
        "go.mod",
        "Cargo.toml",
        "pom.xml"
      ]).length;
    } catch {
      return 0;
    }
  })();
  const isMonorepo = anyPath(repoPath, [
    "pnpm-workspace.yaml",
    "turbo.json",
    "lerna.json",
    "nx.json"
  ]) || manifestHits >= 2;
  const flags2 = {
    has_topology: true,
    has_ci: detectCiConfigPath(repoPath) !== null,
    has_claude_md: anyPath(repoPath, ["CLAUDE.md", ".claude/CLAUDE.md"]) || anyGlob(repoPath, ["CLAUDE.md"]),
    has_ai_agent_files: anyPath(repoPath, ["AGENTS.md", "CLAUDE.md", ".claude"]) || anyGlob(repoPath, ["AGENTS.md", "CLAUDE.md"]),
    has_commands_or_skills: anyPath(repoPath, [
      ".claude/commands",
      ".claude/skills",
      "skills"
    ]),
    has_hooks: /"hooks"\s*:/.test(settings) || anyPath(repoPath, [".pre-commit-config.yaml", ".husky"]),
    has_mcp_config: anyPath(repoPath, [".mcp.json", "mcp.json"]) || /"mcpServers"\s*:/.test(settings),
    has_lockfiles: anyPath(repoPath, LOCKFILES3),
    has_package_ecosystem: hasPackageEcosystem,
    has_package_manifests: hasPackageEcosystem,
    has_dependency_automation: anyPath(repoPath, [
      ".github/dependabot.yml",
      ".github/dependabot.yaml",
      "renovate.json",
      ".renovaterc",
      ".renovaterc.json"
    ]),
    has_db: anyPath(repoPath, [
      "migrations",
      "alembic.ini",
      "alembic",
      "prisma",
      "db/migrate"
    ]) || codeMatches(
      repoPath,
      /\b(sqlalchemy|piccolo|prisma|typeorm|sequelize|mongoose|gorm|psycopg2?|asyncpg|knex|django\.db)\b/i
    ),
    has_http_api: hasHttpApi,
    has_api: hasApi,
    has_ml_layer: codeMatches(
      repoPath,
      /\b(torch|tensorflow|sklearn|scikit-learn|transformers|keras|xgboost|lightgbm|huggingface)\b/i
    ) || anyGlob(repoPath, ["*.ipynb", "*.pt", "*.h5", "*.onnx", "*.pkl"]),
    uses_auth: codeMatches(
      repoPath,
      /\b(jwt|oauth2?|passport|keycloak|auth0|@login_required|authenticate|bearer\s+token|rbac)\b/i
    ),
    uses_env_vars: anyPath(repoPath, [".env", ".env.example"]) || anyGlob(repoPath, [".env", ".env.*"]) || codeMatches(repoPath, /\b(os\.environ|os\.getenv|process\.env|dotenv|godotenv)\b/),
    handles_secrets: anyPath(repoPath, [".env"]) || anyGlob(repoPath, [".env", ".env.*"]) || codeMatches(
      repoPath,
      /\b(keyvault|secretsmanager|secret_?manager|hashicorp.?vault|SECRET_KEY|API_KEY|getSecret)\b/i
    ),
    is_monorepo: isMonorepo,
    is_multi_service: anyGlob(repoPath, ["docker-compose.yml", "docker-compose.yaml"]) ? /services\s*:/.test(
      readIfExists(repoPath, "docker-compose.yml") || readIfExists(repoPath, "docker-compose.yaml")
    ) : (() => {
      try {
        return iterFiles(repoPath, ["Dockerfile"]).length >= 2;
      } catch {
        return false;
      }
    })(),
    has_multiple_layers: isMonorepo || [
      anyPath(repoPath, ["frontend", "web", "ui", "client"]),
      anyPath(repoPath, ["backend", "api", "server", "src"]),
      anyPath(repoPath, ["infra", "infrastructure", "terraform", "deploy"])
    ].filter(Boolean).length >= 2,
    is_not_library: hasApi || anyPath(repoPath, ["Dockerfile", "docker-compose.yml"]) || anyGlob(repoPath, ["main.py", "main.go", "app.py", "server.ts", "index.ts", "manage.py"]),
    // Connector-dependent — repo alone cannot prove these. Default false; the
    // orchestrator flips them true after a successful MCP connector fetch.
    has_tracker: Boolean(connectors?.has_tracker),
    has_docs_connector: Boolean(connectors?.has_docs_connector),
    has_incident_source: Boolean(connectors?.has_incident_source)
  };
  return flags2;
}

// plugins/awos/skills/ai-readiness-audit/audit_core.ts
var PERIOD = {
  bucket_days: 30,
  lookback_days: 730,
  history_available_days: 0
};
async function auditCore(repoPath, outDir, detectors, metrics, standardsPath) {
  const start2 = Date.now();
  const standards = loadStandards(standardsPath);
  const cats = standards.category;
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  mkdirSync2(outDir, { recursive: true });
  const skillRoot = dirname4(dirname4(standardsPath));
  const checkIdByCode = parseCheckIds(join33(skillRoot, "dimensions"));
  const collectedDir = join33(outDir, "collected");
  for (const art of [
    collect(repoPath, PERIOD),
    collect2(repoPath, PERIOD),
    collect3(repoPath, PERIOD),
    collect4(repoPath, PERIOD)
  ]) {
    writeArtifact(art, collectedDir);
  }
  const topology = computeTopology(repoPath);
  const metricIds = /* @__PURE__ */ new Set();
  for (const c of Object.values(cats)) {
    if (c.dimension === "org-portfolio" || c.method === "judgment") continue;
    if (detectors[c.code] === void 0 && c.metric) metricIds.add(c.metric);
  }
  const awarded = /* @__PURE__ */ new Set();
  const skippedByMetric = /* @__PURE__ */ new Set();
  for (const id of metricIds) {
    const fn = metrics[id];
    if (!fn) continue;
    let res;
    try {
      res = await fn(collectedDir, standards, topology, repoPath);
    } catch (err2) {
      process.stderr.write(`audit-core: metric ${id} threw: ${String(err2)}
`);
      continue;
    }
    for (const code of res.categories_awarded ?? []) {
      awarded.add(code);
    }
    if (res.status === "SKIP") {
      for (const c of Object.values(cats)) {
        if (c.metric === id) skippedByMetric.add(c.code);
      }
    }
  }
  const byDimension = {};
  let detected = 0;
  let computed = 0;
  let judgmentPending = 0;
  let skipped = 0;
  for (const [key, c] of Object.entries(cats)) {
    if (c.dimension === "org-portfolio") continue;
    const rec = buildCheck(
      key,
      c,
      detectors,
      repoPath,
      awarded,
      skippedByMetric,
      topology,
      checkIdByCode
    );
    (byDimension[c.dimension] ??= []).push(rec);
    if (rec.status === "PENDING_JUDGMENT") judgmentPending++;
    else if (rec.status === "SKIP") skipped++;
    else if (c.method === "computed") computed++;
    else detected++;
  }
  let auditTotal = 0;
  let auditApplicable = 0;
  const dimensions = [];
  for (const [dimension, checks] of Object.entries(byDimension)) {
    const score = checks.reduce((s, c) => s + c.weight_awarded, 0);
    const applicable = checks.filter((c) => c.applies).reduce((s, c) => s + c.weight_max, 0);
    auditTotal += score;
    auditApplicable += applicable;
    const dim = {
      dimension,
      date,
      score,
      coverage: applicable > 0 ? score / applicable : 0,
      checks
    };
    writeFileSync2(join33(outDir, `${dimension}.json`), JSON.stringify(dim, null, 2));
    dimensions.push(dim);
  }
  const audit = {
    date,
    project: basename8(repoPath),
    audit_total: auditTotal,
    coverage: auditApplicable > 0 ? auditTotal / auditApplicable : 0,
    dimensions
  };
  writeFileSync2(join33(outDir, "audit.json"), JSON.stringify(audit, null, 2));
  return {
    audit_total: auditTotal,
    categories: detected + computed + judgmentPending + skipped,
    detected,
    computed,
    judgment_pending: judgmentPending,
    skipped,
    duration_ms: Date.now() - start2
  };
}
function aggregate(outDir) {
  const files = readdirSync9(outDir).filter(
    (f) => f.endsWith(".json") && f !== "audit.json" && f !== "org-portfolio.json"
  );
  let total = 0;
  let applicable = 0;
  const dimensions = [];
  for (const f of files) {
    let dim;
    try {
      dim = JSON.parse(readFileSync33(join33(outDir, f), "utf8"));
    } catch {
      continue;
    }
    const checks = dim.checks;
    if (!Array.isArray(checks)) continue;
    const score = checks.reduce((s, c) => s + (c.weight_awarded || 0), 0);
    const appl = checks.filter((c) => c.applies).reduce((s, c) => s + (c.weight_max || 0), 0);
    dim.score = score;
    dim.coverage = appl > 0 ? score / appl : 0;
    writeFileSync2(join33(outDir, f), JSON.stringify(dim, null, 2));
    total += score;
    applicable += appl;
    dimensions.push(dim);
  }
  let existing = {};
  try {
    existing = JSON.parse(readFileSync33(join33(outDir, "audit.json"), "utf8"));
  } catch {
  }
  const audit = {
    date: existing.date ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    project: existing.project ?? basename8(outDir),
    audit_total: total,
    coverage: applicable > 0 ? total / applicable : 0,
    dimensions
  };
  for (const block of ["headline", "insights", "recommendations"]) {
    if (existing[block] !== void 0) audit[block] = existing[block];
  }
  writeFileSync2(join33(outDir, "audit.json"), JSON.stringify(audit, null, 2));
}
function parseCheckIds(dimensionsDir) {
  const map = /* @__PURE__ */ new Map();
  let files;
  try {
    files = readdirSync9(dimensionsDir).filter((f) => f.endsWith(".md"));
  } catch {
    return map;
  }
  const headingRe = /^###\s+([A-Z]+-\d+)\s*:/;
  const categoryRe = /^[-*]\s*\*\*Category:\*\*\s*([\d,\s]+)/;
  for (const file of files) {
    let text;
    try {
      text = readFileSync33(join33(dimensionsDir, file), "utf8");
    } catch {
      continue;
    }
    let current = null;
    for (const line of text.split("\n")) {
      const h = line.match(headingRe);
      if (h) {
        current = h[1];
        continue;
      }
      const cat = line.match(categoryRe);
      if (cat && current) {
        for (const codeStr of cat[1].split(",")) {
          const code = Number(codeStr.trim());
          if (Number.isInteger(code) && !map.has(code)) map.set(code, current);
        }
      }
    }
  }
  return map;
}
function appliesGatedOff(c, topology) {
  const aw = c.applies_when;
  if (!aw || aw === "always") return false;
  const m = aw.match(/^topology\.(.+)$/);
  return m ? !topology[m[1]] : false;
}
function buildCheck(key, c, detectors, repoPath, awarded, skippedByMetric, topology, checkIdByCode) {
  let status;
  let value = null;
  let evidence = [];
  if (appliesGatedOff(c, topology)) {
    status = "SKIP";
    value = `applies_when ${c.applies_when} is false`;
  } else if (c.method === "judgment") {
    status = "PENDING_JUDGMENT";
  } else if (detectors[c.code] !== void 0) {
    let r;
    try {
      r = detectors[c.code](repoPath);
    } catch (err2) {
      r = { status: "FAIL", value: `detector-error: ${String(err2)}`, evidence: [], method: c.method };
    }
    status = r.status;
    value = r.value;
    evidence = r.evidence;
  } else {
    if (awarded.has(c.code)) status = "PASS";
    else if (skippedByMetric.has(c.code)) status = "SKIP";
    else status = "FAIL";
  }
  const applies = status !== "SKIP";
  const weightAwarded = status === "PASS" ? c.weight : 0;
  return {
    check_id: checkIdByCode.get(c.code) ?? key,
    code: [c.code],
    method: c.method,
    status,
    value,
    evidence,
    weight_awarded: weightAwarded,
    weight_max: c.weight,
    applies,
    reliability: {
      tag: c.reliability_default ?? "unknown",
      confidence: c.method === "judgment" ? "medium" : "high",
      note: null
    },
    source: c.source ?? "",
    definition: c.definition ?? "",
    hint: `${c.definition ?? ""} \xB7 ${c.method} \xB7 ${c.source ?? ""} (${c.source_year ?? ""})`,
    plain: c.definition ?? ""
  };
}

// plugins/awos/skills/ai-readiness-audit/cli.ts
var COLLECTORS = {
  git: collect,
  ci: collect2,
  tracker: collect3,
  docs: collect4
};
var DETECTORS12 = {
  ...DETECTORS,
  ...DETECTORS2,
  ...DETECTORS3,
  ...DETECTORS4,
  ...DETECTORS5,
  ...DETECTORS6,
  ...DETECTORS7,
  ...DETECTORS8,
  ...DETECTORS9,
  ...DETECTORS10,
  ...DETECTORS11
};
function resolveSkillRoot() {
  const cliDir = dirname5(fileURLToPath2(import.meta.url));
  return cliDir.endsWith("/dist") || cliDir.endsWith("\\dist") ? dirname5(cliDir) : cliDir;
}
var METRICS = {
  adp_g1_tooling_depth: compute,
  adp_g2_contributors: compute2,
  adp_g3_deploy_frequency: compute3,
  adp_g4_lead_time: compute4,
  adp_g5_pr_cycle_time: compute5,
  adp_g6_churn: compute6,
  adp_g7_change_fail_rate: compute7,
  adp_g8_review_rework: compute8,
  adp_g9_ai_attribution: compute9,
  adp_c1_ci_pass_rate: compute10,
  adp_c2_pipeline_duration: compute11,
  adp_d1_spec_coverage: compute12,
  adp_i1_work_mix: compute13,
  adp_i2_throughput: compute14,
  adp_i3_mttr: compute15,
  adp_g10_complexity: compute16,
  adp_g11_scale: compute17,
  adp_g12_deps: compute18
};
var DEFAULT_PERIOD = {
  bucket_days: 30,
  lookback_days: 730,
  history_available_days: 0
};
function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}
async function main() {
  const [, , command, arg1, arg2] = process.argv;
  if (!command) {
    printJson({
      error: "no command given",
      usage: "collect|detect|metric|standards|progress|rollup|render <arg> [repoPath]"
    });
    process.exit(1);
  }
  switch (command) {
    case "collect": {
      const source = arg1;
      const repoPath = arg2;
      if (!source || !repoPath) {
        printJson({ error: "collect requires <source> and <repoPath>" });
        process.exit(1);
      }
      const fn = COLLECTORS[source];
      if (!fn) {
        printJson({
          error: `unknown collector source "${source}"`,
          known: Object.keys(COLLECTORS)
        });
        process.exit(1);
      }
      printJson(fn(repoPath, DEFAULT_PERIOD));
      break;
    }
    case "detect": {
      const codeStr = arg1;
      const repoPath = arg2;
      if (!codeStr || !repoPath) {
        printJson({ error: "detect requires <code> and <repoPath>" });
        process.exit(1);
      }
      const code = Number(codeStr);
      if (!Number.isInteger(code)) {
        printJson({
          error: `detector code must be an integer, got "${codeStr}"`
        });
        process.exit(1);
      }
      const fn = DETECTORS12[code];
      if (!fn) {
        printJson({
          error: `unknown detector code ${code}`,
          known: Object.keys(DETECTORS12).map(Number).sort((a, b) => a - b)
        });
        process.exit(1);
      }
      printJson(fn(repoPath));
      break;
    }
    case "standards": {
      const tomlPath = arg1;
      if (!tomlPath) {
        printJson({ error: "standards requires <path-to-standards.toml>" });
        process.exit(1);
      }
      let raw;
      try {
        raw = readFileSync34(tomlPath, "utf8");
      } catch (err2) {
        const e = err2;
        printJson({
          error: `cannot read standards file: ${e.message}`,
          path: tomlPath
        });
        process.exit(1);
      }
      const parsed = parse(raw);
      printJson(parsed);
      break;
    }
    case "metric": {
      const id = arg1;
      const repoPath = arg2;
      const [, , , , , arg3] = process.argv;
      const preCollectedDir = arg3;
      if (!id || !repoPath) {
        printJson({ error: "metric requires <id> and <repoPath>" });
        process.exit(1);
      }
      const metricFn = METRICS[id];
      if (!metricFn) {
        printJson({
          error: `unknown metric "${id}"`,
          known: Object.keys(METRICS).sort()
        });
        process.exit(1);
      }
      const isScaleMetric = id === "adp_g10_complexity" || id === "adp_g11_scale" || id === "adp_g12_deps";
      let collectedDir;
      if (preCollectedDir) {
        collectedDir = preCollectedDir;
      } else if (isScaleMetric) {
        collectedDir = repoPath;
      } else {
        const tmpRoot = mkdtempSync(join34(tmpdir(), "awos-metric-"));
        collectedDir = join34(tmpRoot, "collected");
        const gitArtifact = collect(repoPath, DEFAULT_PERIOD);
        writeArtifact(gitArtifact, collectedDir);
        if (id.startsWith("adp_c")) {
          const ciArtifact = collect2(repoPath, DEFAULT_PERIOD);
          writeArtifact(ciArtifact, collectedDir);
        }
        if (id.startsWith("adp_d")) {
          const docsArtifact = collect4(repoPath, DEFAULT_PERIOD);
          writeArtifact(docsArtifact, collectedDir);
        }
        if (id.startsWith("adp_i")) {
          const trackerArtifact = collect3(repoPath, DEFAULT_PERIOD);
          writeArtifact(trackerArtifact, collectedDir);
        }
      }
      const cliDir = dirname5(fileURLToPath2(import.meta.url));
      const skillRoot = cliDir.endsWith("/dist") || cliDir.endsWith("\\dist") ? dirname5(cliDir) : cliDir;
      const standardsPath = join34(skillRoot, "references", "standards.toml");
      const standards = loadStandards(standardsPath);
      const result = await metricFn(collectedDir, standards, {}, repoPath);
      printJson(result);
      break;
    }
    case "rollup": {
      const dirArg = arg1;
      if (!dirArg) {
        printJson({
          error: "rollup requires <dir-of-per-repo-jsons>",
          usage: "node dist/cli.js rollup <dir>"
        });
        process.exit(1);
      }
      let files;
      try {
        const { readdirSync: rd } = await import("node:fs");
        files = rd(dirArg).filter((f) => f.endsWith(".json")).map((f) => `${dirArg}/${f}`);
      } catch (err2) {
        const e = err2;
        printJson({
          error: `cannot read rollup directory: ${e.message}`,
          dir: dirArg
        });
        process.exit(1);
      }
      const perRepoResults = [];
      for (const f of files) {
        try {
          const raw = readFileSync34(f, "utf8");
          perRepoResults.push(JSON.parse(raw));
        } catch {
          process.stderr.write(`rollup: skipping unparseable file ${f}
`);
        }
      }
      const cliDirR = dirname5(fileURLToPath2(import.meta.url));
      const skillRootR = cliDirR.endsWith("/dist") || cliDirR.endsWith("\\dist") ? dirname5(cliDirR) : cliDirR;
      const standardsPathR = join34(skillRootR, "references", "standards.toml");
      let standardsR = {};
      try {
        standardsR = loadStandards(standardsPathR);
      } catch {
      }
      printJson(rollup(perRepoResults, standardsR));
      break;
    }
    case "progress": {
      const elapsedStr = arg1;
      const doneStr = arg2;
      const [, , , , , totalStr] = process.argv;
      if (!elapsedStr || !doneStr || !totalStr) {
        printJson({
          error: "progress requires <elapsed_seconds> <done> <total>"
        });
        process.exit(1);
      }
      const elapsed_seconds = Number(elapsedStr);
      const done = Number(doneStr);
      const total = Number(totalStr);
      if (isNaN(elapsed_seconds) || isNaN(done) || isNaN(total)) {
        printJson({
          error: "progress: all arguments must be numbers"
        });
        process.exit(1);
      }
      printJson(progress({ elapsed_seconds, done, total }));
      break;
    }
    case "render": {
      const auditPath = arg1;
      if (!auditPath) {
        printJson({
          error: "render requires <audit.json>",
          usage: "node dist/cli.js render <audit.json> --format md|html"
        });
        process.exit(1);
      }
      const remainingArgs = process.argv.slice(4);
      const fmtIdx = remainingArgs.indexOf("--format");
      const format = fmtIdx !== -1 ? remainingArgs[fmtIdx + 1] : "md";
      if (format !== "md" && format !== "html") {
        printJson({
          error: `render --format must be "md" or "html", got "${format}"`
        });
        process.exit(1);
      }
      let rawAudit;
      try {
        rawAudit = readFileSync34(auditPath, "utf8");
      } catch (err2) {
        const e = err2;
        printJson({
          error: `cannot read audit JSON: ${e.message}`,
          path: auditPath
        });
        process.exit(1);
      }
      let audit;
      try {
        audit = JSON.parse(rawAudit);
      } catch (err2) {
        const e = err2;
        printJson({
          error: `audit JSON is not valid JSON: ${e.message}`,
          path: auditPath
        });
        process.exit(1);
      }
      const output = format === "html" ? renderHtml(audit) : renderMarkdown(audit);
      process.stdout.write(output + "\n");
      break;
    }
    case "audit-core": {
      const repoPath = arg1;
      const outDir = arg2;
      if (!repoPath || !outDir) {
        printJson({ error: "audit-core requires <repoPath> <outDir>" });
        process.exit(1);
      }
      const standardsPath = join34(resolveSkillRoot(), "references", "standards.toml");
      const summary = await auditCore(
        repoPath,
        outDir,
        DETECTORS12,
        METRICS,
        standardsPath
      );
      printJson(summary);
      break;
    }
    case "aggregate": {
      const dir = arg1;
      if (!dir) {
        printJson({ error: "aggregate requires <auditsDir>" });
        process.exit(1);
      }
      aggregate(dir);
      printJson({ aggregated: dir });
      break;
    }
    default: {
      printJson({
        error: `unknown command "${command}"`,
        usage: "collect|detect|metric|standards|progress|rollup|render|audit-core <arg> [repoPath]"
      });
      process.exit(1);
    }
  }
}
var isMain = typeof process !== "undefined" && process.argv[1] !== void 0 && (process.argv[1] === fileURLToPath2(import.meta.url) || // When bundled as dist/cli.js the resolved path is the bundle itself.
process.argv[1].endsWith("/dist/cli.js") || process.argv[1].endsWith("\\dist\\cli.js"));
if (isMain) {
  main().catch((err2) => {
    process.stderr.write(String(err2) + "\n");
    process.exit(1);
  });
}
export {
  DETECTORS12 as DETECTORS,
  METRICS
};
/*! Bundled license information:

smol-toml/dist/date.js:
smol-toml/dist/error.js:
smol-toml/dist/primitive.js:
smol-toml/dist/util.js:
smol-toml/dist/extract.js:
smol-toml/dist/struct.js:
smol-toml/dist/parse.js:
smol-toml/dist/stringify.js:
smol-toml/dist/index.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)
*/
