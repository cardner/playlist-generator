import React from "react";
import { render, screen } from "@testing-library/react";
import { Alert } from "@/design-system/components/Alert";

describe("Alert", () => {
  it("renders with warning variant", () => {
    render(<Alert variant="warning">Warning message</Alert>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Warning message")).toBeInTheDocument();
  });

  it("renders with error variant", () => {
    render(<Alert variant="error">Error message</Alert>);
    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("renders with success variant", () => {
    render(<Alert variant="success">Success message</Alert>);
    expect(screen.getByText("Success message")).toBeInTheDocument();
  });

  it("renders with info variant", () => {
    render(<Alert variant="info">Info message</Alert>);
    expect(screen.getByText("Info message")).toBeInTheDocument();
  });

  it("renders with title", () => {
    render(
      <Alert variant="warning" title="Conflict">
        A collection with this name exists.
      </Alert>
    );
    expect(screen.getByText("Conflict")).toBeInTheDocument();
    expect(screen.getByText("A collection with this name exists.")).toBeInTheDocument();
  });

  it("renders custom children", () => {
    render(
      <Alert variant="error">
        <div data-testid="custom">Custom content</div>
      </Alert>
    );
    expect(screen.getByTestId("custom")).toBeInTheDocument();
    expect(screen.getByText("Custom content")).toBeInTheDocument();
  });
});
