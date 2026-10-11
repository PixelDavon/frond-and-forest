import type { InteractiveOption } from "@/lib/types";

interface ChoiceBadgesProps {
  options: InteractiveOption[];
  onSelect: (option: InteractiveOption) => void;
  disabled: boolean;
}

export default function ChoiceBadges({
  options,
  onSelect,
  disabled,
}: ChoiceBadgesProps) {
  return (
    <div className="flex flex-wrap gap-3" aria-label="Story choices">
      {options.map((option) => (
        <button
          key={option.action}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(option)}
          className="rounded-full border-2 border-moss/20 bg-white px-5 py-3 text-left font-bold text-slate-700 shadow-sm transition hover:scale-105 hover:border-moss/50 hover:bg-moss/10 active:scale-95 focus:outline-none focus:ring-4 focus:ring-moss/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
