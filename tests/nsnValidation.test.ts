/**
 * NSN (National Stock Number) Validation Tests
 * Tests for military logistics NSN format validation and parsing
 * 
 * NSN Format: XXXX-XX-XXX-XXXX
 * - FSC (4 digits): Federal Supply Classification
 * - NIIN (9 digits): National Item Identification Number (XX-XXX-XXXX)
 */

const NSN_PATTERN = /^\d{4}-\d{2}-\d{3}-\d{4}$/;

interface NsnParts {
  fsc: string;
  fsg: string;
  niin: string;
  countryCode: string;
}

function isValidNsn(nsn: string | null | undefined): boolean {
  if (nsn === null || nsn === undefined || nsn === '') {
    return false;
  }
  return NSN_PATTERN.test(nsn);
}

function parseNsn(nsn: string): NsnParts | null {
  if (!isValidNsn(nsn)) {
    return null;
  }
  
  const parts = nsn.split('-');
  const fsc = parts[0];
  const fsg = fsc.substring(0, 2);
  const niin = parts.slice(1).join('');
  const countryCode = parts[1];
  
  return {
    fsc,
    fsg,
    niin,
    countryCode,
  };
}

function extractFsc(nsn: string): string | null {
  const parts = parseNsn(nsn);
  return parts ? parts.fsc : null;
}

function extractNiin(nsn: string): string | null {
  const parts = parseNsn(nsn);
  return parts ? parts.niin : null;
}

function extractFsg(nsn: string): string | null {
  const parts = parseNsn(nsn);
  return parts ? parts.fsg : null;
}

const FSC_CATEGORIES: Record<string, string> = {
  '8415': 'Clothing, Special Purpose',
  '8430': 'Footwear, Men\'s',
  '8435': 'Footwear, Women\'s',
  '8465': 'Individual Equipment',
  '8470': 'Armor, Personal',
  '9150': 'Oils and Greases',
  '5820': 'Radio and Television Communication Equipment',
  '6625': 'Electrical and Electronic Properties Measuring and Testing Instruments',
  '6640': 'Laboratory Equipment and Supplies',
  '6810': 'Chemicals',
  '7520': 'Office Supplies',
};

function getFscCategory(fsc: string): string | null {
  return FSC_CATEGORIES[fsc] || null;
}

describe('NSN Format Validation', () => {
  test('should validate correct NSN format XXXX-XX-XXX-XXXX', () => {
    const validNsns = [
      '8415-01-530-2157',
      '9150-01-178-5687',
      '5820-01-234-5678',
      '0000-00-000-0000',
      '9999-99-999-9999',
    ];
    
    validNsns.forEach(nsn => {
      expect(isValidNsn(nsn)).toBe(true);
    });
  });

  test('should reject NSN with missing dashes', () => {
    const invalidNsns = [
      '8415015302157',
      '841501-530-2157',
      '8415-01530-2157',
      '8415-01-5302157',
    ];
    
    invalidNsns.forEach(nsn => {
      expect(isValidNsn(nsn)).toBe(false);
    });
  });

  test('should reject NSN with wrong number of digits', () => {
    const invalidNsns = [
      '841-01-530-2157',
      '84150-01-530-2157',
      '8415-1-530-2157',
      '8415-001-530-2157',
      '8415-01-53-2157',
      '8415-01-5300-2157',
      '8415-01-530-215',
      '8415-01-530-21570',
    ];
    
    invalidNsns.forEach(nsn => {
      expect(isValidNsn(nsn)).toBe(false);
    });
  });

  test('should reject NSN with letters in wrong places', () => {
    const invalidNsns = [
      'ABCD-01-530-2157',
      '8415-AB-530-2157',
      '8415-01-ABC-2157',
      '8415-01-530-ABCD',
      '841A-01-530-2157',
    ];
    
    invalidNsns.forEach(nsn => {
      expect(isValidNsn(nsn)).toBe(false);
    });
  });
});

describe('NSN Component Extraction', () => {
  test('should extract FSC (first 4 digits) correctly', () => {
    expect(extractFsc('8415-01-530-2157')).toBe('8415');
    expect(extractFsc('9150-01-178-5687')).toBe('9150');
    expect(extractFsc('5820-01-234-5678')).toBe('5820');
    expect(extractFsc('0000-00-000-0000')).toBe('0000');
  });

  test('should extract NIIN (last 9 digits) correctly', () => {
    expect(extractNiin('8415-01-530-2157')).toBe('015302157');
    expect(extractNiin('9150-01-178-5687')).toBe('011785687');
    expect(extractNiin('5820-01-234-5678')).toBe('012345678');
    expect(extractNiin('0000-00-000-0000')).toBe('000000000');
  });

  test('should extract FSG (first 2 digits of FSC) correctly', () => {
    expect(extractFsg('8415-01-530-2157')).toBe('84');
    expect(extractFsg('9150-01-178-5687')).toBe('91');
    expect(extractFsg('5820-01-234-5678')).toBe('58');
    expect(extractFsg('0000-00-000-0000')).toBe('00');
  });
});

describe('FSC Category Lookup', () => {
  test('should identify common FSC codes correctly', () => {
    expect(getFscCategory('8415')).toBe('Clothing, Special Purpose');
    expect(getFscCategory('8430')).toBe('Footwear, Men\'s');
    expect(getFscCategory('8465')).toBe('Individual Equipment');
    expect(getFscCategory('8470')).toBe('Armor, Personal');
    expect(getFscCategory('9150')).toBe('Oils and Greases');
  });

  test('should return null for unknown FSC codes', () => {
    expect(getFscCategory('0000')).toBe(null);
    expect(getFscCategory('1234')).toBe(null);
    expect(getFscCategory('9999')).toBe(null);
  });
});

describe('Edge Case Handling', () => {
  test('should handle null input gracefully', () => {
    expect(isValidNsn(null)).toBe(false);
    expect(parseNsn(null as any)).toBe(null);
  });

  test('should handle undefined input gracefully', () => {
    expect(isValidNsn(undefined)).toBe(false);
    expect(parseNsn(undefined as any)).toBe(null);
  });

  test('should handle empty string gracefully', () => {
    expect(isValidNsn('')).toBe(false);
    expect(parseNsn('')).toBe(null);
  });

  test('should handle whitespace-padded NSNs', () => {
    expect(isValidNsn(' 8415-01-530-2157')).toBe(false);
    expect(isValidNsn('8415-01-530-2157 ')).toBe(false);
    expect(isValidNsn(' 8415-01-530-2157 ')).toBe(false);
  });

  test('should return null for extraction from invalid NSN', () => {
    expect(extractFsc('invalid')).toBe(null);
    expect(extractNiin('invalid')).toBe(null);
    expect(extractFsg('invalid')).toBe(null);
  });
});

describe('NSN Parsing Complete', () => {
  test('should parse valid NSN into all components', () => {
    const result = parseNsn('8415-01-530-2157');
    expect(result).not.toBe(null);
    expect(result?.fsc).toBe('8415');
    expect(result?.fsg).toBe('84');
    expect(result?.niin).toBe('015302157');
    expect(result?.countryCode).toBe('01');
  });

  test('should identify US country code (01)', () => {
    const result = parseNsn('8415-01-530-2157');
    expect(result?.countryCode).toBe('01');
  });

  test('should handle different country codes', () => {
    const result = parseNsn('8415-00-530-2157');
    expect(result?.countryCode).toBe('00');
  });
});
