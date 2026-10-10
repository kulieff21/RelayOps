import { useEffect, useState } from "react";
import { request, ApiError } from "./api";
import { useShop } from "./shop";

export function useData<T>(path: string | null) {
  const { session, revision, setSession } = useShop();
  const identity = `${path}:${session?.token ?? ""}:${revision}`;
  const [state, setState] = useState<{
    identity: string;
    data: T | null;
    error: string | null;
  }>({ identity: "", data: null, error: null });
  useEffect(() => {
    if (!path || !session) return;
    let current = true;
    request<T>(path, session)
      .then((data) => {
        if (current) setState({ identity, data, error: null });
      })
      .catch((error) => {
        if (
          current &&
          error instanceof ApiError &&
          error.code === "UNAUTHORIZED"
        )
          setSession(null);
        if (current)
          setState({
            identity,
            data: null,
            error: error instanceof ApiError ? error.code : "INTERNAL_ERROR",
          });
      });
    return () => {
      current = false;
    };
  }, [identity, path, session]);
  return {
    data: state.identity === identity ? state.data : null,
    error: state.identity === identity ? state.error : null,
    loading: !!path && state.identity !== identity,
  };
}
