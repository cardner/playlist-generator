import React from "react";
import { render, screen } from "@testing-library/react";
import { Label } from "@/design-system/components/Label";

describe("Label", () => {
  it("renders children", () => {
    render(<Label>Username</Label>);
    expect(screen.getByText("Username")).toBeInTheDocument();
  });

  it("merges custom className with default styles", () => {
    render(<Label className="custom-class">Email</Label>);
    const label = screen.getByText("Email");
    expect(label).toHaveClass("custom-class");
    // Should also have default classes
    expect(label).toHaveClass("block");
    expect(label).toHaveClass("text-app-tertiary");
  });

  it("forwards htmlFor prop", () => {
    render(<Label htmlFor="username-input">Username</Label>);
    const label = screen.getByText("Username");
    expect(label).toHaveAttribute("for", "username-input");
  });

  it("forwards id prop", () => {
    render(<Label id="username-label">Username</Label>);
    const label = screen.getByText("Username");
    expect(label).toHaveAttribute("id", "username-label");
  });

  it("forwards data attributes", () => {
    render(<Label data-testid="custom-label">Test Label</Label>);
    expect(screen.getByTestId("custom-label")).toBeInTheDocument();
  });

  it("forwards aria attributes", () => {
    render(<Label aria-label="accessible-label">Visible Label</Label>);
    const label = screen.getByText("Visible Label");
    expect(label).toHaveAttribute("aria-label", "accessible-label");
  });

  it("renders complex children", () => {
    render(
      <Label>
        <span data-testid="icon">★</span>
        Required Field
      </Label>
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Required Field")).toBeInTheDocument();
  });
});
