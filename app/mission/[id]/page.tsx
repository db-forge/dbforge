// Owner: Developer 1 (app pages / components)
export default async function MissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="p-24">
      <h1 className="text-xl font-semibold">Mission {id}</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Mission detail and submission upload flow. Placeholder page.
      </p>
    </main>
  );
}
