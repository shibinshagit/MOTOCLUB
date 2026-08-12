/**
 * Local Windows Print Agent for BarTender
 * 
 * Run this lightweight agent on the local Windows PC where BarTender is installed
 * if your Next.js application is deployed to Vercel/cloud.
 * 
 * Usage:
 *   node scripts/local-print-agent.js
 * 
 * Environment variables in Next.js cloud deployment:
 *   BARTENDER_PRINT_AGENT_URL=http://<local-pc-ip>:9100/print
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const PORT = process.env.PORT || 9100;

const server = http.createServer(async (req, res) => {
  // Enable CORS for Next.js app requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && (req.url === '/print' || req.url === '/')) {
    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(bodyStr);
        const result = await handlePrintRequest(payload);
        res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message || 'Invalid JSON payload' }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found. Use POST /print' }));
  }
});

async function handlePrintRequest(params) {
  const { productId, productCode, productName, price, batchNumber, quantity, barcode } = params;

  if (!quantity || quantity <= 0) {
    return { success: false, error: 'Invalid print quantity. Must be > 0' };
  }

  const templatePath = process.env.BARTENDER_TEMPLATE_PATH || path.join(__dirname, '..', 'templates', 'bartendertemplate.btw');
  const printerName = process.env.BARTENDER_PRINTER_NAME || '';
  const bartenderExePath = process.env.BARTENDER_EXE_PATH || '';

  const tempPsScriptPath = path.join(os.tmpdir(), `bt_agent_${Date.now()}.ps1`);

  const psScriptContent = `
$ErrorActionPreference = "Stop"

$templatePath = "${templatePath.replace(/\\/g, "\\\\")}"
$printerName = "${printerName.replace(/\\/g, "\\\\")}"

$btApp = $null
$comAvailable = $false
try {
    $btApp = New-Object -ComObject BarTender.Application
    $comAvailable = $true
} catch {
    $comAvailable = $false
}

if ($comAvailable -and $btApp) {
    $btFormat = $null
    try {
        $btApp.Visible = $false
        $btFormat = $btApp.Formats.Open($templatePath, $false, "")
        try { $btFormat.NamedSubStrings.Item("ProductName").Value = "${escapePs(productName)}" } catch {}
        try { $btFormat.NamedSubStrings.Item("ProductCode").Value = "${escapePs(productCode)}" } catch {}
        try { $btFormat.NamedSubStrings.Item("Price").Value = "${escapePs(String(price || ''))}" } catch {}
        try { $btFormat.NamedSubStrings.Item("BatchNumber").Value = "${escapePs(batchNumber || '')}" } catch {}
        try { $btFormat.NamedSubStrings.Item("Barcode").Value = "${escapePs(barcode || productCode)}" } catch {}
        try { $btFormat.NamedSubStrings.Item("ProductId").Value = "${escapePs(String(productId))}" } catch {}

        if ($printerName) { $btFormat.Printer = $printerName }
        $btFormat.IdenticalCopiesOfLabel = ${Math.floor(quantity)}
        $null = $btFormat.PrintOut($false, $false)
        $btFormat.Close(1)
        $btApp.Quit(1)
        Write-Output "SUCCESS: Print job sent to BarTender"
        exit 0
    } catch {
        if ($null -ne $btFormat) { try { $btFormat.Close(1) } catch {} }
        if ($null -ne $btApp) { try { $btApp.Quit(1) } catch {} }
        Write-Error "BarTender COM error: $_"
        exit 1
    }
}

Write-Error "BarTender COM Automation server is not registered on this system."
exit 1
`;

  try {
    fs.writeFileSync(tempPsScriptPath, psScriptContent, 'utf8');
    const { stdout, stderr } = await execFileAsync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tempPsScriptPath], { timeout: 30000 });
    if (stderr && stderr.trim().length > 0 && !stdout.includes('SUCCESS')) {
      return { success: false, error: stderr.trim() };
    }
    return { success: true, message: 'Print job sent to BarTender' };
  } catch (err) {
    return { success: false, error: err.stderr || err.message || 'Print job failed' };
  } finally {
    try { fs.unlinkSync(tempPsScriptPath); } catch {}
  }
}

function escapePs(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/`/g, '``').replace(/"/g, '`"').replace(/\$/g, '`$');
}

server.listen(PORT, () => {
  console.log(`Local BarTender Print Agent listening on port ${PORT}`);
  console.log(`Configure Next.js BARTENDER_PRINT_AGENT_URL=http://localhost:${PORT}/print`);
});
