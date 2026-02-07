import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SavePlaylistDialog } from "@/components/SavePlaylistDialog";

describe("SavePlaylistDialog", () => {
  it("renders when open", () => {
    render(
      <SavePlaylistDialog
        isOpen={true}
        defaultTitle="My Playlist"
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText("Save Playlist")).toBeInTheDocument();
    expect(screen.getByDisplayValue("My Playlist")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <SavePlaylistDialog
        isOpen={false}
        defaultTitle="My Playlist"
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.queryByText("Save Playlist")).not.toBeInTheDocument();
  });

  it("calls onClose when Cancel clicked", () => {
    const onClose = jest.fn();
    render(
      <SavePlaylistDialog
        isOpen={true}
        defaultTitle="My Playlist"
        onClose={onClose}
        onConfirm={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onConfirm with title and description when Save clicked", () => {
    const onConfirm = jest.fn();
    render(
      <SavePlaylistDialog
        isOpen={true}
        defaultTitle="My Playlist"
        defaultDescription="Test desc"
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "override",
        title: "My Playlist",
        description: "Test desc",
      })
    );
  });

  it("allows changing title", () => {
    const onConfirm = jest.fn();
    render(
      <SavePlaylistDialog
        isOpen={true}
        defaultTitle="Original"
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    );
    const titleInput = screen.getByDisplayValue("Original");
    fireEvent.change(titleInput, { target: { value: "New Title" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New Title" })
    );
  });
});
