import { describe, it, expect, beforeAll } from 'vitest';

let api;

beforeAll(async () => {
    await import('../mass-message.js');
    api = globalThis.massMessage.api;
});

// =========================================================================
//  userNamespace
// =========================================================================
describe('userNamespace', () => {
    it('returns Wikipedystka for female', () => {
        expect(api.userNamespace('female')).toBe('Wikipedystka');
    });

    it('returns Wikipedysta for male', () => {
        expect(api.userNamespace('male')).toBe('Wikipedysta');
    });

    it('returns Wikipedysta for unknown or undefined gender', () => {
        expect(api.userNamespace()).toBe('Wikipedysta');
        expect(api.userNamespace('unknown')).toBe('Wikipedysta');
    });
});

// =========================================================================
//  userReference
// =========================================================================
describe('userReference', () => {
    it('builds gendered reference for female user', () => {
        expect(api.userReference({ name: 'EwkaC', gender: 'female' })).toBe('Wikipedystka:EwkaC');
    });

    it('builds reference for male user', () => {
        expect(api.userReference({ name: 'Gdarin', gender: 'male' })).toBe('Wikipedysta:Gdarin');
    });

    it('handles names with spaces', () => {
        expect(api.userReference({ name: 'Katarzyna Makowska (WMPL)', gender: 'female' }))
            .toBe('Wikipedystka:Katarzyna Makowska (WMPL)');
    });
});

// =========================================================================
//  parseUserLink
// =========================================================================
describe('parseUserLink', () => {
    it('parses interwiki male link title', () => {
        expect(api.parseUserLink('w:Wikipedysta:ptjacky')).toEqual({ name: 'ptjacky', gender: 'male' });
    });

    it('parses interwiki female link title', () => {
        expect(api.parseUserLink('w:Wikipedystka:EwkaC')).toEqual({ name: 'EwkaC', gender: 'female' });
    });

    it('parses plain (non-interwiki) link title', () => {
        expect(api.parseUserLink('Wikipedysta:Gdarin')).toEqual({ name: 'Gdarin', gender: 'male' });
    });

    it('parses username with spaces and parentheses', () => {
        expect(api.parseUserLink('w:Wikipedystka:Katarzyna Makowska (WMPL)'))
            .toEqual({ name: 'Katarzyna Makowska (WMPL)', gender: 'female' });
    });

    it('returns null for non-user titles', () => {
        expect(api.parseUserLink('Some Article')).toBeNull();
        expect(api.parseUserLink('Pomoc:Spis treści')).toBeNull();
    });

    it('returns null for empty title', () => {
        expect(api.parseUserLink('')).toBeNull();
        expect(api.parseUserLink(null)).toBeNull();
    });
});

// =========================================================================
//  parseUsers
// =========================================================================
describe('parseUsers', () => {
    function container(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div;
    }

    it('extracts the real username from the title, not the display text', () => {
        const c = container('<a title="w:Wikipedysta:ptjacky">ptjackyll</a>');
        expect(api.parseUsers(c)).toEqual([{ name: 'ptjacky', gender: 'male' }]);
    });

    it('extracts gender from the namespace', () => {
        const c = container(
            '<a title="w:Wikipedystka:EwkaC">EwkaC</a>' +
            '<a title="w:Wikipedysta:Gdarin">Gdarin</a>'
        );
        expect(api.parseUsers(c)).toEqual([
            { name: 'EwkaC', gender: 'female' },
            { name: 'Gdarin', gender: 'male' }
        ]);
    });

    it('deduplicates by username', () => {
        const c = container(
            '<a title="w:Wikipedysta:Gdarin">G</a>' +
            '<a title="w:Wikipedysta:Gdarin">Gdarin</a>'
        );
        expect(api.parseUsers(c)).toEqual([{ name: 'Gdarin', gender: 'male' }]);
    });

    it('ignores non-user links', () => {
        const c = container(
            '<a title="Some Article">x</a>' +
            '<a title="w:Wikipedysta:Gdarin">G</a>'
        );
        expect(api.parseUsers(c)).toEqual([{ name: 'Gdarin', gender: 'male' }]);
    });

    it('returns an empty array when there are no user links', () => {
        expect(api.parseUsers(container('<p>brak linków</p>'))).toEqual([]);
    });
});

// =========================================================================
//  stripUserNamespace
// =========================================================================
describe('stripUserNamespace', () => {
    it('strips a gendered namespace prefix', () => {
        expect(api.stripUserNamespace('Wikipedystka:EwkaC')).toBe('EwkaC');
        expect(api.stripUserNamespace('Wikipedysta:Gdarin')).toBe('Gdarin');
    });

    it('returns a bare username unchanged', () => {
        expect(api.stripUserNamespace('Gdarin')).toBe('Gdarin');
    });
});

// =========================================================================
//  pageMatches
// =========================================================================
describe('pageMatches', () => {
    it('matches an exact page in the pages list', () => {
        expect(api.pageMatches('Wzlot_2026/Uczestnicy_i_uczestniczki', {
            pages: ['Wzlot_2026/Uczestnicy_i_uczestniczki']
        })).toBe(true);
    });

    it('matches a prefix', () => {
        expect(api.pageMatches('Dyskusja_użytkownika:Foo', { prefixes: ['Dyskusja_'] })).toBe(true);
    });

    it('returns false when nothing matches', () => {
        expect(api.pageMatches('Strona_główna', {
            prefixes: ['Dyskusja_'],
            pages: ['Inna_strona']
        })).toBe(false);
    });

    it('handles an empty config', () => {
        expect(api.pageMatches('Strona_główna', {})).toBe(false);
    });
});
