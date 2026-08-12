import { Tool } from '../tool';
import { FileService } from '../../service/file/file-service';

export function makeWriteFileTool(fileService: FileService): Tool {
  return new Tool(
    'write_file',
    "Write text content to a file. Files are saved to the user's workspace. Useful for saving summaries, notes, or results.",
    {
      filename: { type: 'string', description: "The filename to write to (e.g. 'summary.txt'). No path needed." },
      content: { type: 'string', description: 'The text content to write to the file.' },
    },
    (args: Record<string, any>) => {
      const filename = args['filename'] as string;
      const content = args['content'] as string;

      try {
        fileService.writeFile(filename, content);
        // Raw JSON, not prose with an embedded <a> tag — chat bubbles render plain escaped
        // text (see chat-panel.component.html), so HTML here would show as literal text, not
        // a link. chatbot-service.ts's applyAuthoritativeFile() parses this to attach a real,
        // clickable download link (same convention generate_itinerary_pdf uses).
        return JSON.stringify({ filename, url: `/api/chatbot/files/${encodeURIComponent(filename)}` });
      } catch (e) {
        return `Error writing file: ${e}`;
      }
    },
  );
}
