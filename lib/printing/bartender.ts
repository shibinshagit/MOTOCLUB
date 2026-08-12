import fs from "fs"
import path from "path"
import os from "os"
import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

export interface PrintLabelParams {
  productId: string | number
  productCode: string
  productName: string
  price?: number | string
  batchNumber?: string
  quantity: number
  barcode?: string
}

export interface PrintResult {
  success: boolean
  message?: string
  error?: string
}

/**
 * Centralized BarTender printing service.
 * Handles local BarTender COM/CLI printing and remote Print Agent relays.
 */
export async function printLabelWithBarTender(params: PrintLabelParams): Promise<PrintResult> {
  const { productId, productCode, productName, price, batchNumber, quantity, barcode } = params

  // 1. Validate quantity
  if (!quantity || typeof quantity !== "number" || quantity <= 0) {
    return {
      success: false,
      error: "Invalid print quantity. Quantity must be a positive number.",
    }
  }

  // 2. Check if a local print agent URL is configured (e.g. for cloud deployments)
  const agentUrl = process.env.BARTENDER_PRINT_AGENT_URL
  if (agentUrl) {
    try {
      const res = await fetch(agentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || `Local print agent returned status ${res.status}`,
        }
      }
      return {
        success: true,
        message: data.message || "Print job sent to local BarTender print agent",
      }
    } catch (err: any) {
      return {
        success: false,
        error: `Could not reach Local Print Agent at ${agentUrl}: ${err.message}`,
      }
    }
  }

  // 3. Validate label template path
  const configuredTemplatePath = process.env.BARTENDER_TEMPLATE_PATH || path.join("templates", "bartendertemplate.btw")
  const templatePath = path.isAbsolute(configuredTemplatePath)
    ? configuredTemplatePath
    : path.join(process.cwd(), configuredTemplatePath)

  if (!fs.existsSync(templatePath)) {
    return {
      success: false,
      error: `BarTender label template file not found at path: ${templatePath}`,
    }
  }

  const printerName = process.env.BARTENDER_PRINTER_NAME || ""
  const bartenderExePath = process.env.BARTENDER_EXE_PATH || ""
  const formattedPrice = price !== undefined && price !== null ? String(price) : ""
  const barcodeValue = barcode || productCode || String(productId)

  // 4. Create temporary PowerShell script file for clean execution & error formatting
  const tempPsScriptPath = path.join(
    os.tmpdir(),
    `bt_print_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.ps1`
  )

  const psScriptContent = `
$ErrorActionPreference = "Stop"

$templatePath = "${escapePsPath(templatePath)}"
$printerName = "${escapePsPath(printerName)}"
$bartenderExe = "${escapePsPath(bartenderExePath)}"

# Attempt COM Automation
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

        # Set named substrings / fields
        try { $btFormat.NamedSubStrings.Item("ProductName").Value = "${escapePs(productName)}" } catch {}
        try { $btFormat.NamedSubStrings.Item("ProductCode").Value = "${escapePs(productCode)}" } catch {}
        try { $btFormat.NamedSubStrings.Item("Price").Value = "${escapePs(formattedPrice)}" } catch {}
        try { $btFormat.NamedSubStrings.Item("BatchNumber").Value = "${escapePs(batchNumber || "")}" } catch {}
        try { $btFormat.NamedSubStrings.Item("Barcode").Value = "${escapePs(barcodeValue)}" } catch {}
        try { $btFormat.NamedSubStrings.Item("ProductId").Value = "${escapePs(String(productId))}" } catch {}

        if ($printerName) {
            $btFormat.Printer = $printerName
        }

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

# Fallback: Try Command Line execution (bartend.exe)
$exeCandidates = @(
    $bartenderExe,
    "C:\\Program Files\\Seagull\\BarTender UltraLite\\bartend.exe",
    "C:\\Program Files\\Seagull\\BarTender Suite\\bartend.exe",
    "C:\\Program Files\\Seagull\\BarTender\\bartend.exe",
    "C:\\Program Files (x86)\\Seagull\\BarTender UltraLite\\bartend.exe",
    "C:\\Program Files (x86)\\Seagull\\BarTender Suite\\bartend.exe",
    "C:\\Program Files (x86)\\Seagull\\BarTender\\bartend.exe"
) | Where-Object { $_ -and (Test-Path $_) }

if ($exeCandidates.Count -gt 0) {
    $foundExe = $exeCandidates[0]
    $prnArg = if ($printerName) { "/PRN=\`"$printerName\`"" } else { "" }
    $cmdArgs = "/F=\`"$templatePath\`" $prnArg /C=${Math.floor(quantity)} /P /X"
    
    try {
        Start-Process -FilePath $foundExe -ArgumentList $cmdArgs -Wait -NoNewWindow
        Write-Output "SUCCESS: Print job sent via BarTender CLI ($foundExe)"
        exit 0
    } catch {
        Write-Error "BarTender CLI error: $_"
        exit 1
    }
}

Write-Error "BarTender is not installed or BarTender COM Automation server is not registered on this system. Please install BarTender (Automation / Enterprise edition) or configure BARTENDER_EXE_PATH in .env."
exit 1
`

  try {
    fs.writeFileSync(tempPsScriptPath, psScriptContent, "utf8")

    const { stdout, stderr } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", tempPsScriptPath],
      { timeout: 30000 }
    )

    if (stderr && stderr.trim().length > 0 && !stdout.includes("SUCCESS")) {
      return {
        success: false,
        error: cleanPsError(stderr),
      }
    }

    return {
      success: true,
      message: "Print job sent to BarTender",
    }
  } catch (err: any) {
    const rawError = err.stderr || err.stdout || err.message || "Unknown printing error"
    return {
      success: false,
      error: cleanPsError(rawError),
    }
  } finally {
    try {
      if (fs.existsSync(tempPsScriptPath)) {
        fs.unlinkSync(tempPsScriptPath)
      }
    } catch {}
  }
}

function cleanPsError(rawError: string): string {
  if (!rawError) return "BarTender print job failed"

  const lines = rawError
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  // Find concise error line
  const errorLine = lines.find(
    (l) =>
      l.includes("BarTender is not installed") ||
      l.includes("BarTender COM error") ||
      l.includes("BarTender CLI error")
  )

  if (errorLine) {
    return errorLine
      .replace(/^.*Write-Error\s*:\s*/i, "")
      .replace(/^.*:\s*/, "")
      .trim()
  }

  const filtered = lines.filter(
    (l) =>
      !l.includes("At line:") &&
      !l.includes("+ CategoryInfo") &&
      !l.includes("+ FullyQualifiedErrorId") &&
      !l.includes("~~~~~") &&
      !l.includes("+")
  )

  return filtered.join(" ") || "BarTender printing error"
}

function escapePs(str: string): string {
  if (!str) return ""
  return str
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "``")
    .replace(/"/g, '`"')
    .replace(/\$/g, "`$")
}

function escapePsPath(str: string): string {
  if (!str) return ""
  return str.replace(/\\/g, "\\\\").replace(/"/g, '`"')
}
