import type { ReactNode } from "react";

import { openAiMark } from "@/components/harness/openai-mark";
import type { McpClientId } from "@/lib/setup/client-installs";
import { cn } from "@/lib/utils";

/**
 * Small monochrome marks for the MCP clients in the docs. Every mark fills
 * with `currentColor`, so it follows the text color in light and dark, and
 * is `aria-hidden`: the visible label beside it is the accessible name.
 * The marks show compatibility only; the docs say so on the clients page.
 *
 * Sources:
 * - Claude Code, Claude, Cursor, OpenCode, Kimi, Model Context Protocol:
 *   Simple Icons v16.37.0 (https://simpleicons.org), path data under CC0 1.0.
 *   The marks stay trademarks of their owners.
 * - ChatGPT and Codex: the OpenAI mark (src/components/harness/openai-mark.ts),
 *   the same mark the landing page and the harness icons show for both.
 *   Simple Icons has no OpenAI mark. OpenAI's brand guidelines
 *   (https://openai.com/brand/) govern its use; it shows compatibility only.
 * - Grok Bot: the Grok mark from LobeHub Icons v1.102.0
 *   (https://github.com/lobehub/lobe-icons, MIT). Simple Icons has no Grok
 *   mark. The mark stays its owner's trademark; it shows compatibility only.
 * - Devin: no mark at all, by the owner's choice; an empty spacer of the
 *   same size keeps its label in line with the others.
 * - fx: its code is Apache-2.0, which grants no trademark rights, and the
 *   repository ships no logo file, so it gets a neutral "fx" monogram.
 */

/** Props every mark takes. */
interface LogoProps {
  className?: string | undefined;
}

/** A mark that fills with the current text color: 24×24 unless the source art has its own box. */
function Mark({ className, children, viewBox = "0 0 24 24" }: LogoProps & { children: ReactNode; viewBox?: string }) {
  return (
    <svg
      viewBox={viewBox}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      data-client-logo=""
      className={cn("size-4 shrink-0", className)}
    >
      {children}
    </svg>
  );
}

/** Claude Code. Simple Icons "Claude Code", CC0 1.0. */
function ClaudeCodeLogo({ className }: LogoProps) {
  return (
    <Mark className={className}>
      <path d="M21 10.5h3v3h-3v3h-1.5v3H18v-3h-1.5v3H15v-3H9v3H7.5v-3H6v3H4.5v-3H3v-3H0v-3h3v-6h18Zm-15 0h1.5v-3H6Zm10.5 0H18v-3h-1.5z" />
    </Mark>
  );
}

/** Claude (Claude Desktop and claude.ai). Simple Icons "Claude", CC0 1.0. */
function ClaudeLogo({ className }: LogoProps) {
  return (
    <Mark className={className}>
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </Mark>
  );
}

/** Cursor. Simple Icons "Cursor" (from https://cursor.com/brand), CC0 1.0. */
function CursorLogo({ className }: LogoProps) {
  return (
    <Mark className={className}>
      <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
    </Mark>
  );
}

/** OpenCode. Simple Icons "OpenCode", CC0 1.0. */
function OpenCodeLogo({ className }: LogoProps) {
  return (
    <Mark className={className}>
      <path d="M22 24H2V0h20zM17 4.8H7v14.4h10z" />
    </Mark>
  );
}

/** Kimi (Kimi Code CLI). Simple Icons "Kimi" (from Moonshot AI's branding guide), CC0 1.0. */
function KimiLogo({ className }: LogoProps) {
  return (
    <Mark className={className}>
      <path d="M21.765.351C22.998.351 24 1.353 24 2.586S22.998 4.82 21.765 4.82h-1.974c-.15 0-.26-.12-.26-.26V2.586A2.237 2.237 0 0 1 21.765.35M9.41 13.388l8.447-8.377c.16-.16.07-.471-.14-.471h-4.55s-.1.02-.14.06l-9.099 9.029c-.14.14-.35.02-.35-.21V4.81c0-.15-.1-.27-.221-.27H.22c-.12 0-.22.12-.22.27v18.57c0 .15.1.27.22.27h3.137c.12 0 .22-.12.22-.27v-3.79c0-.08.03-.16.08-.21l2.826-2.796c.07-.07.16-.08.241-.03l7.546 5.551a8.9 8.9 0 0 0 4.018 1.493c.12.01.23-.11.23-.27V19.76c0-.14-.08-.25-.19-.26a5.8 5.8 0 0 1-2.355-.942l-6.533-4.73c-.14-.09-.15-.32-.03-.441" />
    </Mark>
  );
}

/** Any other MCP client. Simple Icons "Model Context Protocol", CC0 1.0. */
function McpLogo({ className }: LogoProps) {
  return (
    <Mark className={className}>
      <path d="M13.85 0a4.16 4.16 0 0 0-2.95 1.217L1.456 10.66a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l9.442-9.442a2.49 2.49 0 0 1 3.541 0 2.49 2.49 0 0 1 0 3.541L8.59 12.97l-.1.1a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l.1-.098 7.03-7.034a2.49 2.49 0 0 1 3.542 0l.049.05a2.49 2.49 0 0 1 0 3.54l-8.54 8.54a1.96 1.96 0 0 0 0 2.755l1.753 1.753a.835.835 0 0 0 1.18 0 .835.835 0 0 0 0-1.18l-1.753-1.753a.266.266 0 0 1 0-.394l8.54-8.54a4.185 4.185 0 0 0 0-5.9l-.05-.05a4.16 4.16 0 0 0-2.95-1.218c-.2 0-.401.02-.6.048a4.17 4.17 0 0 0-1.17-3.552A4.16 4.16 0 0 0 13.85 0m0 3.333a.84.84 0 0 0-.59.245L6.275 10.56a4.186 4.186 0 0 0 0 5.902 4.186 4.186 0 0 0 5.902 0L19.16 9.48a.835.835 0 0 0 0-1.18.835.835 0 0 0-1.18 0l-6.985 6.984a2.49 2.49 0 0 1-3.54 0 2.49 2.49 0 0 1 0-3.54l6.983-6.985a.835.835 0 0 0 0-1.18.84.84 0 0 0-.59-.245" />
    </Mark>
  );
}

/** ChatGPT and Codex. The OpenAI mark, drawn in its source art's own box. */
function OpenAiLogo({ className }: LogoProps) {
  return (
    <Mark className={className} viewBox={openAiMark.viewBox}>
      <path d={openAiMark.path} />
    </Mark>
  );
}

/** Grok Bot. The Grok mark from LobeHub Icons, MIT; see the note on marks at the top of this file. */
function GrokLogo({ className }: LogoProps) {
  return (
    <Mark className={className}>
      <path fillRule="evenodd" d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815" />
    </Mark>
  );
}

/** fx. A neutral "fx" monogram, drawn as strokes: no licensed mark found. Matches public/agent-icons/fx.svg on the harness-detection branch. */
function FxLogo({ className }: LogoProps) {
  return (
    <Mark className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5.2c-2-.7-4 .2-4 2.6V19" />
        <path d="M4.5 11h5.5" />
        <path d="M13.5 11l6 8" />
        <path d="M19.5 11l-6 8" />
      </g>
    </Mark>
  );
}

/** Devin. No mark: an empty, hidden spacer the size of a mark, so headings and tab labels stay aligned. */
function DevinLogo({ className }: LogoProps) {
  return <span aria-hidden="true" data-client-logo-spacer="" className={cn("inline-block size-4 shrink-0", className)} />;
}

/** Each client's mark, by id. */
export const clientLogos: Record<McpClientId, (props: LogoProps) => ReactNode> = {
  "claude-code": ClaudeCodeLogo,
  cursor: CursorLogo,
  "claude-desktop": ClaudeLogo,
  chatgpt: OpenAiLogo,
  codex: OpenAiLogo,
  "grok-bot": GrokLogo,
  opencode: OpenCodeLogo,
  devin: DevinLogo,
  "kimi-code": KimiLogo,
  fx: FxLogo,
  "other-clients": McpLogo,
};

/** A client's mark, by id, at the size of the text beside it. */
export function ClientLogo({ id, className }: { id: McpClientId; className?: string }) {
  const Logo = clientLogos[id];
  return <Logo className={className} />;
}
