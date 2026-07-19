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

  // Guard /dashboard routes: if the user only has a staff session cookie
  // and their role is "staff" (not "admin"), redirect them to /staff/dashboard.
  // ADMIN-role staff and DEVICE_USER logins are allowed through.
  if (pathname.startsWith("/dashboard")) {
    const staffToken = request.cookies.get("ims_staff_session")?.value

    if (staffToken) {
      try {
        const { payload } = await jwtVerify(staffToken, SECRET_KEY)
        const role = (payload as any).role as string | undefined

        // Only redirect pure "staff" role — "admin" staff are allowed in the dashboard
        if (role === "staff") {
          return NextResponse.redirect(new URL("/staff/dashboard", request.url))
        }
      } catch {
        // Token invalid/expired — let client-side handle it
      }
    }
  }

  // For all other protected routes, let the client-side authentication handle it
  return NextResponse.next()
}

// Match dashboard and staff routes
export const config = {
  matcher: ["/dashboard/:path*", "/staff/:path*"],
}
