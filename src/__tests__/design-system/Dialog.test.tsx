import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Dialog } from "@/design-system/components/Dialog";

describe("Dialog", () => {
  it("renders when open", () => {
    render(
      <Dialog open={true} onOpenChange={() => {}} title="Test Dialog">
        <Dialog.Body>Dialog content</Dialog.Body>
      </Dialog>
    );
    expect(screen.getByText("Test Dialog")).toBeInTheDocument();
    expect(screen.getByText("Dialog content")).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    render(
      <Dialog open={false} onOpenChange={() => {}} title="Test Dialog">
        <Dialog.Body>Dialog content</Dialog.Body>
      </Dialog>
    );
    expect(screen.queryByText("Test Dialog")).not.toBeInTheDocument();
  });

  it("calls onOpenChange when close button clicked", () => {
    const onOpenChange = jest.fn();
    render(
      <Dialog open={true} onOpenChange={onOpenChange} title="Test Dialog">
        <Dialog.Body>Content</Dialog.Body>
      </Dialog>
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders without title but with close button", () => {
    render(
      <Dialog open={true} onOpenChange={() => {}}>
        <Dialog.Body>Content only</Dialog.Body>
      </Dialog>
    );
    expect(screen.getByText("Content only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("renders Dialog.Footer", () => {
    render(
      <Dialog open={true} onOpenChange={() => {}} title="Test">
        <Dialog.Body>Body</Dialog.Body>
        <Dialog.Footer>
          <button>Cancel</button>
          <button>Save</button>
        </Dialog.Footer>
      </Dialog>
    );
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });
});
