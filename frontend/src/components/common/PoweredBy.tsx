"use client";

interface PoweredByProps {
  className?: string;
}

export function PoweredBy({ className = "" }: PoweredByProps) {
  return (
    <a
      href="https://spirit-monkey.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-center gap-1 text-[11px] font-sans text-muted-foreground select-none hover:text-foreground transition-colors ${className}`}
    >
      Powered by
      <strong className="font-bold text-brand-600 dark:text-brand-400">Spirit Monkey</strong>
    </a>
  );
}
