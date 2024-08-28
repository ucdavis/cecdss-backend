import dotenv from 'dotenv';
import { NextFunction, Request, Response, Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { db } from './index';
import shortid from 'shortid';

dotenv.config();
const router = Router();
const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
  }
  next();
};
const generateShortUrl = () => {
  let id = shortid.generate();
  while (id.length > 10) {
    id = shortid.generate();
  }
  return id;
};

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
