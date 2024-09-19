/**
 * Express router module to handle URL shortening and retrieval of associated data.
 * @module saveModels
 */

import dotenv from 'dotenv';
import { NextFunction, Request, Response, Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { db } from './index';
import shortid from 'shortid';

dotenv.config();

/**
 * Express router instance.
 * @type {Router}
 */
const router = Router();

/**
 * Middleware to handle validation errors from express-validator.
 *
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function.
 * @returns {void}
 */
const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
  }
  next();
};

/**
 * Generates a short URL ID.
 *
 * @returns {string} - A short URL ID no longer than 10 characters.
 */
const generateShortUrl = () => {
  let id = shortid.generate();
  while (id.length > 10) {
    id = shortid.generate();
  }
  return id;
};

/**
 * POST /shorten-url
 * Endpoint to create a shortened URL based on input data.
 *
 * @name /shorten-url
 * @function
 * @memberof module:urlRouter
 * @param {string} allYearInputsStr - JSON string containing year input data.
 * @param {string} biomassCoordinatesStr - JSON string containing biomass coordinates.
 * @param {string} frcsInputsStr - JSON string containing FRCS input data.
 * @param {string} transportInputsStr - JSON string containing transport input data.
 * @returns {Object} - JSON object containing the shortened URL.
 */
router.post(
  '/shorten-url',
  [
    body('allYearInputsStr').notEmpty().withMessage('allYearInputsStr cannot be empty'),
    body('biomassCoordinatesStr').notEmpty().withMessage('biomassCoordinatesStr cannot be empty'),
    body('frcsInputsStr').notEmpty().withMessage('frcsInputsStr cannot be empty'),
    body('transportInputsStr').notEmpty().withMessage('transportInputsStr cannot be empty'),
  ],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    const { allYearInputsStr, biomassCoordinatesStr, frcsInputsStr, transportInputsStr } = req.body;

    try {
      const existingUrl = await db('public.url')
        .select('short_url')
        .where({
          all_year_inputs: allYearInputsStr,
          biomass_coordinates: biomassCoordinatesStr,
          frcs_inputs: frcsInputsStr,
          transport_inputs: transportInputsStr,
        })
        .first();

      if (existingUrl) {
        res.status(200).json({ shortUrl: existingUrl.short_url });
      } else {
        const shortUrlId = generateShortUrl();
        const shortUrl = `${process.env.FE_APP_URL}/${shortUrlId}`;

        await db('public.url').insert({
          all_year_inputs: allYearInputsStr,
          biomass_coordinates: biomassCoordinatesStr,
          frcs_inputs: frcsInputsStr,
          transport_inputs: transportInputsStr,
          short_url: shortUrl,
        });

        res.status(200).json({ shortUrl });
      }
    } catch (error) {
      console.error('Error inserting URL:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * GET /saved-model/:modelId
 * Endpoint to retrieve original input data based on a shortened URL.
 *
 * @name /saved-model/:modelId
 * @function
 * @memberof module:urlRouter
 * @param {string} modelId - The ID of the short URL.
 * @returns {Object} - JSON object containing the original input data.
 */
router.get(
  '/saved-model/:modelId',
  [param('modelId').isLength({ min: 1 }).withMessage('Invalid short URL ID')],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    const { modelId } = req.params;

    try {
      const result = await db('public.url')
        .select(['all_year_inputs', 'biomass_coordinates', 'frcs_inputs', 'transport_inputs'])
        .where('short_url', `${process.env.FE_APP_URL}/${modelId}`)
        .first();

      if (result) {
        res.status(200).json({
          allYearInputs: result.all_year_inputs,
          biomassCoordinates: result.biomass_coordinates,
          frcsInputs: result.frcs_inputs,
          transportInputs: result.transport_inputs,
        });
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
