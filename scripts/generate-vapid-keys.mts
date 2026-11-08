/**
 * Prints a new VAPID key pair for browser notifications (Web Push), ready to
 * paste into the environment. Run with: node scripts/generate-vapid-keys.mts
 * Keep VAPID_PRIVATE_KEY secret. Replacing the pair ends every browser's
 * subscription, so people turn browser notifications on again.
 */
import { createECDH } from "node:crypto";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const privateKey = ecdh.getPrivateKey();
const padded = Buffer.concat([Buffer.alloc(32 - privateKey.length), privateKey]);

console.log(`VAPID_PUBLIC_KEY=${ecdh.getPublicKey().toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${padded.toString("base64url")}`);
console.log("VAPID_SUBJECT=mailto:you@example.com");
