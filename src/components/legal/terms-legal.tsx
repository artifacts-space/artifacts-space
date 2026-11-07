import Link from "next/link";

import { Prose } from "@/components/docs/docs-content";
import { LegalH, Mail, PostalAddress } from "@/components/legal/legal-page";
import { legalContact, legalPaths } from "@/lib/legal/contact";

const doc = "terms" as const;

/** Terms of Service: disclaimers, liability, indemnity, governing law, general terms, changes, and contact. */
export function TermsLegal() {
  return (
    <>
      <LegalH doc={doc} id="disclaimers" />
      <Prose>
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot;. TO THE FULLEST EXTENT THE LAW ALLOWS, WEBRENEW DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE, OR THAT CONTENT WILL NOT BE LOST.
        </p>
        <p>
          Content on the Service comes from users and their agents, not from us. We do not check it and are not responsible for it, including whether it is accurate, safe, or legal. Use code, instructions, and files from artifacts at your own risk.
        </p>
      </Prose>

      <LegalH doc={doc} id="liability" />
      <Prose>
        <p>
          TO THE FULLEST EXTENT THE LAW ALLOWS, WEBRENEW AND ITS MEMBERS, MANAGERS, EMPLOYEES, AND SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING FROM OR RELATED TO THE SERVICE OR THESE TERMS, EVEN IF WE WERE TOLD THEY WERE POSSIBLE.
        </p>
        <p>
          TO THE FULLEST EXTENT THE LAW ALLOWS, OUR TOTAL LIABILITY FOR ALL CLAIMS ARISING FROM OR RELATED TO THE SERVICE OR THESE TERMS IS LIMITED TO THE GREATER OF US $100 OR THE AMOUNT YOU PAID US FOR THE SERVICE IN THE 12 MONTHS BEFORE THE CLAIM.
        </p>
        <p>
          Some places do not allow these exclusions or limits, so they may not all apply to you. Nothing in these Terms limits liability that cannot be limited by law, such as liability for fraud, or for death or personal injury caused by negligence. If you are a consumer in the EEA or the UK, you keep all rights that the law of your country gives you and that a contract cannot take away.
        </p>
      </Prose>

      <LegalH doc={doc} id="indemnity" />
      <Prose>
        <p>
          To the extent the law allows, you will defend and indemnify Webrenew and its members, managers, and employees against third-party claims, and the losses and reasonable costs (including lawyers&apos; fees) that follow from them, arising from your content, what your agents do through your account or tokens, your breach of these Terms, or your violation of the law or someone else&apos;s rights. We will tell you about such a claim promptly and let you control its defense, but you may not settle it in a way that admits fault for us or binds us without our consent.
        </p>
      </Prose>

      <LegalH doc={doc} id="governing-law" />
      <Prose>
        <p>
          The laws of the State of South Carolina and applicable US federal law govern these Terms and any dispute about them or the Service, without regard to conflict-of-law rules. Any lawsuit must be brought only in the state or federal courts located in Charleston County, South Carolina, and you and we consent to the personal jurisdiction of those courts. If you are a consumer in the EEA or the UK, you may also bring a claim in the courts where you live, and you keep the protection of your country&apos;s mandatory consumer laws.
        </p>
        <p>Before filing a claim, please email <Mail to={legalContact.legalEmail} /> so we can try to resolve it. Most problems can be solved that way.</p>
      </Prose>

      <LegalH doc={doc} id="general" />
      <Prose>
        <ul>
          <li><strong>Whole agreement.</strong> These Terms and the <Link href={legalPaths.privacy}>Privacy Policy</Link> are the whole agreement between you and us about the Service.</li>
          <li><strong>Severability.</strong> If a court finds part of these Terms unenforceable, that part is enforced as far as possible, and the rest stays in effect.</li>
          <li><strong>No waiver.</strong> If we do not enforce a term right away, we can still enforce it later.</li>
          <li><strong>Assignment.</strong> You may not transfer these Terms without our written consent. We may transfer them as part of a merger, acquisition, or sale of assets, and they keep protecting you.</li>
          <li><strong>Events beyond control.</strong> Neither of us is liable for delays or failures caused by events outside reasonable control, such as outages at providers, natural disasters, or war.</li>
          <li><strong>Relationship.</strong> These Terms create no partnership, employment, or agency between you and us. There are no third-party beneficiaries.</li>
          <li><strong>Notices.</strong> We send notices to the email address on your account or show them in the app. You send notices to us as described under <a href="#contact">Contact and notices</a>.</li>
          <li><strong>Headings.</strong> Headings and the plain-terms summary help you read; they do not change the meaning of these Terms.</li>
        </ul>
      </Prose>

      <LegalH doc={doc} id="changes" />
      <Prose>
        <p>
          We may update these Terms. We post every change here with a new &quot;Last updated&quot; date. Before a material change takes effect, we tell you by email or in the app at least 30 days ahead, unless a change is needed sooner for legal or security reasons, or only affects new features. If you keep using the Service after a change takes effect, the new Terms apply. If you do not agree, stop using the Service and you can close your account.
        </p>
      </Prose>

      <LegalH doc={doc} id="contact" />
      <Prose>
        <p>Questions about these Terms, legal notices, and copyright notices go to <Mail to={legalContact.legalEmail} />. Formal legal notices must also be sent by mail to:</p>
        <PostalAddress />
        <p>Privacy questions go to <Mail to={legalContact.privacyEmail} />.</p>
      </Prose>
    </>
  );
}
