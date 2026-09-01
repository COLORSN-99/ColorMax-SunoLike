"use client";

import { ConfigProvider } from "antd";
import { cmTheme } from "./theme";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ConfigProvider theme={cmTheme}>{children}</ConfigProvider>;
}
