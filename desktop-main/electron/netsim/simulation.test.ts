import { describe, expect, it } from "vitest";
import {
  describeNetSimulation,
  parseNetSimulation,
  simulatedFailureFor,
  simulatedStatusLine,
} from "./simulation";

describe("parseNetSimulation", () => {
  it("is off without IRIS_SIMULATE", () => {
    expect(parseNetSimulation({})).toBeNull();
    expect(parseNetSimulation({ IRIS_SIMULATE: " , " })).toBeNull();
  });

  it("combines scenarios and reads the country override", () => {
    const sim = parseNetSimulation({
      IRIS_SIMULATE: "youtube-blocked, Iris-Timeout",
      IRIS_SIMULATE_COUNTRY: "ru",
    });
    expect(sim).toEqual({
      youtube: "blocked",
      refuseStreams: false,
      iris: "timeout",
      country: "RU",
      irisOrigins: [],
    });
    expect(describeNetSimulation(sim!)).toBe(
      "youtube blocked, iris timeout, country RU",
    );
  });

  it("rejects typos instead of silently simulating nothing", () => {
    expect(() => parseNetSimulation({ IRIS_SIMULATE: "yt-down" })).toThrow(
      /unknown IRIS_SIMULATE scenario: yt-down/,
    );
  });

  it("ignores a malformed country", () => {
    expect(
      parseNetSimulation({
        IRIS_SIMULATE: "youtube-blocked",
        IRIS_SIMULATE_COUNTRY: "Russia",
      })?.country,
    ).toBeNull();
  });
});

describe("simulatedFailureFor", () => {
  const youtubeDown = parseNetSimulation({
    IRIS_SIMULATE: "youtube-timeout",
  })!;
  const irisDown = parseNetSimulation({
    IRIS_SIMULATE: "iris-down",
    VITE_API_URL: "http://localhost:1337/",
  })!;

  it("fails every youtube host and nothing else", () => {
    for (const url of [
      "https://www.youtube.com/generate_204",
      "https://music.youtube.com/youtubei/v1/player",
      "https://rr3---sn-abc.googlevideo.com/videoplayback?id=1",
      "https://i.ytimg.com/vi/abc/hqdefault.jpg",
      "https://yt3.ggpht.com/avatar",
    ])
      expect(simulatedFailureFor(url, youtubeDown)).toBe("timeout");
    for (const url of [
      "https://www.google.com/generate_204",
      "https://cloudflare.com/cdn-cgi/trace",
      "https://api.tryliner.fun/health",
      "https://notyoutube.com/",
      "iris-local://track/1",
    ])
      expect(simulatedFailureFor(url, youtubeDown)).toBeNull();
  });

  it("fails iris hosts and the configured dev api, but not the dev server", () => {
    expect(
      simulatedFailureFor("https://api.tryliner.fun/v1/me", irisDown),
    ).toBe("blocked");
    expect(
      simulatedFailureFor("https://covers.tryliner.fun/x.jpg", irisDown),
    ).toBe("blocked");
    expect(
      simulatedFailureFor("http://localhost:1337/v1/search", irisDown),
    ).toBe("blocked");
    expect(
      simulatedFailureFor("http://localhost:5173/src/main.tsx", irisDown),
    ).toBeNull();
    expect(
      simulatedFailureFor("https://www.youtube.com/generate_204", irisDown),
    ).toBeNull();
  });
});

describe("simulatedStatusLine", () => {
  const refused = parseNetSimulation({ IRIS_SIMULATE: "youtube-refused" })!;

  it("answers 403 to googlevideo streams only", () => {
    expect(
      simulatedStatusLine(
        "https://rr1---sn-x.googlevideo.com/videoplayback?range=0-1",
        "GET",
        refused,
      ),
    ).toBe("HTTP/1.1 403 Forbidden");
    expect(
      simulatedStatusLine(
        "https://music.youtube.com/youtubei/v1/player",
        "POST",
        refused,
      ),
    ).toBeNull();
    expect(
      simulatedStatusLine(
        "https://rr1---sn-x.googlevideo.com/videoplayback",
        "OPTIONS",
        refused,
      ),
    ).toBeNull();
  });

  it("leaves youtube reachable so only playback is refused", () => {
    expect(
      simulatedFailureFor("https://www.youtube.com/generate_204", refused),
    ).toBeNull();
  });
});
