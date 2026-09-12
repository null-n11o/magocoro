import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "../src/routes";

describe("scaffold", () => {
  it("starts on the landing page and opens compose from its CTA", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /なんでもない今日を/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("写真")).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("link", { name: "手紙をつくる" })[0]);
    expect(screen.getByLabelText("写真")).toBeInTheDocument();
  });
});
