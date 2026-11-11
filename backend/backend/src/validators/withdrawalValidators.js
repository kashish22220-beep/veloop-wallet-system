const { z } = require('zod');

// NOTE: no amount / VEs / payout value here on purpose.
// The client only says WHICH option; the backend looks up the real numbers.
// .strict() makes any extra field (like "amount") a 400 error.
const createWithdrawalSchema = z
  .object({
    method: z.string().regex(/^[a-z_]{2,30}$/, 'Invalid payout method'),
    optionId: z.string().regex(/^[a-z0-9_]{2,60}$/, 'Invalid payout option'),
    payoutDetails: z.record(z.string().max(254)),
  })
  .strict();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
});

const withdrawalIdParam = z.object({
  withdrawalId: z.string().regex(/^wd_[0-9a-fA-F-]{36}$/, 'Invalid withdrawal id'),
});

const methodParam = z.object({
  method: z.string().regex(/^[a-z_]{2,30}$/, 'Invalid payout method'),
});

const adminStatusSchema = z
  .object({
    status: z.enum(['PROCESSING', 'APPROVED', 'REJECTED']),
    rejectionReason: z.string().trim().min(3).max(300).optional(),
    reviewNote: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((d) => d.status !== 'REJECTED' || !!d.rejectionReason, {
    message: 'rejectionReason is required when rejecting',
    path: ['rejectionReason'],
  });

const optionIdParam = z.object({
  optionId: z.string().regex(/^[a-z0-9_]{2,60}$/, 'Invalid payout option'),
});

const updateOptionSchema = z
  .object({
    active: z.boolean().optional(),
    requiredAmount: z.number().int().positive().max(100000000).optional(),
    payoutValue: z.number().positive().max(1000000).optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

module.exports = {
  createWithdrawalSchema,
  listQuerySchema,
  withdrawalIdParam,
  methodParam,
  adminStatusSchema,
  optionIdParam,
  updateOptionSchema,
};
