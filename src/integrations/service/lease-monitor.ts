export interface ServiceScheduler {
  setInterval(callback: () => void, milliseconds: number): unknown;
  clearInterval(handle: unknown): void;
}

export const nodeServiceScheduler: ServiceScheduler = {
  setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
};

export interface LeaseMonitorOptions {
  readonly inspect: () => Promise<void>;
  readonly intervalMilliseconds?: number;
  readonly scheduler?: ServiceScheduler;
  readonly onError?: (error: unknown) => void;
}

export class LeaseMonitor {
  private handle: unknown;
  private inspecting = false;
  private readonly scheduler: ServiceScheduler;

  constructor(private readonly options: LeaseMonitorOptions) {
    this.scheduler = options.scheduler ?? nodeServiceScheduler;
  }

  start(): void {
    if (this.handle !== undefined) return;
    this.handle = this.scheduler.setInterval(
      () => void this.inspect(),
      this.options.intervalMilliseconds ?? 1_000,
    );
  }

  stop(): void {
    if (this.handle === undefined) return;
    this.scheduler.clearInterval(this.handle);
    this.handle = undefined;
  }

  async inspect(): Promise<void> {
    if (this.inspecting) return;
    this.inspecting = true;
    try {
      await this.options.inspect();
    } catch (error: unknown) {
      this.options.onError?.(error);
    } finally {
      this.inspecting = false;
    }
  }
}
