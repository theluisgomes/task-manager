import { useEffect, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { GlobalWorkerOptions, getDocument, type PDFDocumentLoadingTask, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProposalPdf, type ProposalPdfData } from "./ProposalPdf";

GlobalWorkerOptions.workerSrc = workerUrl;

type RenderedPage = { url: string; width: number; height: number };

const A4_RATIO = 297 / 210;
const PAGE_GAP = 12;

function canvasToUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("canvas vazio"))), "image/png");
  });
}

function useContainerWidth(delay = 150) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => setWidth(Math.floor(el.clientWidth));
    measure();
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, delay);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [delay]);
  return [ref, width] as const;
}

export function ProposalPdfPreview({ data }: { data: ProposalPdfData }) {
  const [containerRef, containerWidth] = useContainerWidth();
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pagesRef = useRef<RenderedPage[]>([]);

  const pageWidth = Math.max(containerWidth - 24, 0);

  useEffect(() => {
    if (pageWidth <= 0) return;
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let renderTask: RenderTask | null = null;
    const created: string[] = [];

    (async () => {
      setBusy(true);
      try {
        const blob = await pdf(<ProposalPdf data={data} />).toBlob();
        if (cancelled) return;
        loadingTask = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        const doc = await loadingTask.promise;
        const dpr = window.devicePixelRatio || 1;
        const next: RenderedPage[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return;
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = pageWidth / base.width;
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          renderTask = page.render({ canvas, viewport });
          await renderTask.promise;
          const url = await canvasToUrl(canvas);
          created.push(url);
          next.push({ url, width: pageWidth, height: Math.round(base.height * scale) });
        }
        if (cancelled) return;
        const previous = pagesRef.current;
        pagesRef.current = next;
        setPages(next);
        setError(null);
        created.length = 0;
        previous.forEach((p) => URL.revokeObjectURL(p.url));
      } catch (e) {
        if (cancelled) return;
        console.error("[proposal-preview]", e);
        setError("Não foi possível atualizar o preview.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      void loadingTask?.destroy();
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [data, pageWidth]);

  useEffect(() => () => pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="h-full overflow-y-auto px-3 py-3 [scrollbar-gutter:stable]">
        {pages.length === 0 ? (
          pageWidth > 0 && (
            <Skeleton className="mx-auto rounded-sm" style={{ width: pageWidth, height: pageWidth * A4_RATIO }} />
          )
        ) : (
          <div className="flex flex-col items-center" style={{ gap: PAGE_GAP }}>
            {pages.map((p, i) => (
              <img
                key={i}
                src={p.url}
                alt={`Página ${i + 1} da proposta`}
                width={p.width}
                height={p.height}
                className="block rounded-sm bg-white shadow-md ring-1 ring-black/5"
                draggable={false}
              />
            ))}
          </div>
        )}
      </div>
      {(busy || error) && (
        <div className="pointer-events-none absolute right-5 top-5 flex items-center gap-1.5 rounded-full border bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
          {busy ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Atualizando…
            </>
          ) : (
            <span className="text-destructive">{error}</span>
          )}
        </div>
      )}
    </div>
  );
}
