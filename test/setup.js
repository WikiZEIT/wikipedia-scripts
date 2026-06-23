import { vi } from 'vitest';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

globalThis.mw = {
    Api: function () {
        this.get = () => Promise.resolve({
            query: { pages: [{ revisions: [{ content: '' }] }] }
        });
    },
    config: {
        get: (key) => {
            if (key === 'wgAction') return 'view';
            if (key === 'wgUserLanguage') return 'pl';
            return null;
        }
    },
    hook: () => ({ add: () => {} }),
    loader: {
        using: () => ({ then: () => ({ catch: () => {} }) })
    },
    util: { addCSS: () => {} },
    notify: () => {}
};

globalThis.citationHelper = {};
