import type { Metadata } from "next"
import Link from "next/link"
import { ContactBlock, Detail, LegalPage } from "@/components/legal/legal-page"
import { PRIVACY_POLICY_URL, TERMS_PATH } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How we collect, use and protect the information you share when you send us an enquiry, including through Facebook and Instagram lead forms.",
  alternates: { canonical: PRIVACY_POLICY_URL },
  robots: { index: true, follow: true },
  openGraph: { title: "Privacy Policy", url: PRIVACY_POLICY_URL, type: "website" },
}

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <section>
        <h2>1. Who we are</h2>
        <p>
          This policy explains how <Detail name="legalName" /> (&quot;we&quot;, &quot;us&quot;), trading as{" "}
          <Detail name="tradingName" />, handles personal information you share with us when you send an enquiry,
          including through lead forms on Facebook and Instagram (Meta Lead Ads), and how that information is managed in
          our customer relationship management (CRM) system.
        </p>
        <p>Contact details for privacy questions are in section 10.</p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <p>When you submit an enquiry or lead form, we may receive:</p>
        <ul>
          <li>your name;</li>
          <li>your phone number;</li>
          <li>your email address;</li>
          <li>the message or enquiry you wrote;</li>
          <li>the products you asked about;</li>
          <li>
            where the enquiry came from: the platform (for example Facebook or Instagram), the campaign and advertisement
            name, and the reference number the platform gave your form submission.
          </li>
        </ul>
        <p>
          While handling your enquiry, our staff also record its status, who is responsible for it, follow-up dates and
          notes about our conversations with you. If you go on to buy from us, we create a customer and sales record
          with the details needed to complete, deliver and invoice your order.
        </p>
      </section>

      <section>
        <h2>3. How we receive it</h2>
        <p>
          Lead form submissions from Facebook and Instagram are passed to our CRM by us or by a marketing partner that
          manages our advertising, through a secured connection. Meta&apos;s own handling of your information on its
          platforms is described in{" "}
          <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer">
            Meta&apos;s Privacy Policy
          </a>
          .
        </p>
      </section>

      <section>
        <h2>4. How we use it</h2>
        <ul>
          <li>to reply to your enquiry and answer your questions;</li>
          <li>to contact you about the products you asked about, including prices, availability and follow-ups;</li>
          <li>to provide customer support;</li>
          <li>to process, deliver and invoice an order if you decide to buy;</li>
          <li>to understand which campaigns and advertisements bring enquiries, so we can manage our marketing;</li>
          <li>to keep the business records we need to run our business and meet our legal obligations.</li>
        </ul>
        <p>We may contact you by phone call, WhatsApp or email using the details you gave us.</p>
      </section>

      <section>
        <h2>5. Who we share it with</h2>
        <ul>
          <li>our authorised staff who handle enquiries, sales and support;</li>
          <li>the marketing partner that manages our advertising and forwards lead form submissions to us;</li>
          <li>service providers that host and run our systems, such as cloud hosting and database providers;</li>
          <li>delivery and courier partners, if you place an order that needs to be shipped;</li>
          <li>authorities or other parties where the law requires it.</li>
        </ul>
      </section>

      <section>
        <h2>6. How long we keep it</h2>
        <p>
          We keep enquiry records for <Detail name="retentionPeriod" />. Records linked to a purchase, such as invoices,
          may need to be kept for longer to meet tax and accounting requirements.
        </p>
      </section>

      <section>
        <h2>7. How we protect it</h2>
        <p>
          Our CRM can only be accessed by staff who sign in with their own account. Systems that send leads to our CRM
          must authenticate with a secret key, and information is sent over encrypted (HTTPS) connections. No system is
          completely secure, but we limit access to the people who need it to do their work.
        </p>
      </section>

      <section>
        <h2>8. Your choices and rights</h2>
        <p>You can ask us to:</p>
        <ul>
          <li>tell you what information we hold about you;</li>
          <li>correct information that is wrong or incomplete;</li>
          <li>delete your information;</li>
          <li>stop contacting you about your enquiry or about offers.</li>
        </ul>
        <p>
          To make a request, contact us using the details in section 10. We will respond within{" "}
          <Detail name="requestResponseTime" />.
        </p>
      </section>

      <section id="data-deletion">
        <h2>9. How to request deletion of your data</h2>
        <p>
          Send an email to <Detail name="contactEmail" /> with the subject &quot;Data deletion request&quot; and include
          your name and the phone number or email address you used in the form, so we can find your records. We may ask
          you to confirm that the request comes from you.
        </p>
        <p>
          Once your request is confirmed, we will delete your enquiry records, or remove the details that identify you,
          and tell you when this is done. Records we are required to keep by law, such as invoices for a completed
          purchase, will be kept only for as long as required.
        </p>
      </section>

      <section>
        <h2>10. Contact us</h2>
        <ContactBlock />
      </section>

      <section>
        <h2>11. Changes to this policy</h2>
        <p>
          We may update this policy. The latest version will always be on this page, with the date it was last updated.
          See also our <Link href={TERMS_PATH}>Terms &amp; Conditions</Link>.
        </p>
      </section>
    </LegalPage>
  )
}
