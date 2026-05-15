import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

export default function Checkbox({ checked, onChange, label, description }: Props) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none py-1.5">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "w-4 h-4 mt-0.5 rounded border flex items-center justify-center transition shrink-0",
          checked
            ? "bg-accent-blue border-accent-blue text-white"
            : "bg-bg-input border-border-strong hover:border-text-secondary",
        )}
      >
        {checked && <Check size={11} strokeWidth={3.5} />}
      </button>
      <div className="leading-snug">
        <div className="text-sm text-text-primary">{label}</div>
        {description && <div className="text-xs text-text-secondary mt-0.5">{description}</div>}
      </div>
    </label>
  );
}
