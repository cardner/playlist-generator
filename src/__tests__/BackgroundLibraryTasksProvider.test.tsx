import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  BackgroundLibraryTasksProvider,
  useBackgroundLibraryTasks,
} from "@/components/BackgroundLibraryTasksProvider";
import { useLibraryScanning } from "@/hooks/useLibraryScanning";
import { useMetadataParsing } from "@/hooks/useMetadataParsing";
import { useMetadataEnhancement } from "@/hooks/useMetadataEnhancement";

jest.mock("@/hooks/useLibraryScanning", () => ({
  useLibraryScanning: jest.fn(),
}));

jest.mock("@/hooks/useMetadataParsing", () => ({
  useMetadataParsing: jest.fn(),
}));

jest.mock("@/hooks/useMetadataEnhancement", () => ({
  useMetadataEnhancement: jest.fn(),
}));

const mockUseLibraryScanning = useLibraryScanning as jest.Mock;
const mockUseMetadataParsing = useMetadataParsing as jest.Mock;
const mockUseMetadataEnhancement = useMetadataEnhancement as jest.Mock;

function Consumer() {
  const {
    libraryRoot,
    permissionStatus,
    setLibraryRoot,
    setPermissionStatus,
  } = useBackgroundLibraryTasks();

  return (
    <div>
      <div>root:{libraryRoot?.name ?? "none"}</div>
      <div>perm:{permissionStatus ?? "none"}</div>
      <button
        type="button"
        onClick={() =>
          setLibraryRoot({
            mode: "handle",
            name: "Test Library",
            handleId: "handle-1",
          })
        }
      >
        set root
      </button>
      <button type="button" onClick={() => setPermissionStatus("granted")}>
        set perm
      </button>
    </div>
  );
}

describe("BackgroundLibraryTasksProvider", () => {
  beforeEach(() => {
    mockUseLibraryScanning.mockReturnValue({
      scanRunId: "scan-1",
    });
    mockUseMetadataParsing.mockReturnValue({});
    mockUseMetadataEnhancement.mockReturnValue({});
  });

  it("provides and updates library root and permissions", () => {
    render(
      <BackgroundLibraryTasksProvider>
        <Consumer />
      </BackgroundLibraryTasksProvider>
    );

    expect(screen.getByText("root:none")).toBeInTheDocument();
    expect(screen.getByText("perm:none")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /set root/i }));
    fireEvent.click(screen.getByRole("button", { name: /set perm/i }));

    expect(screen.getByText("root:Test Library")).toBeInTheDocument();
    expect(screen.getByText("perm:granted")).toBeInTheDocument();
  });

  it("passes scanRunId to metadata parsing", () => {
    render(
      <BackgroundLibraryTasksProvider>
        <Consumer />
      </BackgroundLibraryTasksProvider>
    );

    expect(mockUseMetadataParsing).toHaveBeenCalledWith(
      expect.objectContaining({ scanRunId: "scan-1" })
    );
  });
});
