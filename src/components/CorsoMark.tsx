/** Corso's mark: a white peak on a navy rounded square. Its own colours are the brand's logo plate (DESIGN.md §3),
 * the same on every skin. Decoration: the words beside it say the name. */
export function CorsoMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" className={className} aria-hidden="true" data-corso-mark="">
      <rect width="30" height="30" rx="9" fill="#16233F" />
      <path d="M9 20 13.5 12l3 5 1.8-3L21 20H9Z" fill="white" />
    </svg>
  );
}
