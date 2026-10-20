import { Suspense } from "react";
import { BuildsView } from "@/components/builds/builds-view";

export default function BuildsPage() {
  // BuildsView가 설치 콜백의 ?connect= / ?github= 를 useSearchParams로 읽는다.
  return (
    <Suspense>
      <BuildsView />
    </Suspense>
  );
}
