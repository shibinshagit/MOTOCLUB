import type React from "react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Live Shipment & Parcel Tracking | MOTOCLUB",
  description: "Track your shipment, delivery status, and courier transit checkpoints in real time.",
  icons: {
    icon: [
      { url: "/track-favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/track-favicon.svg",
    apple: "/track-favicon.svg",
  },
  openGraph: {
    title: "Live Shipment & Parcel Tracking | MOTOCLUB",
    description: "Track your shipment, delivery status, and courier transit checkpoints in real time.",
    type: "website",
  },
}

export default function TrackLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
    </>
  )
}
