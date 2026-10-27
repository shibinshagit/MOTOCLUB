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

  // Silently satisfy browser DevTools and well-known probes without hitting the page router
  if (pathname.startsWith("/.well-known/")) {
    return new NextResponse("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Check if the path is public
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Never redirect Next.js Server Actions or POST requests in middleware.
  // Server actions handle authorization internally.
  // Redirecting action requests causes Next.js to fail forwarding with [TypeError: fetch failed].
  if (
    request.method === "POST" ||
    request.headers.get("next-action") ||
    request.headers.get("x-action-id")
  ) {
    return NextResponse.next()
  }

  // Handle partner routes specifically
  if (pathname.startsWith("/partner")) {
    const staffToken = request.cookies.get("ims_staff_session")?.value

    if (!staffToken) {
      return NextResponse.redirect(new URL("/", request.url))
    }

    try {
      const { payload } = await jwtVerify(staffToken, SECRET_KEY)
      const role = (payload as any).role as string | undefined

      if (role !== "partner") {
        return NextResponse.redirect(new URL("/", request.url))
      }
      return NextResponse.next()
    } catch (error) {
      return NextResponse.redirect(new URL("/", request.url))
    }
  }

  // Handle staff routes specifically
  if (pathname.startsWith("/staff")) {
    const staffToken = request.cookies.get("ims_staff_session")?.value

    if (!staffToken) {
      return NextResponse.redirect(new URL("/", request.url))
    }

    try {
      // Verify JWT for Edge runtime compatibility
      const { payload } = await jwtVerify(staffToken, SECRET_KEY)
      const role = (payload as any).role as string | undefined
      
      if (role === "partner") {
        return NextResponse.redirect(new URL("/partner/dashboard", request.url))
      }
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

        if (role === "staff") {
          return NextResponse.redirect(new URL("/staff/dashboard", request.url))
        }
        
        if (role === "partner") {
          return NextResponse.redirect(new URL("/partner/dashboard", request.url))
        }
      } catch {
        // Token invalid/expired — let client-side handle it
      }
    }
  }

  // For all other protected routes, let the client-side authentication handle it
  return NextResponse.next()
}

// Match dashboard, staff, partner routes, and well-known probes
export const config = {
  matcher: [
    "/.well-known/:path*",
    "/dashboard/:path*",
    "/staff/:path*",
    "/partner/:path*",
  ],
}
