import { SectionHeading } from "./section-heading";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  intro?: string;
}

/** Top of every inner page; clears the fixed site header. */
export function PageHeader({ eyebrow, title, intro }: PageHeaderProps) {
  return (
    <header className="border-b border-line bg-coal">
      <div className="mx-auto max-w-screen-2xl px-4 pt-36 pb-16 sm:px-8 sm:pt-44 sm:pb-20">
        <SectionHeading as="h1" eyebrow={eyebrow} title={title} />
        {intro && (
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-mist sm:text-lg">
            {intro}
          </p>
        )}
      </div>
    </header>
  );
}
