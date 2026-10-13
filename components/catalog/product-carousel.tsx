"use client";

import { Children, useId, useRef, type ReactNode } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/ui/icons";

interface ProductCarouselProps {
  children: ReactNode;
  labels: { previous: string; next: string };
}

const SCROLL_RATIO = 0.85;

/** Native scroll-snap carousel; buttons are an enhancement, swipe/scroll always work. */
export function ProductCarousel({ children, labels }: ProductCarouselProps) {
  const trackRef = useRef<HTMLUListElement>(null);
  const trackId = useId();

  const scroll = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({
      left: direction * track.clientWidth * SCROLL_RATIO,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  const buttonClass =
    "inline-flex size-12 items-center justify-center border border-line text-cream transition-colors hover:border-gold hover:text-gold";

  return (
    <div>
      <div className="mb-8 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => scroll(-1)}
          aria-controls={trackId}
          aria-label={labels.previous}
          className={buttonClass}
        >
          <ArrowLeftIcon />
        </button>
        <button
          type="button"
          onClick={() => scroll(1)}
          aria-controls={trackId}
          aria-label={labels.next}
          className={buttonClass}
        >
          <ArrowRightIcon />
        </button>
      </div>
      <ul
        id={trackId}
        ref={trackRef}
        className="-mx-4 flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-px-4 px-4 pb-4 [scrollbar-width:none] sm:-mx-8 sm:scroll-px-8 sm:px-8"
      >
        {Children.map(children, (child) => (
          <li className="w-[78%] shrink-0 snap-start sm:w-[42%] lg:w-[30%] xl:w-[23%]">
            {child}
          </li>
        ))}
      </ul>
    </div>
  );
}
