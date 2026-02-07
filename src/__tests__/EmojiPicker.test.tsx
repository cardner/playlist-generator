import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmojiPicker } from "@/components/EmojiPicker";

describe("EmojiPicker", () => {
  it("renders button with smile icon when no value", () => {
    render(<EmojiPicker value={null} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /change emoji/i })).toBeInTheDocument();
  });

  it("renders current emoji when value set", () => {
    render(<EmojiPicker value="🎵" onChange={() => {}} />);
    expect(screen.getByText("🎵")).toBeInTheDocument();
  });

  it("opens popover when clicked", () => {
    render(<EmojiPicker value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Select Emoji")).toBeInTheDocument();
  });

  it("calls onChange when emoji selected", () => {
    const onChange = jest.fn();
    render(<EmojiPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button", { name: /select 🌊/i }));
    expect(onChange).toHaveBeenCalledWith("🌊");
  });

  it("calls onChange with null when remove clicked", () => {
    const onChange = jest.fn();
    render(<EmojiPicker value="🎵" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button", { name: /remove emoji/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
