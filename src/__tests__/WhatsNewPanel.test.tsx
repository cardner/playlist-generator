import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { WhatsNewPanel } from "@/components/WhatsNewPanel";

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));
jest.mock("remark-gfm", () => ({ __esModule: true, default: () => () => {} }));

const SAMPLE_CHANGELOG = `
## [1.2.0] - 2026-02-10

### Added
- feature two

## [1.1.0] - 2026-02-09

### Added
- feature one

## [1.0.0] - 2026-02-08

### Added
- initial release

## [0.9.0] - 2026-02-07

### Fixed
- old bug fix
`;

describe("WhatsNewPanel", () => {
  beforeEach(() => {
    localStorage.removeItem("whats-new-panel-open");
  });

  it("renders the What's New button", () => {
    render(<WhatsNewPanel markdown={SAMPLE_CHANGELOG} />);
    expect(
      screen.getByRole("button", { name: /open what's new panel/i })
    ).toBeInTheDocument();
  });

  it("opens the panel when the button is clicked", () => {
    render(<WhatsNewPanel markdown={SAMPLE_CHANGELOG} />);
    fireEvent.click(
      screen.getByRole("button", { name: /open what's new panel/i })
    );
    const dialog = screen.getByRole("dialog", { name: /what's new/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-labelledby", "whats-new-panel-title");
  });

  it("shows parsed release versions and dates in summaries", () => {
    render(<WhatsNewPanel markdown={SAMPLE_CHANGELOG} />);
    fireEvent.click(
      screen.getByRole("button", { name: /open what's new panel/i })
    );
    const dialog = screen.getByRole("dialog", { name: /what's new/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/v1\.2\.0/)).toBeInTheDocument();
    expect(screen.getByText(/v1\.1\.0/)).toBeInTheDocument();
    expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText(/v0\.9\.0/)).toBeInTheDocument();
    expect(screen.getByText(/2026-02-10/)).toBeInTheDocument();
    expect(screen.getByText(/2026-02-09/)).toBeInTheDocument();
  });

  it("expands the first three releases by default", () => {
    render(<WhatsNewPanel markdown={SAMPLE_CHANGELOG} />);
    fireEvent.click(
      screen.getByRole("button", { name: /open what's new panel/i })
    );
    expect(screen.getByText(/feature two/)).toBeVisible();
    expect(screen.getByText(/feature one/)).toBeVisible();
    expect(screen.getByText(/initial release/)).toBeVisible();
    const fourthBody = screen.getByText(/old bug fix/);
    expect(fourthBody).toBeInTheDocument();
    expect(fourthBody).not.toBeVisible();
  });

  it("allows expanding a collapsed release to see its content", () => {
    render(<WhatsNewPanel markdown={SAMPLE_CHANGELOG} />);
    fireEvent.click(
      screen.getByRole("button", { name: /open what's new panel/i })
    );
    const fourthBody = screen.getByText(/old bug fix/);
    expect(fourthBody).not.toBeVisible();
    const fourthSummary = screen.getByText(/v0\.9\.0/);
    fireEvent.click(fourthSummary);
    expect(fourthBody).toBeVisible();
  });

  it("closes the panel when the close button is clicked", () => {
    render(<WhatsNewPanel markdown={SAMPLE_CHANGELOG} />);
    fireEvent.click(
      screen.getByRole("button", { name: /open what's new panel/i })
    );
    const dialog = screen.getByRole("dialog", { name: /what's new/i });
    expect(dialog).toBeInTheDocument();
    const closeButton = within(dialog).getByRole("button", {
      name: /close what's new panel/i,
    });
    fireEvent.click(closeButton);
    expect(screen.queryByRole("dialog", { name: /what's new/i })).not.toBeInTheDocument();
  });

  it("closes the panel when Escape is pressed", () => {
    render(<WhatsNewPanel markdown={SAMPLE_CHANGELOG} />);
    fireEvent.click(
      screen.getByRole("button", { name: /open what's new panel/i })
    );
    expect(screen.getByRole("dialog", { name: /what's new/i })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /what's new/i })).not.toBeInTheDocument();
  });

  it("renders empty state when markdown has no releases", () => {
    render(<WhatsNewPanel markdown="# Changelog\nNo releases." />);
    fireEvent.click(
      screen.getByRole("button", { name: /open what's new panel/i })
    );
    const dialog = screen.getByRole("dialog", { name: /what's new/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /what's new/i, level: 2 })).toBeInTheDocument();
  });
});
