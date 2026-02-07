import React from "react";
import { render, screen } from "@testing-library/react";
import { Tabs } from "@/design-system/components/Tabs";

describe("Tabs", () => {
  it("renders all tab items", () => {
    render(
      <Tabs
        value="a"
        onValueChange={() => {}}
        items={[
          { value: "a", label: "Tab A" },
          { value: "b", label: "Tab B" },
        ]}
      />
    );
    expect(screen.getByRole("tab", { name: /tab a/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /tab b/i })).toBeInTheDocument();
  });

  it("shows active tab as selected", () => {
    render(
      <Tabs
        value="b"
        onValueChange={() => {}}
        items={[
          { value: "a", label: "Tab A" },
          { value: "b", label: "Tab B" },
        ]}
      />
    );
    expect(screen.getByRole("tab", { name: /tab b/i })).toHaveAttribute("data-state", "active");
  });

  it("renders with icon", () => {
    const Icon = () => <span data-testid="tab-icon">I</span>;
    render(
      <Tabs
        value="a"
        onValueChange={() => {}}
        items={[{ value: "a", label: "Tab A", icon: <Icon /> }]}
      />
    );
    expect(screen.getByTestId("tab-icon")).toBeInTheDocument();
  });
});
