import { InviteAcceptView } from "@/components/invite/invite-accept-view";

export default function InvitePage({ params }: { params: { token: string } }) {
  return <InviteAcceptView token={params.token} />;
}
