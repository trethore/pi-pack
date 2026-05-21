import type { LifecycleConfig, ServerConfig } from '#src/config/schema.js';
import type { McpServerManager } from '#src/core/server-manager.js';

export class McpLifecycleManager {
  private readonly servers = new Map<string, ServerConfig>();
  private readonly keepAliveServers = new Map<string, ServerConfig>();
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(
    private readonly manager: McpServerManager,
    private readonly config: LifecycleConfig,
    private readonly onConnectionChanged: (serverName: string) => void
  ) {}

  registerServer(name: string, definition: ServerConfig): void {
    this.servers.set(name, definition);
    if (definition.lifecycle === 'keep-alive') this.keepAliveServers.set(name, definition);
  }

  start(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(() => {
      this.checkConnections().catch((error: unknown) => {
        console.error('pi-tiny-mcp lifecycle check failed:', error);
      });
    }, this.config.healthCheckSeconds * 1000);
    this.healthCheckInterval.unref();
  }

  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    this.healthCheckInterval = undefined;
    await this.manager.closeAll();
  }

  private async checkConnections(): Promise<void> {
    await Promise.all([this.reconnectKeepAliveServers(), this.closeIdleServers()]);
  }

  private async reconnectKeepAliveServers(): Promise<void> {
    for (const [name, definition] of this.keepAliveServers) {
      const connection = this.manager.getConnection(name);
      if (connection?.status === 'connected') continue;

      try {
        await this.manager.connect(name, definition);
        this.onConnectionChanged(name);
      } catch (error) {
        console.error(`pi-tiny-mcp failed to reconnect ${name}:`, error);
      }
    }
  }

  private async closeIdleServers(): Promise<void> {
    for (const [name, definition] of this.servers) {
      if (this.keepAliveServers.has(name)) continue;
      const timeoutMinutes = definition.idleTimeoutMinutes ?? this.config.idleTimeoutMinutes;
      if (timeoutMinutes <= 0) continue;
      if (!this.manager.isIdle(name, timeoutMinutes * 60 * 1000)) continue;

      await this.manager.close(name);
      this.onConnectionChanged(name);
    }
  }
}
