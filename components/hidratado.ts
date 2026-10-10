"use client";

import { useSyncExternalStore } from "react";

/** false no servidor e antes de a página ficar interativa; true depois. Evita envios "perdidos" por clique precoce. */
export const useHidratado = () => useSyncExternalStore(() => () => {}, () => true, () => false);
