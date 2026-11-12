const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'suspended', 'blocked']).optional(),
});

const adminTransactionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['CREDIT', 'DEBIT']).optional(),
  currency: z.enum(['ves', 'sves', 'gems', 'tokens', 'spins']).optional(),
});

const userIdParam = z.object({ userId: objectId }).strict();
const userStatusSchema = z.object({
  accountStatus: z.enum(['active', 'suspended', 'blocked']),
}).strict();

module.exports = {
  adminListQuerySchema,
  adminTransactionQuerySchema,
  userIdParam,
  userStatusSchema,
};
