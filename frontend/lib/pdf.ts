let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null
let pdfWorker: Worker | null = null

async function ensureWorker(pdfjs: typeof import("pdfjs-dist")) {
  if (typeof window === "undefined") {
    return
  }
  if (pdfWorker) {
    return
  }

  pdfWorker = new Worker(new URL("../workers/pdf.worker.ts", import.meta.url), {
    type: "module",
    name: "pdfjs-worker",
  })
  pdfjs.GlobalWorkerOptions.workerPort = pdfWorker
}

export async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist")
  }
  const pdfjs = await pdfjsPromise
  await ensureWorker(pdfjs)
  return pdfjs
}
