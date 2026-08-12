import { Tool } from '../tool';
import { FileService } from '../../service/file/file-service';

export function makeReadFileTool(fileService: FileService): Tool {
  return new Tool(
    'read_file',
    'Read the contents of a local file. Useful for answering questions about documents or files.',
    {
      filename: { type: 'string', description: 'The name of a file to read.' },
    },
    (args: Record<string, any>) => {
      const filename = args['filename'] as string;

      try {
        const content = fileService.readFile(filename);
        return `Contents of ${filename}:\n\n${content}`;
      } catch (e) {
        return `Error reading file: ${e}`;
      }
    },
  );
}
