import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getSessionOptions } from "@/api/session";
import { NotFoundComponent } from "@/components/404-components";
import { Button } from "@/components/ui/button";
import { getHybridRepoDOStub } from "@/do/hybrid-repo";

const createHybridRepo = createServerFn({ method: "POST" }).handler(
  async () => {
    const stub = getHybridRepoDOStub("hybrid/repo");
    const pong = await stub.ping();
    return pong;
  }
);

export const Route = createFileRoute("/_layout/dashboard")({
  component: RouteComponent,
  notFoundComponent: NotFoundComponent,
  loader: async ({ context: { queryClient } }) => {
    const data = await queryClient.ensureQueryData(getSessionOptions);
    if (!data) {
      throw redirect({ to: "/" });
    }
    return data;
  },
});

function RouteComponent() {
  const { data: session } = useSuspenseQuery(getSessionOptions);
  const user = session?.user;
  const username = user?.username ?? "";

  return (
    <div className="py-8">
      <div className="mx-auto max-w-7xl space-y-8">Welcome, {username}</div>
      <Button onClick={async () => await createHybridRepo().then(console.log)}>
        Create Hybrid Repo
      </Button>
    </div>
  );
}
