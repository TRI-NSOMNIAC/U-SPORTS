import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import setupRouter from './routes/setup'
import authRouter from './routes/auth'
import eventsRouter from './routes/events'
import bracketsRouter from './routes/brackets'
import scoringRouter from './routes/scoring'
import athletesRouter from './routes/athletes'
import teamsRouter from './routes/teams'
import insightsRouter from './routes/insights'
import announcementsRouter from './routes/announcements'
import reportsRouter from './routes/reports'
import adminRouter from './routes/admin'

const app = express()
const PORT = process.env.PORT || 3001

// Security middleware
app.use(helmet())
app.use(cors({
  origin: process.env.WEB_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests, please try again later.' },
})
app.use('/api/', limiter)

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
})
app.use('/api/auth/', authLimiter)

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Routes
app.use('/api/setup', setupRouter)
app.use('/api/auth', authRouter)
app.use('/api/events', eventsRouter)
app.use('/api/brackets', bracketsRouter)
app.use('/api/scoring', scoringRouter)
app.use('/api/athletes', athletesRouter)
app.use('/api/teams', teamsRouter)
app.use('/api/insights', insightsRouter)
app.use('/api/announcements', announcementsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/admin', adminRouter)

// Friendly root — API has no HTML; avoids "is the server broken?" confusion
app.get('/', (_req, res) => {
  res.json({
    name: 'U-Sports API',
    health: '/health',
    api: '/api',
  })
})

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`U-Sports API running on http://localhost:${PORT}`)
})

export default app
