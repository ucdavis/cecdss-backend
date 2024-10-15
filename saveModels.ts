/**
 * Express router module for handling URL shortening and retrieval of saved models.
 * @module saveModels
 */

import dotenv from 'dotenv';
import { Request, Response, Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { db } from './index';
import shortid from 'shortid';

dotenv.config();

const router = Router();

/**
 * POST /shorten-url
 * Creates a shortened URL for the provided data.
 *
 * @route POST /shorten-url
 * @param {Object} req.body.data - The data to be associated with the shortened URL.
 * @returns {Object} JSON object containing the shortened URL.
 * @throws {400} If the request body is invalid.
 * @throws {500} If there's an internal server error.
 */
router.post(
  '/shorten-url',
  [body('data').isObject().notEmpty()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { data } = req.body;

    try {
      const existingUrl = await db('public.url').select('short_url').where({ data }).first();

      if (existingUrl) {
        return res.status(200).json({ shortUrl: existingUrl.short_url });
      }

      const shortUrlId = shortid.generate();
      const shortUrl = `${process.env.FE_APP_URL}/${shortUrlId}`;

      await db('public.url').insert({
        data,
        short_url: shortUrl,
      });

      res.status(200).json({ shortUrl });
    } catch (error) {
      console.error('Error inserting URL:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * GET /saved-model/:modelId
 * Retrieves the data associated with a given model ID.
 *
 * @route GET /saved-model/:modelId
 * @param {string} req.params.modelId - The ID of the model to retrieve.
 * @returns {Object} JSON object containing the saved model data.
 * @throws {400} If the model ID is invalid.
 * @throws {404} If the model is not found.
 * @throws {500} If there's an internal server error.
 */
router.get(
  '/saved-model/:modelId',
  [param('modelId').isLength({ min: 1 }).withMessage('Invalid short URL ID')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { modelId } = req.params;

    try {
      const result = await db('public.url')
        .select('data')
        .where('short_url', `${process.env.FE_APP_URL}/${modelId}`)
        .first();

      if (result) {
        res.status(200).json(result.data);
      } else {
        res.status(404).json({ error: 'URL not found' });
      }
    } catch (error) {
      console.error('Error retrieving URL:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
