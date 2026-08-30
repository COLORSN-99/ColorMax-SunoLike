"use client";

import { ConfigProvider, theme, Layout, Typography } from "antd";
import SongsBoard from "../components/SongsBoard";

export default function SongsPage() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorBgBase: "#0d0d0f",
          colorBgContainer: "#161618",
          colorBorder: "#2a2a2e",
          colorText: "#e8e8ea",
          fontSize: 13,
        },
      }}
    >
      <Layout style={{ minHeight: "100vh", background: "#0d0d0f" }}>
        <Layout.Content style={{ maxWidth: 1280, margin: "0 auto", padding: 24 }}>
          <div style={{ marginBottom: 8 }}>
            <a href="/" style={{ color: "#6a6acd", fontSize: 13 }}>
              ← 返回创作空间
            </a>
          </div>
          <SongsBoard />
        </Layout.Content>
      </Layout>
    </ConfigProvider>
  );
}
