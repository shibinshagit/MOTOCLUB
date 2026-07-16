import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

// Define public paths that don't require authentication
const isPublicPath = (path: string) => {
  return (
    path === "/" ||
    path.startsWith("/admin") ||
    path.startsWith("/_next") ||
    path.startsWith("/api") ||
    path.startsWith("/favicon") ||
    path.startsWith("/images") ||
    path.includes(".") // Allow all static files
  )
}

const SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback_super_secret_key_for_development_only_12345!"
)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check if the path is public
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Handle staff routes specifically
  if (pathname.startsWith("/staff")) {
    const staffToken = request.cookies.get("ims_staff_session")?.value

    if (!staffToken) {
      return NextResponse.redirect(new URL("/", request.url))
    }

    try {
      // Verify JWT for Edge runtime compatibility
      await jwtVerify(staffToken, SECRET_KEY)
      return NextResponse.next()
    } catch (error) {
      // Invalid or expired token
      return NextResponse.redirect(new URL("/", request.url))
    }
  }

  // For protected dashboard routes, we'll let the client-side authentication handle it
  // This prevents the middleware from causing redirect loops
  return NextResponse.next()
}

// Only match dashboard and staff routes
export const config = {
  matcher: ["/dashboard/:path*", "/staff/:path*"],
}
