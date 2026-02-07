import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Textarea } from "@/design-system/components/Textarea";

describe("Textarea", () => {
  it("renders without label", () => {
    render(<Textarea placeholder="Enter description" />);
    expect(screen.getByPlaceholderText("Enter description")).toBeInTheDocument();
  });

  it("renders with label", () => {
    render(<Textarea label="Description" />);
    expect(screen.getByText("Description")).toBeInTheDocument();
  });

  it("renders with error", () => {
    render(<Textarea error="This field is required" />);
    expect(screen.getByText("This field is required")).toBeInTheDocument();
  });

  it("associates label with textarea via htmlFor", () => {
    render(<Textarea label="Bio" id="bio-textarea" />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveAttribute("id", "bio-textarea");
    expect(screen.getByText("Bio")).toHaveAttribute("for", "bio-textarea");
  });

  it("generates id from label when id is not provided", () => {
    render(<Textarea label="User Notes" />);
    const textarea = screen.getByRole("textbox");
    const textareaId = textarea.getAttribute("id");
    expect(textareaId).toBeTruthy();
    expect(screen.getByText("User Notes")).toHaveAttribute("for", textareaId);
  });

  it("calls onChange when value changes", () => {
    const handleChange = jest.fn();
    render(<Textarea value="" onChange={handleChange} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "test content" } });
    expect(handleChange).toHaveBeenCalled();
  });

  it("renders as disabled", () => {
    render(<Textarea disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("displays value", () => {
    const handleChange = jest.fn();
    render(<Textarea value="Hello World" onChange={handleChange} />);
    expect(screen.getByRole("textbox")).toHaveValue("Hello World");
  });

  it("uses default rows of 3", () => {
    render(<Textarea />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveAttribute("rows", "3");
  });

  it("uses custom rows when provided", () => {
    render(<Textarea rows={5} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveAttribute("rows", "5");
  });

  it("applies error styling when error is present", () => {
    render(<Textarea error="Invalid input" />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveClass("border-red-500");
  });
});
