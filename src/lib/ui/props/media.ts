import { z } from "zod";

import type { PropCheck } from "./data";
import { label } from "./shared";

/**
 * Props for media components. They point at uploaded files by id only:
 * never a URL, so every image and file comes from our own R2 storage and
 * passes the artifact's access check. Saving checks that each id is a
 * finished upload the author may use.
 */

const fileId = z.uuid("Use a file id from files_finalize, such as 7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a. URLs are not allowed.");

export const mediaProps = {
  Image: z.object({
    file: fileId,
    alt: label(300),
    caption: label(300).optional(),
  }),
  File: z.object({
    file: fileId,
    label: label(200).optional(),
  }),
};

/** The file prop must be written out, not read from state, so saving can check it. */
const literalFile: PropCheck = (props) =>
  typeof props.file === "string" ? [] : ["`file` must be a file id written in the spec, not a $state or other expression."];

export const mediaChecks: Partial<Record<keyof typeof mediaProps, PropCheck>> = {
  Image: literalFile,
  File: literalFile,
};
