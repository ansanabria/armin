import { UserRound } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";

const control =
  "titlebar-no-drag flex h-14 w-[46px] shrink-0 items-center justify-center rounded-none text-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

export function ProfileSwitcher() {
  const openPicker = () => {
    void window.armin?.profiles?.showPicker();
  };

  return (
    <Tooltip content="Switch profile">
      <button
        type="button"
        className={control}
        aria-label="Switch profile"
        onClick={openPicker}
      >
        <UserRound className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      </button>
    </Tooltip>
  );
}
