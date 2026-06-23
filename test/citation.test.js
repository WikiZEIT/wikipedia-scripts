import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

let api;

beforeAll(async () => {
    await import('../citation.js');
    api = globalThis.citationHelper.api;
});

// =========================================================================
//  splitTemplateParams
// =========================================================================
describe('splitTemplateParams', () => {
    it('splits simple pipe-separated params', () => {
        expect(api.splitTemplateParams('a|b|c')).toEqual(['a', 'b', 'c']);
    });

    it('handles single param', () => {
        expect(api.splitTemplateParams('only')).toEqual(['only']);
    });

    it('preserves nested templates', () => {
        const result = api.splitTemplateParams('nazwisko = Kowalski|odn = {{odn/id|ABC|2020}}');
        expect(result).toEqual(['nazwisko = Kowalski', 'odn = {{odn/id|ABC|2020}}']);
    });

    it('preserves nested wikilinks', () => {
        const result = api.splitTemplateParams('tytuł = [[Link|Display]]|rok = 2020');
        expect(result).toEqual(['tytuł = [[Link|Display]]', 'rok = 2020']);
    });

    it('handles empty input', () => {
        expect(api.splitTemplateParams('')).toEqual([]);
    });
});

// =========================================================================
//  parseTemplate
// =========================================================================
describe('parseTemplate', () => {
    it('parses named parameters', () => {
        const result = api.parseTemplate('{{Cytuj książkę | nazwisko = Kowalski | rok = 2020 | tytuł = Test}}');
        expect(result._templateName).toBe('Cytuj książkę');
        expect(result.nazwisko).toBe('Kowalski');
        expect(result.rok).toBe('2020');
        expect(result.tytuł).toBe('Test');
    });

    it('parses positional parameters', () => {
        const result = api.parseTemplate('{{Cytuj|Pos1|Pos2|Pos3}}');
        expect(result._templateName).toBe('Cytuj');
        expect(result._positional).toEqual(['Pos1', 'Pos2', 'Pos3']);
    });

    it('parses mixed named and positional parameters', () => {
        const result = api.parseTemplate('{{Cytuj|PosVal| nazwisko = Kowalski}}');
        expect(result._positional).toEqual(['PosVal']);
        expect(result.nazwisko).toBe('Kowalski');
    });

    it('preserves nested templates in values', () => {
        const result = api.parseTemplate('{{Cytuj książkę| odn = {{odn/id|Nowak|2020}}| rok = 2020}}');
        expect(result.odn).toBe('{{odn/id|Nowak|2020}}');
        expect(result.rok).toBe('2020');
    });

    it('handles Cytuj pismo template', () => {
        const result = api.parseTemplate('{{Cytuj pismo | nazwisko = Droszcz | tytuł = Mobilizacja | czasopismo = Obronność}}');
        expect(result._templateName).toBe('Cytuj pismo');
        expect(result.czasopismo).toBe('Obronność');
    });

    it('trims whitespace from values', () => {
        const result = api.parseTemplate('{{Cytuj książkę |  nazwisko = Kowalski  |  rok =  2020  }}');
        expect(result.nazwisko).toBe('Kowalski');
        expect(result.rok).toBe('2020');
    });
});

// =========================================================================
//  matchCytujTemplates
// =========================================================================
describe('matchCytujTemplates', () => {
    it('finds a single template', () => {
        const text = '* {{Cytuj książkę | nazwisko = A | rok = 2020}}';
        const result = api.matchCytujTemplates(text);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe('{{Cytuj książkę | nazwisko = A | rok = 2020}}');
    });

    it('finds multiple templates', () => {
        const text = '* {{Cytuj książkę | a = 1}}\n* {{Cytuj pismo | b = 2}}';
        expect(api.matchCytujTemplates(text)).toHaveLength(2);
    });

    it('is case-insensitive', () => {
        const text = '{{cytuj książkę | a = 1}}';
        expect(api.matchCytujTemplates(text)).toHaveLength(1);
    });

    it('handles nested templates', () => {
        const text = '{{Cytuj książkę | odn = {{odn/id|A|2020}} | rok = 2020}}';
        const result = api.matchCytujTemplates(text);
        expect(result).toHaveLength(1);
        expect(result[0]).toContain('{{odn/id|A|2020}}');
    });

    it('returns empty array for no matches', () => {
        expect(api.matchCytujTemplates('No templates here')).toEqual([]);
    });

    it('handles real-world Wimmer entry with nested odn/id', () => {
        const text = '* {{Cytuj książkę | nazwisko = Wimmer | odn = {{odn/id|Wimmer (red.)|1973}} | tytuł = Wojna}}';
        const result = api.matchCytujTemplates(text);
        expect(result).toHaveLength(1);
    });
});

// =========================================================================
//  parseExistingBibliography
// =========================================================================
describe('parseExistingBibliography', () => {
    it('extracts main entries from bibliography section', () => {
        const source = [
            '== Historia ==',
            'Tekst.',
            '',
            '== Bibliografia ==',
            '* {{Cytuj książkę | nazwisko = A | rok = 2020}}',
            '* {{Cytuj książkę | nazwisko = B | rok = 2021}}',
        ].join('\n');
        const result = api.parseExistingBibliography(source);
        expect(result.main).toHaveLength(2);
        expect(result.nested).toHaveLength(0);
        expect(result.main[0].nazwisko).toBe('A');
        expect(result.main[1].nazwisko).toBe('B');
    });

    it('separates main from nested (subsection) entries', () => {
        const source = [
            '== Bibliografia ==',
            '* {{Cytuj książkę | nazwisko = Main}}',
            '=== Źródła ===',
            '* {{Cytuj książkę | nazwisko = Nested}}'
        ].join('\n');
        const result = api.parseExistingBibliography(source);
        expect(result.main).toHaveLength(1);
        expect(result.nested).toHaveLength(1);
        expect(result.main[0].nazwisko).toBe('Main');
        expect(result.nested[0].nazwisko).toBe('Nested');
    });

    it('returns empty when no bibliography section exists', () => {
        const source = '== Historia ==\nTekst.';
        const result = api.parseExistingBibliography(source);
        expect(result.main).toEqual([]);
        expect(result.nested).toEqual([]);
    });

    it('parses === Bibliografia === (level 3) inside a discussion thread', () => {
        const source = '== Thread ==\nDiscussion.\n\n=== Bibliografia ===\n* {{Cytuj książkę |nazwisko=Kowalski |rok=2020}}\n* {{Cytuj książkę |nazwisko=Nowak |rok=2019}}\n';
        const result = api.parseExistingBibliography(source);
        expect(result.main).toHaveLength(2);
        expect(result.main[0].nazwisko).toBe('Kowalski');
        expect(result.main[1].nazwisko).toBe('Nowak');
    });

    it('stops level-3 Bibliografia at sibling === Przypisy === (does not include it)', () => {
        const source = '== Thread ==\n=== Bibliografia ===\n* {{Cytuj książkę |nazwisko=K |rok=2020}}\n\n=== Przypisy ===\n{{Przypisy}}\n';
        const result = api.parseExistingBibliography(source);
        expect(result.main).toHaveLength(1);
        expect(result.main[0].nazwisko).toBe('K');
    });

    it('stops level-3 Bibliografia at parent-sibling == Other Thread ==', () => {
        const source = '== Thread A ==\n=== Bibliografia ===\n* {{Cytuj książkę |nazwisko=A |rok=2020}}\n\n== Thread B ==\n=== Bibliografia ===\n* {{Cytuj książkę |nazwisko=B |rok=2021}}\n';
        const result = api.parseExistingBibliography(source);
        expect(result.main).toHaveLength(1);
        expect(result.main[0].nazwisko).toBe('A');
    });

    it('returns empty for non-string input', () => {
        expect(api.parseExistingBibliography(null)).toEqual({ main: [], nested: [] });
        expect(api.parseExistingBibliography(undefined)).toEqual({ main: [], nested: [] });
    });

    it('handles real test article structure', () => {
        const source = [
            "'''Testowy artykuł''' – opis.",
            '',
            '== Historia ==',
            'Opis historii.',
            '',
            '== Przypisy ==',
            '{{Przypisy}}',
            '',
            '== Bibliografia ==',
            '* {{Cytuj książkę | nazwisko = Kowalski | imię = Jan | tytuł = Historia Polski | rok = 2020 | wydawca = PWN | miejsce = Warszawa | isbn = 9781234567890 | odn = tak}}',
            '',
            '{{SORTUJ:Testowy artykuł}}',
            '[[Kategoria:Testy]]'
        ].join('\n');
        const result = api.parseExistingBibliography(source);
        expect(result.main).toHaveLength(1);
        expect(result.main[0].nazwisko).toBe('Kowalski');
        expect(result.main[0].tytuł).toBe('Historia Polski');
    });
});

// =========================================================================
//  stringifyTemplate
// =========================================================================
describe('stringifyTemplate', () => {
    it('serializes named parameters', () => {
        const data = { nazwisko: 'Kowalski', rok: '2020', _templateName: 'Cytuj książkę' };
        const result = api.stringifyTemplate('Cytuj książkę', data);
        expect(result).toBe('{{Cytuj książkę |nazwisko=Kowalski |rok=2020}}');
    });

    it('serializes positional parameters', () => {
        const data = { _positional: ['A', 'B'], _templateName: 'Cytuj' };
        const result = api.stringifyTemplate('Cytuj', data);
        expect(result).toBe('{{Cytuj |A |B}}');
    });

    it('serializes mixed parameters (positional first)', () => {
        const data = { _positional: ['Pos1'], nazwisko: 'A', _templateName: 'Cytuj' };
        const result = api.stringifyTemplate('Cytuj', data);
        expect(result).toBe('{{Cytuj |Pos1 |nazwisko=A}}');
    });

    it('serializes templates with no parameters', () => {
        expect(api.stringifyTemplate('Foo', {})).toBe('{{Foo}}');
    });

    it('excludes _templateName and _positional from named params', () => {
        const data = { _templateName: 'X', _positional: ['Y'], rok: '2020' };
        const result = api.stringifyTemplate('X', data);
        expect(result).not.toContain('_templateName');
        expect(result).toContain('rok=2020');
    });

    it('excludes any underscore-prefixed private fields (e.g. _odnMissing)', () => {
        const data = { nazwisko: 'Kowalski', rok: '2020', _odnMissing: true };
        const result = api.stringifyTemplate('Cytuj książkę', data);
        expect(result).not.toContain('_odnMissing');
        expect(result).toBe('{{Cytuj książkę |nazwisko=Kowalski |rok=2020}}');
    });
});

// =========================================================================
//  parse → stringify roundtrip
// =========================================================================
describe('parse → stringify roundtrip', () => {
    it('preserves named parameters', () => {
        const original = '{{Cytuj książkę |nazwisko=Kowalski |rok=2020 |tytuł=Historia}}';
        const parsed = api.parseTemplate(original);
        const result = api.stringifyTemplate(parsed._templateName, parsed);
        expect(result).toBe(original);
    });

    it('preserves nested templates', () => {
        const original = '{{Cytuj książkę |odn={{odn/id|A|2020}} |rok=2020}}';
        const parsed = api.parseTemplate(original);
        const result = api.stringifyTemplate(parsed._templateName, parsed);
        expect(result).toBe(original);
    });
});

// =========================================================================
//  buildBibEntries
// =========================================================================
describe('buildBibEntries', () => {
    it('builds bullet list from books', () => {
        const books = [
            { _templateName: 'Cytuj książkę', nazwisko: 'A', rok: '2020' },
            { _templateName: 'Cytuj pismo', nazwisko: 'B', data: '2021' }
        ];
        const result = api.buildBibEntries(books);
        expect(result).toBe(
            '* {{Cytuj książkę |nazwisko=A |rok=2020}}\n' +
            '* {{Cytuj pismo |nazwisko=B |data=2021}}'
        );
    });

    it('defaults to Cytuj książkę when _templateName is missing', () => {
        const books = [{ nazwisko: 'Test' }];
        const result = api.buildBibEntries(books);
        expect(result).toContain('{{Cytuj książkę |');
    });
});

// =========================================================================
//  buildOdnString
// =========================================================================
describe('buildOdnString', () => {
    it('builds from nazwisko and rok', () => {
        const book = { nazwisko: 'Kowalski', rok: '2020' };
        expect(api.buildOdnString(book)).toBe('{{odn|Kowalski|2020}}');
    });

    it('builds from nazwisko and data (when rok is missing)', () => {
        const book = { nazwisko: 'Wimmer', data: '1973' };
        expect(api.buildOdnString(book)).toBe('{{odn|Wimmer|1973}}');
    });

    it('builds from multiple regular authors', () => {
        const book = { nazwisko: 'A', nazwisko2: 'B', rok: '2020' };
        const result = api.buildOdnString(book);
        expect(result).toBe('{{odn|A|B|2020}}');
    });

    it('builds with page number', () => {
        const book = { nazwisko: 'Kowalski', rok: '2020' };
        expect(api.buildOdnString(book, '15')).toBe('{{odn|Kowalski|2020|s=15}}');
    });

    it('builds from odn/id nested template', () => {
        const book = { odn: '{{odn/id|Wimmer (red.)|1973}}', nazwisko: 'Wimmer' };
        expect(api.buildOdnString(book)).toBe('{{odn|Wimmer (red.)|1973}}');
    });

    it('builds from positional parameters', () => {
        const book = { _positional: ['Źródło', '2020'] };
        expect(api.buildOdnString(book)).toBe('{{odn|Źródło|2020}}');
    });

    it('builds odn/id with page number', () => {
        const book = { odn: '{{odn/id|Nowak|2020}}' };
        expect(api.buildOdnString(book, '42')).toBe('{{odn|Nowak|2020|s=42}}');
    });

    it('handles book with no year', () => {
        const book = { nazwisko: 'Anonymous' };
        expect(api.buildOdnString(book)).toBe('{{odn|Anonymous}}');
    });

    it('uses nazwisko r (chapter author) when present', () => {
        const book = { nazwisko: 'Wimmer (red.)', 'nazwisko r': 'Podhorodecki', data: '1973' };
        expect(api.buildOdnString(book)).toBe('{{odn|Podhorodecki|1973}}');
    });

    it('uses nazwisko r with page number', () => {
        const book = { nazwisko: 'Wimmer (red.)', 'nazwisko r': 'Nowak', data: '1973' };
        expect(api.buildOdnString(book, '55')).toBe('{{odn|Nowak|1973|s=55}}');
    });

    it('uses nazwisko r even when multiple regular authors exist (Aksamitowski case)', () => {
        const book = {
            nazwisko: 'Aksamitowski', nazwisko2: 'Faszcza',
            'nazwisko r': 'Kozak', data: '2017'
        };
        expect(api.buildOdnString(book)).toBe('{{odn|Kozak|2017}}');
    });

    it('uses regular nazwisko when no nazwisko r present', () => {
        const book = { nazwisko: 'Kowalski', rok: '2020' };
        expect(api.buildOdnString(book)).toBe('{{odn|Kowalski|2020}}');
    });

    it('appends odn letter to year when odn is a single letter', () => {
        const book = { nazwisko: 'Kaczmarek', rok: '1990', odn: 'k' };
        expect(api.buildOdnString(book, '10')).toBe('{{odn|Kaczmarek|1990k|s=10}}');
    });

    it('does not append anything when odn is "tak"', () => {
        const book = { nazwisko: 'Kowalski', rok: '2020', odn: 'tak' };
        expect(api.buildOdnString(book)).toBe('{{odn|Kowalski|2020}}');
    });

    it('appends odn letter with data field', () => {
        const book = { nazwisko: 'Nowak', data: '2015', odn: 'a' };
        expect(api.buildOdnString(book)).toBe('{{odn|Nowak|2015a}}');
    });

    it('appends odn letter with nazwisko r', () => {
        const book = { nazwisko: 'Editor', 'nazwisko r': 'Author', rok: '2000', odn: 'b' };
        expect(api.buildOdnString(book)).toBe('{{odn|Author|2000b}}');
    });
});

// =========================================================================
//  bookKey
// =========================================================================
describe('bookKey', () => {
    it('generates key from nazwisko, rok, tytuł', () => {
        const book = { nazwisko: 'Kowalski', rok: '2020', tytuł: 'Historia' };
        expect(api.bookKey(book)).toBe('kowalski|2020|historia');
    });

    it('generates key from positional params', () => {
        const book = { _positional: ['Source', '2020'] };
        expect(api.bookKey(book)).toBe('source|2020');
    });

    it('uses nazwisko1 as fallback', () => {
        const book = { nazwisko1: 'Nowak', rok: '2021', tytuł: 'Math' };
        expect(api.bookKey(book)).toBe('nowak|2021|math');
    });

    it('handles missing fields gracefully', () => {
        const book = { tytuł: 'Lonely' };
        expect(api.bookKey(book)).toBe('||lonely');
    });

    it('same key for Wimmer variants (same author+title, no rok)', () => {
        const v1 = { nazwisko: 'Wimmer (red.)', tytuł: 'Wojna polsko-szwedzka', rozdział: 'Chapter 1' };
        const v2 = { nazwisko: 'Wimmer (red.)', tytuł: 'Wojna polsko-szwedzka', rozdział: 'Chapter 2' };
        expect(api.bookKey(v1)).toBe(api.bookKey(v2));
    });
});

// =========================================================================
//  bookLabel
// =========================================================================
describe('bookLabel', () => {
    it('formats author, year, and title', () => {
        const book = { nazwisko: 'Kowalski', rok: '2020', tytuł: 'Historia' };
        expect(api.bookLabel(book)).toBe('Kowalski (2020) — Historia');
    });

    it('uses data when rok is missing', () => {
        const book = { nazwisko: 'Wimmer', data: '1973', tytuł: 'Wojna' };
        expect(api.bookLabel(book)).toBe('Wimmer (1973) — Wojna');
    });

    it('handles opis field', () => {
        const book = { opis: 'Custom description' };
        expect(api.bookLabel(book)).toBe('Custom description');
    });

    it('handles opis with positional and wiki links', () => {
        const book = { opis: '[[Some|Display]] text', _positional: ['ID1'] };
        expect(api.bookLabel(book)).toBe('[ID1] Display text');
    });

    it('falls back to "Książka bez tytułu"', () => {
        expect(api.bookLabel({})).toBe('Książka bez tytułu');
    });

    it('uses autor as fallback for author', () => {
        const book = { autor: 'Unknown', tytuł: 'Book' };
        expect(api.bookLabel(book)).toBe('Unknown — Book');
    });
});

// =========================================================================
//  stripLinks
// =========================================================================
describe('stripLinks', () => {
    it('removes simple wiki links', () => {
        expect(api.stripLinks('[[Historia]]')).toBe('Historia');
    });

    it('removes piped wiki links', () => {
        expect(api.stripLinks('[[Article|Display text]]')).toBe('Display text');
    });

    it('handles multiple links', () => {
        expect(api.stripLinks('[[A]] and [[B|C]]')).toBe('A and C');
    });

    it('returns text without links unchanged', () => {
        expect(api.stripLinks('plain text')).toBe('plain text');
    });
});

// =========================================================================
//  findDifferingFields
// =========================================================================
describe('findDifferingFields', () => {
    it('returns empty when all fields are the same', () => {
        const books = [
            { nazwisko: 'A', rok: '2020' },
            { nazwisko: 'A', rok: '2020' }
        ];
        expect(api.findDifferingFields(books)).toEqual([]);
    });

    it('returns fields that differ', () => {
        const books = [
            { nazwisko: 'A', rozdział: 'Ch1', 'nazwisko r': 'X' },
            { nazwisko: 'A', rozdział: 'Ch2', 'nazwisko r': 'Y' }
        ];
        const result = api.findDifferingFields(books);
        expect(result).toContain('rozdział');
        expect(result).toContain('nazwisko r');
        expect(result).not.toContain('nazwisko');
    });

    it('ignores _templateName and _positional', () => {
        const books = [
            { _templateName: 'A', _positional: ['x'], rok: '2020' },
            { _templateName: 'B', _positional: ['y'], rok: '2020' }
        ];
        expect(api.findDifferingFields(books)).toEqual([]);
    });

    it('handles missing fields (treated as empty string)', () => {
        const books = [
            { nazwisko: 'A', rozdział: 'Ch1' },
            { nazwisko: 'A' }
        ];
        expect(api.findDifferingFields(books)).toContain('rozdział');
    });
});

// =========================================================================
//  variantLabel
// =========================================================================
describe('variantLabel', () => {
    it('uses rozdział as label', () => {
        const book = { rozdział: 'Operacja krakowska' };
        expect(api.variantLabel(book, [])).toBe('Operacja krakowska');
    });

    it('appends chapter author', () => {
        const book = { rozdział: 'Kampania 1659', 'nazwisko r': 'Podhorodecki' };
        expect(api.variantLabel(book, [])).toBe('Kampania 1659 (Podhorodecki)');
    });

    it('truncates long chapter names', () => {
        const book = { rozdział: 'A'.repeat(70) };
        const label = api.variantLabel(book, []);
        expect(label.length).toBeLessThanOrEqual(60);
        expect(label).toMatch(/\.\.\.$/);
    });

    it('strips wiki links from chapter name', () => {
        const book = { rozdział: '[[Link|Chapter name]]' };
        expect(api.variantLabel(book, [])).toBe('Chapter name');
    });

    it('falls back to differing fields when no rozdział', () => {
        const book = { tom: '1', seria: 'A' };
        const result = api.variantLabel(book, ['tom', 'seria']);
        expect(result).toBe('1, A');
    });

    it('returns "Wariant" when no differing fields have values', () => {
        const book = {};
        expect(api.variantLabel(book, ['missing'])).toBe('Wariant');
    });

    it('skips _-prefixed differing fields', () => {
        const book = { _internal: 'x', tom: '1' };
        expect(api.variantLabel(book, ['_internal', 'tom'])).toBe('1');
    });
});

// =========================================================================
//  findMatchingVariant
// =========================================================================
describe('findMatchingVariant', () => {
    const variants = [
        { rozdział: 'Operacja krakowska', 'nazwisko r': 'Nowak' },
        { rozdział: 'Kampania 1659', 'nazwisko r': 'Podhorodecki' },
        { rozdział: 'Bitwa pod Warszawą', 'nazwisko r': 'Herbst' }
    ];
    const diffFields = ['rozdział', 'nazwisko r'];

    it('finds exact match', () => {
        const existing = { rozdział: 'Kampania 1659', 'nazwisko r': 'Podhorodecki' };
        expect(api.findMatchingVariant(existing, variants, diffFields)).toBe(1);
    });

    it('matches case-insensitively', () => {
        const existing = { rozdział: 'OPERACJA KRAKOWSKA', 'nazwisko r': 'nowak' };
        expect(api.findMatchingVariant(existing, variants, diffFields)).toBe(0);
    });

    it('returns -1 when no match', () => {
        const existing = { rozdział: 'Unknown chapter', 'nazwisko r': 'Nobody' };
        expect(api.findMatchingVariant(existing, variants, diffFields)).toBe(-1);
    });

    it('handles missing fields as empty strings', () => {
        const variantsWithGap = [
            { rozdział: 'A' },
            { rozdział: 'B', extra: 'x' }
        ];
        const existing = { rozdział: 'A' };
        expect(api.findMatchingVariant(existing, variantsWithGap, ['rozdział'])).toBe(0);
    });
});

// =========================================================================
//  ensurePrzypisy
// =========================================================================
describe('ensurePrzypisy', () => {
    it('returns source unchanged if Przypisy section exists', () => {
        const source = '== Przypisy ==\n{{Przypisy}}\n\n== Bibliografia ==\nstuff';
        expect(api.ensurePrzypisy(source)).toBe(source);
    });

    it('inserts Przypisy before Bibliografia when missing', () => {
        const source = 'Tekst.\n\n== Bibliografia ==\n* entries';
        const result = api.ensurePrzypisy(source);
        expect(result).toContain('== Przypisy ==');
        expect(result).toContain('{{Przypisy}}');
        expect(result.indexOf('== Przypisy ==')).toBeLessThan(result.indexOf('== Bibliografia =='));
    });

    it('returns source unchanged when no Bibliografia and no Przypisy', () => {
        const source = 'Just plain text.';
        expect(api.ensurePrzypisy(source)).toBe(source);
    });

    it('inserts === Przypisy === when Bibliografia is at level 3', () => {
        const source = '== Thread ==\nText.\n\n=== Bibliografia ===\n* {{Cytuj książkę |nazwisko=K |rok=2020}}\n';
        const result = api.ensurePrzypisy(source);
        expect(result).toContain('=== Przypisy ===');
        expect(result.indexOf('=== Przypisy ===')).toBeLessThan(result.indexOf('=== Bibliografia ==='));
    });

    it('preserves existing === Przypisy === at level 3', () => {
        const source = '== Thread ==\n=== Przypisy ===\n{{Przypisy}}\n\n=== Bibliografia ===\n* x\n';
        expect(api.ensurePrzypisy(source)).toBe(source);
    });
});

// =========================================================================
//  findEndOfArticlePos
// =========================================================================
describe('findEndOfArticlePos', () => {
    it('finds position before categories', () => {
        const source = 'Content.\n\n[[Kategoria:Test]]';
        const pos = api.findEndOfArticlePos(source);
        expect(pos).toBeGreaterThan(0);
        expect(source.slice(pos)).toContain('[[Kategoria:Test]]');
    });

    it('finds position before SORTUJ template', () => {
        const source = 'Content.\n\n{{SORTUJ:Test}}';
        const pos = api.findEndOfArticlePos(source);
        expect(pos).toBeGreaterThan(0);
        expect(source.slice(pos)).toContain('{{SORTUJ:Test}}');
    });

    it('finds position before mixed footer', () => {
        const source = 'Content.\n\n{{SORTUJ:Test}}\n[[Kategoria:A]]\n[[Kategoria:B]]';
        const pos = api.findEndOfArticlePos(source);
        expect(source.slice(pos)).toContain('{{SORTUJ:Test}}');
    });

    it('finds Linki zewnętrzne section', () => {
        const source = 'Content.\n\n== Linki zewnętrzne ==\n* link';
        const pos = api.findEndOfArticlePos(source);
        expect(source.slice(pos)).toMatch(/^== Linki zewnętrzne ==/);
    });

    it('handles trailing blank lines', () => {
        const source = 'Content.\n\n[[Kategoria:Test]]\n\n\n';
        const pos = api.findEndOfArticlePos(source);
        expect(pos).toBeGreaterThan(0);
        expect(source.slice(pos).trim()).toContain('[[Kategoria:Test]]');
    });

    it('returns -1 when no footer content', () => {
        const source = 'Just content.';
        expect(api.findEndOfArticlePos(source)).toBe(-1);
    });

    it('prefers Linki zewnętrzne over categories when earlier', () => {
        const source = 'Content.\n\n== Linki zewnętrzne ==\n* link\n\n[[Kategoria:Test]]';
        const pos = api.findEndOfArticlePos(source);
        expect(source.slice(pos)).toMatch(/^== Linki zewnętrzne ==/);
    });
});

// =========================================================================
//  insertBibliographySection
// =========================================================================
describe('insertBibliographySection', () => {
    const kowalskiEntry = '* {{Cytuj książkę| nazwisko = Kowalski| rok = 2020| tytuł = Historia}}';
    const nowakEntry = '* {{Cytuj książkę| nazwisko = Nowak| rok = 2021| tytuł = Matematyka}}';

    it('replaces existing bibliography content', () => {
        const source = [
            '== Historia ==',
            'Tekst.',
            '',
            '== Przypisy ==',
            '{{Przypisy}}',
            '',
            '== Bibliografia ==',
            '* {{Cytuj książkę | nazwisko = Old | rok = 2000}}',
        ].join('\n');

        const result = api.insertBibliographySection(source, kowalskiEntry);
        expect(result).toContain(kowalskiEntry);
        expect(result).not.toContain('nazwisko = Old');
    });

    it('preserves trailing categories and SORTUJ', () => {
        const source = [
            '== Bibliografia ==',
            '* {{Cytuj książkę | nazwisko = Old}}',
            '',
            '{{SORTUJ:Test}}',
            '[[Kategoria:Testy]]'
        ].join('\n');

        const result = api.insertBibliographySection(source, kowalskiEntry);
        expect(result).toContain(kowalskiEntry);
        expect(result).toContain('{{SORTUJ:Test}}');
        expect(result).toContain('[[Kategoria:Testy]]');
    });

    it('inserts new bibliography when none exists', () => {
        const source = 'Tekst artykułu.\n\n{{SORTUJ:Test}}\n[[Kategoria:A]]';
        const result = api.insertBibliographySection(source, kowalskiEntry);
        expect(result).toContain('== Bibliografia ==');
        expect(result).toContain(kowalskiEntry);
        expect(result).toContain('{{SORTUJ:Test}}');
        expect(result).toContain('[[Kategoria:A]]');
    });

    it('auto-inserts Przypisy when adding new bibliography', () => {
        const source = 'Tekst artykułu.\n\n[[Kategoria:A]]';
        const result = api.insertBibliographySection(source, kowalskiEntry);
        expect(result).toContain('== Przypisy ==');
        expect(result).toContain('{{Przypisy}}');
    });

    it('updates content inside an existing === Bibliografia === (level 3)', () => {
        const source = '== Thread ==\nText.\n\n=== Bibliografia ===\n* {{Cytuj książkę |nazwisko=Old |rok=2000}}\n';
        const newEntry = '* {{Cytuj książkę |nazwisko=Nowy |rok=2024}}';
        const result = api.insertBibliographySection(source, newEntry);
        expect(result).toContain('=== Bibliografia ===');
        expect(result).toContain('nazwisko=Nowy');
        expect(result).not.toContain('nazwisko=Old');
    });

    it('creates === Bibliografia === / === Przypisy === when source is a level-2 section (section-edit mode)', () => {
        const source = '== Thread ==\nDiscussion only.\n';
        const newEntry = '* {{Cytuj książkę |nazwisko=X |rok=2020}}';
        const result = api.insertBibliographySection(source, newEntry);
        const bibHeaders = result.match(/={2,3} Bibliografia ={2,3}/g) || [];
        const przypHeaders = result.match(/={2,3} Przypisy ={2,3}/g) || [];
        expect(bibHeaders).toEqual(['=== Bibliografia ===']);
        expect(przypHeaders).toEqual(['=== Przypisy ===']);
    });

    it('creates level-2 sections in normal whole-page context (no enclosing section)', () => {
        const source = 'Article intro paragraph.\n';
        const newEntry = '* {{Cytuj książkę |nazwisko=X |rok=2020}}';
        const result = api.insertBibliographySection(source, newEntry);
        const bibHeaders = result.match(/={2,3} Bibliografia ={2,3}/g) || [];
        const przypHeaders = result.match(/={2,3} Przypisy ={2,3}/g) || [];
        expect(bibHeaders).toEqual(['== Bibliografia ==']);
        expect(przypHeaders).toEqual(['== Przypisy ==']);
    });

    it('does not duplicate Przypisy if already present', () => {
        const source = [
            '== Przypisy ==',
            '{{Przypisy}}',
            '',
            '== Bibliografia ==',
            '* {{Cytuj książkę | nazwisko = Old}}'
        ].join('\n');
        const result = api.insertBibliographySection(source, kowalskiEntry);
        const matches = result.match(/== Przypisy ==/g);
        expect(matches).toHaveLength(1);
    });

    it('preserves subsections within bibliography', () => {
        const source = [
            '== Bibliografia ==',
            '* {{Cytuj książkę | nazwisko = Main}}',
            '=== Źródła ===',
            '* {{Cytuj książkę | nazwisko = Nested}}'
        ].join('\n');
        const result = api.insertBibliographySection(source, kowalskiEntry);
        expect(result).toContain(kowalskiEntry);
        expect(result).toContain('=== Źródła ===');
        expect(result).toContain('nazwisko = Nested');
    });

    it('clears bibliography when entries is empty/falsy', () => {
        const source = [
            '== Bibliografia ==',
            '* {{Cytuj książkę | nazwisko = Old}}'
        ].join('\n');
        const result = api.insertBibliographySection(source, '');
        expect(result).not.toContain('nazwisko = Old');
        expect(result).toContain('== Bibliografia ==');
    });

    it('handles bibliography section with no entries (only trailing content)', () => {
        const source = [
            '== Bibliografia ==',
            '',
            '{{SORTUJ:Test}}'
        ].join('\n');
        const result = api.insertBibliographySection(source, kowalskiEntry);
        expect(result).toContain(kowalskiEntry);
        expect(result).toContain('{{SORTUJ:Test}}');
    });

    it('returns source unchanged when no bib and no entries', () => {
        const source = 'Plain article text.';
        expect(api.insertBibliographySection(source, '')).toBe(source);
    });

    it('handles the full test article scenario', () => {
        const source = [
            "'''Testowy artykuł''' – artykuł do testowania.",
            '',
            '== Historia ==',
            'Opis historii.',
            '',
            '== Przypisy ==',
            '{{Przypisy}}',
            '',
            '== Bibliografia ==',
            '* {{Cytuj książkę | nazwisko = Kowalski | imię = Jan | tytuł = Historia Polski | rok = 2020 | wydawca = PWN | miejsce = Warszawa | isbn = 9781234567890 | odn = tak}}',
            '',
            '{{SORTUJ:Testowy artykuł}}',
            '[[Kategoria:Testy]]'
        ].join('\n');

        const entries = kowalskiEntry + '\n' + nowakEntry;
        const result = api.insertBibliographySection(source, entries);

        expect(result).toContain(kowalskiEntry);
        expect(result).toContain(nowakEntry);
        expect(result).toContain('{{SORTUJ:Testowy artykuł}}');
        expect(result).toContain('[[Kategoria:Testy]]');
        expect(result.match(/== Przypisy ==/g)).toHaveLength(1);
        expect(result.indexOf('== Przypisy ==')).toBeLessThan(result.indexOf('== Bibliografia =='));
    });

    it('inserts bibliography at end when no footer', () => {
        const source = 'Article with no footer.';
        const result = api.insertBibliographySection(source, kowalskiEntry);
        expect(result).toContain('== Bibliografia ==');
        expect(result).toContain(kowalskiEntry);
    });

    it('handles multiple entries being added', () => {
        const source = [
            '== Bibliografia ==',
            '* {{Cytuj książkę | nazwisko = Existing}}'
        ].join('\n');
        const entries = kowalskiEntry + '\n' + nowakEntry;
        const result = api.insertBibliographySection(source, entries);
        expect(result).toContain('Kowalski');
        expect(result).toContain('Nowak');
        expect(result).not.toContain('Existing');
    });
});

// =========================================================================
//  Integration: full workflow simulation
// =========================================================================
describe('integration: parse source → select books → insert', () => {
    it('end-to-end: parse article, add books, produce new wikitext', () => {
        const article = [
            "'''Artykuł''' – tekst.",
            '',
            '== Przypisy ==',
            '{{Przypisy}}',
            '',
            '== Bibliografia ==',
            '* {{Cytuj książkę | nazwisko = Kowalski | rok = 2020 | tytuł = Historia | odn = tak}}',
            '',
            '{{SORTUJ:Artykuł}}',
            '[[Kategoria:Test]]'
        ].join('\n');

        const existing = api.parseExistingBibliography(article);
        expect(existing.main).toHaveLength(1);

        const newBook = {
            _templateName: 'Cytuj książkę',
            nazwisko: 'Nowak',
            rok: '2021',
            tytuł: 'Matematyka',
            odn: 'tak'
        };
        const allBooks = [...existing.main, newBook];
        const bibEntries = api.buildBibEntries(allBooks);
        const result = api.insertBibliographySection(article, bibEntries);

        expect(result).toContain('nazwisko=Kowalski');
        expect(result).toContain('nazwisko=Nowak');
        expect(result).toContain('{{SORTUJ:Artykuł}}');
        expect(result).toContain('[[Kategoria:Test]]');
    });

    it('end-to-end: variant selection workflow', () => {
        const sourceBooks = [
            { _templateName: 'Cytuj książkę', nazwisko: 'Wimmer (red.)', tytuł: 'Wojna', data: '1973', rozdział: 'Chapter A', 'nazwisko r': 'Nowak' },
            { _templateName: 'Cytuj książkę', nazwisko: 'Wimmer (red.)', tytuł: 'Wojna', data: '1973', rozdział: 'Chapter B', 'nazwisko r': 'Herbst' },
            { _templateName: 'Cytuj książkę', nazwisko: 'Wimmer (red.)', tytuł: 'Wojna', data: '1973', rozdział: 'Chapter C', 'nazwisko r': 'Podhorodecki' }
        ];

        expect(api.bookKey(sourceBooks[0])).toBe(api.bookKey(sourceBooks[1]));
        expect(api.bookKey(sourceBooks[1])).toBe(api.bookKey(sourceBooks[2]));

        const diffFields = api.findDifferingFields(sourceBooks);
        expect(diffFields).toContain('rozdział');
        expect(diffFields).toContain('nazwisko r');

        const label0 = api.variantLabel(sourceBooks[0], diffFields);
        expect(label0).toBe('Chapter A (Nowak)');
        const label2 = api.variantLabel(sourceBooks[2], diffFields);
        expect(label2).toBe('Chapter C (Podhorodecki)');

        const selectedVariant = sourceBooks[1];
        const bibEntries = api.buildBibEntries([selectedVariant]);
        expect(bibEntries).toContain('rozdział=Chapter B');
        expect(bibEntries).toContain('nazwisko r=Herbst');

        const article = 'Tekst.\n\n[[Kategoria:Test]]';
        const result = api.insertBibliographySection(article, bibEntries);
        expect(result).toContain('== Bibliografia ==');
        expect(result).toContain('Chapter B');
    });

    it('end-to-end: pre-select existing variant', () => {
        const variants = [
            { rozdział: 'Operacja krakowska', 'nazwisko r': 'Nowak' },
            { rozdział: 'Kampania 1659', 'nazwisko r': 'Podhorodecki' }
        ];
        const diffFields = api.findDifferingFields(variants);

        const existing = { rozdział: 'Kampania 1659', 'nazwisko r': 'Podhorodecki', nazwisko: 'Wimmer' };
        const matchIdx = api.findMatchingVariant(existing, variants, diffFields);
        expect(matchIdx).toBe(1);
    });

    it('end-to-end: build odn reference from parsed book', () => {
        const template = '{{Cytuj książkę | nazwisko = Kowalski | rok = 2020 | tytuł = Historia | odn = tak}}';
        const book = api.parseTemplate(template);
        const odn = api.buildOdnString(book, '42');
        expect(odn).toBe('{{odn|Kowalski|2020|s=42}}');
    });
});

// =========================================================================
//  ensureOdn
// =========================================================================
describe('ensureOdn', () => {
    it('adds odn = tak when odn is missing', () => {
        const book = { nazwisko: 'Kowalski', rok: '2020' };
        api.ensureOdn(book);
        expect(book.odn).toBe('tak');
    });

    it('does not modify when odn is already tak', () => {
        const book = { nazwisko: 'Kowalski', rok: '2020', odn: 'tak' };
        api.ensureOdn(book);
        expect(book.odn).toBe('tak');
    });

    it('does not modify when odn is a single letter', () => {
        const book = { nazwisko: 'Kowalski', rok: '2020', odn: 'a' };
        api.ensureOdn(book);
        expect(book.odn).toBe('a');
    });

    it('does not modify when odn is odn/id template', () => {
        const book = { nazwisko: 'Kowalski', odn: '{{odn/id|ABC|2020}}' };
        api.ensureOdn(book);
        expect(book.odn).toBe('{{odn/id|ABC|2020}}');
    });

    it('adds odn = tak when odn is empty string', () => {
        const book = { nazwisko: 'Kowalski', odn: '' };
        api.ensureOdn(book);
        expect(book.odn).toBe('tak');
    });

    it('returns the book object for chaining', () => {
        const book = { nazwisko: 'Kowalski' };
        expect(api.ensureOdn(book)).toBe(book);
    });
});

// =========================================================================
//  fixMissingOdn
// =========================================================================
describe('fixMissingOdn', () => {
    it('fixes books missing odn and returns count', () => {
        const books = [
            { nazwisko: 'Kowalski', rok: '2020' },
            { nazwisko: 'Nowak', rok: '2021', odn: 'tak' }
        ];
        const result = api.fixMissingOdn(books);
        expect(result.count).toBe(1);
        expect(result.books[0].odn).toBe('tak');
        expect(result.books[1].odn).toBe('tak');
    });

    it('returns 0 count when all books already have odn', () => {
        const books = [
            { nazwisko: 'Kowalski', odn: 'tak' },
            { nazwisko: 'Nowak', odn: 'a' }
        ];
        const result = api.fixMissingOdn(books);
        expect(result.count).toBe(0);
    });

    it('handles empty array', () => {
        const result = api.fixMissingOdn([]);
        expect(result.count).toBe(0);
        expect(result.books).toEqual([]);
    });

    it('fixes multiple books missing odn', () => {
        const books = [
            { nazwisko: 'A' },
            { nazwisko: 'B' },
            { nazwisko: 'C', odn: 'tak' }
        ];
        const result = api.fixMissingOdn(books);
        expect(result.count).toBe(2);
        expect(result.books[0].odn).toBe('tak');
        expect(result.books[1].odn).toBe('tak');
    });

    it('preserves odn letters and odn/id templates', () => {
        const books = [
            { nazwisko: 'A', odn: 'k' },
            { nazwisko: 'B', odn: '{{odn/id|X|2020}}' },
            { nazwisko: 'C' }
        ];
        const result = api.fixMissingOdn(books);
        expect(result.count).toBe(1);
        expect(result.books[0].odn).toBe('k');
        expect(result.books[1].odn).toBe('{{odn/id|X|2020}}');
        expect(result.books[2].odn).toBe('tak');
    });
});

// =========================================================================
//  findDuplicateBooks
// =========================================================================
describe('findDuplicateBooks', () => {
    it('returns empty array for unique books', () => {
        const books = [
            { nazwisko: 'Kowalski', rok: '2020', tytuł: 'A' },
            { nazwisko: 'Nowak', rok: '2021', tytuł: 'B' }
        ];
        expect(api.findDuplicateBooks(books)).toEqual([]);
    });

    it('detects duplicate books with same key and no distinguishing features', () => {
        const books = [
            { nazwisko: 'Kowalski', rok: '2020', tytuł: 'Historia' },
            { nazwisko: 'Kowalski', rok: '2020', tytuł: 'Historia' }
        ];
        const result = api.findDuplicateBooks(books);
        expect(result).toHaveLength(1);
        expect(result[0].count).toBe(2);
    });

    it('does not flag books with different chapters as duplicates', () => {
        const books = [
            { nazwisko: 'Wimmer', tytuł: 'Wojna', rozdział: 'Ch1' },
            { nazwisko: 'Wimmer', tytuł: 'Wojna', rozdział: 'Ch2' }
        ];
        expect(api.findDuplicateBooks(books)).toEqual([]);
    });

    it('does not flag books with odn letters as duplicates', () => {
        const books = [
            { nazwisko: 'Kowalski', rok: '2020', tytuł: 'Historia', odn: 'a' },
            { nazwisko: 'Kowalski', rok: '2020', tytuł: 'Historia', odn: 'b' }
        ];
        expect(api.findDuplicateBooks(books)).toEqual([]);
    });

    it('does not flag books with odn/id as duplicates', () => {
        const books = [
            { nazwisko: 'Kowalski', rok: '2020', tytuł: 'H', odn: '{{odn/id|ABC|2020}}' },
            { nazwisko: 'Kowalski', rok: '2020', tytuł: 'H', odn: '{{odn/id|DEF|2020}}' }
        ];
        expect(api.findDuplicateBooks(books)).toEqual([]);
    });

    it('returns label from bookLabel for the duplicate group', () => {
        const books = [
            { nazwisko: 'Kowalski', rok: '2020', tytuł: 'Historia' },
            { nazwisko: 'Kowalski', rok: '2020', tytuł: 'Historia' }
        ];
        const result = api.findDuplicateBooks(books);
        expect(result[0].label).toBe('Kowalski (2020) — Historia');
    });

    it('handles mix of distinguished and undistinguished books', () => {
        const books = [
            { nazwisko: 'Kowalski', rok: '2020', tytuł: 'H', rozdział: 'Ch1' },
            { nazwisko: 'Kowalski', rok: '2020', tytuł: 'H' },
            { nazwisko: 'Kowalski', rok: '2020', tytuł: 'H' }
        ];
        const result = api.findDuplicateBooks(books);
        expect(result).toHaveLength(1);
        expect(result[0].count).toBe(2);
    });

    it('returns empty for single book', () => {
        const books = [{ nazwisko: 'Kowalski', rok: '2020', tytuł: 'H' }];
        expect(api.findDuplicateBooks(books)).toEqual([]);
    });
});

// =========================================================================
//  buildOdnNotification
// =========================================================================
describe('buildOdnNotification', () => {
    it('returns message for article-only fixes', () => {
        const msg = api.buildOdnNotification(2, 0);
        expect(msg).toContain('(2)');
        expect(msg).toContain('w artykule');
        expect(msg).not.toContain('strony źródłowej');
    });

    it('returns message for source-only fixes', () => {
        const msg = api.buildOdnNotification(0, 1);
        expect(msg).toContain('(1)');
        expect(msg).toContain('strony źródłowej');
        expect(msg).not.toContain('w artykule');
    });

    it('returns message for both article and source fixes', () => {
        const msg = api.buildOdnNotification(2, 1);
        expect(msg).toContain('(2)');
        expect(msg).toContain('w artykule');
        expect(msg).toContain('(1)');
        expect(msg).toContain('strony źródłowej');
        expect(msg).toContain('oraz');
    });

    it('returns null when no fixes needed', () => {
        expect(api.buildOdnNotification(0, 0)).toBeNull();
    });

    it('uses "brakujących" for many (5+)', () => {
        const msg = api.buildOdnNotification(5, 0);
        expect(msg).toContain('brakujących');
    });

    it('uses "brakujące" for few (2-4)', () => {
        const msg = api.buildOdnNotification(2, 0);
        expect(msg).toContain('brakujące');
    });

    it('uses "brakujące" for one (1)', () => {
        const msg = api.buildOdnNotification(1, 0);
        expect(msg).toContain('brakujące');
    });

    it('starts with "Dodano"', () => {
        const msg = api.buildOdnNotification(1, 0);
        expect(msg).toMatch(/^Dodano /);
    });

    it('ends with a period', () => {
        const msg = api.buildOdnNotification(1, 1);
        expect(msg).toMatch(/\.$/);
    });

    it('contains odn = tak in the message', () => {
        const msg = api.buildOdnNotification(3, 0);
        expect(msg).toContain('odn = tak');
    });
});

// =========================================================================
//  sortKey
// =========================================================================
describe('sortKey', () => {
    it('mirrors the odn identifier (lastname + year, lowercase)', () => {
        const book = { nazwisko: 'Kowalski', rok: '2020' };
        expect(api.sortKey(book)).toBe('kowalski|2020');
    });

    it('includes multiple authors in order', () => {
        const book = { nazwisko: 'Kowalski', nazwisko2: 'Nowak', rok: '2020' };
        expect(api.sortKey(book)).toBe('kowalski|nowak|2020');
    });

    it('falls back to data when rok is missing', () => {
        const book = { nazwisko: 'Wimmer', data: '2018' };
        expect(api.sortKey(book)).toBe('wimmer|2018');
    });

    it('handles books with no author/year gracefully', () => {
        expect(api.sortKey({})).toBe('');
    });

    it('uses positional identifier when present', () => {
        const book = { _positional: ['Wimmer2018', 'rozdz. 3'] };
        expect(api.sortKey(book)).toBe('wimmer2018|rozdz. 3');
    });

    it('appends variant letter suffix from odn (a/b/c) to year', () => {
        const book = { nazwisko: 'Kowalski', rok: '2020', odn: 'a' };
        expect(api.sortKey(book)).toBe('kowalski|2020a');
    });

    it('prefers nazwisko (volume editor) over nazwisko r (chapter author)', () => {
        const book = { nazwisko: 'Wimmer (red.)', 'nazwisko r': 'Herbst', data: '1973' };
        expect(api.sortKey(book)).toBe('wimmer (red.)|1973');
    });

    it('falls back to nazwisko r only when no nazwisko is present', () => {
        const book = { 'nazwisko r': 'Herbst', data: '1973' };
        expect(api.sortKey(book)).toBe('herbst|1973');
    });
});

// =========================================================================
//  sortBooks
// =========================================================================
describe('sortBooks', () => {
    it('sorts by lastname then year ascending', () => {
        const books = [
            { nazwisko: 'Nowak', rok: '2010' },
            { nazwisko: 'Adamski', rok: '2020' },
            { nazwisko: 'Kowalski', rok: '2015' }
        ];
        const sorted = api.sortBooks(books);
        expect(sorted.map(b => b.nazwisko)).toEqual(['Adamski', 'Kowalski', 'Nowak']);
    });

    it('puts older year before newer for the same author', () => {
        const books = [
            { nazwisko: 'Kowalski', rok: '2020' },
            { nazwisko: 'Kowalski', rok: '2010' }
        ];
        const sorted = api.sortBooks(books);
        expect(sorted.map(b => b.rok)).toEqual(['2010', '2020']);
    });

    it('returns a new array and does not mutate the input', () => {
        const books = [
            { nazwisko: 'Nowak' },
            { nazwisko: 'Adamski' }
        ];
        const original = books.slice();
        const sorted = api.sortBooks(books);
        expect(books).toEqual(original);
        expect(sorted).not.toBe(books);
    });

    it('sorts Polish letters with locale collation', () => {
        const books = [
            { nazwisko: 'Żak' },
            { nazwisko: 'Ćwirko' },
            { nazwisko: 'Łabęcki' },
            { nazwisko: 'Adamski' }
        ];
        const sorted = api.sortBooks(books);
        expect(sorted.map(b => b.nazwisko)).toEqual(['Adamski', 'Ćwirko', 'Łabęcki', 'Żak']);
    });

    it('handles an empty array', () => {
        expect(api.sortBooks([])).toEqual([]);
    });
});

// =========================================================================
//  loadSetting / saveSetting
// =========================================================================
describe('settings persistence', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('returns the default when the key is not set', () => {
        expect(api.loadSetting('sort', false)).toBe(false);
        expect(api.loadSetting('whatever', 'def')).toBe('def');
    });

    it('persists boolean values across save/load', () => {
        api.saveSetting('sort', true);
        expect(api.loadSetting('sort', false)).toBe(true);
    });

    it('uses the CitationHelper_ prefix in localStorage', () => {
        api.saveSetting('sort', true);
        expect(localStorage.getItem('CitationHelper_sort')).toBe('true');
    });

    it('persists and restores complex values (objects, arrays)', () => {
        api.saveSetting('opts', { a: 1, b: [true, 'x'] });
        expect(api.loadSetting('opts', null)).toEqual({ a: 1, b: [true, 'x'] });
    });

    it('returns the default when stored JSON is corrupted', () => {
        localStorage.setItem('CitationHelper_broken', '{not json');
        expect(api.loadSetting('broken', 'fallback')).toBe('fallback');
    });
});

// =========================================================================
//  refName
// =========================================================================
describe('refName', () => {
    it('builds Surname_Year format', () => {
        expect(api.refName({ nazwisko: 'Kowalski', rok: '2020' })).toBe('Kowalski_2020');
    });

    it('uses data as fallback for year', () => {
        expect(api.refName({ nazwisko: 'Woś', data: '2023' })).toBe('Woś_2023');
    });

    it('joins multiple surnames with underscore', () => {
        expect(api.refName({ nazwisko: 'Kowalski', nazwisko2: 'Nowak', rok: '2020' })).toBe('Kowalski_Nowak_2020');
    });

    it('falls back to nazwisko r when no nazwisko', () => {
        expect(api.refName({ 'nazwisko r': 'Herbst', data: '1973' })).toBe('Herbst_1973');
    });

    it('prefers nazwisko over nazwisko r (bibliography author wins)', () => {
        expect(api.refName({ nazwisko: 'Wimmer (red.)', 'nazwisko r': 'Herbst', data: '1973' })).toBe('Wimmer_red_1973');
    });

    it('appends variant letter from odn (a/b/c) to year', () => {
        expect(api.refName({ nazwisko: 'Kowalski', rok: '2020', odn: 'a' })).toBe('Kowalski_2020a');
    });

    it('handles _positional identifiers', () => {
        expect(api.refName({ _positional: ['Wimmer2018', 'rozdz. 3'] })).toBe('Wimmer2018_rozdz_3');
    });
});

// =========================================================================
//  buildSubRefString
// =========================================================================
describe('buildSubRefString', () => {
    it('builds a self-closing <ref name="X" details="s. N" /> when page given', () => {
        const book = { nazwisko: 'Kowalski', rok: '2020' };
        expect(api.buildSubRefString(book, '42')).toBe('<ref name="Kowalski_2020" details="s. 42" />');
    });

    it('omits details when no page given', () => {
        const book = { nazwisko: 'Kowalski', rok: '2020' };
        expect(api.buildSubRefString(book)).toBe('<ref name="Kowalski_2020" />');
    });
});

// =========================================================================
//  buildReferencesBlock
// =========================================================================
describe('buildReferencesBlock', () => {
    it('wraps each book in <ref name="X">{{Cytuj...}}</ref> inside <references>', () => {
        const books = [
            { _templateName: 'Cytuj książkę', nazwisko: 'Kowalski', rok: '2020' },
            { _templateName: 'Cytuj książkę', nazwisko: 'Nowak', rok: '2019' }
        ];
        const result = api.buildReferencesBlock(books);
        expect(result).toBe(
            '<references>\n' +
            '<ref name="Kowalski_2020">{{Cytuj książkę |nazwisko=Kowalski |rok=2020}}</ref>\n' +
            '<ref name="Nowak_2019">{{Cytuj książkę |nazwisko=Nowak |rok=2019}}</ref>\n' +
            '</references>'
        );
    });

    it('produces an empty references block for no books', () => {
        expect(api.buildReferencesBlock([])).toBe('<references>\n</references>');
    });

    it('strips _refName from the inner template (it is the wrapper attribute)', () => {
        const books = [{ _templateName: 'Cytuj książkę', _refName: 'X', nazwisko: 'A', rok: '2020' }];
        const result = api.buildReferencesBlock(books);
        expect(result).not.toContain('_refName');
        expect(result).toContain('<ref name="A_2020">{{Cytuj książkę |nazwisko=A |rok=2020}}</ref>');
    });
});

// =========================================================================
//  parseSubReferences
// =========================================================================
describe('parseSubReferences', () => {
    it('extracts books from <references><ref>{{Cytuj...}}</ref></references>', () => {
        const source = '== Przypisy ==\n<references>\n<ref name="K_2020">{{Cytuj książkę |nazwisko=Kowalski |rok=2020}}</ref>\n<ref name="N_2019">{{Cytuj książkę |nazwisko=Nowak |rok=2019}}</ref>\n</references>\n';
        const books = api.parseSubReferences(source);
        expect(books).toHaveLength(2);
        expect(books[0].nazwisko).toBe('Kowalski');
        expect(books[0]._refName).toBe('K_2020');
        expect(books[1].nazwisko).toBe('Nowak');
        expect(books[1]._refName).toBe('N_2019');
    });

    it('returns empty array when no <references> block exists', () => {
        expect(api.parseSubReferences('Just text.')).toEqual([]);
    });

    it('returns empty array for self-closing <references />', () => {
        expect(api.parseSubReferences('<references />')).toEqual([]);
    });

    it('skips refs without {{Cytuj...}} content (plain refs)', () => {
        const source = '<references>\n<ref name="foo">Just a note</ref>\n<ref name="bar">{{Cytuj książkę |nazwisko=X |rok=2020}}</ref>\n</references>';
        const books = api.parseSubReferences(source);
        expect(books).toHaveLength(1);
        expect(books[0].nazwisko).toBe('X');
    });
});

// =========================================================================
//  insertReferencesSection (sub-ref mode)
// =========================================================================
describe('insertReferencesSection', () => {
    const books = [{ _templateName: 'Cytuj książkę', nazwisko: 'Kowalski', rok: '2020' }];

    it('replaces an existing <references> block', () => {
        const source = '== Przypisy ==\n<references>\n<ref name="Old_1990">{{Cytuj książkę |nazwisko=Old |rok=1990}}</ref>\n</references>\n';
        const result = api.insertReferencesSection(source, books);
        expect(result).toContain('<ref name="Kowalski_2020">');
        expect(result).not.toContain('nazwisko=Old');
        expect(result.match(/<references>/g)).toHaveLength(1);
    });

    it('replaces self-closing <references /> with a full block', () => {
        const source = '== Przypisy ==\n<references />\n';
        const result = api.insertReferencesSection(source, books);
        expect(result).toContain('<references>');
        expect(result).toContain('<ref name="Kowalski_2020">');
        expect(result).toContain('</references>');
        expect(result).not.toContain('<references />');
    });

    it('replaces {{Przypisy}} template with a <references> block', () => {
        const source = '== Przypisy ==\n{{Przypisy}}\n';
        const result = api.insertReferencesSection(source, books);
        expect(result).toContain('<references>');
        expect(result).toContain('<ref name="Kowalski_2020">');
        expect(result).not.toContain('{{Przypisy}}');
    });

    it('creates a new == Przypisy == section when none exists', () => {
        const source = 'Article body.\n';
        const result = api.insertReferencesSection(source, books);
        expect(result).toContain('== Przypisy ==');
        expect(result).toContain('<references>');
        expect(result).toContain('<ref name="Kowalski_2020">');
    });

    it('removes a legacy == Bibliografia == section when migrating to sub-ref mode', () => {
        const source = 'Body.\n\n== Przypisy ==\n{{Przypisy}}\n\n== Bibliografia ==\n* {{Cytuj książkę |nazwisko=Old |rok=2000 |odn=tak}}\n';
        const result = api.insertReferencesSection(source, books);
        expect(result).not.toContain('== Bibliografia ==');
        expect(result).toContain('<references>');
        expect(result).toContain('<ref name="Kowalski_2020">');
    });

    it('uses level 3 when inside a discussion thread (section-edit mode)', () => {
        const source = '== Thread ==\nDiscussion.\n';
        const result = api.insertReferencesSection(source, books);
        expect(result).toContain('=== Przypisy ===');
        expect(result).toContain('<references>');
    });
});

// =========================================================================
//  migrateOdnToSubRefs (inline migration from {{odn|...}} to <ref ... />)
// =========================================================================
describe('migrateOdnToSubRefs', () => {
    it('converts {{odn|Surname|Year}} to a self-closing <ref name="Surname_Year" />', () => {
        const source = 'Tekst{{odn|Kowalski|2020}}.';
        const result = api.migrateOdnToSubRefs(source);
        expect(result).toBe('Tekst<ref name="Kowalski_2020" />.');
    });

    it('converts {{odn|Surname|Year|s=N}} to <ref name="..." details="s. N" />', () => {
        const source = 'Tekst{{odn|Nowak|2019|s=5}}.';
        const result = api.migrateOdnToSubRefs(source);
        expect(result).toBe('Tekst<ref name="Nowak_2019" details="s. 5" />.');
    });

    it('handles multiple authors in odn', () => {
        const source = 'X{{odn|Kowalski|Nowak|2020|s=42}}.';
        expect(api.migrateOdnToSubRefs(source))
            .toBe('X<ref name="Kowalski_Nowak_2020" details="s. 42" />.');
    });

    it('handles odn with variant year (2020a)', () => {
        const source = 'Y{{odn|Kowalski|2020a|s=12}}.';
        expect(api.migrateOdnToSubRefs(source))
            .toBe('Y<ref name="Kowalski_2020a" details="s. 12" />.');
    });

    it('migrates every occurrence in the source', () => {
        const source = '{{odn|A|2020}} oraz {{odn|B|2021|s=7}}.';
        const result = api.migrateOdnToSubRefs(source);
        expect(result).toBe('<ref name="A_2020" /> oraz <ref name="B_2021" details="s. 7" />.');
    });

    it('preserves text without odn templates unchanged', () => {
        const source = 'Plain text with <ref name="x">Note</ref>.';
        expect(api.migrateOdnToSubRefs(source)).toBe(source);
    });

    it('sanitizes special characters in the ref name (spaces, punctuation)', () => {
        const source = 'Y{{odn|Wimmer (red.)|1973|s=5}}.';
        expect(api.migrateOdnToSubRefs(source))
            .toBe('Y<ref name="Wimmer_red_1973" details="s. 5" />.');
    });
});

// =========================================================================
//  removeUnusedReferences
// =========================================================================
describe('removeUnusedReferences', () => {
    it('removes a <ref> from <references> when its name is not used in the body', () => {
        const source = 'Tekst.\n<references>\n<ref name="A">A def</ref>\n<ref name="B">B def</ref>\n</references>';
        const result = api.removeUnusedReferences(source);
        expect(result).not.toContain('A def');
        expect(result).not.toContain('B def');
        expect(result).toContain('<references>');
        expect(result).toContain('</references>');
    });

    it('keeps refs that are used as self-closing <ref name="X" /> in the body', () => {
        const source = 'Tekst<ref name="A" details="s. 5" />.\n<references>\n<ref name="A">A def</ref>\n<ref name="B">B def</ref>\n</references>';
        const result = api.removeUnusedReferences(source);
        expect(result).toContain('A def');
        expect(result).not.toContain('B def');
    });

    it('keeps refs that are used as <ref name="X">inline</ref> in the body', () => {
        const source = '<ref name="X">inline</ref>.\n<references>\n<ref name="X">def X</ref>\n<ref name="Y">def Y</ref>\n</references>';
        const result = api.removeUnusedReferences(source);
        expect(result).toContain('def X');
        expect(result).not.toContain('def Y');
    });

    it('returns source unchanged when there is no <references> block', () => {
        const source = 'Just text.';
        expect(api.removeUnusedReferences(source)).toBe(source);
    });

    it('returns source unchanged when every defined ref is used', () => {
        const source = '<ref name="A" />.\n<references>\n<ref name="A">A def</ref>\n</references>';
        expect(api.removeUnusedReferences(source)).toBe(source);
    });

    it('does not consider definitions inside <references> as "uses"', () => {
        // The defining <ref name="A">...</ref> inside <references> must NOT count as a usage.
        const source = '<references>\n<ref name="A">A def</ref>\n</references>';
        const result = api.removeUnusedReferences(source);
        expect(result).not.toContain('A def');
    });

    it('collapses extra blank lines after removing entries', () => {
        const source = 'Tekst<ref name="A" />.\n<references>\n<ref name="A">A def</ref>\n<ref name="B">B def</ref>\n<ref name="C">C def</ref>\n</references>';
        const result = api.removeUnusedReferences(source);
        expect(result).not.toMatch(/\n{3,}/);
    });
});
