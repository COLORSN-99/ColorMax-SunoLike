import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ColorMax · SunoWeb Alternative",
  description: "一句话，一首歌。多 Agent 联合编曲（MVP Demo）",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
