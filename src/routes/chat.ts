import express, { Request, Response } from 'express';
import deepseek from '../services/deepseek';
import { ChatRequest } from '../types';

const router = express.Router();

// Send a message to the AI assistant
router.post('/', async (req: Request, res: Response) => {
  try {
    const { message, conversationHistory = [] }: ChatRequest = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await deepseek.chat(message, conversationHistory);
    res.json(response);
  } catch (error: any) {
    console.error('Error processing chat message:', error);
    res.status(500).json({
      error: 'Failed to process chat message',
      message: error.message,
      response: 'Maaf, terjadi kesalahan saat memproses pesan Anda. Silakan coba lagi.'
    });
  }
});

// Get suggested questions
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const suggestions = await deepseek.getSuggestedQuestions();
    res.json({ suggestions });
  } catch (error: any) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions', message: error.message });
  }
});

export default router;
