const { z } = require('zod');

const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).max(100),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(100),
  })
  .strict();

module.exports = { registerSchema, loginSchema };
