import { Tool } from '../tool';
import { FileService } from '../../service/file/file-service';

/** Returns raw JSON (not prose) — chatbot-service.ts's applyAuthoritativeFiles() parses this
 *  to attach real download links, same reasoning as generate_itinerary_pdf's file field: the
 *  model can't be trusted to echo a URL verbatim. */
export function makeListFilesTool(fileService: FileService): Tool {
  return new Tool(
    'list_files',
    "List all files in the user's workspace (name only — the app attaches download links itself). Useful for listing files to answer file related questions.",
    {},
    () => {
      const files = fileService.listFiles();
      return JSON.stringify(files.map(f => ({
        filename: f.filename,
        url: `/api/chatbot/files/${encodeURIComponent(f.filename)}`,
      })));
    },
  );
}
