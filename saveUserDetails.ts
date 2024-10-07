/**
 * Express router module to handle user details saving and updating.
 * @module saveUserDetails
 */

import dotenv from 'dotenv';
import { NextFunction, Request, Response, Router } from 'express';
import { body, validationResult } from 'express-validator';
import { db } from './index';

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
 * POST /save-user-details
 * Endpoint to save or update user details.
 *
 * @name POST /save-user-details
 * @function
 * @memberof module:saveUserDetails
 * @param {string} fullName - User's full name.
 * @param {string} email - User's email address.
 * @param {string} organization - User's organization name.
 * @param {string} orgType - Type of the user's organization.
 * @param {string} [orgWebsite] - Website of the user's organization (optional).
 * @param {string} jobTitle - User's job title.
 * @param {string} [linkedin] - User's LinkedIn profile URL (optional).
 * @param {string} [expertise] - User's area of expertise (optional).
 * @param {string} [aboutMe] - Brief description about the user (optional).
 * @returns {Object} JSON object containing a success message and the user ID.
 */
router.post(
  '/save-user-details',
  [
    body('fullName').notEmpty().withMessage('Full Name is required'),
    body('email').isEmail().withMessage('Invalid email format'),
    body('organization').notEmpty().withMessage('Organization is required'),
    body('orgType').notEmpty().withMessage('Organization Type is required'),
    body('orgWebsite').optional().isURL().withMessage('Invalid URL format'),
    body('jobTitle').notEmpty().withMessage('Job Title is required'),
    body('linkedin').optional().isURL().withMessage('Invalid URL format'),
    body('expertise').optional(),
    body('aboutMe').optional(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    const {
      fullName,
      email,
      organization,
      orgType,
      orgWebsite,
      jobTitle,
      linkedin,
      expertise,
      aboutMe,
    } = req.body;

    try {
      const existingUser = await db('public.users').select('id').where({ email }).first();

      if (existingUser) {
        await db('public.users').where({ id: existingUser.id }).update({
          full_name: fullName,
          organization,
          org_type: orgType,
          org_website: orgWebsite,
          job_title: jobTitle,
          linkedin,
          expertise,
          about_me: aboutMe,
          updated_at: db.fn.now(),
        });

        res
          .status(200)
          .json({ message: 'User details updated successfully', userId: existingUser.id });
      } else {
        const [newUser] = await db('public.users')
          .insert({
            full_name: fullName,
            email,
            organization,
            org_type: orgType,
            org_website: orgWebsite,
            job_title: jobTitle,
            linkedin,
            expertise,
            about_me: aboutMe,
          })
          .returning('id');

        res.status(201).json({ message: 'User details saved successfully', userId: newUser.id });
      }
    } catch (error) {
      console.error('Error saving user details:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
