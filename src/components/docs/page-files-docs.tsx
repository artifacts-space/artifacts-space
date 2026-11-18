import Link from "next/link";

import { CodeSnippet } from "@/components/code/code-snippet";
import { DocsH, FactTable, Note, Prose } from "@/components/docs/docs-content";
import { manyFilesFlow, pageAddressLife, pageFileLimitRows, pageFilesExample, pageFileTypeRows, refusedSetExample } from "@/lib/docs/page-file-docs";
import { docsHref } from "@/lib/docs/pages";
import { fileLimits } from "@/lib/files/config";
import { pageBatchLimits } from "@/lib/page-files/publish-rules";

/*
 * The page files docs: what the files of an HTML artifact are, on the
 * Formats page, and how an agent uploads one file or many, on the MCP
 * reference. Every number comes from src/lib/docs/page-file-docs.ts, which
 * reads the constants the server enforces.
 */

/** Formats, under HTML: page files, their paths, types, and limits, with an example site. */
export function HtmlPageFilesDocs() {
  return (
    <>
      <DocsH page="formats" id="page-files" />
      <Prose>
        <p>An HTML artifact can be a whole small site, not one long document. Its page loads its own stylesheets, scripts, images, fonts, and data by relative path, as on any web host, so the document stays short and each file changes by itself. Agents put the files in with two calls, however many there are. People drop them on the page, or a whole folder, in the web app.</p>
        <ul>
          <li><strong>Paths</strong> are relative to the page, which is <code>index.html</code>: <code>css/site.css</code>, <code>js/app.js</code>, <code>img/logo.png</code>. Folders and a file name of letters, digits, dots, dashes, and underscores, joined by <code>/</code>. No leading slash and no <code>..</code>.</li>
          <li><strong>A path is matched exactly</strong>, letter case included, so use lowercase. Two files whose paths differ only by case are refused.</li>
          <li><strong>The type comes from the extension.</strong> A second HTML document is refused: one artifact is one page.</li>
          <li><strong>Readers get the files of the version they are shown.</strong> On a link or public artifact, added and replaced files reach readers outside the team when the change is approved. Removed files stop loading for everyone at once.</li>
          <li><strong>A page left open keeps working.</strong> Its files load under an address that works for {pageAddressLife}; while its tab is visible the page gets the next address before that, without loading again. One limit remains: a module that already loaded keeps its first address for its own later <code>import()</code>, and a stylesheet file for its own <code>url()</code>. Import what a module needs when it starts, or resolve a later import from the document: <code>import(new URL(&quot;js/chart.js&quot;, document.baseURI))</code>.</li>
        </ul>
      </Prose>
      <FactTable head={["Extensions", "Served as", "Name"]} rows={pageFileTypeRows()} mono={[0, 1]} />
      <FactTable head={["Limit", "Value"]} rows={pageFileLimitRows()} mono={[]} />
      <CodeSnippet title="Example: the document" language="html" code={pageFilesExample.document} className="mt-4" />
      <CodeSnippet title="Example: its page files" language="text" code={pageFilesExample.files.map((file) => `${file.path}\n  ${file.content}`).join("\n")} className="mt-4" />
      <DocsH page="formats" id="page-files-web" />
      <Prose>
        <p>Anyone who may edit an HTML artifact adds files from its page, in the workspace or on the artifact&apos;s own page: drop files or a folder anywhere on the page, or use <strong>Add files</strong> in the More menu or <strong>Add folder</strong> beside the list.</p>
        <ul>
          <li><strong>Each file goes where its type belongs.</strong> A type in the table above becomes a page file. Any other file the site takes, such as a PDF, is attached beside the page as before.</li>
          <li><strong>A folder keeps its shape.</strong> Dropping <code>site/</code> that holds <code>css/site.css</code> and <code>img/logo.png</code> adds those two paths. Hidden and system files, such as <code>.DS_Store</code>, are left out.</li>
          <li><strong>A path that cannot be used says why.</strong> A name with a space or capital letters gets a cleaned path to take or change, and nothing is added under a name you did not see.</li>
          <li><strong>One drop is one change.</strong> Up to {pageBatchLimits.maxFilesPerPublish} files land together as one version in History, or not at all. A file at a path the page has replaces it, and the row says so before it happens.</li>
          <li><strong>The page itself.</strong> An <code>index.html</code> at the top of a dropped folder can become the page&apos;s HTML, after you confirm. The HTML it had stays in History.</li>
        </ul>
      </Prose>
      <Note>
        How an agent uploads them is on the <Link href={docsHref("mcp", "uploads")} className="underline underline-offset-2">MCP reference</Link>.
      </Note>
    </>
  );
}

/** MCP reference, under Tools: the upload flow for one file, and for many page files. */
export function UploadFlowsDocs() {
  return (
    <>
      <DocsH page="mcp" id="uploads" />
      <Prose>
        <p>File bytes never pass through a tool call. A tool hands out a presigned URL, the agent sends the bytes there with one HTTP PUT, and a second tool checks what arrived. URLs work for {fileLimits.uploadUrlSeconds / 60} minutes.</p>
        <p><strong>One file</strong> takes three calls and a PUT:</p>
        <ol>
          <li><code>files_request_upload</code> with the filename and exact size. For a page file of an HTML artifact, pass <code>pagePath</code> instead of a filename.</li>
          <li>PUT the bytes to <code>upload.url</code> with exactly <code>upload.headers</code>. The result holds a ready <code>curl</code> command.</li>
          <li><code>files_finalize</code> with the file id, which checks the size, type, and content.</li>
          <li><code>files_create_artifact</code>, <code>files_attach</code>, or <code>files_replace</code> to put it in an artifact.</li>
        </ol>
        <p><strong>Many page files</strong>, such as a whole site, take two calls and the PUTs:</p>
        <ol>
          <li><code>page_files_request_uploads</code> with the artifact and every file&apos;s path and exact size, up to {pageBatchLimits.maxUploadsPerRequest} files in a call. The whole set is checked first: each path and type, and the page&apos;s limits as the set would leave it. A larger site asks again for the rest.</li>
          <li>PUT each file to its <code>url</code> with its <code>headers</code>.</li>
          <li><code>page_files_publish</code> once with the file ids, up to {pageBatchLimits.maxFilesPerPublish}. It checks every upload, then adds the files together and files one version.</li>
        </ol>
        <p>Both calls are all or nothing. If any file is at fault, nothing starts or changes, and one error names every file to fix. The same publish can bring a page&apos;s files to a new state in one step: an upload at a path the page already has replaces that file, and each path in <code>remove</code> is deleted.</p>
      </Prose>
      <CodeSnippet title="1 · start three uploads" language="json" code={manyFilesFlow.request} className="mt-4" />
      <CodeSnippet title="The result: a path, a file id, a URL, and headers for each file" language="json" code={manyFilesFlow.result} className="mt-4" />
      <CodeSnippet title="2 · send the bytes" language="bash" code={manyFilesFlow.put} className="mt-4" />
      <CodeSnippet title="3 · publish them together" language="json" code={manyFilesFlow.publish} className="mt-4" />
      <CodeSnippet title="Later: replace one file, add one, and remove one, in one call" language="json" code={manyFilesFlow.change} className="mt-4" />
      <CodeSnippet title="A refused set names every file at fault" code={refusedSetExample} wrap className="mt-4" />
    </>
  );
}
