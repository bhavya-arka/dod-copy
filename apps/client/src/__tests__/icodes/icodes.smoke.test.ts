describe('ICODES Module', () => {
  it('should pass smoke test', () => {
    expect(true).toBe(true);
  });

  it('should support load plan fixtures', async () => {
    const { sampleLoadPlan } = await import('../../../../../tests/fixtures/cargoFixtures');
    expect(sampleLoadPlan).toBeDefined();
    expect(sampleLoadPlan.aircraft).toBe('C-17A');
  });
});
