import fs from 'fs';
import path from 'path';
import { UserFileRepository } from '../../repositories/user-file-repository';
import { UserFile } from '../../model/user-file';
import { createLogger } from '../../logger';
import config from '../../config';

const MAX_READ_SIZE = 1_000_000;

const logger = createLogger('file-service');

export class FileService {
  private userWorkspace: string;
  private fileRepository: UserFileRepository;

  constructor(private readonly userId: string) {
    this.userWorkspace = path.join(config.filesDir, userId);
    this.fileRepository = new UserFileRepository(userId);
    fs.mkdirSync(this.userWorkspace, { recursive: true });
  }

  listFiles(): UserFile[] {
    logger.debugInfoCall('listFiles', {}, { userId: this.userId });
    const files = this.fileRepository.findByUserId();
    logger.debugInfoRet('listFiles', { count: files.length });
    return files;
  }

  readFile(filepath: string): string {
    logger.debugInfoCall('readFile', { filepath }, { userId: this.userId });

    const resolvedPath = this.resolvePath(filepath);

    if (!fs.existsSync(resolvedPath)) {
      logger.error({ filepath }, 'readFile: file not found');
      throw new Error(`File not found: ${resolvedPath}`);
    }

    if (fs.statSync(resolvedPath).size > MAX_READ_SIZE) {
      logger.error({ filepath }, 'readFile: file too large');
      throw new Error(`File too large to read: ${resolvedPath}`);
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    logger.debugInfoRet('readFile', { filepath, length: content.length });
    return content;
  }

  writeFile(filepath: string, content: string | Buffer): string {
    logger.debugInfoCall('writeFile', { filepath }, { userId: this.userId, length: content.length });

    const resolvedPath = this.resolvePath(filepath);
    // No explicit encoding — Node defaults a string to utf8 and ignores encoding for a
    // Buffer, so this writes both text and binary content (e.g. a generated PDF) correctly.
    fs.writeFileSync(resolvedPath, content);

    const filename = path.basename(filepath);
    const existing = this.fileRepository.findByFilename(filename);

    if (existing) {
      this.fileRepository.update(existing.id, resolvedPath);
    } else {
      this.fileRepository.create(filename, resolvedPath);
    }

    logger.debugInfoRet('writeFile', { resolvedPath });
    return resolvedPath;
  }

  resolvePath(filepath: string): string {
    return path.join(this.userWorkspace, path.basename(filepath));
  }
}
