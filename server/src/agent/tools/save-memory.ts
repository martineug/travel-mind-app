import { Tool } from '../tool';
import { MemoryService } from '../../service/chat/memory-service';

export function makeSaveMemoryTool(memoryService: MemoryService): Tool {
  return new Tool(
    'save_memory',
    'Save a memory about the user for future reference. Use this when the user asks you to remember something.',
    {
      memory: { type: 'string', description: 'The fact or preference to remember.' },
    },
    (args: Record<string, any>) => {
      const memory = args['memory'] as string;
      memoryService.writeMemory(memory);
      return `Memory saved: ${memory}`;
    },
  );
}
