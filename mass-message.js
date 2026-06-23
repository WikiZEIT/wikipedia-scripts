/**
 * Masowe wiadomości na stronie dyskusji / liście uczestników
 * Zaznacz użytkowników i kliknij w link: Wyślij do wszystkich
 *
 * Konfiguracja (opcjonalna):
 * window.massMessageConfig = {
 *     prefixes: ['Dyskusja_'],                          // strony zaczynające się od prefiksu
 *     pages: ['Wzlot_2026/Uczestnicy_i_uczestniczki']   // dokładne nazwy stron
 * };
 *
 * W oknie można wybrać wiki, na którą zostaną wysłane wiadomości (np. pl.wikipedia.org).
 * Płeć użytkownika jest rozpoznawana z przestrzeni nazw linku
 * (Wikipedysta: => mężczyzna, Wikipedystka: => kobieta).
 *
 * @author jcubic
 */
(() => {
    // =====================================================================
    //  Czyste funkcje (testowalne)
    // =====================================================================
    function userNamespace(gender) {
        return gender === 'female' ? 'Wikipedystka' : 'Wikipedysta';
    }

    function userReference(user) {
        return userNamespace(user.gender) + ':' + user.name;
    }

    function parseUserLink(title) {
        if (!title) return null;
        const m = /(Wikipedystk?a):(.+)$/.exec(title);
        if (!m) return null;
        const name = m[2].trim();
        if (!name) return null;
        return { name: name, gender: m[1] === 'Wikipedystka' ? 'female' : 'male' };
    }

    function parseUsers(container) {
        const links = container.querySelectorAll('a[title]');
        const seen = {};
        const users = [];
        for (let i = 0; i < links.length; i++) {
            const user = parseUserLink(links[i].getAttribute('title'));
            if (!user || seen[user.name]) continue;
            seen[user.name] = true;
            users.push(user);
        }
        return users;
    }

    function stripUserNamespace(value) {
        const m = /(?:Wikipedystk?a):(.+)$/.exec(value);
        return m ? m[1].trim() : value;
    }

    function pageMatches(page, config) {
        const prefixes = config.prefixes || [];
        const pages = config.pages || [];
        if (pages.indexOf(page) !== -1) return true;
        return prefixes.some(prefix => page.indexOf(prefix) === 0);
    }

    window.massMessage = {
        api: {
            userNamespace,
            userReference,
            parseUserLink,
            parseUsers,
            stripUserNamespace,
            pageMatches
        }
    };

    // Dalej tylko w środowisku wiki (dostępne jQuery + mw).
    if (typeof $ === 'undefined' || typeof mw === 'undefined') {
        return;
    }

    const config = window.massMessageConfig || {};
    const matchConfig = {
        prefixes: config.prefixes || ['Dyskusja_'],
        pages: config.pages || []
    };
    const wikiOptions = config.wikis || [
        { data: 'pl.wikipedia.org', label: 'Wikipedia (pl.wikipedia.org)' },
        { data: 'pl.wikimedia.org', label: 'Wikimedia Polska (pl.wikimedia.org)' },
        { data: 'meta.wikimedia.org', label: 'Meta (meta.wikimedia.org)' }
    ];
    const defaultWiki = config.defaultWiki || 'pl.wikipedia.org';

    $(() => {
        const page = mw.config.get('wgPageName');
        if (pageMatches(page, matchConfig)) {
            const list = $('#p-tb .vector-menu-content-list');
            const li = $('<li class="mw-list-item mw-list-item-js"><a href="#">Wyślij do wszystkich</a></li>');
            li.on('click', 'a', open).appendTo(list);
        }
    });

    function open() {
        var targetUsers = get_selected_users();

        mw.loader.using(['oojs-ui-windows', 'oojs-ui-widgets', 'mediawiki.widgets.UsersMultiselectWidget']).then(function() {

            function MassMessageDialog(config) {
                MassMessageDialog.super.call(this, config);
            }
            OO.inheritClass(MassMessageDialog, OO.ui.ProcessDialog);

            MassMessageDialog.static.name = 'massMessageDialog';
            MassMessageDialog.static.title = 'Wyślij wiadomość';
            MassMessageDialog.static.size = 'large';
            MassMessageDialog.static.actions = [
                { action: 'send', label: 'Wyślij', flags: ['primary', 'progressive'] },
                { label: 'Anuluj', flags: 'safe' }
            ];

            MassMessageDialog.prototype.initialize = function() {
                MassMessageDialog.super.prototype.initialize.call(this);

                this.wikiWidget = new OO.ui.DropdownInputWidget({
                    options: wikiOptions
                });
                this.wikiWidget.setValue(defaultWiki);

                this.recipientsWidget = new mw.widgets.UsersMultiselectWidget({
                    placeholder: 'Dodaj użytkownika...',
                    allowDuplicates: false,
                    allowArbitrary: true
                });
                this.recipientsWidget.$group.css('width', '100%');
                this.recipientsWidget.input.$input.css('min-width', '150px');

                this.subjectWidget = new OO.ui.TextInputWidget({
                    placeholder: 'Temat wiadomości...'
                });

                this.messageWidget = new OO.ui.MultilineTextInputWidget({
                    placeholder: 'Treść wiadomości...',
                    rows: 10,
                    autosize: true,
                    maxRows: 20
                });

                var fieldset = new OO.ui.FieldsetLayout({
                    items: [
                        new OO.ui.FieldLayout(this.wikiWidget, {
                            label: 'Wiki',
                            align: 'top'
                        }),
                        new OO.ui.FieldLayout(this.recipientsWidget, {
                            label: 'Odbiorcy',
                            align: 'top'
                        }),
                        new OO.ui.FieldLayout(this.subjectWidget, {
                            label: 'Temat',
                            align: 'top'
                        }),
                        new OO.ui.FieldLayout(this.messageWidget, {
                            label: 'Wiadomość',
                            align: 'top'
                        })
                    ]
                });

                this.content = new OO.ui.PanelLayout({
                    padded: true,
                    expanded: false
                });
                this.content.$element.append(fieldset.$element);
                this.$body.append(this.content.$element);
            };

            MassMessageDialog.prototype.getSetupProcess = function(data) {
                return MassMessageDialog.super.prototype.getSetupProcess.call(this, data)
                    .next(function() {
                        this.setupData = data;
                        this.subjectWidget.setValue(data.sectiontitle);
                        this.messageWidget.setValue(data.text);
                    }, this);
            };

            MassMessageDialog.prototype.getReadyProcess = function(data) {
                return MassMessageDialog.super.prototype.getReadyProcess.call(this, data)
                    .next(function() {
                        this.recipientsWidget.clearItems();
                        this.setupData.users.forEach(function(user) {
                            this.recipientsWidget.addTag(user.name, userReference(user));
                        }, this);
                    }, this);
            };

            MassMessageDialog.prototype.getActionProcess = function(action) {
                if (action === 'send') {
                    return new OO.ui.Process(function() {
                        var domain = this.wikiWidget.getValue();
                        var recipients = this.recipientsWidget.getValue().map(stripUserNamespace);
                        var sectiontitle = this.subjectWidget.getValue();
                        var text = this.messageWidget.getValue();

                        if (!sectiontitle) {
                            return $.Deferred().reject(new OO.ui.Error('Podaj temat wiadomości.')).promise();
                        }
                        if (!text) {
                            return $.Deferred().reject(new OO.ui.Error('Podaj treść wiadomości.')).promise();
                        }
                        if (recipients.length === 0) {
                            return $.Deferred().reject(new OO.ui.Error('Brak odbiorców.')).promise();
                        }

                        send({ targetUsers: recipients, domain: domain, sectiontitle: sectiontitle, text: text });

                        this.close({ result: 'success' });
                    }, this);
                }
                return MassMessageDialog.super.prototype.getActionProcess.call(this, action);
            };

            var dialog = new MassMessageDialog();
            var windowManager = new OO.ui.WindowManager();
            $('body').append(windowManager.$element);
            windowManager.addWindows([dialog]);
            windowManager.openWindow(dialog, {
                users: targetUsers,
                sectiontitle: 'Odpowiedź na pytanie',
                text: 'Witaj, w Wikipedii. Jak masz jakieś pytanie pytaj śmiało. \~\~\~\~\n\n'
            }).closed.then(function() {
                windowManager.destroy();
            });
        });
    }

    async function edit_wiki({user='', domain="meta.wikimedia.org", sectiontitle, text}={}) {
        const api = new mw.ForeignApi(`https://${domain}/w/api.php`);
        const username = mw.config.get('wgUserName');

        await api.postWithToken("csrf", api.assertCurrentUser({
            action: "edit",
            title: "User talk:" + user,
            section: "new",
            sectiontitle,
            text: text.trim(),
            summary: "Mass message by " + username,
            format: "json"
        }));
    }

    async function send({targetUsers = [], domain = 'pl.wikipedia.org', sectiontitle, text}={}) {
        if (!sectiontitle || !text) {
            alert('Pusta wiadomość');
            return;
        }
        await mw.loader.using('mediawiki.ForeignApi');
        for (let user of targetUsers) {
            await edit_wiki({domain, user, sectiontitle, text});
        }
        console.log('Wysłano wiadomości');
    }

    function get_selected_users() {
        const sel = window.getSelection();
        if (sel.isCollapsed) return [];

        const range = sel.getRangeAt(0);
        const container = document.createElement('div');
        container.appendChild(range.cloneContents());

        return parseUsers(container);
    }

})();
