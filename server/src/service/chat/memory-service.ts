import { UserMemoryRepository } from '../../repositories/user-memory-repository';
import { UserMemory } from '../../model/user-memory';
import { createLogger } from '../../logger';

const logger = createLogger('memory-service');

export class MemoryService {
  private userMemoryRepository: UserMemoryRepository;

  constructor(private readonly userId: string) {
    this.userMemoryRepository = new UserMemoryRepository(userId);
  }

  writeMemory(memory: string): UserMemory {
    logger.debugInfoCall('writeMemory', {}, { userId: this.userId, memory });
    const result = this.userMemoryRepository.create(memory);
    logger.debugInfoRet('writeMemory', { id: result.id });
    return result;
  }

  readMemories(): UserMemory[] {
    logger.debugInfoCall('readMemories', {}, { userId: this.userId });
    const memories = this.userMemoryRepository.findByUserId();
    logger.debugInfoRet('readMemories', { count: memories.length });
    return memories;
  }
}
