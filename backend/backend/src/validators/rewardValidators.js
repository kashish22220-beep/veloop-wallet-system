const { z } = require('zod');

const referralSchema = z.object({
  referralCode: z.string().trim().min(6).max(20),
}).strict();

module.exports = { referralSchema };
