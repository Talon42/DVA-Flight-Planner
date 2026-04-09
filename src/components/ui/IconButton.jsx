import Button from "./Button";
import { cn } from "./cn";

export default function IconButton({ className = "", ...props }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "size-10 rounded-none border-transparent bg-transparent p-0 text-[0.82rem] text-[var(--theme-toggle-text)] shadow-none hover:bg-[var(--action-bg)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-outline)]",
        className
      )}
      {...props}
    />
  );
}
