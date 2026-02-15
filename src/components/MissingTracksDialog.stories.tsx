import { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Modal } from "./Modal";

const meta: Meta<typeof Modal> = {
  component: Modal,
  title: "Components/MissingTracksDialog",
  tags: ["no-screenshot"],
};

export default meta;

type Story = StoryObj<typeof Modal>;

function MissingTracksDialogContent({
  missingCount,
  onSyncMissing,
  onPlaylistOnly,
  onCancel,
}: {
  missingCount: number;
  onSyncMissing: () => void;
  onPlaylistOnly: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3 text-sm text-app-secondary">
      <p>
        {missingCount} track{missingCount === 1 ? "" : "s"} in the selected playlist(s){" "}
        {missingCount === 1 ? "is" : "are"} not on the device.
      </p>
      <p>Copy missing tracks now, or update the playlist with existing tracks only?</p>
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button
          type="button"
          onClick={onSyncMissing}
          className="px-3 py-2 bg-accent-primary text-white rounded-sm hover:bg-accent-hover text-xs uppercase tracking-wider"
        >
          Sync missing
        </button>
        <button
          type="button"
          onClick={onPlaylistOnly}
          className="px-3 py-2 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover text-xs uppercase tracking-wider"
        >
          Playlist only
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover text-xs uppercase tracking-wider"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export const SingleMissingTrack: Story = {
  render: () => (
    <Modal isOpen={true} onClose={() => {}} title="Tracks not on device">
      <MissingTracksDialogContent
        missingCount={1}
        onSyncMissing={() => {}}
        onPlaylistOnly={() => {}}
        onCancel={() => {}}
      />
    </Modal>
  ),
};

export const MultipleMissingTracks: Story = {
  render: () => (
    <Modal isOpen={true} onClose={() => {}} title="Tracks not on device">
      <MissingTracksDialogContent
        missingCount={12}
        onSyncMissing={() => {}}
        onPlaylistOnly={() => {}}
        onCancel={() => {}}
      />
    </Modal>
  ),
};
