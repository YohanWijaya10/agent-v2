import OpenAI from 'openai';
import { tools } from '../agent/tools';
import { handleToolCall } from '../agent/handlers';
import { systemPrompt } from '../agent/prompts';
import { ChatMessage, ChatResponse } from '../types';

class DeepSeekService {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not set in environment variables');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com'
    });
  }

  async chat(userMessage: string, conversationHistory: ChatMessage[] = []): Promise<ChatResponse> {
    try {
      // Build messages array
      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: userMessage }
      ];

      // Initial API call
      let response = await this.client.chat.completions.create({
        model: 'deepseek-chat',
        messages,
        tools: tools as any,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 2000
      });

      let assistantMessage = response.choices[0].message;

      // Handle function calls (may require multiple iterations)
      const maxIterations = 5;
      let iteration = 0;

      while (assistantMessage.tool_calls && iteration < maxIterations) {
        iteration++;

        // Execute all tool calls
        const toolResults = await Promise.all(
          assistantMessage.tool_calls.map(async (toolCall) => {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments || '{}');

            console.log(`Executing function: ${functionName}`, functionArgs);

            const result = await handleToolCall(functionName, functionArgs);

            return {
              tool_call_id: toolCall.id,
              role: 'tool' as const,
              name: functionName,
              content: JSON.stringify(result)
            };
          })
        );

        // Add assistant message and tool results to messages
        messages.push({
          role: 'assistant',
          content: assistantMessage.content,
          tool_calls: assistantMessage.tool_calls
        });

        messages.push(...toolResults);

        // Make another API call with tool results
        response = await this.client.chat.completions.create({
          model: 'deepseek-chat',
          messages,
          tools: tools as any,
          tool_choice: 'auto',
          temperature: 0.7,
          max_tokens: 2000
        });

        assistantMessage = response.choices[0].message;
      }

      // Generate suggested questions based on context
      const suggestions = this.generateSuggestions(userMessage);

      return {
        response: assistantMessage.content || 'Maaf, saya tidak dapat memberikan jawaban saat ini.',
        suggestions,
        data: null
      };

    } catch (error: any) {
      console.error('DeepSeek API error:', error);
      throw new Error(`Failed to get response from AI: ${error.message}`);
    }
  }

  private generateSuggestions(lastUserMessage: string): string[] {
    const allSuggestions = [
      'Berapa total nilai inventory saat ini?',
      'Produk apa saja yang perlu di-reorder?',
      'Tampilkan 5 produk dengan pergerakan tercepat bulan ini',
      'Ada anomali apa di inventory minggu ini?',
      'Bandingkan performa gudang A vs gudang B',
      'Supplier mana yang paling sering terlambat?',
      'Produk apa yang paling lambat pergerakannya?',
      'Berapa nilai pending purchase orders?',
      'Produk apa yang paling banyak nilainya di inventory?',
      'Berapa banyak produk dalam status critical?'
    ];

    // Return random 3 suggestions, excluding similar to current message
    const filtered = allSuggestions.filter(s =>
      !s.toLowerCase().includes(lastUserMessage.toLowerCase().split(' ')[0])
    );

    return filtered
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
  }

  async getSuggestedQuestions(): Promise<string[]> {
    return [
      'Berapa total nilai inventory saat ini?',
      'Produk apa saja yang perlu di-reorder?',
      'Tampilkan trend pergerakan stok 30 hari terakhir',
      'Produk apa yang paling banyak nilainya?',
      'Bagaimana performa supplier kita?'
    ];
  }
}

export default new DeepSeekService();
