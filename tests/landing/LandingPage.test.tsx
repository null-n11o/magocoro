import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LandingPage } from "../../src/landing/LandingPage";

const originalShow = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterAll(() => {
  HTMLDialogElement.prototype.showModal = originalShow;
  HTMLDialogElement.prototype.close = originalClose;
});
function renderLanding() { render(<MemoryRouter><LandingPage /></MemoryRouter>); }

describe("LandingPage", () => {
  it("links every creation CTA to compose and explains mixed media", () => {
    renderLanding();
    const links = screen.getAllByRole("link", { name: "手紙をつくる" });
    expect(links).toHaveLength(3);
    links.forEach(link => expect(link).toHaveAttribute("href", "/compose"));
    expect(screen.getByText("写真と動画をあわせて3つまで。動画は1本・30秒まで。")).toBeInTheDocument();
    screen.getAllByRole("link", { name: "使い方" }).forEach(link => expect(link).toHaveAttribute("href", "#how-it-works"));
  });
  it("offers optional LINE friend add without replacing creation links", () => {
    renderLanding();
    expect(screen.getByRole("link", { name: "LINEで友だち追加" })).toHaveAttribute(
      "href",
      "https://line.me/R/ti/p/%40039ijxbe",
    );
    expect(screen.getByText(/次からLINEですぐにお手紙をつくれます/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "手紙をつくる" })).toHaveLength(3);
  });
  it.each([0, 1])("opens sample from trigger %i and restores its focus", async index => {
    const user = userEvent.setup();
    renderLanding();
    const trigger = screen.getAllByRole("button", { name: "手紙の見本を見る" })[index];
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "お手紙の見本" });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText(/静止画像/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it.each([0, 1])("opens FAQ from trigger %i with the service limits", async index => {
    const user = userEvent.setup();
    renderLanding();
    const trigger = screen.getAllByRole("button", { name: "よくある質問" })[index];
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "よくある質問" });
    for (const text of [/会員登録は不要/, /無料で/, /写真と動画をあわせて3つ/, /声は任意で、30秒まで/, /作成から90日間/, /リンクを知っている人/, /LINEで共有/]) {
      expect(within(dialog).getByText(text)).toBeInTheDocument();
    }
    await user.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it("handles native Escape cancellation and can reopen the dialog", async () => {
    const user = userEvent.setup();
    renderLanding();
    const trigger = screen.getAllByRole("button", { name: "手紙の見本を見る" })[0];
    await user.click(trigger);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: false, cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "お手紙の見本" })).toBeVisible();
  });
});
