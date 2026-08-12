import { Tool } from './tool';

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  get toolNames(): string[] {
    return [...this.tools.keys()];
  }

  toOllamaTools(): object[] {
    return [...this.tools.values()].map(t => t.toOllamaSchema());
  }
}
