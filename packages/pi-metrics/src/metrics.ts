interface UsageMessage {
  stopReason?: string;
  usage?: {
    input?: number;
    output?: number;
    totalTokens?: number;
    cost?: { total?: number };
  };
}

function reportedUsage(message: UsageMessage): UsageMessage["usage"] {
  // Pi uses zero-filled usage when a failed or aborted request has no reported usage.
  if ((message.stopReason === "error" || message.stopReason === "aborted") && message.usage?.totalTokens === 0) {
    return undefined;
  }
  return message.usage;
}

function reportedValue(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : NaN;
}

function displayValue(value: number, format: (value: number) => string): string {
  return Number.isFinite(value) ? format(value) : "N/A";
}

function duration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours > 0 ? `${hours}h` : ""}${hours > 0 || minutes > 0 ? `${minutes}m` : ""}${seconds}s`;
}

type MetricDependency = "cost" | "input" | "output" | "requestTime" | "duration";

interface MetricDefinition {
  requires: readonly MetricDependency[];
  render: () => string;
}

function metricToken(name: string): string {
  return `<${name}>`;
}

export class TurnMetrics {
  readonly needsSpeed: boolean;
  readonly needsUsage: boolean;
  private readonly needsDuration: boolean;
  private readonly needsInput: boolean;
  private readonly needsOutput: boolean;
  private readonly needsCost: boolean;
  private readonly parts: (string | MetricDefinition)[];
  active = false;
  private started = 0;
  private requestStarted: number | undefined;
  private modelMilliseconds = 0;
  private input = 0;
  private output = 0;
  private cost = 0;

  constructor(format: string) {
    const definitions = {
      cost: {
        requires: ["cost"],
        render: () => displayValue(this.cost, (value) => `$${value.toFixed(4)}`),
      },
      tokps: {
        requires: ["output", "requestTime"],
        render: () => {
          const speed = this.modelMilliseconds > 0 ? this.output / (this.modelMilliseconds / 1000) : NaN;
          return displayValue(speed, (value) => `${value.toFixed(1)} tok/s`);
        },
      },
      timetaken: {
        requires: ["duration"],
        render: () => duration(performance.now() - this.started),
      },
      input_tokens: {
        requires: ["input"],
        render: () => displayValue(this.input, String),
      },
      output_tokens: {
        requires: ["output"],
        render: () => displayValue(this.output, String),
      },
    } satisfies Record<string, MetricDefinition>;

    const tokens = new Map(Object.entries(definitions).map(([name, definition]) => [metricToken(name), definition]));
    const pattern = new RegExp(`(${[...tokens.keys()].join("|")})`, "g");
    this.parts = format.split(pattern).map((part) => tokens.get(part) ?? part);

    const dependencies = new Set<MetricDependency>();
    for (const part of this.parts) {
      if (typeof part === "string") {
        continue;
      }
      for (const dependency of part.requires) {
        dependencies.add(dependency);
      }
    }
    this.needsSpeed = dependencies.has("requestTime");
    this.needsDuration = dependencies.has("duration");
    this.needsInput = dependencies.has("input");
    this.needsOutput = dependencies.has("output");
    this.needsCost = dependencies.has("cost");
    this.needsUsage = this.needsInput || this.needsOutput || this.needsCost;
  }

  start(): void {
    if (this.active) {
      return;
    }
    this.active = true;
    if (this.needsDuration) {
      this.started = performance.now();
    }
    this.requestStarted = undefined;
    this.modelMilliseconds = 0;
    this.input = 0;
    this.output = 0;
    this.cost = 0;
  }

  startRequest(): void {
    if (this.active && this.needsSpeed) {
      this.requestStarted = performance.now();
    }
  }

  completeRequest(message: UsageMessage): void {
    if (!this.active) {
      return;
    }
    if (this.needsSpeed) {
      this.modelMilliseconds += this.requestStarted === undefined ? NaN : performance.now() - this.requestStarted;
      this.requestStarted = undefined;
    }
    if (this.needsUsage) {
      this.recordUsage(message);
    }
  }

  private recordUsage(message: UsageMessage): void {
    const usage = reportedUsage(message);
    if (this.needsInput) {
      this.input += reportedValue(usage?.input);
    }
    if (this.needsOutput) {
      this.output += reportedValue(usage?.output);
    }
    if (this.needsCost) {
      this.cost += reportedValue(usage?.cost?.total);
    }
  }

  render(): string {
    return this.parts.map((part) => (typeof part === "string" ? part : part.render())).join("");
  }
}
