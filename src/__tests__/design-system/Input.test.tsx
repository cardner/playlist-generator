import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "@/design-system/components/Input";

describe("Input", () => {
  it("renders without label", () => {
    render(<Input placeholder="Enter value" />);
    expect(screen.getByPlaceholderText("Enter value")).toBeInTheDocument();
  });

  it("renders with label", () => {
    render(<Input label="Title" />);
    expect(screen.getByText("Title")).toBeInTheDocument();
  });

  it("renders with error", () => {
    render(<Input error="This field is required" />);
    expect(screen.getByText("This field is required")).toBeInTheDocument();
  });

  it("associates label with input via htmlFor", () => {
    render(<Input label="Email" id="email-input" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("id", "email-input");
    expect(screen.getByText("Email")).toHaveAttribute("for", "email-input");
  });

  it("calls onChange when value changes", () => {
    const handleChange = jest.fn();
    render(<Input value="" onChange={handleChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "test" } });
    expect(handleChange).toHaveBeenCalled();
  });

  it("renders as disabled", () => {
    render(<Input disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("displays value", () => {
    render(<Input value="Hello" onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("Hello");
  });
});
