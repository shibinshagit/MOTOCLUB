"use client"

import Image from "next/image"
import { useEffect, useState } from "react"

interface CompanyInfo {
  name: string
  address: string
  phone: string
  email: string
  logo?: string
  currency: string
}

interface ReceiptHeaderProps {
  deviceId: string
  className?: string
}

export function ReceiptHeader({ deviceId, className = "" }: ReceiptHeaderProps) {
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>({
    name: "Moto Club",
    address: "kottakkal, malappuram, kerala, india",
    phone: "+91 9995442239",
    email: "",
    currency: "INR",
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(false)
  }, [deviceId])

  if (loading) {
    return <div className="h-16 animate-pulse bg-gray-200 rounded-md"></div>
  }

  if (!companyInfo) {
    return <div className="text-center py-2">Company information not available</div>
  }

  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      <div className="flex items-center justify-center gap-2 mb-1">
        {companyInfo.logo && (
          <div className="relative h-12 w-12 overflow-hidden">
            <Image
              src={companyInfo.logo || "/placeholder.svg"}
              alt={`${companyInfo.name} logo`}
              fill
              className="object-contain"
            />
          </div>
        )}
        <h2 className="text-xl font-bold">{companyInfo.name}</h2>
      </div>
      <p className="text-sm whitespace-pre-line">{companyInfo.address}</p>
      <p className="text-sm">Tel: {companyInfo.phone}</p>
      {companyInfo.email && <p className="text-sm">Email: {companyInfo.email}</p>}
    </div>
  )
}
