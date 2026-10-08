// "use server" 파일(auth-actions.ts)은 async 함수만 export할 수 있으므로,
// useFormState가 참조하는 상태 타입/초기값은 별도 모듈에 둔다.
export interface AuthFormState {
  error: string | null;
  message: string | null;
}

export const INITIAL_AUTH_FORM_STATE: AuthFormState = { error: null, message: null };
