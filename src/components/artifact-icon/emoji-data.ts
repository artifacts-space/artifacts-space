/**
 * Where the emoji picker loads its data: Emojibase 17.0.0 (MIT), vendored in
 * public/emoji/17.0.0 with its license, so the picker makes no third-party
 * request. frimousse reads `${EMOJIBASE_URL}/${locale}/data.json` and
 * `messages.json`; only `en` is vendored. The privacy policy promises that no
 * outside service loads in the browser, so this must stay a same-origin path.
 */
export const EMOJIBASE_VERSION = "17.0.0";

/** Same-origin base path of the vendored Emojibase data. */
export const EMOJIBASE_URL = `/emoji/${EMOJIBASE_VERSION}`;

/** The only locale vendored. */
export const EMOJI_LOCALE = "en";
