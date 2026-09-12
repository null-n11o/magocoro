import { useLayoutEffect, useRef } from "react";
import { paintPaperSurface } from "../media/paperSurface";

export function PaperSurface() {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    const paper = canvas?.parentElement;
    if (!canvas || !paper || typeof ResizeObserver === "undefined") return;
    const paint = () => {
      const width = paper.clientWidth;
      const height = paper.clientHeight;
      if (!width || !height) return;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) paintPaperSurface(ctx, 0, 0, width, height);
    };
    const observer = new ResizeObserver(paint);
    observer.observe(paper);
    paint();
    return () => observer.disconnect();
  }, []);
  return <canvas ref={ref} className="paper-surface" data-paper-decoration="true" aria-hidden="true" />;
}
