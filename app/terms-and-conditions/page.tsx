import type { Metadata } from "next"
import Link from "next/link"
import { ContactBlock, Detail, LegalPage } from "@/components/legal/legal-page"
import { PRIVACY_POLICY_PATH, TERMS_URL } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Terms that apply when you send us an enquiry, including through Facebook and Instagram lead forms.",
  alternates: { canonical: TERMS_URL },
  robots: { index: true, follow: true },
  openGraph: { title: "Terms & Conditions", url: TERMS_URL, type: "website" },
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions">
      <section>
        <h2>1. About these terms</h2>
        <p>
          These terms apply when you send an enquiry to <Detail name="legalName" />, trading as{" "}
          <Detail name="tradingName" /> (&quot;we&quot;, &quot;us&quot;), including through lead forms on Facebook and
          Instagram, and when we follow up on that enquiry. By submitting an enquiry you agree to these terms.
        </p>
        <p>
          How we handle your personal information is explained in our{" "}
          <Link href={PRIVACY_POLICY_PATH}>Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h2>2. The enquiry service</h2>
        <p>
          Submitting an enquiry lets you ask about our products and lets our team contact you with information about
          them. An enquiry is not an order. No purchase is made, and no payment is due, until an order is separately
          agreed and confirmed with you.
        </p>
      </section>

      <section>
        <h2>3. Information you give us</h2>
        <p>
          Please make sure the information you submit is accurate and is your own. Do not submit someone else&apos;s
          details without their permission. We may not be able to respond if the details you give are incomplete or
          incorrect.
        </p>
      </section>

      <section>
        <h2>4. How we will contact you</h2>
        <p>
          By submitting an enquiry, you agree that we may contact you about it by phone call, WhatsApp or email,
          using the details you provided. You can ask us to stop at any time using the contact details below.
        </p>
      </section>

      <section>
        <h2>5. Products, prices and offers</h2>
        <ul>
          <li>Product details, prices, offers and availability shown in advertisements may change without notice.</li>
          <li>Images are for illustration and the actual product may differ.</li>
          <li>The final price, availability and any offer will be confirmed by our team before an order is placed.</li>
          <li>Offers may be time-limited and may have their own conditions, which we will tell you about.</li>
        </ul>
      </section>

      <section>
        <h2>6. Third-party platforms</h2>
        <p>
          Lead forms are provided through third-party platforms such as Facebook and Instagram, which are operated by
          Meta, and we may contact you through services such as WhatsApp. Your use of those platforms is governed by
          their own terms and privacy policies. These platforms do not sponsor or endorse us, and we are not
          responsible for how they operate.
        </p>
      </section>

      <section>
        <h2>7. Acceptable use</h2>
        <p>You must not:</p>
        <ul>
          <li>submit false, misleading or spam enquiries, or submit enquiries using automated tools;</li>
          <li>use our forms or contact channels to harass, abuse or impersonate anyone;</li>
          <li>attempt to access our CRM, systems or data without authorisation, or interfere with how they work.</li>
        </ul>
        <p>We may ignore or remove enquiries that break these rules.</p>
      </section>

      <section>
        <h2>8. Changes to the service and these terms</h2>
        <p>
          We may change, suspend or stop the enquiry service, and we may update these terms. The latest version will
          always be on this page, with the date it was last updated.
        </p>
      </section>

      <section>
        <h2>9. Governing law</h2>
        <p>
          These terms are governed by <Detail name="governingLaw" />.
        </p>
      </section>

      <section>
        <h2>10. Contact us</h2>
        <ContactBlock />
      </section>
    </LegalPage>
  )
}
