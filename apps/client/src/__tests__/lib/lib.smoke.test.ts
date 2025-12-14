describe('Lib Module', () => {
  it('should pass smoke test', () => {
    expect(true).toBe(true);
  });

  it('should support cargo fixtures', async () => {
    const { createPallet, createMovementItem } = await import('../../../../../tests/fixtures/cargoFixtures');
    
    const pallet = createPallet({ type: '463L' });
    expect(pallet.type).toBe('463L');
    expect(pallet.maxWeight).toBe(10000);

    const item = createMovementItem({ weight: 750 });
    expect(item.weight).toBe(750);
  });
});
