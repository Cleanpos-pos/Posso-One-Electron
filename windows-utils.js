import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
const cSharpSource = `
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)]
        public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)]
        public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)]
        public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static int SendFileToPrinter(string szPrinterName, string szFileName)
    {
        FileStream fs = new FileStream(szFileName, FileMode.Open);
        BinaryReader br = new BinaryReader(fs);
        Byte[] bytes;
        bool bSuccess = false;
        IntPtr pUnmanagedBytes = new IntPtr(0);
        int nLength;
        int error = 0;

        try {
            nLength = Convert.ToInt32(fs.Length);
            bytes = br.ReadBytes(nLength);
            pUnmanagedBytes = Marshal.AllocCoTaskMem(nLength);
            Marshal.Copy(bytes, 0, pUnmanagedBytes, nLength);
            bSuccess = SendBytesToPrinter(szPrinterName, pUnmanagedBytes, nLength);
            if (!bSuccess) {
                error = Marshal.GetLastWin32Error();
            }
        } finally {
            if (pUnmanagedBytes != IntPtr.Zero) Marshal.FreeCoTaskMem(pUnmanagedBytes);
            fs.Close();
        }
        return error;
    }

    public static bool SendBytesToPrinter(string szPrinterName, IntPtr pBytes, Int32 dwCount)
    {
        Int32 dwWritten = 0;
        IntPtr hPrinter = new IntPtr(0);
        DOCINFOA di = new DOCINFOA();
        bool bSuccess = false;

        di.pDocName = "Posso RAW Document";
        di.pDataType = "RAW";

        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero))
        {
            if (StartDocPrinter(hPrinter, 1, di))
            {
                if (StartPagePrinter(hPrinter))
                {
                    bSuccess = WritePrinter(hPrinter, pBytes, dwCount, out dwWritten);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }
}
`;
export const listWindowsPrinters = async () => {
    // Try PowerShell Get-Printer first, fall back to wmic
    const tryPowerShell = () => new Promise((resolve) => {
        const command = `powershell -NoProfile -NonInteractive -Command "Get-Printer -ErrorAction SilentlyContinue | Select-Object Name,PortName,DriverName | ConvertTo-Json -Compress"`;
        exec(command, { maxBuffer: 1024 * 1024 * 5, timeout: 10000 }, (error, stdout, stderr) => {
            if (error) {
                console.error("Get-Printer error:", error.message);
                return resolve([]);
            }
            try {
                const trimmed = stdout.trim();
                if (!trimmed || trimmed === 'null')
                    return resolve([]);
                const result = JSON.parse(trimmed);
                resolve(Array.isArray(result) ? result : [result]);
            }
            catch (e) {
                console.error("Get-Printer parse error:", e, stdout);
                resolve([]);
            }
        });
    });
    const tryWmic = () => new Promise((resolve) => {
        exec('wmic printer get Name,PortName,DriverName /format:csv', { timeout: 10000 }, (error, stdout) => {
            if (error) {
                console.error("wmic printer error:", error.message);
                return resolve([]);
            }
            try {
                const lines = stdout.trim().split('\n').filter(l => l.trim());
                // First line is header: Node,DriverName,Name,PortName
                if (lines.length < 2)
                    return resolve([]);
                const headers = lines[0].split(',').map(h => h.trim());
                const nameIdx = headers.indexOf('Name');
                const portIdx = headers.indexOf('PortName');
                const driverIdx = headers.indexOf('DriverName');
                const printers = lines.slice(1)
                    .map(line => {
                    const cols = line.split(',').map(c => c.trim());
                    return {
                        Name: nameIdx >= 0 ? cols[nameIdx] : '',
                        PortName: portIdx >= 0 ? cols[portIdx] : '',
                        DriverName: driverIdx >= 0 ? cols[driverIdx] : ''
                    };
                })
                    .filter(p => p.Name && p.Name.length > 0);
                resolve(printers);
            }
            catch (e) {
                console.error("wmic parse error:", e);
                resolve([]);
            }
        });
    });
    const psResult = await tryPowerShell();
    if (psResult.length > 0)
        return psResult;
    console.log("Get-Printer returned empty, trying wmic fallback...");
    return tryWmic();
};
// Cache compiled DLL path
let cachedDllPath = null;
const ensureCompiledDll = () => {
    return new Promise((resolve, reject) => {
        const dllPath = path.join(os.tmpdir(), 'PossoRawPrinter.dll');
        // If already cached and exists, return immediately
        if (cachedDllPath && fs.existsSync(cachedDllPath)) {
            return resolve(cachedDllPath);
        }
        // If DLL exists from previous session, use it
        if (fs.existsSync(dllPath)) {
            cachedDllPath = dllPath;
            return resolve(dllPath);
        }
        // Compile once
        console.log('Compiling Windows print helper DLL (one-time)...');
        const csPath = path.join(os.tmpdir(), 'RawPrinterHelper.cs');
        fs.writeFileSync(csPath, cSharpSource);
        const compileCommand = `
$cscPath = [System.IO.Path]::Combine([System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory(), 'csc.exe')
if (Test-Path $cscPath) {
    & $cscPath /target:library /out:"${dllPath.replace(/\\/g, '\\\\')}" "${csPath.replace(/\\/g, '\\\\')}" 2>&1
    if (Test-Path "${dllPath.replace(/\\/g, '\\\\')}") { Write-Output "OK" } else { Write-Output "FAIL" }
} else {
    Add-Type -TypeDefinition (Get-Content "${csPath.replace(/\\/g, '\\\\')}" -Raw) -OutputAssembly "${dllPath.replace(/\\/g, '\\\\')}" -OutputType Library
    if (Test-Path "${dllPath.replace(/\\/g, '\\\\')}") { Write-Output "OK" } else { Write-Output "FAIL" }
}
`;
        exec(`powershell -NoProfile -Command "${compileCommand.replace(/"/g, '\\"')}"`, { timeout: 30000 }, (error, stdout) => {
            try {
                fs.unlinkSync(csPath);
            }
            catch (e) { }
            if (fs.existsSync(dllPath)) {
                cachedDllPath = dllPath;
                console.log('Windows print helper DLL compiled successfully');
                resolve(dllPath);
            }
            else {
                reject(new Error('Failed to compile print helper: ' + (stdout || error?.message)));
            }
        });
    });
};
export const printToWindows = async (printerName, data) => {
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `print-${Date.now()}.bin`);
    try {
        fs.writeFileSync(tempFile, data);
        const dllPath = await ensureCompiledDll();
        return new Promise((resolve) => {
            // Fast print using pre-compiled DLL
            const psCommand = `
[System.Reflection.Assembly]::LoadFrom('${dllPath.replace(/\\/g, '\\\\')}') | Out-Null
$res = [RawPrinterHelper]::SendFileToPrinter('${printerName}', '${tempFile.replace(/\\/g, '\\\\')}')
if ($res -eq 0) { "OK" } else { "FAIL:$res" }
`;
            exec(`powershell -NoProfile -NonInteractive -Command "${psCommand.replace(/"/g, '\\"')}"`, { timeout: 10000 }, (error, stdout, stderr) => {
                try {
                    if (fs.existsSync(tempFile))
                        fs.unlinkSync(tempFile);
                }
                catch (e) { }
                const output = stdout.trim();
                console.log(`Print Output: ${output}`);
                if (output.includes("OK")) {
                    resolve(null);
                }
                else {
                    resolve(`Print failed: ${output} ${stderr || ''} ${error?.message || ''}`);
                }
            });
        });
    }
    catch (e) {
        try {
            if (fs.existsSync(tempFile))
                fs.unlinkSync(tempFile);
        }
        catch (ex) { }
        return `Print error: ${e.message}`;
    }
};
