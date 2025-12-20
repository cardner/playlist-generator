/**
 * UI Component Types
 * 
 * This module defines common TypeScript types and interfaces used for UI components,
 * including props, state, and event handlers. These types promote consistency across
 * the application's React components.
 * 
 * @module types/ui
 */

import type { ReactNode } from "react";

/**
 * Base props interface for components that accept className
 * 
 * Most components should extend this to allow custom styling via className.
 * 
 * @example
 * ```typescript
 * interface MyComponentProps extends BaseComponentProps {
 *   title: string;
 * }
 * ```
 */
export interface BaseComponentProps {
  /** Optional CSS class name for custom styling */
  className?: string;
}

/**
 * Base props interface for components that accept children
 * 
 * Use this for components that render child content.
 * 
 * @example
 * ```typescript
 * interface ContainerProps extends BaseComponentWithChildren {
 *   title: string;
 * }
 * ```
 */
export interface BaseComponentWithChildren extends BaseComponentProps {
  /** Child elements to render */
  children: ReactNode;
}

/**
 * Loading state
 * 
 * Represents the loading state of an async operation.
 * 
 * @example
 * ```typescript
 * const [isLoading, setIsLoading] = useState<LoadingState>("idle");
 * ```
 */
export type LoadingState = "idle" | "loading" | "success" | "error";

/**
 * Button variant
 * 
 * Visual style variants for buttons.
 * 
 * @example
 * ```typescript
 * const variant: ButtonVariant = "primary";
 * ```
 */
export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline";

/**
 * Button size
 * 
 * Size variants for buttons.
 * 
 * @example
 * ```typescript
 * const size: ButtonSize = "lg";
 * ```
 */
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Button props
 * 
 * Common props for button components.
 * 
 * @example
 * ```typescript
 * const buttonProps: ButtonProps = {
 *   variant: "primary",
 *   size: "md",
 *   disabled: false,
 *   onClick: () => console.log("clicked")
 * };
 * ```
 */
export interface ButtonProps extends BaseComponentProps {
  /** Button variant style */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Button type (for form buttons) */
  type?: "button" | "submit" | "reset";
  /** Icon to display before text */
  icon?: ReactNode;
  /** Icon to display after text */
  iconRight?: ReactNode;
  /** Whether button is in loading state */
  loading?: boolean;
}

/**
 * Input field props
 * 
 * Common props for input field components.
 * 
 * @example
 * ```typescript
 * const inputProps: InputProps = {
 *   label: "Email",
 *   value: email,
 *   onChange: (e) => setEmail(e.target.value),
 *   error: "Invalid email"
 * };
 * ```
 */
export interface InputProps extends BaseComponentProps {
  /** Input label */
  label?: string;
  /** Input value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Error message to display */
  error?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Whether input is required */
  required?: boolean;
  /** Input type */
  type?: "text" | "email" | "password" | "number" | "search";
  /** Helper text to display below input */
  helperText?: string;
}

/**
 * Select option
 * 
 * Represents an option in a select dropdown.
 * 
 * @example
 * ```typescript
 * const option: SelectOption = {
 *   value: "option1",
 *   label: "Option 1",
 *   disabled: false
 * };
 * ```
 */
export interface SelectOption {
  /** Option value */
  value: string;
  /** Option label to display */
  label: string;
  /** Whether option is disabled */
  disabled?: boolean;
}

/**
 * Select props
 * 
 * Common props for select dropdown components.
 * 
 * @example
 * ```typescript
 * const selectProps: SelectProps = {
 *   label: "Choose an option",
 *   value: selectedValue,
 *   onChange: (value) => setSelectedValue(value),
 *   options: [
 *     { value: "1", label: "Option 1" },
 *     { value: "2", label: "Option 2" }
 *   ]
 * };
 * ```
 */
export interface SelectProps extends BaseComponentProps {
  /** Select label */
  label?: string;
  /** Selected value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Available options */
  options: SelectOption[];
  /** Error message to display */
  error?: string;
  /** Whether select is disabled */
  disabled?: boolean;
  /** Whether select is required */
  required?: boolean;
  /** Placeholder text */
  placeholder?: string;
}

/**
 * Modal props
 * 
 * Common props for modal/dialog components.
 * 
 * @example
 * ```typescript
 * const modalProps: ModalProps = {
 *   isOpen: true,
 *   onClose: () => setIsOpen(false),
 *   title: "Confirm Action",
 *   children: <p>Are you sure?</p>
 * };
 * ```
 */
export interface ModalProps extends BaseComponentWithChildren {
  /** Whether modal is open */
  isOpen: boolean;
  /** Handler to close modal */
  onClose: () => void;
  /** Modal title */
  title?: string;
  /** Size of the modal */
  size?: "sm" | "md" | "lg" | "xl" | "full";
  /** Whether to show close button */
  showCloseButton?: boolean;
  /** Whether clicking overlay closes modal */
  closeOnOverlayClick?: boolean;
}

/**
 * Card props
 * 
 * Common props for card components.
 * 
 * @example
 * ```typescript
 * const cardProps: CardProps = {
 *   title: "Card Title",
 *   children: <p>Card content</p>
 * };
 * ```
 */
export interface CardProps extends BaseComponentWithChildren {
  /** Card title */
  title?: string;
  /** Card subtitle */
  subtitle?: string;
  /** Optional header action button */
  headerAction?: ReactNode;
  /** Whether card has padding */
  padded?: boolean;
  /** Whether card is hoverable */
  hoverable?: boolean;
}

/**
 * Badge props
 * 
 * Common props for badge components.
 * 
 * @example
 * ```typescript
 * const badgeProps: BadgeProps = {
 *   label: "New",
 *   variant: "success"
 * };
 * ```
 */
export interface BadgeProps extends BaseComponentProps {
  /** Badge label text */
  label: string;
  /** Badge variant */
  variant?: "default" | "success" | "warning" | "error" | "info";
  /** Badge size */
  size?: "sm" | "md" | "lg";
}

/**
 * Tooltip props
 * 
 * Common props for tooltip components.
 * 
 * @example
 * ```typescript
 * const tooltipProps: TooltipProps = {
 *   content: "This is a tooltip",
 *   children: <button>Hover me</button>
 * };
 * ```
 */
export interface TooltipProps extends BaseComponentWithChildren {
  /** Tooltip content */
  content: string;
  /** Tooltip position */
  position?: "top" | "bottom" | "left" | "right";
  /** Delay before showing tooltip (ms) */
  delay?: number;
}

/**
 * Progress bar props
 * 
 * Common props for progress bar components.
 * 
 * @example
 * ```typescript
 * const progressProps: ProgressBarProps = {
 *   value: 50,
 *   max: 100,
 *   label: "50%"
 * };
 * ```
 */
export interface ProgressBarProps extends BaseComponentProps {
  /** Current progress value */
  value: number;
  /** Maximum value */
  max: number;
  /** Optional label to display */
  label?: string;
  /** Whether to show percentage */
  showPercentage?: boolean;
  /** Progress bar variant */
  variant?: "default" | "success" | "warning" | "error";
}

/**
 * Alert props
 * 
 * Common props for alert/notification components.
 * 
 * @example
 * ```typescript
 * const alertProps: AlertProps = {
 *   message: "Something went wrong",
 *   variant: "error",
 *   onDismiss: () => setAlert(null)
 * };
 * ```
 */
export interface AlertProps extends BaseComponentProps {
  /** Alert message */
  message: string;
  /** Alert variant */
  variant?: "info" | "success" | "warning" | "error";
  /** Handler to dismiss alert */
  onDismiss?: () => void;
  /** Whether alert is dismissible */
  dismissible?: boolean;
  /** Optional title */
  title?: string;
}

/**
 * Empty state props
 * 
 * Common props for empty state components (shown when no data).
 * 
 * @example
 * ```typescript
 * const emptyStateProps: EmptyStateProps = {
 *   title: "No tracks found",
 *   description: "Try adjusting your filters",
 *   action: { label: "Add Tracks", onClick: () => {} }
 * };
 * ```
 */
export interface EmptyStateProps extends BaseComponentProps {
  /** Empty state title */
  title: string;
  /** Empty state description */
  description?: string;
  /** Optional icon */
  icon?: ReactNode;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Sort configuration
 * 
 * Configuration for sorting a list of items.
 * 
 * @example
 * ```typescript
 * const sortConfig: SortConfig<"title" | "artist"> = {
 *   field: "title",
 *   direction: "asc"
 * };
 * ```
 */
export interface SortConfig<T extends string> {
  /** Field to sort by */
  field: T;
  /** Sort direction */
  direction: "asc" | "desc";
}

/**
 * Filter configuration
 * 
 * Generic filter configuration for filtering lists.
 * 
 * @example
 * ```typescript
 * const filterConfig: FilterConfig = {
 *   search: "rock",
 *   genres: ["Rock", "Indie"],
 *   minDuration: 120
 * };
 * ```
 */
export interface FilterConfig {
  /** Search query string */
  search?: string;
  /** Selected genres */
  genres?: string[];
  /** Selected artists */
  artists?: string[];
  /** Minimum duration in seconds */
  minDuration?: number;
  /** Maximum duration in seconds */
  maxDuration?: number;
}

/**
 * Pagination props
 * 
 * Common props for pagination components.
 * 
 * @example
 * ```typescript
 * const paginationProps: PaginationProps = {
 *   currentPage: 1,
 *   totalPages: 10,
 *   onPageChange: (page) => setCurrentPage(page)
 * };
 * ```
 */
export interface PaginationProps extends BaseComponentProps {
  /** Current page number (1-indexed) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Handler for page change */
  onPageChange: (page: number) => void;
  /** Whether to show page numbers */
  showPageNumbers?: boolean;
  /** Number of page numbers to show on each side of current page */
  pageRange?: number;
}

/**
 * Utility type: Extract props from a component type
 * 
 * @example
 * ```typescript
 * type MyComponentProps = ComponentProps<typeof MyComponent>;
 * ```
 */
export type ComponentProps<T> = T extends React.ComponentType<infer P> ? P : never;

/**
 * Utility type: Make specific props optional
 * 
 * @example
 * ```typescript
 * type OptionalTitle = MakeOptional<ButtonProps, "variant" | "size">;
 * ```
 */
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Utility type: Make specific props required
 * 
 * @example
 * ```typescript
 * type RequiredTitle = MakeRequired<ButtonProps, "onClick">;
 * ```
 */
export type MakeRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

