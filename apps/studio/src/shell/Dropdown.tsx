import {
  ButtonHTMLAttributes,
  ReactNode,
  useEffect,
  useRef,
  useState
} from "react";

interface DropdownProps {
  label: ReactNode;
  /** Optional aria-label fallback when label is non-text. */
  ariaLabel?: string;
  children: ReactNode;
  disabled?: boolean;
  /** Close after any item is clicked (default true). */
  closeOnSelect?: boolean;
  className?: string;
}

interface DropdownContextValue {
  close(): void;
}

let _ctxId = 0;

/**
 * Lightweight dropdown menu. Click the trigger button to open; click outside,
 * press Escape, or select an item (when closeOnSelect=true) to close.
 *
 * Use <DropdownItem> children for menu rows. <DropdownSeparator/> for dividers.
 */
export function Dropdown({
  label,
  ariaLabel,
  children,
  disabled,
  closeOnSelect = true,
  className
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const id = useRef(`dropdown-${++_ctxId}`).current;

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        e.target instanceof Node &&
        !wrapperRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className={`dropdown ${className ?? ""} ${open ? "dropdown--open" : ""}`}
    >
      <button
        type="button"
        className="dropdown-trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        aria-label={ariaLabel}
      >
        {label} <span className="dropdown-caret" aria-hidden>▾</span>
      </button>
      {open ? (
        <div className="dropdown-menu" role="menu" id={id}>
          <DropdownContextProvider close={closeOnSelect ? () => setOpen(false) : () => {}}>
            {children}
          </DropdownContextProvider>
        </div>
      ) : null}
    </div>
  );
}

// React context to let DropdownItem call close() without prop drilling.
import { createContext, useContext } from "react";
const DropdownContext = createContext<DropdownContextValue>({ close() {} });

function DropdownContextProvider({
  close,
  children
}: {
  close(): void;
  children: ReactNode;
}) {
  return (
    <DropdownContext.Provider value={{ close }}>{children}</DropdownContext.Provider>
  );
}

interface DropdownItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function DropdownItem({ onClick, children, ...rest }: DropdownItemProps) {
  const { close } = useContext(DropdownContext);
  return (
    <button
      type="button"
      role="menuitem"
      className="dropdown-item"
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) close();
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="dropdown-separator" role="separator" />;
}
