import type { Metadata } from "next"
import { fetchSharedProductByToken } from "@/lib/product-share-data"
import { ProductPublicView } from "@/components/products/product-public-view"

type ShareProductPageProps = {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: ShareProductPageProps): Promise<Metadata> {
  const { token } = await params
  const result = await fetchSharedProductByToken(token, { recordView: false })

  if (!result.success || !result.data) {
    return {
      title: "Product unavailable",
      robots: { index: false, follow: false },
    }
  }

  return {
    title: result.data.name,
    description: result.data.description || `${result.data.name} product details`,
    robots: { index: false, follow: false },
  }
}

export default async function ShareProductPage({ params }: ShareProductPageProps) {
  const { token } = await params
  const result = await fetchSharedProductByToken(token, { recordView: true })

  if (!result.success || !result.data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Link unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">
            {result.message || "This product link is invalid, expired, or has been revoked."}
          </p>
        </div>
      </div>
    )
  }

  return <ProductPublicView product={result.data} />
}
