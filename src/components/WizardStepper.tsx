import { cn } from "@/lib/utils";

export interface WizardStepDef {
  id: string;
  title: string;
  subtitle: string;
}

interface Props {
  steps: WizardStepDef[];
  current: number;
  onJump?: (index: number) => void;
}

export default function WizardStepper({ steps, current, onJump }: Props) {
  return (
    <div className="flex flex-col gap-1 py-8">
      {steps.map((step, i) => {
        const active = i === current;
        const completed = i < current;
        const clickable = !!onJump && i <= current;
        return (
          <button
            key={step.id}
            disabled={!clickable}
            onClick={() => clickable && onJump?.(i)}
            className={cn(
              "flex items-start gap-4 px-3 py-3 rounded-lg text-left transition",
              clickable ? "cursor-pointer hover:bg-bg-card/50" : "cursor-default",
            )}
          >
            <div
              className={cn(
                "w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5 transition",
                active && "bg-accent-blue text-white",
                completed && "bg-accent-blue/20 text-accent-blue",
                !active && !completed && "bg-bg-input text-text-muted border border-border",
              )}
            >
              {i + 1}
            </div>
            <div className="leading-tight">
              <div
                className={cn(
                  "text-sm font-medium",
                  active ? "text-text-primary" : completed ? "text-text-primary" : "text-text-secondary",
                )}
              >
                {step.title}
              </div>
              <div className="text-xs text-text-secondary mt-0.5">{step.subtitle}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
