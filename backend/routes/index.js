// backend/routes/index.js
import { Router } from 'express';

// existing route modules you already had
import patientsRouter from './patients.js';
import encountersRouter from './encounters.js';
import allergiesRouter from './allergies.js';

// new/updated modules
import providersRouter from './providers.js';
import appointmentsRouter from './appointments.js';

const router = Router();

// keep existing mounts
router.use(patientsRouter);
router.use(encountersRouter);
router.use(allergiesRouter);

// new mounts
router.use(providersRouter);
router.use(appointmentsRouter);

export default router;
