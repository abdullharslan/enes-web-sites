interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  id?: string;
  as?: "h1" | "h2";
  align?: "left" | "center";
}

export function SectionHeading({
  eyebrow,
  title,
  id,
  as: Tag = "h2",
  align = "left",
}: SectionHeadingProps) {
  const alignment = align === "center" ? "text-center items-center" : "items-start";
  return (
    <div className={`flex flex-col gap-4 ${alignment}`}>
      {eyebrow && (
        <p className="flex items-center gap-4 text-xs font-medium uppercase tracking-luxe text-gold">
          <span aria-hidden="true" className="h-px w-10 bg-gold" />
          {eyebrow}
        </p>
      )}
      <Tag
        id={id}
        className="font-display text-4xl font-light leading-tight text-cream sm:text-5xl lg:text-6xl"
      >
        {title}
      </Tag>
    </div>
  );
}
