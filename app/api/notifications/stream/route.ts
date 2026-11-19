export const dynamic = "force-dynamic"

export async function GET() {
  return new Response("Notifications stream disabled in favor of lightweight polling", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  })
}
