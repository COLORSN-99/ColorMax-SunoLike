import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { SunoGatewayAdapter, SunoQuotaError } from "../src/adapter.ts";

describe("SunoGatewayAdapter - extracted helpers", () => {
  describe("checkQuota", () => {
    it("should return credits when sufficient", async () => {
      const adapter = new SunoGatewayAdapter({ cookies: ["test"], publicDir: "/tmp" });
      const mockApi = {
        get_credits: mock.fn(() => Promise.resolve({ credits_left: 100 })),
      };
      const result = await (adapter as any).checkQuota(mockApi);
      assert.equal(result.credits_left, 100);
      assert.equal(mockApi.get_credits.mock.calls.length, 1);
    });

    it("should throw SunoQuotaError when credits exhausted", async () => {
      const adapter = new SunoGatewayAdapter({ cookies: ["test"], publicDir: "/tmp" });
      const mockApi = {
        get_credits: mock.fn(() => Promise.resolve({ credits_left: 0 })),
      };
      await assert.rejects(
        async () => await (adapter as any).checkQuota(mockApi),
        (err: Error) => {
          assert(err instanceof SunoQuotaError);
          assert.match(err.message, /配额耗尽/);
          return true;
        }
      );
    });

    it("should throw SunoQuotaError when credits negative", async () => {
      const adapter = new SunoGatewayAdapter({ cookies: ["test"], publicDir: "/tmp" });
      const mockApi = {
        get_credits: mock.fn(() => Promise.resolve({ credits_left: -5 })),
      };
      await assert.rejects(
        async () => await (adapter as any).checkQuota(mockApi),
        SunoQuotaError
      );
    });
  });

  describe("buildGenerationParams", () => {
    it("should build correct prompt and tags", () => {
      const adapter = new SunoGatewayAdapter({ cookies: ["test"], publicDir: "/tmp" });
      const req = {
        title: "测试歌曲",
        lyrics: ["第一句", "第二句"],
        arrangement: {
          key: "C",
          bpm: 120,
          chordProgression: ["C", "G", "Am", "F"],
          groove: "流行摇滚",
        },
        seed: 12345,
        durationSec: 180,
      };

      const result = (adapter as any).buildGenerationParams(req);

      assert.equal(result.tags, "流行摇滚、C调、C、G、Am、F");
      assert.match(result.prompt, /第一句\n第二句/);
      assert.match(result.prompt, /调性=C/);
      assert.match(result.prompt, /速度=120bpm/);
      assert.match(result.prompt, /节奏型=流行摇滚/);
      assert.match(result.prompt, /目标时长≈180s/);
    });

    it("should handle empty chord progression", () => {
      const adapter = new SunoGatewayAdapter({ cookies: ["test"], publicDir: "/tmp" });
      const req = {
        title: "简单歌曲",
        lyrics: ["歌词"],
        arrangement: {
          key: "D",
          bpm: 90,
          chordProgression: [],
          groove: "民谣",
        },
        seed: 67890,
        durationSec: 120,
      };

      const result = (adapter as any).buildGenerationParams(req);

      assert.equal(result.tags, "民谣、D调");
      assert.match(result.prompt, /歌词/);
    });
  });

  describe("confirmComplete", () => {
    it("should return completed song", async () => {
      const adapter = new SunoGatewayAdapter({ cookies: ["test"], publicDir: "/tmp" });
      const completedSong = { id: "song123", status: "complete", duration: 180 };
      const mockApi = {
        get: mock.fn(() => Promise.resolve([completedSong])),
      };

      const result = await (adapter as any).confirmComplete(mockApi, "song123");

      assert.equal(result.id, "song123");
      assert.equal(result.status, "complete");
      assert.equal(mockApi.get.mock.calls.length, 1);
      assert.deepEqual(mockApi.get.mock.calls[0]?.arguments[0], ["song123"]);
    });

    it("should throw when song not complete", async () => {
      const adapter = new SunoGatewayAdapter({ cookies: ["test"], publicDir: "/tmp" });
      const mockApi = {
        get: mock.fn(() => Promise.resolve([{ id: "song123", status: "streaming" }])),
      };

      await assert.rejects(
        async () => await (adapter as any).confirmComplete(mockApi, "song123"),
        (err: Error) => {
          assert.match(err.message, /音频未就绪/);
          return true;
        }
      );
    });

    it("should throw when no songs returned", async () => {
      const adapter = new SunoGatewayAdapter({ cookies: ["test"], publicDir: "/tmp" });
      const mockApi = {
        get: mock.fn(() => Promise.resolve([])),
      };

      await assert.rejects(
        async () => await (adapter as any).confirmComplete(mockApi, "song123"),
        /音频未就绪/
      );
    });

    it("should find complete song among multiple", async () => {
      const adapter = new SunoGatewayAdapter({ cookies: ["test"], publicDir: "/tmp" });
      const songs = [
        { id: "song1", status: "streaming" },
        { id: "song2", status: "complete", duration: 200 },
        { id: "song3", status: "error" },
      ];
      const mockApi = {
        get: mock.fn(() => Promise.resolve(songs)),
      };

      const result = await (adapter as any).confirmComplete(mockApi, "song2");

      assert.equal(result.id, "song2");
      assert.equal(result.status, "complete");
    });
  });

  describe("executeGeneration", () => {
    it("should call api.custom_generate with correct params", async () => {
      const adapter = new SunoGatewayAdapter({ cookies: ["test"], publicDir: "/tmp" });
      const mockSongs = [
        { id: "song1", status: "complete" },
        { id: "song2", status: "complete" },
      ];
      const mockApi = {
        custom_generate: mock.fn(() => Promise.resolve(mockSongs)),
      };
      const params = { prompt: "test prompt", tags: "tag1、tag2", title: "测试" };
      const emittedEvents: any[] = [];
      const emit = (evt: any) => emittedEvents.push(evt);

      const result = await (adapter as any).executeGeneration(mockApi, params, "call123", emit);

      assert.equal(result.length, 2);
      assert.equal(result[0]?.id, "song1");
      assert.equal(mockApi.custom_generate.mock.calls.length, 1);
      const args = mockApi.custom_generate.mock.calls[0]?.arguments;
      assert.equal(args[0], "test prompt");
      assert.equal(args[1], "tag1、tag2");
      assert.equal(args[2], "测试");
    });

    it("should emit progress events via onPoll callback", async () => {
      const adapter = new SunoGatewayAdapter({ cookies: ["test"], publicDir: "/tmp" });
      let pollCallback: any = null;
      const mockApi = {
        custom_generate: mock.fn((...args: any[]) => {
          pollCallback = args[7];
          return Promise.resolve([]);
        }),
      };
      const params = { prompt: "test", tags: "test", title: "test" };
      const emittedEvents: any[] = [];
      const emit = (evt: any) => emittedEvents.push(evt);

      await (adapter as any).executeGeneration(mockApi, params, "call123", emit);

      assert(pollCallback !== null, "onPoll callback should be captured");

      pollCallback(
        [
          { id: "song1", status: "complete" },
          { id: "song2", status: "streaming" },
        ],
        5000
      );

      assert.equal(emittedEvents.length, 1);
      assert.equal(emittedEvents[0]?.type, "suno_progress");
      assert.equal(emittedEvents[0]?.callId, "call123");
      assert.equal(emittedEvents[0]?.done, 1);
      assert.equal(emittedEvents[0]?.total, 2);
      assert.equal(emittedEvents[0]?.status, "streaming");
      assert.equal(emittedEvents[0]?.elapsedMs, 5000);
    });
  });

  describe("downloadEncrypted", () => {
    it("should download and return Uint8Array", async () => {
      const adapter = new SunoGatewayAdapter({ cookies: ["test"], publicDir: "/tmp" });
      const mockBuffer = new ArrayBuffer(1024);
      const mockTransport = {
        get: mock.fn(() => Promise.resolve({ data: mockBuffer })),
      };
      (adapter as any).opts.transport = mockTransport;

      const result = await (adapter as any).downloadEncrypted("https://example.com/audio.m4a");

      assert(result instanceof Uint8Array);
      assert.equal(result.byteLength, 1024);
      assert.equal(mockTransport.get.mock.calls.length, 1);
      assert.equal(mockTransport.get.mock.calls[0]?.arguments[0], "https://example.com/audio.m4a");
      assert.equal(mockTransport.get.mock.calls[0]?.arguments[1].responseType, "arraybuffer");
      assert.equal(mockTransport.get.mock.calls[0]?.arguments[1].timeout, 60_000);
    });
  });

  describe("saveAudioFile", () => {
    it("should generate correct filename and return path", async () => {
      const adapter = new SunoGatewayAdapter({ cookies: ["test"], publicDir: "/tmp/test-audio" });
      const mockData = new Uint8Array([1, 2, 3, 4]);

      const result = await (adapter as any).saveAudioFile(mockData, "我的歌曲!@#", 12345, "m4a");

      assert.match(result, /^\/generated\//);
      assert.match(result, /suno_我的歌曲.*12345\.m4a$/);
      assert(result.includes("12345"));
    });

    it("should sanitize filename with special characters", async () => {
      const adapter = new SunoGatewayAdapter({ cookies: ["test"], publicDir: "/tmp/test-audio" });
      const mockData = new Uint8Array([1, 2, 3]);

      const result = await (adapter as any).saveAudioFile(
        mockData,
        "song/with\\special:chars*<>|?",
        99999,
        "mp3"
      );

      assert.match(result, /^\/generated\/suno_song.*99999\.mp3$/);
      assert(result.includes("99999"));
      
      const fileName = result.split("/").pop()!;
      assert(!fileName.includes("\\"));
      assert(!fileName.includes(":"));
      assert(!fileName.includes("*"));
      assert(!fileName.includes("<"));
      assert(!fileName.includes(">"));
      assert(!fileName.includes("|"));
      assert(!fileName.includes("?"));
    });

    it("should truncate long titles", async () => {
      const adapter = new SunoGatewayAdapter({ cookies: ["test"], publicDir: "/tmp/test-audio" });
      const mockData = new Uint8Array([1]);
      const longTitle = "这是一个非常非常非常非常长的标题".repeat(5);

      const result = await (adapter as any).saveAudioFile(mockData, longTitle, 111, "m4a");

      const fileName = result.split("/").pop()!;
      assert(fileName.length < longTitle.length + 20);
    });
  });
});
