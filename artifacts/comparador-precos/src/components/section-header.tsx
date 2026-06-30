import type { ElementType } from "react";
import { Link } from "wouter";

interface SectionHeaderProps {
  label: string;
  icon?: ElementType;
  iconClassName?: string;
  link?: string;
  linkLabel?: string;
}

export function SectionHeader({
  label,
  icon: Icon,
  iconClassName = "h-3.5 w-3.5 shrink-0",
  link,
  linkLabel = "Ver tudo →",
}: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <p className="text-[13px] font-bold text-[#0B1023] flex items-center gap-1.5">
        {Icon && <Icon className={iconClassName} />}
        {label}
      </p>
      {link && (
        <Link href={link}>
          <span className="text-[12px] font-semibold text-[#F2C14E]">{linkLabel}</span>
        </Link>
      )}
    </div>
  );
}
