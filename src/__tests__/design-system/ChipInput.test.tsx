import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChipInput } from "@/components/ChipInput";

describe("ChipInput", () => {
  it("renders with empty values", () => {
    render(<ChipInput values={[]} onChange={() => {}} />);
    expect(screen.getByPlaceholderText("Add item...")).toBeInTheDocument();
  });

  it("renders existing chips", () => {
    render(<ChipInput values={["Rock", "Jazz"]} onChange={() => {}} />);
    expect(screen.getByText("Rock")).toBeInTheDocument();
    expect(screen.getByText("Jazz")).toBeInTheDocument();
  });

  it("calls onChange when chip removed", () => {
    const onChange = jest.fn();
    render(<ChipInput values={["Rock", "Jazz"]} onChange={onChange} />);
    const rockChip = screen.getByText("Rock").parentElement;
    const removeBtn = rockChip?.querySelector("button");
    if (removeBtn) fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(["Jazz"]);
  });

  it("adds chip on Enter key", () => {
    const onChange = jest.fn();
    render(<ChipInput values={[]} onChange={onChange} suggestions={["Rock"]} />);
    const input = screen.getByPlaceholderText("Add item...");
    fireEvent.change(input, { target: { value: "Rock" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["Rock"]);
  });

  it("shows suggestions when available", () => {
    render(
      <ChipInput
        values={[]}
        onChange={() => {}}
        suggestions={["Rock", "Jazz", "Pop"]}
      />
    );
    const input = screen.getByPlaceholderText("Add item...");
    fireEvent.focus(input);
    expect(screen.getByText("Rock")).toBeInTheDocument();
  });

  it("displays error when provided", () => {
    render(
      <ChipInput values={[]} onChange={() => {}} error="This field is required" />
    );
    expect(screen.getByText("This field is required")).toBeInTheDocument();
  });

  it("closes suggestions on Escape", () => {
    render(
      <ChipInput
        values={[]}
        onChange={() => {}}
        suggestions={["Rock"]}
      />
    );
    const input = screen.getByPlaceholderText("Add item...");
    fireEvent.focus(input);
    expect(screen.getByText("Rock")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByText("Rock")).not.toBeInTheDocument();
  });
});
