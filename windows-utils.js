"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.printToWindows = exports.listWindowsPrinters = void 0;
var child_process_1 = require("child_process");
var path_1 = __importDefault(require("path"));
var fs_1 = __importDefault(require("fs"));
var os_1 = __importDefault(require("os"));
var listWindowsPrinters = function () { return __awaiter(void 0, void 0, void 0, function () {
    var tryPowerShell, tryWmic, psResult;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tryPowerShell = function () { return new Promise(function (resolve) {
                    var command = "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command \"Get-Printer -ErrorAction SilentlyContinue | Select-Object Name,PortName,DriverName | ConvertTo-Json -Compress\"";
                    (0, child_process_1.exec)(command, { maxBuffer: 1024 * 1024 * 5, timeout: 10000 }, function (error, stdout, stderr) {
                        if (error) {
                            console.error("Get-Printer error:", error.message);
                            return resolve([]);
                        }
                        try {
                            var trimmed = stdout.trim();
                            if (!trimmed || trimmed === 'null')
                                return resolve([]);
                            var result = JSON.parse(trimmed);
                            resolve(Array.isArray(result) ? result : [result]);
                        }
                        catch (e) {
                            console.error("Get-Printer parse error:", e, stdout);
                            resolve([]);
                        }
                    });
                }); };
                tryWmic = function () { return new Promise(function (resolve) {
                    (0, child_process_1.exec)('wmic printer get Name,PortName,DriverName /format:csv', { timeout: 10000 }, function (error, stdout) {
                        if (error) {
                            console.error("wmic printer error:", error.message);
                            return resolve([]);
                        }
                        try {
                            var lines = stdout.trim().split('\n').filter(function (l) { return l.trim(); });
                            // First line is header: Node,DriverName,Name,PortName
                            if (lines.length < 2)
                                return resolve([]);
                            var headers = lines[0].split(',').map(function (h) { return h.trim(); });
                            var nameIdx_1 = headers.indexOf('Name');
                            var portIdx_1 = headers.indexOf('PortName');
                            var driverIdx_1 = headers.indexOf('DriverName');
                            var printers = lines.slice(1)
                                .map(function (line) {
                                var cols = line.split(',').map(function (c) { return c.trim(); });
                                return {
                                    Name: nameIdx_1 >= 0 ? cols[nameIdx_1] : '',
                                    PortName: portIdx_1 >= 0 ? cols[portIdx_1] : '',
                                    DriverName: driverIdx_1 >= 0 ? cols[driverIdx_1] : ''
                                };
                            })
                                .filter(function (p) { return p.Name && p.Name.length > 0; });
                            resolve(printers);
                        }
                        catch (e) {
                            console.error("wmic parse error:", e);
                            resolve([]);
                        }
                    });
                }); };
                return [4 /*yield*/, tryPowerShell()];
            case 1:
                psResult = _a.sent();
                if (psResult.length > 0)
                    return [2 /*return*/, psResult];
                console.log("Get-Printer returned empty, trying wmic fallback...");
                return [2 /*return*/, tryWmic()];
        }
    });
}); };
exports.listWindowsPrinters = listWindowsPrinters;
/**
 * Print raw bytes directly to Windows printer via winspool.drv
 * Uses PowerShell with inline C# Add-Type (no DLL compilation needed)
 */
var printToWindows = function (printerName, data) { return __awaiter(void 0, void 0, void 0, function () {
    var tempDir, timestamp, tempFile, tempScript, psScript;
    return __generator(this, function (_a) {
        tempDir = os_1.default.tmpdir();
        timestamp = Date.now();
        tempFile = path_1.default.join(tempDir, "print-".concat(timestamp, ".bin"));
        tempScript = path_1.default.join(tempDir, "print-".concat(timestamp, ".ps1"));
        try {
            fs_1.default.writeFileSync(tempFile, data);
        }
        catch (err) {
            return [2 /*return*/, "Failed to write temp file: ".concat(err.message)];
        }
        psScript = "\nAdd-Type -TypeDefinition @\"\nusing System;\nusing System.IO;\nusing System.Runtime.InteropServices;\n\npublic class RawPrinterHelper {\n    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]\n    public class DOCINFOA {\n        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;\n        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;\n        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;\n    }\n\n    [DllImport(\"winspool.drv\", EntryPoint = \"OpenPrinterA\", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]\n    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);\n\n    [DllImport(\"winspool.drv\", EntryPoint = \"ClosePrinter\", SetLastError = true)]\n    public static extern bool ClosePrinter(IntPtr hPrinter);\n\n    [DllImport(\"winspool.drv\", EntryPoint = \"StartDocPrinterA\", SetLastError = true, CharSet = CharSet.Ansi)]\n    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);\n\n    [DllImport(\"winspool.drv\", EntryPoint = \"EndDocPrinter\", SetLastError = true)]\n    public static extern bool EndDocPrinter(IntPtr hPrinter);\n\n    [DllImport(\"winspool.drv\", EntryPoint = \"StartPagePrinter\", SetLastError = true)]\n    public static extern bool StartPagePrinter(IntPtr hPrinter);\n\n    [DllImport(\"winspool.drv\", EntryPoint = \"EndPagePrinter\", SetLastError = true)]\n    public static extern bool EndPagePrinter(IntPtr hPrinter);\n\n    [DllImport(\"winspool.drv\", EntryPoint = \"WritePrinter\", SetLastError = true)]\n    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);\n\n    public static bool SendBytesToPrinter(string printerName, byte[] bytes) {\n        IntPtr hPrinter = IntPtr.Zero;\n        DOCINFOA di = new DOCINFOA();\n        di.pDocName = \"RAW Document\";\n        di.pDataType = \"RAW\";\n\n        bool success = false;\n\n        if (OpenPrinter(printerName.Normalize(), out hPrinter, IntPtr.Zero)) {\n            if (StartDocPrinter(hPrinter, 1, di)) {\n                if (StartPagePrinter(hPrinter)) {\n                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);\n                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);\n\n                    int dwWritten;\n                    success = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);\n\n                    Marshal.FreeCoTaskMem(pUnmanagedBytes);\n                    EndPagePrinter(hPrinter);\n                }\n                EndDocPrinter(hPrinter);\n            }\n            ClosePrinter(hPrinter);\n        }\n        return success;\n    }\n}\n\"@\n\ntry {\n    $bytes = [System.IO.File]::ReadAllBytes(\"".concat(tempFile.replace(/\\/g, '\\\\'), "\")\n    $result = [RawPrinterHelper]::SendBytesToPrinter(\"").concat(printerName.replace(/"/g, '`"'), "\", $bytes)\n    if ($result) {\n        Write-Output \"SUCCESS\"\n    } else {\n        $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()\n        Write-Output \"FAILED:$err\"\n    }\n} catch {\n    Write-Output \"ERROR:$_\"\n} finally {\n    Remove-Item -Path \"").concat(tempFile.replace(/\\/g, '\\\\'), "\" -Force -ErrorAction SilentlyContinue\n}\n");
        try {
            fs_1.default.writeFileSync(tempScript, psScript, 'utf8');
        }
        catch (err) {
            try {
                fs_1.default.unlinkSync(tempFile);
            }
            catch (e) { }
            return [2 /*return*/, "Failed to write script file: ".concat(err.message)];
        }
        return [2 /*return*/, new Promise(function (resolve) {
                (0, child_process_1.exec)("powershell -NoProfile -ExecutionPolicy Bypass -File \"".concat(tempScript, "\""), { maxBuffer: 1024 * 1024, timeout: 15000 }, function (error, stdout, stderr) {
                    // Clean up temp files
                    try {
                        fs_1.default.unlinkSync(tempFile);
                    }
                    catch (e) { }
                    try {
                        fs_1.default.unlinkSync(tempScript);
                    }
                    catch (e) { }
                    if (error) {
                        console.error('Print error:', error);
                        console.error('Stderr:', stderr);
                        resolve("Print error: ".concat(error.message));
                        return;
                    }
                    var output = stdout.trim();
                    console.log("Print Output: ".concat(output));
                    if (output === 'SUCCESS') {
                        resolve(null); // null means success
                    }
                    else if (output.startsWith('FAILED:')) {
                        var errorCode = output.split(':')[1];
                        resolve("Print failed with Windows error code: ".concat(errorCode));
                    }
                    else if (output.startsWith('ERROR:')) {
                        resolve("Print error: ".concat(output.substring(6)));
                    }
                    else {
                        resolve("Unexpected output: ".concat(output));
                    }
                });
            })];
    });
}); };
exports.printToWindows = printToWindows;
