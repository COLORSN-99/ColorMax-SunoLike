import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Providers from "./providers";

const display = localFont({
  src: [
    { path: "./fonts/InstrumentSerif-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/InstrumentSerif-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-display",
  display: "swap",
});
const ui = localFont({
  src: [{ path: "./fonts/SpaceGrotesk-wght.woff2", weight: "300 700", style: "normal" }],
  variable: "--font-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ColorMax · Studio Machine",
  description: "一句话，一首歌。模拟录音台质感的 AI 编曲工作站",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${display.variable} ${ui.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
