import component from './de-DE/component';
import component_AISuggestion from './de-DE/component_AISuggestion';
import component_allTeams from './de-DE/component_allTeams';
import component_allVersions from './de-DE/component_allVersions';
import component_connectableProcesses from './de-DE/component_connectableProcesses';
import component_contributeData from './de-DE/component_contributeData';
import importData from './de-DE/component_importData';
import component_refsOfNewVersionDrawer from './de-DE/component_refsOfNewVersionDrawer';
import component_rejectReview from './de-DE/component_rejectReview';
import component_systemMaintenance from './de-DE/component_systemMaintenance';
import component_tidasPackage from './de-DE/component_tidasPackage';
import globalHeader from './de-DE/globalHeader';
import menu from './de-DE/menu';
import pages from './de-DE/pages';
import pages_contact from './de-DE/pages_contact';
import pages_flow from './de-DE/pages_flow';
import pages_flowproperty from './de-DE/pages_flowproperty';
import pages_general from './de-DE/pages_general';
import pages_home from './de-DE/pages_home';
import pages_manageSystem from './de-DE/pages_manageSystem';
import pages_model from './de-DE/pages_model';
import pages_process from './de-DE/pages_process';
import pages_product from './de-DE/pages_product';
import pages_review from './de-DE/pages_review';
import pages_source from './de-DE/pages_source';
import teams from './de-DE/pages_teams';
import pages_unitgroup from './de-DE/pages_unitgroup';
import pwa from './de-DE/pwa';
import settingDrawer from './de-DE/settingDrawer';
import settings from './de-DE/settings';
import validator from './de-DE/validator';

export default {
  'navBar.lang': 'Sprachen',
  'layout.user.link.help': 'Hilfe',
  'layout.user.link.privacy': 'Datenschutz',
  'layout.user.link.terms': 'Nutzungsbedingungen',
  'app.preview.down.block': 'Diese Seite in Ihr lokales Projekt herunterladen',
  'app.welcome.link.fetch-blocks': 'Alle Blöcke abrufen',
  'app.welcome.link.block-list': 'Standardseiten schnell auf Basis von `block`-Bausteinen erstellen',
  ...pages,
  ...globalHeader,
  ...menu,
  ...settingDrawer,
  ...settings,
  ...pwa,
  ...component,
  ...pages_home,
  ...pages_general,
  ...pages_model,
  ...pages_process,
  ...pages_contact,
  ...pages_unitgroup,
  ...pages_flowproperty,
  ...pages_flow,
  ...pages_source,
  ...pages_product,
  ...validator,
  ...teams,
  ...component_allTeams,
  ...component_contributeData,
  ...component_allVersions,
  ...pages_manageSystem,
  ...pages_review,
  ...importData,
  ...component_tidasPackage,
  ...component_systemMaintenance,
  ...component_rejectReview,
  ...component_connectableProcesses,
  ...component_AISuggestion,
  ...component_refsOfNewVersionDrawer,
};
