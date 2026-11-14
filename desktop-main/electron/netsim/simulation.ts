export type SimulatedFailure = "timeout" | "blocked";

export interface NetSimulation {
  youtube: SimulatedFailure | null;
  refuseStreams: boolean;
  iris: SimulatedFailure | null;
  country: string | null;
  irisOrigins: string[];
}

const SCENARIOS: Record<string, Partial<NetSimulation>> = {
  "youtube-timeout": { youtube: "timeout" },
  "youtube-blocked": { youtube: "blocked" },
  "youtube-refused": { refuseStreams: true },
  "iris-timeout": { iris: "timeout" },
  "iris-down": { iris: "blocked" },
};

export const SIMULATION_SCENARIOS = Object.keys(SCENARIOS);

const YOUTUBE_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "googlevideo.com",
  "ytimg.com",
  "ggpht.com",
];

const IRIS_DOMAINS = ["tryliner.fun"];

const COUNTRY_RE = /^[A-Z]{2}$/;

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.trim()).origin;
  } catch {
    return null;
  }
}

export function parseNetSimulation(env: {
  IRIS_SIMULATE?: string;
  IRIS_SIMULATE_COUNTRY?: string;
  VITE_API_URL?: string;
}): NetSimulation | null {
  const names = (env.IRIS_SIMULATE ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const unknown = names.filter((name) => !(name in SCENARIOS));
  if (unknown.length > 0)
    throw new Error(
      `unknown IRIS_SIMULATE scenario: ${unknown.join(", ")} (use ${SIMULATION_SCENARIOS.join(", ")})`,
    );
  if (names.length === 0) return null;
  const sim: NetSimulation = {
    youtube: null,
    refuseStreams: false,
    iris: null,
    country: null,
    irisOrigins: [],
  };
  for (const name of names) Object.assign(sim, SCENARIOS[name]);
  const country = env.IRIS_SIMULATE_COUNTRY?.trim().toUpperCase();
  if (country && COUNTRY_RE.test(country)) sim.country = country;
  const apiOrigin = originOf(env.VITE_API_URL);
  if (apiOrigin) sim.irisOrigins.push(apiOrigin);
  return sim;
}

function onDomain(host: string, domains: string[]): boolean {
  return domains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

export function simulatedFailureFor(
  url: string,
  sim: NetSimulation,
): SimulatedFailure | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (sim.youtube && onDomain(parsed.hostname, YOUTUBE_DOMAINS))
    return sim.youtube;
  if (
    sim.iris &&
    (onDomain(parsed.hostname, IRIS_DOMAINS) ||
      sim.irisOrigins.includes(parsed.origin))
  )
    return sim.iris;
  return null;
}

const REFUSED_STATUS_LINE = "HTTP/1.1 403 Forbidden";

export function simulatedStatusLine(
  url: string,
  method: string,
  sim: NetSimulation,
): string | null {
  if (!sim.refuseStreams || method === "OPTIONS") return null;
  try {
    return onDomain(new URL(url).hostname, ["googlevideo.com"])
      ? REFUSED_STATUS_LINE
      : null;
  } catch {
    return null;
  }
}

export function describeNetSimulation(sim: NetSimulation): string {
  const parts = [
    sim.youtube ? `youtube ${sim.youtube}` : null,
    sim.refuseStreams ? "youtube streams refused" : null,
    sim.iris ? `iris ${sim.iris === "blocked" ? "down" : sim.iris}` : null,
    sim.country ? `country ${sim.country}` : null,
  ].filter(Boolean);
  return parts.join(", ");
}
