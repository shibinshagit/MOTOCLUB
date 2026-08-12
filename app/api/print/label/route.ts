import { NextRequest, NextResponse } from "next/server"
import { printLabelWithBarTender } from "@/lib/printing/bartender"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { productId, productCode, productName, price, batchNumber, quantity, barcode } = body || {}

    // Validation
    const missingFields: string[] = []
    if (productId === undefined || productId === null || productId === "") {
      missingFields.push("productId")
    }
    if (!productCode || typeof productCode !== "string" || productCode.trim() === "") {
      missingFields.push("productCode")
    }
    if (!productName || typeof productName !== "string" || productName.trim() === "") {
      missingFields.push("productName")
    }
    if (quantity === undefined || quantity === null || typeof quantity !== "number" || quantity <= 0) {
      missingFields.push("quantity (must be a positive number)")
    }

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing or invalid required fields: ${missingFields.join(", ")}`,
        },
        { status: 400 }
      )
    }

    // Call BarTender printing service
    const result = await printLabelWithBarTender({
      productId,
      productCode: String(productCode).trim(),
      productName: String(productName).trim(),
      price: price !== undefined && price !== null ? price : undefined,
      batchNumber: batchNumber ? String(batchNumber).trim() : undefined,
      quantity: Number(quantity),
      barcode: barcode ? String(barcode).trim() : undefined,
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Failed to send print job to BarTender.",
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: "Print job sent to BarTender",
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("API /api/print/label error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error during label printing.",
      },
      { status: 500 }
    )
  }
}
