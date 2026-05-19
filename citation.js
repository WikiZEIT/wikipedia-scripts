/**
 * Narzędzie: Citation Helper
 * Dodaje dwa nowe guziki:
 *   1. Bibliografia - okno które umożliwia dodawanie biobliografii
 *   2. Odn - wstawia szablon {{odn}} w miejsce kursora
 *
 * działa w edytorze kodu 2017 oraz w starym edytorze WikiEditor (2010)
 *
 * konfiguracja:
 * var  citationHelper = {
 *   page: 'Wikipedysta/<user>/brudnopis'
 * };
 *
 * strona wkazywana w page, powinna zawierać ksiązki używające szablonów {{Cytuj ...}}
 *
 * @author [[w:pl:User:Jcubic]]
 */
(() => {
    let api;
    let sourceBooks = [];
    let windowManager;
    let bibDialog, odnDialog;
    let codeMirror;

    initAPI();

    const citationHelper = window.citationHelper || {};

    const page = citationHelper.page || 'Wikipedysta:Kerim44/brudnopis';

    getBibliography(page).then(books => {
        sourceBooks = books || [];
    });

    mw.hook('ext.CodeMirror.ready').add(function (cm) {
        codeMirror = cm;
    });

    mw.hook('ve.activationComplete').add(() => {
        initVE();
    });

    if (mw.config.get('wgAction') === 'edit' || mw.config.get('wgAction') === 'submit') {
        mw.loader.using(['jquery.textSelection', 'ext.gadget.lib-toolbar']).then(() => {
            initWikiEditor();
        });
    }

    function initVE() {
        windowManager = new OO.ui.WindowManager();
        $(document.body).append(windowManager.$element);

        defineBibliographyDialog();
        defineOdnDialog();

        bibDialog = new BibliographyDialog();
        odnDialog = new OdnDialog();
        windowManager.addWindows([bibDialog, odnDialog]);

        // Bibliography tool
        function BibTool() { BibTool.super.apply(this, arguments); }
        OO.inheritClass(BibTool, OO.ui.Tool);
        BibTool.static.name = 'bibliographyTool';
        BibTool.static.icon = 'references';
        BibTool.static.title = 'Bibliografia';
        BibTool.static.autoAddToCatchall = false;
        BibTool.prototype.onUpdateState = function () {};
        BibTool.prototype.onSelect = function () {
            this.setActive(false);
            var surface = ve.init.target.getSurface();
            getPageWikitext(surface).then(function (source) {
                var result = parseExistingBibliography(source);
                windowManager.openWindow(bibDialog, {
                    surface: surface,
                    existingMain: result.main,
                    existingNested: result.nested
                });
            });
        };

        // Odn tool
        function OdnTool() { OdnTool.super.apply(this, arguments); }
        OO.inheritClass(OdnTool, OO.ui.Tool);
        OdnTool.static.name = 'odnTool';
        OdnTool.static.icon = 'reference';
        OdnTool.static.title = 'Odnośnik (odn)';
        OdnTool.static.autoAddToCatchall = false;
        OdnTool.prototype.onUpdateState = function () {};
        OdnTool.prototype.onSelect = function () {
            this.setActive(false);
            var surface = ve.init.target.getSurface();
            var surfaceModel = surface.getModel();
            var fragment = surfaceModel.getFragment();
            surface.getView().deactivate(false);
            getPageWikitext(surface).then(function (source) {
                var result = parseExistingBibliography(source);
                var pageBooks = result.main.concat(result.nested);
                var instance = windowManager.openWindow(odnDialog, { surface: surface, books: pageBooks, fragment: fragment });
                instance.closed.then(function () {
                    surface.getView().activate(true);
                    if (odnDialog._savedEndPos) {
                        surfaceModel.setLinearSelection(new ve.Range(odnDialog._savedEndPos));
                        odnDialog._savedEndPos = null;
                    }
                    if (codeMirror) {
                        codeMirror.focus();
                    } else {
                        surface.getView().$attachedRootNode[0].focus();
                    }
                });
            });
        };

        // Register tools and add to toolbar
        ve.ui.toolFactory.register(BibTool);
        ve.ui.toolFactory.register(OdnTool);

        var toolbar = ve.init.target.getToolbar();

        var toolGroup = new OO.ui.BarToolGroup(toolbar, {
            include: ['bibliographyTool', 'odnTool']
        });
        toolbar.addItems([toolGroup]);

        // Workaround for OOUI bug: registering tools in ve.ui.toolFactory
        // triggers onToolFactoryRegister on all existing tool groups, which
        // re-creates previously destroyed tools (like notices). Re-destroy
        // the notices tool if the page has no edit notices.
        var editNotices = ve.init.target.getEditNotices && ve.init.target.getEditNotices();
        if ((!editNotices || !editNotices.length) && toolbar.tools.notices) {
            toolbar.tools.notices.destroy();
            toolbar.tools.notices = null;
        }

    }

    // =========================================================================
    //  WikiEditor (old editor) integration
    // =========================================================================
    function initWikiEditor() {
        windowManager = new OO.ui.WindowManager();
        $(document.body).append(windowManager.$element);

        defineBibliographyDialog();
        defineOdnDialog();

        mw.util.addCSS(
            'html.skin-theme-clientpref-night #citation-bib-btn,' +
            'html.skin-theme-clientpref-night #citation-odn-btn {' +
            '  filter: invert(1) hue-rotate(180deg);' +
            '}' +
            '@media (prefers-color-scheme: dark) {' +
            '  html.skin-theme-clientpref-os #citation-bib-btn,' +
            '  html.skin-theme-clientpref-os #citation-odn-btn {' +
            '    filter: invert(1) hue-rotate(180deg);' +
            '  }' +
            '}'
        );

        bibDialog = new BibliographyDialog();
        odnDialog = new OdnDialog();
        windowManager.addWindows([bibDialog, odnDialog]);

        var $textbox = $('#wpTextbox1');

        toolbarGadget.addButton({
            title: 'Bibliografia',
            alt: 'Bib',
            id: 'citation-bib-btn',
            oldIcon: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Button_cite_book.png',
            newIcon: 'https://upload.wikimedia.org/wikipedia/commons/6/60/OOjs_UI_icon_references-ltr.svg',
            onclick: function () {
                var source = $textbox.textSelection('getContents');
                var result = parseExistingBibliography(source);
                windowManager.openWindow(bibDialog, {
                    surface: null,
                    existingMain: result.main,
                    existingNested: result.nested
                });
            }
        });

        toolbarGadget.addButton({
            title: 'Odnośnik (odn)',
            alt: 'Odn',
            id: 'citation-odn-btn',
            oldIcon: 'https://upload.wikimedia.org/wikipedia/commons/c/c0/OOjs_UI_icon_quotes-ltr.svg',
            newIcon: 'https://upload.wikimedia.org/wikipedia/commons/c/c0/OOjs_UI_icon_quotes-ltr.svg',
            onclick: function () {
                var source = $textbox.textSelection('getContents');
                var result = parseExistingBibliography(source);
                var pageBooks = result.main.concat(result.nested);
                windowManager.openWindow(odnDialog, {
                    surface: null,
                    books: pageBooks,
                    fragment: null
                });
            }
        });
    }

    // =========================================================================
    //  WikiEditor content manipulation
    // =========================================================================
    function updateBibliographyWikiEditor(mainBooks) {
        var $textbox = $('#wpTextbox1');
        var source = $textbox.textSelection('getContents');
        var newSource = insertBibliographySection(source, buildBibEntries(mainBooks));

        if (newSource !== source) {
            var scrollTop = $textbox.scrollTop();
            if (codeMirror && codeMirror.isActive) {
                codeMirror.toggle(false);
                $textbox.textSelection('setContents', newSource);
                codeMirror.toggle(true);
            } else {
                $textbox.textSelection('setContents', newSource);
            }
            setTimeout(function () { $textbox.scrollTop(scrollTop); }, 0);
        }
    }

    function insertOdnWikiEditor(book, page) {
        var $textbox = $('#wpTextbox1');
        $textbox.textSelection('replaceSelection', buildOdnString(book, page));
    }

    // =========================================================================
    //  Bibliography Dialog
    // =========================================================================
    var BibliographyDialog;
    function defineBibliographyDialog() {
        BibliographyDialog = function (config) {
            BibliographyDialog.super.call(this, config || {});
        };
        OO.inheritClass(BibliographyDialog, OO.ui.ProcessDialog);

        BibliographyDialog.static.name = 'bibliographyDialog';
        BibliographyDialog.static.title = 'Zarządzanie bibliografią';
        BibliographyDialog.static.size = 'medium';
        BibliographyDialog.static.actions = [
            { action: 'save', label: 'Zapisz', flags: ['primary', 'progressive'] },
            { label: 'Anuluj', flags: ['safe', 'close'] }
        ];

        BibliographyDialog.prototype.initialize = function () {
            BibliographyDialog.super.prototype.initialize.apply(this, arguments);
            this.panel = new OO.ui.PanelLayout({ padded: true, expanded: false });
            this.filterInput = new OO.ui.TextInputWidget({
                placeholder: 'Filtruj...',
                icon: 'search'
            });
            this.filterInput.on('change', this._onFilterChange.bind(this));
            this.$list = $('<div>').css({
                'overflow-y': 'auto',
                'max-height': '300px',
                'margin-top': '0.75em'
            });
            this.panel.$element.append(
                this.filterInput.$element,
                this.$list
            );
            this.$body.append(this.panel.$element);
        };

        BibliographyDialog.prototype.getBodyHeight = function () {
            return 400;
        };

        BibliographyDialog.prototype.getSetupProcess = function (data) {
            return BibliographyDialog.super.prototype.getSetupProcess.call(this, data)
                .next(function () {
                    this._surface = data.surface;
                    this.$list.empty();
                    this._checkboxes = [];
                    this.filterInput.setValue('');

                    var existingMain = data.existingMain || [];
                    var existingNested = data.existingNested || [];

                    var mainKeys = {};
                    existingMain.forEach(function (eb) {
                        mainKeys[bookKey(eb)] = true;
                    });
                    var nestedKeys = {};
                    existingNested.forEach(function (eb) {
                        nestedKeys[bookKey(eb)] = true;
                    });

                    var allBooks = [];
                    var seenKeys = {};
                    sourceBooks.forEach(function (sb) {
                        var key = bookKey(sb);
                        if (!seenKeys[key]) {
                            seenKeys[key] = true;
                            allBooks.push(sb);
                        }
                    });
                    existingMain.forEach(function (eb) {
                        var key = bookKey(eb);
                        if (!seenKeys[key]) {
                            seenKeys[key] = true;
                            allBooks.push(eb);
                        }
                    });
                    existingNested.forEach(function (eb) {
                        var key = bookKey(eb);
                        if (!seenKeys[key]) {
                            seenKeys[key] = true;
                            allBooks.push(eb);
                        }
                    });

                    if (!allBooks.length) {
                        this.$list.append(
                            $('<p>').text('Brak książek.')
                        );
                        return;
                    }

                    allBooks.sort(function (a, b) {
                        var aEx = (mainKeys[bookKey(a)] || nestedKeys[bookKey(a)]) ? 0 : 1;
                        var bEx = (mainKeys[bookKey(b)] || nestedKeys[bookKey(b)]) ? 0 : 1;
                        return aEx - bEx;
                    });

                    allBooks.forEach(function (book) {
                        var key = bookKey(book);
                        var isNested = nestedKeys[key] || false;
                        var isMain = mainKeys[key] || false;
                        var isExisting = isMain || isNested;
                        var label = bookLabel(book);
                        var checkbox = new OO.ui.CheckboxInputWidget({
                            selected: isExisting,
                            disabled: isNested
                        });
                        var field = new OO.ui.FieldLayout(checkbox, {
                            label: label,
                            align: 'inline'
                        });
                        this._checkboxes.push({
                            checkbox: checkbox,
                            book: book,
                            isNested: isNested,
                            label: label.toLowerCase(),
                            $field: field.$element
                        });
                        this.$list.append(field.$element);
                    }.bind(this));
                }, this);
        };

        BibliographyDialog.prototype._onFilterChange = function (value) {
            var query = value.toLowerCase().trim();
            this._checkboxes.forEach(function (item) {
                item.$field.toggle(!query || item.label.indexOf(query) !== -1);
            });
        };

        BibliographyDialog.prototype.getActionProcess = function (action) {
            if (action === 'save') {
                var mainBooks = this._checkboxes
                    .filter(function (item) { return item.checkbox.isSelected() && !item.isNested; })
                    .map(function (item) { return item.book; });
                var surface = this._surface;
                return new OO.ui.Process(function () {
                    if (surface) {
                        updateBibliography(surface, mainBooks);
                    } else {
                        updateBibliographyWikiEditor(mainBooks);
                    }
                    this.close({ action: 'save' });
                }, this);
            }
            return BibliographyDialog.super.prototype.getActionProcess.call(this, action);
        };
    }

    // =========================================================================
    //  Odn Dialog
    // =========================================================================
    var OdnDialog;
    function defineOdnDialog() {
        OdnDialog = function (config) {
            OdnDialog.super.call(this, config || {});
        };
        OO.inheritClass(OdnDialog, OO.ui.ProcessDialog);

        OdnDialog.static.name = 'odnDialog';
        OdnDialog.static.title = 'Wstaw odnośnik';
        OdnDialog.static.size = 'medium';
        OdnDialog.static.actions = [
            { action: 'insert', label: 'Wstaw', flags: ['primary', 'progressive'] },
            { label: 'Anuluj', flags: ['safe', 'close'] }
        ];

        OdnDialog.prototype.initialize = function () {
            OdnDialog.super.prototype.initialize.apply(this, arguments);
            this.panel = new OO.ui.PanelLayout({ padded: true, expanded: false });
            this.filterInput = new OO.ui.TextInputWidget({
                placeholder: 'Filtruj...',
                icon: 'search'
            });
            this.filterInput.on('change', this._onFilterChange.bind(this));
            this.bookSelect = new OO.ui.RadioSelectWidget();
            this.bookSelect.$element.css({ 'max-height': '300px', 'overflow-y': 'auto' });
            this.pageInput = new OO.ui.TextInputWidget({ placeholder: 'Numer strony' });

            this.panel.$element.append(
                new OO.ui.FieldLayout(this.filterInput, { label: 'Szukaj książki', align: 'top' }).$element,
                new OO.ui.FieldLayout(this.bookSelect, { label: 'Książka', align: 'top' }).$element,
                new OO.ui.FieldLayout(this.pageInput, { label: 'Strona', align: 'top' }).$element
            );
            this.$body.append(this.panel.$element);
        };

        OdnDialog.prototype.getSetupProcess = function (data) {
            return OdnDialog.super.prototype.getSetupProcess.call(this, data)
                .next(function () {
                    this._surface = data.surface;
                    this._fragment = data.fragment;
                    this._books = data.books || [];
                    this.pageInput.setValue('');
                    this.filterInput.setValue('');

                    this._allOptions = this._books.map(function (book, i) {
                        var label = bookLabel(book);
                        return {
                            widget: new OO.ui.RadioOptionWidget({ data: i, label: label }),
                            label: label.toLowerCase()
                        };
                    });

                    this.bookSelect.clearItems();
                    var widgets = this._allOptions.map(function (o) { return o.widget; });
                    this.bookSelect.addItems(widgets);
                    if (widgets.length) {
                        this.bookSelect.selectItem(widgets[0]);
                    }
                }, this);
        };

        OdnDialog.prototype._onFilterChange = function (value) {
            var query = value.toLowerCase().trim();
            var firstVisible = null;
            var selectedItem = this.bookSelect.findSelectedItem();
            var selectedHidden = false;
            this._allOptions.forEach(function (o) {
                var match = !query || o.label.indexOf(query) !== -1;
                o.widget.toggle(match);
                if (match && !firstVisible) {
                    firstVisible = o.widget;
                }
                if (o.widget === selectedItem && !match) {
                    selectedHidden = true;
                }
            });
            if (firstVisible && (!selectedItem || selectedHidden)) {
                this.bookSelect.selectItem(firstVisible);
            }
        };

        OdnDialog.prototype.getActionProcess = function (action) {
            if (action === 'insert') {
                var selectedItem = this.bookSelect.findSelectedItem();
                if (!selectedItem) {
                    return new OO.ui.Process(function () {
                        return $.Deferred().reject(new OO.ui.Error('Wybierz książkę')).promise();
                    });
                }
                var book = this._books[selectedItem.getData()];
                var page = this.pageInput.getValue();
                var fragment = this._fragment;
                return new OO.ui.Process(function () {
                    if (fragment) {
                        this._endPos = insertOdn(fragment, book, page);
                    } else {
                        insertOdnWikiEditor(book, page);
                    }
                    this.close({ action: 'insert' });
                }, this);
            }
            return OdnDialog.super.prototype.getActionProcess.call(this, action);
        };

        OdnDialog.prototype.getTeardownProcess = function (data) {
            return OdnDialog.super.prototype.getTeardownProcess.call(this, data)
                .first(function () {
                    this._savedEndPos = this._endPos;
                    this._endPos = null;
                }, this);
        };
    }

    // =========================================================================
    //  Content manipulation
    // =========================================================================
    function findEndOfArticlePos(source) {
        var lines = source.split('\n');
        var i = lines.length - 1;

        while (i >= 0 && lines[i].trim() === '') {
            i--;
        }
        var bottom = i;

        while (i >= 0) {
            var line = lines[i].trim();
            if (line === '' || /^\[\[:?Kategoria:/.test(line) || /^\{\{\w+/.test(line)) {
                i--;
            } else {
                break;
            }
        }

        var earliest = -1;
        if (i < bottom) {
            var footerStart = i + 1;
            earliest = footerStart === 0 ? 0 : lines.slice(0, footerStart).join('\n').length + 1;
        }

        var linkMatch = source.search(/^==\s*Linki zewnętrzne\s*==/m);
        if (linkMatch !== -1 && (earliest === -1 || linkMatch < earliest)) {
            earliest = linkMatch;
        }

        return earliest;
    }

    function ensurePrzypisy(source) {
        if (/==\s*Przypisy\s*==/m.test(source)) return source;
        var przypisySection = '== Przypisy ==\n{{Przypisy}}\n';
        var bibMatch = source.search(/^==\s*Bibliografia\s*==/m);
        if (bibMatch !== -1) {
            var before = source.slice(0, bibMatch).replace(/\s+$/, '');
            return before + '\n\n' + przypisySection + '\n' + source.slice(bibMatch);
        }
        return source;
    }

    function insertBibliographySection(source, bibEntries) {
        var bibRe = /==\s*Bibliografia\s*==\n([\s\S]*?)(?=\n==[^=]|$)/;
        var match = source.match(bibRe);

        if (match) {
            var content = match[1];
            var subIdx = content.search(/^===/m);
            var mainContent = subIdx !== -1 ? content.slice(0, subIdx) : content;
            var subPart = subIdx !== -1 ? content.slice(subIdx) : '';

            var lines = mainContent.split('\n');
            var lastEntryIdx = -1;
            for (var i = 0; i < lines.length; i++) {
                if (/^\*/.test(lines[i])) {
                    lastEntryIdx = i;
                }
            }

            var trailing = '';
            if (lastEntryIdx !== -1 && lastEntryIdx < lines.length - 1) {
                trailing = lines.slice(lastEntryIdx + 1).join('\n');
            } else if (lastEntryIdx === -1) {
                trailing = mainContent;
            }

            var newMain = bibEntries ? bibEntries + '\n' : '';
            var headerStart = match.index;
            var headerLine = source.slice(headerStart).match(/^==\s*Bibliografia\s*==\n/)[0];
            var contentStart = headerStart + headerLine.length;
            var contentEnd = contentStart + content.length;

            return ensurePrzypisy(
                source.slice(0, contentStart) + newMain + trailing + subPart + source.slice(contentEnd)
            );
        }

        if (!bibEntries) return source;

        var section = '== Przypisy ==\n{{Przypisy}}\n\n== Bibliografia ==\n' + bibEntries + '\n';
        var pos = findEndOfArticlePos(source);

        if (pos !== -1) {
            var before = source.slice(0, pos).replace(/\s+$/, '');
            var after = source.slice(pos).replace(/^\s+/, '');
            return ensurePrzypisy(before + '\n\n' + section + '\n' + after);
        }
        return ensurePrzypisy(source.trimEnd() + '\n\n' + section);
    }

    function matchCytujTemplates(text) {
        var results = [];
        var re = /\{\{[Cc]ytuj\b/gi;
        var m;
        while ((m = re.exec(text)) !== null) {
            var start = m.index;
            var depth = 0;
            var end = -1;
            for (var i = start; i < text.length - 1; i++) {
                if (text[i] === '{' && text[i + 1] === '{') {
                    depth++;
                    i++;
                } else if (text[i] === '}' && text[i + 1] === '}') {
                    depth--;
                    i++;
                    if (depth === 0) {
                        end = i + 1;
                        break;
                    }
                }
            }
            if (end !== -1) {
                results.push(text.slice(start, end));
            }
        }
        return results;
    }

    function parseExistingBibliography(source) {
        var empty = { main: [], nested: [] };
        if (typeof source !== 'string') return empty;
        var re = /==\s*Bibliografia\s*==\n([\s\S]*?)(?=\n==[^=]|$)/;
        var match = source.match(re);
        if (!match) return empty;

        var content = match[1];
        var subIdx = content.search(/^===/m);
        var mainContent = subIdx !== -1 ? content.slice(0, subIdx) : content;
        var subContent = subIdx !== -1 ? content.slice(subIdx) : '';

        var mainEntries = matchCytujTemplates(mainContent).map(parseTemplate);
        var nestedEntries = matchCytujTemplates(subContent).map(parseTemplate);

        return { main: mainEntries, nested: nestedEntries };
    }

    function updateBibliography(surface, mainBooks) {
        if (surface.getMode() !== 'source') {
            mw.notify('Edycja bibliografii dostępna tylko w edytorze źródłowym.');
            return;
        }
        var surfaceModel = surface.getModel();
        var source = surfaceModel.getDom();
        if (typeof source !== 'string' || !source) return;

        var newSource = insertBibliographySection(source, buildBibEntries(mainBooks));

        if (newSource !== source) {
            var view = surface.getView();
            var $scrollable = view.$element.closest('.ve-ui-surface');
            var scrollTop = $scrollable.length ? $scrollable.scrollTop() : 0;
            var range = new ve.Range(1, surfaceModel.getDocument().data.getLength());
            if (codeMirror && codeMirror.isActive) {
                codeMirror.toggle(false);
                surfaceModel.getLinearFragment(range).insertContent(newSource);
                codeMirror.toggle(true);
            } else {
                surfaceModel.getLinearFragment(range).insertContent(newSource);
            }
            setTimeout(function () {
                if ($scrollable.length) {
                    $scrollable.scrollTop(scrollTop);
                }
            }, 0);
        }
    }

    function insertOdn(fragment, book, page) {
        var odn = buildOdnString(book, page);
        var endPos = fragment.getSelection().getRange().from + odn.length;

        if (codeMirror && codeMirror.isActive) {
            codeMirror.toggle(false);
            fragment.insertContent(odn);
            codeMirror.toggle(true);
        } else {
            fragment.insertContent(odn);
        }

        return endPos;
    }

    // =========================================================================
    //  String builders
    // =========================================================================
    function buildOdnString(book, page) {
        var parts = ['{{odn'];
        var odnId = book.odn && book.odn.match(/\{\{odn\/id\|([^}]+)\}\}/);
        if (odnId) {
            var idParams = odnId[1].split('|');
            parts.push(idParams[0]);
            if (idParams[1]) {
                parts.push(idParams[1]);
            }
        } else if (book._positional) {
            book._positional.forEach(function (p) {
                parts.push(p);
            });
        } else {
            var names = Object.keys(book).filter(function (key) {
                return key.startsWith('nazwisko');
            }).sort();
            names.forEach(function (key) {
                parts.push(book[key]);
            });
            var year = book.rok || book.data || '';
            if (year) {
                parts.push(year);
            }
        }
        if (page) {
            parts.push('s=' + page);
        }
        return parts.join('|') + '}}';
    }

    function buildBibEntries(books) {
        return books.map(function (book) {
            return '* ' + stringifyTemplate(book._templateName || 'Cytuj książkę', book);
        }).join('\n');
    }

    // =========================================================================
    //  Helpers
    // =========================================================================
    function getPageWikitext(surface) {
        if (surface.getMode() === 'source') {
            var raw = surface.getModel().getDom();
            var text = typeof raw === 'string' ? raw : (raw && raw.textContent) || '';
            return $.Deferred().resolve(text).promise();
        }
        var pageName = mw.config.get('wgPageName');
        return api.get({
            action: 'query',
            prop: 'revisions',
            rvprop: 'content',
            titles: pageName
        }).then(function (data) {
            return data.query.pages[0].revisions[0].content;
        });
    }

    function bookKey(book) {
        if (book._positional) {
            return book._positional.join('|').toLowerCase();
        }
        var author = (book.nazwisko || book.nazwisko1 || '').toLowerCase().trim();
        var year = (book.rok || '').trim();
        var title = (book.tytuł || '').toLowerCase().trim();
        return author + '|' + year + '|' + title;
    }

    function stripLinks(text) {
        return text.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2');
    }

    function bookLabel(book) {
        if (book.opis) {
            var opis = stripLinks(book.opis);
            if (book._positional && book._positional[0]) {
                return '[' + book._positional[0] + '] ' + opis;
            }
            return opis;
        }
        var author = book.nazwisko || book.nazwisko1 || book.autor || '';
        var title = book.tytuł || '';
        var year = book.rok || book.data || '';
        var parts = [];
        if (author) parts.push(author);
        if (year) parts.push('(' + year + ')');
        if (title) parts.push('— ' + title);
        return parts.join(' ') || 'Książka bez tytułu';
    }

    function parseTemplate(code) {
        var result = {};
        var positional = [];
        var nameMatch = code.match(/^\{\{\s*([^|]+?)\s*\|/);
        if (nameMatch) {
            result._templateName = nameMatch[1].trim();
        }
        var inner = code.replace(/^\{\{[^|]+\|/, '').replace(/\}\}$/, '');
        splitTemplateParams(inner).forEach(function (str) {
            var m = str.match(/\s*(.+?)\s*=\s*([\s\S]*)/);
            if (m) {
                result[m[1]] = m[2].trim();
            } else if (str.trim()) {
                positional.push(str.trim());
            }
        });
        if (positional.length) {
            result._positional = positional;
        }
        return result;
    }

    function splitTemplateParams(inner) {
        var params = [];
        var depth = 0;
        var current = '';
        for (var i = 0; i < inner.length; i++) {
            var ch = inner[i];
            if (ch === '{' || ch === '[') depth++;
            else if (ch === '}' || ch === ']') depth--;
            if (ch === '|' && depth === 0) {
                params.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
        if (current) params.push(current);
        return params;
    }

    function stringifyTemplate(name, data) {
        var positional = data._positional || [];
        var named = Object.entries(data)
            .filter(function (entry) {
                return entry[0] !== '_templateName' && entry[0] !== '_positional';
            })
            .map(function (entry) {
                return ' ' + entry[0] + ' = ' + entry[1];
            });
        var allParams = positional.concat(named);
        return '{{' + name + '|' + allParams.join('|') + '}}';
    }

    function getBibliography(page) {
        return api.get({
            action: 'query',
            prop: 'revisions',
            rvprop: 'content',
            titles: page
        }).then(function (data) {
            try {
                var code = data.query.pages[0].revisions[0].content;
                var books = matchCytujTemplates(code);
                console.log('[citation] Cytuj w brudnopisie (' + page + '): ' + books.length);
                if (!books.length) return [];
                return books.map(parseTemplate);
            } catch (e) {
                return [];
            }
        });
    }

    function initAPI() {
        api = new mw.Api({
            parameters: {
                format: 'json',
                formatversion: 2,
                errorformat: 'html',
                errorlang: mw.config.get('wgUserLanguage'),
                errorsuselocal: true
            }
        });
    }
})();
