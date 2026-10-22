/** Lightweight skeleton shown while a shop page streams in. */
export default function ShopLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-7 w-56 rounded bg-subtle" />
      <div className="mb-6 h-10 w-full rounded-md bg-subtle" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="aspect-square bg-subtle" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-3/4 rounded bg-subtle" />
              <div className="h-4 w-1/3 rounded bg-subtle" />
              <div className="h-9 w-full rounded bg-subtle" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
