import { createContext, useContext } from "react";

export interface LayoutContextValue {
  notifOpen: boolean;
  setNotifOpen: (open: boolean) => void;
  notifCount: number;
  isAdmin: boolean;
}

export const LayoutContext = createContext<LayoutContextValue>({
  notifOpen: false,
  setNotifOpen: () => {},
  notifCount: 0,
  isAdmin: false,
});

export function useLayout() {
  return useContext(LayoutContext);
}
