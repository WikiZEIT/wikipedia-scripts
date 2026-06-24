/*
 * Script wypełnia domyślny opis, gdy edytuje się we własnej przestrzeni
 * Najlepiej używać z ustawnieniem, który ostrzega o braku opisu
 * konfiguracja:
 *
 * var auto_fill = { new_page: 'Nowa strona', edit_page: 'Edycja strony'};
 * importScript('Wikipedysta:Jcubic/autoFill.js');
 *
 * @author: Jcubic
 */

(() => {
    const userName = mw.config.get('wgUserName');
    if (!mw.config.get('wgPageName').match(':' + userName)) {
        return;
    }

    const auto_fill = window.auto_fill || {};

    const new_page = auto_fill.new_page ?? 'Nowa strona';
    const edit_page = auto_fill.edit_page ?? 'Edycja strony';

    const urlParams = new URLSearchParams( window.location.search );
    const summary = urlParams.get('redlink') ? new_page : edit_page;

    function appendSummary(current, summary) {
        if (!current) return summary;
        if (/^\/\*.*?\*\/\s*$/.test(current)) {
            return current.trimEnd() + ' ' + summary;
        }
        return null;
    }

    // Old editor / JS/CSS editing
    $(function () {
        if ($('.mw-editform-ooui').length) {
            const widget = OO.ui.infuse($('#wpSummaryWidget'));
            const result = appendSummary(widget.getValue(), summary);
            if (result !== null) widget.setValue(result);
        } else {
            const $s = $('#wpSummary');
            if ($s.length) {
                const result = appendSummary($s.val(), summary);
                if (result !== null) $s.val(result);
            }
        }
    });

    // VE / 2017 wikitext editor
    mw.hook('ve.saveDialog.stateChanged').add(function fn() {
        mw.hook('ve.saveDialog.stateChanged').remove(fn);
        var dialog = ve.init.target.saveDialog;
        var current = dialog.editSummaryInput.getValue();
        var result = appendSummary(current, summary);
        if (result !== null) dialog.setEditSummary(result);
    });
})();
