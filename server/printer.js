'use strict';
// Envio de bytes ESC/POS para a impressora térmica.
//   modo "spooler": fila de impressão do Windows em modo RAW (USB com o driver instalado) — sem módulos nativos
//   modo "rede"   : TCP direto para IP:9100 (modelos com Ethernet)
//   modo "arquivo": grava os bytes num arquivo (desenvolvimento/testes)
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { bad } = require('./services');

// C# (P/Invoke winspool.drv) executado pelo PowerShell: abre a impressora, inicia documento RAW e escreve os bytes.
// Nome da impressora e arquivo vêm por variáveis de ambiente (nada é interpolado no script → sem injeção).
const PS_RAW = `
$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System; using System.IO; using System.Runtime.InteropServices;
public class FgRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public class DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
  public static void Send(string printer, string file) {
    byte[] data = File.ReadAllBytes(file); IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("Impressora '" + printer + "' não encontrada (erro " + Marshal.GetLastWin32Error() + ")");
    try {
      DOCINFO di = new DOCINFO(); di.pDocName = "FrioGest cupom"; di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter falhou (erro " + Marshal.GetLastWin32Error() + ")");
      try {
        StartPagePrinter(h); int w;
        if (!WritePrinter(h, data, data.Length, out w) || w != data.Length) throw new Exception("WritePrinter falhou (erro " + Marshal.GetLastWin32Error() + ")");
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
try { [FgRaw]::Send($env:FG_PRINTER, $env:FG_FILE); Write-Output 'OK' }
catch { $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }; [Console]::Error.WriteLine($e.Message); exit 2 }
`;
const PS_LIST = `$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8
Get-CimInstance Win32_Printer | Select-Object Name,DriverName,PortName,Default | ConvertTo-Json -Compress`;

const enc = s => Buffer.from(s, 'utf16le').toString('base64');
const runPS = (script, env = {}, timeout = 25000) => new Promise((resolve, reject) => {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc(script)],
    { env: { ...process.env, ...env }, timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || '').replace(/#< CLIXML[\s\S]*$/, '').trim().split(/\r?\n/)[0];
        return reject(new Error(msg || (err.killed ? 'tempo esgotado ao falar com o Windows' : 'o PowerShell falhou (código ' + err.code + ')')));
      }
      resolve(String(stdout).trim());
    });
});

const TERMICA = /bematech|elgin|mp-?4200|mp-?100|mp-?20|t[eé]rmic|thermal|epson\s*tm|daruma|tanca|pos-?\d|gprinter|i9|i8/i;

/** Lista as impressoras instaladas no computador (térmicas conhecidas primeiro). */
async function listPrinters() {
  if (process.platform !== 'win32') {
    return new Promise(res => execFile('lpstat', ['-p'], (e, out) => res(e ? [] : String(out).split('\n').map(l => (l.match(/^printer (\S+)/) || [])[1]).filter(Boolean).map(n => ({ nome: n, driver: '', porta: '', padrao: false, termica: TERMICA.test(n) })))));
  }
  const raw = await runPS(PS_LIST, {}, 15000).catch(() => '[]');
  let arr; try { arr = JSON.parse(raw || '[]'); } catch { arr = []; }
  if (!Array.isArray(arr)) arr = [arr];
  return arr.filter(p => p && p.Name).map(p => ({ nome: p.Name, driver: p.DriverName || '', porta: p.PortName || '', padrao: !!p.Default, termica: TERMICA.test(`${p.Name} ${p.DriverName}`) }))
    .sort((a, b) => (b.termica - a.termica) || a.nome.localeCompare(b.nome));
}

function sendTcp(ip, port, buf, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: ip, port }, () => { sock.write(buf, () => sock.end()); });
    const t = setTimeout(() => { sock.destroy(); reject(bad(`Sem resposta da impressora em ${ip}:${port}`, 502)); }, timeout);
    sock.on('close', () => { clearTimeout(t); resolve(); });
    sock.on('error', e => { clearTimeout(t); reject(bad(`Não consegui falar com a impressora em ${ip}:${port} (${e.code || e.message})`, 502)); });
  });
}

/** cfg: { modo, nome, ip, porta, arquivo }  ·  buf: Buffer com os comandos */
async function send(cfg, buf) {
  const modo = cfg.modo || 'desligada';
  if (modo === 'desligada') throw bad('Impressora térmica não configurada. Vá em Configurações > Impressora térmica.', 400);
  if (modo === 'rede') {
    if (!cfg.ip) throw bad('Informe o IP da impressora em Configurações.', 400);
    return sendTcp(cfg.ip, +cfg.porta || 9100, buf);
  }
  if (modo === 'arquivo') { fs.appendFileSync(cfg.arquivo, buf); return; }
  if (modo !== 'spooler') throw bad('Modo de impressora inválido', 400);
  if (!cfg.nome) throw bad('Escolha a impressora em Configurações > Impressora térmica.', 400);
  const tmp = path.join(os.tmpdir(), `friogest-cupom-${process.pid}-${Date.now()}.bin`);
  fs.writeFileSync(tmp, buf);
  try {
    if (process.platform === 'win32') {
      try { await runPS(PS_RAW, { FG_PRINTER: cfg.nome, FG_FILE: tmp }); }
      catch (e) { throw bad('Falha ao imprimir: ' + e.message, 502); }
    } else {
      await new Promise((resolve, reject) => execFile('lp', ['-d', cfg.nome, '-o', 'raw', tmp], e => (e ? reject(bad('Falha ao imprimir: ' + e.message, 502)) : resolve())));
    }
  } finally { fs.unlink(tmp, () => {}); }
}

module.exports = { send, listPrinters };
