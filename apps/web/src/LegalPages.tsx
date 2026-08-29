import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const updated = 'August 29, 2026';
const contact = 'hello@delia.ai';

function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  useEffect(() => {
    const oldTitle = document.title;
    document.title = `${title} — Delia`;
    const target = window.location.hash.slice(1);
    if (target) window.requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView());
    else window.scrollTo(0, 0);
    return () => { document.title = oldTitle; };
  }, [title]);

  return (
    <main className="legal-page">
      <article className="legal-document">
        <header className="legal-heading">
          <p className="eyebrow">Delia legal</p>
          <h1>{title}</h1>
          <p>{intro}</p>
          <span>Last updated: {updated}</span>
        </header>
        <aside className="legal-notice"><strong>Our commitment</strong><p>Delia uses personal information to provide, secure, and improve the service. We do not sell personal information or use Google account data for advertising.</p></aside>
        <div className="legal-content">{children}</div>
        <section className="legal-contact">
          <h2>Questions or requests</h2>
          <p>Email <a href={`mailto:${contact}`}>{contact}</a>. Do not include passwords, API keys, health information, or other sensitive information.</p>
        </section>
        <Link className="legal-home-link" to="/">← Back to Delia</Link>
      </article>
    </main>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" intro="This policy explains what Delia collects, why it is used, where it may be processed, and your choices.">
      <section><h2>1. Scope and roles</h2><p>Delia is an AI receptionist and booking platform at <a href="https://delia.mehrabdev.com">delia.mehrabdev.com</a>. This policy covers visitors, account holders, workspace users, and people who interact with a Delia receptionist or widget.</p><p>A business using Delia controls the customer information collected through its receptionist, widget, CRM, and booking workflows. That business is responsible for its lawful basis, notices, and instructions; Delia processes the information to provide the service.</p></section>

      <section><h2>2. Information we process</h2><ul>
        <li><strong>Account data:</strong> name, email, authentication records, workspace membership, and Google account identifier and basic profile data when Google Sign-In is used.</li>
        <li><strong>Workspace data:</strong> business details, services, availability, policies, receptionist settings, knowledge articles, and uploaded documents.</li>
        <li><strong>Customer data:</strong> names, contact details, appointment requests, bookings, callbacks, and related CRM records.</li>
        <li><strong>Conversation data:</strong> messages, transcripts, AI responses, confirmations, and operational metadata.</li>
        <li><strong>Voice data:</strong> microphone audio may be sent for transcription when you choose a voice feature. Delia does not intentionally retain the raw browser-demo recording after transcription, but the transcript and conversation may be stored.</li>
        <li><strong>Technical data:</strong> necessary session and security information, request identifiers, timestamps, error and audit logs, network information, and ordinary browser information.</li>
        <li><strong>Local data:</strong> limited interface events may remain in browser session storage for the current session.</li>
      </ul><p>Do not submit medical records, government identifiers, card details, passwords, credentials, or other highly sensitive information unless Delia expressly supports that use and appropriate safeguards are agreed.</p></section>

      <section><h2>3. Purposes and legal bases</h2><p>We use information to authenticate users; operate workspaces; answer questions; transcribe and synthesize speech; manage customers and bookings; prevent unauthorized or duplicate actions; provide support; monitor security and reliability; enforce limits; comply with law; and improve Delia.</p><p>Where European law applies, the legal basis is, as appropriate, performance of a contract or requested pre-contract steps, legitimate interests in operating and securing Delia, compliance with law, or consent where required. Consent can be withdrawn for future processing.</p></section>

      <section><h2>4. Google account data</h2><p>Google Sign-In requests only <code>openid</code>, email, and basic profile information to create or access an account and secure sign-in. Delia does not request Gmail, Drive, Calendar, contacts, or advertising data.</p><p>Use and transfer of Google data follows the <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noreferrer" target="_blank">Google API Services User Data Policy</a>, including its Limited Use requirements.</p></section>

      <section><h2>5. Providers and disclosures</h2><p>Information may be processed by providers that operate Delia, including Amazon Web Services for hosting and storage, Google for authentication and optional speech processing, and Google's Gemini service for AI responses. A business receives data submitted to its workspace. We may disclose information to comply with law, protect people or Delia, investigate abuse, or complete a business restructuring. We do not sell personal information.</p></section>

      <section><h2>6. International processing</h2><p>Delia's primary infrastructure is hosted in AWS's Stockholm region. Providers may process authentication, speech, AI, or support data in other countries. Where required, transfers must use an approved legal mechanism and appropriate safeguards.</p></section>

      <section><h2>7. Retention and deletion</h2><p>Account and workspace information is retained while an account is active and afterward only as reasonably needed to provide Delia, resolve disputes, secure the platform, maintain rotating backups, and meet legal duties. Customer, booking, conversation, audit, and usage records are retained according to operational needs, applicable law, and the controlling business's instructions.</p><p>Request access, correction, or deletion at <a href={`mailto:${contact}?subject=Delia data request`}>{contact}</a>. We may verify identity. Some records may remain temporarily in backups or where retention is legally required. If a business submitted your information, contact that business too.</p></section>

      <section><h2>8. Security</h2><p>Delia uses safeguards designed to protect data, including HTTPS, server-side secrets, access controls, workspace isolation, secure session cookies, validation, encrypted cloud storage, audit logs, and rate limits. No internet service can guarantee absolute security.</p></section>

      <section><h2>9. Your rights</h2><p>Depending on location, you may have rights to access, correct, delete, restrict, object to, or receive a portable copy of personal data, and to complain to a data-protection authority. You may disconnect Delia in your Google Account permissions. Other lawful retention may still apply.</p></section>

      <section id="cookies"><h2>10. Cookies and browser storage</h2><p>Delia uses essential cookies or similar storage for authentication, security, onboarding, and session continuity. Limited interface events may be held in session storage until the browser session ends. Delia does not currently use third-party advertising cookies. Required notice and consent controls will be added before optional advertising or non-essential tracking is introduced.</p></section>

      <section><h2>11. Children</h2><p>Delia is a business service and is not directed to children. Do not submit a child's information unless legally authorized and an appropriate process is in place.</p></section>

      <section><h2>12. Changes</h2><p>We may update this policy as Delia changes. Material changes will be communicated through the service or another appropriate channel, and the date above will change. Continued use does not replace consent where law requires it.</p></section>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage title="Terms of Service" intro="These terms govern Delia's website, accounts, AI receptionist, booking tools, and related services.">
      <section><h2>1. Agreement</h2><p>By creating an account or using Delia, you agree to these Terms and the <Link to="/privacy">Privacy Policy</Link>. If acting for an organization, you confirm authority to bind it. If you disagree, do not use Delia.</p></section>
      <section><h2>2. Eligibility and accounts</h2><p>You must be legally able to enter a binding agreement and at least 18 to operate a workspace. Provide accurate information, protect credentials and API keys, and promptly report unauthorized access. You are responsible for activity through your account unless applicable law says otherwise.</p></section>
      <section><h2>3. Service and AI disclosure</h2><p>Delia provides AI-assisted reception, voice and chat, knowledge retrieval, customer management, and booking workflows. Users and callers must be clearly told when they interact with AI. AI output may be incomplete, inaccurate, or unavailable and must be reviewed before important reliance.</p><p>Delia is not an emergency service and must not provide medical, legal, financial, safety-critical, or other professional advice. Provide access to a qualified person where mistakes could cause harm.</p></section>
      <section><h2>4. Your responsibilities</h2><p>You are responsible for business information, knowledge sources, availability, customer promises, and generated responses. You must provide required privacy, AI, microphone, call-recording, marketing, and communications notices and obtain consent wherever required.</p><p>You need authority to upload documents and process customer data. Do not upload secrets or sensitive data without an appropriate agreement and lawful process. You remain responsible for fulfilling and resolving appointments and customer disputes.</p></section>
      <section><h2>5. Acceptable use</h2><p>Do not use Delia to violate law; deceive or impersonate; send unlawful spam or automated calls; harass or discriminate; collect data without authority; commit fraud; violate intellectual-property or privacy rights; distribute malware; bypass limits or security; access other workspaces; or reverse engineer protected service components except where law permits.</p></section>
      <section><h2>6. Third-party services</h2><p>Delia relies on providers such as AWS and Google. Their availability and terms may affect hosting, authentication, speech, and AI. You must follow applicable third-party terms. Delia is not responsible for third-party services outside its reasonable control.</p></section>
      <section><h2>7. Ownership</h2><p>Delia's software, branding, and service design remain with their rights holders. You retain rights in content you lawfully submit and grant Delia limited permission to host, process, reproduce, and transmit it as needed to operate, secure, and improve the service. You confirm you can grant that permission.</p></section>
      <section><h2>8. Changes and suspension</h2><p>Delia may change or be interrupted, and features may be limited for cost, provider quotas, security, or abuse prevention. Access may be suspended to protect users or Delia, investigate violations, comply with law, or address nonpayment if paid services are introduced. Where practical, notice and an opportunity to resolve the issue will be provided.</p></section>
      <section><h2>9. Disclaimers</h2><p>To the maximum extent allowed by law, Delia is provided “as is” and “as available.” We do not promise uninterrupted operation or perfectly accurate AI responses, transcripts, availability, or bookings. Mandatory warranties and consumer rights are not excluded.</p></section>
      <section><h2>10. Liability</h2><p>To the maximum extent allowed by law, Delia and its operator are not liable for indirect, incidental, special, consequential, or punitive damages, or lost profit, revenue, data, goodwill, or opportunity. Aggregate liability will not exceed fees paid for Delia in the preceding 12 months, or €100 if you paid nothing.</p><p>This does not limit liability that law does not permit us to limit, including where applicable fraud, intentional misconduct, gross negligence, or death or injury caused by negligence.</p></section>
      <section><h2>11. Ending use</h2><p>You may stop using Delia and request account deletion at any time. Provisions that should naturally survive—such as ownership, disclaimers, liability, and disputes—continue after termination.</p></section>
      <section><h2>12. Disputes and law</h2><p>Contact us before filing a claim and allow a reasonable chance to resolve it. These Terms are governed by laws applicable to Delia's operator without overriding mandatory consumer protections or jurisdiction rights where you live. Either party may seek urgent protection for security, confidentiality, or intellectual property.</p></section>
      <section><h2>13. Changes to terms</h2><p>We may update these Terms for service, legal, or security changes. Material changes will be communicated appropriately. If you reject revised Terms, stop using Delia. Changes do not apply retroactively where prohibited.</p></section>
    </LegalPage>
  );
}
