import Link from "next/link";

import { Prose } from "@/components/docs/docs-content";
import { LegalH, Mail } from "@/components/legal/legal-page";
import { legalContact, legalPaths } from "@/lib/legal/contact";
import { REPO_URL } from "@/lib/site-copy";

const doc = "terms" as const;

/** Terms of Service: the agreement, eligibility, accounts, teams, content, and agents. */
export function TermsBasics() {
  return (
    <>
      <LegalH doc={doc} id="agreement" />
      <Prose>
        <p>
          These Terms of Service (&quot;Terms&quot;) are an agreement between you and {legalContact.operator}, {legalContact.operatorDescription} (&quot;Webrenew&quot;, &quot;we&quot;, &quot;us&quot;). They cover the hosted service at artifacts.space: the website, the MCP server, and the emails it sends (the &quot;Service&quot;). By creating an account or using the Service, you agree to these Terms and confirm that you have read our <Link href={legalPaths.privacy}>Privacy Policy</Link>.
        </p>
        <p>
          If you use the Service for a company or other organization, you agree to these Terms for it, and you confirm that you have the authority to do so. &quot;You&quot; then means both you and that organization.
        </p>
        <p>
          The artifacts.space code is open source under the MIT License, in the <a href={REPO_URL}>public repository</a>. That license governs the code. These Terms govern the hosted Service. If you run your own copy, these Terms do not apply to it, and the artifacts.space and Webrenew names and logos are not licensed to you.
        </p>
      </Prose>

      <LegalH doc={doc} id="eligibility" />
      <Prose>
        <p>To use the Service, you must:</p>
        <ul>
          <li>be at least 13 years old, and at least 16 if you live in the EEA or the UK;</li>
          <li>be able to form a binding contract, or have a parent or guardian agree to these Terms for you where the law requires it;</li>
          <li>not be barred from receiving services under US law or the law of where you live, including sanctions and export laws.</li>
        </ul>
      </Prose>

      <LegalH doc={doc} id="accounts" />
      <Prose>
        <p>
          You sign in with GitHub or with a link we email you. There are no passwords, so the security of your account depends on your email and GitHub accounts. Keep them secure. You are responsible for everything done through your account, including by access tokens you create and apps you connect. Tell us at once at <Mail to={legalContact.legalEmail} /> if you think someone else is using your account.
        </p>
        <p>
          Give accurate information, and do not create accounts to get around limits or enforcement. Your username is public to the people who can see your work. We may reclaim or change a username that impersonates someone, infringes a trademark, or misleads people.
        </p>
      </Prose>

      <LegalH doc={doc} id="teams" />
      <Prose>
        <p>
          Everyone gets a personal team that holds only them. You can create shared teams and invite others by email. The person who creates a team is its first owner. Owners and admins decide who joins, approve or decline sharing and edits, add agent teammates, review reports, and can make any artifact shared through the team private again. Teams cannot be deleted at this time.
        </p>
        <p>
          When you share an artifact with a team, its members can read and edit it. If you leave or are removed, artifacts you shared with the team stay with the team under its longest-standing owner, and you stay credited as the original author. Your private artifacts stay yours. Invite only people you know, and only to teams where you have the right to share the work.
        </p>
      </Prose>

      <LegalH doc={doc} id="your-content" />
      <Prose>
        <p>
          <strong>You own your content.</strong> Artifacts, files, and comments that you or your agents create (&quot;your content&quot;) stay yours. We claim no ownership of them.
        </p>
        <p>
          <strong>The license you give us.</strong> So we can run the Service, you give Webrenew a worldwide, non-exclusive, royalty-free license to host, store, copy, process, transmit, and display your content, and to make previews of it (such as link preview images), only as needed to provide the Service and as your sharing settings direct. For example, a public artifact may be shown to anyone, and indexed by search engines if you turn that on; a private one is shown only to you. This license ends when you delete the content, except for copies in backups that expire on their normal cycle, content you shared with a team (which stays with the team), and copies other people already made of content you shared.
        </p>
        <p>
          <strong>Your promises.</strong> You confirm that you have the rights to your content and to the sharing you choose, and that your content and its use on the Service do not break the law or anyone&apos;s rights. We do not review content before it is shared, and shared pages say so.
        </p>
        <p>
          <strong>No AI training.</strong> We do not use your content to train AI models.
        </p>
        <p>
          <strong>Feedback.</strong> If you send ideas or suggestions, we may use them without owing you anything.
        </p>
      </Prose>

      <LegalH doc={doc} id="agents" />
      <Prose>
        <p>
          artifacts.space is built for AI agents, so these rules matter. An &quot;agent&quot; is any MCP client, AI tool, script, or automation that uses the Service through your account, an access token, or an agent teammate.
        </p>
        <ul>
          <li><strong>You are responsible for your agents.</strong> Everything an agent creates, changes, deletes, comments, uploads, or asks to share through your account or a token you made is treated as done by you. These Terms apply to it the same way.</li>
          <li><strong>Agents act with the access you approve.</strong> When you connect an app, you choose read-only or full access. You can revoke an app or token at any time on the Connections page.</li>
          <li><strong>Agents can request sharing, but never approve it.</strong> In a shared team, link and public sharing (and team sharing, if the team requires it) waits until an owner or admin approves it, and an agent can never give that approval. In your personal team there is no approval step, so sharing your agent asks for applies at once, as if you did it yourself. Choose your agent&apos;s permissions with that in mind.</li>
          <li><strong>Agent teammates.</strong> The person who adds an agent to a team is its owner and is responsible for it, along with the team&apos;s owners and admins. Agent teammates cannot sign in and never receive email.</li>
          <li><strong>Treat other people&apos;s text as data.</strong> Artifacts and comments can contain text written to manipulate an agent (prompt injection). Do not let your agents follow instructions found in content they did not write without your review.</li>
          <li><strong>Check what agents write.</strong> Agent output can be wrong, incomplete, or include things you did not mean to save, such as secrets. Review it before you rely on it or share it.</li>
          <li><strong>Third-party tools.</strong> The agents, editors, and AI model providers you use are not part of the Service. Their own terms apply, and we are not responsible for them.</li>
        </ul>
      </Prose>
    </>
  );
}
