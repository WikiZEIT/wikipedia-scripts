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
 * @date 2026-06-24 12:50:24+0200
 */
(() => {
    /* v8 ignore start -- GUI initialization and editor integration */
    let api;
    let sourceBooks = [];
    let windowManager;
    let normalizationManager;
    let bibDialog, odnDialog, normalizationDialog;
    let codeMirror;

    initAPI();

    const citationHelper = window.citationHelper || {};

    function log() {
        if (citationHelper.debug) {
            console.log.apply(console, arguments);
        }
    }

    log('[citation] script loaded');

    const page = citationHelper.page || 'Wikipedysta:Kerim44/brudnopis';

    log('[citation] fetching bibliography from:', page);
    getBibliography(page).then(books => {
        sourceBooks = books || [];
        log('[citation] sourceBooks loaded:', sourceBooks.length);
    }).catch(function (err) {
        console.error('[citation] getBibliography failed:', err);
    });

    mw.hook('ext.CodeMirror.ready').add(function (cm) {
        codeMirror = cm;
    });

    mw.hook('ve.activationComplete').add(() => {
        log('[citation] VE activation complete');
        initVE();
    });

    if (mw.config.get('wgAction') === 'edit' || mw.config.get('wgAction') === 'submit') {
        log('[citation] loading WikiEditor modules...');
        mw.loader.using(['jquery.textSelection', 'ext.gadget.lib-toolbar', 'oojs-ui-windows']).then(() => {
            log('[citation] WikiEditor modules loaded, initializing...');
            initWikiEditor();
            log('[citation] WikiEditor initialized');
        }).catch(function (err) {
            console.error('[citation] mw.loader.using failed:', err);
        });
    }

    function initVE() {
        windowManager = new OO.ui.WindowManager();
        $(document.body).append(windowManager.$element);

        defineBibliographyDialog();
        defineOdnDialog();
        defineNormalizationDialog();

        bibDialog = new BibliographyDialog();
        odnDialog = new OdnDialog();
        windowManager.addWindows([bibDialog, odnDialog]);

        normalizationManager = new OO.ui.WindowManager();
        $(document.body).append(normalizationManager.$element);
        normalizationDialog = new NormalizationDialog();
        normalizationManager.addWindows([normalizationDialog]);

        // Bibliography tool
        function BibTool() { BibTool.super.apply(this, arguments); }
        OO.inheritClass(BibTool, OO.ui.Tool);
        BibTool.static.name = 'bibliographyTool';
        BibTool.static.icon = 'references';
        BibTool.static.title = 'Bibliografia';
        BibTool.static.autoAddToCatchall = false;
        BibTool.prototype.onUpdateState = function () {
            var surface = ve.init.target && ve.init.target.getSurface && ve.init.target.getSurface();
            this.toggle(!!(surface && surface.getMode() === 'source'));
        };
        BibTool.prototype.onSelect = function () {
            this.setActive(false);
            var surface = ve.init.target.getSurface();
            getPageWikitext(surface).then(function (source) {
                var result = readAllBibliography(source);
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
        OdnTool.prototype.onUpdateState = function () {
            var surface = ve.init.target && ve.init.target.getSurface && ve.init.target.getSurface();
            this.toggle(!!(surface && surface.getMode() === 'source'));
        };
        OdnTool.prototype.onSelect = function () {
            this.setActive(false);
            var surface = ve.init.target.getSurface();
            var surfaceModel = surface.getModel();
            var fragment = surfaceModel.getFragment();
            surface.getView().deactivate(false);
            getPageWikitext(surface).then(function (source) {
                var result = readAllBibliography(source);
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
        defineNormalizationDialog();

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

        normalizationManager = new OO.ui.WindowManager();
        $(document.body).append(normalizationManager.$element);
        normalizationDialog = new NormalizationDialog();
        normalizationManager.addWindows([normalizationDialog]);

        var $textbox = $('#wpTextbox1');

        toolbarGadget.addButton({
            title: 'Bibliografia',
            alt: 'Bib',
            id: 'citation-bib-btn',
            oldIcon: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Button_cite_book.png',
            newIcon: 'https://upload.wikimedia.org/wikipedia/commons/6/60/OOjs_UI_icon_references-ltr.svg',
            onclick: function () {
                var source = $textbox.textSelection('getContents');
                var result = readAllBibliography(source);
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
                var result = readAllBibliography(source);
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
        var newSource;
        if (loadSetting('podprzypisy', false)) {
            newSource = insertReferencesSection(migrateOdnToSubRefs(source), mainBooks);
        } else {
            newSource = insertBibliographySection(source, buildBibEntries(mainBooks));
        }

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

    function buildReferenceString(book, page) {
        return loadSetting('podprzypisy', false)
            ? buildSubRefString(book, page)
            : buildOdnString(book, page);
    }

    function readAllBibliography(source) {
        var legacy = parseExistingBibliography(source);
        var subref = parseSubReferences(source);
        var seen = {};
        var main = [];
        // Wpisy sub-ref mają pierwszeństwo (są w nowym formacie); duplikaty
        // dedupujemy po kluczu książki, żeby migracja z odn nie pokazała
        // tej samej książki dwa razy.
        subref.concat(legacy.main).forEach(function (b) {
            var k = bookKey(b);
            if (!seen[k]) {
                seen[k] = true;
                main.push(b);
            }
        });
        return { main: main, nested: legacy.nested };
    }

    function insertOdnWikiEditor(book, page) {
        var $textbox = $('#wpTextbox1');
        $textbox.textSelection('replaceSelection', buildReferenceString(book, page));
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
            { action: 'normalize', icon: 'editUndo', title: 'Normalizuj bibliografię ze strony źródłowej', flags: 'progressive' },
            { action: 'cleanup', icon: 'trash', title: 'Usuń nieużywane referencje', flags: 'destructive' },
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
            this.$messages = $('<div>').css({ 'margin-top': '0.75em' });

            this.sortCheckbox = new OO.ui.CheckboxInputWidget({
                selected: loadSetting('sort', false)
            });
            this.sortCheckbox.on('change', function (selected) {
                saveSetting('sort', selected);
            });
            var sortField = new OO.ui.FieldLayout(this.sortCheckbox, {
                label: 'Sortuj bibliografię (nazwisko, rok)',
                align: 'inline'
            });

            this.podprzypisyCheckbox = new OO.ui.CheckboxInputWidget({
                selected: loadSetting('podprzypisy', false)
            });
            this.podprzypisyCheckbox.on('change', function (selected) {
                saveSetting('podprzypisy', selected);
            });
            var podField = new OO.ui.FieldLayout(this.podprzypisyCheckbox, {
                label: 'Podprzypisy (sub-references, zamiast {{odn}})',
                align: 'inline'
            });

            var optionsFieldset = new OO.ui.FieldsetLayout({
                label: 'Opcje',
                items: [sortField, podField]
            });
            this.$options = $('<div>').css({ 'margin-top': '0.75em' });
            this.$options.append(optionsFieldset.$element);

            this.panel.$element.append(
                this.filterInput.$element,
                this.$list,
                this.$messages,
                this.$options
            );
            this.$body.append(this.panel.$element);
        };

        BibliographyDialog.prototype.getBodyHeight = function () {
            if (this.$body && this.$body[0] && this.$body[0].scrollHeight) {
                return this.$body[0].scrollHeight;
            }
            return 400;
        };

        BibliographyDialog.prototype.getSetupProcess = function (data) {
            return BibliographyDialog.super.prototype.getSetupProcess.call(this, data)
                .next(function () {
                    this._surface = data.surface;
                    this.$list.empty();
                    this.$messages.empty();
                    this._checkboxes = [];
                    this.filterInput.setValue('');

                    var existingMain = data.existingMain || [];
                    var existingNested = data.existingNested || [];

                    var articleFix = fixMissingOdn(existingMain);
                    this._odnArticleCount = articleFix.count;
                    sourceBooks.forEach(function (book) {
                        if (!book.odn) {
                            log('[citation] brak odn: ' + stringifyTemplate(book._templateName || 'Cytuj książkę', book));
                            book._odnMissing = true;
                            ensureOdn(book);
                        }
                    });

                    var mainKeys = {};
                    existingMain.forEach(function (eb) {
                        mainKeys[bookKey(eb)] = true;
                    });
                    var nestedKeys = {};
                    existingNested.forEach(function (eb) {
                        nestedKeys[bookKey(eb)] = true;
                    });

                    var sourceGroups = {};
                    var sourceGroupOrder = [];
                    sourceBooks.forEach(function (sb) {
                        var key = bookKey(sb);
                        if (!sourceGroups[key]) {
                            sourceGroups[key] = [];
                            sourceGroupOrder.push(key);
                        }
                        sourceGroups[key].push(sb);
                    });

                    var allEntries = [];
                    var seenKeys = {};
                    sourceGroupOrder.forEach(function (key) {
                        if (!seenKeys[key]) {
                            seenKeys[key] = true;
                            var group = sourceGroups[key];
                            if (group.length > 1) {
                                allEntries.push({ type: 'variant', key: key, variants: group });
                            } else {
                                allEntries.push({ type: 'single', key: key, book: group[0] });
                            }
                        }
                    });
                    existingMain.forEach(function (eb) {
                        var key = bookKey(eb);
                        if (!seenKeys[key]) {
                            seenKeys[key] = true;
                            allEntries.push({ type: 'single', key: key, book: eb });
                        }
                    });
                    existingNested.forEach(function (eb) {
                        var key = bookKey(eb);
                        if (!seenKeys[key]) {
                            seenKeys[key] = true;
                            allEntries.push({ type: 'single', key: key, book: eb });
                        }
                    });

                    if (!allEntries.length) {
                        this.$list.append($('<p>').text('Brak książek.'));
                        return;
                    }

                    allEntries.sort(function (a, b) {
                        var aEx = (mainKeys[a.key] || nestedKeys[a.key]) ? 0 : 1;
                        var bEx = (mainKeys[b.key] || nestedKeys[b.key]) ? 0 : 1;
                        return aEx - bEx;
                    });

                    var self = this;
                    allEntries.forEach(function (entry) {
                        var key = entry.key;
                        var isNested = nestedKeys[key] || false;
                        var isMain = mainKeys[key] || false;
                        var isExisting = isMain || isNested;

                        if (entry.type === 'variant') {
                            var variants = entry.variants;
                            var diffFields = findDifferingFields(variants);
                            var label = bookLabel(variants[0]);
                            var checkbox = new OO.ui.CheckboxInputWidget({
                                selected: isExisting,
                                disabled: isNested
                            });

                            var options = variants.map(function (v, i) {
                                return { data: String(i), label: variantLabel(v, diffFields) };
                            });
                            var variantSelect = new OO.ui.DropdownInputWidget({
                                options: options,
                                value: '0',
                                $overlay: self.$overlay
                            });

                            if (isMain) {
                                var matchingExisting = existingMain.filter(function (eb) {
                                    return bookKey(eb) === key;
                                });
                                if (matchingExisting.length) {
                                    var matchIdx = findMatchingVariant(matchingExisting[0], variants, diffFields);
                                    if (matchIdx !== -1) {
                                        variantSelect.setValue(String(matchIdx));
                                    }
                                }
                            }

                            variantSelect.$element.css({ margin: '0.5em 0 0.5em 1.5em', 'max-width': 'calc(100% - 1.5em)' });
                            variantSelect.$element.toggle(checkbox.isSelected());
                            checkbox.on('change', function (selected) {
                                variantSelect.$element.toggle(selected);
                            });

                            var field = new OO.ui.FieldLayout(checkbox, {
                                label: label,
                                align: 'inline'
                            });

                            var $container = $('<div>').addClass('oo-ui-layout oo-ui-fieldLayout');
                            $container.append(field.$element, variantSelect.$element);

                            var variantLabels = variants.map(function (v) {
                                return variantLabel(v, diffFields);
                            }).join(' ').toLowerCase();

                            self._checkboxes.push({
                                checkbox: checkbox,
                                book: variants[0],
                                variants: variants,
                                variantSelect: variantSelect,
                                isNested: isNested,
                                label: label.toLowerCase() + ' ' + variantLabels,
                                $field: $container
                            });

                            self.$list.append($container);
                        } else {
                            var book = entry.book;
                            var label = bookLabel(book);
                            var checkbox = new OO.ui.CheckboxInputWidget({
                                selected: isExisting,
                                disabled: isNested
                            });
                            var field = new OO.ui.FieldLayout(checkbox, {
                                label: label,
                                align: 'inline'
                            });
                            self._checkboxes.push({
                                checkbox: checkbox,
                                book: book,
                                isNested: isNested,
                                label: label.toLowerCase(),
                                $field: field.$element
                            });
                            self.$list.append(field.$element);
                        }
                    });

                    var duplicates = findDuplicateBooks(sourceBooks);
                    var messages = [];
                    duplicates.forEach(function (dup) {
                        messages.push({
                            type: 'warning',
                            text: 'Duplikat: ' + dup.label + ' (' + dup.count + ' kopie bez rozróżnienia)'
                        });
                    });
                    messages.forEach(function (msg) {
                        var $msg = $('<div>').css({
                            'padding': '0.5em',
                            'margin-top': '0.5em',
                            'background-color': msg.type === 'warning' ? '#fef6e7' : '#f8f9fa',
                            'border': '1px solid ' + (msg.type === 'warning' ? '#fc3' : '#a2a9b1'),
                            'border-radius': '2px',
                            'font-size': '0.9em'
                        }).text(msg.text);
                        self.$messages.append($msg);
                    });

                    self._refreshCleanupAbility();
                }, this);
        };

        BibliographyDialog.prototype._readCurrentSource = function () {
            if (this._surface) {
                return this._surface.getModel().getDom();
            }
            return $('#wpTextbox1').textSelection('getContents');
        };

        BibliographyDialog.prototype._refreshCleanupAbility = function () {
            var source = this._readCurrentSource();
            var hasUnused = findUnusedRefNames(source).length > 0 ||
                findUnusedBibliographyBooks(source).length > 0;
            var existing = readAllBibliography(source).main;
            var hasNorm = findNormalizationCandidates(existing, sourceBooks).length > 0;
            this.actions.setAbilities({ cleanup: hasUnused, normalize: hasNorm });
        };

        BibliographyDialog.prototype.getReadyProcess = function (data) {
            var dialog = this;
            return BibliographyDialog.super.prototype.getReadyProcess.call(this, data)
                .next(function () {
                    dialog.updateSize();
                    setTimeout(function () { dialog.filterInput.focus(); }, 200);
                });
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
                    .map(function (item) {
                        if (item.variants && item.variantSelect) {
                            var idx = parseInt(item.variantSelect.getValue(), 10);
                            return item.variants[idx];
                        }
                        return item.book;
                    });
                var surface = this._surface;
                var odnArticleCount = this._odnArticleCount;
                var odnSourceCount = mainBooks.filter(function (book) { return book._odnMissing; }).length;
                mainBooks.forEach(function (book) { ensureOdn(book); });
                if (this.sortCheckbox.isSelected()) {
                    mainBooks = sortBooks(mainBooks);
                }
                return new OO.ui.Process(function () {
                    if (surface) {
                        updateBibliography(surface, mainBooks);
                    } else {
                        updateBibliographyWikiEditor(mainBooks);
                    }
                    var notification = buildOdnNotification(odnArticleCount, odnSourceCount);
                    if (notification) {
                        mw.notify($('<span>').html(notification.replace(/odn = tak/g, '<code><small>odn = tak</small></code>')));
                    }
                    this.close({ action: 'save' });
                }, this);
            }
            if (action === 'normalize') {
                var surface = this._surface;
                var dialog = this;
                return new OO.ui.Process(function () {
                    var source = dialog._readCurrentSource();
                    var existing = readAllBibliography(source).main;
                    var candidates = findNormalizationCandidates(existing, sourceBooks);
                    if (!candidates.length) {
                        mw.notify('Brak różnic między bibliografią a stroną źródłową.');
                        return;
                    }
                    var applyFn = function (selected) {
                        if (!selected.length) return;
                        var newSource = applyNormalizations(source, selected);
                        if (newSource === source) return;
                        if (surface) {
                            var surfaceModel = surface.getModel();
                            var range = new ve.Range(1, surfaceModel.getDocument().data.getLength());
                            if (codeMirror && codeMirror.isActive) {
                                codeMirror.toggle(false);
                                surfaceModel.getLinearFragment(range).insertContent(newSource);
                                codeMirror.toggle(true);
                            } else {
                                surfaceModel.getLinearFragment(range).insertContent(newSource);
                            }
                        } else {
                            $('#wpTextbox1').textSelection('setContents', newSource);
                        }
                        mw.notify('Znormalizowano ' + selected.length + ' wpis(ów) bibliografii.');
                    };
                    normalizationManager.openWindow(normalizationDialog, {
                        candidates: candidates,
                        apply: applyFn
                    });
                }, this);
            }
            if (action === 'cleanup') {
                var surface = this._surface;
                var dialog = this;
                return new OO.ui.Process(function () {
                    var source, applyNewSource;
                    if (surface) {
                        var surfaceModel = surface.getModel();
                        source = surfaceModel.getDom();
                        applyNewSource = function (newSrc) {
                            var range = new ve.Range(1, surfaceModel.getDocument().data.getLength());
                            if (codeMirror && codeMirror.isActive) {
                                codeMirror.toggle(false);
                                surfaceModel.getLinearFragment(range).insertContent(newSrc);
                                codeMirror.toggle(true);
                            } else {
                                surfaceModel.getLinearFragment(range).insertContent(newSrc);
                            }
                        };
                    } else {
                        var $tb = $('#wpTextbox1');
                        source = $tb.textSelection('getContents');
                        applyNewSource = function (newSrc) { $tb.textSelection('setContents', newSrc); };
                    }

                    var unusedRefs = findUnusedRefNames(source);
                    var unusedBooks = findUnusedBibliographyBooks(source);
                    if (!unusedRefs.length && !unusedBooks.length) {
                        mw.notify('Brak nieużywanych referencji do usunięcia.');
                        return;
                    }
                    var unusedSet = {};
                    unusedRefs.forEach(function (n) { unusedSet[n] = true; });
                    unusedBooks.forEach(function (b) { unusedSet[refName(b)] = true; });

                    // Wpisy szablonu z wieloma wariantami (rozdziały) — uznaj
                    // checkbox za nieużywany jeśli KAŻDY wariant ma niewykorzystaną
                    // nazwę refa, inaczej zostaw zaznaczony.
                    dialog._checkboxes.forEach(function (item) {
                        var books = item.variants || [item.book];
                        var allUnused = books.every(function (b) { return unusedSet[refName(b)]; });
                        if (allUnused && item.checkbox.isSelected()) {
                            item.checkbox.setSelected(false);
                        }
                    });

                    var newSource = removeUnusedReferences(source);
                    newSource = removeUnusedBibliographyEntries(newSource);
                    applyNewSource(newSource);
                    var removed = unusedRefs.concat(unusedBooks.map(refName));
                    mw.notify('Usunięto nieużywane referencje: ' + removed.join(', '));
                    dialog._refreshCleanupAbility();
                }, this);
            }
            return BibliographyDialog.super.prototype.getActionProcess.call(this, action);
        };
    }

    // =========================================================================
    //  Normalization Dialog (potwierdzenie zmian z porównaniem git-style)
    // =========================================================================
    var NormalizationDialog;
    function defineNormalizationDialog() {
        NormalizationDialog = function (config) {
            NormalizationDialog.super.call(this, config || {});
        };
        OO.inheritClass(NormalizationDialog, OO.ui.ProcessDialog);

        NormalizationDialog.static.name = 'normalizationDialog';
        NormalizationDialog.static.title = 'Normalizacja bibliografii';
        NormalizationDialog.static.size = 'larger';
        NormalizationDialog.static.actions = [
            { action: 'apply', label: 'Zatwierdź', flags: ['primary', 'progressive'] },
            { label: 'Anuluj', flags: ['safe', 'close'] }
        ];

        NormalizationDialog.prototype.initialize = function () {
            NormalizationDialog.super.prototype.initialize.apply(this, arguments);
            this.panel = new OO.ui.PanelLayout({ padded: true, expanded: false });
            this.$list = $('<div>');
            this.panel.$element.append(this.$list);
            this.$body.append(this.panel.$element);
        };

        NormalizationDialog.prototype.getBodyHeight = function () {
            if (this.$body && this.$body[0] && this.$body[0].scrollHeight) {
                return Math.min(this.$body[0].scrollHeight, 600);
            }
            return 400;
        };

        NormalizationDialog.prototype.getSetupProcess = function (data) {
            return NormalizationDialog.super.prototype.getSetupProcess.call(this, data)
                .next(function () {
                    this._applyFn = data.apply;
                    this._items = [];
                    this.$list.empty();

                    var self = this;
                    data.candidates.forEach(function (c) {
                        var cb = new OO.ui.CheckboxInputWidget({ selected: true });
                        var field = new OO.ui.FieldLayout(cb, {
                            label: bookLabel(c.article),
                            align: 'inline'
                        });

                        var oldText = stringifyTemplate(c.article._templateName || 'Cytuj książkę', c.article);
                        var effectiveSource = normalizedSourceBook(c.article, c.source);
                        var newText = stringifyTemplate(effectiveSource._templateName || 'Cytuj książkę', effectiveSource);
                        var diff = diffTokens(oldText, newText);

                        var lineStyles = {
                            'padding': '0.25em 0.5em',
                            'font-family': 'monospace',
                            'font-size': '0.9em',
                            'white-space': 'pre-wrap',
                            'word-break': 'break-word',
                            'border-radius': '2px',
                            'margin-top': '0.25em'
                        };
                        var $oldLine = $('<div>').css($.extend({}, lineStyles, { 'background-color': '#ffeef0' }));
                        diff.forEach(function (d) {
                            if (d.op === 'ins') return;
                            var $tok = $('<span>').text(d.token);
                            if (d.op === 'del') $tok.css({ 'background-color': '#fdb8c0', color: '#86181d' });
                            $oldLine.append($tok);
                        });

                        var $newLine = $('<div>').css($.extend({}, lineStyles, { 'background-color': '#e6ffed' }));
                        diff.forEach(function (d) {
                            if (d.op === 'del') return;
                            var $tok = $('<span>').text(d.token);
                            if (d.op === 'ins') $tok.css({ 'background-color': '#acf2bd', color: '#22863a' });
                            $newLine.append($tok);
                        });

                        var $row = $('<div>').css({
                            'border': '1px solid #c8ccd1',
                            'border-radius': '2px',
                            'padding': '0.75em',
                            'margin-bottom': '0.75em'
                        });
                        $row.append(field.$element, $oldLine, $newLine);
                        self.$list.append($row);
                        self._items.push({ checkbox: cb, candidate: c });
                    });
                }, this);
        };

        NormalizationDialog.prototype.getReadyProcess = function (data) {
            var dialog = this;
            return NormalizationDialog.super.prototype.getReadyProcess.call(this, data)
                .next(function () { dialog.updateSize(); });
        };

        NormalizationDialog.prototype.getActionProcess = function (action) {
            if (action === 'apply') {
                var selected = this._items
                    .filter(function (it) { return it.checkbox.isSelected(); })
                    .map(function (it) { return it.candidate; });
                var applyFn = this._applyFn;
                return new OO.ui.Process(function () {
                    if (applyFn) applyFn(selected);
                    this.close({ action: 'apply' });
                }, this);
            }
            return NormalizationDialog.super.prototype.getActionProcess.call(this, action);
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
                        var searchText = label.toLowerCase();
                        var chapterAuthors = Object.keys(book).filter(function (key) {
                            return /^nazwisko r/.test(key);
                        }).map(function (key) { return book[key].toLowerCase(); });
                        if (chapterAuthors.length) {
                            searchText += ' ' + chapterAuthors.join(' ');
                        }
                        return {
                            widget: new OO.ui.RadioOptionWidget({ data: i, label: label }),
                            label: searchText
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

        OdnDialog.prototype.getReadyProcess = function (data) {
            var dialog = this;
            return OdnDialog.super.prototype.getReadyProcess.call(this, data)
                .next(function () {
                    setTimeout(function () { dialog.filterInput.focus(); }, 200);
                });
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

    /* v8 ignore stop */

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

    function findBibliography(source) {
        if (typeof source !== 'string') return null;
        var openRe = /(={2,3})\s*Bibliografia\s*\1\n/;
        var openMatch = openRe.exec(source);
        if (!openMatch) return null;
        var level = openMatch[1].length;
        var contentStart = openMatch.index + openMatch[0].length;
        // Sekcja kończy się przy nagłówku o takiej samej lub mniejszej głębokości
        // (mniej-lub-tyle samo `=`), albo na końcu źródła.
        var endRe = new RegExp('\\n={2,' + level + '}[^=]');
        var rest = source.slice(contentStart);
        var endMatch = endRe.exec(rest);
        var contentEnd = endMatch ? contentStart + endMatch.index : source.length;
        return {
            level: level,
            headerLine: openMatch[0],
            headerStart: openMatch.index,
            contentStart: contentStart,
            contentEnd: contentEnd,
            content: source.slice(contentStart, contentEnd)
        };
    }

    function detectInsertLevel(source) {
        // Tryb edycji sekcji: tekst zaczyna się od pojedynczego nagłówka
        // poziomu 2 (== Foo ==) i nie zawiera dalej innych nagłówków poziomu 2.
        // Wtedy nowe sekcje wstawiamy zagnieżdżone (===) wewnątrz tej sekcji.
        if (typeof source !== 'string') return 2;
        var leading = source.match(/^==\s*[^=\n][^\n]*?==\s*\n/);
        if (!leading) return 2;
        var afterLeading = source.slice(leading[0].length);
        if (/\n==\s*[^=]/.test(afterLeading)) return 2;
        return 3;
    }

    function ensurePrzypisy(source) {
        if (/^={2,3}\s*Przypisy\s*={2,3}\s*$/m.test(source)) return source;
        var bib = findBibliography(source);
        if (!bib) return source;
        var marker = bib.level === 3 ? '===' : '==';
        var przypisySection = marker + ' Przypisy ' + marker + '\n{{Przypisy}}\n';
        var before = source.slice(0, bib.headerStart).replace(/\s+$/, '');
        return before + '\n\n' + przypisySection + '\n' + source.slice(bib.headerStart);
    }

    function insertBibliographySection(source, bibEntries) {
        var bib = findBibliography(source);

        if (bib) {
            var content = bib.content;
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

            return ensurePrzypisy(
                source.slice(0, bib.contentStart) + newMain + trailing + subPart + source.slice(bib.contentEnd)
            );
        }

        if (!bibEntries) return source;

        var insertLevel = detectInsertLevel(source);
        var marker = insertLevel === 3 ? '===' : '==';
        var section = marker + ' Przypisy ' + marker + '\n{{Przypisy}}\n\n' + marker + ' Bibliografia ' + marker + '\n' + bibEntries + '\n';
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
        var bib = findBibliography(source);
        if (!bib) return empty;

        var content = bib.content;
        // Pod-sekcje (===) wewnątrz biblografii poziomu 2 traktujemy jako
        // zagnieżdżone źródła; przy poziomie 3 nie ma sensownego "zagnieżdżenia"
        // (sąsiednie === to już inna sekcja), więc całość trafia do main.
        var subContent = '';
        var mainContent = content;
        if (bib.level === 2) {
            var subIdx = content.search(/^===/m);
            if (subIdx !== -1) {
                mainContent = content.slice(0, subIdx);
                subContent = content.slice(subIdx);
            }
        }

        var mainEntries = matchCytujTemplates(mainContent).map(parseTemplate);
        var nestedEntries = matchCytujTemplates(subContent).map(parseTemplate);

        return { main: mainEntries, nested: nestedEntries };
    }

    /* v8 ignore start -- GUI content manipulation */
    function buildNewSourceForBooks(source, mainBooks) {
        if (loadSetting('podprzypisy', false)) {
            return insertReferencesSection(migrateOdnToSubRefs(source), mainBooks);
        }
        return insertBibliographySection(source, buildBibEntries(mainBooks));
    }

    function updateBibliography(surface, mainBooks) {
        var surfaceModel = surface.getModel();
        var source = surfaceModel.getDom();
        if (!source) return;

        var newSource = buildNewSourceForBooks(source, mainBooks);

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
        var odn = buildReferenceString(book, page);
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

    /* v8 ignore stop */

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
            var rNames = Object.keys(book).filter(function (key) {
                return /^nazwisko r/.test(key);
            }).sort();
            var names = rNames.length ? rNames : Object.keys(book).filter(function (key) {
                return key.startsWith('nazwisko') && !/^nazwisko r/.test(key);
            }).sort();
            names.forEach(function (key) {
                parts.push(book[key]);
            });
            var year = book.rok || book.data || '';
            if (year) {
                var odnVal = book.odn || '';
                if (odnVal && odnVal !== 'tak' && /^[a-z]$/i.test(odnVal)) {
                    year += odnVal;
                }
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
    /* v8 ignore start -- GUI/API helpers */
    function getPageWikitext(surface) {
        return $.Deferred().resolve(surface.getModel().getDom()).promise();
    }

    /* v8 ignore stop */

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

    function sortKey(book) {
        if (book._positional) {
            return book._positional.join('|').toLowerCase();
        }
        // W bibliografii sortujemy po nazwisku redaktora/autora tomu (`nazwisko`),
        // a nie autora rozdziału (`nazwisko r`), żeby pozycja "Wimmer (red.)"
        // znalazła się przy literze W, nie przy autorze rozdziału.
        var nKeys = Object.keys(book).filter(function (k) {
            return k.indexOf('nazwisko') === 0 && !/^nazwisko r/.test(k);
        }).sort();
        if (!nKeys.length) {
            nKeys = Object.keys(book).filter(function (k) {
                return /^nazwisko r/.test(k);
            }).sort();
        }
        var parts = nKeys.map(function (k) { return book[k]; });
        var year = book.rok || book.data || '';
        if (year) {
            var odn = book.odn || '';
            if (odn && odn !== 'tak' && /^[a-z]$/i.test(odn)) {
                year += odn;
            }
            parts.push(year);
        }
        return parts.join('|').toLowerCase();
    }

    function sortBooks(books) {
        return books.slice().sort(function (a, b) {
            return sortKey(a).localeCompare(sortKey(b), 'pl');
        });
    }

    var STORAGE_PREFIX = 'CitationHelper_';

    function loadSetting(key, defaultValue) {
        try {
            var raw = localStorage.getItem(STORAGE_PREFIX + key);
            if (raw === null) return defaultValue;
            return JSON.parse(raw);
        } catch (e) {
            return defaultValue;
        }
    }

    function saveSetting(key, value) {
        try {
            localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
        } catch (e) {
            // localStorage może być niedostępny (tryb prywatny, brak miejsca)
        }
    }

    // -------------------------------------------------------------------------
    //  Podprzypisy (sub-references) — natywna alternatywa dla {{odn|...}}
    // -------------------------------------------------------------------------
    function sanitizeRefName(s) {
        return String(s)
            .replace(/[^\p{L}\p{N}]+/gu, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    function refName(book) {
        if (book._positional) {
            return sanitizeRefName(book._positional.join('_'));
        }
        var nKeys = Object.keys(book).filter(function (k) {
            return k.indexOf('nazwisko') === 0 && !/^nazwisko r/.test(k);
        }).sort();
        if (!nKeys.length) {
            nKeys = Object.keys(book).filter(function (k) {
                return /^nazwisko r/.test(k);
            }).sort();
        }
        var parts = nKeys.map(function (k) { return book[k]; });
        var year = book.rok || book.data || '';
        if (year) {
            var odn = book.odn || '';
            if (odn && odn !== 'tak' && /^[a-z]$/i.test(odn)) {
                year += odn;
            }
            parts.push(year);
        }
        return sanitizeRefName(parts.join('_'));
    }

    function buildSubRefString(book, page) {
        var name = refName(book);
        if (!page) {
            return '<ref name="' + name + '" />';
        }
        return '<ref name="' + name + '" details="s. ' + page + '" />';
    }

    function buildReferencesBlock(books) {
        var lines = books.map(function (book) {
            var tplName = book._templateName || 'Cytuj książkę';
            // odn/_refName są metadanymi gadżetu, nie chcemy ich w wyjściu
            var clone = {};
            Object.keys(book).forEach(function (k) {
                if (k === 'odn' || k === '_refName') return;
                clone[k] = book[k];
            });
            return '<ref name="' + refName(book) + '">' + stringifyTemplate(tplName, clone) + '</ref>';
        });
        return '<references>\n' + lines.join('\n') + (lines.length ? '\n' : '') + '</references>';
    }

    function parseSubReferences(source) {
        if (typeof source !== 'string') return [];
        var blockRe = /<references\b[^>]*>([\s\S]*?)<\/references>/i;
        var blockMatch = source.match(blockRe);
        if (!blockMatch) return [];
        var content = blockMatch[1];
        var refRe = /<ref\b[^>]*\bname\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/ref>/gi;
        var books = [];
        var m;
        while ((m = refRe.exec(content)) !== null) {
            var name = m[1];
            var inner = m[2];
            matchCytujTemplates(inner).forEach(function (tpl) {
                var book = parseTemplate(tpl);
                book._refName = name;
                books.push(book);
            });
        }
        return books;
    }

    function removeBibliographySection(source) {
        var bib = findBibliography(source);
        if (!bib) return source;
        // Usuń całą sekcję: nagłówek + zawartość + ewentualną pustą linię przed/po.
        var before = source.slice(0, bib.headerStart).replace(/\s+$/, '');
        var after = source.slice(bib.contentEnd).replace(/^\s+/, '\n');
        return before + (after.startsWith('\n') ? '\n' + after : after);
    }

    function insertReferencesSection(source, books) {
        var lines = books.map(function (book) {
            var tplName = book._templateName || 'Cytuj książkę';
            var clone = {};
            Object.keys(book).forEach(function (k) {
                if (k === 'odn' || k === '_refName') return;
                clone[k] = book[k];
            });
            return '<ref name="' + refName(book) + '">' + stringifyTemplate(tplName, clone) + '</ref>';
        });
        var block = '<references>\n' + lines.join('\n') + (lines.length ? '\n' : '') + '</references>';

        // Najpierw zdejmij ewentualną starą sekcję Bibliografia (migracja z odn).
        source = removeBibliographySection(source);

        // 1) Istniejący blok <references>...</references>.
        var blockRe = /<references\b[^/>]*>[\s\S]*?<\/references>/i;
        if (blockRe.test(source)) {
            return source.replace(blockRe, block);
        }
        // 2) Samo-zamykające <references />.
        var selfClosingRe = /<references\b[^/>]*\/>/i;
        if (selfClosingRe.test(source)) {
            return source.replace(selfClosingRe, block);
        }
        // 3) Szablon {{Przypisy}}.
        var przypTplRe = /\{\{[Pp]rzypisy\s*\}\}/;
        if (przypTplRe.test(source)) {
            return source.replace(przypTplRe, block);
        }
        // 4) Sekcja Przypisy bez {{Przypisy}}/referencji — wstaw blok w środku.
        var sectionRe = /(={2,3})\s*Przypisy\s*\1\n/;
        var sectionMatch = sectionRe.exec(source);
        if (sectionMatch) {
            var contentStart = sectionMatch.index + sectionMatch[0].length;
            var endRe = new RegExp('\\n={2,' + sectionMatch[1].length + '}[^=]');
            var rest = source.slice(contentStart);
            var endMatch = endRe.exec(rest);
            var contentEnd = endMatch ? contentStart + endMatch.index : source.length;
            return source.slice(0, contentStart) + block + '\n' + source.slice(contentEnd);
        }
        // 5) Brak sekcji — utwórz nową == Przypisy ==.
        var insertLevel = detectInsertLevel(source);
        var marker = insertLevel === 3 ? '===' : '==';
        var section = marker + ' Przypisy ' + marker + '\n' + block + '\n';
        var pos = findEndOfArticlePos(source);
        if (pos !== -1) {
            var head = source.slice(0, pos).replace(/\s+$/, '');
            var tail = source.slice(pos).replace(/^\s+/, '');
            return head + '\n\n' + section + '\n' + tail;
        }
        return source.replace(/\s+$/, '') + '\n\n' + section;
    }

    function findUnusedRefNames(source) {
        if (typeof source !== 'string') return [];
        var blockRe = /<references\b[^>]*>([\s\S]*?)<\/references>/i;
        var blockMatch = source.match(blockRe);
        if (!blockMatch) return [];
        var bodyOnly = source.slice(0, blockMatch.index) + source.slice(blockMatch.index + blockMatch[0].length);
        var used = {};
        var useRe = /<ref\b[^>]*\bname\s*=\s*"([^"]+)"/gi;
        var m;
        while ((m = useRe.exec(bodyOnly)) !== null) {
            used[m[1]] = true;
        }
        var unused = [];
        var defRe = /<ref\b[^>]*\bname\s*=\s*"([^"]+)"[^>]*>[\s\S]*?<\/ref>/gi;
        while ((m = defRe.exec(blockMatch[1])) !== null) {
            if (!used[m[1]]) unused.push(m[1]);
        }
        return unused;
    }

    function removeUnusedReferences(source) {
        if (typeof source !== 'string') return source;
        var unused = findUnusedRefNames(source);
        if (!unused.length) return source;
        var unusedSet = {};
        unused.forEach(function (n) { unusedSet[n] = true; });

        var blockRe = /<references\b[^>]*>([\s\S]*?)<\/references>/i;
        var blockMatch = source.match(blockRe);
        var refRe = /<ref\b[^>]*\bname\s*=\s*"([^"]+)"[^>]*>[\s\S]*?<\/ref>\s*/gi;
        var newContent = blockMatch[1].replace(refRe, function (full, name) {
            return unusedSet[name] ? '' : full;
        });
        newContent = newContent.replace(/\n{3,}/g, '\n\n');

        var fullOpen = blockMatch[0].slice(0, blockMatch[0].indexOf('>') + 1);
        var newBlock = fullOpen + newContent + '</references>';
        return source.slice(0, blockMatch.index) + newBlock + source.slice(blockMatch.index + blockMatch[0].length);
    }

    // -------------------------------------------------------------------------
    //  Normalizacja: porównaj książkę w artykule z odpowiednikiem ze strony
    //  źródłowej i pozwól użytkownikowi wymienić zawartość szablonu.
    // -------------------------------------------------------------------------
    function findNormalizationCandidates(articleBooks, sourceBooks) {
        if (!articleBooks || !sourceBooks) return [];
        var bySourceKey = {};
        sourceBooks.forEach(function (sb) {
            bySourceKey[refName(sb)] = sb;
        });
        var pairs = [];
        articleBooks.forEach(function (ab) {
            var src = bySourceKey[refName(ab)];
            if (!src) return;
            // Porównaj formy serializowane (bez metadanych odn / _refName);
            // jeśli różne -> kandydat do normalizacji.
            var aText = stringifyTemplate(ab._templateName || 'Cytuj książkę', ab);
            var sText = stringifyTemplate(src._templateName || 'Cytuj książkę', src);
            if (normalizeForCompare(aText) !== normalizeForCompare(sText)) {
                pairs.push({ article: ab, source: src });
            }
        });
        return pairs;
    }

    function normalizeForCompare(tplText) {
        // Pomijamy parametry odn = tak / odn = a / odn = {{odn/id|...}},
        // bo to metadane "odn-mode" — nie chcemy traktować ich obecności
        // (lub braku) jako różnicy wymagającej normalizacji.
        return tplText.replace(/\s*\|odn=[^|}]*/g, '');
    }

    function tokenize(s) {
        return String(s).match(/\w+|[^\w\s]+|\s+/g) || [];
    }

    function diffTokens(oldStr, newStr) {
        var a = tokenize(oldStr);
        var b = tokenize(newStr);
        var m = a.length, n = b.length;
        // Tablica LCS — krótkie szablony (do ~kilkuset tokenów) → O(m*n) jest OK.
        var dp = [];
        for (var i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0));
        for (i = 1; i <= m; i++) {
            for (var j = 1; j <= n; j++) {
                dp[i][j] = a[i - 1] === b[j - 1]
                    ? dp[i - 1][j - 1] + 1
                    : Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
        var result = [];
        i = m; j = n;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
                result.unshift({ token: a[i - 1], op: 'eq' });
                i--; j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                result.unshift({ token: b[j - 1], op: 'ins' });
                j--;
            } else {
                result.unshift({ token: a[i - 1], op: 'del' });
                i--;
            }
        }
        return result;
    }

    function normalizedSourceBook(article, source) {
        var book = {};
        Object.keys(source).forEach(function (k) { book[k] = source[k]; });
        if (article.odn !== undefined && book.odn === undefined) {
            // Artykuł używa trybu odn (odn=tak), źródło nie — zachowaj flagę.
            book.odn = article.odn;
        } else if (article.odn === undefined && book.odn !== undefined) {
            // Artykuł używa sub-ref (brak odn), źródło ma odn=tak — usuń.
            delete book.odn;
        }
        return book;
    }

    function applyNormalizations(source, normalizations) {
        if (typeof source !== 'string' || !normalizations || !normalizations.length) {
            return source;
        }
        var result = source;
        normalizations.forEach(function (n) {
            var oldText = stringifyTemplate(n.article._templateName || 'Cytuj książkę', n.article);
            var sourceBook = normalizedSourceBook(n.article, n.source);
            var newText = stringifyTemplate(sourceBook._templateName || 'Cytuj książkę', sourceBook);
            result = result.split(oldText).join(newText);
        });
        return result;
    }

    function findOdnUsages(source) {
        if (typeof source !== 'string') return {};
        var bib = findBibliography(source);
        var body = bib
            ? source.slice(0, bib.headerStart) + source.slice(bib.contentEnd)
            : source;
        var used = {};
        body.replace(/\{\{odn\b([^}]*)\}\}/g, function (full, paramsStr) {
            var params = splitTemplateParams(paramsStr.replace(/^\|/, ''));
            var positional = params
                .filter(function (p) { return p.indexOf('=') === -1; })
                .map(function (p) { return p.trim(); });
            var name = sanitizeRefName(positional.join('_'));
            if (name) used[name] = true;
            return full;
        });
        return used;
    }

    function findUnusedBibliographyBooks(source) {
        if (typeof source !== 'string') return [];
        var bib = parseExistingBibliography(source);
        if (!bib.main.length) return [];
        var used = findOdnUsages(source);
        return bib.main.filter(function (book) { return !used[refName(book)]; });
    }

    function removeUnusedBibliographyEntries(source) {
        if (typeof source !== 'string') return source;
        var bib = findBibliography(source);
        if (!bib) return source;
        var used = findOdnUsages(source);

        var keptLines = bib.content.split('\n').filter(function (line) {
            var trimmed = line.replace(/^\s+/, '');
            if (!trimmed.startsWith('*')) return true;
            var tplText = trimmed.replace(/^\*\s*/, '');
            var matches = matchCytujTemplates(tplText);
            if (!matches.length) return true;
            var book = parseTemplate(matches[0]);
            return !!used[refName(book)];
        });
        var newContent = keptLines.join('\n').replace(/\n{3,}/g, '\n\n');
        if (newContent === bib.content) return source;
        return source.slice(0, bib.contentStart) + newContent + source.slice(bib.contentEnd);
    }

    function migrateOdnToSubRefs(source) {
        if (typeof source !== 'string') return source;
        return source.replace(/\{\{odn\b([^}]*)\}\}/g, function (full, paramsStr) {
            var params = splitTemplateParams(paramsStr.replace(/^\|/, ''));
            var positional = [];
            var named = {};
            params.forEach(function (p) {
                var eq = p.indexOf('=');
                if (eq === -1) {
                    positional.push(p.trim());
                } else {
                    named[p.slice(0, eq).trim()] = p.slice(eq + 1).trim();
                }
            });
            var name = sanitizeRefName(positional.join('_'));
            if (!name) return full; // nic do migracji
            var page = named.s || '';
            return page
                ? '<ref name="' + name + '" details="s. ' + page + '" />'
                : '<ref name="' + name + '" />';
        });
    }

    function findDifferingFields(books) {
        var allKeys = {};
        books.forEach(function (book) {
            Object.keys(book).forEach(function (key) {
                if (key !== '_templateName' && key !== '_positional') {
                    allKeys[key] = true;
                }
            });
        });
        var differing = [];
        Object.keys(allKeys).forEach(function (key) {
            var first = books[0][key] || '';
            for (var i = 1; i < books.length; i++) {
                if ((books[i][key] || '') !== first) {
                    differing.push(key);
                    break;
                }
            }
        });
        return differing;
    }

    function variantLabel(book, differingFields) {
        if (book['rozdział']) {
            var label = stripLinks(book['rozdział']);
            if (label.length > 60) label = label.slice(0, 57) + '...';
            var chapterAuthor = book['nazwisko r'];
            if (chapterAuthor) {
                label += ' (' + chapterAuthor + ')';
            }
            return label;
        }
        var parts = [];
        differingFields.forEach(function (field) {
            if (book[field] && !field.startsWith('_')) {
                parts.push(stripLinks(String(book[field])));
            }
        });
        return parts.join(', ') || 'Wariant';
    }

    function findMatchingVariant(existing, variants, differingFields) {
        for (var i = 0; i < variants.length; i++) {
            var match = true;
            for (var j = 0; j < differingFields.length; j++) {
                var field = differingFields[j];
                if ((existing[field] || '').trim().toLowerCase() !== (variants[i][field] || '').trim().toLowerCase()) {
                    match = false;
                    break;
                }
            }
            if (match) return i;
        }
        return -1;
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
                return entry[0].charAt(0) !== '_';
            })
            .map(function (entry) {
                return entry[0] + '=' + entry[1];
            });
        var allParams = positional.concat(named);
        if (!allParams.length) {
            return '{{' + name + '}}';
        }
        return '{{' + name + ' |' + allParams.join(' |') + '}}';
    }

    /* v8 ignore start -- API/network */
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
                log('[citation] Cytuj w brudnopisie (' + page + '): ' + books.length);
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
    /* v8 ignore stop */

    // =========================================================================
    //  Odn validation & duplicate detection
    // =========================================================================
    function ensureOdn(book) {
        var odn = book.odn || '';
        if (!odn) {
            book.odn = 'tak';
        }
        return book;
    }

    function fixMissingOdn(books) {
        var count = 0;
        var result = books.map(function (book) {
            var odn = book.odn || '';
            if (!odn) {
                ensureOdn(book);
                count++;
            }
            return book;
        });
        return { books: result, count: count };
    }

    function findDuplicateBooks(books) {
        var groups = {};
        books.forEach(function (book) {
            var key = bookKey(book);
            if (!groups[key]) groups[key] = [];
            groups[key].push(book);
        });

        var duplicates = [];
        Object.keys(groups).forEach(function (key) {
            var group = groups[key];
            if (group.length < 2) return;

            var undistinguished = group.filter(function (book) {
                if (book.rozdział) return false;
                var odn = book.odn || '';
                if (/^[a-z]$/i.test(odn)) return false;
                if (/\{\{odn\/id\|/.test(odn)) return false;
                return true;
            });

            if (undistinguished.length >= 2) {
                duplicates.push({
                    key: key,
                    label: bookLabel(undistinguished[0]),
                    count: undistinguished.length
                });
            }
        });

        return duplicates;
    }

    function buildOdnNotification(articleCount, sourceCount) {
        if (!articleCount && !sourceCount) return null;

        var rules = new Intl.PluralRules('pl-PL');
        function pluralBrakujace(n) {
            var cat = rules.select(n);
            return cat === 'many' ? 'brakujących' : 'brakujące';
        }

        var parts = [];
        if (articleCount) {
            parts.push('(' + articleCount + ') ' + pluralBrakujace(articleCount) + ' odn = tak w artykule');
        }
        if (sourceCount) {
            parts.push('(' + sourceCount + ') ' + pluralBrakujace(sourceCount) + ' odn = tak ze strony źródłowej');
        }

        return 'Dodano ' + parts.join(' oraz ') + '.';
    }

    // =========================================================================
    //  Public API (revealing module pattern)
    // =========================================================================
    window.citationHelper = citationHelper;
    citationHelper.api = {
        matchCytujTemplates: matchCytujTemplates,
        parseTemplate: parseTemplate,
        splitTemplateParams: splitTemplateParams,
        parseExistingBibliography: parseExistingBibliography,
        buildOdnString: buildOdnString,
        buildBibEntries: buildBibEntries,
        stringifyTemplate: stringifyTemplate,
        insertBibliographySection: insertBibliographySection,
        ensurePrzypisy: ensurePrzypisy,
        findBibliography: findBibliography,
        detectInsertLevel: detectInsertLevel,
        findEndOfArticlePos: findEndOfArticlePos,
        bookKey: bookKey,
        bookLabel: bookLabel,
        stripLinks: stripLinks,
        findDifferingFields: findDifferingFields,
        variantLabel: variantLabel,
        findMatchingVariant: findMatchingVariant,
        ensureOdn: ensureOdn,
        fixMissingOdn: fixMissingOdn,
        findDuplicateBooks: findDuplicateBooks,
        buildOdnNotification: buildOdnNotification,
        sortKey: sortKey,
        sortBooks: sortBooks,
        loadSetting: loadSetting,
        saveSetting: saveSetting,
        refName: refName,
        buildSubRefString: buildSubRefString,
        buildReferencesBlock: buildReferencesBlock,
        parseSubReferences: parseSubReferences,
        insertReferencesSection: insertReferencesSection,
        migrateOdnToSubRefs: migrateOdnToSubRefs,
        removeUnusedReferences: removeUnusedReferences,
        findUnusedRefNames: findUnusedRefNames,
        findOdnUsages: findOdnUsages,
        findUnusedBibliographyBooks: findUnusedBibliographyBooks,
        removeUnusedBibliographyEntries: removeUnusedBibliographyEntries,
        findNormalizationCandidates: findNormalizationCandidates,
        tokenize: tokenize,
        diffTokens: diffTokens,
        applyNormalizations: applyNormalizations
    };
})();
