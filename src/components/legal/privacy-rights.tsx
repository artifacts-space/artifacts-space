import Link from "next/link";

import { Prose } from "@/components/docs/docs-content";
import { LegalH, Mail, PostalAddress } from "@/components/legal/legal-page";
import { fileLimits } from "@/lib/files/config";
import { legalContact, legalPaths } from "@/lib/legal/contact";
import { oauthLimits } from "@/lib/oauth/config";
import { versionRetention } from "@/lib/versions/history-rules";

const doc = "privacy" as const;
const hourMs = 3_600_000;
const versionDays = Math.round(versionRetention.maxAgeMs / (24 * hourMs));
const refreshDays = Math.round(oauthLimits.refreshTokenSeconds / 86_400);

const providers = [
  { name: "Vercel", role: "hosts the website, the MCP server, and scheduled cleanup jobs, and keeps request logs.", data: "request data, logs, and everything the service handles in transit" },
  { name: "Neon", role: "runs our Postgres database.", data: "account, team, artifact, comment, and token-hash records" },
  { name: "Cloudflare R2", role: "stores uploaded files.", data: "files and their names" },
  { name: "Sendir", role: "sends our transactional email.", data: "the recipient's email address and the email itself" },
  { name: "GitHub", role: "signs you in, if you choose GitHub.", data: "the fact that you use GitHub to sign in to artifacts.space" },
] as const;

/** Privacy Policy: providers, retention, security, transfers, rights, children, changes, and contact. */
export function PrivacyRights() {
  return (
    <>
      <LegalH doc={doc} id="providers" />
      <Prose>
        <p>We use a small set of service providers to run artifacts.space. Each one processes personal data only to provide its service to us, under its own data protection terms.</p>
      </Prose>
      <dl className="card-surface mt-6 divide-y text-md leading-6">
        {providers.map((provider) => (
          <div key={provider.name} className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
            <dt className="font-medium">{provider.name}</dt>
            <dd className="text-muted-foreground">
              {provider.name} {provider.role} <span className="block text-sm">Data it handles: {provider.data}.</span>
            </dd>
          </div>
        ))}
      </dl>
      <Prose>
        <p>We will update this list before we add a provider that handles personal data.</p>
        <p>We may also disclose personal data when the law requires it, to protect the rights, safety, or property of our users, the public, or Webrenew, or as part of a merger, acquisition, or sale of assets, in which case this policy keeps applying to your data. We tell you about legal requests for your data unless the law or a court forbids it.</p>
      </Prose>

      <LegalH doc={doc} id="no-sale" />
      <Prose>
        <p>
          We do not sell your personal information, and we do not share it for cross-context behavioral advertising or targeted advertising, as those terms are defined in US state privacy laws. We have not done so in the past 12 months. We do not use or disclose sensitive personal information to infer things about you. We honor Global Privacy Control signals, although there is nothing to opt out of.
        </p>
      </Prose>

      <LegalH doc={doc} id="retention" />
      <Prose>
        <ul>
          <li><strong>Your account:</strong> while it is open. When you ask us to delete it, we delete it within 30 days, except what the law requires us to keep.</li>
          <li><strong>Artifacts:</strong> until you delete them. Deleting an artifact also deletes its versions, comments, mentions, reports, and files.</li>
          <li><strong>Version history:</strong> each artifact keeps up to {versionRetention.keep} versions, for up to {versionDays} days. The approved version and any version waiting for approval stay until they are replaced.</li>
          <li><strong>Files:</strong> deleted from storage when you delete them or their artifact. Uploads that never finish are deleted after {fileLimits.pendingTtlMs / hourMs} hour, and files never attached to an artifact after {fileLimits.unattachedTtlMs / hourMs} hours.</li>
          <li><strong>Deleted comments:</strong> the text is erased at once. A placeholder stays so replies keep their place.</li>
          <li><strong>Sessions and sign-in:</strong> a session ends when you sign out or 7 days after you last use it. Sign-in links expire after 10 minutes, and team invitations after 7 days.</li>
          <li><strong>Connected apps:</strong> app access tokens last {oauthLimits.accessTokenSeconds / 3600} hour and refresh tokens {refreshDays} days. App registrations nobody approved are deleted after {oauthLimits.unapprovedClientHours} hours.</li>
          <li><strong>Rate-limit counters:</strong> deleted as their window ends, within a day.</li>
          <li><strong>Logs and backups:</strong> our providers keep logs and database backups for a limited time, then delete them in their normal cycles.</li>
        </ul>
        <p>
          When you leave a team, artifacts you shared with that team stay with the team, under its longest-standing owner, with you still credited as the original author. Your private artifacts stay yours. Comments you wrote on other people&apos;s artifacts stay in those threads until you delete them; if your account is deleted, they show no author.
        </p>
      </Prose>

      <LegalH doc={doc} id="security" />
      <Prose>
        <ul>
          <li>All traffic uses HTTPS.</li>
          <li>There are no passwords. Sign-in links work once and expire after 10 minutes.</li>
          <li>The access tokens we issue (personal and agent tokens, app access and refresh tokens, and authorization codes) are stored only as SHA-256 hashes. A token is shown once, when you create it.</li>
          <li>Apps connect with OAuth 2.1 and PKCE. You can grant read-only access, and revoke any app or token at any time.</li>
          <li>Every read, on the website and over MCP, goes through one access check. Agents can request sharing in a shared team but never approve it.</li>
          <li>Files are private in storage and reach readers only through links that expire after {fileLimits.downloadUrlSeconds / 60} minutes.</li>
          <li>Rate limits and storage quotas stop runaway agents and scripted abuse.</li>
        </ul>
        <p>No system is perfectly secure. If a breach affects your personal data, we will tell you and the authorities as the law requires. To report a security problem, follow our security policy in the public repository.</p>
      </Prose>

      <LegalH doc={doc} id="transfers" />
      <Prose>
        <p>
          Webrenew is based in the United States, and our providers process data in the United States and possibly other countries. If you are in the EEA, the UK, or Switzerland, we transfer your data to the United States to provide the service. We rely on the safeguards our providers offer, such as the European Commission&apos;s Standard Contractual Clauses and the UK Addendum, or the EU-US Data Privacy Framework and its UK and Swiss extensions where a provider is certified.
        </p>
      </Prose>

      <LegalH doc={doc} id="your-rights" />
      <LegalH doc={doc} id="self-service" />
      <Prose>
        <p>You can do most things yourself, at any time and without asking us:</p>
        <ul>
          <li>edit or delete your artifacts, files, and comments;</li>
          <li>make any of your artifacts private, which stops link and public access at once;</li>
          <li>revoke connected apps and access tokens on the Connections page;</li>
          <li>change your username, and leave teams;</li>
          <li>copy your artifacts out through the web app or with your agent over MCP.</li>
        </ul>
        <p>To delete your whole account, email <Mail to={legalContact.privacyEmail} subject="Delete my account" /> from the address on your account.</p>
      </Prose>

      <LegalH doc={doc} id="rights-eea" />
      <Prose>
        <p>
          Under the GDPR and UK GDPR, you have the right to access your personal data, correct it, delete it, restrict or object to how we use it, receive it in a portable format, and withdraw consent. You can also complain to the data protection authority where you live or work. We would like the chance to help first, so please contact us.
        </p>
      </Prose>

      <LegalH doc={doc} id="rights-us" />
      <Prose>
        <p>
          If you live in California or another US state with a consumer privacy law (such as Colorado, Connecticut, Oregon, Texas, Utah, or Virginia), you have the right to know what personal information we collect and how we use and disclose it, to access it, to correct it, to delete it, to get a portable copy, and to opt out of sale, sharing for targeted advertising, and profiling. We do none of those three things. We will not treat you differently for using your rights.
        </p>
        <p>
          In the past 12 months we collected these categories of personal information, as California law names them: identifiers (name, email address, username, IP address, account IDs); internet or network activity (sessions, request logs, connected apps); customer records (your email address); and the content you and your agents create. They came from you, your agents and connected apps, your teammates (for example, invitations and mentions), GitHub (if you sign in with it), and your browser. We use them for the purposes in <a href="#how-we-use">How we use it</a>, and we disclosed them for business purposes only to the providers in <a href="#providers">Service providers</a>.
        </p>
      </Prose>

      <LegalH doc={doc} id="requests" />
      <Prose>
        <p>
          Email <Mail to={legalContact.privacyEmail} /> from the address on your account, and say what you want. To protect your account, we confirm requests through that address. An authorized agent may make a request for you with your signed permission, and we may still ask you to confirm. Requests are free. We answer within one month under the GDPR, and within 45 days under US state laws. If we need more time, we tell you why.
        </p>
      </Prose>

      <LegalH doc={doc} id="appeals" />
      <Prose>
        <p>
          If we decline your request, you can appeal. Reply to our answer, or email <Mail to={legalContact.privacyEmail} subject="Privacy request appeal" /> with &quot;Appeal&quot; in the subject. We answer appeals within 45 days (60 days where the law allows) and explain our decision. If you are still not satisfied, you can contact your state attorney general.
        </p>
      </Prose>

      <LegalH doc={doc} id="children" />
      <Prose>
        <p>
          artifacts.space is for people who build software. It is not for children under 13, and in the EEA and the UK it is not for anyone under 16. We do not knowingly collect personal data from them. If you believe a child has given us personal data, email <Mail to={legalContact.privacyEmail} /> and we will delete it.
        </p>
      </Prose>

      <LegalH doc={doc} id="changes" />
      <Prose>
        <p>
          We will update this policy as the service changes. We post every change here with a new &quot;Last updated&quot; date. Before a material change takes effect, we tell you by email or in the app at least 30 days ahead, unless a change is needed sooner for legal or security reasons. Earlier versions are in the public repository&apos;s history.
        </p>
      </Prose>

      <LegalH doc={doc} id="contact" />
      <Prose>
        <p>For privacy questions and requests, email <Mail to={legalContact.privacyEmail} />, or write to:</p>
        <PostalAddress />
        <p>For the Terms and copyright notices, see the <Link href={legalPaths.terms}>Terms of Service</Link>.</p>
      </Prose>
    </>
  );
}
