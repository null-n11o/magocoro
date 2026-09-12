import { useEffect, useRef, useState, type ReactNode } from "react";
import "./opening.css";

type Stage = "sealed" | "opening" | "unfolding" | "open";
const storageKey = (id: string) => `magocoro:opened:${id}`;
function wasOpened(id: string): boolean {
  try { return localStorage.getItem(storageKey(id)) === "1"; }
  catch { return false; }
}

export function LetterOpening({ id, addressTo, signature, sender, busy = false, remember = true, children }: {
  id: string; addressTo: string; signature: string; sender: boolean; busy?: boolean; remember?: boolean; children: ReactNode;
}) {
  const [stage, setStage] = useState<Stage>(() => sender || (remember && wasOpened(id)) ? "open" : "sealed");
  const root = useRef<HTMLDivElement>(null);
  const focusPaper = useRef(false);
  const focusEnvelope = useRef(false);
  const isEnvelope = stage === "sealed" || stage === "opening";
  useEffect(() => {
    if (stage !== "opening" && stage !== "unfolding") return;
    const timer = window.setTimeout(() => setStage(stage === "opening" ? "unfolding" : "open"), stage === "opening" ? 320 : 400);
    return () => window.clearTimeout(timer);
  }, [stage]);
  useEffect(() => {
    if (stage !== "open" || !focusPaper.current) return;
    focusPaper.current = false;
    try { if (remember) localStorage.setItem(storageKey(id), "1"); } catch { /* Reading works without storage. */ }
    root.current?.querySelector<HTMLElement>("article")?.focus({ preventScroll: true });
  }, [id, stage, remember]);
  useEffect(() => {
    if (stage === "sealed" && focusEnvelope.current) {
      focusEnvelope.current = false;
      root.current?.querySelector<HTMLButtonElement>(".envelope-open")?.focus();
    }
  }, [stage]);
  function open(skip = false) {
    focusPaper.current = true;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setStage(skip || reduce ? "open" : "opening");
  }
  function replay() {
    if (busy) return;
    root.current?.querySelectorAll<HTMLMediaElement>("audio, video").forEach(media => media.pause());
    focusEnvelope.current = true;
    setStage("sealed");
  }
  return <div ref={root} className={`letter-opening stage-${stage}`}>
    {isEnvelope && <section className="arrival" aria-label="届いたお手紙">
      <p className="arrival-note">あなたへ、とどいた一通。</p>
      <button type="button" className="envelope-open" aria-label="お手紙をひらく" disabled={stage === "opening"} onClick={() => open()}>
        <span className="envelope" aria-hidden="true">
          <span className="envelope-sheet" />
          <span className="envelope-pocket" />
          <span className="envelope-address">{addressTo}</span>
          <span className="envelope-signature">{signature}</span>
          <span className="envelope-flap" />
          <span className="envelope-seal">封</span>
        </span>
        <span className="opening-label">{stage === "opening" ? "封をひらいています" : "お手紙をひらく"}<span aria-hidden="true"> →</span></span>
      </button>
      <p className="arrival-hint">写真とことばに、まごころをこめて。</p>
    </section>}
    {stage !== "open" && <button type="button" className="opening-skip" onClick={() => open(true)}>すぐ読む</button>}
    <div className="opened-letter" hidden={isEnvelope} inert={stage !== "open"} aria-hidden={stage !== "open" ? true : undefined}>
      {children}
    </div>
    {stage === "open" && !sender && <button type="button" className="opening-replay" onClick={replay} disabled={busy}>封筒からもう一度ひらく</button>}
  </div>;
}
