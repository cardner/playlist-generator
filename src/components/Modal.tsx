/**
 * Modal Component
 * 
 * Reusable modal dialog component with backdrop, close button, and keyboard
 * navigation support. Used throughout the application for displaying content
 * in an overlay.
 * 
 * Features:
 * - Backdrop with blur effect
 * - Close button in header
 * - Escape key to close
 * - Prevents body scroll when open
 * - Click outside to close (optional)
 * - Responsive sizing
 * - Optional title header
 * 
 * Accessibility:
 * - Keyboard navigation (Escape to close)
 * - ARIA labels for close button
 * - Focus management
 * 
 * Props:
 * - `isOpen`: Whether modal is visible
 * - `onClose`: Callback when modal should close
 * - `title`: Optional title text for header
 * - `children`: Modal content
 * 
 * @module components/Modal
 * 
 * @example
 * ```tsx
 * <Modal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   title="Edit Collection"
 * >
 *   <CollectionEditor />
 * </Modal>
 * ```
 */

"use client";

import { Dialog } from "@/design-system/components/Dialog";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

/**
 * Modal component - thin wrapper around design system Dialog.
 * Uses Radix UI Dialog for accessibility (focus trap, Escape, etc.).
 */
export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()} title={title}>
      <Dialog.Body>{children}</Dialog.Body>
    </Dialog>
  );
}

