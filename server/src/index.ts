import './config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import config from './config';
import bookingRouter from './controller/booking-controller';
import authRouter from './controller/auth-controller';
import newChatRouter from './controller/chat-controller';
import tripRouter from './controller/trip-controller';
import tripIntakeRouter from './controller/trip-intake-controller';
import airportRouter from './controller/airport-controller';

const app = express();

app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.use('/api', bookingRouter);
app.use('/api', authRouter);
app.use('/api', newChatRouter);
app.use('/api', tripRouter);
app.use('/api', tripIntakeRouter);
app.use('/api', airportRouter);

// Airline APIs can take up to 120 s — keep the socket alive long enough to receive a response.
const server = app.listen(config.PORT, () => console.log(`Server running on :${config.PORT}`));
server.setTimeout(130_000);