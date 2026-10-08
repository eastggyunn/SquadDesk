import { MembersView } from "@/components/members/members-view";
import { PageHeader } from "@/components/layout/page-header";

export default function MembersPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="팀 멤버" description="활성 프로젝트의 팀원을 초대하고 역할을 관리하세요." />
      <MembersView />
    </div>
  );
}
