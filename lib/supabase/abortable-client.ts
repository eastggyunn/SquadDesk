import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

type Client = SupabaseClient<Database>;

/**
 * 이 클라이언트로 만드는 모든 from()/rpc() 쿼리에 signal을 붙인다 — signal이 abort되면
 * 진행 중인 fetch가 실제로 취소된다. repository 함수 시그니처에 signal을 일일이 넘기지
 * 않기 위한 래퍼다(enrichTasks·buildActivityEntries처럼 후속 조회가 여러 단계인 경로까지
 * 한 번에 덮는다).
 *
 * postgrest-js는 signal을 최종 필터 빌더(select/insert 등이 돌려주는 객체)에서 읽고, 그 뒤
 * eq/order/in 같은 체인 메서드는 같은 빌더(this)를 돌려주므로 처음 한 번만 붙이면 유지된다.
 * 조회 전용 경로에만 쓴다 — 쓰기 요청을 중간에 끊으면 반영 여부가 애매해진다.
 */
export function withAbortSignal(client: Client, signal: AbortSignal): Client {
  const attach = <T>(builder: T): T => {
    const candidate = builder as { abortSignal?: (signal: AbortSignal) => T };
    return typeof candidate?.abortSignal === "function" ? candidate.abortSignal(signal) : builder;
  };

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "rpc") {
        return (...args: Parameters<Client["rpc"]>) => attach(target.rpc(...args));
      }
      if (prop === "from") {
        return (table: string) =>
          new Proxy(target.from(table as never), {
            get(queryBuilder, method, qbReceiver) {
              const value = Reflect.get(queryBuilder, method, qbReceiver);
              if (typeof value !== "function") return value;
              return (...args: unknown[]) => attach(value.apply(queryBuilder, args));
            },
          });
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
