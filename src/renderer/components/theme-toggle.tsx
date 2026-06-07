import { useRef, useState } from "react";
import { Check, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { TITLEBAR_THEME_OPTIONS, type ThemePreference } from "@/lib/theme";
import { useTheme } from "@/theme/theme-provider";

const control =
  "titlebar-no-drag flex h-14 w-[46px] shrink-0 items-center justify-center rounded-none text-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

export function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const switchToOpposite =
    resolved === "light" ? "flexoki-dark" : "flexoki-light";

  const TargetIcon = resolved === "light" ? Moon : Sun;
  const toggleLabel =
    resolved === "light" ? "Switch to dark mode" : "Switch to light mode";

  const selectPreference = (next: ThemePreference) => {
    setPreference(next);
    setMenuOpen(false);
  };

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <button
        ref={buttonRef}
        type="button"
        className={control}
        aria-label={toggleLabel}
        aria-haspopup="menu"
        onClick={() => setPreference(switchToOpposite)}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenuOpen(true);
        }}
      >
        <TargetIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      </button>
      <DropdownMenuContent
        anchor={buttonRef}
        side="bottom"
        align="end"
        className="min-w-36"
      >
        {TITLEBAR_THEME_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className="justify-between"
            onClick={() => selectPreference(option.value)}
          >
            <span>{option.label}</span>
            {preference === option.value && (
              <Check className="h-4 w-4 shrink-0" aria-hidden />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
