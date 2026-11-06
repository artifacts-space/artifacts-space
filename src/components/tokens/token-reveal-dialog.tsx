"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ValueField } from "@/components/value-field";
import { TOKEN_ENV_VAR } from "@/lib/setup/mcp-config";

import { TokenSetupTabs } from "./token-setup-tabs";

/**
 * A new access token, shown once: masked by default with reveal and copy,
 * then the next steps to connect an agent with it. Open while `token` is
 * set; `onClose` should clear it.
 */
export function TokenRevealDialog({
  token,
  origin,
  title = "Save your access token",
  description = "Copy and store it now. You will not see it again.",
  onClose,
}: {
  token: string;
  origin: string;
  title?: string;
  description?: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(token)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto overscroll-contain sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8 leading-6">{title}</DialogTitle>
          <DialogDescription className="leading-6">{description}</DialogDescription>
        </DialogHeader>
        <ValueField value={token} label={TOKEN_ENV_VAR} secret copyLabel="Copy token" />
        <TokenSetupTabs token={token} origin={origin} />
        <DialogFooter className="sm:flex-col">
          <Button variant="outline" size="lg" className="w-full" onClick={onClose}>I’ve saved this token</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
