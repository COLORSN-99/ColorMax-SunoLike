"use client";

import { Layout } from "antd";
import SongsBoard from "../components/SongsBoard";

export default function SongsPage() {
  return (
    <Layout style={{ minHeight: "100vh", background: "transparent" }}>
      <Layout.Content style={{ maxWidth: 1280, margin: "0 auto", padding: 28 }}>
        <div style={{ marginBottom: 14 }}>
          <a href="/" style={{ color: "#b9ab9f", fontSize: 12 }}>← 回控制台</a>
        </div>
        <SongsBoard />
      </Layout.Content>
    </Layout>
  );
}
