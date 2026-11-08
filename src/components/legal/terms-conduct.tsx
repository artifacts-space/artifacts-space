import Link from "next/link";

import { Prose } from "@/components/docs/docs-content";
import { LegalH, Mail, PostalAddress } from "@/components/legal/legal-page";
import { legalContact, legalPaths } from "@/lib/legal/contact";
import { REPO_URL } from "@/lib/site-copy";

const doc = "terms" as const;

/** Terms of Service: acceptable use, reports, copyright, fees, availability, and termination. */
export function TermsConduct() {
  return (
    <>
      <LegalH doc={doc} id="acceptable-use" />
      <Prose>
        <p>Use the Service to keep and share real work. Do not use it, or let your agents use it, to:</p>
        <ul>
          <li>break the law, or help anyone else break it;</li>
          <li>share child sexual abuse material. We remove it, close the account, and report it to the National Center for Missing &amp; Exploited Children;</li>
          <li>send or host spam, bulk advertising, or link farms;</li>
          <li>phish, scam, or deceive people, including pages that imitate another company, service, or person;</li>
          <li>spread malware, or host code or files meant to harm or break into devices or systems;</li>
          <li>harass, threaten, or promote violence or hatred against anyone;</li>
          <li>publish someone&apos;s private information, or other people&apos;s personal data without a lawful basis;</li>
          <li>infringe copyrights, trademarks, or other rights;</li>
          <li>get around rate limits, storage quotas, or enforcement, for example with extra accounts, tokens, or agents created for that purpose;</li>
          <li>scrape, crawl, or bulk-download the Service or other people&apos;s artifacts with automated tools, other than search engines indexing public pages their authors chose to list and your own agents working with your content and content shared with you;</li>
          <li>probe, scan, or test the security of the Service without permission. Report vulnerabilities through our <a href={`${REPO_URL}/security/policy`}>security policy</a> instead, and never test against other people&apos;s data;</li>
          <li>disrupt or overload the Service, or use it as a general file host or content delivery network for things unrelated to your work;</li>
          <li>resell access to the Service, or use it in a way that suggests Webrenew endorses you.</li>
        </ul>
      </Prose>

      <LegalH doc={doc} id="reports" />
      <Prose>
        <p>
          Every link and public artifact has a <strong>Report</strong> button. A report goes to the owners and admins of the team that approved the sharing (or to the author, for their personal team). They can make the artifact private at once. You can also write to us about any content on the Service at <Mail to={legalContact.legalEmail} subject="Content report" />.
        </p>
        <p>
          We do not monitor content, but we may review reported content or content we otherwise learn about. If content or conduct breaks these Terms or the law, or puts people or the Service at risk, we may remove or restrict content, withdraw sharing, keep pages out of search engines, limit features, or suspend or close accounts. When we act on your account or content, we tell you why, unless the law forbids it or telling you would put someone at risk. If you think we got it wrong, reply to our notice or email <Mail to={legalContact.legalEmail} subject="Enforcement appeal" />, and a person will review the decision.
        </p>
      </Prose>

      <LegalH doc={doc} id="copyright" />
      <Prose>
        <p>
          We respect copyright and respond to notices of claimed infringement under the US Digital Millennium Copyright Act (DMCA). Send notices and counter-notices to our designated agent:
        </p>
        <PostalAddress />
        <p>Attn: Copyright Agent. Email: <Mail to={legalContact.legalEmail} subject="DMCA notice" />.</p>
      </Prose>

      <LegalH doc={doc} id="dmca-notice" />
      <Prose>
        <p>A notice must include:</p>
        <ol>
          <li>your physical or electronic signature, as the copyright owner or someone authorized to act for them;</li>
          <li>the copyrighted work you say is infringed, or a list if there are several;</li>
          <li>the material you say infringes, with its artifacts.space URL, so we can find it;</li>
          <li>your name, address, phone number, and email address;</li>
          <li>a statement that you believe in good faith that the use is not authorized by the copyright owner, its agent, or the law;</li>
          <li>a statement that the information in the notice is accurate and, under penalty of perjury, that you are the owner or authorized to act for the owner.</li>
        </ol>
        <p>We remove or disable the material and tell the person who shared it. Under 17 U.S.C. § 512(f), anyone who knowingly misrepresents that material infringes, or that it was removed by mistake, may be liable for damages.</p>
      </Prose>

      <LegalH doc={doc} id="dmca-counter" />
      <Prose>
        <p>If your material was removed and you believe it was a mistake or misidentification, you can send a counter-notice that includes:</p>
        <ol>
          <li>your physical or electronic signature;</li>
          <li>the material that was removed and the URL where it appeared;</li>
          <li>a statement under penalty of perjury that you believe in good faith the material was removed by mistake or misidentification;</li>
          <li>your name, address, and phone number, and a statement that you consent to the jurisdiction of the federal district court for your address (or, if you are outside the United States, any judicial district in which Webrenew may be found), and that you will accept service of process from the person who sent the original notice or their agent.</li>
        </ol>
        <p>We send the counter-notice to the person who sent the original notice. Unless they tell us within 10 business days that they have filed a court action to stop the infringement, we restore the material within 10 to 14 business days after we received the counter-notice.</p>
      </Prose>

      <LegalH doc={doc} id="repeat-infringers" />
      <Prose>
        <p>We close the accounts of repeat infringers in appropriate circumstances.</p>
      </Prose>

      <LegalH doc={doc} id="fees" />
      <Prose>
        <p>
          The Service is free today. If we introduce paid plans, we will tell you at least 30 days before they start, and we will never charge you unless you choose a paid plan and agree to its price. Accounts created before we introduce paid plans keep the free plan at no charge for as long as the account stays open. Teams created before we introduce paid plans also keep the free plan at no charge for as long as the team exists. The Service has usage limits, such as rate limits and storage quotas, listed in the <Link href="/docs/limits">Limits</Link> docs. We may change them to keep the Service healthy, and we will try to keep them generous for real work.
        </p>
      </Prose>

      <LegalH doc={doc} id="availability" />
      <Prose>
        <p>
          We work to keep the Service available and your data safe, but we do not promise that it will always be available, free of errors, or never lose data. We may add, change, or remove features. When a change takes away something important you rely on, we will try to tell you ahead of time. Keep your own copies of content that matters to you: you can copy artifacts out of the web app or with your agent over MCP at any time.
        </p>
      </Prose>

      <LegalH doc={doc} id="termination" />
      <Prose>
        <p>
          You can stop using the Service at any time. Delete your artifacts yourself, and email <Mail to={legalContact.privacyEmail} subject="Delete my account" /> to delete your account.
        </p>
        <p>
          We may suspend or close your account, or end your access to the Service, if you break these Terms, if we must for legal reasons, if your use puts other people or the Service at risk, or if we stop offering the Service. Unless the reason is serious abuse or a legal requirement, we will give you notice and a reasonable chance to copy your content first, and at least 30 days if we shut down the Service.
        </p>
        <p>
          When your account closes, your right to use the Service ends, and we delete your data as the <Link href={`${legalPaths.privacy}#retention`}>Privacy Policy</Link> describes. The sections on your content (for content still shared), feedback, disclaimers, limitation of liability, indemnity, governing law, and general terms keep applying.
        </p>
      </Prose>
    </>
  );
}
