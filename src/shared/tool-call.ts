import { z } from "zod";

// The application accepts normalized function calls, never arbitrary executables.
export const toolCallSchema = z.strictObject({
  id: z.string().min(1).max(200),
  type: z.literal("function"),
  function: z.strictObject({
    name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
    arguments: z.string().max(16000),
  }),
});
export type ToolCall<Name extends string = string> = Omit<
  z.infer<typeof toolCallSchema>,
  "function"
> & {
  function: { name: Name; arguments: string };
};
