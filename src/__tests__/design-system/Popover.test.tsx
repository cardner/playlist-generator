import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Popover } from "@/design-system/components/Popover";

describe("Popover", () => {
  it("renders trigger", () => {
    render(
      <Popover trigger={<button>Open</button>}>
        <span>Popover content</span>
      </Popover>
    );
    expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
  });

  it("shows content when open", () => {
    render(
      <Popover open={true} trigger={<button>Open</button>}>
        <span>Popover content</span>
      </Popover>
    );
    expect(screen.getByText("Popover content")).toBeInTheDocument();
  });

  it("opens when trigger clicked", () => {
    render(
      <Popover trigger={<button>Open</button>}>
        <span>Popover content</span>
      </Popover>
    );
    expect(screen.queryByText("Popover content")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Popover content")).toBeInTheDocument();
  });

  it("calls onOpenChange when trigger clicked", () => {
    const onOpenChange = jest.fn();
    render(
      <Popover onOpenChange={onOpenChange} trigger={<button>Open</button>}>
        <span>Content</span>
      </Popover>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
