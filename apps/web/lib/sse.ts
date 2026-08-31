/** SSE 帧解析（纯函数，可测）：喂入累积缓冲，返回完整帧与余量 */
export interface SseFrame {
  id?: string;
  event: string;
  data: string;
}

export function parseSseBuffer(buf: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  let rest = buf;
  let idx: number;
  while ((idx = rest.indexOf("\n\n")) !== -1) {
    const block = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let event = "message";
    let id: string | undefined;
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      else if (line.startsWith("id:")) id = line.slice(3).trim();
    }
    if (dataLines.length) frames.push({ id, event, data: dataLines.join("\n") });
  }
  return { frames, rest };
}
