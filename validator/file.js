import { z } from 'zod';
export const uploadFileSchema = z.object({
  fileName: z.string().trim().min(1).max(255),

  fileSize: z.number().positive(),

  fileType: z.string(),
  folderId: z.string().nullable().optional(),
});
