import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LetterOpening } from "../../src/letter/LetterOpening";

function show(id = "first", sender = false) {
  return render(<LetterOpening key={id} id={id} addressTo="じいじへ" signature="はるとより" sender={sender}>
    <article tabIndex={-1} aria-label="お手紙">本文そのまま</article>
    <button>保存する</button>
  </LetterOpening>);
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("starts sealed, lets the reader skip, focuses the paper and remembers this ID", () => {
  const view = show();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name:"すぐ読む"}));
  expect(screen.getByRole("article")).toHaveFocus();
  expect(screen.getByRole("button", {name:"保存する"})).toBeVisible();
  view.unmount();
  const revisit = show();
  expect(screen.getByRole("article")).toBeVisible();
  revisit.unmount();
  show("another");
  expect(screen.getByRole("button", {name:"お手紙をひらく"})).toBeVisible();
});

it("opens in bounded stages and prevents operations until unfolding finishes", () => {
  vi.useFakeTimers();
  show();
  fireEvent.click(screen.getByRole("button", {name:"お手紙をひらく"}));
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(320); });
  expect(screen.getByText("本文そのまま").closest("[inert]")).not.toBeNull();
  act(() => { vi.advanceTimersByTime(400); });
  expect(screen.getByRole("article")).toHaveFocus();
  expect(screen.getByRole("article").closest("[inert]")).toBeNull();
});

it("can skip during animation without a later timer closing the paper", () => {
  vi.useFakeTimers();
  show();
  fireEvent.click(screen.getByRole("button", {name:"お手紙をひらく"}));
  fireEvent.click(screen.getByRole("button", {name:"すぐ読む"}));
  act(() => { vi.runAllTimers(); });
  expect(screen.getByRole("article")).toHaveFocus();
});

it("returns focus to the envelope when replaying", () => {
  show();
  fireEvent.click(screen.getByRole("button", {name:"すぐ読む"}));
  fireEvent.click(screen.getByRole("button", {name:"封筒からもう一度ひらく"}));
  expect(screen.getByRole("button", {name:"お手紙をひらく"})).toHaveFocus();
});

it("keeps the paper open while a save is being prepared", () => {
  render(<LetterOpening id="busy" addressTo="" signature="" sender={false} busy>
    <article tabIndex={-1}>本文</article>
  </LetterOpening>);
  fireEvent.click(screen.getByRole("button", {name:"すぐ読む"}));
  expect(screen.getByRole("button", {name:"封筒からもう一度ひらく"})).toBeDisabled();
});

it("opens immediately with reduced motion and when local storage is blocked", () => {
  vi.stubGlobal("matchMedia", () => ({matches:true}));
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  show();
  fireEvent.click(screen.getByRole("button", {name:"お手紙をひらく"}));
  expect(screen.getByRole("article")).toBeVisible();
});

it("bypasses opening for senders and clears animation timers on unmount", () => {
  vi.useFakeTimers();
  const sender = show("sender", true);
  expect(screen.getByRole("article")).toBeVisible();
  sender.unmount();
  const recipient = show();
  fireEvent.click(screen.getByRole("button", {name:"お手紙をひらく"}));
  recipient.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
