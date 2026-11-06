/**
 * PUTs a file straight to a presigned R2 URL and reports progress. Uses
 * XMLHttpRequest because fetch cannot report upload progress. The browser
 * sets Content-Length itself, so that header is skipped here.
 */
export function putFile(url: string, headers: Record<string, string>, file: Blob, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      if (name.toLowerCase() !== "content-length") request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`Storage refused the upload (status ${String(request.status)}).`));
    };
    request.onerror = () => { reject(new Error("The upload stopped. Check your connection and try again.")); };
    request.send(file);
  });
}
