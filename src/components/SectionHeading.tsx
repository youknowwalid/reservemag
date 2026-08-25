interface SectionHeadingProps {
  title: string;
  className?: string;
}

/**
 * Shared utility heading used by editorial sections ("Must Read",
 * "Latest Stories", etc.) — a bold sans-serif label followed by a
 * hairline rule that extends to fill the remaining row width.
 */
export default function SectionHeading({ title, className = '' }: SectionHeadingProps) {
  return (
    <div className={`flex items-center gap-8 ${className}`}>
      <h2 className="font-sans text-3xl md:text-4xl font-bold tracking-tight text-reserve-text whitespace-nowrap">
        {title}
      </h2>
      <span className="section-rule" aria-hidden="true" />
    </div>
  );
}
