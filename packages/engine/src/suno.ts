import type { EngineAdapter, RenderRequest, RenderResult, RenderHooks } from "./index.ts";
import { SunoGatewayAdapter, type SunoGatewayOptions } from "@colormax/suno-gateway";

/** Suno 出歌引擎实现：本地 vendor 二次开发（@colormax/suno-gateway） */
export class SunoAdapter implements EngineAdapter {
  private gateway: SunoGatewayAdapter;
  constructor(options: SunoGatewayOptions) {
    this.gateway = new SunoGatewayAdapter(options);
  }
  render(req: RenderRequest, hooks?: RenderHooks): Promise<RenderResult> {
    return this.gateway.render(req, hooks);
  }
}
