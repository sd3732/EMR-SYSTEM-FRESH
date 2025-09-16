// backend/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import router from './routes/index.js';            // your existing aggregate router
import providersRouter from './routes/providers.js';
import appointmentsRouter from './routes/appointments.js';
import ordersRouter from './routes/orders.js';     // orders API
import authRouter from './routes/auth.js';         // authentication routes
import medicationsRouter from './routes/medications.js'; // medications API
import medicationsRoutesRouter from './routes/medications.routes.js'; // enhanced medications API
import prescriptionsRouter from './routes/prescriptions.js'; // prescriptions API
import clinicalNotesRouter from './routes/clinical-notes.js'; // clinical notes API
import diagnosesRouter from './routes/diagnoses.js';     // diagnoses and templates API
import labOrdersRouter from './routes/lab-orders.js';   // lab orders API
import labTestsRouter from './routes/lab-tests.js';     // lab tests search API
import labResultsRouter from './routes/lab-results.js'; // lab results processing API
import labsRoutesRouter from './routes/labs.routes.js'; // comprehensive lab system API
import clinicalGuidelinesRouter from './routes/clinical-guidelines.js'; // clinical guidelines API
import medicalHistoryRouter from './routes/medical-history.js'; // medical history API
import dischargeSummariesRouter from './routes/discharge-summaries.js'; // discharge summaries API
import familyHistoryRouter from './routes/family-history.js'; // family history API
import insuranceRouter from './routes/insurance.routes.js'; // patient insurance API
import auditRouter from './routes/audit.routes.js'; // audit logging API
import auditMiddleware from './middleware/audit.middleware.js'; // HIPAA audit middleware
import cacheRouter from './routes/cache.js'; // cache analytics API
import { authenticateToken } from './middleware/auth.js';

dotenv.config();

const app = express();

// CORS configuration to allow frontend communication
app.use(cors({
  origin: 'http://localhost:5173', // Frontend URL
  credentials: true, // Allow cookies and credentials
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Health check (public endpoint)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'emr-backend' });
});

// Authentication routes (public)
app.use('/api', authRouter);

// HIPAA Audit Middleware - Applied to all protected routes
// This must come BEFORE the authenticateToken middleware to capture all requests
app.use('/api', auditMiddleware.auditLogger());

// Protected API routes (require authentication)
app.use('/api', authenticateToken, auditMiddleware.responseAuditor()); // Log responses after auth
app.use('/api', authenticateToken, router);                // existing routes (patients, encounters, etc.)
app.use('/api', authenticateToken, providersRouter);       // providers endpoints
app.use('/api', authenticateToken, appointmentsRouter);    // appointments endpoints
app.use('/api', authenticateToken, ordersRouter);          // orders endpoints
app.use('/api', authenticateToken, medicationsRouter);     // medications endpoints
app.use('/api', authenticateToken, medicationsRoutesRouter); // enhanced medications API
app.use('/api', authenticateToken, prescriptionsRouter);   // prescriptions endpoints
app.use('/api', authenticateToken, clinicalNotesRouter);   // clinical notes endpoints
app.use('/api', authenticateToken, diagnosesRouter);       // diagnoses and templates endpoints
app.use('/api', authenticateToken, labOrdersRouter);       // lab orders endpoints
app.use('/api', authenticateToken, labTestsRouter);        // lab tests search endpoints
app.use('/api', authenticateToken, labResultsRouter);      // lab results processing endpoints
app.use('/api', authenticateToken, labsRoutesRouter);      // comprehensive lab system endpoints
app.use('/api', authenticateToken, clinicalGuidelinesRouter); // clinical guidelines endpoints
app.use('/api', authenticateToken, medicalHistoryRouter); // medical history endpoints
app.use('/api', dischargeSummariesRouter); // discharge summaries endpoints
app.use('/api', familyHistoryRouter); // family history endpoints
app.use('/api', authenticateToken, insuranceRouter); // patient insurance endpoints
app.use('/api', authenticateToken, auditRouter); // audit logging endpoints (admin only)

// (optional) basic 404 for unknown API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

const PORT = process.env.PORT || 3000;

// Create HTTP server for both Express and WebSocket
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/appointments' });

// Store connected clients
const clients = new Set();

// WebSocket connection handling
wss.on('connection', (ws, request) => {
  console.log('📡 WebSocket client connected from', request.socket.remoteAddress);
  clients.add(ws);
  
  // Send connection confirmation
  ws.send(JSON.stringify({
    type: 'connection_established',
    message: 'Connected to EMR appointment updates',
    timestamp: new Date().toISOString()
  }));
  
  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📨 WebSocket message received:', message);
      
      // Handle different message types
      switch (message.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          break;
        
        case 'subscribe_appointment':
          // Client wants to subscribe to specific appointment updates
          ws.appointmentSubscriptions = ws.appointmentSubscriptions || new Set();
          if (message.appointmentId) {
            ws.appointmentSubscriptions.add(message.appointmentId);
            console.log(`📋 Client subscribed to appointment ${message.appointmentId}`);
          }
          break;
          
        case 'subscribe_date':
          // Client wants to subscribe to date-based updates
          ws.dateSubscription = message.date;
          console.log(`📅 Client subscribed to date ${message.date}`);
          break;
          
        default:
          console.warn('❓ Unknown WebSocket message type:', message.type);
      }
    } catch (error) {
      console.error('❌ WebSocket message parse error:', error);
    }
  });
  
  // Handle client disconnect
  ws.on('close', () => {
    console.log('📡 WebSocket client disconnected');
    clients.delete(ws);
  });
  
  // Handle connection errors
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    clients.delete(ws);
  });
});

// Function to broadcast appointment updates to connected clients
export function broadcastAppointmentUpdate(appointmentData) {
  if (clients.size === 0) return;
  
  const message = JSON.stringify({
    type: 'appointment_updated',
    data: appointmentData,
    timestamp: new Date().toISOString()
  });
  
  clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      // Check if client is subscribed to this specific appointment
      const subscribed = !client.appointmentSubscriptions || 
                        client.appointmentSubscriptions.has(appointmentData.id) ||
                        client.dateSubscription === appointmentData.date;
      
      if (subscribed) {
        client.send(message);
      }
    }
  });
  
  console.log(`📡 Broadcast appointment update to ${clients.size} clients`);
}

// Function to broadcast metrics updates
export function broadcastMetricsUpdate(metrics) {
  if (clients.size === 0) return;
  
  const message = JSON.stringify({
    type: 'metrics_updated',
    metrics: metrics,
    timestamp: new Date().toISOString()
  });
  
  clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}

// Start the server
server.listen(PORT, () => {
  console.log(`✅ EMR backend listening on port ${PORT}`);
  console.log(`📡 WebSocket server ready at ws://localhost:${PORT}/appointments`);
});
