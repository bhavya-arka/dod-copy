describe('Flight Manager Module', () => {
  it('should pass smoke test', () => {
    expect(true).toBe(true);
  });

  it('should have access to flight fixtures', async () => {
    const { sampleFlights, createFlight } = await import('../../../../../tests/fixtures/flightFixtures');
    expect(sampleFlights).toBeDefined();
    expect(sampleFlights.length).toBeGreaterThan(0);

    const newFlight = createFlight({ aircraft: 'C-5M' });
    expect(newFlight.aircraft).toBe('C-5M');
  });
});
