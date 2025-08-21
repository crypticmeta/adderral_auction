// File: backend/src/tests/statusRoutes.test.ts | Purpose: HTTP test for /api/status route using a minimal Express app
import express from 'express';
import request from 'supertest';
import statusRoutes from '../routes/statusRoutes';

describe('/api/status', () => {
  const app = express();
  app.use('/api/status', statusRoutes);

  it('returns runtime flags and btcUsd as number|null with 200', async () => {
    const res = await request(app).get('/api/status');

    expect(res.status).toBe(200);
    const body = res.body ?? {};

    // Basic shape checks with null-safety
    expect(typeof body.network).toBe('string');
    expect(typeof body.testing).toBe('boolean');
    expect(typeof body.nodeEnv).toBe('string');

    // btcUsd is either number or null
    const v = body.btcUsd;
    const isNumber = typeof v === 'number' && Number.isFinite(v);
    const isNull = v === null || v === undefined; // route may set null on failure
    expect(isNumber || isNull).toBe(true);
  });
});
