import { describe, expect, it } from "vitest";
import { featuredFallback, musicFallback, parseM3U } from "./Home";

describe("worldwide free channel catalog", () => {
  it("includes SABC 1 and National Geographic featured feeds", () => {
    expect(featuredFallback.some((channel) => channel.name === "SABC 1")).toBe(true);
    expect(featuredFallback.some((channel) => channel.name === "National Geographic")).toBe(true);
    expect(featuredFallback.some((channel) => channel.name === "National Geographic Wild")).toBe(true);
  });

  it("includes Trace and other music-TV seeds", () => {
    expect(musicFallback.some((channel) => channel.name === "Trace Africa")).toBe(true);
    expect(musicFallback.some((channel) => channel.name === "Trace Naija")).toBe(true);
    expect(musicFallback.every((channel) => channel.group === "Music")).toBe(true);
  });

  it("parses channel metadata and stream URLs from M3U", () => {
    const result = parseM3U(`#EXTM3U\n#EXTINF:-1 tvg-id="SABC1.za@SD" tvg-logo="https://example.com/sabc.png" group-title="News",SABC 1\nhttps://example.com/sabc.m3u8`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "SABC 1",
      group: "News",
      logo: "https://example.com/sabc.png",
      url: "https://example.com/sabc.m3u8",
      isLive: true,
    });
  });
});
