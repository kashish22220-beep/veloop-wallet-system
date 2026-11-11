const { z } = require('zod');
const {
  CURRENCY_LIST,
  ADMIN_CREDIT_SOURCES,
  ADMIN_DEBIT_SOURCES,
  MAX_AMOUNT,
} = require('../config/constants');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const transactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  currency: z.enum(CURRENCY_LIST).optional(),
  type: z.enum(['CREDIT', 'DEBIT']).optional(),
});

const adminBase = {
  userId: objectId,
  currency: z.enum(CURRENCY_LIST),
  amount: z.number().int().positive().max(MAX_AMOUNT),
  description: z.string().trim().min(3).max(300),
  // Required so a retried admin request can never apply twice
  idempotencyKey: z.string().trim().min(8).max(100),
};

const adminCreditSchema = z
  .object({ ...adminBase, source: z.enum(ADMIN_CREDIT_SOURCES).default('ADMIN_CREDIT') })
  .strict();

const adminDebitSchema = z
  .object({ ...adminBase, source: z.enum(ADMIN_DEBIT_SOURCES).default('ADMIN_DEBIT') })
  .strict();

module.exports = { transactionsQuerySchema, adminCreditSchema, adminDebitSchema };
