type SkeletonVariant = 'list' | 'summary' | 'chart';

const block = (className: string, key?: number) => <span key={key} className={`skeleton-block ${className}`} />;

const SHAPES: Record<SkeletonVariant, () => React.JSX.Element[]> = {
  summary: () => [block('skeleton-label', 0), block('skeleton-amount', 1), block('skeleton-line', 2), block('skeleton-line', 3)],
  list: () =>
    [0, 1, 2].map((row) => (
      <span key={row} className="skeleton-row">
        {block('skeleton-circle')}
        <span className="skeleton-lines">
          {block('skeleton-line')}
          {block('skeleton-label')}
        </span>
      </span>
    )),
  chart: () => [block('skeleton-label', 0), block('skeleton-bar', 1), block('skeleton-bar', 2), block('skeleton-bar', 3)],
};

/** Placeholder shapes while a panel loads. Screen readers hear only "Loading…". */
export function Skeleton({ variant = 'list' }: { variant?: SkeletonVariant }) {
  return (
    <div className={`skeleton skeleton-${variant}`}>
      <span className="visually-hidden" role="status">
        Loading…
      </span>
      <span className="skeleton-shapes" aria-hidden="true">
        {SHAPES[variant]()}
      </span>
    </div>
  );
}
