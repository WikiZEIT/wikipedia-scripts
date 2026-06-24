#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "=== Starting MediaWiki setup ==="

docker compose up -d
echo "Waiting for database to be ready..."
until docker compose exec -T db mariadb -umediawiki -pmediawiki -e "SELECT 1" &>/dev/null; do
    sleep 2
done
echo "Database ready."

echo "Running MediaWiki installer..."
docker compose exec -T mediawiki php maintenance/run.php install \
  --dbserver db \
  --dbname mediawiki \
  --dbuser mediawiki \
  --dbpass mediawiki \
  --server "http://localhost:8180" \
  --scriptpath "" \
  --lang pl \
  --pass admin1234admin \
  --with-extensions \
  "TestWiki" "Admin"

echo "Appending extra config to LocalSettings.php..."
docker compose exec -T mediawiki bash -c 'cat >> /var/www/html/LocalSettings.php' << 'SETTINGS'

# Extensions
wfLoadExtension( 'WikiEditor' );
wfLoadExtension( 'Gadgets' );
wfLoadExtension( 'VisualEditor' );

# VisualEditor config
$wgDefaultUserOptions['visualeditor-enable'] = 1;
$wgVisualEditorAvailableNamespaces = [
    NS_MAIN => true,
    NS_USER => true,
];
$wgVirtualRestConfig['modules']['parsoid'] = [
    'url' => 'http://localhost:8180/rest.php',
];

# Enable user scripts
$wgAllowUserJs = true;
$wgAllowUserCss = true;

# Allow all users to edit other users' JS/CSS and MediaWiki namespace scripts
$wgGroupPermissions['user']['edituserjs'] = true;
$wgGroupPermissions['user']['editusercss'] = true;
$wgGroupPermissions['user']['editinterface'] = true;
$wgGroupPermissions['user']['editsitejs'] = true;
$wgGroupPermissions['user']['editsitecss'] = true;

# WikiEditor preferences
$wgDefaultUserOptions['usebetatoolbar'] = 1;

# Gadgets
$wgGadgetsRepoClass = 'MediaWikiGadgetsDefinitionRepo';

# Autoconfirmed group (manually assignable via Special:UserRights)
$wgGroupPermissions['autoconfirmed']['skipcaptcha'] = true;
$wgGroupPermissions['autoconfirmed']['editsemiprotected'] = true;
$wgGroupPermissions['autoconfirmed']['autoconfirmed'] = true;

# Cite sub-referencing (Podprzypisy: <ref name="x" details="..." />)
$wgCiteSubReferencing = true;
SETTINGS

echo "Restarting mediawiki..."
docker compose restart mediawiki
sleep 5

echo "Creating gadget definition..."
docker compose exec -T mediawiki php maintenance/run.php edit \
  --user Admin \
  --summary "Setup gadgets" \
  "MediaWiki:Gadgets-definition" << 'WIKI'
* lib-toolbar[ResourceLoader|type=general]|lib-toolbar.js
WIKI

echo "Creating lib-toolbar gadget..."
docker compose exec -T mediawiki php maintenance/run.php edit \
  --user Admin \
  --summary "lib-toolbar gadget" \
  "MediaWiki:Gadget-lib-toolbar.js" < "$DIR/../mediawiki-gadgets/lib-toolbar.js"

echo "Creating citation helper script..."
docker compose exec -T mediawiki php maintenance/run.php edit \
  --user Admin \
  --summary "Citation helper" \
  "User:Admin/citationHelper.js" < "$DIR/../citation.js"

echo "Creating user common.js..."
docker compose exec -T mediawiki php maintenance/run.php edit \
  --user Admin \
  --summary "User common.js" \
  "User:Admin/common.js" << 'WIKI'
var citationHelper = {
   page: 'User:Admin/sources'
};
importScript('User:Admin/citationHelper.js');
WIKI

echo "Creating test source page with books..."
docker compose exec -T mediawiki php maintenance/run.php edit \
  --user Admin \
  --summary "Source books" \
  "User:Admin/sources" << 'WIKI'
== Bibliografia ==
* {{Cytuj książkę | nazwisko = Kowalski | imię = Jan | tytuł = Historia Polski | rok = 2020 | wydawca = PWN | miejsce = Warszawa | isbn = 9781234567890 | odn = tak}}
* {{Cytuj książkę | nazwisko = Nowak | imię = Adam | tytuł = Matematyka współczesna | rok = 2019 | wydawca = Helion | miejsce = Gliwice | odn = tak}}
* {{Cytuj książkę | nazwisko = Wimmer (red.) | imię = Jan | tytuł = Wojna polsko-szwedzka 1655-1660 | wydawca = MON | miejsce = Warszawa | data = 1973 | rozdział = Operacja krakowska | nazwisko r = Nowak | imię r = Tadeusz | odn = tak}}
* {{Cytuj książkę | nazwisko = Wimmer (red.) | imię = Jan | tytuł = Wojna polsko-szwedzka 1655-1660 | wydawca = MON | miejsce = Warszawa | data = 1973 | rozdział = Kampania 1659 w Prusach | nazwisko r = Podhorodecki | imię r = Leszek | odn = tak}}
* {{Cytuj książkę | nazwisko = Wimmer (red.) | imię = Jan | tytuł = Wojna polsko-szwedzka 1655-1660 | wydawca = MON | miejsce = Warszawa | data = 1973 | rozdział = Bitwa pod Warszawą | nazwisko r = Herbst | imię r = Stanisław | odn = tak}}
* {{Cytuj pismo | nazwisko = Droszcz | imię = Jacek | tytuł = Mobilizacja jednostki | czasopismo = Obronność | data = 2018 | odn = tak}}
WIKI

echo "Creating test article..."
docker compose exec -T mediawiki php maintenance/run.php edit \
  --user Admin \
  --summary "Test article" \
  "Testowy artykuł" << 'WIKI'
'''Testowy artykuł''' – artykuł do testowania narzędzia Citation Helper.

== Historia ==
Opis historii.

== Przypisy ==
{{Przypisy}}

== Bibliografia ==
* {{Cytuj książkę | nazwisko = Kowalski | imię = Jan | tytuł = Historia Polski | rok = 2020 | wydawca = PWN | miejsce = Warszawa | isbn = 9781234567890 | odn = tak}}

{{SORTUJ:Testowy artykuł}}
[[Kategoria:Testy]]
WIKI

echo "Enabling lib-toolbar gadget for Admin user..."
docker compose exec -T mediawiki php maintenance/run.php eval << 'PHP'
$user = User::newFromName("Admin");
$manager = MediaWiki\MediaWikiServices::getInstance()->getUserOptionsManager();
$manager->setOption($user, "gadget-lib-toolbar", "1");
$manager->saveOptions($user);
echo "Gadget enabled\n";
PHP

echo "Creating Agent user (for browser-automation testing)..."
docker compose exec -T mediawiki php maintenance/run.php createAndPromote \
  --force \
  Agent "Agent-Shell-Claude-Code-ACP" || true

echo "Creating Jcubic user (owner of the CitationHelper.js page)..."
docker compose exec -T mediawiki php maintenance/run.php createAndPromote \
  --force \
  Jcubic "jcubic1234jcubic" || true

echo "Mirroring citation helper to the path deploy.sh updates..."
docker compose exec -T mediawiki php maintenance/run.php edit \
  --user Admin \
  --summary "Citation helper (deploy target)" \
  "Użytkownik:Jcubic/CitationHelper.js" < "$DIR/../citation.js"

docker compose exec -T mediawiki php maintenance/run.php edit \
  --user Admin \
  --summary "Agent common.js" \
  "Użytkownik:Agent/common.js" << 'WIKI'
var citationHelper = {
   page: 'User:Admin/sources'
};
importScript('Użytkownik:Jcubic/CitationHelper.js');
WIKI

echo "Enabling lib-toolbar gadget for Agent user..."
docker compose exec -T mediawiki php maintenance/run.php eval << 'PHP'
$user = User::newFromName("Agent");
$manager = MediaWiki\MediaWikiServices::getInstance()->getUserOptionsManager();
$manager->setOption($user, "gadget-lib-toolbar", "1");
$manager->saveOptions($user);
echo "Gadget enabled for Agent\n";
PHP

echo ""
echo "=== Setup complete ==="
echo "URL: http://localhost:8180"
echo "Login: Admin / admin1234"
echo "Test article: http://localhost:8180/wiki/Testowy_artykuł"
echo "Edit test: http://localhost:8180/w/index.php?title=Testowy_artykuł&action=edit"
