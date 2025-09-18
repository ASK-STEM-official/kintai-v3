'use server';

/**
 * @fileOverview An AI agent that flags anomalous user activity based on login/logout patterns.
 *
 * - flagAnomalousActivity - A function that flags potentially unusual activity.
 * - FlagAnomalousActivityInput - The input type for the flagAnomalousActivity function.
 * - FlagAnomalousActivityOutput - The return type for the flagAnomalousActivity function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const FlagAnomalousActivityInputSchema = z.object({
  userId: z.string().describe('The ID of the user.'),
  activityType: z.enum(['in', 'out']).describe('The type of activity (in or out).'),
  timestamp: z.string().describe('The timestamp of the activity.'),
  recentActivity: z
    .array(z.object({
      activityType: z.enum(['in', 'out']),
      timestamp: z.string(),
    }))
    .describe('Recent login/logout activity for the user.'),
});
export type FlagAnomalousActivityInput = z.infer<typeof FlagAnomalousActivityInputSchema>;

const FlagAnomalousActivityOutputSchema = z.object({
  isAnomalous: z.boolean().describe('Whether the activity is considered anomalous.'),
  reason: z.string().optional().describe('The reason why the activity is flagged as anomalous.'),
});
export type FlagAnomalousActivityOutput = z.infer<typeof FlagAnomalousActivityOutputSchema>;

export async function flagAnomalousActivity(input: FlagAnomalousActivityInput): Promise<FlagAnomalousActivityOutput> {
  return flagAnomalousActivityFlow(input);
}

const prompt = ai.definePrompt({
  name: 'flagAnomalousActivityPrompt',
  input: {schema: FlagAnomalousActivityInputSchema},
  output: {schema: FlagAnomalousActivityOutputSchema},
  prompt: `You are an expert security analyst tasked with identifying anomalous user activity.

  You are provided with a user's recent login/logout activity and the current activity.
  Determine if the current activity is anomalous based on the recent activity pattern.

  Recent Activity:
  {{#each recentActivity}}
  - Type: {{this.activityType}}, Timestamp: {{this.timestamp}}
  {{/each}}

  Current Activity:
  - Type: {{activityType}}, Timestamp: {{timestamp}}

  User ID: {{userId}}

  Consider factors such as:
  - Unexpected login/logout times.
  - Unusually frequent login/logout activity.
  - Inconsistent login/logout patterns.

  Return whether the activity is anomalous and the reasoning behind your decision.

  Output in JSON format:
  {
    "isAnomalous": true/false,
    "reason": "reason for being flagged as anomalous"
  }`,
});

const flagAnomalousActivityFlow = ai.defineFlow(
  {
    name: 'flagAnomalousActivityFlow',
    inputSchema: FlagAnomalousActivityInputSchema,
    outputSchema: FlagAnomalousActivityOutputSchema,
  },
  async input => {
    const {output} = await prompt(input, {config: {safetySettings: [{
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_NONE',
    },
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_NONE',
    }, {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_NONE',
    }, {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_NONE',
    }]}});
    return output!;
  }
);
