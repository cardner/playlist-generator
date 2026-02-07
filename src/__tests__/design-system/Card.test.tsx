import React from "react";
import { render, screen } from "@testing-library/react";
import { Card } from "@/design-system/components/Card";

describe("Card", () => {
  it("renders with default padding", () => {
    render(<Card data-testid="card">Card content</Card>);
    const card = screen.getByTestId("card");
    expect(card).toBeInTheDocument();
    expect(screen.getByText("Card content")).toBeInTheDocument();
    expect(card).toHaveClass("p-4"); // default is "md" padding
  });

  it("renders with none padding", () => {
    render(
      <Card padding="none" data-testid="card">
        No padding
      </Card>
    );
    const card = screen.getByTestId("card");
    expect(card).not.toHaveClass("p-3");
    expect(card).not.toHaveClass("p-4");
    expect(card).not.toHaveClass("p-6");
  });

  it("renders with sm padding", () => {
    render(
      <Card padding="sm" data-testid="card">
        Small padding
      </Card>
    );
    expect(screen.getByTestId("card")).toHaveClass("p-3");
  });

  it("renders with md padding", () => {
    render(
      <Card padding="md" data-testid="card">
        Medium padding
      </Card>
    );
    expect(screen.getByTestId("card")).toHaveClass("p-4");
  });

  it("renders with lg padding", () => {
    render(
      <Card padding="lg" data-testid="card">
        Large padding
      </Card>
    );
    expect(screen.getByTestId("card")).toHaveClass("p-6");
  });

  it("merges custom className with default styles", () => {
    render(
      <Card className="custom-class" data-testid="card">
        Custom class
      </Card>
    );
    const card = screen.getByTestId("card");
    expect(card).toHaveClass("custom-class");
    expect(card).toHaveClass("bg-app-surface");
    expect(card).toHaveClass("rounded-sm");
    expect(card).toHaveClass("border");
    expect(card).toHaveClass("border-app-border");
  });

  it("renders custom children", () => {
    render(
      <Card>
        <div data-testid="custom">Custom content</div>
      </Card>
    );
    expect(screen.getByTestId("custom")).toBeInTheDocument();
    expect(screen.getByText("Custom content")).toBeInTheDocument();
  });

  it("passes through HTML attributes", () => {
    render(
      <Card data-testid="card" role="region" aria-label="Info card">
        Content
      </Card>
    );
    const card = screen.getByTestId("card");
    expect(card).toHaveAttribute("role", "region");
    expect(card).toHaveAttribute("aria-label", "Info card");
  });
});
