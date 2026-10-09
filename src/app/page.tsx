import MapApp from "~/app/_components/map-app";
import { HydrateClient, api } from "~/trpc/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  void api.campus.bootstrap.prefetch();

  return (
    <HydrateClient>
      <MapApp />
    </HydrateClient>
  );
}
